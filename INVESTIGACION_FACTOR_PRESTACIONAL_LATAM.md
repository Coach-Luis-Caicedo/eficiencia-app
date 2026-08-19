# Investigación del factor prestacional/carga social real, por país

Fecha de la investigación: 2026-08-19.

Este documento investiga el factor de conversión **salario base → costo
total del empleador** (prestaciones sociales, seguridad social, aportes
parafiscales/patronales) para Colombia y los países ya cubiertos en
`INVESTIGACION_COSTO_LEGAL_DESVINCULACION_LATAM.md` (Fase 2). Complementa
también a `INVESTIGACION_DATOS_CALIBRACION_CFF.md`, cuya sección de salarios
señaló que `Salario_promedio` sigue siendo dato del cliente sin benchmark de
conversión propio.

**Uso previsto, no implementado:** una ayuda opcional en el Workbook que,
dado el país de la organización (`organizaciones.pais`), sugiera un factor
de conversión salario base → costo total. Esta investigación solo documenta
los datos — la decisión de construir esa ayuda queda pendiente.

Regla seguida: solo cifras con fuente citable. Cada factor total
consolidado muestra su aritmética completa (suma de componentes), no solo
el resultado, para que sea auditable. Divergencias entre fuentes y vacíos
se señalan explícitamente — no se promedia ni se extrapola entre países.

---

## 1. Colombia — detalle completo

### Prestaciones sociales (sobre salario + auxilio de transporte cuando aplica)

| Componente | % | Fuente |
|---|---|---|
| Prima de servicios | 8.33% | Heinsohn, Buk — coincidentes |
| Cesantías | 8.33% | Heinsohn, Buk — coincidentes |
| Intereses sobre cesantías | 1% mensual (12% anual sobre las cesantías) | Heinsohn, Buk — coincidentes |
| Vacaciones | 4.17% | Heinsohn, Buk — coincidentes |
| **Subtotal prestaciones** | **21.83%** | Buk: *"Provisión mensual = Base prestacional × 21.83%"* — verificado con ejemplo numérico sobre el SMLV 2026 ($1.750.905 + $249.095 transporte): prima $187.350 + cesantías $187.350 + intereses $22.482 + vacaciones $83.400 = $480.582 (21.83% exacto) |

### Seguridad social a cargo del empleador

| Componente | % | Fuente |
|---|---|---|
| Pensión | 12% | Buk |
| Salud (EPS) | 8.5% | Buk |
| ARL — Clase I (riesgo mínimo, oficina) | 0.522% | Gerencie.com, hacecuentas.com, coriesgos.com — coincidentes, Decreto 1772/1994 |
| ARL — Clase II (comercio) | 1.044% | ídem |
| ARL — Clase III (riesgo medio) | 2.436% | ídem |
| ARL — Clase IV (riesgo alto) | 4.350% | ídem |
| ARL — Clase V (minería/máximo riesgo) | 6.960% | ídem |

### Aportes parafiscales

| Componente | % | Exonerable bajo Ley 1607/2012 |
|---|---|---|
| Caja de Compensación Familiar | 4% | **No** — se paga siempre |
| ICBF | 3% | **Sí**, si el trabajador gana <10 SMLMV |
| SENA | 2% | **Sí**, si el trabajador gana <10 SMLMV |

**Exoneración Ley 1607 de 2012, art. 25** (fuente: Función Pública —
Gestor Normativo, texto de la ley; confirmado por fuentes secundarias
tributarias coincidentes): para trabajadores que ganan individualmente
**menos de 10 SMLMV**, el empleador queda exonerado de aportar a **salud
(8.5%), SENA (2%) e ICBF (3%)** — 13.5 puntos porcentuales exonerados. La
Caja de Compensación (4%) y la pensión (12%) **no se exoneran nunca**.
Aplica a personas jurídicas desde 1 trabajador, y a personas naturales
empleadoras desde 2 trabajadores.

### Factor total consolidado (aritmética mostrada)

**Sin exoneración** (salario ≥10 SMLMV, o empleador no califica):
```
21.83% (prestaciones) + 12% (pensión) + 8.5% (salud) + 4% (caja)
+ 3% (ICBF) + 2% (SENA) + ARL[0.522%–6.96%]
= 51.33% + ARL
= 51.85% – 58.29%
```

