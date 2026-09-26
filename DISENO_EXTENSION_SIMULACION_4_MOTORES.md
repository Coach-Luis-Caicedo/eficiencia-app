# Diseño — extensión del script de simulación a los 4 motores restantes

**Estado: diseño completo, cero código todavía.** Cierra el encargo de
integrar `FPV`/`CFF`/`IFD`/`PIIO` al script ya aprobado
(`DISENO_SCRIPT_SIMULACION_RESPUESTAS.md`, 5 organizaciones,
`ICE-IEH`/`SDMO`/`IAO`/`AIE`, ese diseño **no se reabre**). Con las 3
brechas Worker↔motor cerradas (`041`/`042`/`043`), los 4 motores ya
tienen camino de escritura completo.

---

## 1. Decisión — integrar en las 5 organizaciones existentes, no crear nuevas

**Decidido, con evidencia por motor, no por defecto de conveniencia.**

### 1.1 Hallazgo que fuerza la decisión para `CFF`/`PIIO`: comparten infraestructura de nodos

Verificado, no supuesto: `leer_node_hierarchy_cff` (`036:191-193`)
`RETURNS SETOF motores_eficiencia.node_hierarchy_cff_view` — y esa vista
(`031`) es una proyección `{node_id, parent_id}` de la **misma tabla**
`motores_eficiencia.node_hierarchy` que `registrar_nodo_piio` (`041`)
escribe. **No son dos jerarquías separadas** — si una organización ya
tiene `node_hierarchy` poblado (para `PIIO`), `CFF` puede leerlo gratis
a través de la vista, sin duplicar nada. Crear organizaciones nuevas
solo para `CFF`/`PIIO` desperdiciaría esta infraestructura compartida
que ya existe.

Además, para que un `CFF_EVENT`/`ECONOMIC_COMPONENT` caiga dentro del
`node_set` resuelto (`hojasBajo(node_raiz, nodeHierarchy)`), su `node_id`
tiene que ser una hoja real de esa jerarquía — es decir, los nodos de
`CFF` deben ser **los mismos nombres** que ya existen como
departamentos de la organización (`Operaciones`/`Administración` para
Sana, etc., `DISENO_SCRIPT_SIMULACION_RESPUESTAS.md` §0). Reusar la
organización existente hace esto automático y realista (una empresa
real tiene un solo árbol de nodos, no uno por motor); una organización
nueva obligaría a inventar una jerarquía paralela sin ninguna ganancia.

### 1.2 `FPV` — población distinta, pero la misma organización-ancla tiene sentido

`INVESTIGACION_SIMULACION_FPV.md` §2 ya estableció que la población de
`FPV` (clientes/inversionistas/proveedores) es conceptualmente distinta
de la de empleados — **pero eso es un argumento sobre el `persona_id`,
no sobre el `organization_id`**. Una organización real SÍ tiene, al
mismo tiempo, empleados (`ICE-IEH`/`SDMO`) y grupos de interés externos
(`FPV`) — es la misma empresa vista desde dos ángulos, no dos empresas.
Adjuntar `FPV` a las organizaciones ya creadas es lo realista; el único
cuidado real (ya señalado en la investigación) es no reusar el mismo
pool de `persona_id` — se usa un pool propio (`cliente-N`/
`inversionista-N`/`proveedor-N`) sin relación con los `persona_id` de
empleados.

### 1.3 `IFD` — sin ningún vínculo estructural, la elección es de conveniencia, dicho como tal

`ifd_epd` (`032:330-375`, verificado completo) **no tiene `node_id` en
absoluto** — un EPD es un registro organizacional puro, sin ningún nodo
ni población que lo ate a nada de lo ya construido. No hay evidencia
que fuerce una organización sobre otra; la elección de dónde ponerlos
es una decisión de conveniencia de alcance, señalada como tal en §3.

### 1.4 Conclusión

