/**
 * motor-integracion-piio-aie/pipeline.test.js
 *
 * Cuarto arnés de integración real: motor-piio -> AIE (Python real, vía
 * classify_3F/classify_2F DIRECTOS, no run_case()). node
 * motor-integracion-piio-aie/pipeline.test.js
 *
 * Todos los valores numéricos de este archivo se confirmaron primero con
 * `node -e` contra el código real (runPIIOCompleto + rules_2f_3f), antes
 * de escribir los asserts — no al revés, mismo criterio que las otras 2
 * ramas de integración.
 */

'use strict';

var P = require('./pipeline');

var _ok = 0, _fallos = 0;
function seccion(nombre) { console.log('\n── ' + nombre + ' ' + '─'.repeat(Math.max(0, 66 - nombre.length))); }
function ok(cond, msg) {
  if (cond) { _ok++; console.log('  ✓ ' + msg); }
  else { _fallos++; console.log('  ✗ FALLA: ' + msg); }
}
function eq(a, b, msg) {
  var cond = JSON.stringify(a) === JSON.stringify(b);
  ok(cond, msg + (cond ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']'));
}
function lanza(fn, msg) {
  var lanzo = false, mensaje = '';
  try { fn(); } catch (e) { lanzo = true; mensaje = e.message; }
  ok(lanzo, msg + (lanzo ? '  [' + mensaje.slice(0, 90) + '...]' : ''));
}

// ── fixture PIIO real, mismo patrón que runPIIO.test.js (1 org, hasta 2 nodos,
//    1 dominio REQUIRED, 1-2 fenómenos/KPIs) — no se reinventa el contrato ──
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
function referenciasBase() {
  return [rs(), rs({ reference_id: 'rt1', reference_role: 'TEMPORAL', threshold: undefined })];
}

// ═══════════════════════════════════════════════════════════════════════
seccion('calcularRachaTrayectoria — racha de traj===DETERIORATING consecutivos');
// ═══════════════════════════════════════════════════════════════════════

eq(P.calcularRachaTrayectoria([]), 0, 'historia vacía -> 0');
eq(P.calcularRachaTrayectoria(['N_A']), 0, 'un solo N_A -> 0');
eq(P.calcularRachaTrayectoria(['DETERIORATING']), 1, 'un solo DETERIORATING -> 1');
eq(P.calcularRachaTrayectoria(['DETERIORATING', 'DETERIORATING', 'STABLE']), 0,
  'racha rota por STABLE al final -> 0 (cuenta desde el ÚLTIMO elemento hacia atrás)');
eq(P.calcularRachaTrayectoria(['STABLE', 'DETERIORATING', 'DETERIORATING']), 2,
  'racha activa al final -> 2 (los 2 últimos DETERIORATING consecutivos)');
eq(P.calcularRachaTrayectoria(['DETERIORATING', 'IMPROVING', 'DETERIORATING', 'DETERIORATING', 'DETERIORATING']), 3,
  'racha solo cuenta la ÚLTIMA racha consecutiva, no el total histórico de DETERIORATING');

// ═══════════════════════════════════════════════════════════════════════
seccion('traducirOpsP — única traducción de vocabulario necesaria');
// ═══════════════════════════════════════════════════════════════════════

eq(P.traducirOpsP('N_A'), 'N/A', "'N_A' (enum real de PIIO) -> 'N/A' (sentinela que classify_3F espera)");
eq(P.traducirOpsP('F'), 'F', 'F pasa sin cambios');
eq(P.traducirOpsP('D'), 'D', 'D pasa sin cambios');
eq(P.traducirOpsP('I'), 'I', 'I pasa sin cambios');

// ═══════════════════════════════════════════════════════════════════════
seccion('mapaOpsPorPeriodo / alinearPorPeriodo — alineación por período REAL, no por índice de array');
// ═══════════════════════════════════════════════════════════════════════

var efoFicticio = [{ period: '2026-01', pos: 'D', traj: 'STABLE', pers: 'POINT' }, { period: '2026-03', pos: 'F', traj: 'N_A', pers: 'N_A' }];
var mapa = P.mapaOpsPorPeriodo(efoFicticio, [0, 0]);
eq(Object.keys(mapa).sort(), ['2026-01', '2026-03'], 'el mapa se indexa por period (string), no por posición 0..N-1');
eq(mapa['2026-01'], { p: 'D', t: 'STABLE', pers: 'POINT', det_run: 0 }, 'entrada real, traducida');

