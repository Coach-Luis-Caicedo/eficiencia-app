# Diseño — migración `042`, cierre de la brecha `relaciones` en CFF

**Estado: diseño, para aprobación. Cero DDL aplicado todavía.** Cierra
`PENDIENTES_BRECHAS_WORKER_MOTORES.md` §2, sobre la base de
`INVESTIGACION_RELACIONES_CFF.md` (aprobada, incluida la verificación
final de las 3 citas de enums pendientes). Decisiones ya confirmadas por
Luis: FK doble contra `cff_event_components`, y `registrar_relacion_cff`
en **lote** (no fila única).

---

## 0. Tabla `motores_eficiencia.cff_relaciones`

Transcripción directa de `ESQUEMA_ECONOMIC_RELATION`
(`motor-cff/contratos.js:375-389`), con los 2 `CHECK` condicionales que
`reglasCondicionalesEconomicRelation` (`contratos.js:391-412`) trata
como error duro — mismo criterio de replicación selectiva que
`cff_event_components` (`032`) ya aplicó (solo las reglas duras, no
todo el validador JS). FK doble contra `cff_event_components` para que
`component_a_id`/`component_b_id` no puedan apuntar a un componente
inexistente — ambos referencian la misma clave única real
(`PRIMARY KEY (organization_id, component_id)`, `032:268`).

```sql
CREATE TABLE motores_eficiencia.cff_relaciones (
  organization_id          uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  relation_id               text NOT NULL,
  component_a_id             text NOT NULL,
  component_b_id              text NOT NULL,
  relation_type                text NOT NULL CHECK (relation_type IN
                                  ('INDEPENDENT','DUPLICATE','CONTAINS','ALTERNATIVE_VALUATION','DEPENDENT_COST','UNKNOWN')), -- enums.js:45
  direction                     text,  -- condicional, ver CHECK abajo — NUNCA leído por el motor en tiempo de ejecución
                                        -- (INVESTIGACION_RELACIONES_CFF.md §2), persistido solo porque el contrato lo exige
  effective_from                 text NOT NULL,
  effective_to                    text NOT NULL,
  containment_scope                text CHECK (containment_scope IS NULL OR containment_scope IN
                                  ('FULL','PARTIAL_QUANTIFIED','PARTIAL_UNQUANTIFIED')), -- enums.js:46, condicional
  quantified_overlap_value          numeric,
  selected_primary                   text,
  resolution_status                   text NOT NULL CHECK (resolution_status IN
                                  ('RESOLVED','PARTIALLY_RESOLVED','UNRESOLVED','INVALID')), -- enums.js:39
  resolution_method                    text NOT NULL,  -- vocabulario abierto, no enumerado — contratos.js:388
  rationale                             text NOT NULL,
  version                                text NOT NULL,
  creado_en                              timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (organization_id, relation_id),
  FOREIGN KEY (organization_id, component_a_id) REFERENCES motores_eficiencia.cff_event_components (organization_id, component_id),
  FOREIGN KEY (organization_id, component_b_id) REFERENCES motores_eficiencia.cff_event_components (organization_id, component_id),

  -- contratos.js:404-406: containment_scope obligatorio SOLO si CONTAINS
  CHECK (
    (relation_type <> 'CONTAINS' OR containment_scope IS NOT NULL)
    AND (relation_type = 'CONTAINS' OR containment_scope IS NULL)
  ),

  -- contratos.js:407-410: direction obligatorio si relación dirigida
  -- (CONTAINS/DEPENDENT_COST), prohibido si DUPLICATE (simétrica);
  -- INDEPENDENT/ALTERNATIVE_VALUATION/UNKNOWN quedan sin restricción
  -- (contrato no las clasifica en ninguno de los dos grupos)
  CHECK (
    (relation_type NOT IN ('CONTAINS','DEPENDENT_COST') OR direction IS NOT NULL)
    AND (relation_type <> 'DUPLICATE' OR direction IS NULL)
  )
);

CREATE INDEX idx_cff_relaciones_effective
  ON motores_eficiencia.cff_relaciones (organization_id, effective_from, effective_to);
CREATE INDEX idx_cff_relaciones_component_a
  ON motores_eficiencia.cff_relaciones (organization_id, component_a_id);
CREATE INDEX idx_cff_relaciones_component_b
  ON motores_eficiencia.cff_relaciones (organization_id, component_b_id);

COMMENT ON TABLE motores_eficiencia.cff_relaciones IS
  'ECONOMIC_RELATION (§22.5) — transcrita de motor-cff/contratos.js:375-389, '
  'ESQUEMA_ECONOMIC_RELATION. Los 2 CHECK replican reglasCondicionalesEconomicRelation() '
  '(contratos.js:391-412) -- las únicas 2 que ese validador trata como error duro. '
  'direction se persiste porque el contrato lo exige/prohibe condicionalmente, pero '
  'ningún archivo de motor-cff lo lee para resolver nada (INVESTIGACION_RELACIONES_CFF.md §2) '
  '-- mismo patrón que phenomenon_catalog.valid_from/valid_to en motor-piio.';

REVOKE ALL ON motores_eficiencia.cff_relaciones FROM PUBLIC;
```

