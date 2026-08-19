# Investigación — costo legal de desvinculación, Fase 2: países adicionales de Latinoamérica

Fecha de la investigación: 2026-08-19.

Este documento complementa la sección 5 de `INVESTIGACION_DATOS_CALIBRACION_CFF.md`
(costo legal de desvinculación en Colombia, Código Sustantivo del Trabajo art. 64),
que alimenta el motor CFF (Costo Financiero de la Fricción) de EFICIENCIA —
sección 8 de `DOCUMENTO_MARCO_SISTEMA_EFICIENCIA.md`. Cubre la fórmula legal de
indemnización por despido injustificado en 9 países adicionales: México, Perú,
Chile, Argentina, Ecuador, Venezuela, Costa Rica, Panamá y Guatemala.

Regla seguida en toda la investigación, igual que en Colombia: solo se
documentan fórmulas con fuente citable (texto legal o análisis jurídico
serio). Ningún número o fórmula fue inventado ni extrapolado de otro país.
Cuando una fuente secundaria no confirma un dato con una segunda fuente
independiente, o cuando el texto legal primario no se pudo consultar
directamente, se señala explícitamente. Ver nota de arquitectura sobre el
campo `país` (aún inexistente en el esquema de `organizaciones`) en
`INVESTIGACION_DATOS_CALIBRACION_CFF.md` — no se repite aquí.

---

## México

**Norma vigente:** Ley Federal del Trabajo (LFT), artículo 50 — "Las
indemnizaciones a que se refiere el artículo anterior [despido injustificado,
art. 49] consistirán en...". Fuente primaria: texto de la LFT publicado por
la Cámara de Diputados (diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf), confirmado
por leyes-mx.com, conceptosjuridicos.com y sdv.com.mx (2026, coincidentes).

### Contrato por tiempo indeterminado (indefinido)

| Componente | Cifra |
|---|---|
| Indemnización por despido injustificado | 20 días de salario por cada año de servicio |
| Componente adicional obligatorio (art. 49) | 3 meses de salario |
| Prima de antigüedad (art. 162, separada de la indemnización) | 12 días de salario por año de servicio |

### Contrato por tiempo determinado (plazo fijo)

| Duración del contrato | Indemnización |
|---|---|
| Menor de 1 año | Salarios de la mitad del tiempo de servicios prestados |
| Mayor de 1 año | 6 meses de salario por el primer año + 20 días de salario por cada año subsiguiente |

**Nota — art. 51:** el trabajador puede rescindir el contrato por causa
imputable al patrón (falta de pago, reducción de salario, malos tratos,
violencia) y cobrar la misma indemnización que un despido injustificado (3
meses + 20 días/año) — funcionalmente equivalente a un despido injustificado
iniciado por el trabajador, no un componente adicional distinto.

**Estructura:** indemnización por antigüedad + prima de antigüedad como
componente separado obligatorio — mismo patrón dual que Panamá (ver abajo),
distinto del modelo colombiano de un solo pago.

---

## Perú

**Norma vigente:** Decreto Supremo 003-97-TR (Texto Único Ordenado del
Decreto Legislativo 728, Ley de Productividad y Competitividad Laboral),
artículo 38 — indemnización por despido arbitrario. Fuente primaria: DS
003-97-TR (texto vía lpderecho.pe, actualizado 2026), confirmado por
finiquitojusto.com y buk.pe (secundarias de derecho laboral peruano).

| Tipo de contrato | Indemnización | Tope |
|---|---|---|
| Indeterminado (indefinido) | 1.5 remuneraciones mensuales por cada año completo de servicio | 12 remuneraciones |
| Plazo fijo (sujeto a modalidad) | 1.5 remuneraciones por cada mes que falte para el vencimiento del contrato | 12 remuneraciones |

Fracciones de año se pagan por dozavos y treintavos. Aplica solo después de
superado el período de prueba. Sin régimen transitorio documentado en las
fuentes consultadas — la fórmula del DS 003-97-TR es la vigente sin cambios
recientes señalados.

