"""
Genera el fixture fijo de verificación cruzada para el port JS de
classify_2F/classify_3F (DISENO_PORT_CLASSIFY_2F_3F.md §8).

Corre UNA VEZ, con el RNG real de Python (statistical_simulation.py, SEED=11),
sobre los 13 escenarios de scenarios.py (84 filas) + las 900 series sintéticas
de statistical_simulation.py (19,800 filas) = 19,884 filas totales.

No reimplementa nada — importa las funciones reales de engine_core.py/
rules_2f_3f.py/statistical_simulation.py/scenarios.py y las corre tal cual.

Ejecutar: python3 gen_fixture_2f_3f.py
Salida: ../motor-aie/fixtures/fixture_2f_3f.json
"""

import json
import numpy as np

from engine_core import position, trajectory, persistence, trajectory_run, TRAJ_WINDOW, MDC
from rules_2f_3f import classify_3F, classify_2F
from scenarios import CASES
from statistical_simulation import gen_unit, SEED, N_UNITS, T as T_SIM


def _pendiente_cruda(series, t, window=TRAJ_WINDOW):
    """Replica EXACTA de la pendiente interna de trajectory() (engine_core.py:38-54),
    solo para exponerla en el fixture -- no modifica engine_core.py."""
    if t < window - 1:
        return None
    y = np.array(series[t - window + 1:t + 1], dtype=float)
    x = np.arange(window)
    slope = np.polyfit(x, y, 1)[0]
    return float(slope)


def _fila(source, t, cfg, dyn, ops):
    """ops puede ser lista con None (OPS ausente) o lista de floats."""
    cfg_p, dyn_p = position(cfg[t]), position(dyn[t])
    cfg_t, dyn_t = trajectory(cfg, t), trajectory(dyn, t)
    dyn_pers = persistence(dyn, t)
    dyn_det_run = trajectory_run(dyn, t, 'DETERIORATING')
    cfg_imp_run = trajectory_run(cfg, t, 'IMPROVING')
    dyn_imp_run = trajectory_run(dyn, t, 'IMPROVING')

    ops_present = ops[0] is not None
    if ops_present:
        ops_p, ops_t = position(ops[t]), trajectory(ops, t)
        ops_pers = persistence(ops, t)
        ops_det_run = trajectory_run(ops, t, 'DETERIORATING')
        ops_slope = _pendiente_cruda(ops, t)
        ops_val = float(ops[t])
    else:
        ops_p, ops_t = 'N/A', 'N/A'
        ops_pers, ops_det_run = 'POINT', 0
        ops_slope = None
        ops_val = None

    s3 = classify_3F(cfg_p, dyn_p, ops_p, cfg_t, dyn_t, ops_t, dyn_pers, dyn_det_run,
                      ops_pers, ops_det_run, cfg_imp_run, dyn_imp_run)
    s2 = classify_2F(cfg_p, dyn_p, cfg_t, dyn_t)

    return dict(
        source=source, t=t,
        CFG=float(cfg[t]), DYN=float(dyn[t]), OPS=ops_val,
        CFG_pos=cfg_p, DYN_pos=dyn_p, OPS_pos=ops_p,
        CFG_traj=cfg_t, DYN_traj=dyn_t, OPS_traj=ops_t,
        CFG_slope=_pendiente_cruda(cfg, t), DYN_slope=_pendiente_cruda(dyn, t), OPS_slope=ops_slope,
        DYN_pers=dyn_pers, DYN_detrun=dyn_det_run,
        OPS_pers=ops_pers, OPS_detrun=ops_det_run,
        CFG_imprun=cfg_imp_run, DYN_imprun=dyn_imp_run,
        AIE_3F=s3, AIE_2F=s2,
    )


def main():
    rows = []

    # 1. Los 13 escenarios de scenarios.py -- 84 filas, verificado por conteo real.
    for name, series in CASES.items():
        cfg, dyn, ops = series['CFG'], series['DYN'], series['OPS']
        for t in range(len(cfg)):
            rows.append(_fila('scenarios:' + name, t, cfg, dyn, ops))

    # 2. Las 900 series sintéticas de statistical_simulation.py -- mismo RNG,
    #    mismo SEED=11, misma secuencia de llamadas a gen_unit (no se reordena).
    rng = np.random.default_rng(SEED)
    units = [gen_unit(rng) for _ in range(N_UNITS)]
    for i, (cfg, dyn, ops) in enumerate(units):
        for t in range(T_SIM):
            rows.append(_fila('synthetic:unit' + str(i), t, cfg, dyn, ops))

    print('scenarios.py filas:', sum(len(v['CFG']) for v in CASES.values()))
    print('statistical_simulation.py filas:', N_UNITS * T_SIM)
    print('TOTAL filas generadas:', len(rows))
    assert len(rows) == 19884, 'conteo inesperado: ' + str(len(rows))

    out_path = '../motor-aie/fixtures/fixture_2f_3f.json'
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False)
    print('Escrito:', out_path)


if __name__ == '__main__':
    main()
