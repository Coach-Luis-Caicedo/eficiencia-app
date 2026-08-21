-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 015: motor de cálculo del CFF + wiring de los
-- 2 puntos de disparo del snapshot (cff_historial)
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- ── Costo_desenganche — DESVIACIÓN DELIBERADA del prompt original,
-- señalada explícitamente para confirmación de Luis ──
-- El prompt que pidió esta función proponía:
--   Costo_desenganche = N × f_legal(país, antigüedad_promedio, Salario_promedio) × (IAO_org/100)
-- Esta migración NO implementa esa fórmula. Se mantiene la ya aprobada
-- en el marco (sección 8): N × Salario_promedio × 0.26 × (IAO_org/100)
-- — benchmark global Gallup de desenganche.
--
-- Razón: "desenganche" (Gallup — empleados que se quedan pero están
-- psicológicamente desconectados) y "desvinculación legal" (costo de
-- indemnizar a quien se va, Art. 64 CST) son conceptos distintos en el
-- marco. La fórmula legal ya investigada
-- (INVESTIGACION_COSTO_LEGAL_DESVINCULACION_LATAM.md) es, por diseño,
-- una pieza de la fricción oculta dentro de Costo_rotación — la propia
-- investigación de Colombia ya lo dice: la indemnización legal es "solo
-- 15%-25% del costo real de reemplazo" (Latin Human Capital), es decir,
-- una FRACCIÓN de Costo_rotación, no un sustituto de Costo_desenganche.
-- Usarla para reemplazar el 0.26 mediría un fenómeno distinto bajo el
-- mismo nombre. Queda pendiente de confirmación explícita con Luis —
-- no se decide en silencio (mismo criterio ya aplicado a
-- Multiplicador_rol y umbral_piso en turnos anteriores).
--
-- ── Arquitectura del snapshot (cff_historial, migración 014) ──
-- Núcleo puro: _calcular_cff_interno(organizacion_id, periodo, iao_org,
-- iao_n_suficiente) — recibe el IAO_org YA CALCULADO (no lo calcula él
-- mismo) para evitar recursión: resumen_organizacion_completo() ya
-- calcula IAO_org y llama a esta función al final; si esta función
-- llamara de vuelta a resumen_organizacion_completo() para obtener el
-- IAO, se generaría un ciclo. calcular_cff() (wrapper público) sí llama
-- a resumen_organizacion_completo() para resolver el IAO cuando se
-- invoca de forma independiente (fuera de la carga del Tablero).
--
-- Disparo 1 — nuevo diagnóstico (mismo punto donde ya se calcula
-- IAO_org): dentro de resumen_organizacion_completo(), después de
-- calcular v_resultado, solo cuando p_departamento IS NULL (el CFF es
-- de organización completa — los insumos de Ficha financiera no son
-- por área) y solo si iao_n_suficiente. Envuelto en BEGIN/EXCEPTION
-- para que un fallo del snapshot nunca rompa la carga del Tablero.
--
-- Disparo 2 — caso especial, edición de Ficha financiera: dentro de
-- actualizar_ficha_financiera(), después de guardar los campos, resuelve
-- el período más reciente con respuestas y busca si cff_historial YA
-- tiene una fila para ese período. Si la tiene, recalcula con el MISMO
-- iao_org_usado (no se recalcula el IAO — eso solo lo dispara un
-- diagnóstico nuevo) y sobrescribe. Si NO la tiene, no hace nada — editar
-- la ficha financiera sola nunca crea un punto nuevo en el historial
-- (decisión con Luis, 2026-08-19).
-- ══════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════
-- 1. _calcular_cff_interno — núcleo puro, sin GRANT a authenticated
--    (solo se llama desde otras funciones SECURITY DEFINER de este
--    archivo, nunca directo desde el cliente).
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION _calcular_cff_interno(
  p_organizacion_id  uuid,
  p_periodo          text,
  p_iao_org          numeric,
  p_iao_n_suficiente boolean
) RETURNS jsonb
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_org record;

  -- s_rot/s_aus/s_ret: sensibilidad al IAO — PROVISIONAL, SIN CALIBRAR
  -- (marco, sección 8 y 12) — s=1 para los tres, mismo criterio que
  -- w_neg/γ/causa_margen.
  v_s_rot CONSTANT numeric := 1;
  v_s_aus CONSTANT numeric := 1;
  v_s_ret CONSTANT numeric := 1;

  -- Colombia único país soportado hoy (organizaciones.pais, migración
  -- 011) — cuando se agreguen los de Fase 2, esta constante necesita
  -- su propia entrada por país (marco, sección 8, nota de
  -- dias_laborales_año).
  v_dias_laborales_anio CONSTANT numeric := 242;

  v_tasa_ausentismo        numeric;
  v_tasa_ausentismo_fuente text;
  v_tasa_retrabajo         numeric;
  v_tasa_retrabajo_fuente  text;

  v_desenganche         numeric;
  v_desenganche_incluido boolean;
  v_desenganche_razon    text;

  v_rotacion          numeric;
  v_rotacion_incluido  boolean;
  v_rotacion_razon     text;

  v_ausentismo         numeric;
  v_ausentismo_incluido boolean;
  v_ausentismo_razon    text;

  v_retrabajo          numeric;
  v_retrabajo_incluido  boolean;
  v_retrabajo_razon     text;

  v_total     numeric;
  v_detalle   jsonb;
  v_resultado jsonb;