**Estructura:** indemnización simple por antigüedad, con el tope absoluto (12
remuneraciones) más bajo de todos los países investigados en términos de
techo — comparable en función al tope de 11 años de Chile, pero expresado en
meses fijos en vez de años de servicio.

---

## Chile

**Norma vigente:** Código del Trabajo, artículo 163 — "Indemnización por años
de servicio". Fuente primaria: Dirección del Trabajo (dt.gob.cl, texto
oficial), confirmado por tributariolaboral.cl, derechopedia.cl y Adecco Chile
(secundarias).

| Componente | Cifra |
|---|---|
| Indemnización por años de servicio | 30 días de la última remuneración mensual por cada año de servicio y fracción superior a 6 meses |
| Tope | 11 años de servicio (máximo 330 días / 11 meses de remuneración) |
| Tope de remuneración base | 90 UF mensuales — el sueldo que excede esto no se computa |
| Aviso previo (art. 161/162) | 30 días de anticipación, o indemnización sustitutiva compatible con la de años de servicio |

### Contrato a plazo fijo

Al vencimiento natural del plazo pactado (art. 159), el trabajador **no**
tiene derecho a indemnización por años de servicio. Si el empleador termina
el contrato antes del plazo sin causa legal, la jurisprudencia chilena
(no una fórmula tabulada en el Código) ha reconocido el derecho a las
remuneraciones que restaban hasta el vencimiento, bajo la figura de lucro
cesante (reglas de derecho común, no una tabla laboral específica) — señalado
explícitamente porque, a diferencia de Colombia/Perú, esto no es una fórmula
legal fija sino una construcción jurisprudencial.

---

## Argentina

**Norma vigente:** Ley de Contrato de Trabajo (LCT), artículo 245 —
"Indemnización por antigüedad o despido". **Modificado recientemente por la
Ley 27.802 ("Ley de Modernización Laboral"), publicada en el Boletín Oficial
el 6 de marzo de 2026** — vigente desde su publicación. Fuente primaria:
Boletín Oficial de la República Argentina e InfoLEG; confirmado por
abogados.com.ar, iprofesional.com y garciaalonso.com.ar.

| Componente | Cifra |
|---|---|
| Indemnización por despido sin causa | 1 mes de sueldo por cada año de servicio o fracción mayor a 3 meses |
| Base de cálculo | Mejor remuneración mensual, normal y habitual, del último año o del tiempo de servicio si es menor |
| Mínimo | 1 mes de sueldo |

**Cambio de la Ley 27.802, con advertencia explícita de estabilidad
normativa:** la base de cálculo ahora excluye expresamente el Sueldo Anual
Complementario (SAC/aguinaldo) y los premios no mensuales, reduciendo en la
práctica la base sobre la que opera el multiplicador de antigüedad. Se creó
además un Fondo de Asistencia Laboral (FAL) para coadyuvar al pago de estas
indemnizaciones. **Una de las fuentes secundarias consultadas (iprofesional)
señala explícitamente que "hay cierta discusión sobre los alcances exactos"
de la reforma** — a diferencia de los demás países de este documento, la
norma argentina tiene menos de 6 meses de vigencia al momento de esta
investigación (2026-08-19) y su aplicación práctica todavía no está
completamente asentada. Tratar como el dato con mayor riesgo de quedar
desactualizado de todo este documento.

**Fondo de cese laboral (opcional, vía convenio colectivo):** las partes
pueden sustituir el régimen indemnizatorio por un fondo con aporte patronal
mensual de hasta 8% de la remuneración computable — el único país
investigado con una alternativa de fondo **explícitamente opcional** (no
obligatoria como en Venezuela) habilitada por ley.

---

## Ecuador

**Norma vigente:** Código del Trabajo, artículo 188 — indemnización por
despido intempestivo. Fuente primaria: Código del Trabajo, complementado por
la Resolución 02-2025 de la Corte Nacional de Justicia (jurisprudencia
obligatoria sobre el cálculo). Confirmado por Defensoría Pública del Ecuador
(defensoria.gob.ec) y derechoecuador.com.

