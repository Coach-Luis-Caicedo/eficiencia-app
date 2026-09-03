"""
Task 3 — simulación estadística con generadores alternativos.

Complementa a statistical_simulation.py (caso 12), cuyo DGP asume la cadena
causal CFG->DYN->OPS con retardos FIJOS. Aquí se construyen dos variantes:

  Generador A  — OPS INDEPENDIENTE de CFG/DYN:
       CFG->DYN se mantiene idéntico al original; se corta DYN->OPS.
       OPS pasa a tener proceso propio: AR(1) + evento de deterioro propio
       (FRAC_DET_OPS) + pulsos transitorios de 1 período (ruido KPI real).
       Objetivo: medir la tasa de falsos positivos de R11
       (DET_OPERATIONAL_UNCORROBORATED) CON y SIN el gate de persistencia
       de la Task 2 — el experimento que el arnés causal no pudo completar,
       porque en un DGP causal "OPS=D con CFG/DYN no-D" casi no ocurre.

  Generador B  — retardos VARIABLES por unidad:
       cadena causal intacta pero LAG_DYN ~ U{1,2,3} y LAG_OPS ~ U{2..5}
       distintos por unidad. Más realista que un único retardo global.

LIMITACIÓN CENTRAL (igual que en statistical_simulation.py): estos DGP siguen
siendo sintéticos. El generador A NO demuestra que OPS sea independiente en
organizaciones reales — construye el escenario contrafáctico para medir
cuánto se degrada AIE-3F SI esa independencia fuera el caso. Es la
contraparte necesaria del resultado favorable de §5, no una validación.

Ejecutar: python3 statistical_simulation_variants.py
"""

import numpy as np
import pandas as pd

from engine_core import (position, trajectory, persistence, trajectory_run,
                         predominant_improving, PERSIST_RUN_MIN)
from rules_2f_3f import classify_2F, classify_recovery_3F
from statistical_simulation import (SEED, N_UNITS, T, LAG_DYN, NOISE, OPS_AUTOCORR,
                                    FRAC_DETERIORATES, SHOCK_DETERIORA_RANGO,
                                    SHOCK_ESTABLE_RANGO, bootstrap_lift_diff)

# ---------- Parámetros propios del generador A ----------
FRAC_DET_OPS = 0.55        # réplica exacta de FRAC_DETERIORATES (calibración comparable)
PULSE_LAMBDA = 1.5         # media de pulsos transitorios por unidad (Poisson)
PULSE_MAG_RANGE = (30, 55) # magnitud del pulso (se suma a la salida, NO al estado AR(1))
MIN_PULSE_GAP = 3          # espaciado mínimo entre pulsos y respecto de ops_shock_t

DET3 = ('DET_MANIFEST', 'DET_EMERGING', 'DET_OPERATIONAL_UNCORROBORATED')


# ============================================================================
# Clasificador de 3 variantes (idéntico al usado en la verificación de Task 2)
# ============================================================================
def classify_3F_variant(cfg_p, dyn_p, ops_p, cfg_t, dyn_t, ops_t,
                        dyn_pers, dyn_det_run, ops_pers, ops_det_run,
                        r07_run: bool, r11_gate: bool,
                        cfg_imp_run=0, dyn_imp_run=0):
    if ops_p == 'N/A':
        return 'OPS_MISSING'
    if cfg_p == 'F' and dyn_p == 'F' and ops_p == 'F':
        return 'REG_CONVERGENT'
    _rec = classify_recovery_3F(cfg_p, dyn_p, ops_p, cfg_t, dyn_t, ops_t, cfg_imp_run, dyn_imp_run)
    if _rec is not None:
        return _rec
    if cfg_p == 'D' and dyn_p == 'D' and ops_p == 'D':
        if predominant_improving([cfg_t, dyn_t, ops_t]):
            return 'RECOVERY (no subclasificada)'
        return 'DET_MANIFEST'
    r07 = dyn_pers in ('REPEATED', 'PERSISTENT') or (r07_run and dyn_det_run >= PERSIST_RUN_MIN)
    if cfg_p == 'D' and dyn_p == 'D' and ops_p != 'D' and r07:
        return 'DET_EMERGING'
    if cfg_p == 'D' and dyn_p != 'D' and ops_p != 'D':
        return 'TR_LATENT_COMPATIBLE'
    if cfg_p != 'D' and dyn_p == 'D' and ops_p != 'D':
        return 'TR_DYNAMIC_ALTERATION'
    r11 = (not r11_gate) or ops_pers in ('REPEATED', 'PERSISTENT') or ops_det_run >= PERSIST_RUN_MIN
    if ops_p == 'D' and cfg_p != 'D' and dyn_p != 'D' and r11:
        return 'DET_OPERATIONAL_UNCORROBORATED'
    if cfg_p == 'I' and dyn_p == 'I' and ops_p == 'I':
        return 'TR_INTERMEDIATE_CONVERGENT'
    return 'TR_UNEXPLAINED_DIVERGENCE'


