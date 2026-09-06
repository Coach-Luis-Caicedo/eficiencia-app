# EFICIENCIA
## Sistema de Inteligencia Relacional para la Productividad Organizacional

# DOCUMENTO TÉCNICO OFICIAL
## Instrumento ICE–IEH
### Índice de Coherencia Estructural — Índice de Experiencia Humana

**Versión canónica del instrumento — v2**

> Nota de versión: esta versión incorpora, ya resueltas, las inconsistencias
> detectadas en la auditoría del sistema transversal (numeración local vs.
> global, colisión de códigos de sensor entre variables, tratamiento de
> preguntas que exceden los tres sensores por variable, normalización por
> tipo de ítem). El tono narrativo de reconstrucción del proceso se
> mantiene deliberadamente — la limpieza editorial hacia un tono
> puramente normativo queda pospuesta hasta después del piloto, cuando el
> contenido del instrumento deje de cambiar (ver sección 10).

---

## Naturaleza del documento

El presente documento establece la definición, arquitectura conceptual,
estructura de medición, criterios de aplicación, procesamiento, cálculo e
interpretación del instrumento ICE–IEH, desarrollado como parte del modelo
EFICIENCIA.

Constituye el documento técnico oficial de referencia para la comprensión,
aplicación, desarrollo, validación y evolución controlada del instrumento.

Su contenido establece:

- la definición y función de ICE e IEH;
- el origen y fundamento de las variables que los conforman;
- las definiciones y funciones de las diez variables;
- los sensores establecidos para observar cada variable;
- la función diagnóstica de cada sensor;
- la arquitectura de los cinco bloques de evaluación;
- las 31 preguntas que conforman el instrumento, con su **numeración
  canónica global** (nueva en esta versión — resuelve la ambigüedad
  local/global de la versión anterior);
- los criterios de aplicación y respuesta;
- las reglas de procesamiento y cálculo — **cerradas en esta versión**
  para todo lo que no depende de datos del piloto (sección 8);
- los criterios de contraste entre ICE e IEH;
- los niveles y límites de interpretación de la evidencia;
- los procedimientos de profundización y triangulación;
- y los criterios de validación, trazabilidad y control de versiones.

Este documento diferencia expresamente entre los componentes que
constituyen definiciones y decisiones vigentes del instrumento y aquellos
parámetros cuya determinación definitiva requiere validación empírica
(ver sección 10, tabla de estado).

---

## 1. ICE–IEH

### 1.1 Definición

ICE–IEH es el instrumento diagnóstico de EFICIENCIA que permite observar y
contrastar las condiciones que genera el Sistema organizacional con la
experiencia que desarrollan las Personas al participar dentro de ellas.

El instrumento examina dos planos diferentes y complementarios de una
misma realidad organizacional.

El **Índice de Coherencia Estructural (ICE)** observa el Sistema
organizacional desde la configuración y funcionamiento de las condiciones
que la Organización establece para hacer posible la acción colectiva.

El **Índice de Experiencia Humana (IEH)** observa esa realidad desde la
experiencia de las Personas que participan dentro del sistema.

La relación fundamental del instrumento es:

**SISTEMA ↔ EXPERIENCIA**

EFICIENCIA no presupone que aquello que la Organización diseña, declara o
procura producir sea necesariamente equivalente a aquello que las Personas
experimentan. Por esta razón, ICE e IEH conservan identidades analíticas
diferenciadas. Su valor diagnóstico surge tanto de conocer cada plano como
de contrastar la relación existente entre ambos.

### 1.2 Función del instrumento

ICE–IEH tiene como función detectar condiciones del Sistema organizacional
que pueden favorecer o dificultar la participación de las Personas y
reconocer cómo esas condiciones se manifiestan en su experiencia.

El instrumento no tiene como finalidad emitir, por sí solo, explicaciones
causales definitivas. Su primera función es detectar señales. Estas
señales permiten localizar dónde existe suficiente evidencia para
contrastar, profundizar y orientar el diagnóstico.

La lógica de utilización es:

**MEDIR → DETECTAR → CONTRASTAR → PROFUNDIZAR → DIAGNOSTICAR → INTERVENIR → VOLVER A MEDIR**

Por esta razón, ICE–IEH forma parte de un sistema diagnóstico y no debe
interpretarse como un cuestionario aislado.

---

## 2. Arquitectura conceptual

### 2.1 El acróstico EFICIENCIA

La arquitectura del instrumento se origina en el acróstico EFICIENCIA. Cada
una de sus diez letras identifica una variable. Las variables se organizan
en cinco pares que confrontan el plano sistémico con el plano experiencial:

| Bloque | ICE — Sistema | IEH — Experiencia | Núcleo de observación |
|---|---|---|---|
| I | Estructura | Fortaleza | Condiciones |
| II | Intención | Coherencia | Veracidad |
| III | Impacto | Equilibrio | Intercambio |
| IV | Nexo | Confianza | Vínculo |
| V | Integración | Actitud | Trascendencia |

De esta arquitectura surge una lectura integral:

**CONDICIONES → VERACIDAD → INTERCAMBIO → VÍNCULO → TRASCENDENCIA**

Esta secuencia organiza la observación del instrumento. No constituye una
cadena causal rígida. Cada bloque examina un aspecto diferente de la
participación de la Persona dentro del Sistema organizacional.

### 2.2 Variables, sensores y preguntas

ICE–IEH diferencia tres niveles que no deben confundirse:

- **Variable** — Constructo del modelo que se pretende conocer.
- **Sensor** — Aspecto específico de la variable cuya observación permite
  obtener información diferenciada sobre ella.
- **Pregunta** — Reactivo diseñado para obtener evidencia relacionada con
  uno o más aspectos que el sensor debe observar.

La arquitectura básica es:

**VARIABLE → SENSOR → PREGUNTA → RESPUESTA → SEÑAL**

Cada variable cuenta, en diseño, con tres sensores: 10 variables × 3
sensores = 30 sensores. El número de sensores no determina automáticamente
el número de preguntas. El cuestionario oficial está compuesto por **31
preguntas**, distribuidas entre los cinco bloques según la cobertura
diagnóstica requerida:

**Una pregunta se conserva cuando aporta información necesaria y
diferenciada. Una pregunta redundante no se justifica únicamente para
mantener el mismo número de reactivos entre variables o bloques.**

**Estado real de instanciación de sensores (corregido en esta versión):**
de los 30 sensores previstos por diseño, **24 tienen nombre, objeto y
pregunta asignada** — exactamente 6 por bloque (3 del lado ICE + 3 del
lado IEH) en cada uno de los **Bloques I–IV**. Los **6 sensores
conceptuales del Bloque V** (los 3 de Integración y los 3 de Actitud)
no cuentan con evidencia conversacional suficiente para nombrarlos sin
fabricar una denominación retrospectiva (ver sección 7.3 y 7.9). Esto no
es un error de diseño: es una arquitectura con cobertura parcial en
Bloque V — las 4 preguntas P28–P31 sí operacionalizan objetos de
observación concretos, solo que sin mapeo 1:1 a un sensor nombrado —
declarada explícitamente, pendiente de completarse si el piloto lo
justifica.

### 2.3 Numeración canónica — local y global

Cada bloque numera sus preguntas de forma local (P1–P7, P1–P7, P1–P7,
P1–P6, P1–P4). Para evitar ambigüedad en cualquier referencia transversal
(cálculo, base de datos, reportes), este documento fija además una
**numeración global P1–P31**, acumulada por bloque:

