# Motor de cálculo — IAO (Índice de Activación Organizacional)

Módulo **aislado**, mismo criterio que [`../motor-ice-ieh/`](../motor-ice-ieh/) y
[`../motor-sdmo/`](../motor-sdmo/). No recalcula nada de ICE–IEH. No implementa el
AIE. No se integra a producción hasta aprobación explícita.

- **Fuente de verdad:** [`../docs/DOCUMENTO_TECNICO_SDMO_IAO_v1.md`](../docs/DOCUMENTO_TECNICO_SDMO_IAO_v1.md),
  **sección 3 en adelante** (la sección 2 es SDMO — otro módulo).
- **Contrato de entrada:** las **10 variables ya calculadas** de ICE–IEH, en
  escala 0–100 — lado Sistema `EST, INE, IMP, NEX, ITG`, lado Experiencia
  `FOR, COH, EQU, CNF, ACT`. El módulo **no** recibe las 31 respuestas crudas.

## Archivos

| Archivo | Qué es |
|---|---|
| `motor-iao.js` | Motor puro (sin DOM). UMD: `require()` en Node / `window.MotorIAO` en browser. |
| `motor-iao.test.js` | Batería de verificación. `node motor-iao/motor-iao.test.js` |

## Por qué no importa `motor-ice-ieh`

El contrato de entrada del IAO son 10 números en escala 0–100, no las 31
respuestas. Las pruebas usan valores sintéticos de esas 10 variables — igual que
`motor-sdmo` nunca importó `motor-ice-ieh` para probarse. Que la salida real de
`motor-ice-ieh` encaje con la entrada que espera `motor-iao` es una cuestión de
**integración**, y pertenece al arnés (paso 3, con los cuatro módulos ya
construidos), no a la verificación aislada del IAO. Acoplar las ramas de git
ahora complicaría el orden de merge sin necesidad real.

## Reglas implementadas

### Transformación a déficit (§3.4)

```
D_X = 1 − X/100        para cada una de las 10 variables
```

### IAO (§3.5)

```
D_S  = (D_EST + D_INE + D_IMP + D_NEX + D_ITG) / 5           (Sistema: uniforme)
D_E  = .25·D_FOR + .18·D_COH + .25·D_EQU + .20·D_CNF + .12·D_ACT   (Experiencia: ponderado)
IAO  = 100 × [.30·D_S + .70·D_E]
```

`calcularIAO(variables)` **recibe solo las 10 variables** — no hay ningún
parámetro de brecha. Devuelve el IAO ∈ [0, 100]. Mayor IAO = configuración más
compatible con activación defensiva (**no** un % de Amenaza).

### Perfil por par (§3.6)

```
A_j = 100 × [wSistema_j · D_S_var + wExperiencia_j · D_E_var]

IAO = Σ pesoPar_j · A_j          (pesoPar = .235 / .186 / .235 / .200 / .144)
```

Los pesos internos por par (`wSistema_j`, `wExperiencia_j`) se **derivan en
tiempo de ejecución** de los coeficientes globales exactos del §3.5
(`coefSistema = .30/5 = .06`, `coefExperiencia = .70·peso_exp`), **no** de los
literales redondeados a 3 decimales que imprime el §3.6 (`.255`, `.323`…):

| Par | wSistema exacto | wExperiencia exacto |
|---|---|---|
| EF, IE | `12/47 ≈ 0.255319` | `35/47 ≈ 0.744681` |
| IC | `10/31 ≈ 0.322581` | `21/31 ≈ 0.677419` |
| NC | `0.3` (cierra exacto) | `0.7` |
| IA | `5/12 ≈ 0.416667` | `7/12 ≈ 0.583333` |

Todo se deriva de la constante `PESOS`. Reensamblar el IAO como `Σ pesoPar_j·A_j`
coincide con el cálculo directo **al margen de punto flotante** (Caso 4), no
dentro de un margen de diseño.

**Ejemplo del §3.7:** `EST=90, FOR=30` → `A_EF = 100·[(12/47)·.10 + (35/47)·.70]
= 2570/47 ≈ 54.68` (con los pesos redondeados a 3 decimales del §3.6 daría
54.70 — el documento fuente ya usa las fracciones exactas, no ese redondeo).

### Brechas (§3.7) — diagnóstico, FUERA del cálculo del IAO

```
B_j = S_j − E_j        (escala 0–100)
B_j > 0 → la valoración del Sistema supera a la Experiencia
B_j < 0 → la Experiencia supera a la valoración del Sistema
```

