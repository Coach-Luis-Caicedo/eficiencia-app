# motor-piio — Panel de Indicadores de Impacto Operativo

Módulo de cálculo **aislado**, mismo patrón que `motor-ice-ieh`,
`motor-sdmo`, `motor-iao`, `motor-cff`, `motor-ifd` y `motor-fpv`:
construcción por fases, contratos como validadores primero, mutación real
en cada regla negativa, nada se comitea sin verificación mostrada, nada se
conecta a otro módulo (arnés aparte, después).

**Fuente de verdad — única:**
`EFICIENCIA_Documento_Tecnico_PIIO_v1_1_FINAL.docx` (raíz del repo).
Versión canónica: **v1.1 FINAL**. Sin desfase de nomenclatura (0
apariciones de "IFT", 29 de "IFD" — verificado; una edición previa de este
documento usaba "IFT" por error genealógico, ya corregido).

**PIIO previo en el Workbook — NO es fuente de este motor.** Existe hoy un
panel "PIIO" corriendo (`piio-*`/`sm-*` en `workbook.html`, migraciones
SQL 022 + 026 + 027); ver el informe de auditoría
`INVENTARIO_PIIO_ANTIGUO.md`. Es un enfoque radicalmente más simple
(captura de 8 KPIs mensuales + roll-up por promedio simple entre áreas +
feed al CFF). **No comparte una sola pieza de la cascada inferencial de
v1.1** — ni F/I/D, ni referencias, ni dominios/fenómenos, ni EFO. Mismo
patrón que el FPV viejo frente al FPV v1.2: mismo dominio conceptual,
arquitectura incomparablemente más simple. **Nada del sistema viejo se
retrofitea.**

## Qué es PIIO

Produce la **EFO** (Evidencia de Funcionamiento Operativo) para el AIE,
mediante una **cascada inferencial determinista de 6 niveles** (§4):

```
OBSERVACIÓN → KPI_STATE → EVIDENCE_GROUP → PHENOMENON_STATE
           → DOMAIN_STATE → EFO_STATE → AIE
```

Cada nivel resuelve **posición** (`F | I | D | N_A`), **trayectoria**
(`IMPROVING | STABLE | DETERIORATING | N_A`) y **persistencia**
(`POINT | REPEATED | PERSISTENT | N_A`). Cada nivel agrega significado sin
borrar el anterior (INV-PIIO-10). **Sin promedios, sin pesos universales,
sin votación, sin score 0–100** (§4, §20.1, §35, INV-PIIO-75/76).

7 dominios canónicos (§5): `PRODUCTIVITY`, `QUALITY`, `COMPLIANCE`,
`OPERATIONAL_CONTINUITY`, `OPERATIONAL_AVAILABILITY`, `OPERATIONAL_SAFETY`,
`RESOURCE_EFFICIENCY`.

**Frase rectora** (§30, equivalente a IFD §0 / FPV §18):
> Ante evidencia insuficiente, PIIO debe perder cobertura antes que
> inventar posición.

## Oráculo — el más fuerte hasta ahora, pero NO numérico

Ni motor Python de referencia (como IFD) ni tabla de estrés numérica
(como FPV §10). El oráculo son:

- **80 invariantes** `INV-PIIO-01..80` (§33) — cada uno un "nunca/siempre"
  duro. Es el oráculo **fuerte**.
- **80 casos de aceptación** `AC01..80` (§34) — `ID | Caso | Resultado
  esperado`. Cobertura de cada rama de la cascada, cada combinación
  DIRECT/PROXY, CORE/SUPPORTING, REQUIRED/OPTIONAL, versionamiento,
  jerarquía de nodos, y 3 cruces con otros instrumentos (AC61 PIIO→CFF,
  AC62 PIIO→IFD, AC64–66: CFF/IFD/AIE nunca reescriben EFO).

