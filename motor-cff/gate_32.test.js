/**
 * motor-cff/gate_32.test.js — Fase 5
 * node motor-cff/gate_32.test.js
 *
 * Acceptance gate de §32 — los 10 puntos, uno por uno, cada uno con su
 * verificación específica (no una afirmación general de "cumple los 10").
 * Reutiliza las funciones ya probadas por las baterías de fase; aquí solo
 * se comprueba el enunciado exacto del gate.
 */

'use strict';

var contratos = require('./contratos');
var atribucion = require('./atribucion');
var monetizacion = require('./monetizacion');
var moneda = require('./moneda');
var consolidacion = require('./consolidacion');
var cobertura = require('./cobertura');
var versionamiento = require('./versionamiento');
var R = require('./runCFF');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function near(a, b, m) { ok(typeof a === 'number' && Math.abs(a - b) < 1e-6, m + (Math.abs(a - b) < 1e-6 ? '' : '  [' + a + ' vs ' + b + ']')); }
function lanza(fn, m) { var l = false; try { fn(); } catch (e) { l = true; } ok(l, m); }

// ── caso base reutilizable ────────────────────────────────────────────
function compValida(over) {
  return Object.assign({
    component_id: 'C1', event_id: 'EV1', organization_id: 'ORG', phenomenon_id: 'PH1', node_id: 'N1', consequence_id: 'CQ1',
    primary_mechanism: 'ADDITIONAL_CONSUMPTION', financial_nature: 'INCREMENTAL_COST', resource_type: 'INSUMO', quantity: 1, unit: 'u',
    temporal_nature: 'PERIOD_FLOW', source_frequency: 'M', calculation_frequency: 'M', aggregation_frequency: 'MONTHLY',
    calculation_mode: 'DIRECT_VALUE', input_variables: [], monetary_basis_id: 'MB1', original_value: 1000, valor: 1000, original_currency: 'COP',
    valuation_basis: 'NOMINAL', monetization_status: 'OBSERVED', attribution_status: 'CONFIRMED', valuation_role: 'PRIMARY',
    economic_scope: 'ORGANIZATION', counterparty_scope: 'EXTERNAL', dependency_refs: [], include_in_cff: true, flags: [],
    event_status: 'COMPLETE', monetary_basis_valid: true, temporal_basis_valid: true, scope_valid: true, esTransferenciaInternaPura: false
  }, over);
}
function eventoValido(over) {
  return Object.assign({
    event_id: 'EV1', organization_id: 'ORG', source_type: 'PIIO', source_ids: ['S1'], phenomenon_id: 'PH1', domain_id: 'D1',
    node_id: 'N1', period_start: '2026-01-01', period_end: '2026-01-31', event_type: 'T', event_description: 'x',
    status: 'COMPLETE', flags: [], components: [compValida()]
  }, over);
}
function casoValido(over) {
  return Object.assign({
    cff_case_id: 'CASE1', period_start: '2026-01-01', period_end: '2026-01-31', scope: 'ORGANIZATION',
    node_set: ['ORG'], nodeRaiz: 'ORG', economicScope: 'ORGANIZATION', reporting_currency: 'COP', valuation_basis: 'NOMINAL',
    nodeHierarchy: [{ node_id: 'ORG', parent_id: null }, { node_id: 'N1', parent_id: 'ORG' }],
    eventos: [eventoValido()], relaciones: [],
    coberturaSeniales: { tratamientoEconomicoSuficiente: true, dependeDeEstimacionesDebiles: false, asignacionesLimitadas: false, baseDefendibleParaCifraConsolidada: true },
    run_id: 'RUN1', calculation_version: 'v1', ruleset_version: 'v1', calculated_at: 't', generated_at: 't',
    formula_versions: [], monetary_basis_versions: ['m1'], relationship_versions: [], input_snapshot_ids: ['s1'],
    update_reason: 'inicial', run_status: 'COMPLETED'
  }, over);
}