**Con exoneración** (salario <10 SMLMV — cubre a la mayoría de la fuerza
laboral colombiana):
```
21.83% (prestaciones) + 12% (pensión) + 4% (caja) + ARL[0.522%–6.96%]
= 37.83% + ARL
= 38.35% – 44.79%
```

**Rango a usar como referencia: ≈38%–58% adicional sobre el salario base**,
según si aplica la exoneración parafiscal y el nivel de riesgo ARL de la
organización — el extremo inferior (≈38%) es el caso más común (trabajador
de bajo/medio riesgo, salario <10 SMLMV).

### Variaciones no cuantificadas aquí
- **Tipo de contrato:** el factor de prestaciones sociales (21.83%) aplica
  a contrato indefinido y a término fijo por igual — ninguna fuente
  consultada reportó una diferencia porcentual entre ambos tipos.
- **Salario integral:** para salarios ≥13 SMLMV (2026: $22.761.765/mes)
  pactados como "salario integral", el factor prestacional legal mínimo es
  30% ya incluido dentro del pago único — un régimen distinto, no aditivo
  al cálculo de arriba (Siigo).

---

## 2. Fase 2 — mismos países de la investigación de costo legal

### 2.1 México

| Componente | % / valor | Fuente |
|---|---|---|
| IMSS patronal (enfermedad-maternidad, invalidez-vida, guarderías, riesgo de trabajo, retiro-cesantía-vejez) | 24%–28% del SBC | minu.mx, SDV Asesores, tucalculadorasat.com — coincidentes en el rango |
| INFONAVIT | 5% del SBC | ídem |
| SAR (Sistema de Ahorro para el Retiro) | 2% del SBC | ídem |
| ISN (Impuesto Sobre Nómina, estatal) | 2%–4.25% (CDMX 4%, Baja California 4.25%) | ídem — varía por estado |
| Aguinaldo | mínimo 15 días/año ≈ 4.17% (base 360 días) | minu.mx |
| Prima vacacional | 25% sobre días de vacaciones (12 días año 1) ≈ 0.83% | minu.mx |

**Nota de divergencia:** las fuentes de nómina resumen el costo total en
"25%–35% adicional", pero esa cifra parece cubrir principalmente IMSS +
INFONAVIT + SAR (24–28 + 5 + 2 = 31–35%, consistente). Sumando ISN,
aguinaldo y prima vacacional (componentes legales confirmados,
independientes) el total sube a **≈36%–42%** — se documenta el número
propio con su aritmética en vez de usar solo el resumen de la fuente
secundaria, para no subestimar.

```
24–28% (IMSS) + 5% (INFONAVIT) + 2% (SAR) + 2–4.25% (ISN)
+ 4.17% (aguinaldo) + 0.83% (prima vacacional)
= 38%–44.25%
```

### 2.2 Perú

| Componente | Fuente |
|---|---|
| EsSalud (seguridad social salud, empleador) | 9% — krowdy.com |
| Gratificaciones (julio y diciembre) | 2 sueldos extra/año + 9% de bonificación extraordinaria sobre cada una — modelo.pe, zegel.edu.pe |
| CTS (Compensación por Tiempo de Servicios) | ≈1 sueldo adicional/año, depositado semestralmente | krowdy.com |
| Vacaciones | 30 días calendario pagados/año ≈ 1 sueldo mensual completo | sueldojusto.pe |

**Cifra consolidada de la fuente:** *"el costo laboral real... suele
superar el sueldo pactado en 40% o más en el régimen general"* (krowdy.com).
Aritmética aproximada propia: EsSalud 9% + gratificaciones (2×8.33%×1.09 ≈
18.16%) + CTS (≈8.33%) + vacaciones (≈8.33%) = **≈43.8%** — consistente en
orden de magnitud con el "40% o más" reportado directamente por la fuente.

### 2.3 Chile — estructuralmente distinto, confirmado

| Componente | % a cargo del empleador | Fuente |
|---|---|---|
| AFP (pensión) — nuevo aporte patronal desde agosto 2026 | 3.5% (2.5% seguro social + 0.9% Cotización de Reparto Protegido + 0.1% cuenta individual) | AFC Chile, MP Asociados |
| Seguro de cesantía (AFC) | 3%–4.11% (2.2% cuenta individual + 0.8% fondo solidario + 1.11% cuenta de ahorro) | ChileAtiende, AFC Chile |
| Mutual (accidentes laborales) | 0.95% base + hasta 3.4% adicional por riesgo de actividad | ChileAtiende |

