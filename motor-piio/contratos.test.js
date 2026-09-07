/**
 * motor-piio/contratos.test.js — Fase 0
 * node motor-piio/contratos.test.js
 *
 * Contratos de forma + enums + clasificarAusencia (§28). Sin oráculo
 * numérico — se verifica contra las formas literales del documento (§7,
 * §9, §10, §14, §25) y contra §28 / INV-PIIO-02/03/04/64 / AC74.
 */

'use strict';

var E = require('./enums');
var C = require('./contratos');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }

// ═══════════════════════════════════════════════════════════════════════
seccion('§5 / §27 — enums canónicos');
// ═══════════════════════════════════════════════════════════════════════

eq(E.DOMAINS.length, 7, '§5: 7 dominios canónicos');
eq(E.DOMAINS.indexOf('PRODUCTIVITY') !== -1 && E.DOMAINS.indexOf('OPERATIONAL_SAFETY') !== -1, true, 'incluye PRODUCTIVITY y OPERATIONAL_SAFETY');
eq(E.ENUMS.POSITION, ['F', 'I', 'D', 'N_A'], 'POSITION = F | I | D | N_A (§11)');
eq(E.ENUMS.TRAJECTORY, ['IMPROVING', 'STABLE', 'DETERIORATING', 'N_A'], 'TRAJECTORY');
eq(E.ENUMS.PERSISTENCE, ['POINT', 'REPEATED', 'PERSISTENT', 'N_A'], 'PERSISTENCE');
eq(E.ENUMS.COVERAGE_STATUS_PHENOMENON, ['COMPLETE', 'PARTIAL', 'NONE'], 'cobertura fenómeno ≠ cobertura EFO');
eq(E.ENUMS.COVERAGE_STATUS_EFO, ['FULL', 'PARTIAL', 'LIMITED', 'INSUFFICIENT'], 'cobertura EFO tiene 4 valores propios');
eq(E.ENUMS.METRIC_TYPE.length, 8, 'METRIC_TYPE: 8 valores (§7)');
eq(E.ENUMS.DIRECTIONALITY, ['HIGHER_IS_WORSE', 'LOWER_IS_WORSE', 'TARGET_RANGE'], 'DIRECTIONALITY (§11.1)');
eq(E.ENUMS.ERROR_SEVERITY, ['WARNING', 'DEGRADED', 'BLOCKING'], 'ERROR_SEVERITY (§30)');
// ambigüedades registradas en los enums
eq(E.ENUMS.CONTINUITY_MODE, ['CONTINUOUS', 'BRIDGED', 'NEW_SERIES'], 'CONTINUITY_MODE reusa DEFINITION_CONTINUITY (ambigüedad E)');
eq(E.PARAMS.MAX_CONTINUITY_GAP, null, 'MAX_CONTINUITY_GAP sin valor (ambigüedad B)');
eq(E.PARAMS.MAX_CONTINUITY_GAP_ESTADO, 'PENDIENTE_CALIBRACION', '...marcado PENDIENTE_CALIBRACION');
eq(E.PARAMS.FRESHNESS_ESTADO, 'PENDIENTE_CALIBRACION', 'freshness sin fórmula (ambigüedad C), PENDIENTE_CALIBRACION');
// REAPERTURA Fase 4 — constantes calibrables de temporal.js (Grupo 1: nombre sin número)
eq([E.PARAMS.STABILITY_CV_STABLE, E.PARAMS.STABILITY_CV_MODERATE], [null, null], 'cortes de CV para SERIES_STABILITY null (ambig. AA)');
eq([E.PARAMS.PATTERN_MIN_PUNTOS, E.PARAMS.PATTERN_TREND_SLOPE, E.PARAMS.PATTERN_SEASONAL], [null, null, null], 'params de TEMPORAL_PATTERN null (ambig. AB)');
eq([E.PARAMS.MIN_HISTORIA_TRAJ, E.PARAMS.SPARSITY_MIN_DENSIDAD, E.PARAMS.TEMPORAL_WINDOW], [null, null, null], 'MIN_HISTORIA_TRAJ / SPARSITY / TEMPORAL_WINDOW null (ambig. AC/AG/AD)');
eq(E.PARAMS.TEMPORAL_METHOD_DEFAULT, 'DELTA', 'TEMPORAL_METHOD_DEFAULT = DELTA (§11.2 no está en ningún esquema, ambig. AD)');
eq(E.PARAMS.TEMPORAL_ESTADO, 'PENDIENTE_CALIBRACION', 'bloque temporal PENDIENTE_CALIBRACION');
eq(E.ENUMS.AUSENCIA_KIND.indexOf('N_A'), -1, '§28: N_A NO es una categoría de valor de observación');

