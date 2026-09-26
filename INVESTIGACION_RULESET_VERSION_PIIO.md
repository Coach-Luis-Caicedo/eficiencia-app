# Investigación — ¿de dónde debe salir `ruleset_version` de PIIO?

**Estado: investigación con recomendación. Cero DDL, cero código.**
Insumo para cerrar `PENDIENTES_BRECHAS_WORKER_MOTORES.md` §6
(`leer_datos_piio` no devuelve `ruleset_version` → `calcular-piio` queda
`BLOCKED` con datos reales). Luis pidió decidir entre dos vías **con
evidencia, no por conveniencia**: (a) constante en el Worker, como
`RULESET_VERSION_CFF`; (b) valor persistido que `leer_datos_piio`
devuelva. Preguntas: (1) ¿varía entre organizaciones o es la misma
cadena para todo el sistema? (2) ¿qué dicen el README o el documento
técnico sobre qué lo gobierna?

**Adelanto**: no hay ninguna evidencia de variación por organización, y
el motor **no podría honrarla** aunque existiera (nunca ramifica según
el valor). La evidencia favorece (a). Pero al investigar apareció algo
que la constante **no** resuelve y que Luis debe conocer (§4).

---

## 1. Pregunta 1 — ¿varía entre organizaciones?

### 1.1 Cómo usa el motor el valor — verificado línea por línea

`grep` sobre todo `motor-piio` (sin tests): `ruleset_version` aparece en
solo cuatro tipos de uso, ninguno condicional sobre su **valor**:

| Uso | Dónde | Qué hace |
|---|---|---|
| Validación de forma | `contratos.js:389` | `if (!esStringNoVacio(obj.ruleset_version)) faltantes.push(...)` → sin él, `FORMA_INVALIDA` + `BLOCKED` |
| Huella de la corrida | `runPIIO.js:357` | `'rs=' + ruleset_version` como **un componente** de `calculation_version`, junto a `dc=`, `pc=`, `md=`, `rf=`, `nh=` (versiones de catálogos/definiciones/referencias/jerarquía) |
| Estampado en salidas | `runPIIO.js:381,413`, `efo.js:444-445,483` | copia el valor a `PIIO_RUN` y a cada estado; si es `null`, `RUN_METADATA_PENDIENTE` |
| Contrato de salida | `contratos.js:439` | exige que `EFO_STATE` lo lleve |

Búsqueda de comparaciones sobre el valor (`===`, `!==`, `switch`,
`.indexOf`, `.match`, `.startsWith`): **cero**. Las únicas condiciones
son `!= null` / `== null`. **El motor trata el valor como una etiqueta,
no como un selector de reglas**: pasarle `'rs-vieja'` no le hace usar
reglas viejas. Solo existe un juego de reglas — el del código
(`PARAMS` y sus derivaciones, `enums.js:143+`).

### 1.2 Cómo se almacena en el sistema

`grep -i ruleset` sobre migraciones, `src/` y los demás motores: solo
aparece en **dos** sitios — `piio_run.ruleset_version text`
(`030:372`, columna **de salida**, nullable) y la constante
`RULESET_VERSION_CFF = 'CFF-v1.1'` (`src/motores/cff.js:30`). No hay
ninguna tabla ni columna que asigne un ruleset a una organización;
`organizaciones` no tiene nada parecido. Además **ninguna migración
escribe `piio_run`** (cero `INSERT`/función), así que ni siquiera esa
columna se usa hoy.

### 1.3 Conclusión de la pregunta 1

- **No hay evidencia** de que varíe por organización: ningún dato, tabla
  ni rama de código lo distingue.
- **El motor no podría honrar una variación**: como no selecciona reglas
  por valor, una organización "en otra versión de reglas" no se
  calcularía distinto. Un valor por organización sería una **etiqueta
  que promete algo que el motor no cumple** — exactamente la
  "uniformidad/diversidad fabricada" que Luis quería evitar, pero en el
  sentido inverso al que sospechaba.
- El argumento de Luis (una organización antigua que no migró de
  catálogos) es real pero **ya está cubierto por otro mecanismo**: las
  versiones de catálogos, definiciones, referencias y jerarquía entran a
  `calculation_version` por separado (`dc=`, `pc=`, `md=`, `rf=`, `nh=`),
  y **sí** varían por organización. `ruleset_version` es la pieza
  **restante**: las reglas del motor.

**Corrección a un comentario del repo**: `src/motores/cff.js:26-30`
justifica que CFF use constante "a diferencia de motor-piio, que sí
tiene catálogos configurables por organización... trata ruleset_version
como insumo externo". Esa razón mezcla dos cosas: los catálogos
configurables ya tienen su propio componente en la huella y **no**
justifican que el ruleset sea por organización. La conclusión de CFF
(constante) es correcta; el motivo escrito ahí no lo es. No lo edito
aquí.

---

## 2. Pregunta 2 — ¿qué dicen el README y el documento técnico?

Documento técnico (`docs/Documento_Tecnico_PIIO_v1_1_FINAL.docx`,
extraído a texto, 818 líneas; búsqueda literal de `ruleset`, `reglas`,
`calibr`, `gobern`, `canónic`, `aprob`, `responsable`):

- §31 lista `ruleset_version` como campo de `PIIO_RUN`, y dice que un
  *"cambio de definición, referencia, catálogo, jerarquía o ruleset
  genera nueva corrida cuando afecta el resultado"*.
- `INV-PIIO-65`: *"Cambio material de ruleset genera nueva versión."*
  `AC67`: *"Cambio de ruleset PIIO → Nueva run/version."*