// HALLAZGO DE FRONTERA (encontrado al probar un hueco real de evidencia, no supuesto):
// runPIIO.js NO produce ningún EFO_STATE para un período sin ningún DOMAIN_STATE
// (runPIIO.js:261, "if (domStates.length === 0) return;") — el array efo_states
// queda MÁS CORTO que input.periods. Alinear por posición de array (en vez de
// por period) desalinearía todo lo que sigue al primer hueco.
var alineado = P.alinearPorPeriodo([0, 1, 2], ['2026-01', '2026-02', '2026-03'], mapa);
eq(alineado[0], { p: 'D', t: 'STABLE', pers: 'POINT', det_run: 0 }, 'período 0 (2026-01): entrada real');
eq(alineado[1], { p: 'N/A', t: 'N_A', pers: 'POINT', det_run: 0 },
  'período 1 (2026-02, SIN EFO_STATE en el mapa): default "ausente" — mismo criterio que run_case() usa ' +
  'para OPS no presente (pers:POINT, det_run:0), no un valor inventado');
eq(alineado[2], { p: 'F', t: 'N_A', pers: 'N_A', det_run: 0 }, 'período 2 (2026-03): entrada real');

// ═══════════════════════════════════════════════════════════════════════
seccion('obtenerSerieEFO — motor-piio real (runPIIOCompleto), tras la reapertura');
// ═══════════════════════════════════════════════════════════════════════

var inputSerieReal = {
  organization_id: 'org1', ruleset_version: 'rs-v1', periods: ['2026-01', '2026-02', '2026-03', '2026-04'],
  domain_catalog: [ds()], phenomenon_catalog: [ph()], metric_definitions: [md()],
  references: referenciasBase(), node_hierarchy: [ns()], kpi_specs: [ks()], evidence_groups: [eg()],
  observations: [
    obs({ value: 20, numerator: 20 }),
    obs({ observation_id: 'o1b', period_start: '2026-02', period_end: '2026-02', value: 80, numerator: 80 }),
    obs({ observation_id: 'o1c', period_start: '2026-03', period_end: '2026-03', value: 80, numerator: 80 }),
    obs({ observation_id: 'o1d', period_start: '2026-04', period_end: '2026-04', value: 80, numerator: 80 })
  ]
};
var serieReal = P.obtenerSerieEFO(inputSerieReal, 'n-root');
eq(serieReal.run_status, 'COMPLETED', 'run_status real = COMPLETED');
eq(serieReal.efoStates.map(function (s) { return s.period + ':' + s.pos; }),
  ['2026-01:N_A', '2026-02:D', '2026-03:D', '2026-04:D'],
  'pos real por período (confirmado con node -e): entra a D en 2026-02 y se mantiene');
eq(serieReal.efoStates.map(function (s) { return s.pers; }), ['N_A', 'POINT', 'REPEATED', 'REPEATED'],
  'REAPERTURA CONFIRMADA: pers acumula correctamente a través de la cascada real (ya no siempre N_A)');
eq(serieReal.efoStates.map(function (s) { return s.det_run; }), [0, 1, 2, 3],
  'REAPERTURA CONFIRMADA: det_run acumula 0,1,2,3 — antes de la reapertura esto era imposible (siempre 0/historia de 1 punto)');
// REAPERTURA (Fase 5, DISENO_TRAJ_STABLE_BAND_PERS.md): TRAJ_STABLE_BAND ya
// NO es N_A por default — TRAJ_STABLE_BAND_GENERICO (5% relativo) clasifica
// de verdad. Serie real del KPI: 20 → 80 → 80 → 80. 2026-02: mag=80-20=60,
// base=20 (valor anterior), relativo=300% > 5% → DETERIORATING. 2026-03/04:
// mag=80-80=0, relativo=0% < 5% → STABLE (valor ya no cambia). Confirmado
// inspeccionando r.kpi_states directamente — mismo valor desde el nivel KPI,
// no un artefacto del arnés.
eq(serieReal.efoStates.map(function (s) { return s.traj; }), ['N_A', 'DETERIORATING', 'STABLE', 'STABLE'],
  'REAPERTURA CONFIRMADA: traj real (20→80→80→80) — DETERIORATING en el salto, STABLE una vez el valor se estabiliza');
eq(serieReal.rachaTrayectoria, [0, 1, 0, 0],
  'racha de trayectoria: 1 en el único período DETERIORATING (2026-02), resetea a 0 cuando pasa a STABLE');

