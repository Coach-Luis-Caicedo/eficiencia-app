# Validación de plausibilidad ampliada — IAO_target (3 niveles) y fórmula IFT completa

Fecha: 2026-08-21. Amplía `VALIDACION_IFT_CASOS_REALES.md` (mismo repo,
mismo día) con una búsqueda más amplia de casos reales y evidencia agregada.
Sigue siendo un ejercicio de validación, no código de producción — no toca
`supabase/migrations/`, no modifica la Ficha financiera.

**Qué es esto y qué NO es (misma aclaración que el documento anterior,
reforzada porque ahora hay más evidencia detrás):** con más fuentes, esto
sigue siendo una **prueba de plausibilidad ampliada**, no una calibración
estadística real. Los casos reunidos aquí —empresas individuales, estudios de
consultora, meta-análisis académicos— **no son comparables entre sí**: distinta
profundidad de intervención, distinto sector, distinto método de medición,
ninguno mide el IAO real (instrumento propio, nunca aplicado a ninguna de
estas organizaciones). Sumar más fuentes reduce el riesgo de que la
conclusión dependa de un caso atípico, pero no convierte esto en un diseño de
estudio controlado. **No reemplaza la necesidad del piloto de 12+ meses**
(sección 12 del marco) — es un paso intermedio de mayor confianza, no un
sustituto. El cierre sigue siendo "no encontramos absurdos matemáticos ni
evidencia de sesgo sistemático grande", nada más fuerte que eso.

---

## 1. Qué se amplió y con qué resultado — honesto sobre lo que no se encontró

Se lanzaron tres frentes de búsqueda adicionales a los ya usados en
`INVESTIGACION_DATOS_CALIBRACION_CFF.md` e
`INVESTIGACION_BENCHMARKS_ESG_SOSTENIBILIDAD.md`:

### 1.1 Más empresas con reportes ESG/GRI (Colombia y Latam) — sin resultado nuevo utilizable

Se intentó extraer cifras de rotación/ausentismo de 13 fuentes adicionales:
Falabella (2022, 2023), Grupo Nutresa 2023, ANDI (informe agregado 504
empresas), Celsia (índice GRI), Subred Sur 2023, el Informe Anual 2023 de
SURA (para intentar resolver la divergencia entre las dos extracciones ya
señalada en la investigación ESG previa), Davivienda/Grupo Bolívar,
Bancolombia, Interbank/Credicorp, Ecopetrol, y Great Place to Work Colombia.

**Resultado: cero cifras nuevas verificables.** Las causas, documentadas caso
por caso: PDFs que exceden el límite de tamaño de la herramienta de fetch
(Falabella, Subred Sur, SURA Informe Anual), HTTP 403 (Grupo Nutresa),
contenido codificado como imagen no extraíble (ANDI, Celsia), subdominios que
ya no resuelven por DNS (Celsia, reportes de años anteriores), y reportes
confirmados que existen pero sin cifra accesible en snippets ni HTML
(Davivienda, Bancolombia, Interbank). Great Place to Work Colombia no publica
series históricas públicas de puntaje por empresa — solo certificación/ranking
anual, sin el número subyacente.

**Hallazgo tangencial, no usable directamente:** el portal de Ecopetrol
publica en HTML una serie real de 6 años (2015-2020) del "Índice de Severidad
de Enfermedades de Interés Ocupacional" (días por millón de horas trabajadas):
total 2015 = 18.8 → 2020 = 11.51 (fuente:
ecopetrol.com.co, página de indicadores de salud ocupacional). Es la única
serie multianual nueva con cifra verificada de esta ronda de búsqueda — pero
mide severidad de enfermedad ocupacional, no rotación/ausentismo/engagement,
así que no encaja en ningún componente del CFF tal como está definido hoy. Se
documenta por transparencia (se buscó y sí se encontró algo, aunque no lo que
se necesitaba), no se usa en los cálculos de este documento.

