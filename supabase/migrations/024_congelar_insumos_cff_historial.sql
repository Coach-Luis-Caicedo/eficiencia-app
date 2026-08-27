-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 024: congelar los insumos usados al calcular
-- cada fila de cff_historial
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- ── Problema ──
--
-- cff_historial guarda, por período, los 4 componentes calculados del
-- CFF + el detalle de qué se incluyó y por qué (migración 014), pero NO
-- guarda los insumos crudos de `organizaciones` (salario_promedio,
-- tasa_rotacion_base, dias_ausencia_base, costo_operativo_total,
-- tasa_retrabajo_real, multiplicador_rol) que produjeron esos números.
-- _calcular_cff_interno() (única función que escribe la tabla, migración
-- 015/017/019) lee esos 6 campos de `organizaciones` en el momento del
-- cálculo — el estado ACTUAL de la ficha, no un snapshot histórico.
-- Como Ficha financiera y Seguimiento mensual (actualizar_ficha_
-- financiera(), guardar_seguimiento_mensual()) recalculan una fila ya
-- existente de cff_historial reutilizando su iao_org_usado guardado pero
-- con los insumos VIGENTES de `organizaciones` (Disparo 2, migraciones
-- 019/022), una edición posterior de esos campos reescribe en silencio
-- qué se asumió originalmente para ese período — sin dejar rastro de que
-- cambió.
--
-- ── Diseño confirmado con Luis, 2026-08-27 ──
--
-- 1. Columna nueva `cff_historial.insumos_congelados jsonb`, nullable,
--    sin default. Separada de `detalle` a propósito: `detalle` documenta
--    "por qué se incluyó/omitió cada componente" (consumido tal cual por
--    historial_cff(), migración 023 — su forma NO cambia en esta
--    migración) y `insumos_congelados` documenta "con qué insumos crudos
--    se calculó" — dos preguntas distintas, dos columnas distintas.
--
-- 2. Columna nueva `cff_historial.insumos_congelados_en timestamptz`,
--    nullable, sin default, congelada con el mismo idioma que el punto
--    3. Sin ella, `calculado_en` (que se sobreescribe en CADA recálculo,
--    siempre = now()) no basta para saber si un `insumos_congelados` que
--    se ve hoy es el congelado genuino del primer cálculo de ese período
--    o un backfill perezoso posterior a esta migración (punto 5) — esa
--    distinción no es reconstruible de ninguna otra forma. Se agrega
--    ahora porque agregarla más tarde no permitiría reclasificar
--    retroactivamente las filas que ya se hayan congelado con esta
--    migración.
--
-- 3. _calcular_cff_puro() reporta los 6 insumos leídos de `organizaciones`
--    bajo una clave nueva 'insumos_actuales', en AMBAS ramas de retorno
--    (v_org ya se lee antes del branch temprano por N insuficiente, así
--    que está disponible en los dos casos). Nombre deliberadamente
--    distinto al de la columna: _calcular_cff_puro() es una función pura
--    que siempre reporta el estado VIGENTE de `organizaciones`,
--    independientemente de si esta escritura en particular va a
--    congelarlo o no — esa decisión vive un nivel más arriba, en
--    _calcular_cff_interno().
--
-- 4. _calcular_cff_interno() persiste 'insumos_actuales' y el timestamp
--    de congelado con el idioma estándar de Postgres para "set-once,
--    luego congelado" — `COALESCE(tabla.columna, EXCLUDED.columna)`
--    dentro del DO UPDATE SET de un INSERT ... ON CONFLICT. No existía
--    este idioma en el codebase (el único precedente de "congelar en el
--    primer valor no-nulo", actualizar_ficha_tecnica() en la migración
--    018, lo hace con COALESCE en un UPDATE plano, no en un upsert) — es
--    Postgres estándar, no un patrón inventado para esta migración:
--      - INSERT sin conflicto (fila nueva, Disparo 1): se congela con los
--        insumos actuales y now(), porque no hay insumos previos que
--        preservar.
--      - Conflicto (fila ya existía, Disparo 2 — el único caso real: ni
--        actualizar_ficha_financiera() ni guardar_seguimiento_mensual()
--        crean filas nuevas, migración 019/022): se conserva lo ya
--        congelado (valor Y fecha), salvo que fuera NULL (fila
--        pre-migración, o primer recálculo tras aplicar esta migración),
--        caso en el que se congela ahora con lo que haya vigente en ese
--        momento.
--    Una sola sentencia atómica, sin SELECT-then-UPDATE, sin condición de
--    carrera. Cero cambios en actualizar_ficha_financiera() ni en
--    guardar_seguimiento_mensual() — la lógica de congelado queda
--    centralizada por completo en la única función que escribe la tabla.
--
-- ── Limitación conocida, documentada a propósito, no un bug ──
--
-- Sin backfill. Las filas existentes de cff_historial arrancan con
-- insumos_congelados = NULL e insumos_congelados_en = NULL (ALTER TABLE
-- ... ADD COLUMN simple) y se congelan de forma perezosa la próxima vez
-- que ese período se recalcule — con los insumos vigentes EN ESE
-- MOMENTO, no los originales del período (que ya no son recuperables,
-- nunca se guardaron). insumos_congelados_en en ese caso queda con la
-- fecha de ESTE recálculo perezoso, no la fecha real del período — es
-- precisamente la señal que permite distinguir después "esto se congeló
-- genuino en su momento" de "esto se rellenó tarde". Si un período nunca
-- vuelve a recalcularse después de aplicar esta migración, ambas columnas
-- se quedan en NULL para siempre — lectura honesta: "insumos no
-- disponibles para este snapshot", no un error.
--
-- ── Compatibilidad verificada ──
--
-- _calcular_cff_puro() tiene 2 llamadores fuera de sí misma en todo el
-- repo: _calcular_cff_interno() (lee ->>'iao_org_usado' etc., ignora
-- claves extra) y simular_ift() (019:486, lee solo ->>'costo_total').
-- Agregar la clave 'insumos_actuales' no rompe ninguno de los dos.
-- Ningún llamador de _calcular_cff_interno() (los 3: resumen_
-- organizacion_completo() 015, actualizar_ficha_financiera() 019,
-- guardar_seguimiento_mensual() 022) lee su valor de retorno — todos
-- hacen PERFORM y lo descartan — así que agregar claves al jsonb del
-- RETURNING tampoco tiene ningún llamador que romper.
--
-- Sin cambios de RLS ni de GRANT: la policy de SELECT y el GRANT SELECT
-- de cff_historial (migración 014) son a nivel de tabla, no de columna
-- — las columnas nuevas quedan cubiertas automáticamente.
-- ══════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════
-- 1. cff_historial.insumos_congelados / insumos_congelados_en —
--    columnas nuevas, nullable, sin backfill (ver nota de cabecera).
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE cff_historial ADD COLUMN insumos_congelados jsonb;
ALTER TABLE cff_historial ADD COLUMN insumos_congelados_en timestamptz;


