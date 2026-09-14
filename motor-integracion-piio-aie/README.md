# Arnés de integración — `motor-piio` → AIE real (Python, `aie_validation_kit/`)

Cuarto arnés de integración real (relación **"con otros instrumentos"** de
la regla de las tres relaciones). Cierra el vacío de `EFO` identificado en
`DISENO_ARNES_PIIO_AIE.md` (aprobado antes de escribir código, actualizado
tras la reapertura de `motor-piio` — `75c6501`/`03dc240` — que corrigió
`traj`/`pers`/`det_run` de `EFO_STATE`).

Rama `feat/motor-integracion-piio-aie`, creada desde **`feat/motor-piio`**
(no desde `main`) — a diferencia de `motor-integracion-iao-aie`, aquí sí
hace falta la reapertura ya comiteada, y `runPIIOCompleto()` requiere
prácticamente todos los módulos de `motor-piio` (kpiState, phenomenon,
domain, efo, nodos, referencias, evidenceGroup, observaciones, config,
contratos, enums, temporal) — vendorizar solo una parte no tendría
sentido, así que se usa el motor completo, sin vendorizar nada.
`aie_validation_kit/` también está disponible (heredado de `main` vía
`feat/motor-piio`), se invoca tal cual.

## Por qué este arnés NO es "más de lo mismo" — la premisa cambió a mitad de camino

El diseño original (`DISENO_ARNES_PIIO_AIE.md`) empezó suponiendo que había
que construir, en el arnés, el mismo tipo de encadenamiento de historia
que ya construyeron los arneses de `CFG`/`DYN` — porque se verificó que
`runPIIOCompleto()` nunca encadenaba `traj`/`pers`/`det_run` entre
períodos. Esa verificación motivó la reapertura de `motor-piio`
(documentada en `DISENO_REAPERTURA_EFO_TRAJ_PERS.md`), que corrigió el
problema **dentro de `motor-piio`**, no en el arnés — `efo.js` ya
propaga `traj`/`pers`/`det_run` de un `DOMAIN_STATE` gobernante, mismo
patrón que `domain.js` un nivel más abajo. Con eso comiteado, este arnés
es genuinamente más simple que lo planeado originalmente: **una sola
llamada a `runPIIOCompleto()`** basta como punto de entrada de datos.

## Lo que SÍ sigue siendo trabajo propio de este arnés

### 1. `classify_3F`/`classify_2F` directos, NO `run_case()`

`EFO_STATE` nunca tiene un número crudo — `pos`/`traj`/`pers` ya llegan
categóricos. `run_case()` (usado por `CFG`/`DYN`) calcula
`position()`/`trajectory()`/`persistence()` internamente a partir de
números crudos — no acepta categorías. Peor: verificado con ejecución
real que `run_case()` decide "¿OPS presente?" con **un solo chequeo
global** sobre `ops[0]`, no período por período — con disponibilidad
mixta real (`ops[0]` real pero un hueco después, o al revés), o truena o
**descarta señal real en silencio**. `run_case_efo_bridge.py` importa
`classify_3F`/`classify_2F`/`position`/`trajectory`/`persistence`/
`trajectory_run` de las piezas reales (`engine_core.py`/`rules_2f_3f.py`,
sin modificar ninguna) y compone la llamada él mismo — calcula
`cfg_p`/`dyn_p`/`cfg_t`/`dyn_t` de los números crudos de `CFG`/`DYN`, pero
recibe `ops_p`/`ops_t`/`ops_pers`/`ops_det_run` ya resueltos.

### 2. Traducción de vocabulario — `'N_A'` → `'N/A'`, y solo eso

`EFO_STATE.pos` usa `'N_A'` (enum real de PIIO); `classify_3F` decide "OPS
ausente" con `ops_p == 'N/A'` exacto. `traj`/`pers` NO necesitan
traducción — sus comparaciones en `rules_2f_3f.py` son de desigualdad o
pertenencia, nunca `== 'N_A'` exacto. Verificado con mutación (ver abajo).

### 3. `calcularRachaTrayectoria` — sigue siendo necesaria, sin cambios de diseño

La reapertura corrigió **cómo** se calculan `traj`/`pers`/`det_run`, no
**qué mide** cada uno. `EFO_STATE.det_run` sigue siendo la racha de
*posición* en D (mismo concepto que `pers`) — `ops_det_run` que
`rules_2f_3f.py` espera es la racha de *trayectoria* (`traj==='DETERIORATING'`
consecutivos). El arnés calcula su propia racha a partir de la serie de
`traj` que PIIO ya resuelve — sin recalcular ninguna regla.

**Hallazgo real, no simulado, verificado con ejecución:** en todos los
smoke-tests y en la batería de este arnés, `traj` sale `'N_A'` en el 100%
de los períodos — verificado que es `PARAMS.TRAJ_STABLE_BAND: null`
(`enums.js`, Grupo 1, `PENDIENTE_CALIBRACION`, sin fallback genérico a
diferencia de `STABILITY_CV_*`) — `kpiState.resolverTrayectoria()` nunca
puede devolver otra cosa que `'N_A'` mientras esa constante no se
calibre, **desde el nivel KPI**, antes de que `efo.js` propague nada. No
es un defecto de esta reapertura ni de este arnés — está fuera de alcance
corregirlo aquí. `calcularRachaTrayectoria` se probó con historias de
`traj` fabricadas a mano (no a través de la cascada real) precisamente
porque la cascada real no puede producir hoy un `'DETERIORATING'` — el
día que `TRAJ_STABLE_BAND` se calibre, la racha empezará a reflejar datos
reales sin que este arnés necesite cambiar una línea.

