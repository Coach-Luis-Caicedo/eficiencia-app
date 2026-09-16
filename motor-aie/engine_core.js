/**
 * motor-aie/engine_core.js
 *
 * Port 1:1 de aie_validation_kit/engine_core.py — DISENO_PORT_CLASSIFY_2F_3F.md.
 * Motivo: `spawnSync` a un intérprete Python no funciona en el navegador ni en
 * Cloudflare Workers (sin subprocesos). Verificado contra el fixture real
 * (motor-aie/fixtures/fixture_2f_3f.json, 19 884 filas generadas por
 * aie_validation_kit/gen_fixture_2f_3f.py) en motor-aie/aie.test.js.
 *
 * SIN cambios de comportamiento respecto al Python — mismos parámetros
 * PENDIENTE_VALIDACION, mismos placeholders pre-piloto (ver comentario
 * original en engine_core.py). No se recalibra nada aquí.
 *
 * Única traducción no literal: `np.polyfit(x, y, 1)[0]` (mínimos cuadrados
 * vía SVD/LAPACK) se reemplaza por la fórmula cerrada de la pendiente OLS —
 * mismo criterio ya usado y verificado en motor-piio/temporal.js:_pendiente()
 * y motor-sdmo/motor-sdmo.js (pendienteLineal). Para TRAJ_WINDOW=3 (ventana
 * fija hoy) el sistema siempre está bien condicionado; la equivalencia
 * numérica se verifica empíricamente contra el fixture real, no se asume.
 */

'use strict';

// ---------- Parámetros pre-piloto (placeholders, NO validados) ----------
// Idénticos a engine_core.py:19-25 — no se recalibra nada en el port.
var TH_FI = 33;          // <=33 => favorable
var TH_ID = 66;           // >66 => deteriorado; entre medio => intermedio
var TRAJ_WINDOW = 3;      // observaciones usadas para estimar pendiente
var MDC = 5.0;             // cambio mínimo detectable (unidades de escala 0-100)
var PERSIST_WINDOW = 3;   // observaciones para considerar una posición "persistente"
var PERSIST_RUN_MIN = 2;  // períodos consecutivos DETERIORATING/IMPROVING para "sostenida"

/** Clasifica un valor 0-100 en F (favorable) / I (intermedio) / D (deteriorado). */
function position(x) {
  if (x <= TH_FI) return 'F';
  else if (x <= TH_ID) return 'I';
  else return 'D';
}

/**
 * Pendiente de mínimos cuadrados (OLS) sobre la ventana [t-window+1, t].
 * Fórmula cerrada -- equivalente a np.polyfit(x, y, 1)[0] de engine_core.py
 * (ver nota de cabecera). x = [0..window-1], igual que np.arange(window).
 * Expuesta (no existe como función separada en el Python) únicamente para
 * poder verificarla con tolerancia contra el fixture real -- trajectory()
 * en engine_core.py tampoco la retorna, solo la usa internamente.
 */
function _pendiente(serie, t, window) {
  if (t < window - 1) return null;
  var y = serie.slice(t - window + 1, t + 1);
  var n = y.length;
  var sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (var i = 0; i < n; i++) { sx += i; sy += y[i]; sxy += i * y[i]; sxx += i * i; }
  var den = n * sxx - sx * sx;
  return den === 0 ? null : (n * sxy - sx * sy) / den;
}

/**
 * Estima la trayectoria en el instante t usando la pendiente sobre la
 * ventana [t-window+1, t]. Devuelve IMPROVING / STABLE / DETERIORATING /
 * INDETERMINATE -- mismo criterio que engine_core.py:trajectory().
 */
function trajectory(serie, t, window, mdc) {
  window = (window === undefined) ? TRAJ_WINDOW : window;
  mdc = (mdc === undefined) ? MDC : mdc;
  if (t < window - 1) return 'INDETERMINATE';
  var slope = _pendiente(serie, t, window);
  var umbral = mdc / window;
  if (slope > umbral) return 'DETERIORATING';
  else if (slope < -umbral) return 'IMPROVING';
  else return 'STABLE';
}

/**
 * Mide si la posición categórica (F/I/D) se mantuvo igual durante `window`
 * observaciones consecutivas terminando en t. Misma LIMITACIÓN CONOCIDA que
 * el Python (se resetea a POINT en el cruce exacto de categoría, ver
 * engine_core.py:57-79) -- no se corrige aquí, es un port fiel.
 */
function persistence(serie, t, window) {
  window = (window === undefined) ? PERSIST_WINDOW : window;
  if (t < window - 1) return 'POINT';
  var cats = [];
  for (var i = 0; i < window; i++) cats.push(position(serie[t - i]));
  var todasIguales = cats.every(function (c) { return c === cats[0]; });
  if (todasIguales) return 'PERSISTENT';
  else if (cats[0] === cats[1]) return 'REPEATED';
  else return 'POINT';
}

/** True si, entre las trayectorias dadas, predominan las que mejoran sobre las que empeoran. */
function predominant_improving(trajs) {
  var imp = trajs.filter(function (x) { return x === 'IMPROVING'; }).length;
  var det = trajs.filter(function (x) { return x === 'DETERIORATING'; }).length;
  return imp > det;
}

/**
 * Cuenta períodos consecutivos, terminando en t, en que trajectory() ==
 * direction ('DETERIORATING' o 'IMPROVING'). NO se resetea en el cruce de
 * categoría (a diferencia de persistence) -- mismo criterio que
 * engine_core.py:trajectory_run().
 */
function trajectory_run(serie, t, direction, window, mdc) {
  window = (window === undefined) ? TRAJ_WINDOW : window;
  mdc = (mdc === undefined) ? MDC : mdc;
  var run = 0, i = t;
  while (i >= 0 && trajectory(serie, i, window, mdc) === direction) { run++; i--; }
  return run;
}

module.exports = {
  TH_FI: TH_FI, TH_ID: TH_ID, TRAJ_WINDOW: TRAJ_WINDOW, MDC: MDC,
  PERSIST_WINDOW: PERSIST_WINDOW, PERSIST_RUN_MIN: PERSIST_RUN_MIN,
  position: position,
  trajectory: trajectory,
  persistence: persistence,
  predominant_improving: predominant_improving,
  trajectory_run: trajectory_run,
  _pendiente: _pendiente
};