-- ══════════════════════════════════════════════════════════════════
-- 2. _calcular_cff_puro() — agrega la clave 'insumos_actuales' a los 6
--    insumos crudos leídos de `organizaciones`, en ambas ramas de
--    retorno. Cuerpo base = versión vigente de la migración 021 (con el
--    fix de benchmark de sector) — ningún número ni fórmula existente
--    cambia, solo se agrega el reporte nuevo. Firma sin cambios (uuid,
--    numeric, boolean) — CREATE OR REPLACE alcanza.
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

  -- Nuevo en la migración 024 — los 6 insumos crudos leídos de
  -- `organizaciones`, verbatim, sin transformar. Se construye justo
  -- después de leer v_org, antes del branch temprano, para que quede
  -- disponible en las dos ramas de retorno.
  v_insumos_actuales   jsonb;
BEGIN
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

-- Nota: _calcular_cff_puro no tiene GRANT propio (SECURITY DEFINER,
-- solo invocable desde _calcular_cff_interno() y simular_ift()) —
-- CREATE OR REPLACE no cambia permisos, no hace falta volver a otorgar
-- nada. (Mismo texto de nota que la migración 021.)


-- ══════════════════════════════════════════════════════════════════
-- 3. _calcular_cff_interno() — agrega insumos_congelados e
--    insumos_congelados_en al INSERT y el idioma
--    COALESCE(tabla.columna, EXCLUDED.columna) al DO UPDATE SET (ver
--    nota de cabecera, punto 4) — el mecanismo de congelado en sí.
--    Firma sin cambios (uuid, text, numeric, boolean) — CREATE OR REPLACE
--    alcanza. Resto del cuerpo idéntico a la migración 019.
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
    -- Congelado — se conserva lo que ya había (valor Y fecha), salvo que
    -- fuera NULL (fila pre-migración 024, o primer recálculo desde que
    -- se aplicó), caso en el que se congela ahora con los insumos
    -- vigentes y el momento de este recálculo. Ver nota de cabecera,
    -- punto 4.
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

-- Nota: _calcular_cff_interno no tiene GRANT propio (SECURITY DEFINER,
-- solo invocable desde resumen_organizacion_completo(), actualizar_
-- ficha_financiera() y guardar_seguimiento_mensual()) — sin cambios de
-- permisos respecto a la migración 019.


