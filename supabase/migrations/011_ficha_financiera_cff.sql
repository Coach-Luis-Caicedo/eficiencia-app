-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 011: ficha financiera del CFF — país +
-- costo operativo/intervención/EBITDA + RPC de edición
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- Contexto: crear_organizacion() (migración 007) captura salario_promedio/
-- tasa_rotacion_base/dias_ausencia_base como "opcional — se completa
-- después", pero nunca existió ningún mecanismo real para completarlos
-- después — vacío confirmado al investigar el flujo de creación/edición
-- de organización. Esta migración agrega los 4 campos que le faltan al
-- CFF (país, costo operativo total, costo de intervención, EBITDA) y
-- cierra el vacío con un único RPC de edición que cubre los 7 campos
-- financieros juntos (los 3 que ya existían + los 4 nuevos), para que no
-- queden unos editables y otros no.
--
-- `pais`: mismo patrón que `sector` (migración 005) — columna nullable
-- sin CHECK que bloquee valores futuros de golpe, restringida por ahora
-- a una lista fija que solo tiene 'colombia' (único país con la
-- investigación legal del CFF completa —
-- INVESTIGACION_COSTO_LEGAL_DESVINCULACION_LATAM.md, en curso, agregará
-- el resto). Agregar un país nuevo a futuro es un
-- ALTER TABLE...DROP CONSTRAINT + ADD CONSTRAINT, no una migración de
-- esquema mayor — mismo criterio ya usado para expandir `sector` si
-- hiciera falta.
--
-- `ebitda`: a diferencia de costo_operativo_total y costo_intervencion,
-- SIN CHECK >= 0 — una organización con pérdida operativa tiene EBITDA
-- negativo; es un dato real, no un error de captura.
--
-- crear_organizacion() cambia de firma (se inserta p_pais como
-- obligatorio, no al final, junto al resto de la ficha técnica) —
-- CREATE OR REPLACE no alcanza para esto (solo permite agregar
-- parámetros nuevos al final, todos con DEFAULT); hace falta DROP
-- FUNCTION primero, mismo patrón ya usado en la migración 002 para
-- resumen_par_organizacion/resumen_sdmo_organizacion.
-- ══════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════
-- 1. Columnas nuevas en organizaciones
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE organizaciones ADD COLUMN pais text
  CHECK (pais IS NULL OR pais IN ('colombia'));

ALTER TABLE organizaciones ADD COLUMN costo_operativo_total numeric
  CHECK (costo_operativo_total IS NULL OR costo_operativo_total >= 0);

ALTER TABLE organizaciones ADD COLUMN costo_intervencion numeric
  CHECK (costo_intervencion IS NULL OR costo_intervencion >= 0);

ALTER TABLE organizaciones ADD COLUMN ebitda numeric;


-- ══════════════════════════════════════════════════════════════════
-- 2. crear_organizacion() — agrega p_pais obligatorio
--
-- p_pais se inserta después de p_sector (mismo grupo de ficha técnica:
-- nombre/n_empleados/sector/pais) y antes de p_areas — obligatorio como
-- el resto de la ficha técnica, a diferencia de los insumos CFF que
-- siguen opcionales. Validado con RAISE EXCEPTION igual que sector, no
-- solo con el CHECK de la columna (mismo criterio: el CHECK de columna
-- admite NULL porque organizaciones creadas antes de esta migración
-- todavía no tienen país asignado — se backfillea con
-- actualizar_ficha_financiera(), sección 3).
-- ══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS crear_organizacion(text, int, text, text[], numeric, numeric, numeric, jsonb);

