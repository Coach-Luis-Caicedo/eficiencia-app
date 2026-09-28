-- ══════════════════════════════════════════════════════════════════
-- 046 — notificado_en en invitaciones_cuestionario + marcar_invitacion_notificada
--
-- Cierra DISENO_ENVIO_INVITACIONES_BREVO.md §1. NULL = invitación creada
-- pero el correo de aviso no se ha enviado (o el envío falló). No indica
-- que la persona ya respondió -- eso se consulta en
-- ice_ieh_respuestas/sdmo_respuestas por separado, igual que hoy.
--
-- Solo invitaciones_cuestionario (ICE-IEH/SDMO) -- invitaciones_fpv tiene
-- el mismo hueco estructural (sin email, sin notificado_en) pero queda
-- fuera de esta ronda: el encargo fue explícito sobre ICE-IEH/SDMO
-- (PENDIENTES_BRECHAS_WORKER_MOTORES.md §16, "fuera de alcance").
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE motores_eficiencia.invitaciones_cuestionario
  ADD COLUMN notificado_en timestamptz;

COMMENT ON COLUMN motores_eficiencia.invitaciones_cuestionario.notificado_en IS
  'NULL = invitación creada pero el correo de aviso no se ha enviado (o el '
  'envío falló). Se llena con now() cuando el Worker confirma un envío '
  'exitoso a Brevo, vía marcar_invitacion_notificada(). No indica que la '
  'persona ya respondió -- para eso se consulta '
  'ice_ieh_respuestas/sdmo_respuestas por separado, igual que hoy.';

-- Habilita "reenviar pendientes" (WHERE notificado_en IS NULL) a escala
-- sin escanear toda la tabla -- mismo criterio de índice parcial que
-- idx_invitaciones_cuestionario_codigo (033: ... WHERE activa).
CREATE INDEX idx_invitaciones_cuestionario_pendientes
  ON motores_eficiencia.invitaciones_cuestionario (organization_id)
  WHERE notificado_en IS NULL;

-- ══════════════════════════════════════════════════════════════════
-- marcar_invitacion_notificada — Patrón B (authenticated + consultor_
-- organizacion), idéntico al resto de 034. Identifica por `codigo`
-- (único, 033:52) -- es lo que ya trae cada fila devuelta por
-- generar_invitaciones_cuestionario (034:36), sin que el Worker arme
-- la llave compuesta (organization_id, persona_id).
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION motores_eficiencia.marcar_invitacion_notificada(
  p_codigo text
) RETURNS void
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'no autenticado';
  END IF;

  UPDATE motores_eficiencia.invitaciones_cuestionario ic
  SET notificado_en = now()
  WHERE ic.codigo = p_codigo
    AND EXISTS (
      SELECT 1 FROM consultor_organizacion co
      WHERE co.organizacion_id = ic.organization_id
        AND co.consultor_id = auth.uid()
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'código no encontrado o consultor no autorizado';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION motores_eficiencia.marcar_invitacion_notificada(text) TO authenticated;

-- Blindaje de cierre (memoria: toda función nueva en motores_eficiencia
-- termina con esto) -- reafirma el REVOKE general de 034/038, no lo
-- reemplaza; ver 041/044/045 para el mismo patrón.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA motores_eficiencia FROM PUBLIC;

-- ══════════════════════════════════════════════════════════════════
-- Verificación esperada tras aplicar
-- 1. Una invitación real: notificado_en arranca NULL.
-- 2. marcar_invitacion_notificada(codigo) del consultor asignado a la
--    organización -> notificado_en pasa a now(); NOT FOUND si el
--    codigo no existe o el consultor no está asignado a esa
--    organización -> RAISE EXCEPTION.
-- 3. sin auth.uid() (rol authenticated pero sin sesión) -> 'no autenticado'.
-- 4. anon/public sin EXECUTE.
-- ══════════════════════════════════════════════════════════════════
