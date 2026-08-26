-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 022: Panel "Seguimiento mensual" — captura +
-- comparación de períodos
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- Diseño completo discutido y aprobado con Luis antes de escribir este
-- archivo — ver C:\Users\Luis Caicedo\.claude\plans\shimmying-skipping-lark.md,
-- Parte 2, secciones 2.2/2.3/2.4/2.5. Resumen de lo que resuelve:
--
-- 1. Siembra 8 filas nuevas en calibracion_parametros (ambito='local',
--    mu0=NULL, sin shrinkage) — 5 que alimentan el CFF (espejo de los
--    campos financieros de organizaciones) + 3 informativos
--    (productividad, accidentalidad, presentismo). Migración 020 dejó
--    calibracion_observaciones creada pero SIN ningún path de escritura
--    real — esta migración construye el primero.
-- 2. guardar_seguimiento_mensual(): único punto de escritura. Usa
--    periodo='YYYY-MM' (formato NUEVO, coexiste en la misma columna
--    text con el 'YYYY-Sn' que ya usan lambda/s_rot/etc. — nunca se
--    comparan periodos de parametro distinto, así que no hay conflicto).
--    A diferencia de actualizar_ficha_financiera() (migración 019, sin
--    COALESCE — ver hallazgo en el header de esa función), este SÍ usa
--    COALESCE al actualizar organizaciones: un campo no enviado en un
--    guardado parcial no debe borrar el valor vigente.
-- 3. comparar_periodos() + _periodo_a_clave_ordenable() +
--    _periodo_a_semestre(): reemplazo explícito del "ORDER BY periodo
--    DESC" lexicográfico frágil (falla apenas aparece un periodo
--    mensual junto a uno semestral, o cruza un cambio de década).
--    Los 3 sitios que hoy usan ese ORDER BY frágil (actualizar_ficha_
--    financiera, simular_ift) NO se tocan en esta migración —
--    confirmado con Luis como su propia pieza aparte, pequeña e
--    independiente (Anexo 2 del plan).
--
-- ── Nota sobre el trigger de calibracion_observaciones (migración 020) ──
-- trg_calibracion_observaciones_recalcular es genérico — también se
-- dispara para estos 8 parámetros nuevos. Como mu0=NULL en los 8,
-- recalcular_calibracion_parametro() deja mu_post=NULL (correcto, sin
-- blend) pero SÍ actualiza n_acumulado — y lo hace contando TODAS las
-- observaciones de ese parametro en TODAS las organizaciones (pooling
-- global), aunque ambito='local'. El número queda inerte (nada lo lee
-- para parametros locales) pero es semánticamente engañoso si alguien
-- lo mira esperando "observaciones de esta organización". No se toca
-- el trigger — está fuera de alcance de esta pieza, se documenta acá
-- para que no sorprenda a quien audite calibracion_parametros después.
-- ══════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════
-- 1. Sembrado — 8 filas nuevas en calibracion_parametros, ambito='local'.
--    mu0=NULL en todas (sin prior poblacional — son historial propio de
--    cada organización, no un parámetro del sistema a converger). Existen
--    solo para que la FK de calibracion_observaciones.parametro tenga un
--    padre válido y quede documentado qué es cada campo — mismo patrón
--    que delta_ida/s_sup en la migración 020.
-- ══════════════════════════════════════════════════════════════════

