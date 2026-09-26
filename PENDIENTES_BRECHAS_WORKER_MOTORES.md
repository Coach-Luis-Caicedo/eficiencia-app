# Pendientes — brechas Worker↔motor encontradas durante la simulación

Archivo consolidado, para no perder de vista ninguna. Regla de esta
sesión (confirmada por Luis en la ronda de `FPV`): **"nada debe quedar
sin probarse"** — si un motor puede hacer algo que el Worker
(`src/motores/*.js`) no ejercita todavía, no es una nota al margen, es
una **pieza de trabajo pendiente que bloquea dar por completa esa parte
de la simulación**. La resolución de cada entrada es **extender el
Worker**, nunca generar datos de prueba alrededor de la limitación.

Cada entrada se cierra con su propia ronda de diseño + construcción +
verificación (mismo estándar que cualquier cambio de código de esta
sesión) — no se resuelve dentro del encargo de generación de datos que
la encontró.

---

## 1. FPV — `CENSAL`/`INFERENCIAL`/ponderación inalcanzables

**Estado: RESUELTO — 2026-09-23, migración `043_config_posicion_fpv.sql`
(commit `be7a2e5`).** Última de las 3 brechas de esta ronda. Ver el
hallazgo original más abajo, sin editar, para no perder el rastro.

**Resolución aplicada**: tabla `motores_eficiencia.fpv_config_posicion`
(llave `(organization_id, posicion, period)` — mismo precedente que
`fpv_respuestas`, `032`, ya estableció: el motor no tiene concepto de
período propio, pero cada corrida corresponde a una ronda de
recolección distinta; columnas aplanadas, no `jsonb` — `diseno`/
`ponderacion` son formas fijas sin variantes condicionales, decisión
documentada en `INVESTIGACION_POSICIONES_FPV.md`), función
`registrar_config_posicion_fpv` (upsert) y `leer_config_posiciones_fpv`
(filtro exacto por período). `src/motores/fpv.js` gana
`ensamblarPosiciones()` (reconstruye la forma anidada que `runFPV`
exige) y `calcularFpv()` ya recibe `filasConfig`; `src/worker.js`
extendido con la llamada RPC nueva. Hallazgo secundario real durante la
investigación: `ponderacion` ni siquiera está validada por
`motor-fpv/contratos.js` (Fase 0) — solo se usa en `runFPV.js`, defecto
del validador del motor, fuera de alcance de este round. Diseño completo
en `DISENO_CONFIG_POSICION_FPV.md`.

Verificado con `pglite` bajo `SET ROLE authenticated` real (11/11
asserts, más verificación independiente de Luis: 8/8) y con la suite
completa de `worker.test.mjs` (40/40 — incluye una aserción que confirma
la ponderación activada de punta a punta,
`meta.posiciones.CONSUMIDOR.ponderado === true`, no solo que la llamada
RPC ocurrió; misma clase de regresión de mock detectada y corregida que
en `042`). Aplicado y verificado en Supabase con las 4 consultas
manuales del propio archivo de migración.

**Con esto, las 3 brechas Worker↔motor de esta ronda (PIIO, CFF, FPV)
quedan cerradas.**

<details>
<summary>Hallazgo original (histórico, sin editar)</summary>

**Estado original: PENDIENTE, bloqueante para dar por completa la
simulación de FPV.**

**Encontrado en**: `INVESTIGACION_SIMULACION_FPV.md` §3, ronda del script
de simulación de organizaciones de prueba.

**Hallazgo exacto**: `src/motores/fpv.js` (44 líneas completas,
verificado verbatim) construye únicamente
`runFPV({ respuestas: respuestas })` — nunca arma el bloque
`input.posiciones.<POS>` que `motor-fpv` (Fase 6, Decisiones A/D) exige
para:
- Escalar el estatus de un sensor más allá de `DESCRIPTIVO` — `CENSAL`
  necesita `posiciones.<POS>.diseno`/`N_elegibles` declarados por el
  llamante; sin eso, **ningún sensor puede llegar a `CENSAL` ni
  `INFERENCIAL`**, sin importar cuántas respuestas reales existan.
- Activar la ponderación — necesita `posiciones.<POS>.ponderacion.
  metodologia`, una bandera **por posición**. La columna
  `fpv_respuestas.peso` existe y sí llega al motor (`fpv.js:39`), pero
  sin esa bandera **no tiene ningún efecto observable** hoy.

**Por qué es del Worker, no de los datos**: no hay ninguna columna en
`fpv_respuestas`/`invitaciones_fpv` de donde leer `diseno`/`N_elegibles`/
`ponderacion.metodologia` — el bloque `posiciones` no tiene fuente en el
esquema actual. Generar más filas de `fpv_respuestas`, con cualquier
patrón, no cambia esto — el código que arma la llamada a `runFPV` es el
que falta.

**Resolución**: extender `src/motores/fpv.js` (y probablemente el
esquema, si `diseno`/`N_elegibles`/`ponderacion` deben persistirse en vez
de declararse en cada llamada) para construir el bloque `posiciones`
real. Ronda propia — diseño primero, mismo estándar de siempre.

**Bloquea**: la simulación de FPV no se considera completa hasta que
esto se resuelva — los 4 ejes ya identificados (consenso/polarización,
NE/NR, muestra completa/parcial, posición vacía) siguen siendo válidos y
se construirán, pero **además**, no en lugar de, los escenarios que
ejerciten `CENSAL`/`INFERENCIAL`/ponderación una vez que el Worker los
soporte.

