# Investigación — ¿tiene sentido una trayectoria para `CFF`/`FPV`, análoga a `AIE`?

**Estado: investigación honesta, sin propuesta de diseño.** Pregunta
separada del script de simulación — no se resuelve ahí. Responde los 4
puntos exactos que pidió Luis, con evidencia de código real, no
inferencia.

**Adelanto del resultado**: la respuesta no es "sí, aquí está cómo" ni
un "no" simple — es que **ambos motores tienen, hoy, una ausencia total
del concepto** (no un hueco parcial como los de `PIIO`/`CFF`/`FPV` del
Worker), y por razones **distintas** entre sí. Extender `AIE` a
cualquiera de los dos exigiría resolver preguntas de diseño genuinas
que ni el documento técnico ni el motor tocan — no es "conectar un
cable que ya existe".

---

## 1. Qué exige `AIE` realmente — el mecanismo, verificado en `engine_core.js`/`runCase.js`

`motor-aie/runCase.js:42` — `runCase(cfg, dyn, ops)` recibe **3 arrays
de números**, una posición por período, **misma longitud los 3**. Cada
elemento es un valor **ya en escala 0-100**, directamente comparable
entre períodos.

`motor-aie/engine_core.js` opera sobre esos escalares con **umbrales
fijos, no relativos**:
- `position(x)`: `x ≤ 33 → F`, `x ≤ 66 → I`, si no `→ D` (`TH_FI=33`,
  `TH_ID=66`, línea 24-25).
- `trajectory(serie, t, window=3, mdc=5)`: pendiente OLS sobre la
  ventana `[t-2, t]`, comparada contra `MDC/window` (cambio mínimo
  detectable, **en unidades de la misma escala 0-100**).
- `persistence(serie, t, window=3)`: ¿la categoría `F/I/D` se mantuvo
  igual `window` períodos consecutivos?

**Tres precondiciones estructurales, todas verificadas, ninguna
opcional**:
1. Una **serie alineada** — el valor del período `t` y el del período
   `t-1` deben referirse **a lo mismo**, medido de la misma forma.
2. Un **escalar en una escala común (0-100)**, no un objeto compuesto.
3. **Umbrales fijos** (`33/66`, `MDC=5`) que asumen que esa escala
   significa lo mismo en cualquier organización/momento — son
   parámetros `PENDIENTE_VALIDACION` (el propio comentario de
   `engine_core.js:10-11` lo dice), pero **existen y se calibran contra
   esa escala específica**, no contra cualquier número.

Este es el mecanismo — genérico en el sentido de que no sabe nada de
`ICE-IEH`/`SDMO`/`PIIO` en particular (`runCase` solo ve `number[]`),
pero **exige que alguien más ya haya producido esa serie alineada y
normalizada** antes de llamarlo. Para `ICE-IEH`/`SDMO`, ese "alguien"
es `IAO`/`motor-sdmo` (ya producen un puntaje `0-100` por período,
`AUDITORIA_SUPABASE_MOTORES.md` §2). Para `PIIO`, es `DOMAIN_STATE`/
`EFO_STATE` de la cascada (igual, ya normalizado).

---

## 2. `CFF` — cero mención, y dos bloqueos reales, no uno