`calcularBrechas(variables)` las expone. **Ninguna función que produzca el IAO
recibe una brecha** (verificado por firma y por construcción — Caso 6). Se
evaluó y **descartó** una formulación no lineal (`G_j⁺`) que amplificaba el IAO
según la dirección de la brecha: producía una **paradoja de monotonicidad**
(mejorar el Sistema aumentaba la activación inferida). El módulo **no** la
implementa; el Caso 5 la reproduce con la fórmula descartada y confirma que la
implementada no la tiene.

### Agregación colectiva (§3.9) + confidencialidad (§3.11)

- **`agregarNodo(iaosIndividuales, opts)`** — `IAO_g = Σ IAO_i / n_g` (promedio
  simple). Sólo el nivel; se usa cuando ya tienes los IAO por Persona.
- **`agregarOrganizacion(nodos, opts)`** — recibe los **datos por Persona**
  (`personas`: las 10 variables de cada una) y produce **nivel + perfil +
  brechas + precisión** organizacionales:

```
IAO_ORG   = Σ (n_g · IAO_g) / Σ n_g                     (§3.9)
perfilOrg — por par: media del pool + dispersionPool + dispersionEntreNodos
             + dispersionEntreNodosAjustada.
brechasOrg — §3.9 PROHÍBE promediar brechas ("(+40)+(−40)→0 no es alineación
             sino polarización"). Por par: `porNodo` (valor de cada nodo),
             `mediaPool` (contextualizada, nunca sola), y DOS dispersiones +
             DOS rangos, porque no viven en la misma escala:
               · dispersionEntreNodos (cruda) — std de las medias de nodo
                 reportables;
               · dispersionEntreNodosAjustada — la cruda menos el piso de ruido
                 de muestreo `mean_g(s²_g/n_g)` (descomposición de varianza);
                 es la señal de fractura estructural depurada;
               · dispersionPool — std de todos los individuos (within + between).
             Cada dispersión-entre-nodos con su umbral (`umbralPolarizacionEntreNodos`,
             PENDIENTE_VALIDACION), el pool con el suyo (`umbralPolarizacionPool`).
             `polarizacion.entreNodos` se evalúa contra la **ajustada**; la cruda
             queda visible por transparencia. Veredicto `polarizacion.{entreNodos,
             pool}` (bool|null).
organizacion.precision — clasificación §3.9 (ver "PRECISIÓN" abajo). Sólo si
             los 6 umbrales de precisión están en opts; si no, `null`.
```

Validado por simulación Monte Carlo — ver
[`../HALLAZGOS_MOTOR_IAO.md`](../HALLAZGOS_MOTOR_IAO.md) y `motor-iao/sim/`.
`dispersionEntreNodos` cruda aísla la polarización real **11.73×** mejor que
`dispersionPool` frente al ruido interno (ventaja señal-ruido 16.42×), pero tiene
un piso ≈ `ruido / √(tamaño_de_nodo)`; `dispersionEntreNodosAjustada` cierra ese
piso (`coef ruido` −0.008 ≈ 0) y es contra ella que se evalúa el veredicto.

`n_g` = **respondientes** del nodo (no convocados) — ponderar por convocados
sería imputación encubierta (§3.10), misma decisión que `motor-sdmo`.

Anonimización idéntica a `motor-sdmo/agregarOrganizacion`: pools planos anónimos
(sin `nodo_origen`) que **no se devuelven**; `perfilPorNodo` en paralelo con
`id` (nodo `n < minReportableN` → sin estadísticas, sólo `nAportadoAlPool`);
`opts.excluirNodos:[id,…]` para exclusión posterior sin cirugía sobre el pool.

> El contrato de `agregarOrganizacion` difiere del de `motor-sdmo` (allí se
> pasaban IDAs pre-calculados porque el IDA depende de `δ`, pendiente). El IAO
> se deriva por completo de las 10 variables, así que aquí se pasan los datos
> por Persona y el módulo calcula IAO / perfil / brechas de cada una.

## Parámetros