VARIANTS = [
    ('baseline', False, False),   # R07 solo categórica ; R11 sin gate
    ('R07',      True,  False),   # R07 categórica OR racha ; R11 sin gate
    ('R07+R11',  True,  True),    # simétrico (Task 1 + Task 2)
]


# ============================================================================
# Generación de CFG/DYN (idéntica al gen_unit original)
# ============================================================================
def _gen_cfg_dyn(rng, lag_dyn=LAG_DYN):
    cfg = np.zeros(T)
    dyn = np.zeros(T)
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
        src = max(0, t - lag_dyn)
        prev = dyn[t - 1] if t > 0 else cfg[0]
        dyn[t] = np.clip(0.72 * cfg[src] + 0.28 * prev + rng.normal(0, NOISE), 0, 100)
    return cfg, dyn


def _place_pulses(rng, k, forbid_t):
    """Coloca hasta k pulsos en [0,T) con separación >= MIN_PULSE_GAP entre sí
    y respecto de forbid_t (= ops_shock_t). Devuelve (lista, k_solicitado)."""
    if k <= 0:
        return [], k
    chosen = []
    for cand in rng.permutation(T):
        cand = int(cand)
        if abs(cand - forbid_t) < MIN_PULSE_GAP:
            continue
        if all(abs(cand - c) >= MIN_PULSE_GAP for c in chosen):
            chosen.append(cand)
            if len(chosen) == k:
                break
    return chosen, k


# ============================================================================
# Generador A — OPS independiente
# ============================================================================
def gen_unit_ops_indep(rng):
    cfg, dyn = _gen_cfg_dyn(rng)

    ops = np.zeros(T)
    ops_level = rng.uniform(15, 45)
    ops_deteriora = rng.random() < FRAC_DET_OPS
    ops_shock_t = int(rng.integers(4, T - 9))
    ops_shock_mag = (rng.uniform(*SHOCK_DETERIORA_RANGO) if ops_deteriora
                     else rng.uniform(*SHOCK_ESTABLE_RANGO))
    k_req = int(rng.poisson(PULSE_LAMBDA))
    pulse_t, k_req = _place_pulses(rng, k_req, ops_shock_t)
    pulse_set = set(pulse_t)
    pulse_mag = rng.uniform(*PULSE_MAG_RANGE)

    o = ops_level
    for t in range(T):
        target = ops_level + (ops_shock_mag if t >= ops_shock_t else 0)
        o = OPS_AUTOCORR * o + (1 - OPS_AUTOCORR) * target + rng.normal(0, NOISE)
        val = o + (pulse_mag if t in pulse_set else 0)   # pulso: solo salida, no estado
        ops[t] = np.clip(val, 0, 100)

    return dict(cfg=cfg, dyn=dyn, ops=ops, ops_deteriora=ops_deteriora,
               ops_shock_t=ops_shock_t, pulse_t=pulse_t, k_req=k_req)


# ============================================================================
# Generador B — retardos variables por unidad
# ============================================================================
def gen_unit_varlag(rng):
    lag_dyn = int(rng.integers(1, 4))   # 1..3
    lag_ops = int(rng.integers(2, 6))   # 2..5
    cfg, dyn = _gen_cfg_dyn(rng, lag_dyn=lag_dyn)
    ops = np.zeros(T)
    ops[0] = np.clip(dyn[0] + rng.normal(0, NOISE), 0, 100)
    for t in range(1, T):
        src = max(0, t - lag_ops)
        ops[t] = np.clip(
            OPS_AUTOCORR * ops[t - 1] + (1 - OPS_AUTOCORR) * (0.68 * dyn[src]) + rng.normal(0, NOISE),
            0, 100,
        )
    return dict(cfg=cfg, dyn=dyn, ops=ops, lag_dyn=lag_dyn, lag_ops=lag_ops)


