-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 013: umbral_piso de 0.5 (sin respaldo) a 0.575
-- (prior informado por dos anclajes externos)
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- Decisión tomada con Luis, 2026-08-19: umbral_piso sube de 0.5 a
-- 0.575 — punto medio entre dos anclajes externos de psicología
-- clínica/ocupacional, documentados en `INVESTIGACION_ANCLAJE_UMBRAL_
-- PISO.md` y en la sección 12 del marco (lista de parámetros
-- calibrables):
--
--   1. WHO-5 Well-Being Index — corte de cribado validado
--      meta-analíticamente en ≤50/100 (0.50 normalizado a escala 0-1),
--      sensibilidad 0.86 / especificidad 0.81 agregadas. Mide bienestar
--      subjetivo general — misma dirección que Concepto_B (alto =
--      mejor), pero constructo clínico general, no organizacional.
--   2. Maslach Burnout Inventory — subescalas de Realización
--      personal/Eficacia profesional (MBI-HSS y MBI-GS, dos versiones
--      independientes del instrumento) convergiendo en ≈0.64-0.65
--      normalizado. Específico de agotamiento laboral, más cercano al
--      contexto ocupacional, pero no generaliza directamente a las 10
--      dimensiones de Concepto_B.
--
-- Ninguno de los dos anclajes es suficiente por sí solo — el punto medio
-- (0.575) es la mejor aproximación disponible sin sobreajustar a un
-- solo instrumento, no una derivación estadística de ninguno de los
-- dos. Sigue siendo un PRIOR, no un valor calibrado con datos reales de
-- EFICIENCIA — mismo mecanismo bayesiano de la sección 12 del marco
-- (se actualiza automáticamente conforme se acumulan meses de datos del
-- piloto, w=min(1,n/12)); lo único que cambia aquí es que el prior de
-- partida ya no es arbitrario, está informado por evidencia externa.
--
-- Resto de la función sin cambios de lógica respecto a la migración 010
-- (mismas decisiones de diseño documentadas en 002/007/010) —
-- CREATE OR REPLACE exige el cuerpo completo, no un parche.
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
  v_umbral_piso       CONSTANT numeric := 0.575;  -- antes 0.5 (migraciones 002/007/010), sin respaldo — ver nota arriba y marco sección 12
  v_alpha_brecha      CONSTANT numeric := 0.5;
  v_tendencia_umbral  CONSTANT numeric := 2;
  v_n_minimo          CONSTANT int     := 8;
  v_causa_margen      CONSTANT numeric := 0.15;  -- margen relativo para 'mixta' en causa_dominante — PROVISIONAL, SIN CALIBRAR (ver marco sección 12)

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
      GREATEST(brecha_final_i, 0) * v_w_pos + GREATEST(-brecha_final_i, 0) * v_w_neg AS term_incongruencia_i,
      GREATEST(0, v_umbral_piso - concepto_b) AS term_piso_i,
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
      ) AS amenaza_par,
      (v_gamma_iao * avg(term_incongruencia_i)
        + (1 - v_gamma_iao) * (array_agg(term_incongruencia_i ORDER BY term_incongruencia_i DESC))[2]
      ) AS term_incongruencia_agg,
      (v_gamma_iao * avg(term_piso_i)
        + (1 - v_gamma_iao) * (array_agg(term_piso_i ORDER BY term_piso_i DESC))[2]
      ) AS term_piso_agg
    FROM individual_amenaza_par
    GROUP BY par
  ),
  causa_out AS (
    SELECT
      par,
      CASE
        WHEN term_incongruencia_agg = 0 AND term_piso_agg = 0 THEN 'mixta'
        WHEN term_incongruencia_agg > term_piso_agg
             AND (term_incongruencia_agg - term_piso_agg) > v_causa_margen * GREATEST(term_incongruencia_agg, term_piso_agg)
          THEN 'incongruencia'
        WHEN term_piso_agg > term_incongruencia_agg
             AND (term_piso_agg - term_incongruencia_agg) > v_causa_margen * GREATEST(term_incongruencia_agg, term_piso_agg)
          THEN 'piso'
        ELSE 'mixta'
      END AS causa_dominante
    FROM par_amenaza_out
  ),

  pares_out AS (
    SELECT
      f.par, f.n, f.n_suficiente,
      CASE WHEN f.n_suficiente THEN f.concepto_a_prom ELSE NULL END AS concepto_a_prom,
      CASE WHEN f.n_suficiente THEN f.concepto_b_prom ELSE NULL END AS concepto_b_prom,
      CASE WHEN f.n_suficiente THEN f.bipolar_prom ELSE NULL END AS bipolar_prom,
      CASE WHEN f.n_suficiente THEN f.brecha_calculada ELSE NULL END AS brecha_calculada,
      CASE WHEN f.n_suficiente THEN f.brecha_final ELSE NULL END AS brecha_final,
      CASE WHEN f.n_suficiente THEN a.amenaza_par ELSE NULL END AS amenaza_par,
      CASE WHEN f.n_suficiente THEN c.causa_dominante ELSE NULL END AS causa_dominante
    FROM pares_final f
    JOIN par_amenaza_out a ON a.par = f.par
    JOIN causa_out c ON c.par = f.par
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
          'amenaza_par', amenaza_par,
          'causa_dominante', causa_dominante
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
      'n_minimo', v_n_minimo,
      'causa_margen', v_causa_margen
    )
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$$;

GRANT EXECUTE ON FUNCTION resumen_organizacion_completo(uuid, text, text, int) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════

-- Debe devolver 0.575 (antes 0.5)
-- SELECT resumen_organizacion_completo('<organizacion_id>'::uuid) -> 'parametros_usados' ->> 'umbral_piso';

-- El cambio de 0.5 a 0.575 sube el piso de amenaza absoluta — para una
-- organización ya diagnosticada, algunos pares que antes no activaban
-- Amenaza_absoluta_par (porque Concepto_B estaba entre 0.5 y 0.575)
-- ahora sí lo harán. Es un cambio esperado del parámetro, no un bug —
-- confirmar comparando 'amenaza_par' de un mismo par/organización antes
-- y después de aplicar esta migración, si hace falta verificar el
-- efecto en un caso real.
