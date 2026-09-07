# motor-fpv — Fiabilidad · Proporcionalidad · Vínculo

Módulo de cálculo **aislado**, mismo patrón que `motor-ice-ieh`,
`motor-sdmo`, `motor-iao`, `motor-cff` y `motor-ifd`: construcción por
fases, contratos como validadores primero, mutación real en cada regla
negativa, nada se comitea sin verificación mostrada, nada se conecta a
otro módulo (arnés aparte, después).

**Fuente de verdad — única:**
`docs/Documento_Tecnico_FPV_v1.2_PrePiloto_Stress_Test_Externo.docx`.
Nombre canónico de la versión: **v1.2** (comentarios, archivos, commits).
El texto interno del documento se identifica como "v1.1" en varios
lugares (portada, §5, §11.2, §16, §18) porque el contenido no se
actualizó tras el cambio de nombre del archivo — **no es un error a
corregir**: las citas textuales que incluyan "v1.1" se citan tal cual.

**FPV previo en producción — NO es fuente de este motor.** Existe hoy un
FPV anterior corriendo (`fpv.html` + migraciones SQL 008/009 + panel en
`workbook.html`); ver el informe de auditoría `INVENTARIO_FPV_ANTIGUO.md`.
Es un enfoque distinto (6 preguntas, 2 actores, motor de media + banda de
3 niveles). motor-fpv obedece **exclusivamente** el Documento Técnico
v1.2 — nada del sistema viejo (sus 6 preguntas, su tabla `respuestas_fpv`,
el gate N≥8, el flag de incoherencia con el IAO) se retrofitea.

## Sin motor de referencia — a diferencia de IFD

IFD tenía un motor Python verificado (`ifd_v1_2_1_engine_...py`) como
oráculo de contraste en cada fase. **FPV no tiene nada equivalente.** El
documento es autocontenido: define su propio pseudocódigo (§14) y no
menciona ningún motor previo.

El único oráculo numérico es la **tabla de estrés de §10** — 5 escenarios
sintéticos con `L`, mediana, `H`, `C` ya calculados en el texto.
Re-verificados a mano contra las fórmulas del documento, las 5 cuadran
exacto (incluida la delicada: distribución uniforme `1,2,3,4,5` →
`H = 50·(0.04·40) = 80`, `C = 20`). Se reproduce como batería a partir de
Fase 2 — aquí el "oráculo" **es el texto del documento**, no un programa
aparte; no hay subprocess de Python que llamar.

| Escenario | Respuestas | L | Mediana | H | C |
|---|---|---|---|---|---|
| Neutralidad uniforme | 3,3,3,3,3 | 50 | 3 | 0 | 100 |
| Extremos enfrentados | 1,1,5,5 | 50 | 3 | 100 | 0 |
| Cercanía 3–4 | 3,3,4,4 | 62.5 | 3.5 | 25 | 75 |
| Máximo favorable | 5,5,5,5 | 100 | 5 | 0 | 100 |
| Distribución uniforme | 1,2,3,4,5 | 50 | 3 | 80 | 20 |

## Frase rectora (§18) — equivalente a la de IFD §0

> ANTE EVIDENCIA INSUFICIENTE, FPV DEBE MOSTRAR INCERTIDUMBRE O NO
> CALCULAR; NUNCA COMPLETAR LA EVIDENCIA QUE NO EXISTE.

## Plan de fases (aprobado antes de escribir código)

