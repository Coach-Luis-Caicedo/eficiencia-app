# Investigación de ausentismo y retrabajo por sector — Colombia/Latam

Fecha de la investigación: 2026-08-21.

Complementa `DOCUMENTO_MARCO_SISTEMA_EFICIENCIA.md` (sección 8, CFF) y sigue
directamente del hallazgo de la auditoría del mismo día que llevó a la
migración 017 (`supabase/migrations/017_benchmark_rotacion_por_sector.sql`):
`organizaciones.sector` ganó un benchmark de respaldo para
`TasaRotaciónBase` (retail_logistica 69%, manufactura 44%, salud_educacion
14.45% — Michael Page Colombia 2023 y ACHC 2024), pero `TasaAusentismoBase`
y `TasaRetrabajoBase` se dejaron deliberadamente sin tocar, señalados como
"pendientes de investigación adicional". Este documento es esa
investigación — con el mismo criterio de rigor de siempre: solo cifras con
fuente citable, año, y qué mide exactamente; ningún número inventado o
forzado para llenar un vacío.

**Resultado adelantado, para no enterrar la conclusión:** el vacío se
confirma para los dos. No se construye ningún benchmark nuevo. Ambos quedan
pendientes, mismo estado que la Fase 2 de países.

---

## 1. Ausentismo por sector

Benchmark nacional actual (sin cambios, sigue siendo el único disponible):
`TasaAusentismoBase_pais['colombia']` = 9.4 días/trabajador/año (EALI 2024,
CESLA-ANDI), sin desagregación por sector.

| Sector | Cifra encontrada | Fuente | Año / muestra | Qué mide exactamente | Confianza |
|---|---|---|---|---|---|
| **servicios_prof (call center/BPO)** | **4.28 días/trabajador/año** (±5.64 de desviación) | SciELO, *"Absentismo laboral por incapacidad médica en un centro de contacto de la ciudad de Medellín"* | 2016-2017, N=7,994 personas, 36,283 registros | Ausentismo por incapacidad médica (excluye licencias de maternidad/paternidad) | Media — estudio académico real con muestra grande, pero **una sola empresa, una sola ciudad**, datos de hace 8-9 años |
| **salud_educacion** | *(nada)* | — | — | La encuesta ACHC mayo-jun 2024 (la misma ya usada para rotación de este sector, 13.1%/15.8%) **no incluye ausentismo** — confirmado leyendo la fuente original directamente: solo menciona "burnout y ausentismo" como factor contextual cualitativo, sin cifra numérica | — |
| **manufactura** | *(nada)* | — | — | Ninguna búsqueda encontró cifra de ausentismo específica de manufactura colombiana — solo las tendencias nacionales agregadas ya conocidas (EALI) | — |
| **retail_logistica** | *(nada)* | — | — | Sin cifra Colombia-específica; el único hallazgo fue una nota de prensa española sin metodología propia, descartada | — |
| **finanzas_tech** | *(no buscado a fondo)* | — | — | Fuera del foco principal de esta ronda — vacío no explorado, distinto de "buscado y no encontrado" | — |

**Fuentes revisadas explícitamente, sin resultado sectorial utilizable** (para
dejar constancia de qué se intentó, no solo qué se encontró):

- **ACHC** — confirmado sin cifra de ausentismo, solo rotación (ya usada).
- **EALI 2023** (informe completo, `andi.com.co`) — PDF de diseño (imágenes
  comprimidas), sin tabla de texto extraíble por sector, mismo problema
  técnico ya documentado en `INVESTIGACION_BENCHMARKS_ESG_SOSTENIBILIDAD.md`
  con los reportes ESG.
- **Fasecolda RL Datos** (`sistemas.fasecolda.com/rldatos/`) — confirmado
  que existe como portal interactivo con capacidad de filtrar por actividad
  económica/CIIU, pero es una **herramienta de consulta**, no un reporte
  estático descargable — no responde a extracción automatizada (HTTP 503 al
  intentar). Es el candidato más prometedor para una revisión manual futura,
  igual que el informe agregado de ANDI ya señalado en la investigación ESG
  anterior para rotación.