---

## 1. `registrar_relaciones_cff` — EN LOTE, upsert

Mismo patrón atómico que `registrar_observaciones_piio` (`041`) —
lote vía `jsonb_array_elements`, una fila mal formada revierte el lote
completo, el llamante trocea si hace falta. Upsert (`ON CONFLICT ...
DO UPDATE`) porque una relación puede declararse primero con
`resolution_status='UNRESOLVED'` y actualizarse más tarde a
`RESOLVED`/`selected_primary` sin cambiar de identidad — mismo criterio
que `observations` (una observación corregida se re-envía con el mismo
`observation_id`).

```sql
CREATE OR REPLACE FUNCTION motores_eficiencia.registrar_relaciones_cff(
  p_organization_id  uuid,
  p_relaciones         jsonb
) RETURNS SETOF text
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'no autenticado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM consultor_organizacion
    WHERE consultor_id = auth.uid() AND organizacion_id = p_organization_id)
  THEN RAISE EXCEPTION 'no autorizado — el consultor no está asignado a esta organización'; END IF;

  IF p_relaciones IS NULL OR jsonb_array_length(p_relaciones) = 0 THEN
    RAISE EXCEPTION 'p_relaciones no puede estar vacío';
  END IF;

  RETURN QUERY
  INSERT INTO motores_eficiencia.cff_relaciones
  SELECT (jsonb_populate_record(
    NULL::motores_eficiencia.cff_relaciones,
    jsonb_build_object('creado_en', now())
      || r || jsonb_build_object('organization_id', p_organization_id)
  )).*
  FROM jsonb_array_elements(p_relaciones) AS r
  ON CONFLICT (organization_id, relation_id) DO UPDATE SET
    component_a_id = EXCLUDED.component_a_id, component_b_id = EXCLUDED.component_b_id,
    relation_type = EXCLUDED.relation_type, direction = EXCLUDED.direction,
    effective_from = EXCLUDED.effective_from, effective_to = EXCLUDED.effective_to,
    containment_scope = EXCLUDED.containment_scope, quantified_overlap_value = EXCLUDED.quantified_overlap_value,
    selected_primary = EXCLUDED.selected_primary, resolution_status = EXCLUDED.resolution_status,
    resolution_method = EXCLUDED.resolution_method, rationale = EXCLUDED.rationale, version = EXCLUDED.version
  RETURNING relation_id;
END;
$$;
```

Nota: `cff_relaciones` no tiene ninguna columna `NOT NULL DEFAULT`
además de `creado_en` (a diferencia de `domain_catalog`/
`phenomenon_catalog`/`kpi_specs`/`evidence_groups`/`observations`) —
`source_ids`/`flags`-equivalentes no existen en este contrato. El único
default a suplir en el `jsonb_build_object` inicial es `creado_en`.

---

## 2. `leer_relaciones_cff` — plana, simétrica a `leer_eventos_cff`

`ECONOMIC_RELATION` no tiene hijos (a diferencia de `CFF_EVENT` →
`components[]`) — lectura plana, mismo criterio que `leer_epd_ifd`.
Scope por `organization_id` + rango de período, sobre
`effective_from`/`effective_to` — mismo criterio que
`leer_eventos_cff` usa sobre `period_start`/`period_end`.

```sql
CREATE OR REPLACE FUNCTION motores_eficiencia.leer_relaciones_cff(
  p_organization_id uuid, p_period_start text, p_period_end text
) RETURNS SETOF motores_eficiencia.cff_relaciones
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'no autenticado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM consultor_organizacion
    WHERE consultor_id = auth.uid() AND organizacion_id = p_organization_id)
  THEN RAISE EXCEPTION 'no autorizado — el consultor no está asignado a esta organización'; END IF;

  RETURN QUERY
  SELECT * FROM motores_eficiencia.cff_relaciones
  WHERE organization_id = p_organization_id
    AND effective_from <= p_period_end AND effective_to >= p_period_start;
END;
$$;
```

