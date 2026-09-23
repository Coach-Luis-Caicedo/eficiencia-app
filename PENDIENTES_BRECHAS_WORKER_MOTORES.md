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

**Estado: PENDIENTE, bloqueante para dar por completa la simulación de FPV.**

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
(§1) y `CFF` (§2)** — el hallazgo secundario no bloqueante de PIIO
(4 campos de calibración que `leer_datos_piio()` no pasa) sigue sin
cerrar, señalado abajo, pero no bloquea la simulación.

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