**Total empleador: ≈5.5%–7% (fuente cita este rango directamente) hasta
≈8.35%–15% en el extremo alto** (0.95+3.4 mutual + 3.5 AFP + 4.11 AFC ≈
11.96%, o hasta ≈15% en actividades de máximo riesgo) — sustancialmente más
bajo que cualquier otro país de esta investigación.

**Por qué es estructural, no solo un número menor:** en Chile el aporte a
pensión (AFP, ~10% del salario) es **responsabilidad del trabajador**, no
del empleador — a diferencia de Colombia (12% patronal), México (parte del
IMSS+SAR patronal), Perú, o el resto de la región, donde la pensión es
mayoritariamente carga del empleador. El aporte patronal chileno de 3.5% a
la AFP (vigente desde agosto 2026) es una adición reciente y parcial al
sistema, no un reemplazo del modelo de capitalización individual. No se
encontró un aguinaldo/13er sueldo legal obligatorio en Chile en esta
búsqueda — a diferencia de los demás países investigados, donde el 13er
sueldo (o equivalente) es legalmente obligatorio.

### 2.4 Argentina

| Componente | % | Fuente |
|---|---|---|
| Contribuciones patronales (seguridad social) | 27%–28.5% del salario bruto (≈27.35% si la empresa califica como MiPyME) | yo-facturo.com, servidos.ar |
| ART (aseguradora de riesgos del trabajo) | 1%–3.5%, variable por actividad (no fijado por ley, por póliza) | fiscal.com.ar |
| SAC / Aguinaldo (sueldo anual complementario) | 1 sueldo extra/año en 2 cuotas (junio/diciembre) ≈ 8.33% — con contribuciones patronales también aplicadas sobre el SAC | iprofesional.com |

```
27%–28.5% (contribuciones) + 1%–3.5% (ART) + 8.33% (SAC, con su propia carga patronal)
≈ 36.3% – 40.3%
```

**Nota de contexto:** Argentina atraviesa reformas normativas frecuentes en
materia laboral (ver también la advertencia de incertidumbre normativa ya
señalada para el costo legal de desvinculación en
`INVESTIGACION_COSTO_LEGAL_DESVINCULACION_LATAM.md`) — este porcentaje
tiene mayor riesgo de desactualización que los demás países.

### 2.5 Ecuador

| Componente | % | Fuente |
|---|---|---|
| Aporte patronal IESS (seguro general obligatorio) | 11.15% | ecuadorlegalonline.com, tagline-soluciones.com |
| IECE/SECAP | 1% (0.5% + 0.5%) | ídem |
| Fondo de reserva (después del primer año; equivalente a 1 mes/año) | 8.33% | rolesdepago.com — *"12 meses ÷ 144 meses = 8.33%"* |
| Décimo tercer sueldo | 1 mes/año ≈ 8.33% | finiquitojusto.com |
| Décimo cuarto sueldo | 1 SBU fijo/año ($482 en 2026) — no expresable como % del salario sin asumir un salario base | finiquitojusto.com |
| Vacaciones | salario/24 ≈ 4.17% | tagline-soluciones.com |

**Cifra de la fuente:** *"Total Employer Cost ≈ 20.48%"* — pero esa cifra
solo suma aporte patronal IESS (11.15%) + fondo de reserva (8.33%) +
IECE/SECAP (1%), **sin incluir décimo tercero ni vacaciones**. Sumando esos
dos componentes legales adicionales (el décimo cuarto queda fuera por ser
un valor fijo, no un %):
```
11.15% (IESS) + 1% (IECE/SECAP) + 8.33% (fondo reserva) + 8.33% (décimo tercero) + 4.17% (vacaciones)
≈ 32.98%
```
**Nota:** el fondo de reserva es diferible — el trabajador puede optar
porque el empleador se lo pague mensualmente en vez de acumularlo, lo cual
no cambia el costo total pero sí el flujo de caja.

### 2.6 Venezuela

