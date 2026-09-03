# Motor de cálculo — SDMO (Sensor Diario de Modo Operativo) + IDA

Módulo **aislado**, mismo criterio que [`../motor-ice-ieh/`](../motor-ice-ieh/).
No toca ningún código de producción (encuestas de clima / pulso incluidas). No
implementa IAO ni el AIE. No se integra a producción hasta aprobación explícita
tras revisar la verificación.

- **Fuente de verdad:** [`../DOCUMENTO_TECNICO_SDMO_IAO_v1.md`](../DOCUMENTO_TECNICO_SDMO_IAO_v1.md),
  **secciones 2.1–2.10** (la sección 3+ es IAO — fuera de alcance).
- **Nomenclatura:** solo `ACU / COM / INV / PEN` (ACTUAR / COMUNICAR /
  INVOLUCRARSE / PENSAR). La nomenclatura histórica
  (Confianza/Colaboración/Compromiso/Creatividad) e "INTERACTUAR" están
  descartadas (§2.3, §5) y **no aparecen** en el módulo.

## Archivos

| Archivo | Qué es |
|---|---|
| `motor-sdmo.js` | Motor puro (sin DOM). UMD: `require()` en Node / `window.MotorSDMO` en browser. |
| `motor-sdmo.test.js` | Batería de verificación. `node motor-sdmo/motor-sdmo.test.js` |

## Confirmaciones pedidas en el encargo

- **Nomenclatura:** verificada línea por línea. Las 5 apariciones de términos
  viejos en el documento están todas dentro de notas de descarte / trazabilidad
  (*"queda descartada"*, *"se renombró a"*, *"nomenclatura histórica"*). El
  módulo usa **exclusivamente `ACU, COM, INV, PEN`**.
- **Colisión de códigos:** ninguna. `ACU ≠ ACT`; ninguno de `ACU/COM/INV/PEN`
  coincide con los prefijos reservados de ICE–IEH (`EST, FOR, INE, COH, IMP,
  EQU, NEX, CNF, ITG, ACT`). Verificado en el Caso 7.
- **Persistencia corregida — reimplementada en JS, sin dependencia cruzada.**
  La lógica de "racha de trayectoria sostenida" (`trayectoria` /
  `rachaTrayectoria`) está **escrita de cero en JS dentro de este módulo**. No
  hay `require`, import ni llamada a `aie_validation_kit/` (que es código de
  prueba en Python). `engine_core.py:trajectory_run()` se usó solo como
  referencia conceptual.

## Corrección de persistencia (obligatoria, no está en el documento base)

La prueba de estrés del AIE ([`../HALLAZGOS_PRUEBA_ESTRES_AIE.md`](../HALLAZGOS_PRUEBA_ESTRES_AIE.md)
§3, casos 3 y 11) encontró que la **persistencia categórica pura** —contar
períodos consecutivos en la misma categoría F/I/D— se **resetea a 1 justo en el
período en que la serie cruza de una categoría a otra**, que es exactamente
cuando se necesita detectar el cambio. Este módulo implementa desde el inicio:

```
persistente  ⇔  persistenciaCategorica  >= PERSIST_MIN
                OR
                rachaTrayectoria         >= PERSIST_RUN_MIN
```

`rachaTrayectoria` cuenta períodos consecutivos con la **trayectoria** (pendiente
sobre ventana móvil) en la misma dirección — NO períodos en la misma categoría.
No se resetea en el cruce. Ambos umbrales son `PENDIENTE_VALIDACION`.

El **Caso 3** de la batería reproduce el bug contra esta implementación JS (no
citando el resultado de Python): serie `[20,30,42,55,68,75]` que cruza a `D` en
`t=4`. En `t=4` la corregida clasifica **`persistente`** (vía racha, `porRacha=true`,
`porCategorica=false`); la versión puramente categórica da `puntual` en `t=4` y
solo llega a `repetida` en `t=5` — **un período tarde**, el retraso descrito en
el hallazgo.

