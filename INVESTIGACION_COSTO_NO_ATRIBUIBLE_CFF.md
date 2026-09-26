# Investigación — visibilidad del costo no atribuible / no calculable en `CFF_RESULT`

**Estado: investigación, cero diseño.** Insumo para la ronda pendiente
del informe ejecutivo consolidado, no una pieza aislada. Responde las 3
preguntas de Luis con evidencia de código real **y con una corrida real
del motor** (matriz de 9 componentes, ver §1.2) — no solo lectura.

**Adelanto**: la premisa "solo se puede reconstruir sumando el `trace`"
es **parcialmente incorrecta, en ambas direcciones**. `CFF_RESULT` sí
tiene 2 totales propios para lo no atribuible (`exposure_total`,
`unresolved_impact_total`), pero (a) dejan fuera 4 categorías de
componente, y (b) `trace` **no** permite reconstruir montos — solo
lleva ids.

---

## 1. Pregunta 1 — forma exacta de `CFF_RESULT`

### 1.1 Campos relevantes (`contratos.js:462-497`, `ESQUEMA_CFF_RESULT`)

| Campo | Qué es |
|---|---|
| `cff_total` | Suma de los 4 cuadrantes admisibles (`CONFIRMED`/`SUPPORTED` × `OBSERVED`/`ESTIMATED`). Nulo **solo** si `INVALID` + cobertura `INSUFFICIENT` (regla 9, AC46). |
| `exposure_total` (opcional) | Suma de componentes con `monetization_status=EXPOSURE` (`consolidacion.js:412`). |
| `unresolved_impact_total` (opcional) | Suma de componentes con `attribution_status=UNRESOLVED` (`consolidacion.js:413`). |
| `coverage.unresolved_events` | **Conteo** (no monto) de componentes `UNRESOLVED` — se llama "events" pero cuenta componentes (`runCFF.js:448`). |
| `coverage.limitations` | Array de **strings** `"component_id: CATEGORIA"` (`runCFF.js:455-456`) — sin monto, sin objeto estructurado. |
| `coverage.excluded_material_events` | Ids de **eventos** con error, no de componentes excluidos. |
| `trace` (fuera de `CFF_RESULT`, `ESQUEMA_TRACE_PATH`, `contratos.js:540`) | Solo **ids**: `event_ids`, `component_ids`, etc. **Ningún monto.** |

Es decir, sí existen 2 números agregados de lo "no atribuible" — pero
**no existe** ningún número agregado para lo excluido por otras
razones.

### 1.2 Matriz ejecutada contra `calcularCff()` real

9 componentes, un solo evento, suma de valores de entrada = **3.899**.
Script: `scratchpad/matriz_cff_excluidos.js` (no comiteado, reproducible).

| Componente | Valor | Condición | ¿En qué total cae? |
|---|---|---|---|
| A | 1.000 | admisible (`CONFIRMED`/`OBSERVED`) | `cff_total` |
| B | 500 | `monetization=EXPOSURE` | `exposure_total` |
| C | 400 | `attribution=UNRESOLVED` | `unresolved_impact_total` |
| D | 300 | `EXPOSURE` + `UNRESOLVED` | **ninguno** (Opción D, deliberado, `consolidacion.js:31-51,400-409`) |
| E | 200 | `monetization=N_A` | **ninguno** |
| F | 150 | `attribution=N_A` | **ninguno** |
| G | 250 | `LOST_CAPACITY`/`AUSENTISMO` sin reconstrucción | **ninguno** (el motor fuerza `monetization=N_A`, `runCFF.js:206-214`) |
| H | 999 | `EXPOSURE`, **fuera del `node_set`** | **`exposure_total`** (ver hallazgo 2) |
| I | 100 | transferencia interna pura | ninguno (eliminación **intencional**, §14) |

Resultado real: `cff_total=1000`, `exposure_total=1499` (B+H),
`unresolved_impact_total=400` (C). Cuadre: 1000+1499+400 = 2.899;
faltan **1.000** = D 300 + E 200 + F 150 + G 250 + I 100. Descontando I
(no es un costo real, se elimina a propósito), **900 de valor
potencialmente relevante no aparece en ningún total**.

`trace.component_ids` sí contiene los 9 (verificado) y
`dependency_refs` también — pero son ids. Para recuperar los 900 hay
que cruzar esos ids contra los componentes de **entrada** (`original_value`/
`normalized_value`), no contra el `trace`.

### 1.3 Hallazgos secundarios de la misma corrida (no pedidos, relevantes al informe)

