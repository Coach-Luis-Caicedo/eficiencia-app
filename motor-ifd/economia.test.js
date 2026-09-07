/**
 * motor-ifd/economia.test.js — Fase 5
 * node motor-ifd/economia.test.js
 */

'use strict';

var EC = require('./economia');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }
function near(a, b, m) { ok(typeof a === 'number' && Math.abs(a - b) < 1e-9, m + (Math.abs(a - b) < 1e-9 ? '' : '  [recibido=' + a + ' esperado=' + b + ']')); }
function lanza(fn, m) { var l = false; try { fn(); } catch (e) { l = true; } ok(l, m); }

// EPD económico completo (§12: 5400 horas × 25 u.m./hora)
function econ(over) {
  return Object.assign({
    unit: 'horas', unit_value: 25, economic_traceability: true,
    attribution_category: 'CONFIRMED'
  }, over || {});
}
var PROY = { base: 5400, lower: 5022, upper: 5778 }; // envelope §22 (±7%, FEP 3)

// ═══════════════════════════════════════════════════════════════════════
seccion('§23.1 — evaluarPuertaEconomica: AE = unit ∧ unit_value ∧ traz.');
// ═══════════════════════════════════════════════════════════════════════

ok(EC.evaluarPuertaEconomica(econ()).abierta, 'las 3 condiciones → puerta abierta');

var sinUnit = EC.evaluarPuertaEconomica(econ({ unit: null }));
ok(!sinUnit.abierta && sinUnit.faltantes.indexOf('unit') !== -1, 'sin unit → cerrada, unit en faltantes');
eq(sinUnit.alerta, 'A09', 'sin unit pero con unit_value+traz → A09 (intención económica, puerta incompleta)');

var unitVacio = EC.evaluarPuertaEconomica(econ({ unit: '   ' }));
ok(!unitVacio.abierta, 'unit = espacios en blanco → cuenta como ausente, puerta cerrada');

var sinVU = EC.evaluarPuertaEconomica(econ({ unit_value: null }));
ok(!sinVU.abierta && sinVU.alerta === 'A09', 'sin unit_value pero traz=true → cerrada + A09 (intención por traz)');

var sinTraz = EC.evaluarPuertaEconomica(econ({ economic_traceability: false }));
ok(!sinTraz.abierta && sinTraz.alerta === 'A09', 'unit_value presente + traz=false → A09 (paridad con el engine)');

var noEconomico = EC.evaluarPuertaEconomica({ economic_traceability: false });
ok(!noEconomico.abierta && noEconomico.alerta === null,
  'sin unit_value y traz=false → EPD no-económico: cerrada SIN alerta (§35)');

// §26: 0 (ausencia DEMOSTRADA) ≠ null (no determinado). unit_value = 0 es
// un valor unitario verificado como cero, no una ausencia → puerta abierta.
var unitValueCero = EC.evaluarPuertaEconomica(econ({ unit_value: 0 }));
ok(unitValueCero.abierta, 'unit_value = 0 → puerta ABIERTA (0 = valor demostrado, §26; distinto de null)');
var mCero = EC.monetizar(econ({ unit_value: 0 }), PROY);
near(mCero.economic_base, 0, 'unit_value = 0 → EEB = 5400 × 0 = 0 (cifra legítima, no null; contrasta con sinVU=null arriba)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§23.2 — exposicionEconomicaBruta: EEB = Q^fut × VU');
// ═══════════════════════════════════════════════════════════════════════

var eeb = EC.exposicionEconomicaBruta(PROY, 25);
near(eeb.economic_base, 135000, '§12 normativo: 5400 × 25 = 135.000');
near(eeb.economic_lower, 125550, '5022 × 25 = 125.550 (rango del envelope §22, no de la atribución)');
near(eeb.economic_upper, 144450, '5778 × 25 = 144.450');

var eebParcial = EC.exposicionEconomicaBruta({ base: 5400, lower: null, upper: null }, 25);
near(eebParcial.economic_base, 135000, 'base sola → economic_base = 135.000');
eq(eebParcial.economic_lower, null, 'lower null → economic_lower null (null-safe)');
eq(eebParcial.economic_upper, null, 'upper null → economic_upper null');

