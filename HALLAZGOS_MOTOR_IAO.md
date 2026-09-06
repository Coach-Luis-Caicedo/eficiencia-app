# Hallazgos — validación estadística de `motor-iao`

Complementa `motor-iao/README.md`. Documenta una simulación ejecutada y
verificada por código sobre dos preguntas abiertas del módulo:

- **Q1** — ¿`dispersionEntreNodos` distingue de forma confiable la polarización
  real de brechas del ruido interno de un nodo, o el caso de mano fue casualidad?
- **Q2** — ¿la regla de compuerta de `PRECISIÓN` produce una clasificación
  sensata, o degenera?

Código de apoyo: `motor-iao/sim/` (`generador.js`, `sim.js`). Todos los números
de este documento salen de `node motor-iao/sim/sim.js`. Datos 100 % sintéticos
con parámetros conocidos; la simulación drivea `motor-iao.js` directamente, no
una reimplementación. No usa la investigación de benchmarks de CFF: esto es sobre
la mecánica estadística interna, no sobre magnitudes económicas.

**Umbrales de prueba** (todos `PENDIENTE_VALIDACION`): `N_min=5`, `N_alto=30`,
`tasa_min=0.3`, `tasa_alta=0.7` (dados por Luis) y `corte_dispersion_media=12`,
`corte_dispersion_alta=25` sobre la escala IAO 0–100 (**placeholders de la
simulación — Luis no los fijó**). `umbralPolarizacion` de prueba: 20 (entre
nodos), 25 (pool).

**Correcciones aplicadas tras esta validación** (revisión de Luis, 2026-09-03):
`dispersionEntreNodosAjustada` (descomposición de varianza) implementada — el
veredicto `polarizacion.entreNodos` se evalúa contra ella; la cruda se mantiene
visible. Corte de dispersión "media" añadido a la compuerta de PRECISIÓN (§3.9
prevé baja/media/alta). Los números de abajo son de la corrida que motivó ambas.

---

## Q1 — `dispersionEntreNodos` vs. ruido interno

Generador: `n` nodos, brecha objetivo `B_EF` por nodo, cada Persona con
`B_EF ~ Normal(mu_nodo, ruido_interno)`. `magnitud_polarizacion_real` = std de
las medias de nodo; `magnitud_ruido_interno` = std de los individuos dentro del
nodo. Se varían de forma independiente.

### Q1.1 — polarización real = 0, ruido interno alto (600 reps por fila)

| ruido interno | `dispersionEntreNodos` cruda (media, p95) | **ajustada** (media, p95) | `dispersionPool` media |
|---|---|---|---|
| 5  | 0.84 (p95 1.3) | **0.17 (p95 0.9)** | 4.98 |
| 15 | 2.53 (p95 4.0) | **0.51 (p95 2.7)** | 14.94 |
| 30 | 5.05 (p95 8.0) | **1.01 (p95 5.4)** | 29.85 |

**Hallazgo H1 — la versión CRUDA tiene un piso de ruido; la AJUSTADA lo elimina.**
Con polarización real nula, `dispersionEntreNodos` cruda `≈ ruido / √(personas_por_nodo)`
(25 por nodo → `ruido/5` ≈ 5.05 con ruido 30) — es el error de muestreo de cada
media de nodo. La **`dispersionEntreNodosAjustada`** (resta `mean_g(s²_g / n_g)` de
la varianza entre nodos) lo baja a **0.17 / 0.51 / 1.01** — ~80% del piso
eliminado. `dispersionPool` rastrea el ruido casi 1:1 (por diseño — mezcla
within + between). **El veredicto `polarizacion.entreNodos` se evalúa contra la
ajustada**; la cruda queda visible por transparencia.

### Q1.2 — polarización real creciente, ruido interno bajo (=5), 400 reps

| `polarizacion_real` | `dispersionEntreNodos` cruda, media |
|---|---|
| 0  | 0.87 |
| 5  | 4.47 |
| 10 | 8.81 |
| 20 | 17.57 |
| 30 | 26.33 |
| 40 | 34.76 |

Ajuste: `dispersionEntreNodos` cruda `≈ 0.47 + 0.857 · polarizacion_real` (R² = 0.9996).

