# Diseño — funciones de escritura de PIIO (8 piezas)

**Estado: especificación completa, cero DDL todavía.** Cierra
`PENDIENTES_BRECHAS_WORKER_MOTORES.md` §3, con la decisión de
versionado ya aprobada
(`INVESTIGACION_VERSIONADO_PIIO_CATALOGOS.md`). Mismo patrón que
`033`/`034`/`036`: `authenticated` únicamente (igual que `IFD`/`CFF` —
son catálogos/series que el consultor declara, no encuestas anónimas),
`SECURITY DEFINER`, `GRANT EXECUTE TO authenticated` + `REVOKE EXECUTE
... FROM PUBLIC` inmediato en cada una (regla permanente,
`AUDITORIA_SUPABASE_MOTORES.md` §5).

---

## 0. Dos cambios de esquema, antes de las funciones

**`metric_definitions`** — aplicar el patrón ya aprobado (append-only,
mismo mecanismo que `node_hierarchy`, `031`, no uno nuevo inventado):

```sql
ALTER TABLE motores_eficiencia.metric_definitions
  DROP CONSTRAINT metric_definitions_pkey,
  ADD PRIMARY KEY (organization_id, metric_definition_id, definition_version);

CREATE UNIQUE INDEX idx_metric_definitions_vigente_unico
  ON motores_eficiencia.metric_definitions (organization_id, metric_definition_id)
  WHERE valid_to IS NULL;
```

**`phenomenon_catalog`** — sin cambio de esquema (decisión aprobada:
simple, `UPDATE` in place, PK como está).

---

## 1. `registrar_dominio_piio` — `domain_catalog`

Sin versionado (la tabla no tiene `valid_from`/`valid_to`, §4 de la
investigación) — upsert simple.

```sql
CREATE OR REPLACE FUNCTION motores_eficiencia.registrar_dominio_piio(
  p_organization_id  uuid,
  p_dominio           jsonb
) RETURNS text
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
DECLARE v_domain_id text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'no autenticado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM consultor_organizacion
    WHERE consultor_id = auth.uid() AND organizacion_id = p_organization_id)
  THEN RAISE EXCEPTION 'no autorizado — el consultor no está asignado a esta organización'; END IF;

  INSERT INTO motores_eficiencia.domain_catalog
  SELECT (jsonb_populate_record(
    NULL::motores_eficiencia.domain_catalog,
    jsonb_build_object('created_at', now(), 'updated_at', now(),
      'core_phenomenon_ids', '[]'::jsonb, 'supporting_phenomenon_ids', '[]'::jsonb)
      || p_dominio || jsonb_build_object('organization_id', p_organization_id)
  )).*
  ON CONFLICT (organization_id, domain_id) DO UPDATE SET
    definition = EXCLUDED.definition, applicability_by_context = EXCLUDED.applicability_by_context,
    core_phenomenon_ids = EXCLUDED.core_phenomenon_ids, supporting_phenomenon_ids = EXCLUDED.supporting_phenomenon_ids,
    version = EXCLUDED.version, updated_at = now()
  RETURNING domain_id INTO v_domain_id;

  RETURN v_domain_id;
END;
$$;
```

---

## 2. `registrar_fenomeno_piio` — `phenomenon_catalog`

Upsert simple (decisión aprobada §3/§4 de la investigación: sin
append-only, `valid_from` se sobreescribe con cada declaración —
metadata informativa, el motor nunca la consulta para resolver).

