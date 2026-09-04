# EFICIENCIA
## Sistema de Inteligencia Relacional para la Productividad Organizacional

# DOCUMENTO TÉCNICO OFICIAL
## Instrumentos SDMO — IDA — IAO
### Sensor Diario de Modo Operativo, Índice Diario de Activación e Índice de Activación Organizacional

**Versión canónica — v1**

## Naturaleza del documento

El presente documento establece la definición, arquitectura, fórmulas de
cálculo, criterios de interpretación y estado de validación de tres
objetos que deben distinguirse con precisión y que en versiones previas
del proyecto llegaron a confundirse bajo denominaciones compartidas:

- **SDMO** — el instrumento de observación frecuente.
- **IDA** — el resultado de una aplicación individual del SDMO.
- **IAO** — el índice organizacional derivado del instrumento ICE–IEH.

Complementa al `Documento Técnico Oficial — Instrumento ICE–IEH`, que
sigue siendo la fuente de verdad para la arquitectura de variables,
sensores y preguntas de ese instrumento. Este documento no reproduce esa
arquitectura; la utiliza como entrada.

Al igual que el documento técnico ICE–IEH, este texto conserva
deliberadamente las cajas de **Fundamento técnico** que justifican
decisiones no obvias — en particular, el registro explícito de una
hipótesis matemática que fue evaluada, sometida a prueba de estrés y
descartada. Esa genealogía no es material accesorio: es la evidencia de
que la fórmula vigente resistió una prueba que la alternativa no resistió,
y evita que una formulación descartada se reintroduzca sin conocer por qué
se abandonó.

---

## 1. SDMO, IDA e IAO — tres objetos distintos

La arquitectura distingue con precisión tres niveles que no deben
confundirse ni renombrarse indistintamente:

**SDMO — Sensor Diario de Modo Operativo.** Es el instrumento. Su función
es recoger, de manera frecuente y liviana, señales que permiten observar
variaciones en el Modo Operativo de las Personas entre una aplicación del
ICE–IEH y la siguiente.

**IDA — Índice Diario de Activación.** Es el resultado de una aplicación
individual del SDMO. Sintetiza las cuatro respuestas de una Persona en un
momento determinado. `IDA_{i,t}` significa: Persona *i*, medición *t*.

**IAO — Índice de Activación Organizacional.** Opera en un nivel distinto.
Es un indicador **derivado del instrumento ICE–IEH** — no del SDMO — que
estima qué Modo Operativo resulta compatible con la configuración de
condiciones y experiencia observada en un momento dado.

La secuencia conceptual correcta es paralela, no secuencial:

```
ICE–IEH → condiciones/brechas → IAO
SDMO    → manifestaciones frecuentes → IDA
IAO ↔ IDA   (contraste, no dependencia matemática)
```

**Fundamento técnico — por qué esta separación es necesaria.** Existieron
dos usos históricos de la sigla IAO: uno como "Índice de Activación
Organizacional" (derivado de los cinco pares de ICE–IEH) y otro como
"Índice de Autorregulación Organizacional" (derivado del SDMO/IDA). No son
el mismo objeto matemático. El Documento Marco de EFICIENCIA anterior a
esta revisión establece de forma inequívoca la primera acepción — IAO se
calcula desde ICE–IEH, no desde SDMO — y esa es la que este documento
adopta como vigente. Construir IAO a partir de IDA habría mezclado dos
niveles de observación distintos (condición/experiencia vs. manifestación
operativa) y habría destruido precisamente el valor de poder contrastarlos
de forma independiente.

---

## 2. SDMO — Sensor Diario de Modo Operativo

### 2.1 Definición

**SDMO** — instrumento de monitoreo frecuente de EFICIENCIA que observa
variaciones en la disponibilidad operativa de las Personas mediante cuatro
manifestaciones fundamentales de su participación: actuar, comunicar,
involucrarse y pensar.

### 2.2 Función

Producir señales frecuentes que permitan reconocer cambios, tendencias o
alteraciones en el Modo Operativo y determinar cuándo resulta necesario
contrastar, profundizar o actualizar el diagnóstico.

La relación con ICE–IEH queda así:

```
ICE–IEH → ¿QUÉ CONDICIONES EXISTEN Y CÓMO LAS VIVE LA PERSONA?
SDMO    → ¿QUÉ ESTÁ PASANDO CON SU MANERA DE PARTICIPAR?
```

SDMO mide manifestaciones operativas frecuentes reportadas por las
Personas; no repite las 31 preguntas de ICE–IEH ni pretende sustituirlas.
El cuestionario completo mide percepción reflexiva sobre la relación con
la Organización; el SDMO mide estado sentido del período reciente, algo
que se responde en segundos.

### 2.3 Arquitectura de cuatro dimensiones

> **Nota de reemplazo de nomenclatura.** Las cuatro dimensiones se
> denominaron originalmente Confianza, Colaboración, Compromiso y
> Creatividad. Esa nomenclatura queda **descartada**: los nombres
> mezclaban el fenómeno observado con constructos que ya tienen
> significado específico dentro de ICE–IEH (en particular, "Confianza" es
> una variable propia del IEH con una definición distinta — certeza
> desarrollada a partir de experiencia relacional acumulada — que no debe
> confundirse con la manifestación diaria de actuar con o sin cautela).
> La arquitectura vigente identifica las cuatro dimensiones por la
> **función que observan**, no por la emoción que las acompaña:

| Dimensión | Código | Qué observa |
|---|---|---|
| **ACTUAR** | `ACU` | Disponibilidad para iniciar, decidir y ejecutar la acción sin inhibiciones relevantes asociadas al funcionamiento experimentado |
| **COMUNICAR** | `COM` | Disponibilidad para expresar aquello que la Persona reconoce como importante, en vez de callarlo |
| **INVOLUCRARSE** | `INV` | Disposición para aportar atención, energía y compromiso real a aquello que se hace, más allá del cumplimiento mecánico |
| **PENSAR** | `PEN` | Disponibilidad cognitiva para comprender, decidir, concentrarse y resolver |

**Fundamento técnico — por qué cuatro y no cinco.** Se sometieron las
cuatro dimensiones a una prueba de cobertura contra los cinco pares de
ICE–IEH: para cada par, ¿puede su deterioro manifestarse en alguna de las
cuatro dimensiones, y existe algún fenómeno operacional relevante que
ninguna de las cuatro pueda detectar? Ningún par de ICE–IEH quedó sin una
vía plausible de manifestación (ver sección 5.6), y los candidatos a
quinta dimensión que surgieron en el análisis — energía/cansancio,
pertenencia, ejecución, regulación emocional — o bien pertenecen mejor al
propio ICE–IEH (que ya los observa como condición o experiencia), o son
resultado operativo verificable por KPI, o quedan razonablemente
contenidos dentro de las cuatro dimensiones existentes. La regla aplicada:
una quinta dimensión solo se incorporaría si detecta una manifestación
relevante no capturada, esa manifestación aporta valor de triangulación
con ICE–IEH, y su beneficio compensa el costo de alargar un instrumento
cuya ventaja central es la brevedad. Ninguna candidata cumplió las tres
condiciones simultáneamente.

**INTERACTUAR se renombró a COMUNICAR.** La dimensión original observaba,
en la práctica, algo más específico que toda la función de interactuar
(que incluiría colaborar, coordinar, escuchar, pedir ayuda): observaba
específicamente si la Persona expresaba o callaba aquello que consideraba
importante. Ese fenómeno — la comunicación asertiva en su forma más
elemental — es distinto de la coordinación general, que ya observa ICE–IEH
en su sensor `EST-2`. El nombre `COMUNICAR` describe con mayor precisión lo
que el reactivo efectivamente mide.

### 2.4 Reactivos canónicos

Cada reactivo es un ítem bipolar en escala 1–5. Los dos polos construyen
conjuntamente el significado de la dimensión — no deben leerse como
afirmaciones independientes, sino como los dos extremos de un mismo
continuo.

| Código | Polo 1 | Polo 5 |
|---|---|---|
| `ACU` | Hice lo que consideré que debía. | No hice algo que sabía que debía hacer. |
| `COM` | Dije lo que creí importante. | Me callé aunque sabía que era importante decirlo. |
| `INV` | Le puse corazón a lo que hice. | Hice solo lo que me tocaba, nada más. |
| `PEN` | Mi mente estaba clara. | Me costó pensar con claridad. |

**Fundamento técnico — por qué esta redacción y no otra.** Los cuatro
reactivos comparten un mismo principio de diseño: ninguno contiene un
constructo teórico de EFICIENCIA (no aparecen las palabras Seguridad,
Amenaza, Defensa, confianza, estrés, motivación, compromiso, coherencia).
La Persona solo reconoce cuatro hechos elementales — *hice, dije, me
involucré, pude pensar* — y EFICIENCIA interpreta después esas respuestas
dentro de la arquitectura diagnóstica. Esto reduce la deseabilidad social
del instrumento: nadie necesita reconocerse como "poco comprometido" o
"temeroso"; basta con reconocer un hecho concreto del período reciente.

### 2.5 Escala y normalización

Escala de respuesta: 1 a 5, bipolar. Convención:

```
1 = máxima proximidad al primer polo
5 = máxima proximidad al segundo polo
2, 3, 4 = posiciones intermedias del continuo
```

**Estas posiciones intermedias no reciben una interpretación fija.** En
particular, `3` no equivale a "Alerta", y la escala no debe leerse como
`1=Seguridad, 5=Amenaza`. Una posición intermedia puede representar mezcla
de situaciones durante el período observado, o ausencia de predominancia
clara hacia cualquiera de los dos polos. Qué tan bien discriminan
empíricamente las posiciones 2–3–4 es una pregunta para el piloto, no una
definición conceptual pendiente: el significado ordinal de la escala
(mayor cercanía a un polo u otro) ya queda cerrado.

Normalización de cada respuesta cruda `x` (1 a 5) a `z` (0 a 1):

```
z = (x − 1) / 4
```

`z` no representa "porcentaje de Amenaza". Representa únicamente la
posición normalizada de la respuesta hacia el polo de mayor restricción
operacional de esa dimensión.

### 2.6 Cálculo del IDA

```
M_i = (z_ACU + z_COM + z_INV + z_PEN) / 4

C_i = z_(3)     [tercer valor al ordenar z_(1) ≤ z_(2) ≤ z_(3) ≤ z_(4),
                 es decir, el segundo mayor de las cuatro dimensiones]

IDA_i = 100 × [δ·M_i + (1−δ)·C_i]
```