| Antigüedad | Indemnización |
|---|---|
| Hasta 3 años de servicio | 3 meses de remuneración |
| Más de 3 años | 1 mes de remuneración por cada año de servicio |
| Tope | 25 meses de remuneración |

Cualquier fracción de año se considera año completo (a favor del trabajador,
no proporcional como en la mayoría de los demás países). Base de cálculo: la
última remuneración recibida, o la del mes anterior si es más favorable
(criterio fijado por la Resolución 02-2025, para no perjudicar al trabajador
por variaciones salariales en el último mes).

**Estructura:** el tope de 25 meses es el más alto en términos absolutos de
todos los países investigados — muy por encima del tope de 12 remuneraciones
de Perú o los ~11 meses de Chile.

---

## Venezuela

**Norma vigente:** Ley Orgánica del Trabajo, los Trabajadores y las
Trabajadoras (LOTTT), artículos 92 y 142. Fuente primaria: texto de la LOTTT
(vía tugacetaoficial.com y sistematemis.com), confirmado por Nayma
Consultores y Díaz Pino & Asociados (firmas de derecho laboral venezolano).

**Sistema estructuralmente distinto a Colombia — fondo acumulativo, no pago
único calculado al momento del despido:**

### Art. 142 — Garantía de prestaciones sociales (aplica siempre, cualquier causa de terminación)

| Mecanismo | Cómo funciona |
|---|---|
| Depósito trimestral (garantía) | El empleador deposita 15 días de salario por cada trimestre trabajado, calculado sobre el último salario devengado, desde el inicio del trimestre |
| Incremento por antigüedad | +2 días de salario por cada año después del primer año, acumulativo hasta 30 días |
| Cálculo retroactivo alternativo | Al terminar la relación laboral, se calcula también 30 días por año de servicio (o fracción superior a 6 meses) sobre el último salario |
| Regla de pago | El trabajador recibe el monto MAYOR entre el fondo de garantía acumulado y el cálculo retroactivo |

### Art. 92 — Indemnización adicional SOLO si el despido es injustificado

Si el despido es injustificado (sin causal probada del art. 79), el
trabajador recibe una indemnización **adicional** equivalente al monto
completo de las prestaciones sociales ya calculadas por el art. 142 — en la
práctica, el doble del monto (conocido como "el doblete" en las fuentes
consultadas).

**Por qué es estructuralmente distinto:** Venezuela es el único de los 10
países investigados (Colombia incluida) donde parte de la obligación del
empleador se acumula **periódicamente durante toda la relación laboral**
(depósitos trimestrales, como un fondo de cesantías) en vez de calcularse
una sola vez al momento del despido. La indemnización "extra" por despido
injustificado (art. 92) es, además, la única de todos los países investigados
que se define como un múltiplo directo de otra prestación (100% adicional),
no como una tabla propia por antigüedad/salario.

---

## Costa Rica

**Norma vigente:** Código de Trabajo, artículo 29 (auxilio de cesantía) y
artículo 28 (preaviso). Fuente primaria: Ministerio de Trabajo y Seguridad
Social (mtss.go.cr, texto oficial del Código de Trabajo), complementado por
fuentes secundarias especializadas (Alegra, AG Legal, finiquitojusto.com,
BGA Corp — todas 2026, coincidentes en la existencia del tope de 8 años).

| Antigüedad | Cesantía (aproximado, escala progresiva no lineal) |
|---|---|
| 3-6 meses | 7 días totales |
| 6 meses-1 año | 14 días totales |
| Por cada año adicional (años 1 a 8) | Entre ~19.5 y ~22 días por año, creciente por tramos (no una tasa fija) |
| Tope | 8 años de cálculo — máximo aproximado de 167-172 días de salario, sin importar si la antigüedad real es mayor |

**Advertencia de calidad de fuente:** la tabla exacta día por día de arriba
proviene de una sola fuente secundaria (finiquitojusto.com) resumida por una
herramienta de extracción automática — el tope de 8 años y la existencia de
una escala progresiva (no lineal, a diferencia de Colombia/México) están
confirmados por múltiples fuentes, pero **los valores exactos de días por
año individual deben verificarse contra el texto oficial del artículo 29
antes de usarse en producción o en cualquier cálculo que se muestre a un
cliente.**

