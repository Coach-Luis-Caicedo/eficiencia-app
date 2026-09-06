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
| **7** | Orquestador `runIFD()` §27-28 + catálogo de alertas §29 + reglas inviolables §32 + 18 pruebas mínimas §35. |
| **8** | Calibración §36 (`Error`, `EA`, `MAE`, `Sesgo`, cobertura de rango) — módulo aparte, retrospectivo. |

## Reaperturas de código ya comiteado

Misma disciplina de trazabilidad que en CFF: cuando una fase posterior
corrige algo ya comiteado, se documenta aquí en vez de rastrear mensajes de
commit sueltos.

| Qué se reabrió | Desde | Por qué | Commit |
|---|---|---|---|
| `enums.js` — `EVOLUTION_TYPE` de 5 a 4 valores (quitar `EV-LIM`) | Fase 0 (`fbd78ea`) | relectura de §16 ("una variable puede combinar propiedades") + verificación contra §16/§20/§21/§28: `EV-LIM` nunca cambia ningún comportamiento (el clamp §15 acota cualquier proyección). Decisión (b). | *este commit* |

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
   `PENDIENTE_CALIBRACION`.
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
(A08/A11) + `PARAMS` (los 3 calibrables con su estado).

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
`node motor-ifd/contratos.test.js` → **55 asserts OK, 0 fallos** + 1 mutación
(aceptar un número 0-1 como "categoría" → los asserts de `0.70` rechazado, y el
de `EPD_INPUT`, fallan juntos).

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

## Qué NO hace este módulo

- No implementa fórmula para `CFD/CFR/VER/ROI_P/TRE` (§24 — `PENDIENTE_AUDITORIA`).
- No asume `CFR === VER`.
- No usa `CFF` como variable de ninguna fórmula (`CFF × H ≠ IFD`, §9).
- No se conecta a `motor-cff` — arnés aparte, después.
- No hace merge a `main` sin aprobación.