| Bloque | Preguntas | Rango global |
|---|---|---|
| 1 — Estructura↔Fortaleza | 7 | P1–P7 |
| 2 — Intención↔Coherencia | 7 | P8–P14 |
| 3 — Impacto↔Equilibrio | 7 | P15–P21 |
| 4 — Nexo↔Confianza | 6 | P22–P27 |
| 5 — Integración↔Actitud | 4 | P28–P31 |
| **Total** | **31** | **P1–P31** |

Toda referencia futura a una pregunta específica (en código, en reportes,
en discusión técnica) debe usar el número **global**. El número local se
conserva únicamente para la lectura dentro de cada bloque.

### 2.4 Códigos de sensor

Cada sensor recibe un código único de la forma `{PREFIJO}-{número}`, sin
colisión entre variables (corrección respecto de versiones previas, donde
`E1/E2/E3`, `I1/I2/I3` y `C1/C2/C3` se reutilizaban entre variables
distintas):

| Variable | Prefijo |
|---|---|
| Estructura | `EST` |
| Fortaleza | `FOR` |
| Intención | `INE` |
| Coherencia | `COH` |
| Impacto | `IMP` |
| Equilibrio | `EQU` |
| Nexo | `NEX` |
| Confianza | `CNF` |
| Integración | `ITG` |
| Actitud | `ACT` |

Las preguntas de contraste o síntesis que no pertenecen a ninguna variable
individual usan el prefijo `IND` (ver sección 8.2): `IND-EF` (Bloque 1),
`IND-IC` (Bloque 2).

---

## 3. Bloque I — Estructura ↔ Fortaleza

### 3.1 Objeto del bloque

El primer bloque observa las condiciones bajo las cuales las Personas
participan en la Organización. Su pregunta fundamental es:

**¿En qué condiciones participo?**

- La Estructura observa esas condiciones desde el Sistema organizacional.
- La Fortaleza las observa desde la experiencia de la Persona.

Por tanto, **ESTRUCTURA ↔ FORTALEZA** constituye una relación de contraste
entre condición sistémica y experiencia humana. La Estructura establece
condiciones; las Personas participan dentro de ellas; Fortaleza permite
conocer qué representan esas condiciones para quienes las experimentan.

### 3.2 Estructura — definición

**Estructura** — Conjunto organizado de elementos creados por las Personas
para ordenar y coordinar su acción dentro de la Organización.

**Función** — La Estructura tiene por función organizar y coordinar la
acción de las Personas y conciliar las necesidades que concurren en el
sistema, estableciendo las condiciones bajo las cuales se desarrolla su
participación en la dinámica relacional.

**Definición como variable del ICE** — Estructura es la variable del ICE
que permite conocer en qué medida la configuración del Sistema
organizacional cumple su función de organizar y coordinar la acción de las
Personas y conciliar las necesidades que concurren en él.

### 3.3 Sensores de Estructura

**EST-1 — Organización.** Observa si la configuración de la Organización
permite claridad sobre la acción y la responsabilidad de las Personas.
*Pregunta (global P1):* ¿Cada Persona sabe lo que debe hacer y de qué es
responsable?

**EST-2 — Coordinación.** Observa si la configuración permite articular la
acción de unas Personas con otras. *Pregunta (global P2):* ¿Cada Persona
sabe bien cómo debe trabajar con los demás?

**EST-3 — Conciliación.** Observa si la configuración de la Organización
considera las necesidades que concurren en el sistema. *Pregunta (global
P3):* ¿La forma en que está organizada la empresa tiene en cuenta sus
propias necesidades y también las de las Personas?

**Fundamento técnico de los tres sensores:** proceden directamente de la
función de la Estructura — ORGANIZAR → Organización, COORDINAR →
Coordinación, CONCILIAR → Conciliación. No se seleccionaron tres
dimensiones generales de "estructura organizacional"; se identificaron las
tres funciones que EFICIENCIA le atribuye y se construyeron sensores
capaces de obtener señales diferenciadas sobre su cumplimiento. ICE no
pretende una auditoría exhaustiva del diseño organizacional — busca
identificar si la configuración genera las condiciones fundamentales para
organizar, coordinar y conciliar.

### 3.4 Fortaleza — definición

**Fortaleza** — Variable del IEH que permite conocer en qué medida, desde
su experiencia, la Persona reconoce el Sistema organizacional como un
entorno que le ofrece protección y condiciones para crecer.

**Función** — Observar cómo las condiciones generadas por el Sistema
organizacional son reconocidas por la Persona en términos de seguridad,
cuidado y valoración.

### 3.5 Sensores de Fortaleza

**FOR-1 — Seguridad.** *Pregunta (global P4):* ¿Siento que esta empresa es
para mí un lugar seguro?

**FOR-2 — Cuidado.** *Pregunta (global P5):* ¿Siento que a esta empresa mis
necesidades le importan?

**FOR-3 — Valoración.** *Pregunta (global P6):* ¿Siento que esta empresa me
valora por lo que soy, y no solo por lo que hago?

### 3.6 P7 (global) — correspondencia Estructura ↔ Fortaleza

Código: **`IND-EF`**. No es un sensor adicional; tampoco pertenece
exclusivamente a Estructura o a Fortaleza. Fue diseñada como pregunta
independiente para observar la correspondencia percibida entre ambos
planos.

*Encabezado:* ¿Cuál de estas afirmaciones se acerca más a lo que creo
sobre esta empresa?

*Escala:*
1. Está bien organizada, pero no me siento seguro, cuidado ni valorado.
2. Me acerco más a la situación 1.
3. No encuentro diferencia entre cómo está organizada y cómo me siento en ella.
4. Me acerco más a la situación 5.
5. Tiene problemas de organización, pero me siento seguro, cuidado y valorado.

**Naturaleza del ítem:** bipolar-direccional. No mide "más" o "menos"
Estructura ni "más" o "menos" Fortaleza — mide la dirección de la
correspondencia o discrepancia percibida entre ambos planos. Esto la
distingue de la pregunta de síntesis del Bloque 2 (P14 global,
unidireccional) — ver sección 8.4, donde se corrige el tratamiento
uniforme incorrecto que versiones previas de este documento aplicaban a
ambas.

**Función técnica de P7 / `IND-EF`:** independiente. No entra en el
promedio de Estructura. No entra en el promedio de Fortaleza. La
arquitectura del bloque es:

- P1–P3 (`EST-1/2/3`) → Estructura
- P4–P6 (`FOR-1/2/3`) → Fortaleza
- Brecha Estructura–Fortaleza → contraste cuantitativo entre variables
- P7 (`IND-EF`) → percepción directa de correspondencia entre ambas

Esto proporciona dos vías diferentes de contraste: una se calcula a partir
de las respuestas de los sensores (**contraste derivado**); la otra se
pregunta directamente a la Persona (**correspondencia percibida**).
`CONTRASTE DERIVADO ≠ CORRESPONDENCIA PERCIBIDA` — la distinción se
conserva porque permite estudiar si ambos resultados convergen, divergen o
se contradicen, sin obligarlos matemáticamente a producir la misma
conclusión.

### 3.7 Matriz canónica del Bloque 1