-- ══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════

-- 1. Debe devolver 2 filas: insumos_congelados (jsonb) e
-- insumos_congelados_en (timestamp with time zone), ambas nullable.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'cff_historial'
  AND column_name IN ('insumos_congelados', 'insumos_congelados_en');

-- 2. Firmas sin cambios — debe devolver exactamente 1 fila cada una,
-- mismos tipos que antes de esta migración.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS firma
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('_calcular_cff_puro', '_calcular_cff_interno');

-- 3. _calcular_cff_puro() debe devolver 'insumos_actuales' con los 6
-- campos, en AMBAS ramas — probar con una organización real y con una
-- ficticia sin diagnóstico (rama IAO insuficiente):
-- SELECT _calcular_cff_puro('<org_id_real>', <iao_actual>, true);
-- SELECT _calcular_cff_puro('<org_id_cualquiera>', NULL, false);
-- -- Ambas deben incluir la clave 'insumos_actuales' con los 6 campos
-- -- (algunos pueden ser NULL si la ficha está incompleta, eso es
-- -- esperado — la clave debe existir siempre, los valores no).

-- 4. Congelado en el primer cálculo — con una organización de prueba SIN
-- fila todavía en cff_historial para un período nuevo:
-- SELECT _calcular_cff_interno('<org_id_prueba>', '<periodo_nuevo>', <iao>, true);
-- SELECT insumos_congelados, insumos_congelados_en FROM cff_historial WHERE organizacion_id = '<org_id_prueba>' AND periodo = '<periodo_nuevo>';
-- -- insumos_congelados debe coincidir exactamente con los 6 campos
-- -- vigentes en `organizaciones` en ese momento; insumos_congelados_en
-- -- debe ser ~ahora (la hora de esta llamada).

-- 5. Congelado se preserva en un recálculo posterior — con la fila del
-- paso 4 ya creada, cambiar salario_promedio de la organización de
-- prueba (vía actualizar_ficha_financiera o UPDATE directo) y forzar un
-- recálculo del mismo período, esperando unos segundos entre pasos:
-- UPDATE organizaciones SET salario_promedio = salario_promedio + 999999 WHERE id = '<org_id_prueba>';
-- SELECT _calcular_cff_interno('<org_id_prueba>', '<periodo_nuevo>', <iao>, true);
-- SELECT insumos_congelados->>'salario_promedio', insumos_congelados_en FROM cff_historial WHERE organizacion_id = '<org_id_prueba>' AND periodo = '<periodo_nuevo>';
-- -- salario_promedio debe seguir siendo el ORIGINAL (paso 4), NO el
-- -- +999999 recién guardado, e insumos_congelados_en debe seguir siendo
-- -- la hora del paso 4, NO la de este recálculo — costo_desenganche/
-- -- costo_rotacion SÍ deben haber cambiado con el nuevo salario (la
-- -- fórmula usa el insumo VIGENTE, solo insumos_congelados/_en quedan
-- -- fijos).

-- 6. Backfill perezoso — con una fila de cff_historial creada ANTES de
-- aplicar esta migración (ambas columnas deben ser NULL recién aplicada
-- la ALTER TABLE):
-- SELECT insumos_congelados, insumos_congelados_en FROM cff_historial WHERE periodo = '<periodo_pre_migracion>';  -- NULL, NULL
-- -- Forzar un recálculo de ese período (actualizar_ficha_financiera o
-- -- guardar_seguimiento_mensual con datos que apunten a ese período):
-- SELECT insumos_congelados, insumos_congelados_en FROM cff_historial WHERE periodo = '<periodo_pre_migracion>';
-- -- Ahora insumos_congelados debe tener los 6 campos con los valores
-- -- VIGENTES en el momento de este recálculo (no los originales del
-- -- período — limitación documentada en la cabecera, no un bug), e
-- -- insumos_congelados_en debe ser la hora de ESTE recálculo — la señal
-- -- que permite reconocer después que este congelado fue un backfill
-- -- perezoso y no el original.

-- 7. Regresión — comparar los 5 números de costo (los mismos de la
-- verificación #4 de la migración 019) antes/después de esta migración
-- para una organización real ya calculada, deben coincidir exactamente
-- (esta migración no toca ninguna fórmula, solo agrega reporte/congelado):
-- SELECT costo_desenganche, costo_rotacion, costo_ausentismo, costo_retrabajo, costo_total
-- FROM cff_historial WHERE organizacion_id = '<org_id>' ORDER BY periodo DESC LIMIT 1;
