# Investigación de datos organizacionales reales para calibrar el motor CFF/IAO/IFT

Fecha de la investigación: 2026-08-19.

Este documento complementa la sección 8 (CFF) y la sección 4 (fórmula del IAO) de
`DOCUMENTO_MARCO_SISTEMA_EFICIENCIA.md`, y la sección 8.2 (IFT, calibración de λ).
No reemplaza esas secciones — reúne evidencia externa adicional para las variables
que el marco ya identificó como pendientes de calibración con datos reales:
`Salario_promedio` (entrada de la fórmula CFF), `w_neg`/`umbral_piso`/`γ` (fórmula
del IAO, sección 4), `λ` (vida media del IFT, sección 8.2), y el costo legal de
desvinculación en Colombia (no cubierto todavía por ninguna sección del marco).

Regla seguida en toda la investigación: solo se documentan cifras con fuente
citable (estudio con metodología, encuesta con muestra documentada, o texto
legal). Ningún número fue inventado o extrapolado más allá de lo que la fuente
dice explícitamente. Cuando una cifra es global sin alternativa regional, o hay
riesgo de doble conteo con otra cifra ya usada en el marco, se señala.

---

## 1. Tasas base: rotación, ausentismo, productividad por sector

| Dato | Cifra | Fuente | Año | Qué mide | Tamaño de organización |
|---|---|---|---|---|---|
| Rotación laboral, promedio nacional Colombia | 41% anual | El Colombiano, "Empresas en alerta: rotación laboral en Colombia alcanza el 41%" | 2025 | Rotación total anual, mercado colombiano en general | No distingue tamaño |
| Rotación laboral, otro corte nacional | 26% promedio general | La República, "Rotación de talento humano en las Pyme es seis puntos más alta frente al promedio" | 2025 | Promedio nacional de rotación (distinto universo/metodología que la cifra anterior — ver nota de divergencia abajo) | Compara pyme vs. promedio (ver sección 6) |
| Rotación, BPO/call center | hasta 89% anual | Estudio de Remuneración Michael Page Colombia 2023 | 2023 | Rotación anual por sector económico | No distingue tamaño |
| Rotación, retail | 69% anual | Estudio de Remuneración Michael Page Colombia 2023 | 2023 | Rotación anual por sector económico | No distingue tamaño |
| Rotación, manufactura | 44% anual | Estudio de Remuneración Michael Page Colombia 2023 | 2023 | Rotación anual por sector económico | No distingue tamaño |
| Rotación, BPO mensual promedio | 10.03% mensual (2023), bajando desde 10.72% (2022) | Sector BPO Colombia, reporte sectorial | 2023 vs 2022 | Única serie de tiempo encontrada con dos puntos consecutivos — muestra tendencia a la baja | No distingue tamaño |
| Rotación general (Page Group) | 10%-15%, con picos por rol: analistas 66%, coordinadores 30% | Page Group Colombia | 2023 | Rotación por nivel de cargo, no por sector | No distingue tamaño |
| Ausentismo, días perdidos/trabajador/año | 9.4 días/año (de los cuales 5.8 días por enfermedades prevenibles) | EALI 2024 (CESLA-ANDI) | 2024 | Días de incapacidad médica por trabajador | Sin distinción de tamaño en la cifra citada |
| Ausentismo, sobrecosto por nómina | 5.78% adicional del costo por trabajador, sector privado | ANDI, Encuesta de Ausentismo Laboral, Incapacidades y Reubicaciones Médicas | 2024 | Sobrecosto de nómina atribuible a ausentismo (esta es la cifra "en crisis" ya citada en el marco sección 8, aquí confirmada con la fuente EALI 2024 específica) | Sin distinción de tamaño |
| Ausentismo, costo directo por trabajador | $71,713 COP/mes ($860,560 COP/año) | CESLA-ANDI, datos 2023 | 2023 | Costo directo mensual/anual por trabajador solo por ausentismo | Sin distinción de tamaño |
| Ausentismo, casos registrados | 479,761 casos en 2023 (1.38 casos/trabajador) | CESLA-ANDI | 2023 | Volumen de casos de incapacidad, no solo días | Sin distinción de tamaño |
| Productividad total de los factores, Colombia | -1.07% (2023, cifra preliminar), 1.36% (2024, cifra definitiva revisada) | DANE, discusión técnica del salario mínimo | 2023-2024 | Productividad total de los factores (PTF), nivel nacional agregado — NO desagregada por sector con serie de tiempo | No aplica (nivel macro) |
| Productividad, manufactura (aporte sectorial) | +1.4 puntos porcentuales al agregado 2023 | DANE | 2023 | Contribución sectorial a la PTF nacional | No aplica (nivel macro) |
| Productividad, transporte/almacenamiento/comunicaciones | -0.09% variación del valor agregado; -6.17% aporte a la PTF | DANE | 2023 | Contribución sectorial negativa a la PTF nacional | No aplica (nivel macro) |
| Productividad, histórico | Caídas en 9 de los últimos 19 años; máximo histórico +4.23% (desde 2006) | DANE / Banco de la República | serie 2006-2024 | Única serie verdaderamente longitudinal encontrada para productividad — a nivel nacional, no por sector | No aplica (nivel macro) |

