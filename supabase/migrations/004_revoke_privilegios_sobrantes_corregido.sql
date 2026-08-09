-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 004: retirar TRUNCATE/REFERENCES/TRIGGER/MAINTAIN
-- sobrantes en anon/authenticated (las 8 tablas existentes + la regla
-- por defecto para tablas futuras)
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- Causa raíz confirmada (consulta 3 de la investigación, contra
-- pg_default_acl): dos reglas ALTER DEFAULT PRIVILEGES compitiendo en el
-- schema public.
--   - supabase_admin: da todos los privilegios por defecto a las tablas
--     nuevas (comportamiento estándar de Supabase).
--   - postgres: al desactivar "Automatically expose new tables", quitó
--     SELECT/INSERT/UPDATE/DELETE a anon/authenticated, pero no tocó
--     TRUNCATE/REFERENCES/TRIGGER/MAINTAIN — esos cuatro quedaron
--     otorgados igual, en las 8 tablas del schema (confirmado con
--     information_schema.role_table_grants sin filtrar por tabla).
--
-- Riesgo evaluado como bajo por ahora (PostgREST no expone estas
-- operaciones vía REST ni RPC — no hay camino de explotación desde
-- supabase-js hoy) pero se corrige de todas formas, por disciplina: es
-- privilegio otorgado que nunca se pidió, exactamente el tipo de cosa
-- que este proyecto ha evitado en cada paso anterior.
-- ══════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════
-- 1. Retirar de las 8 tablas existentes — efecto inmediato
-- ══════════════════════════════════════════════════════════════════

REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON
  organizaciones, consultores, consultor_organizacion,
  invitaciones_individuales, respuestas_cuestionario,
  respuestas_cuestionario_pares, respuestas_sdmo, log_acceso_confidencial
FROM anon, authenticated;


-- ══════════════════════════════════════════════════════════════════
-- 2. Corregir la regla por defecto — para que tablas futuras no hereden
--    esto otra vez.
--
-- Nota sobre la sintaxis: ALTER DEFAULT PRIVILEGES sin `FOR ROLE`
-- modifica la entrada del rol que EJECUTA el comando (el rol "actual"),
-- no una entrada nueva independiente — así lo confirma la documentación
-- de Postgres (sql-alterdefaultprivileges.html, sección `target_role`).
-- Eso significa que el resultado depende de con qué rol esté conectado
-- Luis en el SQL Editor al momento de correr esto. Para no depender de
-- eso, el comando de abajo especifica `FOR ROLE postgres` de forma
-- explícita — apunta directo a la entrada que la consulta 3 de la
-- investigación ya identificó como la que hay que corregir (la de
-- `postgres`, la misma que dejó pasar TRUNCATE/REFERENCES/TRIGGER/
-- MAINTAIN al restringir SELECT/INSERT/UPDATE/DELETE). Así el resultado
-- es el mismo sin importar con qué rol esté conectada la sesión que
-- aplica esta migración.
--
-- Esto NO afecta tablas ya creadas (por diseño de Postgres — las reglas
-- ALTER DEFAULT PRIVILEGES solo aplican a objetos creados después de
-- ejecutarse) — por eso el paso 1 es necesario aparte, no alcanza con
-- esto solo.
-- ══════════════════════════════════════════════════════════════════

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES FROM anon, authenticated;


-- ══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════

-- Debe devolver exactamente 2 filas: organizaciones/SELECT y
-- consultor_organizacion/SELECT, ambas grantee='authenticated'. Nada de
-- TRUNCATE/REFERENCES/TRIGGER/MAINTAIN debe aparecer en ninguna tabla.
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'authenticated' AND table_schema = 'public'
ORDER BY table_name, privilege_type;

-- Debe devolver 0 filas — anon no tiene privilegios de tabla directos en
-- ninguna tabla; todo su acceso sigue pasando por las funciones
-- SECURITY DEFINER (enviar_respuesta_cuestionario, enviar_respuesta_sdmo).
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'anon' AND table_schema = 'public'
ORDER BY table_name, privilege_type;

-- CORREGIDO: esta consulta no filtra por tipo de objeto, así que va a
-- devolver 6 filas (3 tipos de objeto × 2 roles que configuraron reglas:
-- supabase_admin y postgres), no 1 — no es un error si ves 6. Lo que
-- importa es revisar, dentro de esas 6, la fila con
-- rol_que_configuro_el_default='postgres' Y tipo_objeto='r' (tablas):
-- su acl_por_defecto ya NO debe tener TRUNCATE/REFERENCES/TRIGGER/
-- MAINTAIN (D/x/t/m) junto a anon= ni authenticated= — compárala contra
-- el resultado original de la consulta 3 (antes de esta migración) para
-- confirmar el cambio, no solo que la fila siga existiendo.
SELECT pg_get_userbyid(defaclrole) AS rol_que_configuro_el_default,
       nspname AS schema,
       defaclobjtype AS tipo_objeto,
       defaclacl AS acl_por_defecto
FROM pg_default_acl
JOIN pg_namespace ON pg_namespace.oid = pg_default_acl.defaclnamespace
WHERE nspname = 'public';

-- Prueba manual: crear una tabla de prueba después de aplicar esta
-- migración (CREATE TABLE _test_privilegios (id int); luego DROP TABLE
-- _test_privilegios;) y confirmar con la primera consulta de
-- verificación (adaptada a table_name = '_test_privilegios') que la
-- tabla nueva NO trae TRUNCATE/REFERENCES/TRIGGER/MAINTAIN para
-- anon/authenticated — confirma que la regla por defecto quedó
-- corregida para el futuro, no solo las 8 tablas actuales.
