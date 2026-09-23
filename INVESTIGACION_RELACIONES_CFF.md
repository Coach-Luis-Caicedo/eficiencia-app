# Investigación — cerrar la brecha de `relaciones` en CFF

**Estado: investigación, con recomendación. Cero DDL todavía.** Resuelve
la brecha §2 de `PENDIENTES_BRECHAS_WORKER_MOTORES.md` (elegida por
sobre FPV §1 — forma del contrato ya conocida y verificada, sin
pregunta arquitectónica abierta que resolver primero).

---

## 1. Dónde está el hueco, exacto

`src/motores/cff.js` (archivo completo, ya verificado en la ronda de
simulación), función `calcularCff`, línea final antes de `runCFF(caso)`:

```js
const caso = Object.assign(
  {},
  sobreCasoDeclarado,
  genealogia,
  { nodeHierarchy: nodeHierarchy, eventos: eventosConSenales, relaciones: [] }
);
```

`relaciones: []` hardcoded — el propio comentario del archivo ya lo
documentaba: *"sin ESQUEMA_RELATIONSHIP formal que transcribir
todavía"*.

`src/worker.js:91-104` (`calcularCffHandler`) — punto de conexión real:

```js
const casoDeclarado = await rpc(env, jwt, 'leer_caso_cff', {...});
const caso = ...
const nodeHierarchy = await rpc(env, jwt, 'leer_node_hierarchy_cff', {...});
const eventos = await rpc(env, jwt, 'leer_eventos_cff', { p_organization_id, p_period_start: caso.period_start, p_period_end: caso.period_end });
return Response.json(calcularCff(eventos, caso, nodeHierarchy, organization_id, [caso.period_start], opts || {}));
```

Hoy no hay ninguna llamada RPC para relaciones — hace falta una función
de lectura nueva (`leer_relaciones_cff`, simétrica a
`leer_eventos_cff`), un nuevo parámetro en `calcularCff`, y la
correspondiente llamada nueva en el handler.

---

## 2. Forma exacta del contrato — verificado, no supuesto

`motor-cff/contratos.js:375-389`, `ESQUEMA_ECONOMIC_RELATION` (§22.5):

```js
var ESQUEMA_ECONOMIC_RELATION = [
  { name: 'relation_id', required: true, type: 'string' },
  { name: 'component_a_id', required: true, type: 'string' },
  { name: 'component_b_id', required: true, type: 'string' },
  { name: 'relation_type', required: true, type: 'string', enum: 'RELATION_TYPE' },
  { name: 'direction', required: false, type: 'string' },              // condicional
  { name: 'effective_from', required: true, type: 'string' },
  { name: 'effective_to', required: true, type: 'string' },
  { name: 'containment_scope', required: false, type: 'string', enum: 'CONTAINMENT_SCOPE' }, // condicional
  { name: 'quantified_overlap_value', required: false, type: 'number' },
  { name: 'selected_primary', required: false, type: 'string' },
  { name: 'resolution_status', required: true, type: 'string', enum: 'RELATION_RESOLUTION_STATUS' },
  { name: 'resolution_method', required: true, type: 'string' },
  { name: 'rationale', required: true, type: 'string' },
  { name: 'version', required: true, type: 'string' }
];
```

**Enums reales** (`motor-cff/enums.js:39,45,46`):
- `RELATION_TYPE`: `INDEPENDENT`, `DUPLICATE`, `CONTAINS`,
  `ALTERNATIVE_VALUATION`, `DEPENDENT_COST`, `UNKNOWN` — **6 valores**,
  no solo `CONTAINS`/`DEPENDENT_COST` (esos 2 son los que
  `PENDIENTES_BRECHAS_WORKER_MOTORES.md` §2 mencionaba como ejemplo
  destacado, pero el contrato real acepta los 6).
- `CONTAINMENT_SCOPE`: `FULL`, `PARTIAL_QUANTIFIED`,
  `PARTIAL_UNQUANTIFIED`.
