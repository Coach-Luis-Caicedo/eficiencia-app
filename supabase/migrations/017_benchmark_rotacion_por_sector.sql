-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 017: benchmark de sector como respaldo de
-- TasaRotaciónBase (solo rotación — NO toca TasaAusentismoBase ni
-- TasaRetrabajoBase, que quedan como benchmark único, sección 8 del
-- marco)
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- ── Contexto: auditoría 2026-08-21 (DOCUMENTO_MARCO_SISTEMA_EFICIENCIA.md,
-- sección 8, pendiente 3) encontró que `organizaciones.sector` se captura
-- obligatoriamente (crear_organizacion(), migración 007) pero
-- _calcular_cff_interno() nunca lo leía — el mismo patrón de dato
-- capturado-pero-huérfano ya documentado para país, con el agravante de
-- que sector SÍ es obligatorio en la captura.
--
-- ── Verificación previa (no asumida): sector NO es texto libre. A
-- diferencia de areas_organizacion.nombre (text NOT NULL, sin CHECK —
-- ahí sí hubo typos en el pasado), organizaciones.sector tiene
-- CHECK (sector IN (5 valores fijos)) desde la migración 005, reforzado
-- con RAISE EXCEPTION en crear_organizacion() (migración 007) si el valor
-- no es exactamente uno de los 5. No puede haber typos en este campo —
-- confirmado leyendo ambas migraciones, no supuesto.
--
-- ── Qué cambia: TasaRotaciónBase gana un segundo nivel de prioridad,
-- mismo patrón ya usado en TasaAusentismo (dato real > benchmark) —
-- pero con una diferencia deliberada: NO hay benchmark genérico nacional
-- de respaldo por debajo del de sector. INVESTIGACION_DATOS_CALIBRACION_CFF.md
-- (sección 1) ya encontró dos cifras nacionales colombianas de rotación
-- que divergen sustancialmente entre sí (41% El Colombiano vs. 26% La
-- República, 2025, sin metodología pública reconciliable) — la propia
-- investigación concluyó explícitamente "no usar ninguna de las dos como
-- TasaRotaciónBase por defecto sin verificar contra el estudio fuente
-- completo". Usar cualquiera de las dos aquí sería introducir un número
-- no confiable donde hoy correctamente no se calcula nada.
--
-- ── Benchmarks de sector usados — solo 3, solo con evidencia real
-- re-verificada 2026-08-21, NO la tabla legacy SECTOR_BENCHMARKS de
-- workbook.html (PIIO/CTD): esa tabla tiene cita genérica de bloque, sin
-- fuente por valor, y donde se pudo contrastar contra las cifras
-- verificadas diverge de forma material (manufactura 31.0% en la tabla
-- legacy vs. 44% verificado; retail_logistica 42.0% vs. 69% verificado)
-- — no es reutilizable tal cual.
--
--   retail_logistica: 69%   — Michael Page Colombia 2023, cifra puntual
--                              por sector (INVESTIGACION_DATOS_CALIBRACION_CFF.md,
--                              sección 1)
--   manufactura:      44%   — Michael Page Colombia 2023, misma fuente
--   salud_educacion:  14.45% — punto medio de ACHC médicos (13.1%) y
--                              enfermería (15.8%), encuesta mayo-jun 2024,
--                              102 instituciones, 11,160 camas
--                              (INVESTIGACION_BENCHMARKS_ESG_SOSTENIBILIDAD.md,
--                              sección 3.1). Se usa el punto medio porque
--                              el CFF no distingue composición de planta
--                              médica vs. enfermería — decisión de
--                              simplicidad, no un tercer dato nuevo.
--
--   servicios_prof y finanzas_tech: SIN benchmark de respaldo, a propósito.
--   No hay evidencia real que los respalde con el mismo rigor que los 3
--   anteriores. BPO/call center (rotación real verificada 74%-89%,
--   Michael Page 2023 + investigación sectorial BPO) cae hoy dentro de
--   servicios_prof en el esquema de 5 sectores, pero es demasiado atípico
--   para representar a todo el sector con un solo número — aplicarle 69%
--   (retail) o cualquier otro valor sería tan arbitrario como el problema
--   que esta migración busca evitar. Mejor "no calculado, falta dato" que
--   un número de un sector que no corresponde — mismo criterio explícito
--   que pidió Luis.
--
-- ── Efecto práctico: una organización de sector retail_logistica,
-- manufactura, o salud_educacion que NO reporte tasa_rotacion_base real
-- ahora SÍ tiene Costo_rotación calculado (antes quedaba completo en
-- NULL, "falta tasa de rotación base"). Una de servicios_prof o
-- finanzas_tech sin dato real sigue exactamente igual que antes: sin
-- Costo_rotación, con la razón explícita en `detalle`.
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

  -- ── TasaRotaciónBase — prioridad de 2 niveles: dato real del cliente >
  -- benchmark de sector (NUEVO, migración 017). Sin tercer nivel genérico
  -- nacional — ver nota de cabecera de esta migración (cifras nacionales
  -- divergentes, sin metodología reconciliable). tasa_rotacion_base se
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

  -- ── Costo_ausentismo — SIN CAMBIOS en esta migración. TasaAusentismo
  -- sigue con prioridad de 3 niveles (marco, sección 8): dato real >
  -- benchmark país (EALI 2024 Colombia) > benchmark genérico
  -- internacional. Pendiente de datos sectoriales (marco, sección 8,
  -- pendiente 3) — no se toca aquí.
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

  -- ── Costo_retrabajo — SIN CAMBIOS en esta migración. TasaRetrabajo
  -- sigue con benchmark único de manufactura (5%-15%) sin distinción de
  -- sector — pendiente de datos sectoriales (marco, sección 8, pendiente
  -- 3), incluida la corrección de no aplicarlo fuera de manufactura. No
  -- se toca aquí a propósito, para no mezclar dos decisiones distintas
  -- en el mismo cambio.
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

-- Nota: _calcular_cff_interno no tiene GRANT propio (SECURITY DEFINER,
-- solo invocable desde calcular_cff() y resumen_organizacion_completo(),
-- migración 015) — CREATE OR REPLACE no cambia permisos, no hace falta
-- volver a otorgar nada.


-- ══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════

-- 1. Confirmar que sector no tiene valores fuera del enum esperado (no
--    debería ser posible por el CHECK de migración 005, pero se verifica
--    el estado real de los datos, no solo la restricción del esquema):
SELECT sector, count(*) FROM organizaciones GROUP BY sector ORDER BY sector;

-- 2. Probar el nuevo fallback con la organización de prueba: si su
--    tasa_rotacion_base es NULL y su sector es uno de los 3 con
--    benchmark, calcular_cff() debe devolver 'rotacion'.'incluido' = true
--    con la razón citando el benchmark de sector, no "Falta tasa de
--    rotación base" como antes.
-- SELECT calcular_cff('<org_id>');

-- 3. Confirmar que un sector SIN benchmark (servicios_prof, finanzas_tech)
--    y sin tasa_rotacion_base real sigue devolviendo 'rotacion'.'incluido'
--    = false, con la razón actualizada ("sin dato real ni benchmark de
--    sector para este sector") — comportamiento sin cambios de fondo,
--    solo el texto de la razón.