| | Estado |
|---|---|
| Pesos §3.5 (.30/.70, ponderación experiencial) | **Pre-piloto** — "Cerrado — pre-piloto" (§6.1). Valores vigentes y usables; recalibración con datos propios pendiente (§6.2). Viven en la constante `PESOS`; **todo lo demás se deriva de ahí** (coeficientes globales, pesos por par). |
| `minReportableN` (§3.11, "N ≥ 8–10") | `PENDIENTE_VALIDACION` — sin valor; `agregarNodo` / `agregarOrganizacion` lo **exigen** en `opts` (lanzan si falta — reportar un nodo pequeño sin él sería una brecha de confidencialidad). |
| `umbralPolarizacionEntreNodos`, `umbralPolarizacionPool` (§3.9) | `PENDIENTE_VALIDACION` — sin valor. `agregarOrganizacion` **siempre** reporta las dispersiones crudas; sólo los veredictos `polarizacion.{entreNodos,pool}` quedan en `null` hasta fijarlos. Escalas distintas ⇒ umbrales separados. |
| 6 umbrales de `PRECISIÓN` (§3.9 / §6.2): `precisionNMinCatastrofico`, `precisionNAlto`, `precisionTasaMinCatastrofica`, `precisionTasaAlta`, `precisionCorteDispersionMedia`, `precisionCorteDispersionAlta` | `PENDIENTE_VALIDACION`. `clasificarPrecision` los exige. Valores de prueba de la simulación: `5 / 30 / 0.3 / 0.7 / 12 / 25` (los 4 primeros dados por Luis; los dos cortes de dispersión son placeholders). |
| Umbrales Seguridad / Alerta / Amenaza (§3.1) | Sin valor (§6.2). **No implementado.** |
| Fórmula de precisión graduada (§3.9) | Sin valor (§6.2). **No implementada.** Los cortes de dispersión baja/media/alta **sí** entran en la compuerta de PRECISIÓN (`precisionCorteDispersionMedia` / `...Alta`); la dispersión descriptiva —std, IQR, min, max— se calcula en IAO y en cada par del perfil/brecha. |

## Verificación

`node motor-iao/motor-iao.test.js` → **146 asserts OK, 0 fallos**. `node --check`
limpio en ambos `.js`.

| Caso | Qué prueba |
|---|---|
| 1 | Neutro (10 vars = 50) → `D_S = D_E = 0.5`, IAO = 50, 5 perfiles = 50, 5 brechas = 0. |
| 2 | Perfil a mano con **pesos exactos**: `EST=90, FOR=30` → `A_EF = 2570/47 ≈ 54.68` (no 54.7 — el módulo **no** usa los literales redondeados del §3.6); caso inverso `EST=30, FOR=90` → `1190/47 ≈ 25.32`. |
| 3 | Los 5 pares con sus pesos internos **exactos** (12/47, 10/31, .3, 5/12 …); mapeo par→variables. |
| 4 | `calcularIAO` = fórmula expandida del §3.5 (exacto); IAO reensamblado desde los 5 perfiles = IAO directo **con coincidencia exacta** (Δ < 1e-9, ya no un margen de diseño); `calcular().iao = calcularIAO()`. |
| 5 | **[no negociable]** La paradoja de `G_j⁺`: reproducida con la fórmula descartada (`A: .72 → .80` al mejorar el Sistema), y **ausente** en la implementada (`IAO: 51 → 45`; `A_EF: 2460/47 → 2220/47`); barrido Sistema 50→100 con Experiencia constante → IAO nunca aumenta; barrido inverso → nunca baja. |
| 6 | Brechas fuera del IAO: `calcularIAO.length === 1` (sin parámetro de brecha); un 2º argumento se ignora; dos entradas con brechas **opuestas** (`B_EF = +30` vs `−30`) dan **el mismo IAO** (50). |
| 7 | `IAO_g` = promedio simple; `IAO_ORG = Σ(n_g·IAO_g)/Σn_g = 1780/34 ≈ 52.35` ≠ promedio simple de medias de nodo (55) ≠ solo reportables (47.5) = promedio del pool; nodo sub-umbral aporta al pool sin reporte propio; `excluirNodos:["B"]` → `IAO_ORG = 50`; el pool nunca se devuelve. |
| 8 | 10 variables en orden canónico, sin choque con SDMO; `PESOS` suman 1; pesos por par **derivados exactos** (`wSistema_EF = 12/47`, **≠ 0.255**); `pesoPar_j = .06 + .70·peso_exp_j` exacto; `deficit(0/50/100/66.67)`; validación; array ≡ objeto; IAO ∈ [0, 100]. |
| 9 | **Perfil y brechas org (§3.9).** Dos nodos con `B_EF` opuestas (+80 / −80): `IAO_ORG = 50` (aparenta neutralidad) pero `brechasOrg.B_EF` → `mediaPool ≈ 0`, `dispersionEntreNodos = dispersionPool = 80`, `rangoEntreNodos / rangoPool [−80,+80]`, `porNodo [P=+80, Q=−80]`. Sin umbrales → `polarizacion.{entreNodos,pool}: null`; con umbrales 20/25 (prueba) → ambos `true` para `B_EF`, ambos `false` para `B_IC`. `perfilPorNodo` reportable expone sus 5 `A_j` y 5 `B_j`. Caso ruidoso de 3 nodos: `dispersionEntreNodosAjustada < dispersionEntreNodos` cruda (el ajuste resta el piso de muestreo) y el veredicto usa la ajustada. |
| 10 | **PRECISIÓN — compuerta (§3.9).** Todo bueno → `ALTA`; cada factor catastrófico (con los otros 4 en zona ALTA) → `BAJA` (nunca ALTA por mayoría); `UNKNOWN` y diseño ausente → `BAJA`; banda `MEDIA` intermedia en N / tasa / **dispersión** (corte "media": disp=18→`MEDIA` no `BAJA`, disp=12→`MEDIA`, disp=11.9→`ALTA`); `representatividad = PENDIENTE_FORMALIZACION`; `clasificarPrecision` exige los 6 umbrales (falta `precisionCorteDispersionMedia` → error); integrado en `agregarOrganizacion.organizacion.precision`. |