// multi-nodo — n-root y n-a, KPIs y observaciones distintas
var inputMultiNodo = {
  organization_id: 'org1', ruleset_version: 'rs-v1', periods: ['2026-01', '2026-02'],
  domain_catalog: [ds()], phenomenon_catalog: [ph()], metric_definitions: [md()],
  references: referenciasBase(),
  node_hierarchy: [ns(), ns({ node_id: 'n-a', parent_node_id: 'n-root', aggregation_membership: 'set-a', scope_rules: { scope: 'SEGMENT_ONLY' } })],
  kpi_specs: [ks(), ks({ kpi_id: 'k2', evidence_group_id: 'eg2' })],
  evidence_groups: [eg(), eg({ evidence_group_id: 'eg2', member_kpi_ids: ['k2'], node_id: 'n-a' })],
  observations: [
    obs({ value: 80, numerator: 80 }),                                                                    // k1@n-root: D
    obs({ observation_id: 'o1b', period_start: '2026-02', period_end: '2026-02', value: 30, numerator: 30 }), // k1@n-root: F
    obs({ observation_id: 'o2', kpi_id: 'k2', node_id: 'n-a', value: 20, numerator: 20 }),                  // k2@n-a: F
    obs({ observation_id: 'o2b', kpi_id: 'k2', node_id: 'n-a', period_start: '2026-02', period_end: '2026-02', value: 25, numerator: 25 }) // k2@n-a: F
  ]
};
eq(P.obtenerSerieEFO(inputMultiNodo, 'n-root').efoStates.map(function (s) { return s.pos; }), ['D', 'F'],
  'n-root: D->F (k1 real: 80 luego 30, umbral 50)');
eq(P.obtenerSerieEFO(inputMultiNodo, 'n-a').efoStates.map(function (s) { return s.pos; }), ['F', 'F'],
  'n-a: F,F (k2 real: 20 y 25, ambos < 50) — el filtro por node_id SÍ distingue los dos nodos, no mezcla sus series');

// ═══════════════════════════════════════════════════════════════════════
seccion('segmentarPorHuecos — reutilización literal (agnóstica de fuente, sin cambios)');
// ═══════════════════════════════════════════════════════════════════════

eq(P.segmentarPorHuecos([10, 20, 30], [1, 2, 3]).length, 1, 'sin huecos -> 1 segmento');
var segConHueco = P.segmentarPorHuecos([10, null, 30], [1, 2, 3]);
eq(segConHueco.length, 2, 'un hueco en cfg -> 2 segmentos');
eq(segConHueco[0].periodosReales, [0], 'segmento A = [0]');
eq(segConHueco[1].periodosReales, [2], 'segmento B = [2]');

// ═══════════════════════════════════════════════════════════════════════
seccion('Hallazgo de frontera — cfg/dyn con null/NaN sigue exigiendo segmentarPorHuecos antes de ejecutarAIE_EFO');
// ═══════════════════════════════════════════════════════════════════════

lanza(function () { P.ejecutarAIE_EFO([null], [50], [{ p: 'F', t: 'STABLE', pers: 'N_A', det_run: 0 }]); },
  'ejecutarAIE_EFO detecta cfg=[null] y lanza un error con contexto (mismo criterio que las otras 2 ramas)');
lanza(function () { P.ejecutarAIE_EFO([50], [NaN], [{ p: 'F', t: 'STABLE', pers: 'N_A', det_run: 0 }]); },
  'lo mismo para dyn=[NaN]');
lanza(function () { P.ejecutarAIE_EFO([50, 50], [10, 10], [{ p: 'F', t: 'STABLE', pers: 'N_A', det_run: 0 }]); },
  'ops de largo distinto a cfg/dyn -> error explícito (desalineación por período real, no fabricar resultado parcial)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Puente a Python — confirma classify_3F/classify_2F reales, NO run_case()');
// ═══════════════════════════════════════════════════════════════════════

var filaDirecta = P.ejecutarAIE_EFO([50], [10], [{ p: 'D', t: 'STABLE', pers: 'REPEATED', det_run: 3 }]);
eq(filaDirecta.length, 1, 'una fila por período');
eq(filaDirecta[0].CFG_pos, 'I', 'CFG=50 -> CFG_pos=I (engine_core.TH_FI=33 < 50 <= TH_ID=66) — calculado por el puente, no asumido');
eq(filaDirecta[0].DYN_pos, 'F', 'DYN=10 -> DYN_pos=F');
eq(filaDirecta[0].OPS_pos, 'D', 'OPS_pos = D, tal cual se pasó (ya categórico, sin pasar por position())');
eq(filaDirecta[0].AIE_3F, 'DET_OPERATIONAL_UNCORROBORATED',
  'CFG=I, DYN=F, OPS=D, ops_pers=REPEATED -> DET_OPERATIONAL_UNCORROBORATED (confirmado con python3 -c antes de escribir este assert, no adivinado)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Caso end-to-end #1 — EFO real entra a D y se mantiene, CFG/DYN sintéticos favorables');
