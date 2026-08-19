# Investigación de anclaje externo para `umbral_piso` — psicología ocupacional y clínica

Fecha de la investigación: 2026-08-19.

`umbral_piso` (sección 4 de `DOCUMENTO_MARCO_SISTEMA_EFICIENCIA.md`) es el piso
mínimo de `Concepto_B` (lo vivido, escala 0-1) por debajo del cual se declara
`Amenaza_absoluta_par = max(0, umbral_piso − Concepto_B_par)` — riesgo
independiente de la brecha con lo declarado (`Concepto_A`). Hoy vale **0.5,
provisional, sin ningún respaldo externo** — el marco lo agrupa junto a
`w_neg` y `γ` como "parámetros libres, calibrar con el piloto" (sección 4).

Esta investigación busca si algún instrumento validado de psicología
ocupacional o clínica define un punto de corte conceptualmente comparable —
mismo tipo de anclaje externo que ya se usó para calibrar `λ` (literatura de
"vida media" del cambio organizacional, sección 8.2) y para contrastar
`w_neg`/`γ` (Gallup Q12 por cuartil, `INVESTIGACION_DATOS_CALIBRACION_CFF.md`,
sección 3). **No reemplaza la calibración con el piloto** — el marco ya
establece que eso sigue siendo necesario — esto solo aporta puntos de
contraste externos reales.

Regla seguida: solo cifras con fuente citable. Se documenta explícitamente
qué tan comparable es cada escala original a la escala 0-1 de `Concepto_B` —
en particular, la **dirección** de cada instrumento (si un puntaje alto es
"mejor" o "peor") importa tanto como el número, y se señala cuando no son
directamente equivalentes.

---

## 1. Maslach Burnout Inventory (MBI) — la fuente más productiva

El MBI no publica un único punto de corte "0-1" — publica puntos de corte
bajo/medio/alto por subescala, en escalas de suma con rango conocido, lo que
permite normalizar exactamente a 0-1 dividiendo el punto de corte entre el
puntaje máximo posible de esa subescala.

### MBI-HSS (Human Services Survey) — 22 ítems, escala 0-6 por ítem (0=nunca, 6=todos los días)

| Subescala | Ítems | Máx. posible | Corte "alto"/"bajo" publicado | Normalizado 0-1 | Dirección |
|---|---|---|---|---|---|
| Agotamiento emocional (EE) | 9 | 54 | Alto ≥27 | **0.500** | Puntaje alto = peor (agotamiento) |
| Despersonalización (DP) | 5 | 30 | Alto ≥13 | **0.433** | Puntaje alto = peor (cinismo) |
| Realización personal (PA) | 8 | 48 | Bajo ≤31 | **0.646** | Puntaje alto = mejor (logro) — misma dirección que Concepto_B |

Fuente: puntos de corte estándar del manual del MBI (Maslach, Jackson &
Leiter), confirmados por múltiples fuentes secundarias académicas y
clínicas coincidentes en los mismos tres rangos (bajo/moderado/alto) para
EE, DP y PA. Estructura de 22 ítems / 3 subescalas confirmada directamente:
*"The Maslach Burnout Inventory-Human Services Survey (MBI-HSS) includes 22
items across three domains: emotional exhaustion (EE; 9 items),
depersonalization (DP; 5 items), and personal accomplishment (PA; 8
items)"* — y *"The scoring range for each item is 0 (never felt) to 6 (felt
every day)"*.

### MBI-GS (General Survey) — versión no clínica, para cualquier ocupación

3 subescalas: agotamiento (5 ítems), cinismo (5 ítems), eficacia profesional
(6 ítems), mismo rango 0-6 por ítem. Fuente: *"burnout is indicated by high
scores in emotional exhaustion (16+), cynicism (11+), and low scores in
professional efficacy (23 or lower)"*.

| Subescala | Ítems | Máx. posible | Corte publicado | Normalizado 0-1 | Dirección |
|---|---|---|---|---|---|
| Eficacia profesional | 6 | 36 | Bajo ≤23 | **0.639** | Puntaje alto = mejor — misma dirección que Concepto_B |

**Nota de convergencia:** el corte de "eficacia profesional baja" del MBI-GS
(0.639) y el de "realización personal baja" del MBI-HSS (0.646) — dos
versiones distintas del mismo instrumento, aplicadas a poblaciones
distintas (general vs. servicios humanos) — caen casi en el mismo punto
normalizado. No es una sola cifra aislada, son dos mediciones
independientes convergiendo cerca de **0.64-0.65**.