BEGIN
  SELECT * INTO v_org FROM organizaciones WHERE id = p_organizacion_id;

  -- Sin IAO_org suficiente (N<8), ningún componente es calculable — los
  -- 4 lo usan como multiplicador (1 + s×IAO_org/100) o (IAO_org/100).
  IF NOT COALESCE(p_iao_n_suficiente, false) OR p_iao_org IS NULL THEN
    v_detalle := jsonb_build_object(
      'desenganche', jsonb_build_object('incluido', false, 'razon', 'IAO_org insuficiente (N<8) para este período'),
      'rotacion',    jsonb_build_object('incluido', false, 'razon', 'IAO_org insuficiente (N<8) para este período'),
      'ausentismo',  jsonb_build_object('incluido', false, 'razon', 'IAO_org insuficiente (N<8) para este período'),
      'retrabajo',   jsonb_build_object('incluido', false, 'razon', 'IAO_org insuficiente (N<8) para este período')
    );
    INSERT INTO cff_historial (organizacion_id, periodo, iao_org_usado, costo_desenganche, costo_rotacion, costo_ausentismo, costo_retrabajo, costo_total, detalle)
    VALUES (p_organizacion_id, p_periodo, NULL, NULL, NULL, NULL, NULL, NULL, v_detalle)
    ON CONFLICT (organizacion_id, periodo) DO UPDATE SET
      iao_org_usado = NULL, costo_desenganche = NULL, costo_rotacion = NULL,
      costo_ausentismo = NULL, costo_retrabajo = NULL, costo_total = NULL,
      detalle = v_detalle, calculado_en = now()
    RETURNING jsonb_build_object(
      'organizacion_id', organizacion_id, 'periodo', periodo, 'iao_org_usado', iao_org_usado,
      'costo_desenganche', costo_desenganche, 'costo_rotacion', costo_rotacion,
      'costo_ausentismo', costo_ausentismo, 'costo_retrabajo', costo_retrabajo,
      'costo_total', costo_total, 'detalle', detalle, 'calculado_en', calculado_en
    ) INTO v_resultado;
    RETURN v_resultado;
  END IF;

  -- ── Costo_desenganche = N × Salario_promedio × 0.26 × (IAO_org/100)
  -- Benchmark global Gallup (marco, sección 8) — ver nota de cabecera,
  -- desviación deliberada del prompt original, pendiente de confirmar.
  IF v_org.n_empleados IS NOT NULL AND v_org.salario_promedio IS NOT NULL THEN
    v_desenganche := v_org.n_empleados * v_org.salario_promedio * 0.26 * (p_iao_org / 100);
    v_desenganche_incluido := true;
    v_desenganche_razon := 'Calculado con salario promedio real';
  ELSE
    v_desenganche := NULL;
    v_desenganche_incluido := false;
    v_desenganche_razon := 'Falta salario promedio';
  END IF;

  -- ── Costo_rotación = N × TasaRotaciónBase_cliente × (1+s_rot×IAO_org/100) × Salario_promedio × Multiplicador_rol
  -- tasa_rotacion_base se guarda en puntos porcentuales (0-100, migración
  -- 005) — se divide entre 100 aquí para usarla como fracción.
  IF v_org.n_empleados IS NOT NULL AND v_org.tasa_rotacion_base IS NOT NULL
     AND v_org.salario_promedio IS NOT NULL AND v_org.multiplicador_rol IS NOT NULL THEN
    v_rotacion := v_org.n_empleados
                  * (v_org.tasa_rotacion_base / 100)
                  * (1 + v_s_rot * p_iao_org / 100)
                  * v_org.salario_promedio
                  * v_org.multiplicador_rol;
    v_rotacion_incluido := true;
    v_rotacion_razon := 'Calculado con tasa de rotación y multiplicador de rol reales';
  ELSE
    v_rotacion := NULL;
    v_rotacion_incluido := false;
    v_rotacion_razon := 'Falta ' || concat_ws(', ',
      CASE WHEN v_org.tasa_rotacion_base IS NULL THEN 'tasa de rotación base' END,
      CASE WHEN v_org.salario_promedio IS NULL THEN 'salario promedio' END,
      CASE WHEN v_org.multiplicador_rol IS NULL THEN 'multiplicador de rol' END
    );
  END IF;

  -- ── Costo_ausentismo — TasaAusentismo con prioridad de 3 niveles
  -- (marco, sección 8): dato real > benchmark país (EALI 2024 Colombia,
  -- ya reemplaza al rango genérico como respaldo) > benchmark genérico
  -- internacional (solo si el país del cliente no tiene benchmark
  -- propio — hoy inalcanzable, pais siempre 'colombia').
  IF v_org.dias_ausencia_base IS NOT NULL THEN
    v_tasa_ausentismo := v_org.dias_ausencia_base / v_dias_laborales_anio;
    v_tasa_ausentismo_fuente := 'dato real del cliente';
  ELSIF v_org.pais = 'colombia' THEN
    v_tasa_ausentismo := 9.4 / v_dias_laborales_anio;  -- EALI 2024, CESLA-ANDI
    v_tasa_ausentismo_fuente := 'benchmark Colombia (EALI 2024)';
  ELSE
    v_tasa_ausentismo := 0.0145;  -- punto medio 0.010-0.019 — rama hoy inalcanzable (solo existe 'colombia')
    v_tasa_ausentismo_fuente := 'benchmark genérico internacional (sin especificidad regional)';
  END IF;

  IF v_org.n_empleados IS NOT NULL AND v_org.salario_promedio IS NOT NULL THEN
    v_ausentismo := v_org.n_empleados * v_org.salario_promedio * v_tasa_ausentismo * (1 + v_s_aus * p_iao_org / 100);
    v_ausentismo_incluido := true;
    v_ausentismo_razon := 'Calculado — tasa de ausentismo: ' || v_tasa_ausentismo_fuente;
  ELSE
    v_ausentismo := NULL;
    v_ausentismo_incluido := false;
    v_ausentismo_razon := 'Falta ' || concat_ws(', ',
      CASE WHEN v_org.n_empleados IS NULL THEN 'número de empleados' END,
      CASE WHEN v_org.salario_promedio IS NULL THEN 'salario promedio' END
    );
  END IF;

  -- ── Costo_retrabajo — TasaRetrabajo: dato real > benchmark manufactura.
  -- tasa_retrabajo_real se guarda en puntos porcentuales (0-100,
  -- migración 012) — se divide entre 100 aquí.
  IF v_org.tasa_retrabajo_real IS NOT NULL THEN
    v_tasa_retrabajo := v_org.tasa_retrabajo_real / 100;
    v_tasa_retrabajo_fuente := 'dato real del cliente';
  ELSE
    v_tasa_retrabajo := 0.10;  -- punto medio del rango 0.05-0.15 (benchmark de manufactura, marco sección 8)
    v_tasa_retrabajo_fuente := 'benchmark de manufactura (5%-15%)';
  END IF;

  IF v_org.costo_operativo_total IS NOT NULL THEN
    v_retrabajo := v_org.costo_operativo_total * v_tasa_retrabajo * (1 + v_s_ret * p_iao_org / 100);
    v_retrabajo_incluido := true;
    v_retrabajo_razon := 'Calculado — tasa de retrabajo: ' || v_tasa_retrabajo_fuente;
  ELSE
    v_retrabajo := NULL;
    v_retrabajo_incluido := false;
    v_retrabajo_razon := 'Falta costo operativo total — componente omitido, no estimado con benchmark (marco, sección 8)';
  END IF;

  v_total := CASE
    WHEN NOT v_desenganche_incluido AND NOT v_rotacion_incluido AND NOT v_ausentismo_incluido AND NOT v_retrabajo_incluido
      THEN NULL
    ELSE COALESCE(v_desenganche,0) + COALESCE(v_rotacion,0) + COALESCE(v_ausentismo,0) + COALESCE(v_retrabajo,0)
  END;

  v_detalle := jsonb_build_object(
    'desenganche', jsonb_build_object('incluido', v_desenganche_incluido, 'razon', v_desenganche_razon),
    'rotacion',    jsonb_build_object('incluido', v_rotacion_incluido, 'razon', v_rotacion_razon),
    'ausentismo',  jsonb_build_object('incluido', v_ausentismo_incluido, 'razon', v_ausentismo_razon),
    'retrabajo',   jsonb_build_object('incluido', v_retrabajo_incluido, 'razon', v_retrabajo_razon)
  );

  INSERT INTO cff_historial (organizacion_id, periodo, iao_org_usado, costo_desenganche, costo_rotacion, costo_ausentismo, costo_retrabajo, costo_total, detalle)
  VALUES (p_organizacion_id, p_periodo, p_iao_org, v_desenganche, v_rotacion, v_ausentismo, v_retrabajo, v_total, v_detalle)
  ON CONFLICT (organizacion_id, periodo) DO UPDATE SET
    iao_org_usado     = EXCLUDED.iao_org_usado,
    costo_desenganche = EXCLUDED.costo_desenganche,
    costo_rotacion    = EXCLUDED.costo_rotacion,
    costo_ausentismo  = EXCLUDED.costo_ausentismo,
    costo_retrabajo   = EXCLUDED.costo_retrabajo,
    costo_total       = EXCLUDED.costo_total,
    detalle           = EXCLUDED.detalle,
    calculado_en      = now()
  RETURNING jsonb_build_object(
    'organizacion_id', organizacion_id, 'periodo', periodo, 'iao_org_usado', iao_org_usado,
    'costo_desenganche', costo_desenganche, 'costo_rotacion', costo_rotacion,
    'costo_ausentismo', costo_ausentismo, 'costo_retrabajo', costo_retrabajo,
    'costo_total', costo_total, 'detalle', detalle, 'calculado_en', calculado_en
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$$;


-- ══════════════════════════════════════════════════════════════════
-- 2. calcular_cff — wrapper público. Resuelve IAO_org llamando a
--    resumen_organizacion_completo() (fuera de su propio flujo, así que
--    no hay recursión) y delega el cálculo a _calcular_cff_interno.
--    Para uso independiente (ej. un futuro botón "recalcular CFF" en el
--    tab CFF del Tablero) — el disparo automático real es el Disparo 1
--    de abajo, dentro de resumen_organizacion_completo().
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION calcular_cff(
  p_organizacion_id uuid,
  p_periodo         text DEFAULT NULL
) RETURNS jsonb
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_resumen          jsonb;
  v_periodo          text;
  v_iao              numeric;
  v_iao_n_suficiente boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE organizacion_id = p_organizacion_id AND consultor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'no autorizado para esta organización';
  END IF;

  v_resumen := resumen_organizacion_completo(p_organizacion_id, NULL, p_periodo);
  v_periodo := v_resumen->>'periodo';
  v_iao := (v_resumen->>'iao')::numeric;
  v_iao_n_suficiente := (v_resumen->>'iao_n_suficiente')::boolean;

  IF v_periodo IS NULL THEN
    RAISE EXCEPTION 'la organización no tiene ningún período con respuestas todavía';
  END IF;

  RETURN _calcular_cff_interno(p_organizacion_id, v_periodo, v_iao, v_iao_n_suficiente);
END;
$$;

GRANT EXECUTE ON FUNCTION calcular_cff(uuid, text) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- 3. resumen_organizacion_completo — sin cambios de lógica de negocio
--    respecto a la migración 013, solo se agrega el Disparo 1 al final
--    (antes de RETURN). CREATE OR REPLACE exige el cuerpo completo.
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
  v_umbral_piso       CONSTANT numeric := 0.575;
  v_alpha_brecha      CONSTANT numeric := 0.5;
  v_tendencia_umbral  CONSTANT numeric := 2;
  v_n_minimo          CONSTANT int     := 8;
  v_causa_margen      CONSTANT numeric := 0.15;

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

  -- ── Disparo 1: snapshot del CFF al completarse un diagnóstico nuevo ──
  -- Solo a nivel organización completa (nunca por área — Ficha
  -- financiera no tiene insumos por departamento). Un fallo aquí nunca
  -- debe romper la carga del Tablero.
  IF p_departamento IS NULL AND v_periodo IS NOT NULL THEN
    BEGIN
      PERFORM _calcular_cff_interno(
        p_organizacion_id, v_periodo,
        (v_resultado->>'iao')::numeric,
        (v_resultado->>'iao_n_suficiente')::boolean
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN v_resultado;
END;
$$;

GRANT EXECUTE ON FUNCTION resumen_organizacion_completo(uuid, text, text, int) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- 4. actualizar_ficha_financiera — agrega p_multiplicador_rol al final
--    (CREATE OR REPLACE alcanza, mismo criterio que la migración 012)
--    + Disparo 2 (caso especial de recalculo) al final del cuerpo.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION actualizar_ficha_financiera(
  p_organizacion_id       uuid,
  p_pais                  text,
  p_salario_promedio      numeric DEFAULT NULL,
  p_tasa_rotacion_base    numeric DEFAULT NULL,
  p_dias_ausencia_base    numeric DEFAULT NULL,
  p_costo_operativo_total numeric DEFAULT NULL,
  p_costo_intervencion    numeric DEFAULT NULL,
  p_ebitda                numeric DEFAULT NULL,
  p_tasa_retrabajo_real   numeric DEFAULT NULL,
  p_multiplicador_rol     numeric DEFAULT NULL
) RETURNS void
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_periodo_actual text;
  v_iao_existente  numeric;
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

  IF p_multiplicador_rol IS NOT NULL AND p_multiplicador_rol NOT IN (0.30, 0.50, 0.70) THEN
    RAISE EXCEPTION 'multiplicador de rol inválido — debe ser 0.30 (operativo), 0.50 (medio) o 0.70 (directivo)';
  END IF;

  UPDATE organizaciones SET
    pais                  = p_pais,
    salario_promedio      = p_salario_promedio,
    tasa_rotacion_base    = p_tasa_rotacion_base,
    dias_ausencia_base    = p_dias_ausencia_base,
    costo_operativo_total = p_costo_operativo_total,
    costo_intervencion    = p_costo_intervencion,
    ebitda                = p_ebitda,
    tasa_retrabajo_real   = p_tasa_retrabajo_real,
    multiplicador_rol     = p_multiplicador_rol
  WHERE id = p_organizacion_id;

  -- ── Disparo 2: caso especial — editar Ficha financiera NUNCA crea un
  -- punto nuevo en cff_historial, solo recalcula uno que ya existía
  -- para el período actual (mismo iao_org_usado, insumos financieros
  -- nuevos). Sin snapshot previo para el período actual, no hace nada.
  SELECT periodo INTO v_periodo_actual
  FROM respuestas_cuestionario
  WHERE organizacion_id = p_organizacion_id
  ORDER BY periodo DESC
  LIMIT 1;

  IF v_periodo_actual IS NOT NULL THEN
    SELECT iao_org_usado INTO v_iao_existente
    FROM cff_historial
    WHERE organizacion_id = p_organizacion_id AND periodo = v_periodo_actual;

    IF FOUND THEN
      BEGIN
        PERFORM _calcular_cff_interno(p_organizacion_id, v_periodo_actual, v_iao_existente, v_iao_existente IS NOT NULL);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION actualizar_ficha_financiera(uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════

-- Debe devolver 3 filas
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name IN ('_calcular_cff_interno', 'calcular_cff', 'resumen_organizacion_completo');

-- Prueba manual (organización con diagnóstico ya cargado, N≥8 en el
-- período más reciente):
-- SELECT resumen_organizacion_completo('<org_id>');  -- dispara el snapshot
-- SELECT * FROM cff_historial WHERE organizacion_id = '<org_id>';  -- debe existir 1 fila para ese período

-- Prueba manual del caso especial: editar la ficha financiera después
-- (ej. cambiar salario_promedio) y confirmar que cff_historial sigue
-- teniendo UNA sola fila para ese período (recalculada, no duplicada),
-- con calculado_en más reciente y costo_desenganche distinto si el
-- salario cambió.