**Búsqueda exhaustiva** (`grep` sobre `motor-cff/*.js` completo,
README incluido): **cero ocurrencias** de "trayectoria", "tendencia",
"caso anterior", "corridas sucesivas", "serie temporal" con el sentido
de comparar casos distintos en el tiempo. Lo único que aparece cerca
(`versionamiento.js`, `motor-cff/README.md` "Multi-período bajo el
mismo `event_id`, §16.2") es **otra cosa**, verificado leyendo ambos
completos:

- **`versionamiento.js` (§26)** — versiona **revisiones del MISMO
  caso** (`crearNuevaVersion(runAnterior, cambios)`,
  `parent_calculation_version` apunta a la versión anterior **del mismo
  `cff_case_id`**). Es "corregí este caso, aquí está la versión 2" —
  nunca "el caso de marzo vs. el de abril". `INV-CFF-65`/`INV-CFF-66`
  (inmutabilidad histórica, `STALE`) son sobre esa misma revisión, no
  sobre una serie.
- **"Multi-período bajo el mismo `event_id`" (§16.2)** — agregación
  **interna** de un evento que abarca varios meses (enero+febrero+marzo
  como un solo evento con componentes por sub-período) — sigue siendo
  **un caso, una corrida**, no una comparación entre corridas
  sucesivas.

**Bloqueo real #1 — no existe la noción de "casos comparables"**,
confirmado contra el esquema (`036`, `cff_casos`): no hay ningún campo
que vincule un `cff_case_id` con el que "le correspondería" en el
período anterior (nada como `series_id`/`previous_case_id`). Dos casos
sucesivos de la misma organización pueden tener `node_set`,
`economic_scope`, `scope` genuinamente distintos (el analista los
declara cada vez, sin restricción de continuidad) — el propio contrato
de `CFF_CASE` no exige ni verifica que sean "la misma medición,
repetida". Comparar `cff_total` de dos casos con alcances distintos
sería, literalmente, comparar cosas distintas — el motor no tiene
ningún mecanismo (ni el documento técnico lo exige) para detectar esa
incompatibilidad antes de que alguien intente la comparación.

**Bloqueo real #2 — no hay ninguna escala 0-100 comparable**: `cff_total`
es un monto monetario sin cota (`numeric`, en la moneda de reporte de
ese caso) — no un índice normalizado. Los umbrales `33/66`/`MDC=5` de
`engine_core.js` no significan nada sobre un monto en pesos; aplicarlos
requeriría **inventar** una normalización (¿contra qué? ¿el `cff_total`
del período base? ¿un presupuesto declarado?) que **no existe en
ningún lugar** del documento técnico ni del motor — sería fabricar una
resolución, exactamente el tipo de atajo que esta sesión evita.

**Conclusión para `CFF`**: extender `AIE` aquí no es "conectar un
motor ya capaz" — son **dos preguntas de diseño sin resolver**, cada
una no trivial: (a) qué hace a dos casos "comparables" (mismo
`node_set`/alcance, declarado explícitamente o inferido), y (b) cómo
normalizar `cff_total` (o qué otra salida de `CFF_RESULT`) a una escala
donde los umbrales de `AIE` — o unos nuevos, calibrados aparte —
tengan sentido.

---

## 3. `FPV` — mismo vacío, pero el motivo estructural es otro

**Búsqueda exhaustiva, mismo rigor** (`grep` sobre `motor-fpv/*.js` +
README completos): **cero ocurrencias** de trayectoria/tendencia/ronda
anterior. Más revelador — repasando el plan de fases completo (§0-§6,
`README.md:52-64`) y las 9 decisiones A-I aprobadas por Luis: **`FPV_INPUT`
no tiene ningún campo de período en su propio contrato**. `period` solo
existe en `fpv_respuestas` (`032:159`, comentario propio de esa
migración, ya citado en `INVESTIGACION_POSICIONES_FPV.md` §2): *"el
motor no tiene concepto de período propio... es la extensión de la capa
de persistencia para poder reconstruir un batch válido"*. Es decir: el
período de `FPV` es un artefacto de **cómo se guardan las respuestas**,
no algo que `runFPV` reciba, use, ni sepa que existe.

**Lo que sí es prometedor, señalado con honestidad**: `L` (el nivel
promedio por sensor, `motor-fpv/README.md`, Fase 2 §7.2.A) **ya vive en
una escala 0-100** — técnicamente compatible con los umbrales de
`engine_core.js` sin necesitar normalización nueva, a diferencia de
`CFF`. Eso NO es evidencia de que el motor lo contemple — es una
coincidencia de escala, verificada, no una intención del documento.

**La pregunta genuinamente distinta que Luis anticipó — comparabilidad
de la población, no solo de la escala**: `ICE-IEH`/`SDMO` miden una
población relativamente estable (empleados, con `persona_id`
persistente entre períodos, aunque haya rotación). `FPV` mide
percepción de **terceros externos** (clientes/inversionistas/
proveedores) — el propio contrato (`contratos.js:21-28`, decisión E)
ni siquiera exige que el mismo `persona_id` reaparezca entre
"rondas" (no hay rondas en el contrato para empezar). Nada en el
documento técnico ni en el motor garantiza, ni siquiera discute, que
la ronda de `2026-04` y la de `2026-09` estén midiendo una población
comparable — un cambio en `L` podría reflejar un cambio real de
percepción, o simplemente que respondió un grupo de clientes distinto.
`AIE` no tiene este problema con `ICE-IEH`/`SDMO` porque la
continuidad de persona (o al menos de nodo) está más establecida en
esos motores; para `FPV` es una pregunta abierta genuina, no resuelta
por el texto ni por el código.

**Conclusión para `FPV`**: el bloqueo NO es de escala (`L` ya es
0-100) — es que (a) el motor no tiene ningún concepto de "ronda
sucesiva" en su propio contrato (`period` es enteramente de la capa de
persistencia), y (b) incluso si se le agregara uno, falta resolver si
comparar percepciones de poblaciones externas potencialmente distintas
entre rondas significa lo mismo que comparar la salud de la misma
plantilla de empleados mes a mes — una pregunta metodológica real, no
solo técnica.