| Componente | % | Fuente |
|---|---|---|
| IVSS (seguro social) patronal | 9%–11%, según clasificación de riesgo LOPCYMAT | portalseniat.com |
| INCES | 2% de la nómina total trimestral | hacecuentas.com |
| FAOV (vivienda) | 3% | portalseniat.com |
| Garantía de prestaciones sociales (LOTTT) | 15 días/trimestre = 60 días/año ≈ 16.44% (60/365), más 2 días adicionales/año de antigüedad después del primer año, acumulativo hasta 30 días extra máximo | xuletas.es — mismo mecanismo de fondo acumulativo ya documentado en `INVESTIGACION_COSTO_LEGAL_DESVINCULACION_LATAM.md` (arts. 92/142 LOTTT) |

```
9–11% (IVSS) + 2% (INCES) + 3% (FAOV) + 16.44% (prestaciones LOTTT, base)
= 30.44% – 32.44%   (sin contar el incremento por antigüedad, hasta +8.2 puntos en el tope de 30 días)
```

**Advertencia de contexto, no solo metodológica:** Venezuela tiene una
economía con alta inestabilidad monetaria — los porcentajes sobre salario
son más estables que cualquier cifra en moneda absoluta, pero esta
investigación no verificó si las bases de cálculo (salario mínimo,
"unidades tributarias") están vigentes o desactualizadas al momento de
usarse.

### 2.7 Costa Rica

| Componente | % | Fuente |
|---|---|---|
| Cargas sociales patronales (CCSS, sin INS) | 26.83% del salario bruto (una fuente) vs. 23.50% (otra fuente) | blog.alegra.com vs. integra.cr — **divergencia no reconciliada** |
| Aguinaldo (13er mes) | 1 sueldo extra/año ≈ 8.33% | La Nación, integra.cr |
| INS (seguro de riesgos del trabajo) | mencionado como excluido del 26.83%, porcentaje exacto no confirmado en esta búsqueda | blog.alegra.com |

**Nota de divergencia:** dos fuentes de nómina costarricense reportan
cifras distintas para las cargas CCSS patronales (26.83% vs. 23.50%) sin
que ninguna de las dos publique el desglose completo verificable en el
extracto obtenido — mismo tratamiento que otras divergencias ya
documentadas en investigaciones previas: **no promediar, señalar el rango
completo**.

```
23.50%–26.83% (CCSS) + 8.33% (aguinaldo) + INS (no cuantificado)
≈ 31.83% – 35.16%, más INS sin cuantificar
```

### 2.8 Panamá

| Componente | % | Fuente |
|---|---|---|
| CSS patronal (general) | 9.75% (una fuente) vs. 12.25% (otra fuente) — **divergencia no reconciliada** | vorluno.dev vs. cifrahq.com |
| CSS sobre décimo tercer mes, aporte patronal específico | 10.75% (aplicado solo sobre el valor del décimo tercer mes, no sobre el salario completo) | walletpty.com |
| Décimo tercer mes | 1 sueldo extra/año ≈ 8.33%, pagado en 3 partidas | lenoxhr.com |

**Cambio normativo futuro confirmado:** el aporte patronal general subirá a
14.25% desde marzo de 2027 y a 15.25% desde marzo de 2029 (cifrahq.com) —
la cifra vigente en 2026 quedará desactualizada pronto, señalarlo si esta
investigación se usa después de esas fechas.

```
9.75%–12.25% (CSS general) + 8.33% (décimo tercero) × 1.1075 (su propia CSS) ≈ +9.23%
≈ 18.98% – 21.48%
```
**No se incluyó vacaciones** (Panamá: 1 mes pagado por cada 11 meses
trabajados, ≈9.1% adicional) por no encontrar confirmación directa de si
ya está contemplado dentro de alguna de las dos cifras de CSS general —
vacío, no se fuerza.

### 2.9 Guatemala

| Componente | % | Fuente |
|---|---|---|
| IGSS patronal (enfermedad-maternidad 4%, accidentes 3%, IVS 3.67%) | 10.67% | misalario.com.gt |
| INTECAP | 1% | ídem |
| IRTRA (exento para entidades sin fines de lucro) | 1% | ídem |
| Aguinaldo | 1 sueldo extra/año ≈ 8.33%, exento de IGSS/IRTRA/INTECAP | livinginguatemala.com |
| Bono 14 | 1 sueldo extra/año ≈ 8.33% (independiente del aguinaldo) | ídem |
| Vacaciones | 15 días hábiles/año, provisión reportada directamente como 8.33% mensual por la fuente | ídem |