**Nota de divergencia (rotación nacional 41% vs. 26%):** dos fuentes de prensa
económica colombiana (El Colombiano vs. La República) reportan cifras de
rotación nacional distintas en el mismo año. Ninguna de las dos publica la
metodología completa (tamaño de muestra, definición exacta de "rotación",
período de medición) en el texto accesible — no se puede reconciliar sin
acceder al estudio primario de cada una. **No usar ninguna de las dos como
`TasaRotaciónBase` por defecto sin verificar contra el estudio fuente
completo** — el CFF (sección 8 del marco) ya establece correctamente que esta
tasa es dato real del cliente, no un supuesto del sistema; estas cifras sirven
solo como rango de plausibilidad para detectar un dato de cliente que luzca
atípico.

**Vacío confirmado:** no existe una serie de tiempo pública, desagregada por
sector, de rotación o ausentismo en Colombia con periodicidad regular (DANE no
publica rotación como indicador propio — confirmado por búsqueda directa). Los
únicos puntos con dos mediciones consecutivas son BPO mensual (2022→2023) y la
productividad agregada nacional (serie 2006-2024, no por sector).

---

## 2. Salario promedio por sector/cargo

| Dato | Cifra | Fuente | Año | Qué mide | Tamaño de organización |
|---|---|---|---|---|---|
| Salario mínimo legal vigente (SMLV) Colombia 2026 | $1,750,905 COP/mes (+23% nominal vs. 2025) | Decretos 1469 y 1470 del 29 de diciembre de 2025 | 2026 | Piso legal salarial — referencia base para la fórmula de indemnización (sección 3 abajo) y para clasificar salarios "menos/más de 10 SMLMV" | No aplica |
| Auxilio de transporte 2026 | $249,095 COP/mes | Mismos decretos | 2026 | Componente adicional obligatorio, no hace parte del salario base para la mayoría de cálculos de indemnización | No aplica |
| Incremento salarial promedio Colombia 2025 | +7.1% general (6.7% alta gerencia, 6.9% gerencia media/junior, 7.4% técnico) | Mercer Colombia, Encuesta de Remuneración Total | 2025 | Variación salarial año a año, por nivel jerárquico | No distingue tamaño de empresa |
| Salario alta gerencia (hombres/mujeres) | $43.4M / $35.9M COP/mes | Mercer Colombia | 2025 | Nivel salarial promedio por cargo directivo, con brecha de género | No distingue tamaño |
| Salario gerencia media (hombres/mujeres) | $18.2M / $16.8M COP/mes | Mercer Colombia | 2025 | Nivel salarial promedio, mando medio | No distingue tamaño |
| Salario personal base (hombres/mujeres) | $2.27M / $1.68M COP/mes | Mercer Colombia | 2025 | Nivel salarial promedio, personal operativo/base | No distingue tamaño |
| Incremento salarial por sector (energía, logística, manufactura, financiero, químico, consumo, tecnología, retail) | rango 10.2%-13.3% según sector | Mercer Colombia (estudio previo referenciado) | sin año exacto confirmado en la fuente secundaria — verificar antes de usar | Variación salarial por sector económico | No distingue tamaño |

**Limitación:** no se encontró una tabla pública de salario promedio absoluto
(no solo variación %) desagregada simultáneamente por sector Y cargo Y tamaño
de empresa. Mercer y Michael Page publican estas tablas completas solo en sus
reportes pagos/con registro — las cifras de arriba son las que trascendieron a
prensa. Para uso real en la fórmula CFF, `Salario_promedio` debe seguir siendo
dato del cliente, tal como ya especifica el marco — estas cifras sirven solo
como validación de rango de plausibilidad.

---