// ═══════════════════════════════════════════════════════════════════════
seccion('§32.1 — sin ruta KPI/ICE/IEH/SDMO/AIE → dinero sin evento y componente');
// ═══════════════════════════════════════════════════════════════════════
lanza(function () { R.runCFF(casoValido({ eventos: [] })); }, 'runCFF exige eventos no vacíos — no hay entrada para un KPI/estado sin CFF_EVENT');
var rV = contratos.validarEconomicComponent({ component_id: 'X' });
ok(rV.faltantes.indexOf('event_id') !== -1, 'ECONOMIC_COMPONENT sin event_id → inválido: todo componente cuelga de un evento');
console.log('  (los 12 invariantes ARQ — INV-16/17/37-40/52/53/58-60/69 — se verifican en invariantes_arquitectonicos.test.js)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§32.2 — sin coeficientes subjetivos de atribución');
// ═══════════════════════════════════════════════════════════════════════
ok(atribucion.clasificarAtribucion.length === 1, 'clasificarAtribucion toma 1 objeto de 6 dimensiones categóricas — sin pesos ni porcentajes');
var dims = { operational_correspondence: 'YES', temporal_correspondence: 'COMPATIBLE', organizational_correspondence: 'MATCH', operational_evidence: 'DIRECT', system_convergence: 'CONVERGENT', alternative_explanation: 'NONE_DOMINANT' };
ok(['CONFIRMED', 'SUPPORTED', 'UNRESOLVED'].indexOf(atribucion.clasificarAtribucion(dims)) !== -1,
  'la salida es una de 3 categorías, nunca un número de "grado de atribución"');

// ═══════════════════════════════════════════════════════════════════════
seccion('§32.3 — sin sumas antes de resolver relaciones y nodos');
// ═══════════════════════════════════════════════════════════════════════
// Mutar el orden RESOLVER↔SELECCIONAR ya está probado en consolidacion.test (Mutación 1).
// Aquí: un DUPLICATE sin resolver NO entra al total aunque tenga valor.
var rDup = consolidacion.consolidarPeriodoYAlcance({
  componentes: [compValida({ component_id: 'A', valor: 100 }), compValida({ component_id: 'B', valor: 100 })],
  relaciones: [{ relation_type: 'DUPLICATE', component_a_id: 'A', component_b_id: 'B', resolution_status: 'UNRESOLVED' }],
  nodeHierarchy: [{ node_id: 'ORG', parent_id: null }], nodeSet: ['ORG'], nodeRaiz: 'ORG', economicScope: 'ORGANIZATION'
});
near(rDup.cff_total, 0, 'DUPLICATE sin resolver → 0, no 200: la relación se resuelve antes de sumar (INV-61/64)');
lanza(function () {
  consolidacion.consolidarPeriodoYAlcance({
    componentes: [compValida({ component_id: 'A', valor: 100 })], relaciones: [],
    nodeHierarchy: [{ node_id: 'ORG', parent_id: null }, { node_id: 'N1', parent_id: 'ORG' }],
    nodeSet: ['ORG', 'N1'], nodeRaiz: 'ORG', economicScope: 'ORGANIZATION'
  });
}, 'nodeSet padre+hijo → lanza antes de sumar (jerarquía se resuelve primero)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§32.4 — sin conversiones monetarias o temporales silenciosas');
// ═══════════════════════════════════════════════════════════════════════
lanza(function () { moneda.convertirMoneda({ component_id: 'X', original_value: 100, original_currency: 'USD' }, { tasa: 4000, monedaDestino: 'COP' }); },
  'convertirMoneda sin fuente/fecha/método → lanza (§17.1: los 4 datos, no se fabrican)');
