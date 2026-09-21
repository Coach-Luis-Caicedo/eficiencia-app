/**
 * motor-aie/aie.test.js
 * node motor-aie/aie.test.js
 *
 * Prueba de REGRESIÓN PERMANENTE del port JS de classify_2F/classify_3F
 * (DISENO_PORT_CLASSIFY_2F_3F.md §8). Si algún día engine_core.py/
 * rules_2f_3f.py cambian, correr este mismo harness contra el port JS
 * existente es la forma de detectar la divergencia -- no un ejercicio de
 * una sola vez, se queda en la batería del proyecto.
 *
 * Extendida (DISENO_WORKER_EJECUCION_MOTORES.md §5) para cubrir también
 * runCase.js -- el ensamblador de producción que reemplaza a ejecutarAIE()
 * de los harnesses motor-integracion-*-aie (que invocaban Python vía
 * spawnSync, inviable en Cloudflare Workers). Misma batería, misma fuente
 * de verdad -- runCase() se ejercita fila por fila junto al cálculo
 * inline ya existente, no en un archivo de prueba aparte.
 *
 * Fuente de verdad: motor-aie/fixtures/fixture_2f_3f.json -- 19 884 filas
 * generadas UNA VEZ por aie_validation_kit/gen_fixture_2f_3f.py corriendo
 * el Python real (engine_core.py/rules_2f_3f.py sin modificar), sobre los
 * 13 escenarios de scenarios.py (84 filas) + las 900 series sintéticas de
 * statistical_simulation.py (19 800 filas, mismo SEED=11). El fixture NO se
 * regenera aquí -- es la "hoja de respuestas" congelada.
 *
 * Criterio de aprobación, sin excepción: 0 discrepancias en las etiquetas
 * categóricas de las 19 884 filas. Tolerancia de punto flotante (1e-9) SOLO
 * en la pendiente cruda interna (*_slope) -- nunca en pos/traj/pers/detrun/
 * imprun/AIE_2F/AIE_3F, que son igualdad exacta o nada.
 */

'use strict';

var fs = require('fs');
var path = require('path');
var E = require('./engine_core');
var R = require('./rules_2f_3f');
var runCase = require('./runCase').runCase;

