-- ══════════════════════════════════════════════════════════════════
-- 043 — motor-fpv: configuración por posición (fpv_config_posicion)
--
-- Cierra PENDIENTES_BRECHAS_WORKER_MOTORES.md §1: src/motores/fpv.js
-- solo mandaba `{ respuestas }` -- nunca `posiciones.<POS>.N_elegibles/
-- diseno/ponderacion` (motor-fpv/runFPV.js:65-74, §22.5-equivalente de
-- FPV). Sin ese bloque, ningún sensor puede escalar más allá de
-- DESCRIPTIVO (CENSAL/INFERENCIAL inalcanzables) y la ponderación
-- nunca se activa. Diseño completo y aprobado en
-- INVESTIGACION_POSICIONES_FPV.md: la llave es (organization_id,
-- posicion, period) -- mismo precedente que fpv_respuestas (032) ya
-- sentó (el motor no tiene concepto de período propio, pero la capa de
-- persistencia sí, porque cada corrida corresponde a una ronda de
-- recolección). Columnas aplanadas, no jsonb -- diseno/ponderacion son
-- formas fijas sin variantes condicionales.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE motores_eficiencia.fpv_config_posicion (
  organization_id            uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  posicion                    text NOT NULL CHECK (posicion IN ('CONSUMIDOR','INVERSIONISTA','PROVEEDOR')), -- motor-fpv/enums.js:30
  period                       text NOT NULL,
  n_elegibles                   integer CHECK (n_elegibles IS NULL OR n_elegibles > 0), -- contratos.js:119, universo elegible de ESA posición
  diseno_probabilistico          boolean,        -- contratos.js:114 -- el llamante AFIRMA el diseño, el motor no lo verifica
  diseno_modelo_documentado       boolean,        -- contratos.js:115, ambos obligatorios juntos si se declara diseño
  ponderacion_metodologia          text,          -- vocabulario abierto, no enumerado -- runFPV.js:98,107 (NO validado por contratos.js -- hallazgo, INVESTIGACION_POSICIONES_FPV.md §1)
  creado_en                        timestamptz NOT NULL DEFAULT now(),
  actualizado_en                    timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (organization_id, posicion, period),

  -- contratos.js:113-116 (ESQUEMA_DISENO): probabilistico/modelo_documentado
  -- son AMBOS obligatorios si se declara diseno -- nunca uno sin el otro.
  CHECK ((diseno_probabilistico IS NULL) = (diseno_modelo_documentado IS NULL))
);

COMMENT ON TABLE motores_eficiencia.fpv_config_posicion IS
  'posiciones.<POS> de FPV_INPUT (motor-fpv/runFPV.js:65-74) -- transcrita '
  'aplanada, no jsonb (diseno/ponderacion son formas fijas de contratos.js '
  'sin variantes condicionales). Llave por período porque fpv_respuestas '
  '(032) ya estableció el precedente: el motor no tiene concepto de '
  'período propio, pero cada corrida corresponde a una ronda de '
  'recolección distinta -- ver INVESTIGACION_POSICIONES_FPV.md §2.';

REVOKE ALL ON motores_eficiencia.fpv_config_posicion FROM PUBLIC;

-- ══════════════════════════════════════════════════════════════════
-- 1. registrar_config_posicion_fpv -- upsert, fila única (no lote --
-- a lo sumo 3 filas por período, muy por debajo del umbral que
-- justificó lote en observations/registrar_evento_cff).
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION motores_eficiencia.registrar_config_posicion_fpv(
  p_organization_id  uuid,
  p_config             jsonb
) RETURNS text
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
DECLARE v_posicion text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'no autenticado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM consultor_organizacion
    WHERE consultor_id = auth.uid() AND organizacion_id = p_organization_id)
  THEN RAISE EXCEPTION 'no autorizado — el consultor no está asignado a esta organización'; END IF;

  INSERT INTO motores_eficiencia.fpv_config_posicion
  SELECT (jsonb_populate_record(
    NULL::motores_eficiencia.fpv_config_posicion,
    jsonb_build_object('creado_en', now(), 'actualizado_en', now())
      || p_config || jsonb_build_object('organization_id', p_organization_id)
  )).*
  ON CONFLICT (organization_id, posicion, period) DO UPDATE SET
    n_elegibles = EXCLUDED.n_elegibles,
    diseno_probabilistico = EXCLUDED.diseno_probabilistico,
    diseno_modelo_documentado = EXCLUDED.diseno_modelo_documentado,
    ponderacion_metodologia = EXCLUDED.ponderacion_metodologia,
    actualizado_en = now()
  RETURNING posicion INTO v_posicion;

  RETURN v_posicion;
END;
$$;

-- ══════════════════════════════════════════════════════════════════
-- 2. leer_config_posiciones_fpv -- plana, filtro EXACTO por período
-- (no rango/solapamiento como CFF -- aquí no hay concepto de vigencia
-- amplia, cada período tiene su propia fila o ninguna).
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION motores_eficiencia.leer_config_posiciones_fpv(
  p_organization_id uuid, p_period text
) RETURNS SETOF motores_eficiencia.fpv_config_posicion
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'no autenticado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM consultor_organizacion
    WHERE consultor_id = auth.uid() AND organizacion_id = p_organization_id)
  THEN RAISE EXCEPTION 'no autorizado — el consultor no está asignado a esta organización'; END IF;

  RETURN QUERY
  SELECT * FROM motores_eficiencia.fpv_config_posicion
  WHERE organization_id = p_organization_id AND period = p_period;
END;
$$;

-- ══════════════════════════════════════════════════════════════════
-- Grants + revoke blanket (AUDITORIA_SUPABASE_MOTORES.md §5)
-- ══════════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION motores_eficiencia.registrar_config_posicion_fpv(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION motores_eficiencia.leer_config_posiciones_fpv(uuid, text) TO authenticated;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA motores_eficiencia FROM PUBLIC;

-- ══════════════════════════════════════════════════════════════════
-- Verificación manual sugerida (post-aplicación en Supabase):
--
-- 1. select proname, prosecdef from pg_proc where proname in
--    ('registrar_config_posicion_fpv','leer_config_posiciones_fpv');
-- 2. select has_function_privilege('anon', 'motores_eficiencia.registrar_config_posicion_fpv(uuid,jsonb)', 'EXECUTE'); -- false
-- 3. select has_function_privilege('authenticated', 'motores_eficiencia.registrar_config_posicion_fpv(uuid,jsonb)', 'EXECUTE'); -- true
-- 4. select conname, contype, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'motores_eficiencia.fpv_config_posicion'::regclass;
-- ══════════════════════════════════════════════════════════════════