**Varios AC son conductuales, no numéricos** ("según regla explícita",
"puede ser IMPROVING", "flag si procede"). La batería AC codifica el
resultado **tal como el texto lo enuncia**: donde el texto da un enum
exacto (F+D→I), se testea el enum; donde da una condición ("puede ser
IMPROVING si…"), se testea la condición, no un valor fijo. Los 80
invariantes son el oráculo duro; los AC son cobertura de rama.
(Ambigüedad I.)

## Interoperabilidad — alcance CERRADO

§26 / §1.4 / INV-PIIO-43/44/45/68/70/72: PIIO exporta
`PIIO_OPERATIONAL_EXPORT` (fenómenos / métricas / exposición / nodos)
hacia CFF e IFD. **PIIO ↛ costo · ↛ ROI · ↛ TRE · ↛ proyección
predictiva.** `motor-piio` **no implementa nada de esa lógica**, ni "de
conveniencia" para un futuro arnés. CFF/IFD/AIE nunca reescriben EFO
retroactivamente. El flujo es unidireccional: PIIO produce, CFF/IFD
consumen. (El panel viejo tiene a PIIO invocando al motor CFF — eso NO se
reproduce; ver `INVENTARIO_PIIO_ANTIGUO.md` §3.)

---

## Plan de 14 fases (aprobado antes de escribir código)

### Orden de ejecución (§29 `runPIIO`) vs. orden de construcción

**Runtime (§29):** validar config → catálogos → jerarquía de nodos →
métricas/referencias → ingest → *por observación*: calidad + preservar
valor + `resolve_kpi_state` → `resolve_evidence_groups` → *por
fenómeno/nodo/período*: state + cobertura/admisibilidad + temporales →
*por dominio*: idem → *por nodo/org*: EFO pos + deterioration + traj/pers +
cobertura → perfiles → export CFF/IFD → invariantes → trace → persist →
publish.

**4 diferencias explícitas construcción vs. runtime:**

1. **Temporales (§12/§13) se construyen UNA vez** (Fase 4) como módulo
   compartido; el runtime lo invoca 3 veces (fenómeno, dominio, y el
   `traj` del KPI). No es reordenamiento — es de-duplicación.
2. **Jerarquía de nodos**: el runtime la *valida* temprano (paso 3); la
   construcción pone esa validación en Fase 1, pero la *lógica de
   agregación de nodos* (§22/§23) en Fase 10 — porque consume DOMAIN/EFO
   ya resueltos por nodo. Validar aciclicidad ≠ agregar.
3. **`run_invariants()`** es un paso del orquestador (§29); en
   construcción los 80 invariantes son la Fase 12 (batería), y el paso
   del orquestador (Fase 11) llama a esos validadores. Cada invariante
   relevante se teje además como mutación negativa en su fase.
4. **`preserve_original_value` antes de `validate_data_quality`** (Fase 2):
   el pseudocódigo §29 los lista al revés (`validate_data_quality()` →
   `preserve_original_value()`). Aquí se preserva PRIMERO. Ninguna de las
   dos muta `value` (solo lo leen) → el orden no afecta el resultado, y
   capturar el original antes que nada es más seguro por sí solo. Cambio
   de orden, no de comportamiento.

### Las 14 fases

| Fase | Módulo | Alcance (§) |
|---|---|---|
| **0** | `enums.js`, `contratos.js` | ~30 enums; validadores de forma de `METRIC_DEFINITION` §7, `KPI_OBSERVATION` §9, `KPI_SPEC` §10, `EVIDENCE_GROUP` §14, `PHENOMENON_SPEC`/`DOMAIN_SPEC`/`REFERENCE_SPEC`/`NODE_SPEC` §25, `PIIO_INPUT` §29; `clasificarAusencia` §28 |
| **1** | `config.js` | `validate_case_configuration` + catálogos + jerarquía de nodos (aciclicidad, mutua exclusión) + versiones presentes. Fallos BLOCKING (§30). **AC70/71/72/73** |
| **2** | `observaciones.js` | `KPI_OBSERVATION` + `DATA_QUALITY_STATUS` + missing≠0 + fuera de dominio → INVALID sin clamp + preservar valor original. **AC08–11, INV-03/04/10/54** |
| **3** | `referencias.js` | `REF_COND` vs `REF_TEMP` (§8) + admisibilidad de referencia + no promediar + cambios de referencia/definición. **AC12–16, AC28, INV-08/09/28/29** |
| **4** | `temporal.js` | Módulo compartido: `TEMPORAL_METHOD`, `TEMPORAL_PATTERN`, `SERIES_STABILITY`, `REGIME_STATUS`, `SHOCK_STATUS`+`SHOCK_TREATMENT`, `FRESHNESS_STATUS`, continuidad + `MAX_CONTINUITY_GAP`. **AC17–19, AC56–60, INV-07/26/57/58/59/61/62** |
| **5** | `kpiState.js` | `KPI_STATE` (§10/§11): `pos` contra REF_COND admisible; `traj` contra REF_TEMP + serie comparable; `pers` sobre `det_run`; directionality. **AC01–07, INV-01/02/05/06/11/13/24/25/26** |
| **6** | `evidenceGroup.js` | Colapso de KPI dependientes (§14): tabla F+F→F, D+D→D, F+I→F, D+I→D, I+I→I, **F+D→N_A+INTERNAL_INCONSISTENCY**. **AC20–22, INV-12/16/17** |
| **7** | `phenomenon.js` | Motor KPI→PHENOMENON (§15–17): filtrar → colapsar grupos → DIRECT (tabla §15) → PROXY solo si autorizado; `PHENOMENON_STATE` + cobertura + admisibilidad + lag. **AC23–31, INV-14/15/22/23/30** |
| **8** | `domain.js` | Motor PHENOMENON→DOMAIN (§18–19): CORE/SUPPORTING (tabla §18), ≥1 CORE por dominio aplicable, SUPPORTING no sustituye/neutraliza CORE. **AC32–36, INV-18/19/20/21/31** |
| **9** | `efo.js` | Motor DOMAIN→EFO (§20–21, §24): la regla determinista de 5 ramas (§20.1); `deterioration_present` separado; EFO_traj/pers sobre historia EFO; **sin votación/promedio/score**. **AC37–46, AC75/76, INV-32–41/74/75/76** |
| **10** | `nodos.js` | Nodos y agregación (§22–23): ORGANIZATIONAL vs SEGMENT_ONLY, padre/hijos no simultáneos, agregación por tipo de métrica, exposición ≠ incidencia, `node_profile[]`. **NO** NODE_CONCENTRATION/POLARIZATION (es AIE). **AC47–55, INV-46–56** |
| **11** | `runPIIO.js` | Orquestador (§29): encadenar en orden runtime; `PIIO_RESULT`; `PIIO_RUN` + versionamiento (§31); `PIIO_OPERATIONAL_EXPORT` (§26); fallos y propagación (§30); `TRACE_PATH` (§32). **AC61–69, AC72–74, AC80, INV-63–72/79/80** |
| **12** | `invariantes.test.js`, `aceptacion.test.js` | Los **80 invariantes** como validadores/asserts + la suite **AC01–80** como oráculo conductual. Acceptance gate §35. Probablemente 3 commits (12a INV, 12b AC01–40, 12c AC41–80) |
| **13** | cierre | Verificación posterior §35: no score 0–100, no ruta PIIO→dinero, no PIIO→Estado EFICIENCIA sin AIE, reproducibilidad; tabla de reaperturas si las hubo |

## Ambigüedades del documento (traídas antes de fijar nada)

Donde el texto deja algo abierto, se resuelve como **decisión de diseño**,
anotada con la misma honestidad que "dirección adversa" (IFD §21.2),
`unit` (IFD §23.1), `persona_id` único por posición (FPV decisión E).

| # | Ambigüedad | Lectura adoptada |
|---|---|---|
| **A** | `runPIIO(case)` (§29) nunca define `case`/`PIIO_INPUT` | Objeto único: catálogos + jerarquía + specs + referencias + evidence groups + observaciones + ruleset, una organización, uno o más períodos. Decisión de diseño. |
| **B** | `MAX_CONTINUITY_GAP` (§11.3, AC19) referenciado, nunca valuado | `PARAMS.MAX_CONTINUITY_GAP = null`, `PENDIENTE_CALIBRACION`. |
| **C** | `freshness_spec` (§10) — §13 da solo el enum, no la fórmula | Forma `{ max_age_current, max_age_aging }` relativa a `calculation_frequency`; `PARAMS.FRESHNESS_*` calibrables. |
| **D** | TARGET_RANGE (§11.1) exige "reglas explícitas por debajo y por encima" — §7 no lista un campo | `METRIC_DEFINITION.target_range_rules = { below, above }`, obligatorio **sii** `directionality = TARGET_RANGE`. Extensión de contrato. |
| **E** | `continuity_mode` (§7) sin valores enumerados | Reusa `DEFINITION_CONTINUITY` `CONTINUOUS | BRIDGED | NEW_SERIES` (concepto contiguo). |
| **F** | "cobertura suficiente" / "parcial suficiente" (§16, §19, §20.1) sin umbral | **F**: todos los `required_evidence_group_ids` en COMPLETE. **D**: ≥1 CORE D válido sin CORE F contradictorio (§19 lo da). Lo demás → umbral declarado por SPEC. Mezcla lectura + decisión (se cierra en Fases 7–9). |
| **G** | `independence_basis` (§14) sin enum/formato | `{ kind: SEPARATE_SOURCE | SEPARATE_METHOD | SEPARATE_PROCESS | DECLARED_OTHER, detail }`. Decisión de diseño. |
| **H** | `det_duration` vs `det_run` (§10, §11.3): §11.3 gobierna `det_run` (conteo); `det_duration` sin regla | `det_run` = nº de períodos consecutivos en D del mismo nivel; `det_duration` = span temporal opcional derivado de esos períodos. (Se cierra en Fase 5.) |
| **I** | Suite AC (§34) es conductual, no numérica | Ver "Oráculo" arriba. |
| **J** | Temporales a nivel fenómeno (§15.1) — ¿sobre qué serie si el fenómeno tiene varios KPI? | Sobre la serie del KPI DIRECT que gobernó la posición; a igualdad, el de mayor `evidence_proximity` / menor lag. (Se cierra en Fase 7.) |
| **K** | §22 "misma lógica por nodo cuando los datos lo permiten" — ¿qué niveles por nodo? | PHENOMENON / DOMAIN / EFO llevan `node_id` → los tres por nodo. EFO organizacional = evidencia `ORGANIZATIONAL` **o** regla explícita de agregación de nodos mutuamente excluyentes. Lectura del texto. (Se cierra en Fase 10.) |
| **L** | §15 "si no existe DIRECT utilizable, PROXY…" — ¿DIRECT que dio I/N_A cuenta como "utilizable"? | "Utilizable" = admisible con `pos ∈ {F, D}` **o** `I` resolutivo por divergencia válida. DIRECT que da `N_A` por insuficiencia **no** bloquea PROXY. (Se cierra en Fase 7.) |
| **M** *(Fase 1)* | "mutuamente excluyentes" para `NODE_SET` (§22, §22.1) — mencionado 3×, nunca operacionalizado | El motor **verifica** que dentro de un `aggregation_membership` declarado ningún miembro sea ancestro de otro (cadena `parent_node_id`) — sentido operativo de "sin doble conteo por contención" (INV-PIIO-48). **NO** verifica —ni puede— solapamiento real entre `NODE_SET` distintos ni entre hermanos con poblaciones que se traslapan: vive fuera de los datos. Decisión de diseño (patrón "declarado por el llamante" del FPV). |
| **N** *(Fase 1)* | ¿Quién manda entre `phenomenon.core_or_supporting_by_domain` y `domain.{core,supporting}_phenomenon_ids`? | **Deben concordar** (chequeo bidireccional). Un desacuerdo es catálogo corrupto → `BLOCKING` global (AC70). Ninguno es autoritativo. |
| **O** *(Fase 1)* | §22: "cada observación y estado conserva `node_id`, `node_level` y `scope`" | Realidad: `node_level` **no aparece en ningún esquema** del documento; `scope` **solo en `EFO_STATE`** (§24) — ni `KPI_OBSERVATION`, ni `NODE_SPEC`, ni `PHENOMENON_STATE`, ni `DOMAIN_STATE`. La prosa promete algo que ningún esquema cumple completo. Decisión: `node_level` = profundidad desde la raíz (derivada de la cadena de padres); `scope` = `NODE_SPEC.scope_rules.scope ∈ SCOPE`. **`EFO_STATE.scope` ya tiene forma fijada por §24 — la derivación debe ser consistente con eso y Fase 9 NO reabre esta decisión.** |
| **P** *(Fase 1)* | AC72 "KPI afectado no clasificable" — ¿desaparece o produce estado `N_A`? | Produce `KPI_STATE` con `pos=N_A`, `admissibility=false` + flag. Fase 1 emite `DEGRADED`/KPI; Fase 5 lo consume y fuerza `N_A`. Lectura de §30 + INV-01. |
| **Q** *(Fase 1)* | `kpi_spec.definition_version` vs `metric_definition.definition_version` — ¿iguales, o el caso trae varias versiones? | El caso **puede** traer `md1@v1` y `md1@v2` (§7). Resolución = `metric_definition_id` coincide **y** `definition_version` == `kpi_spec.definition_version`. No encontrada → AC73 (`BLOCKING`/STATE). Decisión. |
| **R** *(Fase 2)* | §29 `validate_data_quality()` — ¿solo chequea el `quality_status` declarado, o calcula uno efectivo? | **Calcula uno efectivo, degradación monótona**: parte de `quality_status` declarado y solo se mueve hacia INVALID (o MISSING); nunca hacia una calidad mejor. AC08 lo obliga para fuera-de-rango; se generaliza. `clasificarAusencia` (Fase 0) consume la efectiva. Pipeline secuencial, NO circular. |
| **S** *(Fase 2)* | `boundary_behavior = RULE_DEFINED` (§7) — la regla no está en el documento | `value` fuera de rango con `RULE_DEFINED` → `INVALID` + flag `BOUNDARY_RULE_NO_OPERACIONALIZADO`. Operacionalizar esas reglas (config) se **difiere**, como la ambig. F. **Sin reapertura de Fase 0** — no se añade `boundary_rule?` al contrato hasta que exista una regla real que lo use. |
| **T** *(Fase 2)* | `value = 0` + `quality_status` declarado `MISSING` — ¿qué gana? | `INVALID` + flag `VALOR_CALIDAD_INCONSISTENTE`. El valor presente contradice el "missing" de la fuente (§9: "missing no es cero"); ninguno se cree ciegamente, la inconsistencia se marca. Lectura de §9. |
| **U** *(Fase 2)* | `value = null` + `quality_status` declarado `VALID`/`VWL` + con `absence_reason` (§28 lo permite) | Calidad efectiva → `MISSING` (no hay valor que pueda ser VALID); `absence_reason` preservada en flag `NULL_EXPLICADO`. §28 no crea un 5º `DATA_QUALITY_STATUS`. Lectura de §28 + §9.1. |
| **V** *(Fase 2)* | `NOT_APPLICABLE` como resultado de `boundary_behavior` — `DATA_QUALITY_STATUS` no lo tiene | Fase 2 lo mapea a `MISSING` + flag `BOUNDARY_NOT_APPLICABLE` (no hay valor utilizable, pero no es "dato inválido" — es "la métrica no aplica en este régimen"). La distinción se preserva en el flag para Fase 5. Decisión de diseño. |
| **W** *(Fase 3)* | §8.1 "las referencias se seleccionan; **no se promedian**" — prohibición pura, sin alternativa cuando hay varias candidatas | Con un solo `condition_reference_id`/`temporal_reference_id` por KPI_SPEC, la única multiplicidad = varias VERSIONES del mismo `reference_id` con ventanas de vigencia solapadas. → `NOT_ADMISSIBLE` para ese período + flag `REFERENCIA_VERSIONES_SOLAPADAS`. **No** "la más reciente gana" silenciosa (§30). Decisión de diseño. |
| **X** *(Fase 3, reapertura)* | `REFERENCE_SPEC` (§25.3) no tiene campo de admisibilidad, pero §8.2 exige un veredicto de 3 valores por referencia, hoy | Reapertura Fase 0 (`fa0a467`): `admissibility_declared` (obligatorio) + `critical_failure?` + `change_mode?`/`supersedes?`. El motor chequea vigencia; el resto lo declara el analista (patrón `diseno` del FPV). Distinto de S — aquí el veredicto **ya lo exige el documento**. |
| **Y** *(Fase 3, reapertura)* | §8.4 `BRIDGED exige regla de transformación validada` — `METRIC_DEFINITION` no tiene `bridge_rule` | Reapertura: `bridge_rule?` en `METRIC_DEFINITION` (opcional en el contrato). `continuidadDefinicion` trata `BRIDGED` sin `bridge_rule` como `NEW_SERIES` + flag (AC15 / INV-29). |
| **Z** *(Fase 3)* | §8.3 no dice qué pasa con los estados históricos ya calculados al hacer `REBASE_HISTORY` | Fase 3 solo emite la directiva `REBASE_HISTORY`; la re-versión de `KPI_STATE`/... históricos es **Fase 11** (§31: "produce nuevas versiones de estados históricos; no sobrescribe"). Se cierra en Fase 11. |

### Ambigüedades de Fase 4 (§11.2/§11.3/§12/§13) — dos grupos

**Grupo 1 — el texto nombra el concepto sin darle número** → `PARAMS.* = null` + `PENDIENTE_CALIBRACION` (`8051890`). Sin decisión de diseño. Mientras no estén calibrados, las funciones devuelven `INSUFFICIENT` / `N_A` + flag `*_NO_CALIBRADO` — nunca una lectura favorable inventada (§30).

| # | Concepto | Constante |
|---|---|---|
| **B** | gap de continuidad | `MAX_CONTINUITY_GAP` (Fase 0) |
| **C** | ventanas de freshness | `FRESHNESS_MAX_AGE_CURRENT` / `_AGING` |
| **AA** | cortes de CV para `SERIES_STABILITY` | `STABILITY_CV_STABLE` / `_MODERATE` |
| **AB** | umbral de tendencia / estacionalidad / long. mínima para `TEMPORAL_PATTERN` | `PATTERN_MIN_PUNTOS` / `_TREND_SLOPE` / `_SEASONAL` |
| **AC** | long. mínima de historia para traj ≠ `N_A` | `MIN_HISTORIA_TRAJ` (fallback = 2) |
| **AG** | densidad que cuenta como "sparse" | `SPARSITY_MIN_DENSIDAD` |

**Grupo 2 — el texto no dice qué mecanismo usar** → decisión de diseño, anotada.

| # | Hueco | Lectura adoptada |
|---|---|---|
| **H** *(Fase 4)* | §11.3 gobierna `det_run` (conteo); `det_duration` sin regla | `det_run` = nº períodos consecutivos en `D`; `det_duration` = span calendario del run actual (`period[último D] − period[primer D]`). |
| **AD** *(Fase 4)* | `TEMPORAL_METHOD` (§11.2) no está en ningún esquema | `PARAMS.TEMPORAL_METHOD_DEFAULT = 'DELTA'` (comparar con el período anterior). Override por-KPI → diferido (patrón S). |
| **AE** *(Fase 4)* | `SHOCK_STATUS`/`SHOCK_TREATMENT` (§12, §27) no están en **NINGÚN** esquema, ni de entrada ni de estado | **NO se reabre `PIIO_INPUT`.** `registrarShock` es una utilidad pura (valida una declaración ad-hoc contra los enums, no la guarda). El efecto de `EXCLUDE_FROM_STRUCTURAL_CALIBRATION` se difiere (no hay calibración en motor-piio). AC57/INV-59: un shock confirmado nunca se elimina automáticamente. Perfil idéntico a S / `node_level`. |
| **AF** *(Fase 4)* | regla exacta `CONTINUOUS` vs `NEW_REGIME` (§12) | **DERIVACIÓN de Fase 3, no decisión nueva**: `NEW_REGIME` sii Fase 3 emitió `START_NEW_REGIME` para la referencia **o** `continuidadDefinicion` dio `NEW_SERIES`. |
| **AG-m** *(Fase 4)* | §12/INV-58: "sparsity NO es temporal_pattern" — no dice qué SÍ produce | serie sparse → `TEMPORAL_PATTERN = INSUFFICIENT` **y** `SERIES_STABILITY = INSUFFICIENT` + flag `SERIE_SPARSE`. |

---

## Reaperturas de código ya comiteado

Misma disciplina que CFF/IFD/FPV: cuando una fase posterior corrige algo
ya comiteado, se documenta aquí (commit propio, no mezclado con el trabajo
de la fase que lo motivó).

| Qué se reabrió | Desde | Por qué | Commit |
|---|---|---|---|
| `contratos.js` — `ESQUEMA_REFERENCE_SPEC` (+`admissibility_declared` obligatorio, `critical_failure?`, `change_mode?`/`supersedes?`) y `ESQUEMA_METRIC_DEFINITION` (+`bridge_rule?`) | Fase 3 | §8.2 exige un veredicto de admisibilidad por referencia (ambig. X) y §8.4 exige una regla de bridge validada (ambig. Y) — ninguno tenía dónde vivir en §25.3 / §7 | `fa0a467` |
| `enums.js` — `PARAMS` (+7 constantes calibrables de `temporal.js`: `STABILITY_CV_*`, `PATTERN_*`, `MIN_HISTORIA_TRAJ`, `SPARSITY_MIN_DENSIDAD`, `TEMPORAL_METHOD_DEFAULT`, `TEMPORAL_WINDOW`) | Fase 4 | §11.2/§12 nombran los conceptos sin dar número — Grupo 1 (`PENDIENTE_CALIBRACION`); aditivo, no rompe nada | `8051890` |
| `contratos.js` — `ESQUEMA_REFERENCE_SPEC` (+`threshold` obligatorio si `reference_role=CONDITION`, `threshold_upper?`, `band?`); `enums.js` `PARAMS` (+`TRAJ_STABLE_BAND`, `PERS_REPEATED_MIN`, `PERS_PERSISTENT_MIN`) | Fase 5 | §11/AC01/04–07 exigen que el motor clasifique `value` → F/I/D contra `REF_COND`, pero §25.3 solo da `rule` como texto libre ("threshold" tiene **0 apariciones** en el documento) — ambig. AH; + Grupo 1 de `kpiState.js` (AI/AJ) | *este commit* |

---

## Fase 0 — enums, contratos, semántica de ausencia

### `enums.js`
- `DOMAINS` — los 7 canónicos (§5).
- `ENUMS` — 23 de §27 (verbatim) + 7 de otras secciones (`METRIC_TYPE`
  §7, `BOUNDARY_BEHAVIOR` §7, `CONTINUITY_MODE` §7/ambig. E,
  `REFERENCE_TYPE` §8.1, `REFERENCE_ROLE` §25.3, `SHOCK_TREATMENT` §12,
  `TEMPORAL_METHOD` §11.2, `EVIDENCE_BASIS` §15.1) + `AUSENCIA_KIND` §28.
- `PARAMS` — `MAX_CONTINUITY_GAP` (ambig. B), `FRESHNESS_MAX_AGE_*`
  (ambig. C), todos `null` + `PENDIENTE_CALIBRACION`.

### `contratos.js`
- `clasificarAusencia({ value, quality_status?, absence_reason? })` →
  `VALOR_PRESENTE | CERO_OBSERVADO | MISSING | NULL_CON_RAZON | INVALIDO`
  (§28 / INV-PIIO-02/03/64). **Fuente única** de la distinción 0 vs
  missing vs null (patrón `clasificarValorRespuesta` del FPV). `N_A`
  nunca se devuelve — §28: es categoría de pos/traj/pers, no de valor.
- `validarObjeto(schema, obj)` genérico (reusado de FPV/IFD).
- 8 validadores de forma (`validarMetricDefinition` con la regla
  condicional de ambig. D; `validarKpiSpec` con los campos DERIVED-only;
  `validarKpiObservation` con la regla `value=null ⇒ razón`; los demás
  directos).
- `validarPIIOInput(obj)` — forma de alto nivel (arrays presentes,
  `organization_id`, `ruleset_version`, `periods` no vacío) + valida cada
  elemento de cada array con su validador. **Validación cruzada
  (referencias entre catálogos, aciclicidad de jerarquía, versiones
  consistentes) → Fase 1.**
- `validarEFOStateLigero(obj)` — **Fase 0: ligero.** Esqueleto de campos
  §24 + `pos ∈ POSITION` + rechazo de `CLAVES_SCORE_PROHIBIDAS`
  (§35 / AC75 / INV-PIIO-75/76: no existe score EFO 0–100). Forma interna
  completa → Fase 11.

### Batería
`node motor-piio/contratos.test.js` → **85 asserts, 0 fallos** (76 en
Fase 0 + 9 de la reapertura de Fase 3) + **8 mutaciones** (sobre copias
reales, revertidas):
1. `clasificarAusencia` sin la rama de cero → **4 rojos** (los 4 asserts
   de `value=0`) — INV-PIIO-03 (cero ≠ missing).
2. `clasificarAusencia`: null sin razón → `MISSING` en vez de `INVALIDO`
   → **1 rojo** (INV-PIIO-64 / AC74).
3. `validarMetricDefinition` sin el chequeo TARGET_RANGE → **1 rojo**
   (ambigüedad D).
4. `validarKpiSpec` sin el bloque DERIVED → **1 rojo** (§10).
5. `validarPhenomenonSpec` acepta cualquier rol en
   `core_or_supporting_by_domain` → **2 rojos** (§18).
6. `validarEFOStateLigero` con `CLAVES_SCORE_PROHIBIDAS` vacía → **2
   rojos** (AC75 / INV-PIIO-75/76).
7. *(reapertura Fase 3)* `admissibility_declared` opcional en vez de
   obligatorio → **1 rojo** (§8.2 / ambig. X).
8. *(reapertura Fase 3)* `validarReferenceSpec` sin el chequeo
   `change_mode ⟹ supersedes` → **1 rojo** (§8.3).

**Total motor-piio tras Fase 0: 76 asserts** (85 tras la reapertura de
Fase 3).

## Fase 1 — validación de configuración (§29 pasos 1–4)

`config.js` — las 4 validaciones pre-vuelo de `runPIIO`. **No mutan
estado.** Producen un reporte con severidad (§30):

```
finding = { code, severity: WARNING|DEGRADED|BLOCKING, scope: GLOBAL|STATE|KPI, target?, message }
```

- **`BLOCKING` + `GLOBAL`** → la corrida no procede (AC70 catálogo
  corrupto, AC71 jerarquía cíclica).
- **`BLOCKING` + `STATE`** → bloquea el estado afectado, no la corrida
  (AC73 `metric_definition` version ausente).
- **`DEGRADED` + `KPI`** → el KPI queda no clasificable → Fase 5 lo
  fuerza a `pos=N_A` (AC72 reference version ausente).

`validarConfiguracion(input)` corre primero la validación de forma de
Fase 0; si falla → un único `BLOCKING`/`GLOBAL` (Fase 1 no inspecciona
estructura mal formada). Devuelve `{ ok, findings, kpis_degradados,
estados_bloqueados }` donde `ok` = no hay `BLOCKING`/`GLOBAL`.

| Función | Verifica | AC / INV |
|---|---|---|
| `validarConfiguracionCaso` | `organization_id` consistente entre observaciones e input | §31 |
| `validarCatalogos` | fenómeno→dominio y dominio→fenómeno sin colgantes; **INV-31** (dominio aplicable ≥1 CORE); consistencia **bidireccional** `phenomenon.role` ⟺ `domain.lista` (ambig. N) | AC70, INV-31 |
| `validarJerarquiaNodos` | `parent_node_id` no colgante; **sin ciclos** (visited-set); `active_from < active_to`; **por `aggregation_membership`: ningún miembro es ancestro de otro** (INV-48 / ambig. M) | AC71, AC49, INV-48 |
| `validarMetricasYReferencias` | `metric_definition_id`+`definition_version` resuelve (ambig. Q); `condition_reference_id`→rol `CONDITION`, `temporal_reference_id`→rol `TEMPORAL` (ambig. P); `md.phenomenon_id` existe; observaciones con `kpi_id`/`md` colgante → `DEGRADED`/KPI (§30) | AC72, AC73 |

### Batería
`node motor-piio/config.test.js` → **42 asserts, 0 fallos** + **7
mutaciones** (sobre copias reales, revertidas):
1. `_cadenaAncestros`: `return null` → `return cadena` al re-visitar →
   **3 rojos** (ciclos de 2 y 3; la guarda a 10000 no lo enmascara).
2. quitar el chequeo `NODE_SET_CONTENCION` → **2 rojos** (INV-48).
3. quitar `INV-31` (`DOMINIO_APLICABLE_SIN_CORE`) → **1 rojo**.
4. quitar el bloque de consistencia **inversa** del catálogo → **1 rojo**
   (ambig. N es bidireccional).
5. `_resolverMetricDefinition` ignora `definition_version` → **1 rojo**
   (ambig. Q).
6. `_hayReferenciaConRol` ignora el rol → **1 rojo** (ambig. P).
7. `ok` = "no hay NINGÚN `BLOCKING`" (en vez de solo `GLOBAL`) → **1
   rojo** (la corrida debe proceder ante `BLOCKING`/STATE).

**Total motor-piio tras Fase 1: 118 asserts** (contratos 76, config 42).

## Fase 2 — observaciones y calidad de datos (§9 / §29)

`observaciones.js` — el paso `for observation` de §29:
`preserve_original_value()` → `validate_data_quality()` → normalización.
**No clasifica pos/traj/pers** (Fase 5). **No recorta valores** (§9,
INV-PIIO-04).

| Función | Qué hace | AC / INV |
|---|---|---|
| `preservarValorOriginal(obs)` | copia `value` a `original_value` tal cual — sobrevive incluso a observaciones que terminan INVALID / fuera de rango | INV-10 |
| `validarCalidadDato(obs, metricDef)` | → `{ data_quality: <efectivo>, flags[] }`. Degradación monótona (ambig. R). `value` fuera de `[valid_range_min, valid_range_max]` según `boundary_behavior`: `INVALID`→`INVALID`+`FUERA_DE_RANGO` (AC08) · `NOT_APPLICABLE`→`MISSING`+flag (ambig. V) · `RULE_DEFINED`→`INVALID`+flag (ambig. S). `value=null`→`MISSING` (razón en flag, ambig. U). `value` presente + declarado `MISSING`→`INVALID`+`VALOR_CALIDAD_INCONSISTENTE` (ambig. T). | AC08/09/10, INV-03/04 |
| `ingestarObservaciones(input)` | por observación: preservar → `validarCalidadDato` → `clasificarAusencia({value, quality_status: EFECTIVA, absence_reason})` → conservar `numerator/denominator/exposure` (§9.2). Observación con `kpi_id` sin `KPI_SPEC` → `skipped` (§30). **No recibe el reporte de Fase 1** (menos acoplamiento). | §9.2, §30, INV-54/55 |

Salida: `{ evals: OBSERVATION_EVAL[], skipped: [{observation_id, reason}] }`.
`OBSERVATION_EVAL` lleva `original_value`, `value`, `data_quality`,
`ausencia_kind`, num/den/exposure opcionales, `source_*`, `flags[]`.

### Batería
`node motor-piio/observaciones.test.js` → **39 asserts, 0 fallos** + **8
mutaciones** (sobre copias reales, revertidas):
1. `preservarValorOriginal` devuelve `null` para `value` fuera de rango →
   **1 rojo** (INV-10 / §9 no clamp).
2. quitar la rama fuera-de-rango `INVALID` → **5 rojos** (AC08).
3. `var efectiva = declarada` → `var efectiva = 'VALID'` → **2 rojos** (la
   calidad efectiva parte de la declarada — ambig. R).
4. quitar la rama `declarada === MISSING` → **3 rojos** (ambig. T).
5. `NOT_APPLICABLE` → `INVALID` en vez de `MISSING` → **1 rojo** (ambig. V).
6. `clasificarAusencia` con la calidad **declarada** en vez de la efectiva
   → **1 rojo** (null + razón: `NULL_CON_RAZON` en vez de `MISSING`).
7. no saltar la observación sin spec → **2 rojos** (§30).
8. no copiar `numerator/denominator/exposure` → **2 rojos** (§9.2 / AC11).

Hallazgo: la mutación 3 original ("quitar la guarda de degradación
monótona") daba **0 rojos** — la guarda era código muerto: `efectiva`
parte de `declarada` y ninguna rama disminuye la severidad, así que la
propiedad monótona es estructural. Guarda eliminada; mutación reformulada
a "partir de `'VALID'`" (2 rojos).

**Total motor-piio tras Fase 2: 157 asserts** (contratos 76, config 42,
observaciones 39).

## Fase 3 — referencias: condición y tiempo (§8)

`referencias.js` — RESUELVE la referencia vigente por período y produce
las directivas de cambio. **No clasifica pos/traj** (Fase 5) **ni
re-versiona estados históricos** (Fase 11).

Se hace en **dos commits**: A reabre `contratos.js` (`fa0a467`,
ambigüedades X/Y), B es `referencias.js`.

| Función | Qué hace | AC / INV |
|---|---|---|
| `resolverReferenciaVigente(references, reference_id, role, period)` | filtra por `reference_id` + `role` (INV-08: no se cruzan); selecciona la versión cuya ventana `[valid_from, valid_to]` contiene `period`. **0 aplicables → `NOT_ADMISSIBLE`+`FUERA_DE_VIGENCIA`; ≥2 (ventanas solapadas) → `NOT_ADMISSIBLE`+`REFERENCIA_VERSIONES_SOLAPADAS`** (ambig. W). Devuelve **exactamente una instancia del input o `null`** — nunca una combinada (INV-09) | AC72, INV-08/09 |
| `admisibilidadReferencia(refSpec)` | `critical_failure` presente → `NOT_ADMISSIBLE` (§8.2); si no → `admissibility_declared` | §8.2 |
| `evaluarCambioReferencia(refNueva)` | lee `change_mode`/`supersedes` → **directiva** (`REBASE_HISTORY` → Fase 11 re-versiona; `START_NEW_REGIME` → Fase 5 no compara traj). No ejecuta el rebase ni rompe la serie | AC12/13, INV-28 |
| `continuidadDefinicion(metricDef)` | `CONTINUOUS`→une; `BRIDGED`+`bridge_rule`→une; `BRIDGED` sin regla→`NEW_SERIES`+`BRIDGE_SIN_REGLA`; `NEW_SERIES`→traj no cruza | AC14/15/16, INV-29 |

### Batería
`node motor-piio/referencias.test.js` → **31 asserts, 0 fallos** + **7
mutaciones** (sobre copias reales, revertidas):
1. quitar el filtro por `reference_role` → **3 rojos** (INV-08).
2. `aplicables.length > 1` → `false` (elegir `aplicables[0]`) → **3 rojos**
   (ambig. W — no se elige silenciosamente).
3. `admisibilidadReferencia` ignora `critical_failure` → **1 rojo** (§8.2).
4. `_vigente` sin la cota `period > valid_to` → **3 rojos**.
5. `REBASE_HISTORY` y `START_NEW_REGIME` colapsan a la misma rama → **2
   rojos** (INV-28).
6. `BRIDGED` sin `bridge_rule` devuelve modo `BRIDGED` → **2 rojos**
   (AC15 / INV-29).
7. `resolverReferenciaVigente` devuelve una **copia** de la ref → **1
   rojo** (INV-09).

Hallazgo: MUT1 y MUT4 crasheaban la batería (`.ref.X` sobre `null`) hasta
añadir los accesores tolerantes `refVer`/`refRol` — mismo patrón que
`dig()` en Fase 1 y en `runIFD`.

**Total motor-piio tras Fase 3: 197 asserts** (contratos 85, config 42,
observaciones 39, referencias 31).

## Fase 4 — propiedades temporales (§11.2 / §11.3 / §12 / §13)

`temporal.js` — **módulo compartido**, lo invocan Fases 5/7/8/9. Produce
PRIMITIVAS de serie; la clasificación a `traj` es Fase 5 (mismo patrón
cálculo-vs-clasificación que Fase 2). **2 commits**: A extiende `PARAMS`
(`8051890`), B es `temporal.js`.

| Función | § | Produce |
|---|---|---|
| `edadEnPeriodos(desde, hasta)` | — | nº de meses (`'YYYY-MM'`) o días (ISO completo), o `null` |
| `freshness(age, freshness_spec)` | §13 | `FRESHNESS_STATUS`. Sin ventanas calibradas → `'N_A'` (no se inventa). Nunca `INVALID` (INV-62) |
| `continuidadRun(secuenciaPos, periods, opciones?)` | §11.3 | `{ det_run, det_duration, runs[], flags }`. `N_A` transparente (no incrementa ni cierra, INV-25). `F`/`I` cierran el run. `opciones.maxGap` overridea `MAX_CONTINUITY_GAP`; gap > maxGap → run nuevo (AC19); con `null` se puentea + flag (§30: ausencia ≠ recuperación) |
| `estabilidadSerie(valores)` | §12 | `{ valor: SERIES_STABILITY, flags, cv? }`. CV con cortes calibrables; sin calibrar → `INSUFFICIENT` + flag |
| `patronTemporal(valores, periods)` | §12 | `{ valor: TEMPORAL_PATTERN, flags }`. Siempre ∈ `TEMPORAL_PATTERN` — nunca "VOLATILE"/shock/régimen (INV-57/58) |
| `regimen(directivas)` | §12 | `REGIME_STATUS` — **derivación** de las salidas de Fase 3 (AF) |
| `registrarShock(declaracion)` | §12 | `{ shock_status, shock_treatment, flags }` — utilidad pura, sin contrato (AE). No auto-excluye (AC57/INV-59); `EXCLUDE` → flag `EXCLUSION_DIFERIDA` |
| `magnitudCambio(valores, metodo?, opciones?)` | §11.2 | escalar (DELTA/SLOPE/ROLLING_COMPARE) — primitiva; Fase 5 la clasifica. Método no reconocido → cae al default `DELTA` |
| `historiaSuficiente(valores)` | §11.2 | boolean (INV-26: insuficiente → traj `N_A`); sin `MIN_HISTORIA_TRAJ` → mínimo absoluto 2 |

### Batería
`node motor-piio/temporal.test.js` → **59 asserts, 0 fallos** + **9
mutaciones** (sobre copias reales, revertidas):
1. `freshness` no calibrado → `CURRENT` en vez de `N_A` → **1 rojo** (§30).
2. `continuidadRun`: `N_A` cierra el run → **2 rojos** (INV-25).
3. `continuidadRun`: `d > gap` → `d < gap` (split invertido) → **4 rojos**
   (los 4 asserts de AC19).
4. `estabilidadSerie` no calibrada → `STABLE` en vez de `INSUFFICIENT`
   → **2 rojos** (Grupo 1 / §30).
5. `regimen`: `REBASE_HISTORY` → `NEW_REGIME` → **1 rojo** (AF).
6. `registrarShock`: declaración inválida → status crudo → **1 rojo**.
7. `registrarShock`: `EXCLUDE` sin flag `EXCLUSION_DIFERIDA` → **1 rojo**
   (INV-59).
8. `magnitudCambio`: sin fallback al default → **3 rojos**.
9. `historiaSuficiente`: `>= minimo` → `>= 1` → **1 rojo** (INV-26).

**Total motor-piio tras Fase 4: 261 asserts** (contratos 90, config 42,
observaciones 39, referencias 31, temporal 59).

## Qué NO hace este módulo

- No calcula costo, ROI, TRE ni proyección predictiva (§26 — eso es
  CFF/IFD).
- No produce un score EFO 0–100 ni promedio ponderado de dominios
  (§35, INV-75/76).
- No determina el Estado EFICIENCIA (eso es AIE, INV-42).
- No duplica `NODE_CONCENTRATION` / `POLARIZATION` (eso es AIE, INV-46).
- No retrofitea nada del panel PIIO viejo (ver
  `INVENTARIO_PIIO_ANTIGUO.md`).
- No invoca al motor CFF (a diferencia del panel viejo).
- No se conecta a `workbook.html` / producción — módulo aislado.
- No hace merge a `main` sin aprobación.