- `RELATION_RESOLUTION_STATUS`: `RESOLVED`, `PARTIALLY_RESOLVED`,
  `UNRESOLVED`, `INVALID`.

**Reglas condicionales reales** (`contratos.js:391-412`,
`reglasCondicionalesEconomicRelation`, error duro no solo comentario):
- `containment_scope` obligatorio si `relation_type='CONTAINS'`;
  **rechazado** (no solo ignorado) si aparece con cualquier otro tipo.
- `direction` obligatorio si `relation_type` ∈ `RELACIONES_DIRIGIDAS =
  ['CONTAINS', 'DEPENDENT_COST']`; **rechazado** si aparece con
  `DUPLICATE` (la única en `RELACIONES_SIMETRICAS`). Para
  `INDEPENDENT`/`ALTERNATIVE_VALUATION`/`UNKNOWN`: opcional, sin exigir
  ni rechazar.

**Campos vs. lo que el motor realmente lee en tiempo de ejecución**
(`motor-cff/relaciones.js`, `resolverRelacion` línea 127 en adelante,
verificado línea por línea): usa `relation_type`, `containment_scope`,
`quantified_overlap_value`, `selected_primary`, `resolution_status`,
`component_a_id`/`component_b_id` (para el grafo `CONTAINS` y para
validar que `selected_primary` sea uno de los dos). **`direction` se
valida en `contratos.js` (presencia/ausencia) pero nunca se lee en
`relaciones.js` ni en ningún otro archivo del motor** — grep exhaustivo
(`grep '\.direction\b' motor-cff/*.js`) confirma cero usos de
resolución; mismo patrón ya visto con `phenomenon_catalog.valid_from/
valid_to` en PIIO — campo exigido por el contrato, sin mecanismo de
consumo. `effective_from`/`effective_to`/`resolution_method`/
`rationale`/`version`/`relation_id` tampoco se leen en
`relaciones.js` — son metadata de trazabilidad/vigencia, no insumos de
cálculo.

**Nombres de campo — sin transformación camelCase, a diferencia de
`sobreCaso`**: `construirGrafoContains`/`resolverRelacion` usan
`r.relation_type`, `r.component_a_id`, `r.component_b_id` — snake_case
directo, igual que llegan del contrato. No hace falta ningún
`mapearXAY` como el que sí existe para `casoDeclarado`
(`mapearCasoDeclaradoASobreCaso`, con `economicScope`/`nodeRaiz`
camelCase). Confirmado por lectura completa de `relaciones.js`.

---

## 3. Patrón de persistencia a copiar — ya existe, ya funciona

`cff_event_components` (`032:221-299`) es el precedente más cercano:
tabla hija con FK a la tabla padre (`cff_events`), CHECKs que replican
**selectivamente** solo las reglas condicionales que
`contratos.js` trata como error duro (no todas — mismo criterio
documentado en el `COMMENT ON TABLE` de esa tabla). `registrar_evento_cff`
(`034:239-285`) es el patrón de función a copiar: valida
autenticación/autorización, inserta el padre, luego inserta N hijos en
un solo `INSERT...SELECT FROM jsonb_array_elements()` — mismo mecanismo
de lote que `registrar_observaciones_piio` (`041`).

**Diferencia real con `cff_event_components`**: una relación no es hija
de un único padre — conecta **dos** componentes que pueden pertenecer a
eventos distintos. No hay una tabla "padre" natural para la FK como
`cff_events` lo es para `cff_event_components`. La FK correcta es
**doble**, contra `cff_event_components` mismo: `(organization_id,
component_a_id)` y `(organization_id, component_b_id)`, cada una
referenciando `cff_event_components (organization_id, component_id)` —
verificado que esa es una clave única real (`PRIMARY KEY
(organization_id, component_id)`, `032:268`).