lanza(function () { EC.exposicionEconomicaBruta(PROY, null); }, 'unit_value null → lanza (la puerta §23.1 debió filtrarlo)');
lanza(function () { EC.exposicionEconomicaBruta(PROY, 'caro'); }, 'unit_value no numérico → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('§23.3 — tratamientoAtribucion: acompaña la cifra, NO la multiplica');
// ═══════════════════════════════════════════════════════════════════════

var tC = EC.tratamientoAtribucion('CONFIRMED');
eq(tC.alerta, null, 'CONFIRMED → sin alerta');
ok(typeof tC.afirmacion === 'string' && tC.nota.indexOf('no la multiplica') !== -1, 'CONFIRMED → afirmación textual, "no la multiplica"');

var tS = EC.tratamientoAtribucion('SUPPORTED');
eq(tS.alerta, null, 'SUPPORTED → sin alerta');
ok(tS.nota.indexOf('sin descuento porcentual') !== -1, 'SUPPORTED → "sin descuento porcentual"');

var tU = EC.tratamientoAtribucion('UNRESOLVED');
eq(tU.alerta, 'A10', 'UNRESOLVED → A10 (única categoría con alerta)');
ok(tU.nota.indexOf('NO debe presentarse como costo atribuible demostrado') !== -1, 'UNRESOLVED → restringe la afirmación');

var tNA = EC.tratamientoAtribucion('N_A');
eq(tNA.alerta, null, 'N_A → sin alerta');
ok(tNA.nota.indexOf('no se introduce coeficiente sustituto') !== -1, 'N_A → "no se introduce coeficiente sustituto"');

// ninguna categoría devuelve algo numérico / coeficiente
['CONFIRMED', 'SUPPORTED', 'UNRESOLVED', 'N_A'].forEach(function (cat) {
  var t = EC.tratamientoAtribucion(cat);
  var soloTextoYNull = Object.keys(t).every(function (k) {
    return typeof t[k] === 'string' || t[k] === null;
  });
  ok(soloTextoYNull, cat + ' → el tratamiento solo tiene strings/null, ningún número que pueda colarse a la cifra');
});

lanza(function () { EC.tratamientoAtribucion('0.70'); }, '"0.70" → lanza (el contrato ya lo rechaza; defensivo, no inventa)');

// ═══════════════════════════════════════════════════════════════════════
seccion('monetizar — orquestación §28: puerta → EEB → atribución');
// ═══════════════════════════════════════════════════════════════════════

var mOpen = EC.monetizar(econ(), PROY);
near(mOpen.economic_base, 135000, 'puerta abierta → economic_base = 135.000');
near(mOpen.economic_lower, 125550, 'economic_lower = 125.550');
near(mOpen.economic_upper, 144450, 'economic_upper = 144.450');
eq(mOpen.alerts, [], 'CONFIRMED → sin alertas');
ok(mOpen.notes.some(function (n) { return n.indexOf('MONETIZACIÓN ≠ ATRIBUCIÓN') !== -1; }), 'nota obligatoria MONETIZACIÓN ≠ ATRIBUCIÓN');

var mClosed = EC.monetizar(econ({ unit: null }), PROY);
eq([mClosed.economic_base, mClosed.economic_lower, mClosed.economic_upper], [null, null, null], 'puerta cerrada → sin cifras');
eq(mClosed.alerts, ['A09'], 'puerta cerrada con intención → A09');
eq(mClosed.atribucion, null, 'puerta cerrada → no se llega al tratamiento de atribución');

var mNoEcon = EC.monetizar({ economic_traceability: false, attribution_category: 'N_A' }, PROY);
eq(mNoEcon.alerts, [], 'EPD no-económico → sin cifras y SIN A09');

var mUnres = EC.monetizar(econ({ attribution_category: 'UNRESOLVED' }), PROY);
near(mUnres.economic_base, 135000, 'UNRESOLVED → la cifra se calcula igual (§35: "conservar la valoración económica")');
eq(mUnres.alerts, ['A10'], 'UNRESOLVED → A10, pero la cifra NO cambia');

// ═══════════════════════════════════════════════════════════════════════
seccion('§34/§35 — INVARIANTE: 4 categorías → misma valoración económica');
// ═══════════════════════════════════════════════════════════════════════
//
// "CONFIRMED, SUPPORTED, UNRESOLVED y N_A producen exactamente la misma
// valoración económica cuando la consecuencia, el valor unitario y la
// trazabilidad son iguales." §32: ATRIBUIR ≠ PONDERAR. Esta es la
// regresión nombrada — la mutación #1 la hace fallar aquí.

var valoraciones = ['CONFIRMED', 'SUPPORTED', 'UNRESOLVED', 'N_A'].map(function (cat) {
  var m = EC.monetizar(econ({ attribution_category: cat }), PROY);
  return { cat: cat, base: m.economic_base, lower: m.economic_lower, upper: m.economic_upper };
});
var ref0 = valoraciones[0];
valoraciones.forEach(function (v) {
  ok(v.base === ref0.base && v.lower === ref0.lower && v.upper === ref0.upper,
    'INVARIANTE: ' + v.cat + ' → [' + v.base + ', ' + v.lower + ', ' + v.upper + '] == CONFIRMED [' +
    ref0.base + ', ' + ref0.lower + ', ' + ref0.upper + ']');
});
ok(valoraciones.every(function (v) { return v.base === 135000; }),
  'INVARIANTE: las 4 dan exactamente 135.000, ninguna ponderada / descontada');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. exposicionEconomicaBruta lee attribution_category y aplica factor (UNRESOLVED ×0.5)');
console.log('     → el INVARIANTE §34/§35 falla: UNRESOLVED da 67.500 ≠ 135.000 de CONFIRMED.');
console.log('  2. puerta con OR en vez de AND → econ({unit:null}) monetiza (135.000) en vez de cerrar.');
console.log('  3. A09 siempre (sin la guarda de intención) → EPD no-económico recibe A09 espurio.');
console.log('  4. tratamientoAtribucion: UNRESOLVED → alerta null → se pierde la restricción de la');
console.log('     afirmación (§35: "impedir presentarla como costo atribuible demostrado").');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