# ============================================================================
# Diagnósticos de contaminación (Generador A)
# ============================================================================
def _runs_of_D(ops, lo, hi, run_len=3):
    """Índices de inicio s en [lo, hi) tales que ops[s..s+run_len-1] son todos D.
    Requiere s+run_len-1 <= T-1 (los últimos run_len-1 períodos quedan excluidos)."""
    pos = [position(v) == 'D' for v in ops]
    hits = []
    for s in range(max(lo, 0), min(hi, T - run_len + 1)):
        if all(pos[s + k] for k in range(run_len)):
            hits.append(s)
    return hits


def contamination_report(units):
    n_event = sum(1 for u in units if u['ops_deteriora'])
    n_noevent = sum(1 for u in units if not u['ops_deteriora'])

    # D1: en unidades CON evento, runs de 3-D realizadas FUERA de [shock_t, T-2)
    d1_units, d1_runs_out, d1_runs_total = 0, 0, 0
    for u in units:
        if not u['ops_deteriora']:
            continue
        runs_all = _runs_of_D(u['ops'], 0, T - 2)
        runs_out = [s for s in runs_all if s < u['ops_shock_t']]
        d1_runs_total += len(runs_all)
        d1_runs_out += len(runs_out)
        if runs_out:
            d1_units += 1

    # D2: en unidades SIN evento (verdad de terreno == 0 en todo t),
    #     ¿aparece alguna run de 3-D realizada?
    d2_units, d2_runs = 0, 0
    for u in units:
        if u['ops_deteriora']:
            continue
        runs_all = _runs_of_D(u['ops'], 0, T - 2)
        if runs_all:
            d2_units += 1
            d2_runs += len(runs_all)

    # D3: unidades con menos pulsos colocados de los solicitados (degradación silenciosa)
    d3_units = sum(1 for u in units if len(u['pulse_t']) < u['k_req'])
    # D3b: pulsos agrupados pese al filtro (debería ser imposible -> 0)
    d3b_units = 0
    for u in units:
        pt = sorted(u['pulse_t'])
        if any(pt[i + 1] - pt[i] < MIN_PULSE_GAP for i in range(len(pt) - 1)):
            d3b_units += 1
    mean_pulses = np.mean([len(u['pulse_t']) for u in units])
    mean_k_req = np.mean([u['k_req'] for u in units])

    print("=" * 100)
    print("DIAGNÓSTICOS DE CONTAMINACIÓN — Generador A")
    print("=" * 100)
    print(f"  Unidades: {len(units)}  |  con evento OPS propio (ops_deteriora): {n_event}"
          f"  |  sin evento: {n_noevent}")
    print(f"  Pulsos solicitados/unidad (media): {mean_k_req:.2f}   colocados (media): {mean_pulses:.2f}")
    print()
    print("  D1 — unidades CON evento: runs de 3-D realizadas ANTES de ops_shock_t")
    print(f"       unidades afectadas: {d1_units}/{n_event}"
          f"   |  runs fuera de ventana: {d1_runs_out} de {d1_runs_total} totales"
          f"  ({100*d1_runs_out/max(d1_runs_total,1):.1f}%)")
    print()
    print("  D2 — unidades SIN evento (verdad de terreno estructural = 0): runs de 3-D realizadas")
    print(f"       unidades con >=1 run: {d2_units}/{n_noevent}"
          f"   |  total de runs espurias: {d2_runs}")
    print(f"       NOTA: la verdad de terreno es ESTRUCTURAL (ops_deteriora), no la run realizada,")
    print(f"       así que estas runs NO crean TP falsos; R11 disparando ahí se cuenta como FP (correcto).")
    print(f"       Umbral de alarma: d2_units alto (>~2% de {n_noevent}) indicaría que el espaciado no basta.")
    print()
    print("  D3 — degradación silenciosa de _place_pulses")
    print(f"       unidades con menos pulsos de los solicitados: {d3_units}/{len(units)}")
    print(f"       unidades con pulsos agrupados pese al filtro: {d3b_units}/{len(units)} (debe ser 0)")
    print()
    return dict(d2_units=d2_units, d1_runs_out=d1_runs_out, d3_units=d3_units, d3b_units=d3b_units)


