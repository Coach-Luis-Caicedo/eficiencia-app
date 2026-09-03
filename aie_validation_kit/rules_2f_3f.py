"""
Dos variantes del motor de reglas AIE, implementadas para comparación:

  AIE-3F : usa las tres familias (CFG=IAO, DYN=IDA, OPS=IDO/KPI) de forma
           simétrica en la determinación del estado, tal como está redactada
           hoy la Especificación Técnica v1 (reglas R04-R11).

  AIE-2F : usa únicamente CFG+DYN para determinar el estado; OPS/IDO queda
           fuera de la clasificación y solo puede usarse después, como
           corroboración externa (Arquitectura B del RIE).

Esta es una implementación SIMPLIFICADA para pruebas de estrés, no la
especificación completa. En particular:

  - No implementa la familia RECOVERY (REC_INCIPIENT / REC_EMERGING /
    REC_OPERATIONAL_LAG / REC_ADVANCED) con todo el detalle de R06 — solo
    una versión mínima dentro de la rama de convergencia. Ver hallazgo del
    caso 6 en el documento de resultados: esto produjo una clasificación
    poco informativa (TR_UNEXPLAINED_DIVERGENCE) en un escenario de
    recuperación con rezago operativo que la especificación completa sí
    debería reconocer como REC_OPERATIONAL_LAG.
  - No implementa modificadores (POLARIZATION, NODE_CONCENTRATION, etc.).
  - No implementa el nivel epistemológico (SIGNAL/HYPOTHESIS/...) como
    campo separado — se puede inferir del nombre del estado.

Sirve como punto de partida para que Claude Code construya la
implementación completa, no como versión final.
"""

from engine_core import (position, trajectory, persistence, predominant_improving,
                         trajectory_run, PERSIST_RUN_MIN)


def classify_recovery_3F(cfg_p, dyn_p, ops_p, cfg_t, dyn_t, ops_t, cfg_imp_run, dyn_imp_run):
    """
    Familia R06 (Recuperación) — Especificación Técnica v1, sección 27.
    Implementa LITERALMENTE las 4 subfamilias. Operacionalización de términos
    cuyo criterio exacto la spec deja PENDIENTE_VALIDACION:
      "improving"               -> trajectory == 'IMPROVING'
      "improving persistently"  -> trajectory_run(IMPROVING) >= PERSIST_RUN_MIN
      "mostly deteriorated"     -> >= 2 de 3 posiciones == 'D'
      "no longer deteriorated"  -> posición in {'F','I'}
      "compatible with lag"     -> trajectory(OPS) != 'DETERIORATING'
    Precedencia interna (NO especificada en secc. 27 — decisión documentada):
      OPERATIONAL_LAG antes que ADVANCED — si OPS sigue en 'D', la recuperación
      no es "avanzada" aunque OPS ya mejore de trayectoria.
    Devuelve etiqueta REC_* o None (None deja seguir al resto del motor).
    """
    not_det = [p in ('F', 'I') for p in (cfg_p, dyn_p, ops_p)]
    n_not_det, n_det = sum(not_det), 3 - sum(not_det)
    cfg_imp, dyn_imp, ops_imp = (cfg_t == 'IMPROVING'), (dyn_t == 'IMPROVING'), (ops_t == 'IMPROVING')

    # REC_OPERATIONAL_LAG: CFG y DYN favorable/intermedio y mejorando; OPS sigue
    #   deteriorado; trayectoria OPS mejora o compatible con rezago (no empeora).
    if (cfg_p in ('F', 'I') and cfg_imp and dyn_p in ('F', 'I') and dyn_imp
            and ops_p == 'D' and ops_t != 'DETERIORATING'):
        return 'REC_OPERATIONAL_LAG'
    # REC_ADVANCED: las tres mejoran y al menos dos ya no están deterioradas.
    if cfg_imp and dyn_imp and ops_imp and n_not_det >= 2:
        return 'REC_ADVANCED'
    # REC_EMERGING: CFG mejora y DYN mejora y OPS aún deteriorado/estable.
    if cfg_imp and dyn_imp and (ops_p == 'D' or ops_t == 'STABLE'):
        return 'REC_EMERGING'
    # REC_INCIPIENT: niveles actuales mayormente deteriorados y al menos un plano
    #   upstream (CFG o DYN) mejora de forma persistente.
    if n_det >= 2 and (cfg_imp_run >= PERSIST_RUN_MIN or dyn_imp_run >= PERSIST_RUN_MIN):
        return 'REC_INCIPIENT'
    return None