```sql
CREATE OR REPLACE FUNCTION motores_eficiencia.registrar_fenomeno_piio(
  p_organization_id  uuid,
  p_fenomeno          jsonb
) RETURNS text
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
DECLARE v_phenomenon_id text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'no autenticado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM consultor_organizacion
    WHERE consultor_id = auth.uid() AND organizacion_id = p_organization_id)
  THEN RAISE EXCEPTION 'no autorizado — el consultor no está asignado a esta organización'; END IF;

  INSERT INTO motores_eficiencia.phenomenon_catalog
  SELECT (jsonb_populate_record(
    NULL::motores_eficiencia.phenomenon_catalog,
    jsonb_build_object('created_at', now(), 'updated_at', now(),
      'required_evidence_group_ids', '[]'::jsonb, 'optional_evidence_group_ids', '[]'::jsonb,
      'applicable_node_types', '[]'::jsonb)
      || p_fenomeno || jsonb_build_object('organization_id', p_organization_id)
  )).*
  ON CONFLICT (organization_id, phenomenon_id) DO UPDATE SET
    name = EXCLUDED.name, operational_definition = EXCLUDED.operational_definition,
    canonical_domain_id = EXCLUDED.canonical_domain_id, recurrence_type = EXCLUDED.recurrence_type,
    directionality = EXCLUDED.directionality, exposure_definition = EXCLUDED.exposure_definition,
    unit_of_effect = EXCLUDED.unit_of_effect, required_evidence_group_ids = EXCLUDED.required_evidence_group_ids,
    optional_evidence_group_ids = EXCLUDED.optional_evidence_group_ids, proxy_allowed_as_primary = EXCLUDED.proxy_allowed_as_primary,
    core_or_supporting_by_domain = EXCLUDED.core_or_supporting_by_domain, applicable_node_types = EXCLUDED.applicable_node_types,
    version = EXCLUDED.version, valid_from = EXCLUDED.valid_from, valid_to = EXCLUDED.valid_to, updated_at = now()
  RETURNING phenomenon_id INTO v_phenomenon_id;

  RETURN v_phenomenon_id;
END;
$$;
```

---

## 3. `registrar_metric_definition_piio` — `metric_definitions` (append-only)

**El más elaborado de los "simples"** — mismo mecanismo que
`node_hierarchy` (`031`) ya construyó para el mismo problema: si existe
una versión "vigente" (`valid_to IS NULL`) para ese `metric_definition_id`,
se cierra automáticamente (`valid_to` = período anterior al `valid_from`
de la nueva) antes de insertar la nueva fila. El llamante nunca declara
"cuál cerrar" — se detecta por la vigente existente, igual que
`idx_node_hierarchy_vigente_unico` ya garantiza que solo hay una.

```sql
CREATE OR REPLACE FUNCTION motores_eficiencia.registrar_metric_definition_piio(
  p_organization_id  uuid,
  p_metric            jsonb
) RETURNS text
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
DECLARE
  v_metric_definition_id text := p_metric->>'metric_definition_id';
  v_valid_from            text := p_metric->>'valid_from';
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'no autenticado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM consultor_organizacion
    WHERE consultor_id = auth.uid() AND organizacion_id = p_organization_id)
  THEN RAISE EXCEPTION 'no autorizado — el consultor no está asignado a esta organización'; END IF;

  -- Cerrar la versión vigente anterior de ESTE metric_definition_id, si existe
  -- (mismo mecanismo que rebasarHistoria/031 -- nunca se sobreescribe, solo se cierra).
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
```

**Nota de diseño explícita**: `p_metric.definition_version` debe ser
distinto de cualquier versión ya existente para el mismo
`metric_definition_id` (el índice único parcial de §0 lo garantiza —
si el llamante repite una versión ya cerrada, el `INSERT` falla por
duplicado de PK, no se sobreescribe en silencio).

---

## 4. `registrar_reference_spec_piio` — `reference_specs` (append-only, ya tenía la forma, nunca la función)

Mismo mecanismo que §3, pero el cierre de la versión superada se activa
por `p_reference.supersedes` (ya existe en la tabla, `030:242`) en vez
de autodetectarse — porque `reference_specs` permite **varias**
referencias vigentes simultáneas para el mismo `reference_id` bajo
`reference_role` distinto, a diferencia de `metric_definitions` (una
sola vigente por id). **Decisión propia, no verificada letra por letra
contra `rebasarHistoria`**: cierro la superada en cualquier
`change_mode` presente (`REBASE_HISTORY` o `START_NEW_REGIME`), no solo
`REBASE_HISTORY` — `supersedes` en sí ya es la señal de integridad de
que esa versión deja de estar abierta; la interpretación de *cómo*
tratar las consecuencias del cambio es del motor (`evaluarCambioReferencia`),
no de esta función.

```sql
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
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'no autenticado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM consultor_organizacion
    WHERE consultor_id = auth.uid() AND organizacion_id = p_organization_id)
  THEN RAISE EXCEPTION 'no autorizado — el consultor no está asignado a esta organización'; END IF;

  IF v_supersedes IS NOT NULL THEN
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
```

---

## 5. `registrar_kpi_spec_piio` — `kpi_specs`

Upsert simple, PK ya es `(organization_id, kpi_id)`, sin versionado
(§4 de la investigación: fuera de esta decisión, sin evidencia de que
lo necesite hoy).