`M_i` representa la extensión general de la restricción (promedio de las
cuatro dimensiones). `C_i` representa concentración multidimensional:
aumenta de forma relevante solo cuando **al menos dos** dimensiones
presentan valores elevados, evitando que una sola dimensión extrema domine
el índice.

`δ` — **parámetro de calibración empírica, no fijado en esta versión.** No
existe todavía evidencia para afirmar que extensión y concentración deban
pesar 50/50 o en cualquier otra proporción. Esto no impide cerrar la
arquitectura matemática; impide cerrar el valor del parámetro.

**IDA no debe leerse como diagnóstico.** `IDA ≠ Modo Operativo medido
directamente`. IDA sintetiza la configuración de las cuatro manifestaciones
observadas; valores mayores representan mayor concentración de respuestas
hacia los polos de restricción operacional, no un porcentaje de Amenaza.

### 2.7 Unidad de interpretación: posición + trayectoria

Una medición aislada no permite diagnosticar nada por sí sola. Comparar
`30→40→52→68` con `82→76→72→68`: ambas series terminan en el mismo valor,
pero una muestra deterioro y la otra recuperación. Por tanto:

```
SDMO = POSICIÓN + TRAYECTORIA
```

Se distinguen cinco propiedades temporales, sin fijar todavía ningún
umbral numérico para ninguna de ellas:

| Propiedad | Pregunta que responde |
|---|---|
| **Nivel** | ¿Dónde se encuentra la señal actualmente? |
| **Tendencia** | ¿En qué dirección se mueve — ascendente, estable, descendente? |
| **Persistencia** | ¿Durante cuánto tiempo se sostiene la señal? |
| **Cambio abrupto** | ¿Hubo una variación importante respecto de la trayectoria precedente? |
| **Recuperación** | ¿Existe una trayectoria sostenida desde manifestaciones defensivas hacia manifestaciones compatibles con Seguridad? |

Se conservan además dos niveles de señal, no uno: **señal por dimensión**
(qué manifestación concreta se está moviendo) y **señal sintética IDA**
(la configuración general). El IDA detecta la configuración; las cuatro
dimensiones permiten localizar cómo se manifiesta.

**Regla epistemológica de cierre de esta sección:** una señal temporal
identifica una variación que merece atención o contraste; no establece por
sí misma su causa ni constituye un diagnóstico. `ALERTA ≠ DIAGNÓSTICO`. Los
valores concretos que activan cada tipo de alerta (magnitud de nivel,
número de mediciones para persistencia, tamaño de un cambio considerado
abrupto) quedan explícitamente para el piloto — no se fijan valores como
"65" o "75" sin evidencia que los respalde.

### 2.8 No-respuesta

```
NO RESPUESTA ⇏ AMENAZA
```

La ausencia de respuesta puede deberse a múltiples causas (ausencia,
vacaciones, olvido, carga operativa, problema tecnológico, desconfianza,
evitación, fatiga del instrumento) y no existe fundamento para convertirla
automáticamente en puntuación defensiva — hacerlo contaminaría el
instrumento. La no-respuesta **no modifica el IDA ni se imputa como
manifestación defensiva**. Se registra como señal independiente de
participación:

```
TasaRespuesta_{nodo,t} = Respuestas válidas / Personas convocadas
```

Su trayectoria puede justificar contraste o profundización cuando presenta
cambios relevantes y sostenidos, pero nunca se traduce directamente en
"aumentó la Amenaza".

### 2.9 Agregación colectiva

**La fórmula histórica de "promedio + segundo mayor entre Personas" queda
retirada de la agregación colectiva.** El mecanismo tenía sentido a nivel
individual (cuatro dimensiones, cantidad fija) pero pierde significado
proporcional cuando el número de Personas varía: el segundo valor más alto
entre 8 Personas representa el 25% del grupo; entre 500, el 0,4%. No es
conceptualmente equivalente.

**Principio que se conserva:** la lectura colectiva del SDMO debe
preservar tanto el nivel general como la distribución de las respuestas,
para poder distinguir tres configuraciones que un promedio simple no
distingue:

- **Deterioro generalizado** — muchas Personas muestran valores elevados.
- **Foco concentrado** — una fracción relevante del grupo muestra
  deterioro fuerte mientras el resto permanece estable.
- **Caso aislado** — una o dos Personas presentan valores extremos, sin
  evidencia suficiente para atribuir al sistema una alteración colectiva.

Se conservan, como mínimo, separadamente:

```
Nivel colectivo:        M_{nodo,t} = promedio(IDA_i,t)
Concentración/dispersión: percentiles (P75, P90), proporción por encima
                          de un umbral a calibrar, u otra medida que
                          preserve proporcionalidad con el tamaño del grupo
```

La fórmula exacta de concentración colectiva —qué percentil, qué umbral—
queda para el piloto. Lo que se cierra aquí es el principio: **la
concentración colectiva debe ser proporcional al tamaño del grupo; un
segundo-mayor absoluto no lo garantiza.**

### 2.10 Confidencialidad

```
Individual   → nunca se reporta
Nodo         → solo con N suficiente
Organización → agregación
```

El umbral preliminar de `N ≥ 8–10` Personas para reportar un nodo queda
como **hipótesis operativa pre-piloto**, no como parámetro canónico
definitivo — debe evaluarse junto con la estructura organizacional
concreta, criterios de anonimización y riesgo de reidentificación.

---