def classify_3F(cfg_p, dyn_p, ops_p, cfg_t, dyn_t, ops_t, dyn_pers, dyn_det_run=0,
                ops_pers='POINT', ops_det_run=0, cfg_imp_run=0, dyn_imp_run=0):
    """
    Clasificación con las tres familias (CFG+DYN+OPS) simétricas.
    ops_p == 'N/A' indica que OPS no está disponible/admisible; en ese caso
    el motor degrada a una evaluación de cobertura parcial usando solo
    CFG+DYN, dejándolo explícito en el nombre del estado (regla R01/R02:
    la ausencia de una fuente no se recodifica como valor favorable).
    """
    ops_missing = (ops_p == 'N/A')

    if ops_missing:
        if cfg_p == 'F' and dyn_p == 'F':
            return 'REG_CONVERGENT (cobertura parcial)'
        if cfg_p == 'D' and dyn_p == 'D':
            if predominant_improving([cfg_t, dyn_t]):
                return 'RECOVERY (cobertura parcial)'
            return 'DET_EMERGING (cobertura parcial, OPS no admisible)'
        if cfg_p == 'D' and dyn_p != 'D':
            return 'TR_LATENT_COMPATIBLE (cobertura parcial)'
        if cfg_p != 'D' and dyn_p == 'D':
            return 'TR_DYNAMIC_ALTERATION (cobertura parcial)'
        if cfg_p == 'I' and dyn_p == 'I':
            return 'TR_INTERMEDIATE_CONVERGENT (cobertura parcial)'
        return 'TR_UNEXPLAINED_DIVERGENCE (cobertura parcial)'

    # --- OPS disponible: reglas R04-R11 simplificadas ---
    if cfg_p == 'F' and dyn_p == 'F' and ops_p == 'F':
        return 'REG_CONVERGENT'
    # R06 — la recuperación recibe precedencia sobre una etiqueta estática de
    # deterioro cuando existe evidencia temporal suficiente (secc. 27).
    _rec = classify_recovery_3F(cfg_p, dyn_p, ops_p, cfg_t, dyn_t, ops_t, cfg_imp_run, dyn_imp_run)
    if _rec is not None:
        return _rec
    if cfg_p == 'D' and dyn_p == 'D' and ops_p == 'D':
        if predominant_improving([cfg_t, dyn_t, ops_t]):
            return 'RECOVERY (no subclasificada)'   # red de seguridad: mejora sin racha suficiente
        return 'DET_MANIFEST'
    if cfg_p == 'D' and dyn_p == 'D' and ops_p != 'D' and (
            dyn_pers in ('REPEATED', 'PERSISTENT') or dyn_det_run >= PERSIST_RUN_MIN):
        return 'DET_EMERGING'
    if cfg_p == 'D' and dyn_p != 'D' and ops_p != 'D':
        return 'TR_LATENT_COMPATIBLE'
    if cfg_p != 'D' and dyn_p == 'D' and ops_p != 'D':
        return 'TR_DYNAMIC_ALTERATION'
    if ops_p == 'D' and cfg_p != 'D' and dyn_p != 'D' and (
            ops_pers in ('REPEATED', 'PERSISTENT') or ops_det_run >= PERSIST_RUN_MIN):
        return 'DET_OPERATIONAL_UNCORROBORATED'
    if cfg_p == 'I' and dyn_p == 'I' and ops_p == 'I':
        return 'TR_INTERMEDIATE_CONVERGENT'
    return 'TR_UNEXPLAINED_DIVERGENCE'


def classify_2F(cfg_p, dyn_p, cfg_t, dyn_t):
    """Clasificación usando únicamente CFG+DYN. OPS nunca entra aquí."""
    if cfg_p == 'F' and dyn_p == 'F':
        return 'REG_CONVERGENT'
    if cfg_p == 'D' and dyn_p == 'D':
        if predominant_improving([cfg_t, dyn_t]):
            return 'RECOVERY'
        return 'DET_CONVERGENT'  # 2F no distingue emergente/manifiesto sin OPS
    if cfg_p == 'D' and dyn_p != 'D':
        return 'TR_LATENT_COMPATIBLE'
    if cfg_p != 'D' and dyn_p == 'D':
        return 'TR_DYNAMIC_ALTERATION'
    if cfg_p == 'I' and dyn_p == 'I':
        return 'TR_INTERMEDIATE_CONVERGENT'
    return 'TR_UNEXPLAINED_DIVERGENCE'


def run_case(cfg, dyn, ops):
    """
    Corre una serie temporal completa (listas de igual longitud) por ambos
    motores. `ops` puede ser una lista de None si la fuente no está
    disponible en ningún período (ver caso 8 del documento de hallazgos).
    """
    T = len(cfg)
    rows = []
    ops_present = ops[0] is not None
    for t in range(T):
        cfg_p, dyn_p = position(cfg[t]), position(dyn[t])
        cfg_t, dyn_t = trajectory(cfg, t), trajectory(dyn, t)
        dyn_pers = persistence(dyn, t)
        dyn_det_run = trajectory_run(dyn, t, 'DETERIORATING')
        cfg_imp_run = trajectory_run(cfg, t, 'IMPROVING')
        dyn_imp_run = trajectory_run(dyn, t, 'IMPROVING')
        if ops_present:
            ops_p, ops_t = position(ops[t]), trajectory(ops, t)
            ops_pers = persistence(ops, t)
            ops_det_run = trajectory_run(ops, t, 'DETERIORATING')
        else:
            ops_p, ops_t = 'N/A', 'N/A'
            ops_pers, ops_det_run = 'POINT', 0
        s3 = classify_3F(cfg_p, dyn_p, ops_p, cfg_t, dyn_t, ops_t, dyn_pers, dyn_det_run,
                         ops_pers, ops_det_run, cfg_imp_run, dyn_imp_run)
        s2 = classify_2F(cfg_p, dyn_p, cfg_t, dyn_t)
        rows.append(dict(
            t=t, CFG=cfg[t], DYN=dyn[t], OPS=(ops[t] if ops_present else None),
            CFG_pos=cfg_p, DYN_pos=dyn_p, OPS_pos=ops_p,
            CFG_traj=cfg_t, DYN_traj=dyn_t, OPS_traj=ops_t,
            DYN_pers=dyn_pers, DYN_detrun=dyn_det_run,
            OPS_pers=ops_pers, OPS_detrun=ops_det_run,
            CFG_imprun=cfg_imp_run, DYN_imprun=dyn_imp_run, AIE_3F=s3, AIE_2F=s2,
        ))
    return rows