| Fase | Alcance (§) |
|---|---|
| **0** | Contratos: `FPV_INPUT` §14, enums (posición §4, sensor §3, valores de respuesta §6, estatus §8), escala `s(r) = 25·(r−1)` §6, semántica NE/NR §6. |
| **1** | Nivel Persona §7.1: `F = s(rF)`, `P = s(rP)`, `V = s(rV)`; NE/NR → dimensión no calculable, sin completar con las otras. |
| **2** | Nivel poblacional por sensor §7.2 A/B/C: `L`, mediana, distribución `p₁..p₅`, heterogeneidad `H = 50·Σᵢ Σₖ pᵢpₖ\|i−k\|`, consenso `C = 100 − H`. **Tabla de estrés §10 como oráculo.** |
| **3** | Cobertura §7.2.D + estatus §8: `CE`, `PR`, `CV`; escalera NO_CALCULABLE → DESCRIPTIVO → CENSAL → INFERENCIAL. |
| **4** | Configuración F–P–V §7.3: muestra emparejada `Ncfg`, `LF-star/LP-star/LV-star`, brecha `G = max − min`, dimensión limitante/fortalecida. **NUNCA promedio global F+P+V.** |
| **5** | Ponderación §9: `Lⱼ,w`, `pₖ,w`, `H` sobre `pₖ,w`; por defecto no ponderado; conserva `n` no ponderado. |
| **6** | Orquestador `runFPV` §7/§11/§14: las 3 posiciones → `FPV-C / FPV-I / FPV-P` + salida configuracional; disciplina de salida §19.8 (L nunca sin H + distribución cuando la salida es poblacional); §11 (sin índice global). |

## Reaperturas de código ya comiteado

Misma disciplina de trazabilidad que en CFF/IFD: cuando una fase
posterior corrige algo ya comiteado, se documenta aquí (commit propio, no
mezclado con el trabajo de la fase que lo motivó).

| Qué se reabrió | Desde | Por qué | Commit |
|---|---|---|---|
| *(ninguna todavía)* | | | |

## Decisiones A-I (aprobadas por Luis antes de escribir código)

Donde el documento deja algo abierto o sin operacionalizar, se anota como
**decisión de diseño**, no como lectura cerrada del texto — misma
honestidad que "dirección adversa" (IFD §21.2), `unit` (IFD §23.1),
"homogéneo" (IFD §32).

- **A — forma de `respuestas`**: un registro por Persona,
  `{ persona_id, posicion, F, P, V, peso? }`. Lo más fiel a
  `respuestas[id_persona][F,P,V]` del §14; hace trivial la muestra
  emparejada de §7.3.
- **B — un solo `FPV_INPUT`** con las 3 posiciones mezcladas; el motor
  agrupa por `posicion` y emite las 3 salidas (patrón `agregarEPDs` de
  IFD). No 3 llamadas separadas.
- **C — `NR` explícito.** Un valor de sensor es `1..5 | 'NE' | 'NR'`. Un
  campo genuinamente ausente / `undefined` → **error de esquema**, NO
  `'NR'` silencioso (§6: NE y NR se "registran", no se infieren).
- **D — `diseño_muestral` declarado por el llamante** (decisión de diseño
  — §8 no da número para "Censal" ni campo para "es probabilística").
  `posiciones.<POS>.diseno = { probabilistico: boolean,
  modelo_documentado: boolean }`. **Limitación inherente, anotada con la
  misma honestidad que el resto**: el motor **no puede verificar** que
  `modelo_documentado: true` sea cierto — solo registra la afirmación. Un
  llamante que mienta puede inflar el estatus a `INFERENCIAL` sin que el
  motor lo detecte. No es un defecto: el diseño muestral vive **fuera** de
  los datos que el motor ve; §18 dice que el motor "nunca completa la
  evidencia que no existe" — tampoco la audita. El umbral de cobertura
  para `CENSAL` (`PARAMS.UMBRAL_CENSAL_CV`) es **calibrable**
  (`PENDIENTE_CALIBRACION`) — §8: "deberán calibrarse en el piloto y
  quedar versionados como parámetros del motor".
- **E — `persona_id` único por posición** (par `(posicion, persona_id)`
  único). **Decisión de diseño, no deducida del texto**: el documento
  **no contempla** que una Persona participe en más de una posición
  simultáneamente (§4: 3 "lógicas predominantes" distintas; §7 opera "por
  posición"; toda estadística es "dentro de una posición" — pero en
  ningún punto dice que sean mutuamente excluyentes ni lo contrario). Si
  el mismo `persona_id` aparece bajo dos posiciones, el motor los trata
  como **dos respondientes independientes** (uno por posición) — nunca
  los une.
