-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 034: 9 funciones de escritura para las tablas
-- de ice-ieh/sdmo/fpv/cff/ifd/Comité/remediación (030-033).
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- Transcribe DISENO_FUNCIONES_ESCRITURA_MOTORES_PENDIENTES.md §3-§5,
-- con dos ajustes por decisión de Luis: (a) registrar_respuesta_sdmo
-- recibe p_jornada date, no p_period text (033, sdmo ya no tiene
-- concepto de período); (b) se agregan las 2 funciones generadoras de
-- invitación (generar_invitaciones_cuestionario/_fpv) que ese documento
-- había señalado como prerrequisito sin construir.
--
-- Patrón: exactamente los 2 ya existentes en el sistema legacy (ver
-- DISEÑO §0) — Patrón A (anon, código de invitación resuelve identidad,
-- nunca se confía en lo que mande el cliente) para las 3 funciones de
-- respuesta; Patrón B (authenticated, auth.uid() + consultores +
-- consultor_organizacion) para las 6 restantes. search_path incluye
-- motores_eficiencia además de public en las 9 — ya anticipado
-- textualmente en 030:399-403.
-- ══════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════
-- 1. generar_invitaciones_cuestionario — Patrón B + generación de códigos
--
-- Distinto del generador legacy (generar_invitaciones_individuales,
-- 001:257-282, que crea códigos EN BLANCO): aquí persona_id/node_id se
-- fijan al generar, no se autorreportan al responder (justificado en el
-- header de 033 — evita la deriva que areas_organizacion existe para
-- prevenir). p_asignaciones = [{persona_id, node_id}, ...].
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION motores_eficiencia.generar_invitaciones_cuestionario(
  p_organization_id  uuid,
  p_asignaciones      jsonb
) RETURNS TABLE (persona_id text, node_id text, codigo text)
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

  IF p_asignaciones IS NULL OR jsonb_array_length(p_asignaciones) = 0 THEN
    RAISE EXCEPTION 'p_asignaciones no puede estar vacío';
  END IF;

  RETURN QUERY
  INSERT INTO motores_eficiencia.invitaciones_cuestionario (organization_id, persona_id, node_id)
  SELECT p_organization_id, a->>'persona_id', a->>'node_id'
  FROM jsonb_array_elements(p_asignaciones) AS a
  RETURNING invitaciones_cuestionario.persona_id, invitaciones_cuestionario.node_id, invitaciones_cuestionario.codigo;
END;
$$;

GRANT EXECUTE ON FUNCTION motores_eficiencia.generar_invitaciones_cuestionario(uuid, jsonb) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- 2. generar_invitaciones_fpv — mismo patrón, con `posicion` fija en
-- vez de `node_id`. p_asignaciones = [{persona_id, posicion}, ...].
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION motores_eficiencia.generar_invitaciones_fpv(
  p_organization_id  uuid,
  p_asignaciones      jsonb
) RETURNS TABLE (persona_id text, posicion text, codigo text)
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

  IF p_asignaciones IS NULL OR jsonb_array_length(p_asignaciones) = 0 THEN
    RAISE EXCEPTION 'p_asignaciones no puede estar vacío';
  END IF;

  RETURN QUERY
  INSERT INTO motores_eficiencia.invitaciones_fpv (organization_id, persona_id, posicion)
  SELECT p_organization_id, a->>'persona_id', a->>'posicion'
  FROM jsonb_array_elements(p_asignaciones) AS a
  RETURNING invitaciones_fpv.persona_id, invitaciones_fpv.posicion, invitaciones_fpv.codigo;
END;
$$;

GRANT EXECUTE ON FUNCTION motores_eficiencia.generar_invitaciones_fpv(uuid, jsonb) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- 3. registrar_respuesta_ice_ieh — Patrón A, contra invitaciones_cuestionario
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION motores_eficiencia.registrar_respuesta_ice_ieh(
  p_codigo      text,
  p_respuestas  jsonb,
  p_period      text
) RETURNS void
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
DECLARE
  v_org_id  uuid;
  v_persona text;
  v_node    text;