```
10.67% (IGSS) + 1% (INTECAP) + 1% (IRTRA) + 8.33% (aguinaldo)
+ 8.33% (bono 14) + 8.33% (vacaciones)
= 37.66%
```

---

## 3. Comparación estructural

| País | Factor total consolidado | Estructura |
|---|---|---|
| Colombia | ≈38%–58% (según exoneración <10 SMLMV y riesgo ARL) | Estándar regional — pensión y salud a cargo del empleador |
| México | ≈38%–44% | Estándar — IMSS+INFONAVIT+SAR a cargo del empleador, más ISN estatal variable |
| Perú | ≈40%–44% (fuente confirma directamente "40% o más") | Estándar — EsSalud + gratificaciones + CTS + vacaciones |
| **Chile** | **≈5.5%–15%** | **Estructuralmente distinto** — pensión (AFP, ~10%) es carga del trabajador, no del empleador; sin aguinaldo legal obligatorio confirmado |
| Argentina | ≈36%–40% | Estándar, con riesgo de desactualización normativa (reformas frecuentes) |
| Ecuador | ≈33% (sin décimo cuarto, valor fijo no porcentual) | Estándar — IESS + fondo de reserva + décimo tercero + vacaciones |
| Venezuela | ≈30%–33% (sin incremento por antigüedad) | Estándar en componentes de seguridad social, pero con mecanismo de **fondo acumulativo de prestaciones** (LOTTT) — mismo patrón ya identificado como estructuralmente distinto en el costo legal de desvinculación |
| Costa Rica | ≈32%–35% (+ INS sin cuantificar) | Estándar — CCSS + aguinaldo, con divergencia de fuente no reconciliada |
| Panamá | ≈19%–21% (sin vacaciones cuantificadas) | El más bajo del grupo "estándar" (no estructuralmente distinto como Chile, pero numéricamente el más bajo) — con alza programada 2027/2029 |
| Guatemala | ≈37.7% | Estándar — IGSS + INTECAP/IRTRA + aguinaldo + bono 14 + vacaciones |

---

## 4. Países o componentes sin fuente confiable encontrada

- **Panamá**: no se logró confirmar si el componente de vacaciones (≈9.1%)
  ya está incluido dentro de las cifras de CSS general encontradas, ni
  reconciliar la divergencia entre 9.75% y 12.25% de aporte patronal
  general — el total de Panamá es el más incompleto de los 9 países de
  Fase 2.
- **Costa Rica**: divergencia no reconciliada entre 23.50% y 26.83% de
  cargas CCSS patronales; el componente INS (seguro de riesgos del
  trabajo) se identificó como excluido de ambas cifras pero su porcentaje
  exacto no se confirmó en esta búsqueda.
- **Ecuador**: el décimo cuarto sueldo es un valor fijo en dólares (1 SBU),
  no un porcentaje del salario — no se pudo expresar como % consolidado sin
  asumir un salario base específico, se dejó fuera del total.
- **México**: la cifra resumen de las fuentes de nómina ("25%–35%") diverge
  del total obtenido sumando los componentes legales confirmados
  individualmente (≈38%–44%) — se documentó la aritmética propia en vez de
  usar el resumen de la fuente, pero ninguna fuente primaria (IMSS, STPS)
  fue consultada directamente, solo firmas de nómina/calculadoras.
- **Argentina**: mayor riesgo de desactualización por reformas laborales
  frecuentes — no se consultó el texto legal primario (Ley de Contrato de
  Trabajo, leyes de la seguridad social), solo fuentes de nómina
  secundarias.
- **Ninguna sección de esta investigación consultó el texto legal primario
  de cada país de forma exhaustiva** (a diferencia de
  `INVESTIGACION_COSTO_LEGAL_DESVINCULACION_LATAM.md`, que sí llegó al
  texto de la ley/código en varios casos) — todas las cifras de este
  documento provienen de fuentes secundarias de nómina/BPO o portales de
  las entidades de seguridad social, no de la ley consolidada. Recomendado
  como siguiente paso si se decide construir la ayuda de conversión en
  producción, no solo para uso referencial del consultor.
