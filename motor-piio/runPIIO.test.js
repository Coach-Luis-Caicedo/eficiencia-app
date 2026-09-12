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
seccion('REAPERTURA 12b (Commit B) — series_stability ya NO es código muerto en runPIIO()');
// ═══════════════════════════════════════════════════════════════════════

// n-root tiene 2 períodos reales (k1: 80 en 2026-01, 30 en 2026-02) — antes
// de esta reapertura, CUALQUIER PHENOMENON_STATE de una corrida real daba
// series_stability=INSUFFICIENT + TEMPORALES_FENOMENO_SIN_SERIE, siempre,
// porque runPIIO() nunca pasaba contextoGobernante. Ahora sí se deriva.
var psR2chk = base.phenomenon_states.filter(function (p) { return p.node_id === 'n-root' && p.period === '2026-02'; })[0];
ok(!psR2chk.flags.some(function (f) { return f === 'TEMPORALES_FENOMENO_SIN_SERIE'; }), 'frontera nueva: PHENOMENON_STATE de una corrida REAL de runPIIO() ya no cae en "sin serie" — evalsPorKpi llega desde el orquestador');
eq(psR2chk.series_stability, 'HIGHLY_VARIABLE', '...CV≈0.45 de [80,30] (genérico, sin calibración propia/global) → HIGHLY_VARIABLE, no INSUFFICIENT');
eq(psR2chk.series_stability_origen, 'CALIBRACION_GENERICA', '...origen visible: CALIBRACION_GENERICA (nunca se presenta como propia de EFICIENCIA)');

// regime_status también deriva de un directivasPorKpi REAL, no de {} vacío
// — rc1 con change_mode=START_NEW_REGIME debe dar NEW_REGIME (regimen({})
// daría CONTINUOUS igual que regimen(directivas reales SIN cambio, así que
// esta prueba usa una directiva que SÍ distingue ambos casos).
var conNuevoRegimen = R.runPIIO(input({ references: [rs({ change_mode: 'START_NEW_REGIME', supersedes: 'v0' }), rs({ reference_id: 'rt1', reference_role: 'TEMPORAL', threshold: undefined })] }));
var psNR = conNuevoRegimen.phenomenon_states.filter(function (p) { return p.node_id === 'n-root' && p.period === '2026-02'; })[0];
eq(psNR.regime_status, 'NEW_REGIME', 'regime_status = NEW_REGIME cuando la directiva REAL del KPI gobernante (rc1 con START_NEW_REGIME) llega vía directivasPorKpi (no {} vacío)');

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
//  11b — salidas, versionamiento, publicación (§26 / §31 / §32)
// ═══════════════════════════════════════════════════════════════════════

var full = R.runPIIOCompleto(input());

seccion('§31 — PIIO_RUN (15 campos) + determinismo (INV-67/AC68)');

eq(Object.keys(full.piio_run).length, 15, 'PIIO_RUN tiene exactamente 15 campos (§31)');
eq(full.piio_run.run_status, 'COMPLETED', 'PIIO_RUN.run_status = el de 11a');
eq(full.piio_run.update_reason, 'INITIAL', 'update_reason por defecto → INITIAL');
ok(/^rs=rs-v1\|/.test(full.piio_run.calculation_version), 'calculation_version determinista (empieza por rs=rs-v1|, sin timestamp)');
eq(full.piio_run.piio_run_id, 'org1|2026-01,2026-02|' + full.piio_run.calculation_version, 'piio_run_id = org | periods | calculation_version (determinista)');
// determinismo: dos corridas idénticas salvo generated_at
var d1 = R.runPIIOCompleto(input());
var d2 = R.runPIIOCompleto(input());
ok(d1.piio_run.generated_at !== undefined && typeof d1.piio_run.generated_at === 'string', 'generated_at presente (ISO string)');
delete d1.piio_run.generated_at;
delete d2.piio_run.generated_at;
eq(JSON.stringify(d1), JSON.stringify(d2), 'INV-67/AC68: dos corridas con el mismo input → deep-equal EXCLUYENDO SOLO generated_at');
// cambiar una versión → distinto calculation_version y piio_run_id
var otroRs = R.runPIIOCompleto(input({ ruleset_version: 'rs-v2' }));
ok(otroRs.piio_run.calculation_version !== full.piio_run.calculation_version, 'cambio de ruleset_version → calculation_version distinto (AC67)');