BEGIN
  SELECT organization_id, persona_id, node_id INTO v_org_id, v_persona, v_node
  FROM motores_eficiencia.invitaciones_cuestionario
  WHERE codigo = p_codigo AND activa;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'código de invitación inválido o inactivo';
  END IF;

  INSERT INTO motores_eficiencia.ice_ieh_respuestas
    (organization_id, persona_id, period, node_id, respuestas)
  VALUES (v_org_id, v_persona, p_period, v_node, p_respuestas)
  ON CONFLICT (organization_id, persona_id, period) DO UPDATE
    SET respuestas = EXCLUDED.respuestas;
END;
$$;

GRANT EXECUTE ON FUNCTION motores_eficiencia.registrar_respuesta_ice_ieh(text, jsonb, text) TO anon;


-- ══════════════════════════════════════════════════════════════════
-- 4. registrar_respuesta_sdmo — Patrón A, contra invitaciones_cuestionario
-- (misma tabla que ice-ieh — DISEÑO §1). p_jornada date, NO p_period —
-- corrección de Luis (033): el parámetro deja de ser "temporal mientras
-- se decide el formato" porque para SDMO el formato ya se decidió.
-- Las 4 dimensiones son nullable — replica §2.8 (no-respuesta parcial
-- NUNCA se imputa), el cliente puede omitir cualquiera.
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION motores_eficiencia.registrar_respuesta_sdmo(
  p_codigo   text,
  p_acu      smallint,
  p_com      smallint,
  p_inv      smallint,
  p_pen      smallint,
  p_jornada  date
) RETURNS void
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
DECLARE
  v_org_id  uuid;
  v_persona text;
  v_node    text;
BEGIN
  SELECT organization_id, persona_id, node_id INTO v_org_id, v_persona, v_node
  FROM motores_eficiencia.invitaciones_cuestionario
  WHERE codigo = p_codigo AND activa;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'código de invitación inválido o inactivo';
  END IF;

  INSERT INTO motores_eficiencia.sdmo_respuestas
    (organization_id, persona_id, jornada, node_id, acu, com, inv, pen)
  VALUES (v_org_id, v_persona, p_jornada, v_node, p_acu, p_com, p_inv, p_pen)
  ON CONFLICT (organization_id, persona_id, jornada) DO UPDATE
    SET acu = EXCLUDED.acu, com = EXCLUDED.com, inv = EXCLUDED.inv, pen = EXCLUDED.pen;
END;
$$;

GRANT EXECUTE ON FUNCTION motores_eficiencia.registrar_respuesta_sdmo(text, smallint, smallint, smallint, smallint, date) TO anon;


-- ══════════════════════════════════════════════════════════════════
-- 5. registrar_respuesta_fpv — Patrón A, contra invitaciones_fpv.
-- `posicion` sale de la invitación, NUNCA del cliente (evita que alguien
-- reporte F/P/V bajo una posición que no le corresponde).
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION motores_eficiencia.registrar_respuesta_fpv(
  p_codigo  text,
  p_f       text,
  p_p       text,
  p_v       text,
  p_period  text,
  p_peso    numeric DEFAULT NULL
) RETURNS void
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
DECLARE
  v_org_id   uuid;
  v_persona  text;
  v_posicion text;
BEGIN
  SELECT organization_id, persona_id, posicion INTO v_org_id, v_persona, v_posicion
  FROM motores_eficiencia.invitaciones_fpv
  WHERE codigo = p_codigo AND activa;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'código de invitación inválido o inactivo';
  END IF;

  INSERT INTO motores_eficiencia.fpv_respuestas
    (organization_id, persona_id, posicion, period, f, p, v, peso)
  VALUES (v_org_id, v_persona, v_posicion, p_period, p_f, p_p, p_v, p_peso)
  ON CONFLICT (organization_id, persona_id, posicion, period) DO UPDATE
    SET f = EXCLUDED.f, p = EXCLUDED.p, v = EXCLUDED.v, peso = EXCLUDED.peso;
END;
$$;

GRANT EXECUTE ON FUNCTION motores_eficiencia.registrar_respuesta_fpv(text, text, text, text, text, numeric) TO anon;


