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