| Global | Local | Plano | Variable | Código | Sensor/función | Reactivo |
|---|---|---|---|---|---|---|
| P1 | P1 | ICE | Estructura | `EST-1` | Organización | ¿Cada Persona sabe lo que debe hacer y de qué es responsable? |
| P2 | P2 | ICE | Estructura | `EST-2` | Coordinación | ¿Cada Persona sabe bien cómo debe trabajar con los demás? |
| P3 | P3 | ICE | Estructura | `EST-3` | Conciliación | ¿La forma en que está organizada la empresa tiene en cuenta sus propias necesidades y también las de las Personas? |
| P4 | P4 | IEH | Fortaleza | `FOR-1` | Seguridad | ¿Siento que esta empresa es para mí un lugar seguro? |
| P5 | P5 | IEH | Fortaleza | `FOR-2` | Cuidado | ¿Siento que a esta empresa mis necesidades le importan? |
| P6 | P6 | IEH | Fortaleza | `FOR-3` | Valoración | ¿Siento que esta empresa me valora por lo que soy, y no solo por lo que hago? |
| P7 | P7 | Contraste | Estructura↔Fortaleza | `IND-EF` | Correspondencia percibida (bipolar) | ¿Cuál de estas afirmaciones se acerca más a lo que creo sobre esta empresa? |

### 3.8 Fundamentos técnicos que deben conservarse

1. La Estructura se observa por su función, no por inventario de
   componentes. El instrumento no pregunta cuántos procesos, cargos o
   procedimientos existen; observa si la configuración logra organizar,
   coordinar y conciliar.
2. Fortaleza no duplica Estructura — cambia el plano de observación:
   Seguridad, Cuidado y Valoración permiten conocer cómo son reconocidas
   las condiciones desde la experiencia de la Persona.
3. Sensor y pregunta son categorías distintas: el sensor establece qué
   debe observarse; el reactivo establece cómo obtener evidencia sobre
   ello.
4. `IND-EF` no es un séptimo sensor. Es una pregunta independiente de
   correspondencia.
5. La resolución matemática (agregación, normalización, ponderación,
   construcción de brechas) se resuelve de manera transversal para los
   cinco bloques en la sección 8 de este documento.

---

## 4. Bloque II — Intención ↔ Coherencia

### 4.1 Objeto del bloque

El segundo bloque observa la relación entre lo que la Organización declara
sobre sí misma y aquello que efectivamente hace reconocible mediante su
configuración, comunicación y actuación. Su pregunta fundamental es:

**¿Puedo creer en lo que esta Organización dice ser?**

El núcleo del bloque es **VERACIDAD**. Intención observa el problema desde
el Sistema organizacional; Coherencia lo observa desde la experiencia de
la Persona.

### 4.2 Intención — definición

**Intención** — Variable del ICE que permite conocer en qué medida la
configuración y el funcionamiento de la Organización son consistentes con
lo que declara sobre su propósito, visión, principios, valores e
identidad.

**Función** — Medir si la configuración y el funcionamiento de la
Organización son consistentes con lo que declara sobre sí misma y si
aquello que declara se traduce en referencias reconocibles para orientar
su actuación.

Decisión expresa: la Organización tiene la obligación de comunicar con
claridad e intención su identidad, propósito y valores. Este elemento no
es accesorio — si una Organización declara determinados principios pero
las Personas no pueden comprender qué significan para su actuación, la
declaración posee capacidad limitada para orientar la acción colectiva.

### 4.3 Sensores de Intención

Se numeran `INE-1`, `INE-2`, `INE-3` describiendo exactamente su objeto,
sin atribuir retrospectivamente una denominación histórica no confirmada.

**INE-1.** Objeto: correspondencia entre el propósito de la Organización y
su configuración. *Pregunta (global P8):* La empresa está organizada para
cumplir su propósito.

**INE-2.** Objeto: traducción de visión, principios y valores en
orientación para la actuación. *Pregunta (global P9):* ¿Esta empresa me ha
enseñado cómo actuar de acuerdo con su visión, principios y valores?

**INE-3.** Objeto: manifestación de la identidad en la actuación
organizacional. *Pregunta (global P10):* ¿La identidad de esta empresa se
nota en sus acciones?

**Fundamento técnico:** durante la construcción se consideraron
alternativas como Decisión y Sostenimiento, no incorporadas como sensores
finales. La arquitectura definitiva evita evaluar la existencia formal de
misión, visión o valores; busca evidencia en tres planos: PROPÓSITO ↔
CONFIGURACIÓN, DECLARACIÓN ↔ ORIENTACIÓN PARA ACTUAR, IDENTIDAD ↔
ACCIONES.

### 4.4 Coherencia — versión oficial

**Coherencia** — Variable del IEH que permite conocer en qué medida la
Persona reconoce como verdadero aquello que la Organización declara sobre
sí misma.

**Función** — Conocer, desde la experiencia de la Persona, en qué medida
existe correspondencia entre aquello que la Organización declara ser y
aquello que la Persona reconoce en lo que vive y observa dentro de ella.

Intención mide consistencia del Sistema respecto de lo declarado;
Coherencia mide veracidad reconocida por la Persona respecto de lo
declarado. Núcleo del par: **VERACIDAD**.

### 4.5 Sensores de Coherencia

**COH-1.** Objeto: correspondencia entre declaración y experiencia.
*Pregunta (global P11):* ¿Lo que vivo en esta empresa refleja lo que ella
dice ser?

**COH-2.** Objeto: integridad reconocida. *Pregunta (global P12):*
¿Reconozco que esta empresa actúa con integridad?

**COH-3.** Objeto: contradicción entre declaración y orientación recibida.
*Pregunta (global P13):* ¿He recibido instrucciones que contradicen lo que
la empresa declara?

**`COH-3` es de dirección inversa.** Una respuesta elevada no significa
mayor Coherencia, sino mayor presencia de contradicción. Se recodifica
antes de normalizar (ver sección 8.5). No se modifica el reactivo para
evitar esta característica, porque aporta información diagnóstica
diferenciada.

### 4.6 P14 (global) — síntesis de veracidad

Código: **`IND-IC`**. *Pregunta:* ¿Creo que lo que esta empresa dice sobre
sí misma es cierto?

**Función:** produce una apreciación sintética y directa de la veracidad
reconocida por la Persona. Los seis reactivos de Intención y Coherencia
buscan señales diferenciadas; `IND-IC` pregunta directamente por el
fenómeno central: ¿puedo creer en aquello que la Organización dice ser? No
se confunde con un cuarto sensor de Coherencia — es una pregunta de
síntesis del par.

**Naturaleza del ítem:** a diferencia de `IND-EF` (Bloque 1, bipolar
direccional), `IND-IC` es un ítem de acuerdo/desacuerdo **unidireccional**
— se normaliza como un ítem normal, pero se reporta como señal
independiente, nunca se promedia dentro de Coherencia (ver sección 8.4).

### 4.7 Arquitectura definitiva del Bloque 2

| Global | Local | Plano | Variable | Código | Objeto del sensor | Reactivo |
|---|---|---|---|---|---|---|
| P8 | P1 | ICE | Intención | `INE-1` | Propósito↔configuración | La empresa está organizada para cumplir su propósito. |
| P9 | P2 | ICE | Intención | `INE-2` | Declaración↔orientación para actuar | ¿Esta empresa me ha enseñado cómo actuar de acuerdo con su visión, principios y valores? |
| P10 | P3 | ICE | Intención | `INE-3` | Identidad↔acciones | ¿La identidad de esta empresa se nota en sus acciones? |
| P11 | P4 | IEH | Coherencia | `COH-1` | Declaración↔experiencia | ¿Lo que vivo en esta empresa refleja lo que ella dice ser? |
| P12 | P5 | IEH | Coherencia | `COH-2` | Integridad reconocida | ¿Reconozco que esta empresa actúa con integridad? |
| P13 | P6 | IEH | Coherencia | `COH-3` (inversa) | Contradicción experimentada | ¿He recibido instrucciones que contradicen lo que la empresa declara? |
| P14 | P7 | Síntesis | Intención↔Coherencia | `IND-IC` | Veracidad | ¿Creo que lo que esta empresa dice sobre sí misma es cierto? |

