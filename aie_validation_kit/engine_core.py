"""
Funciones núcleo del motor AIE (Algoritmo Integrador EFICIENCIA).

Implementa, de forma simplificada pero fiel a la Especificación Técnica v1
pre-piloto, las propiedades que el motor calcula por fuente antes de
clasificar un estado: posición, trayectoria y persistencia.

IMPORTANTE — parámetros pre-piloto:
Los cortes y ventanas usados aquí (TH_FI, TH_ID, TRAJ_WINDOW, MDC,
PERSIST_WINDOW) son placeholders razonables para poder ejecutar pruebas de
estrés y comparar arquitecturas. NO son valores validados. La especificación
técnica los marca explícitamente como PENDIENTE_VALIDACION — deben
calibrarse con datos reales (piloto), no con este código.
"""

import numpy as np

# ---------- Parámetros pre-piloto (placeholders, NO validados) ----------
TH_FI = 33          # <=33 => favorable
TH_ID = 66          # >66 => deteriorado; entre medio => intermedio
TRAJ_WINDOW = 3      # observaciones usadas para estimar pendiente
MDC = 5.0            # cambio mínimo detectable (unidades de escala 0-100)
PERSIST_WINDOW = 3   # observaciones para considerar una posición "persistente"
PERSIST_RUN_MIN = 2   # períodos consecutivos DETERIORATING/IMPROVING para considerar
                      # una trayectoria "sostenida" (PENDIENTE_VALIDACION)


def position(x):
    """Clasifica un valor 0-100 en F (favorable) / I (intermedio) / D (deteriorado)."""
    if x <= TH_FI:
        return 'F'
    elif x <= TH_ID:
        return 'I'
    else:
        return 'D'


def trajectory(series, t, window=TRAJ_WINDOW, mdc=MDC):
    """
    Estima la trayectoria en el instante t usando la pendiente de una
    regresión lineal sobre la ventana [t-window+1, t].
    Devuelve IMPROVING / STABLE / DETERIORATING / INDETERMINATE.
    """
    if t < window - 1:
        return 'INDETERMINATE'
    y = np.array(series[t - window + 1:t + 1], dtype=float)
    x = np.arange(window)
    slope = np.polyfit(x, y, 1)[0]
    if slope > mdc / window:
        return 'DETERIORATING'
    elif slope < -mdc / window:
        return 'IMPROVING'
    else:
        return 'STABLE'


def persistence(series, t, window=PERSIST_WINDOW):
    """
    Mide si la posición categórica (F/I/D) se ha mantenido igual durante
    `window` observaciones consecutivas terminando en t.

    LIMITACIÓN CONOCIDA (ver hallazgo de la prueba de estrés, casos 3 y 11):
    esta definición categórica se resetea a POINT en el instante exacto en
    que una serie cruza de una categoría a otra, incluso si la magnitud
    lleva varios períodos moviéndose consistentemente en la misma dirección.
    Esto puede hacer que R07 (Deterioro emergente) pierda la señal justo en
    el momento de la transición. Antes de usar esto en producción, evaluar
    una definición basada en magnitud/pendiente sostenida en vez de
    persistencia categórica pura.
    """
    if t < window - 1:
        return 'POINT'
    cats = [position(series[t - i]) for i in range(window)]
    if len(set(cats)) == 1:
        return 'PERSISTENT'
    elif cats[0] == cats[1]:
        return 'REPEATED'
    else:
        return 'POINT'


def predominant_improving(trajs):
    """True si, entre las trayectorias dadas, predominan las que mejoran sobre las que empeoran."""
    imp = sum(1 for x in trajs if x == 'IMPROVING')
    det = sum(1 for x in trajs if x == 'DETERIORATING')
    return imp > det


def trajectory_run(series, t, direction, window=TRAJ_WINDOW, mdc=MDC):
    """
    Cuenta períodos consecutivos, terminando en t, en que trajectory() == direction
    ('DETERIORATING' o 'IMPROVING').

    Persistencia direccional basada en magnitud/pendiente sostenida, propuesta en
    la 2ª ronda de prueba de estrés como complemento a persistence() categórica:
    a diferencia de esta, NO se resetea en el instante en que la serie cruza de
    categoría, que es justo cuando R07 necesita la señal (casos 3 y 11).
    """
    run = 0
    i = t
    while i >= 0 and trajectory(series, i, window, mdc) == direction:
        run += 1
        i -= 1
    return run