seccion('§26 — PIIO_OPERATIONAL_EXPORT (21 campos): proyección pura');

eq(full.operational_export.length, 4, '4 filas de export (ph1 × 2 nodos × 2 períodos)');
var xr = full.operational_export.filter(function (r) { return r.node_id === 'n-root' && r.period === '2026-01'; })[0];
eq(Object.keys(xr).length, 21, 'cada fila tiene exactamente 21 campos (§26)');
eq([xr.numerator, xr.denominator, xr.observed_quantity], [80, 100, 80], 'numerator/denominator/observed_quantity COPIADOS de la observación, sin calcular');
var psR1chk = full.phenomenon_states.filter(function (p) { return p.node_id === 'n-root' && p.period === '2026-01'; })[0];
eq([xr.position, xr.trajectory], [psR1chk.pos, psR1chk.traj], 'position/trajectory COPIADOS tal cual del PHENOMENON_STATE (sin recalcular)');
eq([xr.recurrence_type, xr.directionality, xr.unit], ['RATE_BASED', 'HIGHER_IS_WORSE', '%'], 'recurrence_type/directionality/unit COPIADOS del METRIC_DEFINITION');
eq(xr.piio_run_id, full.piio_run.piio_run_id, 'source_refs + piio_run_id trazables');
// PIIO ↛ dinero/modelo: ninguna clave económica ni predictiva
var clavesExport = full.operational_export.reduce(function (acc, r) { return acc.concat(Object.keys(r)); }, []);
ok(!clavesExport.some(function (k) { return /cost|roi|tre|npv|projec|forecast|monetiz|predic|estimated/i.test(k); }), 'INV-43/44/45: ninguna clave de costo / ROI / TRE / proyección en el export');

seccion('§6.2 — fenómeno PIIO_COMPATIBLE_PROVISIONAL: en el export, NO en EFO');

var prov = R.runPIIOCompleto(input({ phenomenon_catalog: [ph({ status: 'PIIO_COMPATIBLE_PROVISIONAL' })] }));
eq(prov.efo_states.length, 0, 'AC63: el fenómeno provisional NO produce EFO_STATE (no alimenta la cascada)');
ok(prov.operational_export.length > 0, '§6.2: PERO el export para CFF/IFD SÍ lleva sus filas (' + prov.operational_export.length + ')');
eq(prov.operational_export.every(function (r) { return r.phenomenon_id === 'ph1'; }), true, '...todas del fenómeno provisional ph1');

seccion('§32 — TRACE_PATH (12 campos): genealogía hasta observaciones/referencias');

var tps = full.trace_paths;
eq(tps.filter(function (t) { return t.output_type === 'EFO_STATE'; }).length, 4, 'un TRACE_PATH por EFO_STATE');
var tEfo = tps.filter(function (t) { return t.output_type === 'EFO_STATE' && t.output_id.indexOf('n-root') !== -1; })[0];
eq(Object.keys(tEfo).length, 12, 'cada TRACE_PATH tiene 12 campos (§32)');
ok(tEfo.observation_ids.length > 0, 'INV-80/AC80: el trace de una EFO llega hasta observation_ids');
ok(tEfo.reference_ids.length > 0, '...y hasta reference_ids');
eq(tEfo.domain_ids, ['QUALITY'], '...domain_ids del dominio que la alimentó');
eq(tEfo.phenomenon_ids, ['ph1'], '...phenomenon_ids');
eq(tEfo.kpi_ids, ['k1'], '...kpi_ids');
ok(tps.some(function (t) { return t.output_type === 'OPERATIONAL_EXPORT'; }), 'también hay TRACE_PATH para las filas de export (genealogía CFF/IFD, §32)');

seccion('INV-63 — toda salida publicada tiene status y trazabilidad');

eq(full.efo_states.every(function (e) { return e.output_status === 'VALID' || e.output_status === 'VALID_WITH_LIMITATIONS' || e.output_status === 'INSUFFICIENT'; }), true, 'toda EFO publicada tiene output_status válido');
eq(full.efo_states.every(function (e) { return e.piio_run_id === full.piio_run.piio_run_id; }), true, '...y piio_run_id estampado');
eq(full.efo_states.every(function (e) { return e.ruleset_version === 'rs-v1'; }), true, '...y ruleset_version');
ok(R.validarPIIOResult(full).ok, 'validarPIIOResult(full) → ok');