// ═══════════════════════════════════════════════════════════════════════
seccion('§28 — clasificarAusencia: 0 ≠ missing ≠ null');
// ═══════════════════════════════════════════════════════════════════════

eq(C.clasificarAusencia({ value: 12.5, quality_status: 'VALID' }), 'VALOR_PRESENTE', 'número finito no-cero → VALOR_PRESENTE');
eq(C.clasificarAusencia({ value: 0, quality_status: 'VALID' }), 'CERO_OBSERVADO', '0 con quality VALID → CERO_OBSERVADO (§9: fuente lo sustenta)');
eq(C.clasificarAusencia({ value: 0, quality_status: 'VALID_WITH_LIMITATIONS' }), 'CERO_OBSERVADO', '0 con VALID_WITH_LIMITATIONS → CERO_OBSERVADO');
eq(C.clasificarAusencia({ value: 0, quality_status: 'MISSING' }), 'INVALIDO', '0 sin confirmación de fuente → INVALIDO (INV-PIIO-03: cero ≠ missing)');
eq(C.clasificarAusencia({ value: 0 }), 'INVALIDO', '0 sin quality_status → INVALIDO');
eq(C.clasificarAusencia({ value: null, quality_status: 'MISSING' }), 'MISSING', 'null + MISSING → MISSING (§28)');
eq(C.clasificarAusencia({ value: null, absence_reason: 'sensor caído' }), 'NULL_CON_RAZON', 'null + razón → NULL_CON_RAZON');
eq(C.clasificarAusencia({ value: null }), 'INVALIDO', 'null sin MISSING ni razón → INVALIDO (INV-PIIO-64 / AC74)');
eq(C.clasificarAusencia({ value: 'N_A' }), 'INVALIDO', '"N_A" como value → INVALIDO (§28: N_A es de pos/traj/pers, no de valor)');
eq(C.clasificarAusencia({ value: NaN }), 'INVALIDO', 'NaN → INVALIDO (no clampa)');
eq(C.clasificarAusencia(null), 'INVALIDO', 'null como obs → INVALIDO');

// ═══════════════════════════════════════════════════════════════════════
seccion('§7 — METRIC_DEFINITION');
// ═══════════════════════════════════════════════════════════════════════

