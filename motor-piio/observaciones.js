/**
 * motor-piio/observaciones.js — Fase 2
 *
 * El paso `for observation` de §29:
 *   validate_data_quality()  →  preserve_original_value()  →  (resolve_kpi_state, Fase 5)
 *
 * Fase 2 hace las dos primeras + normaliza la evidencia utilizable. NO
 * clasifica pos/traj/pers (eso es Fase 5). NO recorta valores (§9: "no se
 * recortan silenciosamente" / INV-PIIO-04).
 *
 * ── Ambigüedad R (¿validate_data_quality chequea o calcula?) ─────────
 *
 * §9 lista `quality_status` como campo de KPI_OBSERVATION (llega DE la
 * fuente). §29 tiene un paso `validate_data_quality()`. AC08 ("valor
 * fuera de rango físico → INVALID; no clamp") OBLIGA a que PIIO marque
 * INVALID aunque la fuente diga VALID.
 *
 * DECISIÓN DE DISEÑO: `validarCalidadDato` produce una calidad EFECTIVA
 * por DEGRADACIÓN MONÓTONA — nunca mejora lo que declaró la fuente, solo
 * lo puede empeorar (VALID < VALID_WITH_LIMITATIONS < INVALID; MISSING es
 * ortogonal, aplica cuando no hay valor). El pipeline es SECUENCIAL, no
 * circular: `quality_status` declarado → calidad efectiva (aquí, sin
 * llamar a clasificarAusencia) → clasificarAusencia (Fase 0) consume la
 * efectiva. El texto operacionaliza el caso fuera-de-rango (AC08), no el
 * principio general.
 *
 * ── Orden preserve/validate (4ª diferencia construcción vs runtime) ──
 *
 * El pseudocódigo §29 dice `validate_data_quality()` ANTES de
 * `preserve_original_value()`. Aquí se preserva PRIMERO. Ninguna de las
 * dos muta `value` (solo lo leen) → el orden no afecta el resultado, y
 * capturar el original antes que nada es más seguro por sí solo. Es la
 * 4ª diferencia runtime-vs-construcción (ver README), no un cambio de
 * comportamiento.
 */

'use strict';

var mod = require('./enums');
var contratos = require('./contratos');

function esNumFinito(v) { return typeof v === 'number' && isFinite(v); }
function esStringNoVacio(v) { return typeof v === 'string' && v.trim().length > 0; }

/**
 * preservarValorOriginal(obs) → { original_value }
 *
 * INV-PIIO-10: el valor original nunca es sustituido por clasificación.
 * Se conserva TAL CUAL, incluso para observaciones que terminarán INVALID
 * o fuera de rango — §9: no se recorta.
 */
function preservarValorOriginal(obs) {
  return { original_value: (obs && 'value' in obs) ? obs.value : undefined };
}

/**
 * validarCalidadDato(obs, metricDef) → { data_quality, flags: string[] }
 *
 * `metricDef` puede ser null (no resolvió — Fase 1 ya emitió el finding);
 * sin él no se puede chequear rango, se conserva la calidad declarada.
 */
function validarCalidadDato(obs, metricDef) {
  var declarada = obs.quality_status;
  var flags = [];

  // ── value ausente ──────────────────────────────────────────────────
  if (obs.value === null || obs.value === undefined) {
    if (esStringNoVacio(obs.absence_reason)) {
      flags.push('NULL_EXPLICADO:' + obs.absence_reason); // ambigüedad U
    } else if (declarada !== 'MISSING') {
      flags.push('NULL_SIN_RAZON'); // Fase 0 ya lo rechaza; defensivo
    }
    return { data_quality: 'MISSING', flags: flags }; // §28 / §9.1 — no hay 5º estado
  }

  if (!esNumFinito(obs.value)) {
    return { data_quality: 'INVALID', flags: ['VALUE_NO_NUMERICO'] };
  }

  var efectiva = declarada;

  // ── fuera de rango físico (§9 / AC08) — gobernado por boundary_behavior ─
  if (metricDef) {
    var min = esNumFinito(metricDef.valid_range_min) ? metricDef.valid_range_min : null;
    var max = esNumFinito(metricDef.valid_range_max) ? metricDef.valid_range_max : null;
    var fuera = (min !== null && obs.value < min) || (max !== null && obs.value > max);
    if (fuera) {
      var bb = metricDef.boundary_behavior;
      if (bb === 'NOT_APPLICABLE') {                       // ambigüedad V
        return { data_quality: 'MISSING', flags: ['BOUNDARY_NOT_APPLICABLE'] };
      }
      if (bb === 'RULE_DEFINED') {                          // ambigüedad S
        flags.push('BOUNDARY_RULE_NO_OPERACIONALIZADO');
        efectiva = 'INVALID';
      } else {                                              // INVALID (AC08)
        flags.push('FUERA_DE_RANGO');
        efectiva = 'INVALID';
      }
    }
  }

  // ── inconsistencia valor / quality_status declarado ───────────────
  if (declarada === 'MISSING') {
    // §9: "missing no es cero" — hay un valor y la fuente dijo missing
    flags.push('VALOR_CALIDAD_INCONSISTENTE');             // ambigüedad T
    efectiva = 'INVALID';
  }

  // Degradación monótona (ambig. R): `efectiva` PARTE de `declarada` y solo
  // se mueve hacia INVALID (o MISSING vía early-return) — nunca hacia una
  // calidad mejor. No hay guarda separada porque la propiedad es
  // estructural: ninguna rama de arriba disminuye la severidad.
  return { data_quality: efectiva, flags: flags };
}

