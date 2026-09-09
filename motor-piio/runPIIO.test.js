/**
 * motor-piio/runPIIO.test.js — Fase 11a
 * node motor-piio/runPIIO.test.js
 *
 * Orquestador §29 — encadenado de la cascada (pasos 1–11). Verifica el
 * _CONTRATO_INTERFAZ de las 10 fronteras y la propagación de errores
 * §30/§30.1. Oráculo conductual: AC69 (error local → otros continúan),
 * AC63 (fenómeno provisional no alimenta EFO), AC70/71 (config corrupta →
 * BLOCKED), AC73 (KPI bloqueado no publica su estado).
 */

'use strict';

var R = require('./runPIIO');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }
function tieneFinding(out, code) { return out.findings.some(function (f) { return f.code === code; }); }
function findingDe(out, code) { return out.findings.filter(function (f) { return f.code === code; })[0]; }

// ── fixture: PIIO_INPUT completo — 1 org, 2 nodos (n-root, n-a), 2 períodos,
//    1 dominio, 1 fenómeno, 2 KPIs (k1 en n-root, k2 en n-a) ─────────────

function md(o) {
  return Object.assign({
    metric_definition_id: 'md1', phenomenon_id: 'ph1', name: 'X', operational_definition: 'd', unit: '%',
    metric_type: 'RATE', directionality: 'HIGHER_IS_WORSE',
    source_frequency: 'monthly', calculation_frequency: 'monthly', aggregation_frequency: 'monthly',
    boundary_behavior: 'INVALID', recurrence_type: 'RATE_BASED', definition_version: 'v1',
    valid_from: '2025-01', continuity_mode: 'CONTINUOUS'
  }, o || {});
}
function rs(o) {
  return Object.assign({
    reference_id: 'rc1', reference_role: 'CONDITION', reference_type: 'NORMATIVE', source: 'ISO', valid_from: '2025-01',
    rule: 'r', comparability_assessment: 'a', traceability: 't', version: 'v1', admissibility_declared: 'ADMISSIBLE', threshold: 50
  }, o || {});
}
function ph(o) {
  return Object.assign({
    phenomenon_id: 'ph1', name: 'F1', operational_definition: 'd', canonical_domain_id: 'QUALITY',
    recurrence_type: 'RATE_BASED', directionality: 'HIGHER_IS_WORSE',
    required_evidence_group_ids: [], optional_evidence_group_ids: ['eg1', 'eg2'], proxy_allowed_as_primary: false,
    core_or_supporting_by_domain: { QUALITY: 'CORE' }, applicable_node_types: ['ORG'], version: 'v1', valid_from: '2025-01'
  }, o || {});
}
function ds(o) {
  return Object.assign({
    domain_id: 'QUALITY', definition: 'd', applicability_by_context: { ORG: 'REQUIRED', 'DEFAULT': 'REQUIRED', org1: 'REQUIRED' },
    core_phenomenon_ids: ['ph1'], supporting_phenomenon_ids: [], version: 'v1'
  }, o || {});
}
function ns(o) {
  return Object.assign({
    node_id: 'n-root', node_type: 'ORG', active_from: '2025-01', aggregation_membership: 'set-root',
    scope_rules: { scope: 'ORGANIZATIONAL' }, version: 'v1', parent_node_id: null
  }, o || {});
}
function ks(o) {
  return Object.assign({
    kpi_id: 'k1', name: 'K1', description: 'd', primary_domain_id: 'QUALITY', primary_phenomenon_id: 'ph1',
    metric_definition_id: 'md1', evidence_group_id: 'eg1', evidence_proximity: 'DIRECT', computation: 'RAW',
    temporal_role: 'COINCIDENT', freshness_spec: { max_age_current: 2 },
    condition_reference_id: 'rc1', temporal_reference_id: 'rt1', definition_version: 'v1', source_requirements: ['ERP']
  }, o || {});
}
function eg(o) {
  return Object.assign({
    evidence_group_id: 'eg1', phenomenon_id: 'ph1', node_id: 'n-root', member_kpi_ids: ['k1'],
    source_lineage_ids: ['s'], independence_basis: { kind: 'SEPARATE_SOURCE', detail: 'x' },
    resolution_rule_version: 'v1', status: 'ACTIVE'
  }, o || {});
}
function obs(o) {
  return Object.assign({
    observation_id: 'o1', organization_id: 'org1', kpi_id: 'k1', metric_definition_id: 'md1', node_id: 'n-root',
    period_start: '2026-01', period_end: '2026-01', observed_at: '2026-02-01',
    value: 80, numerator: 80, denominator: 100, unit: '%', source_id: 's1', source_traceable: true, quality_status: 'VALID'
  }, o || {});
}

