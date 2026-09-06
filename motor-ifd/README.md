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
2. **`evolution_type`.** §16 nombra 5 dinámicas sin código → `EV-A / EV-M /
   EV-ACUM / EV-LIM / EV-CUAL`. El engine usa coincidencia **parcial** de
   substring (`"EV-M" in x.evolution_type`) — frágil: `"EV-MX"` haría match.
   Este motor valida por **igualdad estricta** (verificado: `"EV-MX"` y
   `"EV-MAL"` → rechazados).
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

## Qué NO hace este módulo

- No implementa fórmula para `CFD/CFR/VER/ROI_P/TRE` (§24 — `PENDIENTE_AUDITORIA`).
- No asume `CFR === VER`.
- No usa `CFF` como variable de ninguna fórmula (`CFF × H ≠ IFD`, §9).
- No se conecta a `motor-cff` — arnés aparte, después.
- No hace merge a `main` sin aprobación.
