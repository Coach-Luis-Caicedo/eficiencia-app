-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 019: motor IFT (simular_ift) + campo de plan
-- de intervención (pct_reduccion_iao_target)
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- ── Contexto y diseño confirmado con Luis, 2026-08-22 ──
--
-- El IFT (marco, sección 8.2) necesita evaluar CFF(t) en ~37 puntos de
-- tiempo (t=0..36) con valores de IAO_org PROYECTADOS, no reales, para
-- calcular Valor_recuperado_acumulado(T) y T_rec. _calcular_cff_interno()
-- (migración 015) no sirve para esto tal cual: escribe incondicionalmente
-- en cff_historial en cada llamada (INSERT...ON CONFLICT(organizacion_id,
-- periodo) DO UPDATE, ambas ramas) — usarlo 37 veces sobrescribiría el
-- snapshot real del período actual repetidamente, o (con períodos
-- sintéticos) rompería la invariante "un punto por período real" que la
-- migración 014 documenta explícitamente.
--
-- Fix elegido (de las 2 opciones evaluadas): extraer el cálculo puro de
-- los 4 componentes a una función nueva, _calcular_cff_puro(), sin ningún
-- efecto secundario de escritura. _calcular_cff_interno() pasa a ser un
-- wrapper delgado: llama a _calcular_cff_puro() y hace el INSERT/UPDATE
-- con lo que devuelve. simular_ift() llama a _calcular_cff_puro()
-- directamente, nunca a _calcular_cff_interno() — el motor CFF real
-- queda con una sola fórmula fuente, sin duplicarla en un motor de
-- simulación paralelo (que era la otra opción, descartada).
--
-- IAO_0 del IFT se lee del cff_historial real más reciente (columna
-- iao_org_usado), NO se recalcula llamando a resumen_organizacion_
-- completo() — esa función dispara el Disparo 1 (snapshot real) como
-- efecto secundario (migración 015, líneas ~600-614), que sería un
-- efecto no deseado de correr una simulación. Coherente con la sección
-- 8.2 del marco: "IAO_0: medido, del cuestionario inicial real".
--
-- pct_reduccion_iao_target: nuevo campo en `organizaciones`, vive en
-- Ficha financiera (mismo panel que ya se describe a sí mismo como el
-- hogar de los insumos del IFT — el campo "Costo de intervención" ya
-- dice "Sin este dato, el IFT no puede proyectar"). Mismo patrón que
-- `multiplicador_rol` (migración 014): selector categórico de 3 valores
-- fijos, CHECK exacto, SIN guard — a diferencia de sector/país
-- (migración 018), esto es una decisión de plan de intervención que
-- puede revisarse legítimamente si el alcance del programa cambia a
-- mitad de camino, no un hecho estructural de una sola vez.
--
-- F_ext = 1 fijo, sin categorías — decisión ya cerrada e investigada
-- (VALIDACION_IFT_CASOS_REALES.md, sección 6, 2026-08-22): la fuente más
-- rigurosa disponible (Solinger et al. 2021, N=573 tamaños de efecto)
-- probó activamente si el tiempo modera el efecto y no encontró nada —
-- no hay evidencia para construir categorías, así que no se inventan.
--
-- ── actualizar_ficha_financiera() — DROP FUNCTION obligatorio, no basta
-- CREATE OR REPLACE ──
-- La migración 016 ya documentó la causa raíz de un bug real (PGRST203):
-- CREATE OR REPLACE solo reemplaza cuando la lista de TIPOS de parámetros
-- es idéntica; agregar un parámetro nuevo al final (aunque tenga DEFAULT)
-- crea una SOBRECARGA nueva que coexiste con la anterior, y PostgREST no
-- puede decidir cuál usar. Esta migración agrega p_pct_reduccion_iao_
-- target — mismo tipo de cambio que causó el bug de la 016 — así que
-- aquí SÍ se hace DROP FUNCTION explícito de la firma de 10 parámetros
-- (015/018) antes de crear la de 11. La migración 018 no tuvo este riesgo
-- porque no tocó la firma (mismos 10 parámetros, mismos tipos); esta sí
-- la cambia, y por eso no puede seguir ese mismo atajo.
-- ══════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════
-- 1. pct_reduccion_iao_target — columna nueva en organizaciones
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE organizaciones ADD COLUMN pct_reduccion_iao_target numeric
  CHECK (pct_reduccion_iao_target IS NULL OR pct_reduccion_iao_target IN (0.20, 0.40, 0.60));


