-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 030: schema `motores_eficiencia` — infraestructura
-- de persistencia para los 7 motores nuevos, empezando por lo que
-- `motor-piio` ya tiene verificado contra código real.
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- ── Contexto: AUDITORIA_SUPABASE_MOTORES.md (2026-09-14), aprobada ──
--
-- Decisión ya tomada (no se reabre aquí): schema separado dentro del
-- MISMO proyecto de Supabase, no un proyecto nuevo — sin tocar ninguna
-- tabla ni migración legacy (001-029, todas en `public`).
--
-- Todos los nombres/campos/enums de este archivo están transcritos
-- verbatim de `motor-piio/contratos.js` (`ESQUEMA_METRIC_DEFINITION`,
-- `ESQUEMA_KPI_OBSERVATION`, `ESQUEMA_KPI_SPEC`, `ESQUEMA_EVIDENCE_GROUP`,
-- `ESQUEMA_PHENOMENON_SPEC`, `ESQUEMA_DOMAIN_SPEC`, `ESQUEMA_REFERENCE_SPEC`)
-- y `motor-piio/enums.js` (`DOMAINS`, `ENUMS.*`) — los esquemas OFICIALES
-- del motor, no los fixtures mínimos usados en las pruebas de esta sesión.
-- `piio_run` está transcrito de `construirPIIORun()` (`runPIIO.js`).
--
-- ── Qué NO está en esta migración, a propósito ──
--
-- 1. `NODE_HIERARCHY`/nodos — NO se diseña aquí. Verificado que
--    `motor-cff` (`{node_id, parent_id}`) y `motor-piio`
--    (`{node_id, node_type, active_from, aggregation_membership,
--    scope_rules, version, parent_node_id}`) NO son la misma forma —
--    AUDITORIA_SUPABASE_MOTORES.md §2 lo documenta como tensión real, sin
--    resolución fabricada. Cualquier tabla `observations`/`kpi_specs`/etc.
--    de esta migración que lleve `node_id` lo guarda como `text` suelto,
--    SIN FK a ninguna tabla de nodos — esa FK no puede existir todavía
--    porque la tabla que referenciaría no está diseñada.
-- 2. `motor-cff`/`motor-ifd` (`CFF_EVENT`/`EPD_INPUT`), `motor-fpv`,
--    agrupaciones Persona→Nodo de `motor-iao`/`motor-sdmo` — ninguno tiene
--    un fixture completo verificado esta sesión (a diferencia de
--    `motor-piio`, ejercitado repetidamente). Diseñar sus tablas ahora
--    sería adivinar la forma, no transcribirla. Quedan para cuando haya
--    esa verificación — mismo criterio que la auditoría.
-- 3. Ninguna función `SECURITY DEFINER` todavía. No hay un patrón de
--    lectura/escritura verificado para estas tablas (no existe aún un
--    caso de uso real de qué RPC necesitaría la aplicación) — escribir
--    funciones ahora sería, otra vez, adivinar. Lo que SÍ se hace en esta
--    migración es dejar el schema completamente cerrado por defecto
--    (§ "Acceso" más abajo), consistente con el patrón que exigirán esas
--    funciones el día que se escriban.
--
-- ── Nombres — verificado que no colisionan con las tablas legacy ──
--
-- `respuestas_sdmo` (001) e `invitaciones_fpv`/`respuestas_fpv` (008) son
-- las versiones VIEJAS de esos instrumentos — no motor-sdmo/motor-fpv
-- nuevos (AUDITORIA_SUPABASE_MOTORES.md §1.2). Los nombres de esta
-- migración (`observations`, `kpi_specs`, etc.) no se parecen a esos ni a
-- ningún nombre de tabla legacy — confirmado contra la lista completa de
-- 18 tablas de `public` en la auditoría.
--
-- ── organization_id — reconciliación JS ↔ Postgres ──
--
-- `motor-piio/contratos.js` valida `organization_id` como
-- `esStringNoVacio` (string cualquiera, el motor no impone formato). En
-- esta base de datos la identidad real de una organización YA existe:
-- `public.organizaciones.id` (uuid). Se usa `uuid REFERENCES
-- public.organizaciones(id)` aquí — evita crear una identidad de
-- organización paralela; al construir un `PIIO_INPUT` real, ese uuid se
-- pasa tal cual como el string `organization_id` que el motor espera
-- (`uuid::text` en el límite de la aplicación, no en esta migración).
--
-- ── Períodos — `text`, no `date` ──
--
-- Todo campo de período/vigencia en `motor-piio` (`period_start`,
-- `valid_from`, `active_from`, etc.) se compara como STRING dentro del
-- motor (`String(a.period) < String(b.period)`, `runPIIO.js`/`efo.js`,
-- verificado repetidas veces esta sesión) — nunca como fecha. Usar `date`
-- aquí exigiría una conversión que el motor no hace. Se usa `text` con
-- una restricción de formato `YYYY-MM`, igual que el propio motor asume
-- implícitamente sin validarlo él mismo.
-- ══════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS motores_eficiencia;