# ============================================================================
# Métrica R11: precisión / recall CON y SIN gate (Generador A)
# ============================================================================
def r11_precision_recall(units):
    rows = []
    for name, r07, r11 in [('baseline (R11 sin gate)', True, False),
                           ('R07+R11 (con gate)', True, True)]:
        TP = FP = FN = fires = 0
        gt_pos_total = 0
        for u in units:
            cfg, dyn, ops = u['cfg'], u['dyn'], u['ops']
            for t in range(3, T - 2):
                cfg_p, dyn_p, ops_p = position(cfg[t]), position(dyn[t]), position(ops[t])
                # jurisdicción de R11: CFG y DYN no deteriorados
                in_juris = (cfg_p != 'D' and dyn_p != 'D')
                gt = 1 if (u['ops_deteriora'] and t >= u['ops_shock_t'] and ops_p == 'D') else 0
                if in_juris and gt:
                    gt_pos_total += 1
                cfg_t, dyn_t, ops_t = trajectory(cfg, t), trajectory(dyn, t), trajectory(ops, t)
                dyn_pers = persistence(dyn, t); dyn_dr = trajectory_run(dyn, t, 'DETERIORATING')
                ops_pers = persistence(ops, t); ops_dr = trajectory_run(ops, t, 'DETERIORATING')
                cfg_ir = trajectory_run(cfg, t, 'IMPROVING'); dyn_ir = trajectory_run(dyn, t, 'IMPROVING')
                s3 = classify_3F_variant(cfg_p, dyn_p, ops_p, cfg_t, dyn_t, ops_t,
                                         dyn_pers, dyn_dr, ops_pers, ops_dr, r07, r11,
                                         cfg_ir, dyn_ir)
                fired = (s3 == 'DET_OPERATIONAL_UNCORROBORATED')
                if fired:
                    fires += 1
                    if gt:
                        TP += 1
                    else:
                        FP += 1
                elif in_juris and gt:
                    FN += 1
        prec = TP / (TP + FP) if (TP + FP) else float('nan')
        rec = TP / (TP + FN) if (TP + FN) else float('nan')
        # De los eventos reales sostenidos que tienen >=1 período ELEGIBLE
        # (en jurisdicción de R11 y con OPS=D), ¿cuántos reciben >=1 disparo de R11?
        ev_eligibles = ev_con_tp = 0
        for u in units:
            if not u['ops_deteriora']:
                continue
            cfg, dyn, ops = u['cfg'], u['dyn'], u['ops']
            eligible = got = False
            for t in range(3, T - 2):
                cfg_p, dyn_p, ops_p = position(cfg[t]), position(dyn[t]), position(ops[t])
                if not (cfg_p != 'D' and dyn_p != 'D'):
                    continue
                if not (t >= u['ops_shock_t'] and ops_p == 'D'):
                    continue
                eligible = True
                cfg_t, dyn_t, ops_t = trajectory(cfg, t), trajectory(dyn, t), trajectory(ops, t)
                dyn_pers = persistence(dyn, t); dyn_dr = trajectory_run(dyn, t, 'DETERIORATING')
                ops_pers = persistence(ops, t); ops_dr = trajectory_run(ops, t, 'DETERIORATING')
                cfg_ir = trajectory_run(cfg, t, 'IMPROVING'); dyn_ir = trajectory_run(dyn, t, 'IMPROVING')
                if classify_3F_variant(cfg_p, dyn_p, ops_p, cfg_t, dyn_t, ops_t,
                                       dyn_pers, dyn_dr, ops_pers, ops_dr, r07, r11,
                                       cfg_ir, dyn_ir) == 'DET_OPERATIONAL_UNCORROBORATED':
                    got = True
            if eligible:
                ev_eligibles += 1
                if got:
                    ev_con_tp += 1
        rows.append((name, fires, TP, FP, FN, prec, rec, ev_con_tp, ev_eligibles))

    print("=" * 100)
    print("R11 — precisión / recall, Generador A (OPS independiente), jurisdicción cfg_p!=D & dyn_p!=D")
    print("=" * 100)
    print(f"  {'variante':<26} {'disparos':>9} {'TP':>6} {'FP':>6} {'FN':>6} {'precisión':>10} {'recall':>8}  {'eventos con >=1 TP':>20}")
    for name, fires, TP, FP, FN, prec, rec, ev_tp, ev_tot in rows:
        print(f"  {name:<26} {fires:>9} {TP:>6} {FP:>6} {FN:>6} {prec:>10.3f} {rec:>8.3f}  {ev_tp:>10}/{ev_tot:<9}")
    print()