-- ══════════════════════════════════════════════════════════════════
-- 6. registrar_evento_cff — Patrón B, transaccional (evento + N
-- componentes en una sola función = una sola transacción, gratis por
-- ser plpgsql — DISEÑO §3). p_event/p_components son jsonb con las
-- claves EXACTAS de las columnas de cff_events/cff_event_components
-- (032) — jsonb_populate_record() mapea campo a campo; organization_id/
-- event_id se inyectan server-side con `||`, sobrescribiendo cualquier
-- valor que el cliente hubiera mandado para esas 2 claves.
--
-- Hallazgo real (encontrado por ejecución contra PGlite, no por
-- lectura, en 2 rondas): jsonb_populate_record() NO aplica NINGÚN
-- DEFAULT de columna cuando la clave falta en el jsonb — ni los de
-- array (source_ids/flags/input_variables/dependency_refs 'DEFAULT {}'),
-- NI `creado_en timestamptz DEFAULT now()`. Dejaría NULL en todos esos
-- casos y el INSERT fallaría por NOT NULL. Se antepone un
-- jsonb_build_object() con TODOS los defaults reales de cada tabla
-- (032), que el jsonb del cliente sobrescribe si SÍ trae la clave
-- (orden de `||`: los defaults van primero, ganan las claves de la
-- derecha) — la única forma confiable de usar jsonb_populate_record()
-- contra una tabla con columnas DEFAULT, verificado por ejecución.
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION motores_eficiencia.registrar_evento_cff(
  p_organization_id  uuid,
  p_event             jsonb,
  p_components         jsonb
) RETURNS text
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
DECLARE
  v_event_id text;
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

  IF p_components IS NULL OR jsonb_array_length(p_components) = 0 THEN
    RAISE EXCEPTION 'un evento CFF requiere al menos un componente (contratos.js: components no puede estar vacío)';
  END IF;

  INSERT INTO motores_eficiencia.cff_events
  SELECT (jsonb_populate_record(
            NULL::motores_eficiencia.cff_events,
            jsonb_build_object('source_ids', '[]'::jsonb, 'flags', '[]'::jsonb, 'creado_en', now())
              || p_event
              || jsonb_build_object('organization_id', p_organization_id)
          )).*
  RETURNING event_id INTO v_event_id;

  INSERT INTO motores_eficiencia.cff_event_components
  SELECT (jsonb_populate_record(
            NULL::motores_eficiencia.cff_event_components,
            jsonb_build_object('input_variables', '[]'::jsonb, 'dependency_refs', '[]'::jsonb,
                                'flags', '[]'::jsonb, 'creado_en', now())
              || comp
              || jsonb_build_object('organization_id', p_organization_id, 'event_id', v_event_id)
          )).*
  FROM jsonb_array_elements(p_components) AS comp;

  RETURN v_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION motores_eficiencia.registrar_evento_cff(uuid, jsonb, jsonb) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- 7. registrar_epd_ifd — Patrón B, mismo mecanismo jsonb_populate_record
-- que registrar_evento_cff (tabla plana, sin hijos). Mismo ajuste de
-- default explícito para double_count_ids ('[]' — NOT NULL DEFAULT en
-- ifd_epd, 032) por el mismo motivo encontrado en registrar_evento_cff.
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION motores_eficiencia.registrar_epd_ifd(
  p_organization_id  uuid,
  p_epd               jsonb
) RETURNS text
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
DECLARE
  v_epd_id text;
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

  INSERT INTO motores_eficiencia.ifd_epd
  SELECT (jsonb_populate_record(
            NULL::motores_eficiencia.ifd_epd,
            jsonb_build_object('double_count_ids', '[]'::jsonb, 'creado_en', now())
              || p_epd
              || jsonb_build_object('organization_id', p_organization_id)
          )).*
  RETURNING epd_id INTO v_epd_id;

  RETURN v_epd_id;
END;
$$;