**Scope de lectura** — `leer_eventos_cff` (`035:116-141`) filtra por
`organization_id` + rango `period_start`/`period_end`. `ECONOMIC_RELATION`
tiene sus propios `effective_from`/`effective_to` (obligatorios, texto
libre igual que los períodos de eventos — mismo formato `_es_periodo_valido`
esperable). El precedente sugiere `leer_relaciones_cff(organization_id,
period_start, period_end)` filtrando por ese mismo rango sobre
`effective_from`/`effective_to`, simétrico a `leer_eventos_cff` — sin
inventar un criterio de scope distinto al que ya existe para eventos.

---

## 4. Qué cambia en `src/motores/cff.js` / `src/worker.js`

- Nueva función SQL `leer_relaciones_cff(p_organization_id, p_period_start,
  p_period_end)` — plana (no anidada como eventos, `ECONOMIC_RELATION`
  no tiene hijos), `RETURNS jsonb` o `SETOF cff_relaciones`, mismo
  criterio que `leer_epd_ifd` (plana) vs. `leer_eventos_cff` (anidada).
- `calcularCff` gana un parámetro nuevo (`relacionesCrudas`), y la línea
  final pasa a `relaciones: relacionesCrudas` en vez de `relaciones: []`.
  Sin transformación de claves necesaria (§2, confirmado snake_case
  directo) — a diferencia de `casoDeclarado`, este parámetro se pasa
  tal cual llega de SQL.
- `calcularCffHandler` (`src/worker.js`) gana una llamada RPC nueva
  (`leer_relaciones_cff`, mismos argumentos de período que
  `leer_eventos_cff`) y la pasa a `calcularCff`.
- Nueva función de escritura `registrar_relacion_cff(p_organization_id,
  p_relacion)` — **no en lote** a diferencia de `registrar_evento_cff`:
  una relación no tiene "hijos" que insertar junto con ella (es una fila
  plana), así que no hay necesidad estructural de lote como con
  eventos/componentes. Se puede diseñar como una sola fila por llamada,
  o en lote si Luis prefiere consistencia con `registrar_observaciones_piio`
  para cargas masivas — pregunta abierta para el diseño, no resuelta aquí
  por conveniencia.

---

## 5. Impacto sobre las 5 señales de admisibilidad §18

`src/motores/cff.js` ya resuelve 4 de las 5 señales de admisibilidad
(comentario propio del archivo) — la quinta,
`relationship_resolution_permite_inclusion`, se deja sin tocar porque
`consolidacion.js:_paso5Seleccionar` la sobreescribe siempre con
`ctx.permiteInclusion[component_id]` (verificado por lectura y por
ejecución, según el propio comentario). Esto significa que **cerrar
esta brecha no requiere ningún cambio en `resolverSenalesComponente()`**
— la señal ya está correctamente delegada al motor; solo hacía falta que
el motor recibiera relaciones reales para que esa delegación tuviera
algo que resolver.

---

## Recomendación

1. Tabla nueva `motores_eficiencia.cff_relaciones` — transcripción
   directa de `ESQUEMA_ECONOMIC_RELATION`, con los 2 CHECK condicionales
   que `contratos.js` sí trata como error duro (`containment_scope`
   obligatorio/prohibido según `relation_type`; `direction`
   obligatorio/prohibido según `relation_type`), más FK doble contra
   `cff_event_components` para `component_a_id`/`component_b_id`.
2. `registrar_relacion_cff` — mismo patrón de autenticación/autorización
   que las demás funciones de escritura de `motores_eficiencia`, mismo
   mecanismo `jsonb_populate_record()` con defaults explícitos para
   cualquier columna con `DEFAULT` (aprendizaje ya interiorizado esta
   sesión).
3. `leer_relaciones_cff` — plana, filtrada por
   `organization_id`/`effective_from`/`effective_to`, simétrica a
   `leer_eventos_cff`.
4. Extender `calcularCff`/`calcularCffHandler` para pasar relaciones
   reales en vez de `[]`.

¿Apruebas esta recomendación (incluida la FK doble contra
`cff_event_components`, y la pregunta abierta de lote-vs-fila-única
para `registrar_relacion_cff`) antes de que diseñe el DDL completo?
