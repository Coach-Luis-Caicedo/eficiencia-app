-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 036: motores_eficiencia.cff_casos — los campos
-- de juicio (Categoría 2) que runCFF() exige y que ninguna tabla
-- anterior provee.
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- Transcribe DISENO_SOBRE_CASO_CFF.md §2/§4 (Opción B, aprobada), con
-- las 3 confirmaciones de Luis:
--   1. node_set: NULL = default mecánico (todas las hojas bajo node_raiz,
--      motor-cff/nodos.js:hojasBajo) — explícito solo si se acota a un
--      SEGMENT deliberado.
--   2. reporting_currency: DEFAULT 'COP' — decisión de ALCANCE DEL PILOTO,
--      no limitación permanente (ver comentario de columna).
--   3. run_status: NO se fuerza la analogía con PIIO (asimetría real,
--      confirmada contra runPIIO.js:371 — construirPIIORun(input, res11a,
--      opciones) recibe el RESULTADO de haber corrido runPIIO ANTES de
--      construir el run — vs. runCFF.js validarCaso(), que exige
--      caso.run_status como INPUT puro, nunca derivado de una ejecución).
--      Enum PROPUESTO aquí (ver comentario de columna) — el documento
--      técnico de CFF no define ninguno (motor-cff/enums.js:89-96,
--      motor-cff/contratos.test.js:41, confirmado, no se fabrica sin
--      decirlo).
--
-- Los campos de Categoría 1 (run_id, calculation_version, ruleset_version,
-- calculated_at, generated_at, update_reason) NO tienen columna aquí —
-- DISENO_SOBRE_CASO_CFF.md §1.3 ya decidió que construirCFFRun() vive en
-- JS (src/motores/cff.js), mismo patrón que construirPIIORun() (JS
-- puro, no una función SQL) — duplicarlos en esta tabla sería
-- persistir algo que se recalcula en caliente cada vez, mismo criterio
-- ya aplicado a ice_ieh_respuestas (032: "variables NO se persiste,
-- se recalcula al agregar").
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE motores_eficiencia.cff_casos (
  organization_id     uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  cff_case_id         text NOT NULL,

  -- período del caso — mismo helper que motor-piio (030), aplicado aquí
  -- por coherencia con la convención ya establecida para period_start/
  -- period_end (DISENO_INTEGRADO_TABLAS_ENTRADA_5_MOTORES.md §4: CFF ya
  -- comparte esos 2 nombres exactos con motor-piio). NOTA: cff_events
  -- (032, ya aplicada) NO tiene este CHECK — inconsistencia real,
  -- señalada, no corregida aquí (tocar una tabla ya aplicada excede el
  -- alcance de este encargo).
  period_start        text NOT NULL CHECK (motores_eficiencia._es_periodo_valido(period_start)),
  period_end          text NOT NULL CHECK (motores_eficiencia._es_periodo_valido(period_end)),

  -- libre, SIN enum — confirmado explícito en motor-cff/README.md punto 5:
  -- "scope... se valida solo como string, sin forzar el enum ECONOMIC_SCOPE".
  scope               text NOT NULL,

  -- enum real, impulsa consolidarPeriodoYAlcance() -- motor-cff/enums.js:60,
  -- motor-cff/consolidacion.js ("se requiere economicScope (NODE |
  -- BUSINESS_UNIT | ORGANIZATION)").
  economic_scope      text NOT NULL CHECK (economic_scope IN ('NODE', 'BUSINESS_UNIT', 'ORGANIZATION')),

  -- DECISIÓN DE ALCANCE DEL PILOTO, NO LIMITACIÓN PERMANENTE (confirmado
  -- por Luis) — mismo criterio que w_pos=1 (motor-iao) y los GENERICO de
  -- calibración (motor-iao.js): el piloto es 100% Colombia
  -- (organizaciones.pais CHECK IN ('colombia'), migración 011) — sin
  -- fuente de moneda en el esquema hoy. Cuando exista una organización
  -- fuera de Colombia, este DEFAULT deja de ser válido y hace falta
  -- soporte multi-moneda real (columna de moneda en `organizaciones`,
  -- o normalización de tasas de cambio) — no basta con cambiar el
  -- DEFAULT de esta columna.
  reporting_currency  text NOT NULL DEFAULT 'COP',

  -- enum real -- motor-cff/enums.js:48.
  valuation_basis     text NOT NULL CHECK (valuation_basis IN ('NOMINAL', 'REAL')),

  -- SIN FK -- mismo criterio que node_id en 032/030: motor-cff/README.md
  -- confirma que NODE_HIERARCHY (de donde sale node_raiz) es una extensión
  -- de infraestructura, no parte de §22 del documento técnico.
  node_raiz           text NOT NULL,

  -- NULL = default mecánico (Luis, confirmación 1): todas las hojas bajo
  -- node_raiz (motor-cff/nodos.js:hojasBajo(nodeRaiz, nodeHierarchy),
  -- clasificación resultante: LEAF_ONLY, cobertura completa). Explícito
  -- solo si el analista quiere acotar deliberadamente a un SEGMENT
  -- (motor-cff/nodos.js:clasificarAlcance).
  node_set            text[],

  -- 4 booleanos de juicio experto -- motor-cff/cobertura.js:SENALES_OBLIGATORIAS,
  -- nombres EXACTOS (mismo criterio que Q/C/T/R de motor-ifd: "este módulo
  -- NO la infiere", cobertura.js). Los 4 son NOT NULL -- clasificarCobertura()
  -- exige que las 4 sean boolean, no las trata como opcionales.
  cobertura_tratamiento_suficiente        boolean NOT NULL,  -- §20 FULL
  cobertura_depende_estimaciones_debiles  boolean NOT NULL,  -- §20 LIMITED (literal)
  cobertura_asignaciones_limitadas        boolean NOT NULL,  -- §20 LIMITED (literal)
  cobertura_base_defendible               boolean NOT NULL,  -- §20 INSUFFICIENT (negada)

  -- PROPUESTO, no del documento técnico (que no define ninguno --
  -- motor-cff/enums.js:89-96, "RUN_STATUS... deliberadamente NO
  -- registrado... el documento nunca enumera sus valores posibles").
  -- Justificación de este enum específico: NO se copia CALCULATION_STATUS
  -- (eso ya se rechazó explícitamente una vez, motor-cff/README.md punto 1,
  -- "fabricar valores... habría sido inventar alcance") -- se reusa,
  -- en cambio, el enum que YA existe para el mismo NOMBRE de campo
  -- (`run_status`) en el mismo schema (motores_eficiencia.piio_run.run_status,
  -- 030:381, CHECK IN ('COMPLETED','PARTIAL','BLOCKED')) -- mismo campo,
  -- mismo propósito conceptual (estado de una corrida), convención ya
  -- aprobada en este proyecto -- no una invención nueva sin precedente.
  run_status          text NOT NULL CHECK (run_status IN ('COMPLETED', 'PARTIAL', 'BLOCKED')),

  creado_en           timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (organization_id, cff_case_id)
);

COMMENT ON TABLE motores_eficiencia.cff_casos IS
  'Campos de juicio de negocio (Categoría 2, DISENO_SOBRE_CASO_CFF.md §2) '
  'que runCFF(caso) exige y que no viven en ningún evento individual -- '
  'declarados UNA vez por caso, reusados por todos los eventos de ese '
  'caso (cff_events/cff_event_components, 032). Los campos de Categoría 1 '
  '(genealogía de la corrida) NO están aquí -- se ensamblan en JS al '
  'momento de calcular (construirCFFRun(), src/motores/cff.js), mismo '
  'patrón que construirPIIORun() (JS, no SQL).';


-- ══════════════════════════════════════════════════════════════════
-- Acceso — mismo patrón cerrado, REVOKE inmediato (regla permanente,
-- AUDITORIA_SUPABASE_MOTORES.md §5 -- NUNCA ALTER DEFAULT PRIVILEGES
-- per-schema, no protege nada).
-- ══════════════════════════════════════════════════════════════════
REVOKE ALL ON motores_eficiencia.cff_casos FROM PUBLIC;


-- ══════════════════════════════════════════════════════════════════
-- Funciones -- Patrón B (authenticated, consultor_organizacion),
-- mismo estándar que 034/035.
-- ══════════════════════════════════════════════════════════════════

-- registrar_caso_cff — jsonb_populate_record, mismo mecanismo que
-- registrar_evento_cff (034) -- defaults explícitos primero (||  gana
-- la derecha), para que jsonb_populate_record no deje NULL los DEFAULT
-- de columna (hallazgo real de la ronda anterior, ver 034).
CREATE OR REPLACE FUNCTION motores_eficiencia.registrar_caso_cff(
  p_organization_id  uuid,
  p_caso              jsonb
) RETURNS text
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
DECLARE
  v_case_id text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'no autenticado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE consultor_id = auth.uid() AND organizacion_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'no autorizado — el consultor no está asignado a esta organización';
  END IF;

  INSERT INTO motores_eficiencia.cff_casos
  SELECT (jsonb_populate_record(
            NULL::motores_eficiencia.cff_casos,
            jsonb_build_object('reporting_currency', 'COP', 'creado_en', now())
              || p_caso
              || jsonb_build_object('organization_id', p_organization_id)
          )).*
  RETURNING cff_case_id INTO v_case_id;

  RETURN v_case_id;
END;
$$;
GRANT EXECUTE ON FUNCTION motores_eficiencia.registrar_caso_cff(uuid, jsonb) TO authenticated;
COMMENT ON FUNCTION motores_eficiencia.registrar_caso_cff(uuid, jsonb) IS
  'DISENO_SOBRE_CASO_CFF.md §4, Opción B. p_caso trae los campos de '
  'Categoría 2 con las claves EXACTAS de las columnas de cff_casos '
  '(snake_case) -- el remapeo a las claves camelCase que runCFF() exige '
  '(economicScope, nodeRaiz) vive en src/motores/cff.js, no aquí.';


-- leer_node_hierarchy_cff — NO estaba en el encargo de esta ronda, pero
-- es un bloqueo real y directo para el objetivo explícito de esta ronda
-- (que calcularCff() arme sobreCaso completo, no lo exija como parámetro
-- externo): consolidarPeriodoYAlcance() exige nodeHierarchy
-- (motor-cff/consolidacion.js, "se requieren nodeHierarchy (array),
-- nodeSet (array) y nodeRaiz"), y node_hierarchy_cff_view (031) --
-- la vista construida específicamente con la forma {node_id, parent_id}
-- que motor-cff exige -- está tan cerrada a PUBLIC como todo lo demás
-- (031: "REVOKE ALL ON motores_eficiencia.node_hierarchy_cff_view FROM
-- PUBLIC"). Sin esta función, cff_casos por sí sola no alcanza para que
-- calcularCff() corra de punta a punta -- se agrega aquí, señalada
-- explícita como una adición mía, no un ítem que Luis haya pedido por
-- nombre.
CREATE OR REPLACE FUNCTION motores_eficiencia.leer_node_hierarchy_cff(
  p_organization_id  uuid
) RETURNS SETOF motores_eficiencia.node_hierarchy_cff_view
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'no autenticado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE consultor_id = auth.uid() AND organizacion_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'no autorizado — el consultor no está asignado a esta organización';
  END IF;

  RETURN QUERY
  SELECT * FROM motores_eficiencia.node_hierarchy_cff_view
  WHERE organization_id = p_organization_id;
END;
$$;
GRANT EXECUTE ON FUNCTION motores_eficiencia.leer_node_hierarchy_cff(uuid) TO authenticated;
COMMENT ON FUNCTION motores_eficiencia.leer_node_hierarchy_cff(uuid) IS
  'Expone node_hierarchy_cff_view (031) -- forma {node_id, parent_id} '
  'exacta que consolidarPeriodoYAlcance() exige. Agregada en esta '
  'migración porque calcularCff() no puede correr sin ella -- no estaba '
  'en el encargo original de 036, es un prerrequisito real descubierto '
  'al conectar el resto.';


-- leer_caso_cff — plana, SETOF directo.
CREATE OR REPLACE FUNCTION motores_eficiencia.leer_caso_cff(
  p_organization_id  uuid,
  p_cff_case_id       text
) RETURNS SETOF motores_eficiencia.cff_casos
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'no autenticado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE consultor_id = auth.uid() AND organizacion_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'no autorizado — el consultor no está asignado a esta organización';
  END IF;

  RETURN QUERY
  SELECT * FROM motores_eficiencia.cff_casos
  WHERE organization_id = p_organization_id AND cff_case_id = p_cff_case_id;
END;
$$;
GRANT EXECUTE ON FUNCTION motores_eficiencia.leer_caso_cff(uuid, text) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- Cierre del mismo hallazgo de 028/029/034/035 -- REVOKE EXECUTE
-- inmediato, ÚNICO mecanismo real (AUDITORIA_SUPABASE_MOTORES.md §5).
-- ══════════════════════════════════════════════════════════════════
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA motores_eficiencia FROM PUBLIC;


-- ══════════════════════════════════════════════════════════════════
-- Nota explícita, NO resuelta aquí, fuera de alcance de este encargo
-- ══════════════════════════════════════════════════════════════════
-- cff_events (032, ya aplicada) NO tiene columna cff_case_id -- no hay
-- FK que ligue un evento a un caso declarado. DISENO_SOBRE_CASO_CFF.md
-- §4 (Opción B) propuso esa FK como parte del diseño ideal
-- ("registrar_evento_cff pasaría a exigir... FK compuesta") -- NO se
-- implementa en esta migración porque exigiría ALTER TABLE sobre una
-- tabla ya aplicada en producción, que este encargo no autorizó
-- explícitamente. Consecuencia real, sin resolver: hoy nada impide
-- registrar eventos CFF sin que exista un cff_casos correspondiente, ni
-- viceversa -- la relación es solo por convención (mismo organization_id/
-- period), no forzada por la base de datos. Señalado para que Luis
-- decida si amerita una migración aparte.


-- ══════════════════════════════════════════════════════════════════
-- Verificación sugerida tras aplicar
-- ══════════════════════════════════════════════════════════════════
-- 1. SELECT table_name FROM information_schema.tables
--    WHERE table_schema='motores_eficiencia' AND table_name='cff_casos'; → 1 fila.
-- 2. SELECT routine_name, grantee FROM information_schema.role_routine_grants
--    WHERE routine_schema='motores_eficiencia' AND routine_name IN
--    ('registrar_caso_cff','leer_caso_cff') ORDER BY 1,2;
--    → cada una con 'authenticated' + 'postgres', CERO 'PUBLIC'.
-- 3. Con un consultor real: registrar un caso, leerlo de vuelta, y
--    confirmar reporting_currency='COP' aunque no se haya mandado.
-- 4. Insertar con economic_scope inválido / valuation_basis inválido /
--    run_status inválido -- cada uno debe fallar por su CHECK.