function md(over) {
  return Object.assign({
    metric_definition_id: 'md1', phenomenon_id: 'ph1', name: 'Tasa X', operational_definition: 'defn',
    unit: '%', metric_type: 'RATE', directionality: 'HIGHER_IS_WORSE',
    source_frequency: 'monthly', calculation_frequency: 'monthly', aggregation_frequency: 'quarterly',
    boundary_behavior: 'INVALID', recurrence_type: 'RATE_BASED', definition_version: 'v1', valid_from: '2026-01-01',
    continuity_mode: 'CONTINUOUS'
  }, over || {});
}
ok(C.validarMetricDefinition(md()).valido, 'METRIC_DEFINITION mínima válida');
ok(!C.validarMetricDefinition(md({ metric_type: 'PERCENT' })).valido, 'metric_type fuera de enum → inválido');
ok(!C.validarMetricDefinition(md({ boundary_behavior: undefined })).valido, 'sin boundary_behavior → inválido (§7)');
ok(!C.validarMetricDefinition(md({ continuity_mode: 'SILENT' })).valido, 'continuity_mode fuera de enum → inválido');
// ambigüedad D — TARGET_RANGE exige target_range_rules
ok(!C.validarMetricDefinition(md({ directionality: 'TARGET_RANGE' })).valido, 'TARGET_RANGE sin target_range_rules → inválido (§11.1 / ambigüedad D)');
ok(C.validarMetricDefinition(md({ directionality: 'TARGET_RANGE', target_range_rules: { below: 'x', above: 'y' } })).valido, 'TARGET_RANGE con { below, above } → válido');
ok(C.validarMetricDefinition(md({ directionality: 'HIGHER_IS_WORSE', target_range_rules: undefined })).valido, 'no-TARGET_RANGE no exige target_range_rules');

// ═══════════════════════════════════════════════════════════════════════
seccion('§9 — KPI_OBSERVATION (value nullable, null exige razón)');
// ═══════════════════════════════════════════════════════════════════════

function obs(over) {
  return Object.assign({
    observation_id: 'o1', organization_id: 'org1', kpi_id: 'k1', metric_definition_id: 'md1', node_id: 'n1',
    period_start: '2026-01-01', period_end: '2026-01-31', observed_at: '2026-02-01',
    value: 3.2, unit: '%', source_id: 's1', source_traceable: true, quality_status: 'VALID'
  }, over || {});
}
ok(C.validarKpiObservation(obs()).valido, 'KPI_OBSERVATION mínima válida');
ok(C.validarKpiObservation(obs({ value: null, quality_status: 'MISSING' })).valido, 'value=null + MISSING → válido');
ok(C.validarKpiObservation(obs({ value: 0, quality_status: 'VALID' })).valido, 'value=0 + VALID → válido (0 es un valor)');
ok(!C.validarKpiObservation(obs({ value: null, quality_status: 'VALID' })).valido, 'value=null + quality≠MISSING sin absence_reason → inválido (§28 / INV-64)');
ok(C.validarKpiObservation(obs({ value: null, quality_status: 'INVALID', absence_reason: 'fuera de rango' })).valido, 'value=null + razón → válido');
ok(!C.validarKpiObservation(obs({ quality_status: 'DUDOSO' })).valido, 'quality_status fuera de enum → inválido');
ok(!C.validarKpiObservation(obs({ source_traceable: 'sí' })).valido, 'source_traceable no-boolean → inválido');
ok(!C.validarKpiObservation(obs({ node_id: undefined })).valido, 'sin node_id → inválido (identificador requerido, §28)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§10 — KPI_SPEC (DERIVED exige formula_*)');
// ═══════════════════════════════════════════════════════════════════════

function ks(over) {
  return Object.assign({
    kpi_id: 'k1', name: 'KPI 1', description: 'd', primary_domain_id: 'QUALITY', primary_phenomenon_id: 'ph1',
    metric_definition_id: 'md1', evidence_group_id: 'eg1', evidence_proximity: 'DIRECT', computation: 'RAW',
    temporal_role: 'COINCIDENT', freshness_spec: { max_age_current: 2 },
    condition_reference_id: 'rc1', temporal_reference_id: 'rt1', definition_version: 'v1', source_requirements: ['ERP']
  }, over || {});
}
ok(C.validarKpiSpec(ks()).valido, 'KPI_SPEC RAW mínima válida');
ok(!C.validarKpiSpec(ks({ primary_domain_id: 'PEOPLE' })).valido, 'primary_domain_id fuera de los 7 → inválido (§5)');
ok(!C.validarKpiSpec(ks({ computation: 'DERIVED' })).valido, 'DERIVED sin formula_id/version/source_variables → inválido (§10)');
ok(C.validarKpiSpec(ks({ computation: 'DERIVED', formula_id: 'f1', formula_version: 'v1', source_variables: ['a', 'b'] })).valido, 'DERIVED completo → válido');
ok(!C.validarKpiSpec(ks({ freshness_spec: 'reciente' })).valido, 'freshness_spec no-objeto → inválido');
ok(!C.validarKpiSpec(ks({ condition_reference_id: undefined })).valido, 'sin condition_reference_id (REF_COND) → inválido');

