/**
 * motor-ifd/calibracion.test.js — Fase 8
 * node motor-ifd/calibracion.test.js
 *
 * §36 — verificación posterior. LO QUE ESTA BATERÍA PRUEBA: que la
 * aritmética de Error/EA/MAE/Sesgo/cobertura es correcta según §36 sobre
 * pares (Y_obs, Y_proj) SINTÉTICOS, y que la regla "solo entre variables
 * comparables" se hace cumplir.
 *
 * LO QUE ESTA BATERÍA NO PRUEBA (y NO se puede probar hasta el piloto):
 * si el motor CALIBRA BIEN — si sobre casos reales el MAE es aceptable, el
 * Sesgo cercano a cero, y la cobertura empírica se acerca a la nominal del
 * envelope. Eso requiere Y_obs reales, que hoy no existen.
 */

'use strict';

var K = require('./calibracion');
var R = require('./runIFD');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }
function near(a, b, m) { ok(typeof a === 'number' && Math.abs(a - b) < 1e-9, m + (Math.abs(a - b) < 1e-9 ? '' : '  [recibido=' + a + ' esperado=' + b + ']')); }
function lanza(fn, m) { var l = false; try { fn(); } catch (e) { l = true; } ok(l, m); }

function inp(o) {
  return Object.assign({
    epd_id: 'EPD-1', engine_version: 'ifd-js-0.1',
    deterioration_sustained: true, evidence_present: true, mechanism_traceable: true,
    horizon_defined: true, assumptions_declared: true,
    Q: 3, C: 3, T: 3, R: 3, variable_type: 'V3', evolution_type: 'EV-A',
    series_sufficiency: 3, horizon: 6, hms: 12,
    economic_traceability: false, attribution_category: 'CONFIRMED'
  }, o || {});
}
function econ(o) {
  return inp(Object.assign({ baseline: 3000, delta: 400, lower_bound: 0, unit: 'horas', unit_value: 25, economic_traceability: true }, o || {}));
}

// ═══════════════════════════════════════════════════════════════════════
seccion('§36 — Error y EA puntuales');
// ═══════════════════════════════════════════════════════════════════════