- §35: *"Los 80 casos de aceptación pasan **en el ruleset canónico**..."*
  — habla de **un** ruleset canónico contra el que se acepta el sistema.
- §30: *"Un error estructural de catálogo, jerarquía de nodos o ruleset
  puede bloquear la corrida."*

**El documento dice cuándo cambia (un cambio material) y que existe uno
canónico; no dice quién lo asigna, dónde vive ni si puede diferir entre
organizaciones.** No lo fuerzo: esa parte del *quién* está sin resolver
en el documento.

README de `motor-piio`: solo lo menciona como campo obligatorio de
`PIIO_INPUT` (línea 258) y como *"input o `null` + flag
`RUN_METADATA_PENDIENTE`"* (línea 935). Nada sobre gobernanza.

Comentario de código (`enums.js:139-140`): los parámetros del motor
*"quedan versionados como parámetros del motor, PENDIENTE_CALIBRACION"*
— es decir, las reglas se versionan **a nivel de motor**, no por
organización.

---

## 3. Recomendación: vía (a), constante — con condiciones

**Por qué (a)**: (i) no hay variación demostrable; (ii) el motor no
puede usar una variación aunque la hubiera; (iii) el documento habla de
un ruleset canónico; (iv) el código versiona sus parámetros a nivel de
motor. Persistir un valor (b) crearía una tabla o columna con **un solo
valor posible** y obligaría a inventar una gobernanza (quién lo cambia)
que el documento no da — más superficie sin ninguna capacidad nueva.
Además el motor no puede seleccionar reglas por versión, así que
persistirlo daría una falsa sensación de control.

**Forma concreta** (para decidir, no ejecutada):
- Constante en `src/motores/piio.js`, espejo de `cff.js`:
  `RULESET_VERSION_PIIO = 'PIIO-v1.1'` (nombre alineado con el documento
  técnico, mismo estilo que `'CFF-v1.1'`).
- Inyección **no destructiva**: `Object.assign({ ruleset_version:
  RULESET_VERSION_PIIO }, datosPiio)` — si algún día `leer_datos_piio`
  trae uno persistido, **gana ese**. Conserva la lectura del motor como
  "insumo externo" sin obligar a nadie a proveerlo.
- **Regla de incremento escrita junto a la constante**: subirla cuando
  cambie `PARAMS` o cualquier regla de derivación de `motor-piio`
  (`INV-PIIO-65`). Hoy **nada la hace cumplir** — es disciplina manual,
  igual que en CFF.

**Tres cosas que Luis debe decidir/aceptar antes**:
1. La cadena exacta (`'PIIO-v1.1'` es el nombre del *documento*; los
   valores de `PARAMS` aún están `PENDIENTE_CALIBRACION`, así que el
   primer cambio real de calibración exigirá subirla).
2. Que la constante sea disciplina manual, sin verificación automática.
3. Endurecer `worker.test.mjs` al cerrarla: la aserción actual
   (`piio_run` existe) acepta `BLOCKED`; debe exigir
   `run_status !== 'BLOCKED'`. **Ojo**: el mock actual usa catálogos
   vacíos; no sé si tras inyectar `ruleset_version` esos datos vacíos
   pasan a `COMPLETED` o siguen `BLOCKED` por otra validación — **no lo
   verifiqué**; habrá que probarlo al implementar, y probablemente el
   test necesite datos no vacíos.

---

## 4. Hallazgo colateral que la constante NO resuelve

(Registrado en `PENDIENTES_BRECHAS_WORKER_MOTORES.md` §9.)

Las calibraciones propias por organización (`umbralesTrayectoria`,
`umbralesPersistencia`, `umbralesEstabilidad`) son campos del
`PIIO_INPUT` (`runPIIO.js:189-190`, `phenomenon.js:543`) y **sí
cambian el resultado**, pero **no entran a `calculation_version` ni a
`ruleset_version`**. Verificado por ejecución sobre datos reales
(organización "deterioro"): sin calibración `KPI-CAL.traj =
DETERIORATING` (`CALIBRACION_GENERICA`); con `umbralesTrayectoria = {
band: 5 }` pasa a `STABLE` (`CALIBRACION_PROPIA`); `calculation_version`
**idéntica** en ambos casos.

Consecuencias para esta decisión:
- Aquí **sí existe** variación por organización de "las reglas
  efectivas" — pero viaja por otro canal y **no se refleja en ninguna
  versión**. Es probablemente lo que Luis intuía con "una organización
  en otra versión de reglas", aunque no tiene que ver con el ruleset.
- Cerrar §6 con una constante **no empeora ni arregla** esto: hoy
  `leer_datos_piio` no transporta ninguna calibración, así que ningún
  resultado del Worker la usa. El problema aparecerá cuando alguien
  construya el camino de calibración propia.
- Pregunta abierta: ¿la calibración propia forma parte del ruleset o es
  otra versión (p. ej. `calibration_version`)? Se decide cuando se
  diseñe ese camino, no ahora.

---

## 5. Resumen de decisiones para Luis

| # | Decisión | Mi recomendación |
|---|---|---|
| 1 | Vía (a) constante vs (b) persistido | (a), inyección no destructiva |
| 2 | Cadena de la constante | `'PIIO-v1.1'` (confirmar) |
| 3 | Regla de incremento | manual, junto a la constante |
| 4 | Endurecer `worker.test.mjs` | sí, exigir `run_status !== 'BLOCKED'`, con datos no vacíos |
| 5 | §9 (calibración fuera de la huella) | dejarla registrada; resolver al construir el camino de calibración |
