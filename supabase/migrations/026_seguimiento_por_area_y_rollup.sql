-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 026: captura de KPIs por área + roll-up
-- automático al CFF (PIIO)
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- Diseño completo discutido y aprobado con Luis antes de escribir este
-- archivo (sesión 2026-08-28). Depende de:
--   - migración 006  (areas_organizacion — lista plana de áreas)
--   - migración 020  (calibracion_parametros / calibracion_observaciones
--                     + trigger trg_calibracion_observaciones_recalcular)
--   - migración 022  (_periodo_a_semestre, _periodo_a_clave_ordenable,
--                     los 8 parametros ambito='local', guardar_seguimiento_
--                     mensual + Disparo 2)
--   - migración 024  (cff_historial.insumos_congelados / _en — freeze
--                     centralizado en _calcular_cff_interno)
-- Debe aplicarse DESPUÉS de las 4.
--
-- ── Qué resuelve ──
-- De los 8 KPIs del panel PIIO (antes "Seguimiento mensual"), 6 son
-- capturables por área: tasa_rotacion_base, dias_ausencia_base,
-- tasa_retrabajo_real (los 3 que alimentan el CFF) + productividad,
-- accidentalidad, presentismo (informativos). salario_promedio y
-- costo_operativo_total quedan org-only (agregados financieros, no
-- promediables entre áreas) — se siguen capturando por guardar_
-- seguimiento_mensual(), sin tocar.
--
-- El consultor define, por organización y por KPI:
--   1. si trackea ese KPI por área (seguimiento_kpi_config.activo)
--   2. cuántas áreas deben reportarlo en un mes para consolidarlo
--      (seguimiento_kpi_config.min_areas; NULL = todas las áreas)
-- Cuando un (KPI, mes) alcanza esa completitud, se calcula el promedio
-- simple entre áreas y:
--   - se aplica DIRECTO a organizaciones.<col> (los 3 del CFF)
--   - se registra en calibracion_observaciones (fuente='rollup_area')
--     como serie mensual org-level (los 6)
--   - para los 3 del CFF, se dispara el MISMO Disparo 2 que ya existe
--     (recálculo de cff_historial del semestre vía _calcular_cff_interno)
-- Sin paso de confirmación previo — activar el tracking ES el
-- consentimiento. La corrección manual posterior sigue siendo editar
-- Ficha financiera (actualizar_ficha_financiera sobrescribe la columna,
-- sin candado); un roll-up posterior de otro mes la volverá a actualizar.
--
-- ── Decisiones confirmadas con Luis ──
--   1. Set por-área = los 6 de arriba; salario/costo quedan org-only.
--   2. Nombres técnicos seguimiento_area_* / seguimiento_kpi_*; "PIIO"
--      es marca de UI, no prefijo técnico (mismo criterio que la
--      migración 022 con "Seguimiento mensual").
--   3. El roll-up TAMBIÉN escribe la serie mensual org-level en
--      calibracion_observaciones con fuente='rollup_area' (valor nuevo
--      del CHECK, sección 1) — evita doble captura y hace funcionar
--      Historial Sección B y la comparación de la migración 025 sin
--      trabajo extra.
--   4. Promedio SIMPLE entre áreas (no ponderado por headcount —
--      areas_organizacion no tiene n_empleados, y es lo que se pidió).
--   5. El roll-up RE-DISPARA en cada guardado una vez alcanzada la
--      completitud (no solo en la transición) — así entradas tardías y
--      correcciones de un área propagan el promedio actualizado.
--   6. Sin fila en seguimiento_kpi_config ⇒ KPI NO trackeado (opt-in).
--   7. Autosave por celda en la UI (onblur) → guardar_seguimiento_area()
--      con un solo KPI no-nulo por llamada.
--   8. Tabla seguimiento_rollup_log para trazabilidad de cada roll-up
--      (además de insumos_congelados).
--   9. UI en 3 pestañas: "Consolidado por meses" (RPC nuevo
--      seguimiento_consolidado_anual, agrega los 8 KPIs) · "Por área"
--      (RPC seguimiento_area_anual, un KPI × áreas × meses) ·
--      "Organización" (el panel actual, sin cambios).
--      9a. columna "acumulado" = promedio YTD de los meses consolidados
--          (una suma no tiene sentido: tasas + una cifra ya anualizada).
--      9b. overlay "provisional" (promedio parcial + X/N áreas) para los
--          meses por-área aún no consolidados.
--      9c. "delta" = últimos 2 meses consolidados DENTRO del año.
--
-- ── Trazabilidad insumos_congelados (migración 024) — sin cambios ──
-- El freeze vive centralizado en _calcular_cff_interno() (único escritor
-- de cff_historial) con COALESCE(tabla.col, EXCLUDED.col), agnóstico de
-- quién disparó el recálculo. Cuando el roll-up dispara el Disparo 2:
--   - fila con insumos_congelados ya poblado  → se PRESERVA (valor y
--     fecha); solo cambian los costos vigentes.
--   - fila con insumos_congelados = NULL      → backfill perezoso con
--     los insumos vigentes (que ya incluyen el promedio recién
--     aplicado, porque el UPDATE organizaciones ocurre ANTES del
--     PERFORM _calcular_cff_interno) + insumos_congelados_en = now().
-- No hace falta tocar la migración 024. La VERIFICACIÓN de abajo cubre
-- ambos casos explícitamente.
--
-- ── Nota sobre el trigger de calibracion_observaciones (migración 020) ──
-- trg_calibracion_observaciones_recalcular se dispara también para las
-- filas fuente='rollup_area' que escribe el roll-up (sección 4, paso B).
-- Como los 8 parametros ambito='local' tienen mu0=NULL, sigue dejando
-- mu_post=NULL (correcto) y solo mueve n_acumulado (número inerte para
-- parametros locales) — mismo comportamiento ya documentado en la
-- cabecera de la migración 022, no un problema nuevo.
-- ══════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════
-- 1. calibracion_observaciones.fuente — nuevo valor 'rollup_area'.
--    El CHECK original (migración 020) es inline → Postgres lo nombró
--    calibracion_observaciones_fuente_check.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE calibracion_observaciones DROP CONSTRAINT IF EXISTS calibracion_observaciones_fuente_check;
ALTER TABLE calibracion_observaciones ADD  CONSTRAINT calibracion_observaciones_fuente_check
  CHECK (fuente IN ('real', 'estimado_fit', 'rollup_area'));

