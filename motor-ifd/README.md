# motor-ifd — Impacto Futuro del Deterioro

Módulo de cálculo **aislado**, mismo patrón que `motor-ice-ieh`, `motor-sdmo`,
`motor-iao` y `motor-cff`: construcción por fases, contratos como validadores
primero, mutación real en cada regla negativa, nada se comitea sin verificación
mostrada, nada se conecta a otro módulo (arnés aparte, después).

**Fuente de verdad:** `docs/Documento_Tecnico_IFD_v1_2_2_FINAL.docx` — documento
integral y autocontenido (integra v1.2.1 completa + cierre CFF↔IFD + atribución
categórica). No requiere leer versiones anteriores.

**Motor de referencia (oráculo de contraste):**
`docs/ifd_v1_2_1_engine_atribucion_categorica.py` — verificado por Luis por
mutación real para **un solo invariante**: la atribución nunca multiplica el
valor económico. Ver "Alcance del oráculo" abajo.

## Plan de fases (aprobado antes de escribir código)

| Fase | Alcance (§) |
|---|---|
| **0** | Contratos: `EPD = (D,E,M,H,S,Y)` §5, estructura §31, `EPD_INPUT`/`EPD_OUTPUT`, enums, semántica nula §26, catálogo de alertas §29. |
| **1** | Admisibilidad `A = D∧E∧M∧H∧S` §6 + `FEP = min(Q,C,T,R)` §7 (no compensatoria) + niveles S0-S3 §8. |
| **2** | Clasificación V1-V5 §14, dominio natural §15, evolución §16, suficiencia de serie §17, matriz `AM_m` §19 (no score), HMS §18. |
| **3** | Proyección física por variable §20 (conteos, tasas, magnitudes, stocks, latentes-sin-cifra). |
| **4** | Escenarios §21 (Continuidad / Intensificación / Contención) + incertidumbre §22. |
| **5** | Módulo económico §23: gate `AE`, `EEB = Q^fut × VU`, atribución categórica — **invariante más protegido**. |
| **6** | Salidas heredadas §24 como `PENDIENTE_AUDITORIA` (nunca fórmula) + doble conteo §25 + versionamiento §38. |
| **7** | Orquestador `runIFD()` §27-28 + catálogo de alertas §29 + 15 reglas inviolables §32 + 17 pruebas mínimas §35. |
| **8** | Calibración §36 (`Error`, `EA`, `MAE`, `Sesgo`, cobertura de rango) — módulo aparte, retrospectivo. |

## Reaperturas de código ya comiteado

Misma disciplina de trazabilidad que en CFF: cuando una fase posterior
corrige algo ya comiteado, se documenta aquí en vez de rastrear mensajes de
commit sueltos.