function input(o) {
  return Object.assign({
    organization_id: 'org1', ruleset_version: 'rs-v1', periods: ['2026-01', '2026-02'],
    domain_catalog: [ds()], phenomenon_catalog: [ph()], metric_definitions: [md()],
    references: [rs(), rs({ reference_id: 'rt1', reference_role: 'TEMPORAL', threshold: undefined })],
    node_hierarchy: [ns(), ns({ node_id: 'n-a', parent_node_id: 'n-root', aggregation_membership: 'set-a', scope_rules: { scope: 'SEGMENT_ONLY' } })],
    kpi_specs: [ks(), ks({ kpi_id: 'k2', evidence_group_id: 'eg2' })],
    evidence_groups: [eg(), eg({ evidence_group_id: 'eg2', member_kpi_ids: ['k2'], node_id: 'n-a' })],
    observations: [
      // k1 @ n-root:  2026-01 → 80 (D)   2026-02 → 30 (F)
      obs({ value: 80, numerator: 80 }),
      obs({ observation_id: 'o1b', period_start: '2026-02', period_end: '2026-02', value: 30, numerator: 30 }),
      // k2 @ n-a:     2026-01 → 20 (F)   2026-02 → 25 (F)
      obs({ observation_id: 'o2', kpi_id: 'k2', node_id: 'n-a', value: 20, numerator: 20 }),
      obs({ observation_id: 'o2b', kpi_id: 'k2', node_id: 'n-a', period_start: '2026-02', period_end: '2026-02', value: 25, numerator: 25 })
    ]
  }, o || {});
}

// ═══════════════════════════════════════════════════════════════════════
seccion('§29 — la cascada de extremo a extremo');
// ═══════════════════════════════════════════════════════════════════════

var base = R.runPIIO(input());
eq(base.run_status, 'COMPLETED', 'caso bien formado → run_status COMPLETED');
eq(base.findings.filter(function (f) { return f.severity !== 'WARNING'; }), [], 'sin findings BLOCKING/DEGRADED (solo el WARNING informativo de SEGMENT_ONLY)');
eq(base.kpi_states.length, 4, '4 KPI_STATE (k1×2 períodos + k2×2 períodos)');
eq(base.evidence_groups.length, 4, '4 evidence groups (eg1@n-root×2 + eg2@n-a×2)');
eq(base.phenomenon_states.length, 4, '4 PHENOMENON_STATE (ph1 × 2 nodos × 2 períodos)');
eq(base.domain_states.length, 4, '4 DOMAIN_STATE');
eq(base.efo_states.length, 4, '4 EFO_STATE');
eq(base.node_profile.length, 4, 'node_profile: un elemento por (nodo, período) resuelto');

// ── frontera C: cada KPI_STATE viene de las observaciones de SU kpi_id ──
var k1_2601 = base.kpi_states.filter(function (s) { return s.kpi_id === 'k1' && s.period === '2026-01'; })[0];
var k2_2601 = base.kpi_states.filter(function (s) { return s.kpi_id === 'k2' && s.period === '2026-01'; })[0];
eq([k1_2601.original_value, k2_2601.original_value], [80, 20], 'frontera C: k1←obs(80), k2←obs(20) — evals agrupados por kpi_id, no cruzados');
eq([k1_2601.node_id, k2_2601.node_id], ['n-root', 'n-a'], 'frontera C: cada KPI_STATE lleva el node_id de su observación');

// ── frontera F / cruce #2: metric_definition_version roscado ──
eq(k1_2601.metric_definition_version, 'v1', 'cruce #2: KPI_STATE.metric_definition_version = metricDef.definition_version (v1)');

