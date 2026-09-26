-- ══════════════════════════════════════════════════════════════════
-- 044 — guardas de versionado en las 3 funciones append-only de PIIO
--
-- Cierra PENDIENTES_BRECHAS_WORKER_MOTORES.md §5. Caracterizado por
-- ejecución (pglite, rol `authenticated` real) sobre 041:
--
--   registrar_nodo_piio -- una versión nueva que empieza antes (o en el
--   mismo período, o justo el período siguiente) que la abierta violaba el
--   CHECK de node_hierarchy (031: active_from < active_to estricto) con el
--   mensaje crudo `violates check constraint "node_hierarchy_check"`, sin
--   decir por qué.
--
--   registrar_metric_definition_piio / registrar_reference_spec_piio --
--   NO tienen ningún CHECK sobre valid_to: una versión retroactiva o del
--   mismo período dejaba la versión anterior con valid_to < valid_from
--   (intervalo INVERTIDO) SIN error. 3 filas corruptas en la prueba.
--   (Producción verificada limpia: 0 filas invertidas al escribir esto.)
--
-- SEMÁNTICA DECIDIDA (Luis, 2026-09-26): node_hierarchy.active_to es FIN
-- EXCLUSIVO -- la versión rige en [active_from, active_to). Se cierra la
-- versión abierta con active_to = active_from de la nueva, y el CHECK
-- estricto de 031 (active_from < active_to) se mantiene: ahora SÍ admite una
-- versión de un solo período. metric_definitions y reference_specs siguen
-- INCLUSIVOS (valid_to = último período; `_vigente` de motor-piio/
-- referencias.js compara con valid_to inclusivo). Producción no tiene filas
-- de nodo cerradas (verificado), así que el cambio no deja datos con la
-- convención anterior; 041 cerraba con "período anterior" (inclusivo) y esta
-- migración lo reemplaza.
-- ══════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════
-- 1. registrar_nodo_piio
-- active_to EXCLUSIVO: la abierta se cierra con active_to = nuevo
-- active_from; para que el CHECK (active_from < active_to) se cumpla, el
-- nuevo active_from debe ser ESTRICTAMENTE posterior al de la abierta.
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION motores_eficiencia.registrar_nodo_piio(
  p_organization_id  uuid,
  p_nodo              jsonb
) RETURNS text
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
DECLARE
  v_node_id        text := p_nodo->>'node_id';
  v_active_from    text := p_nodo->>'active_from';
  v_abierta_desde  text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'no autenticado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM consultor_organizacion
    WHERE consultor_id = auth.uid() AND organizacion_id = p_organization_id)
  THEN RAISE EXCEPTION 'no autorizado — el consultor no está asignado a esta organización'; END IF;

  SELECT active_from INTO v_abierta_desde
  FROM motores_eficiencia.node_hierarchy
  WHERE organization_id = p_organization_id AND node_id = v_node_id AND active_to IS NULL;

  IF v_abierta_desde IS NOT NULL AND v_active_from <= v_abierta_desde THEN
    RAISE EXCEPTION 'nodo "%": no se puede registrar una versión desde % -- la versión vigente empezó en %; la nueva debe empezar estrictamente después (active_to es fin exclusivo y node_hierarchy exige active_from < active_to, 031).',
      v_node_id, v_active_from, v_abierta_desde;
  END IF;

  UPDATE motores_eficiencia.node_hierarchy
  SET active_to = v_active_from
  WHERE organization_id = p_organization_id AND node_id = v_node_id AND active_to IS NULL;

  INSERT INTO motores_eficiencia.node_hierarchy
  SELECT (jsonb_populate_record(
    NULL::motores_eficiencia.node_hierarchy,
    jsonb_build_object('created_at', now(), 'active_to', NULL)
      || p_nodo || jsonb_build_object('organization_id', p_organization_id)
  )).*;

  RETURN v_node_id;
END;
$$;