- **Aon Colombia, Benchmarking de Ausentismo 2018** — PDF de diseño, sin
  desagregación sectorial extraíble.
- **Estudio académico de Perú** (síntesis de 11 tesis, 4 sectores:
  hospitalario/minero/poder judicial/servicios básicos, años 2001-2017) —
  descartado explícitamente por baja calidad de fuente (síntesis de segunda
  mano, sin cifras concretas por sector accesibles, sectores que no
  coinciden con los del CFF) — no se forzó su uso solo por existir.

**Conclusión de esta sección:** el único dato real encontrado (call center
Medellín, 4.28 días) es de **una sola empresa**, no de un sector completo, y
tiene casi una década de antigüedad — un salto de evidencia claramente más
débil que el que ya respaldó el benchmark de rotación (que tuvo 2 cifras
Michael Page de sector + 1 ACHC de encuesta multi-institucional, todas con
metodología clara y muestra grande). Usarlo como "benchmark de
servicios_prof" sería exactamente el tipo de número forzado que este
documento tiene instrucción explícita de no producir.

---

## 2. Retrabajo por sector (fuera de manufactura)

Benchmark actual (sin cambios): `TasaRetrabajoBase` 5%-15%, único, anclado
en manufactura (estudios de manufactura + un ejemplo colombiano: planta con
3% de defectos = $18.5M COP/mes en retrabajo).

| Sector | Cifra encontrada | Fuente | Año / muestra | Qué mide exactamente | ¿Comparable al "retrabajo" del CFF? | Confianza |
|---|---|---|---|---|---|---|
| **Call center / BPO** | *(nada)* | — | — | Búsquedas dirigidas a KPIs de calidad/reproceso (first call resolution, tasa de reprocesamiento de llamadas) devolvieron solo guías genéricas globales de proveedores (Genesys, Salesforce, SQM Group) sin cifra Colombia-específica ni metodología citable. Confirmado que el sector BPO colombiano se reporta anualmente (rankings Teleperformance/Konecta/Atento), pero nunca con métrica de calidad/reproceso, solo participación de mercado | N/A | — |
| **Salud** | 10.1% de reingreso hospitalario a 30 días; el costo de esos reingresos = 15.8% del costo total de las hospitalizaciones de la cohorte | *"Frecuencia de reingresos hospitalarios y factores asociados..."*, *Cadernos de Saúde Pública*, 2016, v.32 n.7 (SciELO/DOAJ) | Cohorte retrospectiva, 64,969 hospitalizaciones, ene-2008 a ene-2009, 47 ciudades colombianas, n=6,573 reingresos | Reingreso hospitalario (paciente dado de alta que vuelve a ser hospitalizado) y su costo como % del costo total de esa cohorte | **Parcialmente, con reserva importante:** un reingreso no siempre es "error" — mezcla causas evitables (alta prematura, calidad de atención) e inevitables (progresión de enfermedad); no es un defecto/reproceso en el sentido literal de manufactura | Media — cifra consistente entre varios resultados de búsqueda independientes, pero **la fuente primaria no se pudo leer directamente** (HTTP 403 en SciELO, scielo.br y ResearchGate en los 3 intentos); datos de ~18 años (2008-2009) |
| **Salud — eventos adversos quirúrgicos** | Cifra general sin fuente primaria clara ("10% eventos adversos"); un estudio puntual reporta 7.3% (2009) → 3.3% (2010) tras checklist quirúrgico OMS | Fragmentos apuntando a SciELO Public Health | 2009-2010, una sola institución de tercer nivel (no identificada con certeza) | Eventos adversos relacionados con el acto quirúrgico — seguridad del paciente | **No** — es una medida de seguridad clínica, conceptualmente distinta de "costo de reproceso"; forzar la equivalencia habría sido exactamente el tipo de traducción dudosa que se pidió evitar | Baja — fuente no accesible directamente (403), institución/muestra no confirmadas |
| **Construcción / logística** | *(no explorado)* | — | — | Vacío no explorado por límite de la ronda de búsqueda — distinto de "buscado y no encontrado" | N/A | — |
| **Retail — devoluciones** | Rango disperso 9%-30% según fuente (tiendas físicas ~9%, ecommerce ≥20%, moda >30%) | Blogs de logística (SKU Logistics, Tookane, Mecalux), citando a su vez NRF/Invesp/Shopify | Sin año consistente, cifras mezcladas de EE.UU./global | Tasa de devolución de pedidos | **No** — la causa más frecuente de devolución reportada para Colombia es "compra impulsiva", no error de despacho; devolución ≠ retrabajo | Baja — ninguna fuente primaria colombiana con metodología propia, todo vía blogs de marketing de logística citando estudios extranjeros |

