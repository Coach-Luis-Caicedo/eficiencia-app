# Investigación de benchmarks organizacionales vía reportes ESG/sostenibilidad

Fecha de la investigación: 2026-08-19.

Este documento complementa `INVESTIGACION_DATOS_CALIBRACION_CFF.md` — busca llenar
específicamente el vacío que esa investigación confirmó de forma explícita: **no
existe una serie de tiempo pública sectorial de rotación/ausentismo en Colombia**
(DANE no publica ese indicador). La hipótesis de esta investigación es que los
reportes de sostenibilidad/ESG (estándares GRI, SASB) de empresas grandes sí
publican estas series año a año, por ser datos primarios de la propia empresa, y
que agregando varias empresas del mismo sector se podría construir un benchmark
sectorial real "desde abajo" — en vez de depender de una sola fuente de prensa
(el problema ya detectado con la divergencia 41% vs. 26% de rotación nacional en
la investigación anterior).

**Regla seguida, igual que siempre:** solo cifras de reportes reales, con cita
del documento y año. Nunca inventar ni extrapolar un número que el reporte no
diga explícitamente. Cuando dos extracciones del mismo documento primario dieron
cifras distintas para lo que debería ser el mismo dato, se documentan ambas con
la advertencia explícita, no se elige una arbitrariamente — mismo criterio que la
investigación anterior aplicó a la divergencia El Colombiano vs. La República.

**Limitación técnica encontrada, importante para interpretar todo lo demás:** la
mayoría de los reportes de sostenibilidad corporativos en Colombia y la región
son PDFs de diseño (maquetados, con datos incrustados como imágenes/gráficos
vectoriales, no como texto plano). La herramienta de extracción usada en esta
investigación pudo leer texto de reportes simples (páginas HTML, PDFs de
organismos públicos) pero falló sistemáticamente al intentar extraer tablas de
indicadores de los reportes ESG "de diseño" de Argos, ANDI, MercadoLibre,
Nutresa y Grupo Éxito, entre otros — el archivo se descarga pero el extractor
solo ve "objetos de fuente, imágenes, codificación", no las cifras. **Esto no
significa que el dato no exista** — varios de estos reportes confirmadamente
tienen los indicadores (Celsia publica reportes ASG anuales desde 2013, ANDI
tiene un informe agregado de 504 empresas afiliadas para 2023) — significa que
extraer las cifras exactas de estos documentos requiere abrir el PDF
manualmente (o correr OCR dedicado), no automatización de búsqueda web. Se deja
esto documentado explícitamente como hallazgo metodológico, no como vacío de
datos.

---

## 1. Sector finanzas_tech — Grupo SURA (Colombia/regional)

Fuente: anexo laboral digital de Grupo SURA, integrado al Informe Anual
(`sura-grupo-empresarial-laboral-2025.pdf`, gruposura.com), consultado vía
extracción asistida — el PDF no cargó completo en el extractor directo (parcial
por tamaño/formato), así que las cifras siguientes provienen de dos pasadas de
búsqueda distintas sobre el mismo documento, que **no coinciden entre sí** para
lo que debería ser el mismo indicador. Se documentan ambas explícitamente:

**Extracción 1 (distingue "Grupo SURA" holding vs. "Grupo Empresarial SURA"):**

| Segmento | Rotación total | Rotación voluntaria | Año |
|---|---|---|---|
| Grupo SURA (holding) — administrativos | 17.46% | 3.17% | 2024 |
| Grupo SURA (holding) — comerciales/asesores | 11.64% | 8.01% | 2024 |
| Grupo Empresarial SURA — administrativos | 12.54% | 4.82% | año no especificado en esta pasada |
| Grupo Empresarial SURA — comerciales | 29.79% | 10.06% | año no especificado en esta pasada |

**Extracción 2 (misma fuente, busca serie 2022-2025, etiqueta todo como "Grupo Empresarial SURA"):**

| Segmento | Rotación total | Rotación voluntaria | Año |
|---|---|---|---|
| Administrativos | 11.80% | 7.00% | 2023 |
| Administrativos | 14.10% | 6.30% | 2024 |
| Comerciales/asesores | 32.80% | 10.90% | 2023 |
| Comerciales/asesores | 23.40% | 9.50% | 2024 |

**Advertencia explícita — no usar sin verificar contra el PDF original:** los
valores de "administrativos 2024" y "comerciales 2024" no coinciden entre las
dos extracciones (17.46%/11.64% vs. 14.10%/23.40%), y tampoco los de
"Grupo Empresarial SURA" sin año de la extracción 1 contra los de 2023/2024 de
la extracción 2. La causa más probable es que el documento tiene varias tablas
(por país — Colombia, México, Perú, Uruguay — y por entidad — holding vs. grupo
empresarial) y el extractor automatizado mezcló filas de tablas distintas. **No
usar ninguna de estas cifras como benchmark hasta abrir el PDF manualmente y
confirmar la tabla correcta** — se documentan aquí solo porque confirman que el
dato SÍ existe, con año y desagregación administrativo/comercial, lo cual ya es
información nueva (ningún otro reporte ESG consultado en esta investigación dio
series de 2+ años).

