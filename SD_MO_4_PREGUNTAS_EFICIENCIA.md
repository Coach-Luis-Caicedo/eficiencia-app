# SD-MO — Las 4 preguntas del sensor diario (IDA)

Complementa a `DOCUMENTO_MARCO_SISTEMA_EFICIENCIA.md`, sección 8 (auditoría de
arquitectura del SD-MO/IDA). Versión final: **4 ejes bipolares**, reemplaza
las dos versiones unidireccionales anteriores (ver Historial de versiones al
final).

## Diseño — por qué son bipolares, no unidireccionales

Las dos versiones anteriores medían solo hacia Amenaza — no podían distinguir
entre alguien en modo Seguridad genuino (comprometido, con energía activa) y
alguien "apagado" sin amenaza activa pero tampoco comprometido (desconexión
silenciosa). Los 4 ejes bipolares capturan ambos extremos —Seguridad
(confianza, colaboración, compromiso, creatividad) y Defensa (temor,
presencia vacía, desmotivación, estrés)— cerrando ese vacío sin agregar una
quinta pregunta.

El cuestionario de 25 preguntas mide percepción reflexiva sobre la relación
con la organización (ICE/IEH/Brecha, por par). El SD-MO mide **estado
sentido del día**, algo que se responde en segundos, sin análisis — por eso
no se desagrega por par (sección 8.3 del marco: nunca debe hacerlo, perdería
la velocidad que es su única ventaja).

## Escala y convención de signo

**Escala 1-5, bipolar por ítem** (no acuerdo/desacuerdo): 1 = polo Seguridad,
3 = punto medio, 5 = polo Defensa. Consistente con la convención ya fijada
(mayor número = más amenaza), sin necesidad de invertir ítems antes de
calcular el IDA diario — importa porque este cálculo corre 3 veces por
semana y debe ser trivial de computar.

Normalización: `(valor − 1) / 4` → [0,1], igual convención que el
cuestionario de 25.

## Las 4 preguntas

**1. [Confianza ↔ Temor]** ¿Dónde te ubicas hoy?
1 = Actué con confianza y tranquilidad — 5 = Actué con temor y cautela.

**2. [Colaboración ↔ Retención]**
1 = Colaboré abiertamente con los demás — 5 = Me guardé lo que pensaba,
evitando exponerme.

**3. [Compromiso ↔ Presencia vacía/Desmotivación]**
1 = Estuve genuinamente comprometido con lo que hacía — 5 = Estuve presente
pero desconectado, sin motivación real.

**4. [Creatividad ↔ Estrés laboral]**
1 = Pude pensar con claridad y explorar nuevas ideas — 5 = Sentí estrés que
me impidió pensar con claridad.

## Decisión de diseño: fusión de "presencia vacía" y "desmotivación" en el eje 3

Luis nombró 8 efectos a capturar (4 de Seguridad, 4 de Defensa). Quedaron
mapeados en 4 ejes porque "presencia vacía" y "desmotivación" se trataron
como el mismo fenómeno visto desde dos ángulos (estar físicamente presente
sin motivación real), no como dos fenómenos distintos que necesitaran ejes
separados. Si en algún momento se determina que son fenómenos genuinamente
distintos, esto sube a 5 preguntas — pendiente de confirmar si la fusión se
sostiene bien en el piloto.

## Correspondencia con los componentes de costo del CFO (sección 7)

Hallazgo no buscado a propósito, encontrado al cruzar los 4 ejes contra los
componentes del CFO — casi 1 a 1:

| Eje SD-MO | Componente CFO |
|---|---|
| Confianza ↔ Temor | Rotación (+ Supervisión innecesaria, sección 7.1) |
| Colaboración ↔ Retención | Retrabajo |
| Compromiso ↔ Presencia vacía/Desmotivación | Desenganche |
| Creatividad ↔ Estrés laboral | Ausentismo (+ Innovación perdida, sección 7.1) |

Si esta correspondencia se sostiene con datos reales del piloto, el SD-MO
deja de ser solo un pulso genérico de amenaza — se convierte en indicador
líder específico por componente de costo (ej. "tu costo de ausentismo está
subiendo porque el eje Creatividad/Estrés lleva tres semanas cayendo").

**Nota:** Confianza↔Temor y Creatividad↔Estrés alimentan dos componentes de
costo cada uno, no uno — ver sección 7.1 del marco (Supervisión innecesaria
e Innovación perdida), los dos componentes sin benchmark del CFO.

## Cálculo del IDA diario

Ver `DOCUMENTO_MARCO_SISTEMA_EFICIENCIA.md`, sección 8.1:

```
IDA_i = 100 × [δ×promedio(4 preguntas normalizadas) + (1−δ)×segundo_mayor(4 preguntas normalizadas)]
```

`δ` calibrable con piloto — mismo criterio que todos los demás parámetros
del sistema (nunca fijado a priori).

## Historial de versiones

**v1 (unidireccional, descartada):** tensión por causa del trabajo, silencio
por precaución, nadie respaldaría, hice lo mínimo. Descartada por
contaminación de señal (cada ítem podía activarse por causas ajenas a la
amenaza).

**v2 (unidireccional corregida, descartada):** tensión por miedo a
cometer un error, silencio por miedo a la reacción, no podría contar con
apoyo, no tuve ganas de aportar más. Corrigió la contaminación de v1, pero
seguía siendo ciega a Seguridad/Compromiso como estado positivo propio —
no podía distinguir modo Seguridad genuino de desconexión silenciosa.

**v3 (bipolar, vigente):** la de este documento. Resuelve el vacío de v2
capturando ambos polos en el mismo ítem, sin agregar una quinta pregunta.

## Pendiente

Validación de comprensión lectora con usuarios reales. Confirmar en el
piloto si la fusión presencia vacía/desmotivación (eje 3) debe separarse.
Traducción/adaptación regional si el sistema se usa fuera de la audiencia
hispanohablante actual.
