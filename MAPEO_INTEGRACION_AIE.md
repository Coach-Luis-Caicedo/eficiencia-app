# Mapeo de integración — grafo real de dependencias hacia AIE

Fecha: 2026-09-13. **Cero código en este documento** — es exactamente lo que
se pidió: entender el alcance real antes de escribir nada, mismo proceso que
la reapertura de `rebasarHistoria`. Responde a tres preguntas concretas:
(1) el grafo completo de "quién alimenta a quién", verificado; (2) si el
vacío longitudinal de `CFG` es solo de `motor-iao` o baja un nivel más;
(3) un diseño de integración de punta a punta que reutilice lo que ya existe
en las 3 ramas de integración, en vez de proponer algo desde cero.

---

## 1. El grafo completo — verificado, no recordado

Para cada uno de los 7 motores + AIE: qué necesita, de dónde sale, y el
estado real de esa conexión.

| Consumidor | Necesita | Sale de | Estado de la conexión |
|---|---|---|---|
| `motor-iao` | 10 variables (0-100), claves cortas `EST/FOR/...` | `motor-ice-ieh.calcular().variables` (claves largas en español) | **Código real, en rama no mergeada** — `feat/motor-integracion` (`bcaea53`), adaptador de claves derivado de `PREGUNTAS`/`PARES`, 100 asserts. Resuelve el desajuste de nombres de **una sola administración** — no toca series temporales. |
| `motor-cff` | Eventos de fricción con magnitud económica | Fuente externa (no de PIIO) + `phenomenon_id`/`domain_id`/`node_id` opcionalmente de PIIO para trazabilidad | **Código real, en `feat/motor-piio`** — `integracion_cff_ifd.test.js` (Fase 12c), adaptador `_aCFFEvent` documentado como decisión del arnés. Confirma que la magnitud económica **nunca** sale de PIIO (grep confirmado: `exposure_definition`/`operational_quantity` no se leen en ningún cálculo de CFF). |
| `motor-ifd` | `EPD_INPUT` con atribución categórica | Fuente externa + identificación de PIIO | **Código real, en `feat/motor-piio`** — mismo arnés Fase 12c, adaptador `_aEPDInput`. |
| `motor-fpv` | Respuestas F/P/V por posición (Consumidor/Inversionista/Proveedor) | Fuente externa (cuestionario propio) | **Sin integración construida** — motor aislado, sin arnés hacia ningún otro motor. No es parte de la cadena `CFG→DYN→EFO`. |
| `motor-sdmo` (→`DYN`) | Respuestas ACU/COM/INV/PEN por Persona, por período | Fuente externa (cuestionario SDMO) | Motor mismo: código real, completo. La **serie multi-período a nivel organización** (`dyn(t)`) NO es una función de `motor-sdmo` — ver sección 2. |
| `motor-iao` (→`CFG`) | 10 variables ICE-IEH, agregadas por nodo | `motor-ice-ieh` (vía el arnés de la fila 1) | Motor mismo: código real, completo, **pero solo para una foto de un momento** (`agregarNodo`/`agregarOrganizacion` son snapshots). La serie multi-período NO existe en ningún lado — ver sección 2. |
| `motor-piio` (→`EFO`) | KPIs/observaciones por Persona/nodo, por período, referencias, jerarquía | Fuente externa (registros/KPI) | Motor mismo: código real, completo, **incluyendo la serie temporal completa** (`runPIIOCompleto`, cascada §29) — es el único de los tres que ya resuelve su propio eje de tiempo internamente. |
| **AIE** (`CFG+DYN+EFO`) | Series `cfg(t)`, `dyn(t)`, `ops(t)` por unidad, valores 0-100, clasificadas en posición/trayectoria/persistencia | `motor-iao` (CFG), `motor-sdmo` (DYN), `motor-piio` (EFO) | **Ninguna de las tres conexiones existe completa con dato real.** `DYN`: harness real pero con `cfg` sintético y `ops=null` (`feat/motor-integracion-sdmo-aie`, `685d140`). `CFG`: sin ensamblado temporal en ningún lado. `EFO`: **cero harness** hacia AIE — ni siquiera un intento sintético, a pesar de que `motor-piio` es el motor más completo de los tres. |

**Confirmación de las 3 ramas mencionadas, con precisión sobre qué cubre
cada una:**

