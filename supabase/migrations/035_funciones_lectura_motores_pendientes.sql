-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 035: 6 funciones de lectura para los datos que
-- los 8 motores necesitan leer antes de poder calcular.
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- Transcribe DISENO_WORKER_EJECUCION_MOTORES.md §2. Cierra el mismo
-- problema que `033`/`034` cerraron para escritura: hoy nadie, ni
-- siquiera el consultor autenticado, puede leer una fila de
-- `motores_eficiencia` — schema cerrado (`030`/`032`/`033`), sin ningún
-- `GRANT SELECT`. Patrón B exacto de `034` (`auth.uid()` +
-- `consultor_organizacion`), `authenticated` únicamente — ningún motor
-- de cálculo se consulta anónimamente.
--
-- `motor-iao` y `motor-aie` NO tienen función de lectura propia — el
-- primero consume la salida ya calculada de `motor-ice-ieh` (reusa la
-- función 1 de esta migración), el segundo orquesta los otros motores
-- (reusa 1/2/6 + el ensamblador `motor-aie/runCase.js`) — DISEÑO §2,
-- cierre.
--
-- `comite_eficiencia`/`remediacion_autorizada`/`invitaciones_*` NO
-- tienen función de lectura aquí — ningún motor de cálculo las necesita
-- (DISEÑO §2, alcance acotado a propósito).
--
-- ── Regla permanente aplicada (AUDITORIA_SUPABASE_MOTORES.md §5) ──
-- El `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA motores_eficiencia FROM
-- PUBLIC` inmediato, al final de esta migración, es LO ÚNICO que
-- protege estas 6 funciones nuevas — verificado por ejecución (PGlite)
-- que `ALTER DEFAULT PRIVILEGES ... IN SCHEMA ...` no hace nada (causa
-- raíz: documentación oficial de Postgres, "per-schema default
-- privileges can only add privileges to the global setting, not remove
-- privileges granted by it"). No se usa esa sentencia aquí — sería
-- código muerto, ya descartado explícitamente.
-- ══════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════
-- 1. leer_respuestas_ice_ieh — plana, un SETOF directo de la tabla.
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION motores_eficiencia.leer_respuestas_ice_ieh(
  p_organization_id uuid, p_period text
) RETURNS SETOF motores_eficiencia.ice_ieh_respuestas
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'no autenticado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM consultor_organizacion
    WHERE consultor_id = auth.uid() AND organizacion_id = p_organization_id)
  THEN RAISE EXCEPTION 'no autorizado — el consultor no está asignado a esta organización'; END IF;

  RETURN QUERY
  SELECT * FROM motores_eficiencia.ice_ieh_respuestas
  WHERE organization_id = p_organization_id AND period = p_period;
END;
$$;
GRANT EXECUTE ON FUNCTION motores_eficiencia.leer_respuestas_ice_ieh(uuid, text) TO authenticated;
COMMENT ON FUNCTION motores_eficiencia.leer_respuestas_ice_ieh(uuid, text) IS
  'DISENO_WORKER_EJECUCION_MOTORES.md §2, función 1. Alimenta motor-ice-ieh '
  'directo, y motor-iao vía el adaptador de motor-integracion/pipeline.js.';


-- ══════════════════════════════════════════════════════════════════
-- 2. leer_respuestas_sdmo — por rango de jornada (033: period → jornada date).
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION motores_eficiencia.leer_respuestas_sdmo(
  p_organization_id uuid, p_desde date, p_hasta date
) RETURNS SETOF motores_eficiencia.sdmo_respuestas
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'no autenticado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM consultor_organizacion
    WHERE consultor_id = auth.uid() AND organizacion_id = p_organization_id)
  THEN RAISE EXCEPTION 'no autorizado — el consultor no está asignado a esta organización'; END IF;

  RETURN QUERY
  SELECT * FROM motores_eficiencia.sdmo_respuestas
  WHERE organization_id = p_organization_id AND jornada BETWEEN p_desde AND p_hasta;
