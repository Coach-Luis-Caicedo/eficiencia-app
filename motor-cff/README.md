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
| **2** | Atribución: motor determinista (§11), profundización y genealogía (§12) | **✅ Esta entrega** |
| 3 | Relaciones, dedup, jerarquía: relaciones económicas + grafo + ciclos (§13), costos compartidos/transferencias (§14), nodos y alcance (§15) | Pendiente |
| 4a | Normalización: temporalidad/frecuencia (§16), moneda/FX/NOMINAL-REAL (§17) | Pendiente |
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