## 3. Correlación engagement→resultado (por cuartil, Gallup)

Esta es la categoría de mayor valor para calibrar `w_neg`, `umbral_piso` y `γ`
de la fórmula del IAO (sección 4 del marco) — mismo tipo de calibración
externa que ya se usó para anclar `λ` con la literatura de "vida media" de
cambio organizacional (sección 8.2).

| Dato | Cifra (cuartil top vs. cuartil bottom de engagement) | Fuente | Año | Qué mide |
|---|---|---|---|---|
| Ausentismo | 78% menor en equipos de alto engagement | Gallup, Q12 Meta-Analysis, 11ª edición | edición 2024 (dataset 183,806 unidades de negocio, 53 industrias, 90 países) | Diferencia relativa en ausentismo, cuartil top vs. bottom |
| Rotación (organizaciones de alta rotación) | 21% menor | Gallup Q12 Meta-Analysis, 11ª edición | 2024 | Diferencia relativa en rotación, contextos donde la rotación base ya es alta |
| Rotación (organizaciones de baja rotación) | 51% menor | Gallup Q12 Meta-Analysis, 11ª edición | 2024 | Diferencia relativa en rotación, contextos donde la rotación base ya es baja — Gallup reporta el efecto en dos regímenes distintos, no un solo número |
| Rentabilidad | 23% más rentables | Gallup Q12 Meta-Analysis, 11ª edición | 2024 | Rentabilidad de unidades de negocio, cuartil top vs. bottom |
| Productividad (ventas) | 18% mayor | Gallup Q12 Meta-Analysis, 11ª edición | 2024 | Productividad medida en ventas |
| Incidentes de seguridad | 63% menos | Gallup Q12 Meta-Analysis, 11ª edición | 2024 | Frecuencia de incidentes de seguridad laboral |
| Defectos de calidad | 32% menos | Gallup Q12 Meta-Analysis, 11ª edición | 2024 | Tasa de defectos de calidad |
| Correlación agregada engagement↔desempeño | r = 0.49; unidades del top-50% tienen 2.33x más probabilidad de éxito que las del bottom-50% | Gallup Q12 Meta-Analysis, 11ª edición | 2024 | Fuerza de la correlación general entre engagement y desempeño organizacional |

**Nota metodológica — global, sin desagregación por Colombia/región:** el
dataset de Gallup es global (90 países, no reporta corte específico Colombia
o Latam en las cifras públicas encontradas). Mismo tratamiento que el marco ya
aplicó al 26% de desenganche (sección 8) — se usa como referencia global por
falta de alternativa regional, no como benchmark local. **No distingue por
tamaño de organización** en las cifras públicas disponibles.

**Cómo conecta con `w_neg`/`umbral_piso`/`γ`:** el hallazgo más directamente
aplicable es que Gallup reporta el efecto de engagement en **dos regímenes
distintos según el nivel base de rotación** (21% de reducción cuando la
rotación base ya es alta, 51% cuando es baja) — esto es evidencia externa de
que la relación entre activación/amenaza y resultado **no es lineal ni
uniforme**, coherente con la advertencia que el propio marco ya hace en la
sección 8 ("relación esperada tipo umbral/sigmoide, no lineal"). No permite
derivar un valor numérico único para `w_neg`, `umbral_piso` o `γ` — el marco
tiene razón en que estos siguen sin validar externamente y requieren el
piloto — pero sí confirma la forma funcional (no lineal, con umbral) como
supuesto de diseño razonable, no arbitrario.

---

## 4. Estudios "antes/después" de intervención organizacional (para contrastar λ)