END;
$$;
GRANT EXECUTE ON FUNCTION motores_eficiencia.leer_respuestas_sdmo(uuid, date, date) TO authenticated;
COMMENT ON FUNCTION motores_eficiencia.leer_respuestas_sdmo(uuid, date, date) IS
  'DISENO_WORKER_EJECUCION_MOTORES.md §2, función 2. Rango de jornada, no '
  'period — 033 corrigió sdmo_respuestas para la cadencia de 3x/semana.';


-- ══════════════════════════════════════════════════════════════════
-- 3. leer_respuestas_fpv — plana.
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION motores_eficiencia.leer_respuestas_fpv(
  p_organization_id uuid, p_period text
) RETURNS SETOF motores_eficiencia.fpv_respuestas
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'no autenticado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM consultor_organizacion
    WHERE consultor_id = auth.uid() AND organizacion_id = p_organization_id)
  THEN RAISE EXCEPTION 'no autorizado — el consultor no está asignado a esta organización'; END IF;

  RETURN QUERY
  SELECT * FROM motores_eficiencia.fpv_respuestas
  WHERE organization_id = p_organization_id AND period = p_period;
END;
$$;
GRANT EXECUTE ON FUNCTION motores_eficiencia.leer_respuestas_fpv(uuid, text) TO authenticated;
COMMENT ON FUNCTION motores_eficiencia.leer_respuestas_fpv(uuid, text) IS
  'DISENO_WORKER_EJECUCION_MOTORES.md §2, función 3.';


-- ══════════════════════════════════════════════════════════════════
-- 4. leer_eventos_cff — anidada (evento + sus componentes), porque
-- runCFF(caso) espera caso.eventos[].components[]. El join/anidado se
-- hace una vez en SQL, no en el Worker.
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION motores_eficiencia.leer_eventos_cff(
  p_organization_id uuid, p_period_start text, p_period_end text
) RETURNS jsonb
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
DECLARE v_out jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'no autenticado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM consultor_organizacion
    WHERE consultor_id = auth.uid() AND organizacion_id = p_organization_id)
  THEN RAISE EXCEPTION 'no autorizado — el consultor no está asignado a esta organización'; END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(e) || jsonb_build_object('components', comp.arr)), '[]'::jsonb)
    INTO v_out
  FROM motores_eficiencia.cff_events e
  CROSS JOIN LATERAL (
    SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) AS arr
    FROM motores_eficiencia.cff_event_components c
    WHERE c.organization_id = e.organization_id AND c.event_id = e.event_id
  ) comp
  WHERE e.organization_id = p_organization_id
    AND e.period_start >= p_period_start AND e.period_end <= p_period_end;

  RETURN v_out;
END;
$$;
GRANT EXECUTE ON FUNCTION motores_eficiencia.leer_eventos_cff(uuid, text, text) TO authenticated;
COMMENT ON FUNCTION motores_eficiencia.leer_eventos_cff(uuid, text, text) IS
  'DISENO_WORKER_EJECUCION_MOTORES.md §2, función 4. Devuelve [{...evento, '
  'components:[...]}] — forma exacta de caso.eventos que runCFF() exige.';


-- ══════════════════════════════════════════════════════════════════
-- 5. leer_epd_ifd — plana.
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION motores_eficiencia.leer_epd_ifd(
  p_organization_id uuid
) RETURNS SETOF motores_eficiencia.ifd_epd
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'no autenticado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM consultor_organizacion
    WHERE consultor_id = auth.uid() AND organizacion_id = p_organization_id)
  THEN RAISE EXCEPTION 'no autorizado — el consultor no está asignado a esta organización'; END IF;

  RETURN QUERY
  SELECT * FROM motores_eficiencia.ifd_epd WHERE organization_id = p_organization_id;
END;
$$;
GRANT EXECUTE ON FUNCTION motores_eficiencia.leer_epd_ifd(uuid) TO authenticated;
COMMENT ON FUNCTION motores_eficiencia.leer_epd_ifd(uuid) IS
  'DISENO_WORKER_EJECUCION_MOTORES.md §2, función 5.';


