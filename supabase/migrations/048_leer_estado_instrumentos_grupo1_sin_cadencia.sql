-- ══════════════════════════════════════════════════════════════════
-- 048 — leer_estado_instrumentos_grupo1: corrige la suposición de
-- cadencia mensual que 047 asumía para ICE-IEH.
--
-- 047 calculaba "completado" como "¿existe fila para (org, persona,
-- MES ACTUAL)?" -- asumía que ICE-IEH se reaplica cada mes. Eso es
-- falso: ICE-IEH es periódico (semestral, anual, a veces trimestral
-- según la organización), y el esquema NO tiene ningún concepto de
-- "ronda de aplicación" (nadie registra cuándo abre o cierra un
-- ciclo) -- no hay forma honesta de calcular "¿ya respondiste en esta
-- ronda?" sin inventar un concepto de ronda que no existe.
--
-- Corrección (decisión de Luis, 2026-09-30): dejar de gatear/bloquear,
-- solo informar. "ultima_respuesta" = el period MÁS RECIENTE con fila
-- para (organization_id, persona_id), SIN filtrar por mes actual --
-- simétrico a como ya se calcula sdmo.ultima_jornada (MAX). El motor
-- nunca bloqueó una segunda respuesta (registrar_respuesta_ice_ieh usa
-- ON CONFLICT ... DO UPDATE, verificado en el Paso 1 original) -- solo
-- la landing lo hacía PARECER bloqueado. 'YYYY-MM' ordena
-- correctamente como texto (MAX funciona igual que con fechas).
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION motores_eficiencia.leer_estado_instrumentos_grupo1(
  p_codigo text
) RETURNS jsonb
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
DECLARE
  v_org_id    uuid;
  v_persona   text;
  v_period    text;
  v_jornada   date;
BEGIN
  SELECT organization_id, persona_id INTO v_org_id, v_persona
  FROM motores_eficiencia.invitaciones_cuestionario
  WHERE codigo = p_codigo AND activa;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'código de invitación inválido o inactivo';
  END IF;

  SELECT max(period) INTO v_period
  FROM motores_eficiencia.ice_ieh_respuestas
  WHERE organization_id = v_org_id AND persona_id = v_persona;

  SELECT max(jornada) INTO v_jornada
  FROM motores_eficiencia.sdmo_respuestas
  WHERE organization_id = v_org_id AND persona_id = v_persona;

  RETURN jsonb_build_object(
    'ice_ieh', jsonb_build_object('ultima_respuesta', v_period),
    'sdmo', jsonb_build_object('ultima_jornada', v_jornada)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION motores_eficiencia.leer_estado_instrumentos_grupo1(text) TO anon;

-- Blindaje de cierre (memoria: toda función nueva en motores_eficiencia
-- termina con esto) -- reafirma el REVOKE general, no lo reemplaza.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA motores_eficiencia FROM PUBLIC;

-- ══════════════════════════════════════════════════════════════════
-- Verificación esperada tras aplicar (los 3 casos, con período variado
-- -- NO solo el mes actual, para probar de verdad que no hay filtro)
-- 1. Código sin ninguna respuesta -> ice_ieh.ultima_respuesta = null.
-- 2. Código con UNA respuesta de hace 6 meses (no el mes actual) ->
--    ultima_respuesta = ESE período, no null -- confirma que no filtra
--    por mes actual.
-- 3. Código con varias respuestas en distintos períodos -> devuelve el
--    MÁS RECIENTE, no el primero ni el mes actual si no es el más nuevo.
-- 4. Código inexistente/inactivo -> RAISE EXCEPTION, no un jsonb vacío.
-- 5. anon/public: anon SÍ ejecuta (Patrón A), public NO.
-- ══════════════════════════════════════════════════════════════════
