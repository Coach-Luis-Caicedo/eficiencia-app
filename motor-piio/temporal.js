/**
 * motor-piio/temporal.js — Fase 4
 *
 * Módulo COMPARTIDO de propiedades temporales (§11.2 / §11.3 / §12 / §13).
 * Lo invocan Fases 5 (traj/pers/freshness del KPI), 7 (temporal_pattern /
 * series_stability / regime_status del fenómeno), 8 y 9.
 *
 * Fase 4 produce PRIMITIVAS de serie; la clasificación a IMPROVING/STABLE/
 * DETERIORATING (traj) es Fase 5 (mismo patrón cálculo-vs-clasificación que
 * validarCalidadDato/clasificarAusencia en Fase 2).
 *
 * ── Dos clases de hueco del documento ───────────────────────────────
 *
 * GRUPO 1 (nombre sin número → PARAMS.* = null + PENDIENTE_CALIBRACION,
 * sin decisión de diseño): B `MAX_CONTINUITY_GAP`, C ventanas de freshness,
 * AA cortes de CV, AB params de patrón, AC `MIN_HISTORIA_TRAJ`, AG sparsity.
 * Mientras no estén calibrados, las funciones devuelven INSUFFICIENT / N_A
 * + un flag `*_NO_CALIBRADO` — NUNCA una lectura favorable inventada
 * (§30: "perder cobertura antes que inventar posición").
 *
 * GRUPO 2 (mecanismo ausente → decisión de diseño, anotada):
 *   H  — `det_duration` = span calendario del run actual (period[último D]
 *        − period[primer D]); `det_run` = conteo de §11.3.
 *   AD — `TEMPORAL_METHOD` no está en ningún esquema → default `DELTA`
 *        (comparar con el período anterior). Override por-KPI diferido.
 *   AF — `REGIME_STATUS`: NEW_REGIME sii Fase 3 emitió `START_NEW_REGIME`
 *        para la referencia O `continuidadDefinicion` dio `NEW_SERIES`.
 *        Es una DERIVACIÓN de lo que Fase 3 ya produce — NO una decisión
 *        de diseño nueva.
 *   AG — serie sparse → `TEMPORAL_PATTERN = INSUFFICIENT` Y
 *        `SERIES_STABILITY = INSUFFICIENT` + flag (§12/INV-58 solo dicen
 *        qué NO es).
 *
 * ── Shock (ambigüedad AE) ────────────────────────────────────────────
 *
 * `SHOCK_STATUS` / `SHOCK_TREATMENT` (§12, §27) NO aparecen en NINGÚN
 * esquema — ni de entrada ni de estado. `registrarShock` existe como
 * UTILIDAD PURA (valida una declaración ad-hoc contra los enums, no la
 * guarda en ningún contrato). NO se reabrió `PIIO_INPUT` — construir esa
 * estructura sobre una base tan débil sería especulativo (patrón S /
 * node_level). El efecto real de `EXCLUDE_FROM_STRUCTURAL_CALIBRATION` se
 * difiere (no hay calibración en motor-piio). §12/AC57/INV-59: un shock
 * confirmado NUNCA se elimina automáticamente.
 */

'use strict';

var mod = require('./enums');
var ENUMS = mod.ENUMS;
var PARAMS = mod.PARAMS;

function esNum(v) { return typeof v === 'number' && isFinite(v); }
function esStringNoVacio(v) { return typeof v === 'string' && v.trim().length > 0; }

// ─────────────────────────────────────────────────────────────────────
// Helpers de período. Se soporta 'YYYY-MM' (unidad: meses) y, vía
// Date.parse, timestamps ISO completos (unidad: días). Formato mixto o
// no parseable → null (la función que llame decide qué hacer con null).
// ─────────────────────────────────────────────────────────────────────
function _mesesDePeriodo(p) {
  var m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(p));
  return m ? (parseInt(m[1], 10) * 12 + parseInt(m[2], 10)) : null;
}

/**
 * edadEnPeriodos(desde, hasta) → number | null
 * Distancia entre dos períodos. 'YYYY-MM' → meses; ISO completo → días.
 */
function edadEnPeriodos(desde, hasta) {
  var md = _mesesDePeriodo(desde), mh = _mesesDePeriodo(hasta);
  if (md !== null && mh !== null) return mh - md;
  var td = Date.parse(desde), th = Date.parse(hasta);
  if (!isNaN(td) && !isNaN(th)) return Math.round((th - td) / 86400000);
  return null;
}