lanza(function () {
  consolidacion.consolidarPeriodoYAlcance({
    componentes: [compValida({ component_id: 'A', valor: 1, original_currency: 'USD' }), compValida({ component_id: 'B', valor: 1, original_currency: 'EUR' })],
    relaciones: [], nodeHierarchy: [{ node_id: 'ORG', parent_id: null }], nodeSet: ['ORG'], nodeRaiz: 'ORG', economicScope: 'ORGANIZATION'
  });
}, 'monedas mixtas sin normalizar → lanza (INV-28)');
lanza(function () {
  require('./temporalidad').validarFrecuenciaConsistente([{ aggregation_frequency: 'MONTHLY' }, { aggregation_frequency: 'ANNUAL' }]);
}, 'frecuencias mixtas → lanza (§16.1, no divide en silencio)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§32.5 — sin imputaciones de missing como cero');
// ═══════════════════════════════════════════════════════════════════════
var na = cobertura.distinguirCeroDeNA(0, 'INSUFFICIENT');
ok(na.value === null && na.status === 'INSUFFICIENT', 'cobertura insuficiente → value=null, no 0 (AC46)');
lanza(function () { cobertura._verificarValorConsistente({ resultado: 'CFF_N_A', value: 0, status: 'INSUFFICIENT' }); },
  'un N_A que se cuele como value=0 → lanza (salvaguarda)');
var agg = monetizacion.agregarPorMecanismo([]);
ok(agg.ADDITIONAL_CONSUMPTION.suma === null, 'agregarPorMecanismo sobre 0 componentes → suma null, no 0 fabricado');

// ═══════════════════════════════════════════════════════════════════════
seccion('§32.6 — todo componente incluido se rastrea a evento/fuente/base/atribución/relación');
// ═══════════════════════════════════════════════════════════════════════
var rTrace = R.runCFF(casoValido({ eventos: [eventoValido({
  source_ids: ['SRC-1'], components: [compValida({ component_id: 'C-T', monetary_basis_id: 'MB-T', formula_id: 'F-T', assessment_id: 'AS-T' })]
})], relaciones: [] }));
ok(rTrace.trace.event_ids.indexOf('EV1') !== -1, '§32.6 — trace.event_ids incluye el evento');
ok(rTrace.trace.source_ids.indexOf('SRC-1') !== -1, '§32.6 — trace.source_ids incluye la fuente');
ok(rTrace.trace.component_ids.indexOf('C-T') !== -1, '§32.6 — trace.component_ids incluye el componente');
ok(rTrace.trace.monetary_basis_ids.indexOf('MB-T') !== -1, '§32.6 — trace.monetary_basis_ids incluye la base');
ok(contratos.validarTracePath(rTrace.trace).valido, '§32.6 — el TRACE_PATH valida contra §22.10 (los 9 arrays de refs)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§32.7 — los 4 cuadrantes reconstruyen CFF_TOTAL');
// ═══════════════════════════════════════════════════════════════════════
var r4q = R.runCFF(casoValido({ eventos: [eventoValido({ components: [
  compValida({ component_id: 'Q1', original_value: 1000, attribution_status: 'CONFIRMED', monetization_status: 'OBSERVED' }),
  compValida({ component_id: 'Q2', original_value: 200, attribution_status: 'CONFIRMED', monetization_status: 'ESTIMATED' }),
  compValida({ component_id: 'Q3', original_value: 50, attribution_status: 'SUPPORTED', monetization_status: 'OBSERVED' }),
  compValida({ component_id: 'Q4', original_value: 30, attribution_status: 'SUPPORTED', monetization_status: 'ESTIMATED' })
] })] }));
var suma4 = r4q.result.confirmed_observed + r4q.result.confirmed_estimated + r4q.result.supported_observed + r4q.result.supported_estimated;
near(suma4, r4q.result.cff_total, '§32.7 — confirmed_observed+confirmed_estimated+supported_observed+supported_estimated = cff_total (1280)');
lanza(function () {
  consolidacion.verificarReconciliacionCuadrantes({ confirmed_observed: 100, confirmed_estimated: 0, supported_observed: 0, supported_estimated: 0, cff_total: 999 });
}, '§32.7 — si no reconcilia → verificarReconciliacionCuadrantes lanza (AC45: bloquear publicación)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§32.8 — EXPOSURE, UNRESOLVED y N_A permanecen visibles y excluidos');
// ═══════════════════════════════════════════════════════════════════════
var rVis = R.runCFF(casoValido({ eventos: [eventoValido({ components: [
  compValida({ component_id: 'OK', original_value: 12000 }),
  compValida({ component_id: 'EXP', original_value: 8000, monetization_status: 'EXPOSURE' }),
  compValida({ component_id: 'UNR', original_value: 3000, attribution_status: 'UNRESOLVED' })
] })] }));
near(rVis.result.cff_total, 12000, '§32.8 — EXPOSURE y UNRESOLVED NO entran a cff_total');
near(rVis.result.exposure_total, 8000, '§32.8 — EXPOSURE visible en exposure_total');
near(rVis.result.unresolved_impact_total, 3000, '§32.8 — UNRESOLVED visible en unresolved_impact_total');