### 4.8 Decisiones descartadas (trazabilidad)

- **Decisión** — considerada como posible sensor de Intención, descartada
  por insuficiente independencia/observabilidad.
- **Sostenimiento** — explorada, no consolidada como sensor formal.
- **Personalización de declaraciones** — rechazada por complejidad de
  aplicación; se prefirieron formulaciones universales.
- **"Corresponde"** — sustituido por "refleja" durante la curación, por
  criterio de comprensibilidad.

---

## 5. Bloque III — Impacto ↔ Equilibrio

**Núcleo: INTERCAMBIO**

### 5.1 Distribución final del bloque (7 preguntas, no 8)

Se eliminó la pregunta de **Continuidad** ("¿Lo que recibo de esta empresa
me motiva a seguir siendo parte de ella?") por solaparse con Nexo↔Confianza
y carecer de suficiente especificidad diagnóstica dentro de Equilibrio. El
Bloque 3 definitivo tiene 7 preguntas, no 8 — esto es lo que llevó el
instrumento total de 32 a 31 preguntas.

### 5.2 Impacto — definición

**Impacto** — Variable del ICE que permite conocer los efectos que las
condiciones generadas por el Sistema organizacional producen sobre la vida
de las Personas.

La Persona compromete recursos que forman parte de su propia vida: tiempo,
energía, capacidades. La Organización puede establecer condiciones que
permitan aprovechar esos recursos o condiciones que los consuman,
obstaculicen o desaprovechen. Pero el efecto no termina ahí — la
participación dentro de la Organización puede favorecer o dificultar
también otros aspectos relevantes de la vida de la Persona.

**Función** — Impacto tiene por función detectar cómo las condiciones
generadas por el Sistema organizacional inciden **sobre los recursos que
la Persona compromete** en su participación **y sobre aspectos relevantes
de su vida**. *(Nótese la doble cláusula de esta función — es la base del
tratamiento de P18/`IMP-4`, sección 5.4 y 8.3).*

Precisión metodológica: la respuesta de la Persona constituye evidencia de
su experiencia; no demuestra por sí sola la existencia objetiva de una
condición ni establece causalidad. El instrumento detecta una señal; la
atribución causal requiere profundización.

### 5.3 Sensores de Impacto

**IMP-1 — Tiempo.** *Pregunta (global P15):* ¿La forma en que funciona
esta empresa me facilita el aprovechamiento del tiempo?

**IMP-2 — Energía.** *Pregunta (global P16):* ¿Las condiciones de trabajo
me permiten enfocar mi energía en cumplir mis funciones?
*(Nota de trazabilidad: "condiciones operativas" fue sustituido por
"condiciones de trabajo" por criterio de comprensión, sin alterar el
objeto del sensor. Revisión de legibilidad posterior sustituyó "fluya
hacia" — metáfora sin anclaje concreto, mismo tipo de problema ya
corregido en el cuestionario de 25 preguntas — por "enfocar", verbo
directo que preserva el objeto observado.)*

**IMP-3 — Capacidades.** *Pregunta (global P17):* ¿Esta empresa genera
condiciones que me permiten aprovechar lo mejor de mis capacidades?

### 5.4 P18 (global) — ampliación: Vida

Código: **`IMP-4`**. *Pregunta:* ¿Ser parte de esta empresa favorece el
desarrollo de los aspectos relevantes de mi vida?

**Función:** ampliar la observación más allá de los recursos directamente
comprometidos en la actividad y detectar si la Persona reconoce que su
participación favorece o dificulta el desarrollo de otros aspectos que
considera relevantes en su vida.

**`IMP-4` no es un cuarto sensor** — la arquitectura de Impacto contempla
tres sensores conceptuales (Tiempo, Energía, Capacidades). Pero **sí es
una cuarta pregunta que entra al promedio de Impacto**, decisión cerrada
en esta versión (sección 8.3): la función de Impacto está definida en dos
cláusulas ("recursos comprometidos" **y** "aspectos relevantes de la
vida"); `IMP-4` operacionaliza directamente la segunda cláusula. Excluirla
del promedio dejaría a Impacto midiendo solo la mitad de su propia
definición. A diferencia de `IND-EF` e `IND-IC` (que observan la relación
**entre** dos variables y por eso deben excluirse para evitar
circularidad), `IMP-4` observa una sola variable — no hay riesgo de
circularidad al incluirla.

La lógica del conjunto queda: **TIEMPO → ENERGÍA → CAPACIDADES → EFECTO
AMPLIADO SOBRE LA VIDA**, y confirma la regla general: el número de
preguntas no está determinado mecánicamente por el número de sensores.

### 5.5 Equilibrio — definición

**Equilibrio** — Variable del IEH que permite conocer la reciprocidad
experimentada por la Persona entre aquello que aporta a la Organización y
aquello que recibe de ella.

Esta formulación es más precisa que reducir Equilibrio a satisfacción con
la remuneración: la Persona aporta más que dinero intercambiado por
trabajo — participa mediante tiempo, energía, capacidades, esfuerzo y
otros recursos de su vida.

**Función** — Conocer en qué medida la Persona reconoce como suficiente y
pertinente aquello que recibe de la Organización y si experimenta
reconocimiento por aquello que aporta. El concepto no implica igualdad
matemática; se refiere a reciprocidad experimentada.

### 5.6 Sensores de Equilibrio

**EQU-1 — Reconocimiento.** *Pregunta (global P19):* ¿La forma en que esta
empresa me trata demuestra que reconoce lo que hago por ella?

**EQU-2 — Pertinencia.** *Pregunta (global P20):* ¿Lo que esta empresa me
da es lo que realmente aspiro recibir?

**EQU-3 — Suficiencia.** *Pregunta (global P21):* ¿Creo que esta empresa
no me da lo suficiente por mi entrega y esfuerzo?

**`EQU-3` es de dirección inversa.** Una respuesta elevada expresa mayor
insuficiencia percibida y, por tanto, menor Equilibrio. Se recodifica
antes de normalizar (sección 8.5).

### 5.7 Continuidad — decisión descartada

Considerada durante la construcción, con la pregunta "¿Lo que recibo de
esta empresa me motiva a seguir siendo parte de ella?". Eliminada porque
la disposición a continuar puede estar relacionada con el intercambio, pero
no ofrece suficiente especificidad para diagnosticar Equilibrio, y porque
invade el campo observado posteriormente por Nexo↔Confianza. Esta decisión
se conserva en trazabilidad porque muestra el criterio usado para evitar
contaminación entre variables.

### 5.8 Arquitectura definitiva del Bloque 3

| Global | Local | Plano | Variable | Código | Sensor/función | Reactivo |
|---|---|---|---|---|---|---|
| P15 | P1 | ICE | Impacto | `IMP-1` | Tiempo | ¿La forma en que funciona esta empresa me facilita el aprovechamiento del tiempo? |
| P16 | P2 | ICE | Impacto | `IMP-2` | Energía | ¿Las condiciones de trabajo me permiten enfocar mi energía en cumplir mis funciones? |
| P17 | P3 | ICE | Impacto | `IMP-3` | Capacidades | ¿Esta empresa genera condiciones que me permiten aprovechar lo mejor de mis capacidades? |
| P18 | P4 | ICE | Impacto | `IMP-4` (ampliación, **incluida en el promedio**) | Vida | ¿Ser parte de esta empresa favorece el desarrollo de los aspectos relevantes de mi vida? |
| P19 | P5 | IEH | Equilibrio | `EQU-1` | Reconocimiento | ¿La forma en que esta empresa me trata demuestra que reconoce lo que hago por ella? |
| P20 | P6 | IEH | Equilibrio | `EQU-2` | Pertinencia | ¿Lo que esta empresa me da es lo que realmente aspiro recibir? |
| P21 | P7 | IEH | Equilibrio | `EQU-3` (inversa) | Suficiencia | ¿Creo que esta empresa no me da lo suficiente por mi entrega y esfuerzo? |

### 5.9 Fundamento técnico del bloque

Pregunta esencial: **¿Qué produce para mí este intercambio?** Impacto
observa qué ocurre con aquello que la Persona compromete y con su vida al
participar; Equilibrio observa cómo reconoce aquello que recibe en
correspondencia con su participación. `IMPACTO ↔ EQUILIBRIO` no contrapone
"empresa" y "empleado" — contrasta dos dimensiones del mismo fenómeno:
**INTERCAMBIO**.

### 5.10 Decisiones relevantes para la trazabilidad

1. Impacto tiene tres sensores y cuatro preguntas — la cuarta amplía la
   observación hacia aspectos relevantes de la vida y **se incluye en el
   promedio** (cerrado en esta versión, ver 5.4 y 8.3).
2. "Condiciones operativas" fue sustituido por "condiciones de trabajo".
3. Equilibrio queda formado por Reconocimiento, Pertinencia y Suficiencia.
4. Suficiencia (`EQU-3`) utiliza un reactivo inverso.
5. Continuidad fue eliminada.
6. La eliminación de Continuidad redujo el cuestionario de 32 a 31
   preguntas.
7. La respuesta no demuestra causalidad, especialmente en Impacto.

---

## 6. Bloque IV — Nexo ↔ Confianza

**Núcleo: VÍNCULO**

El bloque no requiere una séptima pregunta: la pertenencia ya implica
querer seguir participando; agregar otra pregunta resultaría redundante.
**Nexo ↔ Confianza = 6 preguntas finales**, consistente con el total: 7+7+7+6+4 = 31.

### 6.1 Nexo — definición

**Nexo** — Variable del ICE que permite conocer en qué medida el Sistema
organizacional favorece la conexión de la Persona con lo que la
Organización es, lo que aspira lograr y la importancia de su participación
para hacerlo posible.

**Función** — Observar las condiciones mediante las cuales la Organización
favorece que la Persona comprenda aquello de lo que forma parte, reconozca
la importancia de su participación y encuentre razones para contribuir a
su logro.

Secuencia interna: **CONOCER → COMPRENDER LA IMPORTANCIA DE PARTICIPAR →
QUERER CONTRIBUIR**. Todavía no es Confianza — es la formación del Nexo
que hace posible el vínculo.

### 6.2 Sensores de Nexo

**NEX-1.** Objeto: conocimiento de la identidad y aspiración de la
Organización. *Pregunta (global P22):* ¿Esta empresa me ha enseñado lo que
realmente es y lo que aspira lograr?

**NEX-2.** Objeto: significado de la participación. *Pregunta (global
P23):* ¿Entiendo lo importante que es ser parte de lo que esta empresa
hace?

**NEX-3.** Objeto: disposición a contribuir. *Pregunta (global P24):* ¿Me
gusta contribuir al éxito de esta empresa?

*(Este reactivo no debe confundirse con Actitud, Bloque 5: aquí la
pregunta permanece vinculada a la Organización y su éxito; en Actitud
aparece una dimensión que trasciende el interés inmediato de la Persona y
de la Organización.)*

### 6.3 Qué mide Nexo

Progresión: **NEX-1** — sé de qué formo parte; **NEX-2** — comprendo por
qué es importante formar parte; **NEX-3** — quiero contribuir a aquello de
lo que formo parte. Nexo no se reduce a comunicación institucional — la
comunicación es un medio; el fenómeno que interesa es la conexión que el
Sistema consigue favorecer entre la Persona y la Organización.

### 6.4 Confianza — definición

**Confianza** — Certeza que la Persona desarrolla a partir de la buena
experiencia acumulada en la relación.

**Como variable del instrumento:** Confianza es la variable del IEH que
permite conocer en qué medida la experiencia acumulada de la Persona con
la Organización ha consolidado un vínculo que le permite reconocerse
segura en esa relación y parte de ella.

**Función** — Observar si la experiencia acumulada de la Persona con la
Organización ha generado evidencia suficiente para fortalecer su
disposición a vincularse y reconocerse como parte de ella.

Diferencia esencial: Nexo puede ser promovido por el Sistema; Confianza no
puede ser simplemente declarada por el Sistema — la confianza necesita
experiencia.

### 6.5 Sensores de Confianza

**CNF-1.** Objeto: valoración de la experiencia acumulada. *Pregunta
(global P25):* ¿Lo que he vivido en esta empresa hace que me sienta feliz
de ser parte de ella?

**CNF-2.** Objeto: respaldo experimentado. *Pregunta (global P26):* ¿Esta
empresa me ha apoyado cuando la he necesitado?

**CNF-3.** Objeto: pertenencia. *Pregunta (global P27):* ¿Siento que esta
empresa es el lugar al que pertenezco?

Esta última es la expresión más consolidada del vínculo dentro del
bloque, y explica por qué no se agregó una séptima pregunta sobre
intención de permanencia: si la Persona afirma "este es el lugar al que
pertenezco", preguntarle inmediatamente si quiere seguir siendo parte
introduce información demasiado próxima y pierde resolución diagnóstica.

### 6.6 Nexo no es Confianza

Una Organización puede enseñar qué es y qué aspira lograr, ayudar a
comprender la importancia de participar, favorecer la disposición a
contribuir — eso genera Nexo. Pero no puede ordenar "confíe en nosotros".
La Confianza depende de lo que ocurre después: la Persona acumula
experiencias, observa cómo actúa la Organización, experimenta si recibe
respaldo cuando lo necesita, y a partir de esa historia relacional puede
desarrollar una certeza suficiente para reconocerse como parte de ella.

Lógica del bloque: **NEXO → EXPERIENCIA ACUMULADA → CONFIANZA →
CONSOLIDACIÓN DEL VÍNCULO** (arquitectura conceptual, no causalidad
matemática automática).

### 6.7 Arquitectura definitiva del Bloque 4

| Global | Local | Plano | Variable | Código | Objeto observado | Reactivo |
|---|---|---|---|---|---|---|
| P22 | P1 | ICE | Nexo | `NEX-1` | Identidad y aspiración | ¿Esta empresa me ha enseñado lo que realmente es y lo que aspira lograr? |
| P23 | P2 | ICE | Nexo | `NEX-2` | Importancia de participar | ¿Entiendo lo importante que es ser parte de lo que esta empresa hace? |
| P24 | P3 | ICE | Nexo | `NEX-3` | Disposición a contribuir | ¿Me gusta contribuir al éxito de esta empresa? |
| P25 | P4 | IEH | Confianza | `CNF-1` | Experiencia acumulada | ¿Lo que he vivido en esta empresa hace que me sienta feliz de ser parte de ella? |
| P26 | P5 | IEH | Confianza | `CNF-2` | Respaldo experimentado | ¿Esta empresa me ha apoyado cuando la he necesitado? |
| P27 | P6 | IEH | Confianza | `CNF-3` | Pertenencia | ¿Siento que esta empresa es el lugar al que pertenezco? |

### 6.8 Decisiones recuperadas y trazabilidad

1. El bloque tiene seis preguntas.
2. No existe séptima pregunta.
3. La pertenencia hizo innecesario agregar una pregunta sobre voluntad de
   continuar participando.
4. Decisión editorial: no se atribuyen nombres históricos a los sensores
   cuando no hay evidencia de que fueran formalmente aprobados — de ahí
   los códigos `NEX-1/2/3` y `CNF-1/2/3` acompañados de objeto y función.

---

## 7. Bloque V — Integración ↔ Actitud

**Núcleo: TRASCENDENCIA**

Integración ↔ Actitud quedó con **4 preguntas** — cierra el total: 27 + 4 = 31.

### 7.1 Integración — definición

**Integración** — Participación de la Persona por razones que trascienden
su propio interés y reconocimiento de que aquello que hace contribuye a un
fin superior.

Diferencia con Nexo: en Nexo, la Persona comprende la Organización,
reconoce la importancia de participar y desarrolla disposición para
contribuir a su éxito. Integración da un paso adicional — la pregunta deja
de ser "¿qué significa mi participación para esta Organización?" y pasa a
ser "¿qué significa aquello que hago para las Personas que reciben sus
efectos?". Ahí aparece la trascendencia.

**Función** — Conocer en qué medida la Persona comprende que su
participación forma parte de algo que trasciende su interés particular y
reconoce el efecto que su contribución puede producir sobre la vida de
otras Personas.

### 7.2 Preguntas de Integración

**`ITG-1`** *(global P28):* ¿He entendido que lo que hago en esta empresa
puede mejorar la vida de mucha gente? Objeto: comprensión del efecto
potencial de la propia contribución sobre otras Personas — relación LO QUE
HAGO → EFECTO SOBRE LA VIDA DE OTROS.

**`ITG-2`** *(global P29):* ¿He descubierto cómo mi trabajo contribuye a
hacer felices a otros? Objeto: reconocimiento personal de cómo la propia
actividad contribuye al bienestar de quienes reciben sus efectos.

Progresión: **ENTIENDO → DESCUBRO**. P28 establece comprensión; P29 exige
una apropiación más concreta. No son preguntas duplicadas.

### 7.3 Precisión sobre los sensores de Integración

La arquitectura general prevé tres sensores por variable; Integración
cuenta hoy con **dos preguntas instanciadas, no tres**. `SENSOR ≠
PREGUNTA` se demuestra aquí con mayor claridad: una pregunta puede aportar
evidencia relevante para más de un aspecto del constructo. No se atribuyen
nombres de sensor (ej. "Trascendencia", "Significado", "Contribución") sin
evidencia de que hayan sido decisión formal — hacerlo convertiría una
interpretación editorial en una decisión histórica. Lo que sí se afirma:
las dos preguntas cubren (a) comprensión del efecto sobre otros y (b)
reconocimiento de la propia contribución a ese efecto.

### 7.4 Actitud — definición

**Actitud** — Compromiso de la Persona con contribuir al bien común
mediante aquello que hace, reconociendo el beneficio que su actuación
puede producir sobre las Personas afectadas.

Actitud pertenece al IEH. No observa lo que la Organización hace para
integrar — observa la disposición que aparece en la Persona cuando el
significado de su participación ha sido apropiado.

**Función** — Conocer en qué medida el significado que la Persona reconoce
en su participación se expresa en una disposición voluntaria a dar lo
mejor de sí y representar, mediante su actuación, aquello que la
Organización significa.

### 7.5 Preguntas de Actitud

**`ACT-1`** *(global P30):* ¿Me siento orgulloso de dar lo mejor de mí cada
día porque sé lo que significa? Objeto: disposición a entregar lo mejor de
sí como consecuencia del significado reconocido en aquello que hace. La
frase decisiva es "porque sé lo que significa" — relaciona la disposición
con el significado atribuido a la contribución, no solo con esfuerzo o
disciplina.

**`ACT-2`** *(global P31):* ¿Quiero que mi actitud haga que otras Personas
reconozcan lo que esta empresa representa? Objeto: disposición voluntaria
a representar mediante la propia actuación aquello que la Organización
significa. Es la última pregunta del instrumento.

Progresión: **ME COMPROMETO → REPRESENTO**.

### 7.6 La secuencia completa del bloque

**ENTIENDO → DESCUBRO → ME COMPROMETO → REPRESENTO**

- Integración: *entiendo* que lo que hago trasciende mi propio interés;
  *descubro* cómo mi contribución participa en ese efecto.
- Actitud: el significado reconocido se expresa en mi disposición a dar lo
  mejor de mí (*me comprometo*); quiero que mi manera de actuar haga
  reconocible aquello que la Organización representa (*represento*).

No se debe convertir esta secuencia en cuatro sensores — es la lógica de
progresión de las cuatro preguntas. Núcleo del bloque: **TRASCENDENCIA**.

### 7.7 Nexo no es Integración

En Nexo ("¿Me gusta contribuir al éxito de esta empresa?") el referente es
la Organización. En Integración ("¿He entendido que lo que hago en esta
empresa puede mejorar la vida de mucha gente?") el referente se desplaza
hacia otras Personas y un efecto que trasciende a quien participa. **NEXO
→** conexión con la Organización y su propósito. **INTEGRACIÓN →**
apropiación del significado trascendente de la propia contribución. Y
posteriormente: **CONFIANZA →** consolidación del vínculo mediante la
experiencia; **ACTITUD →** disposición derivada del significado
reconocido. Esta separación es fundamental para la validez discriminante
del instrumento.

### 7.8 Arquitectura final del Bloque 5

| Global | Local | Plano | Variable | Código | Objeto observado | Reactivo |
|---|---|---|---|---|---|---|
| P28 | P1 | ICE | Integración | `ITG-1` | Comprensión del efecto sobre otros | ¿He entendido que lo que hago en esta empresa puede mejorar la vida de mucha gente? |
| P29 | P2 | ICE | Integración | `ITG-2` | Reconocimiento de la propia contribución | ¿He descubierto cómo mi trabajo contribuye a hacer felices a otros? |
| P30 | P3 | IEH | Actitud | `ACT-1` | Compromiso derivado del significado | ¿Me siento orgulloso de dar lo mejor de mí cada día porque sé lo que significa? |
| P31 | P4 | IEH | Actitud | `ACT-2` | Representación mediante la conducta | ¿Quiero que mi actitud haga que otras Personas reconozcan lo que esta empresa representa? |

### 7.9 Limitación declarada, no fabricación

No se declaran recuperados los nombres literales de los tres sensores de
Integración ni los tres de Actitud — la evidencia disponible no los
respalda. Esto no impide cerrar el cuestionario, pero obliga a ser
preciso: se sabe que la arquitectura general contempla tres sensores por
variable; no hay evidencia suficiente para adjudicar retrospectivamente
seis denominaciones específicas a este bloque. Consecuencia psicométrica:
Integración y Actitud se calculan hoy como promedio de **2 ítems**, no de
3–4 como el resto de las variables — menor fiabilidad esperada, a
confirmar con el piloto (ver sección 10).

**Total confirmado: 7 + 7 + 7 + 6 + 4 = 31 preguntas canónicas.**

---

## 8. Sistema transversal de aplicación, respuesta, cálculo e interpretación

Esta sección cierra lo que en versiones previas del documento quedaba
señalado como pendiente ("el siguiente paso no debería ser todavía
redactar el DOCX... corresponde recuperar y cerrar el sistema transversal
de aplicación, respuesta, cálculo e interpretación"). Todo lo aquí
definido es aplicable hoy; lo que sigue dependiendo de datos del piloto
está marcado explícitamente y remitido a la sección 10.

### 8.1 Escala de respuesta

Todas las preguntas de sensor (26 de 31) y las de ampliación/síntesis
unidireccional se responden en escala ordinal de cinco posiciones,
valores 1 a 5. La pregunta bipolar independiente (`IND-EF`, P7) usa la
misma escala 1–5, pero con anclas direccionales en vez de
acuerdo/desacuerdo (sección 3.6).

### 8.2 Clasificación de preguntas por tipo

| Tipo | Preguntas | Cantidad | Tratamiento |
|---|---|---|---|
| **Normal** | Todos los ítems de sensor sin marca especial | 26 | Entra al promedio de su variable |
| **Inversa** | `COH-3` (P13), `EQU-3` (P21) | 2 | Se recodifica antes de normalizar; entra al promedio de su variable |
| **Ampliación** | `IMP-4` (P18) | 1 | Entra al promedio de su variable (Impacto) — no es un sensor nuevo, sí es una pregunta más del promedio (ver 5.4 y 8.3) |
| **Contraste bipolar independiente** | `IND-EF` (P7) | 1 | No entra a ningún promedio de variable. Se reporta como señal independiente, escala [-1,+1] |
| **Síntesis independiente** | `IND-IC` (P14) | 1 | No entra a ningún promedio de variable. Se reporta como señal independiente, escala [0,100] |

Total: 26 + 2 + 1 + 1 + 1 = 31. ✓

### 8.3 Regla general de agregación

**Una pregunta entra al promedio de una variable si y solo si observa esa
variable específica (aunque sea ampliando su alcance). Una pregunta no
entra al promedio de ninguna variable si su objeto es la relación entre
las dos variables del par.**

Esta regla única, sin excepción por bloque, resuelve de forma consistente
los tres casos que antes se trataban de forma implícita y distinta entre
sí:

- `IND-EF` (Bloque 1) y `IND-IC` (Bloque 2) observan la **relación entre**
  dos variables → excluidas de ambos promedios, reportadas como señal
  independiente.
- `IMP-4` (Bloque 3) observa **una sola variable** (Impacto), con alcance
  ampliado → incluida en el promedio de Impacto.

### 8.4 Normalización por tipo de ítem

| Tipo | Fórmula | Rango | Nota |
|---|---|---|---|
| Normal | `s = 25 × (x − 1)` | [0, 100] | x = respuesta cruda 1–5 |
| Inversa | `s = 25 × (5 − x)` — equivalente a `100 − 25(x−1)` | [0, 100] | Recodificar **antes** de agregar, nunca después de normalizar |
| Bipolar independiente (`IND-EF`) | `d = (x − 3) / 2` | [−1, +1] | Convención de signo (corregida — ver nota abajo): `d > 0` = predomina el lado **IEH** (Fortaleza); `d < 0` = predomina el lado **ICE** (Estructura); `d = 0` = sin predominancia |
| Síntesis independiente (`IND-IC`) | `s = 25 × (x − 1)` | [0, 100] | Misma fórmula que un ítem normal; se reporta aparte, nunca se promedia dentro de Coherencia |

**Corrección respecto de versiones anteriores:** `IND-EF` e `IND-IC` se
trataban como si fueran del mismo tipo por ser ambas "preguntas
independientes". No lo son — una es bipolar-direccional (la dirección del
número importa) y la otra es un ítem de acuerdo/desacuerdo (la magnitud
importa). Aplicar la fórmula bipolar a `IND-IC`, o la fórmula normal a
`IND-EF`, produciría un número sin sentido interpretativo en ambos casos.

**Corrección de la convención de signo de `IND-EF` (esta versión).** La nota
de signo de versiones anteriores decía "positivo = domina el lado ICE
(Estructura)". Es incorrecta frente a la fórmula literal `d = (x − 3) / 2` y a
las anclas de escala del §3.6: la respuesta `5` ("Tiene problemas de
organización, pero me siento seguro, cuidado y valorado") produce `d = +1` y
describe la experiencia (Fortaleza/IEH) por encima de la estructura, no al
revés. Se mantienen la fórmula y las anclas de escala; se corrige la etiqueta:
**`d > 0` → predomina Fortaleza (IEH); `d < 0` → predomina Estructura (ICE);
`d = 0` → sin predominancia.** El motor de cálculo no fija ninguna etiqueta —
devuelve el valor numérico `d`; la etiqueta "domina X" se aplica solo en la
capa de presentación, con esta convención. La señal `IND-EF` no entra en ICE,
IEH ni en ninguna brecha (§8.7), de modo que esta corrección no altera ningún
cálculo.

### 8.5 Cálculo de variables

Para cada una de las 10 variables, el score es el promedio de las
normalizaciones (0–100) de sus preguntas asignadas según la sección 8.2:

```
Estructura   = promedio(EST-1, EST-2, EST-3)                    → 3 ítems
Fortaleza    = promedio(FOR-1, FOR-2, FOR-3)                     → 3 ítems
Intención    = promedio(INE-1, INE-2, INE-3)                     → 3 ítems
Coherencia   = promedio(COH-1, COH-2, COH-3_recodificado)        → 3 ítems
Impacto      = promedio(IMP-1, IMP-2, IMP-3, IMP-4)              → 4 ítems
Equilibrio   = promedio(EQU-1, EQU-2, EQU-3_recodificado)        → 3 ítems
Nexo         = promedio(NEX-1, NEX-2, NEX-3)                     → 3 ítems
Confianza    = promedio(CNF-1, CNF-2, CNF-3)                     → 3 ítems
Integración  = promedio(ITG-1, ITG-2)                            → 2 ítems
Actitud      = promedio(ACT-1, ACT-2)                            → 2 ítems
```

La asimetría en número de ítems por variable (2 a 4) es aceptada por
diseño — el propio instrumento nunca exigió simetría formal (sección
2.2). Se marca como limitación psicométrica a validar en el piloto
específicamente para Integración y Actitud (2 ítems, sección 7.9).

### 8.6 Cálculo de ICE, IEH y brechas por par

```
ICE  = promedio(Estructura, Intención, Impacto, Nexo, Integración)
IEH  = promedio(Fortaleza, Coherencia, Equilibrio, Confianza, Actitud)

Brecha_Estructura-Fortaleza   = Estructura  − Fortaleza
Brecha_Intención-Coherencia   = Intención   − Coherencia
Brecha_Impacto-Equilibrio     = Impacto     − Equilibrio
Brecha_Nexo-Confianza         = Nexo        − Confianza
Brecha_Integración-Actitud    = Integración − Actitud
```

Signo de la brecha: positivo = el lado ICE (sistema) puntúa por encima del
lado IEH (experiencia) para ese par; negativo = la experiencia supera lo
declarado/configurado.

### 8.7 Señales independientes (no forman parte de ICE ni IEH)

```
Señal_Correspondencia (Bloque 1) = d(IND-EF) ∈ [−1, +1]
Señal_Veracidad (Bloque 2)       = s(IND-IC) ∈ [0, 100]
```

Estas dos señales se contrastan, no se promedian, contra el resultado
derivado de los sensores del par correspondiente (`CONTRASTE DERIVADO ≠
CORRESPONDENCIA PERCIBIDA`, sección 3.6). Cuando el piloto acumule datos
suficientes, se evaluará si convergen, divergen o se contradicen
sistemáticamente con la brecha calculada por sensores — ese contraste es,
en sí mismo, información diagnóstica adicional.

### 8.8 Nivel, dispersión y precisión

El reporte de cada variable, de ICE, de IEH y de cada brecha debe separar
tres componentes, en vez de un único promedio:

- **Nivel** — dónde se encuentra la variable (el promedio ya definido en
  8.5–8.6).
- **Dispersión** — qué tan homogéneas o heterogéneas son las
  experiencias/respuestas alrededor de ese nivel.
- **Precisión** — qué tan sólida es la estimación obtenida a partir de la
  información disponible (tamaño de muestra, consistencia interna).

La fórmula específica de dispersión y de precisión, así como los tamaños
mínimos de segmento para reportar con confianza, quedan pendientes de
calibración con el piloto (sección 10) — el principio de reportarlas por
separado, en cambio, es una decisión ya cerrada, no un vacío.

### 8.9 Ponderación poblacional

El sistema contempla ponderación por unidad, función, ubicación, nivel y
turno, para evitar que la composición de la muestra distorsione la
representación de la Organización (una sede con 400 Personas no debe
quedar representada matemáticamente igual que una con 20, salvo que se
busque deliberadamente una comparación no ponderada). El método de
ponderación específico queda pendiente de calibración con el piloto.

### 8.10 Secuencia completa de cálculo

```
RESPUESTA 1–5
     ↓
RECODIFICACIÓN (solo ítems inversos: COH-3, EQU-3)
     ↓
NORMALIZACIÓN 0–100 (o [-1,+1] para IND-EF)
     ↓
AGREGACIÓN POR VARIABLE (10 variables, regla de 8.3)
     ↓
ICE, IEH  ←→  BRECHA POR PAR (5 pares)
     ↓                    ↓
NIVEL + DISPERSIÓN     SEÑALES INDEPENDIENTES
+ PRECISIÓN            (IND-EF, IND-IC)
     ↓
SEGMENTACIÓN (ponderación poblacional)
     ↓
SEÑAL
     ↓
PROFUNDIZACIÓN → CONTRASTE CON EVIDENCIA / KPI
     ↓
DIAGNÓSTICO → INTERVENCIÓN → NUEVA MEDICIÓN
```

### 8.11 Validación contra indicadores reales

Los puntos de corte del instrumento (umbrales verde/ámbar/rojo, severidad)
no se establecen de forma arbitraria (ej. "0–50 = malo, 51–75 = medio,
76–100 = bueno"). La lógica de validación es: instrumento → piloto →
resultados ICE–IEH → contraste con indicadores operativos (KPIs próximos)
→ calibración. Los umbrales definitivos son responsabilidad del piloto,
no de este documento.

---

## 9. Trazabilidad general — decisiones descartadas y alternativas evaluadas

Se conserva esta sección porque el propio documento reconoce valor en
documentar el fundamento técnico de decisiones no obvias. No se reorganiza
todavía en un apéndice separado del cuerpo normativo — esa limpieza
editorial queda pospuesta (sección 10.3).

- **Continuidad** (Bloque 3) — descartada por solapamiento con
  Nexo↔Confianza y baja especificidad diagnóstica para Equilibrio.
- **Decisión, Sostenimiento** (Bloque 2) — evaluadas como posibles
  sensores de Intención, descartadas por insuficiente
  independencia/observabilidad.
- **Personalización de declaraciones** (Bloque 2) — rechazada por
  complejidad de aplicación.
- **"Corresponde" → "refleja"** (Bloque 2) — cambio de lenguaje por
  comprensibilidad, no de objeto medido.
- **"Condiciones operativas" → "condiciones de trabajo"** (Bloque 3,
  `IMP-2`) — mismo criterio.
- **Séptima pregunta de permanencia** (Bloque 4) — descartada por
  redundancia con Pertenencia (`CNF-3`).
- **Nombres de sensor de Bloque 5** — no fabricados por falta de evidencia
  conversacional suficiente (sección 7.3, 7.9).
- **Cuestionario histórico de 25 preguntas** (`CUESTIONARIO_25_PREGUNTAS_EFICIENCIA.md`)
  — reemplazado íntegramente por el instrumento ICE–IEH de 31 preguntas.
  Cualquier prompt de Claude Code o pieza de código que aún referencie el
  cuestionario de 25 preguntas debe actualizarse antes de tocar el motor
  de cálculo del Workbook.

---

## 10. Estado de validación y parámetros pendientes de piloto

### 10.1 Cerrado en esta versión (v2)

| Componente | Estado |
|---|---|
| Numeración canónica global P1–P31 | Cerrado |
| Códigos de sensor sin colisión (10 prefijos únicos) | Cerrado |
| Clasificación de preguntas por tipo (normal/inversa/ampliación/independiente) | Cerrado |
| Regla de agregación (qué entra a qué promedio) | Cerrado |
| Tratamiento de `IMP-4` (P18, "Vida") — incluida en promedio de Impacto | Cerrado |
| Normalización por tipo de ítem (4 fórmulas) | Cerrado |
| Distinción `IND-EF` (bipolar) vs. `IND-IC` (síntesis unidireccional) | Cerrado |
| Fórmulas de ICE, IEH y brechas por par | Cerrado |
| Principio de reportar nivel/dispersión/precisión por separado | Cerrado (fórmulas específicas, pendientes) |

### 10.2 Pendiente de calibración con el piloto (parámetros libres, no se fijan hoy)

- Fórmulas específicas de dispersión y precisión.
- Ponderación poblacional (método exacto por unidad/función/ubicación/nivel/turno).
- Umbrales definitivos verde/ámbar/rojo y de severidad.
- Pesos diferenciales entre sensores dentro de una variable.
- Tamaños mínimos de segmento para reportar con confianza.
- Si Integración y Actitud (2 ítems cada una, Bloque 5) requieren una
  tercera pregunta — a evaluar con fiabilidad observada en el piloto.
- Verificación de `IMP-4`: alfa de Cronbach de Impacto con y sin el ítem,
  y correlación ítem-total, para confirmar que "Vida" no diluye la
  consistencia interna de la variable (sección 5.4, 8.3).

### 10.3 Limpieza editorial — pospuesta

La separación entre cuerpo normativo (tono presente, sin referencias de
proceso) y apéndice de trazabilidad (contenido genealógico, timestamps,
decisiones descartadas) queda pospuesta hasta que el contenido del
instrumento deje de cambiar con datos del piloto — evita limpiar el
documento dos veces y conserva, mientras tanto, el valor activo de la
bitácora para justificar decisiones ante dudas nuevas (como ocurrió al
resolver el tratamiento de `IMP-4` en esta misma versión).

### 10.4 Siguiente paso operativo

Generar `PROMPT_CC_AUDITORIA_MOTOR_CALCULO_v3.md`, reemplazando toda
referencia al cuestionario de 25 preguntas por este documento (fuente
única de verdad para preguntas, códigos, agregación y normalización),
antes de tocar el motor de cálculo del Workbook.