---

## 4. Resumen — ¿el mecanismo de `AIE` se podría extender?

**Técnicamente, `runCase`/`engine_core.js` son agnósticos** — no saben
nada de `ICE-IEH` ni `PIIO`, solo consumen `number[]` en escala 0-100.
Si alguien produjera esa serie normalizada y alineada para `CFF`/`FPV`,
el mecanismo de posición/trayectoria/persistencia funcionaría igual
(mismo código, sin cambios). **Pero producir esa serie es exactamente
el trabajo no resuelto** — no es una integración, es diseñar desde cero
qué significa "trayectoria" para cada uno:

| | `CFF` | `FPV` |
|---|---|---|
| ¿Existe el concepto en el documento técnico? | No — cero mención, ni siquiera como pendiente | No — cero mención |
| ¿El motor tiene noción de período propio? | Sí (`CFF_EVENT.period_start/end`), pero por caso, no por serie | **No, ni siquiera eso** — período es solo de la tabla |
| ¿Hay noción de "comparable" entre corridas sucesivas? | No — ningún campo de vínculo, `node_set`/alcance libre cada vez | No aplica (no hay corridas sucesivas en el contrato) |
| ¿Hay una salida en escala 0-100 ya normalizada? | No — `cff_total` es monto sin cota | **Sí** — `L` por sensor ya es 0-100 |
| Pregunta adicional genuina | Cómo normalizar un monto a índice | Si comparar poblaciones externas distintas entre rondas es válido |

**Ninguno de los dos está "casi listo"** — `FPV` tiene una ventaja de
escala que `CFF` no tiene, pero le falta el concepto de período en el
propio contrato del motor (más fundamental que a `CFF`, que sí sabe qué
es un período por caso). Ninguno se resuelve con más datos de
simulación ni con una extensión pequeña del Worker (a diferencia de
`041`/`042`/`043`, que sí eran "el motor ya sabe hacerlo, falta
conectarlo") — esto es diseño nuevo, del motor o de una capa encima de
él, no conectividad.

**Si se decide perseguir esto**, cada motor necesitaría su propia ronda
de investigación→diseño (mismo estándar que `PIIO`/`CFF`/`FPV` del
Worker), empezando por resolver, con Luis, las preguntas de la tabla de
arriba — no se resuelven por conveniencia ni se fuerza una analogía con
`ICE-IEH` que el propio código no sostiene.
