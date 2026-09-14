-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 031: NODE_HIERARCHY, Ruta A (tabla rica +
-- vista reducida para motor-cff).
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- ── Contexto — DISEÑO PRELIMINAR, NO DEFINITIVO ──
--
-- Aplica la Ruta A recomendada en DISENO_EJERCICIO_NODE_HIERARCHY.md:
-- una jerarquía sintética inventada (no derivada de ningún dato real) se
-- usó como banco de pruebas para comparar Ruta A (tabla rica de
-- `motor-piio` + vista reducida para `motor-cff`) contra Ruta B (dos
-- tablas 1:1) — Ruta A ganó por tener una sola fuente de verdad y menor
-- superficie de escritura al reparentar un nodo. **Esa recomendación es
-- PROVISIONAL, sujeta a confirmación con la primera jerarquía REAL del
-- piloto** — si el piloto revela que `motor-cff` y `motor-piio` necesitan
-- conjuntos de nodos genuinamente irreconciliables (no solo nombres de
-- columna distintos), esta migración puede resultar equivocada y requerir
-- migrar a Ruta B — trabajo real, no un ajuste de nombres.
--
-- No se diseña "la forma típica" de una jerarquía organizacional — cada
-- organización tiene su propio árbol, ya resuelto por `organization_id` +
-- `parent_node_id`. El ejercicio solo presionó el diseño con crecimiento
-- de niveles y un reparenting sintéticos.
--
-- Esta migración NO modifica `030_schema_motores_eficiencia.sql` (ya
-- aplicada/aprobada) — es aditiva, numerada después.
-- ══════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════
-- 1. Tabla rica — forma de motor-piio (ESQUEMA_NODE_SPEC, contratos.js:358-369)
--
-- Histórica por diseño: PK incluye `version` porque el propósito de Ruta A
-- es poder registrar un cambio de padre (o de cualquier otro campo) como
-- una fila NUEVA con `active_from` nuevo, cerrando `active_to` de la fila
-- anterior — mismo criterio de append-only que `reference_specs` (030),
-- justificado aquí por la necesidad real de conservar historia de
-- reparenting, no solo de vigencia de referencias.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE motores_eficiencia.node_hierarchy (
  organization_id           uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  node_id                   text NOT NULL,
  parent_node_id            text,             -- NULL = raíz. SIN FK — ver nota "parent_node_id sin FK" más abajo.
  node_type                 text NOT NULL,
  active_from               text NOT NULL CHECK (motores_eficiencia._es_periodo_valido(active_from)),
  active_to                 text CHECK (active_to IS NULL OR motores_eficiencia._es_periodo_valido(active_to)),
  aggregation_membership    text NOT NULL,
  scope_rules               jsonb NOT NULL,   -- { scope: 'ORGANIZATIONAL'|'SEGMENT_ONLY', ... } — ver hallazgo #1 abajo
  version                   text NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, node_id, version),

  -- Hallazgo #2 (activo) — mismo CHECK que config.js:validarJerarquiaNodos
  -- ya hace en memoria (NODO_FECHAS_INVALIDAS, severidad DEGRADED, no
  -- bloquea la corrida). Aquí se aplica como CHECK duro — MÁS ESTRICTO que
  -- el motor real a propósito: `motor-piio` hoy deja pasar una jerarquía
  -- con fechas invertidas (solo la marca), la base de datos no. Es una
  -- decisión consciente de esta migración, no una réplica del motor.
  CHECK (active_to IS NULL OR active_from < active_to),

  -- scope_rules.scope, si está presente, debe ser un valor válido de SCOPE
  -- (enums.js) — motor-piio/nodos.js:_scopeDeNodo ya default-ea a
  -- SEGMENT_ONLY si el campo falta o es inválido; el CHECK solo rechaza un
  -- valor presente pero incorrecto, no exige que esté.
  CHECK ((scope_rules->>'scope') IS NULL OR (scope_rules->>'scope') IN ('ORGANIZATIONAL', 'SEGMENT_ONLY'))
);