## Decisiones cerradas (revisión de Luis, 2026-09-03)

### D1. Pesos por par — **exactos, derivados en tiempo de ejecución**

El §3.6 imprime `.255 / .745`, `.323 / .677`… — coeficientes globales
normalizados dentro del par, **redondeados a 3 decimales**. El módulo **no** usa
esos literales: deriva `wSistema_j = coefSistema / pesoPar_j` y
`wExperiencia_j = coefExperiencia_j / pesoPar_j` de los coeficientes globales
exactos del §3.5 (`.06`, `.70·peso_exp`). Así el reensamblado
`Σ pesoPar_j·A_j` = IAO directo **al margen de punto flotante** (Caso 4), no
dentro de un margen de diseño.

- Valores de referencia: EF/IE `12/47 · 35/47`; IC `10/31 · 21/31`; NC `.3 · .7`;
  IA `5/12 · 7/12`.
- **Ejemplo del §3.7:** `EST=90, FOR=30` → `A_EF = 2570/47 ≈ 54.68` (no `54.70`).
  El documento fuente (`docs/DOCUMENTO_TECNICO_SDMO_IAO_v1.md`, §3.6) ya usa las
  fracciones exactas — no hubo ningún literal `54.7` que corregir; §3.6 defiere
  explícitamente a este motor como autoridad de implementación.

### D2. "Pre-piloto" ≠ "sin valor"

A diferencia de la `δ` del SDMO (que **no tiene** valor), los pesos del §3.5
**sí están dados** y el §6.1 marca la fórmula "Cerrado — pre-piloto". Se usan
como se dan, en `PESOS` (editable); **todo lo demás se deriva de ahí**. Sólo lo
que el documento deja realmente **sin valor** —umbrales Seguridad/Alerta/Amenaza,
cortes de dispersión, precisión, `minReportableN`, `umbralPolarizacion`— queda
`PENDIENTE_VALIDACION`.

### D4. PRECISIÓN (§3.9) — **implementada como regla de compuerta**

`clasificarPrecision({n, convocados, disenoMuestral, dispersionPoolIao}, opts)` →
`ALTA | MEDIA | BAJA`. **Compuerta, no mayoría** (verificado exhaustivo):

```
nivelDisp =  'alta'  si  dispersionPoolIao ≥ corte_dispersion_alta
             'media' si  corte_dispersion_media ≤ dispersionPoolIao < corte_dispersion_alta
             'baja'  si  dispersionPoolIao < corte_dispersion_media

BAJA  si  N < N_min_catastrofico  ∨  tasa_respuesta < tasa_min_catastrofica
      ∨  disenoMuestral ∈ {CONVENIENCIA, UNKNOWN}       (UNKNOWN = catastrófico:
      ∨  nivelDisp == 'alta'                             no se asume lo favorable)
ALTA  si  N ≥ N_alto  ∧  tasa_respuesta ≥ tasa_alta
      ∧  disenoMuestral ∈ {CENSO, ALEATORIO}  ∧  nivelDisp == 'baja'
MEDIA en cualquier otro caso   (incluye nivelDisp == 'media' → tope MEDIA, no BAJA)
```

- Nuevos inputs: `nodo.convocados` (los `respondientes` son las `personas`);
  `opts.disenoMuestral` (`CENSO | ALEATORIO | CONVENIENCIA | UNKNOWN`).
- Usa `dispersionPool` (del IAO), no `dispersionEntreNodos`: PRECISIÓN mide
  confianza en el nivel; cualquier varianza individual alta la reduce.
- El eje dispersión tiene **dos cortes** (media + alta) → banda `MEDIA` propia,
  igual que N y tasa. El eje `diseño_muestral` se mantiene binario (acantilado)
  por decisión: conveniencia / desconocido es catastrófico, no gradual.
