# Auditoría — estado real de Supabase y qué necesitarían persistir los 7 motores + 4 arneses

Fecha: 2026-09-14. **Cero código, cero migraciones.** Solo mapeo y
recomendación, verificado contra las migraciones reales
(`supabase/migrations/`) y contra los contratos de entrada ya verificados
esta sesión (fixtures reales de `motor-piio`, `motor-iao`, `motor-cff`).

---

## 1. Estado actual de Supabase, verificado

### 1.1 Lista completa — 28 migraciones, 20 tablas, una numeración con un hueco

`ls supabase/migrations/` da 001-024, 026-029 — **falta 025** en la
secuencia. No se investigó la causa (podría ser un número saltado a
propósito, una migración descartada antes de aplicarse, o un archivo
perdido) — se deja como hallazgo, no como hecho explicado.

`grep -rn "CREATE TABLE" supabase/migrations/*.sql` da exactamente estas
20 tablas (excluyendo el comentario de prueba en 004):

| # | Tabla | Migración |
|---|---|---|
| 1 | `organizaciones` | 001 |
| 2 | `consultores` | 001 |
| 3 | `consultor_organizacion` | 001 |
| 4 | `invitaciones_individuales` | 001 |
| 5 | `respuestas_cuestionario` | 001 |
| 6 | `respuestas_cuestionario_pares` | 001 |
| 7 | `respuestas_sdmo` | 001 |
| 8 | `log_acceso_confidencial` | 001 |
| 9 | `areas_organizacion` | 006 |
| 10 | `contactos_organizacion` | 006 |
| 11 | `invitaciones_fpv` | 008 |
| 12 | `respuestas_fpv` | 008 |
| 13 | `cff_historial` | 014 |
| 14 | `calibracion_parametros` | 020 |
| 15 | `calibracion_observaciones` | 020 |
| 16 | `seguimiento_kpi_config` | 026 |
| 17 | `seguimiento_area_observaciones` | 026 |
| 18 | `seguimiento_rollup_log` | 026 |

(18 nombres únicos — 20 `CREATE TABLE` porque 2 son duplicados de
`calibracion_*`/`seguimiento_*` contados una vez cada uno; la tabla de
arriba ya está deduplicada.)

### 1.2 Legacy vs. referencia/calibración — separadas, con una corrección a la premisa de la pregunta

**Las 18 tablas son, sin excepción, del sistema legacy en producción**
(`organizaciones` como entidad ancla, cuestionarios viejos, FPV viejo,
SDMO viejo, CFF v1 en producción, seguimiento PIIO viejo). No hay
ninguna tabla que sea "solo datos de referencia" separada del sistema
operativo.

**Corrección a la premisa de la pregunta:** el ejemplo que se dio
(`017_benchmark_rotacion_por_sector.sql`) **no crea ninguna tabla**.
Verificado leyendo el archivo completo: los 3 benchmarks de rotación por
sector se embeben como **constantes dentro de la función
`_calcular_cff_interno()`** (`CREATE OR REPLACE FUNCTION`), no como filas
de una tabla de referencia consultable. Hoy **no existe infraestructura de
"tabla de datos de referencia"** en este proyecto — cuando ha hecho falta
un valor de referencia, se ha hardcodeado dentro de una función.

**Nota aparte, con matiz — `calibracion_parametros`/`calibracion_observaciones`
(020):** son legacy (sirven al CFF/IFT ya en producción, corrigen un bug
de doble-shrinkage de `workbook.html`), pero `calibracion_observaciones`
tiene una forma estructuralmente relevante para lo que viene: **"formato
largo, una fila por organización-período-parámetro"** (cita literal del
comentario de la migración) — el mismo tipo de forma (organización ×
período × valor) que un motor nuevo necesitaría para sus propias
observaciones. No es reutilizable directamente (semántica distinta,
tabla legacy), pero es un precedente real de que ese patrón de diseño ya
se usó y funciona en esta misma base de datos.

