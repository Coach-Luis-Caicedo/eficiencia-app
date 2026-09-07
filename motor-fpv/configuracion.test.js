/**
 * motor-fpv/configuracion.test.js — Fase 4
 * node motor-fpv/configuracion.test.js
 *
 * Configuración F–P–V con muestra emparejada §7.3 / §11.2.
 * Sin oráculo numérico externo (§10 no cubre configuración) — los valores
 * esperados se derivan a mano de LF* = (1/Ncfg)·Σ s(r).
 */

'use strict';

var CF = require('./configuracion');
var Persona = require('./persona');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }
function near(a, b, m) { var c = typeof a === 'number' && Math.abs(a - b) < 1e-9; ok(c, m + (c ? '' : '  [recibido=' + a + ' esperado=' + b + ']')); }
function esNull(a, m) { ok(a === null, m + (a === null ? '' : '  [recibido=' + String(a) + ']')); } // String(): NaN se ve "NaN", no "null"
function lanza(fn, m) { var l = false; try { fn(); } catch (e) { l = true; } ok(l, m); }

function P(id, f, p, v) { return Persona.perfilPersona({ persona_id: id, posicion: 'CONSUMIDOR', F: f, P: p, V: v }); }

// ═══════════════════════════════════════════════════════════════════════
seccion('§7.3 — Ncfg, LF*/LP*/LV*, G sobre la muestra emparejada');
// ═══════════════════════════════════════════════════════════════════════

// 3 personas idénticas F=5 P=3 V=1 → s: 100 / 50 / 0
var tres = [P('a', 5, 3, 1), P('b', 5, 3, 1), P('c', 5, 3, 1)];
var r3 = CF.configuracionFPV(tres);
eq(r3.Ncfg, 3, 'Ncfg = 3 (los tres completos)');
eq(r3.calculable, true, 'calculable = true');
near(r3.Lstar.F, 100, 'LF* = s(5) = 100');
near(r3.Lstar.P, 50, 'LP* = s(3) = 50');
near(r3.Lstar.V, 0, 'LV* = s(1) = 0');
near(r3.G, 100, 'G = 100 − 0 = 100');
eq(r3.limitante, ['V'], 'limitante = [V] (menor L*)');
eq(r3.fortalecida, ['F'], 'fortalecida = [F] (mayor L*)');

// promedio por persona real: F [5,4,3]→s[100,75,50] media 75 ; P [2,2,2]→25 ; V [4,4,4]→75
var mix = [P('a', 5, 2, 4), P('b', 4, 2, 4), P('c', 3, 2, 4)];
var rm = CF.configuracionFPV(mix);
near(rm.Lstar.F, 75, 'LF* = (100+75+50)/3 = 75');
near(rm.Lstar.P, 25, 'LP* = 25');
near(rm.Lstar.V, 75, 'LV* = 75');
near(rm.G, 50, 'G = 75 − 25 = 50');
eq(rm.limitante, ['P'], 'limitante = [P]');
eq(rm.fortalecida, ['F', 'V'], 'fortalecida = [F, V] — EMPATE en el máximo (decisión D)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§7.3 — solo emparejados; los incompletos NO entran a Ncfg');
// ═══════════════════════════════════════════════════════════════════════

var conHuecos = [
  P('a', 5, 5, 5),          // completo
  P('b', 5, 5, 'NE'),       // V no calculable → fuera
  P('c', 'NR', 3, 3),       // F no calculable → fuera
  P('d', 1, 1, 1)           // completo
];
var rh = CF.configuracionFPV(conHuecos);
eq(rh.Ncfg, 2, 'Ncfg = 2 — b (V=NE) y c (F=NR) excluidos');
near(rh.Lstar.F, 50, 'LF* = (s(5)+s(1))/2 = (100+0)/2 = 50 — solo a y d');
near(rh.Lstar.P, 50, 'LP* = (100+0)/2 = 50');
near(rh.Lstar.V, 50, 'LV* = (100+0)/2 = 50');
near(rh.G, 0, 'G = 0 (las tres a 50)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Ambigüedad A — Ncfg = 0');
// ═══════════════════════════════════════════════════════════════════════

var ninguno = CF.configuracionFPV([P('a', 5, 5, 'NE'), P('b', 'NR', 'NR', 'NR')]);
eq(ninguno.Ncfg, 0, 'Ncfg = 0');
eq(ninguno.calculable, false, 'calculable = false');
esNull(ninguno.Lstar, 'Lstar = null (§14: "si Ncfg > 0")');
esNull(ninguno.G, 'G = null');
esNull(ninguno.limitante, 'limitante = null');
esNull(ninguno.fortalecida, 'fortalecida = null');
eq(CF.configuracionFPV([]).Ncfg, 0, 'lista vacía → Ncfg = 0');

// ═══════════════════════════════════════════════════════════════════════
seccion('Ambigüedad B — Ncfg = 1 se calcula, sin piso artificial');
// ═══════════════════════════════════════════════════════════════════════

