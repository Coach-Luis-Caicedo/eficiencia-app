/**
 * motor-cff/temporalidad.test.js — Fase 4a
 * node motor-cff/temporalidad.test.js
 */

'use strict';

var T = require('./temporalidad');

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
function near(a, b, tol, msg) {
  var cond = typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < tol;
  ok(cond, msg + (cond ? '' : '  [recibido=' + a + ' esperado=' + b + ']'));
}
function lanza(fn, msg) {
  var lanzo = false;
  try { fn(); } catch (e) { lanzo = true; }
  ok(lanzo, msg);
}
var EPS = 1e-9;

// ═══════════════════════════════════════════════════════════════════════
seccion('§16 — filtrarSumablesPorNaturalezaTemporal');
// ═══════════════════════════════════════════════════════════════════════

var mixto = [
  { component_id: 'F1', temporal_nature: 'PERIOD_FLOW', original_value: 100 },
  { component_id: 'S1', temporal_nature: 'STOCK', original_value: 500 }, // sin transformar
  { component_id: 'R1', temporal_nature: 'RATE', original_value: 0.05, transformacionValidada: true, valorFlujoEquivalente: 120 }
];
var rMixto = T.filtrarSumablesPorNaturalezaTemporal(mixto);
eq(rMixto.sumables.map(function (s) { return s.component_id; }), ['F1', 'R1'], 'F1 (PERIOD_FLOW) directo + R1 (RATE ya transformado) → sumables');
eq(rMixto.excluidos.map(function (e) { return e.component_id; }), ['S1'], 'S1 (STOCK sin transformación validada) → excluido, no se inventa la conversión');
near(rMixto.sumables[1].valor, 120, EPS, 'R1 usa valorFlujoEquivalente (120), no original_value (0.05)');