**Hallazgo H2 — sesgo a la baja del ~14 %, y el ajuste NO lo corrige.** La
pendiente es 0.857, no 1.0. `dispersionEntreNodos` es la desviación estándar
*poblacional* de solo 6 medias de nodo; con tan pocos grupos, ese estimador
subestima la SD verdadera. Este sesgo es **distinto del piso de ruido de H1**: la
descomposición de varianza (`dispersionEntreNodosAjustada`) elimina el piso pero
deja el sesgo de magnitud casi intacto — en la regresión de grid (Q1.3) el
coeficiente sobre `polarizacion_real` sube solo de 0.803 (cruda) a 0.858
(ajustada), es decir ~14 % de subestimación residual. Es consistente (R² casi
perfecto) y sería corregible con un factor de sesgo sobre el número de nodos,
**que no se implementó** — decisión de calibración de `umbralPolarizacionEntreNodos`,
no de código. `dispersionEntreNodosAjustada` no debe leerse como una medida
insesgada de la *magnitud* de polarización cuando hay pocos nodos; sí como una
medida cuya contaminación por ruido interno es ≈ 0.

### Q1.3 — ambos parámetros variados de forma independiente (grid 4×4 × 250 reps)

Cada celda: `dispersionEntreNodosAjustada` media — debe responder a
`polarizacion_real`, no a `ruido_interno`.

| `pol_real` \ `ruido` | 0 | 10 | 20 | 30 |
|---|---|---|---|---|
| 0  | 0.0 | 0.4 | 0.8 | 1.2 |
| 10 | 8.8 | 8.7 | 8.4 | 7.9 |
| 20 | 17.6 | 17.6 | 17.4 | 17.1 |
| 30 | 26.4 | 26.4 | 26.2 | 25.7 |

Regresión sobre las ~4 000 corridas:

```
dispersionEntreNodos (cruda)   ~ 1 + pol_real + ruido_interno
   intercepto 1.14   coef pol_real 0.803   coef ruido_interno  0.0588
dispersionEntreNodosAjustada   ~ 1 + pol_real + ruido_interno
   intercepto 0.42   coef pol_real 0.858   coef ruido_interno −0.0082
dispersionPool                 ~ 1 + pol_real + ruido_interno
   intercepto 3.66   coef pol_real 0.573   coef ruido_interno  0.6893
```

**Hallazgo H3 — `dispersionEntreNodos` SÍ aísla la señal; el Escenario B no fue
casualidad — con la fórmula exacta del factor de aislamiento.**

| métrica | coef. `ruido_interno` | lectura |
|---|---|---|
| `dispersionPool` | 0.6893 | rastrea el ruido casi 1:1 |
| `dispersionEntreNodos` cruda | 0.0588 | contaminación residual = el piso de H1 |
| `dispersionEntreNodosAjustada` | −0.0082 | ≈ 0 — sin contaminación medible |

- **Factor de aislamiento de la métrica cruda** =
  `coefRuido(pool) / coefRuido(entreNodos_cruda)` = `0.6893 / 0.0588` = **11.73×**.
  Este es el número exacto detrás del "~12×" que se venía citando.
- **Ventaja señal-ruido** =
  `[coefPol/coefRuido]_entreNodos_cruda / [coefPol/coefRuido]_pool` =
  `(0.803 / 0.0588) / (0.573 / 0.6893)` = `13.66 / 0.83` = **16.42×**.
- **La métrica ajustada** lleva `coefRuido` a −0.0082 (estadísticamente
  indistinguible de 0): la contaminación por ruido interno queda esencialmente
  eliminada, no solo reducida ~12×.

La distinción entre las dos métricas está estadísticamente justificada, no es
cosmética. El residuo de 0.0588 de la cruda **no es cero** y es exactamente el
piso de H1 —propiedad inherente de estimar varianza entre-grupos con muestras
finitas—; `dispersionEntreNodosAjustada` lo cierra, la cruda se mantiene visible
por transparencia (§3.11).

### Q1.4 — nodo pequeño sub-umbral con polarización real (400 reps)

3 nodos grandes (n=30, `mu ≈ 0`) + 1 nodo chico (n=6, `mu = +80`), `minReportableN = 8`.
El nodo de 6 queda fuera de `porNodo` (§3.11) pero sus 6 Personas sí entran al pool.

| métrica | media | detección del foco |
|---|---|---|
| `dispersionEntreNodos` | 0.68 (p95 1.33) | **invisible en el 100 %** de las corridas (< 10) |
| `dispersionPool` | 19.99 (p05 19.12) | **captado en el 100 %** de las corridas (> 15) |

**Hallazgo H4 — el diseño de dos métricas es necesario, no redundante.** Un foco
de polarización que vive en un nodo sub-umbral es **sistemáticamente** invisible a
`dispersionEntreNodos` y **consistentemente** capturado por `dispersionPool`.