**Nombres que pueden confundir — aclarados explícitamente:** `respuestas_sdmo`
(001) y `invitaciones_fpv`/`respuestas_fpv` (008) son las versiones
**viejas** de SDMO (4 preguntas) y FPV — **no** sirven a `motor-sdmo` ni a
`motor-fpv` (los motores nuevos, ya completos en sus propias ramas, nunca
integrados). Mismo patrón ya documentado en memoria del proyecto ("el FPV
viejo en producción NO es fuente"). Cualquier tabla nueva para los
motores nuevos necesita nombres que no colisionen ni se confundan con
estas.

### 1.3 ¿Algo ya anticipa los 7 motores nuevos? — verificado con `grep`, no asumido

```
grep -rniE "node_id|period_start|kpi_state|efo_state|domain_state|
  phenomenon_state|piio_run|node_hierarchy|calculation_version|
  reference_spec|metric_definition|evidence_group" supabase/migrations/*.sql
```

**Cero resultados.** Ninguno de los conceptos reales de los motores
nuevos (verificados contra los propios contratos que usamos esta sesión)
aparece en ninguna migración. No hay nada parcial, ni abandonado, ni
anticipado — el terreno está genuinamente vacío.

### 1.4 ¿Soporta el proyecto múltiples schemas? — matiz real, no un sí/no plano

**Crear un schema adicional es DDL estándar de Postgres, disponible en
cualquier plan de Supabase** — no encontré nada en el repo que lo
restrinja, y no es una limitación real del producto (confirmado por
conocimiento del producto, no por un archivo de config que no existe en
este repo: no hay `supabase/config.toml`).

**El matiz real está en el acceso, no en la creación:** todas las 18
tablas viven en `public`, y **cada función `SECURITY DEFINER` del
proyecto fija `SET search_path = public` explícitamente** (verificado:
aparece en prácticamente cada migración). Supabase expone por defecto,
vía su API REST (PostgREST/`supabase-js`), **solo los schemas
listados en "Exposed schemas"** (Settings → API del dashboard) — un
schema nuevo no aparece ahí automáticamente. **Esto no lo puedo verificar
sin acceso al dashboard.**

**Pero hay una salida que ya es el patrón establecido de este proyecto,
y que evita depender de esa configuración por completo:** como TODO el
acceso a datos ya pasa por funciones `SECURITY DEFINER` en `public`
(nunca por tablas expuestas directamente vía REST), un schema nuevo
puede quedar **sin exponer en absoluto** — se accede exclusivamente a
través de funciones `public.algo(...)` que internamente hacen referencia
al schema nuevo (`SET search_path = public, eficiencia_motores` o
calificando `eficiencia_motores.tabla` explícitamente). Mismo patrón
exacto que ya usa todo el sistema legacy, cero necesidad de tocar la
configuración de API expuesta.

---

## 2. Qué necesitaría cada motor para persistir

Basado en los contratos de entrada **ya verificados con fixtures reales**
esta sesión (no inventados para este documento).

| Motor/arnés | Entidades que necesitaría | Evidencia (contrato verificado) |
|---|---|---|
| `motor-ice-ieh` | Respuesta por Persona-Período (31 valores) | `motor-ice-ieh.calcular({P1..P31})` — un momento, una persona |
| `motor-iao` | Igual que arriba (consume la salida de ICE-IEH) + agrupación Persona→Nodo por período | `agregarOrganizacion([{id, personas:[...]}, ...])` — verificado esta sesión al construir `motor-integracion-iao-aie` |
| `motor-sdmo` | Respuesta por Persona-Período (ACU/COM/INV/PEN) + agrupación Persona→Organización por período | `calcularSerieOrganizacionalIDA(datosPorPeriodo, opts)` — verificado en `685d140` |
| `motor-fpv` | Respuesta por Posición (Consumidor/Inversionista/Proveedor) × Organización × Período, 9 ítems | Sin nodo — memoria: "sin índice global" |
| `motor-cff` | `CFF_EVENT` (organización, nodo, dominio, mecanismo, monto) + `NODE_HIERARCHY` propio (`{node_id, parent_id}`) | Reapertura Fase 3, citada en el diseño del arnés `EFO` esta sesión |
| `motor-ifd` | `EPD_INPUT` (atribución categórica, ligado a eventos CFF) | `runEPD`, memoria del proyecto |
| `motor-piio` | El más rico: `organization_id`, `periods[]`, `domain_catalog`, `phenomenon_catalog`, `metric_definitions`, `references[]` (con vigencia `valid_from`/`valid_to`), `node_hierarchy[]` (propio, más rico que el de CFF), `kpi_specs[]`, `evidence_groups[]`, **`observations[]`** (la serie real: `kpi_id`, `node_id`, `period_start/end`, `value`, `numerator`, `denominator`, `quality_status`) + `piio_run_id`/`calculation_version` (genealogía de corridas) | Fixture real usado esta sesión (`runPIIO.test.js`, reutilizado en los smoke-tests de la reapertura y del arnés `EFO`↔`AIE`) |
| Arnés `EFO`↔`AIE` | Nada nuevo — reutiliza el `PIIO_INPUT` completo de `motor-piio` | `motor-integracion-piio-aie/pipeline.js`, esta sesión |
| Arnés `CFG`↔`AIE` (`motor-iao`) | Nada nuevo — reutiliza la agrupación Persona→Nodo de `motor-iao` | `motor-integracion-iao-aie/pipeline.js`, esta sesión |
| Arnés `DYN`↔`AIE` (`motor-sdmo`) | Nada nuevo — reutiliza `datosPorPeriodo` de `motor-sdmo` | `685d140` |
| Arnés `motor-piio`→`motor-cff`/`motor-ifd` (Fase 12c) | Nada nuevo — el adaptador solo necesita que `CFF_EVENT`/`EPD_INPUT` lleven `phenomenon_id`/`node_id`/`period` para trazabilidad, ya cubiertos arriba | `integracion_cff_ifd.test.js` |

### Entidad compartida real, señalada explícitamente — `NODE_HIERARCHY`

**No es la misma entidad en `motor-cff` y en `motor-piio` — verificado
contra el código real de ambos, no asumido por el nombre:**

```
motor-cff  (nodos.js):        { node_id, parent_id }
motor-piio (runPIIO.test.js):  { node_id, node_type, active_from,
                                 aggregation_membership, scope_rules,
                                 version, parent_node_id }
```

`motor-piio` lleva tipo de nodo, fecha de activación, reglas de alcance
(`ORGANIZATIONAL`/`SEGMENT_ONLY`) y versión — `motor-cff` solo el árbol de
parentesco. **No son la misma tabla con nombres distintos — una es un
subconjunto estructural de la otra, pero no idéntico** (los nombres de
campo del puntero al padre ya difieren: `parent_id` vs. `parent_node_id`).
Diseñar una sola tabla `nodos` hoy, sin resolver esto primero,
**produciría una tabla que ninguno de los dos motores podría consumir tal
cual** — necesitaría una vista o una función de proyección por motor, y
esa decisión (¿la tabla base es la forma rica de PIIO con una vista
reducida para CFF, o dos tablas con una relación 1:1?) es una decisión de
diseño real, no un detalle de migración.

**`organización`** es la única entidad genuinamente compartida por los 7
motores sin ambigüedad — y ya existe (`public.organizaciones.id`,
`uuid`). Cualquier tabla nueva puede referenciarla con una FK cruzando de
schema (estándar en Postgres, sin restricción de plan).

**Ningún otro motor tiene concepto de nodo/jerarquía en su propio
contrato** (`motor-iao`/`motor-sdmo` reciben agrupaciones ya armadas por
el llamante, sin jerarquía; `motor-fpv` no tiene nodo en absoluto) — la
tensión de `NODE_HIERARCHY` es específicamente entre `motor-cff` y
`motor-piio`, no un problema de los 7.

---

## 3. Decisión ya tomada — schema separado, mismo proyecto de Supabase

Construida en el diseño, no vuelta a poner en duda: las tablas nuevas
viven en un schema de Postgres separado, dentro del mismo proyecto de
Supabase — sin tocar ninguna tabla ni migración legacy. Verificado que
esto es técnicamente viable sin restricciones (§1.4) y que el patrón de
acceso exclusivo-por-función ya establecido por el propio proyecto evita
cualquier fricción con la configuración de API expuesta.

---

## 4. Recomendación de alcance

### Nombre del schema: `motores_eficiencia`

No `piio_v2` (el schema serviría a los 7 motores, no solo a PIIO) ni
`eficiencia_motores` (invierte el orden habitual sustantivo-adjetivo del
resto del proyecto en español — `organizaciones`, `areas_organizacion`,
`seguimiento_area_observaciones` — `motores_eficiencia` es más consistente
con esa convención). Sin punto ni versión en el nombre — versionar
dentro del schema (tablas con sufijo o columna `version`) si hace falta,
no en el nombre del schema mismo.

### Qué se puede diseñar YA, sin esperar al piloto

Verificable con lo que ya existe, sin adivinar la forma correcta:

1. **`motores_eficiencia.nodos`** (o el nombre que se decida) —
   **CONDICIONADO a resolver primero la tensión CFG/PIIO de la sección 2**.
   No se diseña la tabla todavía — se deja como pregunta abierta
   explícita, tal como se pidió. (Ver más abajo.)
2. **Tablas de configuración relativamente estáticas de `motor-piio`**
   (`domain_catalog`, `phenomenon_catalog`, `metric_definitions`,
   `kpi_specs`, `evidence_groups`) — su forma ya está completamente
   verificada (23/17/20/etc. campos oficiales, cerrados desde hace
   semanas, cero cambios en las últimas fases). Diseñarlas ahora no es
   adivinar — es transcribir un contrato ya cerrado.
3. **`observations`** (la tabla que crece cada período, el corazón de
   `motor-piio`) — la FORMA de cada fila (`kpi_id`, `node_id`,
   `period_start/end`, `value`, `numerator`, `denominator`,
   `quality_status`, `source_id`) ya está verificada contra fixtures
   reales usados repetidamente esta sesión. Se puede diseñar ya.
4. **`references`** — igual, forma ya cerrada (incluye `valid_from`/
   `valid_to`, `threshold`, `admissibility_declared` — todos campos ya
   verificados en las reaperturas de Fase 0/3/5 de `motor-piio`).
5. **`piio_run`/genealogía de corridas** (`calculation_version`,
   `parent_calculation_version`) — ya tiene precedente de diseño completo
   en `runPIIOCompleto()`/`rebasarHistoria` — transcribir esa forma no es
   adivinar.

### Qué debe esperar al primer dato real

1. **La entidad `nodos` compartida** — no se puede resolver por
   diseño sin más: hace falta decidir si `motor-cff` consume una
   proyección de la tabla rica de `motor-piio`, o si son dos tablas con
   relación 1:1, y esa decisión se entiende mejor viendo cómo luce la
   jerarquía de una organización piloto real (¿cuántos niveles? ¿el
   `NODE_HIERARCHY` simple de CFF alcanza en la práctica, o la
   organización real necesita `scope_rules`/`aggregation_membership`
   desde el primer día?).
2. **`motor-cff`/`motor-ifd`** (`CFF_EVENT`/`EPD_INPUT`) — a diferencia
   de `motor-piio`, no se construyó ni se verificó ningún fixture
   completo de estos dos contratos esta sesión (solo el adaptador de
   Fase 12c, que toca identificación, no la forma completa del evento
   económico) — diseñar sus tablas ahora sería adivinar más de lo que se
   verificó.
3. **`motor-fpv`** — el oráculo de este motor es una tabla de estrés
   verificada a mano (§10), no un motor de referencia — no hay ningún
   fixture de entrada real ensayado esta sesión ni en las anteriores del
   mismo tipo que `motor-piio`.
4. **La política de multi-nodo** para los arneses `CFG`/`EFO`↔`AIE`
   (ya señalada como pregunta abierta en `DISENO_ARNES_PIIO_AIE.md` §3) —
   una tabla de nodos sin esa política resuelta serviría de poco.
5. **Cuál "unidad" corresponde a qué** en el sentido del `N` mínimo del
   piloto (`CHECKLIST_ACTIVACION_PILOTO_AIE.md`) — orgnización completa
   vs. nodo — afecta directamente cómo se puebla cualquier tabla de
   observaciones, no solo su forma.

### La entidad compartida que necesita resolverse primero como decisión de diseño

Dicho explícito, como se pidió: **`NODE_HIERARCHY`/nodos no se puede
convertir en una tabla única hoy sin fingir una resolución que no existe.**
No se propone aquí ni la versión rica de PIIO como única, ni dos tablas
separadas — ambas son decisiones reales con trade-offs (una tabla rica
con proyecciones es menos duplicación pero más acoplamiento; dos tablas
es más simple por motor pero duplica el concepto de "quién es el padre de
quién"). Se trae la tensión, no una respuesta fingida.

---

No se tocó ninguna tabla, ninguna migración, ni se creó ningún schema en
este documento — solo lectura y verificación, para que los tres decidan
con evidencia antes de tocar Supabase.

---

## 5. Regla permanente — `REVOKE EXECUTE` en funciones nuevas (agregado 2026-09-19)

**El `ALTER DEFAULT PRIVILEGES ... IN SCHEMA <schema> REVOKE EXECUTE ON
FUNCTIONS FROM PUBLIC` no protege nada — verificado por ejecución, no
supuesto.** Confirmado con dos pruebas independientes contra PGlite
(Luis y CC, mismo resultado): tanto la versión que ya trae `029`
(`IN SCHEMA public`, `029:64-65`) como la que trae `034`
(`IN SCHEMA motores_eficiencia`) dejan una función creada después de
ellas con `EXECUTE` a `PUBLIC` = `true`. Causa raíz, según la
documentación oficial de Postgres: *"per-schema default privileges can
only add privileges to the global setting, not remove privileges granted
by it"* [postgresql.org/docs/current/sql-alterdefaultprivileges](https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html)
— la forma `IN SCHEMA ... REVOKE` es estructuralmente incapaz de anular
el default global, sin importar cuántas veces se repita.

**Consecuencia verificada en `029` específicamente**: su "regla por
defecto para funciones futuras" (`029:59-63`, *"sin esto, la próxima
función reabre el gap desde cero"*) nunca cumplió lo que dice — es un
defecto real en una migración ya aplicada en producción. **Sin
consecuencia práctica hasta hoy**: confirmado que ninguna migración
`030`-`034` agregó una función nueva a `public` (todas escriben en
`motores_eficiencia`), así que el hueco es latente, no explotado. No
amerita una migración correctiva de emergencia — sí amerita esta regla
permanente, para que no se reintroduzca en silencio.

**Regla, para toda migración futura, en cualquier schema**: cualquier
migración que agregue una función nueva a `public` o a
`motores_eficiencia` debe terminar con su propio
`REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA <schema> FROM PUBLIC`
inmediato — esa es la única sentencia que de verdad protege (confirmado:
sí funciona, cierra el `EXECUTE` a `PUBLIC` de todas las funciones
existentes en el schema al momento de correr). El bloque
`ALTER DEFAULT PRIVILEGES` per-schema no se usa — no es una protección
más débil, es una sentencia que no hace nada, y dejarla sugiere una
garantía hacia el futuro que no existe. (Una versión global de
`ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS
FROM PUBLIC`, sin `IN SCHEMA`, sí protege hacia adelante — pero afecta a
cualquier función que el rol `postgres` cree en cualquier schema del
proyecto, incluidos los internos de Supabase; no evaluada como segura
aquí, queda como opción disponible, no como recomendación —
ver `DISENO_WORKER_EJECUCION_MOTORES.md` para el detalle completo de esta
verificación.)

---

## 6. Procedimiento — aplicar una migración vía Supabase CLI (agregado 2026-09-22)

Hasta la migración `041`, cada migración se aplicó pegando el `.sql`
manualmente en el SQL Editor del dashboard de Supabase (Luis). A partir
de `042` se usó el CLI (`supabase db query --linked -f <archivo>`,
ejecutado por CC) — primera vez en esta sesión. Deja registrado el
procedimiento para no tener que redescubrir la misma precaución la
próxima vez.

**Paso obligatorio antes de aplicar nada — verificar el estado del
historial remoto**:

```
supabase link --project-ref kapxcjehfaasttwfnnzq   # una vez, si no está linkeado
supabase migration list                             # SOLO lectura -- no aplica nada
```

Si la columna `Remote` aparece **vacía para todas las migraciones**
(como fue el caso, confirmado 2026-09-22: `001`-`042` sin ninguna
marcada del lado remoto), significa que el historial de migraciones del
CLI (`supabase_migrations.schema_migrations`) nunca se usó — todo se
aplicó a mano, fuera de ese mecanismo de tracking. **En ese estado,
`supabase db push` es peligroso**: intentaría reaplicar TODA la
secuencia desde `001`, fallando en cascada contra tablas que ya existen
(en el mejor caso, un error ruidoso; no evaluado qué tan limpio es el
rollback de un `db push` fallido a mitad de camino — no se probó).

**La alternativa segura, usada en `042`**: `supabase db query --linked
-f <archivo>` ejecuta el contenido de un único archivo `.sql` contra la
base de datos remota (vía Management API), **sin tocar la tabla de
historial de migraciones en absoluto** — ni la lee ni la escribe. Aplica
exactamente ese archivo, nada más, nada menos. Es el equivalente en
CLI de "pegar el `.sql` en el SQL Editor", solo que automatizado.

**Regla para la próxima migración**: repetir `supabase migration list`
antes de aplicar (confirmar que el estado sigue siendo "todo manual, remoto
vacío" — si en algún punto alguien corre `supabase db push` o `supabase
migration repair`, ese supuesto deja de ser válido y hay que
reverificar, no asumir que sigue igual). Nunca usar `db push` mientras
el historial remoto esté vacío y la aplicación siga siendo manual/por
archivo individual — usar siempre `db query --linked -f`.
