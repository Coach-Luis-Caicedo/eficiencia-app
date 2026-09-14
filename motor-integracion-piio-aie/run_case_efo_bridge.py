"""
run_case_efo_bridge.py -- puente para EFO. A diferencia de
run_case_bridge.py (usado por las otras 2 ramas), este NO llama
rules_2f_3f.run_case() -- llama classify_3F/classify_2F DIRECTAMENTE,
porque run_case() calcula position()/trajectory()/persistence() de OPS a
partir de un numero crudo, y EFO_STATE nunca tiene un numero crudo (ya
llega clasificado por motor-piio). Ver DISENO_ARNES_PIIO_AIE.md seccion 2
para la verificacion completa (incluido un hallazgo real: run_case()
decide "OPS presente?" con un solo chequeo global sobre ops[0], y con
disponibilidad mixta por periodo o truena o descarta senal en silencio).

Lee un JSON {cfg, dyn, ops} por stdin:
  cfg, dyn: arrays de numeros (mismo contrato que run_case_bridge.py)
  ops: array de {p, t, pers, det_run} YA categoricos, uno por periodo,
       mismo largo que cfg/dyn (p ya viene traducido 'N_A'->'N/A' desde
       el lado JS -- ver pipeline.js:traducirOpsP)

Escribe el resultado como JSON por stdout, una fila por periodo, mismo
formato que run_case() (mismas claves) para que los tests puedan
comparar contra el mismo tipo de fila que las otras 2 ramas.

Fuente unica de verdad: NO se reimplementa ninguna regla. Se importan
position/trajectory/persistence/trajectory_run de engine_core.py y
classify_3F/classify_2F de rules_2f_3f.py, sin modificar ninguno.
"""

import sys
import os
import json

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'aie_validation_kit'))

from engine_core import position, trajectory, persistence, trajectory_run  # noqa: E402
from rules_2f_3f import classify_3F, classify_2F  # noqa: E402


def main():
    data = json.load(sys.stdin)
    cfg = data['cfg']
    dyn = data['dyn']
    ops = data['ops']

    T = len(cfg)
    if len(dyn) != T or len(ops) != T:
        raise ValueError('run_case_efo_bridge: cfg/dyn/ops deben tener el mismo largo (%d/%d/%d)' % (T, len(dyn), len(ops)))

    rows = []
    for t in range(T):
        cfg_p, dyn_p = position(cfg[t]), position(dyn[t])
        cfg_t, dyn_t = trajectory(cfg, t), trajectory(dyn, t)
        dyn_pers = persistence(dyn, t)
        dyn_det_run = trajectory_run(dyn, t, 'DETERIORATING')
        cfg_imp_run = trajectory_run(cfg, t, 'IMPROVING')
        dyn_imp_run = trajectory_run(dyn, t, 'IMPROVING')

        ops_row = ops[t]
        ops_p, ops_t = ops_row['p'], ops_row['t']
        ops_pers, ops_det_run = ops_row['pers'], ops_row['det_run']

        s3 = classify_3F(cfg_p, dyn_p, ops_p, cfg_t, dyn_t, ops_t, dyn_pers, dyn_det_run,
                          ops_pers, ops_det_run, cfg_imp_run, dyn_imp_run)
        s2 = classify_2F(cfg_p, dyn_p, cfg_t, dyn_t)

        rows.append(dict(
            t=t, CFG=cfg[t], DYN=dyn[t],
            CFG_pos=cfg_p, DYN_pos=dyn_p, OPS_pos=ops_p,
            CFG_traj=cfg_t, DYN_traj=dyn_t, OPS_traj=ops_t,
            DYN_pers=dyn_pers, DYN_detrun=dyn_det_run,
            OPS_pers=ops_pers, OPS_detrun=ops_det_run,
            CFG_imprun=cfg_imp_run, DYN_imprun=dyn_imp_run,
            AIE_3F=s3, AIE_2F=s2,
        ))

    json.dump(rows, sys.stdout)


if __name__ == '__main__':
    main()