CREATE OR REPLACE FUNCTION crear_organizacion(
  p_nombre               text,
  p_n_empleados          int,
  p_sector               text,
  p_pais                 text,
  p_areas                text[],
  p_salario_promedio     numeric DEFAULT NULL,
  p_tasa_rotacion_base   numeric DEFAULT NULL,
  p_dias_ausencia_base   numeric DEFAULT NULL,
  p_contactos            jsonb DEFAULT NULL
) RETURNS uuid
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_org_id    uuid;
  v_area      text;
  v_contacto  jsonb;
  v_rol       text;
  v_nombre    text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'no autenticado';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM consultores WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'no autorizado — el usuario autenticado no está registrado como consultor';
  END IF;

  IF p_nombre IS NULL OR trim(p_nombre) = '' THEN
    RAISE EXCEPTION 'el nombre de la organización es obligatorio';
  END IF;

  IF p_n_empleados IS NULL OR p_n_empleados < 1 THEN
    RAISE EXCEPTION 'el número de empleados es obligatorio y debe ser mayor a 0';
  END IF;

  IF p_sector IS NULL OR p_sector NOT IN (
    'servicios_prof', 'manufactura', 'finanzas_tech', 'retail_logistica', 'salud_educacion'
  ) THEN
    RAISE EXCEPTION 'sector inválido — debe ser uno de: servicios_prof, manufactura, finanzas_tech, retail_logistica, salud_educacion';
  END IF;

  IF p_pais IS NULL OR p_pais NOT IN ('colombia') THEN
    RAISE EXCEPTION 'país inválido — por ahora el sistema solo soporta: colombia';
  END IF;

  IF p_areas IS NULL OR array_length(p_areas, 1) IS NULL OR array_length(p_areas, 1) = 0 THEN
    RAISE EXCEPTION 'se requiere al menos un área';
  END IF;

  INSERT INTO organizaciones (nombre, n_empleados, sector, pais, salario_promedio, tasa_rotacion_base, dias_ausencia_base)
  VALUES (trim(p_nombre), p_n_empleados, p_sector, p_pais, p_salario_promedio, p_tasa_rotacion_base, p_dias_ausencia_base)
  RETURNING id INTO v_org_id;

  FOREACH v_area IN ARRAY p_areas LOOP
    v_area := trim(v_area);
    IF v_area <> '' THEN
      INSERT INTO areas_organizacion (organizacion_id, nombre)
      VALUES (v_org_id, v_area)
      ON CONFLICT (organizacion_id, nombre) DO NOTHING;
    END IF;
  END LOOP;

  INSERT INTO consultor_organizacion (consultor_id, organizacion_id, rol)
  VALUES (auth.uid(), v_org_id, 'consultor');

  IF p_contactos IS NOT NULL THEN
    FOR v_contacto IN SELECT * FROM jsonb_array_elements(p_contactos) LOOP
      v_rol    := v_contacto->>'rol';
      v_nombre := trim(coalesce(v_contacto->>'nombre', ''));

      IF v_nombre = '' THEN
        CONTINUE; -- sección del formulario vacía — se omite, no rompe el alta
      END IF;

      IF v_rol IS NULL OR v_rol NOT IN ('directivo_responsable', 'coordinador', 'comite_supervision') THEN
        RAISE EXCEPTION 'rol de contacto inválido: %', v_rol;
      END IF;

      INSERT INTO contactos_organizacion (organizacion_id, rol, nombre, cargo, email, telefono)
      VALUES (v_org_id, v_rol, v_nombre, v_contacto->>'cargo', v_contacto->>'email', v_contacto->>'telefono');
    END LOOP;
  END IF;

  RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION crear_organizacion(text, int, text, text, text[], numeric, numeric, numeric, jsonb) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- 3. actualizar_ficha_financiera() — RPC nuevo, único lugar para editar