near(K.errorEPD(5000, 5400), -400, 'Error = Y_obs − Y_proj = 5000 − 5400 = −400 (el motor sobre-proyectó)');
near(K.errorEPD(5800, 5400), 400, 'Error = 5800 − 5400 = 400 (el motor sub-proyectó)');
near(K.errorAbsoluto(5000, 5400), 400, 'EA = |−400| = 400');
lanza(function () { K.errorEPD(5000, null); }, 'y_proj no numérico → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('§36 — MAE y Sesgo (el signo de Sesgo es OPUESTO al de Error)');
// ═══════════════════════════════════════════════════════════════════════

var paresMixto = [
  { y_obs: 5000, y_proj: 5400 },  // Error −400, aporte a Sesgo: +400
  { y_obs: 5800, y_proj: 5400 },  // Error +400, aporte a Sesgo: −400
  { y_obs: 4600, y_proj: 5400 }   // Error −800, aporte a Sesgo: +800
];
near(K.mae(paresMixto), (400 + 400 + 800) / 3, 'MAE = (1/3)(400 + 400 + 800) = 533.33…');
near(K.sesgo(paresMixto), (400 - 400 + 800) / 3, 'Sesgo = (1/3)Σ(Y_proj − Y_obs) = (400 − 400 + 800)/3 = 266.67 (> 0 ⟺ sobre-proyecta)');

// caso puro de sobre-proyección: el signo importa
var sobre = [{ y_obs: 100, y_proj: 150 }, { y_obs: 200, y_proj: 260 }];
near(K.sesgo(sobre), (50 + 60) / 2, 'sobre-proyección pura: Sesgo = +55 (POSITIVO — §36 literal, NO −55)');
near(K.mae(sobre), (50 + 60) / 2, 'MAE = 55');

// MAE nunca es negativo aunque los errores se cancelen
var cancela = [{ y_obs: 100, y_proj: 200 }, { y_obs: 300, y_proj: 200 }];
near(K.mae(cancela), 100, 'MAE de errores que se cancelan (−100, +100) sigue siendo 100, no 0');
near(K.sesgo(cancela), 0, 'Sesgo de esos mismos = 0 (se cancelan)');

lanza(function () { K.mae([]); }, 'MAE de lote vacío → lanza (no hay con qué calcular)');
lanza(function () { K.sesgo([{ y_obs: 1 }]); }, 'par sin y_proj → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('§36 — cobertura del rango proyectado (frontera incluida)');
// ═══════════════════════════════════════════════════════════════════════

var items = [
  { y_obs: 5400, L: 5022, U: 5778 },  // dentro
  { y_obs: 5022, L: 5022, U: 5778 },  // dentro (frontera L)
  { y_obs: 5778, L: 5022, U: 5778 },  // dentro (frontera U)
  { y_obs: 6000, L: 5022, U: 5778 },  // fuera
  { y_obs: 4000, L: 5022, U: 5778 }   // fuera
];
var cob = K.cobertura(items);
eq([cob.n, cob.dentro, cob.fuera], [5, 3, 2], 'cobertura: 5 items, 3 dentro (incluidas ambas fronteras), 2 fuera');
near(cob.tasa, 3 / 5, 'tasa = 3/5 = 0.6');
eq(K.cobertura([]).tasa, null, 'cobertura de lote vacío → tasa null (no 0)');
lanza(function () { K.cobertura([{ y_obs: 1, L: 0 }]); }, 'item sin U → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('§36 — calibrarLote: agrupa por variable_type, solo CUANTIFICADO');
// ═══════════════════════════════════════════════════════════════════════

// 3 EPD V3 (delta) con proyección 5400, + 1 V1 (tasa), + 1 terminal S1 (V5)
var v3a = R.runEPD(inp({ epd_id: 'v3a', variable_type: 'V3', baseline: 3000, delta: 400, lower_bound: 0 })).output; // proj 5400
var v3b = R.runEPD(inp({ epd_id: 'v3b', variable_type: 'V3', baseline: 3000, delta: 400, lower_bound: 0 })).output;
var v1  = R.runEPD(inp({ epd_id: 'v1', variable_type: 'V1', evolution_type: 'EV-A', events_obs: 504, exposure_obs: 12000, exposure_future: 72000, lower_bound: 0 })).output; // proj 3024
var v5  = R.runEPD(inp({ epd_id: 'v5', variable_type: 'V5' })).output; // terminal S1

var lote = K.calibrarLote([
  { output: v3a, y_obs: 5000 },  // Error −400
  { output: v3b, y_obs: 5800 },  // Error +400
  { output: v1,  y_obs: 3000 },  // Error −24
  { output: v5,  y_obs: 999 }    // no calibrable
]);
ok(lote.ok, 'calibrarLote ok');
eq(Object.keys(lote.por_variable).sort(), ['V1', 'V3'], 'agrupado por variable_type: V1 y V3 por separado (§36: solo entre comparables)');
eq(lote.por_variable.V3.n, 2, 'V3: 2 EPD');
near(lote.por_variable.V3.mae, 400, 'V3 MAE = (400 + 400)/2 = 400');
near(lote.por_variable.V3.sesgo, 0, 'V3 Sesgo = (400 − 400)/2 = 0');
near(lote.por_variable.V1.mae, 24, 'V1 MAE = |3000 − 3024| = 24');
near(lote.por_variable.V1.sesgo, 24, 'V1 Sesgo = 3024 − 3000 = +24 (sobre-proyectó)');
ok(lote.no_calibrables.length === 1 && lote.no_calibrables[0].epd_id === 'v5', 'el V5 (terminal) va en no_calibrables, sin métrica');
ok(lote.notes.some(function (n) { return n.indexOf('NO se produce un MAE/Sesgo global') !== -1; }),
  'nota: no hay agregado global cruzando V1 y V3 (§36)');

// cobertura dentro del grupo (V3 emite envelope)
var v3c = R.runEPD(econ({ epd_id: 'v3c', baseline: 3000, delta: 400 })).output; // proj 5400, [5022, 5778]
var loteCob = K.calibrarLote([{ output: v3c, y_obs: 5400 }, { output: v3a, y_obs: 9999 }]);
eq([loteCob.por_variable.V3.cobertura.dentro, loteCob.por_variable.V3.cobertura.fuera], [1, 1],
  'cobertura V3: v3c (5400 en [5022,5778]) dentro, v3a (9999) fuera');

// lote sin ningún CUANTIFICADO
var soloTerminal = K.calibrarLote([{ output: v5, y_obs: 1 }]);
eq(Object.keys(soloTerminal.por_variable).length, 0, 'lote de solo terminales → por_variable vacío, sin métricas fabricadas');

// entrada mal formada
ok(!K.calibrarLote('no soy array').ok, 'no-array → { ok:false }');
ok(!K.calibrarLote([{ output: v3a }]).ok, 'obs sin y_obs → { ok:false }');
var sinVT = JSON.parse(JSON.stringify(v3a)); delete sinVT.variable_type;
ok(!K.calibrarLote([{ output: sinVT, y_obs: 5000 }]).ok, 'output sin variable_type → { ok:false } (§36 agrupa por él)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Alcance — lo que esta batería NO afirma');
// ═══════════════════════════════════════════════════════════════════════
console.log('  Esta batería valida la ARITMÉTICA de §36 sobre datos sintéticos. NO afirma nada');
console.log('  sobre si el motor calibra bien en la práctica: el MAE/Sesgo/cobertura reales, y la');
console.log('  calibración de rúbricas/serie/HMS/percentiles/contención (§36 los enumera), quedan');
console.log('  PENDIENTES hasta que el piloto produzca Y_obs reales.');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. sesgo: (y_proj − y_obs) → (y_obs − y_proj) ("corregir" el signo para igualar Error)');
console.log('     → 3 rojos, incl. "sobre-proyección pura: Sesgo = +55" (da −55). §36 lo escribe al');
console.log('     revés a propósito; esta mutación es la tentación de "arreglarlo".');
console.log('  2. mae sin Math.abs → 5 rojos, incl. "MAE de errores que se cancelan sigue 100" (da 0).');
console.log('  3. cobertura con `<` en vez de `<=` → 2 rojos: los casos y_obs==L e y_obs==U pasan a');
console.log('     contarse como fuera → "3 dentro" da 1, "tasa 0.6" da 0.2.');
console.log('  4. calibrarLote sin agrupar (grupo "_GLOBAL" único) → 1 rojo: V1 y V3 se mezclan,');
console.log('     "agrupado por variable_type: V1 y V3 por separado" falla.');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
