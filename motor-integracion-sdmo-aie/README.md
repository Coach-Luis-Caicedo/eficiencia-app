# Arnés de integración — `motor-sdmo` → AIE real (Python, `aie_validation_kit/`)

Segundo arnés de integración real (relación **"con otros instrumentos"** de
la regla de las tres relaciones). El primero conectó `motor-ice-ieh` →
`motor-iao` (ver `../motor-integracion/`); este cierra el mismo hueco para
`motor-sdmo`, cuya salida (IDA → DYN) nunca había alimentado un AIE real —
solo el generador sintético del kit de estrés.

Rama `feat/motor-integracion-sdmo-aie`, desde `main`. `vendor/motor-sdmo/`
es copia byte-idéntica de `feat/motor-sdmo` (confirmado con `diff` antes de
escribir el arnés) — no se modifica. `aie_validation_kit/` **no se copia**:
ya está trackeado en `main` (commit `8fc7e5a`), se invoca tal cual.

## Cruce de lenguaje — subproceso Python (opción (a), aprobada)

`rules_2f_3f.run_case()` se invoca como subproceso real (`child_process.spawnSync`,
JSON por stdin/stdout, `run_case_bridge.py`) — no se reimplementó la
clasificación en JS. Única fuente de verdad para las reglas AIE, sin el
riesgo de duplicación silenciosa que ya corregimos en `contratos.js`/
`monetizacion.js` (motor-cff). Confirmado antes de decidir la arquitectura:
`rules_2f_3f.py` solo depende de `engine_core.py`, que usa `numpy` de forma
real (`np.polyfit` en `trajectory()`) pero no `pandas` — ambas instaladas en
este entorno, invocación limpia confirmada con una prueba directa antes de
escribir el arnés.

## Pieza construida por el arnés (no por `motor-sdmo`): agregación temporal

`motor-sdmo.agregarOrganizacion` expone un **snapshot de un solo período**
— por diseño: SDMO se aplica con cadencia, no como serie continua. No existe
en `motor-sdmo` ninguna función que agregue varios períodos a nivel
organización (`calcularSerieIDA` existe, pero es **por Persona**, no
organizacional). `calcularSerieOrganizacionalIDA(datosPorPeriodo, opts)`
(en `pipeline.js`) es la pieza que el arnés construye para llenar ese hueco
— mismo criterio que `NODE_HIERARCHY` en `motor-cff` Fase 3: completa
infraestructura que el propio módulo exige para poder ejecutarse en un
pipeline temporal, documentada aquí como adición del arnés, no como parte
literal de `motor-sdmo`.

### Supuesto explícito: composición variable, no cohorte fija

**Decisión:** cada período se agrega con el **pool completo de quien haya
respondido ese período** — la composición puede variar de un período a
otro (rotación, ausencias puntuales). **No** se construye una cohorte fija
de Personas presentes en todos los períodos.

**Por qué — no es una preferencia, es un hecho mecánico:** `agregarOrganizacion`
no lleva ningún identificador de Persona entre llamadas. El array `idas` que
recibe son números planos, sin `persona_id`. El propio comentario del módulo
lo declara como decisión explícita de anonimización (§2.10): *"El pool no
lleva atributos ⇒ no hay subgrupos que intersectar dentro de él (sin
reidentificación por combinación de filtros)"*. Construir una cohorte fija
exigiría una capa de identidad persona-por-período que no existe en ningún
lugar del sistema — fabricarla en este arnés rodearía el diseño de
anonimización que `motor-sdmo` trata como cerrado, no como algo que un
arnés deba parchear.

**Consistente además** con el principio ya establecido en otro lugar del
documento: *"NO RESPUESTA ⇏ AMENAZA"* — la participación se registra aparte
(`tasaRespuesta`), nunca se usa para decidir quién "cuenta" en el nivel.
Exigir presencia en todos los períodos habría sido, en la práctica, dar
significado a la no-respuesta de una forma que el sistema ya prohíbe en
otro lugar.

