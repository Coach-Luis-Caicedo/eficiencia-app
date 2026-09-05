/**
 * motor-cff/relaciones.test.js — Fase 3
 * node motor-cff/relaciones.test.js
 */

'use strict';

var R = require('./relaciones');

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
seccion('AC15 — ciclo A CONTAINS B / B CONTAINS A → grafo inválido');
// ═══════════════════════════════════════════════════════════════════════

var relSinCiclo = [
  { relation_type: 'CONTAINS', component_a_id: 'A', component_b_id: 'B' },
  { relation_type: 'CONTAINS', component_a_id: 'B', component_b_id: 'C' }
];
var rSinCiclo = R.validarGrafoContains(relSinCiclo);
ok(rSinCiclo.valido, 'cadena A→B→C sin ciclo → grafo válido');
eq(rSinCiclo.ciclos, [], 'sin ciclos reportados');

var relConCiclo2 = [
  { relation_type: 'CONTAINS', component_a_id: 'A', component_b_id: 'B' },
  { relation_type: 'CONTAINS', component_b_id: 'A', component_a_id: 'B' } // B CONTAINS A
];
var rConCiclo2 = R.validarGrafoContains(relConCiclo2);
ok(!rConCiclo2.valido, 'A CONTAINS B + B CONTAINS A (AC15 literal) → grafo INVÁLIDO');
ok(rConCiclo2.ciclos.length > 0, 'se reporta al menos un ciclo');
eq(rConCiclo2.ciclos[0].slice().sort(), ['A', 'A', 'B'].sort(), 'el ciclo reportado involucra exactamente A y B (con el cierre repetido)');

// Ciclo más largo (3 nodos) — confirma que la detección es general, no solo
// el caso de 2 nodos que el documento usa como ejemplo ("como A CONTAINS B...").
var relCicloLargo = [
  { relation_type: 'CONTAINS', component_a_id: 'X', component_b_id: 'Y' },
  { relation_type: 'CONTAINS', component_a_id: 'Y', component_b_id: 'Z' },
  { relation_type: 'CONTAINS', component_a_id: 'Z', component_b_id: 'X' }
];
var rCicloLargo = R.validarGrafoContains(relCicloLargo);
ok(!rCicloLargo.valido, 'ciclo de 3 nodos (X→Y→Z→X) → también inválido (detección general, no solo el ejemplo de 2 nodos del documento)');

// ── Mutación real de la detección de ciclos (ejecutada aparte, ver cierre) ──
seccion('Mutación — detección de ciclos');
console.log('  (ejecutada como paso de Bash aparte antes del commit — ver mensaje de cierre)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§13 — resolverRelacion, reglas de suma por tipo');
// ═══════════════════════════════════════════════════════════════════════

var VALORES = { A: 100, B: 40 };

// INDEPENDENT
var rInd = R.resolverRelacion({ relation_type: 'INDEPENDENT', component_a_id: 'A', component_b_id: 'B' }, VALORES);
near(rInd.totalParcial, 140, EPS, 'INDEPENDENT: se suman ambos (100+40=140)');
eq(rInd.excluidos, [], 'INDEPENDENT: nada se excluye');

// DUPLICATE resuelto
var rDupResuelto = R.resolverRelacion({
  relation_type: 'DUPLICATE', component_a_id: 'A', component_b_id: 'B',
  resolution_status: 'RESOLVED', selected_primary: 'A'
}, VALORES);
near(rDupResuelto.totalParcial, 100, EPS, 'DUPLICATE resuelto (selected_primary=A): total = solo A (100), no se suma B');
eq(rDupResuelto.sumables, [{ component_id: 'A', valor: 100 }], 'solo A queda como sumable');

// DUPLICATE sin resolver
var rDupSinResolver = R.resolverRelacion({ relation_type: 'DUPLICATE', component_a_id: 'A', component_b_id: 'B', resolution_status: 'UNRESOLVED' }, VALORES);
eq(rDupSinResolver.totalParcial, null, 'DUPLICATE sin resolver: totalParcial=null, no se adivina cuál mantener');
eq(rDupSinResolver.sumables, [], 'DUPLICATE sin resolver: ningún componente sumable');

// CONTAINS FULL
var rContainsFull = R.resolverRelacion({ relation_type: 'CONTAINS', containment_scope: 'FULL', component_a_id: 'A', component_b_id: 'B' }, VALORES);
near(rContainsFull.totalParcial, 100, EPS, 'CONTAINS FULL: total = solo el contenedor A (100), el contenido B queda excluido');