--    los 7 insumos financieros del CFF después del alta.
--
-- Mismo patrón de autorización que crear_organizacion()/resumen_*:
-- verifica consultor_organizacion, no un GRANT de tabla — organizaciones
-- solo tiene GRANT SELECT para authenticated (migración 003), sin
-- UPDATE, y esta migración no le agrega ninguno. SECURITY DEFINER es lo
-- que permite que este RPC escriba sin necesitar ese GRANT — mismo
-- mecanismo que ya usa crear_organizacion() para el INSERT sin que
-- authenticated tenga GRANT de INSERT. No hace falta ningún GRANT ni
-- policy nuevos sobre la tabla, solo el GRANT EXECUTE de la función
-- (al final de este bloque) — la pregunta del prompt original queda
-- resuelta así: no, no hace falta.
--
-- Reemplazo completo de los 7 campos en cada llamada (no parcial) — el
-- panel que lo consume carga los valores actuales, el consultor edita lo
-- que necesite, y se reenvían los 7. Igual que crear_organizacion(), no
-- distingue "campo no tocado" de "campo puesto en blanco a propósito" —
-- si en algún momento hace falta un update parcial real, se resuelve ahí
-- cuando haga falta, no se anticipa aquí.
--
-- p_pais es obligatorio también aquí (no solo en el alta): una vez que
-- una organización tiene país, no debería poder quedar en NULL por una
-- edición — y este RPC es además el mecanismo para backfillear país en
-- organizaciones creadas antes de esta migración (prueba manual 3, más
-- abajo).
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION actualizar_ficha_financiera(
  p_organizacion_id       uuid,
  p_pais                  text,
  p_salario_promedio      numeric DEFAULT NULL,
  p_tasa_rotacion_base    numeric DEFAULT NULL,
  p_dias_ausencia_base    numeric DEFAULT NULL,
  p_costo_operativo_total numeric DEFAULT NULL,
  p_costo_intervencion    numeric DEFAULT NULL,
  p_ebitda                numeric DEFAULT NULL
) RETURNS void
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE organizacion_id = p_organizacion_id AND consultor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'no autorizado para esta organización';
  END IF;

  IF p_pais IS NULL OR p_pais NOT IN ('colombia') THEN
    RAISE EXCEPTION 'país inválido — por ahora el sistema solo soporta: colombia';
  END IF;

  UPDATE organizaciones SET
    pais                  = p_pais,
    salario_promedio      = p_salario_promedio,
    tasa_rotacion_base    = p_tasa_rotacion_base,
    dias_ausencia_base    = p_dias_ausencia_base,
    costo_operativo_total = p_costo_operativo_total,
    costo_intervencion    = p_costo_intervencion,
    ebitda                = p_ebitda
  WHERE id = p_organizacion_id;
END;
$$;

GRANT EXECUTE ON FUNCTION actualizar_ficha_financiera(uuid, text, numeric, numeric, numeric, numeric, numeric, numeric) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════

-- Debe devolver 4 filas: pais, costo_operativo_total, costo_intervencion, ebitda
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'organizaciones'
  AND column_name IN ('pais', 'costo_operativo_total', 'costo_intervencion', 'ebitda')
ORDER BY column_name;

-- Debe devolver 2 filas
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('crear_organizacion', 'actualizar_ficha_financiera');

-- Prueba manual 1 (alta con país — reemplaza la firma vieja de
-- crear_organizacion, sin p_pais, que ya no existe tras el DROP FUNCTION):
-- SELECT crear_organizacion('Organización de prueba 3', 15, 'servicios_prof', 'colombia',
--   ARRAY['Operaciones','Ventas']);
-- Debe devolver un uuid nuevo. Confirmar:
--   SELECT pais FROM organizaciones WHERE id = '<ese uuid>';  -- 'colombia'

-- Prueba manual 2 (edición de ficha financiera completa, con un usuario
-- autenticado ya vinculado a la organización vía consultor_organizacion):
-- SELECT actualizar_ficha_financiera('<org_id>', 'colombia', 3500000, 22.5, 7, 900000000, 45000000, 120000000);
-- Confirmar:
--   SELECT salario_promedio, tasa_rotacion_base, dias_ausencia_base,
--     costo_operativo_total, costo_intervencion, ebitda
--   FROM organizaciones WHERE id = '<org_id>';

-- Prueba manual 3 — backfill de país en la(s) organización(es) creada(s)
-- antes de esta migración (quedaron con pais = NULL, no las bloquea el
-- CHECK de columna, solo la validación de crear_organizacion() para
-- altas nuevas):
-- SELECT actualizar_ficha_financiera('<org_id_original>', 'colombia');
-- (los demás parámetros quedan NULL si no se pasan — usar la firma
-- completa si ya se conocen esos valores, para no borrar datos existentes
-- con NULL sin querer)
