/**
 * motor-piio/sim/sensibilidad_traj_stable_band.js
 *
 * Ejercicio de sensibilidad para TRAJ_STABLE_BAND_GENERICO, complementario
 * al DISENO_TRAJ_STABLE_BAND_PERS.md — mismo criterio de honestidad que
 * aie_validation_kit/statistical_simulation.py (caso 12):
 *
 * LIMITACIÓN CENTRAL A NO OLVIDAR: los escenarios de aquí abajo son series
 * SINTÉTICAS, inventadas para este ejercicio — no derivan de ninguna
 * investigación ni organización real. Este script demuestra que el
 * MECANISMO (comparar |cambio relativo| contra una banda) se comporta de
 * forma razonable frente a ruido y a tendencias reales de distinta
 * magnitud, y que funciona igual de bien en escalas muy distintas (una
 * serie ~5 y una serie ~5000) — precisamente lo que un umbral ABSOLUTO no
 * podría hacer. NO determina cuál es el número correcto para EFICIENCIA.
 * Eso lo determina el piloto con datos reales.
 *
 * Reutiliza T.magnitudCambio() real (temporal.js, método DELTA, ventana=1
 * — el default de PARAMS.TEMPORAL_METHOD_DEFAULT/TEMPORAL_WINDOW) para no
 * reimplementar la primitiva que se está evaluando. La conversión a
 * "cambio relativo" (mag / valor_anterior) y la comparación contra la
 * banda SÍ son de este script — es exactamente la pieza que
 * resolverTrayectoria() todavía no tiene (ver kpiState.js:121-127).
 *
 * Ejecutar: node sensibilidad_traj_stable_band.js
 */

'use strict';

var T = require('../temporal');

