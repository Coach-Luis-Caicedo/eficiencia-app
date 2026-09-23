-- ══════════════════════════════════════════════════════════════════
-- 042 — motor-cff: relaciones económicas (cff_relaciones)
--
-- Cierra PENDIENTES_BRECHAS_WORKER_MOTORES.md §2: src/motores/cff.js
-- mandaba `relaciones: []` hardcoded porque no existía ningún camino
-- de persistencia para ESQUEMA_ECONOMIC_RELATION (motor-cff/
-- contratos.js:375-389, §22.5). Diseño completo y aprobado en
-- DISENO_RELACIONES_CFF.md, sobre la base de
-- INVESTIGACION_RELACIONES_CFF.md.
-- ══════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════
-- 0. Tabla cff_relaciones — transcripción directa de
-- ESQUEMA_ECONOMIC_RELATION. FK doble contra cff_event_components
-- (misma clave única real, PRIMARY KEY (organization_id, component_id),
-- 032:268). Los 2 CHECK replican SOLO las reglas que
-- reglasCondicionalesEconomicRelation() (contratos.js:391-412) trata
-- como error duro -- mismo criterio selectivo que cff_event_components.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE motores_eficiencia.cff_relaciones (
  organization_id          uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  relation_id               text NOT NULL,
  component_a_id             text NOT NULL,
  component_b_id              text NOT NULL,
  relation_type                text NOT NULL CHECK (relation_type IN
                                  ('INDEPENDENT','DUPLICATE','CONTAINS','ALTERNATIVE_VALUATION','DEPENDENT_COST','UNKNOWN')), -- enums.js:45
  direction                     text,  -- condicional, ver CHECK abajo -- NUNCA leído por el motor en tiempo de ejecución
                                        -- (INVESTIGACION_RELACIONES_CFF.md §2), persistido solo porque el contrato lo exige
  effective_from                 text NOT NULL,
  effective_to                    text NOT NULL,
  containment_scope                text CHECK (containment_scope IS NULL OR containment_scope IN
                                  ('FULL','PARTIAL_QUANTIFIED','PARTIAL_UNQUANTIFIED')), -- enums.js:46, condicional
  quantified_overlap_value          numeric,
  selected_primary                   text,
  resolution_status                   text NOT NULL CHECK (resolution_status IN
                                  ('RESOLVED','PARTIALLY_RESOLVED','UNRESOLVED','INVALID')), -- enums.js:39
  resolution_method                    text NOT NULL,  -- vocabulario abierto, no enumerado -- contratos.js:388
  rationale                             text NOT NULL,
  version                                text NOT NULL,
  creado_en                              timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (organization_id, relation_id),
  FOREIGN KEY (organization_id, component_a_id) REFERENCES motores_eficiencia.cff_event_components (organization_id, component_id),
  FOREIGN KEY (organization_id, component_b_id) REFERENCES motores_eficiencia.cff_event_components (organization_id, component_id),

  -- contratos.js:404-406: containment_scope obligatorio SOLO si CONTAINS
  CHECK (
    (relation_type <> 'CONTAINS' OR containment_scope IS NOT NULL)
    AND (relation_type = 'CONTAINS' OR containment_scope IS NULL)
  ),

  -- contratos.js:407-410: direction obligatorio si relación dirigida
  -- (CONTAINS/DEPENDENT_COST), prohibido si DUPLICATE (simétrica);
  -- INDEPENDENT/ALTERNATIVE_VALUATION/UNKNOWN quedan sin restricción
  -- (el contrato no las clasifica en ninguno de los dos grupos)
  CHECK (
    (relation_type NOT IN ('CONTAINS','DEPENDENT_COST') OR direction IS NOT NULL)
    AND (relation_type <> 'DUPLICATE' OR direction IS NULL)
  )
);

CREATE INDEX idx_cff_relaciones_effective
  ON motores_eficiencia.cff_relaciones (organization_id, effective_from, effective_to);
CREATE INDEX idx_cff_relaciones_component_a
  ON motores_eficiencia.cff_relaciones (organization_id, component_a_id);
CREATE INDEX idx_cff_relaciones_component_b
  ON motores_eficiencia.cff_relaciones (organization_id, component_b_id);

COMMENT ON TABLE motores_eficiencia.cff_relaciones IS
  'ECONOMIC_RELATION (§22.5) — transcrita de motor-cff/contratos.js:375-389, '
  'ESQUEMA_ECONOMIC_RELATION. Los 2 CHECK replican reglasCondicionalesEconomicRelation() '
  '(contratos.js:391-412) -- las únicas 2 que ese validador trata como error duro. '
  'direction se persiste porque el contrato lo exige/prohibe condicionalmente, pero '
  'ningún archivo de motor-cff lo lee para resolver nada (INVESTIGACION_RELACIONES_CFF.md §2) '
  '-- mismo patrón que phenomenon_catalog.valid_from/valid_to en motor-piio.';