// ═══════════════════════════════════════════════════════════════════════

var e2e1 = P.ejecutarPipeline(inputSerieReal, 'n-root', [10, 10, 10, 10], [10, 10, 10, 10]);
eq(e2e1.efoStates.map(function (s) { return s.pos; }), ['N_A', 'D', 'D', 'D'], 'pos real: N_A luego D,D,D');
eq(e2e1.segmentos.length, 1, 'cfg/dyn sin huecos -> 1 segmento con los 4 períodos');
var filas1 = e2e1.segmentos[0].aie;
eq(filas1[0].OPS_pos, 'N/A', 'período 0: EFO real N_A -> OPS_pos="N/A" (traducido)');
eq(filas1[0].AIE_2F, 'REG_CONVERGENT', 'período 0: AIE_2F=REG_CONVERGENT (CFG/DYN favorables, 2F nunca mira EFO)');
eq(filas1[0].AIE_3F, 'REG_CONVERGENT (cobertura parcial)', 'período 0: EFO N/A -> camino de cobertura parcial');
eq(filas1[1].OPS_pos, 'D', 'período 1: EFO real D');
eq(filas1[1].AIE_3F, 'TR_UNEXPLAINED_DIVERGENCE', 'período 1: CFG/DYN favorables + EFO=D recién entrado (pers=POINT, racha=0) -> no corrobora aún');
eq(filas1[2].AIE_3F, 'DET_OPERATIONAL_UNCORROBORATED', 'período 2: EFO=D con pers=REPEATED (det_run PIIO=2) -> SÍ corrobora (canal categórico del OR)');
eq(filas1[3].AIE_3F, 'DET_OPERATIONAL_UNCORROBORATED', 'período 3: EFO=D con pers=REPEATED sostenido -> igual que período 2');

// ═══════════════════════════════════════════════════════════════════════
seccion('Caso end-to-end #2 — hueco real de evidencia en EFO (2026-02 sin observación), CFG/DYN sintéticos SIN hueco');
// ═══════════════════════════════════════════════════════════════════════

var inputConHueco = {
  organization_id: 'org1', ruleset_version: 'rs-v1', periods: ['2026-01', '2026-02', '2026-03'],
  domain_catalog: [ds()], phenomenon_catalog: [ph()], metric_definitions: [md()],
  references: referenciasBase(), node_hierarchy: [ns()], kpi_specs: [ks()], evidence_groups: [eg()],
  observations: [
    obs({ value: 80, numerator: 80 }),
    // SIN observación en 2026-02 — hueco real, no fabricado
    obs({ observation_id: 'o1c', period_start: '2026-03', period_end: '2026-03', value: 80, numerator: 80 })
  ]
};
var e2e2 = P.ejecutarPipeline(inputConHueco, 'n-root', [10, 10, 10], [10, 10, 10]);
eq(e2e2.efoStates.map(function (s) { return s.period; }), ['2026-01', '2026-03'],
  'efo_states tiene SOLO 2 entradas (runPIIO.js nunca produce EFO_STATE para 2026-02 — sin DOMAIN_STATE, sin evaluación)');
eq(e2e2.segmentos.length, 1, 'cfg/dyn NO tienen huecos (están presentes en los 3 períodos) -> 1 solo segmento — ' +
  'el hueco es SOLO de EFO, no de CFG/DYN, y NO se segmenta CFG/DYN por un hueco que no es suyo');
eq(e2e2.segmentos[0].periodosReales, [0, 1, 2], 'el segmento cubre los 3 períodos reales completos');
var filas2 = e2e2.segmentos[0].aie;
eq(filas2[0].OPS_pos, 'D', 'período 0 (2026-01): EFO real D');
eq(filas2[1].OPS_pos, 'N/A', 'período 1 (2026-02, SIN EFO_STATE): alineado al default "ausente" (N/A), no un valor inventado ' +
  'ni una desalineación con el período siguiente');
eq(filas2[1].AIE_2F, 'REG_CONVERGENT', 'período 1: AIE_2F sigue siendo válido (CFG/DYN presentes, 2F no depende de EFO)');
eq(filas2[1].AIE_3F, 'REG_CONVERGENT (cobertura parcial)', 'período 1: EFO ausente -> camino de cobertura parcial, exactamente como N_A real');
eq(filas2[2].OPS_pos, 'D', 'período 2 (2026-03): EFO real D — el hueco de en medio NO contamina este período');
eq(filas2[2].AIE_3F, 'DET_OPERATIONAL_UNCORROBORATED', 'período 2: pers=REPEATED (det_run PIIO=2, confirmado con node -e) -> corrobora');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