// ── PRNG determinista (mulberry32) — reproducible, sin dependencias ────
function mulberry32(seed) {
  var a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussiana(rng) { // Box-Muller
  var u1 = Math.max(rng(), 1e-12), u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

var SEED = 7;
var N_SERIES = 500;   // series sintéticas por escenario
var T_PERIODOS = 12;  // períodos por serie

// ── Generador de una serie sintética ────────────────────────────────────
// nivelBase: valor inicial. driftPorPeriodo: % de cambio POR PERÍODO del
// nivel de fondo (compuesto — deterioro si >0, dado que directionality=
// HIGHER_IS_WORSE se asume aquí — mayor valor = peor). Se define POR
// PERÍODO (no total-sobre-la-serie) porque magnitudCambio/DELTA con
// ventana=1 (el default real, TEMPORAL_WINDOW) solo mira un paso a la vez
// — la "verdad de fondo" que hay que poder detectar es el drift de CADA
// paso, no el acumulado de toda la serie. ruidoCV: coeficiente de
// variación del ruido gaussiano superpuesto, relativo al nivel de cada
// período.
function generarSerie(rng, nivelBase, driftPorPeriodo, ruidoCV) {
  var valores = [];
  var nivelesVerdaderos = []; // sin ruido — para calcular la verdad de fondo
  var nivel = nivelBase;
  for (var t = 0; t < T_PERIODOS; t++) {
    if (t > 0) nivel = nivel * (1 + driftPorPeriodo);
    nivelesVerdaderos.push(nivel);
    var ruido = gaussiana(rng) * ruidoCV * nivel;
    valores.push(nivel + ruido);
  }
  return { valores: valores, nivelesVerdaderos: nivelesVerdaderos };
}

// ── Escenarios sintéticos (inventados, documentados como tales) ────────
// drift = cambio relativo POR PERÍODO del nivel de fondo (compuesto).
var ESCENARIOS = [
  { nombre: 'FLAT_ruido_bajo',    nivelBase: 100,  drift: 0.00, ruidoCV: 0.03, esperaDeterioro: false },
  { nombre: 'FLAT_ruido_medio',   nivelBase: 100,  drift: 0.00, ruidoCV: 0.08, esperaDeterioro: false },
  { nombre: 'FLAT_ruido_alto',    nivelBase: 100,  drift: 0.00, ruidoCV: 0.15, esperaDeterioro: false },
  { nombre: 'TREND_leve_2%/per',      nivelBase: 100,  drift: 0.02, ruidoCV: 0.05, esperaDeterioro: true },
  { nombre: 'TREND_moderado_6%/per',  nivelBase: 100,  drift: 0.06, ruidoCV: 0.05, esperaDeterioro: true },
  { nombre: 'TREND_fuerte_15%/per',   nivelBase: 100,  drift: 0.15, ruidoCV: 0.05, esperaDeterioro: true },
  // Misma forma, otra escala — para confirmar invarianza de escala del %
  { nombre: 'FLAT_ruido_medio_ESCALA_5000',      nivelBase: 5000, drift: 0.00, ruidoCV: 0.08, esperaDeterioro: false },
  { nombre: 'TREND_moderado_6%/per_ESCALA_0.8',  nivelBase: 0.8,  drift: 0.06, ruidoCV: 0.05, esperaDeterioro: true }
];

var BANDAS = [0.01, 0.02, 0.03, 0.05, 0.08, 0.10, 0.15, 0.20, 0.30];

// ── Clasificación con banda relativa, reusando T.magnitudCambio real ───
// mag = valores[t] - valores[t-1] (DELTA, ventana=1 — default real).
// relativo = mag / |valores[t-1]| (convención estándar de % de cambio).
// HIGHER_IS_WORSE (mismo criterio que resolverTrayectoria, kpiState.js:123-126).
function clasificarPaso(valores, t, banda) {
  var mag = T.magnitudCambio(valores.slice(0, t + 1)); // DELTA por default
  if (mag === null) return null;
  var base = valores[t - 1];
  if (base === 0) return { rel: null, clase: 'INDEFINIDO' }; // mismo hueco que _cv() con media=0
  var rel = mag / Math.abs(base);
  var clase = rel > banda ? 'DETERIORATING' : (rel < -banda ? 'IMPROVING' : 'STABLE');
  return { rel: rel, clase: clase };
}

// ── Correr el ejercicio ─────────────────────────────────────────────────
var rng = mulberry32(SEED);
var resultados = []; // { escenario, banda, fp, fn, nPasos }

ESCENARIOS.forEach(function (esc) {
  BANDAS.forEach(function (banda) {
    var totalPasos = 0, falsosPositivos = 0, falsosNegativos = 0, pasosConDeterioroVerdadero = 0;

    for (var s = 0; s < N_SERIES; s++) {
      var gen = generarSerie(rng, esc.nivelBase, esc.drift, esc.ruidoCV);
      for (var t = 1; t < T_PERIODOS; t++) {
        var r = clasificarPaso(gen.valores, t, banda);
        if (!r || r.clase === 'INDEFINIDO') continue;
        totalPasos++;

        // verdad de fondo: el nivel VERDADERO (sin ruido) subió más que la banda
        var nivelPrevVerdadero = gen.nivelesVerdaderos[t - 1];
        var relVerdadero = (gen.nivelesVerdaderos[t] - nivelPrevVerdadero) / Math.abs(nivelPrevVerdadero);
        var huboDeterioroVerdadero = relVerdadero > banda;
        if (huboDeterioroVerdadero) pasosConDeterioroVerdadero++;

        if (!esc.esperaDeterioro && r.clase === 'DETERIORATING') falsosPositivos++;
        if (huboDeterioroVerdadero && r.clase !== 'DETERIORATING') falsosNegativos++;
      }
    }

    resultados.push({
      escenario: esc.nombre, banda: banda, totalPasos: totalPasos,
      tasaFP: esc.esperaDeterioro ? null : (falsosPositivos / totalPasos),
      tasaFN: pasosConDeterioroVerdadero > 0 ? (falsosNegativos / pasosConDeterioroVerdadero) : null,
      pasosConDeterioroVerdadero: pasosConDeterioroVerdadero
    });
  });
});

// ── Reporte ──────────────────────────────────────────────────────────────
console.log('═'.repeat(100));
console.log('  Sensibilidad TRAJ_STABLE_BAND — series sintéticas inventadas (' + N_SERIES + ' series x ' + T_PERIODOS + ' períodos, seed=' + SEED + ')');
console.log('═'.repeat(100));

['FP (falsos "deterioro" en series planas)', 'FN (deterioro real perdido)'].forEach(function (titulo, idx) {
  console.log('\n── ' + titulo + ' ' + '─'.repeat(Math.max(0, 90 - titulo.length)));
  var escNombres = idx === 0
    ? ESCENARIOS.filter(function (e) { return !e.esperaDeterioro; }).map(function (e) { return e.nombre; })
    : ESCENARIOS.filter(function (e) { return e.esperaDeterioro; }).map(function (e) { return e.nombre; });

  var header = 'banda   ' + escNombres.map(function (n) { return n.padEnd(28); }).join('');
  console.log(header);
  BANDAS.forEach(function (banda) {
    var fila = (banda * 100).toFixed(0) + '%'.padEnd(6);
    escNombres.forEach(function (nombre) {
      var r = resultados.filter(function (x) { return x.escenario === nombre && x.banda === banda; })[0];
      var val = idx === 0 ? r.tasaFP : r.tasaFN;
      fila += (val === null ? 'n/a' : (val * 100).toFixed(1) + '%').padEnd(28);
    });
    console.log(fila);
  });
});

console.log('\n' + '═'.repeat(100));
console.log('  Fin del ejercicio de sensibilidad.');
console.log('═'.repeat(100));