### 4. Hallazgo real encontrado AL CONSTRUIR (no en el diseño): alineación por período, no por posición de array

`runPIIO.js:261` (`if (domStates.length === 0) return;`) **no produce
ningún `EFO_STATE`** para un período sin ningún `DOMAIN_STATE` — el array
`efo_states` queda **más corto** que la lista real de períodos. Esto es
distinto de un `EFO_STATE` que sí existe con `pos:'N_A'` (evidencia
evaluada pero insuficiente) — aquí no hubo ni evaluación. El primer
intento de este arnés indexaba las filas de `ops` por posición de array
de `efo_states` — funcionaba en los casos sin huecos, y **desalineaba
todo lo que seguía al primer hueco** en el caso con huecos (encontrado
probando ese caso exacto, no en la revisión de diseño). Corregido:
`mapaOpsPorPeriodo` indexa por **período real** (string), y
`alinearPorPeriodo` busca cada índice de `cfg`/`dyn` por su período real
(`input.periods[idx]`), rellenando los períodos sin `EFO_STATE` con el
mismo default que `rules_2f_3f.run_case()` ya usa para "OPS no presente"
(`pers:'POINT', det_run:0`).

### `segmentarPorHuecos` — reutilización literal, sin cambios

Copiado byte-idéntico de `motor-integracion-sdmo-aie` (`685d140`) —
agnóstico de la fuente, sigue aplicando a `CFG`/`DYN` sin cambios. **No
se usa para el eje de `EFO`** — un período sin `EFO_STATE` no es un hueco
que deba cortar la serie de `CFG`/`DYN` (que puede estar completa aunque
`EFO` tenga un hueco ese mismo período, como el caso end-to-end #2
confirma) — `classify_3F` ya sabe qué hacer con `'N/A'` período por
período, sin segmentar nada por ese eje.

## Casos verificados

| Caso | Qué confirma |
|---|---|
| `calcularRachaTrayectoria` (unitario, historias fabricadas) | Cuenta la racha final de `'DETERIORATING'`, no el total histórico — necesario porque la cascada real no puede producir hoy un `traj` distinto de `'N_A'` (ver hallazgo §3). |
| `traducirOpsP` | Única traducción de vocabulario — confirmado con mutación que es load-bearing. |
| `mapaOpsPorPeriodo`/`alinearPorPeriodo` (unitario) | Indexación por período real, con el default correcto para períodos sin `EFO_STATE`. |
| `obtenerSerieEFO` — serie real de 4 períodos | `pos` real (`N_A,D,D,D`), **`pers`/`det_run` confirmados acumulando correctamente a través de `runPIIOCompleto()` real** (`N_A,POINT,REPEATED,REPEATED` / `0,1,2,3`) — la reapertura funciona de punta a punta. `traj`/racha en `N_A`/`0` — hallazgo real documentado, no oculto. |
| `obtenerSerieEFO` — multi-nodo | El filtro por `node_id` distingue correctamente 2 nodos con series independientes (`n-root`: D→F ; `n-a`: F,F). |
| Puente a Python ejecuta `classify_3F` real | `CFG=50→I`, `DYN=10→F`, `OPS=D` con `pers=REPEATED` → `DET_OPERATIONAL_UNCORROBORATED` (confirmado con `python3 -c` antes de escribir el assert). |
| End-to-end #1 — EFO real entra a D y se sostiene | `CFG`/`DYN` sintéticos favorables; `AIE_3F` pasa de `TR_UNEXPLAINED_DIVERGENCE` (EFO recién D, `pers=POINT`) a `DET_OPERATIONAL_UNCORROBORATED` (`pers=REPEATED`) — el canal categórico del `OR` de `rules_2f_3f.py` corrobora en cuanto PIIO acumula suficiente historia real. |
| End-to-end #2 — hueco real de evidencia en EFO | `CFG`/`DYN` sintéticos **sin** hueco (1 solo segmento, sin segmentar por un hueco que no es suyo); el período sin `EFO_STATE` se alinea correctamente al default "ausente"; el período siguiente **no queda contaminado** por el hueco anterior. |

## Qué NO se hizo

- No se modificó ningún archivo de `motor-piio` (la reapertura ya está
  comiteada por separado, `75c6501`/`03dc240`).
- No se implementó ninguna política de multi-nodo (`DISENO_ARNES_PIIO_AIE.md`
  §3, punto 2) — se opera con el supuesto de un solo nodo, mismo criterio
  que las otras 2 ramas.
- No se calibró `TRAJ_STABLE_BAND` ni se tocó `kpiState.js`/`enums.js` —
  fuera de alcance de este arnés, documentado como hallazgo, no corregido.
- No se hizo merge de ninguna rama a `main`.

## Verificación

`node motor-integracion-piio-aie/pipeline.test.js` → **53 asserts OK, 0
fallos**. `node --check` limpio en ambos `.js`; `python3 -m py_compile`
limpio en `run_case_efo_bridge.py`.

### Mutaciones de prueba de vida (ciclo completo backup/aplicar/correr/restaurar/diff-limpio)

1. `calcularRachaTrayectoria`: se quita el `else break` (cuenta todos los
   `'DETERIORATING'` de la historia, no solo la racha final) → **2 rojos**.
2. `traducirOpsP`: se quita la traducción (`return pos` sin más) →
   **3 rojos**.
3. `alinearPorPeriodo`: se reproduce el bug real encontrado al construir
   (indexar por posición de array de `efo_states` en vez de por período
   real) → **6 rojos** — la mutación más grande de las 3, consistente con
   ser el hallazgo más significativo de este arnés.

Las 3 restauradas con `diff` limpio contra el archivo original antes de
continuar.
