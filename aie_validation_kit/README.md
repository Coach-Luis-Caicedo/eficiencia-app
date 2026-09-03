# Kit de validación AIE-2F vs AIE-3F

Código de apoyo para `HALLAZGOS_PRUEBA_ESTRES_AIE.md`. No es la
implementación de producción del Algoritmo Integrador EFICIENCIA — es un
motor simplificado construido específicamente para comparar dos
arquitecturas candidatas antes de decidir cuál (o qué corrección de ambas)
pasa a la especificación técnica formal.

## Archivos

- `engine_core.py` — funciones de posición, trayectoria y persistencia.
  Contiene, documentada inline, la limitación de persistencia categórica
  que causó el bug encontrado en los casos 3 y 11.
- `rules_2f_3f.py` — las dos variantes del motor de reglas:
  - `classify_3F`: usa CFG+DYN+OPS simétricamente (como está redactada hoy
    la Especificación Técnica v1, reglas R04-R11).
  - `classify_2F`: usa solo CFG+DYN; OPS queda fuera del estado.
- `scenarios.py` — los doce escenarios sintéticos de la prueba de estrés
  cualitativa. `python3 scenarios.py` imprime la tabla completa de cada uno.
- `statistical_simulation.py` — la simulación de 900 unidades con proceso
  generador conocido (caso 12), con intervalo de confianza por bootstrap
  sobre la diferencia de valor predictivo incremental entre 3F y 2F.
  `python3 statistical_simulation.py` corre el panel completo.

## Qué NO es este código

- No implementa la familia `RECOVERY` completa (`R06`) — ver limitación
  documentada en `rules_2f_3f.py` y el hallazgo del caso 6.
- No implementa modificadores (`POLARIZATION`, `NODE_CONCENTRATION`, etc.)
  ni el campo `epistemic_level` como estructura separada.
- No usa datos reales — el generador de `statistical_simulation.py` asume
  una cadena causal CFG→DYN→OPS que todavía no está validada
  empíricamente. El resultado confirma consistencia lógica del diseño, no
  su validez frente a organizaciones reales.

## Requisitos

Python 3, `numpy`, `pandas`. Sin dependencias adicionales.

```bash
pip install numpy pandas --break-system-packages   # si hace falta
python3 scenarios.py
python3 statistical_simulation.py
```
