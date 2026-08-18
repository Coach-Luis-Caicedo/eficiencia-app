-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 010: causa_dominante en el desglose por par
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- Problema que resuelve: el Workbook (_explicacionAmenazaPar,
-- workbook.html) intentaba adivinar cuál de los dos términos de
-- amenaza_par_i domina — incongruencia (brecha) vs. piso (Concepto_B
-- absoluto) — RECALCULANDO la fórmula individual sobre brecha_final y
-- concepto_b_prom, que son PROMEDIOS de organización. Como la fórmula
-- real usa GREATEST (un máximo) por individuo antes de agregar,
-- GREATEST(avg(x), avg(y)) ≠ avg(GREATEST(x,y)) — desigualdad de
-- Jensen — así que esa reconstrucción client-side podía (y en algunos
-- casos ya lo hacía, ver auditoría) atribuir la causa equivocada.
--
-- Esta migración mueve el cálculo al servidor, donde SÍ hay acceso
-- legítimo a los valores por individuo (individual_amenaza_par, que ya
-- existe en la función desde la migración 002 — no se crea tabla ni
-- acceso nuevo). Se agrega 'causa_dominante' al mismo objeto por par
-- que ya devuelve 'amenaza_par'.
--
-- ── Confidencialidad — por qué esto NO es un campo nuevo de riesgo ──
-- causa_dominante se agrega con la MISMA maquinaria estadística que
-- amenaza_par ya usa hoy: los dos términos (term_incongruencia_i,
-- term_piso_i) se agregan por separado con el idéntico esquema
-- γ/segundo_mayor (nunca el máximo individual — la razón de ser de
-- segundo_mayor en el diseño original es exactamente evitar que el
-- valor más extremo de una sola persona sea reconstruible desde el
-- agregado; term_incongruencia_agg/term_piso_agg heredan esa misma
-- protección sin modificarla). No se expone amenaza_par_i, brecha_final_i
-- ni concepto_b por individuo — sigue sin salir de la función.
--
-- El campo es una clasificación de 3 valores ('incongruencia' | 'piso'
-- | 'mixta'), gateada por el mismo n_suficiente (N≥8, marco 9.1) que ya
-- protege amenaza_par/brecha_final/concepto_b_prom en el mismo objeto.
-- No hay caso límite distinto en N=8 exacto: el gate aplica ANTES de
-- que causa_dominante llegue al cliente (CASE WHEN f.n_suficiente),
-- igual que los demás campos del par — con N<8 el campo sale NULL, sin
-- excepción ni umbral especial propio.
--
-- Tampoco es una fuga nueva en términos de qué se puede inferir: hoy
-- mismo brecha_final y concepto_b_prom (ambos ya expuestos) permiten a
-- cualquiera con el marco público (DOCUMENTO_MARCO_SISTEMA_EFICIENCIA.md,
-- fórmula de amenaza_par documentada ahí) intentar la misma atribución
-- de causa a mano — es justo lo que _explicacionAmenazaPar hacía
-- client-side. causa_dominante no cruza un límite de confidencialidad
-- nuevo: corrige con datos correctos (por individuo, agregados con
-- γ/segundo_mayor) una inferencia que ya era posible intentar con datos
-- peores (promedios de organización, con Jensen en contra). El techo de
-- lo que un observador externo puede deducir sobre la composición
-- interna del par no sube — solo se vuelve honesto en vez de adivinado.
--
-- 'mixta' cuando los dos términos agregados están dentro de
-- v_causa_margen (15%). PARÁMETRO PROVISIONAL, SIN CALIBRAR — mismo
-- tratamiento que γ/w_neg/umbral_piso/alpha_brecha (marco, sección 12,
-- "Mecanismo de calibración": motor bayesiano que absorbe todo parámetro
-- sin validar del documento). No es un valor elegido con datos, es un
-- punto de partida razonable; registrado en esa misma lista de la
-- sección 12 para que el mecanismo de calibración lo recoja junto con
-- los demás y no quede fuera del proceso. Queda como CONSTANT al inicio
-- de la función — cambiar solo aquí cuando llegue la calibración con
-- datos del piloto, igual que el resto.
--
-- El 15% también evita que una diferencia marginal cerca del empate se
-- lea como atribución definitiva, y reduce la superficie de un ataque
-- por diferencias (probar variaciones para encontrar el punto exacto
-- donde la etiqueta cambia) — pero ese es un beneficio de tener un
-- margen, no una justificación del valor 15% en sí, que sigue sin
-- calibrar.
--
-- Resto de la función sin cambios de lógica respecto a la migración 007
-- (mismas decisiones de diseño documentadas en 002) — CREATE OR REPLACE
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
  v_causa_margen      CONSTANT numeric := 0.15;  -- margen relativo para 'mixta' en causa_dominante — PROVISIONAL, SIN CALIBRAR (ver nota arriba y marco sección 12)

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
  -- term_incongruencia_i / term_piso_i quedan como columnas propias (antes
  -- solo vivían dentro del GREATEST de amenaza_par_i) para poder agregar
  -- cada término por separado en par_amenaza_out, con el mismo esquema
  -- γ/segundo_mayor que ya protegía amenaza_par_i — ver nota de
  -- confidencialidad arriba.
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
-- SELECT resumen_organizacion_completo('<organizacion_id>'::uuid) -> 'pares';
-- Confirmar que cada elemento de 'pares' trae 'causa_dominante' en
-- {'incongruencia','piso','mixta',null} — null solo cuando n_suficiente
-- es false, igual que brecha_final/amenaza_par en la misma fila.