// ── frontera H: el fenómeno de (n-root, 2026-01) se resuelve SOLO con la
//    evidencia de ese nodo/período (k1=D en n-root, k2=F en n-a) ──
var psR1 = base.phenomenon_states.filter(function (p) { return p.node_id === 'n-root' && p.period === '2026-01'; })[0];
eq(psR1.pos, 'D', 'frontera H: PHENOMENON(n-root, 2026-01) = D — solo la evidencia de n-root (k1); la F de n-a NO entra');
eq(psR1.evidence_group_profile.map(function (g) { return g.evidence_group_id; }), ['eg1'], '...evidence_group_profile lista solo eg1 (el grupo de n-root)');

// ── frontera I: el dominio de (n-root, 2026-01) usa solo los fenómenos de
//    ESE período (ph1@2026-01 = D), no los de 2026-02 (ph1@2026-02 = F) ──
var domR1 = base.domain_states.filter(function (d) { return d.node_id === 'n-root' && d.period === '2026-01'; })[0];
eq(domR1.pos, 'D', 'frontera I: DOMAIN(n-root, 2026-01) = D — solo ph1@2026-01; mezclar con ph1@2026-02 (F) daría I');

// ── frontera J: la EFO de (n-root, 2026-02) usa solo el dominio de ESE
//    período (QUALITY@2026-02 = F); mezclar con 2026-01 (D) daría D ──
var efoR2 = base.efo_states.filter(function (e) { return e.node_id === 'n-root' && e.period === '2026-02'; })[0];
eq(efoR2.pos, 'F', 'frontera J: EFO(n-root, 2026-02) = F — solo QUALITY@2026-02; mezclar con 2026-01 (D) daría D');
eq(base.efo_states.filter(function (e) { return e.node_id === 'n-a'; }).length, 2, '...y n-a tiene sus 2 EFO_STATE separados');

// ── frontera K / F10: node_profile con scope del NODE_SPEC ──
var np_na = base.node_profile.filter(function (p) { return p.node_id === 'n-a'; })[0];
eq(np_na.scope, 'SEGMENT_ONLY', 'frontera K: node_profile de n-a lleva scope SEGMENT_ONLY del NODE_SPEC');
eq(np_na.node_level, 1, '...+ node_level 1 (n-a es hijo de n-root)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§30 — BLOCKING + GLOBAL aborta la corrida (AC70/71)');
// ═══════════════════════════════════════════════════════════════════════

var corrupto = R.runPIIO(input({ domain_catalog: [ds({ core_phenomenon_ids: ['ph-inexistente'] })] }));
eq(corrupto.run_status, 'BLOCKED', 'catálogo con fenómeno colgante → run_status BLOCKED');
eq([corrupto.kpi_states.length, corrupto.efo_states.length], [0, 0], '...ningún estado publicado');
ok(corrupto.findings.length > 0, '...con findings que explican el bloqueo');

var formaMala = R.runPIIO(input({ kpi_specs: [ks({ primary_domain_id: 'X' })] }));
eq(formaMala.run_status, 'BLOCKED', 'forma inválida (Fase 0) → BLOCKED');

// ═══════════════════════════════════════════════════════════════════════
seccion('§30 — BLOCKING + STATE: KPI bloqueado NO publica, el resto sigue (AC73)');
// ═══════════════════════════════════════════════════════════════════════

// md version que k2 pide pero que no existe
var mdAusente = R.runPIIO(input({ kpi_specs: [ks(), ks({ kpi_id: 'k2', evidence_group_id: 'eg2', definition_version: 'v9' })] }));
eq(mdAusente.kpi_states.some(function (s) { return s.kpi_id === 'k2'; }), false, 'AC73: k2 (md@v9 ausente) NO produce KPI_STATE');
eq(mdAusente.kpi_states.some(function (s) { return s.kpi_id === 'k1'; }), true, '...pero k1 (md@v1 OK) sí — la cascada continúa');
ok(tieneFinding(mdAusente, 'METRIC_DEFINITION_VERSION_AUSENTE'), '...+ finding METRIC_DEFINITION_VERSION_AUSENTE / BLOCKING / STATE');
eq((findingDe(mdAusente, 'METRIC_DEFINITION_VERSION_AUSENTE') || {}).severity, 'BLOCKING', '...severidad BLOCKING');
eq(mdAusente.run_status, 'PARTIAL', '...run_status PARTIAL (no BLOCKED — el fallo es de estado, no global)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§30.1 / AC69 — un bloqueo de ESTADO no se propaga globalmente');
// ═══════════════════════════════════════════════════════════════════════

