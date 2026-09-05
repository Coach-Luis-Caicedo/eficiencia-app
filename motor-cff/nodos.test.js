/**
 * motor-cff/nodos.test.js — Fase 3
 * node motor-cff/nodos.test.js
 */

'use strict';

var N = require('./nodos');

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
  var lanzo = false;
  try { fn(); } catch (e) { lanzo = true; }
  ok(lanzo, msg);
}

// Jerarquía de prueba:
//        ORG
//       /    \
//    NORTE   SUR
//    /  \      \
//  N1    N2    S1
var JERARQUIA = [
  { node_id: 'ORG', parent_id: null },
  { node_id: 'NORTE', parent_id: 'ORG' },
  { node_id: 'SUR', parent_id: 'ORG' },
  { node_id: 'N1', parent_id: 'NORTE' },
  { node_id: 'N2', parent_id: 'NORTE' },
  { node_id: 'S1', parent_id: 'SUR' }
];

// ═══════════════════════════════════════════════════════════════════════
seccion('Utilidades básicas de jerarquía');
// ═══════════════════════════════════════════════════════════════════════

eq(N.hijosDirectos('ORG', JERARQUIA), ['NORTE', 'SUR'], 'hijos directos de ORG');
ok(!N.esHoja('NORTE', JERARQUIA), 'NORTE no es hoja (tiene N1, N2)');
ok(N.esHoja('N1', JERARQUIA), 'N1 es hoja');
eq(N.descendientes('ORG', JERARQUIA).sort(), ['N1', 'N2', 'NORTE', 'S1', 'SUR'], 'descendientes de ORG (todos)');
eq(N.hojasBajo('ORG', JERARQUIA).sort(), ['N1', 'N2', 'S1'], 'hojas bajo ORG');
eq(N.hojasBajo('NORTE', JERARQUIA).sort(), ['N1', 'N2'], 'hojas bajo NORTE');
eq(N.ancestros('N1', JERARQUIA), ['NORTE', 'ORG'], 'ancestros de N1, de padre inmediato a raíz');
eq(N.ancestros('ORG', JERARQUIA), [], 'la raíz no tiene ancestros');

lanza(function () { N.ancestros('NO_EXISTE', JERARQUIA); }, 'ancestros de un node_id inexistente → lanza');
lanza(function () {
  N.validarConjuntoNodos(['X'], [{ node_id: 'X', parent_id: 'FANTASMA' }]);
}, 'NODE_HIERARCHY con parent_id que no existe → lanza al validar');
lanza(function () {
  N.validarConjuntoNodos(['X'], [{ node_id: 'X', parent_id: null }, { node_id: 'X', parent_id: null }]);
}, 'node_id duplicado en NODE_HIERARCHY → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('NO_PARENT_CHILD_DOUBLE_COUNT — caso positivo y mutación');
// ═══════════════════════════════════════════════════════════════════════

var conjuntoValido = ['N1', 'N2', 'S1']; // todas hojas, mutuamente excluyentes
var rValido = N.validarConjuntoNodos(conjuntoValido, JERARQUIA);
ok(rValido.valido, 'conjunto de solo hojas (N1,N2,S1) → válido, sin violaciones');
eq(rValido.violaciones, [], 'sin violaciones reportadas');

var conjuntoInvalido = ['NORTE', 'N1', 'S1']; // NORTE es padre de N1 — doble conteo
var rInvalido = N.validarConjuntoNodos(conjuntoInvalido, JERARQUIA);
ok(!rInvalido.valido, 'conjunto con NORTE + N1 (padre e hijo) → inválido');
eq(rInvalido.violaciones, [{ padre: 'NORTE', hijo: 'N1' }], 'la violación identifica exactamente el par padre/hijo');

// ── Mutación: romper la detección de NO_PARENT_CHILD_DOUBLE_COUNT y
//    confirmar que el caso específico empieza a pasar (incorrectamente) ──
seccion('Mutación — NO_PARENT_CHILD_DOUBLE_COUNT');
console.log('  (ejecutada como paso de Bash aparte antes del commit — ver README/mensaje de cierre)');

// ═══════════════════════════════════════════════════════════════════════
seccion('clasificarAlcance — AGGREGATE_ONLY / LEAF_ONLY / SEGMENT_ONLY');
// ═══════════════════════════════════════════════════════════════════════

eq(N.clasificarAlcance(['ORG'], 'ORG', JERARQUIA).alcance, 'AGGREGATE_ONLY', '["ORG"] relativo a ORG → AGGREGATE_ONLY');
eq(N.clasificarAlcance(['N1', 'N2', 'S1'], 'ORG', JERARQUIA).alcance, 'LEAF_ONLY', '[N1,N2,S1] (todas las hojas) → LEAF_ONLY');
var rSegmento = N.clasificarAlcance(['N1', 'N2'], 'ORG', JERARQUIA); // falta S1 → segmento
eq(rSegmento.alcance, 'SEGMENT', '[N1,N2] (falta S1) → SEGMENT, no se escala a ORG sin más');
eq(rSegmento.hojasEsperadas, ['N1', 'N2', 'S1'], 'SEGMENT reporta qué hojas se esperaban para el perímetro completo');

var rSegmentoNorte = N.clasificarAlcance(['NORTE'], 'ORG', JERARQUIA); // NORTE es agregado, pero no ES la raíz ORG
eq(rSegmentoNorte.alcance, 'SEGMENT', '["NORTE"] relativo a ORG → SEGMENT (NORTE es agregado de su propio subárbol, no de ORG)');
eq(N.clasificarAlcance(['NORTE'], 'NORTE', JERARQUIA).alcance, 'AGGREGATE_ONLY', 'pero ["NORTE"] relativo a NORTE (su propia raíz) → AGGREGATE_ONLY');

var rDobleConteo = N.clasificarAlcance(['NORTE', 'N1', 'S1'], 'ORG', JERARQUIA);
eq(rDobleConteo.alcance, 'INVALIDO', 'un nodeSet con doble conteo → INVALIDO, no se clasifica como ninguna de las 3 categorías válidas');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
