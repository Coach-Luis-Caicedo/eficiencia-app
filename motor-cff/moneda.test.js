/**
 * motor-cff/moneda.test.js — Fase 4a
 * node motor-cff/moneda.test.js
 */

'use strict';

var M = require('./moneda');

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
seccion('§17.1 — convertirMoneda (tasa/fuente/fecha/método explícitos)');
// ═══════════════════════════════════════════════════════════════════════

var compUSD = { component_id: 'C1', original_value: 1000, original_currency: 'USD' };
var fxCompleto = { tasa: 4200, fuente: 'BanRep', fecha: '2026-01-15', metodo: 'spot', monedaDestino: 'COP' };
var convertido = M.convertirMoneda(compUSD, fxCompleto);
near(convertido.normalized_value, 4200000, EPS, 'normalized_value = 1000 × 4200 = 4,200,000');
eq(convertido.reporting_currency, 'COP', 'reporting_currency queda fijado');
eq(convertido.original_value, 1000, 'original_value permanece intacto (§17: nunca se reemplaza)');
eq(convertido.fx, { tasa: 4200, fuente: 'BanRep', fecha: '2026-01-15', metodo: 'spot' }, 'la procedencia de la tasa queda registrada');
ok(convertido !== compUSD, 'convertirMoneda devuelve un objeto nuevo, no muta la entrada');

['tasa', 'fuente', 'fecha', 'metodo', 'monedaDestino'].forEach(function (campoFaltante) {
  var fxIncompleto = Object.assign({}, fxCompleto);
  delete fxIncompleto[campoFaltante];
  lanza(function () { M.convertirMoneda(compUSD, fxIncompleto); },
    'fx sin "' + campoFaltante + '" → lanza (§17.1 exige los 4 datos completos, no se fabrica ninguno)');
});

// ═══════════════════════════════════════════════════════════════════════
seccion('§17 — sumarConMonedaControlada (nunca suma monedas distintas sin conversión)');
// ═══════════════════════════════════════════════════════════════════════

var mismaMoneda = [
  { component_id: 'A', original_value: 100, original_currency: 'COP' },
  { component_id: 'B', original_value: 50, original_currency: 'COP' }
];
var rMisma = M.sumarConMonedaControlada(mismaMoneda);
near(rMisma.total, 150, EPS, 'misma original_currency → suma directa (100+50=150), sin necesitar conversión');
ok(!rMisma.convertido, 'convertido=false cuando no hizo falta convertir');

lanza(function () {
  M.sumarConMonedaControlada([
    { component_id: 'A', original_value: 100, original_currency: 'USD' },
    { component_id: 'B', original_value: 100, original_currency: 'EUR' }
  ]);
}, 'monedas distintas SIN normalized_value resuelto → lanza, no suma "como si fueran la misma"');

lanza(function () {
  var a = M.convertirMoneda({ component_id: 'A', original_value: 100, original_currency: 'USD' },
    { tasa: 1, fuente: 'x', fecha: 'x', metodo: 'x', monedaDestino: 'COP' });
  var b = M.convertirMoneda({ component_id: 'B', original_value: 100, original_currency: 'EUR' },
    { tasa: 1, fuente: 'x', fecha: 'x', metodo: 'x', monedaDestino: 'USD' }); // reporting_currency distinto
  M.sumarConMonedaControlada([a, b]);
}, 'normalized_value resueltos pero a reporting_currency DISTINTOS entre sí → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('§17.2 — precisión computacional completa (caso real de drift, no un múltiplo exacto)');
// ═══════════════════════════════════════════════════════════════════════

// 3 componentes en monedas distintas, tasa 1/3 (no exacta en binario) —
// exactamente el tipo de número que expuso el drift en el arnés
// ICE-IEH↔IAO. Verificado con node -e antes de escribir estos asserts.
var fxTercio = { tasa: 1 / 3, fuente: 'BancoX', fecha: '2026-01-15', metodo: 'spot', monedaDestino: 'EUR' };
var v1 = M.convertirMoneda({ component_id: 'C1', original_value: 100, original_currency: 'USD' }, fxTercio);
var v2 = M.convertirMoneda({ component_id: 'C2', original_value: 100, original_currency: 'GBP' }, fxTercio);
var v3 = M.convertirMoneda({ component_id: 'C3', original_value: 100, original_currency: 'JPY' }, fxTercio);

var totalPrecisionCompleta = M.sumarConMonedaControlada([v1, v2, v3]);
near(totalPrecisionCompleta.total, 100, EPS, 'suma con precisión completa (sin redondear los normalized_value intermedios) ≈ 100 exacto');
eq(M.redondear(totalPrecisionCompleta.total, 2), 100, 'redondeado SOLO al final (presentación) → 100 limpio');

// La ruta INCORRECTA (no implementada aquí): redondear cada normalized_value
// a 2 decimales ANTES de sumar. Verificado que da un resultado DISTINTO.
var totalConRedondeoIntermedio = [v1, v2, v3].reduce(function (s, c) { return s + M.redondear(c.normalized_value, 2); }, 0);
near(totalConRedondeoIntermedio, 99.99, EPS, 'si alguien redondeara cada componente ANTES de sumar (ruta que este módulo NO toma), el total sería 99.99, no 100');
ok(Math.abs(totalPrecisionCompleta.total - totalConRedondeoIntermedio) > 0.005,
  'la diferencia entre precisión completa y redondeo intermedio es real y medible (' +
  Math.abs(totalPrecisionCompleta.total - totalConRedondeoIntermedio).toFixed(4) + '), no un artefacto despreciable');

// ── Mutación real: forzar redondeo dentro de sumarConMonedaControlada y
//    confirmar que el caso específico cambia de valor (ejecutada aparte) ──
seccion('Mutación — precisión computacional completa (§17.2)');
console.log('  (ejecutada como paso de Bash aparte antes del commit — ver mensaje de cierre)');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