**Nota sobre el filtro de rango**: uso solapamiento (`effective_from <=
p_period_end AND effective_to >= p_period_start`), no contención exacta
como `leer_eventos_cff` (que exige `period_start >= p_period_start AND
period_end <= p_period_end`, contención total). Razón: una relación
declarada con vigencia amplia (p. ej. `effective_from='2026-01'`,
`effective_to='2026-12'`) debe aplicar a un caso CFF de un solo mes
dentro de ese rango — exigir contención total la excluiría
incorrectamente. Esto es una decisión de diseño explícita, no una
réplica ciega de `leer_eventos_cff` — señalada para tu revisión.

---

## 3. Grants + revoke blanket

```sql
GRANT EXECUTE ON FUNCTION motores_eficiencia.registrar_relaciones_cff(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION motores_eficiencia.leer_relaciones_cff(uuid, text, text) TO authenticated;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA motores_eficiencia FROM PUBLIC;
```

---

## 4. Cambios en código (no-SQL) — mismo round, después de aplicar el DDL

**`src/motores/cff.js`** — `calcularCff` gana un parámetro nuevo:

```js
function calcularCff(eventosConComponentes, casoDeclarado, nodeHierarchy, relacionesCrudas, organizationId, periods, opciones) {
  ...
  const caso = Object.assign(
    {},
    sobreCasoDeclarado,
    genealogia,
    { nodeHierarchy: nodeHierarchy, eventos: eventosConSenales, relaciones: relacionesCrudas || [] }
  );
  return runCFF(caso);
}
```

`relacionesCrudas || []` como resguardo defensivo (no falla si algún
caller viejo no lo pasa), no porque se espere que ocurra — todo caller
real se actualiza en el mismo round.

**`src/worker.js`** (`calcularCffHandler`) — nueva llamada RPC, mismos
argumentos de período que `leer_eventos_cff`:

```js
const relaciones = await rpc(env, jwt, 'leer_relaciones_cff', { p_organization_id: organization_id, p_period_start: caso.period_start, p_period_end: caso.period_end });
return Response.json(calcularCff(eventos, caso, nodeHierarchy, relaciones, organization_id, [caso.period_start], opts || {}));
```

**Orden de parámetros elegido** (`eventos, caso, nodeHierarchy,
relaciones, ...`): inserta `relaciones` inmediatamente después de
`nodeHierarchy` — agrupa los 2 insumos "de contexto compartido, no
específicos de un evento" (`nodeHierarchy` y `relaciones` conectan
componentes/nodos entre sí) antes de los parámetros de identidad/opciones
(`organizationId`, `periods`, `opciones`). Señalado para tu revisión —
es una elección de legibilidad, no algo que el motor exija.

---

## 5. Verificación planeada

Mismo estándar que `041`: `pglite` bajo `SET ROLE authenticated` real,
aplicando `030`, `032`, `034` (para `cff_events`/`cff_event_components`/
`registrar_evento_cff`, insumo para poblar componentes de prueba antes
de poder declarar relaciones sobre ellos), y `042` nuevo. Casos a cubrir:
- `registrar_relaciones_cff` en lote (≥2 relaciones en una llamada).
- Upsert: misma `relation_id`, segunda llamada actualiza
  `resolution_status`/`selected_primary`, confirma 1 sola fila.
- Los 2 `CHECK` condicionales — un caso que los viole cada uno
  (`containment_scope` presente con `relation_type<>'CONTAINS'`;
  `direction` ausente con `relation_type='CONTAINS'`), esperando
  rechazo.
- FK doble — un `component_a_id`/`component_b_id` inexistente, esperando
  rechazo por violación de FK.
- `leer_relaciones_cff` — solapamiento de rango (relación de vigencia
  amplia, lectura de un período contenido adentro).
- Privilegios: `PUBLIC` sin `EXECUTE`, `authenticated` con `EXECUTE`, en
  las 2 funciones nuevas.
- Autorización: rechazo sin `auth.uid()`, rechazo para consultor no
  asignado.

¿Apruebas este diseño completo (tabla, las 2 funciones, y los cambios de
`cff.js`/`worker.js`) para que construya el DDL real y corra la
verificación?