COMMENT ON SCHEMA motores_eficiencia IS
  'Persistencia de los 7 motores nuevos de EFICIENCIA (PIIO/CFF/IFD/IAO/'
  'SDMO/FPV/ICE-IEH) y sus arneses de integración con AIE — separado de '
  '`public` (sistema legacy en producción) por decisión explícita '
  '(AUDITORIA_SUPABASE_MOTORES.md §3). NO expuesto en la API de Supabase '
  '(Settings→API→Exposed schemas) — acceso solo vía funciones '
  'SECURITY DEFINER en `public` cuando existan (ver nota arriba, punto 3).';

-- ── Helper de formato de período — reutilizado en varios CHECK ─────
CREATE OR REPLACE FUNCTION motores_eficiencia._es_periodo_valido(p text)
RETURNS boolean
LANGUAGE sql IMMUTABLE AS
$$ SELECT p IS NOT NULL AND p ~ '^\d{4}-\d{2}$' $$;

COMMENT ON FUNCTION motores_eficiencia._es_periodo_valido(text) IS
  'Formato YYYY-MM — mismo formato que usan los fixtures verificados de '
  'motor-piio (''2026-01'', etc.). El motor mismo nunca valida el formato '
  '(lo trata como string opaco comparable) — esta restricción es más '
  'estricta que el motor a propósito, para atrapar errores de captura '
  'antes de que lleguen a runPIIOCompleto().';

-- ══════════════════════════════════════════════════════════════════
-- §25.4 nombrado en contratos.js como NODE_SPEC — NO SE CREA TABLA.
-- Ver nota superior, punto 1. `node_id` en las tablas de abajo es `text`
-- suelto, sin FK, a propósito.
-- ══════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════
-- domain_catalog — ESQUEMA_DOMAIN_SPEC (contratos.js:289-301)
-- Un registro por (organización, dominio) — SIN versionado append-only
-- (a diferencia de reference_specs, más abajo): no hay evidencia
-- verificada de que DOMAIN_SPEC necesite coexistir en múltiples
-- versiones simultáneas (DOMAIN_SPEC no tiene valid_from/valid_to en el
-- esquema oficial). Cada fila es la versión vigente. Si hace falta
-- conservar versiones anteriores explícitamente, es una decisión de
-- diseño pendiente — NO resuelta aquí.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE motores_eficiencia.domain_catalog (
  organization_id            uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  domain_id                  text NOT NULL CHECK (domain_id IN (
                                 'PRODUCTIVITY','QUALITY','COMPLIANCE','OPERATIONAL_CONTINUITY',
                                 'OPERATIONAL_AVAILABILITY','OPERATIONAL_SAFETY','RESOURCE_EFFICIENCY')),
  definition                 text NOT NULL,
  applicability_by_context   jsonb NOT NULL,  -- { <contexto>: REQUIRED|OPTIONAL|NOT_APPLICABLE }
  core_phenomenon_ids        text[] NOT NULL DEFAULT '{}',
  supporting_phenomenon_ids  text[] NOT NULL DEFAULT '{}',
  version                    text NOT NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, domain_id)
);
COMMENT ON TABLE motores_eficiencia.domain_catalog IS
  'DOMAIN_SPEC (§25.2) — transcrita de contratos.js:ESQUEMA_DOMAIN_SPEC.';