## 3. IAO — Índice de Activación Organizacional

### 3.1 Definición

**IAO** — indicador derivado del instrumento ICE–IEH que estima en qué
medida la configuración observada entre las condiciones del Sistema y la
experiencia de las Personas resulta compatible con un Modo Operativo de
mayor regulación o mayor activación defensiva.

La palabra fundamental de esta definición es *estima*. El IAO no mide
directamente un estado neurobiológico ni demuestra que una Persona o una
unidad organizacional se encuentre en Seguridad o en Amenaza:

```
IAO = INFERENCIA DERIVADA, NO FUENTE INDEPENDIENTE
```

### 3.2 Función

Sintetizar la información obtenida mediante ICE–IEH para identificar
configuraciones compatibles con diferentes niveles de activación
organizacional, localizar los planos en los que se concentra el
deterioro, y orientar su contraste con SDMO/IDA y otras fuentes de
evidencia.

```
ICE–IEH → IAO → CONTRASTE
```

nunca:

```
ICE–IEH → IAO → DIAGNÓSTICO CAUSAL
```

### 3.3 Fundamento de la inferencia — tres niveles de sustento

Los parámetros de esta sección no son arbitrarios, pero tampoco deben
presentarse como validados empíricamente por EFICIENCIA todavía. Se
distinguen tres niveles, y cada parámetro de este documento debe poder
ubicarse en uno de ellos:

1. **Fundamento conceptual** — deriva de la arquitectura teórica de
   EFICIENCIA (el acróstico, la relación Sistema↔Experiencia).
2. **Evidencia empírica externa** — estudios, metaanálisis y datos
   organizacionales publicados que permiten estimar relaciones y
   comportamientos plausibles, sin ser datos propios de EFICIENCIA.
3. **Validación empírica propia** — datos obtenidos mediante aplicaciones
   reales de EFICIENCIA, que confirmarán, rechazarán o recalibrarán las
   hipótesis de los dos niveles anteriores.

`EVIDENCIA EMPÍRICA EXTERNA ≠ VALIDACIÓN EMPÍRICA PROPIA`. La ausencia del
tercer nivel no invalida un parámetro construido con los dos primeros;
simplemente lo mantiene en estado pre-piloto.

### 3.4 Variables de entrada y transformación a déficit

El IAO utiliza las diez variables canónicas del ICE–IEH vigente, en
escala 0–100, normalizadas a `X* = X/100`. Cada variable favorable se
transforma en déficit:

```
D_X = 1 − X*
```

`D_X = 0` representa ausencia de déficit observado; `D_X = 1` representa
el déficit máximo posible en la escala. Esto no equivale a 0% o 100% de
Amenaza.

Variables del lado Sistema: `EST, INE, IMP, NEX, ITG`
Variables del lado Experiencia: `FOR, COH, EQU, CNF, ACT`

### 3.5 Arquitectura matemática vigente

**Déficit sistémico** — las cinco variables sistémicas conservan igual
ponderación, por no existir todavía evidencia propia que justifique pesos
sistémicos diferenciales:

```
D_S = (D_EST + D_INE + D_IMP + D_NEX + D_ITG) / 5
```

**Déficit experiencial** — aquí sí existe evidencia empírica externa
suficiente (literatura sobre ambigüedad de rol, seguridad psicológica,
desequilibrio esfuerzo-recompensa, confianza organizacional y significado
del trabajo) para orientar una ponderación teórica diferenciada por
proximidad de cada variable al Modo Operativo:

```
D_E = .25·D_FOR + .18·D_COH + .25·D_EQU + .20·D_CNF + .12·D_ACT
```

| Variable | Peso pre-piloto |
|---|---|
| Fortaleza | 25% |
| Coherencia | 18% |
| Equilibrio | 25% |
| Confianza | 20% |
| Actitud | 12% |

Los pesos suman 1. Son **ponderaciones teóricas informadas por evidencia
externa**, sujetas a validación y recalibración con datos propios.

**Relación Sistema–Experiencia.** Se asigna mayor peso a la Experiencia
por su mayor proximidad al fenómeno que el IAO pretende inferir — no
porque el Sistema importe menos, sino porque la secuencia conceptual
`CONDICIONES → EXPERIENCIA → SIGNIFICADO → ESTADO → RESPUESTA → CONDUCTA`
ubica a la Experiencia más cerca de la activación humana que la
configuración estructural aislada:

```
IAO = 100 × [.30·D_S + .70·D_E]
```

Expandida:

```
IAO = 100 × [.060·D_EST + .060·D_INE + .060·D_IMP + .060·D_NEX + .060·D_ITG
            + .175·D_FOR + .126·D_COH + .175·D_EQU + .140·D_CNF + .084·D_ACT]
```

Escala resultante: `0 ≤ IAO ≤ 100`. Mayor IAO indica mayor configuración
compatible con activación defensiva — no un porcentaje de Amenaza.

### 3.6 Perfil de activación por par

El IAO no debe ocultar dónde se origina la señal. Se conservan cinco
componentes, uno por par, derivados de los mismos coeficientes de la
fórmula global (normalizados dentro de cada par):