# ============================================================================
# Lift predictivo 2F/3F — subconjunto de alerta temprana
# ============================================================================
def lift_table(units, label):
    print("=" * 100)
    print(f"LIFT PREDICTIVO 2F/3F — {label}")
    print("=" * 100)
    for name, r07, r11 in VARIANTS:
        recs = []
        for u_idx, u in enumerate(units):
            cfg, dyn, ops = u['cfg'], u['dyn'], u['ops']
            for t in range(4, T - 7):
                cfg_p, dyn_p, ops_p = position(cfg[t]), position(dyn[t]), position(ops[t])
                cfg_t, dyn_t, ops_t = trajectory(cfg, t), trajectory(dyn, t), trajectory(ops, t)
                dyn_pers = persistence(dyn, t); dyn_dr = trajectory_run(dyn, t, 'DETERIORATING')
                ops_pers = persistence(ops, t); ops_dr = trajectory_run(ops, t, 'DETERIORATING')
                cfg_ir = trajectory_run(cfg, t, 'IMPROVING'); dyn_ir = trajectory_run(dyn, t, 'IMPROVING')
                s3 = classify_3F_variant(cfg_p, dyn_p, ops_p, cfg_t, dyn_t, ops_t,
                                         dyn_pers, dyn_dr, ops_pers, ops_dr, r07, r11,
                                         cfg_ir, dyn_ir)
                s2 = classify_2F(cfg_p, dyn_p, cfg_t, dyn_t)
                det3 = 1 if s3 in DET3 else 0
                det2 = 1 if s2 == 'DET_CONVERGENT' else 0
                for tau in (3, 5):
                    if t + tau < T:
                        recs.append(dict(unit=u_idx, tau=tau, OPS_t_D=1 if ops_p == 'D' else 0,
                                         state3_det=det3, state2_det=det2,
                                         future_ops_D=1 if position(ops[t + tau]) == 'D' else 0))
        df = pd.DataFrame(recs)
        for tau in (3, 5):
            early = df[(df.tau == tau) & (df.OPS_t_D == 0)]
            marg = early.future_ops_D.mean()
            n2, n3 = int(early.state2_det.sum()), int(early.state3_det.sum())
            p2 = early[early.state2_det == 1].future_ops_D.mean() if n2 else float('nan')
            p3 = early[early.state3_det == 1].future_ops_D.mean() if n3 else float('nan')
            d = bootstrap_lift_diff(early, n_boot=2000, seed=tau)
            lo, hi = np.percentile(d, [2.5, 97.5]) if len(d) else (float('nan'), float('nan'))
            print(f"  [{name:<8}] tau={tau}  marg={marg:.3f} | "
                  f"2F n={n2:4d} lift={p2-marg:+.3f} | 3F n={n3:4d} lift={p3-marg:+.3f} | "
                  f"diff(3F-2F) media={d.mean():+.3f} IC95%=[{lo:+.3f},{hi:+.3f}]")
    print()


def main():
    rng_a = np.random.default_rng(SEED)
    units_a = [gen_unit_ops_indep(rng_a) for _ in range(N_UNITS)]
    all_ops_a = np.concatenate([u['ops'] for u in units_a])
    all_cfg_a = np.concatenate([u['cfg'] for u in units_a])
    print(f"Generador A — calibración: CFG en D = {(all_cfg_a > 66).mean()*100:.1f}%   "
          f"OPS en D = {(all_ops_a > 66).mean()*100:.1f}%\n")

    contamination_report(units_a)
    r11_precision_recall(units_a)
    lift_table(units_a, "Generador A (OPS independiente)")

    rng_b = np.random.default_rng(SEED)
    units_b = [gen_unit_varlag(rng_b) for _ in range(N_UNITS)]
    all_ops_b = np.concatenate([u['ops'] for u in units_b])
    print(f"Generador B — calibración: OPS en D = {(all_ops_b > 66).mean()*100:.1f}%   "
          f"lag_dyn medio = {np.mean([u['lag_dyn'] for u in units_b]):.2f}   "
          f"lag_ops medio = {np.mean([u['lag_ops'] for u in units_b]):.2f}\n")
    lift_table(units_b, "Generador B (retardos variables)")


if __name__ == '__main__':
    main()
