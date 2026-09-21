/**
 * motor-aie/runCase.js
 *
 * Ensamblador de producción para motor-aie -- reemplaza a ejecutarAIE()
 * de los harnesses motor-integracion-{iao,sdmo,piio}-aie, que invocaba
 * rules_2f_3f.run_case() del PYTHON real vía `cp.spawnSync('python3', ...)`
 * (ver DISENO_WORKER_EJECUCION_MOTORES.md §5). Cloudflare Workers no
 * soporta subprocesos -- este archivo es el puerto JS puro de esa misma
 * función, usando ÚNICAMENTE engine_core.js/rules_2f_3f.js (ya portados y
 * verificados, DISENO_PORT_CLASSIFY_2F_3F.md).
 *
 * Puerto 1:1 de aie_validation_kit/rules_2f_3f.py:141-175 (run_case) --
 * verificado línea por línea contra el Python real antes de escribirlo,
 * y verificado por ejecución contra el fixture de 19 884 filas en
 * aie.test.js (misma batería que ya protege engine_core.js/rules_2f_3f.js,
 * no un archivo de prueba nuevo desconectado).
 *
 * Sin cambios de comportamiento respecto al Python -- 18 campos de salida
 * por fila, mismo orden de llamadas, misma rama ops-ausente (position/
 * trajectory 'N/A', persistence 'POINT', trajectory_run 0).
 */

'use strict';

var E = require('./engine_core');
var R = require('./rules_2f_3f');

/**
 * runCase(cfg, dyn, ops) -> Array<Object>
 *
 * @param {number[]} cfg  Serie CFG completa (una posición por período).
 * @param {number[]} dyn  Serie DYN completa, misma longitud que cfg.
 * @param {Array<number|null>} ops  Serie OPS completa, misma longitud --
 *   `ops[0] == null` se interpreta como "OPS no disponible en ningún
 *   período" (mismo criterio que `ops_present = ops[0] is not None` en
 *   el Python real, rules_2f_3f.py:149).
 * @returns {Array<Object>} una fila por período, 18 campos cada una:
 *   t, CFG, DYN, OPS, CFG_pos, DYN_pos, OPS_pos, CFG_traj, DYN_traj,
 *   OPS_traj, DYN_pers, DYN_detrun, OPS_pers, OPS_detrun, CFG_imprun,
 *   DYN_imprun, AIE_3F, AIE_2F.
 */
function runCase(cfg, dyn, ops) {
  var T = cfg.length;
  var rows = [];
  var opsPresent = ops[0] !== null && ops[0] !== undefined;

  for (var t = 0; t < T; t++) {
    var cfg_p = E.position(cfg[t]), dyn_p = E.position(dyn[t]);
    var cfg_t = E.trajectory(cfg, t), dyn_t = E.trajectory(dyn, t);
    var dyn_pers = E.persistence(dyn, t);
    var dyn_det_run = E.trajectory_run(dyn, t, 'DETERIORATING');
    var cfg_imp_run = E.trajectory_run(cfg, t, 'IMPROVING');
    var dyn_imp_run = E.trajectory_run(dyn, t, 'IMPROVING');

    var ops_p, ops_t, ops_pers, ops_det_run;
    if (opsPresent) {
      ops_p = E.position(ops[t]);
      ops_t = E.trajectory(ops, t);
      ops_pers = E.persistence(ops, t);
      ops_det_run = E.trajectory_run(ops, t, 'DETERIORATING');
    } else {
      ops_p = 'N/A'; ops_t = 'N/A'; ops_pers = 'POINT'; ops_det_run = 0;
    }

    var s3 = R.classify_3F(cfg_p, dyn_p, ops_p, cfg_t, dyn_t, ops_t,
      dyn_pers, dyn_det_run, ops_pers, ops_det_run, cfg_imp_run, dyn_imp_run);
    var s2 = R.classify_2F(cfg_p, dyn_p, cfg_t, dyn_t);

    rows.push({
      t: t, CFG: cfg[t], DYN: dyn[t], OPS: opsPresent ? ops[t] : null,
      CFG_pos: cfg_p, DYN_pos: dyn_p, OPS_pos: ops_p,
      CFG_traj: cfg_t, DYN_traj: dyn_t, OPS_traj: ops_t,
      DYN_pers: dyn_pers, DYN_detrun: dyn_det_run,
      OPS_pers: ops_pers, OPS_detrun: ops_det_run,
      CFG_imprun: cfg_imp_run, DYN_imprun: dyn_imp_run,
      AIE_3F: s3, AIE_2F: s2
    });
  }
  return rows;
}

module.exports = { runCase: runCase };