</details>

---

## 2. CFF — `relaciones` siempre vacío, CONTAINS/DEPENDENT_COST inalcanzables

**Estado: RESUELTO — 2026-09-22, migración `042_relaciones_cff.sql`
(commit `737ea41`).** Ver el hallazgo original más abajo, sin editar,
para no perder el rastro.

**Resolución aplicada**: tabla `motores_eficiencia.cff_relaciones`
(transcripción de `ESQUEMA_ECONOMIC_RELATION`, §22.5 — FK doble contra
`cff_event_components`, 2 `CHECK` que replican las reglas condicionales
duras de `containment_scope`/`direction`), `registrar_relaciones_cff`
(en lote, upsert) y `leer_relaciones_cff` (filtro por solapamiento de
rango, no contención total). `src/motores/cff.js`/`src/worker.js`
extendidos para pasar relaciones reales en vez de `[]`. Diseño completo
en `DISENO_RELACIONES_CFF.md`, investigación en
`INVESTIGACION_RELACIONES_CFF.md`. Verificado con `pglite` bajo `SET
ROLE authenticated` real (15/15 asserts) + suite completa de
`worker.test.mjs` (37/37, incluida una regresión real detectada y
corregida antes de comitear: el test end-to-end no mockeaba la nueva
llamada RPC). Aplicado y verificado en Supabase con las 5 consultas
manuales del propio archivo de migración.

**De las 3 brechas de esta ronda, queda pendiente únicamente `FPV`
(§1).**

<details>
<summary>Hallazgo original (histórico, sin editar)</summary>

**Estado original: PENDIENTE, bloqueante para dar por completa la
simulación de CFF.**

**Encontrado en**: `INVESTIGACION_SIMULACION_CFF.md`, ronda del script de
simulación (tercer motor investigado, mismo rigor que `FPV`).