1. **G no aparece en `coverage.limitations`** — solo en `errors`
   (`LOST_CAPACITY_SIN_RECONSTRUCCION`, severidad `DEGRADED`). Se excluye
   antes de consolidar (`_excluidoValor`, `runCFF.js:341`), y
   `limitations` se arma solo con los excluidos **por consolidación**
   (`cons.coverageInput.componentes_excluidos`). Un lector que mire solo
   `limitations` no ve a G.
2. **H (fuera de alcance) suma a `exposure_total`.** Un componente que
   `admisibilidad` excluye por `scope_valid=false` igual entra al total
   de exposición del caso (`consolidacion.js:376-414` solo omite los
   excluidos por *relación de riesgo* y la doble falla, no los excluidos
   por alcance). Puede ser intencional ("permanecen visibles", §19) o un
   descuido — el código no lo dice; **no lo doy por defecto**, queda como
   pregunta.
3. **`event_profile`/`node_profile` no cuadran con `cff_total`**: suman
   **1.100** vs. `cff_total=1000`. La diferencia es I (transferencia
   interna pura, 100): `runCFF.js:434-437` arma `admisiblesFinales`
   filtrando solo por estados de monetización/atribución, no por lo que
   la consolidación realmente excluyó. El comentario del propio código
   dice "solo sobre lo que entró al total" — la ejecución muestra que
   no es exacto para este caso. **Ampliado en §6**: se probó después con
   4 tipos de exclusión (transferencia interna, fuera de alcance,
   `CONTAINS FULL`, `DUPLICATE`) y en los 4 los perfiles no cuadran con
   `cff_total`; en `DUPLICATE` reportan el doble conteo que el total evita.
4. **El contrato de entrada no puede declarar un impacto sin número.**
   `cff_event_components` exige `original_value` **o** el par
   `min`/`max` (`032:279-282`, verificado leyendo el DDL; no ejecuté un
   `INSERT` con ambos nulos). `monetization_status=N_A` existe, pero el
   componente sigue debiendo traer una cifra — que el motor luego
   ignora. Para el caso "detectamos el impacto pero no pudimos
   cuantificarlo" el analista tendría que poner un número que el motor
   descarta, o un rango (`ESTIMATED`).

---

## 2. Pregunta 2 — ¿qué es "no calculable" en `CFF`?

No es una sola cosa. Hay **cuatro estados distintos**, en dos niveles:

| Nivel | Estado | Significado | Tiene cifra en algún total |
|---|---|---|---|
| Componente | `monetization_status=EXPOSURE` | Hay un valor, pero es exposición, no costo realizado | `exposure_total` (salvo doble falla/relación de riesgo) |
| Componente | `attribution_status=UNRESOLVED` | Hay valor y monetización, pero la causa no se resolvió | `unresolved_impact_total` (idem) |
| Componente | `monetization_status=N_A` / `attribution_status=N_A` | Sin base para valorar/atribuir; el motor "no inventa cifra" (README: "mon=N_A no inventa cifra") | **Ninguno** |
| Resultado | `cff_total=null` ("`CFF=N_A`") | Cobertura `INSUFFICIENT`: no hay base para *ninguna* cifra; **nunca 0** (AC21/22/46, `cobertura.js:distinguirCeroDeNA`) | n/a |

Respuesta directa: **"no calculable" ≠ solo `N_A`.** La categoría que
más se parece a "detectamos el impacto pero no pudimos ponerle número"
es `monetization_status=N_A` — y es justamente la que **no llega a
ningún total ni a ningún conteo propio**. `EXPOSURE` sí lleva número,
así que no es "sin número".

---

## 3. Pregunta 3 — precedente en otros motores

Los tres resuelven "existe pero no se cuantificó" **con categorías y
conteos codificados por motivo, nunca con una cifra fabricada**:

- **`PIIO`** (`contratos.js:45-69`, `enums.js:131-135`): taxonomía
  `CERO_OBSERVADO` / `MISSING` / `NULL_CON_RAZON`. "Missing no es cero";
  `null` sin `MISSING` **exige** `absence_reason` (INV-PIIO-64). Cada
  ausencia queda clasificada y con razón por observación.
- **`IFD`** (`clasificacion.js:10-29`): `S1/CUALITATIVO` — la
  consecuencia existe pero se expresa **sin cifra**, y `status` distingue
  el **porqué** (`CUALITATIVO` por naturaleza vs
  `DEGRADADO_A_CUALITATIVO` por serie insuficiente) más `alerts`.