-- ══════════════════════════════════════════════════════════════════
-- phenomenon_catalog — ESQUEMA_PHENOMENON_SPEC (contratos.js:259-283)
-- SÍ tiene valid_from/valid_to en el esquema oficial, a diferencia de
-- domain_catalog — pero verificar cómo debería comportarse eso (¿fila
-- nueva por cambio de vigencia, o se actualiza in place?) no se ejercitó
-- esta sesión con ningún fixture real de cambio de vigencia de fenómeno.
-- Se deja como columna informativa, PK simple (un registro vigente por
-- id) — mismo criterio que domain_catalog, mismo aviso de no-resuelto.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE motores_eficiencia.phenomenon_catalog (
  organization_id               uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  phenomenon_id                 text NOT NULL,
  name                          text NOT NULL,
  operational_definition        text NOT NULL,
  canonical_domain_id           text NOT NULL CHECK (canonical_domain_id IN (
                                  'PRODUCTIVITY','QUALITY','COMPLIANCE','OPERATIONAL_CONTINUITY',
                                  'OPERATIONAL_AVAILABILITY','OPERATIONAL_SAFETY','RESOURCE_EFFICIENCY')),
  recurrence_type               text NOT NULL CHECK (recurrence_type IN ('RATE_BASED','COUNT_BASED','CONTINUOUS','EPISODIC')),
  directionality                text NOT NULL CHECK (directionality IN ('HIGHER_IS_WORSE','LOWER_IS_WORSE','TARGET_RANGE')),
  exposure_definition           text,
  unit_of_effect                text,
  required_evidence_group_ids   text[] NOT NULL DEFAULT '{}',
  optional_evidence_group_ids   text[] NOT NULL DEFAULT '{}',
  proxy_allowed_as_primary      boolean NOT NULL,
  core_or_supporting_by_domain  jsonb NOT NULL,  -- { <domain_id>: CORE|SUPPORTING }
  applicable_node_types         text[] NOT NULL DEFAULT '{}',
  version                       text NOT NULL,
  valid_from                    text NOT NULL CHECK (motores_eficiencia._es_periodo_valido(valid_from)),
  valid_to                      text CHECK (valid_to IS NULL OR motores_eficiencia._es_periodo_valido(valid_to)),
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, phenomenon_id)
);
COMMENT ON TABLE motores_eficiencia.phenomenon_catalog IS
  'PHENOMENON_SPEC (§25.1) — transcrita de contratos.js:ESQUEMA_PHENOMENON_SPEC. '
  'valid_from/valid_to presentes en el esquema oficial pero su semántica de '
  'versionado (¿fila nueva o update in place?) no está resuelta aquí.';

