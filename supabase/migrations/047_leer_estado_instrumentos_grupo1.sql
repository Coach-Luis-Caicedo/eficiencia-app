-- ══════════════════════════════════════════════════════════════════
-- 047 — leer_estado_instrumentos_grupo1: estado de ICE-IEH/SDMO por
-- código de invitación, para la landing compartida (instrumentos.html).
--
-- Patrón A (034:14-17) -- idéntico al de registrar_respuesta_ice_ieh/
-- registrar_respuesta_sdmo: rol anon, SECURITY DEFINER, el código
-- resuelve identidad server-side, el cliente nunca manda
-- organization_id/persona_id. Quien llama es la persona respondiendo,
-- sin sesión de consultor -- verificado antes de construir esto
-- (leer_respuestas_ice_ieh/leer_respuestas_sdmo de 035 son Patrón B,
-- authenticated, no sirven aquí).
--
-- "Completado" de ICE-IEH es MENSUAL, no permanente (decisión de Luis,
-- 2026-09-30, corrige la premisa original del encargo) -- la tabla ya se
-- usa de forma recurrente mes a mes (src/worker.js calcularAieHandler lee
-- ice_ieh_respuestas por período para la trayectoria de AIE/IAO). Se
-- calcula el período actual EXACTAMENTE como periodoActual() en
-- cuestionario_ice_ieh.html:329 (mes actual, 'YYYY-MM') y se consulta
-- existencia de fila para (organization_id, persona_id, ese período) --
-- no "alguna vez". El CHECK de 032 (_respuestas_ice_ieh_validas) ya
-- garantiza que si la fila existe, tiene las 31 respuestas -- no hace
-- falta contar, "existe fila" ya es "completo".
--
-- SDMO no tiene noción de "completo" -- ultima_jornada = MAX(jornada)
-- para esa persona+organización, o NULL si nunca registró.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION motores_eficiencia.leer_estado_instrumentos_grupo1(
  p_codigo text
) RETURNS jsonb
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
DECLARE
  v_org_id    uuid;
  v_persona   text;
  v_periodo   text := to_char(now(), 'YYYY-MM');
  v_completo  boolean;
  v_jornada   date;
BEGIN
  SELECT organization_id, persona_id INTO v_org_id, v_persona
  FROM motores_eficiencia.invitaciones_cuestionario
  WHERE codigo = p_codigo AND activa;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'código de invitación inválido o inactivo';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM motores_eficiencia.ice_ieh_respuestas
    WHERE organization_id = v_org_id AND persona_id = v_persona AND period = v_periodo
  ) INTO v_completo;

  SELECT max(jornada) INTO v_jornada
  FROM motores_eficiencia.sdmo_respuestas
  WHERE organization_id = v_org_id AND persona_id = v_persona;

  RETURN jsonb_build_object(
    'ice_ieh', jsonb_build_object('completado', v_completo, 'period', v_periodo),
    'sdmo', jsonb_build_object('ultima_jornada', v_jornada)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION motores_eficiencia.leer_estado_instrumentos_grupo1(text) TO anon;

-- Blindaje de cierre (memoria: toda función nueva en motores_eficiencia
-- termina con esto) -- reafirma el REVOKE general de 034/038, no lo
-- reemplaza.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA motores_eficiencia FROM PUBLIC;

-- ══════════════════════════════════════════════════════════════════
-- Verificación esperada tras aplicar (los 3 casos acordados)
-- 1. Código sin ninguna respuesta -> {"ice_ieh":{"completado":false,...},
--    "sdmo":{"ultima_jornada":null}}.
-- 2. Código con ICE-IEH completo del mes actual, SDMO sin registrar ->
--    ice_ieh.completado=true, sdmo.ultima_jornada=null.
-- 3. Código con ambos con datos -> ice_ieh.completado=true,
--    sdmo.ultima_jornada = la fecha más reciente registrada.
-- 4. Código inexistente o inactivo -> RAISE EXCEPTION, no un jsonb vacío.
-- 5. anon/public: anon SÍ ejecuta (Patrón A), public NO.
-- ══════════════════════════════════════════════════════════════════