seccion('_outputStatus — el mapeo (decisión etiquetada)');

eq(R._outputStatus({ admissibility: 'ADMISSIBLE', data_quality: 'VALID' }, []), 'VALID', 'ADMISSIBLE + VALID → VALID');
eq(R._outputStatus({ admissibility: 'NOT_ADMISSIBLE' }, []), 'INSUFFICIENT', 'NOT_ADMISSIBLE → INSUFFICIENT');
eq(R._outputStatus({ data_quality: 'INVALID' }, []), 'INVALID', 'data_quality INVALID → INVALID');
eq(R._outputStatus({ admissibility: 'ADMISSIBLE_WITH_LIMITATIONS' }, []), 'VALID_WITH_LIMITATIONS', 'ADMISSIBLE_WITH_LIMITATIONS → VALID_WITH_LIMITATIONS');
eq(R._outputStatus({ efo_state_id: 'e1', admissibility: 'ADMISSIBLE' }, [{ severity: 'DEGRADED', scope: 'STATE', target: 'e1' }]), 'VALID_WITH_LIMITATIONS', 'finding DEGRADED sobre esa salida → VALID_WITH_LIMITATIONS (§30)');
eq(R._outputStatus({ applicability: 'NOT_APPLICABLE' }, []), 'NOT_APPLICABLE', 'applicability NOT_APPLICABLE → NOT_APPLICABLE');

seccion('validarPIIOResult — rechaza claves económicas y salidas sin status/trace');

var conCosto = R.runPIIOCompleto(input());
conCosto.operational_export[0].estimated_cost = 999;
ok(!R.validarPIIOResult(conCosto).ok, 'una fila de export con `estimated_cost` → validarPIIOResult NO ok (INV-43/44/45)');
var sinStatus = R.runPIIOCompleto(input());
delete sinStatus.efo_states[0].output_status;
ok(!R.validarPIIOResult(sinStatus).ok, 'una EFO sin output_status → validarPIIOResult NO ok (INV-63)');

seccion('run_status BLOCKED → PIIO_RESULT sin salidas publicadas');

var bloq = R.runPIIOCompleto(input({ domain_catalog: [ds({ core_phenomenon_ids: ['ph-x'] })] }));
eq(bloq.run_status, 'BLOCKED', 'catálogo corrupto → run_status BLOCKED');
eq([bloq.operational_export.length, bloq.trace_paths.length, bloq.efo_states.length], [0, 0, 0], '...export / trace / efo vacíos (§30: fallo global no publica)');
eq(Object.keys(bloq.piio_run).length, 15, '...pero el PIIO_RUN se emite igual (registra el intento, §31)');

// ═══════════════════════════════════════════════════════════════════════
seccion('REAPERTURA Fase 11 — rebasarHistoria (§8.3/§31/AC12/AC13/INV-66)');
// ═══════════════════════════════════════════════════════════════════════

// fixture propia: 1 nodo, 1 KPI, rc1 SIN valid_to (caso realista — nadie
// declara de antemano que la van a rebasar) — value=80 en ambos períodos.
var inputRebase = input({
  node_hierarchy: [ns()],
  kpi_specs: [ks()],
  evidence_groups: [eg()],
  references: [rs(), rs({ reference_id: 'rt1', reference_role: 'TEMPORAL', threshold: undefined })],
  observations: [
    obs({ value: 80, numerator: 80 }),
    obs({ observation_id: 'o1b', period_start: '2026-02', period_end: '2026-02', value: 80, numerator: 80 })
  ]
});
var previa = R.runPIIOCompleto(inputRebase);
eq(previa.kpi_states.map(function (s) { return s.pos; }), ['D', 'D'], 'antes del rebase: ambos períodos D bajo rc1@v1 (threshold 50, HIGHER_IS_WORSE, value=80)');
var previaSnapshot = JSON.stringify(previa);