```
A_EF = 100 × [(12/47)·D_EST + (35/47)·D_FOR]     (Estructura ↔ Fortaleza)
A_IC = 100 × [(10/31)·D_INE + (21/31)·D_COH]     (Intención ↔ Coherencia)
A_IE = 100 × [(12/47)·D_IMP + (35/47)·D_EQU]     (Impacto ↔ Equilibrio)
A_NC = 100 × [.300·D_NEX + .700·D_CNF]           (Nexo ↔ Confianza)
A_IA = 100 × [(5/12)·D_ITG + (7/12)·D_ACT]       (Integración ↔ Actitud)

IAO = .235·A_EF + .186·A_IC + .235·A_IE + .200·A_NC + .144·A_IA
```

Los pesos internos de cada par se derivan de los coeficientes globales
exactos (`.06/.175/.126/.140/.084` de la fórmula de §3.5) — nunca de
literales redondeados a 3 decimales. Por ejemplo, `wSistema(EF) =
.06/(.06+.175) = 12/47 ≈ 0.255319`, no `.255`. La diferencia es pequeña
(~0.03 puntos en el resultado final) pero se acumula cuando se
reensambla el IAO desde los cinco perfiles — con los pesos exactos, esa
reconstrucción coincide con el cálculo directo sin margen de error;
con los redondeados, no cierra exacto. El motor de referencia
(`motor-iao`) ya implementa los pesos exactos, derivados en tiempo de
ejecución — este documento debe coincidir con esa implementación, no al
revés.

Esto garantiza trazabilidad completa: dos organizaciones con el mismo IAO
global pueden tener perfiles completamente distintos, y el perfil es el
que orienta dónde profundizar.

### 3.7 Brechas — información diagnóstica, fuera del cálculo del IAO

Por cada par:

```
B_j = S_j − E_j
```

`B_j > 0`: la valoración del Sistema supera a la Experiencia.
`B_j < 0`: la Experiencia supera a la valoración del Sistema.

**Las brechas no entran en el cálculo del IAO.** Se conservan en paralelo
como información diagnóstica de desacople. Esta decisión tiene una
genealogía que debe quedar documentada — ver la caja de fundamento técnico
a continuación — porque una formulación intermedia sí intentaba
incorporarlas directamente, y fue descartada por una razón concreta y
verificable, no por preferencia.

> ### Fundamento técnico — la hipótesis descartada
>
> Durante el desarrollo del IAO se evaluó inicialmente una formulación no
> lineal en la que el déficit experiencial era amplificado cuando la
> valoración del Sistema superaba la valoración de la Experiencia:
>
> ```
> H_j = 1 − E_j
> G_j⁺ = max(S_j − E_j, 0)
> A_j = H_j + G_j⁺ · E_j
> ```
>
> Esta formulación parecía resolver con elegancia un problema real: que
> una brecha igual a cero no garantiza una condición favorable (Sistema y
> Experiencia pueden coincidir en un nivel alto o en un nivel bajo, y solo
> el primero es deseable), y que un Sistema sobrevalorado frente a una
> Experiencia pobre debía pesar más que la simple resta entre ambos.
>
> **Prueba de estrés.** Se sometió la fórmula a una trayectoria simple:
> Experiencia constante en `E=.40` y Sistema mejorando de `S=.70` a
> `S=.90`. El resultado:
>
> ```
> S: .70 → .90   con E=.40 constante
> A: .72 → .80
> ```
>
> Es decir: **mejorar el Sistema, sin ningún cambio en la Experiencia,
> aumentaba la activación inferida por el índice.** Y, a la inversa, si el
> Sistema empeoraba manteniendo constante la Experiencia, la activación
> inferida podía disminuir, porque se reducía la brecha. Este
> comportamiento —mejorar una condición empeora el resultado del índice—
> es inadmisible en un indicador diagnóstico, con independencia de
> cualquier otra virtud que la fórmula pareciera tener.
>
> **Decisión:** se descarta la incorporación directa de la Brecha al
> cálculo del IAO. La secuencia queda documentada así:
>
> ```
> BRECHA DIRECCIONAL → HIPÓTESIS DE AMPLIFICACIÓN → PRUEBA DE ESTRÉS
> → PARADOJA DE MONOTONICIDAD → DESCARTE DEL TÉRMINO G⁺
> ```
>
> **Reconciliación conceptual.** La frase "la dirección de la brecha
> importa" sigue siendo válida, pero no significa que deba amplificar
> matemáticamente el IAO. `S>E` y `E>S` son configuraciones
> organizacionalmente distintas y merecen lecturas diagnósticas distintas
> — pero esa diferencia no necesita provenir de castigar una dirección
> dentro del índice. Ya existe, por otra vía, una asimetría defendible: al
> ponderar más la Experiencia que el Sistema (`.70`/`.30` global, y los
> pesos diferenciales de la sección 3.5), los casos `(S=.90, E=.30)` y
> `(S=.30, E=.90)` producen resultados distintos de forma natural — para
> el par Estructura↔Fortaleza: `A=.547` en el primer caso, `A=.253` en el
> segundo — sin depender de ninguna función no lineal de la brecha misma.
> La asimetría surge de que la Experiencia tiene mayor proximidad al Modo
> Operativo que la condición sistémica, no de penalizar una dirección
> particular de desacople.
>
> **Formulación canónica de cierre:**
>
> ```
> DIRECCIÓN DIAGNÓSTICA ≠ INTENSIDAD DE ACTIVACIÓN
> ```
>
> La dirección de la brecha importa para interpretar la configuración del
> desacople entre Sistema y Experiencia, pero no se utiliza como
> amplificador directo del nivel de activación inferido por el IAO.

