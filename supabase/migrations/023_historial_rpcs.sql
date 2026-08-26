-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 023: RPCs de solo-lectura para el tab "Historial"
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- Diseño discutido y aprobado con Luis — ver
-- C:\Users\Luis Caicedo\.claude\plans\shimmying-skipping-lark.md,
-- Parte 2, sección 2.6. Depende de _periodo_a_clave_ordenable()
-- (migración 022) — debe aplicarse después de esa migración.
--
-- 2 funciones, ambas de solo-lectura, no estrictamente necesarias por
-- RLS (que ya permite SELECT al consultor vinculado en cff_historial y
-- calibracion_observaciones) — se agregan para devolver los datos ya
-- ordenados/formados como jsonb, mismo idioma que cargarCFF()/cargarIFT()
-- del frontend (RPCs "shape-ready", no queries crudas desde el cliente).
--
-- ── Decisión explícita sobre "dirección" (confirmada con Luis, 2026-08-26) ──
-- historial_cff() clasifica dirección de IAO/costo_total SOLO por el
-- signo del delta (mejora/empeora/estable) — SIN banda de significancia.
-- resumen_organizacion_completo() (migración 002) sí usa un umbral real
-- (v_tendencia_umbral=2 puntos de IDA) para esa misma clasificación
-- conceptual — no se copia ese número acá porque es de otro contexto
-- (IDA, no IAO/costo) y no hay todavía historial real de esta organización
-- para calibrar uno propio. Esto es DELIBERADAMENTE provisional, mismo
-- tratamiento que delta_ida/s_sup en la migración 020 (documentado como
-- gap, no como olvido). Revisar con un umbral real informado por datos
-- propios cuando exista suficiente historial — mismo criterio de "≥3
-- períodos reales" ya establecido para el auto-fit de s_rot/s_aus/s_ret
-- (Anexo 1 del plan de diseño de la migración 020).
-- ══════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════
-- 1. historial_cff() — Sección A del tab Historial: tendencia IAO/CFF real.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION historial_cff(p_organizacion_id uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_serie          jsonb;
  v_n              int;
  v_iao_actual     numeric;
  v_iao_anterior   numeric;
  v_costo_actual   numeric;
  v_costo_anterior numeric;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE organizacion_id = p_organizacion_id AND consultor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'no autorizado para esta organización';
  END IF;

  SELECT
    jsonb_agg(jsonb_build_object('periodo', periodo, 'iao_org_usado', iao_org_usado, 'costo_total', costo_total) ORDER BY _periodo_a_clave_ordenable(periodo)),
    count(*)
  INTO v_serie, v_n
  FROM cff_historial
  WHERE organizacion_id = p_organizacion_id;

  v_serie := COALESCE(v_serie, '[]'::jsonb);
  v_n := COALESCE(v_n, 0);

  IF v_n >= 1 THEN
    SELECT iao_org_usado, costo_total INTO v_iao_actual, v_costo_actual
    FROM cff_historial WHERE organizacion_id = p_organizacion_id
    ORDER BY _periodo_a_clave_ordenable(periodo) DESC LIMIT 1;
  END IF;

  IF v_n >= 2 THEN
    SELECT iao_org_usado, costo_total INTO v_iao_anterior, v_costo_anterior
    FROM cff_historial WHERE organizacion_id = p_organizacion_id
    ORDER BY _periodo_a_clave_ordenable(periodo) DESC OFFSET 1 LIMIT 1;
  END IF;

  -- IAO y costo_total comparten la misma convención "menor es mejor"
  -- (el IFT proyecta reducir el IAO como la meta, marco §8.2; menor
  -- costo_total es directamente menos costo de fricción) — misma
  -- dirección de comparación para ambos, sin invertir el signo entre uno y otro.
  RETURN jsonb_build_object(
    'disponible', v_n >= 2,
    'n_periodos', v_n,
    'serie', v_serie,
    'iao', jsonb_build_object(
      'actual', v_iao_actual,
      'anterior', v_iao_anterior,
      'delta', CASE WHEN v_iao_anterior IS NOT NULL THEN v_iao_actual - v_iao_anterior ELSE NULL END,
      'direccion', CASE
        WHEN v_iao_anterior IS NULL THEN NULL
        WHEN v_iao_actual < v_iao_anterior THEN 'mejora'
        WHEN v_iao_actual > v_iao_anterior THEN 'empeora'
        ELSE 'estable'
      END
    ),
    'costo_total', jsonb_build_object(
      'actual', v_costo_actual,
      'anterior', v_costo_anterior,
      'delta', CASE WHEN v_costo_anterior IS NOT NULL THEN v_costo_actual - v_costo_anterior ELSE NULL END,
      'direccion', CASE
        WHEN v_costo_anterior IS NULL THEN NULL
        WHEN v_costo_actual < v_costo_anterior THEN 'mejora'
        WHEN v_costo_actual > v_costo_anterior THEN 'empeora'
        ELSE 'estable'
      END
    )
  );
END;
$$;

COMMENT ON FUNCTION historial_cff(uuid) IS
  'Sección A del tab Historial. "direccion" es SOLO signo del delta (mejora/empeora/estable), '
  'sin banda de significancia — provisional, confirmado con Luis 2026-08-26. Revisar con umbral '
  'real cuando exista suficiente historial propio (mismo criterio de ≥3 períodos del Anexo 1 '
  'de la migración 020).';

GRANT EXECUTE ON FUNCTION historial_cff(uuid) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- 2. historial_seguimiento_mensual() — Sección B del tab Historial:
--    tendencia de los 8 KPIs. Sin "dirección" — a diferencia de
--    historial_cff(), el plan (sección 2.6) solo pide actual/anterior/
--    delta para estos 8, no una clasificación mejora/empeora (las
--    unidades y el sentido "más es mejor" vs. "menos es mejor" difieren
--    por KPI — ej. productividad vs. accidentalidad — y no está
--    definido acá; no se infiere sin decisión explícita).
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION historial_seguimiento_mensual(p_organizacion_id uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_parametros text[] := ARRAY[
    'salario_promedio_real','tasa_rotacion_base_real','tasa_ausentismo_real',
    'costo_operativo_total_real','tasa_retrabajo_observada',
    'productividad','accidentalidad','presentismo'
  ];
  v_parametro  text;
  v_serie      jsonb;
  v_n          int;
  v_actual     numeric;
  v_anterior   numeric;
  v_resultado  jsonb := '{}'::jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE organizacion_id = p_organizacion_id AND consultor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'no autorizado para esta organización';
  END IF;

  FOREACH v_parametro IN ARRAY v_parametros LOOP
    SELECT
      jsonb_agg(jsonb_build_object('periodo', periodo, 'valor', valor_observado) ORDER BY _periodo_a_clave_ordenable(periodo)),
      count(*)
    INTO v_serie, v_n
    FROM calibracion_observaciones
    WHERE organizacion_id = p_organizacion_id AND parametro = v_parametro;

    v_serie := COALESCE(v_serie, '[]'::jsonb);
    v_n := COALESCE(v_n, 0);
    v_actual := NULL;
    v_anterior := NULL;

    IF v_n >= 1 THEN
      SELECT valor_observado INTO v_actual
      FROM calibracion_observaciones
      WHERE organizacion_id = p_organizacion_id AND parametro = v_parametro
      ORDER BY _periodo_a_clave_ordenable(periodo) DESC LIMIT 1;
    END IF;

    IF v_n >= 2 THEN
      SELECT valor_observado INTO v_anterior
      FROM calibracion_observaciones
      WHERE organizacion_id = p_organizacion_id AND parametro = v_parametro
      ORDER BY _periodo_a_clave_ordenable(periodo) DESC OFFSET 1 LIMIT 1;
    END IF;

    v_resultado := v_resultado || jsonb_build_object(
      v_parametro, jsonb_build_object(
        'serie', v_serie,
        'n_periodos', v_n,
        'actual', v_actual,
        'anterior', v_anterior,
        'delta', CASE WHEN v_anterior IS NOT NULL THEN v_actual - v_anterior ELSE NULL END,
        'disponible', v_n >= 1
      )
    );
  END LOOP;

  RETURN v_resultado;
END;
$$;

COMMENT ON FUNCTION historial_seguimiento_mensual(uuid) IS
  'Sección B del tab Historial — actual/anterior/delta por cada uno de los 8 KPIs del panel '
  'Seguimiento mensual. Las 8 claves del objeto de retorno siempre están presentes (n_periodos=0, '
  'disponible=false, serie=[] para los que aún no tienen ninguna observación) — el frontend no '
  'necesita chequear existencia de clave, solo el flag disponible.';

GRANT EXECUTE ON FUNCTION historial_seguimiento_mensual(uuid) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════

-- 1. Con la organización de prueba (hoy 1 solo período real en cff_historial):
-- SELECT historial_cff('<uuid_org_prueba>');
-- -- Esperado: disponible=false, n_periodos=1, serie con 1 elemento, iao/costo_total
-- -- con anterior=NULL, delta=NULL, direccion=NULL.

-- 2. La rama n>=2 (disponible=true, delta/direccion reales) NO se verifica fabricando
-- un 2do período de prueba — es estructuralmente idéntica al patrón "ORDER BY ...DESC
-- OFFSET 1 LIMIT 1" ya verificado en otros lugares del sistema, se da por confiable
-- con revisión de código. Queda pendiente de verificación en vivo el día que exista
-- un segundo diagnóstico real de alguna organización — mismo criterio que el fit de
-- λ (migración 020).

-- 3. SELECT historial_seguimiento_mensual('<uuid_org_prueba>');
-- -- Esperado: objeto con las 8 claves siempre presentes. Las que no tengan
-- -- observaciones capturadas todavía → disponible=false, serie=[], actual=NULL.

-- 4. RLS/autorización — como consultor SIN vínculo a la organización de prueba,
-- ambas funciones deben lanzar 'no autorizado para esta organización'.