-- ══════════════════════════════════════════════════════════════════
-- 2. _calcular_cff_puro() — núcleo puro extraído de _calcular_cff_interno
--    (migración 015), SIN escritura a cff_historial. Sin GRANT a
--    authenticated (mismo criterio que _calcular_cff_interno): solo se
--    llama desde otras funciones SECURITY DEFINER de este archivo.
--    Cuerpo de cálculo idéntico al de _calcular_cff_interno original —
--    ningún número ni fórmula cambia, solo se le quita el INSERT/UPDATE.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION _calcular_cff_puro(
  p_organizacion_id  uuid,
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
  -- 011) — cuando se agreguen los de Fase 2, esta constante necesita su
  -- propia entrada por país (marco, sección 8, nota de dias_laborales_año).
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
    RETURN jsonb_build_object(
      'iao_org_usado', NULL, 'costo_desenganche', NULL, 'costo_rotacion', NULL,
      'costo_ausentismo', NULL, 'costo_retrabajo', NULL, 'costo_total', NULL, 'detalle', v_detalle
    );
  END IF;

  -- ── Costo_desenganche = N × Salario_promedio × 0.26 × (IAO_org/100)
  -- Benchmark global Gallup (marco, sección 8).
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

  -- ── Costo_ausentismo — TasaAusentismo con prioridad de 3 niveles.
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

  RETURN jsonb_build_object(
    'iao_org_usado', p_iao_org, 'costo_desenganche', v_desenganche, 'costo_rotacion', v_rotacion,
    'costo_ausentismo', v_ausentismo, 'costo_retrabajo', v_retrabajo, 'costo_total', v_total, 'detalle', v_detalle
  );
END;
$$;


-- ══════════════════════════════════════════════════════════════════
-- 3. _calcular_cff_interno() — pasa a ser wrapper delgado sobre
--    _calcular_cff_puro(). Misma firma exacta (uuid, text, numeric,
--    boolean) que la migración 015 — CREATE OR REPLACE alcanza, sin
--    riesgo de sobrecarga (no cambia ningún tipo de parámetro). Mismo
--    comportamiento observable para resumen_organizacion_completo() y
--    actualizar_ficha_financiera(): ningún llamador existente cambia.
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
  v_puro      jsonb;
  v_resultado jsonb;
BEGIN
  v_puro := _calcular_cff_puro(p_organizacion_id, p_iao_org, p_iao_n_suficiente);

  INSERT INTO cff_historial (organizacion_id, periodo, iao_org_usado, costo_desenganche, costo_rotacion, costo_ausentismo, costo_retrabajo, costo_total, detalle)
  VALUES (
    p_organizacion_id, p_periodo,
    (v_puro->>'iao_org_usado')::numeric,
    (v_puro->>'costo_desenganche')::numeric,
    (v_puro->>'costo_rotacion')::numeric,
    (v_puro->>'costo_ausentismo')::numeric,
    (v_puro->>'costo_retrabajo')::numeric,
    (v_puro->>'costo_total')::numeric,
    v_puro->'detalle'
  )
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
-- 4. actualizar_ficha_financiera() — DROP de la firma de 10 parámetros
--    (015/018) + CREATE de la de 11 (agrega p_pct_reduccion_iao_target
--    al final). Ver nota de cabecera: aquí SÍ hace falta DROP FUNCTION
--    explícito (a diferencia de la migración 018), porque esta sí cambia
--    la lista de tipos de parámetros.
-- ══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS actualizar_ficha_financiera(
  uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric
);