**Limitación real que esto deja, sin suavizar:** `dyn(t)` mezcla cambio
real dentro de las mismas Personas con cambio de quién respondió ese
período. Una serie de panel fijo aislaría mejor la tendencia pura — pero no
es construible con los datos que el sistema expone hoy. No se ignora el
problema: no se puede evaluar sin una capa de identidad que no existe.

## Hallazgo de frontera — `rules_2f_3f.run_case` truena con `null`/`NaN` en `cfg`/`dyn`

Confirmado empíricamente antes de decidir cómo manejarlo: un período sin
ningún respondiente válido produce `nivelColectivo = null` (comportamiento
**correcto** de `motor-sdmo`, §2.8 — nunca se imputa). Pasar ese `null` a
`rules_2f_3f.run_case` (vía JSON, `null` → `None`) hace que
`engine_core.position()` lance `TypeError: '<=' not supported between
instances of 'NoneType' and 'int'` — un traceback crudo de Python, sin
contexto útil, no un rechazo informativo.

Ninguno de los dos módulos está "mal" según su propio contrato:
`motor-sdmo` hace lo correcto al no imputar; `rules_2f_3f.run_case` fue
escrito asumiendo series numéricas completas. La fricción aparece **solo**
al conectarlos — exactamente lo que este arnés existe para encontrar.

`ejecutarAIE()` sigue detectando `null`/`NaN` en `cfg`/`dyn` ANTES de invocar
Python y lanza un error con contexto — queda como defensa de última línea
(por ejemplo, si un segmento llegara con un valor inválido por un error en
otra parte del arnés). Pero la política real para períodos sin respondientes
válidos **sí se decidió**: ver "Segmentación por huecos" abajo.

### Segmentación por huecos — por qué "excluir el período" no bastaba

`engine_core.trajectory()`/`persistence()` calculan sobre una ventana **por
posición en la lista**, no por tiempo calendario — no distinguen "período
consecutivo real" de "período consecutivo en el array". Si un hueco se
excluyera de la serie sin más (aplanar y concatenar los períodos válidos),
los puntos que quedan a cada lado del hueco se tratarían como si fueran
consecutivos cuando no lo son — una trayectoria podría **cruzar el hueco**
y mezclar dos tramos que en la realidad no son contiguos.