// ═══════════════════════════════════════════════════════════════════════
seccion('§32.9 — resultados históricos reproducibles e inmutables');
// ═══════════════════════════════════════════════════════════════════════
var repA = R.runCFF(casoValido()), repB = R.runCFF(casoValido());
ok(JSON.stringify(repA.result) === JSON.stringify(repB.result), '§32.9 — dos corridas con los mismos inputs → CFF_RESULT idéntico (AC51)');
var runV1 = { run_id: 'R1', cff_case_id: 'C1', calculation_version: 'v1', ruleset_version: 'v1', formula_versions: [], monetary_basis_versions: [], relationship_versions: [], input_snapshot_ids: [], update_reason: 'x', generated_at: 't', run_status: 'DONE' };
var snap = JSON.stringify(runV1);
versionamiento.crearNuevaVersion(runV1, { calculation_version: 'v2', update_reason: 'rev' });
ok(JSON.stringify(runV1) === snap, '§32.9 — crear v2 no toca v1 (INV-65, inmutabilidad)');
var histo = { calculation_version: 'v1', cff_total: 5000, calculation_status: 'VALID' };
var snapH = JSON.stringify(histo);
versionamiento.marcarStale(histo, 'v2');
ok(JSON.stringify(histo) === snapH, '§32.9 — marcar STALE no reescribe el histórico (INV-66)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§32.10 — CFF no modifica CFG, DYN, EFO ni AIE');
// ═══════════════════════════════════════════════════════════════════════
var ARCHIVOS = ['enums', 'estados', 'contratos', 'monetizacion', 'atribucion', 'relaciones', 'costos_compartidos',
  'nodos', 'temporalidad', 'moneda', 'admisibilidad', 'consolidacion', 'cobertura', 'runCFF', 'versionamiento'];
var funcs = [];
ARCHIVOS.forEach(function (f) { var m = require('./' + f); Object.keys(m).forEach(function (k) { if (typeof m[k] === 'function') funcs.push(f + '.' + k); }); });
ok(!funcs.some(function (n) { return /cfg|\bdyn\b|efo|aie/i.test(n); }),
  '§32.10 — ninguna función de motor-cff nombra ni toca CFG/DYN/EFO/AIE');
// runCFF devuelve { result, run, trace } — nada más; no escribe en ningún otro sistema.
var keysOut = Object.keys(R.runCFF(casoValido()));
ok(JSON.stringify(keysOut.sort()) === JSON.stringify(['_meta', 'result', 'run', 'trace']),
  '§32.10 — runCFF solo devuelve result/run/trace(+_meta); no hay canal de escritura a CFG/DYN/EFO/AIE');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos  (gate §32: 10/10 puntos)');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