| Dato | Cifra | Fuente | Año | Qué mide |
|---|---|---|---|---|
| Señales tempranas de cambio conductual post-coaching | 4-6 meses | Sparkeffect / síntesis de estudios de ROI de coaching ejecutivo | 2025 | Tiempo hasta primeras señales medibles (feedback de stakeholders, cambios conductuales) |
| Impacto medible de negocio (retención, engagement, ingresos) | 9-12 meses | Misma síntesis | 2025 | Tiempo hasta impacto medible en métricas de negocio, no solo conducta individual |
| Duración recomendada para cambio conductual duradero | 6-12 meses de programa | Síntesis de investigación de coaching ejecutivo | 2025 | Duración del programa asociada a cambio "más fuerte y duradero" en habilidades de liderazgo complejas |
| ROI de coaching ejecutivo | ROI promedio 529% (mediana reportada 5x-7x) | International Coaching Federation (ICF) + PwC, estudio de 1,000+ engagements de coaching | 2023 | Retorno financiero, no velocidad de cambio — dato de contexto, no de calibración de λ |
| Cambio cultural hospitalario (EE.UU.) | Estudio de intervención de 2 años ("Leadership Saves Lives", LSL) en 10 hospitales | Estudio mixto longitudinal, PMC | sin año exacto confirmado en la fuente secundaria — verificar antes de usar | Duración de una intervención real de cambio cultural organizacional medida longitudinalmente |
| Alineación estratégica → engagement | Efecto positivo con desfase de 12 meses | Estudio longitudinal citado en Frontiers in Psychology | sin año exacto confirmado en la fuente secundaria — verificar antes de usar | Tiempo de desfase (lag) entre una intervención de recurso organizacional y su efecto medible en engagement |
| Intervención de "job crafting" | Medición a las 6 semanas tras 1 día de entrenamiento; otro estudio midió a los 18 meses post-implementación | Estudios citados en Frontiers/PMC | sin año exacto confirmado en la fuente secundaria — verificar antes de usar | Rango amplio de horizontes de medición usados en la literatura — desde semanas hasta año y medio |

**Relevancia directa para λ:** el marco ancla `λ = ln(2)/12` (vida media de 12
meses) citando que la literatura de gestión del cambio dice "entre 12 meses y
4 años, según la profundidad requerida" (sección 8.2). Los datos de coaching
ejecutivo encontrados aquí son **consistentes en orden de magnitud** con ese
ancla: señales tempranas a los 4-6 meses, impacto de negocio medible a los
9-12 meses — es decir, coincide con el punto medio de 12 meses donde el marco
dice que se cierra el 50% de la brecha. El hallazgo del hospital (2 años) y el
de "job crafting" medido a 18 meses también caen dentro del rango 12-24 meses
donde el marco predice 50%-75% de la brecha cerrada. **Ninguna fuente
encontrada da una curva de mejora cuantitativa (% de brecha cerrada por mes)
comparable directamente con la fórmula exponencial del marco** — la
verificación es de orden de magnitud (los horizontes de tiempo coinciden),
no una validación estadística de la forma funcional exacta. El marco ya es
honesto sobre esto: λ sigue siendo provisional, y esta investigación no cambia
esa conclusión, solo aporta más puntos de referencia consistentes.

---

## 5. Costo legal de desvinculación — Colombia (Código Sustantivo del Trabajo)

**Norma vigente:** Artículo 64 del Código Sustantivo del Trabajo (CST),
modificado por el artículo 28 de la Ley 789 de 2002 — "Terminación unilateral
del contrato de trabajo sin justa causa." Fuente primaria consultada:
leyes.co (texto consolidado), confirmado por múltiples fuentes secundarias de
derecho laboral colombiano (Actualícese, Buk, El Tiempo, Portafolio, El País,
Infobae — todas 2026, coincidentes en la tabla).

### Tabla vigente — trabajadores que devengan MENOS de 10 SMLMV

| Antigüedad | Indemnización |
|---|---|
| ≤ 1 año de servicio continuo | 30 días de salario |
| > 1 año de servicio continuo | 30 días básicos + 20 días adicionales de salario por cada año subsiguiente al primero, proporcional por fracción |

### Tabla vigente — trabajadores que devengan 10 SMLMV O MÁS

| Antigüedad | Indemnización |
|---|---|
| ≤ 1 año de servicio continuo | 20 días de salario |
| > 1 año de servicio continuo | 20 días básicos + 15 días adicionales de salario por cada año subsiguiente al primero, proporcional por fracción |

### Régimen transitorio — trabajadores con ≥10 años de servicio continuo al momento de entrar en vigencia la Ley 789 de 2002 (25 de diciembre de 2002)

Se les sigue aplicando la tabla del artículo 6 de la Ley 50 de 1990 (literales
b, c, d), no la tabla vigente de arriba:

| Antigüedad (al momento de la Ley 50/1990) | Indemnización |
|---|---|
| ≤ 1 año | 45 días de salario (literal a) |
| > 1 año y < 5 años | 45 días básicos + 15 días adicionales por año subsiguiente, proporcional por fracción (literal b) |
| ≥ 5 años y < 10 años | 45 días básicos + 20 días adicionales por año subsiguiente, proporcional por fracción (literal c) |
| ≥ 10 años | 45 días básicos + 40 días adicionales por año subsiguiente, proporcional por fracción (literal d) |