## Reglas implementadas

### Normalización (§2.5)

```
z = (x − 1) / 4          escala 1–5 → [0, 1], por dimensión
```

### IDA individual (§2.6)

```
M_i   = promedio(z_ACU, z_COM, z_INV, z_PEN)          — extensión general
C_i   = segundo valor más alto de las 4 z  (= z_(3))  — concentración multidim.
IDA_i = 100 × [δ·M_i + (1 − δ)·C_i]
```

- `C_i` sube de forma relevante solo cuando **≥ 2 dimensiones** están elevadas
  (Caso 2: 1 dim en 5 → `C_i = 0`; 2 dims en 5 → `C_i = 1`).
- `δ` es `PENDIENTE_VALIDACION`. `calcularIDA` **exige `opts.delta`** — lanza
  `Error` si no se pasa. No hay valor por defecto.

### No-respuesta (§2.8)

- `calcularIDA(null | undefined | {})` → `{ respondio: false, IDA: null, … }`.
  **Nunca 0, nunca un valor de deterioro.** No modifica ningún promedio.
- Serie de participación independiente: `TasaRespuesta = válidas / convocadas`,
  con su propia trayectoria (`calcularSerieTasaRespuesta` + `trayectoria`).

### Trayectoria y persistencia (§2.7 + corrección)

- `categoria(ida, opts)` → `F | I | D` (cortes `PENDIENTE_VALIDACION`).
- `trayectoria(serie, t, opts)` → pendiente sobre la ventana
  `[t−trendWindow+1, t]` con `opts.estimadorPendiente` (función requerida,
  `PENDIENTE_VALIDACION`; `pendienteLineal` = mínimos cuadrados se exporta para
  pasarla); los `null` se saltan; `< 2 puntos` → `indeterminado`. Direcciones:
  `ascendente` (IDA sube = deterioro) / `estable` / `descendente` (IDA baja =
  recuperación).
- `persistenciaCategorica` / `rachaTrayectoria` / `clasificarSenal` →
  `puntual | repetida | persistente`.

### Agregación colectiva (§2.9)

- **Nivel colectivo:** `M_nodo,t = promedio(IDA_i,t)` (`agregarNodo`).
- **Concentración:** `concentracionColectiva` por percentil — ver "Decisiones
  cerradas · D1" (era la pieza menos especificada; aprobada sin cambios).
- **Nivel organización:** `agregarOrganizacion` — pooling de individuos, nivel +
  concentración + dispersión sobre la distribución combinada, perfil por nodo en
  paralelo. Ver "Decisiones cerradas · D6".
- **RETIRADO, no implementado:** "promedio + segundo mayor entre Personas". El
  módulo no contiene ningún mecanismo de segundo-mayor-entre-Personas ni
  equivalente (Caso 5 verifica que la API no expone nada así).

### Confidencialidad (§2.10)

- `MIN_REPORTABLE_N` `PENDIENTE_VALIDACION` (hipótesis `N ≥ 8–10`).
- `agregarNodo`: si `n < minReportableN` → `reportable: false` + `idasParaAgregar`
  (para el nivel superior). `agregarNivelSuperior` hace el roll-up de un nivel:
  absorbe los hijos sub-umbral al pool del padre, lista los reportables aparte,
  no pierde ningún dato (Caso 6).
- `agregarOrganizacion`: agregación a nivel organización sobre la **distribución
  individual combinada** (no sobre resúmenes de nodo). Ver "Decisiones cerradas ·
  D6" para el mecanismo de anonimización. Caso 9.

## Verificación

`node motor-sdmo/motor-sdmo.test.js` → **120 asserts OK, 0 fallos**. `node --check`
pasa en ambos `.js`.

