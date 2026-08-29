-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 029: revocar EXECUTE de PUBLIC en TODAS las
-- funciones del schema public — PARA REVISIÓN, no aplicar todavía.
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente
-- cuando lo apruebe.
--
-- Depende de la migración 028 (fix urgente y aislado del chequeo de
-- auth.uid() faltante en _calcular_cff_puro()/_calcular_cff_interno()) —
-- debe aplicarse DESPUÉS de esa, no antes: primero se cierra el agujero
-- crítico específico, después se corrige el problema general de GRANT.
--
-- ── Causa raíz (hallazgo confirmado, sesión 2026-08-29) ──
-- La migración 004 corrigió privilegios sobrantes de anon/authenticated
-- ON TABLES únicamente — nunca tocó funciones. Postgres otorga EXECUTE a
-- PUBLIC por defecto en cada CREATE FUNCTION (a diferencia de las
-- tablas, que no reciben ningún privilegio por defecto). Confirmado por
-- grep de las 27 migraciones previas: cero ocurrencias de
-- "REVOKE ... FROM PUBLIC" o "ALTER DEFAULT PRIVILEGES ... ON FUNCTIONS"
-- en ninguna. El gap existe desde la migración 001, no desde una
-- migración reciente.
--
-- Esto significa que anon tiene hoy EXECUTE (vía el default de PUBLIC,
-- no vía un GRANT explícito) sobre TODAS las funciones del schema
-- public, incluidas las que nunca tuvieron GRANT propio a propósito
-- (_calcular_cff_puro, _calcular_cff_interno, _seguimiento_completitud,
-- _seguimiento_rollup, recalcular_calibracion_parametro,
-- recalcular_k_credibilidad — diseñadas para ser invocables solo desde
-- otra función SECURITY DEFINER ya autenticada, nunca desde el cliente).
-- Dos de ellas (_calcular_cff_puro/_calcular_cff_interno) no tienen
-- ningún chequeo de auth.uid()/consultor_organizacion propio — hoy son
-- alcanzables directamente por un cliente anónimo con solo la anon key
-- pública, sin necesitar sesión de consultor.
--
-- Las funciones que SÍ validan consultor_organizacion internamente (la
-- mayoría de las ~22 con GRANT a authenticated) siguen protegidas en la
-- práctica — auth.uid() es NULL para una llamada anónima y esa condición
-- ya las rechaza — pero también quedan corregidas acá por disciplina de
-- mínimo privilegio (mismo criterio ya aplicado en la migración 004:
-- "es privilegio otorgado que nunca se pidió").
--
-- ── Por qué un solo REVOKE y no listar cada función a mano ──
-- `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC` cubre
-- las ~45 funciones existentes en un solo comando, sin depender de una
-- lista mantenida a mano (que ya demostró no mantenerse — ninguna de
-- las 27 migraciones anteriores incluyó esto). Solo quita la entrada de
-- PUBLIC de cada función; los GRANT explícitos a anon/authenticated que
-- ya existen (5 y ~22 respectivamente) son entradas de ACL
-- independientes y NO se ven afectados — no hace falta re-otorgarlos.
-- Los dueños de las funciones (el rol que las creó) retienen acceso
-- total a sus propios objetos sin importar el ACL, así que las cadenas
-- de llamada interna (SECURITY DEFINER llamando a otra SECURITY
-- DEFINER, ej. guardar_seguimiento_area → _seguimiento_rollup →
-- _calcular_cff_interno → _calcular_cff_puro) siguen funcionando igual.
-- ══════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

-- Regla por defecto para funciones futuras — mismo patrón y misma razón
-- que la migración 004 usó para tablas (FOR ROLE postgres explícito, no
-- depende de con qué rol esté conectada la sesión que aplica esto). Sin
-- esto, la próxima función creada (migración 029 en adelante) reabre el
-- mismo gap desde cero.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;


-- ══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════

-- 1. ANTES de aplicar — correr esto primero para confirmar la exposición
--    actual (debe devolver ~45 filas, una por función, grantee='PUBLIC').
--    Guardar el resultado para comparar contra la consulta 2 de abajo.
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public' AND grantee = 'PUBLIC'
ORDER BY routine_name;

-- 2. DESPUÉS de aplicar — debe devolver 0 filas. Si devuelve alguna,
--    la migración no se aplicó completa o hay funciones fuera del
--    schema public a revisar aparte.
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public' AND grantee = 'PUBLIC'
ORDER BY routine_name;

-- 3. Los GRANT explícitos a anon/authenticated deben seguir intactos —
--    comparar el conteo contra el que ya se documentó al aplicar cada
--    migración anterior (5 funciones a anon, ~22 a authenticated).
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public' AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, routine_name;

-- 4. Prueba funcional — confirmar que las cadenas de llamada interna
--    (guardar_seguimiento_area → _seguimiento_rollup →
--    _calcular_cff_interno) siguen funcionando para un consultor
--    autenticado real, después de revocar PUBLIC. Repetir cualquier
--    prueba de la migración 026 que dispare un roll-up.
--
-- 5. Prueba de que el hallazgo quedó cerrado — intentar llamar
--    _calcular_cff_puro directamente vía REST con SOLO la anon key
--    (sin sesión de consultor), como haría un cliente anónimo real:
--
--    curl -X POST 'https://<project>.supabase.co/rest/v1/rpc/_calcular_cff_puro' \
--      -H "apikey: <anon key>" -H "Authorization: Bearer <anon key>" \
--      -H "Content-Type: application/json" \
--      -d '{"p_organizacion_id":"00000000-0000-0000-0000-000000000000","p_iao_org":null,"p_iao_n_suficiente":false}'
--
--    Antes de esta migración: debería devolver un jsonb (200) — la
--    función se ejecuta. Después: debe devolver 401/404 "permission
--    denied for function _calcular_cff_puro" (PostgREST no expone
--    funciones sin EXECUTE como RPC alcanzable). Repetir con
--    _calcular_cff_interno, _seguimiento_completitud y _seguimiento_rollup.