La invisibilidad a `dispersionEntreNodos` es una **certeza estructural, no un
resultado probabilístico**: el nodo sub-umbral queda fuera de `perfilPorNodo` por
la regla de `minReportableN` (§3.11), así que su media nunca entra en el cálculo
de `dispersionEntreNodos`. El 100 % / 100 % de la tabla no es "la simulación no
encontró contraejemplos" — es que no puede haber contraejemplo mientras la regla
de reportabilidad siga excluyendo ese nodo. `dispersionPool`, que sí incluye a
esas Personas en el pool anónimo, lo capta con la misma certeza estructural.

Ninguna de las dos métricas por sí sola es suficiente: `dispersionEntreNodos` para
fracturas entre unidades reportables, `dispersionPool` como red de seguridad para
focos concentrados sub-umbral.

### Recomendación de Q1 — IMPLEMENTADA (revisión de Luis, 2026-09-03)

H1 tiene una corrección estándar: descomposición de varianza de efectos
aleatorios —

```
dispersionEntreNodosAjustada² = max(0,  s²_entre_nodos  −  mean_g( s²_g / n_g ) )
```

— donde `mean_g(s²_g / n_g)` es el promedio, sobre los nodos reportables, de la
varianza interna del nodo dividida por su tamaño (el piso de error de muestreo).
Se implementó como **campo nuevo** en `perfilPorNodo` de `agregarOrganizacion` y
en cada entrada de `brechasOrg`; los campos crudos (`dispersionEntreNodos`) se
mantienen visibles. **El veredicto `polarizacion.entreNodos` se evalúa contra la
ajustada.** Efecto medido (Q1.3): `coef ruido_interno` pasa de 0.0588 a −0.0082.

H2 (sesgo de magnitud ~14 %) **no** queda corregido por esto — requeriría un
factor de sesgo sobre el conteo de nodos, que se deja como decisión de calibración
de `umbralPolarizacionEntreNodos`, no de código.

---

## Q2 — regla de compuerta de `PRECISIÓN`

`clasificarPrecision` no evalúa un organismo generado: toma
`{n, convocados, disenoMuestral, dispersionPoolIao}` y se barre ese espacio.

### Q2.1 — la distribución no colapsa (8 000 combinaciones aleatorias)

| | uniforme sobre los 4 diseños | condicionado a diseño ∈ {CENSO, ALEATORIO} |
|---|---|---|
| ALTA  | 1.8 % | 4.5 % |
| MEDIA | 16.4 % | 34.1 % |
| BAJA  | 81.8 % | 61.4 % |