---

## 2. Sector manufactura — Cementos Argos (Colombia/EE.UU.)

| Dato | Cifra | Fuente | Año | Qué mide |
|---|---|---|---|---|
| Rotación voluntaria, Cementos Argos | 5.26% | Reporte Integrado 2024, Argos (argos.co) — extracción vía búsqueda, no verificada directamente por no poder leer el PDF de diseño | 2024 | Rotación voluntaria de empleados — no se pudo confirmar si es solo Colombia o incluye operación en EE.UU. |

**Vacío:** no se logró extraer la serie 2021-2023 que el Reporte Integrado 2023
y 2022 (mismos URLs de Argos, confirmados existentes) probablemente contienen —
los PDFs de Argos (`Reporte-Integrado-2023.pdf`, `Indicadores-SASB-2023.pdf`)
son documentos de diseño donde el extractor no pudo leer texto de tablas. Un
solo punto de dato (2024), sin serie, sin comparación intersectorial.

---

## 3. Sector salud_educacion — dos fuentes, ninguna con serie completa extraída

### 3.1 Encuesta ACHC (Asociación Colombiana de Hospitales y Clínicas) — sector, no una sola empresa

| Dato | Cifra | Fuente | Año | Qué mide |
|---|---|---|---|---|
| Rotación, personal médico | 13.1% | Encuesta ACHC sobre escasez y rotación de personal sanitario, revistahospitalaria.org | mayo-junio 2024 | Rotación total (renuncia + despido + jubilación + otras causas) / dotación promedio × 100 |
| Rotación, personal de enfermería | 15.8% | Misma encuesta ACHC | mayo-junio 2024 | Misma fórmula, personal de enfermería |

**Metodología confirmada (a diferencia de casi todo lo demás en este
documento):** encuesta a 102 instituciones de salud afiliadas a la ACHC,
representando 11,160 camas (11% de la capacidad hospitalaria nacional). El
propio estudio la caracteriza como corte transversal de percepción
institucional, **no un estudio longitudinal** — sin comparación contra años
anteriores. Incluye comparación internacional explícita: EE.UU. 17.8%-20.7%
(enfermería), Canadá ~20% (enfermería) / ~7% (médicos), Reino Unido 12%-18%
(enfermería) / ~9% (médicos) — Colombia queda en el rango medio-bajo de esa
comparación.

### 3.2 Subred Sur (red pública de hospitales, Bogotá) — dato confirmado que existe, no extraído

El Informe de Sostenibilidad 2023 de Subred Sur (`subredsur.gov.co`, bajo
estándares GRI) contiene explícitamente gráficos de "rotación de personal de
planta por edad, 2022 vs. 2023", "rotación de personal de planta por género,
2022 vs. 2023", y las mismas dos vistas para "personal prestador de servicios"
— confirmado por el índice del documento. **No se pudo extraer la cifra
numérica**: el PDF excede el límite de tamaño de la herramienta de lectura
directa (10MB), y las búsquedas dirigidas no devolvieron los números de los
gráficos en texto. Es el caso más claro de esta investigación de "el dato
longitudinal por sector SÍ existe en una fuente pública gratuita, pero
extraerlo requiere abrir el PDF manualmente" — recomendado como el primer
documento a revisar a mano si se quiere una serie real de 2 años para el
sector salud.

---

## 4. Reportes confirmados que existen, con indicadores GRI/SASB de talento, pero sin cifras extraídas

Para dejar claro qué se intentó y no dio resultado (en vez de omitirlo en
silencio):

| Empresa | Sector | País | Qué se confirmó | Por qué no hay cifra |
|---|---|---|---|---|
| Bancolombia | finanzas_tech | Colombia | Reporte de gestión sigue estándares GRI, rastrea ausentismo explícitamente | Búsqueda y fetch no devolvieron la tabla numérica |
| Ecopetrol | manufactura/energía | Colombia | Informe Integrado de Gestión (16ª edición), evalúa desempeño con "ausentismo laboral" como indicador nombrado | Igual — tabla no accesible vía búsqueda/fetch |
| Grupo Bolívar / Davivienda | finanzas_tech | Colombia, Panamá, El Salvador, Costa Rica, Honduras | Reportes históricos (2010-2020) bajo metodología GRI 4, con datos de "vinculaciones" y "retiros" en 2011 | Serie reciente (2020+) no accesible en el formato buscado |
| Grupo Éxito | retail_logistica | Colombia | Reportes de sostenibilidad 2015-2024 confirmados existentes, usa GRI | Ningún resultado con cifra de rotación |
| Falabella (Retail/Banco) | retail_logistica | Chile/Colombia/Perú | Reporte de Sostenibilidad + Memoria Integrada anual, GRI 401-1 aplicable | Cifra no extraída |
| Grupo Nutresa | manufactura (alimentos) | Colombia + regional | Informe 2023 "asuntos sociales y ambientales" específico, bajo GRI/SASB | Documento bloqueado (HTTP 403) al intentar leerlo directamente |
| ANDI — informe agregado industria | multisector | Colombia | Informe de Sostenibilidad Agregado de Empresas Afiliadas 2023, 504 empresas | PDF de diseño, extractor no pudo leer tablas — es la fuente con más potencial de benchmark sectorial agregado de todas las encontradas, pendiente de revisión manual |
| MercadoLibre (MELI) | retail_logistica/tech | Regional (México, Brasil, Argentina, Colombia, Chile, Perú) | Reporte de impacto 2023 con anexo de indicadores GRI | PDF de indicadores descargado pero ilegible para el extractor |
| Celsia | manufactura/energía | Colombia | Reportes integrados/ASG anuales confirmados 2013-2025 (índice completo verificado) | Ninguna cifra extraída — se revisó solo la página índice, no los PDFs individuales |
| Walmart de México y Centroamérica | retail_logistica | México, Centroamérica | Reporte ASG anual confirmado (2022-2025) | Cifra no extraída |
| Alicorp | manufactura (alimentos) | Perú | Reporte integrado con aseguramiento independiente, GRI+SASB+CSA | Cifra no extraída |
| Interbank / Credicorp (BCP) | finanzas_tech | Perú | Reportes de sostenibilidad GRI desde 2018 confirmados | Cifra no extraída |

