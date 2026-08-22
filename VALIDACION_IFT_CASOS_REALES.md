# Validación de plausibilidad — IAO_target (3 niveles) y fórmula IFT completa contra casos reales

Fecha: 2026-08-21. Ejercicio de validación, no código de producción — no toca
`supabase/migrations/`, no modifica la Ficha financiera, no conecta con nada
en producción.

> **CORRECCIÓN (2026-08-21, mismo día) — la sección 4 original de este
> documento estaba equivocada, retractada abajo.** La primera versión de
> este documento afirmaba que el CFF tenía una "ambigüedad de unidad de
> tiempo" y que faltaba un `×12` en `Costo_rotación`/`Costo_desenganche`.
> Verificación objetiva posterior (contraste palabra por palabra contra el
> motor legacy `piioKpiToCost()`/CTD en `workbook.html`, y re-verificación
> directa de las fuentes originales de Gallup/ACRIP/Michael Page/Adecco)
> **refuta esa hipótesis**: la fórmula de `supabase/migrations/015_motor_cff.sql`,
> tal como está escrita hoy, ya es algebraicamente equivalente al motor
> legacy — no falta ningún `×12`. La sección 4 de abajo queda reescrita con
> el resultado correcto; se deja la sección 4 original más abajo, marcada
> explícitamente como **retractada**, por transparencia de lo que pasó, no
> para que se use.

**Qué es esto y qué NO es (léase antes de lo demás):** esto es una **prueba de
plausibilidad** — sirve para detectar errores gruesos de la fórmula (T_rec
negativo, cero, absurdo por unidades mal definidas, comportamiento que rompe
el rango [0,100], etc.). **No es una validación estadística** de que
20%/40%/60% o `λ = ln(2)/12` sean los valores correctos. Esa validación
requiere una muestra con poder estadístico real — datos propios de EFICIENCIA
con 12+ meses de piloto (el mismo mecanismo que ya calibra α, γ, w_neg y los
umbrales de severidad, sección 6.2/6.4 y 12 del marco). Con 3-4 casos externos
de una sola señal (rotación) aproximando un constructo (IAO) que nunca se ha
medido en el mundo real, el resultado de este documento se cierra como **"no
encontramos absurdos matemáticos"** — nada más fuerte que eso. No confirma ni
descarta los 3 niveles.

Reutiliza `INVESTIGACION_DATOS_CALIBRACION_CFF.md` e
`INVESTIGACION_BENCHMARKS_ESG_SOSTENIBILIDAD.md` — ningún dato nuevo fue
buscado para este ejercicio, solo se recombinan cifras ya verificadas ahí.

---

## 0. Los "3 niveles de IAO_target (20%/40%/60%)" — de dónde salen

**Aclaración de alcance, encontrada al revisar el marco antes de validar:**
`DOCUMENTO_MARCO_SISTEMA_EFICIENCIA.md` (sección 8.2) define
`IAO_target` como "definido por el consultor según el plan de intervención
del catálogo" — **no existe hoy, en ningún documento del repo, una tabla de 3
niveles fijos de reducción (20%/40%/60%)**. Confirmado por búsqueda en todo
`eficiencia-app` (`grep -rn "IAO_target\|20%\|40%\|60%"`): cero coincidencias
de una tabla de niveles. Este ejercicio, tal como lo pidió Luis, trata
20%/40%/60% como **tres niveles candidatos de profundidad de intervención**
(ligera / media / profunda) a probar contra la fórmula — no como una decisión
ya tomada que se esté re-confirmando. Si el ejercicio los sostiene, quedan
como candidatos razonables para proponer; si no, hay que ajustarlos antes de
construir nada, tal como pidió Luis explícitamente.

---

## 1. Datos reales usados y por qué

De las dos investigaciones previas, solo 3 fuentes tienen algo utilizable
para esto — el resto de las cifras de esos documentos son cortes de un solo
año, sin serie, o (Grupo SURA, extracción 1) internamente inconsistentes:

| Caso | Fuente | Qué tiene | Serie temporal |
|---|---|---|---|
| **SURA Comercial/Asesores** | `INVESTIGACION_BENCHMARKS_ESG_SOSTENIBILIDAD.md`, sección 1, extracción 2 (la serie 2023→2024 etiquetada consistentemente "Grupo Empresarial SURA", no la extracción 1 que el propio documento marca como no confiable) | Rotación total 32.80% (2023) → 23.40% (2024) | **Sí — 2 puntos, 12 meses reales** |
| **SURA Administrativos** | Misma fuente, misma extracción | Rotación total 11.80% (2023) → 14.10% (2024) | **Sí — 2 puntos, 12 meses reales, EMPEORÓ** |
| **BPO Colombia (sector)** | `INVESTIGACION_DATOS_CALIBRACION_CFF.md`, sección 1 | Rotación mensual 10.72% (2022) → 10.03% (2023) | Sí — 2 puntos, 12 meses reales (agregado sectorial, no una sola empresa) |
| **ACHC médicos / enfermería** | Misma fuente, sección 3.1 | Rotación 13.1% / 15.8%, mayo-jun 2024 | No — corte transversal único, sin comparación histórica |

Se descartó Cementos Argos (un solo punto, 2024) y la extracción 1 de SURA
(el propio documento de investigación la marca "no usar sin verificar contra
el PDF original" por inconsistencia interna). ACHC se incluye solo como
ancla de **nivel**, no de **velocidad de cambio** — es el único caso sin
segundo punto en el tiempo.

**Limitación que domina todo lo demás en este documento:** ninguna de estas
4 series mide el IAO real. El IAO nunca se ha aplicado a ninguna de estas
organizaciones — es un instrumento propio de EFICIENCIA, sin precedente
externo. Lo que sigue es una aproximación de una sola señal (rotación) hacia
un rango [0,100] análogo al IAO, no una medición del constructo real
(incongruencia entre lo declarado y lo vivido, Modo Seguridad/Amenaza). Todo
resultado de este documento hereda esa limitación de raíz.

---

## 2. Metodología del proxy IAO₀ — documentada explícitamente, con sus límites

Sin cuestionario EFICIENCIA aplicado, no hay Brecha, no hay `amenaza_par`, no
hay `segundo_mayor` — nada de la fórmula real del IAO (sección 4 del marco)
es reconstruible desde rotación sola. Se usa el proxy más simple defendible:
normalizar la rotación observada contra el rango real más amplio encontrado
en las dos investigaciones (no un rango inventado):

```
piso   = 5.26%   (Cementos Argos, rotación voluntaria 2024 — la cifra MÁS BAJA
                   real de toda la investigación)
techo  = 89%     (BPO call center, Michael Page 2023 — la cifra MÁS ALTA
                   real de toda la investigación)

IAO_proxy = 100 × clip((rotación − piso) / (techo − piso), 0, 1)
```

**Qué valida esto y qué no:** ancla el proxy en extremos reales (no
arbitrarios), pero el salto conceptual — "rotación alta = Modo Amenaza alto"
— es una hipótesis, no un hecho establecido. El propio marco (sección 8) ya
advierte que la relación IAO↔resultado real es probablemente "tipo
umbral/sigmoide, no lineal"; este proxy es lineal por simplicidad, así que
cualquier resultado de velocidad de cambio de este documento es de **orden
de magnitud**, no de precisión.

| Caso | Rotación | IAO_proxy |
|---|---|---|
| SURA Comercial 2023 | 32.80% | **32.89** |
| SURA Comercial 2024 | 23.40% | **21.66** |
| SURA Admin 2023 | 11.80% | **7.81** |
| SURA Admin 2024 | 14.10% | **10.56** |
| BPO 2022 (anualizado¹) | 74.35% | **82.51** |
| BPO 2023 (anualizado¹) | 71.87% | **79.54** |
| ACHC médicos 2024 | 13.10% | **9.36** |
| ACHC enfermería 2024 | 15.80% | **12.59** |

¹ BPO reporta rotación **mensual**; se anualiza con capitalización
`1−(1−m)^12` para que sea comparable con las demás cifras (anuales por
definición en sus propias fuentes). Con `m=10.72%` mensual, la rotación
anualizada implícita (74.35%) cae en el mismo orden que el 89% de BPO/call
center de Michael Page — consistente en magnitud, buena señal de que la
anualización no está disparatada.

---

## 3. Velocidad de cambio — IAO(t) del modelo vs. lo que esas organizaciones realmente mostraron en 12 meses

`IAO(t) = IAO_target + (IAO_0 − IAO_target) × e^(−λt)`, `λ = ln(2)/12`. Nota
de forma cerrada útil para leer las tablas: con este `λ`, a `t=12` siempre se
cierra exactamente el 50% de la brecha a `IAO_target` — así que la reducción
de IAO a los 12 meses, relativa a `IAO_0`, es siempre **la mitad** del nivel
objetivo (10% a los 12 meses si el objetivo final es 20%, 20% si el objetivo
es 40%, 30% si el objetivo es 60%). Esto no es un resultado de la validación,
es álgebra — se anota porque simplifica leer las tres tablas de abajo.

### SURA Comercial (único caso con serie completa y mejora real)

| Nivel | IAO_target | IAO(12) modelo | Reducción a 12m (modelo) |
|---|---|---|---|
| 20% | 26.31 | 29.60 | 10.0% |
| 40% | 19.73 | 26.31 | 20.0% |
| 60% | 13.16 | 23.02 | 30.0% |
| **Real observado (2024)** | — | **21.66** | **34.1%** |

El dato real (34.1% de reducción en 12 meses) **supera** incluso el nivel
más agresivo de los tres (30.0%). Resolviendo qué `IAO_target` habría
predicho exactamente el valor real observado (si `λ` es correcto):
`IAO_target = 2×21.66 − 32.89 ≈ 10.5`, equivalente a un **68% de reducción**
— más profundo que el nivel "60%" propuesto.

### SURA Administrativos (empeoró — caso que el modelo no puede representar)

`IAO_0 = 7.81` → `IAO_1 real = 10.56`, un **empeoramiento del 35.2%** en 12
meses. La fórmula `IAO(t) = IAO_target + (IAO_0−IAO_target)e^(−λt)` converge
siempre hacia `IAO_target ≤ IAO_0` por construcción — no tiene ningún término
que permita representar una trayectoria que empeora. No es un bug del
cálculo, es un supuesto de diseño implícito nunca declarado explícitamente en
la sección 8.2: **el modelo asume que la intervención funciona**; no modela
el caso (real, documentado aquí con SURA mismo) de que un segmento de la
misma organización se mueva en la dirección contraria mientras otro mejora.

### BPO Colombia (sector, sin intervención estructurada — tendencia de mercado)

| Nivel | IAO_target | IAO(12) modelo | Reducción a 12m (modelo) |
|---|---|---|---|
| 20% | 66.01 | 74.26 | 10.0% |
| 40% | 49.51 | 66.01 | 20.0% |
| 60% | 33.00 | 57.76 | 30.0% |
| **Real observado (2023)** | — | **79.54** | **3.6%** |

Aquí ocurre lo contrario: el dato real (3.6%) es **más lento** que incluso el
nivel más conservador (10.0%). Importante no sobre-interpretar: este es un
promedio sectorial sin ninguna intervención estructurada detrás — no es
comparable 1:1 con una organización que sí recibe el programa EFICIENCIA. Lo
que sí es un hallazgo válido: en un contexto de rotación crónica alta sin
intervención activa, el cambio "orgánico" es mucho más lento que cualquiera
de los 3 niveles propuestos — consistente con la sección 8.3 del marco
("rotación estructural alta del sector" como factor que extiende el plazo).

### ACHC — sin segundo punto, no valida velocidad

Sirve solo como ancla de **nivel** (IAO_proxy 9.36/12.59, comparativamente
bajo dentro del rango piso-techo) — no hay forma de contrastar contra una
velocidad real observada.

**Lectura conjunta de los dos casos con serie (SURA Comercial y BPO):** los 3
niveles candidatos quedan **entre** dos casos reales que se desvían en
direcciones opuestas — uno más rápido que el nivel 60%, otro más lento que el
nivel 20%. Esto es, en el mejor sentido, una señal de plausibilidad (el rango
20-60% no es absurdo frente a la variación real observada), pero con 2 casos
—uno de ellos un agregado sectorial sin intervención— no hay manera honesta
de decir que el rango está "confirmado". Ver sección 5.

---

## 4. CFF(t) y T_rec — versión verificada (reemplaza la sección 4 original, retractada al final del documento)

**Verificación objetiva realizada a pedido de Luis, quien recordó que el
motor anterior (PIIO/CTD) manejaba esto de forma explícita — no se asumió
nada, se contrastó contra ese precedente real y contra las fuentes
originales, palabra por palabra.**

### 4.0 El motor legacy PIIO/CTD como precedente objetivo — refuta la hipótesis del `×12` faltante

`piioKpiToCost()` (workbook.html, líneas 4015-4027, todavía en el archivo
aunque el motor ya no está en uso) calcula el costo de rotación así:

```js
/* C_rot: empleados en exceso × salario_anual × CR / 12
   (rot es % anual → deltaRot fracción anual de N empleados que rotan en exceso) */
const csal = S.csal || CIE / 2.43;
const c_rot = deltaRot * N * csal * CR / 12;
```

El comentario del propio código dice explícitamente **"salario_anual"** —
`csal` es salario **anual**, no mensual, y el resultado se divide entre 12
al final para producir un **CTD mensual** (el propio motor lo llama así:
"Costo Total del Deterioro — este mes"). `CIE` (Costo Integral del
Empleado, usado en `c_prod`/`c_acc`) sigue el mismo patrón: los comentarios
del código dicen "0.3% del CIE **anual** por pp... mensualizado" — CIE
también es una cifra anual, con la conversión a mensual hecha explícitamente
vía `/12` en la constante (`beta_prod: 0.003/12`).

**La fórmula nueva** (`supabase/migrations/015_motor_cff.sql`) usa
`Salario_promedio`, definido explícitamente como **mensual** (marco, línea
602), multiplicado directo por `Multiplicador_rol` — sin ningún `/12` ni
`×12` visible. A primera vista esto parece inconsistente con el motor
legacy (que sí divide entre 12 explícitamente). **No lo es.** Sustituyendo
`csal_anual = Salario_mensual × 12` en la fórmula legacy:

```
c_rot(legacy) = deltaRot × N × (Salario_mensual × 12) × CR / 12
              = deltaRot × N × Salario_mensual × CR
              = EXACTAMENTE la forma de Costo_rotación en la fórmula nueva
                (con TasaRotaciónBase_cliente en el rol de deltaRot,
                 Multiplicador_rol en el rol de CR)
```

Verificado numéricamente (caso SURA Comercial, `N=500`,
`Salario_mensual=$3.000.000`, `TasaRotación=32.8%`, `Multiplicador_rol=0.50`,
`IAO=32.89`): **ambas fórmulas dan exactamente $326.909.400 COP — diferencia
de $0.00.** El `/12` explícito del motor legacy y el uso directo de salario
*mensual* en la fórmula nueva son **dos formas matemáticamente idénticas de
escribir lo mismo**, no una inconsistencia. Agregar un `×12` a la fórmula
nueva (la corrección que se sospechaba en la primera versión de este
documento) **contaría la anualización dos veces** — con el mismo caso,
produciría $3.922.912.800 COP, 12 veces más que el motor legacy confirma
como correcto.

### 4.1 Fuentes originales, re-verificadas palabra por palabra (no se asumió que la lectura anterior fuera correcta)

| Fuente | Cita textual exacta (re-verificada) | Base salarial explícita en el texto |
|---|---|---|
| **Michael Page** (Felipe Delgado, vía La República, `larepublica.co/alta-gerencia/rotacion-de-personal-cuesta-a-las-empresas-hasta-nueve-meses-de-salario-por-empleado-4391244`) | *"reemplazar a un colaborador puede costar 50% de su salario **anual**, dependiendo del nivel y la especialización del rol"* | Anual, explícito |
| **Adecco** (Darcio Fuentes, misma fuente) | *"reemplazar un talento estratégico puede costarle a una organización entre seis y nueve meses del salario **anual** de ese empleado"* | Anual, explícito — **corrección menor al marco:** la cita que `DOCUMENTO_MARCO_SISTEMA_EFICIENCIA.md` (línea 641) transcribe como "6-9 meses de salario" omite la palabra "anual" que sí aparece en la fuente primaria; no cambia el número (6-9/12 = 0.50-0.75, ya usado correctamente), solo hace explícito lo que antes había que inferir |
| **ACRIP** (vía buk.co, `buk.co/blog/como-calcular-costo-de-rotacion-de-personal`, sección "Impacto en la liquidez de las empresas colombianas") | *"reemplazar a un trabajador en Colombia cuesta entre 3 y 6 veces su salario **mensual**"* | Mensual, explícito — pero como **multiplicador absoluto** (3-6×), no como fracción a aplicar sobre salario mensual: 3-6 meses de sueldo = 3/12 a 6/12 = 0.25-0.50 del salario **anual**, exactamente el rango que el marco ya usa para el nivel "Operativo" |
| **Gallup** (18%-34% desenganche, vía múltiples fuentes secundarias — proactioninternational.com, activtrak.com; PDF primario de Gallup no accesible directamente en esta verificación) | *"disengaged employees cost businesses between 18% to 34% of their **annual salary**"* (consistente en las fuentes secundarias consultadas) | Anual, según todas las fuentes secundarias consultadas — **no se logró abrir el reporte primario de Gallup en esta ronda** para confirmar la cita exacta dentro del documento original, limitación reconocida |

**Las cuatro fuentes, sin excepción, están ancladas a salario ANUAL** (ACRIP
lo dice en términos de salario mensual, pero como multiplicador absoluto que
matemáticamente equivale a una fracción del anual). Esto confirma que
`Multiplicador_rol` (0.25-0.75) y el `0.26` de Gallup están correctamente
calibrados como fracciones de salario **anual** — que es precisamente lo
que la fórmula nueva ya hace correctamente al multiplicarlos contra
`Salario_mensual` (ver 4.0: `fracción_anual × Salario_mensual =
fracción_anual × Salario_anual / 12` = la porción **mensual** correcta de
un costo anual). La anualización de las fuentes NO implica que la fórmula
necesite un `×12` — implica que necesita salario **mensual** para producir
una salida **mensual**, que es exactamente lo que tiene.

### 4.2 Costo_rotación y Costo_desenganche — lado a lado, con y sin el `×12` sospechado

No se pudo localizar `$174.147.116` en esta sesión — no existe en el
repositorio (`grep`/`git log -S` sobre todo `eficiencia-app`, sin
coincidencias) y esta sesión no tiene acceso a la base de datos de
producción/Supabase para consultar la organización de prueba real
directamente. Sin los insumos reales (`N`, `Salario_promedio`, `IAO_org`,
`TasaRotaciónBase_cliente` de esa organización específica) no puedo
reproducir ese número exacto de forma independiente — si Luis confirma
cuál de los dos componentes es (`Costo_desenganche` o `Costo_rotación`) y
comparte los insumos, se puede repetir este cálculo con el dato real en vez
del ilustrativo. Mientras tanto, la comparación pedida, con el caso
ilustrativo ya usado en este documento (y aplicable a cualquier cifra real
por ser una relación puramente multiplicativa):

| Componente | Fórmula actual (verificada correcta) | Con `×12` agregado (lo que se sospechaba que faltaba) |
|---|---|---|
| `Costo_rotación` (SURA Comercial, IAO=32.89) | **$326.909.400** | $3.922.912.800 |
| `Costo_desenganche` (mismo caso) | **$128.271.000** | $1.539.252.000 |

Si `$174.147.116` es el valor real de `Costo_desenganche` o `Costo_rotación`
de la organización de prueba tal como está calculado **hoy** en producción,
el número con `×12` sería **$2.089.765.392** — pero, según toda la
evidencia reunida en esta verificación, **ese número con `×12` sería el
incorrecto**, no el corregido: multiplicaría por 12 una cifra que el motor
legacy y las fuentes originales confirman que ya es mensualmente correcta
tal como está.

### 4.3 T_rec — recalculado con la fórmula verificada (sin `×12`), 4 casos × 3 niveles

| Caso | CFF(0) mensual | T_rec, 20% | T_rec, 40% | T_rec, 60% |
|---|---|---|---|---|
| SURA Comercial (IAO₀=32.89) | $532.6M | 14 meses | 10 meses | 8 meses |
| SURA Admin (IAO₀=7.81) | $188.7M | 39 meses | 25 meses | 20 meses |
| BPO sector (IAO₀=82.51) | $1,445.8M | 7 meses | 5 meses | 4 meses |
| ACHC médicos (IAO₀=9.36) | $207.7M | 35 meses | 22 meses | 18 meses |

(Mismos insumos ilustrativos que el resto del documento: `N=500`,
`Salario_mensual=$3.000.000`, `Costo_intervención=$200.000.000` — solo
`TasaRotaciónBase_cliente` cambia por caso, con el dato real de cada
organización.)

**Esta tabla reemplaza la de la sección 4 original (retractada abajo).**
Con la fórmula verificada, **ningún caso da "nunca recupera"** — el rango
completo (4 a 39 meses) es mucho más sano que el de la versión retractada
(que llegaba a "nunca en 10 años" en dos de cuatro casos). Sigue habiendo
una observación real y no retractada: `T_rec` es sensible a `IAO_0` con un
`Costo_intervención` fijo (BPO recupera en 4-7 meses, SURA Admin/ACHC
médicos tardan 18-39) — pero ya no en el grado extremo que la versión
anterior (equivocada) sugería.

---

## 4-ORIGINAL (RETRACTADA — no usar, se deja solo por transparencia)

**Todo lo que sigue en esta sección estaba basado en una hipótesis que la
verificación de la sección 4 (arriba) refutó con evidencia objetiva
(motor legacy PIIO/CTD + re-verificación de fuentes primarias). No refleja
el estado real de la fórmula. Se conserva tal cual se escribió originalmente
solo para que quede registro de qué pasó y por qué se corrigió — no como
referencia técnica.**

### 4-orig. CFF(t) y T_rec — con insumos ilustrativos marcados explícitamente (RETRACTADO)

El CFF completo necesita `N`, `Salario_promedio`, `Costo_intervención_cliente`
— ninguno de estos 4 casos publica esos datos (son cifras internas de RRHH
que ninguna empresa hace públicas). Se usan valores **ilustrativos**, iguales
para los 4 casos (para que la comparación entre casos sea limpia), y se deja
**la tasa de rotación real** de cada caso como el único insumo verdaderamente
externo:

```
N = 500 (ilustrativo)               Salario_promedio = $3.000.000 COP/mes (ilustrativo)
Multiplicador_rol = 0.50 (medio)    TasaAusentismo = 9.4/242 ≈ 3.9% (benchmark Colombia, EALI 2024)
s_rot = s_aus = 1 (provisional, marco sección 8)
Costo_intervención_cliente = $200.000.000 COP (ilustrativo)
TasaRotaciónBase_cliente = la cifra REAL de cada caso (única variable que cambia entre casos)
```

Se omiten `Costo_retrabajo` (necesita `CostoOperativoTotal_cliente`, sin
dato) y `Costo_supervisión`/`Costo_innovación_perdida` (sección 8.1 del
marco: nunca suman al CFF).

### 4.1-orig (RETRACTADO) Hallazgo principal: el CFF no tiene unidad de tiempo definida — y eso cambia T_rec en un factor de 3-5x

`Salario_promedio` está definido explícitamente como **mensual** (marco,
línea 602: "costo total mensual del empleador por empleado"). Pero
`Multiplicador_rol` y los benchmarks de `Costo_rotación` (ACRIP, Michael
Page, Adecco) están anclados en fracciones de **salario anual** ("3-6 meses
de salario anual", Michael Page: "50% del salario anual"). El marco nunca
declara si el `CFF` resultante de la sección 8 es una cifra **anual** o
**mensual** — y el IFT (sección 8.2) suma `CFF(0)−CFF(t)` mes a mes
(`t` en meses, línea 832), lo cual solo es dimensionalmente correcto si
`CFF(t)` es una cifra **mensual**. Se probaron ambas lecturas contra el caso
SURA Comercial 2023 (`IAO_0=32.89`, rotación real 32.8%):

| Interpretación | T_rec, nivel 20% | T_rec, nivel 40% | T_rec, nivel 60% |
|---|---|---|---|
| **Literal** (se suma `CFF(0)-CFF(t)` tal cual, sin ajustar) | 14 meses | 10 meses | 8 meses |
| **Corregida** (CFF es una cifra anual; se divide entre 12 antes de sumar por mes) | 70 meses | 42 meses | 32 meses |

La diferencia es de **5x en el nivel más conservador**. Bajo la lectura
literal, los 3 niveles apenas se diferencian entre sí (8-14 meses, todos muy
por debajo de "<24 meses") — sospechosamente rápido y poco útil para
diferenciar comercialmente los 3 niveles. Bajo la lectura corregida (la que
es dimensionalmente consistente con que `Salario_promedio` es mensual), solo
el nivel 60% se acerca al horizonte de "<24 meses" ya publicado en el sitio,
y el nivel 20% tarda casi 6 años. **Esta ambigüedad, no los niveles
20/40/60% en sí, es el hallazgo más grave y más accionable de todo este
documento** — bloquea poder confiar en cualquier T_rec, en cualquier nivel,
hasta que se resuelva explícitamente cuál es la unidad de tiempo del CFF.
Todo lo que sigue usa la lectura **corregida** (la única dimensionalmente
defendible dado que `Salario_promedio` ya está fijado como mensual en el
marco).

### 4.2-orig (RETRACTADO) T_rec en los 4 casos (lectura "corregida" — esta lectura era la equivocada), 3 niveles

| Caso | CFF(0) anual | T_rec, 20% | T_rec, 40% | T_rec, 60% |
|---|---|---|---|---|
| SURA Comercial (IAO₀=32.89) | $532.6M | 70 meses | 42 meses | 32 meses |
| SURA Admin (IAO₀=7.81) | $188.7M | **nunca en 10 años** | **nunca en 10 años** | 113 meses |
| BPO sector (IAO₀=82.51) | $1,445.8M | 28 meses | 19 meses | 15 meses |
| ACHC médicos (IAO₀=9.36) | $207.7M | **nunca en 10 años** | **nunca en 10 años** | 95 meses |

**Ningún caso produce T_rec negativo o cero** — por construcción,
`CFF(0)−CFF(t) ≥ 0` siempre (el IAO solo converge hacia abajo), así que ese
modo de falla específico (el que el prompt pedía revisar explícitamente) no
aparece en ninguno de los 4 casos, en ningún nivel. El orden entre niveles
también se mantiene siempre correcto (60% recupera más rápido que 40%, que
recupera más rápido que 20%) — la fórmula es internamente consistente.

**Lo que sí es un hallazgo real: T_rec depende mucho más de `IAO_0` (y de un
`Costo_intervención` fijo, no escalado) que del nivel elegido.** Con el mismo
costo de intervención ilustrativo para los 4 casos, dos de ellos (SURA Admin,
ACHC médicos — ambos con `IAO_0` bajo, <10) **nunca recuperan la inversión en
dos de los tres niveles**, y tardan 8-9 años en el tercero. El caso de mayor
`IAO_0` (BPO, 82.5) recupera cómodamente en los tres niveles. Esto no es un
error aritmético — es la consecuencia lógica de que el CFF de una
organización con baja fricción ya es bajo, así que hay poco margen para
"recuperar" un costo de intervención fijo, sin importar cuán agresivo sea el
`IAO_target`. **La causa raíz no es el nivel de reducción (20/40/60%), es que
la fórmula no ata `Costo_intervención_cliente` al tamaño/severidad del
cliente** — el marco ya deja `Costo_intervención_cliente` como "lo que el
cliente paga", sin ninguna regla que lo escale con `IAO_0` o `N`. Aplicar la
misma promesa "<24 meses" de forma universal, sin ese ajuste, es
matemáticamente insostenible para clientes de baja severidad — no porque el
programa no les sirva (sección 1 del marco: hay valor no financiero también),
sino porque el ROI financiero puro no lo sostiene con estos números.

---

## 5. Conclusión honesta — solo lo que este ejercicio permite afirmar

**Actualizada 2026-08-21 tras la verificación objetiva de la sección 4** —
reemplaza la conclusión original, que se apoyaba en el punto 1 de abajo
(ahora retractado).

**No se encontraron absurdos matemáticos en la fórmula ni en los 3 niveles
per se:** ningún `T_rec` salió negativo, cero, o inconsistente en el orden
entre niveles, en ninguno de los 4 casos probados (sección 4.3, con la
fórmula verificada). Los horizontes resultantes (4 a 39 meses) caen en el
mismo orden de magnitud (meses a pocos años) que la literatura de cambio
organizacional ya citada en la sección 8.2 del marco.

**Esto no confirma 20%/40%/60% ni `λ`.** Con 2 casos reales de serie temporal
(SURA Comercial, BPO sectorial) — uno más rápido que el nivel más agresivo,
otro más lento que el nivel más conservador — los 3 niveles quedan
*dentro del rango de variación real observada* sin quedar *validados por*
ella. Es exactamente el resultado que se puede esperar de 2 puntos de datos
externos aproximando un constructo nunca medido: ni para confirmar, ni para
descartar. Esa confirmación real solo puede venir del piloto propio de
EFICIENCIA con 12+ meses de datos (sección 12 del marco), midiendo el IAO
real, no un proxy de una sola señal.

**Lo que sí hay que resolver antes de construir el motor**, en orden de
urgencia — **actualizado**, el punto 1 original quedó retractado:

1. ~~Definir explícitamente si `CFF` es una cifra mensual o anual~~ —
   **retractado 2026-08-21.** Verificación objetiva (sección 4.0, contraste
   contra `piioKpiToCost()`/CTD legacy + re-verificación de fuentes
   Gallup/ACRIP/Michael Page/Adecco) confirma que **no hay ambigüedad**: la
   fórmula de `migración 015` ya produce una cifra mensual correcta, sin
   necesidad de ningún `×12`. Agregar uno sería introducir un error nuevo
   (contar la anualización dos veces), no corregir uno existente.
2. **Decidir si `Costo_intervención_cliente` debe escalar con `IAO_0`/`N`**
   — sigue vigente, aunque menos urgente que antes: con la fórmula
   verificada, incluso el caso de menor `IAO_0` (SURA Admin) recupera la
   inversión ilustrativa en 20-39 meses, no "nunca" como sugería la versión
   retractada. Sigue siendo cierto que `T_rec` varía mucho más por `IAO_0`
   que por el nivel de intervención elegido (sección 4.3).
3. **Documentar como supuesto explícito** que el modelo asume intervención
   exitosa monotónica — sigue vigente sin cambios: el caso real de SURA
   Admin (empeoró) sigue sin ser representable por la fórmula.
4. **Nuevo, encontrado en la verificación de esta ronda:** `CostoOperativoTotal_cliente`
   (usado en `Costo_retrabajo`) no tiene periodicidad definida en ningún
   punto del esquema (`supabase/migrations/011_ficha_financiera_cff.sql`,
   columna `numeric CHECK >= 0`, sin comentario de unidad) ni del marco —
   a diferencia de `Salario_promedio`, que sí la tiene explícita ("mensual",
   línea 602). Si `CostoOperativoTotal_cliente` se captura como cifra
   **anual** (lo más común en reportes financieros) mientras el resto del
   CFF opera en base mensual (confirmado en 4.0), `Costo_retrabajo` sería el
   único de los 4 componentes con una inconsistencia de unidad real —
   pendiente de verificar contra el formulario real de Ficha financiera
   (fuera del alcance de esta sesión), no confirmado como bug, solo
   señalado como hueco de especificación análogo al que se sospechaba
   (equivocadamente) para `Costo_rotación`/`Costo_desenganche`.

Ninguno de estos puntos es una razón para descartar 20%/40%/60% — son
huecos de especificación que existían antes de este ejercicio y que este
ejercicio simplemente hizo visibles con números concretos.
