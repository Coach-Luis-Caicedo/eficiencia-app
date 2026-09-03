"""
Doce escenarios sintéticos de prueba de estrés para comparar AIE-2F vs AIE-3F.

Ejecutar: python3 scenarios.py

Cada escenario está diseñado para forzar una diferencia específica entre las
dos arquitecturas. Ver HALLAZGOS_PRUEBA_ESTRES_AIE.md para la interpretación
completa de cada resultado.
"""

import pandas as pd
from rules_2f_3f import run_case

pd.set_option('display.width', 160)
pd.set_option('display.max_columns', 20)

CASES = {}

# 1. Trivial: todo favorable y estable — ambas arquitecturas deben coincidir.
CASES['1_trivial_favorable'] = dict(
    CFG=[20, 20, 21, 20, 19, 20],
    DYN=[22, 21, 20, 21, 20, 19],
    OPS=[18, 19, 20, 19, 20, 20],
)

# 2. Deterioro convergente estable, sin trayectoria de mejora.
CASES['2_deterioro_estable'] = dict(
    CFG=[75, 76, 74, 75, 76, 75],
    DYN=[72, 73, 74, 73, 74, 75],
    OPS=[70, 71, 72, 73, 72, 73],
)

# 3. Propagación CFG -> DYN -> OPS con retardo (revela el bug de persistencia).
CASES['3_propagacion_retardo'] = dict(
    CFG=[75, 76, 75, 74, 75, 76],
    DYN=[40, 45, 55, 65, 72, 74],
    OPS=[30, 32, 35, 45, 58, 70],
)

# 4. D-F-F persistente: distinguir Latente de Compensación (ninguno decide sin más contexto).
CASES['4_persistente_DFF'] = dict(
    CFG=[75, 76, 74, 75, 76, 74, 75, 76],
    DYN=[25, 24, 26, 25, 24, 26, 25, 24],
    OPS=[20, 22, 21, 20, 22, 21, 20, 22],
)

# 5. OPS se mueve solo y luego se corrige (anomalía operativa aislada).
CASES['5_OPS_aislado_corrige'] = dict(
    CFG=[20, 21, 20, 19, 20, 21],
    DYN=[22, 21, 20, 21, 22, 20],
    OPS=[20, 70, 72, 68, 25, 20],
)

# 6. Rezago operativo tras recuperación de CFG/DYN.
CASES['6_rezago_recuperacion'] = dict(
    CFG=[75, 60, 45, 30, 22, 20],
    DYN=[70, 55, 40, 28, 22, 20],
    OPS=[70, 68, 65, 60, 55, 45],
)

# 6b. Rezago operativo REAL: OPS se mantiene deteriorado (>66) mientras CFG/DYN
#     ya se recuperaron — ejercita REC_OPERATIONAL_LAG (secc. 27). Añadido en la
#     2ª ronda: el caso 6 original no ilustra rezago real porque OPS sale de D
#     al mismo tiempo que CFG/DYN (produce REC_ADVANCED, no REC_OPERATIONAL_LAG).
CASES['6b_rezago_operativo_real'] = dict(
    CFG=[75, 60, 45, 30, 22, 20],
    DYN=[70, 55, 40, 28, 22, 20],
    OPS=[78, 77, 75, 73, 70, 68],
)

# 7. OPS ruidoso sin patrón, CFG/DYN estables favorables (prueba de estabilidad).
CASES['7_OPS_ruidoso'] = dict(
    CFG=[20, 21, 19, 20, 21, 20, 19, 20],
    DYN=[22, 20, 21, 22, 20, 21, 20, 22],
    OPS=[20, 70, 25, 68, 22, 72, 24, 69],
)

# 8. OPS ausente/no admisible en todos los períodos, CFG/DYN deteriorándose.
CASES['8_OPS_ausente'] = dict(
    CFG=[40, 50, 60, 70, 75, 78],
    DYN=[35, 45, 58, 66, 72, 75],
    OPS=[None, None, None, None, None, None],
)

# 9. Evento externo simulado: caída de OPS sin corroboración en CFG/DYN.
CASES['9_evento_externo'] = dict(
    CFG=[20, 21, 20, 19, 20, 21],
    DYN=[22, 21, 20, 21, 22, 20],
    OPS=[22, 24, 75, 74, 73, 72],
)

# 10a/10b. Dos nodos con CFG/DYN idénticos, OPS opuesto (polarización espuria).
CASES['10a_nodoA'] = dict(
    CFG=[50, 51, 50, 49, 50, 51],
    DYN=[48, 49, 50, 49, 48, 50],
    OPS=[20, 22, 21, 20, 22, 21],
)
CASES['10b_nodoB'] = dict(
    CFG=[50, 51, 50, 49, 50, 51],
    DYN=[48, 49, 50, 49, 48, 50],
    OPS=[78, 79, 80, 77, 79, 80],
)

# 11. Serie larga con deterioro lento y retardos distintos por familia.
CASES['11_serie_larga_retardos'] = dict(
    CFG=[30, 38, 47, 55, 62, 68, 72, 74],
    DYN=[28, 30, 35, 42, 50, 58, 65, 70],
    OPS=[26, 27, 28, 30, 34, 40, 48, 58],
)

if __name__ == '__main__':
    for name, series in CASES.items():
        rows = run_case(series['CFG'], series['DYN'], series['OPS'])
        df = pd.DataFrame(rows)
        print("=" * 100)
        print(name)
        cols = ['t', 'CFG', 'DYN', 'OPS', 'CFG_pos', 'DYN_pos', 'OPS_pos',
                'CFG_traj', 'DYN_traj', 'OPS_traj', 'CFG_imprun', 'DYN_imprun',
                'DYN_pers', 'DYN_detrun', 'OPS_pers', 'OPS_detrun', 'AIE_3F', 'AIE_2F']
        print(df[cols].to_string(index=False))