**Preaviso (art. 28):** entre 1 semana y 1 mes según antigüedad, con tope de
1 mes sin importar si el trabajador lleva 2 o 20 años — el preaviso más
"aplanado" (menos sensible a la antigüedad) de todos los países investigados.

**Contrato a plazo fijo:** la terminación en la fecha de vencimiento natural
NO genera derecho a cesantía. Solo aplica si el empleador termina antes del
plazo pactado.

---

## Panamá

**Norma vigente:** Código de Trabajo, artículo 225 (indemnización por
despido injustificado) y artículos 224/226 (prima de antigüedad, concepto
legal separado). Fuente primaria referenciada: Código de Trabajo de Panamá
(vía laboremia.com; el texto en jurisis.procuraduria-admon.gob.pa apareció en
la búsqueda pero no se consultó directamente). Confirmado por dos fuentes
secundarias independientes coincidentes en la escala exacta: finiquitojusto.com
y toptrabajos.com.

### Indemnización por despido injustificado (art. 225)

| Antigüedad | Indemnización |
|---|---|
| Menos de 1 año | 1 semana de salario por cada 3 meses trabajados, mínimo 1 semana |
| 1 a 10 años | 3.4 semanas de salario por año |
| Más de 10 años | 3.4 semanas × 10 años + 1 semana de salario por cada año adicional |

No acumulable con otras escalas; se paga proporcionalmente si no se completa
un año.

### Prima de antigüedad (art. 224/226) — componente separado, independiente de la causa

| Componente | Cifra |
|---|---|
| Prima de antigüedad | 1 semana de salario por cada año trabajado |
| Aplica a | Solo contratos por tiempo indefinido |
| Se paga | Al terminar la relación laboral, **por cualquier causa** (no solo despido injustificado) |
| Contratos por tiempo definido | Explícitamente excluidos de este beneficio |

**Estructura:** mismo patrón dual que México (indemnización por antigüedad +
prima de antigüedad como componente separado), pero en Panamá la prima aplica
siempre (cualquier causa de terminación), mientras que en México la prima de
antigüedad también aplica en renuncia voluntaria con ≥15 años o jubilación,
no solo despido — matiz no verificado a fondo para México en este documento,
señalado para no asumir equivalencia exacta entre ambos países.

**Vacío:** no se pudo confirmar el texto legal primario exacto de forma
directa (solo referenciado, no accedido) — recomendado verificar contra el
Código de Trabajo de Panamá antes de usar en producción, aunque la escala
numérica sí está confirmada por dos fuentes secundarias independientes.

---

## Guatemala

**Norma vigente:** Código de Trabajo, artículo 82 — indemnización por despido
injustificado. Fuente primaria: Código de Trabajo de Guatemala (vía
jurista.com.gt), confirmado por conceptosjuridicos.com, conservisabogados.com
y asesoriaglobal.com.gt (secundarias de derecho laboral guatemalteco,
coincidentes).

| Componente | Cifra |
|---|---|
| Indemnización por despido injustificado | 1 mes de salario por cada año de servicio continuo |
| Servicio menor a 1 año | Proporcional al tiempo trabajado |
| Base de cálculo | Promedio de los últimos 6 meses de salario |
| Requisito | Contrato indefinido + más de 3 meses de servicio continuo (período de prueba superado) |

**Vacío confirmado:** ninguna de las fuentes consultadas menciona un tope
máximo de años/meses para esta indemnización — a diferencia de Perú (12
remuneraciones), Chile (11 años) o Ecuador (25 meses), que sí tienen techo
explícito. No se puede afirmar que Guatemala no tenga tope (podría no estar
documentado en las fuentes de divulgación general consultadas, que priorizan
explicar el cálculo básico) — se marca como vacío, no como "sin tope
confirmado por ley".

No se encontró información sobre un régimen distinto para contrato a plazo
fijo en las fuentes consultadas — vacío, no se investigó a fondo por quedar
fuera del foco principal de esta búsqueda.

