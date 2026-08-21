-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 016: fix — elimina sobrecargas obsoletas de
-- actualizar_ficha_financiera (causa raíz confirmada: PGRST203)
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- Contexto del bug: Ficha financiera se veía "guardada" en pantalla pero
-- organizaciones.salario_promedio (y el resto de columnas del RPC)
-- quedaban NULL en la tabla. Confirmado con UPDATE directo (sí persiste)
-- vs. supa.rpc('actualizar_ficha_financiera', ...) desde el cliente
-- (nunca llega a ejecutarse) — y con el error real devuelto por
-- PostgREST: PGRST203, "Could not choose the best candidate function".
--
-- Causa raíz: CREATE OR REPLACE FUNCTION solo reemplaza cuando la lista
-- de TIPOS de parámetros es idéntica. Cada vez que se agregó un campo
-- nuevo a la Ficha financiera (migraciones 011→012→015) se agregó un
-- parámetro más a actualizar_ficha_financiera() sin hacer DROP de la
-- versión anterior — el comentario de la migración 012 (línea 37-40)
-- asumió explícitamente que "no hace falta DROP FUNCTION" porque el
-- parámetro nuevo se agrega al final con DEFAULT NULL. Esa suposición es
-- incorrecta para PostgreSQL: el resultado fueron 3 sobrecargas
-- coexistiendo en la base:
--   011 → (uuid, text, numeric×6)  = 8 parámetros
--   012 → (uuid, text, numeric×7)  = 9 parámetros
--   015 → (uuid, text, numeric×8)  = 10 parámetros  ← la única correcta hoy
-- El cliente (workbook.html, guardarFichaFinanciera()) manda los 10
-- parámetros nombrados de la versión de 015. Como los primeros 9
-- coinciden exactamente entre la de 012 y la de 015, PostgREST no puede
-- decidir cuál candidata usar y falla con PGRST203 en vez de adivinar —
-- por eso el guardado real nunca se ejecutaba, sin que el UPDATE directo
-- a la tabla (que no pasa por esta función) se viera afectado.
--
-- Fix: DROP FUNCTION de las 2 sobrecargas viejas (011 y 012), dejando
-- solo la de 10 parámetros (015) activa. Firmas confirmadas leyendo
-- directamente el CREATE OR REPLACE y el GRANT de cada migración
-- original, no asumidas.
-- ══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS actualizar_ficha_financiera(
  uuid, text, numeric, numeric, numeric, numeric, numeric, numeric
);

DROP FUNCTION IF EXISTS actualizar_ficha_financiera(
  uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric
);


-- ══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════

-- Debe devolver exactamente 1 fila — la de 10 parámetros (015):
--   (p_organizacion_id uuid, p_pais text, p_salario_promedio numeric,
--    p_tasa_rotacion_base numeric, p_dias_ausencia_base numeric,
--    p_costo_operativo_total numeric, p_costo_intervencion numeric,
--    p_ebitda numeric, p_tasa_retrabajo_real numeric,
--    p_multiplicador_rol numeric)
SELECT pg_get_function_identity_arguments(p.oid) AS firma
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'actualizar_ficha_financiera';

-- Prueba manual: desde el Workbook, abrir Ficha financiera de cualquier
-- organización de prueba, guardar un valor de Salario promedio, y
-- confirmar en la tabla que persiste:
-- SELECT salario_promedio, pais, tasa_rotacion_base, dias_ausencia_base
-- FROM organizaciones WHERE id = '<org_id>';
