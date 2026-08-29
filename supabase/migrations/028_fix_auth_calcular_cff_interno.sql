-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 028: fix urgente y aislado — agregar el
-- chequeo de auth.uid() faltante en _calcular_cff_puro()/
-- _calcular_cff_interno() — PARA REVISIÓN, no aplicar todavía.
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente
-- cuando lo apruebe.
--
-- ── Por qué esta migración va SOLA, antes de la 029 ──
-- Hallazgo confirmado en sesión 2026-08-29 (ver migración 029 para el
-- problema general): ninguna migración revoca EXECUTE de PUBLIC en
-- funciones, así que anon tiene EXECUTE hoy en TODO el schema public vía
-- el default de Postgres. La mayoría de las funciones están protegidas
-- en la práctica por su propio chequeo de consultor_organizacion — pero
-- _calcular_cff_puro() y _calcular_cff_interno() son las DOS únicas
-- excepciones: nunca tuvieron ese chequeo, porque se diseñaron para ser
-- invocables solo desde otra función SECURITY DEFINER ya autenticada
-- (resumen_organizacion_completo, actualizar_ficha_financiera,
-- guardar_seguimiento_mensual, simular_ift), nunca directo desde el
-- cliente. Sin el REVOKE de PUBLIC (migración 029, más grande y con más
-- superficie de cambio), esas dos están HOY expuestas a lectura
-- (_calcular_cff_puro, datos financieros de cualquier organización por
-- uuid) y escritura (_calcular_cff_interno, sobrescribe cff_historial de
-- cualquier organización/periodo) sin ninguna sesión de consultor —
-- solo con la anon key pública, que por definición cualquiera tiene
-- (está en el HTML del sitio). Esto se corrige aislado y primero,
-- independientemente de la migración 029, porque es el agujero
-- genuinamente explotable, no una capa de defensa redundante.
--
-- ── Por qué agregar el chequeo no rompe nada ──
-- auth.uid() lee el JWT de la sesión (GUC request.jwt.claims), no
-- cambia con SECURITY DEFINER — el mismo auth.uid() del consultor
-- original sigue disponible en toda la cadena de llamadas anidadas
-- dentro de la misma request. Verificados los 4 llamadores existentes,
-- los 4 ya validan consultor_organizacion para el MISMO p_organizacion_id
-- antes de llegar acá:
--   - resumen_organizacion_completo()   (015_motor_cff.sql:330-335)
--   - actualizar_ficha_financiera()     (015_motor_cff.sql:646-651)
--   - guardar_seguimiento_mensual()     (022_seguimiento_mensual.sql:182-187)
--   - simular_ift()                     (019_motor_ift_y_plan_intervencion.sql:437-442)
-- Y _calcular_cff_interno() es a su vez el único llamador de
-- _calcular_cff_puro() además de simular_ift() — mismo p_organizacion_id
-- en toda la cadena, siempre. Agregar el chequeo acá es 100% redundante
-- para estos 4 caminos (ya pasó una vez arriba) y es exactamente lo que
-- cierra el camino directo no autorizado.
--
-- Cuerpo de ambas funciones IDÉNTICO al de la migración 024 (última
-- versión vigente) — el único cambio es el bloque de auth al inicio de
-- cada una. Firmas sin cambios, CREATE OR REPLACE alcanza.
-- ══════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════
-- 1. _calcular_cff_puro() — + chequeo de consultor_organizacion.
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

  v_s_rot CONSTANT numeric := 1;
  v_s_aus CONSTANT numeric := 1;
  v_s_ret CONSTANT numeric := 1;

  v_dias_laborales_anio CONSTANT numeric := 242;

  v_tasa_rotacion          numeric;
  v_tasa_rotacion_fuente   text;
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

  v_total              numeric;
  v_detalle            jsonb;

  v_insumos_actuales   jsonb;