INSERT INTO calibracion_parametros (parametro, ambito, mu0, fuente_prior) VALUES
  ('salario_promedio_real', 'local', NULL,
    'Dato real por-organización (COP) — espejo histórico de organizaciones.salario_promedio. '
    'Sin prior poblacional, no aplica shrinkage.'),
  ('tasa_rotacion_base_real', 'local', NULL,
    'Dato real por-organización (0-100) — espejo histórico de organizaciones.tasa_rotacion_base. '
    'Sin prior poblacional, no aplica shrinkage.'),
  ('tasa_ausentismo_real', 'local', NULL,
    'Dato real por-organización, fracción = dias_ausencia_base/242 (misma conversión que '
    '_calcular_cff_puro, migración 019). Sin prior poblacional, no aplica shrinkage.'),
  ('costo_operativo_total_real', 'local', NULL,
    'Dato real por-organización (COP) — espejo histórico de organizaciones.costo_operativo_total. '
    'Sin prior poblacional, no aplica shrinkage.'),
  ('tasa_retrabajo_observada', 'local', NULL,
    'Dato real por-organización, fracción = tasa_retrabajo_real/100. Sin prior poblacional, '
    'no aplica shrinkage.'),
  ('productividad', 'local', NULL,
    'Informativo, no alimenta el CFF. Número absoluto sin normalizar — el consultor define '
    'libremente la unidad (unidades/hora, ventas/empleado, la que la organización ya lleve). '
    'Confirmado con Luis 2026-08-26: el sistema no interpreta la magnitud, solo calcula tendencia '
    'sobre el valor crudo capturado.'),
  ('accidentalidad', 'local', NULL,
    'Informativo, no alimenta el CFF. "Frecuencia de accidentalidad" = (N° accidentes de trabajo '
    'en el mes / N° trabajadores en el mes) × 100 — Artículo 30 (Cap. IV), Resolución 0312 de 2019, '
    'Ministerio del Trabajo (Colombia), medición mensual. Se guarda tal cual, sin conversión a '
    'estándar extranjero. Obligatorio para organizaciones >50 trabajadores o cualquier tamaño con '
    'riesgo IV/V — organizaciones más pequeñas pueden no tenerlo calculado todavía.'),
  ('presentismo', 'local', NULL,
    'Informativo, no alimenta el CFF. Escala 1-5, CUALITATIVO — estimación del consultor, mismo '
    'tratamiento que F_ext (marco): no es una medición dura. La UI debe marcarlo explícitamente '
    'como estimación cualitativa.');

-- mu_post se queda NULL en las 8 (mu0 IS NULL) — coherente con el UPDATE
-- genérico de la migración 020 (`SET mu_post = mu0`), no hace falta repetirlo.


-- ══════════════════════════════════════════════════════════════════
-- 2. _periodo_a_clave_ordenable / comparar_periodos / _periodo_a_semestre
--    — reemplazo explícito del "ORDER BY periodo DESC" lexicográfico.
--    Soportan los 2 formatos que hoy coexisten en la columna `periodo`:
--    'YYYY-Sn' (semestral, ya en uso) y 'YYYY-MM' (mensual, nuevo en
--    esta migración). Se crean ANTES de guardar_seguimiento_mensual()
--    porque esa función llama a _periodo_a_semestre() — orden de
--    dependencia, no coincide con la numeración 2.4/2.5 del plan.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION _periodo_a_clave_ordenable(p_periodo text) RETURNS int
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v_anio int; v_mes int;
BEGIN
  IF p_periodo ~ '^\d{4}-S[12]$' THEN
    v_anio := substring(p_periodo from 1 for 4)::int;
    v_mes  := CASE WHEN right(p_periodo,1) = '1' THEN 1 ELSE 7 END;   -- S1→enero, S2→julio
  ELSIF p_periodo ~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    v_anio := substring(p_periodo from 1 for 4)::int;
    v_mes  := substring(p_periodo from 6 for 2)::int;
  ELSE
    RAISE EXCEPTION 'periodo con formato no reconocido: %', p_periodo;
  END IF;
  RETURN v_anio * 100 + v_mes;
END;
$$;

COMMENT ON FUNCTION _periodo_a_clave_ordenable(text) IS
  'Convierte "YYYY-Sn" o "YYYY-MM" a un entero AAAAMM ordenable. Uso interno '
  '(ORDER BY _periodo_a_clave_ordenable(periodo) DESC) — sin GRANT a authenticated, '
  'expuesta vía comparar_periodos() para lógica explícita desde el cliente.';

CREATE OR REPLACE FUNCTION comparar_periodos(p_a text, p_b text) RETURNS int
LANGUAGE sql IMMUTABLE AS $$
  SELECT sign(_periodo_a_clave_ordenable(p_a) - _periodo_a_clave_ordenable(p_b))::int;  -- -1/0/1
$$;

COMMENT ON FUNCTION comparar_periodos(text, text) IS
  'Compara 2 periodos ("YYYY-Sn" o "YYYY-MM"), devuelve -1 si p_a es anterior a p_b, '
  '0 si son el mismo periodo (mismo AAAAMM ordenable), 1 si p_a es posterior.';