**Ninguna organización nueva.** Las 5 ya diseñadas (`Sana`, `Alerta`,
`Mejora sostenida`, `Deterioro`, `Pequeña`) reciben los 4 motores
nuevos, distribuidos por relevancia narrativa y por necesidad de
evidencia (no todas las organizaciones necesitan los 4 motores — ver
§2, cada asignación tiene su propia razón, no es "repartir por
igual").

---

## 2. Mapeo — qué motor, qué escenario, en qué organización

### 2.1 `node_hierarchy` — infraestructura compartida, poblada donde `CFF` y/o `PIIO` la necesiten

Vía `registrar_nodo_piio` (`041`), reusando los nombres de departamento
ya definidos (`DISENO_SCRIPT_SIMULACION_RESPUESTAS.md` §0):

| Organización | Nodos a registrar (`node_type`, `parent_node_id`) |
|---|---|
| Sana | `ORG` (raíz) → `Operaciones`, `Administración` |
| Alerta | `ORG` (raíz) → `Ventas`, `Producción` |
| Deterioro | `ORG` (raíz) → `Equipo Piloto` |
| Pequeña | `ORG` (raíz) → `Equipo A`, `Equipo B` |

`Mejora` **no** recibe `node_hierarchy` — no se le asigna ni `CFF` ni
`PIIO` (razón en §2.2/§2.4: su narrativa de trayectoria ya la lleva
`Deterioro`, no hace falta duplicarla en las dos direcciones para los
motores nuevos).

### 2.2 `CFF` — 3 organizaciones, los 6 escenarios de `INVESTIGACION_SIMULACION_CFF.md` §3 repartidos

| Organización | Escenarios (de la tabla §3 de la investigación) |
|---|---|
| Sana | 1 (caso limpio, `VALID`/`FULL`) + 5 (múltiples eventos/componentes, mezcla de `primary_mechanism`/`financial_nature`) + **7 (relación `CONTAINS` real, `FULL`)** — dos componentes del evento donde uno contiene por completo al otro |
| Alerta | 2 (fuera de alcance, componente excluido) + 6 (cobertura insuficiente → `cff_total: null`) |
| Pequeña | 3 (transferencia interna pura) + 4 (`node_set` no declarado → default `hojasBajo`) |

**Actualización 2026-09-25 — el escenario 7 no existía en
`INVESTIGACION_SIMULACION_CFF.md` §3** (esa investigación es anterior a
`042` y dejaba `CONTAINS`/`DEPENDENT_COST` como bloqueados). Se agrega
ahora porque la prueba mínima contra producción real ya lo demostró: con
`C1 CONTAINS C2` (`FULL`) el `cff_total` fue `1000`, no `1300` — la
relación cambia el resultado, no solo se guarda. Se usa la misma forma
que la prueba mínima (`registrar_relaciones_cff`, un solo lote, 1 fila).
`DEPENDENT_COST` queda **sin escenario propio** en esta ronda: no se ha
probado contra producción todavía y no se agrega sin esa evidencia.

Un `cff_case_id` por organización (no por escenario — cada caso trae
varios eventos, cada evento ejercita un escenario distinto vía sus
componentes). `period_start`/`period_end` dentro de la ventana ya
usada (`2026-06`, un mes representativo — `CFF` no lleva serie de 6
períodos como `ICE-IEH`/`SDMO`, cada caso es una declaración puntual).

`Mejora`/`Deterioro` quedan **fuera** de `CFF` — no hay evidencia de
que el motor tenga noción de trayectoria (`INVESTIGACION_SIMULACION_CFF.md`
no la menciona; `cff_casos` es una declaración de juicio puntual, no
una serie) — forzarlo sería fabricar una historia que el motor no
necesita para demostrarse.

### 2.3 `IFD` — 8 EPDs en una sola organización (`Sana`)

Los 8 EPDs de la tabla de `INVESTIGACION_SIMULACION_IFD.md` §3
(`S0` no-admisible, `S0` trazabilidad nula, `S1`-`S3` por `FEP`, `V5`
techo duro, `V1` ruta propia, serie insuficiente) van completos en
**una sola organización**, no repartidos — `agregarEPDs` (roll-up) solo
se activa con `> 1` EPD en la misma organización
(`src/motores/ifd.js:34`), y repartir 1-2 EPDs por organización
diluiría esa cobertura sin ganar nada (no hay ninguna variación
organizacional real que `IFD` distinga — es puramente el nivel de
salida). `Sana` se elige por ser la organización de referencia
("flagship") de esta ronda, sin ninguna otra razón estructural — dicho
explícito, no una lectura del contrato.

### 2.4 `PIIO` — 2 organizaciones, `Sana` y `Deterioro`

**`Sana`** — cascada completa en un contexto estable: cubre los 5
niveles (`KPI_STATE→EVIDENCE_GROUP→PHENOMENON_STATE→DOMAIN_STATE→
EFO_STATE`), `directionality` variada (`HIGHER_IS_WORSE`/
`LOWER_IS_WORSE`), un fenómeno `BRIDGED` **con** `bridge_rule`
(continuidad de serie a través de un cambio de definición), y un
fenómeno con `status: 'PIIO_COMPATIBLE_PROVISIONAL'` (excluido de `EFO`
con alerta, resuelto aparte).

**`Deterioro`** — mismo catálogo mínimo, pero las `observations` seis
un `KPI` que **empeora** a lo largo de los 6 períodos (reusa
literalmente `SALUD_DETERIORO`/`xInversaSalud` ya construidos para
`ICE-IEH`/`SDMO` — mismo tipo de conversión salud→valor, aplicado ahora
a un valor de `KPI` en vez de una respuesta de encuesta) — para que
`DOMAIN_STATE`/`EFO_STATE` genuinamente se degraden entre el período 1
y el 6, no queden estáticos. También lleva el fenómeno `BRIDGED`
**sin** `bridge_rule` (dispara `NEW_SERIES` + alerta `BRIDGE_SIN_REGLA`)
— el caso `BRIDGED` que `Sana` no cubre, para que los 4 casos de
`continuity_mode` (`CONTINUOUS`/`BRIDGED`-con-regla/`BRIDGED`-sin-regla/
`NEW_SERIES`) queden los 4 representados entre las 2 organizaciones, no
repetidos.

`Alerta`/`Mejora`/`Pequeña` quedan fuera de `PIIO` — 2 organizaciones ya
cubren los 4 casos de `continuity_mode`, los 5 niveles de cascada, la
variación de `directionality`, y el caso provisional; una tercera no
añade un eje nuevo, solo repetiría cobertura ya demostrada.

**Catálogo mínimo por organización** (mismos campos ya verificados en
`verify041.mjs` esta sesión, reusados aquí, no reinventados):

| Tabla | Filas | Contenido |
|---|---|---|
| `domain_catalog` | 2 | `QUALITY`, `OPERATIONAL_CONTINUITY` |
| `phenomenon_catalog` | 3 | 1 `HIGHER_IS_WORSE` normal, 1 `LOWER_IS_WORSE` normal, 1 `PIIO_COMPATIBLE_PROVISIONAL` |
| `metric_definitions` | 3 | 1 `CONTINUOUS`; 1 `BRIDGED` (con `bridge_rule` en `Sana`, sin él en `Deterioro`); 1 asociada al fenómeno provisional |
| `reference_specs` | 1 | reusada por los `kpi_specs` que la necesiten (`condition_reference_id`/`temporal_reference_id`, ambos obligatorios — mismo patrón que el fixture de `verify041.mjs`) |
| `kpi_specs` | 3 | uno por métrica |
| `evidence_groups` | 3 | uno por KPI, `node_id` = una hoja real de §2.1 |
| `observations` | 3 KPI × 6 períodos × 1 nodo = 18 por organización | `Sana`: valores estables; `Deterioro`: `xInversaSalud(SALUD_DETERIORO[i])` por período, mismo patrón que `ICE-IEH` |

`observations` se manda en **un solo lote** por organización
(`registrar_observaciones_piio`, `041`, ya es *EN LOTE* — 18 filas en 1
llamada, no 18 llamadas).

### 2.5 `FPV` — 4 de las 5 organizaciones, ejes + los 3 nuevos de `043` repartidos por posición

| Organización | `CONSUMIDOR` | `INVERSIONISTA` | `PROVEEDOR` |
|---|---|---|---|
| Sana | Consenso alto + **CENSAL** (`N_elegibles` tal que `CV≥80`) | **Ponderación** activada (`ponderacion.metodologia`) | Muestra emparejada **completa** (3 sensores todos) |
| Alerta | Polarización (extremos) | `NE` abundante | `NR` abundante |
| Mejora sostenida | Muestra **parcial** (algunos solo 1-2 sensores) | **INFERENCIAL** (`diseno.probabilistico: true`) | Posición **vacía** (sin ninguna respuesta) |
| Pequeña | Consenso alto, escala pequeña (5 personas) | — | — |

`Deterioro` queda fuera de `FPV` — mismo argumento que `CFF`: `FPV` no
tiene noción de trayectoria (`INVESTIGACION_SIMULACION_FPV.md` §4, "sin
sector ni trayectoria por período... no hay evidencia de que FPV tenga
una noción de trayectoria") — no se fabrica una.

**Valores exactos para `CENSAL`/`INFERENCIAL`, verificados contra
`motor-fpv/cobertura.js:120-137`** (`escaleraEstatus`, precedencia
`INFERENCIAL > CENSAL > DESCRIPTIVO`, `UMBRAL_CENSAL_CV = 80`):
- `Sana.CONSUMIDOR` — 12 personas responden, `N_elegibles=14` →
  `CV = 100×12/14 ≈ 85.7% ≥ 80` → `censal_aplica=true`.
  `diseno_probabilistico=false`, `diseno_modelo_documentado=false`
  (declarados explícitos, ambos `false` — para que NO escale a
  `INFERENCIAL` por accidente, `disenoHabilitaInferencia` exige que
  alguno sea `true`).
- `Mejora.INVERSIONISTA` — `diseno_probabilistico=true`,
  `diseno_modelo_documentado=false` (basta uno) → `INFERENCIAL`,
  **sin importar** `N_elegibles`/`CV` (precedencia).

Población `FPV` por organización: `CONSUMIDOR`/`INVERSIONISTA` con
10-12 personas cada uno (excepto donde el eje pide otra cosa —
`Mejora.PROVEEDOR` vacío = 0 personas; `Pequeña.CONSUMIDOR` = 5).
Un solo período por posición (no 6 — mismo argumento de "sin
trayectoria").

---

## 3. Volumen y tiempo — medido, no extrapolado del caso de 1.000

**Aclaración necesaria antes de responder la pregunta**: la cifra de
"~11 minutos" (`INVESTIGACION_SCRIPT_SIMULACION_RESPUESTAS.md` §4) es
un estimado para una organización hipotética de **1.000 personas**, NO
el tiempo real de las 5 organizaciones ya diseñadas (103 personas
totales, `DISENO_SCRIPT_SIMULACION_RESPUESTAS.md` §0). Con las tasas
medidas (`262,9 ms` secuencial / `26,3 ms` a concurrencia 10, mismo
documento §4), el volumen REAL del script ya aprobado es:

| Pieza | Llamadas | Tiempo (concurrencia 10) |
|---|---|---|
| `ICE-IEH` (103 × 6 períodos) | 618 | 618 × 26,3 ms ≈ **16 s** |
| `SDMO` (103 × 18 jornadas) | 1.854 | 1.854 × 26,3 ms ≈ **49 s** |
| Invitaciones (103, lotes de 50, secuencial) | 3 lotes | ≈ 2-3 s |
| **Subtotal ya aprobado** | **2.475** | **≈ 70-75 s** |

**Volumen nuevo, los 4 motores** (§2, contado exacto por escenario):

| Motor | Llamadas nuevas | Patrón | Tiempo |
|---|---|---|---|
| `FPV` — respuestas | ~80 (suma de personas de §2.5) | `anon`, concurrencia 10 | ≈ 2 s |
| `FPV` — config posición (`043`) | ~6 (solo donde se declara algo) | `authenticated`, secuencial | ≈ 1,6 s |
| `CFF` — casos | 3 | `authenticated`, secuencial | ≈ 0,8 s |
| `CFF` — eventos (con sus componentes en la misma llamada) | ~15 | `authenticated`, secuencial | ≈ 4 s |
| `IFD` — EPDs | 8 | `authenticated`, secuencial | ≈ 2,1 s |
| `PIIO` — catálogo (2 orgs × ~12 filas: dominios+fenómenos+métricas+referencia+kpis+evidence_groups) | ~24 | `authenticated`, secuencial | ≈ 6,3 s |
| `PIIO` — observaciones (2 orgs, EN LOTE) | 2 | `authenticated`, 1 lote c/u | ≈ 0,5 s |
| `node_hierarchy` (4 orgs × 2-3 nodos) | ~10 | `authenticated`, secuencial | ≈ 2,6 s |
| **Subtotal motores nuevos** | **≈ 148** | | **≈ 20 s** |

**Total estimado: ~90-100 segundos** (subtotal aprobado ~70-75s +
motores nuevos ~20s + creación de 5 organizaciones, despreciable). **No
cambia sustancialmente la estimación** — la pregunta de Luis tiene
respuesta clara: los 4 motores nuevos usan patrones de escritura
`authenticated`/lote de bajo volumen (decenas de filas, no miles), muy
por debajo del volumen de `ICE-IEH`/`SDMO` que domina el tiempo total
en cualquier escala. La cifra de 11 minutos sigue siendo válida
únicamente como estimado de la prueba de estrés de 1.000 personas
(`ICE-IEH`/`SDMO` solamente) — no se recalculó aquí porque no fue
pedida, y los 4 motores nuevos no escalan con el número de empleados en
absoluto (son organización/posición/caso, no persona-período).

---

## 4. Estructura del script — funciones nuevas, mismo patrón que las existentes

```js
// ── FPV ──────────────────────────────────────────────────────────
async function generarConfigPosicionFpv(jwt, orgId, configsPorPosicion) { /* registrar_config_posicion_fpv, 043 */ }
async function generarInvitacionesFpvEnLote(jwt, orgId, asignaciones) { /* generar_invitaciones_fpv, 034 */ }
async function generarRespuestasFpv(codigos, escenario) { /* registrar_respuesta_fpv, anon, conLimite(...,10,...) */ }

// ── CFF ──────────────────────────────────────────────────────────
async function registrarNodeHierarchy(jwt, orgId, nodos) { /* registrar_nodo_piio, 041 -- compartido con PIIO */ }
async function generarCasoCff(jwt, orgId, caso) { /* registrar_caso_cff, 036 */ }
async function generarEventosCff(jwt, orgId, eventos) { /* registrar_evento_cff, 034, uno por evento (trae sus componentes) */ }

// ── IFD ──────────────────────────────────────────────────────────
async function generarEpdsIfd(jwt, orgId, epds) { /* registrar_epd_ifd, 034 */ }

// ── PIIO ─────────────────────────────────────────────────────────
async function generarCatalogoPiio(jwt, orgId, catalogo) {
  // registrar_dominio_piio / registrar_fenomeno_piio / registrar_metric_definition_piio /
  // registrar_reference_spec_piio / registrar_kpi_spec_piio / registrar_evidence_group_piio (041)
  // -- secuencial, orden de dependencia (dominio antes que fenómeno, fenómeno antes que métrica, etc.)
}
async function generarObservacionesPiio(jwt, orgId, filas) { /* registrar_observaciones_piio, EN LOTE, 041 */ }

// ── Orquestación extendida ──────────────────────────────────────
async function generarOrganizacionCompleta(jwt, perfil) {
  // 1-4. igual que hoy (crear, invitaciones, ICE-IEH, SDMO)
  // 5. SI perfil.nodeHierarchy -- registrarNodeHierarchy (CFF y/o PIIO la necesitan)
  // 6. SI perfil.fpv -- config posición + invitaciones + respuestas FPV
  // 7. SI perfil.cff -- caso + eventos
  // 8. SI perfil.ifd -- EPDs
  // 9. SI perfil.piio -- catálogo + observaciones
  // Mismo criterio de manejo de error que ya existe (§4 del diseño
  // original): fallas de fila individual se reportan y siguen: fallas
  // de "sin esto no hay nada que hacer" (crear caso CFF, catálogo PIIO
  // incompleto) abortan SOLO ese motor para esa organización, no la
  // organización completa -- un fallo en PIIO no debe borrar el ICE-IEH
  // ya generado para la misma organización.
}
```

`PERFILES` (la lista ya existente) gana, por organización, las claves
opcionales `nodeHierarchy`/`fpv`/`cff`/`ifd`/`piio` con los datos
exactos de §2 — ninguna organización lleva las 4, por diseño (§1/§2).

---

## Resumen para la construcción

- Sin organizaciones nuevas — las 5 ya diseñadas.
- `node_hierarchy` compartida entre `CFF`/`PIIO` (mismo hallazgo real:
  `leer_node_hierarchy_cff` lee la vista de la misma tabla que
  `registrar_nodo_piio` escribe).
- `CFF`: Sana, Alerta, Pequeña (6 escenarios repartidos). `IFD`: solo
  Sana (8 EPDs, roll-up real). `PIIO`: Sana + Deterioro (cascada + los
  4 casos de `continuity_mode` + provisional). `FPV`: Sana, Alerta,
  Mejora, Pequeña (4 ejes viejos + `CENSAL`/`INFERENCIAL`/ponderación
  nuevos, repartidos por posición). `Deterioro`/`Mejora` NO llevan
  `CFF`/`FPV` — ninguno de los dos motores tiene noción de trayectoria,
  no se fabrica una.
- Volumen nuevo ≈ 148 llamadas, ≈ 20 segundos — el total del script
  completo queda en **~90-100 segundos**, dominado igual que hoy por
  `ICE-IEH`/`SDMO`, no por los 4 motores nuevos.

¿Apruebas este diseño (la integración en las 5 organizaciones
existentes, el mapeo motor→organización→escenario de §2, y el volumen
estimado de §3) antes de que escriba el script real?
