# Inventario — documentación de propiedad intelectual (F/M/T/O/S)

**Estado: auditoría. Cero redacción de contenido técnico/filosófico.**

---

## 0. Advertencia de alcance, antes de la tabla

Esta taxonomía (`F-01`...`S-07`) se acordó con Luis fuera de esta sesión —
solo tengo, dentro de esta conversación, los nombres explícitos que diste en
el encargo: `F-01` (Documento Madre), `T-01` (Instrumento Integrado
EFICIENCIA), `O-05` (Validación y pilotaje), `S-03`/`S-04`/`S-05` (Motor de
cálculo / evidencia / diagnóstico-prospectivo). **Para el resto de los 25
códigos no tengo el nombre exacto que acordaste** — donde el mapeo es
inferible con evidencia razonable lo propongo marcado como propuesta; donde
no, lo dejo explícito como "nombre pendiente de tu confirmación" en vez de
inventarlo. Mismo criterio de todo esta sesión: no fabricar lo que no se
verificó.

---

## 1. CORRECCIÓN a la ronda anterior — jerarquía real confirmada con `v3`

**La ronda anterior tenía un error de jerarquía, ya corregido por Luis**: yo
había propuesto tratar `DOCUMENTO_MARCO_SISTEMA_EFICIENCIA.md` como la base
de trabajo real de `F-01`. Eso estaba mal — existe un tercer documento que
no había encontrado, `Modelo_EFICIENCIA_Documento_Madre_v3.docx`, que es la
**versión conceptual final** y fuente teórica raíz. Releído completo (384
párrafos extraídos), no solo por grep de términos.

| Documento | Rol real, confirmado |
|---|---|
| `Modelo_EFICIENCIA_Documento_Madre.docx` (sin versión) | **Legacy, superado por `v3`** — confirmado, sin cambios respecto a la ronda anterior. |
| `Modelo_EFICIENCIA_Documento_Madre_v3.docx` | **`F-01` real — fuente teórica raíz.** "Versión actualizada — 2 de septiembre de 2026." Manda en lo conceptual cuando haya solapamiento. |
| `DOCUMENTO_MARCO_SISTEMA_EFICIENCIA.md` | **Materialización técnica/operativa derivada de `v3`** — NO fuente conceptual, NO compite con `v3`. Rol correcto: expandir la Parte III de `v3` a detalle técnico (fórmulas, umbrales, algoritmos de calibración) — ver §3 más abajo. |

### 1.1 El mismo vacío exacto, confirmado ahora contra la fuente real

Grep directo sobre el texto extraído de `v3` (384 párrafos, no una muestra):

```
AIE: 0    IFD: 0    IFT: 2    PIIO: 4    SDMO: 4    IAO: 17    CFF: 9
```

**`v3` tampoco menciona `AIE` ni `IFD`** — el mismo vacío que ya tenían el
`.docx` sin versión y `DOCUMENTO_MARCO`. No es una coincidencia entre 2
documentos desactualizados; es un vacío real en la fuente teórica raíz
misma, confirmado ahora en el documento correcto.