var refRebaseada = rs({ version: 'v2', valid_from: '2026-02', threshold: 100, change_mode: 'REBASE_HISTORY', supersedes: 'v1' });
var rebasado = R.rebasarHistoria(inputRebase, refRebaseada, previa);
eq(rebasado.kpi_states.map(function (s) { return s.pos; }), ['D', 'F'], 'AC12: 2026-01 sigue D (histórico protegido por vigencia); 2026-02 pasa a F bajo rc1@v2 (threshold 100)');
eq(rebasado.change_mode, 'REBASE_HISTORY', 'el resultado queda etiquetado change_mode=REBASE_HISTORY');
eq(rebasado.piio_run.parent_calculation_version, previa.piio_run.calculation_version, '§31: parent_calculation_version enlaza con la corrida previa (campo ya existente, no uno nuevo)');
eq(JSON.stringify(previa), previaSnapshot, 'AC12 / INV-66 (mitad computable): "original intacta" — corridaPrevia sin NINGÚN campo tocado (snapshot completo antes/después)');

// §8.3 — guarda de entrada: rebasarHistoria valida change_mode, no confía en el llamante
eq(R.rebasarHistoria(inputRebase, rs({ version: 'v2', change_mode: 'START_NEW_REGIME' }), previa).rechazado, true, 'change_mode=START_NEW_REGIME pasado por error → rechazado, NO procesado como rebase');
eq(R.rebasarHistoria(inputRebase, rs({ version: 'v2' }), previa).rechazado, true, 'sin change_mode → rechazado');