// ═══════════════════════════════════════════════════════════════════════
seccion('§14 / §25 — EVIDENCE_GROUP, PHENOMENON/DOMAIN/REFERENCE/NODE_SPEC');
// ═══════════════════════════════════════════════════════════════════════

function eg(over) {
  return Object.assign({
    evidence_group_id: 'eg1', phenomenon_id: 'ph1', node_id: 'n1', member_kpi_ids: ['k1'],
    source_lineage_ids: ['src1'], independence_basis: { kind: 'SEPARATE_SOURCE', detail: 'ERP vs manual' },
    resolution_rule_version: 'v1', status: 'ACTIVE'
  }, over || {});
}
ok(C.validarEvidenceGroup(eg()).valido, 'EVIDENCE_GROUP mínimo válido');
ok(!C.validarEvidenceGroup(eg({ member_kpi_ids: [] })).valido, 'member_kpi_ids vacío → inválido');
ok(!C.validarEvidenceGroup(eg({ independence_basis: 'porque sí' })).valido, 'independence_basis string suelto → inválido (ambigüedad G: { kind, detail })');
ok(!C.validarEvidenceGroup(eg({ independence_basis: { kind: 'MAGIA', detail: 'x' } })).valido, 'independence_basis.kind fuera de enum → inválido');

function ph(over) {
  return Object.assign({
    phenomenon_id: 'ph1', name: 'Fenómeno 1', operational_definition: 'd', canonical_domain_id: 'QUALITY',
    recurrence_type: 'RATE_BASED', directionality: 'HIGHER_IS_WORSE', required_evidence_group_ids: ['eg1'],
    optional_evidence_group_ids: [], proxy_allowed_as_primary: false,
    core_or_supporting_by_domain: { QUALITY: 'CORE' }, applicable_node_types: ['ORG'], version: 'v1', valid_from: '2026-01-01'
  }, over || {});
}
ok(C.validarPhenomenonSpec(ph()).valido, 'PHENOMENON_SPEC mínimo válido');
ok(!C.validarPhenomenonSpec(ph({ canonical_domain_id: 'COSTO' })).valido, 'canonical_domain_id no canónico → inválido (Costo pertenece a CFF, §5)');
ok(!C.validarPhenomenonSpec(ph({ core_or_supporting_by_domain: { QUALITY: 'PRIMARY' } })).valido, 'rol distinto de CORE|SUPPORTING → inválido (§18)');
ok(!C.validarPhenomenonSpec(ph({ core_or_supporting_by_domain: { PEOPLE: 'CORE' } })).valido, 'rol sobre dominio no canónico → inválido');

function ds(over) {
  return Object.assign({
    domain_id: 'QUALITY', definition: 'd', applicability_by_context: { default: 'REQUIRED' },
    core_phenomenon_ids: ['ph1'], supporting_phenomenon_ids: [], version: 'v1'
  }, over || {});
}
ok(C.validarDomainSpec(ds()).valido, 'DOMAIN_SPEC mínimo válido');
ok(!C.validarDomainSpec(ds({ domain_id: 'PEOPLE' })).valido, 'domain_id no canónico → inválido');
ok(!C.validarDomainSpec(ds({ applicability_by_context: { default: 'SIEMPRE' } })).valido, 'applicability fuera de REQUIRED|OPTIONAL|NOT_APPLICABLE → inválido');