BEGIN
  -- ★ NUEVO (migración 028) — hasta ahora esta función confiaba
  -- ciegamente en que solo la llamaran _calcular_cff_interno()/
  -- simular_ift() (que ya validan esto antes de llegar acá). Sin
  -- REVOKE EXECUTE FROM PUBLIC en ninguna migración anterior, quedaba
  -- alcanzable directo desde un cliente anónimo con la anon key.
  IF NOT EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE organizacion_id = p_organizacion_id AND consultor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'no autorizado para esta organización';
  END IF;

  SELECT * INTO v_org FROM organizaciones WHERE id = p_organizacion_id;

  v_insumos_actuales := jsonb_build_object(
    'salario_promedio',      v_org.salario_promedio,
    'tasa_rotacion_base',    v_org.tasa_rotacion_base,
    'dias_ausencia_base',    v_org.dias_ausencia_base,
    'costo_operativo_total', v_org.costo_operativo_total,
    'tasa_retrabajo_real',   v_org.tasa_retrabajo_real,
    'multiplicador_rol',     v_org.multiplicador_rol
  );

  IF NOT COALESCE(p_iao_n_suficiente, false) OR p_iao_org IS NULL THEN
    v_detalle := jsonb_build_object(
      'desenganche', jsonb_build_object('incluido', false, 'razon', 'IAO_org insuficiente (N<8) para este período'),
      'rotacion',    jsonb_build_object('incluido', false, 'razon', 'IAO_org insuficiente (N<8) para este período'),
      'ausentismo',  jsonb_build_object('incluido', false, 'razon', 'IAO_org insuficiente (N<8) para este período'),
      'retrabajo',   jsonb_build_object('incluido', false, 'razon', 'IAO_org insuficiente (N<8) para este período')
    );
    RETURN jsonb_build_object(
      'iao_org_usado', NULL, 'costo_desenganche', NULL, 'costo_rotacion', NULL,
      'costo_ausentismo', NULL, 'costo_retrabajo', NULL, 'costo_total', NULL, 'detalle', v_detalle,
      'insumos_actuales', v_insumos_actuales
    );
  END IF;

  -- ── Costo_desenganche = N × Salario_promedio × 0.26 × (IAO_org/100)
  IF v_org.n_empleados IS NOT NULL AND v_org.salario_promedio IS NOT NULL THEN
    v_desenganche := v_org.n_empleados * v_org.salario_promedio * 0.26 * (p_iao_org / 100);
    v_desenganche_incluido := true;
    v_desenganche_razon := 'Calculado con salario promedio real';
  ELSE
    v_desenganche := NULL;
    v_desenganche_incluido := false;
    v_desenganche_razon := 'Falta salario promedio';
  END IF;

  -- ── TasaRotaciónBase — prioridad de 2 niveles (migración 017/021):
  -- dato real del cliente > benchmark de sector. tasa_rotacion_base se
  -- guarda en puntos porcentuales (0-100, migración 005).
  IF v_org.tasa_rotacion_base IS NOT NULL THEN
    v_tasa_rotacion := v_org.tasa_rotacion_base / 100;
    v_tasa_rotacion_fuente := 'dato real del cliente';
  ELSIF v_org.sector = 'retail_logistica' THEN
    v_tasa_rotacion := 0.69;   -- Michael Page Colombia 2023
    v_tasa_rotacion_fuente := 'benchmark sector retail_logistica (Michael Page Colombia 2023, 69%)';
  ELSIF v_org.sector = 'manufactura' THEN
    v_tasa_rotacion := 0.44;   -- Michael Page Colombia 2023
    v_tasa_rotacion_fuente := 'benchmark sector manufactura (Michael Page Colombia 2023, 44%)';
  ELSIF v_org.sector = 'salud_educacion' THEN
    v_tasa_rotacion := 0.1445; -- punto medio ACHC médicos 13.1% / enfermería 15.8%, mayo-jun 2024
    v_tasa_rotacion_fuente := 'benchmark sector salud_educacion (ACHC 2024, punto medio médicos/enfermería 13.1%-15.8%)';
  ELSE
    v_tasa_rotacion := NULL;   -- servicios_prof, finanzas_tech, o sector NULL: sin benchmark de respaldo (evidencia insuficiente)
    v_tasa_rotacion_fuente := NULL;
  END IF;

  -- ── Costo_rotación = N × TasaRotación × (1+s_rot×IAO_org/100) × Salario_promedio × Multiplicador_rol
  IF v_org.n_empleados IS NOT NULL AND v_tasa_rotacion IS NOT NULL
     AND v_org.salario_promedio IS NOT NULL AND v_org.multiplicador_rol IS NOT NULL THEN
    v_rotacion := v_org.n_empleados
                  * v_tasa_rotacion
                  * (1 + v_s_rot * p_iao_org / 100)
                  * v_org.salario_promedio
                  * v_org.multiplicador_rol;
    v_rotacion_incluido := true;
    v_rotacion_razon := 'Calculado — tasa de rotación: ' || v_tasa_rotacion_fuente;
  ELSE
    v_rotacion := NULL;
    v_rotacion_incluido := false;
    v_rotacion_razon := 'Falta ' || concat_ws(', ',
      CASE WHEN v_tasa_rotacion IS NULL THEN 'tasa de rotación base (sin dato real ni benchmark de sector para este sector)' END,
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
    'costo_ausentismo', v_ausentismo, 'costo_retrabajo', v_retrabajo, 'costo_total', v_total, 'detalle', v_detalle,
    'insumos_actuales', v_insumos_actuales
  );
END;
$$;

-- Sigue sin GRANT propio — el chequeo interno de arriba es la
-- protección real; la migración 029 además revoca PUBLIC como capa
-- adicional (defensa en profundidad, no la única barrera).