-- ══════════════════════════════════════════════════════════════════
-- metric_definitions — ESQUEMA_METRIC_DEFINITION (contratos.js:101-138)
-- Mismo criterio que phenomenon_catalog: valid_from/valid_to oficiales,
-- versionado no resuelto, PK simple.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE motores_eficiencia.metric_definitions (
  organization_id         uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  metric_definition_id    text NOT NULL,
  phenomenon_id           text NOT NULL,
  name                    text NOT NULL,
  operational_definition  text NOT NULL,
  numerator_definition    text,
  denominator_definition  text,
  unit                    text NOT NULL,
  metric_type             text NOT NULL CHECK (metric_type IN
                              ('COUNT','RATE','RATIO','DURATION','QUANTITY','INDEX','BINARY','OTHER_VALIDATED')),
  directionality          text NOT NULL CHECK (directionality IN ('HIGHER_IS_WORSE','LOWER_IS_WORSE','TARGET_RANGE')),
  source_frequency        text NOT NULL,
  calculation_frequency   text NOT NULL,
  aggregation_frequency   text NOT NULL,
  rate_period             text,
  annualization_rule      text,
  valid_range_min         numeric,
  valid_range_max         numeric,
  boundary_behavior       text NOT NULL CHECK (boundary_behavior IN ('INVALID','NOT_APPLICABLE','RULE_DEFINED')),
  exposure_definition     text,
  recurrence_type         text NOT NULL CHECK (recurrence_type IN ('RATE_BASED','COUNT_BASED','CONTINUOUS','EPISODIC')),
  definition_version      text NOT NULL,
  valid_from              text NOT NULL CHECK (motores_eficiencia._es_periodo_valido(valid_from)),
  valid_to                text CHECK (valid_to IS NULL OR motores_eficiencia._es_periodo_valido(valid_to)),
  continuity_mode         text NOT NULL CHECK (continuity_mode IN ('CONTINUOUS','BRIDGED','NEW_SERIES')),
  target_range_rules      jsonb,  -- { below, above } — obligatorio (a nivel app) si directionality=TARGET_RANGE, §11.1/ambig. D
  bridge_rule             text,  -- obligatorio de hecho si continuity_mode=BRIDGED, §8.4/ambig. Y
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, metric_definition_id),
  CHECK (directionality <> 'TARGET_RANGE' OR target_range_rules IS NOT NULL)
);
COMMENT ON TABLE motores_eficiencia.metric_definitions IS
  'METRIC_DEFINITION (§7) — transcrita de contratos.js:ESQUEMA_METRIC_DEFINITION. '
  'El CHECK de target_range_rules replica validarMetricDefinition() — bridge_rule '
  'obligatorio-de-hecho con BRIDGED NO se refuerza aquí (motor lo trata como '
  'NEW_SERIES + flag si falta, no como error — AC15/INV-PIIO-29 — replicar ese '
  'CHECK aquí duplicaría lógica del motor en SQL sin necesidad verificada).';

-- ══════════════════════════════════════════════════════════════════
-- reference_specs — ESQUEMA_REFERENCE_SPEC (contratos.js:307-341)
-- APPEND-ONLY a propósito — verificado contra rebasarHistoria() real
-- (runPIIO.js): `.concat([rb])`, NUNCA reemplaza una fila existente,
-- solo cierra su valid_to. PK incluye `version` porque múltiples
-- versiones del MISMO reference_id/reference_role coexisten con
-- vigencias distintas — a diferencia de los catálogos de arriba.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE motores_eficiencia.reference_specs (
  organization_id           uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  reference_id              text NOT NULL,
  reference_role            text NOT NULL CHECK (reference_role IN ('CONDITION', 'TEMPORAL')),
  reference_type            text NOT NULL CHECK (reference_type IN
                                    ('NORMATIVE', 'TECHNICAL', 'HISTORICAL', 'VALIDATED_TARGET', 'COMPARABLE_BENCHMARK')),
  source                    text NOT NULL,
  valid_from                text NOT NULL CHECK (motores_eficiencia._es_periodo_valido(valid_from)),
  valid_to                  text CHECK (valid_to IS NULL OR motores_eficiencia._es_periodo_valido(valid_to)),
  rule                      text NOT NULL,
  comparability_assessment  text NOT NULL,
  traceability              text NOT NULL,
  version                   text NOT NULL,
  admissibility_declared    text NOT NULL CHECK (admissibility_declared IN
                                    ('ADMISSIBLE', 'ADMISSIBLE_WITH_LIMITATIONS', 'NOT_ADMISSIBLE')),
  critical_failure          text,
  change_mode               text CHECK (change_mode IS NULL OR change_mode IN ('REBASE_HISTORY', 'START_NEW_REGIME')),
  supersedes                text,     -- version de la referencia reemplazada; obligatoria de hecho si change_mode presente (§8.3)
  threshold                 numeric,  -- obligatorio de hecho si reference_role=CONDITION (§11/AC01/ambig. AH)
  threshold_upper           numeric,  -- solo directionality=TARGET_RANGE en el METRIC_DEFINITION asociado (§11.1/AC07)
  band                      numeric CHECK (band IS NULL OR band >= 0),
  created_at                timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, reference_id, version),
  CHECK (change_mode IS NULL OR supersedes IS NOT NULL),
  CHECK (reference_role <> 'CONDITION' OR threshold IS NOT NULL)
);
CREATE INDEX idx_reference_specs_vigencia
  ON motores_eficiencia.reference_specs (organization_id, reference_id, reference_role, valid_from);
