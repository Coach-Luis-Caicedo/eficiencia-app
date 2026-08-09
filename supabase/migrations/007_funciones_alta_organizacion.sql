-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 007: funciones del flujo de alta de organización
-- + ficha técnica en resumen_organizacion_completo
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
-- Depende de las migraciones 005 (columnas nuevas en organizaciones) y
-- 006 (areas_organizacion, contactos_organizacion) — aplicar esas primero.
-- ══════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════
-- 1. resumen_organizacion_completo — agrega n_empleados, n_cuestionarios,
--    n_areas para la ficha técnica del Tablero.
--
-- Los tres quedan SIN el gating de n_suficiente (N≥8, marco sección 9.1)
-- que sí aplica a ICE/IEH/IAO/pares/sdmo — son metadatos administrativos
-- de cobertura ("¿cuánta gente ha respondido, de cuántas áreas?"), no
-- lecturas diagnósticas. Saber que 3 personas han respondido no revela
-- qué contestaron esas 3 personas — el mínimo de confidencialidad existe
-- para proteger los VALORES agregados a bajo N, no el conteo en sí.
--
-- 'organizacion_nombre' NO se agrega — el Workbook ya lo tiene resuelto
-- client-side (S_ORG.nombre, del login/selector).
--
-- Resto de la función sin cambios de lógica respecto a la migración 002
-- (mismas decisiones de diseño documentadas ahí) — CREATE OR REPLACE
-- exige el cuerpo completo, no un parche.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION resumen_organizacion_completo(
  p_organizacion_id uuid,
  p_departamento    text DEFAULT NULL,
  p_periodo         text DEFAULT NULL,
  p_sdmo_dias       int  DEFAULT 30
) RETURNS jsonb
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_gamma_iao         CONSTANT numeric := 0.5;
  v_w_neg             CONSTANT numeric := 0.5;
  v_w_pos             CONSTANT numeric := 1.0;
  v_umbral_piso       CONSTANT numeric := 0.5;
  v_alpha_brecha      CONSTANT numeric := 0.5;
  v_tendencia_umbral  CONSTANT numeric := 2;
  v_n_minimo          CONSTANT int     := 8;

  v_periodo     text;
  v_resultado   jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE organizacion_id = p_organizacion_id AND consultor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'no autorizado para esta organización';
  END IF;

  IF p_periodo IS NULL THEN
    SELECT periodo INTO v_periodo
    FROM respuestas_cuestionario
    WHERE organizacion_id = p_organizacion_id
    ORDER BY periodo DESC
    LIMIT 1;
  ELSE
    v_periodo := p_periodo;
  END IF;

  WITH
  org_meta AS (
    SELECT nombre, n_empleados FROM organizaciones WHERE id = p_organizacion_id
  ),
  cuestionario_meta AS (
    SELECT
      count(*)                AS n_cuestionarios,
      count(DISTINCT r.area)  AS n_areas
    FROM respuestas_cuestionario r
    WHERE r.organizacion_id = p_organizacion_id
      AND r.periodo = v_periodo
      AND (p_departamento IS NULL OR r.area = NULLIF(trim(lower(p_departamento)), ''))
  ),

  pares_agg AS (
    SELECT
      p.par,
      count(*)          AS n,
      avg(p.concepto_a)  AS concepto_a_prom,
      avg(p.concepto_b)  AS concepto_b_prom,
      avg(p.bipolar)     AS bipolar_prom
    FROM respuestas_cuestionario_pares p
    JOIN respuestas_cuestionario r ON r.id = p.respuesta_id
    WHERE r.organizacion_id = p_organizacion_id
      AND r.periodo = v_periodo
      AND (p_departamento IS NULL OR r.area = NULLIF(trim(lower(p_departamento)), ''))
    GROUP BY p.par
  ),
  pares_final AS (
    SELECT
      par, n,
      (n >= v_n_minimo) AS n_suficiente,
      round(concepto_a_prom::numeric, 4) AS concepto_a_prom,
      round(concepto_b_prom::numeric, 4) AS concepto_b_prom,
      round(bipolar_prom::numeric, 4)    AS bipolar_prom,
      round((concepto_a_prom - concepto_b_prom)::numeric, 4) AS brecha_calculada,
      round(
        (v_alpha_brecha * (concepto_a_prom - concepto_b_prom) + (1 - v_alpha_brecha) * bipolar_prom)::numeric, 4
      ) AS brecha_final
    FROM pares_agg
  ),

  individual_amenaza AS (
    SELECT
      p.respuesta_id,
      p.par,
      p.concepto_b,
      round((v_alpha_brecha * (p.concepto_a - p.concepto_b) + (1 - v_alpha_brecha) * p.bipolar)::numeric, 4) AS brecha_final_i
    FROM respuestas_cuestionario_pares p
    JOIN respuestas_cuestionario r ON r.id = p.respuesta_id
    WHERE r.organizacion_id = p_organizacion_id
      AND r.periodo = v_periodo
      AND (p_departamento IS NULL OR r.area = NULLIF(trim(lower(p_departamento)), ''))
  ),
  individual_amenaza_par AS (
    SELECT
      respuesta_id,
      par,
      GREATEST(
        GREATEST(brecha_final_i, 0) * v_w_pos + GREATEST(-brecha_final_i, 0) * v_w_neg,
        GREATEST(0, v_umbral_piso - concepto_b)
      ) AS amenaza_par_i
    FROM individual_amenaza
  ),

  par_amenaza_out AS (
    SELECT
      par,
      round(
        (v_gamma_iao * avg(amenaza_par_i)
          + (1 - v_gamma_iao) * (array_agg(amenaza_par_i ORDER BY amenaza_par_i DESC))[2]
        )::numeric, 4
      ) AS amenaza_par
    FROM individual_amenaza_par
    GROUP BY par
  ),

  pares_out AS (
    SELECT
      f.par, f.n, f.n_suficiente,
      CASE WHEN f.n_suficiente THEN f.concepto_a_prom ELSE NULL END AS concepto_a_prom,
      CASE WHEN f.n_suficiente THEN f.concepto_b_prom ELSE NULL END AS concepto_b_prom,
      CASE WHEN f.n_suficiente THEN f.bipolar_prom ELSE NULL END AS bipolar_prom,
      CASE WHEN f.n_suficiente THEN f.brecha_calculada ELSE NULL END AS brecha_calculada,
      CASE WHEN f.n_suficiente THEN f.brecha_final ELSE NULL END AS brecha_final,
      CASE WHEN f.n_suficiente THEN a.amenaza_par ELSE NULL END AS amenaza_par
    FROM pares_final f
    JOIN par_amenaza_out a ON a.par = f.par
  ),

  ice_ieh AS (
    SELECT
      round(avg(concepto_a_prom)::numeric, 4) AS ice,
      round(avg(concepto_b_prom)::numeric, 4) AS ieh,
      bool_and(n_suficiente) AS n_suficiente
    FROM pares_final
  ),

  individual_iao AS (
    SELECT
      respuesta_id,
      avg(amenaza_par_i) AS prom_amenaza,
      (array_agg(amenaza_par_i ORDER BY amenaza_par_i DESC))[2] AS segundo_mayor_amenaza
    FROM individual_amenaza_par
    GROUP BY respuesta_id
    HAVING count(*) = 5
  ),
  individual_iao_final AS (
    SELECT
      respuesta_id,
      100 * (v_gamma_iao * prom_amenaza + (1 - v_gamma_iao) * segundo_mayor_amenaza) AS iao_i
    FROM individual_iao
  ),
  iao_org AS (
    SELECT
      count(*) AS n,
      (count(*) >= v_n_minimo) AS n_suficiente,
      avg(iao_i) AS prom_iao_i,
      (array_agg(iao_i ORDER BY iao_i DESC))[2] AS segundo_mayor_iao_i
    FROM individual_iao_final
  ),
  iao_out AS (
    SELECT
      n, n_suficiente,
      CASE WHEN n_suficiente THEN
        round((v_gamma_iao * prom_iao_i + (1 - v_gamma_iao) * segundo_mayor_iao_i)::numeric, 4)
      ELSE NULL END AS iao
    FROM iao_org
  ),

  sdmo_actual AS (
    SELECT
      count(*) AS n,
      avg(ida_i) AS prom_ida,
      (array_agg(ida_i ORDER BY ida_i DESC))[2] AS segundo_mayor_ida
    FROM respuestas_sdmo
    WHERE organizacion_id = p_organizacion_id
      AND jornada >= current_date - p_sdmo_dias
      AND (p_departamento IS NULL OR area = NULLIF(trim(lower(p_departamento)), ''))
  ),
  sdmo_anterior AS (
    SELECT
      count(*) AS n,
      avg(ida_i) AS prom_ida,
      (array_agg(ida_i ORDER BY ida_i DESC))[2] AS segundo_mayor_ida
    FROM respuestas_sdmo
    WHERE organizacion_id = p_organizacion_id
      AND jornada >= current_date - (p_sdmo_dias * 2)
      AND jornada <  current_date - p_sdmo_dias
      AND (p_departamento IS NULL OR area = NULLIF(trim(lower(p_departamento)), ''))
  ),
  sdmo_out AS (
    SELECT
      a.n,
      (a.n >= v_n_minimo) AS n_suficiente,
      CASE WHEN a.n >= v_n_minimo THEN
        round((v_gamma_iao * a.prom_ida + (1 - v_gamma_iao) * a.segundo_mayor_ida)::numeric, 2)
      ELSE NULL END AS ida_prom,
      p.n AS n_anterior,
      (p.n >= v_n_minimo) AS n_suficiente_anterior,
      CASE WHEN p.n >= v_n_minimo THEN
        round((v_gamma_iao * p.prom_ida + (1 - v_gamma_iao) * p.segundo_mayor_ida)::numeric, 2)
      ELSE NULL END AS ida_prom_anterior
    FROM sdmo_actual a, sdmo_anterior p
  )

  SELECT jsonb_build_object(
    'organizacion_id', p_organizacion_id,
    'periodo', v_periodo,
    'departamento', p_departamento,
    'n_empleados', (SELECT n_empleados FROM org_meta),
    'n_cuestionarios', (SELECT n_cuestionarios FROM cuestionario_meta),
    'n_areas', (SELECT n_areas FROM cuestionario_meta),
    'ice', (SELECT ice FROM ice_ieh),
    'ieh', (SELECT ieh FROM ice_ieh),
    'ice_ieh_n_suficiente', (SELECT n_suficiente FROM ice_ieh),
    'iao', (SELECT iao FROM iao_out),
    'iao_n', (SELECT n FROM iao_out),
    'iao_n_suficiente', (SELECT n_suficiente FROM iao_out),
    'pares', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'par', par,
          'n', n,
          'n_suficiente', n_suficiente,
          'concepto_a_prom', concepto_a_prom,
          'concepto_b_prom', concepto_b_prom,
          'bipolar_prom', bipolar_prom,
          'brecha_calculada', brecha_calculada,
          'brecha_final', brecha_final,
          'amenaza_par', amenaza_par
        ) ORDER BY par
      )
      FROM pares_out
    ),
    'sdmo', (
      SELECT jsonb_build_object(
        'n', n,
        'n_suficiente', n_suficiente,
        'ida_prom', ida_prom,
        'ventana_dias', p_sdmo_dias,
        'tendencia', CASE WHEN n_suficiente AND n_suficiente_anterior THEN
          jsonb_build_object(
            'ida_prom_anterior', ida_prom_anterior,
            'delta', round((ida_prom - ida_prom_anterior)::numeric, 2),
            'direccion', CASE
              WHEN ida_prom - ida_prom_anterior > v_tendencia_umbral THEN 'deterioro'
              WHEN ida_prom - ida_prom_anterior < -v_tendencia_umbral THEN 'mejora'
              ELSE 'estable'
            END
          )
        ELSE NULL END
      )
      FROM sdmo_out
    ),
    'parametros_usados', jsonb_build_object(
      'gamma_iao', v_gamma_iao,
      'w_neg', v_w_neg,
      'w_pos', v_w_pos,
      'umbral_piso', v_umbral_piso,
      'alpha_brecha', v_alpha_brecha,
      'tendencia_umbral_ida', v_tendencia_umbral,
      'n_minimo', v_n_minimo
    )
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$$;