GRANT EXECUTE ON FUNCTION motores_eficiencia.registrar_epd_ifd(uuid, jsonb) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- 8. agregar_miembro_comite — Patrón B. Cierra DISEÑO_INTEGRADO...§6.3
-- hueco 1 (sin camino de escritura post-creación).
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION motores_eficiencia.agregar_miembro_comite(
  p_organization_id  uuid,
  p_rol               text,
  p_nombre             text,
  p_cargo               text DEFAULT NULL
) RETURNS uuid
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
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

  IF p_rol NOT IN ('coordinador', 'miembro') THEN
    RAISE EXCEPTION 'rol inválido: % (debe ser coordinador o miembro)', p_rol;
  END IF;

  IF p_nombre IS NULL OR trim(p_nombre) = '' THEN
    RAISE EXCEPTION 'el nombre es obligatorio';
  END IF;

  INSERT INTO motores_eficiencia.comite_eficiencia (organization_id, rol, nombre, cargo)
  VALUES (p_organization_id, p_rol, trim(p_nombre), NULLIF(trim(coalesce(p_cargo, '')), ''))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION motores_eficiencia.agregar_miembro_comite(uuid, text, text, text) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- 9. registrar_remediacion_autorizada — Patrón B. La FK compuesta hacia
-- comite_eficiencia (032) ya garantiza que p_decidido_por sea un
-- miembro real DE ESTA organización — el chequeo de
-- consultor_organizacion de abajo es el que falta: quién puede INVOCAR
-- la función, no qué dato es válido (DISEÑO §4.2).
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION motores_eficiencia.registrar_remediacion_autorizada(
  p_organization_id  uuid,
  p_motor             text,
  p_decidido_por       uuid,
  p_node_id             text DEFAULT NULL,
  p_motivo_fpv           text DEFAULT NULL,
  p_notas                 text DEFAULT NULL
) RETURNS uuid
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
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

  INSERT INTO motores_eficiencia.remediacion_autorizada
    (organization_id, motor, decidido_por, node_id, motivo_fpv, notas)
  VALUES (p_organization_id, p_motor, p_decidido_por, p_node_id, p_motivo_fpv, p_notas)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION motores_eficiencia.registrar_remediacion_autorizada(uuid, text, uuid, text, text, text) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- Cierre del mismo hallazgo que 028/029 — EXECUTE a PUBLIC por defecto,
-- ahora en `motores_eficiencia` (memoria: "Hallazgo: GRANT PUBLIC en
-- funciones — RESUELTO: migraciones 028/029"). Postgres otorga EXECUTE
-- a PUBLIC en cada CREATE FUNCTION por defecto (029:14-16) — 029 solo
-- corrigió el schema `public`, porque `motores_eficiencia` no existía
-- todavía. Sin este bloque, las 9 funciones de arriba quedarían
-- alcanzables por PUBLIC (que incluye a cualquier rol, no solo
-- anon/authenticated) exactamente por el mismo mecanismo ya encontrado
-- una vez en este proyecto — se cierra aquí, no se reabre por descuido.
-- Los GRANT EXECUTE explícitos a anon/authenticated de arriba son
-- entradas de ACL independientes — no los afecta este REVOKE (029:47-49).
-- ══════════════════════════════════════════════════════════════════
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA motores_eficiencia FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA motores_eficiencia
REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;


-- ══════════════════════════════════════════════════════════════════
-- Verificación sugerida tras aplicar
-- ══════════════════════════════════════════════════════════════════
-- 1. SELECT routine_name FROM information_schema.routines
--    WHERE routine_schema = 'motores_eficiencia' ORDER BY 1;   → 9 funciones.
-- 2. SELECT routine_name, grantee, privilege_type FROM information_schema.role_routine_grants
--    WHERE routine_schema = 'motores_eficiencia' ORDER BY 1, 2;
--    → 3 filas con grantee='anon' (las de respuesta), 6 con grantee='authenticated'.
-- 3. Con un consultor real autenticado: generar 1 invitación de cada
--    tipo, luego llamar registrar_respuesta_* con anon usando el código
--    devuelto — debe insertar. Repetir con un código inventado — debe
--    fallar "código de invitación inválido o inactivo".
-- 4. Intentar registrar_remediacion_autorizada/agregar_miembro_comite/
--    registrar_evento_cff/registrar_epd_ifd desde un consultor NO
--    asignado a la organización — debe fallar "no autorizado".