REVOKE ALL ON motores_eficiencia.cff_relaciones FROM PUBLIC;

-- ══════════════════════════════════════════════════════════════════
-- 1. registrar_relaciones_cff — EN LOTE, upsert (mismo patrón atómico
-- que registrar_observaciones_piio, 041). Upsert porque una relación
-- puede declararse primero UNRESOLVED y actualizarse más tarde a
-- RESOLVED/selected_primary sin cambiar de identidad.
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION motores_eficiencia.registrar_relaciones_cff(
  p_organization_id  uuid,
  p_relaciones         jsonb
) RETURNS SETOF text
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'no autenticado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM consultor_organizacion
    WHERE consultor_id = auth.uid() AND organizacion_id = p_organization_id)
  THEN RAISE EXCEPTION 'no autorizado — el consultor no está asignado a esta organización'; END IF;

  IF p_relaciones IS NULL OR jsonb_array_length(p_relaciones) = 0 THEN
    RAISE EXCEPTION 'p_relaciones no puede estar vacío';
  END IF;

  RETURN QUERY
  INSERT INTO motores_eficiencia.cff_relaciones
  SELECT (jsonb_populate_record(
    NULL::motores_eficiencia.cff_relaciones,
    jsonb_build_object('creado_en', now())
      || r || jsonb_build_object('organization_id', p_organization_id)
  )).*
  FROM jsonb_array_elements(p_relaciones) AS r
  ON CONFLICT (organization_id, relation_id) DO UPDATE SET
    component_a_id = EXCLUDED.component_a_id, component_b_id = EXCLUDED.component_b_id,
    relation_type = EXCLUDED.relation_type, direction = EXCLUDED.direction,
    effective_from = EXCLUDED.effective_from, effective_to = EXCLUDED.effective_to,
    containment_scope = EXCLUDED.containment_scope, quantified_overlap_value = EXCLUDED.quantified_overlap_value,
    selected_primary = EXCLUDED.selected_primary, resolution_status = EXCLUDED.resolution_status,
    resolution_method = EXCLUDED.resolution_method, rationale = EXCLUDED.rationale, version = EXCLUDED.version
  RETURNING relation_id;
END;
$$;

-- ══════════════════════════════════════════════════════════════════
-- 2. leer_relaciones_cff — plana (ECONOMIC_RELATION no tiene hijos),
-- simétrica a leer_eventos_cff. Filtro por SOLAPAMIENTO de rango
-- (no contención total) -- una relación de vigencia amplia debe
-- aplicar a un caso CFF de un solo mes dentro de ese rango.
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION motores_eficiencia.leer_relaciones_cff(
  p_organization_id uuid, p_period_start text, p_period_end text
) RETURNS SETOF motores_eficiencia.cff_relaciones
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'no autenticado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM consultor_organizacion
    WHERE consultor_id = auth.uid() AND organizacion_id = p_organization_id)
  THEN RAISE EXCEPTION 'no autorizado — el consultor no está asignado a esta organización'; END IF;

  RETURN QUERY
  SELECT * FROM motores_eficiencia.cff_relaciones
  WHERE organization_id = p_organization_id
    AND effective_from <= p_period_end AND effective_to >= p_period_start;
END;
$$;

-- ══════════════════════════════════════════════════════════════════
-- Grants + revoke blanket (AUDITORIA_SUPABASE_MOTORES.md §5)
-- ══════════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION motores_eficiencia.registrar_relaciones_cff(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION motores_eficiencia.leer_relaciones_cff(uuid, text, text) TO authenticated;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA motores_eficiencia FROM PUBLIC;

-- ══════════════════════════════════════════════════════════════════
-- Verificación manual sugerida (post-aplicación en Supabase):
--
-- 1. select proname, prosecdef from pg_proc where proname in
--    ('registrar_relaciones_cff','leer_relaciones_cff');
-- 2. select has_function_privilege('anon', 'motores_eficiencia.registrar_relaciones_cff(uuid,jsonb)', 'EXECUTE'); -- false
-- 3. select has_function_privilege('authenticated', 'motores_eficiencia.registrar_relaciones_cff(uuid,jsonb)', 'EXECUTE'); -- true
-- 4. \d motores_eficiencia.cff_relaciones -- confirmar los 2 CHECK y las 2 FK
-- 5. select conname, contype from pg_constraint where conrelid = 'motores_eficiencia.cff_relaciones'::regclass;
-- ══════════════════════════════════════════════════════════════════