COMMENT ON COLUMN calibracion_observaciones.fuente IS
  '''real'' = dato medido directamente (guardar_seguimiento_mensual). '
  '''estimado_fit'' = coeficiente recuperado ajustando un modelo. '
  '''rollup_area'' = promedio entre áreas consolidado automáticamente '
  '(migración 026, _seguimiento_rollup).';


-- ══════════════════════════════════════════════════════════════════
-- 2. seguimiento_kpi_config — qué KPIs trackea la organización por área
--    + umbral de completitud por KPI. Ausencia de fila = no trackeado
--    (opt-in, decisión 6). Formato largo (una fila por KPI) — mismo
--    criterio que calibracion_observaciones.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE seguimiento_kpi_config (
  organizacion_id  uuid NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
  kpi              text NOT NULL CHECK (kpi IN (
    'tasa_rotacion_base', 'dias_ausencia_base', 'tasa_retrabajo_real',
    'productividad', 'accidentalidad', 'presentismo'
  )),
  activo           boolean NOT NULL DEFAULT true,
  -- NULL = todas las áreas de areas_organizacion (COUNT(*) en tiempo de
  -- evaluación). Entero >= 1 = al menos N áreas reportando ese KPI ese mes.
  min_areas        integer CHECK (min_areas IS NULL OR min_areas >= 1),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organizacion_id, kpi)
);

COMMENT ON TABLE seguimiento_kpi_config IS
  'Config por (organización, KPI) de la captura por área del panel PIIO. '
  'Sin fila = KPI no trackeado por área. min_areas NULL = todas las áreas.';

ALTER TABLE seguimiento_kpi_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "seguimiento_kpi_config_select_consultor" ON seguimiento_kpi_config;
CREATE POLICY "seguimiento_kpi_config_select_consultor"
  ON seguimiento_kpi_config FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE consultor_organizacion.organizacion_id = seguimiento_kpi_config.organizacion_id
      AND consultor_organizacion.consultor_id = auth.uid()
  ));
-- Sin policy de INSERT/UPDATE — se escribe vía configurar_seguimiento_kpi()
-- (SECURITY DEFINER), igual que el resto de las tablas de negocio.

GRANT SELECT ON seguimiento_kpi_config TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- 3. seguimiento_area_observaciones — el dato crudo por área/mes/KPI.
--    Tabla dedicada (NO se extiende calibracion_observaciones): su
--    UNIQUE(organizacion_id,periodo,parametro) y su trigger de pooling
--    bayesiano no admiten filas por-área.
--
--    valor: en la UNIDAD DE CAPTURA (lo que el consultor tipea) = la
--    misma unidad de la columna de organizaciones para los 3 del CFF
--    (rotación %, ausencia días/año, retrabajo %). NO se guarda como
--    fracción (a diferencia de calibracion_observaciones) — esta tabla
--    no la consume la maquinaria bayesiana, y guardarla así hace que
--    AVG() salga ya en la escala lista para organizaciones.<col>.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE seguimiento_area_observaciones (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id  uuid NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
  area_id          uuid NOT NULL REFERENCES areas_organizacion(id) ON DELETE CASCADE,
  periodo          text NOT NULL CHECK (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),  -- 'YYYY-MM'
  kpi              text NOT NULL CHECK (kpi IN (
    'tasa_rotacion_base', 'dias_ausencia_base', 'tasa_retrabajo_real',
    'productividad', 'accidentalidad', 'presentismo'
  )),
  valor            numeric NOT NULL,
  capturado_en     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (area_id, periodo, kpi)
);

COMMENT ON TABLE seguimiento_area_observaciones IS
  'Captura de KPIs por área (panel PIIO, migración 026). valor en unidad '
  'de captura (%, días/año, etc.), NO fracción. organizacion_id '
  'denormalizado (area_id ya lo implica) para RLS y conteo de completitud '
  'sin JOIN — guardar_seguimiento_area() valida la coherencia.';

CREATE INDEX idx_seg_area_obs_completitud ON seguimiento_area_observaciones (organizacion_id, kpi, periodo);
CREATE INDEX idx_seg_area_obs_area        ON seguimiento_area_observaciones (area_id);

ALTER TABLE seguimiento_area_observaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "seg_area_obs_select_consultor" ON seguimiento_area_observaciones;
CREATE POLICY "seg_area_obs_select_consultor"
  ON seguimiento_area_observaciones FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE consultor_organizacion.organizacion_id = seguimiento_area_observaciones.organizacion_id
      AND consultor_organizacion.consultor_id = auth.uid()
  ));
-- Sin policy de INSERT/UPDATE — se escribe vía guardar_seguimiento_area().

GRANT SELECT ON seguimiento_area_observaciones TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- 4. seguimiento_rollup_log — trazabilidad de cada roll-up automático
--    (decisión 8). Segunda capa independiente de insumos_congelados:
--    registra de qué promedio de qué áreas salió el valor que quedó en
--    organizaciones.<col>.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE seguimiento_rollup_log (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id          uuid NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
  kpi                      text NOT NULL,
  periodo                  text NOT NULL,   -- 'YYYY-MM' que alcanzó la completitud
  periodo_semestral        text NOT NULL,   -- _periodo_a_semestre(periodo)
  promedio                 numeric NOT NULL,  -- unidad de captura
  n_areas_reportando       integer NOT NULL,
  umbral_aplicado          integer NOT NULL,
  columna_organizaciones   text,            -- NULL para KPIs informativos
  cff_recalculo_intentado  boolean NOT NULL,
  cff_recalculo_ok         boolean,
  creado_en                timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE seguimiento_rollup_log IS
  'Un registro por roll-up automático aplicado (migración 026). '
  'cff_recalculo_ok NULL = no había fila de cff_historial para ese '
  'semestre (no se intentó); true/false = resultado del Disparo 2.';

CREATE INDEX idx_seg_rollup_log_org ON seguimiento_rollup_log (organizacion_id, creado_en DESC);

ALTER TABLE seguimiento_rollup_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "seg_rollup_log_select_consultor" ON seguimiento_rollup_log;
CREATE POLICY "seg_rollup_log_select_consultor"
  ON seguimiento_rollup_log FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE consultor_organizacion.organizacion_id = seguimiento_rollup_log.organizacion_id
      AND consultor_organizacion.consultor_id = auth.uid()
  ));

GRANT SELECT ON seguimiento_rollup_log TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- 5. Helpers puros (IMMUTABLE, sin GRANT — uso interno).
--    KPI (nombre de captura) → columna de organizaciones / parametro de
--    calibracion_observaciones / divisor a fracción.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION _seguimiento_kpi_col(p_kpi text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_kpi
    WHEN 'tasa_rotacion_base'  THEN 'tasa_rotacion_base'
    WHEN 'dias_ausencia_base'  THEN 'dias_ausencia_base'
    WHEN 'tasa_retrabajo_real' THEN 'tasa_retrabajo_real'
    ELSE NULL   -- productividad / accidentalidad / presentismo: no alimentan el CFF
  END;
$$;

CREATE OR REPLACE FUNCTION _seguimiento_kpi_parametro(p_kpi text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_kpi
    WHEN 'tasa_rotacion_base'  THEN 'tasa_rotacion_base_real'
    WHEN 'dias_ausencia_base'  THEN 'tasa_ausentismo_real'
    WHEN 'tasa_retrabajo_real' THEN 'tasa_retrabajo_observada'
    WHEN 'productividad'       THEN 'productividad'
    WHEN 'accidentalidad'      THEN 'accidentalidad'
    WHEN 'presentismo'         THEN 'presentismo'
  END;
$$;

-- Divisor unidad-de-captura → fracción, misma conversión que
-- guardar_seguimiento_mensual() / _calcular_cff_puro() (÷242, ÷100).
CREATE OR REPLACE FUNCTION _seguimiento_kpi_divisor(p_kpi text) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_kpi
    WHEN 'dias_ausencia_base'  THEN 242.0
    WHEN 'tasa_retrabajo_real' THEN 100.0
    ELSE 1.0
  END;
$$;


-- ══════════════════════════════════════════════════════════════════
-- 6. _seguimiento_completitud — evalúa un (KPI, mes) contra su umbral.
--    SECURITY DEFINER, sin GRANT (uso interno + desde los RPCs de
--    lectura, que hacen su propio auth check).
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION _seguimiento_completitud(
  p_organizacion_id uuid,
  p_kpi             text,
  p_periodo         text
) RETURNS jsonb
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_min_areas   integer;
  v_n_areas_tot integer;
  v_umbral      integer;
  v_reportando  integer;
  v_promedio    numeric;
BEGIN
  SELECT min_areas INTO v_min_areas
  FROM seguimiento_kpi_config
  WHERE organizacion_id = p_organizacion_id AND kpi = p_kpi;

  SELECT count(*) INTO v_n_areas_tot
  FROM areas_organizacion WHERE organizacion_id = p_organizacion_id;

  v_umbral := COALESCE(v_min_areas, v_n_areas_tot);

  SELECT count(DISTINCT area_id), avg(valor)
  INTO v_reportando, v_promedio
  FROM seguimiento_area_observaciones
  WHERE organizacion_id = p_organizacion_id AND kpi = p_kpi AND periodo = p_periodo;

  v_reportando := COALESCE(v_reportando, 0);

  RETURN jsonb_build_object(
    'kpi',              p_kpi,
    'periodo',          p_periodo,
    'umbral',           v_umbral,
    'min_areas_config', v_min_areas,
    'n_areas_total',    v_n_areas_tot,
    'n_reportando',     v_reportando,
    'promedio',         v_promedio,
    'completo',         (v_umbral >= 1 AND v_reportando >= 1 AND v_reportando >= v_umbral)
  );
END;
$$;


-- ══════════════════════════════════════════════════════════════════
-- 7. _seguimiento_rollup — el disparador. Si (KPI, mes) está completo:
--      A. aplica el promedio a organizaciones.<col>  (solo KPIs del CFF)
--      B. escribe la serie mensual org-level en calibracion_observaciones
--         (fuente='rollup_area', convertida a fracción)  (los 6)
--      C. dispara el Disparo 2 — recálculo de cff_historial del semestre
--         vía _calcular_cff_interno()  (solo KPIs del CFF)
--      + registra en seguimiento_rollup_log.
--    SECURITY DEFINER, sin GRANT (solo lo llama guardar_seguimiento_area
--    y configurar_seguimiento_kpi).
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION _seguimiento_rollup(
  p_organizacion_id uuid,
  p_kpi             text,
  p_periodo         text
) RETURNS jsonb
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_comp       jsonb;
  v_promedio   numeric;
  v_col        text;
  v_parametro  text;
  v_divisor    numeric;
  v_sem        text;
  v_iao        numeric;
  v_intentado  boolean := false;
  v_ok         boolean := NULL;
BEGIN
  v_comp := _seguimiento_completitud(p_organizacion_id, p_kpi, p_periodo);

  IF NOT (v_comp->>'completo')::boolean THEN
    RETURN v_comp || jsonb_build_object('rollup_aplicado', false);
  END IF;

  v_promedio  := (v_comp->>'promedio')::numeric;
  v_col       := _seguimiento_kpi_col(p_kpi);
  v_parametro := _seguimiento_kpi_parametro(p_kpi);
  v_divisor   := _seguimiento_kpi_divisor(p_kpi);
  v_sem       := _periodo_a_semestre(p_periodo);

  -- (A) KPIs del CFF: promedio DIRECTO a organizaciones (unidad de captura).
  --     Whitelist estricta vía _seguimiento_kpi_col() — v_col solo puede
  --     ser uno de 3 nombres de columna fijos.
  IF v_col IS NOT NULL THEN
    EXECUTE format('UPDATE organizaciones SET %I = $1 WHERE id = $2', v_col)
      USING v_promedio, p_organizacion_id;
  END IF;

  -- (B) Serie mensual org-level (fracción, misma unidad que guardar_
  --     seguimiento_mensual escribe). Los 6 KPIs por área, incluidos los
  --     informativos (para Historial Sección B).
  INSERT INTO calibracion_observaciones (organizacion_id, periodo, parametro, valor_observado, fuente)
  VALUES (p_organizacion_id, p_periodo, v_parametro, v_promedio / v_divisor, 'rollup_area')
  ON CONFLICT (organizacion_id, periodo, parametro)
    DO UPDATE SET valor_observado = EXCLUDED.valor_observado, capturado_en = now();

  -- (C) Disparo 2 — solo KPIs del CFF, idéntico a guardar_seguimiento_
  --     mensual(). El UPDATE organizaciones del paso (A) ya ocurrió, así
  --     que _calcular_cff_puro() lee el promedio recién aplicado.
  IF v_col IS NOT NULL THEN
    SELECT iao_org_usado INTO v_iao
    FROM cff_historial
    WHERE organizacion_id = p_organizacion_id AND periodo = v_sem;

    IF FOUND THEN
      v_intentado := true;
      BEGIN
        PERFORM _calcular_cff_interno(p_organizacion_id, v_sem, v_iao, v_iao IS NOT NULL);
        v_ok := true;
      EXCEPTION WHEN OTHERS THEN
        v_ok := false;
        RAISE WARNING '_seguimiento_rollup: recálculo CFF falló org=% kpi=% periodo_sem=% — %',
          p_organizacion_id, p_kpi, v_sem, SQLERRM;
      END;
    END IF;
  END IF;

  INSERT INTO seguimiento_rollup_log (
    organizacion_id, kpi, periodo, periodo_semestral, promedio,
    n_areas_reportando, umbral_aplicado, columna_organizaciones,
    cff_recalculo_intentado, cff_recalculo_ok
  ) VALUES (
    p_organizacion_id, p_kpi, p_periodo, v_sem, v_promedio,
    (v_comp->>'n_reportando')::int, (v_comp->>'umbral')::int, v_col,
    v_intentado, v_ok
  );

  RETURN v_comp || jsonb_build_object(
    'rollup_aplicado',        true,
    'columna_organizaciones', v_col,
    'parametro',              v_parametro,
    'cff_recalculo_intentado', v_intentado,
    'cff_recalculo_ok',        v_ok
  );
END;
$$;


-- ══════════════════════════════════════════════════════════════════
-- 8. guardar_seguimiento_area — único punto de escritura de la captura
--    por área. Autosave por celda: la UI manda un solo KPI no-nulo por
--    llamada (decisión 7), pero la firma acepta los 6 para un guardado
--    en bloque si hiciera falta.
--
--    Independencia entre KPIs (sin bloqueo cruzado): el loop evalúa cada
--    KPI presente por separado con su propia llamada a _seguimiento_
--    rollup(). Que rotación esté incompleta no impide que retrabajo
--    dispare, ni que la organización no trackee los otros 5 — mismo
--    principio que los 4 componentes de _calcular_cff_puro().
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION guardar_seguimiento_area(
  p_organizacion_id     uuid,
  p_area_id             uuid,
  p_periodo             text,     -- 'YYYY-MM', obligatorio
  p_tasa_rotacion_base  numeric DEFAULT NULL,
  p_dias_ausencia_base  numeric DEFAULT NULL,
  p_tasa_retrabajo_real numeric DEFAULT NULL,
  p_productividad       numeric DEFAULT NULL,
  p_accidentalidad      numeric DEFAULT NULL,
  p_presentismo         numeric DEFAULT NULL
) RETURNS jsonb
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_kpi     text;
  v_valor   numeric;
  v_activo  boolean;
  v_rollups jsonb := jsonb_build_array();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE organizacion_id = p_organizacion_id AND consultor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'no autorizado para esta organización';
  END IF;

  IF p_periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'periodo inválido para seguimiento por área — se espera YYYY-MM, recibido: %', p_periodo;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM areas_organizacion
    WHERE id = p_area_id AND organizacion_id = p_organizacion_id
  ) THEN
    RAISE EXCEPTION 'el área indicada no pertenece a esta organización';
  END IF;

  IF p_presentismo IS NOT NULL AND (p_presentismo < 1 OR p_presentismo > 5) THEN
    RAISE EXCEPTION 'presentismo inválido — debe estar entre 1 y 5';
  END IF;

  FOR v_kpi, v_valor IN
    SELECT t.kpi, t.valor FROM (VALUES
      ('tasa_rotacion_base',  p_tasa_rotacion_base),
      ('dias_ausencia_base',  p_dias_ausencia_base),
      ('tasa_retrabajo_real', p_tasa_retrabajo_real),
      ('productividad',       p_productividad),
      ('accidentalidad',      p_accidentalidad),
      ('presentismo',         p_presentismo)
    ) AS t(kpi, valor)
    WHERE t.valor IS NOT NULL
  LOOP
    INSERT INTO seguimiento_area_observaciones (organizacion_id, area_id, periodo, kpi, valor)
    VALUES (p_organizacion_id, p_area_id, p_periodo, v_kpi, v_valor)
    ON CONFLICT (area_id, periodo, kpi)
      DO UPDATE SET valor = EXCLUDED.valor, capturado_en = now();

    SELECT activo INTO v_activo
    FROM seguimiento_kpi_config
    WHERE organizacion_id = p_organizacion_id AND kpi = v_kpi;

    IF COALESCE(v_activo, false) THEN
      v_rollups := v_rollups || _seguimiento_rollup(p_organizacion_id, v_kpi, p_periodo);
    ELSE
      v_rollups := v_rollups || jsonb_build_object('kpi', v_kpi, 'rollup_aplicado', false, 'trackeado', false);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'rollups', v_rollups);
END;
$$;

GRANT EXECUTE ON FUNCTION guardar_seguimiento_area(uuid, uuid, text, numeric, numeric, numeric, numeric, numeric, numeric) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- 9. configurar_seguimiento_kpi — enciende/apaga el tracking por área
--    de un KPI y fija su umbral. Al ACTIVAR, evalúa completitud
--    retroactiva para todos los meses que ya tienen observaciones — así
--    activar el tracking después de cargar datos igual consolida lo que
--    ya está completo, sin obligar a re-tocar cada mes.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION configurar_seguimiento_kpi(
  p_organizacion_id uuid,
  p_kpi             text,
  p_activo          boolean,
  p_min_areas       integer DEFAULT NULL
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

  IF p_kpi NOT IN ('tasa_rotacion_base', 'dias_ausencia_base', 'tasa_retrabajo_real',
                   'productividad', 'accidentalidad', 'presentismo') THEN
    RAISE EXCEPTION 'kpi no válido para captura por área: %', p_kpi;
  END IF;

  IF p_min_areas IS NOT NULL AND p_min_areas < 1 THEN
    RAISE EXCEPTION 'min_areas debe ser NULL (todas las áreas) o un entero >= 1';
  END IF;

  INSERT INTO seguimiento_kpi_config (organizacion_id, kpi, activo, min_areas, actualizado_en)
  VALUES (p_organizacion_id, p_kpi, p_activo, p_min_areas, now())
  ON CONFLICT (organizacion_id, kpi)
    DO UPDATE SET activo = EXCLUDED.activo, min_areas = EXCLUDED.min_areas, actualizado_en = now();

  IF p_activo THEN
    PERFORM _seguimiento_rollup(p_organizacion_id, p_kpi, m.periodo)
    FROM (
      SELECT DISTINCT periodo
      FROM seguimiento_area_observaciones
      WHERE organizacion_id = p_organizacion_id AND kpi = p_kpi
    ) m;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION configurar_seguimiento_kpi(uuid, text, boolean, integer) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- 10. RPCs de lectura — todos SECURITY DEFINER + auth check propio +
--     GRANT a authenticated. Devuelven jsonb "shape-ready", mismo idioma
--     que historial_cff()/historial_seguimiento_mensual() (migración 023).
-- ══════════════════════════════════════════════════════════════════

-- 10.1 seguimiento_kpi_config_listar — estado de los 6 KPIs (los que no
--      tienen fila salen activo=false).
CREATE OR REPLACE FUNCTION seguimiento_kpi_config_listar(p_organizacion_id uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_kpis      text[] := ARRAY['tasa_rotacion_base', 'dias_ausencia_base', 'tasa_retrabajo_real',
                              'productividad', 'accidentalidad', 'presentismo'];
  v_kpi       text;
  v_activo    boolean;
  v_min_areas integer;
  v_n_areas   integer;
  v_out       jsonb := jsonb_build_array();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE organizacion_id = p_organizacion_id AND consultor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'no autorizado para esta organización';
  END IF;

  SELECT count(*) INTO v_n_areas FROM areas_organizacion WHERE organizacion_id = p_organizacion_id;

  FOREACH v_kpi IN ARRAY v_kpis LOOP
    v_activo    := NULL;
    v_min_areas := NULL;
    SELECT activo, min_areas INTO v_activo, v_min_areas
    FROM seguimiento_kpi_config
    WHERE organizacion_id = p_organizacion_id AND kpi = v_kpi;

    v_out := v_out || jsonb_build_object(
      'kpi',          v_kpi,
      'activo',       COALESCE(v_activo, false),
      'min_areas',    v_min_areas,
      'alimenta_cff', _seguimiento_kpi_col(v_kpi) IS NOT NULL
    );
  END LOOP;

  RETURN jsonb_build_object('n_areas_total', COALESCE(v_n_areas, 0), 'kpis', v_out);
END;
$$;

GRANT EXECUTE ON FUNCTION seguimiento_kpi_config_listar(uuid) TO authenticated;


-- 10.2 seguimiento_area_anual — vista "Por área": un KPI × áreas × 12
--      meses de un año + completitud por mes + config.
CREATE OR REPLACE FUNCTION seguimiento_area_anual(
  p_organizacion_id uuid,
  p_kpi             text,
  p_anio            integer
) RETURNS jsonb
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_activo    boolean;
  v_min_areas integer;
  v_col       text;
  v_valor_vig numeric;
  v_area      record;
  v_mes       integer;
  v_periodo   text;
  v_meses     jsonb;
  v_valor     numeric;
  v_areas     jsonb := jsonb_build_array();
  v_comp      jsonb := jsonb_build_object();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE organizacion_id = p_organizacion_id AND consultor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'no autorizado para esta organización';
  END IF;

  IF p_kpi NOT IN ('tasa_rotacion_base', 'dias_ausencia_base', 'tasa_retrabajo_real',
                   'productividad', 'accidentalidad', 'presentismo') THEN
    RAISE EXCEPTION 'kpi no válido para captura por área: %', p_kpi;
  END IF;

  SELECT activo, min_areas INTO v_activo, v_min_areas
  FROM seguimiento_kpi_config
  WHERE organizacion_id = p_organizacion_id AND kpi = p_kpi;

  FOR v_area IN
    SELECT id, nombre FROM areas_organizacion
    WHERE organizacion_id = p_organizacion_id
    ORDER BY nombre
  LOOP
    v_meses := jsonb_build_object();
    FOR v_mes IN 1..12 LOOP
      v_periodo := p_anio::text || '-' || lpad(v_mes::text, 2, '0');
      v_valor := (
        SELECT valor FROM seguimiento_area_observaciones
        WHERE area_id = v_area.id AND periodo = v_periodo AND kpi = p_kpi
      );
      v_meses := v_meses || jsonb_build_object(v_periodo, v_valor);
    END LOOP;
    v_areas := v_areas || jsonb_build_object(
      'area_id', v_area.id, 'nombre', v_area.nombre, 'meses', v_meses
    );
  END LOOP;

  FOR v_mes IN 1..12 LOOP
    v_periodo := p_anio::text || '-' || lpad(v_mes::text, 2, '0');
    v_comp := v_comp || jsonb_build_object(
      v_periodo, _seguimiento_completitud(p_organizacion_id, p_kpi, v_periodo)
    );
  END LOOP;

  v_col := _seguimiento_kpi_col(p_kpi);
  IF v_col IS NOT NULL THEN
    EXECUTE format('SELECT %I FROM organizaciones WHERE id = $1', v_col)
      INTO v_valor_vig USING p_organizacion_id;
  END IF;

  RETURN jsonb_build_object(
    'kpi',           p_kpi,
    'anio',          p_anio,
    'activo',        COALESCE(v_activo, false),
    'min_areas',     v_min_areas,
    'alimenta_cff',  v_col IS NOT NULL,
    'valor_vigente', v_valor_vig,
    'areas',         v_areas,
    'completitud',   v_comp
  );
END;
$$;

GRANT EXECUTE ON FUNCTION seguimiento_area_anual(uuid, text, integer) TO authenticated;


-- 10.3 seguimiento_consolidado_anual — vista "Consolidado por meses":
--      los 8 KPIs × 12 meses de un año, ya a nivel organización.
--      Fuente del valor mensual: calibracion_observaciones (serie
--      org-level; las filas fuente='rollup_area' que escribe el roll-up
--      + las 'real' que escribe guardar_seguimiento_mensual). Normaliza
--      TODO a unidad de captura (revierte ÷242 / ÷100). Overlay
--      'provisional' para meses por-área aún no consolidados (decisión 9b).
CREATE OR REPLACE FUNCTION seguimiento_consolidado_anual(
  p_organizacion_id uuid,
  p_anio            integer
) RETURNS jsonb
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_row        record;
  v_mes        integer;
  v_periodo    text;
  v_meses      jsonb;
  v_cons       numeric;
  v_serie      numeric[];
  v_comp       jsonb;
  v_prov_n     integer;
  v_delta      numeric;
  v_acum       numeric;
  v_col        text;
  v_valor_vig  numeric;
  v_len        integer;
  v_out        jsonb := jsonb_build_array();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE organizacion_id = p_organizacion_id AND consultor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'no autorizado para esta organización';
  END IF;

  FOR v_row IN
    SELECT * FROM (VALUES
      ('salario_promedio',      'salario_promedio_real',      1::numeric,   'organizacional',   NULL::text),
      ('costo_operativo_total', 'costo_operativo_total_real', 1::numeric,   'organizacional',   NULL),
      ('tasa_rotacion_base',    'tasa_rotacion_base_real',    1::numeric,   'cff',              'tasa_rotacion_base'),
      ('dias_ausencia_base',    'tasa_ausentismo_real',       242::numeric, 'cff',              'dias_ausencia_base'),
      ('tasa_retrabajo_real',   'tasa_retrabajo_observada',   100::numeric, 'cff',              'tasa_retrabajo_real'),
      ('productividad',         'productividad',              1::numeric,   'informativo_area', 'productividad'),
      ('accidentalidad',        'accidentalidad',             1::numeric,   'informativo_area', 'accidentalidad'),
      ('presentismo',           'presentismo',                1::numeric,   'informativo_area', 'presentismo')
    ) AS t(kpi, parametro, mult, grupo, area_kpi)
  LOOP
    v_meses := jsonb_build_object();
    v_serie := ARRAY[]::numeric[];

    FOR v_mes IN 1..12 LOOP
      v_periodo := p_anio::text || '-' || lpad(v_mes::text, 2, '0');

      v_cons := (
        SELECT valor_observado * v_row.mult
        FROM calibracion_observaciones
        WHERE organizacion_id = p_organizacion_id
          AND parametro = v_row.parametro
          AND periodo = v_periodo
      );

      IF v_cons IS NOT NULL THEN
        v_meses := v_meses || jsonb_build_object(v_periodo,
          jsonb_build_object('valor', v_cons, 'estado', 'consolidado'));
        v_serie := v_serie || v_cons;

      ELSIF v_row.area_kpi IS NOT NULL THEN
        v_comp := _seguimiento_completitud(p_organizacion_id, v_row.area_kpi, v_periodo);
        v_prov_n := (v_comp->>'n_reportando')::integer;
        IF v_prov_n > 0 THEN
          v_meses := v_meses || jsonb_build_object(v_periodo, jsonb_build_object(
            'valor',      (v_comp->>'promedio')::numeric,
            'estado',     'provisional',
            'reportando', v_prov_n,
            'umbral',     (v_comp->>'umbral')::integer
          ));
        ELSE
          v_meses := v_meses || jsonb_build_object(v_periodo, NULL);
        END IF;
      ELSE
        v_meses := v_meses || jsonb_build_object(v_periodo, NULL);
      END IF;
    END LOOP;

    v_len := COALESCE(array_length(v_serie, 1), 0);

    -- delta: últimos 2 meses consolidados del año (decisión 9c)
    v_delta := CASE WHEN v_len >= 2 THEN v_serie[v_len] - v_serie[v_len - 1] ELSE NULL END;

    -- acumulado: promedio YTD de los meses consolidados (decisión 9a)
    v_acum := NULL;
    IF v_len >= 1 THEN
      SELECT avg(x) INTO v_acum FROM unnest(v_serie) AS x;
    END IF;

    v_col := _seguimiento_kpi_col(v_row.kpi);
    v_valor_vig := NULL;
    IF v_col IS NOT NULL THEN
      EXECUTE format('SELECT %I FROM organizaciones WHERE id = $1', v_col)
        INTO v_valor_vig USING p_organizacion_id;
    END IF;

    v_out := v_out || jsonb_build_object(
      'kpi',           v_row.kpi,
      'parametro',     v_row.parametro,
      'grupo',         v_row.grupo,
      'alimenta_cff',  v_col IS NOT NULL,
      'meses',         v_meses,
      'delta',         v_delta,
      'acumulado',     v_acum,
      'valor_vigente', v_valor_vig
    );
  END LOOP;

  RETURN jsonb_build_object('anio', p_anio, 'kpis', v_out);
END;
$$;

GRANT EXECUTE ON FUNCTION seguimiento_consolidado_anual(uuid, integer) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════

-- 1. Las 3 tablas nuevas + RLS habilitado.
SELECT c.relname, c.relrowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('seguimiento_kpi_config', 'seguimiento_area_observaciones', 'seguimiento_rollup_log');
-- Esperado: 3 filas, relrowsecurity = true en todas.

-- 2. GRANT SELECT a authenticated en las 3, y CERO grants a anon.
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('seguimiento_kpi_config', 'seguimiento_area_observaciones', 'seguimiento_rollup_log')
ORDER BY table_name, grantee;
-- Esperado: solo 'authenticated' / SELECT. Ninguna fila con grantee='anon'.

-- 3. El CHECK de fuente ahora admite 'rollup_area'.
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'calibracion_observaciones_fuente_check';
-- Esperado: CHECK (fuente = ANY (ARRAY['real', 'estimado_fit', 'rollup_area']))

-- 4. Firmas de las 6 funciones nuevas con GRANT + las 3 internas.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS firma
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN (
  'guardar_seguimiento_area', 'configurar_seguimiento_kpi',
  'seguimiento_kpi_config_listar', 'seguimiento_area_anual', 'seguimiento_consolidado_anual',
  '_seguimiento_completitud', '_seguimiento_rollup',
  '_seguimiento_kpi_col', '_seguimiento_kpi_parametro', '_seguimiento_kpi_divisor'
)
ORDER BY p.proname;

-- ── Pruebas funcionales — usar un organizacion_id real de prueba con
--    >= 3 áreas en areas_organizacion. Descomentar y reemplazar <org>,
--    <area1>, <area2>, <area3>.
--
-- 5. Config + completitud básica (umbral NULL → COUNT(areas)).
-- SELECT configurar_seguimiento_kpi('<org>', 'tasa_rotacion_base', true, NULL);
-- SELECT guardar_seguimiento_area('<org>', '<area1>', '2026-03', p_tasa_rotacion_base := 10);
-- SELECT guardar_seguimiento_area('<org>', '<area2>', '2026-03', p_tasa_rotacion_base := 14);
-- -- Con 3 áreas totales y solo 2 reportando: completo=false, organizaciones sin tocar.
-- SELECT _seguimiento_completitud('<org>', 'tasa_rotacion_base', '2026-03');
-- SELECT guardar_seguimiento_area('<org>', '<area3>', '2026-03', p_tasa_rotacion_base := 18);
-- -- Ahora 3/3 → completo=true. rollups[0].rollup_aplicado=true, promedio=14.
-- SELECT tasa_rotacion_base FROM organizaciones WHERE id = '<org>';   -- 14
-- SELECT * FROM calibracion_observaciones WHERE organizacion_id='<org>' AND parametro='tasa_rotacion_base_real' AND periodo='2026-03';  -- valor_observado=14, fuente='rollup_area'
-- SELECT * FROM seguimiento_rollup_log WHERE organizacion_id='<org>' ORDER BY creado_en DESC LIMIT 1;

-- 6. Sin bloqueo cruzado — completar retrabajo con rotación de OTRO mes incompleta.
-- SELECT configurar_seguimiento_kpi('<org>', 'tasa_retrabajo_real', true, 2);   -- umbral custom = 2
-- SELECT guardar_seguimiento_area('<org>', '<area1>', '2026-04', p_tasa_retrabajo_real := 6);
-- SELECT guardar_seguimiento_area('<org>', '<area2>', '2026-04', p_tasa_retrabajo_real := 8);
-- -- retrabajo 2026-04 completo (2/2) y dispara aunque rotación 2026-04 no tenga ni un dato.
-- SELECT tasa_retrabajo_real FROM organizaciones WHERE id='<org>';   -- 7

-- 7. KPI NO activo — el dato se guarda pero no hay roll-up.
-- SELECT configurar_seguimiento_kpi('<org>', 'productividad', false, NULL);
-- SELECT guardar_seguimiento_area('<org>', '<area1>', '2026-05', p_productividad := 42);
-- -- rollups[0] → {"trackeado": false, "rollup_aplicado": false}. Nada en calibracion_observaciones.

-- 8. Trazabilidad insumos_congelados (migración 024) — CASO PRESERVADO.
--    Requiere una fila de cff_historial para el semestre '2026-S1' con
--    insumos_congelados YA poblado (cálculo genuino previo).
-- SELECT insumos_congelados->>'tasa_rotacion_base' AS rot_congelada,
--        insumos_congelados_en, costo_rotacion
-- FROM cff_historial WHERE organizacion_id='<org>' AND periodo='2026-S1';   -- anotar los 3
-- SELECT guardar_seguimiento_area('<org>', '<area1>', '2026-02', p_tasa_rotacion_base := 30);
-- SELECT guardar_seguimiento_area('<org>', '<area2>', '2026-02', p_tasa_rotacion_base := 30);
-- SELECT guardar_seguimiento_area('<org>', '<area3>', '2026-02', p_tasa_rotacion_base := 30);
-- -- 2026-02 → semestre 2026-S1. Roll-up dispara Disparo 2.
-- SELECT insumos_congelados->>'tasa_rotacion_base' AS rot_congelada,
--        insumos_congelados_en, costo_rotacion
-- FROM cff_historial WHERE organizacion_id='<org>' AND periodo='2026-S1';
-- -- rot_congelada e insumos_congelados_en SIN CAMBIOS; costo_rotacion SÍ cambió
-- -- (usa el insumo vigente = 30).

-- 9. Trazabilidad — CASO BACKFILL PEREZOSO. Fila de cff_historial de un
--    semestre con insumos_congelados = NULL (pre-migración 024 o nunca
--    recalculada). Tras el roll-up de un mes de ese semestre:
--    insumos_congelados pasa a tener los 6 campos con los valores
--    VIGENTES (incluido el promedio recién aplicado) e insumos_congelados_en = now().

-- 10. Editable tras roll-up — actualizar_ficha_financiera sobrescribe sin candado.
-- SELECT actualizar_ficha_financiera('<org>', 'colombia', p_tasa_rotacion_base := 99);
-- SELECT tasa_rotacion_base FROM organizaciones WHERE id='<org>';   -- 99 (el roll-up no bloquea)

-- 11. seguimiento_area_anual — shape.
-- SELECT jsonb_pretty(seguimiento_area_anual('<org>', 'tasa_rotacion_base', 2026));
-- -- 'areas': una entrada por área, cada una con 'meses' = 12 claves (null donde no hay dato).
-- -- 'completitud': 12 claves, cada una con el jsonb de _seguimiento_completitud.
-- -- 'valor_vigente' = organizaciones.tasa_rotacion_base actual.

-- 12. seguimiento_consolidado_anual — shape + normalización de unidad.
-- SELECT jsonb_pretty(seguimiento_consolidado_anual('<org>', 2026));
-- -- 'kpis': 8 entradas. Para 2026-03 en 'tasa_rotacion_base': {"valor":14,"estado":"consolidado"}.
-- -- Un mes con 1/3 áreas reportando → {"valor":X,"estado":"provisional","reportando":1,"umbral":3}.
-- -- 'dias_ausencia_base'.meses[*].valor debe estar en DÍAS/AÑO (no la fracción /242
-- --   que guarda calibracion_observaciones) — comparar contra
-- --   valor_observado*242 de tasa_ausentismo_real.
-- -- 'acumulado' = promedio de los meses 'consolidado'. 'delta' = últimos 2 consolidados.

-- 13. RLS / autorización — como consultor SIN vínculo a <org>, las 5 RPCs
--     con GRANT deben lanzar 'no autorizado para esta organización', y un
--     SELECT directo a las 3 tablas debe devolver 0 filas.