**Matiz importante que no estaba en la ronda anterior**: `v3` capítulo 13
(Instrumentos de medición) enumera 7 instrumentos con nombre propio —
Cuestionario/ICE/IEH (§13.1), IAO (§13.2), SDMO/IDA (§13.3), CFF (§13.4),
**IFT — Proyección Financiera y Tiempo de Recuperación** (§13.5), Sensor FPV
(§13.6), **PIIO** (§13.7, "mecanismo de integración, calibración y
visualización de indicadores del sistema... definición operacional completa
permanece pendiente de validación"). Es decir:

- **`PIIO` sí tiene precursor conceptual real en `v3`** — a diferencia de la
  lectura de la ronda anterior (que solo encontró el "PIIO legacy del
  Workbook" en `DOCUMENTO_MARCO`), `v3` mismo anticipa el concepto, aunque
  sin definición operacional — coherente con que `motor-piio` es su
  materialización real.
- **`IFT` es, con alta probabilidad, el nombre-precursor de lo que hoy es
  `IFD`** (`motor-ifd`) — misma función descrita (`IAO₀ → evolución
  proyectada → CFF(t) → ahorro acumulado → tiempo de recuperación`), sin
  que `v3` use el nombre `IFD`. **No confirmado como el mismo objeto** —
  queda como pregunta para ti: ¿`IFD` es el renombre de `IFT`, o son
  instrumentos distintos que coexisten?
- **`AIE` no tiene NINGÚN precursor, ni con otro nombre** — los 7
  instrumentos de §13 son todos del tipo "sensor/índice/traductor
  económico"; ninguno describe el mecanismo de contraste/integración entre
  familias de evidencia que hace `AIE` (`rules_2f_3f.py`, `R01`-`R11`).
  Puede no ser un descuido a corregir sino una diferencia real de
  naturaleza —`AIE` es un mecanismo de integración entre instrumentos, no
  un instrumento más—, pero eso también es una decisión que te toca
  confirmar, no asumirla yo.

### 1.2 Colisión de nombre "PIIO" en `DOCUMENTO_MARCO` — sigue vigente

El hallazgo de la ronda anterior sobre `DOCUMENTO_MARCO_SISTEMA_EFICIENCIA.md`
§12 (14 menciones de "PIIO" que son sobre el **panel legacy del Workbook**,
no sobre `motor-piio`) **sigue siendo válido** — `v3` no lo resuelve, porque
`v3` no baja a ese nivel de detalle (correctamente, es la fuente
conceptual, no la materialización técnica). Ese re-etiquetado sigue
pendiente en `DOCUMENTO_MARCO`, no en `v3`.

---

## 2. Tabla completa — F-01 a S-07

Columnas: **Existe** (Sí/No/Parcial) · **Archivo real** · **Estado
verificado** (evidencia, no impresión).

### Serie F — Fundamentos

| Código | Nombre | Existe | Archivo | Estado verificado |
|---|---|---|---|---|
| `F-01` | Documento Madre | **Sí, confirmado** | `Modelo_EFICIENCIA_Documento_Madre_v3.docx` — fuente teórica raíz, manda en lo conceptual | 0 menciones de `AIE`/`IFD` (§1.1), verificado sobre el texto completo (384 párrafos), no una muestra. `PIIO` sí tiene precursor conceptual (§13.7); `IFT` (§13.5) probablemente es el precursor de `IFD` — a confirmar. `Modelo_EFICIENCIA_Documento_Madre.docx` (sin versión) queda confirmado legacy, superado por `v3`. |
| `F-02` | *(nombre no confirmado)* | Ver §2bis | — | `v3` NO se divide limpio en 4 documentos — ver análisis completo en §2bis. |
| `F-03` | *(nombre no confirmado)* | Ver §2bis | — | ídem |
| `F-04` | *(nombre no confirmado)* | Ver §2bis | — | ídem |

### §2bis — ¿`v3` se divide en `F-02`-`F-04`, o es una sola pieza?

**Leído completo, capítulo por capítulo — no por muestreo.** La estructura
real de `v3` (Tabla de Contenido, verificada) es:

```
Introducción
Parte I   — Fundamento Antropológico, Filosófico y Ontológico   (caps. 1-5)
Parte II  — Arquitectura Neurobiológica                          (caps. 6-10)
Parte III — Sistema de Medición                                  (caps. 11-15)
Parte IV  — Fundamento y Síntesis                                (caps. 16-22)
Registro de cambios y pendientes de validación
```

**Tu hipótesis de la ronda anterior no coincide con esta estructura real**:
propusiste Parte I → `F-02`, cap. 16 (Genealogía) → `F-03`, y "contenido
disperso de Persona/necesidad/intercambio" → `F-04`. Verificado: el
contenido de "Persona/necesidad/intercambio" **no está disperso ni fuera de
Parte I** — es literalmente los capítulos 2 y 3 de la Parte I misma (cap. 2
"Interdependencia y origen de las relaciones" incluye §2.2 "La necesidad
como origen de la relación", §2.4 "De la necesidad a la oferta", §2.5 "El
Intercambio"; cap. 3 "Del intercambio humano a la organización"). No hay un
`F-04` aparte que extraer — ya está dentro de lo que sería `F-02`.

**Por qué no se puede partir limpio en 4 documentos**:

1. **Parte I es un solo argumento continuo de 5 capítulos** (1→2→3→4→5:
   organización-como-sistema-humano → interdependencia/necesidad →
   intercambio/organización → deterioro → recuperación), cada capítulo
   apoyándose explícitamente en el anterior. Partirlo pierde la cadena
   argumental.
2. **El capítulo 16 (Genealogía Conceptual) NO es una pieza aislada** — vive
   dentro de la Parte IV ("Fundamento y Síntesis"), que es el CIERRE de todo
   el documento: cap. 17-18 retoman el Amor/Dinámica Natural de la Parte I,
   cap. 19 son los Principios Estructurales (restan de Partes I-II), cap. 20
   es la Tesis Central (síntesis literal de TODO el documento), cap. 21
   Fundamento Científico, cap. 22 Cierre. Sacar el cap. 16 solo dejaría los
   capítulos 17-22 sin su propia genealogía de origen, y el cap. 16 sin el
   argumento que cierra.
3. **La Parte III ("Sistema de Medición") es, por su propia naturaleza, más
   `M` que `F`** — el documento mismo lo dice: *"La teoría explica por qué
   una organización puede operar por debajo de su potencial. El sistema de
   medición traduce esa teoría en un diagnóstico observable"* (cap. 11,
   primera línea de la Parte III). Es explícitamente la bisagra hacia los
   instrumentos, no fundamento filosófico — encaja mejor con tu propia
   descripción de la serie `M` ("arquitectura causal/instrumental/evidencia/
   económica") que con la serie `F`.

**Conclusión, con la salvedad explícita de la opción que dejaste abierta**:
`v3` completo es la única pieza real hoy — los códigos `F-02`-`F-04` **no
aplican como documentos aparte todavía**, tal como planteaste como
alternativa. Si en el futuro hace falta partir `v3` en piezas registrables
por separado (una razón legal/DNDA, no de contenido, podría justificarlo),
la partición defendible por estructura real sería por las 4 Partes que el
documento ya tiene — no por los cortes de la hipótesis original — y aun así
la Parte III probablemente pertenece a `M`, no a `F`, dejando solo 3 partes
(`I`, `II`, `IV`) como candidatas reales a la serie `F`.

---

### Serie M — Modelo

| Código | Nombre | Existe | Archivo | Estado verificado |
|---|---|---|---|---|
| `M-01`…`M-05` | *(nombres no confirmados — "arquitectura causal/instrumental/evidencia/económica" mencionado en tu mensaje, sin mapeo 1:1 a 5 códigos)* | Parcial | **Nuevo candidato de base, tras leer `v3` completo**: Parte III de `v3` ("Sistema de Medición", caps. 11-15 — arquitectura de los 5 pares, la Brecha, instrumentos, traducción económica, diferenciación de mercado) es la semilla conceptual real de toda la serie `M` — ver §3bis (solapamiento con `DOCUMENTO_MARCO` §6-12, que la expande a detalle técnico). `MAPEO_INTEGRACION_AIE.md` cubre el grafo real de dependencias entre motores (candidato fuerte a `M`-algo). | No propongo la asignación 1:1 de los 5 códigos sin que confirmes los nombres — pero ahora hay una semilla real y única (Parte III de `v3`) de la que la serie `M` se deriva, en vez de contenido disperso sin origen claro. |

### Serie T — Documentos Técnicos por instrumento

| Código | Nombre | Existe | Archivo | Estado verificado |
|---|---|---|---|---|
| `T-01` | Instrumento Integrado EFICIENCIA | **No existe tal cual se propone** | — | Ver §3.1 — resuelto abajo con evidencia. |
| `T-02` | *(propuesta: SDMO/IDA/IAO)* | Sí | `docs/DOCUMENTO_TECNICO_SDMO_IAO_v1.md` | Título real: "Instrumentos SDMO — IDA — IAO", v1. Predata la reapertura de calibración de `motor-sdmo`/`motor-iao` de esta sesión (genéricos `umbralFavorable`/`umbralDeteriorado`=33/67, `minReportableN`=5) — necesita actualización real, no cosmética. |
| `T-03` | *(propuesta: CFF)* | Sí | `docs/EFICIENCIA_Documento_Tecnico_CFF_v1_1_FINAL_v2.docx` | Confirmado el más reciente de 2 copias (`docs/...FINAL_v2`, 4-sep 06:42, 280 párrafos vs. la copia de raíz `EFICIENCIA_Documento_Tecnico_CFF_v1_1.docx`, 3-sep 18:33, 228 párrafos — **esta última es una copia superada, candidata a archivar/retirar del repo para no confundir**). Menciona AIE(17)/PIIO(10)/SDMO(3)/IAO(2), cero IFD. |
| `T-04` | *(propuesta: IFD)* | Sí | `docs/Documento_Tecnico_IFD_v1_2_2_FINAL.docx` | Menciona CFF(20) — su instrumento hermano — mínimamente AIE/PIIO/SDMO. No verificado en profundidad línea por línea esta ronda (fuera del alcance de "inventario"). |
| `T-05` | *(propuesta: PIIO)* | Sí | `docs/Documento_Tecnico_PIIO_v1_1_FINAL.docx` | Menciona AIE(23)/IFD(30)/CFF(30) — el más cruzado con otros instrumentos. Predata con certeza la reapertura de `traj`/`pers`/`det_run` de `EFO_STATE` de esta sesión (`_domainStateGobernante`/`propagarTemporalidadEFO`) — **necesita actualización real confirmada**, no solo sospechada. |
| `T-06` | *(propuesta: FPV)* | Sí | `docs/Documento_Tecnico_FPV_v1.2_PrePiloto_Stress_Test_Externo.docx` | Solo menciona AIE(10) — el más aislado de los 7. No verificado en profundidad esta ronda. |
| `T-07` | *(propuesta: AIE)* | Sí | `DOCUMENTO_TECNICO_AIE_v1.md` | **El más actualizado de los 7, verificado**: ya tiene una corrección fechada 2026-09-13 (numeración `R10`/`R11`) aplicada in-place. Sigue diciendo "cuando exista, por PIIO/KPI" (línea ~14) — redactado ANTES de que `motor-piio` y su arnés con AIE existieran; esa frase ya es falsa hoy y es la actualización más urgente y más barata de las 7 (una frase, no una reescritura). |

### Serie O — Operación y metodología

| Código | Nombre | Existe | Archivo | Estado verificado |
|---|---|---|---|---|
| `O-01`…`O-04` | *(nombres no confirmados)* | — | — | Sin evidencia para proponer mapeo. |
| `O-05` | Validación y pilotaje | **Sí, confirmado** | `CHECKLIST_ACTIVACION_PILOTO_AIE.md` | Confirmado exactamente lo que dijiste: el `N` mínimo (≈450) sale de correr el propio motor de simulación (`aie_validation_kit/power_analysis_N_min.py`), no de una cita externa — documentado así explícitamente en su propia cabecera ("no es una investigación de literatura... el número central sale de correr el propio motor"). **Reusar tal cual, no reconstruir.** |

### Serie S — Software y tecnología

| Código | Nombre | Existe | Archivo | Estado verificado |
|---|---|---|---|---|
| `S-01` | *(nombre no confirmado)* | — | — | Candidato de contenido si aplica a "arquitectura general de los 7 motores": ningún documento único lo cubre hoy; el `README.md` de cada `motor-*/` lo cubre por separado. |
| `S-02` | *(nombre no confirmado — candidato mencionado por ti como posible hogar de los arneses)* | — | — | Ver §3.3 — no tengo el nombre real de este código, así que no puedo confirmar si los arneses encajan ahí sin que me digas qué es `S-02` hoy. |
| `S-03` | Motor de cálculo | Ver §3.2 | — | Resuelto abajo con evidencia de arquitectura real. |
| `S-04` | Motor de evidencia | Ver §3.2 | — | ídem |
| `S-05` | Motor de diagnóstico-prospectivo | Ver §3.2 | — | ídem |
| `S-06`/`S-07` | *(nombres no confirmados)* | — | — | Sin evidencia para proponer mapeo. |
| `S-08` *(propuesto, no en tu lista original)* | Arneses de integración | Ver §3.3 | 4 arneses reales + `MAPEO_INTEGRACION_AIE.md` | Resuelto abajo. |

---

## 3. Las tres tensiones — resueltas con propuesta concreta

### 3.1 `T-01` — ¿agrupa `motor-ice-ieh` + `motor-iao`?

**Verificado, no asumido: hoy NO existe ningún documento que agrupe
`motor-ice-ieh` + `motor-iao`.** Los títulos reales de los documentos
existentes son:

- `docs/DOCUMENTO_TECNICO_ICE_IEH_v2.md` → *"Instrumento **ICE–IEH**"* — standalone, sin IAO.
- `docs/DOCUMENTO_TECNICO_SDMO_IAO_v1.md` → *"Instrumentos **SDMO — IDA — IAO**"* — agrupa IAO con SDMO, no con ICE-IEH.

**Pero hay una razón real de código que sí justifica tu propuesta de
`T-01` = ICE-IEH+IAO, distinta de cómo están agrupados los documentos
hoy**: `motor-iao` consume sus 10 variables directamente de
`motor-ice-ieh.calcular().variables` — es una dependencia de datos real y
directa (confirmado en `MAPEO_INTEGRACION_AIE.md` §1: *"`motor-iao` necesita
10 variables (0-100)... sale de `motor-ice-ieh.calcular().variables`"*). El
documento existente agrupa por un eje distinto (SDMO+IAO, ambos sobre "Modo
Operativo"), pero el eje de dependencia real de código apoya tu propuesta.

**Propuesta concreta**: `T-01` = ICE-IEH + IAO, como tú planteaste — pero
esto significa que **el contenido de IAO que hoy vive en
`DOCUMENTO_TECNICO_SDMO_IAO_v1.md` tiene que dividirse**: la mitad IAO se
muda a `T-01` (junto a ICE-IEH), la mitad SDMO se queda en su propio código
(`T-02` en mi propuesta de arriba) — no son "dos documentos que ya existen
y ya están donde deben", es una **reorganización de contenido real entre
dos documentos existentes**, y hay que decirlo así de explícito para no
subestimar el trabajo.

### 3.1bis — Hallazgo nuevo: un tercer candidato de ICE-IEH, y un cierre de diseño confirmado

**Duplicado no catalogado antes, mismo patrón que ya se vio en `CFF`**:
existe `EFICIENCIA_Documento_Tecnico_ICE-IEH.docx` en la raíz del repo (1
sep, 30KB, con Anexo A/B formales), **distinto y más antiguo** que
`docs/DOCUMENTO_TECNICO_ICE_IEH_v2.md` (5 sep, 58KB, explícitamente "v2",
"incorpora ya resueltas las inconsistencias" de la versión anterior). Mismo
criterio que con `EFICIENCIA_Documento_Tecnico_CFF_v1_1.docx` (raíz) vs.
`docs/..._FINAL_v2.docx`: **el `.docx` de raíz queda legacy, superado por
el `.md` de `docs/`** — no cambia la propuesta de `T-02`/ICE-IEH de arriba,
solo agrega un tercer archivo a la lista de "copias superadas candidatas a
archivar".

**Cierre real de diseño, verificado contra ambos**: el `.docx` de raíz
trae un Anexo A.2 ("Arquitectura bipolar descartada") que documenta
explícitamente por qué la fórmula `Brecha_final = α·Brecha_calculada +
(1−α)·Bipolar` (la misma que usa `Amenaza_incongruencia_par` en
`DOCUMENTO_MARCO` §4 y en la SQL legacy `013_umbral_piso_anclado.sql`) **no
forma parte del instrumento vigente** — el cuestionario final de 31
preguntas solo tiene un ítem bipolar real (P7/Par 1), no cinco. Confirmado
independientemente en el `.md` v2 (líneas 963-965, advierte explícito
contra aplicar la fórmula bipolar fuera de `IND-EF`) y en el código real de
`motor-ice-ieh.js` (solo P7 es `bipolar_ind`; P14 es `sintesis_ind`, tipo
distinto; Pares 3-5 no tienen ítem independiente). **Tres fuentes
independientes coinciden.** Ver `DISENO_AMENAZA_INCONGRUENCIA_IAO.md` —
diseño cerrado, no se construye, `motor-iao.js` queda con sus 153 asserts
sin tocar.

**Nota final sobre el hallazgo colateral del legacy (confirmado por Luis,
2026-09-16)**: `resumen_organizacion_completo` (la función SQL que
contiene la fórmula descartada, `013_umbral_piso_anclado.sql`) está
desplegada y activamente llamada por `workbook.html` (5 puntos de
llamada), pero **sin uso activo real hoy** — ninguna consultoría está
corriendo datos por ahí en este momento. Esto cierra la pregunta lateral
por completo: la paradoja de monotonicidad documentada en
`DISENO_AMENAZA_INCONGRUENCIA_IAO.md` §0.2 **no está afectando ningún
diagnóstico real actualmente**, precisamente porque el sistema legacy que
la contiene no tiene uso activo. No hace falta la consulta SQL de
verificación de datos que se había propuesto, ni ninguna acción sobre el
sistema anterior. Si en algún momento se reactiva el uso de
`workbook.html` legacy antes de que el workbook nuevo esté listo, esto
merecería revisarse entonces — pero no antes.

### 3.2 `S-03`/`S-04`/`S-05` — ¿patrón genérico o motor específico?

**Investigado contra la arquitectura real, no elegido al azar.**

Los 8 motores (`ice-ieh`, `iao`, `sdmo`, `cff`, `ifd`, `piio`, `fpv`, `aie`)
**no comparten un único patrón arquitectónico genérico de 3 roles** —
verificado por el propio `MAPEO_INTEGRACION_AIE.md` y por el trabajo de
esta sesión: cada motor tiene una función distinta en la cadena (sensor →
cálculo individual → agregación → evidencia → diagnóstico → económico), no
tres categorías repetidas 8 veces.

Tu propia sugerencia (`S-04`=AIE por evaluar admisibilidad de evidencia,
`S-05`=IFD por proyección económica) **es la lectura correcta, con
evidencia real que la confirma**:

- **`S-04` = AIE** — `rules_2f_3f.py`/`DOCUMENTO_TECNICO_AIE_v1.md` en efecto
  clasifican el ESTADO de evidencia contrastando familias (`R01`-`R11`,
  `EVIDENCE_ADMISSIBILITY` en `motor-piio/enums.js`) — es, literalmente, el
  único motor cuyo trabajo central es evaluar admisibilidad/contraste de
  evidencia entre fuentes, no producir una métrica propia.
- **`S-05` = IFD** — único motor con proyección económica hacia adelante
  (`proyeccion.js`, `escenarios.js` en `motor-ifd/`) — el nombre
  "diagnóstico-prospectivo" encaja con lo que el código real hace y ningún
  otro motor hace (CFF es económico pero NO prospectivo — es costo
  actual/histórico, `cff_historial`).
- **`S-03` = "Motor de cálculo"** — esta sí podría ser genérica
  (candidato: describir el PATRÓN COMÚN real que comparten `ice-ieh`,
  `iao`, `sdmo`, `cff`, `piio`, `fpv` — todos calculan un índice/estado a
  partir de variables/observaciones, con el mismo tipo de arquitectura de
  "cálculo individual → agregación → clasificación categórica" que se
  repite genuinamente en los 6 — verificado: los 6 comparten esa forma en
  sus respectivos `README.md`). **Propuesta**: `S-03` = el patrón genérico
  compartido por los 6 motores de cálculo (no uno específico), y `S-04`/
  `S-05` son las 2 excepciones reales que no encajan en ese patrón (AIE no
  calcula un índice propio, evalúa evidencia ajena; IFD proyecta en vez de
  medir el presente).

### 3.3 Los 4 arneses de integración — dónde viven

**No tienen hogar en la taxonomía que me diste, confirmado** — ni `S-01`
ni `S-02` (cuyos nombres no tengo) aparecen definidos en tu mensaje con
detalle suficiente para decidir si encajan.

**Evidencia real de qué son, para fundamentar la propuesta**: los 4 arneses
(`motor-integracion` ICE-IEH↔IAO, `motor-integracion-sdmo-aie`,
`motor-integracion-iao-aie`, `motor-integracion-piio-aie`) no son
documentación de UN motor — cada uno resolvió una tensión arquitectónica
real ENTRE dos motores (adaptador de claves ICE-IEH→IAO; segmentación por
huecos SDMO→AIE; alineación por período real IAO→AIE; la asimetría de
`NODE_HIERARCHY`/desalineación de `efo_states` más corto que `input.periods`
en PIIO→AIE). Son, por naturaleza, transversales — no pertenecen al
documento de ningún motor individual sin obligar al lector a buscar la
mitad de la historia en otro lado.

**Propuesta concreta**: `S-08` nuevo, no una subsección de `S-02` (cuyo
contenido no puedo confirmar que sea compatible sin que me digas qué es).
Un código propio y transversal es más consistente con lo que estos 4
documentos realmente son —trabajo de integración, no de un motor— y evita
que la actualización de un motor individual (`T-0X`/`S-0X` de ese motor)
tenga que arrastrar contenido de integración que no le pertenece
únicamente a él. `MAPEO_INTEGRACION_AIE.md` es la base real más fuerte para
`S-08` — pero **necesita una pasada de actualización antes de promoverlo**:
está fechado 2026-09-13 y describe el grafo con los arneses **todavía sin
construir** ("rama no mergeada"); hoy los 4 ya están construidos, verificados
y mergeados a `main`. El contenido del mapeo (el grafo de dependencias) sigue
siendo válido; su descripción del estado de cada conexión ya no lo es.

---

## 3bis. Solapamiento real — Parte III de `v3` vs. `DOCUMENTO_MARCO_SISTEMA_EFICIENCIA.md`

**Verificado leyendo ambos textos completos, no por grep de términos.**

### Lo que SÍ es expansión técnica legítima (sin contradicción)

- **Fórmula de la Brecha** (`v3` cap. 12 vs. `DOCUMENTO_MARCO` §6.1-6.2): `v3`
  retiró deliberadamente la expresión matemática explícita de su cap. 12
  (ver Registro de cambios, actualización 2-sep: *"se retira la expresión
  matemática explícita de la Brecha... se conserva únicamente la
  descripción conceptual... remitiendo la formulación técnica completa al
  Documento Técnico Oficial"*) — `DOCUMENTO_MARCO` §6.1 SÍ trae la fórmula
  completa (`Brecha_calculada = Concepto_A − Concepto_B`, combinada con el
  ítem bipolar vía `α`) y §6.2 el método de determinar `α` empíricamente.
  Esto es exactamente el rol que le corresponde a `DOCUMENTO_MARCO` — no es
  una contradicción, es la materialización técnica que `v3` deja
  explícitamente para "un documento aparte" (cap. 13, introducción).
- **Mecanismo de calibración** (`DOCUMENTO_MARCO` §12, motor bayesiano
  Bühlmann heredado de `PIIO`-legacy): no tiene equivalente en `v3` en
  absoluto — contenido puramente técnico, sin conflicto porque no hay nada
  en `v3` que contradecir aquí.

### La contradicción real que sí hay que corregir

**`DOCUMENTO_MARCO_SISTEMA_EFICIENCIA.md` §6.3 ("El signo de la Brecha es
diagnóstico, no solo magnitud") contradice directamente a `v3`, no es una
versión anterior sin actualizar — es literalmente el texto que `v3` dice
haber descartado.**

Cita exacta de `DOCUMENTO_MARCO` §6.3, tal como está hoy en el archivo:

> "Brecha positiva (Concepto_A/ICE > Concepto_B/IEH): la estructura
> declara/ofrece más de lo que el individuo percibe recibir → problema de
> ejecución/comunicación... Brecha negativa (Concepto_B/IEH >
> Concepto_A/ICE): el individuo percibe más de lo que la estructura
> formalmente sostiene → posible fortaleza cultural informal no
> institucionalizada"

Cita exacta del Registro de cambios de `v3` (actualización del 1 de
septiembre de 2026, anterior a la última revisión de `v3` pero ya
incorporada a su versión vigente):

> "se reemplaza la lectura con signo fija de la Brecha ('positiva =
> problema de ejecución', 'negativa = fortaleza cultural informal') por la
> formulación validada técnicamente: Gⱼ = ICEⱼ − IEHⱼ, signo = dirección,
> magnitud = distancia, **sin asignar interpretación causal fija hasta
> calibración empírica**. Esta corrección sigue textualmente lo
> establecido en el Documento Técnico Oficial ICE–IEH (§8.7 y §13.13 de ese
> documento: BRECHA ≠ DIAGNÓSTICO)."

**Son, palabra por palabra, la misma frase** ("problema de
ejecución"/"fortaleza cultural informal") que `v3` cita como la versión
YA DESCARTADA. `DOCUMENTO_MARCO` §6.3 no es una expansión técnica de algo
que `v3` dejó abierto — es la versión vieja que `v3` mismo dice haber
reemplazado, todavía viva en `DOCUMENTO_MARCO`, verbatim.

**ESTADO: CORREGIDO** — `DOCUMENTO_MARCO_SISTEMA_EFICIENCIA.md` §6.3/§6.4
reescritos, commit `<pendiente de que Luis apruebe>`. §6.3 ya no fija
"positiva=ejecución/negativa=fortaleza cultural informal" — cita
textualmente la misma referencia que `v3` (Documento Técnico Oficial
ICE–IEH §8.7/§13.13, "BRECHA ≠ DIAGNÓSTICO") y deja explícito que la
interpretación causal por dirección espera calibración empírica. §6.4
ajustado en consonancia — ya no dice que "el signo decide qué ficha de
intervención aplica".

**Confirmado por grep de todo el documento** (no solo §6.3/§6.4): un tercer
lugar relacionado, **no corregido, señalado para tu decisión**: §4 (fórmula
del IAO) fija `w_pos=1` ("Brecha positiva a plena severidad — asimetría de
aversión a la pérdida") mientras `w_neg` queda libre para calibrar — un
trato asimétrico del signo, aunque con una justificación propia distinta
(aversión a la pérdida, no la lectura causal descartada) y marcado
explícitamente en el propio documento como "decisión ya resuelta, no
reabrir sin nueva evidencia". No lo toqué — cambiarlo reabriría una
decisión que tú ya habías cerrado, y no es el mismo tipo de afirmación que
§6.3 (esa fijaba qué SIGNIFICA cada signo; ésta fija cuánto PESA, con su
propia razón). Tu confirmación: ¿se mantiene tal cual, o también debería
volverse calibrable como `w_neg`?

**`CATALOGO_INTERVENCION_EFICIENCIA.md` — confirmado que SÍ hereda el
defecto de `§6.3`, con una precisión importante sobre su forma real**:
verificado línea por línea (no solo por grep de la frase), el catálogo NO
repite la misma oración diez veces. Es **1 cita casi verbatim (Par 1,
líneas 106/122 — "Fortaleza cultural informal, no institucionalizada —
frágil" es literal) + 9 secciones adicionales con el mismo patrón
estructural, no el mismo texto**: cada una de las 10 fichas (5 pares ×
Brecha positiva/negativa) presenta una interpretación causal específica y
DISTINTA por par (incoherencia percibida, riesgo de colchón que se agota,
dependencia relacional, agotamiento por dar de más...) como diagnóstico ya
resuelto ("La estructura está bien diseñada, pero..."; "El impacto real es
positivo, pero no se percibe como justo."), no como hipótesis pendiente de
calibración empírica — el mismo defecto que `§6.3` tenía, aplicado con
contenido propio en cada par.

**Qué significa corregir esto en su turno — explícito, para que no se
subestime**: NO es un find-and-replace de una frase repetida. Es revisar,
par por par, si cada una de las 10 narrativas causales debe reformularse
con el mismo lenguaje que ya usa `§6.3` corregido ("puede justificar
profundización, no un diagnóstico cerrado", sin fijar qué significa la
dirección hasta calibración empírica) en vez de presentarse como conclusión
ya resuelta — 10 revisiones de contenido real, cada una distinta, no una
sustitución mecánica.

**No lo edité** (confirmado que no está en uso con ningún cliente real —
sigue esperando su turno, según decisión de Luis).

---

## 4. Lo que falta de tu lado antes de que esta tabla se pueda cerrar

No invento los códigos que no me diste. Para completar el inventario con
la misma rigurosidad que el resto, necesito de ti:

1. Los nombres reales de `F-02`-`F-04` (con la salvedad de §2bis: puede que
   no apliquen como documentos aparte todavía), `M-01`-`M-05` (más allá de
   la pista "causal/instrumental/evidencia/económica" — ¿es una asignación
   1:1 a los 5 códigos, o son 4 ejes para 5 documentos?), `T-02`-`T-07`
   (confirmar si mi propuesta de orden por motor es la que tenías en
   mente), `O-01`-`O-04`, `S-01`, `S-02`, `S-06`, `S-07`.
2. Confirmación de las 3 propuestas de §3 (`T-01` con reorganización de
   contenido explícita; `S-03` genérico + `S-04`/`S-05` específicos; `S-08`
   nuevo para los arneses).
3. ~~Decisión sobre los 2 documentos "madre/marco"~~ — **RESUELTO por ti
   en esta ronda**: `v3` es `F-01`, `DOCUMENTO_MARCO` es materialización
   derivada, el `.docx` sin versión es legado. Ya no es una pregunta abierta.
4. **Nuevo de esta ronda** — dos preguntas conceptuales que no puedo
   responder solo con lectura de texto, necesitan tu confirmación directa:
   - ¿`IFD` es el renombre de `IFT` (`v3` §13.5), o son instrumentos
     distintos que deban coexistir en la documentación? Cambia si `T-04`
     necesita una nota de "renombrado desde IFT" o si hace falta agregar
     `IFT` como concepto aparte en algún lado.
   - `AIE` no tiene precursor en `v3` bajo ningún nombre (§1.1) — ¿es
     correcto que `v3`, como documento de instrumentos, nunca iba a nombrar
     un mecanismo de integración entre instrumentos, o hace falta agregarle
     a `v3`/`F-01` un párrafo breve reconociendo que existe, por completitud
     de propiedad intelectual?
   - **Nueva, de esta ronda**: `w_pos=1` fijo en la fórmula del IAO (`v3`
     materializado en `DOCUMENTO_MARCO` §4) trata la Brecha positiva
     asimétricamente por diseño ("aversión a la pérdida", decisión ya
     marcada como cerrada) — ¿se mantiene tal cual, o también debería
     volverse calibrable como `w_neg`, dado que el criterio general de esta
     ronda fue "nada de interpretación fija del signo sin calibración"?
5. Con eso, el orden de prioridad de actualización — mi lectura, solo como
   insumo para esa conversación, no como decisión: **`DOCUMENTO_MARCO`
   §6.3/§6.4 ya corregidos en esta ronda** (era la contradicción activa con
   la fuente teórica raíz, no solo un vacío — resuelto primero). Sigue
   pendiente `CATALOGO_INTERVENCION_EFICIENCIA.md` (confirmado que hereda el
   mismo patrón estructural en sus 10 fichas — 1 cita casi verbatim + 9 con
   contenido propio distinto, no 10 copias de una frase —, no editado,
   espera su turno; corregirlo es una revisión de contenido par por par, no
   un find-and-replace). `F-01` (vacío de AIE/IFD en `v3`) y `T-07`/AIE (una frase falsa, barata de
   arreglar, alto impacto) siguen siendo la actualización de mayor relación
   impacto/costo; `T-05`/PIIO sigue siendo la de mayor volumen de cambio
   real.

---

## 5. Nota de alcance — hallazgo de titularidad

`v3` trae, en su Registro de cambios, un párrafo real sobre titularidad de
autoría (confirmada en conversación, sin documento jurídico formal
todavía). **Lo vi al leer el documento completo y, tal como pediste, no lo
toco aquí** — es un paso legal real, no parte de este inventario de
documentación técnica. Ya lo tienes señalado directamente; este documento
no lo repite ni lo resume.
