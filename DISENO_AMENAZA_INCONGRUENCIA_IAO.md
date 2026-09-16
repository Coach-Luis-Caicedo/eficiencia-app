# Diseño — `Amenaza_incongruencia_par` en `motor-iao.js`

**ESTADO: CERRADO — NO SE IMPLEMENTA.** Decisión de Luis, con evidencia
doblemente confirmada (§0.4). Este documento queda como registro de la
investigación y de por qué se cerró, no como diseño pendiente de construir.

---

## 0.4 Cierre — dos razones independientes, ambas confirmadas contra el original

**No se porta `Amenaza_incongruencia_par` a `motor-iao.js`.** Dos razones
independientes, cada una suficiente por sí sola:

**1. El documento técnico oficial la descarta explícitamente — verificado
contra el `.docx` real**, no solo citado de memoria:
`EFICIENCIA_Documento_Tecnico_ICE-IEH.docx`, Anexo A.2 ("Arquitectura
bipolar descartada"):

> "La arquitectura anterior contemplaba cinco preguntas bipolares, una por
> par... y una fórmula de combinación con la brecha derivada: Brecha_final
> = α·(Brecha_calculada) + (1−α)·(Bipolar)... El cuestionario final de 31
> preguntas ya no posee cinco bipolares equivalentes: solo P7 conserva una
> estructura de correspondencia comparable, y no de forma matemáticamente
> idéntica a la antigua arquitectura. Por tanto, **esta fórmula de
> combinación no forma parte del instrumento vigente**. La idea que
> sobrevive es el principio de contrastar brecha derivada e indicador
> directo cuando exista, **sin combinarlos automáticamente**."

Esto confirma exactamente el hallazgo §0.3 de abajo (solo P7/Par 1 tiene
algo comparable) — no era una sospecha, es lo que el propio documento
técnico ya había resuelto y dejado en su Anexo de decisiones descartadas.

**2. `013_umbral_piso_anclado.sql` pertenece al sistema anterior**
(confirmado por Luis) — no se traslada al sistema nuevo bajo ninguna
circunstancia, independientemente de lo que dijera el documento técnico.

**Los hallazgos §0.2 (paradoja de monotonicidad) y §0.3 (ítem bipolar
faltante) quedan documentados abajo como LA RAZÓN por la que esto se
descarta — no como preguntas abiertas.** No hacía falta resolver si la
paradoja de monotonicidad era aceptable o no: la fórmula que la producía
ya estaba descartada por el propio instrumento, con fundamento propio,
antes de que este encargo empezara.

**`w_pos=1` fijo sigue siendo la decisión correcta el día que exista una
fórmula real de esta familia** aplicable al instrumento de 31 preguntas
(si el piloto o una futura revisión del documento técnico la especifican)
— esa parte de la decisión de Luis no cambia, solo queda pospuesta
indefinidamente, sin fórmula vigente que la necesite hoy.

**Impacto en la batería — confirmado sin cambio**: cero código nuevo en
`motor-iao.js`. Los 153 asserts existentes quedan exactamente como están.

---

## 0. Antes de las 4 respuestas — dos hallazgos que cambian la forma del encargo

No son parte de las 4 preguntas que pediste, pero investigarlas con el
mismo rigor las hizo aparecer, y son bloqueantes para proponer un diseño
honesto. Los traigo primero porque determinan si "construir
`Amenaza_incongruencia_par` tal como está en `DOCUMENTO_MARCO` §4" es
siquiera correcto hacerlo, no solo cómo hacerlo.

### 0.1 La fórmula completa YA EXISTE — en SQL, en producción legacy, no en `motor-iao.js`

`supabase/migrations/013_umbral_piso_anclado.sql` (`resumen_organizacion_completo`,
`SECURITY DEFINER`, función real del schema `public`) **ya implementa
`Amenaza_incongruencia_par`, `Amenaza_absoluta_par`, `Amenaza_par`,
`Incongruencia_i` e `IAO_i` completos**, con los parámetros ya fijados:

```sql
v_gamma_iao := 0.5;  v_w_neg := 0.5;  v_w_pos := 1.0;  v_umbral_piso := 0.575;

term_incongruencia_i = GREATEST(brecha_final_i,0)*v_w_pos + GREATEST(-brecha_final_i,0)*v_w_neg
term_piso_i          = GREATEST(0, v_umbral_piso - concepto_b)
amenaza_par_i         = GREATEST(term_incongruencia_i, term_piso_i)

iao_i = 100 * (γ·prom(amenaza_par_i) + (1-γ)·segundo_mayor(amenaza_par_i))   -- por Persona, sobre 5 pares
```

Esto **no es un diseño nuevo que hay que inventar** — es un **port** de una
fórmula que Luis ya construyó y aplicó en otra parte del sistema (legacy,
`public.respuestas_cuestionario_pares`), hacia el módulo aislado nuevo
(`motor-iao.js`). Cambia el encargo: la pregunta no es "¿qué fórmula
diseñamos?", es "¿esta fórmula que ya existe es correcta para portar tal
cual?" — y la respuesta, investigada, es **no, todavía no**, por dos
razones concretas.

### 0.2 Hallazgo bloqueante — `Amenaza_incongruencia_par` reproduce, con números reales, el mismo patrón de la paradoja `G_j⁺` que `motor-iao.js` ya rechazó explícitamente

`motor-iao.js` tiene un invariante **"NO NEGOCIABLE"** (su propio texto,
`motor-iao.test.js:138`, Caso 5): mejorar el Sistema (ICE) con la
Experiencia (IEH) constante **nunca** puede subir la activación/amenaza
inferida. Se verificó con la fórmula descartada `G_j⁺` (`(1-E) +
max(S-E,0)*E`) dando `.72→.80` al pasar S de .70 a .90 con E=.40 fijo —
confirmado como el comportamiento a evitar — y con la fórmula implementada
dando `51→45` (correctamente monótona, IAO baja al mejorar el Sistema).

**Corrí el mismo barrido, con los parámetros reales de la fórmula de
`013_umbral_piso_anclado.sql` (`w_pos=1.0`, `w_neg=0.5`,
`umbral_piso=0.575`), sobre `Amenaza_incongruencia_par`/`Amenaza_par`**:

```
concepto_a=.70, concepto_b=.40 (fijo):
  brecha_final       = .70 − .40 = .30
  term_incongruencia = max(.30,0)×1.0 + max(-.30,0)×0.5 = .30
  term_piso          = max(0, .575−.40) = .175
  amenaza_par         = max(.30, .175) = .30

concepto_a=.90, concepto_b=.40 (mismo fijo):
  brecha_final       = .90 − .40 = .50
  term_incongruencia = max(.50,0)×1.0 = .50
  term_piso          = .175  (sin cambio — no depende de concepto_a)
  amenaza_par         = max(.50, .175) = .50

.50 > .30 → amenaza_par SUBE cuando el Sistema mejora (.70→.90) y la
Experiencia se queda igual — el mismo patrón cualitativo que `.72→.80` de
`G_j⁺`, la fórmula ya rechazada.
```

Si este par entra en el `promedio`/`segundo_mayor` de los 5 que arman
`IAO_i`, y su `amenaza_par` sube, `IAO_i` puede subir con él — violando
directamente el invariante "NO NEGOCIABLE" que `motor-iao.js` ya tiene
verificado (Caso 5) para su fórmula actual.

**No estoy diciendo que la fórmula esté mal por definición** — hay una
lectura legítima donde esto es correcto: si `Amenaza_incongruencia_par`
mide específicamente *incongruencia* (la distancia entre lo que el sistema
declara y lo que se vive), es coherente que esa distancia crezca cuando el
Sistema mejora y la Experiencia no lo acompaña — eso **es**, por
definición, más incongruencia. El problema es que esa incongruencia
alimenta directamente `Amenaza_par` → `IAO_i`, el **índice general de
activación**, que es exactamente el nivel al que `G_j⁺` fue rechazado por
la misma razón. **Esto es una tensión real de diseño, no un bug de
cálculo, y no la resuelvo yo aquí** — necesita que confirmes si:

- (a) el invariante de monotonía de Caso 5 debe extenderse también a esta
  fórmula antes de aceptarla (en cuyo caso `Amenaza_incongruencia_par`, tal
  como está, no pasa y hay que rediseñarla), o
- (b) es una excepción deliberada y aceptada — la incongruencia SÍ puede
  subir el IAO cuando el Sistema mejora solo, porque eso es exactamente lo
  que el concepto de incongruencia debe capturar, y el invariante de Caso 5
  sigue aplicando solo a la fórmula actual de `calcularIAO()`, no a esta.

Ninguna de las dos es obviamente correcta desde el código — es una
decisión conceptual, tuya.

### 0.3 Hallazgo bloqueante — el ítem "Bipolar" que necesita `Brecha_final` no existe para 4 de los 5 pares

`DOCUMENTO_MARCO` §6.1 y la SQL legacy calculan `Brecha_final = α×Brecha_calculada
+ (1−α)×Bipolar` — necesitan un ítem bipolar POR PAR. Verificado contra el
instrumento ICE-IEH real y cerrado (`motor-ice-ieh.js`, 31 preguntas,
cierre técnico confirmado 2-sep-2026):

| Par | Ítem independiente real | Tipo |
|---|---|---|
| `estructura_fortaleza` (Par 1) | `IND-EF` (P7) | **bipolar** real, `[−1,+1]` |
| `intencion_coherencia` (Par 2) | `IND-IC` (P14) | `sintesis_ind`, `[0,100]` — **NO es bipolar** |
| `impacto_equilibrio` (Par 3) | — | **no existe ningún ítem independiente** |
| `nexo_confianza` (Par 4) | — | **no existe ningún ítem independiente** |
| `integracion_actitud` (Par 5) | — | **no existe ningún ítem independiente** |

Solo el Par 1 tiene, de verdad, lo que la fórmula necesita. El Par 2 tiene
un ítem de naturaleza distinta (síntesis unidireccional, no bipolar, otra
escala). Los Pares 3-5 no tienen nada. Esto significa que `Brecha_final`
con `α`-blend, tal como está descrita en `DOCUMENTO_MARCO`/la SQL legacy,
**no se puede calcular para 4 de los 5 pares con el instrumento real** —
o la tabla `respuestas_cuestionario_pares.bipolar` legacy se está llenando
hoy con algo que no es lo que la fórmula asume (a verificar aparte, fuera
de este documento — no tengo acceso a datos reales de esa tabla), o la
fórmula necesita ajustarse para los 4 pares sin bipolar real (por ejemplo,
`α=1` forzado donde no hay bipolar, reduciendo `Brecha_final` a
`Brecha_calculada` pura — una opción, no una decisión que tomo aquí).

**Conclusión de esta sección**: antes de portar la fórmula a `motor-iao.js`,
hacen falta dos decisiones tuyas — la de §0.2 (monotonía) y la de §0.3
(qué hacer con `Brecha_final` donde no hay bipolar real). Las 4 respuestas
de abajo asumen que se resuelven; no las resuelven por sí solas.

---

## 1. De dónde sale `Brecha_final` — contrato real, con la corrección de Luis incorporada

`motor-iao` no recalcula nada — confirmado, no se investiga esa vía.
**Pero el campo real que existe hoy no es uno solo, son dos, y no
coinciden entre sí**:

- **`motor-ice-ieh.js` (módulo aislado, el que corresponde según `T-01` del
  inventario) expone `calcularBrechas(variables)` → `{ B_EF, B_IC, B_IE,
  B_NC, B_IA }`, cada uno = `Sistema_par − Experiencia_par`, en escala
  **0-100 cruda** (`motor-ice-ieh.js:316-320`) — **sin el blend con
  Bipolar**. Esto es `Brecha_calculada`, no `Brecha_final`.
- **La SQL legacy** (`013_umbral_piso_anclado.sql`) calcula `Brecha_final`
  directamente en el `SELECT` desde `respuestas_cuestionario_pares`
  (columnas `concepto_a`/`concepto_b`/`bipolar`, escala **[0,1]**, no
  0-100) — un nivel de la cascada que **no pasa por `motor-ice-ieh.js` en
  absoluto**, lee de una tabla de base de datos directamente.

**Ninguno de los dos, tal cual, es el input que `motor-iao.js` necesitaría**:
- `motor-ice-ieh.js` da la magnitud correcta conceptualmente pero en la
  escala equivocada (0-100 vs. [0,1]) y sin el blend de Bipolar.
- La SQL legacy tiene la forma exacta pero vive en una capa de base de
  datos que `motor-iao.js` (módulo aislado, sin `require` a nada externo,
  mismo criterio que `motor-sdmo`/`motor-ice-ieh`) no debe tocar
  directamente.

**Contrato propuesto para `motor-iao.js`** (nuevo parámetro de entrada,
NO recalculado internamente): recibir `brechasFinal` — un objeto `{
estructura_fortaleza, intencion_coherencia, impacto_equilibrio,
nexo_confianza, integracion_actitud }`, cada valor en **[−1,+1]** (mismo
rango que usa la SQL legacy y `v3`), calculado por quien ensambla el input
(el arnés de integración, no `motor-iao.js` ni `motor-ice-ieh.js`) —
mismo patrón arquitectónico que ya se usó para
`motor-integracion-sdmo-aie`/`motor-integracion-piio-aie`: cada motor
aislado expone sus primitivas, el arnés hace la traducción de forma/escala
entre ellos. **No propongo que `motor-ice-ieh.js` cambie su contrato** —
ya está "cerrado" (v3, Registro de cambios) y tocarlo no está en el
alcance de este encargo.

---

## 2. ¿Una fórmula por par, o una agregada?

**Por par — confirmado sin ambigüedad, tres fuentes coinciden**: el nombre
(`_par`), la SQL legacy (`GROUP BY p.par`, produce 5 filas en `pares_out`),
y `DOCUMENTO_MARCO` §4 (`Por cada par: Amenaza_incongruencia_par = ...`).
Se calcula 5 veces — una por cada uno de los 5 pares reales
(`estructura_fortaleza`, `intencion_coherencia`, `impacto_equilibrio`,
`nexo_confianza`, `integracion_actitud`, mismas claves que
`motor-ice-ieh.js:PARES`) — y luego se agregan a nivel Persona vía
`Incongruencia_i`/`IAO_i` (promedio + segundo-mayor de los 5).

---

## 3. Dónde encaja en la arquitectura real de `motor-iao.js`

**No en `agregarNodo()`/`agregarOrganizacion()`** — verificado leyendo
ambas funciones completas: reciben `iaosIndividuales`/`personas` ya
resueltas a un número de IAO por Persona; no recalculan nada de la fórmula
individual. Son agregadores genéricos, agnósticos de CÓMO se calculó el
IAO de cada Persona — no necesitan cambiar de firma para esto.

**El punto real de inserción es `calcularIAO(variables)`
(`motor-iao.js:287-290`) — o, más precisamente, al lado de ella, no
reemplazándola todavía**. Hoy `calcularIAO` usa una fórmula
**estructuralmente distinta** a la de `DOCUMENTO_MARCO` §4 — basada en
déficits (`D_S`/`D_E`, distancia a un ideal), no en Amenaza/Incongruencia.
Ambas fórmulas conviven en el sistema hoy: `calcularIAO()` es la que
`motor-iao.js` ya tiene 153 asserts verificando; `Amenaza_incongruencia_par`
es la de la SQL legacy y `DOCUMENTO_MARCO` §4. **No son la misma fórmula
con un término faltante — son dos arquitecturas de cálculo del IAO
distintas**, coexistiendo hoy en dos partes distintas del sistema.

**Propuesta de forma** (sujeta a que se resuelvan §0.2/§0.3 primero):
función nueva, **`calcularAmenazaPorPar(variables, brechasFinal, opts)`**
o similar — NO modifica `calcularIAO()` existente. Devuelve, por cada uno
de los 5 pares: `{ amenaza_incongruencia, amenaza_absoluta, amenaza_par }`.
Una segunda función, `calcularIAO_amenaza(...)` (nombre a definir),
ensamblaría `Incongruencia_i`/`IAO_i` a partir de eso — un CAMINO DE
CÁLCULO PARALELO, no un reemplazo, hasta que tú decidas cuál de los dos es
el vigente. Mismo criterio que cuando se descartó `G_j⁺`: no se elige a
ciegas, se compara.

---

## 4. `w_neg` — investigación, mismo estándar que `TRAJ_STABLE_BAND`/`minReportableN`

**Sí existe algo citable, con una salvedad de interpretación que tienes
que confirmar tú, no yo.**

Tversky & Kahneman (1992) — el coeficiente de aversión a la pérdida
original, mediana **λ≈2.25** (las pérdidas pesan ~2.25× más que ganancias
equivalentes), de un experimento con 25 estudiantes de posgrado. Trabajo
posterior (meta-análisis, Brown et al. y otros) confirma que **2.25 sigue
siendo la cifra más citada**, pero con rango empírico real de **1.5 a
3.0** según metodología (elección hipotética vs. dinero real vs. datos de
trading vs. neuroimagen) — **no es un número único y fijo, es un rango con
un punto central**.

**La aplicación a `w_neg` no es automática — requiere una interpretación
que el código no deja explícita en ningún lado**: ¿qué lado de la Brecha
es la "pérdida" y cuál la "ganancia"? Lectura más plausible, dado que
`w_pos=1` ya es el peso MÁXIMO fijo: Brecha positiva (el sistema promete
más de lo que se vive) se trata como la "pérdida" (peso 1, completo);
Brecha negativa (se vive más de lo que el sistema formalmente sostiene) se
trata como la "ganancia" (peso reducido). Bajo esa lectura, si `w_pos=1`
representa el lado "pérdida", el lado "ganancia" debería pesar
**1/λ ≈ 1/2.25 ≈ 0.44** (rango 0.33-0.67 según el rango empírico de λ).

**El valor ya hardcodeado en la SQL legacy es `w_neg=0.5`** — cae DENTRO
de ese rango citable (0.33-0.67), pero **el propio código no cita esta
razón** — no hay ningún comentario en `013_umbral_piso_anclado.sql` que
diga "0.5 viene de aversión a la pérdida de Kahneman/Tversky". Es
indistinguible, por el código, de haber sido elegido como "medio, por
simplicidad" sin ninguna cita detrás. **No afirmo que 0.5 esté
"confirmado" por la literatura** — afirmo que, SI la interpretación
pérdida/ganancia de arriba es la correcta, 0.5 es un valor razonable
dentro del rango citable, con la misma honestidad de fuente que
`STABILITY_CV_*_GENERICO`: convención externa real, aplicable con una
interpretación propia no verificada contra ningún documento que la
confirme, no derivada de datos de EFICIENCIA.

---

## 5. Impacto esperado en la batería — 153 asserts

**Si se construye como camino paralelo (§3, recomendado)**: impacto
**cero** en los 153 asserts existentes — `calcularIAO()`,
`perfilPorPar()`, `calcularBrechas()`, `agregarNodo()`,
`agregarOrganizacion()` quedan exactamente como están. Todo lo nuevo son
funciones adicionales, con su propia batería nueva (no estimada aquí,
depende de cómo se resuelvan §0.2/§0.3).

**Si en cambio la intención es REEMPLAZAR `calcularIAO()`** por la fórmula
de Amenaza/Incongruencia (opción que este documento NO recomienda sin que
lo decidas explícitamente): impacto real en gran parte de los 153 —
`calcularIAO`/`perfilPorPar` alimentan directamente los valores que
`agregarNodo`/`agregarOrganizacion` agregan, y el Caso 5 (paradoja de
monotonicidad) tendría que reescribirse por completo dado el hallazgo de
§0.2. No se puede estimar un número de rojos sin saber esa decisión
primero — sería inventarlo.

---

## 6. Estado final de cada pregunta que este documento planteó

- **§0.2** (paradoja de monotonicidad) — **cerrada por descarte de la
  fórmula misma** (§0.4), no por resolución. Queda documentada como
  evidencia adicional de por qué no portar, no como pregunta pendiente.
- **§0.3** (ítem bipolar faltante en 4 de 5 pares) — **confirmada
  independientemente por el Anexo A.2** del documento técnico oficial
  (§0.4) — la misma conclusión, por dos caminos de evidencia distintos.
- `w_neg` — la investigación de citabilidad (§4) queda como referencia
  para el día que exista una fórmula vigente de esta familia; no se aplica
  a nada hoy.
- `Amenaza_incongruencia_par` vs. `calcularIAO()` (§3) — deja de ser
  pregunta: no hay fórmula que convivir ni reemplazar, `calcularIAO()`
  sigue siendo la única arquitectura de cálculo del IAO en `motor-iao.js`.
- El origen de `brechasFinal` en producción — sin objeto, no hay consumidor
  que lo necesite.

## 7. Pregunta abierta de Luis — ¿el sistema anterior sigue en uso activo?

Verificado contra el código real, no asumido: **`resumen_organizacion_completo`
(la función que contiene la fórmula descartada) no es código muerto — está
activamente desplegado y es la fuente de datos principal de `workbook.html`**,
la herramienta que los consultores usan hoy:

- `workbook.html` la llama en **5 puntos distintos** (líneas 2839, 5278,
  5434, 5445 y el comentario de 5269 que la describe como "un solo punto
  de entrada" para el diagnóstico completo, con y sin filtro de
  departamento).
- El commit que aplicó las migraciones 013-016 dice explícitamente **"ya
  aplicadas en producción"** (`0c2ce46`).
- `workbook.html` es, verificado en la sesión de esta semana (revisión de
  Cloudflare Deployments), el archivo que está sirviendo hoy en
  `eficiencia-app.coach-luiscaicedo.workers.dev`.

**Lo que esto significa, con precisión**: "pertenece al sistema anterior"
(tu clasificación, correcta para efectos de qué se traslada a los motores
nuevos) **no es lo mismo que "código muerto/sin usar"** — es la
arquitectura de cálculo desplegada detrás de `workbook.html`. Lo que el
código por sí solo no podía confirmar era el uso real de negocio — esa
información no vive en el repositorio.

**Actualización — confirmado por Luis (2026-09-16)**: `workbook.html` /
`resumen_organizacion_completo` está desplegado pero **sin uso activo en
este momento** — ninguna consultoría real está corriendo datos por ahí
hoy. Esto cierra la pregunta lateral por completo:

- No hace falta correr la consulta SQL de verificación de arriba.
- No hace falta ninguna acción sobre el sistema anterior.
- La paradoja de monotonicidad de §0.2 (mejorar el Sistema con Experiencia
  fija sube la Amenaza inferida) **no está afectando ningún diagnóstico
  real actualmente**, precisamente porque el sistema legacy que la
  contiene no tiene uso activo.
- Si en algún momento se reactiva el uso de `workbook.html` legacy antes
  de que el workbook nuevo esté listo, esto merecería revisarse
  entonces — pero no antes.

Con esto, el diseño de `Amenaza_incongruencia_par` queda completamente
cerrado en todas sus dimensiones: no se porta a `motor-iao.js` (§0.4), y
el hallazgo colateral del legacy queda documentado sin acción pendiente.