// k2 bloqueado (md@v9 ausente) es un fallo de ESTADO — la cascada de k1 /
// n-root, que es EVIDENCIA INDEPENDIENTE, llega hasta EFO igual.
var indep = R.runPIIO(input({ kpi_specs: [ks(), ks({ kpi_id: 'k2', evidence_group_id: 'eg2', definition_version: 'v9' })] }));
eq(indep.run_status, 'PARTIAL', 'k2 bloqueado → run_status PARTIAL, NO BLOCKED (§30.1: propagación por dependencia)');
eq(indep.kpi_states.filter(function (s) { return s.kpi_id === 'k1'; }).length, 2, 'AC69: k1 produce sus 2 KPI_STATE aunque k2 esté bloqueado');
eq(indep.efo_states.filter(function (e) { return e.node_id === 'n-root'; }).length, 2, '...y la cascada de n-root (independiente de n-a/k2) llega hasta EFO');
eq(indep.phenomenon_states.filter(function (p) { return p.node_id === 'n-a'; }).length, 0, '...mientras n-a/k2 no produce fenómeno (su único KPI está bloqueado)');

// ═══════════════════════════════════════════════════════════════════════
seccion('AC63 / INV-69 — fenómeno PIIO_COMPATIBLE_PROVISIONAL no alimenta EFO');
// ═══════════════════════════════════════════════════════════════════════

var provis = R.runPIIO(input({
  phenomenon_catalog: [ph({ status: 'PIIO_COMPATIBLE_PROVISIONAL' })]
}));
eq(provis.phenomenon_states.length, 0, 'AC63: fenómeno provisional → 0 PHENOMENON_STATE en la cascada EFO');
eq(provis.efo_states.every(function (e) { return e.pos === 'N_A'; }), true, '...las EFO quedan N_A (sin fenómenos que las alimenten)');
ok(tieneFinding(provis, 'FENOMENO_PROVISIONAL_EXCLUIDO'), '...+ finding FENOMENO_PROVISIONAL_EXCLUIDO (WARNING)');

// ═══════════════════════════════════════════════════════════════════════
seccion('ambig. AV — contexto cableado desde el nodo (frontera I)');
// ═══════════════════════════════════════════════════════════════════════

// con un applicability_by_context que solo conoce 'ORG' (node_type de n-root)
var ctxOk = R.runPIIO(input({ domain_catalog: [ds({ applicability_by_context: { ORG: 'REQUIRED' } })] }));
eq(ctxOk.domain_states.some(function (d) { return d.applicability === 'REQUIRED'; }), true, 'frontera I: contexto=node_type "ORG" → dominio REQUIRED');
// contexto que el mapa no conoce → NOT_APPLICABLE (no revienta la cascada)
var ctxNo = R.runPIIO(input({ domain_catalog: [ds({ applicability_by_context: { OTRO: 'REQUIRED' } })] }));
eq(ctxNo.domain_states.every(function (d) { return d.applicability === 'NOT_APPLICABLE'; }), true, 'frontera I: contexto no reconocido → todos los dominios NOT_APPLICABLE (ambig. AV, sin inventar)');

// ═══════════════════════════════════════════════════════════════════════
seccion('_clasificarRun / run_status');
// ═══════════════════════════════════════════════════════════════════════

eq(R._clasificarRun([]), 'COMPLETED', 'sin findings → COMPLETED');
eq(R._clasificarRun([{ severity: 'WARNING', scope: 'KPI' }]), 'COMPLETED', 'solo WARNING → COMPLETED');
eq(R._clasificarRun([{ severity: 'DEGRADED', scope: 'KPI' }]), 'PARTIAL', 'algún DEGRADED → PARTIAL');
eq(R._clasificarRun([{ severity: 'BLOCKING', scope: 'STATE' }]), 'PARTIAL', 'BLOCKING+STATE → PARTIAL');
eq(R._clasificarRun([{ severity: 'BLOCKING', scope: 'GLOBAL' }]), 'BLOCKED', 'BLOCKING+GLOBAL → BLOCKED');