| Caso | Qué prueba | Parámetros de prueba usados |
|---|---|---|
| 1 | Neutro (4×3): `M_i = 0.5`, `IDA_i = 50` para **cualquier** δ. | δ ∈ {0.1, 0.5, 0.9} |
| 2 | Concentración: 1 dim extrema → `C_i = 0`, `IDA` bajo y **sensible a δ**; 2 dims → `C_i = 1`, `IDA` salta. | δ ∈ {0.3, 0.5, 0.7} |
| 3 | Cruce F→D (ver datos abajo): en el período del cruce (`t=4`) `persistenciaCategorica = 1`, `rachaTrayectoria = 4` → la corregida clasifica `persistente` (`porRacha=true`, `porCategorica=false`); la puramente categórica clasifica `puntual` y no emite señal hasta `t=5` (`repetida`), 1 período tarde. | trendWindow 3, cambioMinimo 5, estimadorPendiente `pendienteLineal`, persistMin 3, persistRunMin 4, F≤40 / D≥60 |
| 4 | No-respuesta: `IDA = null` (no 0, no deterioro); el `null` en serie se salta; `TasaRespuesta` refleja la ausencia y tiene trayectoria propia. | δ 0.5; para la tasa: trendWindow 3, cambioMinimo 0.15 |
| 5 | 1 extremo + 9 estables: el promedio (32, "F") oculta el extremo; `proporcionExcedente = 0.1` y `max = 95` no; la medida es **proporcional al n** (0.1 con n=10 y con n=100). | percentil 90, umbral 70, F≤40 |
| 6 | `n = 5 < 8` → no reporta, sube al padre; roll-up combina 5+3 IDA en un padre `n=8` reportable. | minReportableN 8 |
| 7 | 4 códigos `ACU/COM/INV/PEN`, sin colisión con ICE–IEH; todos los `PENDIENTE_VALIDACION` en `null` (incl. `estimadorPendiente`); las funciones exigen los parámetros pendientes explícitos. | — |
| 8 | Respuesta **parcial** (faltan 1–3 dims) → no-respuesta (`null`), **no error**; solo valores presentes fuera de rango 1–5 → `Error`. | — |
| 9 | Agregación organización: `nivelColectivo` = pooling de individuos = `Σ(n_g·M_g)/Σn_g` ≠ promedio simple de medias de nodo (52) ni de reportables (43); la concentración P90 org ≠ promedio de P90 por nodo; nodo sub-umbral aporta al pool pero no expone estadísticas; `excluirNodos:["C"]` re-ejecuta sin operar sobre el pool; el pool anónimo nunca se devuelve. | minReportableN 8, percentil 90 |

### Datos del Caso 3 — persistencia en el cruce F→D

Serie de IDA: `[20, 30, 42, 55, 68, 75]` (t = 0…5). Categoría: `F F I I D D` — **cruce a `D` en t = 4**.

```
 t | IDA | cat | trayectoria      | persCateg | rachaTray | CORREGIDA    | SOLO-CATEGÓRICA
---+-----+-----+------------------+-----------+-----------+--------------+----------------
 0 |  20 |  F  | — indeterminado  |     1     |     0     | puntual      | puntual
 1 |  30 |  F  | +10.0 ascendente |     2     |     1     | repetida     | repetida
 2 |  42 |  I  | +11.0 ascendente |     1     |     2     | puntual      | puntual
 3 |  55 |  I  | +12.5 ascendente |     2     |     3     | repetida     | repetida
 4 |  68 |  D  | +13.0 ascendente |     1     |     4     | persistente  | puntual      ← cruce
 5 |  75 |  D  | +10.0 ascendente |     2     |     5     | persistente  | repetida
```

En **t = 4** (el cruce): `persistenciaCategorica` se **resetea a 1** (acaba de entrar
a `D`); `rachaTrayectoria = 4` (ascendente ininterrumpida desde t = 1, **no** se
resetea). La corregida → `persistente` por la vía de la racha (`porRacha=true`,
`porCategorica=false`). La versión puramente categórica → `puntual` (catRun 1 <
persistMin 3, y < 2 ⇒ ni "repetida"): **pierde la señal en el cruce**, solo llega a
`repetida` en t = 5 (1 período tarde) y a `persistente` en t = 6 (2 tarde).

