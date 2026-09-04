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
| **0** | Contratos como validadores (§22, 10 contratos) + registro de enums (§21/§23) + `resolve_status()` (§21) como función pura | **✅ Esta entrega** |
| 1 | Monetización: 4 mecanismos (§6, §8), naturaleza financiera + `recovery_realization_type` (§7, §7.1), bases monetarias (§9), calidad de monetización (§10) | Pendiente |
| 2 | Atribución: motor determinista (§11), profundización y genealogía (§12) | Pendiente |
| 3 | Relaciones, dedup, jerarquía: relaciones económicas + grafo + ciclos (§13), costos compartidos/transferencias (§14), nodos y alcance (§15) | Pendiente |
| 4a | Normalización: temporalidad/frecuencia (§16), moneda/FX/NOMINAL-REAL (§17) | Pendiente |
| 4b | Consolidación end-to-end: admisibilidad (§18), fórmula de consolidación (§19), cobertura (§20), algoritmo `runCFF()` (§24) | Pendiente |
| 5 | Fallos/short-circuit (§25), versionamiento/staleness (§26), batería completa: 70 invariantes + 60 AC + acceptance gate (§32) | Pendiente |

Aprobación fase por fase — no se construyen las seis de corrido. Las secciones
§27-29 (evitabilidad, contrafactual/intervención, integración IFT) quedan fuera
del núcleo por declaración explícita del documento (§33.1); los invariantes que
tocan esa frontera (`INV-CFF-37..40`, `56..60`, `69`) sí se verifican, como
pruebas negativas, distribuidos en las fases donde corresponden.

## Archivos (Fase 0)

| Archivo | Qué es |
|---|---|
| `enums.js` | Registro canónico de enums, combinando §21 + §23 + los inline-only de §22 tratados como autoritativos. |
| `estados.js` | `resolveStatus()` — la función pura de propagación de calidad del §21. **No** está cableada a ningún pipeline todavía (eso es Fase 4b/5). |
| `contratos.js` | Los 10 validadores de contrato (§22.1-22.10): campos obligatorios/opcionales, tipos, enums, y las 5 reglas condicionales aprobadas. Sin lógica de negocio. |
| `contratos.test.js` | Batería de verificación. `node motor-cff/contratos.test.js` → **67 asserts OK, 0 fallos**. |

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

## Qué NO hace esta fase

- No calcula nada (ni mecanismos, ni consolidación, ni CFF_TOTAL).
- No resuelve admisibilidad (§18) ni relaciones (§13) — solo valida que un
  objeto individual sea internamente coherente.
- No construye el grafo económico ni detecta ciclos (§13.3, `AC15`) — eso es
  Fase 3.
- No define el contrato de jerarquía de nodos (§15 lo exige pero no lo
  especifica) — se construirá en Fase 3, como adición explícita documentada
  ahí (`NODE_HIERARCHY: [{node_id, parent_id}]`, aprobado por Luis), no aquí.
- No cablea `resolveStatus()` a ningún pipeline — existe y está probada como
  función pura; su uso real en `resolve_coverage_and_status()` es Fase 4b/5.
- No toca `workbook.html` ni ningún otro módulo de producción.