- **`FPV`** (`poblacional.js:17-21,98-104`): `nNE` y `nNR` se cuentan
  **por separado** y se conservan en la salida; `NO_CALCULABLE` es un
  estatus explícito, no un 0.

**Ninguno suma un monto de lo "no cuantificado"** (por naturaleza no
hay monto que sumar). Lo transferible a `CFF` es el patrón, no un
campo: **motivo codificado + conteo por motivo**. `CFF` ya tiene la
mitad (`limitations` con categoría) pero como strings sin conteo ni
agrupación, y con G fuera.

---

## 4. Qué se puede reportar hoy, con honestidad, en el informe ejecutivo

- **Sin tocar el motor**: `cff_total`, `exposure_total`,
  `unresolved_impact_total`, `coverage.overall_coverage_status`, y la
  lista de `limitations`. Un resumen que muestre solo `cff_total`
  oculta, en el caso de la matriz, **2.899 de 3.899** (74%; 100 de eso
  es la transferencia interna, eliminación intencional) — pero eso es
  del resumen, no del motor: los otros 2 totales ya existen y bastaría
  mostrarlos (con ellos quedan visibles 1.899 más; los 900 restantes
  siguen sin agregado).
- **Necesita trabajo (decisión de Luis, no propuesta)**: (a) los 900
  de D/E/F/G no están en ningún agregado — reconstruirlos exige unir
  ids con la entrada; (b) `limitations` es texto libre y omite a G;
  (c) 3 preguntas abiertas del motor (H en `exposure_total`, profiles
  vs. `cff_total`, y qué declarar cuando no hay cifra posible).

## 5. Preguntas abiertas para Luis (sin resolver por conveniencia)

1. ¿H (fuera de alcance) debe sumar a `exposure_total` del alcance del caso?
2. ¿`event_profile`/`node_profile` deben cuadrar con `cff_total`? Hoy no.
   **Investigada aparte, ver §6** — el documento no lo dice literalmente,
   pero el propio motor sí lo declara y lo incumple en 4 tipos de
   exclusión verificados.
3. ¿Se quiere un agregado por categoría de exclusión (conteo y/o monto)
   o basta con corregir `limitations`?
4. ¿Cómo debe declarar el analista un impacto detectado pero
   no cuantificable, dado que el esquema exige una cifra?

---

## 6. Pregunta 2, investigada aparte — ¿el documento dice que los perfiles deben cuadrar con `cff_total`?

**Método**: extraje el texto completo de ambos documentos técnicos
(`docs/EFICIENCIA_Documento_Tecnico_CFF_v1_1_FINAL_v2.docx` y
`EFICIENCIA_Documento_Tecnico_CFF_v1_1.docx`, 774 y 606 líneas) y busqué
literal: `event_profile`, `node_profile`, `mechanism_profile`,
`financial_nature_profile`, `perfil`, `profile`, `reconcil`, `cuadr`,
`coincid`, `suma de`, `desglos`, `por nodo`, `por evento`, y toda
`INV-CFF-*`/`AC*` que mencione total, suma o cuadrante.

### 6.1 Lo que el documento dice, textual

- **Los 4 perfiles aparecen solo como nombres de campo** en §22.8
  `CFF_RESULT` (`event_profile[] mechanism_profile[]
  financial_nature_profile[] node_profile[]`). **Ninguna sección define
  la forma de sus elementos, qué componentes entran ni contra qué
  deben cuadrar.** La palabra "perfil" no aparece en el cuerpo del
  documento (0 ocurrencias).
- **v1.1 (versión anterior)** tenía en su algoritmo el paso *"17.
  calculate coverage and profiles"*. **El FINAL v2 lo eliminó**: su §24
  usa `calculate_evidence_matrix_and_CFF()` → `resolve_coverage_and_status()`
  → `run_invariants()`, sin ninguna mención de perfiles.