| Rama | Qué resuelve realmente | Qué NO resuelve (aunque el nombre sugiera que sí) |
|---|---|---|
| `feat/motor-integracion` (`bcaea53`) | Adaptador de claves ICE-IEH→IAO, **una sola administración**. 100 asserts. | No ensambla ninguna serie temporal. No es "el paso 3" en el sentido longitudinal — es el paso 3 en el sentido de "¿los datos de un módulo encajan en el otro?", que es una pregunta distinta. |
| `feat/motor-integracion-sdmo-aie` (`685d140`) | Ensamblado multi-período de `DYN` (`calcularSerieOrganizacionalIDA`, construida **en el arnés, no en motor-sdmo**) + manejo de huecos (`segmentarPorHuecos`) + invocación real de `rules_2f_3f.run_case()` vía subproceso Python. 50 asserts. | `cfg` es **sintético** en todo el arnés (documentado explícitamente: "el hueco de relación 2 de motor-iao ya se cerró por separado en `motor-integracion/`" — **esa frase se refiere al adaptador de claves de la fila anterior, NO al vacío temporal que encontramos esta sesión**; es la misma palabra "hueco" para dos problemas distintos, y vale la pena corregir esa ambigüedad en la próxima persona que lea ese commit). `ops` es `null` siempre (PIIO no existía completo cuando se escribió). |
| Fase 12c de `motor-piio` (`d8d6554`/`a5e68b8`) | PIIO → CFF/IFD (dirección **descendente**: PIIO como fuente para otros motores). | No toca AIE en absoluto. Es la dirección opuesta a la que AIE necesita (AIE consume PIIO como fuente ascendente, no lo alimenta). |

---

## 2. ¿El vacío longitudinal es solo de `motor-iao`, o baja un nivel más?

**Baja un nivel más — confirmado con evidencia, no con sospecha.**

Se verificó `motor-ice-ieh/` completo (código + tests + README) con
`grep -ri "serie|periodo|trayectoria|temporal|longitudinal"`: **cero
resultados**. `motor-ice-ieh.calcular()` recibe 31 respuestas de **una
Persona en un momento** y devuelve un score — no tiene, ni tuvo nunca,
ningún concepto de período o historia. Es, por diseño, una foto.

Esto significa que la cadena real de ensamblaje para `CFG` tiene que resolver
**dos** capas, no una:

```
Persona, momento t          motor-ice-ieh.calcular()       → 10 variables (0-100), un instante
Nodo, momento t              motor-iao.agregarNodo()        → IAO_nodo, un instante
Organización, serie de t     [NO EXISTE — ninguna función]  → IAO(t), serie
```

Comparado con `DYN`, que tiene la misma primera capa resuelta de forma
distinta (motor-sdmo SÍ tiene su propio concepto de "serie por nodo" —
`calcularSerieIDA`, `categoria`, `trayectoria`, etc., aunque construido
dentro del propio motor) pero **la agregación multi-período a nivel
organización tampoco vive en motor-sdmo** — vive en el arnés
(`calcularSerieOrganizacionalIDA`), por la misma razón de diseño
(`agregarOrganizacion` es un snapshot a propósito, no un descuido).

**Conclusión:** el patrón correcto no es "arreglar motor-iao agregando una
función". Es: **motor-ice-ieh y motor-iao son, y deberían seguir siendo,
motores de un solo instante** (igual que motor-sdmo lo es a su nivel) — el
ensamblaje temporal es, en los tres casos, una responsabilidad de la capa de
integración/arnés, no del motor. Para `DYN` esa capa ya se construyó
(aunque con `cfg` sintético). Para `CFG` esa capa **no existe en ningún
lado** — ni en el motor (como se pensó al principio) ni en un arnés (a
diferencia de DYN). El vacío real no es "una función que falta en
motor-iao" — es "un arnés de integración temporal para CFG que nunca se
construyó, del mismo tipo que el que ya existe para DYN".

---

## 3. Diseño de integración de punta a punta (sin código, reutilizando lo que existe)