var uno = CF.configuracionFPV([P('a', 5, 4, 2)]);
eq(uno.Ncfg, 1, 'Ncfg = 1');
eq(uno.calculable, true, 'calculable = true — el documento no fija mínimo (§8)');
near(uno.Lstar.F, 100, 'LF* = s(5) = 100 (esa persona)');
near(uno.Lstar.P, 75, 'LP* = s(4) = 75');
near(uno.Lstar.V, 25, 'LV* = s(2) = 25');
near(uno.G, 75, 'G = 100 − 25 = 75');
eq(uno.limitante, ['V'], 'limitante = [V]');

// ═══════════════════════════════════════════════════════════════════════
seccion('Ambigüedad D — empates: arrays, no "el primero en orden"');
// ═══════════════════════════════════════════════════════════════════════

// empate en el mínimo: F=5 P=5 V=1 → LF*=LP*=100, LV*=0
var empMin = [P('a', 5, 5, 1), P('b', 5, 5, 1)];
var rMin = CF.configuracionFPV(empMin);
eq(rMin.limitante, ['V'], 'limitante = [V]');
eq(rMin.fortalecida, ['F', 'P'], 'fortalecida = [F, P] — empate en el máximo, ambos van');

// CASO G = 0 — las tres iguales (adición pedida en D)
var g0 = CF.configuracionFPV([P('a', 3, 3, 3), P('b', 4, 4, 4), P('c', 2, 2, 2)]);
near(g0.Lstar.F, 50, 'LF* = (50+75+25)/3 = 50');
near(g0.Lstar.P, 50, 'LP* = 50');
near(g0.Lstar.V, 50, 'LV* = 50');
near(g0.G, 0, 'G = 0 — sin desbalance interno');
eq(g0.limitante, ['F', 'P', 'V'], 'G=0 → limitante = [F,P,V] — NO se suprime a null (G=0 ya es la señal)');
eq(g0.fortalecida, ['F', 'P', 'V'], 'G=0 → fortalecida = [F,P,V] — resultado mecánico y honesto');

// ═══════════════════════════════════════════════════════════════════════
seccion('§7.3 / §11 — sin promedio F+P+V, sin índice global');
// ═══════════════════════════════════════════════════════════════════════

var claves = Object.keys(r3).sort();
eq(claves, ['G', 'Lstar', 'Ncfg', 'calculable', 'fortalecida', 'limitante'].sort(),
  'la salida NO tiene ningún campo de promedio/índice F+P+V (§7.3, §14, §11)');
var clavesProhibidas = ['fpv', 'promedio', 'media_fpv', 'indice', 'global', 'compuesto', 'L_global', 'FPV'];
ok(clavesProhibidas.every(function (c) { return !(c in r3); }), 'ninguna clave compensatoria presente');

// ═══════════════════════════════════════════════════════════════════════
seccion('Decisión E — no se recalcula distribución/H sobre el emparejado');
// ═══════════════════════════════════════════════════════════════════════

ok(!('p' in r3) && !('H' in r3) && !('C' in r3) && !('distribucion' in r3) && !('Hstar' in r3),
  'la salida configuracional NO trae p/H/C — §7.3/§14: "se recalculan LF*, LP*, LV*" SOLO niveles');

// ═══════════════════════════════════════════════════════════════════════
seccion('Decisión F / C — sin ponderación, sin campo estatus');
// ═══════════════════════════════════════════════════════════════════════

ok(!('estatus' in r3) && !('CENSAL' in r3) && !('inferencial_aplica' in r3),
  'sin campo `estatus` — §11.2 no lo lista para la salida configuracional (decisión C)');
ok(!('Lstar_w' in r3) && !('pesos' in r3) && !('ponderado' in r3),
  'sin ponderación en Fase 4 — §9 es "no ponderado por defecto" (decisión F, Fase 5 layerea)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Validación de entrada');
// ═══════════════════════════════════════════════════════════════════════

lanza(function () { CF.configuracionFPV('no-array'); }, 'perfiles no-array → lanza');
lanza(function () { CF.configuracionFPV(null); }, 'null → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. matched: `p.completo === true` → `p != null` (incluir incompletos).');
console.log('     → 11 rojos (Ncfg, LF*/LP*/LV*, G del caso con huecos + los 6 del Ncfg=0,');
console.log('        que ahora incluye 2 perfiles con sensores no válidos → NaN).');
console.log('  2. G: `max - min` → `max` (olvidar restar el mínimo).');
console.log('     → 4 rojos (los 4 asserts de G con min ≠ 0, incl. los dos G = 0).');
console.log('  3. limitante/fortalecida: `=== min` ↔ `=== max` (intercambiados).');
console.log('     → 7 rojos (todos los asserts de limitante/fortalecida con G ≠ 0).');
console.log('  4. `SENSORES.filter(...)` → `SENSORES.find(...)` (string, no array).');
console.log('     → 9 rojos (todo limitante/fortalecida, incl. empates y el caso G = 0).');
console.log('  5. quitar la guarda `Ncfg === 0` → Lstar = 0/0 = NaN (no null), arrays [].');
console.log('     → 5 rojos (calculable, Lstar, G, limitante, fortalecida del Ncfg=0;');
console.log('        `Ncfg = 0` en sí sigue verde — matched.length ya es 0).');
console.log('  6. suma con `p.F.r` (crudo 1–5) en vez de `p.F.s` (normalizado 0–100).');
console.log('     → 18 rojos (todos los LF*/LP*/LV*/G numéricos).');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