-- ══════════════════════════════════════════════════════════════════
-- 6. leer_datos_piio — arma el PIIO_INPUT completo en un solo jsonb, con
-- los nombres EXACTOS que runPIIO.js/config.js/observaciones.js leen
-- (verificado por grep de "input.<campo>" contra los 3 archivos —
-- `references`, NO `reference_specs`: el campo del contrato y el nombre
-- de la tabla NO coinciden). node_hierarchy sale de la vista
-- `node_hierarchy_vigente` (031), no de la tabla cruda.
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION motores_eficiencia.leer_datos_piio(
  p_organization_id uuid, p_periods text[]
) RETURNS jsonb
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
DECLARE v_out jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'no autenticado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM consultor_organizacion
    WHERE consultor_id = auth.uid() AND organizacion_id = p_organization_id)
  THEN RAISE EXCEPTION 'no autorizado — el consultor no está asignado a esta organización'; END IF;

  SELECT jsonb_build_object(
    'organization_id', p_organization_id::text,
    'periods', to_jsonb(p_periods),
    'node_hierarchy', (SELECT coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb)
      FROM motores_eficiencia.node_hierarchy_vigente n WHERE n.organization_id = p_organization_id),
    'observations', (SELECT coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb)
      FROM motores_eficiencia.observations o
      WHERE o.organization_id = p_organization_id AND o.period_start = ANY(p_periods)),
    'domain_catalog', (SELECT coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb)
      FROM motores_eficiencia.domain_catalog d WHERE d.organization_id = p_organization_id),
    'phenomenon_catalog', (SELECT coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb)
      FROM motores_eficiencia.phenomenon_catalog f WHERE f.organization_id = p_organization_id),
    'metric_definitions', (SELECT coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
      FROM motores_eficiencia.metric_definitions m WHERE m.organization_id = p_organization_id),
    'references', (SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
      FROM motores_eficiencia.reference_specs r WHERE r.organization_id = p_organization_id),
    'kpi_specs', (SELECT coalesce(jsonb_agg(to_jsonb(k)), '[]'::jsonb)
      FROM motores_eficiencia.kpi_specs k WHERE k.organization_id = p_organization_id),
    'evidence_groups', (SELECT coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb)
      FROM motores_eficiencia.evidence_groups g WHERE g.organization_id = p_organization_id)
  ) INTO v_out;

  RETURN v_out;
END;
$$;
GRANT EXECUTE ON FUNCTION motores_eficiencia.leer_datos_piio(uuid, text[]) TO authenticated;
COMMENT ON FUNCTION motores_eficiencia.leer_datos_piio(uuid, text[]) IS
  'DISENO_WORKER_EJECUCION_MOTORES.md §2, función 6. Forma PIIO_INPUT '
  'exacta para runPIIOCompleto() — campo "references", no "reference_specs" '
  '(nombre de tabla y nombre de contrato NO coinciden, verificado).';


-- ══════════════════════════════════════════════════════════════════
-- Acceso — REVOKE inmediato, mismo criterio que 034 y la regla
-- permanente de AUDITORIA_SUPABASE_MOTORES.md §5. Sin ALTER DEFAULT
-- PRIVILEGES per-schema — no protege nada, descartado explícitamente.
-- ══════════════════════════════════════════════════════════════════
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA motores_eficiencia FROM PUBLIC;


-- ══════════════════════════════════════════════════════════════════
-- Verificación sugerida tras aplicar
-- ══════════════════════════════════════════════════════════════════
-- 1. SELECT routine_name FROM information_schema.routines
--    WHERE routine_schema = 'motores_eficiencia' AND routine_name LIKE 'leer_%'
--    ORDER BY 1;   → 6 funciones.
-- 2. SELECT routine_name, grantee FROM information_schema.role_routine_grants
--    WHERE routine_schema = 'motores_eficiencia' AND routine_name LIKE 'leer_%'
--    ORDER BY 1, 2;
--    → cada una con exactamente 'authenticated' + 'postgres' (el dueño) —
--      CERO filas con grantee='PUBLIC'.
-- 3. Con un consultor real: leer_respuestas_ice_ieh de una organización
--    propia → debe funcionar; de una organización ajena → debe fallar
--    "no autorizado".