```sql
CREATE OR REPLACE FUNCTION motores_eficiencia.registrar_kpi_spec_piio(
  p_organization_id  uuid,
  p_kpi_spec          jsonb
) RETURNS text
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
DECLARE v_kpi_id text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'no autenticado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM consultor_organizacion
    WHERE consultor_id = auth.uid() AND organizacion_id = p_organization_id)
  THEN RAISE EXCEPTION 'no autorizado — el consultor no está asignado a esta organización'; END IF;

  INSERT INTO motores_eficiencia.kpi_specs
  SELECT (jsonb_populate_record(
    NULL::motores_eficiencia.kpi_specs,
    jsonb_build_object('created_at', now(), 'updated_at', now(), 'source_requirements', '[]'::jsonb, 'proxy_allowed_as_primary', false)
      || p_kpi_spec || jsonb_build_object('organization_id', p_organization_id)
  )).*
  ON CONFLICT (organization_id, kpi_id) DO UPDATE SET
    name = EXCLUDED.name, description = EXCLUDED.description, primary_domain_id = EXCLUDED.primary_domain_id,
    primary_phenomenon_id = EXCLUDED.primary_phenomenon_id, metric_definition_id = EXCLUDED.metric_definition_id,
    evidence_group_id = EXCLUDED.evidence_group_id, evidence_proximity = EXCLUDED.evidence_proximity,
    computation = EXCLUDED.computation, temporal_role = EXCLUDED.temporal_role, expected_lag = EXCLUDED.expected_lag,
    freshness_spec = EXCLUDED.freshness_spec, condition_reference_id = EXCLUDED.condition_reference_id,
    temporal_reference_id = EXCLUDED.temporal_reference_id, proxy_allowed_as_primary = EXCLUDED.proxy_allowed_as_primary,
    definition_version = EXCLUDED.definition_version, source_requirements = EXCLUDED.source_requirements,
    formula_id = EXCLUDED.formula_id, formula_version = EXCLUDED.formula_version, source_variables = EXCLUDED.source_variables,
    updated_at = now()
  RETURNING kpi_id INTO v_kpi_id;

  RETURN v_kpi_id;
END;
$$;
```

---

## 6. `registrar_evidence_group_piio` — `evidence_groups`

Upsert simple, mismo patrón.

```sql
CREATE OR REPLACE FUNCTION motores_eficiencia.registrar_evidence_group_piio(
  p_organization_id  uuid,
  p_grupo             jsonb
) RETURNS text
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
DECLARE v_evidence_group_id text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'no autenticado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM consultor_organizacion
    WHERE consultor_id = auth.uid() AND organizacion_id = p_organization_id)
  THEN RAISE EXCEPTION 'no autorizado — el consultor no está asignado a esta organización'; END IF;

  INSERT INTO motores_eficiencia.evidence_groups
  SELECT (jsonb_populate_record(
    NULL::motores_eficiencia.evidence_groups,
    jsonb_build_object('created_at', now(), 'updated_at', now(), 'source_lineage_ids', '[]'::jsonb, 'flags', '[]'::jsonb)
      || p_grupo || jsonb_build_object('organization_id', p_organization_id)
  )).*
  ON CONFLICT (organization_id, evidence_group_id) DO UPDATE SET
    phenomenon_id = EXCLUDED.phenomenon_id, node_id = EXCLUDED.node_id, member_kpi_ids = EXCLUDED.member_kpi_ids,
    source_lineage_ids = EXCLUDED.source_lineage_ids, independence_basis = EXCLUDED.independence_basis,
    resolution_rule_version = EXCLUDED.resolution_rule_version, status = EXCLUDED.status, flags = EXCLUDED.flags,
    updated_at = now()
  RETURNING evidence_group_id INTO v_evidence_group_id;

  RETURN v_evidence_group_id;
END;
$$;
```

---

## 7. `registrar_observaciones_piio` — `observations`, EN LOTE

**Distinta de las anteriores a propósito**: `observations` es la tabla
de crecimiento continuo (§4 de la investigación) — potencialmente
cientos de filas por organización/período. Mismo patrón que
`generar_invitaciones_cuestionario` (`034`, ya construido y verificado):
un array de observaciones, un solo `INSERT ... SELECT FROM
jsonb_array_elements`. **Misma advertencia ya conocida y verificada en
la ronda de la carga masiva de invitaciones**: la sentencia es atómica
— una sola fila mal formada revierte el lote completo. El script de
simulación (y cualquier consumidor futuro) debe trocear en lotes
razonables, mismo criterio que `DISENO_CARGA_MASIVA_CSV.md`, no algo
que esta función deba resolver por su cuenta.

