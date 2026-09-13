# Arnés de integración — `motor-iao` → AIE real (Python, `aie_validation_kit/`)

Tercer arnés de integración real (relación **"con otros instrumentos"** de
la regla de las tres relaciones). Cierra el vacío longitudinal de `CFG` que
`MAPEO_INTEGRACION_AIE.md` y `DISENO_ARNES_IAO_AIE.md` (ambos aprobados
antes de escribir código) identificaron: ni `motor-iao` ni `motor-ice-ieh`
tienen, ni deben tener, noción de serie temporal — esa responsabilidad vive
en la capa de arnés, igual que ya sucedía para `DYN`
(`../motor-integracion-sdmo-aie/`).

Rama `feat/motor-integracion-iao-aie`, desde `main`. A diferencia de
`feat/motor-integracion` y `feat/motor-integracion-sdmo-aie` (que tuvieron
que vendorizar `motor-ice-ieh`/`motor-iao`/`motor-sdmo` porque esas ramas
todavía no estaban mergeadas a `main` cuando se escribieron), **esta rama
parte de un `main` donde `motor-ice-ieh/` y `motor-iao/` ya están
mergeados** (2026-09-05) — `pipeline.js` los importa directamente por ruta
relativa, sin `vendor/`. `aie_validation_kit/` también ya está en `main`, se
invoca tal cual.

Lo que sí se trae copiado, porque las dos ramas de origen no están
mergeadas entre sí ni a `main`: el adaptador de claves de
`feat/motor-integracion` (`bcaea53`) y `segmentarPorHuecos`/`ejecutarAIE`
de `feat/motor-integracion-sdmo-aie` (`685d140`) — copiados byte-idénticos
(confirmado con `diff` contra el commit fuente antes de escribir este
archivo), sin modificar ni una línea de su lógica.

## Hallazgo #1 (ya documentado en el diseño, confirmado ahora con ejecución real): `agregarOrganizacion` NO es intercambiable entre IAO e IDA

`motor-iao.agregarOrganizacion(nodos, opts)` y
`motor-sdmo.agregarOrganizacion(nodos, opts)` comparten el mecanismo de
anonimización y el nombre, pero **no el contrato de entrada**:

| | `motor-sdmo` | `motor-iao` |
|---|---|---|
| `nodos[i].{idas\|personas}` | `idas`: valores **ya calculados** | `personas`: variables **crudas**, sin calcular |
| Qué hace internamente | Solo agrega | Llama `calcular(pv)` por cada persona — recalcula IAO, perfil A/B y brechas |
| Campo escalar de salida | `organizacion.nivelColectivo` | `organizacion.iaoOrg` |

Por esto `calcularSerieOrganizacionalIAO` (este arnés) recibe `nodos` reales
con `personas` por período, sin aplanar a un pool de escalares como hacía
`calcularSerieOrganizacionalIDA` — no es una copia con los nombres
cambiados, es una función que respeta el contrato real de `motor-iao`.

## Hallazgo #2 (nuevo, encontrado al construir este arnés): `motor-iao.agregarOrganizacion` NO tolera `null` en `personas`

Verificado empíricamente antes de decidir cómo tratarlo:
`motor-sdmo.agregarOrganizacion` filtra `null` en `idas` silenciosamente
(no-respuesta individual, §2.8). `motor-iao.agregarOrganizacion` **no tiene
el mismo filtro** — llama `calcular(pv)` directamente sobre cada elemento
de `personas`, sin guardia. Pasar un `null` (para representar una
no-respuesta individual, como se hacía en el arnés de IDA) hace que
`validarVariables(null)` lance:

```
motor-iao: se esperaba un objeto {EST..ACT} o un array de 10 variables (escala 0–100).
```