## Decisiones cerradas (revisión de Luis, 2026-09-03)

### D1. Concentración / distribución colectiva (§2.9) — **APROBADO sin cambios**

`concentracionColectiva(idas, opts)` expone **medidas crudas**, no un veredicto:

- `percentil` — el percentil `opts.percentilConcentracion` (requerido,
  `PENDIENTE_VALIDACION`) de la distribución de IDA del nodo, por interpolación
  lineal entre rangos contiguos (método por defecto de `numpy.percentile`).
- `proporcionExcedente` — opcional: si se pasa `opts.umbralConcentracion`, la
  fracción de Personas con `IDA ≥ umbral` (y su cuenta).
- `agregarNodo` añade `dispersion` sin parámetros: desviación estándar
  poblacional, IQR, min, max.

**Por qué un percentil:** es proporcional al tamaño del grupo por construcción
(P90 = "el 10% superior" para cualquier `n`) — la propiedad que §2.9 exige y que
el segundo-mayor-absoluto no tiene (Caso 5).

**No se implementa el clasificador de 3 configuraciones** (deterioro
generalizado / foco concentrado / caso aislado): sus cortes son 100% de piloto y
no se inventan umbrales para avanzar. Se exponen las medidas crudas y nada más.

### D2. Respuesta parcial del SDMO (§2.8) — **no se imputa**

Si NO están las 4 respuestas —falten 1, 2, 3 o las 4— ese período **no genera
IDA**: se trata como **no-respuesta completa** (`validarRespuestaIndividual`
devuelve `null`, `calcularIDA` → `respondio:false, IDA:null`), entra a
`TasaRespuesta` como ausencia, nunca como IDA parcial ni con relleno. Mismo
principio que §2.8 y que el ítem equivalente en ICE–IEH. Solo los valores
*presentes* fuera del rango 1–5 (o no enteros) lanzan `Error` — eso es
corrupción de datos, no una elección de participación. Verificado en el Caso 8.

### D3. Método de la pendiente — parámetro intercambiable `PENDIENTE_VALIDACION`

`trayectoria` recibe `opts.estimadorPendiente`, una función `(xs, ys) => number`,
**requerida** (misma categoría que `δ` y `persistRunMin`). El módulo no fija el
método. Se exporta `pendienteLineal` (mínimos cuadrados) para pasarla
explícitamente; el piloto decidirá si es esa o una regresión robusta / Theil–Sen
/ diferencia extremo-a-extremo. La banda "estable" usa
`|pendiente| ≤ cambioMinimo / trendWindow`; `cambioMinimo` depende de la escala
de la serie (IDA 0–100 vs `TasaRespuesta` 0–1 — el Caso 4 usa 5 y 0.15).

### D4. Dirección de la escala F / I / D — **confirmada**

`IDA` alto = polo restrictivo / deteriorado (consistente con §2.6 y con la
convención de todo el sistema: mismo sentido que ICE–IEH y que el AIE). Por tanto
`IDA ≤ umbralFavorable → 'F'`, `IDA ≥ umbralDeteriorado → 'D'`. Sin ajuste.

### D5. "Cambio abrupto" y "Recuperación sostenida" (§2.7) — **fuera de alcance**

El encargo pidió trayectoria + persistencia, no las 5 propiedades temporales
completas del §2.7. `Nivel` (`categoria`), `Tendencia` (`trayectoria`) y
`Persistencia` (`clasificarSenal`, corregida) están. `Cambio abrupto` y
`Recuperación sostenida` quedan para una tarea posterior — probablemente al
conectar con el AIE, que ya tiene el concepto equivalente vía
trayectoria/modificadores. No se agregan ahora (sus umbrales son de piloto).
`trayectoria` sí expone `movimiento: 'recuperacion'` para un IDA descendente,
pero sin clasificador de recuperación sostenida.

