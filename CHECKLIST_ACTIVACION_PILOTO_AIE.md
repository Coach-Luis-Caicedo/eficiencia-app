# Checklist de activación — piloto de validación AIE-2F vs. AIE-3F

Fecha: 2026-09-12. Responde a lo que `DOCUMENTO_TECNICO_AIE_v1.md` §13.4 deja
como intención sin criterio ("repetir la batería... en cuanto existan datos
reales o cuasi-reales") — sin un número y una definición concretos, ese
"cuando haya datos" no tiene forma de reconocerse si la oportunidad
apareciera. Este documento no es una investigación de literatura (no es de
la familia `INVESTIGACION_*.md`): es un documento de diseño/protocolo, y
el número central (`N` mínimo) sale de correr el propio motor de
simulación ya construido, no de una fuente externa citable.

**Qué es esto y qué NO es:** un criterio verificable de activación — no una
promesa de que el piloto confirmará la cadena causal, no un rediseño del
AIE, no una recalibración de los umbrales `PENDIENTE_VALIDACION` del motor.

---

## 1. `N` mínimo de unidades — calculado, no estimado

### Método

Se usó `statistical_simulation.py` tal cual (mismo generador de datos DGP,
mismas funciones `position`/`trajectory`/`persistence`/`trajectory_run` de
`engine_core.py`, mismo `classify_3F`/`classify_2F` de `rules_2f_3f.py`, mismo
protocolo de bootstrap de 2000 remuestreos) — sin modificar ninguna de esas
piezas. Se escribió `aie_validation_kit/power_analysis_N_min.py`, que
**importa** (no reimplementa) `gen_unit` y reutiliza el mismo criterio de
"ventaja no distinguible de ruido" (IC95% del bootstrap de `lift_3F -
lift_2F` cruza cero) que ya usa el script original. Se varió `N_UNITS` desde
900 hacia abajo, con 15 semillas por punto en un barrido grueso (`n_boot=500`)
y 30 semillas en la confirmación fina (`n_boot=2000`) alrededor del punto de
quiebre. **Ejecutado de verdad — 27m10s de cómputo real, no estimado.**

### Resultado exacto

| N unidades | % semillas con IC excluye cero, τ=3 | % semillas con IC excluye cero, τ=5 |
|---:|---:|---:|
| 900 | 100.0% | 100.0% |
| 600 | 100.0% | 100.0% |
| 450 | 100.0% | 93.3% |
| 300 | 100.0% | 80.0% (83.3% en confirmación fina, 30 semillas) |
| 200 | 93.3% | 60.0% |
| 150 | 86.7% | 60.0% |
| 100 | 80.0% | 33.3% |
| 75 | 60.0% | 46.7% |
| 50 | 40.0% | 26.7% |
| 30 | 13.3% | 26.7% |
| ≤20 | ≤6.7% | ≤13.3% |

**El punto de quiebre real es N≈450** (menor `N` con ≥90% de semillas
confirmando en ambos horizontes τ=3 y τ=5, confirmado en la corrida fina de
30 semillas con `n_boot=2000`). τ=5 es sistemáticamente el eslabón más frágil
— a N=300 ya cae a 80-83%, mientras τ=3 se mantiene en 100% hasta N=200. Si
solo importa el horizonte corto (τ=3), N≈150-200 ya da ≥85-93%; si se exige
el horizonte largo (τ=5) con la misma confianza, N≈450 es el número real.

### Dos advertencias honestas sobre este número (no maquillarlas)

1. **Este `N` es "unidades del generador sintético" (series independientes
   en `statistical_simulation.py`), no "N de organizaciones reales"
   directamente.** Cada "unidad" en el DGP es una serie temporal
   independiente de `CFG`/`DYN`/`OPS` con su propio choque/tendencia — no
   está resuelto todavía si una unidad real equivale a una organización
   completa, un nodo/área dentro de una organización, o algo más granular.
   Esa traducción depende de cómo se diseñe el piloto (¿se mide una serie
   por organización, o una por área/nodo dentro de cada organización
   participante?) y **no la resuelve este documento** — queda como pregunta
   de diseño del piloto, no como dato ya decidido.
2. **Este `N` asume T=22 períodos por unidad**, igual que
   `statistical_simulation.py`. La potencia no viene solo de `N` — viene de
   `N × T` (cada unidad aporta ~11 observaciones repetidas por τ, tras la
   ventana de arranque). Si un dataset real tiene menos de ~22 períodos de
   historia por unidad, el `N` de unidades necesario para el mismo poder
   sería mayor que 450 — este documento no corrió ese barrido adicional
   (variar T a la vez que N) porque el pedido original era sobre N. Si el
   panel real disponible tiene T sustancialmente menor a 22, hay que
   recalcular antes de decidir que "ya hay suficiente".

---

## 2. Proxies observables para `CFG`/`DYN`/`EFO` — qué existe y qué falta

`DOCUMENTO_TECNICO_AIE_v1.md` §2 ya define la correspondencia:
`CFG`=IAO (motor-iao, síntesis de ICE-IEH), `DYN`=IDA (motor-sdmo),
`EFO`=`EFO_STATE` (motor-piio). Verificado con lectura directa de los tres
módulos — **no los tres están al mismo nivel de completitud**:

| Familia | Motor | Score bruto por administración | Ensamblado longitudinal (serie por período) | Clasificación posición/trayectoria/persistencia |
|---|---|---|---|---|
| `EFO` | motor-piio | Sí (`EFO_STATE`) | **Sí — completo** (`runPIIOCompleto`, cascada §29) | **Sí — completo**, con los campos ya en la forma que necesita el AIE (§2 del documento técnico ya da el mapeo campo a campo) |
| `DYN` | motor-sdmo | Sí (`calcularIDA`) | Sí (`calcularSerieIDA`) | **Sí, ya escrito** — `categoria()`, `trayectoria()`, `persistenciaCategorica()`, `rachaTrayectoria()`, `clasificarSenal()` (motor-sdmo.js:338-474), arquitectura idéntica en espíritu a `engine_core.py`. Umbrales (`umbralFavorable`, `umbralDeteriorado`, etc.) están en `null` — **falta calibrar números, no falta código** |
| `CFG` | motor-iao | Sí (`calcularIAO`) | **No existe** | **No existe** — verificado con `grep -ri "trayectoria\|persistenc\|categoria\|racha"` sobre todo `motor-iao/` (código y tests): cero resultados |

**Conclusión honesta:** no es cierto que "los tres motores ya bastan, solo
falta el dato". Es más preciso así: **dos de los tres (DYN, EFO) ya bastan
en código**, solo falta el dato real y (para DYN) calibrar números que ya
tienen su lugar reservado. **El tercero (CFG/motor-iao) tiene un vacío de
ingeniería real** — no existe ninguna función que tome una serie de `IAO`
por período y produzca posición/trayectoria/persistencia. Construirla no es
un problema de diseño nuevo (motor-sdmo ya escribió exactamente ese patrón
para IDA, línea por línea) — es trabajo de implementación pendiente,
del mismo tamaño que ya se hizo una vez para DYN.

---

## 3. ¿El protocolo 2F/3F pre-registrado se aplica tal cual sobre datos reales?

**Mayormente sí, verificado por reutilización directa de código (no
reimplementación) — con una excepción concreta encontrada.**

`power_analysis_N_min.py` (sección 1 de este documento) importó y ejecutó
`gen_unit`, `position`, `trajectory`, `persistence`, `trajectory_run`,
`classify_3F`, `classify_2F` sin modificar ninguna — es la prueba más directa
posible de que el protocolo corre igual sobre cualquier entrada con la misma
forma (series `[float]` de longitud `T`, valores en `[0,100]`).

**Excepción real encontrada al comparar el vocabulario categórico de
`rules_2f_3f.py` contra los enums reales de PIIO (`motor-piio/enums.js`):**

- `classify_3F` decide si `OPS` está ausente con `ops_missing = (ops_p ==
  'N/A')` (con diagonal).
- El enum real de PIIO es `POSITION: ['F', 'I', 'D', 'N_A']` (con guion
  bajo) — y `N_A` **no es un caso hipotético**: es un valor de primera clase
  que `phenomenon.js` produce explícitamente cuando no hay evidencia
  utilizable (`INV-PIIO-24`, §28), verificado en producción
  (`phenomenon.js:139,145,254`, etc.).
- Si se conecta `EFO_STATE.pos` de PIIO directamente a `classify_3F` sin
  ajustar esto, `'N_A' == 'N/A'` es `False` en Python — el motor **no**
  entraría a la rama de "cobertura parcial" (§ R01/R02: ausencia de fuente
  no se recodifica como favorable) y en su lugar trataría `N_A` como una
  categoría de posición más, cayendo probablemente en
  `TR_UNEXPLAINED_DIVERGENCE` o en una rama incorrecta — un fallo silencioso
  de clasificación, no un error que se note solo.

**Qué implica esto para "sin rediseño":** es correcto decir que el núcleo
del protocolo (DGP, clasificador, bootstrap) no necesita rediseño — pero es
falso decir que se puede conectar dato real de PIIO sin tocar una línea.
Hace falta un ajuste pequeño y localizado (alinear el sentinela de
"OPS no disponible" a `'N_A'`, y revisar el mismo punto para el sentinela de
trayectoria insuficiente — `engine_core.py` usa `'INDETERMINATE'`, PIIO usa
`'N_A'` también en `TRAYECTORY`, aunque este segundo caso es más benigno
porque las comparaciones de trayectoria en `classify_3F`/`classify_2F` son
por desigualdad, no por el sentinela exacto). Este ajuste no está hecho en
este documento — queda registrado como el primer paso de ingeniería real
cuando se decida avanzar, no como parte de la investigación.

---

## 4. Checklist de activación — condición verificable de cierre

Esto deja de estar "en espera, sin criterio" y pasa a "listo para
ejecutarse" cuando **todo** lo siguiente sea cierto para al menos un
conjunto de datos real o cuasi-real disponible:

- [ ] Existe una fuente de `CFG` (IAO o proxy equivalente), `DYN` (IDA) y
  `EFO` (`EFO_STATE`/KPI) longitudinal, con **T ≥ 22 períodos** por unidad
  (o, si T es menor, se recalculó el `N` mínimo correspondiente — no se usa
  N=450 a ciegas con T menor).
- [ ] El número de unidades disponibles (definiendo explícitamente qué es
  una "unidad" para ese piloto — organización completa, nodo, área) es
  **≥450** si se necesita poder confiable a τ=5, o **≥150-200** si solo
  importa τ=3.
- [ ] La brecha de ingeniería de la sección 2 (clasificación
  posición/trayectoria/persistencia para `CFG` vía motor-iao) está resuelta
  — construida siguiendo el patrón ya existente en motor-sdmo.
- [ ] El ajuste de vocabulario de la sección 3 (`'N/A'` → `'N_A'`, y revisión
  del sentinela de trayectoria) está aplicado y probado contra al menos un
  caso real de `EFO_STATE.pos === 'N_A'`.
- [ ] Los datos de calibración y de validación están separados (§11 del
  documento técnico: un parámetro estimado con un subconjunto no se valida
  con el mismo subconjunto) — condición ya exigida por el documento técnico,
  repetida aquí porque aplica directamente a este piloto.

Cuando las cinco casillas estén marcadas con evidencia (no con intención),
`motor-aie` deja de estar "en espera" y pasa a "piloto ejecutable" en
[`ESTADO_PRIORIDADES_EFICIENCIA.md`](ESTADO_PRIORIDADES_EFICIENCIA.md).

No se tocó ningún código de producción en este documento — `power_analysis_N_min.py`
queda en `aie_validation_kit/` como script de investigación reproducible, no
como pieza de un motor.