GRANT EXECUTE ON FUNCTION resumen_organizacion_completo(uuid, text, text, int) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- 2. crear_organizacion — alta completa por el consultor autenticado:
--    organización + áreas + vínculo + contactos (0 o más, con rol),
--    todo atómico.
--
-- Mismo patrón que enviar_respuesta_cuestionario: el cliente nunca hace
-- INSERT directo (organizaciones/areas_organizacion/consultor_organizacion/
-- contactos_organizacion solo tienen GRANT SELECT para authenticated,
-- migraciones 003 y 006) — todo pasa por esta función.
--
-- p_contactos es un array jsonb de objetos {rol, nombre, cargo, email,
-- telefono}, rol ∈ ('directivo_responsable','coordinador',
-- 'comite_supervision') — un solo parámetro jsonb en vez de 12+
-- parámetros sueltos (4 campos × 3 roles). El formulario en el Workbook
-- sigue mostrando 3 secciones separadas y claramente etiquetadas
-- (Directivo responsable / Coordinador / Comité de supervisión), solo
-- arma este array antes de llamar la función — y como Comité admite
-- varios registros, un array ya es la forma natural de representarlo,
-- no algo forzado para ahorrar parámetros.
--
-- Obligatorio, con RAISE EXCEPTION si falta (nombre, n_empleados, sector,
-- al menos un área) — salario_promedio/tasa_rotacion_base/
-- dias_ausencia_base/contactos quedan opcionales. Sector limitado a los
-- 5 valores de SECTOR_BENCHMARKS (mismo CHECK que la columna, migración
-- 005 — se repite aquí para dar un mensaje de error legible). Cada
-- contacto sin nombre se omite en silencio (formulario con esa sección
-- vacía), no se rechaza el alta completa por eso.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION crear_organizacion(
  p_nombre               text,
  p_n_empleados          int,
  p_sector               text,
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

  IF p_areas IS NULL OR array_length(p_areas, 1) IS NULL OR array_length(p_areas, 1) = 0 THEN
    RAISE EXCEPTION 'se requiere al menos un área';
  END IF;

  INSERT INTO organizaciones (nombre, n_empleados, sector, salario_promedio, tasa_rotacion_base, dias_ausencia_base)
  VALUES (trim(p_nombre), p_n_empleados, p_sector, p_salario_promedio, p_tasa_rotacion_base, p_dias_ausencia_base)
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

GRANT EXECUTE ON FUNCTION crear_organizacion(text, int, text, text[], numeric, numeric, numeric, jsonb) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- 3. areas_por_codigo — expone la lista de áreas de una organización al
--    cliente anónimo de cuestionario.html/sdmo.html, resolviendo el
--    organizacion_id desde el código de invitación (mismo patrón que
--    enviar_respuesta_cuestionario — el cliente nunca ve ni pasa un
--    organizacion_id directo).
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION areas_por_codigo(p_codigo text)
RETURNS TABLE (nombre text)
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_organizacion_id uuid;
BEGIN
  SELECT organizacion_id INTO v_organizacion_id
  FROM invitaciones_individuales
  WHERE codigo = p_codigo AND activa;

  IF v_organizacion_id IS NULL THEN
    RAISE EXCEPTION 'código de invitación inválido o inactivo';
  END IF;

  RETURN QUERY
  SELECT a.nombre FROM areas_organizacion a
  WHERE a.organizacion_id = v_organizacion_id
  ORDER BY a.nombre;
END;
$$;

GRANT EXECUTE ON FUNCTION areas_por_codigo(text) TO anon;


-- ══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════

-- Debe devolver 3 filas.
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('resumen_organizacion_completo', 'crear_organizacion', 'areas_por_codigo');

-- Prueba manual 1 (con un usuario autenticado real, no service_role):
-- SELECT crear_organizacion('Organización de prueba 2', 25, 'servicios_prof',
--   ARRAY['Operaciones','Recursos Humanos','Ventas'], 60000000, 20.0, 6.0,
--   '[
--     {"rol":"directivo_responsable","nombre":"Carlos Ruiz","cargo":"Director General","email":"carlos@ejemplo.com","telefono":"3009876543"},
--     {"rol":"coordinador","nombre":"Ana Pérez","cargo":"Gerente de RRHH","email":"ana@ejemplo.com","telefono":"3001234567"},
--     {"rol":"comite_supervision","nombre":"Luis Gómez","cargo":"Jefe de Operaciones"},
--     {"rol":"comite_supervision","nombre":"María Torres","cargo":"Jefa Financiera"}
--   ]'::jsonb
-- );
-- Debe devolver un uuid nuevo. Confirmar después:
--   SELECT * FROM areas_organizacion WHERE organizacion_id = '<ese uuid>';       -- 3 filas
--   SELECT rol, nombre FROM contactos_organizacion WHERE organizacion_id = '<ese uuid>'
--     ORDER BY rol;                                                              -- 4 filas: 1 directivo_responsable,
--                                                                                 -- 1 coordinador, 2 comite_supervision
--   SELECT * FROM consultor_organizacion WHERE organizacion_id = '<ese uuid>';   -- 1 fila, el consultor que llamó

-- Prueba manual 2 (rol anon, con un código de invitación real de la
-- organización de prueba original — la que existía antes de esta
-- migración): probablemente devuelve 0 filas, no un error — esa
-- organización no tiene areas_organizacion todavía porque se creó antes
-- de que la tabla existiera. Hay que insertarle áreas a mano (Table
-- Editor) para que cuestionario.html/sdmo.html le muestren un selector
-- con opciones — ver nota en el mensaje de respuesta.
-- SELECT * FROM areas_por_codigo('<código real>');