---

## Comparaciones intra-sector

**No se logró ninguna comparación real de 2+ empresas del mismo sector con el
mismo indicador y cifras verificadas** — la limitación técnica de extracción de
PDFs de diseño (ver arriba) impidió sacar números de la mayoría de las
candidatas. La más cercana a esto es el sector salud (ACHC 13.1%/15.8% a nivel
sectorial agregado por encuesta, vs. Subred Sur con serie 2022-2023 confirmada
pero sin cifra) — no son comparables entre sí porque miden cosas distintas
(encuesta transversal multi-institución vs. una sola red hospitalaria con
serie temporal).

**La fuente con más potencial real para esto es el informe agregado de ANDI**
(504 empresas afiliadas, 2023) — por diseño, ese documento ya hace el trabajo
de agregar sector por sector, en vez de que esta investigación tenga que
agregar desde cero reporte por reporte. No se pudo extraer su contenido con las
herramientas usadas aquí — es la recomendación más clara para revisión manual
si se quiere avanzar en este objetivo específico.

---

## Series longitudinalmente útiles vs. referencia puntual

**Series con 2+ años confirmados (aunque con matices):**

- **Grupo SURA — rotación administrativos/comerciales, 2023 y 2024** — serie
  real de 2 años con desagregación por tipo de empleado, pero con
  inconsistencia interna entre dos extracciones del mismo documento que impide
  usarla sin verificación manual (sección 1). Es, aun así, la serie multianual
  más completa encontrada en toda esta investigación — más que cualquier
  benchmark de prensa.
- **Subred Sur — rotación de personal por edad y género, 2022 vs. 2023** —
  confirmado que existe como serie de 2 años en un reporte GRI público y
  gratuito, pero sin cifra extraída todavía (sección 3.2).
- **Celsia — reportes ASG/integrados anuales, 2013-2025** — la serie
  institucional más larga confirmada de todo el documento (13 años de
  reportes publicados), pero no se extrajo ninguna cifra de rotación/ausentismo
  de ningún año individual — queda como el candidato de mayor profundidad
  histórica para revisión manual futura.

**Solo referencia puntual (un corte, sin serie):**

- Cementos Argos, rotación voluntaria 5.26% (2024) — un solo año.
- ACHC, rotación médicos/enfermería 13.1%/15.8% — encuesta transversal única
  (mayo-junio 2024), explícitamente sin comparación histórica, aunque sí con
  comparación internacional válida como referencia de nivel.

---

## Sectores/países sin cobertura encontrada

- **servicios_prof:** ninguna empresa colombiana de este sector fue
  identificada con reporte ESG con cifras extraídas — no se buscó a fondo por
  no tener un "gran jugador" tan evidente como en los otros 4 sectores del CFF.
- **Fase 2 (México, Perú, Chile, Argentina, Ecuador, Venezuela, Costa Rica,
  Panamá, Guatemala):** se buscaron activamente México (Walmart de México y
  Centroamérica), Perú (Alicorp, Interbank/Credicorp) y Chile (Falabella) —
  las tres confirmaron que existen reportes GRI recientes, pero ninguna dio una
  cifra extraíble de rotación/ausentismo en el tiempo disponible. **Argentina,
  Ecuador, Venezuela, Costa Rica, Panamá y Guatemala no se buscaron en absoluto
  a nivel de empresa individual en esta investigación** — vacío total, a
  diferencia de México/Perú/Chile donde sí hubo búsqueda activa sin resultado
  numérico.
- **retail_logistica Colombia:** Grupo Éxito y Falabella confirmados con
  reportes GRI, ninguna cifra extraída.
- Ningún hallazgo de esta investigación debe tratarse como benchmark listo
  para usar en el CFF sin abrir manualmente el PDF fuente correspondiente y
  confirmar la cifra — a diferencia de `INVESTIGACION_DATOS_CALIBRACION_CFF.md`,
  donde la mayoría de las cifras sí pudieron confirmarse con texto legible
  directo.