function rs(over) {
  return Object.assign({
    reference_id: 'rc1', reference_role: 'CONDITION', reference_type: 'NORMATIVE', source: 'ISO', valid_from: '2026-01-01',
    rule: 'r', comparability_assessment: 'a', traceability: 't', version: 'v1',
    admissibility_declared: 'ADMISSIBLE'
  }, over || {});
}
ok(C.validarReferenceSpec(rs()).valido, 'REFERENCE_SPEC mínimo válido');
ok(!C.validarReferenceSpec(rs({ reference_role: 'BOTH' })).valido, 'reference_role fuera de CONDITION|TEMPORAL → inválido (§8)');
ok(!C.validarReferenceSpec(rs({ reference_type: 'GUT_FEEL' })).valido, 'reference_type fuera de enum → inválido');
// REAPERTURA Fase 3 (ambigüedad X) — admissibility_declared obligatorio (§8.2)
ok(!C.validarReferenceSpec(rs({ admissibility_declared: undefined })).valido, 'sin admissibility_declared → inválido (§8.2 exige veredicto por referencia)');
ok(!C.validarReferenceSpec(rs({ admissibility_declared: 'MAYBE' })).valido, 'admissibility_declared fuera de enum → inválido');
ok(C.validarReferenceSpec(rs({ admissibility_declared: 'ADMISSIBLE_WITH_LIMITATIONS' })).valido, 'ADMISSIBLE_WITH_LIMITATIONS → válido');
ok(C.validarReferenceSpec(rs({ critical_failure: 'benchmark no comparable tras la fusión' })).valido, 'critical_failure (string) → válido');
// §8.3 — change_mode exige supersedes
ok(C.validarReferenceSpec(rs({ change_mode: 'REBASE_HISTORY', supersedes: 'v0' })).valido, 'change_mode + supersedes → válido');
ok(!C.validarReferenceSpec(rs({ change_mode: 'REBASE_HISTORY' })).valido, 'change_mode sin supersedes → inválido (§8.3)');
ok(!C.validarReferenceSpec(rs({ change_mode: 'MUDANZA', supersedes: 'v0' })).valido, 'change_mode fuera de enum → inválido');
// REAPERTURA Fase 3 (ambigüedad Y) — bridge_rule opcional en METRIC_DEFINITION
ok(C.validarMetricDefinition(md({ continuity_mode: 'BRIDGED', bridge_rule: 'multiplicar la serie vieja por 1.08' })).valido, 'METRIC_DEFINITION BRIDGED + bridge_rule → válido');
ok(C.validarMetricDefinition(md({ continuity_mode: 'BRIDGED' })).valido, 'BRIDGED sin bridge_rule → VÁLIDO en el contrato (Fase 3 lo degrada a NEW_SERIES + flag, ambig. Y)');

function ns(over) {
  return Object.assign({
    node_id: 'n1', node_type: 'ORG', active_from: '2026-01-01', aggregation_membership: 'set-root',
    scope_rules: { scope: 'ORGANIZATIONAL' }, version: 'v1'
  }, over || {});
}
ok(C.validarNodeSpec(ns()).valido, 'NODE_SPEC mínimo válido (parent null = raíz)');
ok(C.validarNodeSpec(ns({ parent_node_id: null })).valido, 'parent_node_id null explícito → válido');
ok(C.validarNodeSpec(ns({ parent_node_id: 'n0' })).valido, 'parent_node_id string → válido');
ok(!C.validarNodeSpec(ns({ scope_rules: 'org' })).valido, 'scope_rules no-objeto → inválido');

// ═══════════════════════════════════════════════════════════════════════
seccion('§29 — PIIO_INPUT / case (ambigüedad A — decisión de diseño)');
// ═══════════════════════════════════════════════════════════════════════

