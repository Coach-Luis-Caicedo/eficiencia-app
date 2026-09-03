"""
Caso 12 — simulación estadística: valor predictivo incremental de AIE-3F vs
AIE-2F, controlando por autocorrelación pura de OPS.

Genera un panel sintético de N_UNITS unidades organizacionales x T períodos,
con un proceso generador de datos (DGP) donde CFG afecta a DYN con retardo,
DYN afecta a OPS con retardo, y OPS tiene además autocorrelación propia.

LIMITACIÓN CENTRAL A NO OLVIDAR (ver documento de hallazgos, sección 4):
este DGP fue construido asumiendo que la cadena causal CFG->DYN->OPS es
real. El resultado de esta simulación confirma que, SI esa cadena causal
existe, la arquitectura de 3 familias la explota correctamente y mejor que
la de 2 familias. NO demuestra que esa cadena causal exista en
organizaciones reales — eso es exactamente lo que debe determinar el
piloto con datos reales, no una simulación sintética con la misma
estructura que la regla que se está probando.

Ejecutar: python3 statistical_simulation.py
Tarda unos segundos (900 unidades x 22 períodos + 2000 remuestreos bootstrap
por horizonte).
"""

import numpy as np
import pandas as pd
from engine_core import position, trajectory, persistence, trajectory_run
from rules_2f_3f import classify_3F, classify_2F

# ---------- Parámetros del generador (ajustables para pruebas adicionales) ----------
SEED = 11
N_UNITS = 900
T = 22
LAG_DYN = 2          # períodos de retardo CFG -> DYN
LAG_OPS = 3          # períodos de retardo DYN -> OPS
NOISE = 6
OPS_AUTOCORR = 0.55  # peso del propio pasado de OPS (autocorrelación pura)
FRAC_DETERIORATES = 0.55
SHOCK_DETERIORA_RANGO = (45, 75)
SHOCK_ESTABLE_RANGO = (-15, 15)


def gen_unit(rng):
    cfg = np.zeros(T)
    dyn = np.zeros(T)
    ops = np.zeros(T)
    level = rng.uniform(15, 45)
    deteriorates = rng.random() < FRAC_DETERIORATES
    shock_t = rng.integers(4, T - 9)
    shock_mag = rng.uniform(*SHOCK_DETERIORA_RANGO) if deteriorates else rng.uniform(*SHOCK_ESTABLE_RANGO)

    c = level
    for t in range(T):
        c = c + rng.normal(0, 2.0)
        if t == shock_t:
            c += shock_mag
        cfg[t] = np.clip(c, 0, 100)

    for t in range(T):
        src = max(0, t - LAG_DYN)
        prev = dyn[t - 1] if t > 0 else cfg[0]
        dyn[t] = np.clip(0.72 * cfg[src] + 0.28 * prev + rng.normal(0, NOISE), 0, 100)

    ops[0] = np.clip(dyn[0] + rng.normal(0, NOISE), 0, 100)
    for t in range(1, T):
        src = max(0, t - LAG_OPS)
        ops[t] = np.clip(
            OPS_AUTOCORR * ops[t - 1] + (1 - OPS_AUTOCORR) * (0.68 * dyn[src]) + rng.normal(0, NOISE),
            0, 100,
        )
    return cfg, dyn, ops


def bootstrap_lift_diff(sub, n_boot=2000, seed=1):
    rng = np.random.default_rng(seed)
    units_in_sub = sub['unit'].unique()
    diffs = []
    for _ in range(n_boot):
        sample_units = rng.choice(units_in_sub, size=len(units_in_sub), replace=True)
        boot = sub[sub['unit'].isin(sample_units)]
        if boot.state2_det.sum() == 0 or boot.state3_det.sum() == 0:
            continue
        marg = boot.future_ops_D.mean()
        lift2 = boot[boot.state2_det == 1].future_ops_D.mean() - marg
        lift3 = boot[boot.state3_det == 1].future_ops_D.mean() - marg
        diffs.append(lift3 - lift2)
    return np.array(diffs)