**Verificado, no solo argumentado** (`pipeline.test.js`, sección "Sin
segmentar vs. segmentado"): con dyn real `[20,60,100, hueco, 100,60,20, hueco, 40]`,
aplanar y concatenar da, en el punto que corresponde al primer período real
del segundo tramo, `DYN_traj="DETERIORATING"` (la ventana `[60,100,100]`
mezcla la cola del tramo anterior con el inicio del siguiente). Segmentando
correctamente, ese mismo período real da `DYN_traj="INDETERMINATE"` (evidencia
insuficiente, el segmento apenas empieza) — una diferencia real y medible,
no cosmética.

**Por qué no se corrige en `engine_core.py`:** PIIO ya resolvió este mismo
problema (`MAX_CONTINUITY_GAP`, `N/A` como estado propio) — pero
`engine_core.py` del prototipo AIE no tiene esa maquinaria, y agregársela
desde este arnés significaría modificar el kit de prueba de estrés que ya
produjo los resultados 2F/3F documentados como hallazgo (`HALLAZGOS_PRUEBA_ESTRES_AIE*.md`);
cualquier cambio ahí obligaría a revisitar si esos resultados siguen siendo
válidos — fuera de alcance de este arnés.

**Solución implementada, desde afuera:** `segmentarPorHuecos(cfgSerie, dyn)`
parte la serie en tramos contiguos, cortando en cualquier período con
`cfg`/`dyn` inválido — el hueco mismo no pertenece a ningún segmento.
`ejecutarPipeline` invoca `rules_2f_3f.run_case()` **una vez por segmento**,
cada uno con su propio índice local (empieza en `t=0`, no arrastra el índice
real) — `engine_core.py`/`rules_2f_3f.py` no se tocan. El resultado se
devuelve agrupado por segmento (`segmentos: [{periodosReales, cfg, dyn, aie}, ...]`),
nunca aplanado, para que quede explícito a qué períodos reales corresponde
cada tramo.

Un segmento con menos de `TRAJ_WINDOW` (=3) períodos da `INDETERMINATE` en
sus primeros puntos (o en todos, si el segmento entero es más corto que la
ventana) — **no es un caso de error**, es el motor reconociendo evidencia
insuficiente, mismo principio que ya rige en todo el resto del sistema
(verificado con el segmento de 1 solo período del caso end-to-end #3).

## `cfg` es sintético en este arnés — alcance explícito

`cfg` se recibe como parámetro en `ejecutarPipeline`, no se deriva de
`motor-iao` real. El hueco de relación 2 de `motor-iao` ya se cerró por
separado en `../motor-integracion/` (ICE–IEH → IAO). Conectar los dos
arneses en una sola cadena ICE-IEH→IAO→AIE habría mezclado dos cierres de
hueco distintos en un solo commit — se mantienen separados a propósito.
Cada caso de prueba marca `cfg` explícitamente como sintético.

## Casos verificados

| Caso | Qué confirma |
|---|---|
| Agregación temporal básica (a mano) | `nivelColectivo` de un período mixto (2 favorables + 1 casi-favorable) coincide con el cálculo manual exacto (25/24). |
| No-respuesta individual dentro de un período | Se filtra, no corrompe el agregado — `n` cuenta solo respondientes válidos. |
| Período sin ningún respondiente válido | `nivelColectivo = null` (correcto) → dispara la guarda de `ejecutarAIE` con mensaje claro, no el `TypeError` crudo. |
| Puente a Python ejecuta `engine_core` real | `CFG=50` → `CFG_pos="I"` (no "F" — verificado contra los umbrales reales `TH_FI=33`/`TH_ID=66`, no una expectativa asumida). |
| End-to-end #1 — organización estable y favorable | 4 períodos reales de `motor-sdmo` (todos favorable) → `dyn=[0,0,0,0]` exacto → `AIE_2F=REG_CONVERGENT` en los 4. |
| End-to-end #2 — deterioro real progresivo | 5 períodos reales, mayoría de respuestas pasa de favorable a deteriorada → `dyn` sube monótonamente 0→80 → `DYN_pos` pasa de F a D → `AIE_2F=TR_DYNAMIC_ALTERATION` (CFG sintético estable, DYN real deteriorado). |
| End-to-end #3 — 3 segmentos, 2 huecos reales | 9 períodos reales, dyn `[20,60,100, hueco, 100,60,20, hueco, 40]` → 3 segmentos exactos con sus períodos reales declarados; segmento A `DETERIORATING` al final (pendiente=40), segmento B `IMPROVING` al final (pendiente=-40) tras reiniciar en `INDETERMINATE` (no hereda continuidad de A), segmento C (1 período) `INDETERMINATE`. Comparado explícitamente contra "aplanar y concatenar": el mismo período real da un resultado distinto (`DETERIORATING` sin segmentar vs. `INDETERMINATE` segmentado) — la prueba de que segmentar cambia el resultado. |

## Parámetros usados (placeholders explícitos, no calibrados)

`delta=0.5`, `minReportableN=3`, `percentilConcentracion=90` — mismos
PENDIENTE_VALIDACION de `motor-sdmo`, fijados aquí solo para poder correr
la batería, igual que `motor-iao.test.js`/`sim/` hacen con sus propios
umbrales de prueba.

## Qué NO se hizo

- No se modificó `motor-sdmo.js` ni ningún archivo de `aie_validation_kit/`
  (la segmentación por huecos vive enteramente en el arnés).
- No se conectó `motor-iao` real como fuente de `cfg` (alcance explícito).
- No se implementó PIIO/EFO — `ops` es `null` en todos los períodos (2F).
- No se hizo merge de ninguna rama a `main`.

## Verificación

`node motor-integracion-sdmo-aie/pipeline.test.js` → **50 asserts OK, 0
fallos**. `node --check` en `pipeline.js`/`pipeline.test.js`; sintaxis
Python verificada en `run_case_bridge.py`.