// ═════════════════════════════════════════════════════════════════════
// §13 — Freshness.  freshness(age, freshness_spec) → FRESHNESS_STATUS
//
// `age` = edad numérica (edadEnPeriodos). `freshness_spec` (de KPI_SPEC)
// puede traer { max_age_current, max_age_aging }; si no, se usa PARAMS
// (hoy null). Ninguno calibrado → 'N_A' (no se puede determinar, §13).
// STALE ≠ INVALID (INV-62); freshness NUNCA devuelve INVALID ni muta nada.
// ═════════════════════════════════════════════════════════════════════
function freshness(age, freshness_spec) {
  if (!esNum(age) || age < 0) return 'N_A';
  var spec = (freshness_spec && typeof freshness_spec === 'object') ? freshness_spec : {};
  var curr = esNum(spec.max_age_current) ? spec.max_age_current : PARAMS.FRESHNESS_MAX_AGE_CURRENT;
  var aging = esNum(spec.max_age_aging) ? spec.max_age_aging : PARAMS.FRESHNESS_MAX_AGE_AGING;
  if (!esNum(curr)) return 'N_A'; // PENDIENTE_CALIBRACION — no se inventa
  if (age <= curr) return 'CURRENT';
  if (esNum(aging) && age <= aging) return 'AGING';
  return 'STALE';
}

// ═════════════════════════════════════════════════════════════════════
// §11.3 — Continuidad y runs de deterioro.
//
// continuidadRun(secuenciaPos, periods) → {
//   det_run,          // longitud del run de D ACTUAL (0 si el último pos no es D)
//   det_duration,     // span calendario del run actual (ambig. H)
//   runs: [{ inicio, fin, longitud }],   // todos los runs históricos de D
//   flags: string[]
// }
//
// Reglas §11.3 / INV-PIIO-25:
//   - un run = tramo de posiciones D.
//   - N_A NO incrementa det_run y NO demuestra recuperación (no cierra el
//     run) — es transparente; el run continúa a través de él.
//   - solo F o I cierran un run (recuperación real).
//   - si el gap calendario entre el último D y el siguiente D supera
//     MAX_CONTINUITY_GAP, el nuevo D inicia un run NUEVO. Con
//     MAX_CONTINUITY_GAP null (PENDIENTE) NO se rompe — se puentea + flag
//     (§30: una ausencia de datos no es recuperación, INV-25).
// ═════════════════════════════════════════════════════════════════════
function continuidadRun(secuenciaPos, periods, opciones) {
  if (!Array.isArray(secuenciaPos) || !Array.isArray(periods) || secuenciaPos.length !== periods.length) {
    throw new Error('continuidadRun: secuenciaPos y periods deben ser arrays de igual longitud.');
  }
  // `opciones.maxGap` permite fijar MAX_CONTINUITY_GAP (hoy null / PENDIENTE_
  // CALIBRACION) para pruebas y para el piloto; sin override se lee de PARAMS.
  var gap = (opciones && esNum(opciones.maxGap)) ? opciones.maxGap : PARAMS.MAX_CONTINUITY_GAP;
  var runs = [];
  var flags = [];
  var runActual = null;        // { inicio, fin, longitud, ultimoDperiodo }

  function cerrar() {
    if (runActual) { runs.push({ inicio: runActual.inicio, fin: runActual.fin, longitud: runActual.longitud }); runActual = null; }
  }

  for (var i = 0; i < secuenciaPos.length; i++) {
    var pos = secuenciaPos[i], per = periods[i];
    if (pos === 'D') {
      if (runActual) {
        // ¿el gap desde el último D rompe el run?
        var d = edadEnPeriodos(runActual.ultimoDperiodo, per);
        if (esNum(gap) && esNum(d) && d > gap) {
          cerrar();
          runActual = { inicio: per, fin: per, longitud: 1, ultimoDperiodo: per };
        } else {
          if (!esNum(gap) && esNum(d) && d > 1) flags.push('GAP_PUENTEADO_SIN_CALIBRAR:' + runActual.ultimoDperiodo + '->' + per);
          runActual.fin = per; runActual.longitud += 1; runActual.ultimoDperiodo = per;
        }
      } else {
        runActual = { inicio: per, fin: per, longitud: 1, ultimoDperiodo: per };
      }
    } else if (pos === 'N_A') {
      // transparente: ni incrementa ni cierra (INV-25)
      if (!runActual) { /* nada */ }
    } else if (pos === 'F' || pos === 'I') {
      cerrar(); // recuperación real
    } else {
      throw new Error('continuidadRun: posición "' + pos + '" no es F|I|D|N_A.');
    }
  }

  var det_run = runActual ? runActual.longitud : 0;
  var det_duration = null;
  if (runActual) {
    var span = edadEnPeriodos(runActual.inicio, runActual.fin);
    det_duration = esNum(span) ? span : null; // ambig. H — span calendario
  } else {
    det_duration = 0;
  }
  // el run actual (si sigue abierto) también va en runs[] para trazabilidad
  var runsFinal = runs.slice();
  if (runActual) runsFinal.push({ inicio: runActual.inicio, fin: runActual.fin, longitud: runActual.longitud });

  return { det_run: det_run, det_duration: det_duration, runs: runsFinal, flags: flags };
}