**Nota metodológica importante para el CFF:** el marco (sección 8) ya advierte
que "la indemnización legal... representa solo 15%-25% del costo real de
reemplazo" (fuente: Latin Human Capital, 2026) — esta tabla del CST es
exactamente esa indemnización legal parcial, NO el costo total de rotación
que usa el CFF (`Costo_rotación`, 25%-75% del salario anual). Esta tabla sirve
para: (a) validar que el 15-25% mencionado en el marco es plausible en orden
de magnitud (30 días ≈ 8% de un salario anual en el caso más simple de <1
año y <10 SMLMV, subiendo con antigüedad), y (b) para el caso de uso donde el
cliente pide desglosar cuánto de su costo de rotación es indemnización legal
obligatoria vs. costo oculto de reemplazo (reclutamiento, productividad
perdida, curva de aprendizaje).

**Contrato a término fijo:** la indemnización es distinta — el valor de los
salarios correspondientes al tiempo que faltare para cumplir el plazo
pactado del contrato, no la tabla por antigüedad de arriba (aplica solo a
contrato a término indefinido). No se investigó en profundidad por estar
fuera del foco de rotación/desvinculación estándar del CFF — señalado aquí
para no asumir que la tabla de indefinido aplica a todo tipo de contrato.

**Cobertura geográfica:** solo Colombia investigada, por instrucción directa
— el marco no menciona ningún país objetivo adicional (verificado por grep
de todo `DOCUMENTO_MARCO_SISTEMA_EFICIENCIA.md`: cero menciones de México,
Perú, Chile, Argentina, Ecuador o expansión regional). Ver nota de
arquitectura al final de este documento.

---

## 6. Segmentación por tamaño de organización

| Dato | Cifra | Fuente | Año | Qué mide |
|---|---|---|---|---|
| Rotación, pyme vs. promedio nacional (Colombia) | 32% (pyme) vs. 26% (promedio nacional) — 6 puntos porcentuales más alta en pyme | La República, "Rotación de talento humano en las Pyme es seis puntos más alta frente al promedio" | 2025 | Única cifra encontrada que compara directamente tamaño de empresa dentro de Colombia |
| Rotación voluntaria, pyme vs. empresa grande (EE.UU.) | 12.0% (pyme/mediana) vs. 9.9% (grande) | Síntesis de benchmarks SHRM | reciente, año exacto no confirmado en la fuente secundaria — verificar antes de usar | Rotación voluntaria anual por tamaño de empresa — benchmark de EE.UU., no de Colombia |
| Separaciones totales anuales, por tamaño de establecimiento (EE.UU.) | 51.5% (1-49 trabajadores) vs. 44.4% (empresas más grandes) | Síntesis de benchmarks SHRM | reciente, año exacto no confirmado en la fuente secundaria — verificar antes de usar | Separaciones totales (voluntarias + involuntarias) por tamaño — benchmark de EE.UU. |
| Costo de reemplazo, pyme (implícito) | 40%-200% del salario anual, con la observación explícita de que este costo pega más fuerte en pyme por menor "músculo financiero" | 4dayweek.io / La República (Colombia) | 2025 | Costo relativo de reemplazo — el rango numérico es igual al de empresa grande, pero el impacto relativo en caja es mayor para pyme |
| Clasificación legal de tamaño de empresa en Colombia | Desde 2019, exclusivamente por ingresos anuales (Decreto 957 de 2019) — ya NO por número de empleados ni activos | Ley Mipymes (Ley 590/2000, Ley 905/2004), modificada por Decreto 957 de 2019 | 2019 | Define qué cuenta como pyme en Colombia — relevante porque el sistema, si algún día segmenta por tamaño, no puede usar solo headcount como criterio legal-administrativo, aunque sí puede usarlo como proxy operativo |

**Conclusión de esta categoría:** la única cifra Colombia-específica de
tamaño de organización encontrada (rotación pyme vs. promedio, La República
2025) confirma que el efecto de tamaño existe y es material (6 puntos
porcentuales) — pero es un solo dato puntual, sin desagregación por sector
cruzada con tamaño. La mayoría de benchmarks de tamaño de empresa disponibles
públicamente son de EE.UU. (SHRM), no de Colombia — usar con la misma
salvedad que el marco ya aplica a Gallup: referencia global/extranjera sin
validar en la región, no benchmark local.

---

## Series útiles para calibración longitudinal vs. referencia puntual

