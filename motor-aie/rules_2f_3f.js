/**
 * motor-aie/rules_2f_3f.js
 *
 * Port 1:1 de aie_validation_kit/rules_2f_3f.py — DISENO_PORT_CLASSIFY_2F_3F.md.
 * `run_case` NO se porta (no estaba en el encargo) -- el ensamblaje real de
 * series por nodo/período lo hace el workbook; ver motor-aie/aie.test.js
 * para un ejemplo de ensamblaje equivalente, solo con fines de verificación.
 *
 * Fiel al original, incluidas sus limitaciones documentadas (no implementa
 * modificadores POLARIZATION/NODE_CONCENTRATION, ni el nivel epistemológico
 * como campo separado, ni la familia RECOVERY completa de R06 -- ver
 * rules_2f_3f.py:12-27). Portar la simplificación tal cual está, no
 * "mejorarla" de paso, es la decisión: cualquier cambio de comportamiento
 * se haría en el Python primero y se re-verificaría con el mismo fixture.
 */

'use strict';

var E = require('./engine_core');

/**
 * Familia R06 (Recuperación) — ver rules_2f_3f.py:34-68 para la
 * operacionalización completa de cada término. Devuelve etiqueta REC_* o
 * `null` (null dejaría seguir al resto del motor, igual que None en Python).
 */
function classify_recovery_3F(cfg_p, dyn_p, ops_p, cfg_t, dyn_t, ops_t, cfg_imp_run, dyn_imp_run) {
  var not_det = [cfg_p, dyn_p, ops_p].map(function (p) { return p === 'F' || p === 'I'; });
  var n_not_det = not_det.filter(function (b) { return b; }).length;
  var n_det = 3 - n_not_det;
  var cfg_imp = (cfg_t === 'IMPROVING'), dyn_imp = (dyn_t === 'IMPROVING'), ops_imp = (ops_t === 'IMPROVING');

  // REC_OPERATIONAL_LAG: CFG y DYN favorable/intermedio y mejorando; OPS
  // sigue deteriorado; trayectoria OPS mejora o compatible con rezago.
  if ((cfg_p === 'F' || cfg_p === 'I') && cfg_imp && (dyn_p === 'F' || dyn_p === 'I') && dyn_imp
      && ops_p === 'D' && ops_t !== 'DETERIORATING') {
    return 'REC_OPERATIONAL_LAG';
  }
  // REC_ADVANCED: las tres mejoran y al menos dos ya no están deterioradas.
  if (cfg_imp && dyn_imp && ops_imp && n_not_det >= 2) {
    return 'REC_ADVANCED';
  }
  // REC_EMERGING: CFG mejora y DYN mejora y OPS aún deteriorado/estable.
  if (cfg_imp && dyn_imp && (ops_p === 'D' || ops_t === 'STABLE')) {
    return 'REC_EMERGING';
  }
  // REC_INCIPIENT: niveles actuales mayormente deteriorados y al menos un
  // plano upstream (CFG o DYN) mejora de forma persistente.
  if (n_det >= 2 && (cfg_imp_run >= E.PERSIST_RUN_MIN || dyn_imp_run >= E.PERSIST_RUN_MIN)) {
    return 'REC_INCIPIENT';
  }
  return null;
}

/**
 * Clasificación con las tres familias (CFG+DYN+OPS) simétricas. ops_p ==
 * 'N/A' indica que OPS no está disponible/admisible -- el motor degrada a
 * evaluación de cobertura parcial usando solo CFG+DYN (R01/R02: la ausencia
 * de una fuente no se recodifica como valor favorable).
 */