**Conclusión de esta sección:** de los 4 sectores/categorías buscados, solo
salud aportó algo remotamente utilizable (reingresos hospitalarios), y con
dos problemas serios simultáneos: la fuente primaria no se pudo verificar
directamente, y el concepto (reingreso hospitalario) no es un equivalente
limpio de "retrabajo" en el sentido que usa el CFF (fracción de costo
operativo perdida en reproceso de un defecto) — mezcla causas evitables e
inevitables, y describe seguridad del paciente, no eficiencia operativa.
Call center/BPO, el sector con *mejor* evidencia de rotación de todo este
proyecto (Michael Page), no dio absolutamente nada citable para retrabajo.
Retail solo aportó cifras extranjeras sin metodología propia. Construcción
no se exploró — vacío honesto, no descartado por evidencia negativa.

---

## 3. Conclusión general — no se construye ningún benchmark nuevo

**Ausentismo y retrabajo por sector quedan pendientes, mismo estado que la
Fase 2 de países** (`INVESTIGACION_COSTO_LEGAL_DESVINCULACION_LATAM.md`,
`INVESTIGACION_FACTOR_PRESTACIONAL_LATAM.md`): investigación real hecha,
vacío de evidencia confirmado explícitamente, no construible con rigor hoy.
No es lo mismo que "no se buscó" — se buscó con la misma disciplina que ya
dio resultado para rotación (Michael Page, ACHC), y esta vez el resultado
honesto es que esas fuentes no cubren ausentismo ni retrabajo con la misma
profundidad.

**Por qué rotación sí tuvo evidencia suficiente y estos dos no:** no es
casualidad ni un vacío de búsqueda — rotación es, estructuralmente, el
indicador de RRHH que más publican las consultoras de talento (Michael
Page, ACRIP, Adecco viven de asesorar contratación/retención) y las
asociaciones sectoriales con fines de benchmarking de mercado laboral
(ACHC). Ausentismo y retrabajo son indicadores operativos/de salud
ocupacional que se reportan mucho menos por sector — cuando aparecen, es
por motivos regulatorios específicos (ARL, seguridad del paciente) que no
producen la misma cifra limpia y comparable que necesita el CFF.

**Recomendación explícita:**

1. **No agregar ningún benchmark de sector para ausentismo o retrabajo** en
   esta ronda — ni siquiera el dato del call center de Medellín (4.28 días),
   que es real pero demasiado débil (una sola empresa, casi una década) para
   el mismo estándar que ya se aplicó a rotación.
2. **Fasecolda RL Datos** (`sistemas.fasecolda.com/rldatos/`) es el
   candidato más prometedor para una revisión manual futura — portal
   interactivo confirmado con filtro por actividad económica/CIIU, no
   accesible por extracción automatizada. Mismo tipo de hallazgo que el
   informe agregado de ANDI ya señalado en
   `INVESTIGACION_BENCHMARKS_ESG_SOSTENIBILIDAD.md` para rotación: el dato
   probablemente existe, pero requiere trabajo manual, no otra ronda de
   búsqueda automatizada.
3. **`DOCUMENTO_MARCO_SISTEMA_EFICIENCIA.md` (sección 8, pendiente 3)** debe
   actualizarse para reflejar que esta investigación ya se hizo — la
   redacción actual dice "quedan pendientes de investigación adicional"; con
   este documento, pasa a ser "investigado 2026-08-21, vacío confirmado,
   pendiente de datos que no existen públicamente hoy", mismo lenguaje que
   ya se usa para la Fase 2 de países.

No se tocó ningún código de producción ni migración en este documento — es
investigación pura, tal como se pidió.