- **F — `N_elegibles` por posición** (opcional en cada una). El universo
  de Consumidor ≠ el de Inversionista (§7.2.D: `PR = nrespondentes /
  N_elegibles`).
- **G — `peso wᵢ` escalar por persona**; la normalización ocurre
  por-sensor sobre las respuestas válidas de ese sensor (persona con
  `V='NE'` → su peso cuenta para F y P, no para V). Fase 5.
- **H — el `FPV_OUTPUT` lleva la distribución `p₁..p₅` + conteos, no la
  lista cruda por persona.** §11.1 lista los campos obligatorios de
  salida; la lista individual no está entre ellos (es el input, el
  llamante la conserva). §6/§1: "conserva siempre la respuesta original"
  se satisface con la distribución completa.
- **I — v1.2** en archivos, comentarios y commits; citas textuales con
  "v1.1" tal cual.

## Fase 0 — contratos, enums, escala

### `enums.js`
- `ENUMS.POSICION` = `['CONSUMIDOR','INVERSIONISTA','PROVEEDOR']` — palabras
  completas: la 'P' de posición colisiona con el sensor P
  (Proporcionalidad). "FPV-C/I/P" del §11 son etiquetas, no claves.
- `ENUMS.SENSOR` = `['F','P','V']`.
- `ENUMS.RESPUESTA_ESPECIAL` = `['NE','NR']` — §6, nunca fusionadas.
- `ENUMS.ESTATUS_SENSOR` = `['NO_CALCULABLE','DESCRIPTIVO','CENSAL','INFERENCIAL']` — §8.
- `s(r)` = `25·(r−1)`, solo enteros 1–5 (lanza para 0, 6, 3.5, 'NE', 'NR').
- `PARAMS.UMBRAL_CENSAL_CV` = 80 %, `PENDIENTE_CALIBRACION` (§8).

### `contratos.js`
- `clasificarValorRespuesta(v)` → `'ORDINAL' | 'NE' | 'NR' | 'INVALIDO'` —
  **única fuente** de la distinción NE≠NR (patrón `validarAtribucionCategoria`
  de IFD). `undefined`/`null`/`0`/`6`/`3.5`/`'3'`/`'ne'` → `'INVALIDO'`.
- `validarFPVInput(obj)` — `respuestas` (≥1) + `posiciones?`. Valida forma
  de cada persona, unicidad de `persona_id` por posición, y la forma de
  `diseno`/`N_elegibles`.
- `validarFPVOutput(obj)` — **Fase 0: ligera.** Solo el esqueleto (las 3
  posiciones presentes) + rechazo de cualquier clave de índice global
  (`fpv_global`, `indice_fpv`, …) (§11). **Hueco conocido para Fase 6**:
  la forma interna de cada sensor y de la salida configuracional no se
  hace cumplir todavía.

### Batería
`node motor-fpv/contratos.test.js` → **49 asserts, 0 fallos** + **4
mutaciones** (ejecutadas sobre copias reales, revertidas):
1. `clasificarValorRespuesta`: `'NR'` → `'NE'` (fusionar) → "NE y NR se
   clasifican DISTINTO" falla (2 rojos).
2. `s(r)`: quitar la cota `r > 5` → "s(6) lanza" falla (1 rojo).
3. `validarFPVInput` sin el chequeo de unicidad → "mismo persona_id dos
   veces en la misma posición → inválido" falla (1 rojo).
4. `validarFPVOutput` sin la lista de claves prohibidas → "`fpv_global`
   → RECHAZADA" falla (2 rojos).

## Fase 1 — nivel Persona §7.1

### `persona.js`
- `sensorPersona(valor)` — §7.1: respuesta válida `1–5` → `{ valido:true,
  r, s: s(r) }` (directo, sin promedio interno — un solo ítem por sensor).
  `'NE'` o `'NR'` → `{ valido:false, motivo }`.