-- ══════════════════════════════════════════════════════════════════
-- 2. registrar_metric_definition_piio
-- valid_to es INCLUSIVO y no hay CHECK: una versión de un solo período
-- (valid_from = valid_to) es válida. Lo inválido es que la nueva versión
-- no empiece estrictamente DESPUÉS de la abierta (valid_to < valid_from).
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION motores_eficiencia.registrar_metric_definition_piio(
  p_organization_id  uuid,
  p_metric            jsonb
) RETURNS text
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
DECLARE
  v_metric_definition_id text := p_metric->>'metric_definition_id';
  v_valid_from            text := p_metric->>'valid_from';
  v_abierta_desde         text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'no autenticado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM consultor_organizacion
    WHERE consultor_id = auth.uid() AND organizacion_id = p_organization_id)
  THEN RAISE EXCEPTION 'no autorizado — el consultor no está asignado a esta organización'; END IF;

  SELECT valid_from INTO v_abierta_desde
  FROM motores_eficiencia.metric_definitions
  WHERE organization_id = p_organization_id AND metric_definition_id = v_metric_definition_id AND valid_to IS NULL;

  IF v_abierta_desde IS NOT NULL AND v_valid_from <= v_abierta_desde THEN
    RAISE EXCEPTION 'métrica "%": la nueva versión debe empezar después de la vigente -- la versión vigente empieza en % y la nueva pide empezar en %. Cerrar la vigente el período anterior dejaría valid_to < valid_from (intervalo invertido).',
      v_metric_definition_id, v_abierta_desde, v_valid_from;
  END IF;

  UPDATE motores_eficiencia.metric_definitions
  SET valid_to = to_char((to_date(v_valid_from || '-01', 'YYYY-MM-DD') - interval '1 month'), 'YYYY-MM')
  WHERE organization_id = p_organization_id
    AND metric_definition_id = v_metric_definition_id
    AND valid_to IS NULL;

  INSERT INTO motores_eficiencia.metric_definitions
  SELECT (jsonb_populate_record(
    NULL::motores_eficiencia.metric_definitions,
    jsonb_build_object('created_at', now(), 'updated_at', now(), 'valid_to', NULL)
      || p_metric || jsonb_build_object('organization_id', p_organization_id)
  )).*;

  RETURN v_metric_definition_id;
END;
$$;

-- ══════════════════════════════════════════════════════════════════
-- 3. registrar_reference_spec_piio
-- Mismo criterio, sobre la versión que `supersedes` señala. Si esa versión
-- no existe, el comportamiento de 041 no cambia (no cierra nada) -- ver la
-- observación en PENDIENTES §5.
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION motores_eficiencia.registrar_reference_spec_piio(
  p_organization_id  uuid,
  p_reference         jsonb
) RETURNS text
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
DECLARE
  v_reference_id   text := p_reference->>'reference_id';
  v_supersedes     text := p_reference->>'supersedes';
  v_valid_from     text := p_reference->>'valid_from';
  v_superada_desde text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'no autenticado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM consultor_organizacion
    WHERE consultor_id = auth.uid() AND organizacion_id = p_organization_id)
  THEN RAISE EXCEPTION 'no autorizado — el consultor no está asignado a esta organización'; END IF;

  IF v_supersedes IS NOT NULL THEN
    SELECT valid_from INTO v_superada_desde
    FROM motores_eficiencia.reference_specs
    WHERE organization_id = p_organization_id AND reference_id = v_reference_id AND version = v_supersedes
      AND (valid_to IS NULL OR valid_to >= v_valid_from);

    IF v_superada_desde IS NOT NULL AND v_valid_from <= v_superada_desde THEN
      RAISE EXCEPTION 'referencia "%": la nueva versión debe empezar después de la que reemplaza ("%") -- esa versión empieza en % y la nueva pide empezar en %. Cerrarla el período anterior dejaría valid_to < valid_from (intervalo invertido).',
        v_reference_id, v_supersedes, v_superada_desde, v_valid_from;
    END IF;

    UPDATE motores_eficiencia.reference_specs
    SET valid_to = to_char((to_date(v_valid_from || '-01', 'YYYY-MM-DD') - interval '1 month'), 'YYYY-MM')
    WHERE organization_id = p_organization_id
      AND reference_id = v_reference_id
      AND version = v_supersedes
      AND (valid_to IS NULL OR valid_to >= v_valid_from);
  END IF;

  INSERT INTO motores_eficiencia.reference_specs
  SELECT (jsonb_populate_record(
    NULL::motores_eficiencia.reference_specs,
    jsonb_build_object('created_at', now(), 'valid_to', NULL)
      || p_reference || jsonb_build_object('organization_id', p_organization_id)
  )).*;

  RETURN v_reference_id;
END;
$$;

-- ══════════════════════════════════════════════════════════════════
-- Grants + revoke blanket (AUDITORIA_SUPABASE_MOTORES.md §5). CREATE OR
-- REPLACE conserva los privilegios previos, pero se re-declaran explícitos.
-- ══════════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION motores_eficiencia.registrar_nodo_piio(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION motores_eficiencia.registrar_metric_definition_piio(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION motores_eficiencia.registrar_reference_spec_piio(uuid, jsonb) TO authenticated;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA motores_eficiencia FROM PUBLIC;

-- ══════════════════════════════════════════════════════════════════
-- Verificación manual sugerida (post-aplicación en Supabase):
-- 1. Repetir el caso retroactivo con datos desechables: debe fallar con el
--    mensaje explicativo, no con `node_hierarchy_check`.
-- 2. select count(*) from motores_eficiencia.metric_definitions
--    where valid_to < valid_from;  -- 0 (igual para reference_specs)
-- 3. select has_function_privilege('anon',
--    'motores_eficiencia.registrar_nodo_piio(uuid,jsonb)', 'EXECUTE'); -- false
-- ══════════════════════════════════════════════════════════════════