// ═════════════════════════════════════════════════════════════════════
// §12 — Estabilidad de la serie.
// estabilidadSerie(valores) → { valor: SERIES_STABILITY, flags, cv? }
// ═════════════════════════════════════════════════════════════════════
function _cv(valores) {
  var n = valores.length;
  var media = valores.reduce(function (a, b) { return a + b; }, 0) / n;
  if (media === 0) return null; // CV indefinido
  var varianza = valores.reduce(function (a, b) { return a + (b - media) * (b - media); }, 0) / n;
  return Math.sqrt(varianza) / Math.abs(media);
}

function estabilidadSerie(valores) {
  if (!Array.isArray(valores) || valores.length < 2 || !valores.every(esNum)) {
    return { valor: 'INSUFFICIENT', flags: ['SERIE_MUY_CORTA'] };
  }
  var estable = PARAMS.STABILITY_CV_STABLE;
  var moderado = PARAMS.STABILITY_CV_MODERATE;
  if (!esNum(estable) || !esNum(moderado)) {
    return { valor: 'INSUFFICIENT', flags: ['STABILITY_NO_CALIBRADA'] }; // Grupo 1 — no se inventa
  }
  var cv = _cv(valores);
  if (cv === null) return { valor: 'INSUFFICIENT', flags: ['CV_INDEFINIDO_MEDIA_CERO'] };
  var valor = cv <= estable ? 'STABLE' : (cv <= moderado ? 'MODERATELY_VARIABLE' : 'HIGHLY_VARIABLE');
  return { valor: valor, flags: [], cv: cv };
}

// ═════════════════════════════════════════════════════════════════════
// §12 — Patrón temporal.
// patronTemporal(valores, periods) → { valor: TEMPORAL_PATTERN, flags }
//
// INV-57: no mezcla volatilidad, shock ni régimen. INV-58: sparsity NO es
// un patrón. El valor devuelto SIEMPRE ∈ TEMPORAL_PATTERN.
// ═════════════════════════════════════════════════════════════════════
function patronTemporal(valores, periods) {
  if (!Array.isArray(valores) || !valores.every(esNum)) {
    return { valor: 'INSUFFICIENT', flags: ['SERIE_INVALIDA'] };
  }
  var minPuntos = esNum(PARAMS.PATTERN_MIN_PUNTOS) ? PARAMS.PATTERN_MIN_PUNTOS : Infinity;
  if (valores.length < minPuntos) {
    return { valor: 'INSUFFICIENT', flags: [esNum(PARAMS.PATTERN_MIN_PUNTOS) ? 'SERIE_MUY_CORTA' : 'PATTERN_NO_CALIBRADO'] };
  }
  if (!esNum(PARAMS.PATTERN_TREND_SLOPE) || !esNum(PARAMS.PATTERN_SEASONAL)) {
    return { valor: 'INSUFFICIENT', flags: ['PATTERN_NO_CALIBRADO'] }; // Grupo 1
  }
  // (detección real de tendencia/estacionalidad — pendiente de calibración;
  //  con los umbrales calibrados esta rama clasifica en NONE_DETECTED /
  //  TREND / SEASONAL / TREND_AND_SEASONAL. Hoy inalcanzable.)
  return { valor: 'INSUFFICIENT', flags: ['PATTERN_NO_CALIBRADO'] };
}