-- Hallazgo #3 (activo) — a diferencia de motor-piio/config.js
-- (`indexarPorClave` sobrescribe silenciosamente si dos filas comparten
-- `node_id`), esta migración decide fallar explícito, mismo criterio que
-- motor-cff/nodos.js (`_validarJerarquia`, lanza si el mismo node_id
-- aparece dos veces). MÁS ESTRICTO que el motor-piio actual a propósito —
-- no es una réplica de su comportamiento permisivo, es la decisión
-- consciente de esta migración de que dos versiones "vigentes" del mismo
-- nodo al mismo tiempo es un estado inválido, no algo que resolver en
-- silencio. Implementado como índice único PARCIAL (no una restricción
-- UNIQUE simple, que rompería el propósito histórico de la tabla — ver
-- comentario de la tabla arriba): solo puede existir UNA fila "vigente"
-- (active_to IS NULL) por (organization_id, node_id); cualquier número de
-- filas HISTÓRICAS (active_to ya cerrado) del mismo node_id sigue permitido.
CREATE UNIQUE INDEX idx_node_hierarchy_vigente_unico
  ON motores_eficiencia.node_hierarchy (organization_id, node_id)
  WHERE active_to IS NULL;

CREATE INDEX idx_node_hierarchy_padre
  ON motores_eficiencia.node_hierarchy (organization_id, parent_node_id);

COMMENT ON TABLE motores_eficiencia.node_hierarchy IS
  'NODE_SPEC (§25.4) — transcrita de contratos.js:ESQUEMA_NODE_SPEC. Histórica '
  '(PK incluye version); DISEÑO PRELIMINAR (DISENO_EJERCICIO_NODE_HIERARCHY.md), '
  'sujeto a confirmación con la primera jerarquía real del piloto.';

-- `parent_node_id` sin FK — un FK real necesitaría expresar "la versión
-- VIGENTE del padre", y Postgres no permite un FOREIGN KEY hacia una vista
-- filtrada (node_hierarchy_vigente, más abajo) ni hacia una condición
-- parcial de la propia tabla. Mismo hueco ya señalado, sin resolver, en
-- DISENO_EJERCICIO_NODE_HIERARCHY.md §3.1. La integridad referencial del
-- padre la valida hoy motor-piio/config.js:validarJerarquiaNodos
-- (NODO_PADRE_COLGANTE) en memoria, no esta migración.

-- ══════════════════════════════════════════════════════════════════
-- 2. Vista "vigente" — UNA fila por node_id, la actualmente activa.
--
-- Hallazgo #2 (decisión) — SÍ, esta migración decide filtrar por vigencia
-- a nivel de VISTA, no en la tabla rica (que preserva todas las versiones
-- históricas a propósito). Es el mecanismo que evita el bug real
-- encontrado en motor-piio/config.js:indexarPorClave (sobrescritura
-- silenciosa si `node_hierarchy` trae más de una fila por node_id):
-- cualquier consumidor —motor-piio incluido, el día que se integre— debe
-- leer de ESTA vista, no de la tabla cruda, para recibir garantizado una
-- sola fila por node_id.
--
-- PREGUNTA ABIERTA, explícita, NO resuelta aquí: este filtro es
-- "vigente HOY" (active_to IS NULL) — NO cubre una corrida retroactiva de
-- motor-piio contra el estado de la jerarquía en un período pasado (eso
-- exigiría una función parametrizada por período, no una vista plana).
-- No se construye esa función aquí porque no hay todavía un caso de uso
-- real verificado que la necesite — mismo criterio de "no fabricar sin
-- evidencia" del resto de esta migración.
-- ══════════════════════════════════════════════════════════════════
CREATE VIEW motores_eficiencia.node_hierarchy_vigente AS
SELECT organization_id, node_id, parent_node_id, node_type, active_from,
       aggregation_membership, scope_rules, version
FROM motores_eficiencia.node_hierarchy
WHERE active_to IS NULL;