GRANT EXECUTE ON FUNCTION comparar_periodos(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION _periodo_a_semestre(p_periodo text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v_anio int; v_mes int;
BEGIN
  IF p_periodo ~ '^\d{4}-S[12]$' THEN RETURN p_periodo; END IF;
  IF p_periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'periodo con formato no reconocido: %', p_periodo;
  END IF;
  v_anio := substring(p_periodo from 1 for 4)::int;
  v_mes  := substring(p_periodo from 6 for 2)::int;
  RETURN v_anio || '-S' || (CASE WHEN v_mes <= 6 THEN 1 ELSE 2 END);
END;
$$;

COMMENT ON FUNCTION _periodo_a_semestre(text) IS
  'Mapea un periodo mensual ("YYYY-MM") a su semestre contenedor ("YYYY-Sn"). '
  'Un periodo ya semestral se devuelve sin cambios. Uso interno — sin GRANT.';


-- ══════════════════════════════════════════════════════════════════
-- 3. guardar_seguimiento_mensual() — único punto de escritura del
--    panel "Seguimiento mensual". Upsert en calibracion_observaciones
--    (uno por campo no-nulo, con la conversión de unidad de la tabla
--    2.2 del plan) + actualiza el valor vigente en organizaciones
--    (solo los 5 campos que alimentan el CFF, con COALESCE) + recalcula
--    cff_historial si el semestre correspondiente ya tiene una fila.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION guardar_seguimiento_mensual(
  p_organizacion_id        uuid,
  p_periodo                text,     -- 'YYYY-MM', obligatorio
  p_salario_promedio       numeric DEFAULT NULL,
  p_tasa_rotacion_base     numeric DEFAULT NULL,
  p_dias_ausencia_base     numeric DEFAULT NULL,
  p_costo_operativo_total  numeric DEFAULT NULL,
  p_tasa_retrabajo_real    numeric DEFAULT NULL,
  p_productividad          numeric DEFAULT NULL,
  p_accidentalidad         numeric DEFAULT NULL,
  p_presentismo            numeric DEFAULT NULL
) RETURNS jsonb
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_periodo_semestral text;
  v_iao_existente     numeric;
  v_recalculo_intentado boolean := false;
  v_recalculo_ok        boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE organizacion_id = p_organizacion_id AND consultor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'no autorizado para esta organización';
  END IF;

  -- Este panel es específicamente mensual (ver plan, sección 2.3) — a
  -- diferencia de comparar_periodos()/_periodo_a_semestre(), que aceptan
  -- también 'YYYY-Sn' porque leen periodos ya existentes de otros
  -- parametros, aquí se rechaza cualquier cosa que no sea 'YYYY-MM' para
  -- no crear filas semestrales mezcladas dentro de estos 8 parametros.
  IF p_periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'periodo inválido para seguimiento mensual — se espera formato YYYY-MM, recibido: %', p_periodo;
  END IF;

  IF p_presentismo IS NOT NULL AND (p_presentismo < 1 OR p_presentismo > 5) THEN
    RAISE EXCEPTION 'presentismo inválido — debe estar entre 1 y 5';
  END IF;

  IF p_salario_promedio IS NOT NULL THEN
    INSERT INTO calibracion_observaciones (organizacion_id, periodo, parametro, valor_observado, fuente)
    VALUES (p_organizacion_id, p_periodo, 'salario_promedio_real', p_salario_promedio, 'real')
    ON CONFLICT (organizacion_id, periodo, parametro) DO UPDATE SET valor_observado = EXCLUDED.valor_observado, capturado_en = now();
  END IF;

  IF p_tasa_rotacion_base IS NOT NULL THEN
    INSERT INTO calibracion_observaciones (organizacion_id, periodo, parametro, valor_observado, fuente)
    VALUES (p_organizacion_id, p_periodo, 'tasa_rotacion_base_real', p_tasa_rotacion_base, 'real')
    ON CONFLICT (organizacion_id, periodo, parametro) DO UPDATE SET valor_observado = EXCLUDED.valor_observado, capturado_en = now();
  END IF;

  IF p_dias_ausencia_base IS NOT NULL THEN
    INSERT INTO calibracion_observaciones (organizacion_id, periodo, parametro, valor_observado, fuente)
    VALUES (p_organizacion_id, p_periodo, 'tasa_ausentismo_real', p_dias_ausencia_base / 242.0, 'real')
    ON CONFLICT (organizacion_id, periodo, parametro) DO UPDATE SET valor_observado = EXCLUDED.valor_observado, capturado_en = now();
  END IF;

  IF p_costo_operativo_total IS NOT NULL THEN
    INSERT INTO calibracion_observaciones (organizacion_id, periodo, parametro, valor_observado, fuente)
    VALUES (p_organizacion_id, p_periodo, 'costo_operativo_total_real', p_costo_operativo_total, 'real')
    ON CONFLICT (organizacion_id, periodo, parametro) DO UPDATE SET valor_observado = EXCLUDED.valor_observado, capturado_en = now();
  END IF;

  IF p_tasa_retrabajo_real IS NOT NULL THEN
    INSERT INTO calibracion_observaciones (organizacion_id, periodo, parametro, valor_observado, fuente)
    VALUES (p_organizacion_id, p_periodo, 'tasa_retrabajo_observada', p_tasa_retrabajo_real / 100.0, 'real')
    ON CONFLICT (organizacion_id, periodo, parametro) DO UPDATE SET valor_observado = EXCLUDED.valor_observado, capturado_en = now();
  END IF;

  IF p_productividad IS NOT NULL THEN
    INSERT INTO calibracion_observaciones (organizacion_id, periodo, parametro, valor_observado, fuente)
    VALUES (p_organizacion_id, p_periodo, 'productividad', p_productividad, 'real')
    ON CONFLICT (organizacion_id, periodo, parametro) DO UPDATE SET valor_observado = EXCLUDED.valor_observado, capturado_en = now();
  END IF;

  IF p_accidentalidad IS NOT NULL THEN
    INSERT INTO calibracion_observaciones (organizacion_id, periodo, parametro, valor_observado, fuente)
    VALUES (p_organizacion_id, p_periodo, 'accidentalidad', p_accidentalidad, 'real')
    ON CONFLICT (organizacion_id, periodo, parametro) DO UPDATE SET valor_observado = EXCLUDED.valor_observado, capturado_en = now();
  END IF;

  IF p_presentismo IS NOT NULL THEN
    INSERT INTO calibracion_observaciones (organizacion_id, periodo, parametro, valor_observado, fuente)
    VALUES (p_organizacion_id, p_periodo, 'presentismo', p_presentismo, 'real')
    ON CONFLICT (organizacion_id, periodo, parametro) DO UPDATE SET valor_observado = EXCLUDED.valor_observado, capturado_en = now();
  END IF;

  -- Valor vigente en organizaciones — solo los 5 que alimentan el CFF.
  -- COALESCE deliberado (a diferencia de actualizar_ficha_financiera,
  -- migración 019, que sobrescribe sin COALESCE): un campo no enviado
  -- en este guardado NO debe borrar el valor vigente.
  UPDATE organizaciones SET
    salario_promedio      = COALESCE(p_salario_promedio, salario_promedio),
    tasa_rotacion_base    = COALESCE(p_tasa_rotacion_base, tasa_rotacion_base),
    dias_ausencia_base    = COALESCE(p_dias_ausencia_base, dias_ausencia_base),
    costo_operativo_total = COALESCE(p_costo_operativo_total, costo_operativo_total),
    tasa_retrabajo_real   = COALESCE(p_tasa_retrabajo_real, tasa_retrabajo_real)
  WHERE id = p_organizacion_id;

  -- Disparo 2: si el semestre que contiene p_periodo ya tiene una fila
  -- en cff_historial, recalcula con los insumos frescos de organizaciones.
  -- A diferencia de actualizar_ficha_financiera() (que resuelve el
  -- "período vigente" consultando respuestas_cuestionario), acá el
  -- período ya viene explícito en el parámetro — se deriva su semestre
  -- directamente, sin consulta adicional.
  --
  -- El BEGIN/EXCEPTION solo protege contra un fallo genuino de
  -- _calcular_cff_interno() (un bug real, no un caso esperado de dato
  -- faltante — eso ya lo resuelve esa función devolviendo su propio
  -- 'incluido':false, sin lanzar excepción). El valor de retorno de ESTA
  -- función debe reflejar si el recálculo efectivamente corrió sin
  -- error, no solo si había un IAO disponible para intentarlo —
  -- devolver 'ok':true tapando una excepción real sería peor que dejarla
  -- propagarse, porque oculta el problema detrás de una respuesta que
  -- parece exitosa.
  v_periodo_semestral := _periodo_a_semestre(p_periodo);

  SELECT iao_org_usado INTO v_iao_existente
  FROM cff_historial
  WHERE organizacion_id = p_organizacion_id AND periodo = v_periodo_semestral;

  IF FOUND THEN
    v_recalculo_intentado := true;
    BEGIN
      PERFORM _calcular_cff_interno(p_organizacion_id, v_periodo_semestral, v_iao_existente, v_iao_existente IS NOT NULL);
      v_recalculo_ok := true;
    EXCEPTION WHEN OTHERS THEN
      v_recalculo_ok := false;
      RAISE WARNING 'guardar_seguimiento_mensual: recalculo de cff_historial falló para organizacion_id=%, periodo_semestral=% — %', p_organizacion_id, v_periodo_semestral, SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'periodo_semestral_recalculo_intentado', v_recalculo_intentado,
    'periodo_semestral_recalculo_ok', v_recalculo_ok
  );
END;
$$;

GRANT EXECUTE ON FUNCTION guardar_seguimiento_mensual(uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════

-- 1. Debe devolver 8 filas, ambito='local', mu0 IS NULL en todas.
SELECT parametro, ambito, mu0, mu_post
FROM calibracion_parametros
WHERE ambito = 'local'
ORDER BY parametro;

-- 2. comparar_periodos / _periodo_a_semestre.
SELECT comparar_periodos('2026-S1','2026-S2');   -- -1
SELECT comparar_periodos('2026-08','2026-07');   -- 1
SELECT comparar_periodos('2026-07','2026-07');   -- 0
SELECT _periodo_a_semestre('2026-08');           -- '2026-S2'
SELECT _periodo_a_semestre('2026-01');           -- '2026-S1'
SELECT _periodo_a_semestre('2026-S2');           -- '2026-S2' (passthrough)

-- 3. Guardar 2 veces el mismo mes — usar un organizacion_id real de prueba.
-- SELECT guardar_seguimiento_mensual('<uuid_org_prueba>', '2026-08', p_tasa_rotacion_base := 12.5);
-- SELECT guardar_seguimiento_mensual('<uuid_org_prueba>', '2026-08', p_tasa_rotacion_base := 13.0);
-- SELECT * FROM calibracion_observaciones WHERE organizacion_id = '<uuid_org_prueba>' AND parametro = 'tasa_rotacion_base_real';
-- -- Esperado: 1 sola fila, valor_observado=13.0, capturado_en actualizado.

-- 4. Guardar en un mes distinto — no debe sobrescribir el anterior.
-- SELECT guardar_seguimiento_mensual('<uuid_org_prueba>', '2026-07', p_tasa_rotacion_base := 11.0);
-- SELECT periodo, valor_observado FROM calibracion_observaciones WHERE organizacion_id = '<uuid_org_prueba>' AND parametro = 'tasa_rotacion_base_real' ORDER BY _periodo_a_clave_ordenable(periodo);
-- -- Esperado: 2 filas (2026-07=11.0, 2026-08=13.0).

-- 5. COALESCE — un campo NULL no debe borrar el valor vigente.
-- SELECT tasa_rotacion_base FROM organizaciones WHERE id = '<uuid_org_prueba>';  -- anotar valor (debe ser 13.0 tras el paso 3)
-- SELECT guardar_seguimiento_mensual('<uuid_org_prueba>', '2026-09', p_productividad := 42);  -- sin tocar tasa_rotacion_base
-- SELECT tasa_rotacion_base FROM organizaciones WHERE id = '<uuid_org_prueba>';  -- debe seguir en 13.0, NO haberse borrado.

-- 6. Formato inválido — debe fallar con excepción.
-- SELECT guardar_seguimiento_mensual('<uuid_org_prueba>', '2026-S2', p_productividad := 10);
-- -- Esperado: RAISE EXCEPTION 'periodo inválido para seguimiento mensual...'