- `perfilPersona(respuesta)` — `{ persona_id, posicion, F, P, V, completo,
  peso }`. `completo` sii F, P y V son los tres válidos (§7.1). Una
  dimensión NE/NR **no se completa con las otras dos** — su `s`
  simplemente no existe. `peso` se propaga tal cual; sin peso → `null`
  (§9: por defecto no ponderado, no se inventa un 1).

### NE y NR a nivel Persona — MISMO efecto, verificado con cita
§7.1 (línea 404) literal: *"Si una dimensión es **NE o NR**, esa dimensión
queda **no calculable** para la Persona. **No se completa con las otras
dos.**"* — una sola condición, un solo efecto. `sensorPersona` mapea
ambos a `{ valido:false }`.

**La distinción NE≠NR es de CLASIFICACIÓN (§6), no de tratamiento a este
nivel.** Sí tiene efecto aguas abajo:
- **Cobertura `CE` (§7.2.D / §14 línea 875)**: `CE = n_v / (n_v + n_NE)`
  — NE cuenta en el denominador, NR no. (Fase 3.)
- §14 (línea 853) conserva `n_valido / n_NE / n_NR` por separado. `n_NR`
  **no entra en ninguna fórmula del documento** — solo trazabilidad.

**Conservar el `motivo` en la salida de `sensorPersona` es una decisión
de arquitectura, no una necesidad del documento.** §7.1 no exige que la
distinción se propague por esta capa; Fase 3 podría volver a leer el
valor crudo del input. Se elige pasarlo por aquí para que Fase 2/3 no
re-clasifiquen cada respuesta — es una elección de *dónde vive la
clasificación*.

Los demás niveles tratan NE y NR idéntico: `nᵥ` = "respuestas válidas 1–5"
(§7.2, §14 línea 851) excluye ambos; `Ncfg` (§7.3 línea 480) = "Personas
con rF, rP y rV válidos" excluye ambos.

### Batería
`node motor-fpv/persona.test.js` → **28 asserts, 0 fallos** + **4
mutaciones** (ejecutadas sobre copias reales, revertidas):
1. `sensorPersona`: la rama `'NR'` devuelve `{ valido:true }` (sin `s`
   ni `r`) → **5 rojos** ("NE/NR ambos `valido:false`", "NR → motivo NR",
   "F=NR → no completo", "cada dimensión conserva su motivo", "las 3 en
   NR"). (Si la mutación además pusiera `s:0` rompe 2 más — la forma
   canónica es solo el flip de `valido`.)
2. `perfilPersona` completa `V.s` con `(F.s+P.s)/2` cuando V es NE →
   **1 rojo** ("V.s NO existe, no se completa con (F+P)/2").