### 3.8 Unidad de cálculo e interpretación

La Persona es la unidad básica de respuesta y cálculo — pueden calcularse
`IAO_i`, `A_{ij}`, `B_{ij}` a nivel individual. Pero:

```
CÁLCULO INDIVIDUAL ≠ DIAGNÓSTICO INDIVIDUAL
```

El IAO se interpreta y reporta a nivel colectivo. No debe utilizarse para
clasificar psicológicamente a una Persona.

### 3.9 Agregación colectiva

Para una unidad válida `g`:

```
IAO_g = Σ IAO_i / n_g          (Personas con igual peso)

IAO_ORG = Σ (N_g · IAO_g) / Σ N_g     (agregación entre nodos)
```

**Principio:** la lectura organizacional representa a las Personas que
conforman la Organización; no es un promedio simple de áreas de tamaño
distinto. Todo reporte debe conservar, además del nivel:

```
NIVEL + PERFIL + BRECHAS + DISPERSIÓN + PRECISIÓN
```

y, cuando existan mediciones sucesivas, **trayectoria**. Dos
organizaciones con el mismo IAO pueden tener configuraciones radicalmente
distintas — el índice global nunca sustituye esta arquitectura.

**Dispersión** — se conservan, como mínimo, desviación estándar y rango
intercuartílico, además de la distribución de respuestas. Los puntos de
corte para clasificar dispersión baja/media/alta no están fijados; el
piloto debe establecerlos. Atención especial requieren las brechas: `(+40)
+ (−40) → promedio = 0` no representa alineación, sino posible
polarización.

**Precisión** — grado de confianza con el que la información disponible
permite caracterizar a la unidad observada; considera como mínimo `N`,
tasa de respuesta, representatividad, dispersión y diseño muestral. La
precisión acompaña al IAO; no lo modifica: `PRECISIÓN ≠ ACTIVACIÓN`.

### 3.10 No-respuesta

Misma regla que en SDMO:

```
NO RESPUESTA ⇏ AMENAZA
```

No se imputa como deterioro; se registra independientemente y afecta
principalmente la precisión de la lectura, no el nivel del IAO.

### 3.11 Confidencialidad

Misma regla que en SDMO: resultados individuales nunca se reportan;
segmentos se publican solo cuando cumplen condiciones suficientes contra
identificación o reconstrucción de respuestas. El umbral preliminar de
`N ≥ 8–10` es hipótesis operativa, pendiente de validación.

---

## 4. Triangulación SDMO ↔ ICE–IEH ↔ IAO ↔ IDA

### 4.1 Multiplicidad de indicadores no equivale a multiplicidad de fuentes

De una misma aplicación de ICE–IEH se obtienen ICE, IEH, brechas,
resultados por par, resultados por sensor e IAO. Todos proceden de **una
misma fuente primaria**. Lo mismo ocurre con SDMO: sus cuatro sensores y
el IDA pertenecen a una misma fuente. Por tanto:

```
MULTIPLICIDAD DE INDICADORES ≠ MULTIPLICIDAD DE FUENTES
```

`IAO` es derivado de `ICE–IEH`; `IDA` es derivado de `SDMO`. Ninguno
constituye una fuente independiente respecto del instrumento que lo
origina.

### 4.2 Cuatro familias de evidencia

| Familia | Fuente primaria | Derivados principales | Función diagnóstica |
|---|---|---|---|
| Sistema ↔ Experiencia | ICE–IEH | pares, brechas, ICE, IEH, IAO, perfil | Detectar condiciones |
| Manifestación operativa | SDMO | 4 dimensiones, IDA, trayectoria | Detectar evolución |
| Funcionamiento observable | Registros/PIIO | KPIs, tendencias, desviaciones | Corroborar impacto operativo |
| Contexto/mecanismo | Profundización | hallazgos cualitativos/documentales | Explicar |

El **CFF** no constituye una quinta familia de evidencia causal: traduce
económicamente evidencia ya sustentada por las cuatro anteriores. Es un
resultado derivado, igual que IAO lo es de ICE–IEH e IDA lo es de SDMO.

### 4.3 Qué significa triangular (y qué no)

**No** significa:

```
IAO + IDA + KPI = puntuación única
promedio(IAO, IDA, KPI)
```

**Sí** significa: contrastar evidencia procedente de fuentes diferentes
para determinar qué explicación resulta compatible con ella y qué
explicaciones alternativas siguen siendo posibles.

```
DIVERGENCIA ≠ ERROR
```

Una divergencia entre fuentes no debe promediarse ni ocultarse. Es
información diagnóstica que debe explicarse, no un fallo a corregir.

### 4.4 Tres principios de triangulación

1. **Principio de independencia de la evidencia.** La confianza en un
   hallazgo aumenta cuando señales compatibles proceden de fuentes que
   observan el fenómeno desde niveles distintos y cuyos resultados no
   dependen matemáticamente unos de otros. Por eso `IAO ↔ IDA` tiene
   valor: IDA no entra en la fórmula del IAO, ni viceversa.
2. **Principio de no compensación.** Una fuente no debe neutralizar
   matemáticamente a otra cuando existe divergencia relevante. `IAO=80,
   IDA=20` no debe convertirse en "diagnóstico integrado = 50" — eso
   destruye precisamente la información más útil.