**Conclusión de este frente:** la muestra de empresas con serie temporal
propia sigue siendo la misma que ya tenía `VALIDACION_IFT_CASOS_REALES.md` —
SURA (Comercial y Admin, 2023→2024) y BPO Colombia sectorial (2022→2023). No
por falta de búsqueda: el problema estructural ya identificado en la
investigación ESG previa (PDFs de diseño ilegibles) se confirma de nuevo, y se
suma un hallazgo negativo nuevo: **no existe públicamente ningún caso de
consultora (McKinsey/Kotter/Gallup/Deloitte/BCG) con empresa nombrada y cifra
de rotación/ausentismo/engagement verificable con fuente primaria citable.**
Lo que circula en blogs de marketing (ej. pryor.com) describe casos sin
atribución citable ("una firma de tecnología mediana") — descartado por la
misma regla de rigor que gobierna toda esta investigación.

### 1.2 y 1.3 Estudios de consultoras + meta-análisis académicos — sin nuevos casos empresa-a-empresa, pero con evidencia agregada fuerte para λ

Aunque no apareció ningún caso individual con cifra de rotación/ausentismo
citable, sí apareció evidencia agregada de calidad — grande en N, aunque de
dominio distinto (salud organizacional, actitudes laborales, no
específicamente rotación/ausentismo) — que es más fuerte que lo que ya
existía en el marco para validar específicamente `λ`. Ver sección 3.

---

## 2. Los 3 niveles de IAO_target (20%/40%/60%) — sin cambios respecto al documento anterior

Ninguna de las tres rondas de búsqueda amplió la muestra de empresas con
serie temporal de rotación propia (sigue siendo SURA + BPO). Los resultados
de `VALIDACION_IFT_CASOS_REALES.md`, sección 3, se mantienen sin cambios:

| Caso | Reducción real observada en 12 meses | Dónde cae frente a los 3 niveles (que a 12m predicen 10%/20%/30%) |
|---|---|---|
| SURA Comercial | 34.1% | Por encima del nivel más agresivo (60% → 30% a los 12m) |
| BPO Colombia (sector, sin intervención activa) | 3.6% | Por debajo del nivel más conservador (20% → 10% a los 12m) |
| SURA Admin | Empeoró 35.2% | No representable por el modelo (converge siempre hacia mejora) |

Los 3 niveles siguen **dentro del rango de variación real observada**, sin
quedar **confirmados por** ella — mismo resultado, ahora con la confirmación
adicional de que una búsqueda más amplia no encontró un tercer caso empresa
que permitiera ajustar esta lectura en ninguna dirección.

---

## 3. Evidencia agregada nueva para validar `λ = ln(2)/12` — la parte que sí se amplió de forma sustancial

A diferencia de la sección 2, aquí sí hay material nuevo real, con muestras
mucho más grandes que cualquier cosa usada hasta ahora en el proyecto:

| Fuente | Tipo | N | Qué mide | Curva de tiempo reportada | Fuente/URL |
|---|---|---|---|---|---|
| **Solinger, Joireman, Vantilborgh & Balliet (2021)**, *Journal of Organizational Behavior* | Meta-análisis académico, revisado por pares | **137 estudios longitudinales, 573 tamaños de efecto** | Cambio en actitudes laborales a nivel de unidad (compromiso, satisfacción) tras intervenciones estratégicas | Intervalo de medición entre intervención y resultado: **mediana 12 meses, promedio 20.68 meses** | onlinelibrary.wiley.com/doi/10.1002/job.2523 |
| **McKinsey**, "Organizational Health: A Fast Track to Performance Improvement" | Estudio agregado propio (no revisado por pares) | **1,500+ empresas, 100 países, ~10 años, 4M+ respuestas** | Índice de salud organizacional (OHI) — el proxy publicado por un tercero más cercano a lo que el IAO intenta medir | Mejoras tangibles en **6-12 meses**; re-medición completa recomendada a los **9-18 meses**; ~80% de empresas que actúan muestran mejora, mediana +6 puntos de índice | mckinsey.com/capabilities/people-and-organizational-performance/our-insights/organizational-health-a-fast-track-to-performance-improvement |
| **Baicker, Cutler & Song (2005)**, meta-análisis citado en *Health Affairs* (2009) | Meta-análisis académico | **56 estudios** de programas de bienestar corporativo | Ausentismo, costos de salud, discapacidad | Reducción agregada ~25% en licencias médicas/costos — **horizonte temporal exacto no verificado** (documento fuente bloqueado, HTTP 403) | healthaffairs.org/doi/10.1377/hlthaff.2009.0626 |
| **Prosci** — caso University of Virginia | Estudio de caso individual (N=1, no comercial — universidad) | 1 | Ahorros de un programa de gestión del cambio | $21.9M/año en régimen; **$82.1M acumulado en 4 años** (menor a 4×21.9M=87.6M) → la tasa anual se alcanza progresivamente, no de golpe | prosci.com/resources/success-stories/university-of-virginia-improves-project-roi-with-advanced-change-capabilities |
| **Prosci** — benchmarking ERP | Benchmarking agregado histórico | Miles (N exacto no confirmado en esta cifra) | Velocidad de adopción de una herramienta/proceso, no cambio cultural profundo | Adopción en 2 meses con buena gestión del cambio vs. 6 meses sin ella — **dominio distinto, no comparable directamente** | prosci.com/blog/erp-change-management |
| **Kotter** (caso académico, Hong Kong Broadband Network) | Estudio de caso individual, vía paper académico (Emerald) | 1 | EBITDA, utilidad por acción (no rotación/engagement) | EBITDA 29%→34.4%, EPS +64% en un año dentro de un programa de 4 años | emerald.com/pap/article/21/2/152 |
| **Macy & Izumi**, meta-análisis 1961-1991 | Meta-análisis académico | **131 estudios de campo norteamericanos** | Desempeño financiero ligado a intervenciones de desarrollo organizacional | Confirma efecto significativo; **no se encontró curva tiempo-a-efecto específica** | researchgate.net/publication/362225717 |
| Gallup, cifra secundaria (18%/43% cuartil rotación) | Cita de blog, no verificada contra el documento primario | No especificado | Rotación por cuartil de engagement | **Diverge de 21%/51% ya citado del Q12 Meta-Analysis 11ª ed. en el marco** — no se pudo confirmar si es otra edición o una paráfrasis imprecisa | — (descartado, no usar) |