/**
 * ingestarObservaciones(input) → {
 *   evals: OBSERVATION_EVAL[],
 *   skipped: [{ observation_id, reason }]
 * }
 *
 * OBSERVATION_EVAL = {
 *   observation_id, kpi_id, node_id, period_start, period_end,
 *   original_value, value, data_quality, ausencia_kind,
 *   numerator?, denominator?, exposure?,      // §9.2 — se preservan
 *   source_id, source_traceable, flags[]
 * }
 *
 * NO recibe el reporte de Fase 1 — Fase 2 ingesta todo lo que puede; la
 * lógica de "este KPI está degradado/bloqueado" vive en Fase 5 / el
 * orquestador (menos acoplamiento). Una observación cuyo `kpi_id` no
 * tiene KPI_SPEC se salta (§30: error local no invalida evidencia
 * independiente).
 */
function ingestarObservaciones(input) {
  if (!input || typeof input !== 'object') throw new Error('ingestarObservaciones: input inválido.');
  var kpisById = {};
  (input.kpi_specs || []).forEach(function (k) { if (k && esStringNoVacio(k.kpi_id)) kpisById[k.kpi_id] = k; });
  var mds = input.metric_definitions || [];

  var evals = [], skipped = [];

  (input.observations || []).forEach(function (obs) {
    if (!obs) { skipped.push({ observation_id: null, reason: 'OBS_NULA' }); return; }
    var ks = kpisById[obs.kpi_id];
    if (!ks) {
      skipped.push({ observation_id: obs.observation_id, reason: 'KPI_SIN_SPEC' });
      return;
    }
    // METRIC_DEFINITION del SPEC (autoritativa, ambigüedad Q); puede no resolver
    var metricDef = mds.filter(function (m) {
      return m && m.metric_definition_id === ks.metric_definition_id && m.definition_version === ks.definition_version;
    })[0] || null;

    var orig = preservarValorOriginal(obs);           // PRIMERO (4ª diferencia)
    var cal = validarCalidadDato(obs, metricDef);

    var flags = cal.flags.slice();
    if (!metricDef) flags.push('MD_NO_RESUELVE');
    if (obs.metric_definition_id !== ks.metric_definition_id) flags.push('MD_MISMATCH_SPEC');

    var ausencia = contratos.clasificarAusencia({
      value: obs.value,
      quality_status: cal.data_quality,                // la EFECTIVA, no la declarada
      absence_reason: obs.absence_reason
    });

    var ev = {
      observation_id: obs.observation_id,
      kpi_id: obs.kpi_id,
      node_id: obs.node_id,
      period_start: obs.period_start,
      period_end: obs.period_end,
      original_value: orig.original_value,
      value: obs.value,
      data_quality: cal.data_quality,
      ausencia_kind: ausencia,
      source_id: obs.source_id,
      source_traceable: obs.source_traceable,
      flags: flags
    };
    // §9.2 — numerador / denominador / exposición se preservan cuando existen
    if (esNumFinito(obs.numerator)) ev.numerator = obs.numerator;
    if (esNumFinito(obs.denominator)) ev.denominator = obs.denominator;
    if (esNumFinito(obs.exposure)) ev.exposure = obs.exposure;

    evals.push(ev);
  });

  return { evals: evals, skipped: skipped };
}

module.exports = {
  preservarValorOriginal: preservarValorOriginal,
  validarCalidadDato: validarCalidadDato,
  ingestarObservaciones: ingestarObservaciones
};