3. **Principio de proporcionalidad inferencial.** Ninguna conclusión puede
   tener mayor fuerza que la evidencia que la sustenta: una señal permite
   *observar*; varias señales independientes compatibles permiten
   *corroborar*; la convergencia contextual y temporal permite *formular
   una hipótesis diagnóstica sustentada*; la atribución causal exige
   evidencia adicional que permita descartar razonablemente explicaciones
   alternativas.

### 4.5 Estados de evidencia

| Estado | Significado |
|---|---|
| **Aislada** | Una sola fuente presenta señal |
| **Convergente** | Dos o más fuentes diferentes muestran evidencia compatible |
| **Divergente** | Fuentes relevantes muestran comportamientos no compatibles entre sí |
| **Explicativa** | Además de convergencia, existe evidencia suficiente sobre el mecanismo plausible |

Jerarquía asociada: `RESPUESTA → SEÑAL → HALLAZGO CORROBORADO → HIPÓTESIS →
DIAGNÓSTICO`. Un hallazgo se considera corroborado cuando: `SEÑAL +
EVIDENCIA INDEPENDIENTE COMPATIBLE → HALLAZGO CORROBORADO` — donde
"independiente" significa otra familia de evidencia, no otro indicador
calculado con los mismos datos.

### 4.6 Campo de búsqueda diagnóstico

**Definición:** conjunto de condiciones, experiencias y evidencias cuya
relación con una señal observada resulta conceptualmente plausible y debe
ser contrastada antes de formular una explicación.

No dice "esta es la causa". Dice "busque primero aquí". Esto evita dos
errores simétricos: convertir una señal SDMO directamente en causa
atribuida (`SEÑAL SDMO → CAUSA`), o reaplicar automáticamente las 31
preguntas de ICE–IEH ante cada señal (`SEÑAL SDMO → REAPLICAR TODO
ICE–IEH`), lo que haría el sistema pesado e innecesario. Primero se
consulta la evidencia ICE–IEH ya disponible; solo si no hay condición
previamente observada compatible se investiga una condición nueva, y solo
si la evidencia lo justifica se anticipa una nueva medición completa.

### 4.7 Mapa de relaciones plausibles — SDMO ↔ pares ICE–IEH

No se construye una matriz simétrica forzada de 5 pares × 4 dimensiones
con veinte relaciones igualmente fuertes. Se identifican prioridades
teóricas, sujetas a confirmación empírica:

| Par ICE–IEH | Prioritario contrastar en SDMO |
|---|---|
| Estructura ↔ Fortaleza | ACTUAR, COMUNICAR, PENSAR |
| Intención ↔ Coherencia | ACTUAR, COMUNICAR, INVOLUCRARSE |
| Impacto ↔ Equilibrio | INVOLUCRARSE, PENSAR, ACTUAR |
| Nexo ↔ Confianza | COMUNICAR, INVOLUCRARSE, ACTUAR |
| Integración ↔ Actitud | INVOLUCRARSE, ACTUAR, COMUNICAR |

**Hallazgo de la prueba de cobertura:** ningún par de ICE–IEH quedó sin
salida observable mediante las cuatro dimensiones, y cada dimensión SDMO
recibe información relevante desde distintos lugares del instrumento — no
hay una dimensión "huérfana" difícil de justificar. INVOLUCRARSE resultó
la dimensión más transversal (recibe relación plausible desde los cinco
pares), lo cual es coherente, no un defecto: muchas condiciones distintas
pueden terminar expresándose en una misma decisión operacional básica —
cuánto de sí está poniendo la Persona — y por eso un deterioro en
INVOLUCRARSE abre varios campos de búsqueda en ICE–IEH; no los resuelve
por sí solo.

### 4.8 Protocolo diagnóstico integrado

```
OBSERVAR → DETECTAR → LOCALIZAR → CONTRASTAR
→ EVALUAR CONVERGENCIA/DIVERGENCIA → FORMULAR HIPÓTESIS
→ PROFUNDIZAR → DIAGNOSTICAR → INTERVENIR → VERIFICAR
```

- **Observar/Detectar:** el SDMO funciona ordinariamente; una señal
  aparece cuando la trayectoria cumple algún patrón de interés (elevación
  relevante, deterioro sostenido, cambio abrupto, concentración
  colectiva, caída de participación).
- **Localizar:** se revisan sensores, pares, nodos y trayectoria — tanto
  del lado SDMO (qué dimensión) como del lado ICE–IEH (qué campo de
  búsqueda, sección 4.6).
- **Contrastar:** se consulta evidencia de otra familia (sección 4.2), no
  otro indicador derivado de la misma fuente.
- **Hipótesis / Profundización:** cuando existe evidencia convergente
  compatible, se formula una explicación provisional y se busca evidencia
  adicional (entrevistas, segmentación, revisión de procesos) capaz de
  sostenerla o refutarla — nunca solo la que la confirma. Cada hipótesis
  debe formularse con su contraparte: qué evidencia la apoyaría y qué
  evidencia la contradiría.
- **Verificación:** tras una intervención, se observa si cambian
  condiciones → manifestaciones → resultados, en ese orden temporal. Un
  patrón que se reproduce de forma consistente tras varias intervenciones
  fortalece una hipótesis causal mucho más que una correlación
  transversal — pero esto pertenece a una fase de validación empírica
  posterior, no a esta versión del documento.