// ═════════════════════════════════════════════════════════════════════
// §12 — Régimen (ambig. AF — DERIVACIÓN de las salidas de Fase 3, no una
// decisión de diseño nueva).
// regimen({ cambioReferencia?, continuidad? }) → REGIME_STATUS
// ═════════════════════════════════════════════════════════════════════
function regimen(directivas) {
  var d = directivas || {};
  var porReferencia = d.cambioReferencia && d.cambioReferencia.tipo === 'START_NEW_REGIME';
  var porDefinicion = d.continuidad && d.continuidad.modo === 'NEW_SERIES';
  return (porReferencia || porDefinicion) ? 'NEW_REGIME' : 'CONTINUOUS';
}

// ═════════════════════════════════════════════════════════════════════
// §12 — Shock (ambig. AE — utilidad pura, sin contrato).
// registrarShock({ status, treatment }) → { shock_status, shock_treatment, flags }
// AC57 / INV-59: un shock confirmado NUNCA se elimina automáticamente.
// ═════════════════════════════════════════════════════════════════════
function registrarShock(declaracion) {
  var dec = (declaracion && typeof declaracion === 'object') ? declaracion : {};
  var st = mod.esValorDe(ENUMS.SHOCK_STATUS, dec.status) ? dec.status : null;
  var tr = mod.esValorDe(ENUMS.SHOCK_TREATMENT, dec.treatment) ? dec.treatment : null;
  var flags = [];
  if (st === null || tr === null) {
    flags.push('DECLARACION_SHOCK_INVALIDA');
    return { shock_status: 'NONE', shock_treatment: 'INCLUDE', flags: flags };
  }
  if (tr === 'EXCLUDE_FROM_STRUCTURAL_CALIBRATION') {
    // no hay calibración en motor-piio — se registra la intención, no se ejecuta
    flags.push('EXCLUSION_DIFERIDA');
  }
  return { shock_status: st, shock_treatment: tr, flags: flags };
}

// ═════════════════════════════════════════════════════════════════════
// §11.2 — Método temporal (primitiva; la clasificación a traj es Fase 5).
// magnitudCambio(valores, metodo?, opciones?) → number | null
// ═════════════════════════════════════════════════════════════════════
function _pendiente(valores) {
  var n = valores.length, sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (var i = 0; i < n; i++) { sx += i; sy += valores[i]; sxy += i * valores[i]; sxx += i * i; }
  var den = n * sxx - sx * sx;
  return den === 0 ? null : (n * sxy - sx * sy) / den;
}

function magnitudCambio(valores, metodo, opciones) {
  if (!Array.isArray(valores) || valores.length < 2 || !valores.every(esNum)) return null;
  var m = mod.esValorDe(ENUMS.TEMPORAL_METHOD, metodo) ? metodo : PARAMS.TEMPORAL_METHOD_DEFAULT;
  var op = opciones || {};
  var w = esNum(op.window) ? op.window : (esNum(PARAMS.TEMPORAL_WINDOW) ? PARAMS.TEMPORAL_WINDOW : 1);

  if (m === 'DELTA') {
    var j = valores.length - 1 - w;
    return j >= 0 ? valores[valores.length - 1] - valores[j] : null;
  }
  if (m === 'SLOPE') {
    return _pendiente(valores);
  }
  if (m === 'ROLLING_COMPARE') {
    var k = esNum(op.k) ? op.k : w;
    if (valores.length < 2 * k) return null;
    var ult = valores.slice(-k), prev = valores.slice(-2 * k, -k);
    var mu = function (a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; };
    return mu(ult) - mu(prev);
  }
  return null; // OTHER_VALIDATED — lo aporta el llamante
}

/**
 * historiaSuficiente(valores) → boolean
 * INV-PIIO-26: historia insuficiente → traj = N_A. Sin MIN_HISTORIA_TRAJ
 * calibrado, se exige el mínimo absoluto para computar cualquier cambio (2).
 */
function historiaSuficiente(valores) {
  if (!Array.isArray(valores) || !valores.every(esNum)) return false;
  var minimo = esNum(PARAMS.MIN_HISTORIA_TRAJ) ? PARAMS.MIN_HISTORIA_TRAJ : 2;
  return valores.length >= minimo;
}

module.exports = {
  edadEnPeriodos: edadEnPeriodos,
  freshness: freshness,
  continuidadRun: continuidadRun,
  estabilidadSerie: estabilidadSerie,
  patronTemporal: patronTemporal,
  regimen: regimen,
  registrarShock: registrarShock,
  magnitudCambio: magnitudCambio,
  historiaSuficiente: historiaSuficiente
};
