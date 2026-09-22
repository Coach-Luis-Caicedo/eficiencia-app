-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 039: motores_eficiencia.crear_organizacion()
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- Cierra INVESTIGACION_PROTOCOLO_REGISTRO_MOTORES_EFICIENCIA.md §6
-- (mínimo viable, aprobado): el único vacío real que la prueba de la
-- ronda anterior expuso -- crear una organización nueva sin recurrir a
-- service_role a mano -- no "quién puede crear organizaciones" en
-- general, que el legacy (crear_organizacion(), 007/011) ya resolvía
-- vía self-service para cualquier consultor ya registrado.
--
-- Calcado del patrón legacy en sus pasos 1/2/4/6 (§1.1 del documento),
-- verificado línea por línea contra crear_organizacion() -- MISMO
-- comportamiento de autorización, tablas COMPARTIDAS a propósito
-- (organizaciones/consultores/consultor_organizacion son la columna
-- vertebral de identidad de la que las 15 funciones de
-- motores_eficiencia ya dependen, no "tablas legacy" -- §2 del
-- documento):
--   1. auth.uid() no nulo.
--   2. Ya debe existir como `consultores` -- NO se crea aquí (mismo
--      vacío que el legacy siempre tuvo: convertirse en consultor por
--      primera vez sigue siendo 100% manual, Luis, dashboard de
--      Supabase Auth -- pregunta abierta #1 del documento, sin
--      resolver a propósito, no es parte de este alcance).
--   3. INSERT en public.organizaciones -- SOLO `nombre`. Sin p_areas
--      (eje distinto de node_id, §2), sin p_contactos (eso es
--      comite_eficiencia/agregar_miembro_comite, ya construido, tabla
--      aparte), sin ningún campo de ficha financiera CFF (n_empleados/
--      sector/pais/salario_promedio/etc., 005/011) -- ningún motor
--      nuevo los lee, y el sistema legacy se descarta por completo
--      (confirmado por Luis: las organizaciones existentes son todas
--      de prueba, sin clientes reales que migrar -- corte limpio, sin
--      necesidad de compatibilidad futura con esos campos).
--   4. Auto-vínculo en consultor_organizacion con rol='consultor' --
--      funciona por SECURITY DEFINER (privilegios del dueño de la
--      función), pese a que 001:211-213 no da INSERT a `authenticated`
--      directo en esa tabla -- misma mecánica exacta que el legacy.
--
-- Fuera de esta ronda, ya acordado: node_hierarchy (no tiene función
-- de escritura en ningún lado -- hallazgo relacionado, no resuelto
-- aquí) y el rol de custodio (scaffolding deliberadamente diferido dos
-- veces en el legacy, §3 del documento, nunca activado).
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION motores_eficiencia.crear_organizacion(
  p_nombre  text
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

  INSERT INTO organizaciones (nombre)
  VALUES (trim(p_nombre))
  RETURNING id INTO v_org_id;

  INSERT INTO consultor_organizacion (consultor_id, organizacion_id, rol)
  VALUES (auth.uid(), v_org_id, 'consultor');

  RETURN v_org_id;
END;
$$;

COMMENT ON FUNCTION motores_eficiencia.crear_organizacion(text) IS
  'Alta mínima de organización para motores_eficiencia -- INVESTIGACION_'
  'PROTOCOLO_REGISTRO_MOTORES_EFICIENCIA.md §6. Solo nombre + '
  'auto-vínculo consultor_organizacion(rol=consultor); sin ficha '
  'financiera CFF, sin areas_organizacion, sin contactos -- ninguno '
  'aplica al sistema nuevo. Exige que el llamador YA sea `consultores` '
  '-- no lo crea (ese paso sigue siendo manual, sin cambios).';

GRANT EXECUTE ON FUNCTION motores_eficiencia.crear_organizacion(text) TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- Regla permanente aplicada (AUDITORIA_SUPABASE_MOTORES.md §5) --
-- FALTABA en la primera versión de esta migración, encontrado por
-- verificación independiente de Luis con pglite bajo SET ROLE
-- authenticated real, no por mí.
--
-- Postgres otorga EXECUTE a PUBLIC automáticamente en todo CREATE
-- FUNCTION -- a diferencia de las tablas, donde el default es sin
-- acceso a PUBLIC. El REVOKE de 034/035/036 protege el estado del
-- esquema EN ESE MOMENTO -- nunca las funciones creadas después.
-- crear_organizacion() es nueva, creada en 039, después de esos
-- REVOKE -- por lo tanto necesita su PROPIO REVOKE, en este mismo
-- archivo, o queda con EXECUTE abierto a PUBLIC.
--
-- Por qué esto casi se pasa por alto (para que la próxima migración
-- que agregue una función a motores_eficiencia no repita el error):
-- 039 se armó calcando los pasos 1/2/4/6 de crear_organizacion()
-- LEGACY (007/011) -- una función que nunca tuvo este problema, porque
-- 029 (el REVOKE del esquema `public`) es anterior a su existencia y
-- el legacy nunca adoptó la regla de "un REVOKE por migración". Copiar
-- el patrón de AUTORIZACIÓN del legacy (líneas 1/2/4/6) no trae consigo
-- el patrón de PRIVILEGIOS DE ESQUEMA que 034-036 sí establecieron para
-- motores_eficiencia -- son dos checklists distintas, y solo se revisó
-- la primera. El REVOKE de un esquema NO es retroactivo ni transitivo:
-- cada migración que agrega una función nueva a motores_eficiencia
-- necesita su propia línea, sin excepción, sin importar cuántas
-- migraciones anteriores ya la tengan.
-- ══════════════════════════════════════════════════════════════════
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA motores_eficiencia FROM PUBLIC;

-- ══════════════════════════════════════════════════════════════════
-- Verificación sugerida tras aplicar
-- ══════════════════════════════════════════════════════════════════
-- 1. Como un authenticated SIN fila en consultores -- debe fallar con
--    "no autorizado — el usuario autenticado no está registrado como
--    consultor".
-- 2. Como un authenticated CON fila en consultores -- debe devolver un
--    uuid nuevo, y SELECT * FROM consultor_organizacion WHERE
--    organizacion_id = ese uuid debe dar 1 fila con rol='consultor'.
-- 3. has_function_privilege('public', 'motores_eficiencia.crear_organizacion(text)', 'EXECUTE')
--    -- debe dar false.