// CONTAINS PARTIAL_QUANTIFIED — inclusión-exclusión
var rContainsPQ = R.resolverRelacion({
  relation_type: 'CONTAINS', containment_scope: 'PARTIAL_QUANTIFIED', quantified_overlap_value: 15,
  component_a_id: 'A', component_b_id: 'B'
}, VALORES);
near(rContainsPQ.totalParcial, 125, EPS, 'CONTAINS PARTIAL_QUANTIFIED: total = 100 + 40 − 15 (solapamiento) = 125');

// CONTAINS PARTIAL_UNQUANTIFIED
var rContainsPU = R.resolverRelacion({ relation_type: 'CONTAINS', containment_scope: 'PARTIAL_UNQUANTIFIED', component_a_id: 'A', component_b_id: 'B' }, VALORES);
eq(rContainsPU.totalParcial, null, 'CONTAINS PARTIAL_UNQUANTIFIED (AC10): no se produce total pleno');

// ALTERNATIVE_VALUATION resuelto y sin resolver
var rAVResuelto = R.resolverRelacion({
  relation_type: 'ALTERNATIVE_VALUATION', component_a_id: 'A', component_b_id: 'B',
  resolution_status: 'RESOLVED', selected_primary: 'B'
}, VALORES);
near(rAVResuelto.totalParcial, 40, EPS, 'ALTERNATIVE_VALUATION resuelta (selected_primary=B): total = solo B (40)');
var rAVSinResolver = R.resolverRelacion({ relation_type: 'ALTERNATIVE_VALUATION', component_a_id: 'A', component_b_id: 'B', resolution_status: 'UNRESOLVED' }, VALORES);
eq(rAVSinResolver.totalParcial, null, 'ALTERNATIVE_VALUATION sin resolver: no se promedia, totalParcial=null');

// DEPENDENT_COST resuelto y sin resolver
var rDCResuelto = R.resolverRelacion({ relation_type: 'DEPENDENT_COST', component_a_id: 'A', component_b_id: 'B', resolution_status: 'RESOLVED' }, VALORES);
near(rDCResuelto.totalParcial, 140, EPS, 'DEPENDENT_COST resuelto (frontera demostrada): se suman ambos (140)');
var rDCSinResolver = R.resolverRelacion({ relation_type: 'DEPENDENT_COST', component_a_id: 'A', component_b_id: 'B', resolution_status: 'UNRESOLVED' }, VALORES);
eq(rDCSinResolver.totalParcial, null, 'DEPENDENT_COST sin resolver (§13.2): frontera no demostrada, no se suma');

// UNKNOWN
var rUnk = R.resolverRelacion({ relation_type: 'UNKNOWN', component_a_id: 'A', component_b_id: 'B' }, VALORES);
eq(rUnk.totalParcial, null, 'UNKNOWN: tratado como riesgo material por defecto, excluido del total pleno');
eq(rUnk.sumables, [], 'UNKNOWN: ningún componente sumable por defecto');

lanza(function () { R.resolverRelacion({ relation_type: 'CONTAINS', component_a_id: 'A', component_b_id: 'B' }, VALORES); },
  'CONTAINS sin containment_scope → lanza (no debería llegar así si contratos.js ya lo validó, pero esta función no confía ciegamente)');
lanza(function () { R.resolverRelacion({ relation_type: 'INDEPENDENT', component_a_id: 'A', component_b_id: 'NO_EXISTE' }, VALORES); },
  'referencia a un componente sin valor resuelto → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('INV-CFF-62 — relaciones pueden cruzar fenómenos y tener vigencia temporal');
// ═══════════════════════════════════════════════════════════════════════

// Una relación entre componentes de phenomenon_id distintos, con valid_from/valid_to,
// se resuelve igual — resolverRelacion NO restringe por fenómeno ni por período.
var relCruzada = {
  relation_type: 'INDEPENDENT', component_a_id: 'A', component_b_id: 'B',
  phenomenon_a: 'PH-ROTACION', phenomenon_b: 'PH-AUSENTISMO',
  valid_from: '2026-01-01', valid_to: '2026-06-30', resolution_status: 'RESOLVED'
};
var rCruzada = R.resolverRelacion(relCruzada, VALORES);
eq(rCruzada.sumables.length, 2, 'INV-62 — la relación cruza phenomenon_id (ROTACION ↔ AUSENTISMO) y aun así se resuelve (INDEPENDENT → ambos suman)');
ok(rCruzada.excluidos.length === 0, 'INV-62 — la vigencia temporal (valid_from/valid_to) no impide la resolución — el motor aplica la consecuencia, no juzga la vigencia');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