### D6. Agregación a nivel organización (§2.9 + §2.10) — **implementada**: `agregarOrganizacion`

**El problema.** §3.9 da `IAO_ORG = Σ(N_g·IAO_g)/ΣN_g` para el IAO. Para el
**nivel** SDMO esa media ponderada es correcta (idéntica al pooling de
individuos). Para la **concentración** NO: `P90(org) ≠ Σ(N_g·P90_g)/ΣN_g` — un
percentil no se promedia. El P90 organizacional necesita la **distribución
individual combinada**, no los resúmenes de nodo.

**Solución.** `agregarOrganizacion(nodos, opts)`:

- **Nivel + concentración + dispersión** sobre el **pool** = todos los IDA
  individuales de respondientes válidos, concatenados. `nivelColectivo` del pool
  = `Σ(n_g·M_g)/Σn_g` = ponderación **por respondientes** (cada IDA cuenta una
  vez). **Nunca por convocados** — eso sería imputación encubierta (§2.8).
- **`perfilPorNodo`** en paralelo, estructura separada **con `id` de nodo**, para
  localizar el origen de una señal (como §3.6 conserva el perfil por par junto al
  IAO global). Un nodo con `n < minReportableN` **no expone estadísticas** ahí
  (§2.10): solo `nAportadoAlPool`.

**Mecanismo de anonimización (decisión explícita).**

1. El pool es **plano y anónimo**: **no viaja `nodo_origen`** ni ningún otro
   atributo junto a cada IDA. El pool **no se devuelve** — los individuos nunca
   se reportan (§2.10); solo se devuelven `n` y los agregados.
2. **Excluir un nodo después** (datos corruptos, etc.) **no** se opera sobre el
   pool anónimo: se re-ejecuta `agregarOrganizacion` con `opts.excluirNodos:
   [id, …]`. Los `id` disponibles para hacerlo viven en `perfilPorNodo`, no en el
   pool. Caso 9 lo verifica (`excluirNodos:["C"]` → pool 34→14, nivel distinto).
3. **Reidentificación por intersección de filtros:** el pool no lleva atributos ⇒
   no hay subgrupos que intersectar dentro de él. `perfilPorNodo` ya está
   protegido por `minReportableN`. **No se ofrece ningún corte del pool por
   atributos de subgrupo.** Si en el futuro se quiere segmentar el pool (función,
   ubicación, turno…), esa segmentación pasa por el mismo gate de
   `minReportableN` y su tamaño mínimo de segmento queda `PENDIENTE_VALIDACION`.
4. `perfilPorNodo` **no expone IDA individuales** en ninguna entrada (ni
   `idas` ni `idasParaAgregar`) — verificado en el Caso 9.

## Qué NO hace este módulo

- No implementa IAO (§3+) ni el AIE.
- No fija `δ`, `trendWindow`, `cambioMinimo`, `estimadorPendiente`, `persistMin`,
  `persistRunMin`, `umbralFavorable`, `umbralDeteriorado`, `minReportableN`,
  `percentilConcentracion` ni `umbralConcentracion` — todos `PENDIENTE_VALIDACION`,
  exigidos explícitos.
- No implementa "segundo mayor entre Personas" ni ninguna variante.
- No implementa "cambio abrupto" ni "recuperación sostenida" (§2.7) — fuera de
  alcance del encargo (D5).
- No implementa el clasificador colectivo de 3 configuraciones (§2.9) — sus
  cortes son 100% de piloto (D1).
- No segmenta el pool organizacional por atributos de subgrupo (D6, punto 3).
- No toca `workbook.html` ni ningún código de producción.
- No importa nada de `aie_validation_kit/` (Python de prueba).