COMMENT ON TABLE motores_eficiencia.reference_specs IS
  'REFERENCE_SPEC (§25.3) — transcrita de contratos.js:ESQUEMA_REFERENCE_SPEC. '
  'Append-only: verificado contra rebasarHistoria() real (runPIIO.js) — nunca '
  'sobrescribe una versión existente, solo agrega una nueva y cierra el '
  'valid_to de la superada (ambig. W, INV-PIIO-66). Los 2 CHECK replican '
  'validarReferenceSpec() (contratos.js:342-353) exactamente.';

-- ══════════════════════════════════════════════════════════════════
-- kpi_specs — ESQUEMA_KPI_SPEC (contratos.js:192-216)
-- PK simple (organización, kpi_id) — observations.kpi_id (más abajo)
-- referencia el KPI sin pin de versión, igual que el propio motor.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE motores_eficiencia.kpi_specs (
  organization_id           uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  kpi_id                    text NOT NULL,
  name                      text NOT NULL,
  description               text NOT NULL,
  primary_domain_id         text NOT NULL CHECK (primary_domain_id IN (
                                  'PRODUCTIVITY', 'QUALITY', 'COMPLIANCE', 'OPERATIONAL_CONTINUITY',
                                  'OPERATIONAL_AVAILABILITY', 'OPERATIONAL_SAFETY', 'RESOURCE_EFFICIENCY')),
  primary_phenomenon_id     text NOT NULL,
  metric_definition_id      text NOT NULL,
  evidence_group_id         text NOT NULL,
  evidence_proximity        text NOT NULL CHECK (evidence_proximity IN ('DIRECT', 'PROXY')),
  computation               text NOT NULL CHECK (computation IN ('RAW', 'DERIVED')),
  temporal_role             text NOT NULL CHECK (temporal_role IN ('COINCIDENT', 'LAGGED')),
  expected_lag              text,        -- obligatorio de hecho si temporal_role=LAGGED (ambig. AS — DIFERIDA, ver motor-piio/README.md)
  freshness_spec            jsonb NOT NULL,  -- forma exacta calibrable, ambig. C
  condition_reference_id    text NOT NULL,  -- REF_COND, §8.1
  temporal_reference_id     text NOT NULL,  -- REF_TEMP, §8
  proxy_allowed_as_primary  boolean NOT NULL DEFAULT false,
  definition_version        text NOT NULL,
  source_requirements       text[] NOT NULL DEFAULT '{}',
  formula_id                text,    -- obligatorio si computation=DERIVED
  formula_version           text,    -- obligatorio si computation=DERIVED
  source_variables          text[],  -- obligatorio no vacío si computation=DERIVED
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, kpi_id),
  CHECK (computation <> 'DERIVED' OR (formula_id IS NOT NULL AND formula_version IS NOT NULL AND
         source_variables IS NOT NULL AND array_length(source_variables, 1) > 0))
);
COMMENT ON TABLE motores_eficiencia.kpi_specs IS
  'KPI_SPEC (§10) — transcrita de contratos.js:ESQUEMA_KPI_SPEC. El CHECK de '
  'campos DERIVED-only replica validarKpiSpec() (contratos.js:218-232) exacto.';

