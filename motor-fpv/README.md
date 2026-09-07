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