var _ok = 0, _fallos = 0;
var _discrepancias = [];
function ok(c, m) { if (c) { _ok++; } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { ok(a === b, m + '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']'); }

// ═══════════════════════════════════════════════════════════════════════
console.log('\n── Spot-checks legibles (subconjunto pequeño, para depuración rápida) ──');
// ═══════════════════════════════════════════════════════════════════════

eq(E.position(20), 'F', 'position(20) = F (<=33)');
eq(E.position(50), 'I', 'position(50) = I (34-66)');
eq(E.position(80), 'D', 'position(80) = D (>66)');
eq(E.trajectory([20, 20], 1), 'INDETERMINATE', 'trajectory con 2 puntos y window=3 → INDETERMINATE (t<window-1)');
eq(E.persistence(['D'], 0), 'POINT', 'persistence con 1 punto y window=3 → POINT (t<window-1)');
eq(E.trajectory_run([20, 20, 20], 2, 'DETERIORATING'), 0, 'trajectory_run sin historia suficiente → 0');
eq(R.classify_2F('F', 'F', 'STABLE', 'STABLE'), 'REG_CONVERGENT', 'classify_2F: F+F → REG_CONVERGENT');
eq(R.classify_3F('F', 'F', 'F', 'STABLE', 'STABLE', 'STABLE', 'POINT'), 'REG_CONVERGENT', 'classify_3F: F+F+F → REG_CONVERGENT');
eq(R.classify_3F('D', 'D', 'N/A', 'STABLE', 'STABLE', 'N/A', 'POINT'), 'DET_EMERGING (cobertura parcial, OPS no admisible)',
  'classify_3F con OPS=N/A y CFG=DYN=D, sin mejora predominante (ambos STABLE) → DET_EMERGING de cobertura parcial');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n── Verificación cruzada exhaustiva contra el fixture real (19 884 filas) ──');
// ═══════════════════════════════════════════════════════════════════════

var fixturePath = path.join(__dirname, 'fixtures', 'fixture_2f_3f.json');
var rows = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

// Agrupar por `source` -- cada grupo es una serie temporal completa,
// reconstruida en el mismo orden en que gen_fixture_2f_3f.py la generó
// (las filas ya vienen ordenadas por t dentro de cada source).
var porSource = {};
rows.forEach(function (r) {
  (porSource[r.source] = porSource[r.source] || []).push(r);
});

var totalFilas = 0;
var camposEnteros = ['DYN_detrun', 'OPS_detrun', 'CFG_imprun', 'DYN_imprun'];
var camposString = ['CFG_pos', 'DYN_pos', 'OPS_pos', 'CFG_traj', 'DYN_traj', 'OPS_traj',
  'DYN_pers', 'OPS_pers', 'AIE_3F', 'AIE_2F'];
var TOL = 1e-9;

function comparaFloat(source, t, campo, recibido, esperado) {
  var ambosNull = (recibido === null && esperado === null);
  var okFloat = ambosNull || (recibido !== null && esperado !== null && Math.abs(recibido - esperado) < TOL);
  if (!okFloat) {
    _discrepancias.push({ source: source, t: t, campo: campo, recibido: recibido, esperado: esperado });
  }
  return okFloat;
}
function comparaExacto(source, t, campo, recibido, esperado) {
  var iguales = recibido === esperado;
  if (!iguales) {
    _discrepancias.push({ source: source, t: t, campo: campo, recibido: recibido, esperado: esperado });
  }
  return iguales;
}

var camposRunCase = ['CFG', 'DYN', 'OPS', 'CFG_pos', 'DYN_pos', 'OPS_pos',
  'CFG_traj', 'DYN_traj', 'OPS_traj', 'DYN_pers', 'DYN_detrun',
  'OPS_pers', 'OPS_detrun', 'CFG_imprun', 'DYN_imprun', 'AIE_3F', 'AIE_2F'];
// 't' se compara aparte (es el índice, no un campo derivado) -- 18 campos
// en total por fila de runCase(), t + los 17 de esta lista.
var totalFilasRunCase = 0;
var _discrepanciasRunCase = [];
function comparaExactoRunCase(source, t, campo, recibido, esperado) {
  var iguales = recibido === esperado;
  if (!iguales) {
    _discrepanciasRunCase.push({ source: source, t: t, campo: campo, recibido: recibido, esperado: esperado });
  }
  return iguales;
}

Object.keys(porSource).forEach(function (source) {
  var grupo = porSource[source].slice().sort(function (a, b) { return a.t - b.t; });
  var cfgArr = grupo.map(function (r) { return r.CFG; });
  var dynArr = grupo.map(function (r) { return r.DYN; });
  var opsArr = grupo.map(function (r) { return r.OPS; }); // puede tener null
  var opsPresente = opsArr[0] !== null;

  // runCase() se corre UNA vez por serie completa (así se invocaría en
  // producción) -- no fila por fila como el cálculo inline de abajo.
  var filasRunCase = runCase(cfgArr, dynArr, opsArr);

  grupo.forEach(function (fila, t) {
    totalFilas++;

    var cfg_p = E.position(cfgArr[t]);
    var dyn_p = E.position(dynArr[t]);
    var cfg_t = E.trajectory(cfgArr, t);
    var dyn_t = E.trajectory(dynArr, t);
    var dyn_pers = E.persistence(dynArr, t);
    var dyn_det_run = E.trajectory_run(dynArr, t, 'DETERIORATING');
    var cfg_imp_run = E.trajectory_run(cfgArr, t, 'IMPROVING');
    var dyn_imp_run = E.trajectory_run(dynArr, t, 'IMPROVING');
    var cfg_slope = E._pendiente(cfgArr, t, E.TRAJ_WINDOW);
    var dyn_slope = E._pendiente(dynArr, t, E.TRAJ_WINDOW);

    var ops_p, ops_t, ops_pers, ops_det_run, ops_slope;
    if (opsPresente) {
      ops_p = E.position(opsArr[t]);
      ops_t = E.trajectory(opsArr, t);
      ops_pers = E.persistence(opsArr, t);
      ops_det_run = E.trajectory_run(opsArr, t, 'DETERIORATING');
      ops_slope = E._pendiente(opsArr, t, E.TRAJ_WINDOW);
    } else {
      ops_p = 'N/A'; ops_t = 'N/A'; ops_pers = 'POINT'; ops_det_run = 0; ops_slope = null;
    }

    var s3 = R.classify_3F(cfg_p, dyn_p, ops_p, cfg_t, dyn_t, ops_t, dyn_pers, dyn_det_run,
      ops_pers, ops_det_run, cfg_imp_run, dyn_imp_run);
    var s2 = R.classify_2F(cfg_p, dyn_p, cfg_t, dyn_t);

    var recibidos = {
      CFG_pos: cfg_p, DYN_pos: dyn_p, OPS_pos: ops_p,
      CFG_traj: cfg_t, DYN_traj: dyn_t, OPS_traj: ops_t,
      DYN_pers: dyn_pers, OPS_pers: ops_pers,
      DYN_detrun: dyn_det_run, OPS_detrun: ops_det_run,
      CFG_imprun: cfg_imp_run, DYN_imprun: dyn_imp_run,
      AIE_3F: s3, AIE_2F: s2
    };

    camposString.concat(camposEnteros).forEach(function (campo) {
      comparaExacto(source, t, campo, recibidos[campo], fila[campo]);
    });
    comparaFloat(source, t, 'CFG_slope', cfg_slope, fila.CFG_slope);
    comparaFloat(source, t, 'DYN_slope', dyn_slope, fila.DYN_slope);
    comparaFloat(source, t, 'OPS_slope', ops_slope, fila.OPS_slope);

    // ── runCase() (motor-aie/runCase.js) contra el mismo fixture ──────
    // No repite el cálculo inline de arriba -- compara la fila que el
    // ensamblador de producción ya generó para esta serie completa contra
    // el fixture, igual que se compararía el port de classify_2F/3F.
    var filaRunCase = filasRunCase[t];
    totalFilasRunCase++;
    ok(filaRunCase.t === t, 'runCase(): fila[' + t + '].t coincide con el índice (source=' + source + ')');
    camposRunCase.forEach(function (campo) {
      comparaExactoRunCase(source, t, campo, filaRunCase[campo], fila[campo]);
    });
  });
});

console.log('  Filas comparadas: ' + totalFilas + ' (esperado: 19884)');
ok(totalFilas === 19884, 'total de filas del fixture coincide con lo esperado (19884)');

if (_discrepancias.length === 0) {
  console.log('  ✓ 0 discrepancias en las ' + totalFilas + ' filas -- port JS coincide EXACTO con el Python real.');
  _ok++;
} else {
  console.log('  ✗ ' + _discrepancias.length + ' discrepancias encontradas -- las primeras 20:');
  _discrepancias.slice(0, 20).forEach(function (d) {
    console.log('    source=' + d.source + ' t=' + d.t + ' campo=' + d.campo +
      ' recibido(JS)=' + JSON.stringify(d.recibido) + ' esperado(Python)=' + JSON.stringify(d.esperado));
  });
  _fallos++;
}

// ═══════════════════════════════════════════════════════════════════════
console.log('\n── runCase() (motor-aie/runCase.js, el ensamblador de producción) contra el mismo fixture ──');
// ═══════════════════════════════════════════════════════════════════════

console.log('  Filas comparadas: ' + totalFilasRunCase + ' (esperado: 19884)');
ok(totalFilasRunCase === 19884, 'runCase(): total de filas del fixture coincide con lo esperado (19884)');

if (_discrepanciasRunCase.length === 0) {
  console.log('  ✓ 0 discrepancias en las ' + totalFilasRunCase + ' filas -- runCase() coincide EXACTO con el fixture (Python real).');
  _ok++;
} else {
  console.log('  ✗ ' + _discrepanciasRunCase.length + ' discrepancias encontradas -- las primeras 20:');
  _discrepanciasRunCase.slice(0, 20).forEach(function (d) {
    console.log('    source=' + d.source + ' t=' + d.t + ' campo=' + d.campo +
      ' recibido(runCase)=' + JSON.stringify(d.recibido) + ' esperado(Python)=' + JSON.stringify(d.esperado));
  });
  _fallos++;
}

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('  (' + totalFilas + ' filas de fixture verificadas, ' + _discrepancias.length + ' discrepancias)');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