**Hallazgo negativo importante, buscado explícitamente y no encontrado en
ninguna de las tres rondas:** ningún estudio académico ni de consultora usa
un modelo de decaimiento exponencial ("vida media") para cambio
organizacional — el término "half-life" en esta literatura aparece solo para
depreciación de conocimiento o en física/química, nunca para engagement,
rotación o índices de salud organizacional. **Ningún dato agregado confirma
ni contradice la forma funcional exponencial específica del IFT** — toda la
evidencia disponible da uno o dos puntos ("mediana 12 meses", "6-12 meses"),
compatibles con exponencial pero igual de compatibles con lineal, logístico o
escalonado. El marco ya es honesto sobre esto (`λ` "sin validar,
provisional"); esta búsqueda ampliada no cambia esa conclusión — la refuerza
con dos fuentes de N mucho mayor (1,500+ empresas, 137 estudios) que las que
ya existían (síntesis de coaching ejecutivo, sección 4 de
`INVESTIGACION_DATOS_CALIBRACION_CFF.md`).

### 3.1 Lectura cuantitativa: ¿el modelo tiende a sobreestimar o subestimar la velocidad real?

Con `λ = ln(2)/12`, el modelo predice que a los 6 meses se ha cerrado
`1 − e^(−ln(2)/12×6) = 1 − 0.707 ≈ 29.3%` de la brecha. McKinsey reporta
señales tangibles ya a los 6 meses (rango 6-12) sobre una base de 1,500+
organizaciones — sin dar el % exacto de mejora a los 6 meses específicamente,
así que no se puede comparar número contra número, pero el hecho de que
McKinsey marque los 6 meses como el extremo temprano del rango donde ya hay
señal tangible es, en el mejor de los casos, un indicio débil de que **el
modelo podría ser ligeramente conservador en el primer semestre** — no
hay evidencia de que sea drásticamente lento ni drásticamente rápido. Solinger
et al. (mediana 12 meses como intervalo de medición, N=137 estudios)
coincide con el punto donde el marco ya fija la vida media — misma lectura
que ya hizo el marco con el timeline de coaching ejecutivo (sección 8.2):
coincidencia de orden de magnitud, no prueba de la forma funcional exacta.

**Patrón consolidado, combinando los casos empresa (sección 2) con la
evidencia agregada (esta sección):** no hay ningún punto de evidencia, en
ninguna de las dos rondas de búsqueda, que sugiera que el modelo esté
equivocado en más de un orden de magnitud en cualquier dirección. Donde sí
hay divergencia real es entre **contextos con intervención activa** (McKinsey,
Solinger, coaching ejecutivo — todos caen cerca de 12 meses) y **contextos sin
intervención activa** (BPO Colombia, tendencia de mercado pasiva — mucho más
lento, 3.6% en 12 meses). Esto no es una falla del modelo: el IFT está
diseñado para proyectar bajo intervención activa (la del programa EFICIENCIA),
no tendencia de mercado — el caso BPO sirve como **piso de referencia** de
"qué tan lento es el cambio sin ningún esfuerzo estructurado", útil para
calibrar expectativas, no como prueba en contra de `λ`.

### 3.2 Hallazgo de mecanismo, más importante que el de tiempo — nuevo, no estaba en el marco ni en la investigación previa

Solinger et al. (2021) reportan un resultado cualitativo directamente
relevante para el IFT, más allá de cualquier número de meses: **cuando una
organización combina una intervención "cost-oriented" (recortes,
reestructuración) con una intervención "people-oriented" (cultura, desarrollo)
en el mismo período, el efecto neto sobre las actitudes laborales es nulo**
— no solo más lento, **nulo**. La sección 8.3 del marco ya lista "factores
que extienden el plazo" (`F_ext ≥ 1`, vida media efectiva = `12 × F_ext`),
pero todos esos factores asumen que el proceso sigue avanzando, solo más
despacio. Este hallazgo describe un modo de falla distinto y más severo: si
el cliente real de EFICIENCIA está recortando costos en paralelo al programa
(escenario plausible — es exactamente el tipo de organización con IAO alto
que más necesitaría el programa, y también la que más presión tiene para
recortar), el `λ` efectivo podría no ser "más lento", podría ser
**efectivamente cero mientras el conflicto persista** — un caso que
`F_ext ≥ 1` (que solo alarga, nunca detiene) no puede representar. Vale la
pena señalarlo explícitamente en la sección 8.3 como una categoría aparte
("intervención en conflicto activo con recorte de costos simultáneo"), no
como una variación más de `F_ext`.

---

## 4. T_rec — corrección importante: el "hallazgo principal" de la unidad temporal del CFF fue retractado

**Actualización 2026-08-21, posterior a la búsqueda ampliada de este
documento:** a pedido de Luis, se hizo una verificación objetiva adicional
de la supuesta ambigüedad de unidad temporal del CFF (contraste contra el
motor legacy `piioKpiToCost()`/CTD en `workbook.html`, y re-verificación
palabra por palabra de las fuentes Gallup/ACRIP/Michael Page/Adecco). **Esa
verificación refutó la hipótesis**: la fórmula de `migración 015`, tal como
está escrita, ya es algebraicamente equivalente al motor legacy — no falta
ningún `×12`, y agregarlo introduciría un error nuevo (contar la
anualización dos veces), no corregiría uno existente. `VALIDACION_IFT_CASOS_REALES.md`
sección 4 quedó reescrita con la tabla de `T_rec` correcta (4-39 meses en
los 4 casos, ningún "nunca recupera"), y su punto 1 de "hay que resolver
antes de construir el motor" quedó retractado explícitamente. Ver ese
documento para el detalle completo de la verificación — no se repite aquí.

Con esto corregido: los cálculos de T_rec no cambian por falta de datos de
esta ronda de búsqueda — ninguna búsqueda aportó un dato de
`Costo_intervención_cliente` o `N`/`Salario_promedio` real que permita
refinarlos más allá de lo ilustrativo, pero ya no cargan la ambigüedad de
unidad temporal que se sospechaba. Lo único que se añade aquí es la
implicación del hallazgo de la sección 3.2: si el cliente combina el programa
EFICIENCIA con recorte de costos simultáneo, `T_rec` calculado con `λ`
estándar sería **optimista, no solo impreciso** — el modelo no tiene hoy
ninguna forma de detectar o advertir ese escenario antes de proyectar un
número al cliente.

---

## 5. Conclusión honesta — con muestra ampliada, mismo veredicto, más respaldo

**Sigue sin haber absurdos matemáticos.** Ningún caso nuevo, ninguna fuente
agregada nueva, produjo un `T_rec` negativo, cero, o una curva `IAO(t)` fuera
de rango. La evidencia agregada de mayor N encontrada en esta ronda (McKinsey,
1,500+ empresas; Solinger et al., 137 estudios peer-reviewed) es consistente
en orden de magnitud con el ancla de 12 meses que el marco ya usa — ninguna
sugiere que `λ` esté equivocado por un factor de 2x o más en ninguna
dirección.

**Sigue sin ser una calibración.** Con más fuentes, la conclusión de fondo no
cambió: 20%/40%/60% quedan dentro del rango real observado (un caso lo supera,
otro no lo alcanza), sin quedar confirmados por él. La búsqueda ampliada no
encontró ningún caso empresa-a-empresa adicional con serie temporal de
rotación propia — el cuello de botella sigue siendo el mismo que documentó
`INVESTIGACION_BENCHMARKS_ESG_SOSTENIBILIDAD.md` desde el principio: los
reportes ESG existen, pero están en PDFs de diseño que ninguna herramienta de
extracción automatizada de esta investigación pudo leer. Abrir esos PDFs a
mano (recomendación ya hecha en esa investigación, reafirmada aquí) sigue
siendo la única vía conocida para ampliar la muestra de empresas más allá de
SURA y BPO sin esperar al piloto propio.

**Lo nuevo que sí cambia el documento anterior:** un hallazgo de mecanismo,
no de calibración — la literatura académica (Solinger et al., N=137 estudios)
documenta que intervención de recorte de costos simultánea con inversión
cultural anula el efecto, no solo lo alarga. Esto debería añadirse a los
supuestos explícitos pendientes de la sección 8.3 del marco, junto a los
puntos que siguen vigentes de `VALIDACION_IFT_CASOS_REALES.md`
(`Costo_intervención` no escalado por severidad/tamaño, el modelo no
representa trayectorias que empeoran, y la periodicidad no definida de
`CostoOperativoTotal_cliente` en `Costo_retrabajo`) — **no** la supuesta
unidad temporal ambigua del CFF general, que la verificación de la sección 4
(arriba) confirmó que no era un problema real.

**Sigue sin reemplazar el piloto.** Con o sin esta ampliación, la única forma
de calibrar de verdad los 3 niveles y `λ` sigue siendo medir el IAO real en
organizaciones reales de EFICIENCIA durante 12+ meses (sección 12 del marco)
— este documento reduce el riesgo de que la conclusión dependa de un solo
caso atípico, no lo elimina.