**Condición mínima de plausibilidad causal:** la causa debe preceder al
efecto. Una condición organizacional que aparece después de un deterioro
observado en SDMO no puede explicar ese deterioro. La triangulación no es
solo transversal: debe ser también longitudinal, lo que exige conservar
fecha y período de toda evidencia registrada.

---

## 5. Trazabilidad general — decisiones descartadas

- **"Índice de Autorregulación Organizacional"** — descartado como
  denominación del IAO; la arquitectura vigente del Documento Marco
  establece IAO como derivado de ICE–IEH, no del SDMO, por lo que ese
  nombre (que sugiere un constructo de capacidad de autorregulación
  medido por SDMO) no corresponde al objeto matemático vigente.
- **Confianza/Colaboración/Compromiso/Creatividad** — nomenclatura
  histórica de las cuatro dimensiones del SDMO, descartada por mezclar el
  fenómeno observado con constructos ya definidos en ICE–IEH.
- **`w_neg`, `umbral_piso` (fórmula histórica del IAO)** — descartados:
  la función que cumplían (evitar que una brecha nula oculte una condición
  mala; asignar mayor peso a una dirección de brecha) queda absorbida de
  forma continua por los déficits absolutos de Sistema y Experiencia
  (`D_S`, `D_E`), sin necesitar un umbral arbitrario ni un coeficiente sin
  fundamento.
- **`G_j⁺` (amplificador no lineal de la brecha positiva)** — evaluado,
  sometido a prueba de estrés, y descartado por producir una paradoja de
  monotonicidad (mejorar el Sistema podía aumentar la activación
  inferida). Ver caja de fundamento técnico, sección 3.7.
- **"Segundo mayor entre Personas" para agregación colectiva del SDMO** —
  descartado como fórmula única de concentración colectiva, por no
  preservar proporcionalidad cuando cambia el tamaño del grupo. Se
  conserva el principio (no diluir un foco concentrado en el promedio),
  no la fórmula específica.
- **Pesos iguales (20%) para los cinco pares del IAO por neutralidad** —
  descartado a favor de ponderaciones teóricas informadas por evidencia
  externa (sección 3.5), por considerarse más defendible ordenar los
  pares por proximidad conceptual al fenómeno que dejarlos iguales por
  comodidad ante la ausencia de datos propios.

---

## 6. Estado de validación y parámetros pendientes de piloto

### 6.1 Cerrado en esta versión

| Componente | Estado |
|---|---|
| Distinción SDMO ≠ IDA ≠ IAO | Cerrado |
| IAO como inferencia derivada de ICE–IEH (no del SDMO) | Cerrado |
| Cuatro dimensiones SDMO: ACTUAR, COMUNICAR, INVOLUCRARSE, PENSAR | Cerrado |
| Cuatro reactivos canónicos del SDMO | Cerrado |
| Escala 1–5, significado ordinal de las posiciones intermedias | Cerrado |
| Normalización SDMO (z) y fórmula del IDA | Cerrado (δ pendiente) |
| No-respuesta independiente (SDMO e IAO) | Cerrado |
| Principio de agregación colectiva (nivel + distribución, no segundo-mayor) | Cerrado (fórmula específica pendiente) |
| Transformación a déficit (`D_X`) y arquitectura Sistema/Experiencia del IAO | Cerrado |
| Descarte documentado de `G_j⁺` | Cerrado |
| Fórmula lineal del IAO (30/70, pesos experienciales diferenciados) | Cerrado — pre-piloto |
| Brechas fuera del cálculo del IAO, conservadas como diagnóstico | Cerrado |
| Cuatro familias de evidencia y tres principios de triangulación | Cerrado |
| Protocolo diagnóstico integrado | Cerrado |

### 6.2 Pendiente de calibración con el piloto

- `δ` (ponderación extensión/concentración dentro del IDA individual).
- Fórmula específica de concentración colectiva del SDMO (percentil,
  umbral).
- Magnitud de cambio relevante, número de mediciones para persistencia,
  definición operativa de "cambio abrupto".
- Frecuencia definitiva de aplicación del SDMO (hipótesis pre-piloto: 3
  veces por semana).
- Tamaño mínimo de reporte por confidencialidad (`N ≥ 8–10` es hipótesis).
- Pesos definitivos del IAO (sistémicos y experienciales) — los actuales
  son ponderaciones teóricas informadas por evidencia externa, no
  validadas con datos propios.
- Relación 30/70 Sistema/Experiencia — hipótesis pre-piloto.
- Comportamiento psicométrico de los cuatro reactivos SDMO, incluida la
  discriminación real de las posiciones 2–3–4.
- Correspondencias empíricas SDMO ↔ ICE–IEH ↔ indicadores operativos (el
  mapa de la sección 4.7 es teórico, no validado).
- Umbrales Seguridad/Alerta/Amenaza para IAO e IDA.

### 6.3 Siguiente paso operativo

Con SDMO e IAO cerrados en su arquitectura pre-piloto, y el instrumento
ICE–IEH ya consolidado en su propio Documento Técnico Oficial, el sistema
de instrumentos de EFICIENCIA queda listo para diseñar el protocolo
integrado de validación piloto — que debe evaluar el sistema como
conjunto (ICE–IEH + SDMO + IAO + IDA + triangulación), no cada instrumento
de forma aislada, dado que buena parte de su valor diagnóstico reside
precisamente en el contraste entre ellos.