CREATE OR REPLACE FUNCTION actualizar_ficha_financiera(
  p_organizacion_id          uuid,
  p_pais                     text,
  p_salario_promedio         numeric DEFAULT NULL,
  p_tasa_rotacion_base       numeric DEFAULT NULL,
  p_dias_ausencia_base       numeric DEFAULT NULL,
  p_costo_operativo_total    numeric DEFAULT NULL,
  p_costo_intervencion       numeric DEFAULT NULL,
  p_ebitda                   numeric DEFAULT NULL,
  p_tasa_retrabajo_real      numeric DEFAULT NULL,
  p_multiplicador_rol        numeric DEFAULT NULL,
  p_pct_reduccion_iao_target numeric DEFAULT NULL
) RETURNS void
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_periodo_actual text;
  v_iao_existente  numeric;
  v_pais_actual    text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE organizacion_id = p_organizacion_id AND consultor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'no autorizado para esta organización';
  END IF;

  SELECT pais INTO v_pais_actual FROM organizaciones WHERE id = p_organizacion_id;

  IF v_pais_actual IS NULL THEN
    IF p_pais IS NULL OR p_pais NOT IN ('colombia') THEN
      RAISE EXCEPTION 'país inválido — por ahora el sistema solo soporta: colombia';
    END IF;
  END IF;

  IF p_multiplicador_rol IS NOT NULL AND p_multiplicador_rol NOT IN (0.30, 0.50, 0.70) THEN
    RAISE EXCEPTION 'multiplicador de rol inválido — debe ser 0.30 (operativo), 0.50 (medio) o 0.70 (directivo)';
  END IF;

  -- pct_reduccion_iao_target: SIN guard (a diferencia de sector/país,
  -- migración 018) — ver nota de cabecera de esta migración. Se valida
  -- siempre que venga un valor, sin importar si ya había uno guardado.
  IF p_pct_reduccion_iao_target IS NOT NULL AND p_pct_reduccion_iao_target NOT IN (0.20, 0.40, 0.60) THEN
    RAISE EXCEPTION 'nivel de reducción del IAO inválido — debe ser 0.20 (conservador), 0.40 (moderado) o 0.60 (ambicioso)';
  END IF;

  UPDATE organizaciones SET
    pais                     = COALESCE(pais, p_pais),
    salario_promedio         = p_salario_promedio,
    tasa_rotacion_base       = p_tasa_rotacion_base,
    dias_ausencia_base       = p_dias_ausencia_base,
    costo_operativo_total    = p_costo_operativo_total,
    costo_intervencion       = p_costo_intervencion,
    ebitda                   = p_ebitda,
    tasa_retrabajo_real      = p_tasa_retrabajo_real,
    multiplicador_rol        = p_multiplicador_rol,
    pct_reduccion_iao_target = p_pct_reduccion_iao_target
  WHERE id = p_organizacion_id;

  -- Disparo 2: sin cambios de lógica respecto a la migración 018 — editar
  -- Ficha financiera nunca crea un punto nuevo en cff_historial, solo
  -- recalcula uno que ya existía para el período actual.
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