**Hallazgo H5 — la distribución no degenera, pero está dominada por la compuerta
de `diseño_muestral`.** Con inputs uniformemente aleatorios, `CONVENIENCIA` y
`UNKNOWN` (mitad de los diseños) fuerzan `BAJA` sin importar los otros tres
factores → 82 % `BAJA`. Condicionando a un diseño conocido, la distribución se
abre (4.5 / 34 / 61 %). **Consecuencia:** en producción, `diseño_muestral` debe
capturarse de forma confiable; si llega `UNKNOWN` por defecto, `PRECISIÓN` leerá
`BAJA` en la mayoría de los casos con independencia de la calidad real de los
datos. Es el comportamiento especificado ("no se asume lo favorable sin
evidencia"), pero su peso práctico es alto.

### Q2.2 — comportamiento en los bordes

| eje (resto en zona ALTA) | transición observada |
|---|---|
| `N`: 4 → 5 | `BAJA → MEDIA` (un paso) |
| `N`: 29 → 30 | `MEDIA → ALTA` (un paso) |
| `tasa`: 0.29 → 0.30 | `BAJA → MEDIA` (un paso) |
| `tasa`: 0.69 → 0.70 | `MEDIA → ALTA` (un paso) |
| `dispersión`: 24 → 25 | `MEDIA → BAJA` (un paso — con el corte "media" ya añadido) |
| `diseño`: ALEATORIO → CONVENIENCIA | **`ALTA → BAJA` (dos categorías — acantilado deliberado)** |

**Hallazgo H6 — RESUELTO para `dispersión`; `diseño_muestral` se mantiene
acantilado por decisión.** En la versión especificada originalmente, `dispersión`
y `diseño` tenían un solo umbral (el catastrófico) y saltaban `ALTA → BAJA` sin
pasar por `MEDIA`. El §3.9 prevé *"cortes de dispersión baja/media/alta"* (tres
niveles). Se añadió `precisionCorteDispersionMedia`: dispersión "media" ahora
limita `PRECISIÓN` a `MEDIA` en vez de forzar `BAJA` (Q2.2: `disp=23 → MEDIA`,
`disp=24 → MEDIA`, `disp=25 → BAJA`), restaurando la banda intermedia en ese eje.

El eje `diseño_muestral` **se mantiene binario a propósito**: un diseño de
conveniencia o desconocido no es "medianamente confiable", es catastrófico para la
representatividad. No lleva banda `MEDIA`.

### Q2.3 — la compuerta nunca es de mayoría

| factor catastrófico (resto en zona ALTA) | resultado |
|---|---|
| `N = 2` | BAJA |
| `N = 4` | BAJA |
| `tasa = 0.04` | BAJA |
| `tasa = 0.20` | BAJA |
| `diseño = CONVENIENCIA` | BAJA |
| `diseño = UNKNOWN` | BAJA |
| `dispersión = 30` | BAJA |
| `dispersión = 45` | BAJA |

Barrido exhaustivo `N` catastrófico × (los otros 3 en zona ALTA): **24/24 → BAJA**.

**Confirmado — la regla es una compuerta verdadera.** Cuatro factores buenos
nunca compensan uno catastrófico. Ningún régimen de parámetros la degrada a
lógica de mayoría.

---

## Síntesis

**Q1 — el diseño de dos dispersiones queda validado, con la corrección de H1 ya
aplicada.** `dispersionEntreNodos` cruda aísla la polarización estructural (factor
exacto **11.73×** frente al ruido interno vs. `dispersionPool`; ventaja
señal-ruido 16.42×); `dispersionEntreNodosAjustada` cierra el piso residual
(`coef ruido` −0.008 ≈ 0) y es contra ella que se evalúa el veredicto;
`dispersionPool` es la red de seguridad para focos sub-umbral. Estado de las dos
advertencias:

- **H1 — RESUELTA.** El piso ≈ `ruido / √(tamaño_de_nodo)` se elimina con
  `dispersionEntreNodosAjustada` (descomposición de varianza), ya implementada.
- **H2 — abierta, es calibración.** `dispersionEntreNodos` subestima la magnitud
  real ~14 % con pocos nodos. No es un defecto del código; el factor de sesgo
  sobre el conteo de nodos se decide al calibrar `umbralPolarizacionEntreNodos`.

**Q2 — la regla de compuerta funciona como se especificó, con el corte "media" de
dispersión ya añadido.** No degenera, no es de mayoría (24/24 en el barrido
exhaustivo). Estado de las dos observaciones:

- **H5 — abierta, es operación.** El resultado está dominado por `diseño_muestral`:
  `UNKNOWN` → `BAJA` casi siempre. Correcto por diseño ("no se asume lo favorable
  sin evidencia"), pero exige capturar el diseño muestral de forma confiable en
  producción.
- **H6 — RESUELTA para dispersión.** `precisionCorteDispersionMedia` añadido:
  dispersión "media" limita `PRECISIÓN` a `MEDIA` en vez de forzar `BAJA`. El eje
  `diseño_muestral` se mantiene binario (acantilado) por decisión: conveniencia /
  desconocido es catastrófico, no gradual.

## Estado antes del commit

| # | Punto | Estado |
|---|---|---|
| 1 | `dispersionEntreNodosAjustada` (descomposición de varianza) | **Implementada.** Campo nuevo; veredicto se evalúa contra ella; cruda visible. |
| 2 | Corte "media" de dispersión en la compuerta de `PRECISIÓN` (§3.9) | **Implementado.** `precisionCorteDispersionMedia`; elimina el acantilado `ALTA↔BAJA` en el eje dispersión. |
| 3 | `precisionCorteDispersionAlta` (=25 en la simulación) | **Se mantiene `PENDIENTE_VALIDACION`** — 25 era placeholder; no hay nada que "fijar" sin datos de piloto. |
| 4 | Sesgo de magnitud ~14 % de `dispersionEntreNodos` con pocos nodos (H2) | Abierto — calibración de `umbralPolarizacionEntreNodos`, no código. |
| 5 | Dominancia de `diseño_muestral` en `PRECISIÓN` (H5) | Abierto — captura confiable del diseño muestral en producción. |

Los puntos 1 y 2 se aplicaron en esta revisión. Los puntos 3–5 son
calibración/operación con datos de piloto, no correcciones de código, y no
bloquean el commit del módulo.