Ninguno de los dos motores está "mal" según su propio contrato — es una
asimetría real entre ellos, no un defecto de ninguno. **Consecuencia de
diseño:** la no-respuesta individual de una Persona en un nodo se
representa **omitiendo** a esa Persona del array `personas` (ajustando
`convocados` si se quiere conservar la tasa de respuesta real), nunca con
un `null` dentro de `personas` — convención distinta a la que usó el
arnés de IDA para `idas`, por esta razón exacta. Probado explícitamente
(`pipeline.test.js`, sección "Hallazgo de frontera — motor-iao... NO tolera
null").

## Confirmación (pedida explícitamente antes de aprobar el diseño): nodo no-reportable SÍ aporta al pool organizacional

Un nodo con `n < minReportableN` no genera estadísticas propias
(`reportable: false`), pero **su(s) respondiente(s) sigue(n) contando** en
`organizacion.iaoOrg` — confirmado leyendo `agregarOrganizacion` (la suma
`Σ(n_g·IAO_g)/Σn_g` no excluye nodos no-reportables, solo omite su perfil
individual) y verificado con un caso mixto (nodo reportable + nodo
no-reportable en la misma llamada): `organizacion.n` y `organizacion.iaoOrg`
incluyen a ambos, `perfilPorNodo` distingue cuál es cuál. `motor-sdmo` no
tenía un caso análogo que probar (su arnés no incluyó nodos con
`minReportableN` variable) — este es un caso genuinamente nuevo de esta
rama.

## `dyn` es sintético en este arnés — alcance explícito, complemento simétrico de `685d140`

`685d140` conectó `DYN` real con `CFG` sintético. Este arnés hace lo
inverso: `CFG` real (motor-iao), `DYN` sintético. Conectar los dos arneses
en una sola cadena habría mezclado dos cierres de hueco distintos en un
solo commit — se mantienen separados a propósito, mismo criterio que
`685d140` ya documentó para la razón inversa. `ops` sigue en `null` en todos
los períodos (PIIO/EFO — arnés pendiente, encargo 3, fuera de alcance).

## Segmentación por huecos y puente a Python — reutilizados verbatim, no reimplementados

`segmentarPorHuecos(cfgSerie, dyn)` opera sobre dos arrays planos de
`number|null` — es agnóstica de qué motor produjo cada uno. Se reutiliza
sin ningún cambio. Este arnés confirma, con un caso construido para `CFG`
(no solo para `DYN`), que la segmentación cambia el resultado real: el
mismo período (`t=4`, primer punto real tras un hueco) da `DETERIORATING`
si la serie se aplana ignorando el hueco, e `INDETERMINATE` (correcto,
evidencia insuficiente) si se segmenta — la misma prueba numérica que
`685d140` hizo para `DYN`, ahora repetida para `CFG` en vez de asumida por
simetría.

## Casos verificados

| Caso | Qué confirma |
|---|---|
| Agregación temporal básica | `iaoOrg` de un período mixto (2 favorables + 1 deteriorado) coincide con el promedio ponderado real. |
| `null` en `personas` | `agregarOrganizacion` lanza — asimetría real con `motor-sdmo`, no una suposición. |
| No-respuesta por omisión | 3 de 4 convocados, sin `null` en `personas` — `n`/`tasaRespuesta` correctos, `iaoOrg` no se corrompe. |
| Nodo no-reportable | Sigue aportando a `organizacion.iaoOrg`; no genera `perfilPorNodo` propio. |
| Período sin respondientes | `iaoOrg = null` (no se imputa). |
| Puente a Python ejecuta `engine_core` real | `CFG≈10.03` → `CFG_pos="F"` contra los umbrales reales `TH_FI=33`/`TH_ID=66`. |
| End-to-end #1 — estable y favorable | 4 períodos reales de `motor-iao` (todos favorable) → `cfg≈10.03` constante → `AIE_2F=REG_CONVERGENT`. |
| End-to-end #2 — deterioro real progresivo (CFG) | 5 períodos reales, mayoría del nodo pasa de favorable a deteriorada → `cfg` sube monótonamente 10→74 → `CFG_pos` F→D → `AIE_2F=TR_LATENT_COMPATIBLE` (complemento especular del `TR_DYNAMIC_ALTERATION` que `685d140` ya confirmó para deterioro en `DYN`). |
| End-to-end #3 — 3 segmentos, 2 huecos reales | 9 períodos reales, `cfg` con 2 huecos → 3 segmentos exactos; segmento A `DETERIORATING` al final, segmento B `IMPROVING` al final tras reiniciar en `INDETERMINATE` (no hereda continuidad de A), segmento C (1 período) `INDETERMINATE`. Comparado contra "aplanar y concatenar": mismo período real, resultado distinto — prueba de que segmentar cambia el resultado, ahora confirmada también para `CFG`. |

## Qué NO se hizo

- No se modificó `motor-iao.js` ni `motor-ice-ieh.js`.
- No se conectó `motor-sdmo` real como fuente de `dyn` (alcance explícito —
  eso ya lo resolvió `685d140` por separado).
- No se implementó PIIO/EFO — `ops` es `null` en todos los períodos (2F).
- No se hizo merge de ninguna rama a `main`.
- El arnés `EFO`↔`AIE` (encargo 3 del mensaje de Luis) se diseña después de
  que esta rama quede revisada — no antes.

## Mutaciones de prueba de vida (pedidas explícitamente por Luis — ni `bcaea53` ni `685d140` las documentan, verificado con `git show`/`grep`, cero resultados en ambas; se agregan aquí de todos modos porque es la disciplina correcta, no porque el precedente la exigiera)

Ciclo completo: backup → aplicar diff exacto → correr batería real → contar
rojos hasta `RESULTADO` (o hasta el primer error sin capturar, reportado tal
cual) → restaurar → verificar `diff` limpio contra el backup. Ambas
mutaciones restauradas y confirmadas sin diferencia antes de comitear.

**Mutación A — `calcularSerieOrganizacionalIAO`:** `cfg.push(r.organizacion.iaoOrg)`
→ `cfg.push(0)`. Resultado: **16 asserts en rojo explícito**, y luego la
batería **colapsa** con `TypeError: Cannot read properties of undefined
(reading 'periodosReales')` — al no haber ningún `cfg` inválido, la
serie con huecos deja de segmentarse (1 solo segmento en vez de 3) y el
test que asume 3 segmentos revienta al acceder al segundo. No se fuerza un
conteo limpio de "RESULTADO" porque no lo hay — se reporta el colapso tal
como ocurrió, que es una prueba aún más fuerte de que la función es
load-bearing (no solo rojos, sino que el resto de la batería deja de tener
sentido sin ella).

**Mutación B — `segmentarPorHuecos`:** se quitó el `actual = null;` que
corta el segmento en cada hueco. Resultado: **2 asserts en rojo explícito**
(el conteo de segmentos pasa de 3 a 1, los períodos reales de un hueco se
mezclan con el segmento contiguo) y el mismo tipo de colapso posterior al
acceder a un segmento que ya no existe con esa forma.

Ambas mutaciones fueron reproducidas independientemente por Luis contra su
propia copia antes de esta documentación (16 rojos, mismo número).

## Verificación

`node motor-integracion-iao-aie/pipeline.test.js` → **62 asserts OK, 0
fallos**. `node --check` limpio en `pipeline.js`/`pipeline.test.js`;
`python3 -m py_compile` limpio en `run_case_bridge.py`.