**Hallazgo exacto**: `src/motores/cff.js` construye el `caso` con
`relaciones: []` **hardcoded**, ya documentado explícitamente desde que
se escribió ese archivo (comentario propio: *"relaciones viaja vacío --
sin ESQUEMA_RELATIONSHIP formal que transcribir todavía"*). Pero
`motor-cff/relaciones.js` (verificado, no supuesto) sí implementa lógica
real y sustancial para esos dos tipos de relación:
- **`CONTAINS`** — resuelve solapamiento entre componentes
  (`FULL`/`PARTIAL_QUANTIFIED`/`PARTIAL_UNQUANTIFIED`, §13.1), y
  **detecta ciclos** en el grafo de contención (`validarGrafoContains`,
  §13.3/AC15) — un ciclo bloquea la consolidación afectada.
- **`DEPENDENT_COST`** — exige demostrar frontera económica distinta
  antes de sumar dos componentes (§13.2); sin resolver, no se suman.
- Ambos alimentan `relationship_resolution_permite_inclusion`
  (`consolidacion.js:348`) — una de las 5 señales de admisibilidad §18
  ya resueltas en `cff.js` — pero como no hay relaciones que procesar,
  esa señal nunca excluye nada en la práctica hoy: siempre permite,
  nunca bloquea, porque no hay grafo real contra el cual evaluarla.

**Por qué es del Worker, no de los datos**: `caso.relaciones` no tiene
ninguna fuente en el esquema de `motores_eficiencia` (`cff_events`/
`cff_event_components`, `032`) — no existe ninguna tabla ni función de
escritura para relaciones entre componentes. El script de simulación no
puede generar relaciones que no tienen dónde persistirse.

**Resolución**: diseñar `ESQUEMA_RELATIONSHIP` de persistencia (tabla +
función de escritura, mismo patrón que `cff_event_components`) y
extender `src/motores/cff.js` para leerlas y pasarlas a `runCFF` en vez
de `[]`. Ronda propia — diseño primero (forma exacta de
`component_a_id`/`component_b_id`/`relation_type`/`containment_scope`
condicional/`direction` condicional, ya verificados en
`motor-cff/contratos.js:378-409`), mismo estándar de siempre.

**Bloquea**: la simulación de CFF no se considera completa hasta que
esto se resuelva — los escenarios de admisibilidad/cobertura/alcance ya
alcanzables hoy (`INVESTIGACION_SIMULACION_CFF.md`) siguen siendo
válidos y se construirán, pero **además**, no en lugar de, los
escenarios `CONTAINS`/`DEPENDENT_COST` una vez que el Worker los
soporte.

</details>

---

## 3. PIIO — CERO funciones de escritura para las 7 tablas de entrada + `node_hierarchy`

**Estado: RESUELTO — 2026-09-22, migración `041_funciones_escritura_piio.sql`
(commit `6032ed3`).** Era el más grande de los tres encontrados esta
ronda. A diferencia de `FPV`/`CFF` (huecos parciales — el mecanismo
central sí funciona, falta un bloque de configuración), en `PIIO` **el
mecanismo central entero no tenía ningún camino de escritura** — ver el
hallazgo original más abajo, sin editar, para no perder el rastro de por
qué se coló.

**Resolución aplicada**: 8 funciones de escritura nuevas
(`registrar_dominio_piio`, `registrar_fenomeno_piio`,
`registrar_metric_definition_piio`, `registrar_reference_spec_piio`,
`registrar_kpi_spec_piio`, `registrar_evidence_group_piio`,
`registrar_observaciones_piio` en lote, `registrar_nodo_piio`), más el
cambio de esquema de `metric_definitions` a append-only (PK con
`definition_version`, mismo patrón que `reference_specs` — decisión
documentada en `INVESTIGACION_VERSIONADO_PIIO_CATALOGOS.md`;
`phenomenon_catalog` se mantuvo upsert simple, sin lógica de resolución
que el motor use hoy). Verificado con `pglite` bajo `SET ROLE
authenticated` real — 32 asserts, 0 fallos — y aplicado/verificado en
Supabase. Diseño completo en `DISENO_FUNCIONES_ESCRITURA_PIIO.md`.

**De las 3 brechas de esta ronda, quedan pendientes únicamente `FPV`
(§1) y `CFF` (§2)** — ~~el hallazgo secundario no bloqueante de PIIO
(4 campos de calibración que `leer_datos_piio()` no pasa)~~ —
**CORRECCIÓN 2026-09-25: ese hallazgo estaba mal clasificado.** De esos
4 campos, `ruleset_version` **sí bloquea** (`PIIO_INPUT` lo exige, sin
respaldo): verificado por ejecución contra producción, ver §6. El
resto de este párrafo sigue vigente para los otros 3 campos.

<details>
<summary>Hallazgo original (histórico, sin editar)</summary>

**Estado original: PENDIENTE, bloqueante — el más grande de los tres
encontrados esta ronda.** A diferencia de `FPV`/`CFF` (huecos parciales
— el mecanismo central sí funciona, falta un bloque de configuración),
en `PIIO` **el mecanismo central entero no tiene ningún camino de
escritura**.

**Encontrado en**: `INVESTIGACION_SIMULACION_PIIO.md`, ronda del script
de simulación (cuarto y último motor investigado).

**Hallazgo exacto, verificado exhaustivamente**: busqué `INSERT INTO`
contra cada una de las 7 tablas que `motores_eficiencia.leer_datos_piio()`
(`035`) lee — `domain_catalog`, `phenomenon_catalog`,
`metric_definitions`, `reference_specs`, `kpi_specs`, `evidence_groups`,
`observations` — y contra `node_hierarchy` (`031`), en las 40
migraciones completas. **Cero resultados en las 8.** `030` solo las
`CREATE TABLE`; ninguna migración posterior (`031`-`040`) agrega una
función `SECURITY DEFINER` que inserte en ninguna de ellas. Confirmado
también que las 8 tienen `REVOKE ALL ... FROM PUBLIC` (`030:405-406`,
blanket) — tampoco hay acceso directo de tabla como atajo.

**Por qué se coló sin notarse**: `MAPEO_ENTRADA_DATOS_WORKBOOK_NUEVO.md`
(la investigación original de esta sesión, mucho antes de construir
nada) marcó a `PIIO` como "🟢 Coincide" — pero eso significaba
únicamente que la **tabla** (`observations`, de una migración anterior a
este esfuerzo) ya tenía la forma correcta de `KPI_OBSERVATION`. Nunca
significó que hubiera una función de escritura. Las rondas de `033`/
`034` construyeron 9 funciones "para los 5 motores pendientes"
(`ice-ieh`/`sdmo`/`fpv`/`cff`/`ifd`) — `PIIO` quedó fuera de esa lista
precisamente porque "ya parecía resuelto", y nadie volvió a preguntar
si el lado de escritura también lo estaba.

**Lo que hace falta, con evidencia de la forma exacta** (`030:117-201`,
`contratos.js` del motor): funciones de escritura para 7 estructuras de
catálogo genuinamente distintas entre sí (`domain_catalog` con
`applicability_by_context` jsonb; `phenomenon_catalog` con
`recurrence_type`/`directionality`/versionado `valid_from`/`valid_to`
**explícitamente sin resolver** en el propio comentario de `030`;
`metric_definitions` con `continuity_mode`/`bridge_rule`; `reference_specs`;
`kpi_specs`; `evidence_groups`) más `observations` (la serie de KPI en
sí) y `node_hierarchy` (ya señalado como pendiente aparte en
`INVESTIGACION_PROTOCOLO_REGISTRO_MOTORES_EFICIENCIA.md`). No es "agregar
un parámetro a una función existente" como `FPV`/`CFF` — es diseñar y
construir 7-8 funciones de escritura nuevas, para estructuras con
semántica de versionado todavía sin decidir.

**Hallazgo secundario, menor, NO bloqueante**: `leer_datos_piio()`
tampoco pasa 4 campos de calibración opcionales que el motor sí sabe
usar (`ruleset_version`, `umbralesEstabilidad`, `umbralesPersistencia`,
`umbralesTrayectoria` — los 4 con `CALIBRACION_PROPIA`, con respaldo
seguro al default global del motor si faltan, mismo patrón que
`minReportableN` de `motor-iao`). No bloquea nada — el motor sigue
funcionando con sus valores globales — pero completar esto es trabajo
barato una vez que exista la función de escritura de todas formas.

**Resolución**: ronda de diseño propia, más grande que las de `FPV`/`CFF`
— empezar por decidir la semántica de versionado de
`phenomenon_catalog`/`metric_definitions` (bloqueante para diseñar bien
sus funciones de escritura, no se puede construir alrededor de una
pregunta sin responder) antes de construir las 7-8 funciones.

**Bloquea**: la simulación de PIIO no puede generar **ningún** dato
hoy — no es que falte una variación, es que no hay ningún camino de
escritura en absoluto. Esta pieza bloquea el 100% del alcance de PIIO en
la ronda de simulación, no una parte.

</details>

---


---

## 4. PIIO — `phenomenon_catalog` no tiene columna `status`: el escenario `PIIO_COMPATIBLE_PROVISIONAL` es inalcanzable

**Estado: PENDIENTE. Encontrado 2026-09-25** al diseñar la mini-prueba
de `PIIO` del script de simulación (`DISENO_EXTENSION_SIMULACION_4_MOTORES.md`
§2.4). **Prioridad baja-media** (una rama del motor, no el flujo central).

**Hallazgo exacto, verificado**:
- `motor-piio/runPIIO.js:219` y `:448` leen `phenSpec.status ===
  'PIIO_COMPATIBLE_PROVISIONAL'`: un fenómeno provisional se excluye de
  `EFO` con un `WARNING` (AC63 / INV-69) y se resuelve aparte para
  exportación a CFF/IFD.
- El propio motor lo documenta (`runPIIO.js:49-52`): *"PHENOMENON_SPEC no
  tiene campo `status` en el esquema de Fase 0 → se lee `phenSpec.status`,
  sin validar... Sin reabrir Fase 0."*
- `motores_eficiencia.phenomenon_catalog` (`030:143-165`) **no tiene
  columna `status`**, y `leer_datos_piio()` (`035:201-202`) arma el
  catálogo con `to_jsonb(f)` de esa tabla — el campo nunca llega al
  motor. `registrar_fenomeno_piio` (`041`) tampoco puede escribirlo.

**Consecuencia**: por la aplicación no existe forma de declarar un
fenómeno provisional. Toda la rama AC63/INV-69 (exclusión de `EFO` +
resolución aparte para exportación) es **inalcanzable** desde datos
reales, aunque el motor la implemente y la pruebe con fixtures.

**Resolución (para decidir, no ejecutada)**: agregar `status text`
(nullable) a `phenomenon_catalog` y a la lista explícita de columnas del
`ON CONFLICT DO UPDATE` de `registrar_fenomeno_piio`. **Pregunta abierta
antes de diseñar**: el motor solo conoce un valor
(`PIIO_COMPATIBLE_PROVISIONAL`); no hay enum de otros valores en
`contratos.js`/`enums.js` — no se inventa un `CHECK` sin definirlo.

**Bloquea**: el escenario de fenómeno provisional del script de
simulación (queda fuera de esta ronda, sin sustituto sintético) y la
ruta de exportación de provisionales hacia CFF/IFD.

---

## 5. PIIO — `registrar_nodo_piio` rechaza una versión con `active_from` anterior a la versión abierta, con un mensaje que no lo explica

**Estado: PENDIENTE. Encontrado 2026-09-25** en la mini-prueba contra
producción (organización desechable). **Prioridad baja.**

**Reproducción exacta**: el nodo `ORG` tenía `v1` abierto con
`active_from='2026-09'`. Se llamó `registrar_nodo_piio` con `ORG` `v2` y
`active_from='2026-04'` (retroactivo). La función cierra la versión
abierta con `active_to = <período anterior a active_from de la nueva>` =
`2026-03`, que es **anterior al `active_from` de `v1`** (`2026-09`) →
viola el `CHECK` de `node_hierarchy` (`23514`):
`new row for relation "node_hierarchy" violates check constraint
"node_hierarchy_check"`. Toda la llamada revierte (no se inserta `v2`,
no queda dato corrupto).

**Qué está mal**: el rechazo es correcto en sustancia (no se puede
cerrar una versión antes de que empiece), pero el mensaje es el del
`CHECK` crudo, sin decir "la nueva versión debe empezar después del
`active_from` de la versión abierta". Quien llame la función no puede
saber por qué falló.

**Pregunta abierta de semántica (para decidir)**: ¿se quiere solo
un mensaje claro (`RAISE EXCEPTION` con la causa antes del `UPDATE`) o
soportar versiones retroactivas (reescribir historia)? Lo segundo es
distinto y más grande.

**No probado, señalado por honestidad**: las otras funciones
append-only con cierre automático (`registrar_metric_definition_piio`,
`registrar_reference_spec_piio`) usan el mismo patrón; **no verifiqué**
si sufren la misma situación (depende de si sus tablas tienen un `CHECK`
`valid_to >= valid_from`).

**Bloquea**: nada de la simulación (las organizaciones nuevas nunca
registran versiones retroactivas); es de calidad de errores y
robustez.

---

## 6. PIIO — `leer_datos_piio()` no devuelve `ruleset_version`: `calcular-piio` queda `BLOCKED` con datos reales

**Estado: RESUELTO — 2026-09-26** (sin comitear todavía). Ver el
hallazgo original más abajo, sin editar, para no perder el rastro.

**Decisión de Luis, sobre `INVESTIGACION_RULESET_VERSION_PIIO.md`**: vía
(a), constante — pidió la recomendación entendiendo la necesidad del
sistema (que funcione de punta a punta con resultados correctos), no una
elección de las dos vías en abstracto.

**Resolución aplicada**: `src/motores/piio.js` gana la constante
`RULESET_VERSION_PIIO = 'PIIO-v1.1'` (mismo criterio que
`RULESET_VERSION_CFF` en `src/motores/cff.js` — nombra el documento
técnico vigente, sube manualmente cuando cambie `PARAMS` o una regla de
derivación del motor, `INV-PIIO-65`; nada hace cumplir ese incremento
hoy). `calcularPiio()` la inyecta de forma **no destructiva**:
`Object.assign({ ruleset_version: RULESET_VERSION_PIIO }, datosPiio)` —
si `leer_datos_piio()` algún día trae un valor persistido, ese gana.
Verificado contra `035_funciones_lectura_motores_pendientes.sql`: la
función **nunca** incluye la clave `ruleset_version` en su salida (ni
como `null`), así que el patrón es seguro — no hay riesgo de que un
`null` explícito pise la constante.

**Por qué (a) y no (b)** (evidencia ya reunida en la investigación, sin
repetirla aquí): el motor nunca ramifica sobre el *valor* de
`ruleset_version` (cero comparaciones `===`/`switch`/`.match` en todo
`motor-piio`), solo lo exige como etiqueta no vacía y componente de
`calculation_version`. Persistirlo (b) crearía una columna con un único
valor posible en todo el sistema, sin gobernanza real de quién lo
cambia, y prometería una capacidad (reglas distintas por organización)
que el motor no puede honrar.

**Verificado por ejecución** (no solo en memoria, como en el diagnóstico
original): con la constante inyectada y **los mismos catálogos vacíos
del mock de `worker.test.mjs`**, `calcularPiio` pasa de `BLOCKED` a
`COMPLETED` — no quedaba ningún otro bloqueo detrás de éste. Con eso se
resolvió la incertidumbre que la investigación (§3) había dejado
explícitamente abierta ("no sé si tras inyectar `ruleset_version` esos
datos vacíos pasan a `COMPLETED` o siguen `BLOCKED` por otra
validación").

**Aserción de `worker.test.mjs` endurecida** (sección 10, `calcular-piio`):
se agregaron dos aserciones nuevas — `run_status !== 'BLOCKED'` y
`ruleset_version === 'PIIO-v1.1'` en la salida, confirmando que viajó de
punta a punta aunque el mock no lo provee. La aserción original (`res.status
=== 200 && piio_run` existe) se deja intacta debajo, ahora reforzada por
las dos nuevas. Suite completa: **42/42** (los 40 previos + las 2
nuevas), sin regresión en ningún otro escenario — es el único punto de
contacto con PIIO en todo el archivo.

**Sin comitear**: el cambio en `src/motores/piio.js` y en
`src/worker.test.mjs`, y esta misma entrada del archivo.

<details>
<summary>Hallazgo y diagnóstico originales (histórico, sin editar)</summary>

**Estado original: PENDIENTE. BLOQUEANTE. Encontrado 2026-09-25** en la
mini-prueba de `PIIO` contra producción. **Corrige una clasificación
errónea mía** del §3 de este archivo y de
`INVESTIGACION_SIMULACION_PIIO.md` §2, donde `ruleset_version` figuraba
como calibración opcional "con respaldo seguro al default global". **No
lo tiene.**

**Error exacto** (`calcularPiio` sobre lo que devuelve `leer_datos_piio`
en producción): `run_status: BLOCKED`, un solo finding
`FORMA_INVALIDA / BLOCKING / GLOBAL`: *"PIIO_INPUT no pasa la validación
de forma de Fase 0: falta ruleset_version"*. Cero `kpi_states`, cero
`efo_states`.

**Por qué no se vio antes** (corregido tras verificarlo por ejecución;
una primera versión de este párrafo afirmaba lo contrario y era
incorrecta): `src/worker.test.mjs:285-292` (sección 10) mockea
`leer_datos_piio` con catálogos **vacíos y sin `ruleset_version`**, y su
única aserción es `res.status === 200 && cuerpoPiio.piio_run`. Esos
mismos datos, ejecutados por `calcularPiio`, devuelven **`run_status:
BLOCKED`** con el mismo error (`falta ruleset_version`) — pero un
resultado `BLOCKED` **también trae `piio_run`**, así que la aserción
pasa. **El test lleva todo este tiempo recibiendo un `BLOCKED` y
dándolo por bueno**: el defecto no es un mock que oculta el campo, es
una aserción demasiado débil que no distingue una corrida completa de
una bloqueada. Al cerrar esta brecha, esa aserción también hay que
endurecerla (`run_status !== 'BLOCKED'`).

**Diagnóstico confirmado por ejecución** (solo en memoria, sin escribir
nada): al inyectar `ruleset_version` a los mismos datos reales leídos,
`calcularPiio` pasa a `COMPLETED`, un solo `WARNING`
(`NODE_SCOPE: SEGMENT_ONLY_NO_ELEVA`), 18 `kpi_states`, 18
`evidence_groups`, 18 `phenomenon_states`, 12 `domain_states`, 6
`efo_states` — la cascada de 5 niveles llega hasta el final con datos
escritos por las funciones de `041`. **Es decir, `ruleset_version` es el
único bloqueo de esos datos**, y `041` funciona.

**Resolución (para decidir, no ejecutada)**: dos vías con precedente en
esta base — (a) constante en `src/motores/piio.js` (como
`RULESET_VERSION_CFF` en `src/motores/cff.js`); (b) que `leer_datos_piio`
lo devuelva desde una fuente persistida. `motor-piio/runPIIO.js` trata
`ruleset_version` como **insumo externo** (versión de reglas que produce
la corrida, entra al fingerprint de `calculation_version`), no como una
constante del motor — por eso no es obvio que (a) sea equivalente al
caso de CFF. Decisión de Luis.

**Bloquea**: `calcular-piio` **completo contra datos reales** (hoy no
puede devolver ningún resultado que no sea `BLOCKED`), y con él la
simulación de PIIO.

**Investigación de la decisión**: `INVESTIGACION_RULESET_VERSION_PIIO.md`
(2026-09-26).

</details>

**Con esto, de las brechas bloqueantes de PIIO (§3 y §6) no queda
ninguna abierta.** El hallazgo colateral de la propia investigación —
calibración propia por organización fuera de la huella — sigue como §9,
sin resolver, y no lo toca esta ronda.

---

## 7. CFF — hallazgos de visibilidad de costo y perfiles que no cuadran (en decisión de Luis, no cerrados)

**Estado: EN INVESTIGACIÓN / DECISIÓN PENDIENTE.** Detalle completo y
evidencia en `INVESTIGACION_COSTO_NO_ATRIBUIBLE_CFF.md` (§1 y §6). Se
registra aquí solo para que no se pierda entre sesiones:
- `event_profile`/`mechanism_profile`/`financial_nature_profile`/
  `node_profile` **no cuadran con `cff_total`** en 4 de 4 tipos de
  exclusión probados (transferencia interna, fuera de alcance, `CONTAINS
  FULL`, `DUPLICATE` sin resolver — este último reporta 2000 mientras
  `cff_total` es `null`). El documento técnico no lo exige
  literalmente, pero el test propio del motor (`runCFF.test.js:223-231`,
  "INV-70") sí lo afirma.
- ~900 de 3.899 en la matriz (componentes `EXPOSURE`+`UNRESOLVED`,
  `N_A`, `LOST_CAPACITY` sin reconstrucción) no aparecen en ningún
  total agregado; `LOST_CAPACITY_SIN_RECONSTRUCCION` ni siquiera figura
  en `coverage.limitations`.
- El contrato de entrada no permite declarar un impacto detectado pero
  sin cifra.


---

## 8. PIIO — la alerta `BRIDGE_SIN_REGLA` se calcula pero no llega a ninguna salida (observación, sin decidir si es defecto)

**Estado: OBSERVACIÓN. Encontrada 2026-09-25** en la mini-prueba de
`PIIO` (organización desechable, `continuity_mode` = `BRIDGED` **sin**
`bridge_rule`). **No es un hueco del Worker**: es del propio motor, y no
sé si el documento técnico de `PIIO` exige que esa alerta se muestre.

**Verificado por ejecución** (`calcularPiio` sobre datos reales de
producción):
- `BRIDGED` **con** regla → la serie se une: `traj` calculada
  (`STABLE`).
- `BRIDGED` **sin** regla → se trata como `NEW_SERIES`: `traj = N_A` y
  flag `NEW_REGIME` (comportamiento correcto según AC15/INV-PIIO-29).
- `NEW_SERIES` real → **el mismo** `traj = N_A` + `NEW_REGIME`.

**Lo que falta**: `motor-piio/referencias.js:156` (`continuidadDefinicion`)
devuelve `flags: ['BRIDGE_SIN_REGLA']` para el caso sin regla, pero
`kpiState.js:117` solo lee `puede_unir_serie`; el flag **se descarta**
(`grep BRIDGE_SIN_REGLA` solo lo encuentra en `referencias.js` y sus
tests). Resultado: en la salida **no hay forma de distinguir** un
`BRIDGED` mal declarado (falta la regla) de una `NEW_SERIES` legítima —
ambos aparecen idénticos. `INVESTIGACION_SIMULACION_PIIO.md` §3 y
`contratos.js:135` hablan de "la alerta `BRIDGE_SIN_REGLA`", pero esa
alerta no existe en ninguna salida.

**Pregunta abierta (para Luis)**: ¿el documento técnico de `PIIO`
exige mostrar esa advertencia? Si sí, es un defecto del motor; si no,
es una mejora de visibilidad.


---

## 9. PIIO — la calibración propia por organización cambia el resultado pero NO cambia `calculation_version` ni `ruleset_version`

**Estado: OBSERVACIÓN CON EVIDENCIA. Encontrada 2026-09-26** al investigar
`ruleset_version` (§6). **No es un hueco del Worker** (ninguna función
SQL le pasa calibración al motor todavía): es una brecha de
reproducibilidad del propio motor.

**Verificado por ejecución** (datos reales de la organización de
simulación "deterioro", `calcularPiio`, mismo `ruleset_version`):

| Entrada | `KPI-CAL.traj` | flags | `calculation_version` |
|---|---|---|---|
| sin calibración propia | `DETERIORATING` | `CALIBRACION_GENERICA` | `rs=rs-X\|dc=v1\|pc=v1\|md=...` |
| `input.umbralesTrayectoria = { band: 5 }` | **`STABLE`** | `CALIBRACION_PROPIA` | **idéntica** |

`_calculationVersion` (`runPIIO.js:354-364`) solo mezcla `ruleset_version`
y las versiones de catálogos/definiciones/referencias/jerarquía — **no**
`umbralesTrayectoria`/`umbralesPersistencia`/`umbralesEstabilidad`. Dos
corridas con las mismas "versiones" pueden dar resultados distintos, lo
que contradice el enunciado del documento técnico (§31): *"MISMOS INPUTS
+ MISMAS VERSIONES → MISMO RESULTADO"*, y `INV-PIIO-65`/`AC67` (cambio
material de reglas genera nueva versión). Nota: las 3 claves de
calibración son campos del **`PIIO_INPUT`** (`runPIIO.js:189-190`,
`phenomenon.js:543`), no de `opciones`; una nota anterior de
`INVESTIGACION_SIMULACION_PIIO.md` §1 las ubicaba en `opciones` y era
inexacta.

**Pregunta abierta (Luis)**: ¿la calibración propia es parte de "las
reglas" que `ruleset_version` debe identificar, o es otra dimensión de
versión (p. ej. `calibration_version`)? Cerrar §6 con una constante **no
resuelve esto** y no lo empeora: hoy `leer_datos_piio` no transporta
ninguna calibración, así que ningún resultado del Worker la usa.


---

## 10. Despliegue — código fuente de los motores y documentos internos servidos públicamente (RESUELTO 2026-09-26)

**Estado: RESUELTO en producción — verificado en vivo 2026-09-26
19:43 UTC** (commit `caaf309`, push 19:42:15 UTC, despliegue automático
detectado a los ~33 s). Se registra aquí porque es un incidente de
seguridad: **el patrón ya se había repetido** (hubo un incidente igual
en `eficiencia-site`, `/campus/` público, según Luis) y el §-de-origen
de esta clase de hallazgo es "verificado una vez, nunca registrado".

**Qué estaba expuesto** (verificado con `curl`, sin autenticación, todos
`200`, en `eficiencia-app.coach-luiscaicedo.workers.dev`):
- Código fuente de los motores: `/motor-piio/runPIIO.js` (40.919 B),
  `/motor-cff/runCFF.js` (25.992 B), `/motor-ice-ieh/motor-ice-ieh.js`
  (25.718 B). Por la misma causa, con muy alta probabilidad los 8 motores
  y sus tests/READMEs (`motor-*/`, `aie_validation_kit/`; **no probé
  cada archivo**; los 244 archivos de la simulación se calcularon sobre
  el árbol en disco, que incluye archivos sin trackear, así que lo
  realmente desplegado fue **menor**).
- `/DOCUMENTO_MARCO_SISTEMA_EFICIENCIA.md` (102.150 B, la metodología
  completa) y `/docs/DOCUMENTO_TECNICO_ICE_IEH_v2.md` (56.406 B).
- Los **17** `.md` de la raíz que había en `origin` antes de este push
  (contados con `git ls-tree`; verifiqué 6 con `curl`:
  `INVESTIGACION_FACTOR_PRESTACIONAL_LATAM.md`,
  `INVESTIGACION_VALIDACION_IFT.md`, `MAPEO_INTEGRACION_AIE.md`,
  `PROMPT_CC_AUDITORIA_MOTOR_CALCULO_v2.md`,
  `SD_MO_4_PREGUNTAS_EFICIENCIA.md`, `VALIDACION_IFT_CASOS_REALES.md`,
  todos `200`). **Corrección**: el mensaje del commit `caaf309` dice
  "~70 .md ... ya presentes en origin"; era incorrecto: 70 es el conteo
  del árbol en disco (incluye el backlog sin trackear), no de `origin`.
- **No estaban expuestos** (404): `src/`, `supabase/`, `.git/`, `.docx`,
  `.dev.vars`.

**Desde cuándo** (cota inferior, honesta): el historial de `git` solo dice
cuándo cada archivo **entró a `origin`**, no cuándo se desplegó. Primer
commit en `origin` antes de la corrección: `DOCUMENTO_MARCO` 2026-08-07;
`motor-ice-ieh` 2026-09-03; `motor-cff` 2026-09-05; `motor-piio`
2026-09-09; último `origin` previo: 2026-09-14. Como el despliegue es
automático desde `main` (confirmado por Luis), la exposición es **no
anterior** a esas fechas y **no posterior** a 2026-09-26 19:42 UTC. El
`.assetsignore` original (`8d55ed9`, 2026-08-18) ya existía como "security:
excluye .git/.claude/.wrangler/etc" — es decir, **ya hubo un arreglo
previo de la misma clase, incompleto**. Antes de esa fecha no se
verificó qué se servía (incluido `.git/`); queda **sin acotar**.

**Causa raíz**: `.assetsignore` era una **lista negra** (`.git/`,
`.claude/`, `.wrangler/`, `_referencia/`, `supabase/`, `node_modules/`,
`files.zip`, `*.docx`, `*.pptx`; `src/` se sumó en `7b93729`, 2026-09-21,
commit local que entró a `origin` recién en este push) sobre un
`wrangler.jsonc` que sirve el directorio `"."` como assets. Toda ruta
no listada se publicaba. Una lista negra se queda corta cada vez que se
agrega algo nuevo.

**Corrección** (`caaf309`): lista **blanca** (`*`, `!*.html`, `!assets/`,
`!assets/**`). Simulada con reglas de git-ignore sobre el árbol real:
244 → 10 archivos servidos (8 `.html` + `assets/img/logo.png` +
`assets/img/logo-light.png`); el simulador reprodujo 7 de 8
observaciones en vivo (la única diferencia, `.dev.vars`, era
conservadora).

**Verificación en vivo post-despliegue (2026-09-26 19:43:08 UTC, no por
leer la config)**:
- `404` (antes `200`): `runPIIO.js`, `runCFF.js`, `motor-ice-ieh.js`,
  `DOCUMENTO_MARCO_SISTEMA_EFICIENCIA.md`,
  `docs/DOCUMENTO_TECNICO_ICE_IEH_v2.md`,
  `INVESTIGACION_FACTOR_PRESTACIONAL_LATAM.md`.
- `404` (publicados por primera vez en ese push, **nunca accesibles**):
  `PENDIENTES_BRECHAS_WORKER_MOTORES.md`,
  `INVESTIGACION_RULESET_VERSION_PIIO.md`,
  `INVESTIGACION_COSTO_NO_ATRIBUIBLE_CFF.md`,
  `AUDITORIA_SUPABASE_MOTORES.md`, `scripts/*.mjs`,
  `supabase/migrations/043_*.sql`, `src/worker.js`, `.dev.vars`,
  `.git/config`, `.assetsignore`, `wrangler.jsonc`.
- `200` (siguen sirviendo): `/`, `index.html`, `workbook.html`,
  `crear_organizacion.html`, `cuestionario_ice_ieh.html`, `fpv.html`,
  `assets/img/logo.png`, `assets/img/logo-light.png`.
- Dominio custom `eficiencia.com.co` (apex): `404` en `runPIIO.js`,
  `runCFF.js`, `DOCUMENTO_MARCO`, `PENDIENTES`, `.dev.vars`; `200` en `/`
  y `workbook.html`. **No medí antes** qué exponía ese dominio, solo
  confirmé el estado corregido. `www.eficiencia.com.co` no resuelve.
- Worker: `/api/calcular-fpv|cff|piio|aie` sin `Authorization` → `401`
  (los 4 endpoints están desplegados y exigen JWT; antes daban `404`).

**Lo que NO se puede deshacer**: lo servido durante el período de
exposición pudo copiarse o cachearse fuera de nuestro control; cerrar la
ruta solo deja de servirlo. Quien haya visto los motores tiene la
metodología completa de ICE-IEH/CFF/PIIO al nivel de código. No hay
forma de saber si alguien lo hizo (no revisé logs de acceso).

**Pendiente derivado, no bloqueante**:
- `SUPABASE_URL`/`SUPABASE_ANON_KEY` en Cloudflare: si no están, los
  endpoints `/api/calcular-*` darán `500` con JWT válido (no filtra
  nada). Luis lo revisa.
- Revisar los otros Workers de la cuenta (`amar-*`, `el-amor-existe`,
  `payhip-webhook-*`) por el mismo patrón de `.assetsignore` incompleto.
- Este arreglo es **contra el patrón**, no contra el síntoma: mientras
  `wrangler.jsonc` siga sirviendo `directory: "."`, cualquier archivo
  `.html` nuevo en la raíz **se publicará** (es lo que la lista blanca
  permite a propósito). Un `.html` con información interna en la raíz
  sería público.


---

## 11. Worker — `calcular-aie` falla con datos reales en los meses de menos de 31 días (`p_hasta: period + '-31'`)

**Estado: RESUELTO — 2026-09-26, commit `a4fde9b`.** Hallazgo original
más abajo, sin editar.

**Resolución aplicada**: `src/worker.js` gana `ultimoDiaDelMes(period)`
(28/29/30/31, con bisiestos; valida `YYYY-MM` y responde `400` si el
período viene mal formado, en vez de un `500` de la base) y
`calcularAieHandler` la usa para `p_hasta`. **No es una decisión de
diseño**: `period + '-31'` está mal en cualquier mes de menos de 31 días.

**Por qué el test no lo vio, y qué se corrigió**: el mock de RPC de
`worker.test.mjs` aceptaba cualquier cadena como fecha. Ahora valida todo
`'YYYY-MM-DD'` como lo haría Postgres (columnas `date`) y rechaza fechas
inexistentes con `22008`, **para todos los handlers**, no solo AIE — una
regresión de esta clase en cualquier handler falla en el test, no en
producción. Casos nuevos: `p_hasta` de enero/febrero 2026 (`31`/`28`),
abril y noviembre (`30`), febrero 2028 (bisiesto, `29`), `p_desde`,
período mal formado (`2026-13` → `400` sin tocar la base) y fecha
inexistente en `calcular-sdmo`. **Verificado por mutación**: volver a
`period + '-31'` hace fallar la suite. Suite: 49/49 (42 previos + 7).

<details>
<summary>Hallazgo original (histórico, sin editar)</summary>


**Estado: PENDIENTE. BLOQUEANTE para `calcular-aie` en 5 de 12 meses.
Encontrado 2026-09-26** al calcular los 8 motores sobre las 5
organizaciones de simulación ya generadas (mismo flujo que el handler).

**Error exacto** (respuesta real de Supabase a la llamada que hace el
handler): `leer_respuestas_sdmo` → `{"code":"22008","message":"date/time
field value out of range: \"2026-04-31\""}`.

**Causa**: `src/worker.js:142` (`calcularAieHandler`) arma el rango de
`SDMO` como `p_desde: period + '-01'`, `p_hasta: period + '-31'`.
`leer_respuestas_sdmo` recibe `date` (033: `sdmo_respuestas.jornada` es
`date`), y `-31` no existe en febrero, abril, junio, septiembre ni
noviembre. Para 2026 fallan `2026-02`, `2026-04`, `2026-06`, `2026-09`,
`2026-11`; una serie de períodos que incluya cualquiera de ellos hace
fallar **toda** la corrida de `AIE`.

**Por qué no se vio**: `src/worker.test.mjs` sección 11 usa el mock de
`fetch`, que responde cualquier `p_hasta` sin validar que sea una fecha
real. Misma clase de trampa que §6 (mock que no reproduce la base).

**Resolución (para decidir, no ejecutada)**: calcular el último día real
del mes (`new Date(Date.UTC(y, m, 0)).getUTCDate()`) en vez de `-31`, y
un test con un mes de 30 días y febrero que valide la fecha (no solo que
la RPC se llame).

**Bloquea**: `calcular-aie` contra datos reales para cualquier serie que
contenga uno de esos meses (con los 6 períodos de la simulación,
2026-04..2026-09, contiene 3: abril, junio, septiembre).

</details>