```
                    ┌─────────────────────────────────────────────────────┐
                    │  CAPA DE INSTANTE (motores puros, ya completos)      │
                    │                                                       │
  Persona, t  ──►   │  motor-ice-ieh.calcular()  ──[adaptador bcaea53]──►  │
                    │  motor-iao.calcular()/agregarNodo()/agregarOrganiz. │  ──► IAO_org(t)  (un número)
                    │                                                       │
  Persona, t  ──►   │  motor-sdmo.calcularIDA()  ──►  agregarOrganizacion()│  ──► IDA_org(t)  (un número,
                    │                                                       │       ya con harness real)
                    │  motor-piio: runPIIOCompleto()  (YA incluye el eje   │
  KPIs, t     ──►   │  temporal internamente — no necesita capa externa)   │  ──► EFO_STATE(t) (rico:
                    │                                                       │       pos/traj/pers/fresh/adm/cov)
                    └─────────────────────────────────────────────────────┘
                                          │
                                          ▼
                    ┌─────────────────────────────────────────────────────┐
                    │  CAPA DE ENSAMBLAJE TEMPORAL (arnés, NO el motor)    │
                    │                                                       │
                    │  CFG:  [NO EXISTE] — construir el análogo de         │
                    │        calcularSerieOrganizacionalIDA para IAO,      │
                    │        mismo patrón, misma decisión de composición   │
                    │        variable (motor-iao tampoco lleva persona_id) │
                    │                                                       │
                    │  DYN:  calcularSerieOrganizacionalIDA — YA EXISTE     │
                    │        (685d140), pendiente conectar CFG real y      │
                    │        reemplazar ops=null                           │
                    │                                                       │
                    │  EFO:  ensamblaje YA VIVE dentro de motor-piio        │
                    │        (runPIIOCompleto) — no hace falta capa externa,│
                    │        pero SÍ hace falta el harness que lo conecte   │
                    │        hacia AIE (no existe ninguno, ni sintético)    │
                    └─────────────────────────────────────────────────────┘
                                          │
                                          ▼
                    ┌─────────────────────────────────────────────────────┐
                    │  CAPA DE CLASIFICACIÓN (engine_core.py, genérica,    │
                    │  YA agnóstica de fuente — position/trajectory/       │
                    │  persistence/trajectory_run operan sobre CUALQUIER   │
                    │  serie [float] de longitud T, sin importar de dónde  │
                    │  venga)                                              │
                    │                                                       │
                    │  Ajustes pendientes (encontrados esta sesión,        │
                    │  pequeños y localizados, no un rediseño):            │
                    │   · segmentarPorHuecos() para CFG (mismo patrón ya   │
                    │     construido para DYN, motor-iao también puede     │
                    │     dar null en un período sin respondientes)        │
                    │   · sentinela 'N/A' vs 'N_A' al conectar EFO_STATE   │
                    │     real de PIIO (encontrado al escribir el checklist│
                    │     de activación, no corregido todavía)             │
                    └─────────────────────────────────────────────────────┘
                                          │
                                          ▼
                              classify_3F / classify_2F / bootstrap
                                 (rules_2f_3f.py — sin tocar)
```

**Por qué este diseño y no otro:** cada pieza de la fila "capa de instante"
y la fila "capa de clasificación" ya está construida y verificada — no se
propone reescribir ninguna. La única pieza de código genuinamente nueva que
este mapeo identifica es **una** función (el ensamblaje temporal de `CFG`,
análogo a `calcularSerieOrganizacionalIDA`), más los dos ajustes pequeños ya
localizados (huecos, vocabulario `N_A`). No hace falta un cuarto arnés
separado ni un rediseño de `engine_core.py`/`rules_2f_3f.py` — el patrón que
`685d140` ya estableció (ensamblar en el arnés, clasificar con el motor
genérico, segmentar en vez de imputar) se replica, no se reinventa.

---

## 4. Respuestas directas a las 3 preguntas de Luis

1. **El grafo completo** — sección 1, tabla completa, 8 filas + tabla de
   las 3 ramas con lo que cada una cubre exactamente. `motor-fpv` confirmado
   fuera de esta cadena (no alimenta ni consume `CFG`/`DYN`/`EFO`).
2. **El arnés ICE-IEH↔IAO NO resuelve el "paso 3" longitudinal** — resuelve
   un problema real pero distinto (adaptador de claves, una sola
   administración). El "paso 3" que menciona el comentario de `motor-iao.js`
   línea 14 ya está resuelto, pero se refiere a esto, no al vacío temporal.
3. **El vacío longitudinal SÍ baja un nivel más** — `motor-ice-ieh` es tan
   transversal como `motor-iao`. La corrección correcta no es agregar
   funciones dentro de `motor-iao` — es construir, en una capa de arnés
   (como ya se hizo para DYN), el ensamblaje multi-período que hoy no existe
   para ninguno de los dos módulos de la cadena `CFG`.
4. **Diseño de integración de punta a punta** — sección 3, reutilizando las
   3 piezas existentes (adaptador de claves, ensamblaje DYN, clasificación
   genérica) e identificando la única pieza real que falta construir (el
   ensamblaje temporal de `CFG`) más los dos ajustes pequeños ya localizados.

---

## 5. Qué NO se hizo en este documento

Ninguna función nueva. Ningún archivo de motor tocado. No se decidió el
orden de construcción ni quién lo aprueba — eso queda para la conversación
de los tres, como se pidió. `power_analysis_N_min.py`,
`CHECKLIST_ACTIVACION_PILOTO_AIE.md`, `ESTADO_PRIORIDADES_EFICIENCIA.md` y
la corrección de `motor-cff/README.md` de la ronda anterior siguen sin
commitear, a la espera de revisión conjunta.