lanza(function () { T.filtrarSumablesPorNaturalezaTemporal([{ component_id: 'X', temporal_nature: 'ALGO_RARO', original_value: 1 }]); },
  'temporal_nature desconocida → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('§16.1 — validarFrecuenciaConsistente (no divide/multiplica en silencio)');
// ═══════════════════════════════════════════════════════════════════════

var mismaFrecuencia = [{ aggregation_frequency: 'MENSUAL' }, { aggregation_frequency: 'MENSUAL' }];
ok(T.validarFrecuenciaConsistente(mismaFrecuencia).valido, 'misma aggregation_frequency → válido');
lanza(function () { T.validarFrecuenciaConsistente([{ aggregation_frequency: 'MENSUAL' }, { aggregation_frequency: 'ANUAL' }]); },
  'aggregation_frequency mixtas (MENSUAL + ANUAL) → lanza, no convierte silenciosamente');

// ═══════════════════════════════════════════════════════════════════════
seccion('§16.2 — mismo event_id a través de 3+ períodos (caso real)');
// ═══════════════════════════════════════════════════════════════════════

// Un evento de retrabajo que permanece OPEN durante 3 meses: un componente
// de horas extra por mes, MISMO event_id, sin crear un evento nuevo cada vez.
var componentesEvento = [
  { component_id: 'COMP-ENE', event_id: 'EVT-1', period_start: '2026-01-01', period_end: '2026-01-31', original_value: 4000 },
  { component_id: 'COMP-FEB', event_id: 'EVT-1', period_start: '2026-02-01', period_end: '2026-02-28', original_value: 3500 },
  { component_id: 'COMP-MAR', event_id: 'EVT-1', period_start: '2026-03-01', period_end: '2026-03-31', original_value: 2000 }
];
var rEvento = T.agruparComponentesPorPeriodo('EVT-1', componentesEvento);
eq(rEvento.porPeriodo.length, 3, '3 períodos distintos bajo el mismo event_id → 3 grupos, no se colapsan');
near(rEvento.porPeriodo[0].subtotal, 4000, EPS, 'subtotal de enero = 4000');
near(rEvento.porPeriodo[1].subtotal, 3500, EPS, 'subtotal de febrero = 3500');
near(rEvento.porPeriodo[2].subtotal, 2000, EPS, 'subtotal de marzo = 2000');
near(rEvento.totalEvento, 9500, EPS, 'total del evento completo = 4000+3500+2000 = 9500 (suma correcta a través de los 3 períodos)');

// Dos componentes en el MISMO período (ej. dos consecuencias distintas del
// mismo evento en enero) deben agruparse juntos, no crear un 4º grupo.
var conDosEnUnPeriodo = componentesEvento.concat([
  { component_id: 'COMP-ENE-2', event_id: 'EVT-1', period_start: '2026-01-01', period_end: '2026-01-31', original_value: 300 }
]);
var rConDos = T.agruparComponentesPorPeriodo('EVT-1', conDosEnUnPeriodo);
eq(rConDos.porPeriodo.length, 3, 'sigue habiendo 3 períodos (el 2º componente de enero se agrupa con el 1º, no crea un 4º grupo)');
near(rConDos.porPeriodo[0].subtotal, 4300, EPS, 'enero ahora suma 4000+300=4300 (dos componentes del mismo período)');
eq(rConDos.porPeriodo[0].componentes, ['COMP-ENE', 'COMP-ENE-2'], 'el grupo de enero lista ambos component_id');

// Lo que esta regla previene: mezclar componentes de DOS event_id distintos
// (el error de crear un "evento nuevo" para lo que es una continuación).
lanza(function () {
  T.agruparComponentesPorPeriodo('EVT-1', componentesEvento.concat([
    { component_id: 'COMP-ABR-OTRO-EVENTO', event_id: 'EVT-2-CREADO-POR-ERROR', period_start: '2026-04-01', period_end: '2026-04-30', original_value: 100 }
  ]));
}, 'un component_id con event_id distinto (EVT-2, creado por error en vez de continuar EVT-1) → lanza, §16.2 exige conservar la identidad del evento');

lanza(function () { T.agruparComponentesPorPeriodo('EVT-1', []); }, 'array vacío → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('§16.3 — anualizar (compuerta de 4 condiciones, post-consolidación)');
// ═══════════════════════════════════════════════════════════════════════

var opciones = { periodoRepresentativo: true, recurrenciaSuficiente: true, estacionalidadControlada: true, esExtraordinario: false, metodo: 'escalamiento lineal ×4 (trimestre→año)', supuestos: 'sin estacionalidad relevante', periodoBase: '2026-Q1' };
var rAnualOk = T.anualizar(9500, 38000, opciones);
ok(rAnualOk.aceptada, 'las 4 condiciones satisfechas → aceptada');
near(rAnualOk.annualization.valorAnualizado, 38000, EPS, 'valorAnualizado es el propuesto (la función no recalcula, solo valida la compuerta)');
eq(rAnualOk.annualization.metodo, 'escalamiento lineal ×4 (trimestre→año)', 'método queda registrado');

var rAnualRechazoExtraordinario = T.anualizar(9500, 38000, Object.assign({}, opciones, { esExtraordinario: true }));
ok(!rAnualRechazoExtraordinario.aceptada, 'fenómeno extraordinario → rechazada, no se anualiza');
eq(rAnualRechazoExtraordinario.annualization, null, 'sin registro de annualization cuando se rechaza');

var rAnualRechazoRecurrencia = T.anualizar(9500, 38000, Object.assign({}, opciones, { recurrenciaSuficiente: false }));
ok(!rAnualRechazoRecurrencia.aceptada, 'sin recurrencia suficiente → rechazada');

lanza(function () { T.anualizar(9500, 38000, Object.assign({}, opciones, { metodo: undefined })); },
  'sin método declarado → lanza (§16.3 exige registrar método/supuestos/período base)');
lanza(function () { T.anualizar(9500, 38000, { periodoRepresentativo: true }); },
  'faltan condiciones booleanas de la compuerta → lanza');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