---

## Comparación estructural

| País | Tipo de sistema | Diferencia más importante respecto a Colombia |
|---|---|---|
| Colombia | Indemnización por antigüedad (tabla por SMLMV) | — (referencia base) |
| México | Indemnización por antigüedad + prima de antigüedad separada | Dos componentes obligatorios en vez de uno; la prima de antigüedad es un concepto legal aparte (art. 162) |
| Perú | Indemnización por antigüedad, tope en remuneraciones (no años) | Tope absoluto de 12 remuneraciones, el techo más bajo de la región en términos de meses |
| Chile | Indemnización por antigüedad, tope en años de servicio | Tope de 11 años + tope de remuneración base (90 UF) que Colombia no tiene |
| Argentina | Indemnización por antigüedad, con opción de fondo de cese vía convenio colectivo | Único con alternativa de fondo explícitamente opcional; reforma de marzo 2026 todavía inestable |
| Ecuador | Indemnización por antigüedad, tope en meses | Tope de 25 meses, el más alto de la región; fracción de año siempre cuenta como año completo |
| Venezuela | **Fondo acumulativo (depósito trimestral) + indemnización adicional si es injustificado** | Estructuralmente el más distinto: parte de la obligación se acumula durante toda la relación laboral, no se calcula solo al despido; el "doblete" del art. 92 no tiene equivalente en Colombia |
| Costa Rica | Indemnización por antigüedad, escala progresiva no lineal, tope en años | Tabla no lineal (días por año crecientes por tramos) vs. la fórmula lineal de Colombia; tope de 8 años |
| Panamá | Indemnización por antigüedad (en semanas) + prima de antigüedad separada | Mismo patrón dual que México; la prima aplica a cualquier causa de terminación, no solo despido injustificado |
| Guatemala | Indemnización por antigüedad simple | El más simple estructuralmente (un solo componente, una sola tasa); sin tope confirmado en las fuentes consultadas |

**Ningún país investigado (los 9 nuevos + Colombia) resultó tener un régimen
de "empleo a voluntad" (at-will) sin indemnización obligatoria** — los 10
tienen alguna forma de compensación legal obligatoria por despido sin causa
justa, aunque con estructuras, topes y componentes muy distintos entre sí.

---

## Países sin fuente confiable encontrada o con hallazgos débiles

- **Argentina** — la fórmula base (1 mes por año, mínimo 1 mes) está bien
  confirmada, pero la reforma de la Ley 27.802 (marzo 2026) es reciente y una
  fuente secundaria señala explícitamente incertidumbre sobre sus alcances
  exactos. Es el dato con mayor riesgo de quedar desactualizado de todo el
  documento — revisar de nuevo antes de usar en producción.
- **Costa Rica** — el tope de 8 años y la naturaleza progresiva (no lineal)
  de la escala están confirmados por múltiples fuentes, pero los valores
  exactos día-por-año de la tabla provienen de una sola fuente secundaria
  procesada automáticamente. Verificar contra el texto oficial del art. 29
  antes de usar los números exactos en cualquier cálculo mostrado a un
  cliente.
- **Panamá** — la escala de 3.4 semanas/año está confirmada por dos fuentes
  secundarias independientes coincidentes, pero no se accedió directamente al
  texto legal primario (solo se referenció). Verificar contra el Código de
  Trabajo antes de producción.
- **Guatemala** — no se encontró tope máximo en ninguna fuente consultada;
  tratado como vacío explícito, no como ausencia confirmada de tope legal.
  Tampoco se investigó el régimen de contrato a plazo fijo.
- **Centroamérica, cobertura:** se investigaron Costa Rica, Panamá y
  Guatemala, los 3 originalmente solicitados — no fue necesario sustituir
  ninguno por falta de fuentes, aunque Guatemala y Panamá quedaron con más
  vacíos que Costa Rica.

Todos los demás países (México, Perú, Chile, Ecuador, Venezuela) tienen su
fórmula principal confirmada por al menos 2 fuentes secundarias independientes
coincidentes, además de referencia al texto legal primario.
