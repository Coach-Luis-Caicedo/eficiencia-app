-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 040: sector en motores_eficiencia.crear_organizacion()
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- Decisión de Luis, distinta del resto de la ficha financiera CFF legacy
-- (n_empleados/pais/salario_promedio/tasa_rotacion_base/
-- dias_ausencia_base/costo_operativo_total/costo_intervencion/ebitda),
-- que quedaron descartados de motores_eficiencia sin ambigüedad (039,
-- INVESTIGACION_PROTOCOLO_REGISTRO_MOTORES_EFICIENCIA.md §2): `sector`
-- tiene un uso real previsto -- los KPIs de motor-piio (vía
-- reference_specs, umbrales que probablemente varían por sector) y las
-- proyecciones de motor-ifd -- documentado como pendiente en
-- INVESTIGACION_PROTOCOLO_REGISTRO_MOTORES_EFICIENCIA.md §5 punto 5.
--
-- SIN DDL de columna: organizaciones.sector YA EXISTE, agregada en
-- 005 (legacy) -- `sector text CHECK (sector IS NULL OR sector IN
-- ('servicios_prof','manufactura','finanzas_tech','retail_logistica',
-- 'salud_educacion'))`, nullable, sin NOT NULL. motores_eficiencia
-- reutiliza la MISMA columna de la MISMA tabla compartida
-- (organizaciones es la columna vertebral de identidad, no una tabla
-- legacy a evitar -- INVESTIGACION_PROTOCOLO_REGISTRO_MOTORES_
-- EFICIENCIA.md §2) -- esta migración solo toca la función.
--
-- ══════════════════════════════════════════════════════════════════
-- PROVISIONAL -- no es la forma final, es un punto de partida
-- ══════════════════════════════════════════════════════════════════
-- Los 5 valores son los del legacy (007/011), reusados tal cual porque
-- es la única lista real que existe hoy -- NO porque se haya confirmado
-- que es la lista correcta para motores_eficiencia. Cuando se diseñe
-- reference_specs/la pieza de proyecciones de motor-ifd que realmente
-- consuma `sector`, esa lista (los 5 valores, o incluso el concepto de
-- "lista fija de sector" en sí) puede cambiar por completo -- mismo
-- criterio ya aplicado a otros valores de arranque de esta sesión (p.ej.
-- w_neg, calculation_version de CFF): un punto de partida documentado
-- como tal, no una decisión definitiva disfrazada de una.
--
-- p_sector se agrega AL FINAL, con DEFAULT NULL -- pero SÍ hace falta
-- DROP FUNCTION antes, verificado por ejecución real (pglite), NO por
-- lectura de documentación: mi primer intento usó CREATE OR REPLACE
-- directo asumiendo que "agregar un parámetro con DEFAULT al final"
-- bastaba -- pglite lo rechazó con
-- "function crear_organizacion(unknown) is not unique" (42725) al
-- llamar con 1 solo argumento, porque CREATE OR REPLACE con una lista
-- de parámetros DISTINTA (aunque sea superconjunto) no reemplaza la
-- función existente -- crea un SEGUNDO overload, y una llamada con 1
-- argumento queda ambigua entre crear_organizacion(text) y
-- crear_organizacion(text, text DEFAULT NULL). Mismo motivo real que ya
-- forzó el DROP FUNCTION de p_pais en el legacy (011) -- no es
-- específico de insertar un parámetro "en medio" vs. "al final", es
-- cualquier cambio en la lista de tipos de parámetros. El DROP elimina
-- el overload viejo; el GRANT EXECUTE TO authenticated y el REVOKE FROM
-- PUBLIC de 039 se vuelven a declarar explícitos más abajo -- al ser un
-- objeto NUEVO (nuevo OID), no hereda los privilegios del que se borró.
-- ══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS motores_eficiencia.crear_organizacion(text);

CREATE OR REPLACE FUNCTION motores_eficiencia.crear_organizacion(
  p_nombre  text,
  p_sector  text DEFAULT NULL
) RETURNS uuid
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
DECLARE
  v_org_id  uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'no autenticado';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM consultores WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'no autorizado — el usuario autenticado no está registrado como consultor';
  END IF;

  IF p_nombre IS NULL OR trim(p_nombre) = '' THEN
    RAISE EXCEPTION 'el nombre de la organización es obligatorio';
  END IF;

  IF p_sector IS NOT NULL AND p_sector NOT IN (
    'servicios_prof', 'manufactura', 'finanzas_tech', 'retail_logistica', 'salud_educacion'
  ) THEN
    RAISE EXCEPTION 'sector inválido — debe ser uno de: servicios_prof, manufactura, finanzas_tech, retail_logistica, salud_educacion';
  END IF;

  INSERT INTO organizaciones (nombre, sector)
  VALUES (trim(p_nombre), p_sector)
  RETURNING id INTO v_org_id;

  INSERT INTO consultor_organizacion (consultor_id, organizacion_id, rol)
  VALUES (auth.uid(), v_org_id, 'consultor');

  RETURN v_org_id;
END;
$$;

COMMENT ON FUNCTION motores_eficiencia.crear_organizacion(text, text) IS
  'Alta mínima de organización para motores_eficiencia -- INVESTIGACION_'
  'PROTOCOLO_REGISTRO_MOTORES_EFICIENCIA.md §6, sector agregado en 040. '
  'sector es PROVISIONAL -- lista de 5 valores heredada del legacy '
  '(007/011), punto de partida documentado, no la forma final. '
  'reference_specs/proyecciones de motor-ifd pueden exigir otra forma '
  'cuando se diseñen -- ver INVESTIGACION_PROTOCOLO_REGISTRO_MOTORES_'
  'EFICIENCIA.md §5 punto 5.';

-- El DROP borró el objeto viejo -- esta función es un OID nuevo, no
-- hereda ningún privilegio. Hace falta declarar los dos explícitos de
-- nuevo, mismo patrón que 034-036/039 (regla permanente,
-- AUDITORIA_SUPABASE_MOTORES.md §5): GRANT primero (para authenticated,
-- igual que 039), REVOKE después (cierra el gap de EXECUTE-a-PUBLIC que
-- Postgres otorga por defecto en todo CREATE FUNCTION).
GRANT EXECUTE ON FUNCTION motores_eficiencia.crear_organizacion(text, text) TO authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA motores_eficiencia FROM PUBLIC;

-- ══════════════════════════════════════════════════════════════════
-- Verificación sugerida tras aplicar
-- ══════════════════════════════════════════════════════════════════
-- 1. SELECT crear_organizacion('Org sin sector'); -- 1 arg, sector
--    implícito NULL por el DEFAULT -- debe seguir funcionando igual que
--    antes de esta migración (mismo comportamiento visible desde
--    afuera, aunque por debajo sea un objeto de función distinto).
-- 2. SELECT crear_organizacion('Org con sector', 'manufactura'); --
--    debe funcionar, sector queda 'manufactura'.
-- 3. SELECT crear_organizacion('Org sector inválido', 'no_existe'); --
--    debe fallar con el mensaje de sector inválido.
-- 4. has_function_privilege('public',
--    'motores_eficiencia.crear_organizacion(text,text)', 'EXECUTE') --
--    debe dar false (GRANT/REVOKE declarados explícitos arriba, no
--    heredados -- el objeto viejo con esos privilegios ya no existe).