3. `completo` con `OR` en vez de `AND` → **3 rojos** (los 3 casos "no
   completo" pasan a `completo`).
4. `sensorPersona` no conserva `motivo` para NE → **3 rojos** ("NE →
   motivo NE", "V no calculable motivo NE", "cada dimensión conserva su
   motivo").

## Fase 2 — nivel poblacional por sensor §7.2 A/B/C

Segundo de los tres niveles del motor (§7: "Persona, población por
posición, configuración F–P–V"). `poblacionalSensor` opera sobre los
`perfilPersona` de **una** posición y **un** sensor — la agrupación por
posición es del orquestador (Fase 6).

### `poblacional.js`
- `poblacionalSensor(perfiles, sensor)` → `{ sensor, estatus, nv, nNE,
  nNR, L, mediana, p, H, C }`.
  - **`nᵥ`** = respuestas válidas 1–5 (§7.2 / §14 línea 851). NE y NR
    quedan **ambos fuera** de `nᵥ`; `nNE` y `nNR` se conservan por
    separado (§14 línea 853) — `nNE` lo usará `CE` en Fase 3; `nNR` es
    solo trazabilidad.
  - **`nᵥ = 0` → `estatus: 'NO_CALCULABLE'`** y `L/mediana/p/H/C = null`
    (§14 línea 855: *"si n_valido = 0: estado_j = NO_CALCULABLE"*). Con
    `nᵥ ≥ 1` → `DESCRIPTIVO` (§8: "existe al menos una respuesta válida").
    El resto de la escalera (`CENSAL` / `INFERENCIAL`) es Fase 3 — necesita
    `N_elegibles` y el diseño declarado.
  - **`L`** = `(1/nᵥ)·Σ s(rᵢ)` (§7.2.A). **`mediana`** de la respuesta
    **original** 1–5 (§7.2.A); `n` par → promedio de los dos centrales,
    puede dar `x.5` (`[3,3,4,4] → 3.5`, tabla §10).
  - **`p`** = `{ 1..5 }` con `pₖ = nₖ/nᵥ` (§7.2.B), `Σ pₖ = 1`.
  - **`H`** = `50·Σᵢ Σₖ pᵢpₖ|i−k|` (§7.2.C), **`C` = `100 − H`**.
- **`H` se calcula desde conteos, no desde `p`.** Sustituyendo `pᵢ =
  nᵢ/nᵥ` en la fórmula de §7.2.C: `H = 50·(Σᵢ Σₖ nᵢ nₖ |i−k|) / nᵥ²` — la
  **misma fórmula**, con la suma interna en aritmética entera. Así las 5
  filas de §10 salen **exactas** (la delicada: uniforme `1,2,3,4,5` →
  `50·40/25 = 80`, no `80.000…01`). No es una fórmula distinta.

### `bandasDescriptivas(p)` — helper SEPARADO, presentación opcional
§7.2.B: *"Para lectura rápida pueden mostrarse además tres bandas
descriptivas: Desacuerdo = p1+p2; Neutralidad = p3; Acuerdo = p4+p5.
Estas bandas no sustituyen la distribución completa."*

**Decisión de diseño (confirmada por Luis):** las 3 bandas **no** están
en el "contenido obligatorio" de §11.1 (`L, mediana, distribución, H, C,
CE, n válido y NE`) ni son una de las "cuatro salidas simultáneas" de
§7.2. Se calculan como **helper aparte** — `poblacionalSensor` devuelve
**solo** el núcleo obligatorio, nunca las bandas. Un test estructural lo
fija: las bandas no pueden aparecer entre las claves de la salida. El
orquestador (Fase 6) decide si las expone.

### Oráculo §10 — la tabla de estrés como batería
Las 5 filas de §10 se reproducen **exactas** (`near` a 1e-9, aunque de
hecho salen enteras) construyendo perfiles de una posición donde el
sensor toma los valores de cada escenario:

| Escenario | L | Mediana | H | C |
|---|---|---|---|---|
| `3,3,3,3,3` | 50 | 3 | 0 | 100 |
| `1,1,5,5` | 50 | 3 | 100 | 0 |
| `3,3,4,4` | 62.5 | 3.5 | 25 | 75 |
| `5,5,5,5` | 100 | 5 | 0 | 100 |
| `1,2,3,4,5` | 50 | 3 | 80 | 20 |

### Batería
`node motor-fpv/poblacional.test.js` → **55 asserts, 0 fallos** + **4
mutaciones** (ejecutadas sobre copias reales, revertidas):
1. `heterogeneidad`: `Math.abs(i - k)` → `(i - k)` (quitar el valor
   absoluto) → `Σ nᵢnₖ(i−k) = 0` por simetría → **toda `H` colapsa a 0**
   → **10 rojos**. ("H + C = 100 siempre" NO cae: `0 + 100 = 100`.)
2. `L`: `sumaS / nv` → `sumaS` (olvidar dividir por `nᵥ`) → **9 rojos**.
3. `mediana` `n` par: `(s[m-1] + s[m]) / 2` → `s[m]` (tomar solo el
   central alto) → **4 rojos** (`[1,1,5,5]→5`, `[3,3,4,4]→4` y sus dos
   filas de §10).
4. `poblacionalSensor` agrega `bandas: bandasDescriptivas(p)` a su
   retorno → **2 rojos** (§7.2.B es opcional, no contenido obligatorio
   §11.1 — la salida del núcleo no las lleva).

**Total motor-fpv tras Fase 2: 132 asserts** (contratos 49, persona 28,
poblacional 55), 0 fallos.

## Fase 3 — cobertura §7.2.D + escalera de estatus §8

Tercera de las "cuatro salidas simultáneas" de §7.2 (nivel, distribución,
heterogeneidad, **cobertura**). `coberturaSensor` toma el resultado de
`poblacionalSensor` (Fase 2) y le añade `CE`, `CV` y el `estatus` de §8;
`PR` se calcula a nivel **posición** (no lleva subíndice ⱼ en §14).

### Fórmulas, verbatim
- `CEⱼ = 100·nᵥ/(nᵥ + nNE)` — §14 l.875 *"si denominador > 0"*; si no → `null`.
- `CVⱼ = 100·nᵥ/Nelegibles` — solo con `N_elegibles` (> 0); si no → `null`.
- `PR = 100·nrespondentes/Nelegibles` — nivel posición.

### `cobertura.js`
- `coberturaSensor(pob, diseno?, N_elegibles?)` → `pob` + `{ CE, CV,
  estatus, censal_aplica, inferencial_aplica, intervalos_permitidos }`.
- `participacionPosicion(perfiles, N_elegibles?)` → `{ nrespondentes, PR }`.

### DESVIACIÓN DELIBERADA del pseudocódigo §14 (decisión E)
§14 hace `continuar` inmediatamente tras `estado_j = NO_CALCULABLE`
(`nᵥ = 0`), lo que **en la letra del pseudocódigo salta también el cálculo
de CEⱼ**. Este motor **no sigue esa rama**: calcula `CE` (y `CV`) también
cuando `nᵥ = 0`. Para un sensor todo-NE, `CE = 100·0/(0+nNE) = 0` es
información real ("0 % de quienes se involucraron tiene experiencia
suficiente"). Es una **desviación del pseudocódigo, nombrada como tal** —
no una lectura de él. Lo único que `nᵥ = 0` sí anula es el **nivel** (§8
fila 1: "no se produce nivel"). El comentario de cabecera de `cobertura.js`
la marca con la etiqueta explícita `DESVIACIÓN DELIBERADA`.

### Escalera de estatus §8 (decisión B — no estrictamente monótona)
`CENSAL` depende de *cobertura*, `INFERENCIAL` depende de *diseño* — son
upgrades **independientes** sobre el piso `DESCRIPTIVO`:

| Estatus | Condición | Fuente |
|---|---|---|
| `NO_CALCULABLE` | `nᵥ = 0` — **piso duro**, gana a cualquier diseño | §8 fila 1 |
| `DESCRIPTIVO` | `nᵥ ≥ 1` | §8 fila 2 |
| `CENSAL` | `CV ≥ PARAMS.UMBRAL_CENSAL_CV` (80 %, `PENDIENTE_CALIBRACION`) | §8 fila 3 + decisión D |
| `INFERENCIAL` | `diseno.probabilistico === true` **o** `diseno.modelo_documentado === true` (§8 usa "o") | §8 fila 4 |

Se reporta el **más alto aplicable**, precedencia `INFERENCIAL > CENSAL >
DESCRIPTIVO`. `nᵥ = 0` → `NO_CALCULABLE` **siempre** (no hay lectura
inferencial de un nivel que no existe). Los booleanos `censal_aplica` /
`inferencial_aplica` viajan en la salida para que el llamante vea *por
qué* el estatus es el que es.

### Decisión F — INFERENCIAL habilita intervalos, no los calcula
`intervalos_permitidos: true` cuando el estatus es `INFERENCIAL`. Fase 3
**no** calcula el intervalo: exige metadata de diseño (estratos,
conglomerados, ponderaciones — §8/§14) que el input no lleva, y §15 pide
"análisis de sensibilidad antes de introducir cualquier ponderación,
umbral o índice". Se expone el **permiso**, no el número.

### Decisión D (ya anotada) — lo que el motor no audita
`diseno.probabilistico` / `diseno.modelo_documentado` los **declara el
llamante**. El motor los registra, no los verifica: un llamante que mienta
puede inflar el estatus a `INFERENCIAL`. Igual con `N_elegibles` — no se
comprueba que `≥ nᵥ`; si el marco es inconsistente `CV` puede pasar de 100
(señal visible de input malo, no se recorta ni se oculta).

### `nrespondentes` (decisión D)
Personas que **enviaron** respuesta a esa posición, aunque sea toda NE/NR
— un `perfilPersona` existe por cada fila de `respuestas`. La unicidad
`(posicion, persona_id)` ya la fuerza `validarFPVInput`.

### Batería
`node motor-fpv/cobertura.test.js` → **44 asserts, 0 fallos** + **6
mutaciones** (sobre copias reales, revertidas):
1. `escaleraEstatus` sin el piso `nv === 0` → **3 rojos**.
2. `CENSAL`: `CV >= UMBRAL` → `CV > UMBRAL` → **1 rojo** (borde `CV = 80`).
3. `disenoHabilitaInferencia`: `||` → `&&` (exigir ambos) → **6 rojos**.
4. `coberturaExperiencial`: denom `nv + nNE` → `nv` → **4 rojos**.
5. **Decisión E revertida** (reintroducir el `continuar` de §14, `nᵥ=0` →
   `CE/CV = null`) → **3 rojos**. Esta mutación es la que fija la
   desviación como intencional.
6. `participacionPosicion` sin la guarda de `N_elegibles` → `PR = NaN` en
   vez de `null` → **1 rojo** (`esNull` distingue `NaN` de `null` —
   `JSON.stringify(NaN) === "null"` engañaría a un `eq` ingenuo).

**Total motor-fpv tras Fase 3: 176 asserts** (contratos 49, persona 28,
poblacional 55, cobertura 44), 0 fallos.

## Fase 4 — configuración F–P–V con muestra emparejada §7.3

Tercer y último nivel del motor. Compara F, P y V **dentro de una misma
posición** usando SOLO las Personas con las tres dimensiones válidas —
para no atribuir a la relación una brecha que en realidad viene de haber
calculado cada sensor con grupos distintos (§7.3).

### `configuracion.js`
`configuracionFPV(perfiles)` → `{ Ncfg, calculable, Lstar: {F,P,V}|null,
G, limitante: string[]|null, fortalecida: string[]|null }`

- `matched = perfiles.filter(p => p.completo)` — `completo` (Fase 1) ya es
  exactamente "F, P y V los tres válidos" (§7.1).
- `Lstar.F = (1/Ncfg)·Σ_matched p.F.s` — nivel `s(r)` 0–100 sobre el
  emparejado (§7.3 "se recalculan LF*, LP* y LV*"). Las marginales por
  sensor de Fase 2 (toda la evidencia válida) **siguen disponibles** — no
  se reemplazan.
- `G = max(Lstar) − min(Lstar)` (§7.3 — "desbalance interno, no deterioro").
- **No hay promedio F+P+V** — §7.3 y §14 lo prohíben explícitamente, igual
  que §11 con el índice global. Un test estructural fija el conjunto exacto
  de claves de la salida.

### Ambigüedades (todas confirmadas abiertas en el texto)

- **A — `Ncfg = 0`**: §14 "si Ncfg > 0" → `{ Ncfg:0, calculable:false,
  Lstar:null, G:null, limitante:null, fortalecida:null }`. Paralelo a
  `NO_CALCULABLE`.
- **B — `Ncfg = 1`**: se calcula, sin piso artificial (§8: sin tamaño de
  muestra universal pre-piloto). El llamante ve `Ncfg=1` y juzga. Mismo
  patrón que Fases 2–3.
- **C — sin campo `estatus`**: §11.2 lista los campos de la salida
  configuracional y **no incluye estatus**. No se inventa uno; `calculable`
  (= `Ncfg > 0`) es lo único que se reporta sobre suficiencia. La escalera
  CENSAL/INFERENCIAL es de sensores (§8), no de esta salida derivada.
- **D — empates → arrays**: `limitante` / `fortalecida` son arrays
  (normalmente `['F']`, `['F','P']` en empate). §11.2 usa singular y no
  contempla empates; elegir el primero en orden ocultaría el otro.
  **Caso `G = 0`** (las tres iguales, tratado explícitamente): `limitante`
  y `fortalecida` son **ambos `['F','P','V']`** — NO se suprimen a `null`.
  `G = 0` ya es la señal de "sin desbalance"; hacer que el motor decida
  "no hay limitante cuando está balanceado" sería una regla que el texto
  no da. El array con las tres es el resultado mecánico y honesto.
- **E — no se recalcula distribución/H sobre el emparejado**: §7.3 y §14
  dicen "se recalculan LF*, LP* y LV*" — SOLO los niveles. El "distribución
  e heterogeneidad visibles" de §11.2 se satisface con la salida por sensor
  de Fase 2 y es disciplina de presentación → Fase 6. Un test estructural
  fija que la salida configuracional no trae `p`/`H`/`C`.
- **F — sin ponderación**: §9 es "no ponderado por defecto"; el `Lstar`
  ponderado, si lo hay, se layerea en Fase 5.

### Batería
`node motor-fpv/configuracion.test.js` → **48 asserts, 0 fallos** + **6
mutaciones** (sobre copias reales, revertidas):
1. `matched`: `p.completo === true` → `p != null` (incluir incompletos) →
   **11 rojos**.
2. `G`: `max − min` → `max` → **4 rojos**.
3. `limitante`/`fortalecida`: `=== min` ↔ `=== max` (intercambiados) →
   **7 rojos**.
4. `SENSORES.filter(...)` → `SENSORES.find(...)` (string, no array) —
   colapsa la decisión D a "el primero en orden" → **9 rojos** (incluye
   empates y el caso `G = 0`).
5. quitar la guarda `Ncfg === 0` → `Lstar = 0/0 = NaN` (no `null`) →
   **5 rojos** (`esNull` distingue `NaN`).
6. suma con `p.F.r` (crudo 1–5) en vez de `p.F.s` (normalizado 0–100) →
   **18 rojos**.

**Total motor-fpv tras Fase 4: 224 asserts** (contratos 49, persona 28,
poblacional 55, cobertura 44, configuración 48), 0 fallos.

## Ambigüedades del documento — resueltas (ver Decisiones A-I)

El documento deja abierto, y se resuelve como decisión de diseño de Luis:
la escalera de estatus §8 (**D** — sin número para "Censal", sin campo
para "probabilística"), la unicidad de `persona_id` frente a una persona
en múltiples posiciones (**E** — el texto no lo contempla). Todo lo demás
(9 preguntas, escala, NE/NR, `s(r)`, `L`, `p`, `H`, `C`, `CE`, muestra
emparejada, `G`, ponderación) está definido en el texto sin ambigüedad —
§18 lo declara "cerrado conceptualmente".

## Qué NO hace este módulo

- No promedia F + P + V ni combina posiciones — **no hay índice FPV
  global** (§11).
- No retrofitea nada del FPV viejo en producción (ver
  `INVENTARIO_FPV_ANTIGUO.md`).
- No asigna automáticamente "alto"/"bajo" mediante umbrales — el
  pre-piloto no los tiene (§12).
- No audita el diseño muestral que el llamante declara (decisión D).
- No se conecta a `motor-iao`/AIE — el contraste AIE↔FPV vive en "la capa
  de inteligencia estratégica" (§16), fuera de este motor.
- No hace merge a `main` sin aprobación.