eq(R._periodoAnterior('2026-02'), '2026-01', '_periodoAnterior: mes anterior, mismo año');
eq(R._periodoAnterior('2026-01'), '2025-12', '_periodoAnterior: cruza el límite de año');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones REAPERTURA (rebasarHistoria) — ejecutadas como paso de Bash aparte');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. la guarda `if (directiva.tipo !== \'REBASE_HISTORY\')` → `if (false)` (nunca rechaza) →');
console.log('     2 rojos: los dos asserts de rechazo (START_NEW_REGIME y sin change_mode) ahora procesan.');
console.log('  2. `.concat([rb])` → `.concat([])` (la referencia nueva nunca se agrega) → 1 rojo:');
console.log('     2026-02 queda N_A (v1 quedó cerrada en la fase de clip, pero rb nunca entra) en vez de F.');
console.log('  3. se agrega una línea que muta `corridaPrevia` (`corridaPrevia.tocado_por_rebase = true`) →');
console.log('     1 rojo: el snapshot JSON.stringify(previa) antes/después ya no coincide (INV-66).');
console.log('  4. `parentCalcVer` fijo en `null` (ignora `corridaPrevia.piio_run.calculation_version`) →');
console.log('     1 rojo: el enlace parent_calculation_version con la corrida previa se pierde.');
console.log('  5. se quita `resultado.change_mode = \'REBASE_HISTORY\';` → 1 rojo: el resultado no queda');
console.log('     etiquetado.');
console.log('  6. [el hallazgo del smoke-test] se quita el cierre de ventana de la versión superada →');
console.log('     1 rojo: 2026-02 vuelve a caer en REFERENCIA_VERSIONES_SOLAPADAS → N_A en vez de F');
console.log('     (exactamente el bug real que el smoke-test encontró antes de mostrar el diseño).');
console.log('  Conteos: 2, 1, 1, 1, 1, 1.');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones 11a — ejecutadas como paso de Bash aparte (ver cierre)');
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
seccion('Mutaciones 11b — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. [determinismo] _calculationVersion agrega Date.now() al final del join(\'|\') →');
console.log('     1 rojo: la comparación deep-equal de dos corridas (d1 vs d2, excluyendo SOLO');
console.log('     generated_at) ya no coincide (INV-67/AC68).');
console.log('  2. [determinismo] _piioRunId agrega Math.random() al id →');
console.log('     2 rojos: el formato esperado de piio_run_id ("org|periods|calcVer") y la');
console.log('     comparación deep-equal d1 vs d2.');
console.log('  3. [PIIO ↛ dinero] construirExport agrega `estimated_cost: 999` a cada fila →');
console.log('     3 rojos: el conteo de 21 campos, el chequeo de "ninguna clave económica" y');
console.log('     validarPIIOResult(full).ok (el denylist la detecta también).');
console.log('  4. [PIIO ↛ modelo predictivo] construirExport agrega `projected_trajectory: \'X\'` →');
console.log('     3 rojos: mismo patrón que MUT3 (21 campos, denylist regex, validarPIIOResult).');
console.log('  5. [§6.2] se comenta `estados.push(ps)` para los fenómenos PIIO_COMPATIBLE_PROVISIONAL →');
console.log('     1 rojo: "el export SÍ lleva sus filas" cae (0 filas para el fenómeno provisional).');
console.log('  6. [§32/INV-80] genKpi dentro de construirTracePaths fija `observation_ids: []` →');
console.log('     2 rojos: "el trace de una EFO llega hasta observation_ids" y validarPIIOResult(full).ok');
console.log('     (INV-80 lo rechaza por trace que no llega a observaciones).');
console.log('  7. [§32/INV-80] genKpi fija `reference_ids: []` → 2 rojos: mismo patrón que MUT6,');
console.log('     ahora sobre reference_ids.');
console.log('  8. [_outputStatus] NOT_ADMISSIBLE devuelve VALID en vez de INSUFFICIENT →');
console.log('     1 rojo: el unit test directo de _outputStatus para ese caso.');
console.log('  9. [_outputStatus] se ignora la rama ADMISSIBLE_WITH_LIMITATIONS →');
console.log('     1 rojo: el unit test directo de ese caso.');
console.log('  10. [INV-63] publicar() ya no estampa `s.output_status` (línea comentada) →');
console.log('      2 rojos: "toda EFO publicada tiene output_status válido" y validarPIIOResult(full).ok.');
console.log('  11. [validarPIIOResult] _sinEconomia hace `return;` antes de revisar ninguna clave →');
console.log('      1 rojo: "una fila de export con estimated_cost → validarPIIOResult NO ok" cae');
console.log('      (ya no la detecta).');
console.log('  12. [proyección pura] observed_quantity se calcula como `ev.value * 2` en vez de');
console.log('      copiarse tal cual → 1 rojo: "numerator/denominator/observed_quantity COPIADOS".');
console.log('      (nota: la primera variante de esta mutación —recomputar como');
console.log('      numerator/denominator*100— dio 0 rojos por coincidencia numérica del fixture:');
console.log('      con denominator=100, la razón×100 iguala numerator, que en el fixture ya');
console.log('      coincide con value; se cambió a ×2 para no depender de esa coincidencia.)');
console.log('  Conteos: 1, 2, 3, 3, 1, 2, 2, 1, 1, 2, 1, 1.');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones REAPERTURA 12b (Commit A+B: estabilidadSerie + contextoGobernante)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  Commit A (temporal.js estabilidadSerie), impacto en ESTE archivo dentro del');
console.log('  conteo total reportado en temporal.test.js (7, 3, 1, 1, 7, 2):');
console.log('  1. rama genérica final → INSUFFICIENT+STABILITY_NO_CALIBRADA (revierte) → 2 rojos');
console.log('     aquí ("HIGHLY_VARIABLE..." + "regime_status = NEW_REGIME...").');
console.log('  5. se quita el flag de origen → 1 rojo aquí ("...CALIBRACION_GENERICA...").');
console.log('  (las mutaciones 2/3/4/6 de Commit A no tocan nada que este archivo verifique).');
console.log('');
console.log('  Commit B (phenomenon.js + runPIIO.js — contextoGobernante automático):');
console.log('  1. runPIIO.js: no guardar `directivasPorKpi[kpiSpec.kpi_id]` → 1 rojo aquí');
console.log('     ("regime_status = NEW_REGIME..." — directivas real vs {} vacío; SIN este');
console.log('     fixture específico la mutación queda enmascarada, ver nota en phenomenon.test.js).');
console.log('  2. runPIIO.js: quitar `evalsPorKpi` de la llamada principal (línea ~216) → 4 rojos');
console.log('     aquí (vuelven TEMPORALES_FENOMENO_SIN_SERIE + los 3 asserts que dependen de');
console.log('     series_stability/regime_status reales).');
console.log('  3-6. (truncar por período, filtrar calidad, precedencia manual, gobernante nulo)');
console.log('     no tocan nada que ESTE archivo verifique — sus rojos están en phenomenon.test.js');
console.log('     (ver su propia sección de mutaciones).');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
