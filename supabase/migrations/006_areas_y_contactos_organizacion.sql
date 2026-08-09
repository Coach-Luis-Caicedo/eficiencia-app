-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 006: areas_organizacion + contactos_organizacion
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
-- Depende de la migración 005 (organizaciones.n_empleados/sector/...) —
-- no por referencia directa, pero es parte del mismo flujo de alta de
-- organización.
-- ══════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════
-- 1. areas_organizacion — lista fija de departamentos por organización.
--
-- Cierra un pendiente viejo: hasta ahora `area` en
-- respuestas_cuestionario/respuestas_sdmo era texto libre capturado en
-- cuestionario.html/sdmo.html, con riesgo real de que "RRHH" y "Recursos
-- Humanos" se contaran como departamentos distintos, rompiendo el
-- análisis por área en silencio. La lista ahora se define una vez, al
-- crear la organización (crear_organizacion, migración 007), y
-- cuestionario.html/sdmo.html la consumen como selector — no reemplaza
-- la columna `area` de las tablas de respuesta (sigue siendo texto,
-- pero el cliente ya no puede escribir cualquier cosa ahí).
--
-- Tabla propia (no un array en organizaciones) para poder hacer
-- JOIN/filtrar limpio, mismo criterio que respuestas_cuestionario_pares
-- (migración 001) frente a columnas anchas.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS areas_organizacion (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id  uuid NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
  nombre           text NOT NULL,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacion_id, nombre)
);

CREATE INDEX IF NOT EXISTS idx_areas_organizacion_org ON areas_organizacion (organizacion_id);

ALTER TABLE areas_organizacion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "areas_organizacion_select_consultor" ON areas_organizacion;
CREATE POLICY "areas_organizacion_select_consultor"
  ON areas_organizacion FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM consultor_organizacion
      WHERE consultor_organizacion.organizacion_id = areas_organizacion.organizacion_id
        AND consultor_organizacion.consultor_id = auth.uid()
    )
  );
-- Sin policy de INSERT para nadie — se crean exclusivamente vía
-- crear_organizacion() (SECURITY DEFINER, migración 007).
-- Sin ningún acceso para anon a nivel de tabla — el selector de área en
-- cuestionario.html/sdmo.html resuelve la lista vía areas_por_codigo()
-- (SECURITY DEFINER, migración 007), nunca por SELECT directo — mismo
-- principio que ya protege organizacion_id en el resto del sistema (el
-- cliente anónimo nunca ve ni controla ese id, solo pasa el código de
-- invitación).

-- Necesario por el mismo motivo que la migración 003: sin esto,
-- authenticated recibe "permission denied" al intentar SELECT, aunque la
-- policy de arriba esté bien — la regla ALTER DEFAULT PRIVILEGES de
-- `postgres` (migración 004) le quita SELECT/INSERT/UPDATE/DELETE por
-- defecto a toda tabla nueva, así que cada tabla nueva necesita su
-- propio GRANT explícito.
GRANT SELECT ON areas_organizacion TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- 2. contactos_organizacion — datos de contacto del cliente, sin acceso
-- al sistema todavía.
--
-- Tres roles, no un contacto genérico:
--   - directivo_responsable — la persona real detrás del rol "Directivo"
--     que ya asigna CATALOGO_INTERVENCION_EFICIENCIA.md como
--     "Responsable primario" en cada ficha. Uno por organización (en la
--     práctica — ver nota sobre UNIQUE más abajo).
--   - coordinador — enlace operativo del día a día. Uno por organización.
--   - comite_supervision — plural por naturaleza, varias personas pueden
--     tener este rol en la misma organización.
-- Tabla única con `rol` como discriminador (no tres tablas, no tres
-- campos sueltos en organizaciones) — mismo patrón que consultor_organizacion.rol.
--
-- Sin UNIQUE forzando exactamente 1 fila para directivo_responsable/
-- coordinador a propósito: alguien puede cambiar de cargo y haga falta
-- reemplazar el registro. Eso se resuelve en la capa de aplicación (el
-- formulario solo pide uno de cada) — una restricción rígida en la base
-- solo estorbaría ese caso real sin aportar nada.
--
-- Tabla separada de organizaciones (no campos sueltos) para que, cuando
-- se decida darle login real a alguno de estos contactos (probablemente
-- Coordinador o alguien del Comité), la transición sea limpia: el camino
-- natural es que se convierta en un registro de `consultores` (con su
-- propio auth.users) y se vincule con rol='custodio' en
-- consultor_organizacion — esa columna `rol` ya existe desde la
-- migración 001, pensada exactamente para este caso. No se construye ese
-- camino ahora, solo queda preparado.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS contactos_organizacion (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id  uuid NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
  rol              text NOT NULL CHECK (rol IN ('directivo_responsable', 'coordinador', 'comite_supervision')),
  nombre           text NOT NULL,
  cargo            text,
  email            text,
  telefono         text,
  creado_en        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contactos_organizacion_org ON contactos_organizacion (organizacion_id);

ALTER TABLE contactos_organizacion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contactos_organizacion_select_consultor" ON contactos_organizacion;
CREATE POLICY "contactos_organizacion_select_consultor"
  ON contactos_organizacion FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM consultor_organizacion
      WHERE consultor_organizacion.organizacion_id = contactos_organizacion.organizacion_id
        AND consultor_organizacion.consultor_id = auth.uid()
    )
  );
-- Sin policy de INSERT para nadie — se crea vía crear_organizacion().
-- Sin ningún acceso para anon — a diferencia de areas_organizacion, este
-- contacto no tiene ningún flujo público que necesite leerlo.

GRANT SELECT ON contactos_organizacion TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════

-- Debe devolver 2 filas (las tablas nuevas).
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('areas_organizacion', 'contactos_organizacion');

-- Debe devolver true para ambas (RLS habilitado).
SELECT relname, relrowsecurity FROM pg_class
WHERE relname IN ('areas_organizacion', 'contactos_organizacion');

-- Debe devolver 2 filas (1 policy de SELECT por tabla).
SELECT tablename, policyname, cmd FROM pg_policies
WHERE tablename IN ('areas_organizacion', 'contactos_organizacion');

-- Debe devolver 2 filas: SELECT/authenticated para cada tabla nueva —
-- y ninguna fila para anon (confirma que no repetimos el hueco de la
-- migración 003/004 en tablas nuevas).
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('areas_organizacion', 'contactos_organizacion')
ORDER BY table_name, grantee;
