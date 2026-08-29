-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 027: gestión de areas_organizacion
-- (agregar/renombrar/eliminar) — PARA REVISIÓN, no aplicar todavía.
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente
-- cuando lo apruebe.
--
-- Depende de:
--   - migración 006  (areas_organizacion, UNIQUE(organizacion_id,nombre))
--   - migración 001  (respuestas_cuestionario.area / respuestas_sdmo.area,
--                     texto libre normalizado trim+lower al capturar)
--   - migración 026  (seguimiento_area_observaciones.area_id, FK con
--                     ON DELETE CASCADE — único join real por id)
--
-- ── Qué resuelve ──
-- Hoy areas_organizacion es de solo lectura después del alta (diseño
-- explícito de la migración 006: "sin policy de INSERT para nadie, se
-- crean exclusivamente vía crear_organizacion()"). Diagnóstico confirmado
-- con Luis (sesión 2026-08-29): cero RPC de escritura fuera de esa
-- función, cero GRANT de escritura sobre la tabla, en las 26 migraciones
-- previas. Este archivo agrega los 3 RPCs que faltan.
--
-- ── Decisión de alcance (confirmada con Luis, 2026-08-29) ──
-- Alcance CHICO, no el de migrar respuestas_cuestionario.area/
-- respuestas_sdmo.area a area_id (FK real). Motivo actualizado: NO es
-- riesgo a datos históricos (no hay clientes reales todavía). Es que esa
-- migración tocaría enviar_respuesta_cuestionario()/enviar_respuesta_sdmo()
-- (migración 001, GRANT ... TO anon, sirviendo el cuestionario/SD-MO
-- público EN VIVO hoy) y resumen_organizacion_completo() (la función que
-- aplica el gate de confidencialidad N≥8-10) — cambios que requieren
-- coordinar deploy de RPC+frontend a la vez y ameritan su propia sesión
-- de trabajo. Documentado como pendiente, no se implementa aquí.
--
-- Para no perder la ganancia principal de una FK real (que renombrar no
-- fragmente la comparación "Por área" del Tablero), renombrar_area_
-- organizacion() re-etiqueta por texto normalizado las filas de
-- respuestas_cuestionario/respuestas_sdmo en la MISMA transacción —
-- resuelve el problema práctico sin tocar las 2 RPCs anon ni el gate.
-- ══════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════
-- 1. agregar_area_organizacion — alta de un área nueva en una
--    organización existente. Chequeo de duplicado CASE-INSENSITIVE
--    explícito (no solo el UNIQUE(organizacion_id,nombre) de la migración
--    006, que es case-sensitive) — sin esto sería posible crear "Ventas"
--    y "ventas" como 2 filas distintas que colisionarían en la misma
--    "área" normalizada dentro de respuestas_cuestionario/sdmo (exacto el
--    tipo de fragmentación silenciosa que la migración 006 dice haber
--    resuelto). Nota para revisión: esta colisión case-insensitive YA es
--    posible hoy vía crear_organizacion() (que solo hace trim, no
--    lower) — este chequeo no la corrige retroactivamente, solo evita
--    agregarla de aquí en adelante por este RPC nuevo.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION agregar_area_organizacion(
  p_organizacion_id uuid,
  p_nombre          text
) RETURNS uuid
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_nombre   text;
  v_area_id  uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE organizacion_id = p_organizacion_id AND consultor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'no autorizado para esta organización';
  END IF;

  v_nombre := trim(p_nombre);
  IF v_nombre = '' THEN
    RAISE EXCEPTION 'el nombre del área no puede estar vacío';
  END IF;

  IF EXISTS (
    SELECT 1 FROM areas_organizacion
    WHERE organizacion_id = p_organizacion_id AND lower(nombre) = lower(v_nombre)
  ) THEN
    RAISE EXCEPTION 'ya existe un área llamada "%" en esta organización', v_nombre;
  END IF;

  INSERT INTO areas_organizacion (organizacion_id, nombre)
  VALUES (p_organizacion_id, v_nombre)
  RETURNING id INTO v_area_id;

  RETURN v_area_id;
END;
$$;

GRANT EXECUTE ON FUNCTION agregar_area_organizacion(uuid, text) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- 2. renombrar_area_organizacion — cambia areas_organizacion.nombre y
--    re-etiqueta en la misma transacción las respuestas ya capturadas
--    con el nombre viejo (respuestas_cuestionario.area/respuestas_sdmo.
--    area, ambas texto normalizado trim+lower — migración 001). Sin esto,
--    renombrar fragmentaría la comparación "Por área" del Tablero
--    (resumen_organizacion_completo, p_departamento) exactamente como
--    antes de la migración 006.
--
--    Devuelve cuántas filas se re-etiquetaron en cada tabla — no es una
--    advertencia previa a confirmar, es el resultado real de lo que
--    ocurrió (decisión: ya no hace falta el paso de fricción que se
--    había planteado, porque el re-etiquetado es correcto por
--    construcción, no una operación arriesgada).
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION renombrar_area_organizacion(
  p_organizacion_id uuid,
  p_area_id         uuid,
  p_nombre_nuevo    text
) RETURNS jsonb
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_nombre_nuevo    text;
  v_nombre_viejo    text;
  v_norm_viejo      text;
  v_norm_nuevo      text;
  v_n_cuestionario  integer;
  v_n_sdmo          integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE organizacion_id = p_organizacion_id AND consultor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'no autorizado para esta organización';
  END IF;

  SELECT nombre INTO v_nombre_viejo
  FROM areas_organizacion
  WHERE id = p_area_id AND organizacion_id = p_organizacion_id;

  IF v_nombre_viejo IS NULL THEN
    RAISE EXCEPTION 'el área indicada no pertenece a esta organización';
  END IF;

  v_nombre_nuevo := trim(p_nombre_nuevo);
  IF v_nombre_nuevo = '' THEN
    RAISE EXCEPTION 'el nombre del área no puede estar vacío';
  END IF;

  IF EXISTS (
    SELECT 1 FROM areas_organizacion
    WHERE organizacion_id = p_organizacion_id AND id <> p_area_id AND lower(nombre) = lower(v_nombre_nuevo)
  ) THEN
    RAISE EXCEPTION 'ya existe un área llamada "%" en esta organización', v_nombre_nuevo;
  END IF;

  UPDATE areas_organizacion SET nombre = v_nombre_nuevo WHERE id = p_area_id;

  -- Mismo trim(lower(...)) que enviar_respuesta_cuestionario()/
  -- enviar_respuesta_sdmo() aplican al capturar (migración 001) — para
  -- que el match encuentre exactamente las filas que resumen_
  -- organizacion_completo() habría estado agrupando bajo el nombre viejo.
  v_norm_viejo := NULLIF(trim(lower(v_nombre_viejo)), '');
  v_norm_nuevo := NULLIF(trim(lower(v_nombre_nuevo)), '');

  UPDATE respuestas_cuestionario
  SET area = v_norm_nuevo
  WHERE organizacion_id = p_organizacion_id AND area = v_norm_viejo;
  GET DIAGNOSTICS v_n_cuestionario = ROW_COUNT;

  UPDATE respuestas_sdmo
  SET area = v_norm_nuevo
  WHERE organizacion_id = p_organizacion_id AND area = v_norm_viejo;
  GET DIAGNOSTICS v_n_sdmo = ROW_COUNT;

  RETURN jsonb_build_object(
    'area_id', p_area_id,
    'nombre_anterior', v_nombre_viejo,
    'nombre_nuevo', v_nombre_nuevo,
    'respuestas_cuestionario_reetiquetadas', v_n_cuestionario,
    'respuestas_sdmo_reetiquetadas', v_n_sdmo
  );
END;
$$;

GRANT EXECUTE ON FUNCTION renombrar_area_organizacion(uuid, uuid, text) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- 3. eliminar_area_organizacion — guard: rechaza si hay
--    seguimiento_area_observaciones asociadas (histórico real de PIIO
--    por área, migración 026 — esa FK tiene ON DELETE CASCADE, así que
--    sin este guard el borrado se llevaría ese histórico en silencio).
--
--    Las respuestas_cuestionario/respuestas_sdmo con el nombre de esta
--    área NO bloquean el borrado — no tienen FK a areas_organizacion (son
--    texto libre, decisión de alcance de esta migración), así que ya
--    quedan "huérfanas de texto" hoy con solo renombrar; eliminar no
--    cambia esa exposición. Si en el futuro se decide bloquear también
--    por esas respuestas, agregar el EXISTS correspondiente aquí.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION eliminar_area_organizacion(
  p_organizacion_id uuid,
  p_area_id         uuid
) RETURNS void
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_nombre  text;
  v_n_obs   integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE organizacion_id = p_organizacion_id AND consultor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'no autorizado para esta organización';
  END IF;

  SELECT nombre INTO v_nombre
  FROM areas_organizacion
  WHERE id = p_area_id AND organizacion_id = p_organizacion_id;

  IF v_nombre IS NULL THEN
    RAISE EXCEPTION 'el área indicada no pertenece a esta organización';
  END IF;

  SELECT count(*) INTO v_n_obs
  FROM seguimiento_area_observaciones
  WHERE area_id = p_area_id;

  IF v_n_obs > 0 THEN
    RAISE EXCEPTION 'no se puede eliminar "%" — tiene % observación(es) de seguimiento por área capturadas (PIIO). Elimina primero esos datos si de verdad quieres borrar el área.', v_nombre, v_n_obs;
  END IF;

  DELETE FROM areas_organizacion WHERE id = p_area_id AND organizacion_id = p_organizacion_id;
END;
$$;

GRANT EXECUTE ON FUNCTION eliminar_area_organizacion(uuid, uuid) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════

-- 1. Firmas de las 3 funciones.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS firma
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN (
  'agregar_area_organizacion', 'renombrar_area_organizacion', 'eliminar_area_organizacion'
)
ORDER BY p.proname;

-- 2. GRANT EXECUTE solo a authenticated, nunca a anon.
SELECT r.routine_name, g.grantee, g.privilege_type
FROM information_schema.routine_privileges g
JOIN information_schema.routines r ON r.specific_name = g.specific_name
WHERE r.routine_schema = 'public' AND r.routine_name IN (
  'agregar_area_organizacion', 'renombrar_area_organizacion', 'eliminar_area_organizacion'
)
ORDER BY r.routine_name, g.grantee;
-- Esperado: solo 'authenticated' / EXECUTE. Ninguna fila con grantee='anon'.

-- ── Pruebas funcionales — usar un organizacion_id real de prueba.
--    Descomentar y reemplazar <org>, <area>.
--
-- 3. Agregar + duplicado case-insensitive rechazado.
-- SELECT agregar_area_organizacion('<org>', 'Bodega');
-- SELECT agregar_area_organizacion('<org>', 'bodega');  -- debe fallar: "ya existe un área llamada..."
--
-- 4. Renombrar sin respuestas previas — contadores en 0.
-- SELECT renombrar_area_organizacion('<org>', '<area>', 'Bodega y Despachos');
-- -- Esperado: {"area_id":"<area>","nombre_anterior":"Bodega","nombre_nuevo":"Bodega y Despachos","respuestas_cuestionario_reetiquetadas":0,"respuestas_sdmo_reetiquetadas":0}
--
-- 5. Renombrar CON respuestas previas — contadores > 0 y el filtro por
--    departamento del Tablero sigue encontrando las respuestas viejas
--    bajo el nombre nuevo.
-- -- (enviar una respuesta de prueba con area='Bodega y Despachos' antes,
--    vía cuestionario.html, luego renombrar a 'Bodega Central')
-- SELECT renombrar_area_organizacion('<org>', '<area>', 'Bodega Central');
-- SELECT resumen_organizacion_completo('<org>', 'Bodega Central');  -- debe encontrar la respuesta
--
-- 6. Eliminar bloqueado por datos PIIO.
-- SELECT configurar_seguimiento_kpi('<org>', 'tasa_rotacion_base', true, NULL);
-- SELECT guardar_seguimiento_area('<org>', '<area>', '2026-03', p_tasa_rotacion_base := 10);
-- SELECT eliminar_area_organizacion('<org>', '<area>');  -- debe fallar: "tiene 1 observación(es)..."
--
-- 7. Eliminar permitido sin datos PIIO.
-- SELECT agregar_area_organizacion('<org>', 'Área de prueba a borrar');
-- SELECT eliminar_area_organizacion('<org>', (SELECT id FROM areas_organizacion WHERE organizacion_id='<org>' AND nombre='Área de prueba a borrar'));
-- SELECT count(*) FROM areas_organizacion WHERE organizacion_id='<org>' AND nombre='Área de prueba a borrar';  -- 0
--
-- 8. RLS / autorización — como consultor SIN vínculo a <org>, las 3 RPCs
--    deben lanzar 'no autorizado para esta organización'.
