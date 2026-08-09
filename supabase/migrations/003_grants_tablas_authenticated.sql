-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 003: GRANTs de tabla faltantes para `authenticated`
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- Causa raíz: el proyecto Supabase se creó con "Automatically expose new
-- tables" desactivado (decisión de seguridad deliberada). Sin eso, crear
-- una tabla + habilitar RLS + crear una policy no es suficiente — hace
-- falta un GRANT explícito que le dé al rol el permiso de intentar la
-- operación, antes de que la policy decida qué filas puede ver. La
-- migración 001 nunca lo agregó porque no hacía falta con el default
-- (auto-expose) encendido, y el proyecto no lo tiene encendido.
--
-- Error real observado: "permission denied for table organizaciones" al
-- intentar iniciar sesión en el Workbook — confirma que es esto, no un
-- problema de la policy filtrando de más.
-- ══════════════════════════════════════════════════════════════════


-- ── organizaciones ────────────────────────────────────────────────
-- Necesario: workbook.html hace SELECT directo (resolución de
-- organización tras login — auditoría de conexión Workbook↔Supabase).
GRANT SELECT ON organizaciones TO authenticated;

-- ── consultor_organizacion ──────────────────────────────────────────
-- Necesario aunque ningún código hace SELECT directo sobre esta tabla:
-- la policy "organizaciones_select_consultor" (migración 001, 2.1) usa
-- EXISTS (SELECT 1 FROM consultor_organizacion WHERE ...) en su USING.
-- Ese subquery se evalúa con los privilegios del rol que ejecuta la
-- consulta externa (authenticated), no con privilegios elevados — sin
-- este GRANT, la policy de arriba no puede evaluarse y el error solo
-- se traslada de "organizaciones" a esta tabla.
GRANT SELECT ON consultor_organizacion TO authenticated;

-- ── Deliberadamente NO incluidos ────────────────────────────────────
-- consultores: ningún archivo del repo hace supa.from('consultores') —
--   el login usa auth.signInWithPassword (auth.users, schema interno de
--   Supabase Auth), no esta tabla. Agregarlo sería permiso sin uso real.
-- invitaciones_individuales: el flujo de generar códigos ya funciona sin
--   GRANT de tabla (pasa por generar_invitaciones_individuales(),
--   SECURITY DEFINER). Existe una policy de SELECT pensada para un
--   futuro listado/progreso de códigos (migración 001, 2.4), pero
--   ningún HTML del repo la consume todavía — agregar el GRANT ahora
--   sería anticipar una feature que no existe. Revisar cuando se
--   construya esa vista.
-- respuestas_cuestionario / respuestas_cuestionario_pares /
-- respuestas_sdmo / log_acceso_confidencial: sin cambios, a propósito
-- (marco, sección 10.1 — el mínimo N≥8 se protege bloqueando el acceso
-- directo por completo, todo pasa por funciones SECURITY DEFINER).


-- ══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════

-- Debe devolver 2 filas: organizaciones y consultor_organizacion, ambas
-- con privilege_type = 'SELECT' y grantee = 'authenticated'.
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee = 'authenticated'
  AND table_name IN ('organizaciones', 'consultor_organizacion', 'consultores', 'invitaciones_individuales')
ORDER BY table_name;

-- Prueba manual: con un usuario autenticado real (no service_role),
-- SELECT id, nombre FROM organizaciones; debe devolver solo las
-- organizaciones vinculadas a ese consultor en consultor_organizacion,
-- sin "permission denied".