- Los 6 umbrales son `PENDIENTE_VALIDACION`; `clasificarPrecision` los exige.
- **`representatividad` (§3.9) queda FUERA de la compuerta** —
  `PENDIENTE_FORMALIZACION`: requiere una estructura poblacional de referencia
  que el sistema aún no modela. No falta el número, falta el concepto de dato.
- **PRECISIÓN acompaña al IAO; no lo modifica** (§3.9).

Validación por simulación (`HALLAZGOS_MOTOR_IAO.md`): la regla no degenera, es
una compuerta verdadera (24/24 en el barrido exhaustivo). Una observación abierta
(operación, no código) — su output está dominado por la compuerta de
`diseño_muestral` (`UNKNOWN` → `BAJA` casi siempre); en producción el diseño
muestral debe capturarse de forma confiable. El acantilado `ALTA ↔ BAJA` del eje
dispersión quedó **corregido** con el corte "media" (§3.9).

### D3. Agregación organizacional del PERFIL y las BRECHAS — **implementada**

`agregarOrganizacion` produce, además del nivel:

- **`perfilOrg`** — por par: `media` del pool + `dispersionPool`,
  `dispersionEntreNodos` (cruda) y `dispersionEntreNodosAjustada`.
- **`brechasOrg`** — §3.9 **prohíbe promediar brechas** (*"(+40)+(−40)→0 no es
  alineación sino polarización"*). Por par: `porNodo`, `mediaPool`
  (contextualizada, nunca sola), `dispersionEntreNodos` (cruda),
  `dispersionEntreNodosAjustada` (cruda menos el piso de ruido de muestreo,
  descomposición de varianza — **el veredicto se evalúa contra esta**) y
  `dispersionPool` (within + between), `rangoEntreNodos` / `rangoPool`, y
  `polarizacion.{entreNodos, pool}` (bool|null — `entreNodos` contra la ajustada
  y `umbralPolarizacionEntreNodos`, `pool` contra `umbralPolarizacionPool`, ambos
  `PENDIENTE_VALIDACION`). Validado por simulación — ver
  [`../HALLAZGOS_MOTOR_IAO.md`](../HALLAZGOS_MOTOR_IAO.md).
- **`perfilPorNodo`** — cada nodo reportable expone sus 5 `A_j` y sus 5 `B_j`.

**Lo pendiente de piloto son sólo números** (`umbralPolarizacionEntreNodos`,
`umbralPolarizacionPool`, y los 6 de `PRECISIÓN`). La arquitectura —incluida la
regla de compuerta de PRECISIÓN (D4) con sus dos cortes de dispersión y la
`dispersionEntreNodosAjustada`— está completa.

Con esto el módulo **no tiene ningún hueco que dependa de terceros**: todo lo que
falta (`δ` del SDMO, umbrales Seguridad/Alerta/Amenaza, `umbralPolarizacion`) es
una constante explícita editable, no funcionalidad ausente.

## Ambigüedad menor todavía abierta

### Las brechas del IAO son numéricamente idénticas a las de ICE–IEH

`B_j = S_j − E_j` sobre los mismos 5 pares que `motor-ice-ieh` ya calcula
(§8.6 allí = §3.7 aquí). `calcularBrechas` las recomputa (es una resta), lo que
mantiene el módulo autocontenido. **Alternativa:** que el IAO consuma las brechas
que `motor-ice-ieh` ya produjo. Dado que es `S − E`, la recomputación no tiene
coste ni riesgo de divergencia; lo dejo señalado por si prefieres una única
fuente (probablemente una decisión del arnés, paso 3).

## Qué NO hace este módulo

- No recalcula ICE–IEH; recibe las 10 variables ya calculadas.
- No importa `motor-ice-ieh` (ni ningún otro módulo).
- No implementa `G_j⁺` ni ninguna variante que amplifique el IAO según la
  dirección de la brecha (§3.7, descartado con evidencia).
- No implementa el AIE.
- No fija umbrales Seguridad/Alerta/Amenaza, cortes de dispersión, ni los
  umbrales de polarización / precisión (§6.2 / §3.9, sin valores) — pero sí
  implementa toda la arquitectura que los rodea, incluida la clasificación de
  PRECISIÓN (`clasificarPrecision`, regla de compuerta) que espera esos umbrales.
- No formaliza `representatividad` (§3.9) — `PENDIENTE_FORMALIZACION`, falta el
  concepto de dato poblacional de referencia.
- No toca `workbook.html` ni ningún código de producción.