-- ══════════════════════════════════════════════════════════════════
-- evidence_groups — ESQUEMA_EVIDENCE_GROUP (contratos.js:237-253)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE motores_eficiencia.evidence_groups (
  organization_id          uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  evidence_group_id        text NOT NULL,
  phenomenon_id            text NOT NULL,
  node_id                  text NOT NULL,  -- SIN FK — ver nota superior, punto 1
  member_kpi_ids           text[] NOT NULL CHECK (array_length(member_kpi_ids, 1) > 0),
  source_lineage_ids       text[] NOT NULL DEFAULT '{}',
  independence_basis       jsonb NOT NULL,  -- { kind: SEPARATE_SOURCE|SEPARATE_METHOD|SEPARATE_PROCESS|DECLARED_OTHER, detail }
  resolution_rule_version  text NOT NULL,
  status                   text NOT NULL,
  flags                    text[] NOT NULL DEFAULT '{}',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, evidence_group_id),
  CHECK ((independence_basis->>'kind') IN ('SEPARATE_SOURCE','SEPARATE_METHOD','SEPARATE_PROCESS','DECLARED_OTHER'))
);
COMMENT ON TABLE motores_eficiencia.evidence_groups IS
  'EVIDENCE_GROUP (§14) — transcrita de contratos.js:ESQUEMA_EVIDENCE_GROUP.';

-- ══════════════════════════════════════════════════════════════════
-- observations — ESQUEMA_KPI_OBSERVATION (contratos.js:157-176)
-- La tabla "caliente": crece cada período, es la que alimenta
-- directamente `input.observations` de runPIIOCompleto(). PK en
-- observation_id calificado por organización (el motor exige
-- observation_id único, pero no garantiza unicidad entre organizaciones
-- distintas — mismo criterio conservador que el resto de esta migración).
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE motores_eficiencia.observations (
  organization_id       uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  observation_id        text NOT NULL,
  kpi_id                text NOT NULL,
  metric_definition_id  text NOT NULL,
  node_id               text NOT NULL,  -- SIN FK — ver nota superior, punto 1
  period_start          text NOT NULL CHECK (motores_eficiencia._es_periodo_valido(period_start)),
  period_end            text NOT NULL CHECK (motores_eficiencia._es_periodo_valido(period_end)),
  observed_at           timestamptz NOT NULL,
  value                 numeric,  -- nullable: null + quality_status=MISSING, §28 — NUNCA se rellena con 0
  unit                  text NOT NULL,
  numerator             numeric,
  denominator           numeric,
  exposure              numeric,  -- separada de incidencia, INV-PIIO-55
  source_id             text NOT NULL,
  source_traceable      boolean NOT NULL,
  quality_status        text NOT NULL CHECK (quality_status IN ('VALID','VALID_WITH_LIMITATIONS','MISSING','INVALID')),
  flags                 text[] NOT NULL DEFAULT '{}',
  absence_reason        text,  -- requerido (a nivel app) si value=null y quality_status<>MISSING, INV-PIIO-64
  created_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, observation_id),
  CHECK (value IS NOT NULL OR quality_status = 'MISSING' OR absence_reason IS NOT NULL)
);
CREATE INDEX idx_observations_kpi_periodo
  ON motores_eficiencia.observations (organization_id, kpi_id, node_id, period_start);
COMMENT ON TABLE motores_eficiencia.observations IS
  'KPI_OBSERVATION (§9) — transcrita de contratos.js:ESQUEMA_KPI_OBSERVATION. '
  'El CHECK final replica validarKpiObservation() (contratos.js:178-187), '
  'INV-PIIO-64, exacto. Tabla de crecimiento continuo — índice por '
  '(organización, kpi, nodo, período) porque es el patrón de consulta real '
  'que usan los arneses ya construidos esta sesión (obtenerSerieEFO, '
  'calcularSerieOrganizacional*: filtrar por nodo, ordenar por período).';

