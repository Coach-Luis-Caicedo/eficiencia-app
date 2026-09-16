# AIE — Algoritmo Integrador EFICIENCIA (port JS de `classify_2F`/`classify_3F`)

Port 1:1 a JS puro de `aie_validation_kit/engine_core.py` y
`aie_validation_kit/rules_2f_3f.py` — ver
[`../DISENO_PORT_CLASSIFY_2F_3F.md`](../DISENO_PORT_CLASSIFY_2F_3F.md) para el
análisis completo (por qué portar en vez de mantener Python vía subproceso o
servicio HTTP aparte).

**Motivo**: `spawnSync` a un intérprete Python no funciona en el navegador ni
en Cloudflare Workers (sin subprocesos) — el workbook nuevo necesita
`classify_2F`/`classify_3F` corriendo in-process, en JS.

**Sin dependencias externas.** Fiel al Python original, incluidas sus
limitaciones documentadas (simplificación pre-piloto, no implementa
modificadores `POLARIZATION`/`NODE_CONCENTRATION`, no implementa la familia
`RECOVERY` completa de R06 — ver cabecera de `rules_2f_3f.js`). Ningún
parámetro se recalibra aquí — mismos placeholders `PENDIENTE_VALIDACION`
(`TH_FI=33`, `TH_ID=66`, `TRAJ_WINDOW=3`, `MDC=5.0`, `PERSIST_WINDOW=3`,
`PERSIST_RUN_MIN=2`) que el Python real.

## Archivos

| Archivo | Qué es |
|---|---|
| `engine_core.js` | Port de `engine_core.py`: `position`, `trajectory`, `persistence`, `predominant_improving`, `trajectory_run`. Único punto no literal: la pendiente de `trajectory()` usa la fórmula cerrada de mínimos cuadrados en vez de `np.polyfit` (mismo criterio ya verificado en `motor-piio/temporal.js:_pendiente()` y `motor-sdmo/motor-sdmo.js`). |
| `rules_2f_3f.js` | Port de `rules_2f_3f.py`: `classify_recovery_3F`, `classify_3F`, `classify_2F`. `run_case` (el orquestador de `scenarios.py`) NO se porta — el ensamblaje real de series por nodo/período lo hace el workbook; `aie.test.js` reimplementa esa lógica de ensamblaje solo con fines de verificación. |
| `aie.test.js` | **Prueba de regresión permanente**, no un ejercicio de una sola vez. `node motor-aie/aie.test.js` |
| `fixtures/fixture_2f_3f.json` | La "hoja de respuestas" congelada — 19 884 filas generadas UNA VEZ corriendo el Python real (`aie_validation_kit/gen_fixture_2f_3f.py`), NO se regenera en cada corrida. |

## Verificación cruzada — cómo se aprobó el port

`aie_validation_kit/gen_fixture_2f_3f.py` corre `engine_core.py`/
`rules_2f_3f.py` **sin modificar** sobre:
- los 13 escenarios de `aie_validation_kit/scenarios.py` (84 filas), y
- las 900 series sintéticas de `aie_validation_kit/statistical_simulation.py`
  (900×22 = 19 800 filas, mismo `SEED=11`, mismo generador `gen_unit`,
  reusado tal cual — no reimplementado en JS),

y vuelca el resultado a `fixtures/fixture_2f_3f.json`. `aie.test.js` corre
la MISMA data por el port JS y exige **igualdad exacta** en todas las
etiquetas categóricas (`*_pos`, `*_traj`, `*_pers`, `AIE_2F`, `AIE_3F`) y
conteos (`*_detrun`, `*_imprun`); tolerancia de punto flotante (`1e-9`) SOLO
en la pendiente cruda interna (`*_slope`), nunca en una etiqueta.

**Resultado real, verificado por ejecución**: 0 discrepancias en las 19 884
filas.

## Si `engine_core.py`/`rules_2f_3f.py` cambian en el futuro

1. Correr `aie_validation_kit/gen_fixture_2f_3f.py` de nuevo — regenera
   `fixtures/fixture_2f_3f.json` con el comportamiento Python actualizado.
2. Correr `node motor-aie/aie.test.js` — si el port JS no se actualizó para
   igualar el cambio, esto da rojo inmediato (discrepancias listadas con
   `source`/`t`/`campo`/valor JS vs. valor Python), en vez de descubrir la
   divergencia en producción.
3. Actualizar `engine_core.js`/`rules_2f_3f.js` para igualar el cambio, y
   volver a correr hasta 0 discrepancias.

## Dónde vive esto en la taxonomía de documentación

Candidato a `S-08` (arneses/integración) o a la serie `T`/`S` del propio AIE —
ver `INVENTARIO_DOCUMENTACION_IP.md` §3.2 (`S-04` = AIE). No decidido aquí.