GRANT EXECUTE ON FUNCTION actualizar_ficha_financiera(uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- 5. simular_ift() — motor IFT. RPC público, único punto de entrada
--    para la proyección. Fórmula (marco, sección 8.2/8.3):
--
--    IAO_target = IAO_0 × (1 − pct_reduccion)
--    IAO(t) = IAO_target + (IAO_0 − IAO_target) × e^(−λt)     [λ = ln(2)/12, F_ext=1 fijo]
--    CFF(t) = _calcular_cff_puro(..., IAO(t), true)
--    Valor_recuperado_acumulado(T) = Σ_{t=0}^{T} [CFF(0) − CFF(t)]
--    T_rec = primer T donde Valor_recuperado_acumulado(T) ≥ Costo_intervención_cliente
--    ROI(T) = (Valor_recuperado_acumulado(T) − Costo_intervención) / Costo_intervención  [en T=12,24,36]
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION simular_ift(
  p_organizacion_id uuid,
  p_meses           int DEFAULT 36
) RETURNS jsonb
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  -- F_ext = 1 fijo — VALIDACION_IFT_CASOS_REALES.md, sección 6
  -- (2026-08-22): sin evidencia cuantificable para construir categorías,
  -- decisión informada por ausencia real de evidencia, no por omisión.
  v_lambda CONSTANT numeric := ln(2) / 12;

  v_iao_0              numeric;
  v_pct_reduccion      numeric;
  v_costo_intervencion numeric;
  v_iao_target         numeric;

  v_t         int;
  v_iao_t     numeric;
  v_cff_t     numeric;
  v_cff_0     numeric;
  v_acumulado numeric := 0;
  v_t_rec     int;
  v_serie     jsonb := '[]'::jsonb;
  v_roi_12    numeric;
  v_roi_24    numeric;
  v_roi_36    numeric;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE organizacion_id = p_organizacion_id AND consultor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'no autorizado para esta organización';
  END IF;

  IF p_meses IS NULL OR p_meses < 1 THEN
    RAISE EXCEPTION 'p_meses debe ser mayor a 0';
  END IF;

  -- IAO_0: el snapshot real más reciente CON IAO calculado (iao_org_usado
  -- IS NOT NULL) — NO simplemente el período más reciente. Un período
  -- reciente con baja participación (N<8) guarda una fila en
  -- cff_historial con iao_org_usado=NULL (_calcular_cff_puro, rama
  -- insuficiente) sin borrar el snapshot válido de un período anterior;
  -- sin este filtro, ese período NULL más reciente bloquearía el IFT
  -- aunque exista un IAO_0 real y usable más atrás en el historial — caso
  -- real, no hipotético, ya visto en esta sesión con la organización de
  -- prueba (participación 8/50, 16%). Tampoco se recalcula vía
  -- resumen_organizacion_completo() (evita disparar un nuevo snapshot
  -- real como efecto secundario de una simulación; ver nota de cabecera).
  SELECT iao_org_usado INTO v_iao_0
  FROM cff_historial
  WHERE organizacion_id = p_organizacion_id
    AND iao_org_usado IS NOT NULL
  ORDER BY periodo DESC
  LIMIT 1;

  IF v_iao_0 IS NULL THEN
    RAISE EXCEPTION 'la organización no tiene ningún período con IAO calculado (N≥8) en todo su historial';
  END IF;

  SELECT pct_reduccion_iao_target, costo_intervencion
  INTO v_pct_reduccion, v_costo_intervencion
  FROM organizaciones WHERE id = p_organizacion_id;

  IF v_pct_reduccion IS NULL THEN
    RAISE EXCEPTION 'falta seleccionar el nivel de reducción del IAO objetivo (Ficha financiera) antes de proyectar el IFT';
  END IF;

  IF v_costo_intervencion IS NULL OR v_costo_intervencion <= 0 THEN
    RAISE EXCEPTION 'falta el costo de intervención (Ficha financiera), o es cero — no se puede proyectar ROI sin una inversión mayor a 0';
  END IF;

  v_iao_target := v_iao_0 * (1 - v_pct_reduccion);

  FOR v_t IN 0..p_meses LOOP
    v_iao_t := v_iao_target + (v_iao_0 - v_iao_target) * exp(-v_lambda * v_t);
    v_cff_t := ((_calcular_cff_puro(p_organizacion_id, v_iao_t, true))->>'costo_total')::numeric;

    IF v_t = 0 THEN
      v_cff_0 := v_cff_t;
    END IF;

    v_acumulado := v_acumulado + (v_cff_0 - v_cff_t);

    IF v_t_rec IS NULL AND v_acumulado >= v_costo_intervencion THEN
      v_t_rec := v_t;
    END IF;

    IF v_t = 12 THEN v_roi_12 := (v_acumulado - v_costo_intervencion) / v_costo_intervencion; END IF;
    IF v_t = 24 THEN v_roi_24 := (v_acumulado - v_costo_intervencion) / v_costo_intervencion; END IF;
    IF v_t = 36 THEN v_roi_36 := (v_acumulado - v_costo_intervencion) / v_costo_intervencion; END IF;

    v_serie := v_serie || jsonb_build_object(
      't', v_t,
      'iao', round(v_iao_t::numeric, 4),
      'cff_total', round(v_cff_t::numeric, 2),
      'valor_recuperado_acumulado', round(v_acumulado::numeric, 2)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'organizacion_id', p_organizacion_id,
    'iao_0', v_iao_0,
    'iao_target', round(v_iao_target::numeric, 4),
    'pct_reduccion', v_pct_reduccion,
    'costo_intervencion', v_costo_intervencion,
    'lambda', v_lambda,
    'f_ext', 1,
    't_rec', v_t_rec,
    'roi', jsonb_build_object('t12', v_roi_12, 't24', v_roi_24, 't36', v_roi_36),
    'serie', v_serie
  );
END;
$$;

GRANT EXECUTE ON FUNCTION simular_ift(uuid, int) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════

-- 1. Debe devolver 1 fila: pct_reduccion_iao_target
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'organizaciones' AND column_name = 'pct_reduccion_iao_target';

-- 2. Debe devolver 4 filas
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('_calcular_cff_puro', '_calcular_cff_interno', 'actualizar_ficha_financiera', 'simular_ift');

-- 3. Debe devolver EXACTAMENTE 1 fila para actualizar_ficha_financiera —
-- la de 11 parámetros (confirma que el DROP FUNCTION del paso 4 eliminó
-- la sobrecarga vieja de 10, mismo criterio de verificación que la
-- migración 016 usó para confirmar el fix de PGRST203):
SELECT pg_get_function_identity_arguments(p.oid) AS firma
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'actualizar_ficha_financiera';

-- 4. Regresión del refactor — _calcular_cff_puro() debe dar EXACTAMENTE
-- los mismos 4 componentes que daba _calcular_cff_interno() antes de
-- este cambio, para una organización real con diagnóstico ya cargado:
-- SELECT _calcular_cff_puro('<org_id>', <iao_actual>, true);
-- SELECT costo_desenganche, costo_rotacion, costo_ausentismo, costo_retrabajo, costo_total
-- FROM cff_historial WHERE organizacion_id = '<org_id>' ORDER BY periodo DESC LIMIT 1;
-- Los 5 números deben coincidir exactamente.

-- 5. Guardar el nivel de intervención (requiere cff_historial con al
-- menos 1 fila y costo_intervencion ya guardado para esa organización):
-- SELECT actualizar_ficha_financiera('<org_id>', 'colombia', NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL, 0.40);
-- SELECT pct_reduccion_iao_target FROM organizaciones WHERE id = '<org_id>';  -- 0.40

-- 6. Simular el IFT — con IAO_0 real de cff_historial, pct_reduccion=0.40
-- y costo_intervencion ya guardado:
-- SELECT simular_ift('<org_id>');
-- Confirmar a mano, con el IAO_0 real: iao_target = iao_0 * 0.6; a t=12
-- la brecha cerrada debe ser 50% de (iao_0 - iao_target); t_rec debe ser
-- el primer mes donde la suma acumulada de (cff_0 - cff_t) cruza
-- costo_intervencion, o null si nunca cruza dentro de p_meses.

-- 7. Caso sin insumos — organización sin pct_reduccion_iao_target o sin
-- costo_intervencion debe fallar con el mensaje específico correspondiente,
-- no con un error genérico:
-- SELECT simular_ift('<org_id_sin_plan>');