| Qué se reabrió | Desde | Por qué | Commit |
|---|---|---|---|
| `enums.js` — `EVOLUTION_TYPE` de 5 a 4 valores (quitar `EV-LIM`) | Fase 0 (`fbd78ea`) | relectura de §16 ("una variable puede combinar propiedades") + verificación contra §16/§20/§21/§28: `EV-LIM` nunca cambia ningún comportamiento (el clamp §15 acota cualquier proyección). Decisión (b). | `f900b10` |
| `enums.js` + `contratos.js` — `VOLUME_CHANGE_MATERIAL_PCT` + campo `volume_change_material` | Fase 0 (`fbd78ea`) | §20.1 "no se extrapola un conteo bruto cuando el volumen cambia materialmente" — sin umbral en el texto. Decisión híbrida: el motor **calcula** `\|exposure_future − exposure_obs\| / exposure_obs` cuando ambos existen (umbral calibrable); declaración explícita solo como último recurso; el motor manda y registra discrepancia. | `015a3bd` |
| `enums.js` + `contratos.js` — campo `serie_historica` + params `INTENSIFICACION_MIN_PUNTOS` / `INTENSIFICACION_DISCREPANCIA_TOL` | Fase 0 (`fbd78ea`) | §21.2 presupone "variabilidad histórica adversa cuando la serie es suficiente" pero **no da** ni el campo de serie ni el mínimo de puntos ni la tolerancia. El motor deriva `g_int`/`δ_int` del `Q75` de los cambios período a período en la dirección neta de la serie (`s = signo(serie[último] − serie[primero])` — **decisión de diseño de Luis**, no exigida por §21.2: el término "adversa" aparece una sola vez en el documento y nunca se operacionaliza). Declaración explícita (`growth_rate_intensificacion` / `delta_intensificacion`) solo cuando la serie no alcanza; precedencia motor-manda con registro en `audit[]` (patrón §20.1). | `753d08f` |
| `enums.js` + `contratos.js` — campo `unit` (unidad física §23.1) + renombre `A09` → `VALOR_ECONOMICO_INSUFICIENTE` | Fase 0 (`fbd78ea`) | §23.1 `AEᵢ = Unidadᵢ ∧ ValorUnitarioᵢ ∧ TrazabilidadEconómicaᵢ` — 3 condiciones, el motor modelaba 2 (hueco #1). `unit` (rótulo físico: "horas") se agrega **opcional/nullable** — la monetización es "una rama posible" (§20); `unit` ausente es fallo de PUERTA (A09), no de esquema. `A09` renombrada al texto literal de §29 #9 (era `VALOR_ECONOMICO_SIN_TRAZABILIDAD`, nombre propio de Fase 0): ahora cubre puerta incompleta por falta de trazabilidad **o** de unidad. El bridge del oráculo compara el prefijo `A09`, el contraste no se rompe. Decisiones A-E aprobadas por Luis (ver "Fase 5"). | `164f72a` |
| `contratos.js` — `validarEPDOutput` hace cumplir la FORMA de `heritage_outputs` (`validarSalidasHeredadas`) | Fase 0 (`fbd78ea`) | hueco #2: `validarEPDOutput` solo comprobaba `type:'object'` — aceptaba `{ VER: 21772.8 }`. §24: "en v1.2.2 no se fija fórmula normativa para ninguna de estas cinco salidas". Ahora exige exactamente `{CFD,CFR,VER,ROI_P,TRE}`, cada una `{ estado: 'PENDIENTE_AUDITORIA' }` — un número / clave de más o de menos / estado distinto → RECHAZADO. Decisión E: el marcador es `{ estado: 'PENDIENTE_AUDITORIA' }`. | `24862b1` |
| `contratos.js` — `ESQUEMA_EPD_OUTPUT` gana `double_count_ids` | Fase 0 (`fbd78ea`) | §31 ("estructura mínima de datos") lista "identificadores de doble conteo" — y el listado mezcla campos de entrada (`Q/C/T/R`, `mecanismo`, `HMS`) con campos de salida (`economic_base`, `nivel de salida`, `valor observado y error`): es la estructura del EPD en todo su ciclo, no segregada. La agregación (§25, Fase 7b) corre el control de doble conteo "antes de agregar" y necesita las claves de cada `EPD_OUTPUT`. `runEPD` las copia de `EPD_INPUT`. | `86ff75b` + fix `22e0e83` |
| `contratos.js` — `ESQUEMA_EPD_OUTPUT` gana `variable_type` | Fase 0 (`fbd78ea`) | §31 lista "variable, unidad, dominio y evolución" en la misma línea (misma lectura no-segregada que `double_count_ids`). La calibración (§36, Fase 8) agrupa los errores por `variable_type` ("los errores solo se agregan entre variables comparables"). `runEPD` lo copia de `EPD_INPUT` en **todas** las salidas (S0/S1/CUANTIFICADO) — `variable_type` siempre existe en la entrada, a diferencia de `double_count_ids`. Alcance acotado a solo `variable_type` (no `unidad`/`dominio`/`evolución` "por si acaso"). | *este commit* |

## Alcance del oráculo — el motor Python NO es fuente de verdad para `ver`/`roi`/contención

El engine de referencia **sí calcula** `ver` y `roi` a partir de
`containment_factor` / `intervention_cost`:

```python
ver = econ_base - contained_value
roi = (ver - x.intervention_cost) / x.intervention_cost
```

Esto **contradice** lo que v1.2.2 §24 ya cerró: `CFD/CFR/VER/ROI_P/TRE` están
`PENDIENTE DE AUDITORÍA HISTÓRICA CONTRA IFT v1.0 FINAL`, sin fórmula normativa.
El engine es de una etapa anterior a esa decisión — es válido y verificado
**solo** para el invariante de atribución categórica.

**Regla para Fases 5-6:** cualquier campo de contención (`containment_factor`,
`containment_evidence_level`, `intervention_cost`) queda **fuera del contraste
con el oráculo**. Si se usan para ejercitar el gate económico en general, se
verifica explícitamente que la implementación JS **no** produzca `ver`/`roi` a
partir de ellos.

**Fase 5 — qué SÍ se contrasta:** `economic_base` / `economic_lower` /
`economic_upper` (§23.2 `EEB = Q^fut × VU`) y la alerta `A10` (atribución
UNRESOLVED). Coinciden exacto JS↔engine en los casos que llevan `unit`.
**Qué NO:** la 3ª condición de puerta `unit` (§23.1) — el engine solo
modela 2; un caso sin `unit` diverge a propósito (JS cierra + `A09`, el
engine monetiza). Esa divergencia se asevera **aparte**, nunca contra el
engine.

## Las 6 ambigüedades — decisiones tomadas (aprobadas por Luis)

1. **Códigos de alerta.** §29 lista 15 alertas conceptuales, **sin códigos**. El
   engine codifica 10 (A01-A07, A09, A10, A12) y **salta A08 y A11**. Cruce
   literal §29↔engine → **5 sin código**: #8 extrapolación no sustentable, #11
   doble conteo, #13 unidades incompatibles, #14 probabilidad no calibrada, #15
   agregación heterogénea. Se les asignan **A13-A17**, continuando después de
   A12. **A08 y A11 quedan reservados y vacíos** — la coincidencia posicional
   (A08↔#8, A11↔#11) es circunstancial y **no se usa**: no se les asigna
   contenido sin evidencia de qué debían representar. Ver `enums.js`.
2. **`evolution_type`.** §16 nombra 5 dinámicas sin código y da fórmula
   solo para 3. Enum = **4 valores** `EV-A / EV-M / EV-ACUM / EV-CUAL`
   (`EV-CUAL` → sin proyección cuantitativa, como V5).
   **`EV-LIM` eliminado** (Fase 0 lo tenía; decisión (b), reapertura de
   `fbd78ea` en commit propio — ver "Reaperturas" abajo): verificado contra
   §16/§20/§21/§28 que **ningún punto** trata "multiplicativa + limitada"
   distinto de "multiplicativa con bounds". El acotamiento es el clamp de
   dominio §15 aplicado a **cualquier** proyección tras seleccionar método.
   Un valor de enum que no cambia comportamiento invita a usarlo pensando
   que hace algo → se quita. `EV-M` + `lower_bound`/`upper_bound` expresa la
   combinación de §16.
   Validación por **igualdad estricta** (verificado: `"EV-MX"`, `"EV-MAL"`
   → rechazados).
   **Divergencia deliberada con el oráculo.** Esta es una de las áreas donde
   el contraste con el engine Python **debe dar resultados distintos a
   propósito**: `evolution_type = "EV-MX"` → el engine lo aceptaría (por
   `"EV-M" in ...`), este motor lo rechaza. En fases posteriores esa
   discrepancia **no es un error del JS** — es la corrección de un patrón
   frágil del prototipo. Cualquier caso de contraste que toque
   `evolution_type` debe compararse teniendo esto en cuenta.
3. **Envelope de incertidumbre (§22).** Parámetro calibrable explícito:
   `±15%` (FEP 2) / `±7%` (FEP 3), valores del engine (marcados "NOT
   empirically calibrated"), estado `PENDIENTE_CALIBRACION`.
4. **`Q75` de Intensificación (§21.2).** Convención pre-piloto explícita,
   `PENDIENTE_CALIBRACION` (`INTENSIFICACION_PERCENTIL = 75`). El mínimo de
   puntos de serie para derivar por `Q75` (`INTENSIFICACION_MIN_PUNTOS = 4`)
   y la tolerancia serie-vs-declarado (`INTENSIFICACION_DISCREPANCIA_TOL =
   0.05`) también son `PENDIENTE_CALIBRACION` — el documento no da ninguno.
5. **Umbral de suficiencia de serie (§17).** El engine usa `series_sufficiency
   < 2`. §17: "los mínimos por método son parámetros calibrables". → constante
   editable `PARAMS.SERIE_MINIMA_CUANTITATIVA = 2`, no hardcodeada en la lógica.
6. **Enum `status`.** `NO_PROYECTABLE / CUALITATIVO / DEGRADADO_A_CUALITATIVO /
   CUANTIFICADO` (del engine). No redundante con S0-S3: el mismo S1 puede llegar
   por `CUALITATIVO` (V5 por naturaleza) o `DEGRADADO_A_CUALITATIVO` (serie
   insuficiente) — diagnósticos distintos.

## Fase 0 — contratos

### `enums.js`
Los 8 enums + el catálogo de 15 alertas (`ALERTAS`) + `ALERTAS_RESERVADAS`
(A08/A11) + `PARAMS` (los parámetros calibrables con su estado
`PENDIENTE_CALIBRACION`; los de Intensificación §21.2 —
`INTENSIFICACION_MIN_PUNTOS`, `INTENSIFICACION_DISCREPANCIA_TOL` — se
agregaron en la reapertura de Fase 0 para §21.2, ver "Reaperturas").

### `contratos.js`
- `validarEPDInput` / `validarEPDOutput` — validadores de forma sobre el
  esquema del engine (`EPDInput`/`EPDOutput`) + los campos de §31 que
  faltaban. `series_sufficiency` es **numérico 0-3** (no `'SS2'`) para
  contrastar con el engine; `SS0..SS3` son solo etiquetas.
- `validarAtribucionCategoria(v)` — **única fuente** de la regla "la atribución
  nunca es un coeficiente". Equivalente JS del `ValueError` del engine (§28,
  §35). `validarEPDInput` la **llama** en vez de repetir la lógica: una
  mutación de esta función rompe ambos caminos a la vez (patrón
  `rangoIncompatibleConObserved` de CFF). Verificado.
- `clasificarValorNulo(v)` — §26: `0` (ausencia demostrada) ≠ `null` (no
  determinado) ≠ `'NA'` (no aplicable).
- `validarEPDOutput` — además rechaza cualquier `alerts[]` con código `A08` o
  `A11` (reservados) o desconocido.

### Regla condicional candidata — NO implementada en Fase 0
§23.1: la puerta económica es `AE = Unidad ∧ ValorUnitario ∧
TrazabilidadEconómica`. Podría exigirse en el contrato que
`economic_traceability === true` ⇒ `unit_value` presente. Pero eso es lógica
de la puerta (Fase 5), no coherencia estructural de un objeto aislado. Se
señala; se decide en Fase 5, no se fabrica ahora.

### Batería
`node motor-ifd/contratos.test.js` → **70 asserts OK, 0 fallos** + 1 mutación
(aceptar un número 0-1 como "categoría" → los asserts de `0.70` rechazado, y el
de `EPD_INPUT`, fallan juntos). (`55` en `fbd78ea` → `58` en `015a3bd` → `70`
con la reapertura de §21.2: +11 por los 3 campos nuevos y sus params.)

## Fase 1 — admisibilidad + FEP + niveles de salida

### `admisibilidad.js`
- `evaluarAdmisibilidad(gates)` — §6: `A = D∧E∧M∧H∧S`, **AND estricto** de
  las 5 puertas. Cualquiera ausente / no-booleana / false → NO admisible,
  alerta `A01`. No hay "4 de 5 basta" (el motor no completa vacíos, §6).
- `calcularFEP({Q,C,T,R})` — §7: `FEP = min`, **no compensatoria**.
  `Q=C=T=3, R=1 → FEP=1`, no 2.5. Valida entero 0-3 por dimensión.
- `nivelSalidaMax(fep)` — §8: mapeo `0→S0, 1→S1, 2→S2, 3→S3`.
- `verificarFuerzaSalida(nivel, fep)` — salvaguarda del invariante §8/§30
  *"FUERZA DE SALIDA ≤ FUERZA DE EVIDENCIA"* / *"la degradación nunca
  sube"*. Expuesta para prueba dirigida.
- `resolverPuertaEvidencia(input)` — combina §6+§7: devuelve un resultado
  **terminal S0** (no admisible → `A01`; `FEP=0` → `A03` si `R=0`, si no
  `A02`) o `terminal: false` con `fep` + `nivelMax` para Fases 2+.

**§35 cubierto**: "falta deterioro sustentado → no proyectable" · "R=0 →
no proyectable aunque la serie sea estadísticamente fuerte" (→ `A03`, no
`A02`) · "una dimensión crítica en nivel 1 limita la salida" (techo S1).

### Baterías
- `admisibilidad.test.js` → **31 asserts, 0 fallos** + **4 mutaciones**:
  **(1)** §7 FEP como **promedio puro** (un solo cambio `min`→`sum/length`):
  `Q=C=T=3,R=1` → `(3+3+3+1)/4 = 2.5` (correcto 1); `R=0` → `2.25` (correcto
  0 — trazabilidad nula daría `FEP>0`); downstream `nivelSalidaMax(2.25)`
  **lanza** ("FEP fuera de 0-3") como evidencia adicional, no 2º defecto.
  **(2)** admisibilidad como mayoría (`≤2 fallos`) → 4/5 pasa. **(3)** alerta
  de `FEP=0` siempre `A02` → el caso `R=0` pierde el `A03` específico.
  **(4)** `nivelSalidaMax` todo S3 → `verificarFuerzaSalida` deja de lanzar.
- `oraculo.test.js` → **32 asserts, 0 fallos** (contraste real con el motor
  Python vía `oraculo_bridge.py`, subproceso). JS y engine coinciden
  **exacto** en `admissible` + `FEP` + los casos terminales S0
  (`output_level`, `status`, códigos `A01`/`A02`/`A03`). El engine corta en
  S1/CUALITATIVO cuando `FEP==1`; este motor difiere ese corte a Fase 2
  (interactúa con `variable_type`/HMS) — **no es discrepancia**: `admissible`
  y `FEP` coinciden, que es todo lo que Fase 1 decide.

### `oraculo_bridge.py`
Puente al engine de referencia. Solo admisibilidad / FEP / niveles /
alertas — **nunca** `ver`/`roi`/contención.

## Fase 2 — clasificación: compuertas + dominio + serie

### `clasificacion.js`
- `aplicarHMS(fep, horizon, hms)` — §18/§28: `hms=null` → no aplica (no es
  fallo). `horizon > hms` → alerta `A07`, `effective_fep = max(1, fep-1)`
  ("nunca por debajo de S1", §28 literal).
- `clampDominio(y, lower, upper)` — §15: `Y* = min(U, max(L, Ŷ))`. Bound
  `null` → sin límite en ese lado. Recorte → `A06`.
- `clasificarSuficienciaSerie(ss)` — §17: `SS0..SS3`,
  `permiteCuantitativa` sii `ss >= SERIE_MINIMA_CUANTITATIVA` (2, calibrable).
- `resolverClasificacion(input)` — las 4 compuertas, en orden:
  **(1) V5** → `S1/CUALITATIVO` (capacidad latente, no cifra — §20.5/§35;
  gana incluso con serie mala → status `CUALITATIVO`, no `DEGRADADO`).
  **(2) EV-CUAL** → `S1/CUALITATIVO` (dinámica sin fórmula, §16 — *el engine
  no tiene esta compuerta; divergencia deliberada, respaldada por §16*).
  **(3) effective_fep == 1** → `S1/CUALITATIVO`.
  **(4) serie SS<2 en V1-V4** → `A04`, `S1/DEGRADADO_A_CUALITATIVO` (status
  distinto de (1)/(3) — diagnóstico diferente).
  Si ninguna → `terminal:false` con `effectiveFep` + techo para Fase 3.

### Baterías
- `clasificacion.test.js` → **28 asserts, 0 fallos** + **4 mutaciones**:
  (1) quitar la compuerta V5 → un V5 pasa a `terminal:false` (proyectaría
  cifra); (2) `aplicarHMS` con `fep-1` sin `max(1, …)` → `fep=1 + H>HMS` da
  `effective_fep=0` (§28: nunca <S1); (3) `horizon > hms` nunca true → `A07`
  nunca se emite; (4) `clampDominio` con `Math.min(lower, …)` → `y=-5, L=0`
  no sube a 0.
- `oraculo.test.js` +8 asserts Fase 2 → **40 asserts totales**. JS y engine
  coinciden exacto: `g_v5` S1/CUALITATIVO · `g_fep1` S1/CUALITATIVO · `g_hms`
  techo S2 + `A07` · `g_serie` S1/DEGRADADO_A_CUALITATIVO + `A04`.
  **EV-CUAL no se contrasta** (el engine no lo chequea).

## Fase 3 — proyección física §20

### `proyeccion.js`
- `seleccionarMetodo(input)` — cascada ordenada de §28 (realiza la "matriz
  `AM_m`" de §19, que el texto no enumera): `V1_TASA` → `TENDENCIA_LINEAL` →
  `CRECIMIENTO_MULTIPLICATIVO` (`EV-M`) → `DELTA_ADITIVO` (`EV-A`) →
  `CONTINUIDAD` → `INCOMPATIBLE`. `evolution_type` por **igualdad estricta**.
- `proyectarBase(input, metodo)` — §20: `V1_TASA` `(N_obs/X_obs)·X_H` ·
  `TENDENCIA` `a + b·h` · `MULT` `baseline·(1+g)^h` · `DELTA` `baseline + δ·h`
  · `CONTINUIDAD` `baseline`.
- `chequeoVolumenV1(input, metodo)` — §20.1: solo V1 sin `V1_TASA`. Si
  `exposure_obs` y `exposure_future` presentes → calcula
  `|Δ|/exposure_obs` vs `VOLUME_CHANGE_MATERIAL_PCT`; si no → declaración
  `volume_change_material` (último recurso); si tampoco → `A13` (§0).
  **Precedencia**: el motor manda; declarado vs. calculado en conflicto →
  entrada en `audit[]` (`DISCREPANCIA_VOLUME_CHANGE_MATERIAL`), no se
  descarta ni rechaza.
- `proyectar(input)` — `INCOMPATIBLE` → `A05`/`S1/DEGRADADO_A_CUALITATIVO`;
  `A13` (§20.1) → `S1/DEGRADADO_A_CUALITATIVO`; si no → `clampDominio` (§15,
  `A06` si recorta) → `projection_base` para escenarios/economía.

### `§12` — ejemplo normativo verificado
`baseline=3000, delta=400, EV-A, horizon=6` → `projection_base = 3000 +
400·6 = 5400` horas. **La variable que se proyecta son las horas, no los
75.000 de CFF.** La monetización (`5400 × 25 = 135.000`) es Fase 5.

### Baterías
- `proyeccion.test.js` → **36 asserts, 0 fallos** + **4 mutaciones**:
  (1) quitar `chequeoVolumenV1` → V1 con volumen 12000→72000 (500%)
  proyecta **504** (conteo bruto) en vez de terminal `A13`; (2) saltar
  `V1_TASA` en la cascada → V1 con params de tasa + `baseline=99` proyecta
  `CONTINUIDAD`=**99** en vez de `V1_TASA`=`(504/12000)×13000`=**546**;
  (3) cambiar la rama `INCOMPATIBLE` por fallback → un caso sin `baseline`
  lanza en `proyectarBase` en vez de degradar limpio a `A05`; (4) no
  aplicar `clampDominio` → `90+5×6=120` con `upper_bound=100` sale **120,
  []** en vez de **100, [A06]**. Incluye el test del sentido inverso de
  la discrepancia §20.1 (`declarado=true`, calculado NO-material → el
  motor manda igual, `audit` registra `{declarado:true, calculado:false}`).
- `oraculo.test.js` +10 asserts Fase 3 → **50 totales**. JS y engine
  coinciden exacto en `projection_base`: `p_v1tasa` 3024 · `p_trend` 130 ·
  `p_mult` 133.10000000000005 (mismo drift IEEE-754) · `p_delta` 5400 ·
  `p_clamp` 100 + `[A06]`. **El chequeo §20.1 y EV-CUAL son de este motor**
  — los casos con esos rasgos se excluyen del contraste.

## Fase 4 — escenarios §21 + incertidumbre §22

### `escenarios.js`
Tres escenarios, cada uno una proyección física **distinta** desde el mismo
`projection_base` de Fase 3, más el envelope de §22:

- `escenarioContinuidad(projBase)` — §21.1: `Y_H^CONT = Ŷ_H`, sin
  multiplicador. Devuelve `projBase` tal cual.
- `derivarIntensificacionDeSerie(serie, multiplicativo)` — §21.2: de una
  `serie_historica` de ≥ `INTENSIFICACION_MIN_PUNTOS` (4) puntos, deriva el
  parámetro de intensificación del **`Q75` de los cambios período a período
  en la dirección adversa**. Dirección adversa `s = signo(serie[último] −
  serie[primero])` — **decisión de diseño de Luis** (confirmada explícita,
  como la precedencia motor-manda de §20.1), no exigida por §21.2: el
  término "adversa" aparece una sola vez en el documento (línea 584) y
  nunca se operacionaliza. Solo cuentan los cambios cuyo signo coincide
  con `s`. `null` si: serie insuficiente / sin trayectoria neta (`s = 0`) /
  sin cambios en la dirección de `s`. Multiplicativo → cambios relativos
  (`(xₜ − xₜ₋₁)/xₜ₋₁`, se omite si `xₜ₋₁ = 0`); aditivo → cambios absolutos.
- `escenarioIntensificacion(input, projBase)` — §21.2: `EV-M` →
  `Yₜ(1+g_int)^h`; `EV-A` → `Yₜ + h·δ_int`. Fuente del parámetro, en orden:
  **(1)** `serie_historica` suficiente → `SERIE`; **(2)** declaración
  explícita (`growth_rate_intensificacion` / `delta_intensificacion`) →
  `DECLARACION`; **(3)** ninguna → **cualitativa** (`valor: null`). También
  cualitativa si `evolution_type` no es `EV-M`/`EV-A` o falta `baseline`.
  **Precedencia serie-vs-declaración** (patrón §20.1): si hay serie Y
  declaración y difieren más de `INTENSIFICACION_DISCREPANCIA_TOL` (5% rel.,
  o abs. si el declarado es 0), el **motor manda con el calculado** y
  registra `DISCREPANCIA_INTENSIFICACION` en `audit[]` — no descarta el
  input.
- `escenarioContencion(input, projBase)` — §21.3: `Ŷ_H · (1 −
  containment_factor)`, **solo** con `containment_evidence_level ≥ 2`. Sin
  evidencia suficiente → cualitativa; si `containment_factor` se declaró
  sin evidencia → `A12`. **Esta es la proyección FÍSICA bajo contención, NO
  el `ver`/`roi` de §24** (esas 5 salidas siguen `PENDIENTE_AUDITORIA`,
  Fase 6). El engine Python sí calcula `ver`/`roi` desde estos campos — por
  eso Intensificación / Continuidad / Contención quedan **fuera del
  contraste con el oráculo** (ver "Alcance del oráculo").
- `calcularEnvelope(projBase, effectiveFep, lower, upper)` — §22:
  `IFDᵢ = [Lᵢ, Bᵢ, Uᵢ]`. Amplitud `PARAMS.ENVELOPE_POR_FEP` (±15% FEP 2 /
  ±7% FEP 3, `PENDIENTE_CALIBRACION`); clamp de dominio §15 a `L` y `U`
  (`A06` si recorta). Lanza para FEP ≤ 1 (ya cortó a S1 en Fase 2).

### Baterías
- `escenarios.test.js` → **44 asserts, 0 fallos** + **4 mutaciones**
  (ejecutadas sobre copias reales del archivo, revertidas después):
  **(1)** quitar el filtro por dirección `s` → serie `[10,20,12,30,25]`
  EV-A: correcto `δ_int = 16` (`Q75` de adversos `[+10,+18]`); mutado `12`
  (`Q75` de `|[+10,−8,+18,−5]|`) — distinto y menor.
  **(2)** quitar `if (s === 0) return null` → serie `[50,50,50,50]` EV-M:
  correcto → cualitativa; mutado → `g_int = 0` → `valor = 50` (proyecta con
  intensificación nula en vez de caer a cualitativa).
  **(3)** `< MIN_PUNTOS` → `< MIN_PUNTOS − 1` → serie de 3 puntos
  `[10,15,20]` se cuela al cálculo (`δ_int = 5`) en vez de tratarse como
  insuficiente.
  **(4)** quitar el chequeo de discrepancia → serie da 5, declarado 20:
  correcto `audit.length = 1`; mutado `0` (el motor sigue mandando con el
  calculado, pero la señal humana se pierde sin registro).
- `oraculo.test.js` +6 asserts Fase 4 → **56 totales**. **Solo el envelope
  §22 se contrasta**: `env_fep3` `5400 → [5022, 5778]` (±7%) · `env_fep2`
  con `A07` por HMS → `effective_FEP = 2` → `11000 → [9350, 12650]` (±15%).
  JS y engine coinciden al `1e-6` (`12650` es `12649.999999999998` en ambos
  — mismo drift IEEE-754). Continuidad / Intensificación / Contención **no
  se contrastan** (el engine no los tiene como escenarios; sí calcularía
  `ver`/`roi` de los campos de contención, congelados por §24).

### Números verificados (§21/§22)
| Caso | Cálculo | Resultado |
|---|---|---|
| Intensificación serie `[100,110,121,133.1]` EV-M, `h=3` | `g_int = 0.10`, `133.1 × 1.1³` | `177.1561` |
| Intensificación serie `[10,15,20,25]` EV-A, `h=3` | `δ_int = 5`, `25 + 3×5` | `40` |
| Serie mixta `[10,20,12,30,25]` EV-A | adversos `[+10,+18]`, `Q75([10,18]) = 16` | `δ_int = +16` (mejoras `−8,−5` no cuentan) |
| Precedencia: serie `δ_int = 5`, declarado `20` | motor manda, `100 + 3×5` | `115` (no `160`), `audit` con `{declarado:20, calculado:5}` |
| Contención `cf = 0.30`, evidencia nivel 2 | `5400 × (1 − 0.30)` | `3780` |
| Contención `cf = 0.30`, evidencia nivel 1 | — | cualitativa + `[A12]` |
| Envelope FEP 3, `projBase = 100` | `[100×0.93, 100×1.07]` | `[93, 107]` |
| Envelope FEP 2, clamp a `upper_bound = 110` | `U = 115 → 110` | `[85, 110]` + `[A06]` |

## Fase 5 — módulo económico §23

### `economia.js`
Se activa **solo** tras una proyección física cuantificada (§23: "la
economía se activa únicamente después de proyectar una consecuencia
cuantificable"). `CUANTIFICABLE ≠ MONETIZABLE`, `EXPOSICIÓN ECONÓMICA ≠
ATRIBUCIÓN`.

- `evaluarPuertaEconomica(input)` — §23.1: `AE = unit ∧ unit_value ∧
  economic_traceability`, **AND estricto de las 3**. `unit` = rótulo de
  unidad de medida física ("horas"), string no vacío. Puerta cerrada →
  sin cifras; **A09** (`VALOR_ECONOMICO_INSUFICIENTE`, §29 #9) **solo si
  hubo intención económica** (`unit_value` presente **o**
  `economic_traceability === true`). Sin ninguna señal → EPD no-económico,
  cerrada **sin alerta** (§35: "cantidad sin valor unitario → no
  monetizar"). `unit_value = 0` abre la puerta (§26: 0 = valor demostrado
  ≠ `null`).
- `exposicionEconomicaBruta(proyeccion, unitValue)` — §23.2: `EEBᵢ =
  Qᵢ^fut × VUᵢ`. `proyeccion = {base, lower, upper}` = el envelope [L,B,U]
  de §22. Los rangos monetarios vienen de la **incertidumbre de la
  proyección**, no de la atribución (§23.3). Null-safe. **NO recibe
  `attribution_category`.**
- `tratamientoAtribucion(categoria)` — §23.3: `CONFIRMED`/`SUPPORTED` → la
  categoría acompaña la cifra, sin alerta; `UNRESOLVED` → **A10** +
  restringe la afirmación ("no como costo atribuible demostrado"); `N_A` →
  sin coeficiente sustituto, sin alerta. **Nunca devuelve un número** —
  solo strings/null.
- `monetizar(input, proyeccion)` — orquesta el orden de §28: puerta → EEB
  → tratamiento. La aritmética (EEB) **no lee** `attribution_category`; el
  tratamiento lo lee solo para la afirmación, jamás para la cifra.

**Divergencia deliberada con el oráculo (§23.1).** El engine Python modela
2 condiciones de puerta (`unit_value` + `economic_traceability`); este
motor agrega la 3ª (`unit`). Un caso con VU + trazabilidad pero sin `unit`
→ el engine monetiza, este motor cierra la puerta + A09. Los casos del
contraste llevan `unit` (coinciden exacto); la divergencia se asevera
aparte. Ver "Alcance del oráculo".

Cierra el **hueco #1** (campo de unidad física, abierto desde Fase 3).

### Decisiones A-E (aprobadas por Luis antes de escribir código)
- **A** — "Unidadᵢ" como condición de puerta = **presencia** de `unit` no
  vacío. El documento no da un segundo campo de unidad contra el cual
  verificar coherencia; "Unidades incompatibles" (§29 #13 / A15) es
  agregación entre EPDs (Fase 7), no un EPD individual.
- **B** — `A09` renombrada `VALOR_ECONOMICO_SIN_TRAZABILIDAD` →
  `VALOR_ECONOMICO_INSUFICIENTE` (texto literal §29 #9); cubre puerta
  incompleta por falta de trazabilidad **o** de unidad. Reapertura de
  Fase 0.
- **C** — `unit` **opcional/nullable**: la monetización es "una rama
  posible" (§20); un EPD no-económico legítimamente no lo trae. `unit`
  ausente = fallo de puerta, no error de esquema.
- **D** — `heritage_outputs` (forma) y marca "no normativo" de `VER`/`ROI_P`
  → **Fase 6** (la fase de §24), no aquí.
- **E** — divergencia de `unit` documentada como la de EV-CUAL; en el
  contraste los casos económicos llevan `unit`.

### Baterías
- `economia.test.js` → **46 asserts, 0 fallos** + **4 mutaciones**
  (ejecutadas sobre copias reales, revertidas):
  **(1)** `exposicionEconomicaBruta` lee `attribution_category` y aplica
  factor (UNRESOLVED ×0.5) → **el invariante §34/§35 falla por su nombre**:
  `UNRESOLVED → 67.500 ≠ 135.000` de CONFIRMED (3 asserts rojos).
  **(2)** puerta con `OR` en vez de `AND` → `unit` ausente monetiza
  135.000 en vez de cerrar (8 rojos).
  **(3)** `A09` siempre (sin la guarda de intención) → EPD no-económico
  recibe A09 espurio (2 rojos).
  **(4)** `tratamientoAtribucion` UNRESOLVED → `alerta: null` → se pierde
  la restricción de la afirmación (§35) (2 rojos).
- `oraculo.test.js` +19 asserts Fase 5 → **75 totales**. `econ_confirmed
  / supported / unresolved / na` → `economic_base` **135.000**, `lower`
  **125.550**, `upper` **144.450**, idénticos JS↔engine; `A10` solo en
  UNRESOLVED en ambos. El propio engine confirma su regresión v1.2.1 (4
  categorías → misma cifra). La divergencia de `unit` se asevera **aparte**
  (JS cierra puerta + A09; el engine monetizaría).

### El invariante — §34 / §35 (la protección central del módulo)
> "CONFIRMED, SUPPORTED, UNRESOLVED y N_A producen **exactamente la misma
> valoración económica** cuando la consecuencia, el valor unitario y la
> trazabilidad son iguales."

`economia.test.js` lo corre como regresión nombrada: las 4 categorías con
el mismo `proyeccion` + `unit_value` → `[135000, 125550, 144450]` idéntico.
`attribution_category` **nunca** entra en `exposicionEconomicaBruta` (ni
siquiera se le pasa como argumento). §32: `ATRIBUIR ≠ PONDERAR`,
`ATRIBUCIÓN ≠ COEFICIENTE DE DESCUENTO DEL COSTO`.

### Números verificados (§23)
| Caso | Cálculo | Resultado |
|---|---|---|
| §12 normativo: 5.400 horas × 25 u.m./hora | `EEB = 5400 × 25` | `economic_base = 135.000` |
| Rango del envelope §22 (±7%, FEP 3) | `5022 × 25` … `5778 × 25` | `[125.550, 144.450]` |
| UNRESOLVED, misma consecuencia | cifra igual + `A10` | `135.000` + restricción de afirmación |
| `unit_value = 0` (§26: valor demostrado) | `5400 × 0` | `economic_base = 0` (no `null`) |
| Sin `unit`, con VU + trazabilidad | puerta §23.1 cerrada | sin cifras + `A09` |
| Sin `unit_value`, `traz = false` | EPD no-económico | sin cifras, **sin** alerta |

## Fase 6 — salidas heredadas §24 + doble conteo §25 + versionamiento §38

### `heredadas.js`
Lo que el motor hace **antes de consolidar la salida** y que el documento
deja sin fórmula o sin operacionalizar.

- `construirSalidasHeredadas()` — §24: `{CFD, CFR, VER, ROI_P, TRE}`, cada
  una un objeto **nuevo** `{ estado: 'PENDIENTE_AUDITORIA' }`. §24 literal:
  *"En v1.2.2 no se fija fórmula normativa para ninguna de estas cinco
  salidas."* El engine Python **sí** calcula `VER`/`ROI_P` (es anterior a
  §24) — este motor **nunca**. `CFR` y `VER` son objetos separados, ni
  siquiera comparten referencia (§24: *"No presentar CFR = VER como
  decisión metodológica cerrada"*).
- `validarSalidasHeredadas(ho)` (**en `contratos.js`**, reapertura #5) —
  exige la forma congelada: exactamente las 5 claves, cada una
  `{ estado: 'PENDIENTE_AUDITORIA' }`. Un número / clave de más o de menos
  / `estado` distinto / marcador con clave extra → **RECHAZADO**.
  `validarEPDOutput` la llama. Cierra el **hueco #2**.
- `claveSolapamiento(x)` — §25: valida la 4-tupla
  `{ event_id, resource_id, cost_component_id, period_id }` (los 4
  obligatorios, string no vacío o número finito).
- `overlapMaterial(a, b)` — §25: `Overlapᵢⱼ = f(EventID, ResourceID,
  CostComponentID, PeriodID)`. **Material ⟺ los 4 identificadores
  iguales** (igualdad estricta). Ancla textual (la frase más fuerte del
  §25, no solo la fórmula): *"Un mismo costo no puede aparecer incorporado
  dentro de otra consecuencia y sumarse nuevamente."* Coincidencia parcial
  (mismo evento+recurso, distinto período) → **no material**: períodos o
  componentes distintos son costos distintos.
- `detectarDobleConteo(claves)` — pares `(i<j)` con solapamiento material →
  `alerta: 'A14'` + `bloquear_agregacion: true` (§25/§35: *"impedir suma
  automática"*). La comparación entre EPDs distintos es de la **agregación
  (Fase 7)**; aquí se prueba en aislamiento.
- `construirRegistroCalibracion(campos)` — §38: valida que un cambio
  calibrable traiga los 6 datos que el texto exige (`anterior`, `nuevo`,
  `evidencia`, `muestra`, `efecto`, `version`) + `parametro`. No calcula —
  la matemática de calibración (§36) es Fase 8. El determinismo de §35
  (*"misma entrada + misma versión → misma salida"*) se verifica en Fase 7
  (necesita el orquestador `runIFD`).

### Decisiones A-E (aprobadas por Luis antes de escribir código)
- **A** — "solapamiento material" (§25) = los **4 identificadores
  iguales**; parcial → no material. Anclado a la frase "un mismo costo no
  puede aparecer incorporado dentro de otra consecuencia", no solo a la
  firma `f(...)`.
- **B** — `double_count_ids` = las coordenadas **propias** del EPD (celdas
  evento×recurso×componente×período que ocupa su impacto). La comparación
  cruzada es de la agregación (Fase 7).
- **C** — A14 en Fase 6: un EPD que declara la misma clave dos veces →
  A14; `detectarDobleConteo` (multi-clave, para Fase 7) → A14 + bloqueo.
  Ambos se prueban en aislamiento.
- **D** — Fase 6 hace `construirRegistroCalibracion` (§38); el
  determinismo (§35) queda como AC anotado para Fase 7.
- **E** — marcador heredado = `{ estado: 'PENDIENTE_AUDITORIA' }`.

### Baterías
- `heredadas.test.js` → **30 asserts, 0 fallos** + **4 mutaciones**
  (ejecutadas sobre copias reales, revertidas):
  **(1)** `validarSalidasHeredadas` sin el chequeo de forma → `VER =
  21772.8` (un número) se acepta (6 rojos: la protección de §24 cae).
  **(2)** `overlapMaterial` con `OR` en vez de `AND` → "distinto período →
  NO material" falla; un costo de otro período se bloquearía de más (8
  rojos).
  **(3)** `detectarDobleConteo` no setea `bloquear_agregacion` → se emite
  A14 pero la suma seguiría (1 rojo: §35 "impedir suma automática").
  **(4)** `construirSalidasHeredadas` con `CFR` y `VER` compartiendo
  referencia → "objetos separados" falla (2 rojos: ancla §24 "no CFR =
  VER").
- `oraculo.test.js` +5 asserts Fase 6 → **80 totales**. **Contraste de
  NO-equivalencia**: para un caso con contención el engine calcula
  `VER = 40.500` y `ROI_P = -0.595`; el motor JS devuelve `VER` / `ROI_P`
  como `{ estado: 'PENDIENTE_AUDITORIA' }`. La divergencia se **documenta**
  (§24: el engine es pre-decisión), no es discrepancia.

### Números verificados (§24/§25/§38)
| Caso | Resultado |
|---|---|
| `construirSalidasHeredadas()` | 5 marcadores `{ estado: 'PENDIENTE_AUDITORIA' }`, objetos separados |
| engine con contención: `VER` | `40.500` (número) — el motor JS: marcador, nunca esa cifra |
| claves idénticas | `overlapMaterial = true` → `A14` + `bloquear_agregacion` |
| mismo evento+recurso+componente, `period_id` distinto | `overlapMaterial = false` (costos distintos) |
| `period_id: 3` vs `period_id: "3"` | `false` (igualdad estricta) |
| `detectarDobleConteo([k, k({resource:R9}), k])` | `pares_solapados = [[0,2]]`, `A14`, bloqueo |
| registro de calibración sin `evidencia`/`version` | inválido, nombrados en `faltantes` (§38) |

## Fase 7 — orquestador (§27-28)

La fase más grande, en 3 entregas: **7a** `runEPD` (un EPD), **7b**
`agregarEPDs` (multi-EPD, §13/§25), **7c** cobertura de §35 (17 pruebas) y
§32 (15 reglas).

### 7a — `runEPD(input)`
Encadena Fases 1-6 en el orden del pseudocódigo de §28 y produce el
`EPD_OUTPUT` consolidado (§31), **autovalidado** con `validarEPDOutput` en
cualquier nivel S0-S3.

- Cascada: `validarEPDInput` → §6+§7 (`resolverPuertaEvidencia`) → §18+§14-17
  (`resolverClasificacion`) → §20 (`proyectar`) → §22 (`calcularEnvelope`) →
  §21 (los 3 escenarios) → §23 (`monetizar`) → §24 (`construirSalidasHeredadas`)
  → §25 (`detectarDobleConteo` sobre `double_count_ids`) → consolidar.
- Cada corte terminal (S0 no admisible / FEP=0; S1 V5 / EV-CUAL /
  effective_FEP=1 / serie / método) **detiene** la cascada — nunca se
  fabrica `projection_base` ni `economic_base` aguas abajo de un corte
  (§26: null ≠ 0).
- `output_level` de un `CUANTIFICADO` = `nivelSalidaMax(effective_FEP)` (el
  degradado de §18, no el `FEP` crudo — §30: nunca sube).
- Alertas de todas las fases, **deduplicadas** (A06 puede venir de
  proyección y de envelope → un solo código).
- **Input rechazado** (§28): `{ ok: false, errors: [...] }`, sin
  `EPD_OUTPUT` parcial (decisión A). No es una excepción — es un resultado
  de dominio, como en `runCFF`.

### Decisiones A-F (aprobadas por Luis antes de escribir código)
- **A** — input inválido → `{ ok:false, errors }`, no `throw`.
- **B** — agregación heterogénea (7b): `impact_type` distinto → `A17` +
  bloqueo. **Decisión de diseño de Luis**, no lectura cerrada: §32 dice "no
  se suman arbitrariamente" pero no define "homogéneo" con la fuerza con
  que §25 definió "material" (ahí había frase de refuerzo). Se documenta
  con la misma honestidad que "dirección adversa" (§21.2) o `unit` (§23.1).
- **C** — `agregarEPDs` (7b) separa cuantificados de cualitativos, no
  fuerza cifra donde no la hay.
- **D** — determinismo (§35) por doble ejecución + deep-equal + guarda grep
  (`runIFD.js` sin `Date.now`/`Math.random`). El deep-equal síncrono **no**
  agarra un `Date.now()` en una nota (mismo ms); la guarda grep sí.
- **E** — las 15 reglas de §32 (7c): tabla, cada una con aserción concreta
  o "framing — sin código" con justificación **específica por regla** (p.ej.
  "CORRELACIÓN ≠ CAUSALIDAD no tiene contraparte en ningún campo de
  EPD_INPUT/OUTPUT; es una restricción sobre cómo se interpreta la salida
  fuera del motor").
- **F** — `runIFD.js` con `runEPD` + `agregarEPDs` juntos (comparten
  contexto).

### Baterías (7a)
- `runIFD.test.js` → sección 7a **60 asserts** (55 al cerrar 7a; +2
  `double_count_ids` en `22e0e83`, +3 `variable_type` en `027b2f4`) +
  **4 mutaciones** (ejecutadas sobre copias reales, revertidas):
  **(1)** `if (clas.terminal)` → `if (false)` → el corte de clasificación
  deja de detener la cascada. Mecanismo real: cuando `terminal===true`,
  `resolverClasificacion` devuelve `{ terminal, resultado:{...} }` sin
  `alerts`/`notes` a nivel superior → al seguir, `clas.alerts` es
  `undefined`, `alerts.concat(undefined)` mete un código inválido →
  `validarEPDOutput` rechaza → `runEPD` devuelve `{ ok:false }`. **8
  rojos**, el script termina limpio (hasta `RESULTADO`): todo assert que
  consume un `runEPD` que puede quedar `{ok:false}` usa `out()`, y el `Vq`
  de la sección 7b se cambió de `V5` a un EPD terminal **S0** (`fdbf2c0` +
  `d348bed`) — el corte de admisibilidad §6 es previo a la clasificación y
  ninguna mutación lo toca. Fallan: "los 4 cortes → runEPD ok", los `eq`
  de status/nivel de V5/EV-CUAL/FEP1/serie, `A04`, y "variable_type en
  terminal S1 (V5)".
  **(2)** `output_level = nivelSalidaMax(fep)` en vez de `effective_FEP` →
  el caso HMS da S3 en vez de S2 (§30 violado).
  **(3)** quitar `unicos()` → el caso de clamp da `["A06","A06"]`.
  **(4a)** `Math.random()` en una nota → el deep-equal de determinismo
  falla. **(4b)** `Date.now()` → lo agarra solo la guarda grep.
- `oraculo.test.js` +42 asserts Fase 7a → **122 totales**. **El contraste
  más fuerte**: la cascada entera de §28 por ambos motores en 7 casos no
  divergentes (CUANTIFICADO, HMS→S2, S0 admisibilidad, S0 R=0, S1 FEP=1,
  S1 serie, UNRESOLVED) — `admissible`/`FEP`/`output_level`/`status`/
  `projection_*`/`economic_*` y las alertas compartibles (A01-A07, A09,
  A10) coinciden exacto. Las divergencias deliberadas (EV-CUAL, §20.1, 3ª
  condición §23.1, A06 de envelope, marcadores §24) se contrastan aparte.

### 7b — `agregarEPDs(outputs)`
Roll-up multi-EPD para la lectura ejecutiva acumulada (§13). **El engine
Python no tiene agregación** — `agregarEPDs` es de este motor, sin
contraste con el oráculo (como `escenarioIntensificacion`).

- **§13**: `Impacto acumulado analítico = CFF_realizado +
  IFD_económico_futuro`. La parte `CFF` no es de este motor; `agregarEPDs`
  produce solo `IFD_económico_futuro` y lo etiqueta como tal
  (`componente: 'IFD_economico_futuro'`) — §13: "conservar ambos
  componentes separados".
- Solo se suman EPD `CUANTIFICADO` con `economic_base` numérico. Los demás
  (`S0`, `S1`, `CUANTIFICADO` con puerta económica cerrada) van en
  `cualitativos: [...]`, sin cifra (decisión C). Sin ningún EPD sumable →
  `economic_total: null` (§26: no `0`).
- **§25 / §28** ("check double counting *before* aggregation"):
  `detectarDobleConteo` sobre la **unión** de las claves de todos los EPD
  a sumar. Solapamiento material → `A14` + `aggregation_blocked: true` →
  los totales van en `null` (§35: "impedir suma automática"). `por_epd`
  **siempre** lista los componentes, para que un humano decida con la
  información a la vista.
- **§29 #15 / §32** ("IMPACTOS HETEROGÉNEOS NO SE SUMAN ARBITRARIAMENTE"):
  `impact_type` distinto entre los EPD a sumar → `A17` +
  `aggregation_blocked`. **Decisión de diseño de Luis, no lectura
  cerrada**: §32 dice "no se suman arbitrariamente" pero no define
  "homogéneo" con la fuerza con que §25 definió "material" (ahí había
  frase de refuerzo — "un mismo costo no puede aparecer incorporado dentro
  de otra consecuencia"). Se toma "mismo `impact_type`" como criterio;
  anotado con la misma honestidad que "dirección adversa" (§21.2) y
  `unit` (§23.1).
- Cada `EPD_OUTPUT` de entrada se valida con `validarEPDOutput`; uno mal
  formado → `{ ok: false, errors }`.

### `double_count_ids` en `EPD_OUTPUT` (reapertura #6, `86ff75b` + fix `22e0e83`)
§31 lista "identificadores de doble conteo" en la estructura mínima —
mezcla de campos de entrada y salida (§31 lista `Q/C/T/R` junto a
`economic_base`, `nivel de salida`, `valor observado y error`). El campo
se agregó a `ESQUEMA_EPD_OUTPUT` (`86ff75b`) y `runEPD` lo copia de
`EPD_INPUT` (`22e0e83`, commit de fix aparte para que `git bisect`
distinga "cambio de contrato" de "conexión en el orquestador").

### Baterías (7b)
- `runIFD.test.js` → **85 asserts, 0 fallos** (7a 60 + 7b 25) + **8
  mutaciones** (1-4 de 7a; 5-8 de 7b, sobre copias reales, revertidas):
  **(5)** `detectarDobleConteo([])` en vez de la unión → dos EPD que
  solapan se suman igual (sin `A14`, `aggregation_blocked` queda `false`).
  **3 rojos**.
  **(6)** `tiposDistintos.length > 1` → `> 0` → un lote con un solo
  `impact_type` se marca `A17` y se bloquea (falso positivo). **7 rojos**
  (`agg`: total + lower + upper + "homogéneos no bloqueado"; "distinto
  período no bloqueado"; y los 2 casos con un EPD terminal en
  `cualitativos` cuyo total esperado 135.000 pasa a `null`).
  **(7)** quitar `!aggregation_blocked` de la definición de `puedeSumar` →
  los roll-ups bloqueados por §25/§29#15 emiten total igual (§35 violado).
  **2 rojos** (`aggDC`, `het`; el caso "sin EPD cuantificado" lo protege
  la otra guarda `cuantificados.length > 0`).
  **(8)** quitar `&& typeof o.economic_base === 'number'` del filtro → un
  EPD `CUANTIFICADO` con puerta económica cerrada (`NE`) cuenta como
  cuantificado. **2 rojos** (`n_cuantificados`, `NE`-en-`cualitativos`).
  **No** da `NaN`: en JS `null + número = número` (el `null` se coacciona
  a `0`), así que `economic_total` no cambia — coincidencia aritmética, no
  protección real. La protección real es el filtro.

### 7c — cobertura de §35 (17 pruebas) y §32 (15 reglas)

Dos baterías que ejercitan el motor **completo** contra las listas
normativas del documento.

- `pruebas_minimas.test.js` → **17 asserts, 0 fallos** — las **17**
  pruebas mínimas de §35, cada una end-to-end por `runEPD` /
  `agregarEPDs` (el "18" que decían el README y la memoria era un error
  arrastrado desde Fase 1; el texto de §35 tiene 17 viñetas). La mayoría
  ya tenían cobertura en las baterías de fase; aquí se confirman a través
  del orquestador, que es lo que §35 pide. **Mutación**:
  `alerts.concat(eco.alerts)` → `alerts.concat([])` → §35.9 falla por su
  nombre (UNRESOLVED conserva la cifra pero pierde `A10`).
- `reglas_inviolables.test.js` → **18 asserts, 0 fallos** — las **15**
  reglas de §32 (patrón de `invariantes_arquitectonicos.test.js` de CFF).
  Cada una: **aserción concreta** vía `runEPD`/`agregarEPDs`
  (`ASERCION` — 12), **aserción parcial** (`ASERCION_PARCIAL` — §32.9
  CORRELACIÓN≠CAUSALIDAD y §32.10 RESULTADO HISTÓRICO≠FUTURO: la parte que
  el motor sí puede hacer cumplir se testea, el resto es interpretación
  fuera del motor), o **`FRAMING`** — solo **§32.12** (RELEVANCIA
  ESTRATÉGICA ≠ VENTAJA COMPETITIVA): no hay salida de score/ventaja en
  `EPD_OUTPUT`, `impact_type=IEP` es un rótulo descriptivo que §4 limita
  explícitamente; no hay mecanismo que pudiera violar la regla, es una
  restricción sobre la lectura del reporte. La justificación de cada
  `FRAMING` se valida que sea **específica** (menciona `EPD_INPUT/OUTPUT`
  o un campo o un §, no un genérico "es conceptual" — decisión E).
  **Mutación**: `consolidarEPDOutput` `projection_base` terminal → `0` en
  vez de `null` → §32.13 (NULL ≠ CERO) falla por su nombre.

Con 7c, **Fase 7 queda cerrada**. Solo resta Fase 8 (calibración §36).

## Huecos conocidos

Ninguno abierto. (Hueco #1 —campo de unidad física §23.1— cerrado en
`164f72a`; hueco #2 —forma de `heritage_outputs`— cerrado en Fase 6.)

## Qué NO hace este módulo

- No implementa fórmula para `CFD/CFR/VER/ROI_P/TRE` (§24 — `PENDIENTE_AUDITORIA`).
- No asume `CFR === VER`.
- No usa `CFF` como variable de ninguna fórmula (`CFF × H ≠ IFD`, §9).
- No se conecta a `motor-cff` — arnés aparte, después.
- No hace merge a `main` sin aprobación.