// ═══════════════════════════════════════════════════════════════════════
seccion('_resolverMetricDef / _ctxNodo — helpers');
// ═══════════════════════════════════════════════════════════════════════

eq(R._resolverMetricDef({ metric_definition_id: 'md1', definition_version: 'v1' }, [md()]).definition_version, 'v1', '_resolverMetricDef: id + version → el md correcto');
eq(R._resolverMetricDef({ metric_definition_id: 'md1', definition_version: 'v2' }, [md()]), null, '_resolverMetricDef: version que no existe → null');
eq(R._ctxNodo('n-root', input()), 'ORG', '_ctxNodo: sin scope_rules.context → node_type');
eq(R._ctxNodo('n-root', input({ node_hierarchy: [ns({ scope_rules: { scope: 'ORGANIZATIONAL', context: 'CTX-1' } }), ns({ node_id: 'n-a', parent_node_id: 'n-root' })] })), 'CTX-1', '_ctxNodo: con scope_rules.context → ese valor');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. [frontera C] la línea del lookup en el bucle de KPI:');
console.log('     `evals: evalsPorKpi[kpiSpec.kpi_id] || [],`  →  `evals: ing.evals,`');
console.log('     (cada KPI recibe TODAS las evals) → 7 rojos: "k1←80,k2←20", node_id por');
console.log('     observación, evidence_group_profile, conteos de KPI/eg, AC69.');
console.log('  2. [frontera G] se pasa `ing.evals` (OBSERVATION_EVAL) a agruparPorEvidenceGroup en');
console.log('     vez de `kpi_states` → los conteos de eg/phen/dom/efo caen o crashean.');
console.log('  3. [frontera H] `grupos` sin filtrar por node_id/period → "1 PHENOMENON_STATE para');
console.log('     (ph1,n-root,2026-01)" cae (entra evidencia de otro nodo/período).');
console.log('  4. [frontera I] `phenStates` sin filtrar por core/supporting del dominio →');
console.log('     un fenómeno ajeno entra (aquí solo hay ph1, pero el filtro de (nodo,período)');
console.log('     también vive ahí) → "n-a tiene sus 2 EFO separados" cae.');
console.log('  5. [frontera J] `domain_states` sin filtrar por node_id/period → EFO mezcla nodos →');
console.log('     "n-a tiene sus 2 EFO_STATE" cae.');
console.log('  6. [§30] `!cfg.ok` no aborta → "catálogo colgante → BLOCKED" y "ningún estado" caen.');
console.log('  7. [§30] en la rama if (!metricDef) del bucle de KPI: se quita el');
console.log('     findings.push(_finding("METRIC_DEFINITION_VERSION_AUSENTE", ...)) → 2 rojos');
console.log('     (el finding + su .severity; el accesor tolerante || {} evita el crash).');
console.log('  8. [§30.1] _clasificarRun: `BLOCKING && GLOBAL` → solo `BLOCKING` (cualquier scope)');
console.log('     → un bloqueo de ESTADO (k2 md ausente) da run_status BLOCKED en vez de PARTIAL');
console.log('     → "k2 bloqueado → PARTIAL no BLOCKED" (§30.1) cae.');
console.log('  9. [provisional] no se saltan los fenómenos PIIO_COMPATIBLE_PROVISIONAL → AC63');
console.log('     ("0 PHENOMENON_STATE") + el finding caen.');
console.log('  10. [frontera I / AV] `_ctxNodo` devuelve siempre "DEFAULT" (no lee node_type) →');
console.log('      "contexto ORG → REQUIRED" cae (todos NOT_APPLICABLE).');
console.log('  11. [cruce #2] `_resolverMetricDef` ignora `definition_version` → "md@v9 ausente →');
console.log('      k2 no publica" cae (resuelve md@v1 para v9).');
console.log('  12. `_clasificarRun` → siempre "COMPLETED" → "md ausente → PARTIAL" y los asserts');
console.log('      directos de _clasificarRun caen.');
console.log('  Conteos: 7, 5, 4, 2, 1, 1, 2, 3, 3, 3, 3, 5.');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