-- ══════════════════════════════════════════════════════════════════
-- piio_run — genealogía de corridas, transcrita de construirPIIORun()
-- (runPIIO.js:364-384) campo por campo — NO se reinterpretan los nombres.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE motores_eficiencia.piio_run (
  organization_id             uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  piio_run_id                 text NOT NULL,
  period                      text NOT NULL,  -- ya viene pre-unido con comas desde el motor (_arr(periods).sort().join(','))
  calculation_version         text NOT NULL,
  parent_calculation_version  text,  -- puntero informativo a otra fila piio_run — SIN FK forzada (ver nota abajo)
  ruleset_version             text,
  domain_catalog_version      text,
  phenomenon_catalog_version  text,
  metric_definition_versions  text[] NOT NULL DEFAULT '{}',
  reference_versions          text[] NOT NULL DEFAULT '{}',
  node_hierarchy_version      text,
  source_snapshot_ids         text[] NOT NULL DEFAULT '{}',
  update_reason               text NOT NULL DEFAULT 'INITIAL',
  generated_at                timestamptz NOT NULL,  -- el único campo no determinista del motor (comentario original de construirPIIORun)
  run_status                  text NOT NULL CHECK (run_status IN ('COMPLETED','PARTIAL','BLOCKED')),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, piio_run_id)
);
COMMENT ON TABLE motores_eficiencia.piio_run IS
  'PIIO_RUN — transcrita campo por campo de construirPIIORun() (runPIIO.js:364-384). '
  'parent_calculation_version NO tiene FK forzada a otra fila de esta misma tabla: '
  'no se verificó con evidencia si calculation_version es único por sí solo o solo '
  'junto con organization_id/otros campos — forzar la FK ahora arriesgaría una '
  'restricción que no se puede sostener. Puntero informativo, no reforzado por SQL.';

-- ══════════════════════════════════════════════════════════════════
-- Acceso — schema cerrado por defecto, consistente con el patrón legacy
-- ══════════════════════════════════════════════════════════════════
-- Ningún rol de Supabase (`anon`, `authenticated`) recibe USAGE sobre
-- este schema ni SELECT/INSERT/etc. sobre sus tablas — ni por defecto
-- (Postgres no concede nada a schemas nuevos automáticamente) ni de forma
-- explícita en esta migración. El día que exista una función real en
-- `public` que necesite leer/escribir aquí, esa función se declara
-- SECURITY DEFINER (mismo patrón que TODAS las funciones legacy — cada
-- `CREATE OR REPLACE FUNCTION` de 001-029 lo hace) y fija
-- `SET search_path = public, motores_eficiencia` — igual que hoy fijan
-- `SET search_path = public` — sin que este schema necesite aparecer
-- nunca en Settings→API→Exposed schemas.
REVOKE ALL ON SCHEMA motores_eficiencia FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA motores_eficiencia FROM PUBLIC;

-- ══════════════════════════════════════════════════════════════════
-- Verificación sugerida tras aplicar (mismo criterio que 029)
-- ══════════════════════════════════════════════════════════════════
-- 1. SELECT schema_name FROM information_schema.schemata
--    WHERE schema_name = 'motores_eficiencia';                → 1 fila
-- 2. SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'motores_eficiencia' ORDER BY 1;    → 8 tablas
--    (domain_catalog, evidence_groups, kpi_specs, metric_definitions,
--     observations, phenomenon_catalog, piio_run, reference_specs)
-- 3. Confirmar que `anon`/`authenticated` NO tienen acceso — conectar con
--    esos roles y correr `SELECT * FROM motores_eficiencia.observations;`
--    debe devolver "permission denied for schema motores_eficiencia".
-- 4. Confirmar en el dashboard (Settings→API→Exposed schemas) que
--    `motores_eficiencia` NO aparece en la lista — si esta migración se
--    aplicó bien, no debería hacer falta agregarlo nunca.