```sql
CREATE OR REPLACE FUNCTION motores_eficiencia.registrar_observaciones_piio(
  p_organization_id  uuid,
  p_observaciones     jsonb
) RETURNS SETOF text
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'no autenticado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM consultor_organizacion
    WHERE consultor_id = auth.uid() AND organizacion_id = p_organization_id)
  THEN RAISE EXCEPTION 'no autorizado — el consultor no está asignado a esta organización'; END IF;

  IF p_observaciones IS NULL OR jsonb_array_length(p_observaciones) = 0 THEN
    RAISE EXCEPTION 'p_observaciones no puede estar vacío';
  END IF;

  RETURN QUERY
  INSERT INTO motores_eficiencia.observations
  SELECT (jsonb_populate_record(
    NULL::motores_eficiencia.observations,
    jsonb_build_object('created_at', now(), 'flags', '[]'::jsonb)
      || o || jsonb_build_object('organization_id', p_organization_id)
  )).*
  FROM jsonb_array_elements(p_observaciones) AS o
  ON CONFLICT (organization_id, observation_id) DO UPDATE SET
    kpi_id = EXCLUDED.kpi_id, metric_definition_id = EXCLUDED.metric_definition_id, node_id = EXCLUDED.node_id,
    period_start = EXCLUDED.period_start, period_end = EXCLUDED.period_end, observed_at = EXCLUDED.observed_at,
    value = EXCLUDED.value, unit = EXCLUDED.unit, numerator = EXCLUDED.numerator, denominator = EXCLUDED.denominator,
    exposure = EXCLUDED.exposure, source_id = EXCLUDED.source_id, source_traceable = EXCLUDED.source_traceable,
    quality_status = EXCLUDED.quality_status, flags = EXCLUDED.flags, absence_reason = EXCLUDED.absence_reason
  RETURNING observation_id;
END;
$$;
```

---

## 8. `registrar_nodo_piio` — `node_hierarchy`

Mismo mecanismo de §3, ya con precedente real construido en `031`
(`idx_node_hierarchy_vigente_unico`) — la función solo automatiza lo que
esa migración ya dejó listo para hacer cumplir.

```sql
CREATE OR REPLACE FUNCTION motores_eficiencia.registrar_nodo_piio(
  p_organization_id  uuid,
  p_nodo              jsonb
) RETURNS text
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
DECLARE
  v_node_id     text := p_nodo->>'node_id';
  v_active_from text := p_nodo->>'active_from';
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'no autenticado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM consultor_organizacion
    WHERE consultor_id = auth.uid() AND organizacion_id = p_organization_id)
  THEN RAISE EXCEPTION 'no autorizado — el consultor no está asignado a esta organización'; END IF;

  UPDATE motores_eficiencia.node_hierarchy
  SET active_to = to_char((to_date(v_active_from || '-01', 'YYYY-MM-DD') - interval '1 month'), 'YYYY-MM')
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
```

---

## Cierre de privilegios — las 8, mismo bloque

```sql
GRANT EXECUTE ON FUNCTION motores_eficiencia.registrar_dominio_piio(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION motores_eficiencia.registrar_fenomeno_piio(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION motores_eficiencia.registrar_metric_definition_piio(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION motores_eficiencia.registrar_reference_spec_piio(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION motores_eficiencia.registrar_kpi_spec_piio(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION motores_eficiencia.registrar_evidence_group_piio(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION motores_eficiencia.registrar_observaciones_piio(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION motores_eficiencia.registrar_nodo_piio(uuid, jsonb) TO authenticated;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA motores_eficiencia FROM PUBLIC;
```

---

## Resumen — qué falta antes de escribir el DDL real

- 2 patrones distintos, cada uno con su justificación ya verificada:
  upsert simple (5 funciones) vs. append-only con cierre automático de
  la vigente (3 funciones: `metric_definitions`, `reference_specs`,
  `node_hierarchy` — este último ya con tabla lista desde `031`, nunca
  tuvo función).
- `observations` en lote, mismo criterio de troceo ya conocido de la
  carga masiva de invitaciones.
- Todas `authenticated`, todas con `GRANT`+`REVOKE` explícitos (regla
  permanente).
- Antes de aplicar: verificación `pglite` completa, mismo estándar que
  cada migración de esta sesión — las 8 funciones + los 2 cambios de
  esquema, incluidos los casos de versión superada/vigente para las 3
  append-only.

¿Apruebas este diseño para pasar a construir y verificar el DDL real?