### MBI-SS (Student Survey), referencia adicional

Cortes clínicamente validados: agotamiento 12.5, cinismo 7.5, eficacia
reducida 10.5 — la fuente no especifica el número exacto de ítems de cada
subescala en este corte de búsqueda, así que **no se normaliza aquí** para
no inventar el denominador. Se menciona solo como referencia de que existe
una tercera versión con cortes propios, coherente en estructura con las
otras dos.

---

## 2. WHO-5 Well-Being Index — el anclaje más directamente comparable

**El hallazgo más relevante de esta investigación.** El WHO-5 mide bienestar
subjetivo general (ánimo, vitalidad, interés en la vida diaria) en las
últimas 2 semanas — 5 ítems, escala Likert 0-5 (6 puntos: "en ningún
momento" a "todo el tiempo"), puntaje bruto máximo 25, convertido a una
escala 0-100 (×4) para reporte estándar.

**Punto de corte validado:** ≤50 (sobre 100) — **exactamente 0.50 normalizado
a escala 0-1**. Es el umbral de cribado de depresión más usado y validado
del instrumento, con evidencia de meta-análisis: *"A cut-off score of ≤50 on
the WHO-5 is widely used for depression screening, with studies using this
threshold showing a mean sensitivity of 0.87 and mean specificity of 0.76
for DSM-IV depression"* — y una revisión sistemática de 18 estudios reporta
sensibilidad 0.86 / especificidad 0.81 agregada. Existe también un corte más
estricto (≤28/100 = 0.28) equivalente al nivel de bienestar de pacientes con
depresión mayor clínica — más severo, no el de cribado general.

**Dirección: misma que Concepto_B** (puntaje alto = mejor bienestar, piso
mínimo = riesgo) — a diferencia de EE/DP del MBI, el WHO-5 no necesita
invertirse para comparar.

**Uso ocupacional confirmado:** el WHO-5 se usa activamente en salud
ocupacional, no solo en contexto clínico — *"the WHO-5 has been used to
assess well-being in occupational health settings, the association between
workplace stress and well-being, the links between working condition and
well-being"* — incluyendo cribado de bienestar en trabajadores de salud.

**Limitación de comparabilidad:** el WHO-5 es un instrumento de cribado
clínico de depresión (validado contra criterios DSM-IV), no un instrumento
organizacional — mide bienestar subjetivo general de la persona, no un
concepto acoplado a estructura/experiencia organizacional como los 5 pares
del IAO. La coincidencia numérica exacta con el 0.5 provisional es real y
documentable, pero el objeto medido no es idéntico a `Concepto_B`.

---

## 3. Escalas de seguridad psicológica (Edmondson) — vacío confirmado

La escala de 7 ítems de Amy Edmondson (1999) es el instrumento más citado
para seguridad psicológica de equipo, con evidencia amplia de validez de
constructo y fiabilidad. **No se encontró ningún punto de corte publicado
para "insuficiente" o "riesgo"** en el trabajo original de Edmondson ni en
las fuentes secundarias revisadas — solo se encontraron promedios de
referencia puntuales de poblaciones específicas (ej. un estudio con
deportistas reporta media 5.37, DE 0.85, en escala 1-7), sin una
clasificación de riesgo estandarizada tipo "bajo/medio/alto".

Existen instrumentos derivados con metodología propia de cribado (ej. el
"Psychological Safety Index", PSI, con 4 dominios y alfa de Cronbach
0.82-0.86) — pero no se encontró en esta búsqueda un umbral numérico
publicado y validado de forma comparable a los cortes del MBI o el WHO-5.

**Vacío explícito:** ningún dato aplicable a `umbral_piso` desde esta
categoría.

---

## 4. Utrecht Work Engagement Scale (UWES) — vacío confirmado, con una referencia débil

El manual preliminar oficial (Schaufeli & Bakker) fue consultado
directamente — no fue posible extraer categorías normativas
("muy bajo/bajo/promedio/alto/muy alto") con rangos numéricos del PDF; las
fuentes secundarias revisadas confirman que **no existe un estándar
universal**: *"reference values for the three components of the scale may
vary depending on the context and the population being studied, and there
is no established universal standard for what is considered high or low for
each component"*.

**Única referencia encontrada, con caveat fuerte:** un estudio de validación
japonesa del UWES-9 reporta que un puntaje total de 9 corresponde a
"engagement bajo" y 22+ a "engagement alto" — pero esto es específico de esa
población y ese estudio, no una norma general, y la fuente no confirma con
certeza el rango de la escala usada (podría no ser directamente el 0-6 por
ítem estándar). **No se normaliza ni se usa como anclaje** — mencionarlo
solo como lo que se encontró, explícitamente marcado como no aplicable sin
verificación adicional.

**Vacío explícito:** ningún dato confiable aplicable a `umbral_piso` desde
esta categoría.

---

## 5. Síntesis — qué significa esto para `umbral_piso`

**Dos anclajes externos reales, con la misma dirección que Concepto_B, en
puntos distintos:**

| Anclaje | Valor normalizado | Naturaleza |
|---|---|---|
| WHO-5 (cribado de depresión, validado meta-analíticamente) | **0.50** | Clínico general, no organizacional — coincide exactamente con el provisional |
| MBI — Realización personal / Eficacia profesional (2 versiones convergentes) | **≈0.64-0.65** | Ocupacional, más específico al contexto de trabajo — más alto que el provisional |

**No es una confirmación limpia de 0.5.** El anclaje más específicamente
ocupacional (MBI, diseñado para el contexto de trabajo, con dos versiones
independientes convergiendo cerca de 0.64-0.65) sugiere que el piso
provisional de EFICIENCIA podría ser **más permisivo** (más bajo) que lo que
la literatura de burnout ocupacional usaría como punto de "riesgo real" —
es decir, con `umbral_piso=0.5`, `Concepto_B` tendría que caer más antes de
activar `Amenaza_absoluta_par` que lo que el MBI consideraría ya como
"bajo/en riesgo" en su subescala más comparable en dirección.

El anclaje que sí coincide exactamente (WHO-5) es clínico-general, no
ocupacional — la coincidencia es real y vale la pena documentarla (mismo
tipo de "señal de consistencia, no una prueba" que ya se usó para `λ`,
sección 8.2 del marco), pero no debería pesar más que el anclaje ocupacional
específico del MBI solo por coincidir numéricamente con el valor ya elegido.

**Evidencia convergente indirecta (dirección invertida, no aplicable sin
más trabajo):** el corte "alto" de Agotamiento Emocional del MBI-HSS
también normaliza a exactamente 0.500 — pero en la dirección opuesta
(puntaje alto = peor). Si `Concepto_B` se interpretara como equivalente a
"1 − distress", este dato apuntaría en la misma dirección que el WHO-5. No
se usa como anclaje directo aquí porque requeriría asumir que `Concepto_B`
y "ausencia de agotamiento emocional" son constructos intercambiables, algo
que esta investigación no puede validar — se documenta solo como
observación, no como evidencia.

**Recomendación concreta:** no cambiar `umbral_piso` unilateralmente a
partir de esto — el marco tiene razón en que la calibración real es con el
piloto. Pero al calibrar, usar **0.5 y ≈0.65 como los dos puntos de
contraste externos documentados** (en vez de partir de un rango sin ningún
punto de referencia) — si el piloto converge cerca de 0.5, se alinea con el
cribado clínico general (WHO-5); si converge más cerca de 0.6-0.65, se
alinea con el instrumento específicamente ocupacional (MBI). Ambos
resultados tendrían respaldo externo real, ninguno sería sorprendente.

---

## Fuentes

- Puntos de corte MBI-HSS/MBI-GS: manual estándar del Maslach Burnout
  Inventory (Maslach, Jackson & Leiter) y fuentes académicas secundarias
  coincidentes (incluye validación Frontiers in Psychology 2024 de la
  versión corta MBI-GS de 9 ítems, para la estructura de subescalas).
- WHO-5: revisión sistemática de la literatura (Topp et al., *Psychotherapy
  and Psychosomatics*, y validaciones posteriores) — corte ≤50/100 con
  sensibilidad/especificidad meta-analítica reportada; uso en salud
  ocupacional confirmado por múltiples estudios de bienestar laboral.
- Escala de Edmondson (1999): *Administrative Science Quarterly*
  ("Psychological Safety and Learning Behavior in Work Teams") — validez de
  constructo confirmada, sin corte numérico publicado encontrado en esta
  búsqueda.
- UWES: manual preliminar de Schaufeli & Bakker (wilmarschaufeli.nl) — sin
  normas universales; referencia japonesa específica de población, no
  generalizable.