- **La única reconciliación numérica explícita es la de los cuadrantes**:
  AC45 ("`CFF_TOTAL` no coincide con cuatro cuadrantes → Bloquear
  publicación") y §32 ("Los cuatro cuadrantes CONFIRMED/SUPPORTED ×
  OBSERVED/ESTIMATED reconstruyen `CFF_TOTAL`"). Los perfiles no se
  nombran ahí.
- **`INV-CFF-70`** (§ de invariantes, línea 519 del texto extraído):
  *"La cifra consolidada debe poder reconstruirse componente por
  componente."* Es reconstruibilidad de `cff_total`; **no nombra los
  perfiles como el mecanismo.**
- Colateral, relevante a las preguntas 1 y 3: §32 dice *"EXPOSURE,
  UNRESOLVED y N_A permanecen visibles y excluidos."*

**Respuesta literal a la pregunta**: el documento **no especifica** que
`event_profile`/`node_profile` deban sumar lo mismo que `cff_total`.

### 6.2 Lo que el motor ya declaró por su cuenta

- `motor-cff/runCFF.test.js:223-231` prueba **"INV-CFF-70 — Σ
  event_profile = cff_total"** y **"Σ mechanism_profile = cff_total"**.
  Es decir, los autores del motor **interpretaron** `INV-CFF-70` como
  "los perfiles suman `cff_total`" y lo pusieron como oráculo de
  aceptación. Esa interpretación no está en el README del motor (0
  menciones de "profile"/"perfil") — vive solo en ese test y en el
  comentario de `runCFF.js:441` (*"perfiles (solo sobre lo que entró al
  total; deterministas)"*).
- **Ese test solo cubre un caso sin exclusiones** (2 componentes
  admisibles), por eso pasa.

### 6.3 Verificación por ejecución — el motor incumple su propio oráculo, y no solo con transferencias internas

Script `scratchpad/perfiles_vs_total.js` (no comiteado, reproducible),
contra `calcularCff()` real, un componente base `A=1000` más un segundo
componente por caso:

| Caso | `cff_total` | Σ event / mechanism / node profile | ¿Cuadra? |
|---|---|---|---|
| Control: 2 componentes admisibles | 1500 | 1500 | sí |
| Transferencia interna pura (100) | 1000 | 1100 | **no** |
| `CONFIRMED`/`OBSERVED` fuera del `node_set` (900) | 1000 | 1900 | **no** |
| `CONTAINS FULL` (contenido de 400) | 1000 | 1400 | **no** |
| `DUPLICATE` sin resolver (1000 + 1000) | **null** | **2000** | **no** |

**Causa**: `runCFF.js:434-437` (`admisiblesFinales`) filtra **solo por
estado de monetización/atribución**, no por lo que la consolidación
realmente seleccionó. Todo componente excluido en consolidación
(alcance, relación, transferencia interna, costo compartido) pero con
estados admisibles **sigue entrando a los 4 perfiles**.

**El caso `DUPLICATE` es el más grave**: `cff_total` es `null` (el motor
se niega a sumar duplicados, `INV-CFF-20: "DUPLICATE no se suma"`) pero
los perfiles reportan **2000**, es decir, **el doble conteo que el total
evita aparece en los perfiles**. Un consumidor que lea `event_profile`
o `node_profile` para mostrar "cuánto por nodo" ve cifras que el propio
motor declaró inadmisibles.

**Efecto en `INV-CFF-70` tomado literalmente** ("reconstruir la cifra
consolidada componente por componente"): desde la salida no hay forma
de identificar qué componentes se seleccionaron — `trace.component_ids`
lista **todos** los considerados, `limitations` lista los excluidos por
consolidación pero **omite a los excluidos antes de consolidar** (G en
§1.2), así que `todos − limitations` tampoco reconstruye el total.

### 6.4 Conclusión honesta

Por la regla acordada: **el documento no lo especifica** → esta
pregunta se suma a las otras tres como decisión pendiente de Luis.
Pero con dos precisiones que Luis debe tener antes de decidir, porque
cambian el peso:

1. **No es una laguna de diseño neutra.** El motor **ya decidió** que
   los perfiles deben cuadrar (test `INV-CFF-70` + comentario "solo sobre
   lo que entró al total") y **lo incumple** en 4 de 4 tipos de
   exclusión probados. Aunque el documento no lo exija, el motor
   contradice su propio oráculo de aceptación.
2. **El daño no se limita a la transferencia interna**: el caso
   `DUPLICATE` muestra un doble conteo en los perfiles que `INV-CFF-20`
   prohíbe explícitamente para el total.

Las opciones (para decidir, no propuestas): (a) corregir los perfiles
para que se construyan solo sobre lo seleccionado en consolidación —
reapertura del motor, con test de exclusiones que hoy falta; (b)
declarar explícitamente que los perfiles son "por estado de
monetización/atribución, antes de consolidar" y renombrar/documentar
para que nadie los lea como desglose de `cff_total`; (c) eliminarlos de
la salida hasta decidir (el documento los lista en §22.8 sin
estructura). Cualquiera exige decisión de Luis; **no toco el motor**.
