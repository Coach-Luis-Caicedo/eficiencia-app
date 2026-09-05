# Motor de cálculo — CFF (Costo Financiero de la Fricción)

Módulo **aislado**, mismo criterio que [`../motor-ice-ieh/`](../motor-ice-ieh/),
[`../motor-sdmo/`](../motor-sdmo/) y [`../motor-iao/`](../motor-iao/). No
implementa PIIO ni AIE (se consumen como contexto probatorio sintético en las
pruebas de atribución). No implementa evitabilidad, contrafactual,
intervención, verificación causal, ROI ni ninguna pieza de IFT (§33.1, "fuera
del núcleo CFF"). No se integra a producción hasta aprobación explícita.

- **Fuente de verdad:** [`../docs/EFICIENCIA_Documento_Tecnico_CFF_v1_1_FINAL_v2.docx`](../docs/EFICIENCIA_Documento_Tecnico_CFF_v1_1_FINAL_v2.docx)
  — v1.1 FINAL, 70 invariantes (`INV-CFF-01..70`), 10 contratos (§22.1-22.10),
  60 casos de aceptación (`AC01..AC60`, §31), acceptance gate de 10 puntos (§32).
  Reemplaza por completo el plan basado en la v1.0/v1.1 anterior (23 escenarios,
  60 invariantes, consolidación en §17) — no queda nada reutilizado de ese plan.

## Plan de fases (aprobado antes de escribir código)

| Fase | Alcance | Estado |
|---|---|---|
| 0 | Contratos como validadores (§22, 10 contratos) + registro de enums (§21/§23) + `resolve_status()` (§21) como función pura | ✅ |
| 1 | Monetización: 4 mecanismos (§6, §8), naturaleza financiera + `recovery_realization_type` (§7, §7.1), bases monetarias (§9), calidad de monetización (§10) | ✅ |
| 2 | Atribución: motor determinista (§11), profundización y genealogía (§12) | ✅ |
| 3 | Relaciones, dedup, jerarquía: relaciones económicas + grafo + ciclos (§13), costos compartidos/transferencias (§14), nodos y alcance (§15) | ✅ |
| **4a** | Normalización: temporalidad/frecuencia (§16), moneda/FX/NOMINAL-REAL (§17) | **✅ Esta entrega** |
| 4b | Consolidación end-to-end: admisibilidad (§18), fórmula de consolidación (§19), cobertura (§20), algoritmo `runCFF()` (§24) | Pendiente |
| 5 | Fallos/short-circuit (§25), versionamiento/staleness (§26), batería completa: 70 invariantes + 60 AC + acceptance gate (§32) | Pendiente |

Aprobación fase por fase — no se construyen las seis de corrido. Las secciones
§27-29 (evitabilidad, contrafactual/intervención, integración IFT) quedan fuera
del núcleo por declaración explícita del documento (§33.1); los invariantes que
tocan esa frontera (`INV-CFF-37..40`, `56..60`, `69`) sí se verifican, como
pruebas negativas, distribuidos en las fases donde corresponden.

## Archivos

| Archivo | Qué es |
|---|---|
| `enums.js` | Registro canónico de enums, combinando §21 + §23 + los inline-only de §22 tratados como autoritativos. Fase 1 agregó `RECOVERY_REALIZATION_TYPE` (§7.1). |
| `estados.js` | `resolveStatus()` — la función pura de propagación de calidad del §21. **No** está cableada a ningún pipeline todavía (eso es Fase 4b/5). |
| `contratos.js` | Los 10 validadores de contrato (§22.1-22.10): campos obligatorios/opcionales, tipos, enums, y 8 reglas condicionales (5 de Fase 0 + 3 extensiones de Fase 1). Sin lógica de negocio. |
| `contratos.test.js` | Batería de contratos. `node motor-cff/contratos.test.js` → **81 asserts OK, 0 fallos**. |
| `monetizacion.js` | **Fase 1.** Los 4 mecanismos (§6), `resolverValorComponente` (calcula solo en `UNIT_RATE`), `calcularLostCapacity` (§8.2, reconstrucción obligatoria), `agregarPorMecanismo` (§35, CA/VCP/CR/VNC), `preferirBaseMonetaria` (§8.5). |
| `monetizacion.test.js` | Batería de monetización. `node motor-cff/monetizacion.test.js` → **49 asserts OK, 0 fallos**, incluida verificación por mutación de la regla de §8.2. |
| `atribucion.js` | **Fase 2.** `clasificarAtribucion` (§11, 6 dimensiones → `CONFIRMED`/`SUPPORTED`/`UNRESOLVED`), `profundizar` (§12, nueva versión + inmutabilidad de la anterior). |
| `atribucion.test.js` | Batería de atribución. `node motor-cff/atribucion.test.js` → **41 asserts OK, 0 fallos**, incluidas 3 mutaciones (precedencia `CONFIRMED`/`SUPPORTED`, lectura ampliada de convergencia). |
| `relaciones.js` | **Fase 3.** Grafo económico + detección de ciclos sobre `CONTAINS` (§13.3, `AC15`), `resolverRelacion` (§13, las 6 reglas de suma por tipo de relación). |
| `relaciones.test.js` | Batería de relaciones. `node motor-cff/relaciones.test.js` → **23 asserts OK, 0 fallos**, incluida mutación de la detección de ciclos. |
| `costos_compartidos.js` | **Fase 3.** `resolverCostoCompartido` (§14, no prorratea sin base documentada), `filtrarTransferenciasInternasPuras` (§14, elimina en alcance ORGANIZATION, conserva en NODE). |
| `costos_compartidos.test.js` | Batería de costos compartidos. `node motor-cff/costos_compartidos.test.js` → **13 asserts OK, 0 fallos**, incluida mutación del no-prorrateo. |
| `nodos.js` | **Fase 3.** `NODE_HIERARCHY` (extensión del arnés, ver abajo) + las 4 reglas de §15 (`LEAF_ONLY`/`AGGREGATE_ONLY`/`NO_PARENT_CHILD_DOUBLE_COUNT`/`SEGMENT_ONLY`) vía `clasificarAlcance`. |
| `nodos.test.js` | Batería de nodos. `node motor-cff/nodos.test.js` → **22 asserts OK, 0 fallos**, incluida mutación de `NO_PARENT_CHILD_DOUBLE_COUNT`. |
| `temporalidad.js` | **Fase 4a.** `filtrarSumablesPorNaturalezaTemporal` (§16, PERIOD_FLOW/STOCK/RATE), `validarFrecuenciaConsistente` (§16.1), `agruparComponentesPorPeriodo` (§16.2, mismo `event_id` a través de varios períodos), `anualizar` (§16.3, compuerta post-consolidación). |
| `temporalidad.test.js` | Batería de temporalidad. `node motor-cff/temporalidad.test.js` → **24 asserts OK, 0 fallos**, incluido el caso real de 3 períodos bajo el mismo evento. |
| `moneda.js` | **Fase 4a.** `convertirMoneda`/`sumarConMonedaControlada` (§17, FX explícito, nunca suma monedas sin conversión), `redondear` (§17.2, presentación únicamente). |
| `moneda.test.js` | Batería de moneda. `node motor-cff/moneda.test.js` → **18 asserts OK, 0 fallos**, incluida mutación de la precisión computacional completa (§17.2). |
| `admisibilidad.js` | **Fase 4b (i).** `evaluarAdmisibilidad` (§18, compuerta AND estricta sobre 7 condiciones ya resueltas por fases anteriores — no las recalcula). |
| `admisibilidad.test.js` | Batería de admisibilidad. `node motor-cff/admisibilidad.test.js` → **44 asserts OK, 0 fallos**, incluidas 2 mutaciones (AND ≠ score; par desincronizado vs. salvaguarda) y la prueba dirigida de `verificarConsistenciaInterna`. |
| `consolidacion.js` | **Fase 4b (ii).** `consolidarPeriodoYAlcance` (§19, los 6 pasos `VALIDAR→NORMALIZAR→RELACIONAR→RESOLVER→SELECCIONAR→SUMAR` en orden estricto, delegando en fases previas) + `verificarReconciliacionCuadrantes` (AC45). |
| `consolidacion.test.js` | Batería de consolidación. `node motor-cff/consolidacion.test.js` → **46 asserts OK, 0 fallos**, incluidas las 2 mutaciones (orden RESOLVER↔SELECCIONAR: 20000→30000; AC45: reconciliación bloquea), el Paso 3 (INV-CFF-20 en totales secundarios) y la prueba dirigida de `verificarReconciliacionCuadrantes`. |
| `cobertura.js` | **Fase 4b (iii).** `clasificarCobertura` (§20, las 4 categorías `COVERAGE_STATUS` — criterio cualitativo, sin umbral numérico) + `distinguirCeroDeNA` (§20/AC21/AC22/AC46, `CFF=0` real vs `CFF=N_A` con `value=null`). |
| `cobertura.test.js` | Batería de cobertura. `node motor-cff/cobertura.test.js` → **41 asserts OK, 0 fallos**, incluida la verificación de partición independiente del orden sobre los 64 casos (condiciones crudas + solapamientos localizados), las 2 mutaciones (N_A→0 prohibida por AC46; precedencia FULL/LIMITED) y la prueba dirigida de `_verificarValorConsistente`. |

## Las 5 reglas condicionales (aprobadas antes de implementar)

Un contrato "obligatorio/opcional" no captura toda la coherencia interna que el
documento exige de un objeto consigo mismo. Estas 5 reglas la completan, y
**son las únicas** reglas condicionales de Fase 0 — cualquier otra candidata
que el texto sugiera queda señalada más abajo como pendiente de fase posterior,
no fabricada aquí:

1. **`ECONOMIC_COMPONENT`** — `formula_id` / `formula_version` /
   `input_variables[]` (no vacío) obligatorios si `calculation_mode ===
   DERIVED_FORMULA`.
2. **`ECONOMIC_RELATION`** — `containment_scope` obligatorio si
   `relation_type === CONTAINS`; **rechazado** (no debe declararse) en
   cualquier otro `relation_type`.
3. **`ECONOMIC_RELATION`** — `direction` obligatorio si `relation_type ∈
   {CONTAINS, DEPENDENT_COST}` (relaciones dirigidas, §13.3); **rechazado**
   (no solo ignorado) si `relation_type === DUPLICATE` (simétrica) — precisión
   explícita de Luis: permitir que conviva sin uso invita a leerlo como si
   importara.
4. **`MONETARY_BASIS`** — `basis_value` **XOR** (`basis_value_min` **y**
   `basis_value_max`) — nunca los tres, nunca ninguno, nunca un rango parcial
   (§9).
5. **`ECONOMIC_COMPONENT`** — `normalized_value` y `reporting_currency` deben
   declararse juntos o ninguno de los dos. **Más débil** que "obligatorios
   cuando la consolidación es multi-moneda": Fase 0 valida un objeto aislado y
   no puede saber si la corrida en la que participará mezcla monedas — esa
   obligatoriedad real (cruza componentes) se aplica en Fase 4a. Aquí solo se
   impide que el objeto declare uno sin el otro.

## Ambigüedades — decisiones tomadas y su alcance exacto

Todas de bajo riesgo (no bloquean Fase 0), pero documentadas para que puedas
corregirlas si el alcance que tomé no es el que querías:

1. **`RUN_STATUS` (§22.9) no tiene enum.** El documento nunca enumera sus
   valores posibles, ni en §21, ni en §23, ni en una nota junto al contrato —
   a diferencia de los demás campos "inline-only" (como `SOURCE_TYPE` o
   `CALCULATION_MODE`), que sí traen su propia lista de valores explícita.
   `validarCFFRun` exige que `run_status` sea un string no vacío, pero **no**
   lo valida contra un enum — fabricar valores (p.ej. copiar
   `CALCULATION_STATUS`) habría sido inventar alcance.
2. **`direction` para `INDEPENDENT` / `ALTERNATIVE_VALUATION` / `UNKNOWN`
   queda sin exigir ni rechazar.** El documento solo clasifica `CONTAINS` y
   `DEPENDENT_COST` como dirigidas y `DUPLICATE` como simétrica (§13.3); para
   los otros tres tipos de relación no dice nada, así que `direction` queda
   opcional y libre.
3. **`containment_scope` se rechaza fuera de `CONTAINS`, no solo se exige
   dentro de él.** El documento solo dice explícitamente "CONTAINS debe
   declarar containment_scope" (§13.1) — no dice qué hacer si aparece en otro
   `relation_type`. Extendí la misma disciplina de rechazo explícito que
   pediste para `direction`/`DUPLICATE`, por la misma razón (un campo que
   sobrevive sin uso invita a leerlo como si importara). Si prefieres que esto
   sea más permisivo (solo exigir, nunca rechazar), se ajusta en una línea.
4. **`basis_type` (§9) se valida contra una lista propia (`BASIS_TYPES`), no
   contra `ENUMS`.** Los 5 valores de §9 (`ACCOUNTING_ACTUAL`,
   `CONTRACTUAL_RATE`, `CALCULATED_INTERNAL`, `INTERNAL_STANDARD`,
   `EXTERNAL_BENCHMARK`) no aparecen repetidos en la tabla de §23 — se tratan
   como autoritativos igual que los demás inline-only, pero se dejaron en una
   constante separada (`contratos.BASIS_TYPES`) en vez de en `enums.js`,
   porque conceptualmente son "tipos de fuente monetaria", no un enum de
   estado/clasificación general. Se puede mover a `enums.js` si prefieres
   todo en un solo lugar.
5. **`scope` (`CONSOLIDATION_GROUP`, `CFF_RESULT`) y `case_scope`
   (`CFF_COVERAGE`) se validan solo como string, sin forzar el enum
   `ECONOMIC_SCOPE` (`NODE|BUSINESS_UNIT|ORGANIZATION`).** Es una reutilización
   plausible pero el documento no lo dice explícitamente para estos campos —
   no se fuerza sin confirmación.
6. **`include_in_cff` se tipó `boolean`.** El documento no tipa explícitamente
   ninguno de sus campos (ni aquí ni en ningún otro contrato) — se infirió por
   el nombre y el uso ("incluir o no en el CFF") en vez de dejarlo como string
   sin verificar. Si el dato real llega como otra representación (p.ej. `"Y"/"N"`
   desde una fuente externa), este validador lo rechazaría por tipo — avisar
   si es el caso.
7. **Candidatas de regla condicional detectadas pero NO implementadas en Fase
   0** (`quantified_overlap_value` obligatorio cuando `containment_scope ===
   PARTIAL_QUANTIFIED`; `selected_primary` obligatorio cuando `relation_type ∈
   {DUPLICATE, ALTERNATIVE_VALUATION}`): el texto las sugiere pero Fase 0 se
   acotó a las 5 reglas explícitamente aprobadas. Quedan señaladas para
   evaluarlas en Fase 3 (relaciones), que sí construye la lógica de resolución
   de relaciones.

## Fase 1 — monetización

### Extensiones al contrato (declaradas explícitamente — §22 no las contempla)

Mismo patrón que otras adiciones ya aceptadas en el proyecto (`attribution` en
el AIE, `basis_value_min/max` en CFF §22.3): el documento define el concepto
en prosa pero nunca le da un lugar en el contrato de datos — se completa aquí,
no se calla el vacío ni se fabrica silenciosamente.

- **`ECONOMIC_COMPONENT.recovery_realization_type?`** (nuevo, opcional) — §7.1
  define el enum (`CASH_COST_AVOIDANCE | CAPTURED_MARGIN | CAPACITY_RELEASE |
  OTHER_VALIDATED`) pero §22.2 nunca le da un campo. Se agrega como opcional;
  no modifica el CFF observado (§7.1 lo dice explícitamente).
- **`ECONOMIC_COMPONENT.original_value` se vuelve condicional** — regla 7:
  XOR con (`original_value_min` y `original_value_max`, también nuevos). Nace
  de que `calculation_mode=UNIT_RATE` puede resolver contra una
  `MONETARY_BASIS` que solo trae rango (§9) — el resultado se propaga como
  rango, nunca se promedia ni se elige un extremo.
- **Regla 8** — un componente con `original_value_min/max` (resultado en
  rango) no puede declarar `monetization_status=OBSERVED`: un valor con
  incertidumbre estructural no es "observado" en el sentido de §10 (`OBSERVED`
  = "respaldado directamente por registros verificables y base monetaria
  válida"; `ESTIMATED` = "uno o más componentes requieren estimación
  sustentada y reproducible" — un rango es, por definición, lo segundo).
  Probada contra los 4 valores de `MONETIZATION_STATUS` (no solo 3):
  `OBSERVED` → inválido, `ESTIMATED` / `EXPOSURE` / `N_A` → válido — confirma
  que únicamente `OBSERVED` queda excluido, no un subconjunto más amplio que
  nadie hubiera notado.

  **Una sola fuente de verdad, dos puntos de entrada.** La regla vive como
  función pura exportada, `contratos.rangoIncompatibleConObserved(
  tieneRangoCompleto, monetizationStatus)`. La llaman tanto
  `reglasCondicionalesEconomicComponent()` (valida cualquier objeto que entre
  al sistema) como `monetizacion.aplicarResultadoAComponente()` (rechaza en
  el momento en que el rango se origina, antes de que el objeto exista
  siquiera) — **no** hay una segunda implementación de la regla escrita por
  separado que pudiera divergir si alguien actualiza una y olvida la otra.
  Esto no era así en la primera versión de esta fase (la misma condición
  estaba copiada en los dos archivos) — corregido antes del commit, a pedido
  explícito de Luis. Verificado por mutación **en la función compartida**
  (no en cada archivo por separado): una sola línea mutada, y las dos
  baterías (`contratos.test.js` y `monetizacion.test.js`) fallan a la vez —
  la prueba de que ya es una sola fuente, no dos.

### Qué calcula el motor, y qué no (corrección de un error mío en el enunciado de la tarea)

`calculation_mode` (§22.2, cómo se obtuvo el valor de UN componente) y las 4
fórmulas de §35 (`CA/VCP/CR/VNC`, que **suman** varios componentes que
comparten mecanismo) son dos niveles distintos — mi formulación original de
la tarea los mezclaba. Corregido:

- **`DIRECT_VALUE` y `DERIVED_FORMULA`** — el motor **no calcula nada**, solo
  transporta un valor ya determinado externamente (a mano, o por una fórmula
  interna específica de la organización que este módulo no evalúa — eso
  requeriría el motor de fórmulas genérico que ya se descartó). La diferencia
  entre los dos modos es metadata de trazabilidad, no ejecución distinta.
- **`UNIT_RATE`** — el único modo donde `resolverValorComponente` calcula:
  `original_value = quantity × tarifa`. Si la `MONETARY_BASIS` es un punto,
  resultado punto; si es un rango, resultado en rango (propagado
  matemáticamente, nunca promediado).
- **`agregarPorMecanismo`** (§35) — función **separada**, no parte de
  `calculation_mode`: suma componentes ya valorados (por cualquier modo) que
  comparten `primary_mechanism`. Rechaza mezclar `original_currency`
  (INV-CFF-28 — normalizar monedas es Fase 4a, no algo que esta suma decida
  silenciosamente). Si algún componente del grupo es un rango, todo el
  agregado se reporta en rango.

### §8.2 — reconstrucción obligatoria para `LOST_CAPACITY` (INV-CFF-46)

`calcularLostCapacity(componente, base, opts)` exige `opts.reconstruccion:
{tipo, descripcion?}` (tipo ∈ `COBERTURA | REDISTRIBUCION |
PRODUCCION_NO_REALIZADA | RETRASO | OTRO`, literal de §8.2) cuando
`resource_type` ∈ `RECURSOS_QUE_EXIGEN_RECONSTRUCCION` (`AUSENTISMO |
TIEMPO_OCIOSO | INTERRUPCION`, también literal de §8.2). Sin ella, **rechaza**
el cálculo (`{rechazado: true, monetization_status: 'N_A'}`) — no se limita a
"no ofrecer un atajo con nombre bonito", bloquea la ruta general.

**Verificado por prueba de mutación** (mismo estándar exigido para
`include_in_cff` en Fase 0): se degradó temporalmente
`RECURSOS_QUE_EXIGEN_RECONSTRUCCION` quitando `AUSENTISMO`, se confirmó que el
caso exacto pedido (`LOST_CAPACITY`, `resource_type=AUSENTISMO`, cantidad en
días, `MONETARY_BASIS` tipo tarifa/salario, sin reconstrucción) **dejaba de
rechazarse**, y se revirtió. La regla depende genuinamente del assert, no de
una casualidad del resto de la batería.

### §8.5 — preferencia `COMPONENT_BASED` sobre benchmark agregado

`preferirBaseMonetaria(candidatas)` — dada una lista de `MONETARY_BASIS` para
el mismo concepto, prefiere la primera que no sea `EXTERNAL_BENCHMARK`; si
todas lo son, la usa y marca `flags: ['SOLO_BENCHMARK_DISPONIBLE']`. No
implementa el juicio de "si la transferencia es admisible" (§8.5) — eso excede
lo que esta función puede decidir sin más contexto (candidato a fase
posterior si hace falta).

## Fase 2 — atribución

### §11.1 `CONFIRMED` — texto literal, sin interpretación

`operational_correspondence=YES` **y** `temporal_correspondence=COMPATIBLE`
**y** `organizational_correspondence=MATCH` **y** `operational_evidence=DIRECT`
**y** `alternative_explanation=NONE_DOMINANT`. `system_convergence` no se
exige en ningún valor particular (§11.1, literal). Probado con los 4 valores
de `SYSTEM_CONVERGENCE` — sigue `CONFIRMED` con cualquiera de ellos si las
otras 5 dimensiones son exactas.

### §11.2 `SUPPORTED` — 3 operacionalizaciones acordadas explícitamente

El texto de §11.2 es cualitativo, a diferencia del literal de §11.1. Se
acordaron 3 lecturas concretas antes de codificar, cada una verificada:

1. **"Correspondencias compatibles"** = ninguna de las tres en su valor
   **negativo** explícito (`NO`/`INCOMPATIBLE`/`MISMATCH`); `UNCLEAR` sí se
   admite — a diferencia de `CONFIRMED`, que exige el positivo exacto. Es la
   lectura que deja espacio real entre las dos categorías en más de un eje.
2. **"Convergencia independiente cuando sea necesaria"** = `CONVERGENT`
   exigido si `operational_evidence=INDIRECT` **o** si **cualquiera** de las
   tres correspondencias es `UNCLEAR` — no solo atada al tipo de evidencia.
   **Decisión interpretativa deliberadamente conservadora**, corregida en
   revisión: la lectura descartada (convergencia solo por evidencia débil)
   permitía que `operational_evidence=DIRECT` compensara una correspondencia
   genuinamente incierta sin ninguna corroboración — caso límite construido
   y verificado (`atribucion.test.js`, sección "operacionalización 2").
   Respaldo textual de la lectura adoptada: §25, "ante evidencia
   insuficiente, CFF debe perder cobertura antes que inventar valor" — entre
   dos lecturas compatibles con "cuando sea necesaria", esta es la que cae
   del lado conservador de esa declaración explícita del documento.
3. **"Las explicaciones competidoras no dominantes deben quedar
   explícitas"** = cuando `alternative_explanation=COMPETING`,
   `conflicting_evidence[]` no puede estar vacío — ancla la prosa a un campo
   real de `ATTRIBUTION_ASSESSMENT` (§22.4), no inventa uno nuevo.

### §11.3 `UNRESOLVED` — catch-all

Cualquier caso que no alcance `CONFIRMED` ni `SUPPORTED`. Los disparadores
que el documento enumera (relación insostenible, evidencia insuficiente,
incompatibilidad temporal/organizacional, alternativa dominante) ya hacen
fallar `SUPPORTED` cada uno por su cuenta — no hace falta una tabla propia.

### Precedencia `CONFIRMED` antes que `SUPPORTED` — verificada, no accidental

Un caso puede satisfacer **ambas** fórmulas a la vez (evidencia `DIRECT` +
correspondencias exactas + `NONE_DOMINANT` cumple literalmente la de
`SUPPORTED` también). El orden de evaluación es una decisión explícita de
`clasificarAtribucion`, no un efecto colateral de cómo quedó escrito el
código — verificado por mutación: invertir el orden (`esSupported` antes que
`esConfirmed`) rompe 7 asserts, todos los que involucran un solapamiento
real; revertido y re-verificado en verde.

### §11.4 no circularidad — verificada por firma de función

`clasificarAtribucion` **no recibe** `diagnostic_context` como parámetro de
decisión — mismo patrón que `calcularIAO` sin brecha en `motor-iao`: es
estructuralmente imposible que un `cfg_ref`/`dyn_ref`/`efo_ref`/`aie_ref`
mueva el veredicto, porque la función ni siquiera los usa (se probó pasando
`diagnostic_context` favorable y desfavorable junto a las mismas 6
dimensiones — mismo resultado en los 3 casos).

### §12 profundización — mecánica, verificada

`profundizar(evaluacionPrevia, cambios)` incrementa `assessment_version`
(`vN` → `v(N+1)`; si no matchea ese patrón, anexa `-profundizada` en vez de
fallar silenciosamente), nunca muta la evaluación previa —
`Object.freeze()` la protege, y un intento de mutación después lanza en vez
de corromper la genealogía en silencio (probado, no solo diseñado así).

### `alternative_explanation=UNKNOWN` — ambigüedad detectada y cerrada en la misma revisión

`UNKNOWN` es un valor **documentado y deliberado** del enum (aparece en la
tabla de §11 y en el contrato `ATTRIBUTION_ASSESSMENT` de §22.4) — no un
vacío de contrato como `recovery_realization_type`. Lo que sí es cierto es
que ni §11.2 (`SUPPORTED`) ni §11.3 (`UNRESOLVED`) lo mencionan al describir
las categorías: el enum lo define, la prosa de clasificación es silenciosa
sobre él — mismo silencio que con `UNCLEAR` en las correspondencias.

Se detectó al escribir la primera versión de esta fase (implementación
inicial: `UNKNOWN` se comportaba igual que `NONE_DOMINANT`, pasando libre sin
ninguna exigencia adicional) y se cerró de inmediato, no se dejó como
pendiente para Fase 5: por el mismo principio que motivó la operacionalización
2 (§25 — "ante evidencia insuficiente, CFF debe perder cobertura antes que
inventar valor"), `alternative_explanation=UNKNOWN` se sumó a las condiciones
que exigen `system_convergence=CONVERGENT` — es el mismo estado de "no lo
sabemos" que `UNCLEAR`, y tratarlo distinto sin razón habría sido inconsistente
con la regla que ya se había aplicado dos líneas más arriba. Verificado por
mutación: quitar la extensión rompe el caso específico (`DIRECT` +
`alternative_explanation=UNKNOWN` + `system_convergence=ABSENT` pasaba a
`SUPPORTED` sin la regla; con ella, `UNRESOLVED`), revertido y re-verificado.

## Qué NO hace Fase 1

- No evalúa `DERIVED_FORMULA` de verdad — transporta el valor ya calculado
  externamente (no se construye el motor de fórmulas genérico, descartado
  desde el plan de fases).
- No resuelve admisibilidad (§18), relaciones (§13) ni consolidación (§19) —
  `agregarPorMecanismo` suma por mecanismo, no decide qué componentes son
  admisibles ni resuelve duplicados/contención.
- No construye el grafo económico ni detecta ciclos (§13.3, `AC15`) — eso es
  Fase 3.
- No normaliza moneda (§17) — `agregarPorMecanismo` rechaza mezclar
  `original_currency` en vez de convertir.
- No implementa el juicio de admisibilidad de un benchmark como transferencia
  (§8.5) — solo la preferencia mecánica sobre `EXTERNAL_BENCHMARK`.
- No define el contrato de jerarquía de nodos (§15 lo exige pero no lo
  especifica) — se construirá en Fase 3, como adición explícita documentada
  ahí (`NODE_HIERARCHY: [{node_id, parent_id}]`, aprobado por Luis), no aquí.
- No cablea `resolveStatus()` a ningún pipeline — existe y está probada como
  función pura; su uso real en `resolve_coverage_and_status()` es Fase 4b/5.
- No toca `workbook.html` ni ningún otro módulo de producción.

## Qué NO hace Fase 2

- No conecta `clasificarAtribucion`/`profundizar` con `ATTRIBUTION_ASSESSMENT`
  como contrato completo (§22.4) — opera sobre las 6 dimensiones y la
  genealogía de versión directamente; el ensamblado del contrato completo
  (assessment_id, created_at, etc.) es del arnés de integración.
- No implementa `system_convergence`/`alternative_explanation` como
  resultado de comparar CFG/DYN/EFO/AIE de verdad — recibe esos valores ya
  clasificados como entrada; calcularlos a partir de datos reales de esos
  sistemas no es responsabilidad de este módulo (§11.4, no-circularidad).
- No implementa evaluación causal experimental, contrafactual ni nada de
  §27-29 (fuera de núcleo, §33.1).

## Fase 3 — relaciones, dedup, jerarquía

### `NODE_HIERARCHY` — extensión de este módulo, no del documento

§15 exige "una jerarquía explícita" de nodos pero §22 nunca define su
contrato. Aprobado por Luis: se recibe como input explícito, mínimo
`[{node_id, parent_id}]` (`parent_id=null` en la raíz) — mismo criterio que
la agregación temporal del arnés `motor-integracion-sdmo-aie`. `nodos.js`
deriva de ahí: hijos directos, hojas, ancestros, descendientes.

### Grafo económico y ciclos (§13.3, `AC15`)

`relaciones.js` construye el subgrafo dirigido de relaciones `CONTAINS` y
detecta ciclos con DFS + pila de recursión (coloreo blanco/gris/negro) —
**generalizado a cualquier longitud de ciclo**, no solo el par de la
literal del documento ("Ciclos inconsistentes, **como** A CONTAINS B y B
CONTAINS A..." — "como" se lee como ejemplo, no como el único caso;
verificado con un ciclo de 3 nodos además del de 2). Un ciclo invalida el
grafo de consolidación completo (§13.3) — no es un chequeo de un solo
componente.

**El "escape" de la excepción textual queda inerte, a propósito.** El
documento dice que un ciclo es inconsistente "sin equivalencia explícita"
— implicando que podría ser válido con ella. `ECONOMIC_RELATION` (§22.5,
Fase 0) no tiene ningún campo para declarar esa equivalencia. Confirmado
con Luis: no se fabrica un campo nuevo por iniciativa propia (mismo
criterio que `recovery_realization_type`/CFF y `attribution`/AIE — una
extensión de contrato se pide explícitamente, no se anticipa). Todo ciclo
`CONTAINS` se trata como inválido sin excepción. Esto **no** es decir que
el documento se equivocó — es que describe algo que su propio contrato
actual no permite invocar.

### Reglas de suma por tipo de relación (§13)

`resolverRelacion` **no clasifica** qué `relation_type` aplica a un par de
componentes — eso ya viene decidido en el registro de `ECONOMIC_RELATION`
por quien lo crea (confirmado con Luis: el documento no da un algoritmo de
inferencia, y Fase 0 tampoco clasificó nada, solo validó forma — mismo
principio aplicado consistente). Fase 3 aplica las consecuencias de una
clasificación ya hecha:

- **`INDEPENDENT`** — se suman ambos.
- **`DUPLICATE`** / **`ALTERNATIVE_VALUATION`** — si `resolution_status=RESOLVED`
  y hay `selected_primary`, se mantiene solo esa representación (nunca se
  promedia, INV-CFF-22). Sin resolución clara, se excluyen **ambos** del
  total pleno — no se adivina cuál mantener (§25: perder cobertura antes
  que inventar valor).
- **`CONTAINS`** — `FULL`: se conserva el contenedor, se excluye el
  contenido (mismo principio que `AGGREGATE_ONLY`, §15). `PARTIAL_QUANTIFIED`:
  inclusión-exclusión exacta, `total = contenedor + contenido − solapamiento`.
  `PARTIAL_UNQUANTIFIED`: no se produce total pleno (AC10).
- **`DEPENDENT_COST`** — se suman ambos solo si `resolution_status=RESOLVED`
  (la frontera económica distinta ya fue demostrada, §13.2); si no, no se
  suma (permanece `UNRESOLVED`, literal del documento).
- **`UNKNOWN`** — el documento condiciona la exclusión a que "el riesgo de
  solapamiento sea material", sin dar un campo para medir materialidad. Se
  trata como material por defecto (mismo sesgo de §25) — se excluyen ambos.

### Costos compartidos (§14) — no prorratear sin evidencia

`ECONOMIC_COMPONENT.shared_cost_id` (Fase 0) no dice si cada `original_value`
del grupo ya es la porción asignada o el monto completo compartido.
`resolverCostoCompartido` exige que quien llama declare explícitamente
`baseAsignacionDocumentada: true|false`; sin ella (o en `false`), el grupo
queda `UNALLOCATED` y se excluye de la suma — visible, no eliminado del
registro — en vez de prorratear en partes iguales por defecto. Verificado
con un caso concreto (3 componentes con montos distintos, exactamente el
escenario donde alguien se vería tentado a repartir 1000/3) y por mutación:
desactivar la guarda hace que el motor sume los 1000 sin ninguna base —
confirmado, revertido.

### Transferencias internas puras (§14) — verificado que `primary_mechanism` no sirve como señal, antes de fabricar un campo

Antes de proponer un campo nuevo, se verificó si el contrato ya distinguía
"transferencia contable pura" de "consumo real con contraparte interna" a
través de `primary_mechanism`. Los 4 valores de `PRIMARY_MECHANISM` exigen,
cada uno, una consecuencia operacional real de fricción (consumo
observable, capacidad no aplicada, restauración de algo perdido, margen no
capturado por un evento) — ninguno describe una reasignación contable. Pero
`primary_mechanism` es **obligatorio** en `ECONOMIC_COMPONENT` (§22.2): todo
componente, sea transferencia pura o no, debe declarar uno de los 4 valores
para pasar la validación de Fase 0. La sola presencia de un valor válido
nunca distingue los dos casos — el esquema obliga a que ambos se vean
idénticos en ese campo. Confirmado que no hay señal existente en el
contrato; `filtrarTransferenciasInternasPuras` exige que quien llama
declare `esTransferenciaInternaPura: true|false` explícitamente por
componente (lanza si no se declara — no se asume `false` por ausencia).
Se elimina solo al consolidar a alcance `ORGANIZATION`; a alcance `NODE`
la transferencia sigue siendo real para ese nodo.

### Nodos y alcance organizacional (§15)

`clasificarAlcance(nodeSet, nodeRaiz, nodeHierarchy)` clasifica un conjunto
de nodos en `AGGREGATE_ONLY` (el nodo raíz agregado, exactamente uno),
`LEAF_ONLY` (el conjunto completo de hojas bajo la raíz, perímetro
completo) o `SEGMENT` (ni lo uno ni lo otro — no se escala a la raíz sin
modelo explícito de representatividad, la propia regla `SEGMENT_ONLY`).
`NO_PARENT_CHILD_DOUBLE_COUNT` se valida siempre primero, sea cual sea la
clasificación resultante — un conjunto con un nodo y su ancestro a la vez
es `INVALIDO`, no se clasifica como ninguna de las 3 categorías válidas.
Verificado por mutación: desactivar la detección hace que un conjunto con
padre+hijo se clasifique como `SEGMENT` en vez de `INVALIDO` — confirmado,
revertido.

## Qué NO hace Fase 3

- No resuelve admisibilidad de componente (§18) — eso es Fase 4b.
- No normaliza moneda ni temporalidad antes de aplicar las reglas de suma
  (§16-17) — eso es Fase 4a; `resolverRelacion` asume que los valores que
  recibe ya están en una base comparable.
- No construye el algoritmo completo de consolidación (`runCFF`, §24) —
  cada pieza (grafo, costos compartidos, nodos) se prueba aislada.
- No detecta ciclos en relaciones `DEPENDENT_COST` — el documento solo
  nombra el caso `CONTAINS` explícitamente (§13.3); extenderlo a otro tipo
  de relación sin que el documento lo pida sería alcance no solicitado.
- No fabricó ningún campo nuevo en `ECONOMIC_RELATION` ni en
  `ECONOMIC_COMPONENT` — las dos extensiones necesarias
  (`esTransferenciaInternaPura`, `baseAsignacionDocumentada`) viven como
  parámetros de las funciones de este módulo, no como campos de contrato.

## Fase 4a — temporalidad, frecuencia, moneda

### Anualización (§16.3) — verificado con el texto, no es una vista de presentación

El texto es explícito: *"La anualización ocurre **después de consolidar**...
Debe registrar método, supuestos y período base."* No toca ningún cálculo
intermedio, pero **tampoco es una vista efímera como `formatearParaPresentacion()`**
de los otros módulos — `CFF_RESULT.annualization?` ya existe como campo
propio del resultado (§22.8, Fase 0): el documento la trata como parte del
registro auditable. `anualizar()` produce ese objeto aparte sin tocar el
total consolidado, que permanece como fuente de verdad.

La compuerta de 4 condiciones (período representativo, recurrencia
suficiente, estacionalidad controlada, fenómeno no extraordinario) se
valida en su totalidad — las 4 deben cumplirse, ninguna se asume. **La
función no calcula el valor anualizado** — el documento exige la compuerta
pero no da la fórmula de escalamiento (depende del fenómeno, mismo motivo
que la omisión de STOCK/RATE→flujo); se recibe ya calculado y la función
decide si la compuerta permite aceptarlo.

### Multi-período bajo el mismo `event_id` (§16.2)

`agruparComponentesPorPeriodo` verifica un caso real de 3 períodos
consecutivos (enero/febrero/marzo) bajo un solo `event_id`, confirmando
que el subtotal de cada período y el total del evento completo suman
correctamente sin colapsar los períodos ni crear grupos espurios. También
prueba el error que la regla previene: un componente con un `event_id`
distinto (simulando "crear un evento nuevo" para lo que debería ser una
continuación) hace que la función lance, en vez de mezclarlo
silenciosamente.

**Verificado por mutación** (no se había hecho en la primera entrega de
esta fase — señalado por Luis, mismo tipo de hueco que las 3 reglas de
Fase 0 que quedaron sin mutar la primera vez): desactivar la validación de
identidad de evento hace que el assert específico falle, y — más
importante — la función deja de lanzar y **produce un resultado
incorrecto silencioso**: el componente de un `event_id` distinto
(`EVT-2-CREADO-POR-ERROR`) se absorbe dentro de `EVT-1` sin queja,
`totalEvento` pasa de `9500` a `9600`. Confirmado, revertido.

### Precisión computacional completa (§17.2)

El caso de verificación usa una tasa no exacta en binario (1/3, mismo tipo
de número que expuso el drift real en el arnés ICE-IEH↔IAO) sobre 3
componentes (`original_value=100` cada uno, en `USD`/`GBP`/`JPY`) convertidos
a `EUR`. Aritmética exacta, verificada con `node -e` antes de escribir los
asserts:

```
normalized_value de cada componente = 100 × 0.3333333333333333
                                     = 33.33333333333333

Precisión completa: 33.33333333333333 × 3 = 99.99999999999999
  (binario64 exacto: 99.999999999999985789... — a 1.4e-13 de 100,
   mismo tipo de arrastre que el 49.999999999999986 del arnés
   ICE-IEH↔IAO; redondeado SOLO al final → 100)

Redondeo intermedio (ruta NO tomada): cada componente → 33.33 (2 decimales)
  33.33 × 3 = 99.99  (binario64 exacto: 99.989999999999994884...)
```

Diferencia real: `100 − 99.99 = 0.01` — un orden de magnitud completo por
encima del arrastre de punto flotante (`1.4e-13`): no es ruido de la
máquina, es información perdida por redondear antes de sumar. Verificado
además por mutación: forzar el redondeo intermedio dentro de
`sumarConMonedaControlada` cambia el resultado del caso específico de `100`
a `99.99` — confirmado, revertido.

## Parámetros de invocación no cubiertos por el contrato de datos

Consolidado en un solo lugar (a pedido de Luis, para que quien integre
este módulo no tenga que reconstruir la lista releyendo el historial de
varias fases). En los siete casos, el documento exige algo que su propio
contrato de §22 no le da un campo para representar — la extensión vive
como **parámetro explícito de función**, nunca como campo nuevo en
`contratos.js`, porque ninguna fue pedida explícitamente como
extensión de contrato (mismo criterio en todos: se pide, no se
anticipa).

| # | Parámetro | Fase | Por qué no es un campo de contrato |
|---|---|---|---|
| 1 | `esTransferenciaInternaPura: boolean` (por componente) | 3 (§14) | Verificado que `primary_mechanism` no sirve como señal implícita — es obligatorio en `ECONOMIC_COMPONENT`, así que hasta una transferencia disfrazada debe declarar uno de los 4 valores. |
| 2 | `baseAsignacionDocumentada: boolean` (por grupo de `shared_cost_id`) | 3 (§14) | `ECONOMIC_COMPONENT.shared_cost_id` no dice si `original_value` ya es la porción asignada o el monto completo compartido. |
| 3 | `period_start`/`period_end` (por componente, en las funciones de `temporalidad.js`) | 4a (§16.2) | Solo `CFF_EVENT` tiene período propio (§22.1); `ECONOMIC_COMPONENT` (§22.2) no, aunque §16.2 exige saber a qué período pertenece cada componente de un evento multi-período. |
| 4 | `transformacionValidada: boolean` + `valorFlujoEquivalente: number` (por componente STOCK/RATE) | 4a (§16) | El documento exige "transformación validada a flujo" sin dar el algoritmo (depende del fenómeno) — no se fabrica una fórmula genérica. |
| 5 | `{tasa, fuente, fecha, metodo, monedaDestino}` (objeto FX completo, por conversión) | 4a (§17.1) | `MONETARY_BASIS.fx_reference?` (§22.3) es un puntero/string, no el objeto estructurado que §17.1 exige declarar en cada conversión. |
| 6 | `nodeRaiz: node_id` (nodo de referencia del alcance) | 4b-ii (§15) | `nodos.clasificarAlcance` necesita el nodo raíz contra el que se clasifica el `nodeSet`. `CFF_RESULT` (§22.8) trae `scope` y `node_set[]` pero no un id de nodo raíz — mismo patrón que `NODE_HIERARCHY`, que tampoco está en §22. |
| 7 | `toleranciaReconciliacion?: number` (§19.2) | 4b-ii (§19.2) | §19.2 exige "tolerancias técnicas por moneda/precisión" sin dar valor. Sin aportarlo se usa solo una guarda de drift (`1e-9`) y se marca `PENDIENTE_VALIDACION` en `flags[]` — nunca una tolerancia material inventada. |

## Qué NO hace Fase 4a

- No resuelve admisibilidad de componente (§18) — Fase 4b.
- No construye el algoritmo completo de consolidación (`runCFF`, §24) — Fase 4b.
- No calcula la fórmula de escalamiento de la anualización, ni la de
  transformación STOCK/RATE→flujo — ambas dependen del fenómeno y el
  documento no las da; se reciben ya calculadas, esta fase solo filtra/valida.
- No busca ni aplica una tasa FX por su cuenta — la recibe siempre
  explícita del caller, con su procedencia completa.

## Fase 4b (i) — admisibilidad del componente (`admisibilidad.js`, §18)

### `admisibilidad.js` no es una pieza aislada más — es la primera que COMPONE resultados de fases anteriores

Antes de escribir código se verificaron los `module.exports` reales de
`contratos.js`, `monetizacion.js`, `atribucion.js`, `temporalidad.js`,
`nodos.js` y `relaciones.js`: ninguno expone hoy `monetary_basis_valid`,
`temporal_basis_valid`, `scope_valid` ni
`relationship_resolution_permite_inclusion` como campo ya resuelto — son
las 4 señales estructurales de §18 que no existían como salida de ningún
módulo anterior. `evaluarAdmisibilidad(componente)` las recibe como
señales **ya calculadas** por quien orquesta (`consolidacion.js`, Fase
4b-ii, que llamará a esos módulos y ensamblará el objeto); si falta
cualquiera de las 7 señales (las 4 anteriores más `event_status`,
`monetization_status`, `attribution_status`), lanza — no se recalcula ni
se asume un valor por defecto, mismo criterio de "no fabricar" aplicado
en cada fase anterior.

Que Fase 0 haya validado los 10 contratos completos con este nivel de
detalle está rindiendo aquí, varias fases después: `CFF_RESULT` (§22.8)
ya tiene los campos exactos de la matriz 2×2 (`confirmed_observed`,
`confirmed_estimated`, `supported_observed`, `supported_estimated`,
`cff_confirmed`, `cff_supported_additional`, `cff_total`,
`exposure_total`, `unresolved_impact_total`, `coverage`) — Fase 4b-ii no
necesita fabricar ningún campo nuevo para `AC43`/`AC44`/`AC45`.

### §18 es compuerta pura — confirmado en el texto, no por analogía con IAO

El documento lo declara literal: *"Un componente puede entrar al universo
elegible solo si supera puertas de validez. No existe score ponderado."*
Las 7 condiciones se evalúan como AND estricto — ninguna "mayoría" de
condiciones satisfechas compensa una que falla. `evaluarAdmisibilidad`
acumula **todos** los motivos de exclusión, no solo el primero (§18: *"La
exclusión conserva motivo y no elimina el registro"*), para que el
registro conserve la razón completa aunque fallen varias condiciones a
la vez.

**Dos mutaciones ejecutadas**, que cubren clases de falla complementarias:

1. `if (motivos.length)` → `if (motivos.length === 7)` — "solo excluir si
   fallan las 7", la lectura de un score con corte en el extremo. Un
   componente con 1..6 condiciones fallando pasa a
   `{admisible:true, exclusion_reason:null}` — resultado incorrecto pero
   **bien formado**. La salvaguarda no lo ve (es una forma válida); lo
   atrapan los 10 casos de condición individual de la batería (el test
   revienta con `TypeError` al leer `.indexOf` sobre el `null`, evidencia
   de que el comportamiento cambió).
2. `admisible: false` → `admisible: motivos.length >= 4` en la rama de
   exclusión, dejando el motivo adjunto — "crédito parcial". Con 4
   condiciones fallando produce `admisible:true` **con** `exclusion_reason`
   no nulo: par desincronizado. Lo atrapa `verificarConsistenciaInterna()`
   en tiempo de ejecución con error explícito
   (*"inconsistencia interna — admisible y exclusion_reason deben ir
   siempre juntos"*).

Revertidas ambas, 44/44 asserts vuelven a verde.

### Salvaguarda de consistencia interna

§18 es una compuerta binaria: `admisible === true ⟺ exclusion_reason === null`,
sin estado intermedio. `verificarConsistenciaInterna()` valida ese par en
toda salida antes de devolverla y lanza si se desincroniza. Con el código
correcto nunca se dispara por la ruta pública — está expuesta en
`module.exports` (misma convención que `esConfirmed`/`esSupported` en
`atribucion.js`) para poder probarla directamente con datos manipulados:
`{admisible:true, exclusion_reason:'algo'}` y `{admisible:false, exclusion_reason:null}`
lanzan; `{admisible:'quizás', ...}` lanza (no hay tercer estado).

## Fase 4b (ii) — fórmula y orden de consolidación (`consolidacion.js`, §19)

`consolidarPeriodoYAlcance(entrada)` ejecuta la secuencia obligatoria de §19

```
VALIDAR → NORMALIZAR → RELACIONAR → RESOLVER → SELECCIONAR → SUMAR
```

como seis funciones nombradas (`_paso1Validar` … `_paso6Sumar`) llamadas
en ese orden dentro del orquestador — no seis funciones sueltas que dan
lo mismo en cualquier secuencia. Cada paso delega en el módulo de la fase
que corresponde (`temporalidad`, `relaciones`, `costos_compartidos`,
`nodos`, `admisibilidad`); `consolidacion.js` no reimplementa nada, solo
ordena. Devuelve los campos numéricos de `CFF_RESULT` + `coverageInput`;
**no** arma el `CFF_RESULT` completo (eso es `runCFF`, 4b-iv) ni clasifica
`COVERAGE_STATUS` (eso es `cobertura.js`, 4b-iii).

### La dependencia de orden RESOLVER → SELECCIONAR es de datos, no de estilo

`_paso4Resolver` **escribe** `ctx.permiteInclusion[component_id]` a partir
de `relaciones.resolverRelacion`, los costos compartidos `UNALLOCATED` y
las transferencias internas eliminadas. `_paso5Seleccionar` **lee** esa
señal como la 7ª condición de `admisibilidad.evaluarAdmisibilidad` (§18).
Si SELECCIONAR corre antes, la señal no existe y el guardia de 4b-i lanza
(las 7 señales son obligatorias) — el pipeline no se puede correr en el
orden equivocado sin manipular además el ensamblado de señales.

### Componente con doble falla `EXPOSURE` + `UNRESOLVED` — Opción D

Un componente puede traer `monetization_status=EXPOSURE` **y**
`attribution_status=UNRESOLVED`. Ya está fuera de `CFF_TOTAL` por la
condición 3 de admisibilidad. Para los totales de diagnóstico se aplica la
**Opción D**, decidida tras verificar contra el texto que **el denominador
de cobertura sí incluye lo excluido**:

- **§20**: *"La cobertura expresa cuánto del universo operativo material
  dentro del alcance pudo evaluarse económicamente."* — el denominador es
  el universo material, no "lo que llegó a un total". El criterio `FULL`
  exige que **todo** lo material se haya evaluado.
- **§22.7**: `material_events_total` es un campo distinto de
  `material_events_evaluable`, y existe `excluded_material_events[]` — la
  estructura solo tiene sentido si `total ≥ evaluable` y lo excluido se
  cuenta en el total.

Por tanto el componente con doble falla **no** se suma a `exposure_total`
ni a `unresolved_impact_total` (evitar contar su valor dos veces entre los
dos lentes de diagnóstico), se marca en `flags[]` a nivel de resultado, y
cuenta como material-no-evaluado para el insumo de cobertura. No queda
oculto — **INV-CFF-55** (*"ausencia de evidencia no se imputa como
ausencia de costo"*) y **INV-CFF-50** (*"toda exclusión conserva motivo y
trazabilidad"*): es visible por cobertura degradada + `flags[]` + su
registro de exclusión con las dos condiciones que fallan. **No se crea una
tercera categoría/enum** — el documento no la insinúa en ningún lado (a
diferencia de `recovery_realization_type` o el rango de `basis_value`, que
sí estaban insinuados sin campo).

### Exclusión por relación de riesgo + estado `EXPOSURE`/`UNRESOLVED` (Paso 3)

El mismo principio se extiende a los totales secundarios: un componente
excluido por una relación **con riesgo de solapamiento** (`DUPLICATE`,
`ALTERNATIVE_VALUATION`, `UNKNOWN`, `CONTAINS`) que además sea `EXPOSURE`
o `UNRESOLVED` **no** se suma a `exposure_total` ni a
`unresolved_impact_total`. Dos duplicados `EXPOSURE` de 6000 c/u darían
`exposure_total = 12000` — el mismo doble conteo que **INV-CFF-20** existe
para evitar en el total principal, ni más ni menos real por ir a un total
de diagnóstico; reportar 16000 de exposición cuando el hecho real expone
8000 es tan defectuoso como reportar 30000 de CFF confirmado cuando vale
20000. Tampoco se elige "uno" (6000) — sería la misma
invención-de-selección-sin-evidencia rechazada para el total principal.
Ambos quedan fuera, registrados con motivo (categoría `RELACION`) y
marcados en `flags[]`. Verificado: `exposure_total = 0` para el par
`DUPLICATE`-sin-resolver-ambos-`EXPOSURE`-6000; control sin la relación →
`exposure_total = 12000` (cada uno una vez, correcto). Decisión explícita
de Luis.

### Invariante AC45 — `verificarReconciliacionCuadrantes`

`CFF_TOTAL` debe coincidir con la suma de los 4 cuadrantes
(`confirmed_observed` + `confirmed_estimated` + `supported_observed` +
`supported_estimated`). Si no coincide → lanza (AC45: *"Bloquear
publicación"*). Expuesta para prueba dirigida (convención
`verificarConsistenciaInterna`). `EXPOSURE`/`UNRESOLVED`/`N_A` no entran a
`CFF_TOTAL` (§19) — si la diferencia viene de sumarlos, ese es el defecto
que este invariante detecta.

**Tolerancia (§19.2)**: sin valor de negocio aportado, se usa solo una
guarda de drift de punto flotante (`1e-9`, igual que `EPS` en
`moneda.test.js`) y se marca `TOLERANCIA_RECONCILIACION_PENDIENTE_VALIDACION`
en `flags[]` — nunca una tolerancia material inventada (§19.2: *"la
tolerancia no puede utilizarse para ocultar diferencias materiales"*).

### Dos mutaciones ejecutadas

1. **Orden RESOLVER↔SELECCIONAR.** (1a, en la batería) correr
   `_paso5Seleccionar` antes de `_paso4Resolver` → `evaluarAdmisibilidad`
   lanza (falta la 7ª señal): el orden es una dependencia real. (1b, edición
   de código) intercambiar las dos llamadas en el orquestador **y**
   defaultear la señal ausente a `true` (el workaround plausible de quien
   ignora la dependencia) → con `C_ind=20000` + `C_dup_a=C_dup_b=5000` en
   `DUPLICATE` sin resolver, `cff_total` pasa de **20000 a 30000**,
   diferencia **10000 exacta** = el hecho `DUPLICATE` contado dos veces.

   *Por qué el resultado correcto es `20000` y no `25000`* (mantener una de
   las dos representaciones, que preservaría el valor real una sola vez):
   sin `selected_primary` confirmado no hay forma de saber cuál de las dos
   representaciones mantener sin arriesgar el doble conteo, y el sesgo del
   documento es explícito — **§25**: *"Ante evidencia insuficiente, CFF
   debe perder cobertura antes que inventar valor."* Se excluyen ambas del
   total pleno (mismo criterio que ya se aplicó a `SUPPORTED`/`UNKNOWN` en
   Fase 2 y que `relaciones.resolverRelacion` ya implementa para
   `DUPLICATE` sin resolver); quedan visibles en el registro con su motivo
   (INV-CFF-50), y la cobertura refleja la exclusión.
2. **AC45 / exclusión de `EXPOSURE` y `UNRESOLVED`.** Sumar
   `exposure_total + unresolved_impact_total` a `cff_total` → con
   `C_conf=12000` + `C_exp=8000` + `C_unr=3000`, `cff_total` pasa a
   **23000** mientras los cuadrantes siguen en **12000** →
   `verificarReconciliacionCuadrantes` lanza (diferencia 11000, bloquea
   publicación).

Revertidas ambas, 39/39 asserts en verde.

### Extensión de invocación #6 — `nodeRaiz`

`nodos.clasificarAlcance(nodeSet, nodeRaiz, nodeHierarchy)` necesita el
nodo de referencia contra el que se clasifica el `nodeSet`. `CFF_RESULT`
(§22.8) trae `scope` y `node_set[]` pero no un "id del nodo raíz del
alcance". Se recibe explícito — mismo patrón que `NODE_HIERARCHY` (que
tampoco está en §22). Ver la tabla de parámetros de invocación abajo.

## Fase 4b (iii) — cobertura y significado de cero (`cobertura.js`, §20)

Dos piezas: `clasificarCobertura(coverageInput, señales)` → `COVERAGE_STATUS`,
y `distinguirCeroDeNA(cffTotal, coverageStatus)` → `CFF=0` real vs
`CFF=N_A`.

### El criterio de §20 es cualitativo — verificado, no asumido

Se revisó el documento completo: §20 y §23 definen las 4 categorías solo
con prosa, y **no hay ningún umbral numérico** en ninguna parte (grep
exhaustivo de `%` / `umbral` / `ratio` / `al menos N` junto a cobertura:
0 coincidencias). §20 lo dice de frente: la cobertura *"debe ser
estructural y acompañarse de hechos objetivos, no convertirse en un score
universal"*. Por eso `clasificarCobertura` **no inventa un corte
numérico**: clasifica a partir de (a) los conteos que ya trae
`coverageInput` de `consolidacion.js` y (b) cuatro juicios cualitativos
que quien llama declara explícitamente (lanza si falta alguno):
`tratamientoEconomicoSuficiente`, `dependeDeEstimacionesDebiles`,
`asignacionesLimitadas`, `baseDefendibleParaCifraConsolidada`. El
`cobertura_ratio` se calcula y se reporta como dato, pero **no decide
ninguna frontera** — verificado: el mismo ratio `0.75` cae en `PARTIAL`,
`LIMITED` o `INSUFFICIENT` según solo la señal cualitativa que se mueva.

### Orden de decisión `INSUFFICIENT → LIMITED → FULL → PARTIAL` — y por qué

Las condiciones **crudas** (textuales) de las 4 categorías **no son
mutuamente excluyentes por sí solas** — hay dos solapamientos reales, y el
resultado lo decide la precedencia, no que las categorías sean disjuntas
por definición. Cada precedencia y su respaldo (mismo trato que dimos a
`CONFIRMED`/`SUPPORTED` en Fase 2 y a `RESOLVER→SELECCIONAR` en 4b-ii —
distinguir lo textual de lo que es decisión de diseño):

| Precedencia | Respaldo |
|---|---|
| `INSUFFICIENT` sobre las otras 3 | **Textual.** §20 define `FULL`/`PARTIAL`/`LIMITED` presuponiendo que *"la cifra existe"*; `INSUFFICIENT` = *"No existe base suficiente para una cifra consolidada defendible"*. Cifra vs. no-cifra: disjunto por la letra. |
| `LIMITED` sobre `FULL` | **Textual, vía §21** (no §20). `FULL` exige *"tratamiento económico suficiente para la salida"*; §21: *"Una salida downstream no puede tener mayor calidad que una dependencia crítica."* Una estimación débil declarada es un insumo crítico degradado → la clasificación no puede ser `FULL` por encima de él. |
| `LIMITED` sobre `PARTIAL` | **Decisión de diseño, sin respaldo textual directo.** §20 no da regla para una cifra que a la vez tiene exclusiones explícitas y descansa en estimaciones débiles. Se elige `LIMITED` (el estado más degradado y más informativo) por §25 (*"perder cobertura antes que inventar valor"*) e INV-CFF-54. Si se quiere `PARTIAL`, es un cambio de una línea en `PRECEDENCIA`. |
| `FULL` vs. `PARTIAL` | Disjuntos de verdad (`material_no_evaluado === 0` vs. `> 0`) — sin precedencia que justificar. |

La implementación **es**, literalmente, "la primera condición cruda
verdadera en orden de `PRECEDENCIA`" — una sola fuente
(`CONDICIONES_CRUDAS` + `PRECEDENCIA`), no un `if/else` paralelo.

### Partición verificada de forma independiente del orden

La batería **no replica el árbol de decisión**. Evalúa las 4 condiciones
crudas por separado sobre los 64 casos (2⁴ señales × `{0,3}` evaluado ×
`{0,2}` no-evaluado) y confirma: **(a)** en cada caso al menos una
condición cruda es verdadera (exhaustivo, sin huecos); **(b)** la
implementación devuelve siempre la de mayor precedencia entre las
verdaderas; **(c)** localiza los solapamientos y confirma su resolución —
`FULL∩PARTIAL` nunca ocurre; `LIMITED∩FULL` y `LIMITED∩PARTIAL` sí ocurren
y se resuelven hacia `LIMITED`; `INSUFFICIENT` solapa en crudo y se
resuelve hacia `INSUFFICIENT`. Esto es más fuerte que "dos
implementaciones del mismo orden coinciden" (que solo probaría
consistencia interna): verifica que las condiciones textuales son
exhaustivas y que la precedencia hace un trabajo visible y documentado.

`coverageInput` viene de `consolidacion.js` y **no se recalcula**.
`material_no_evaluado` = exclusiones cuya categoría **no** es
`TRANSFERENCIA_INTERNA` (una transferencia interna eliminada en §14 no es
un hueco de cobertura — los recursos reales se conservan). Temporal,
relación de riesgo, costo compartido `UNALLOCATED`, admisibilidad y doble
falla (Opción D / Paso 3) **sí** cuentan como material que no se pudo
evaluar.

### `CFF=0` ≠ `CFF=N_A` (§20, AC21, AC22, AC46)

- **`CFF=0`**: cobertura suficiente para una cifra (`FULL`/`PARTIAL`/`LIMITED`)
  + ninguna componente atribuible positiva → `value=0`, `status=VALID`
  (si `FULL`) o `VALID_WITH_LIMITATIONS`. Es un 0 real (AC21); no demuestra
  ausencia de fricción (INV-CFF-10).
- **`CFF=N_A`**: cobertura `INSUFFICIENT` → `value=null`,
  `status=INSUFFICIENT` (AC46: *"no 0"*; AC22: *"nunca 0 por defecto"*;
  §21: *"un valor nulo siempre debe acompañarse de status y reason"*).

El nulo **no se recibe** — lo produce `distinguirCeroDeNA` a partir de la
cobertura. `cffTotal` negativo lanza (el CFF no puede ser < 0).
`_verificarValorConsistente` protege el trío
`value=null ⟺ CFF_N_A ⟺ status=INSUFFICIENT` (expuesta para prueba
dirigida).

### Dos mutaciones ejecutadas

1. **Quitar la guarda `coverageStatus===INSUFFICIENT ⇒ N_A`.** El caso
   `(INSUFFICIENT, cff_total 0)` pasa de `{value:null, status:INSUFFICIENT}`
   a `{value:0, status:VALID_WITH_LIMITATIONS}` — exactamente la imputación
   de *"missing como cero"* que **AC46 prohíbe**. Resultado mal pero bien
   formado; lo atrapa la batería, no la salvaguarda.
2. **Invertir `FULL` y `LIMITED` en `PRECEDENCIA`.** El caso
   `(todo evaluado, dependeDeEstimacionesDebiles=true)` —que satisface
   **ambas** condiciones crudas— pasa de `LIMITED` a `FULL`. La mutación
   hace visible que las dos condiciones crudas solapan y que es la
   precedencia (§21) la que decide, no una supuesta disjunción.

Revertidas ambas, 41/41 asserts en verde.