function input(over) {
  return Object.assign({
    organization_id: 'org1', ruleset_version: 'rs-v1', periods: ['2026-01'],
    domain_catalog: [ds()], phenomenon_catalog: [ph()], metric_definitions: [md()], references: [rs()],
    node_hierarchy: [ns()], kpi_specs: [ks()], evidence_groups: [eg()], observations: [obs()]
  }, over || {});
}
ok(C.validarPIIOInput(input()).valido, 'PIIO_INPUT mínimo válido');
ok(!C.validarPIIOInput(input({ periods: [] })).valido, 'periods vacío → inválido');
ok(!C.validarPIIOInput(input({ ruleset_version: undefined })).valido, 'sin ruleset_version → inválido (reproducibilidad §31)');
ok(!C.validarPIIOInput(input({ observations: 'ninguna' })).valido, 'observations no-array → inválido');
ok(!C.validarPIIOInput(input({ kpi_specs: [ks({ primary_domain_id: 'X' })] })).valido, 'un kpi_spec malformado → PIIO_INPUT inválido');
ok(!C.validarPIIOInput(input({ domain_catalog: 'no' })).valido, 'domain_catalog no-array → inválido');

// ═══════════════════════════════════════════════════════════════════════
seccion('§35 / AC75 / INV-75/76 — sin score EFO 0–100');
// ═══════════════════════════════════════════════════════════════════════

function efo(over) {
  return Object.assign({
    efo_state_id: 'e1', organization_id: 'org1', node_id: 'n1', scope: 'ORGANIZATIONAL', period: '2026-01',
    pos: 'F', admissibility: true, piio_run_id: 'run1', ruleset_version: 'rs-v1'
  }, over || {});
}
ok(C.validarEFOStateLigero(efo()).valido, 'EFO_STATE esqueleto válido');
ok(!C.validarEFOStateLigero(efo({ pos: 'FAVORABLE' })).valido, 'pos fuera de F|I|D|N_A → inválido');
ok(!C.validarEFOStateLigero(efo({ efo_score: 72 })).valido, '`efo_score` → RECHAZADO (AC75)');
ok(!C.validarEFOStateLigero(efo({ promedio_dominios: 0.6 })).valido, '`promedio_dominios` → RECHAZADO (INV-76)');
ok(!C.validarEFOStateLigero(efo({ pos: undefined })).valido, 'sin pos → inválido');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. clasificarAusencia: quitar la rama de cero (`v !== 0` → siempre');
console.log('     VALOR_PRESENTE). → 4 rojos (los 4 asserts de value=0: CERO_OBSERVADO ×2,');
console.log('     INVALIDO ×2). INV-PIIO-03 (cero ≠ missing).');
console.log('  2. clasificarAusencia: null sin razón → MISSING en vez de INVALIDO.');
console.log('     → 1 rojo ("null sin MISSING ni razón → INVALIDO", INV-64 / AC74).');
console.log('  3. validarMetricDefinition: quitar el chequeo TARGET_RANGE.');
console.log('     → 1 rojo ("TARGET_RANGE sin target_range_rules → inválido", ambigüedad D).');
console.log('  4. validarKpiSpec: quitar el bloque DERIVED.');
console.log('     → 1 rojo ("DERIVED sin formula_* → inválido", §10).');
console.log('  5. validarPhenomenonSpec: aceptar cualquier valor en core_or_supporting_by_domain.');
console.log('     → 2 rojos ("rol distinto de CORE|SUPPORTING → inválido", "rol sobre dominio');
console.log('     no canónico → inválido") — §18.');
console.log('  6. validarEFOStateLigero: vaciar CLAVES_SCORE_PROHIBIDAS.');
console.log('     → 2 rojos (efo_score, promedio_dominios) — AC75 / INV-PIIO-75/76.');
console.log('  7. (reapertura Fase 3) `admissibility_declared` opcional en vez de required.');
console.log('     → 1 rojo ("sin admissibility_declared → inválido", §8.2 / ambig. X).');
console.log('  8. (reapertura Fase 3) validarReferenceSpec sin el chequeo change_mode⇒supersedes.');
console.log('     → 1 rojo ("change_mode sin supersedes → inválido", §8.3).');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