**Longitudinalmente útiles (más de un punto en el tiempo, sirven para ver
velocidad de cambio, no solo nivel):**

- **Productividad total de los factores, Colombia, DANE/Banco de la República
  (serie 2006-2024)** — única serie multianual real encontrada a nivel
  nacional. Útil para contexto macro, no para calibrar directamente ningún
  parámetro del CFF/IAO (no está a nivel organización ni sector).
- **Rotación mensual BPO Colombia (2022→2023, dos puntos)** — la única serie
  de tiempo sectorial encontrada, aunque solo con dos observaciones. Muestra
  tendencia a la baja, insuficiente para estimar una velocidad de cambio
  confiable.
- **Timeline de coaching ejecutivo (4-6 meses señales tempranas, 9-12 meses
  impacto de negocio, 6-12 meses programa completo)** — no es una serie de
  tiempo de una sola organización, pero es una síntesis de múltiples estudios
  con horizontes temporales consistentes entre sí. Es el dato más
  directamente comparable a la curva exponencial de λ en el IFT (sección
  8.2) — sirve como punto de contraste de orden de magnitud, no de validación
  estadística de la forma funcional.
- **Estudio hospitalario "Leadership Saves Lives" (2 años, LSL)** — intervención
  real medida longitudinalmente en 10 hospitales; útil como caso de referencia
  de "cuánto dura una intervención de cambio cultural real", aunque de un
  sector distinto (salud, EE.UU.) al de la mayoría de clientes esperados de
  EFICIENCIA.

**Solo referencia puntual (una sola medición, sin serie de tiempo, útiles
como benchmark de nivel pero no de velocidad):**

- Todas las cifras de rotación por sector de Michael Page Colombia 2023
  (BPO 89%, retail 69%, manufactura 44%) — un solo año, sin serie histórica
  publicada.
- Ausentismo EALI 2024 (9.4 días/trabajador/año, 5.78% sobrecosto de nómina,
  $71,713 COP/mes) — el marco ya usaba una versión previa de este dato
  (1.04%-1.87% en años normales); esta investigación confirma cifras más
  recientes y específicas, pero sigue siendo un corte anual, no una serie.
- Toda la tabla de correlación engagement→resultado de Gallup Q12 (78%
  ausentismo, 21%/51% rotación, etc.) — es la 11ª edición acumulada de un
  meta-análisis, pero se reporta como cifra fija de la edición 2024, sin
  desglose histórico edición-a-edición en las fuentes consultadas. Útil como
  ancla de forma funcional (no lineal, umbral), no como serie de tiempo.
- Salarios Mercer Colombia 2025 (por nivel jerárquico y sector) — corte anual
  único, aunque Mercer sí publica esta encuesta cada año (por lo tanto una
  serie SÍ existe institucionalmente, pero esta investigación solo accedió al
  corte más reciente trascendido a prensa, no al histórico completo).
- Tabla de indemnización del CST (art. 64, Ley 789/2002, art. 6 Ley 50/1990) —
  es texto legal vigente, no una serie de tiempo; cambia solo cuando cambia
  la ley (última modificación relevante: 2002, más de 20 años de vigencia
  estable), por lo que es una referencia puntual pero de muy baja volatilidad
  — a diferencia de un benchmark de mercado, no necesita "refrescarse" con
  frecuencia, solo vigilarse por reforma laboral.
- Rotación pyme vs. promedio Colombia (32% vs. 26%, La República 2025) —
  un solo corte, sin serie histórica de esa comparación específica.
- Benchmarks de tamaño de empresa SHRM (EE.UU.) — puntuales y, además, de
  mercado extranjero.

---

## Nota de arquitectura (no ejecutar)

`organizaciones` (tabla del esquema Supabase, migración 001) no tiene hoy un
campo de país — confirmado por el esquema real y ya documentado en la memoria
`jerarquia_areas_escalada_confidencialidad` (que verificó el esquema completo
de `organizaciones` y `areas_organizacion` para un propósito relacionado:
ninguna de las dos tablas tiene columnas de jerarquía o geografía más allá de
`id, nombre, activa, creado_en`). Para que el CFF pueda aplicar reglas
legales/laborales específicas por país (como la tabla de indemnización del
CST que este documento reporta para Colombia en la sección 5), hace falta
agregar ese campo — es una **migración nueva, separada de esta investigación**,
que debe hacerse **después** de tener claro qué países hay que soportar. Esta
investigación no tocó el esquema ni creó ninguna migración — solo reporta la
necesidad, tal como se pidió.