COMMENT ON VIEW motores_eficiencia.node_hierarchy_vigente IS
  'Una fila por node_id — la vigente (active_to IS NULL). Filtra "hoy", NO '
  'soporta corridas retroactivas (pregunta abierta, ver comentario arriba). '
  'Consumidor previsto: motor-piio, el día que se integre — no leer '
  'node_hierarchy directamente si puede haber más de una versión por nodo.';

-- ══════════════════════════════════════════════════════════════════
-- 3. Vista reducida para motor-cff — SOLO node_id/parent_id, alias explícito.
--
-- Hallazgo #1 (documentado, NO resuelto por esta vista) — motor-cff
-- deriva su propio SEGMENT/LEAF_ONLY/AGGREGATE_ONLY geométricamente de qué
-- nodeSet se le consulta (motor-cff/nodos.js:clasificarAlcance), ajeno a
-- `scope_rules.scope` de motor-piio (declarativo, con efecto real en la
-- cascada — motor-piio/nodos.js:_scopeDeNodo, INV-47/AC47). Esta vista NO
-- expone `scope_rules` — no porque lo esconda a propósito, sino porque
-- motor-cff no tiene ningún campo en su forma nativa `{node_id, parent_id}`
-- donde ese valor pudiera vivir. La asimetría sigue existiendo tal cual
-- estaba documentada en DISENO_EJERCICIO_NODE_HIERARCHY.md §1.4/§3.5 —
-- esta vista ni la agrava ni la resuelve, solo no finge resolverla.
--
-- Se construye sobre node_hierarchy_vigente (no sobre la tabla cruda) para
-- que motor-cff nunca reciba dos filas con el mismo node_id — su propio
-- `_validarJerarquia` lanzaría si eso ocurriera; el filtro de vigencia
-- evita que eso dependa de la suerte del orden de filas.
-- ══════════════════════════════════════════════════════════════════
CREATE VIEW motores_eficiencia.node_hierarchy_cff_view AS
SELECT
  organization_id,
  node_id,
  parent_node_id AS parent_id       -- alias obligatorio — motor-cff exige literalmente "parent_id"
FROM motores_eficiencia.node_hierarchy_vigente;

COMMENT ON VIEW motores_eficiencia.node_hierarchy_cff_view IS
  'Forma nativa de motor-cff ({node_id, parent_id}) sobre node_hierarchy_vigente. '
  'NO expone scope_rules — motor-cff no tiene ese concepto (hallazgo #1, sin '
  'resolver a propósito, ver comentario arriba). DISEÑO PRELIMINAR.';

-- ══════════════════════════════════════════════════════════════════
-- Acceso — mismo patrón cerrado que 030
-- ══════════════════════════════════════════════════════════════════
REVOKE ALL ON motores_eficiencia.node_hierarchy FROM PUBLIC;
REVOKE ALL ON motores_eficiencia.node_hierarchy_vigente FROM PUBLIC;
REVOKE ALL ON motores_eficiencia.node_hierarchy_cff_view FROM PUBLIC;

-- ══════════════════════════════════════════════════════════════════
-- Verificación sugerida tras aplicar (mismo criterio que 030)
-- ══════════════════════════════════════════════════════════════════
-- 1. SELECT table_name FROM information_schema.tables WHERE table_schema =
--    'motores_eficiencia' AND table_name = 'node_hierarchy';        → 1 fila
-- 2. SELECT table_name FROM information_schema.views WHERE table_schema =
--    'motores_eficiencia' ORDER BY 1;  → node_hierarchy_cff_view,
--    node_hierarchy_vigente (además de las 8 tablas de 030, sin vistas)
-- 3. Insertar 2 filas con el mismo (organization_id, node_id) y
--    active_to NULL en ambas → debe fallar por idx_node_hierarchy_vigente_unico
--    (hallazgo #3, verificado).
-- 4. Insertar una fila con active_from > active_to → debe fallar por el
--    CHECK de fechas (hallazgo #2, verificado).
-- 5. Confirmar que `anon`/`authenticated` NO tienen acceso a ninguna de
--    las 3 (tabla + 2 vistas) — igual que el resto de motores_eficiencia.