def main():
    rng = np.random.default_rng(SEED)
    units = [gen_unit(rng) for _ in range(N_UNITS)]

    all_ops = np.concatenate([o for _, _, o in units])
    all_cfg = np.concatenate([c for c, _, _ in units])
    print(f"Calibración del generador: CFG en D = {(all_cfg > 66).mean()*100:.1f}%   "
          f"OPS en D = {(all_ops > 66).mean()*100:.1f}%")
    print("(si OPS en D es <1%, subir SHOCK_DETERIORA_RANGO o bajar NOISE antes de interpretar resultados)\n")

    records = []
    for u_idx, (cfg, dyn, ops) in enumerate(units):
        for t in range(4, T - 7):
            cfg_p, dyn_p, ops_p = position(cfg[t]), position(dyn[t]), position(ops[t])
            cfg_t, dyn_t, ops_t = trajectory(cfg, t), trajectory(dyn, t), trajectory(ops, t)
            dyn_pers = persistence(dyn, t)
            dyn_det_run = trajectory_run(dyn, t, 'DETERIORATING')
            ops_pers = persistence(ops, t)
            ops_det_run = trajectory_run(ops, t, 'DETERIORATING')
            cfg_imp_run = trajectory_run(cfg, t, 'IMPROVING')
            dyn_imp_run = trajectory_run(dyn, t, 'IMPROVING')
            s3 = classify_3F(cfg_p, dyn_p, ops_p, cfg_t, dyn_t, ops_t, dyn_pers,
                             dyn_det_run, ops_pers, ops_det_run, cfg_imp_run, dyn_imp_run)
            s2 = classify_2F(cfg_p, dyn_p, cfg_t, dyn_t)
            det3 = 1 if s3 in ('DET_MANIFEST', 'DET_EMERGING', 'DET_OPERATIONAL_UNCORROBORATED') else 0
            det2 = 1 if s2 == 'DET_CONVERGENT' else 0
            for tau in [3, 5]:
                if t + tau < T:
                    fut = 1 if position(ops[t + tau]) == 'D' else 0
                    records.append(dict(
                        unit=u_idx, t=t, tau=tau, OPS_t_D=1 if ops_p == 'D' else 0,
                        state3_det=det3, state2_det=det2, future_ops_D=fut,
                    ))

    df = pd.DataFrame(records)

    for tau in [3, 5]:
        sub_full = df[df.tau == tau]
        early = sub_full[sub_full.OPS_t_D == 0]  # subconjunto de "alerta temprana" real
        print("=" * 100)
        print(f"tau={tau}  |  subconjunto de alerta temprana (OPS_t aún NO deteriorado): n={len(early)}")
        print("=" * 100)
        marg = early.future_ops_D.mean()
        n2, n3 = early.state2_det.sum(), early.state3_det.sum()
        p2 = early[early.state2_det == 1].future_ops_D.mean() if n2 > 0 else float('nan')
        p3 = early[early.state3_det == 1].future_ops_D.mean() if n3 > 0 else float('nan')
        print(f"  Marginal:                        P = {marg:.3f}")
        print(f"  2F declara deterioro (n={n2:4d}):  P(OPS futuro=D) = {p2:.3f}   lift = {p2-marg:+.3f}")
        print(f"  3F declara deterioro (n={n3:4d}):  P(OPS futuro=D) = {p3:.3f}   lift = {p3-marg:+.3f}")

        diffs = bootstrap_lift_diff(early, n_boot=2000, seed=tau)
        lo, hi = np.percentile(diffs, [2.5, 97.5])
        print(f"\n  Bootstrap (lift_3F - lift_2F), 2000 remuestreos por unidad:")
        print(f"    media = {diffs.mean():+.3f}   IC95% = [{lo:+.3f}, {hi:+.3f}]")
        if lo > 0:
            print("    -> 3F muestra ventaja incremental que NO cruza cero (en ESTE generador sintético)")
        elif hi < 0:
            print("    -> 2F muestra ventaja incremental que NO cruza cero (en ESTE generador sintético)")
        else:
            print("    -> el intervalo cruza cero: diferencia no distinguible de ruido con esta muestra")
        print()


if __name__ == '__main__':
    main()