-- ══════════════════════════════════════════════════════════════════
-- 2. _calcular_cff_interno() — + chequeo de consultor_organizacion.
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
  -- ★ NUEVO (migración 028) — mismo motivo que en _calcular_cff_puro()
  -- arriba. Esta función además ESCRIBE en cff_historial, así que sin
  -- este chequeo el agujero no era solo de lectura.
  IF NOT EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE organizacion_id = p_organizacion_id AND consultor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'no autorizado para esta organización';
  END IF;

  v_puro := _calcular_cff_puro(p_organizacion_id, p_iao_org, p_iao_n_suficiente);

  INSERT INTO cff_historial (organizacion_id, periodo, iao_org_usado, costo_desenganche, costo_rotacion, costo_ausentismo, costo_retrabajo, costo_total, detalle, insumos_congelados, insumos_congelados_en)
  VALUES (
    p_organizacion_id, p_periodo,
    (v_puro->>'iao_org_usado')::numeric,
    (v_puro->>'costo_desenganche')::numeric,
    (v_puro->>'costo_rotacion')::numeric,
    (v_puro->>'costo_ausentismo')::numeric,
    (v_puro->>'costo_retrabajo')::numeric,
    (v_puro->>'costo_total')::numeric,
    v_puro->'detalle',
    v_puro->'insumos_actuales',
    now()
  )
  ON CONFLICT (organizacion_id, periodo) DO UPDATE SET
    iao_org_usado         = EXCLUDED.iao_org_usado,
    costo_desenganche     = EXCLUDED.costo_desenganche,
    costo_rotacion        = EXCLUDED.costo_rotacion,
    costo_ausentismo      = EXCLUDED.costo_ausentismo,
    costo_retrabajo       = EXCLUDED.costo_retrabajo,
    costo_total           = EXCLUDED.costo_total,
    detalle               = EXCLUDED.detalle,
    insumos_congelados    = COALESCE(cff_historial.insumos_congelados, EXCLUDED.insumos_congelados),
    insumos_congelados_en = COALESCE(cff_historial.insumos_congelados_en, EXCLUDED.insumos_congelados_en),
    calculado_en          = now()
  RETURNING jsonb_build_object(
    'organizacion_id', organizacion_id, 'periodo', periodo, 'iao_org_usado', iao_org_usado,
    'costo_desenganche', costo_desenganche, 'costo_rotacion', costo_rotacion,
    'costo_ausentismo', costo_ausentismo, 'costo_retrabajo', costo_retrabajo,
    'costo_total', costo_total, 'detalle', detalle,
    'insumos_congelados', insumos_congelados, 'insumos_congelados_en', insumos_congelados_en,
    'calculado_en', calculado_en
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$$;

-- Sigue sin GRANT propio — mismo criterio que arriba.


-- ══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════

-- 1. Confirmar por código, no por ataque real: el cuerpo de ambas
--    funciones debe contener el chequeo nuevo. pg_get_functiondef
--    devuelve el CREATE OR REPLACE completo tal como quedó en el
--    servidor — comparar contra este archivo.
SELECT proname, pg_get_functiondef(oid) AS definicion
FROM pg_proc
WHERE proname IN ('_calcular_cff_puro', '_calcular_cff_interno');
-- Esperado: ambas definiciones contienen 'no autorizado para esta organización'.

-- 2. Confirmar que ninguna de las dos tiene GRANT propio a día de hoy
--    (columna proacl) — deben depender solo del default (que la
--    migración 029, aparte, corrige después). Sin esta verificación no
--    hace falta simular un ataque anónimo real para confirmar el fix:
--    el chequeo de auth.uid() ya es la barrera real independientemente
--    de qué diga el GRANT.
SELECT proname, proacl
FROM pg_proc
WHERE proname IN ('_calcular_cff_puro', '_calcular_cff_interno');

-- 3. Prueba funcional — como consultor autenticado real con vínculo a
--    una organización de prueba, confirmar que los 4 caminos legítimos
--    siguen funcionando sin el error nuevo:
--    a) resumen_organizacion_completo('<org propia>')
--    b) actualizar_ficha_financiera('<org propia>', 'colombia', ...)
--    c) guardar_seguimiento_mensual('<org propia>', '2026-03', ...)
--    d) simular_ift('<org propia>', 36)
--    Los 4 deben funcionar exactamente igual que antes de esta migración.
--
-- 4. Prueba negativa — como consultor autenticado SIN vínculo a una
--    organización distinta <org_ajena>, confirmar que las 4 funciones de
--    arriba (que ya rechazaban <org_ajena> antes de esta migración)
--    SIGUEN rechazándola igual — no cambia su comportamiento externo,
--    solo se cierra el camino directo a las 2 funciones internas.