function classify_3F(cfg_p, dyn_p, ops_p, cfg_t, dyn_t, ops_t, dyn_pers, dyn_det_run,
                      ops_pers, ops_det_run, cfg_imp_run, dyn_imp_run) {
  dyn_det_run = (dyn_det_run === undefined) ? 0 : dyn_det_run;
  ops_pers = (ops_pers === undefined) ? 'POINT' : ops_pers;
  ops_det_run = (ops_det_run === undefined) ? 0 : ops_det_run;
  cfg_imp_run = (cfg_imp_run === undefined) ? 0 : cfg_imp_run;
  dyn_imp_run = (dyn_imp_run === undefined) ? 0 : dyn_imp_run;

  var ops_missing = (ops_p === 'N/A');

  if (ops_missing) {
    if (cfg_p === 'F' && dyn_p === 'F') return 'REG_CONVERGENT (cobertura parcial)';
    if (cfg_p === 'D' && dyn_p === 'D') {
      if (E.predominant_improving([cfg_t, dyn_t])) return 'RECOVERY (cobertura parcial)';
      return 'DET_EMERGING (cobertura parcial, OPS no admisible)';
    }
    if (cfg_p === 'D' && dyn_p !== 'D') return 'TR_LATENT_COMPATIBLE (cobertura parcial)';
    if (cfg_p !== 'D' && dyn_p === 'D') return 'TR_DYNAMIC_ALTERATION (cobertura parcial)';
    if (cfg_p === 'I' && dyn_p === 'I') return 'TR_INTERMEDIATE_CONVERGENT (cobertura parcial)';
    return 'TR_UNEXPLAINED_DIVERGENCE (cobertura parcial)';
  }

  // --- OPS disponible: reglas R04-R11 simplificadas ---
  if (cfg_p === 'F' && dyn_p === 'F' && ops_p === 'F') return 'REG_CONVERGENT';

  // R06 — la recuperación recibe precedencia sobre una etiqueta estática de
  // deterioro cuando existe evidencia temporal suficiente (secc. 27).
  var _rec = classify_recovery_3F(cfg_p, dyn_p, ops_p, cfg_t, dyn_t, ops_t, cfg_imp_run, dyn_imp_run);
  if (_rec !== null) return _rec;

  if (cfg_p === 'D' && dyn_p === 'D' && ops_p === 'D') {
    if (E.predominant_improving([cfg_t, dyn_t, ops_t])) return 'RECOVERY (no subclasificada)';
    return 'DET_MANIFEST';
  }
  if (cfg_p === 'D' && dyn_p === 'D' && ops_p !== 'D' &&
      (dyn_pers === 'REPEATED' || dyn_pers === 'PERSISTENT' || dyn_det_run >= E.PERSIST_RUN_MIN)) {
    return 'DET_EMERGING';
  }
  if (cfg_p === 'D' && dyn_p !== 'D' && ops_p !== 'D') return 'TR_LATENT_COMPATIBLE';
  if (cfg_p !== 'D' && dyn_p === 'D' && ops_p !== 'D') return 'TR_DYNAMIC_ALTERATION';
  if (ops_p === 'D' && cfg_p !== 'D' && dyn_p !== 'D' &&
      (ops_pers === 'REPEATED' || ops_pers === 'PERSISTENT' || ops_det_run >= E.PERSIST_RUN_MIN)) {
    return 'DET_OPERATIONAL_UNCORROBORATED';
  }
  if (cfg_p === 'I' && dyn_p === 'I' && ops_p === 'I') return 'TR_INTERMEDIATE_CONVERGENT';
  return 'TR_UNEXPLAINED_DIVERGENCE';
}

/** Clasificación usando únicamente CFG+DYN. OPS nunca entra aquí. */
function classify_2F(cfg_p, dyn_p, cfg_t, dyn_t) {
  if (cfg_p === 'F' && dyn_p === 'F') return 'REG_CONVERGENT';
  if (cfg_p === 'D' && dyn_p === 'D') {
    if (E.predominant_improving([cfg_t, dyn_t])) return 'RECOVERY';
    return 'DET_CONVERGENT'; // 2F no distingue emergente/manifiesto sin OPS
  }
  if (cfg_p === 'D' && dyn_p !== 'D') return 'TR_LATENT_COMPATIBLE';
  if (cfg_p !== 'D' && dyn_p === 'D') return 'TR_DYNAMIC_ALTERATION';
  if (cfg_p === 'I' && dyn_p === 'I') return 'TR_INTERMEDIATE_CONVERGENT';
  return 'TR_UNEXPLAINED_DIVERGENCE';
}

module.exports = {
  classify_recovery_3F: classify_recovery_3F,
  classify_3F: classify_3F,
  classify_2F: classify_2F
};
