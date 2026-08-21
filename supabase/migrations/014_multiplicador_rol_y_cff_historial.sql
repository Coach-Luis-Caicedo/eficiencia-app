-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 014: multiplicador_rol + tabla cff_historial
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- 1. `multiplicador_rol` — insumo que faltaba para Costo_rotación
--    (marco, sección 8): mapeo de 3 niveles aprobado 2026-08-19
--    (Operativo=0.30, Medio=0.50, Directivo=0.70 — ver sección 8 del
--    marco para el respaldo de cada valor). Se guarda el número
--    directamente, no una etiqueta — el selector del panel Ficha
--    financiera mapea la opción elegida a uno de estos 3 valores antes
--    de enviarlo. Nullable + CHECK con los 3 valores exactos, no un
--    rango continuo — a diferencia de tasa_rotacion_base, aquí no hay
--    "cualquier número entre 0.25 y 0.75", solo 3 puntos válidos.
--
-- 2. `cff_historial` — un registro por (organizacion_id, periodo),
--    snapshot de los 4 componentes del CFF (marco, sección 8) + total +
--    detalle de qué se incluyó y por qué. UNIQUE(organizacion_id,
--    periodo) es la invariante central: "un punto por período" que el
--    IFT necesita para leer una serie de tiempo coherente (decisión con
--    Luis, 2026-08-19) — nunca se inserta un segundo punto para el
--    mismo período, siempre se sobrescribe vía ON CONFLICT (ver
--    _calcular_cff_interno, migración 015).
--
--    Componentes nullable (no todos son siempre calculables — ej.
--    Costo_retrabajo se omite por completo sin costo_operativo_total,
--    marco sección 8). `detalle` (jsonb) guarda, por componente,
--    {incluido: bool, razon: text} — lo que el Tablero (tab CFF, todavía
--    sin construir) necesita para mostrar la etiqueta obligatoria de qué
--    se incluyó en el total.
--
--    RLS: mismo patrón que `organizaciones` — SELECT directo para
--    consultores vinculados (es dato de negocio, no respuesta
--    individual protegida por N≥8-10, ese mínimo ya se aplicó antes,
--    al calcular iao_org_usado). Sin policy de INSERT/UPDATE — todo
--    escribe pasa por _calcular_cff_interno() (SECURITY DEFINER,
--    migración 015), igual que el resto de las tablas de negocio.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE organizaciones ADD COLUMN multiplicador_rol numeric
  CHECK (multiplicador_rol IS NULL OR multiplicador_rol IN (0.30, 0.50, 0.70));


CREATE TABLE IF NOT EXISTS cff_historial (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id    uuid NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
  periodo            text NOT NULL,
  iao_org_usado      numeric,
  costo_desenganche  numeric,
  costo_rotacion     numeric,
  costo_ausentismo   numeric,
  costo_retrabajo    numeric,
  costo_total        numeric,
  detalle            jsonb NOT NULL,
  calculado_en       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacion_id, periodo)
);

CREATE INDEX IF NOT EXISTS idx_cff_historial_org ON cff_historial (organizacion_id);

ALTER TABLE cff_historial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cff_historial_select_consultor" ON cff_historial;
CREATE POLICY "cff_historial_select_consultor"
  ON cff_historial FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM consultor_organizacion
      WHERE consultor_organizacion.organizacion_id = cff_historial.organizacion_id
        AND consultor_organizacion.consultor_id = auth.uid()
    )
  );

GRANT SELECT ON cff_historial TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════

-- Debe devolver 1 fila: multiplicador_rol
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'organizaciones' AND column_name = 'multiplicador_rol';

-- Debe devolver 1 fila
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cff_historial';

-- Debe devolver 1 fila (SELECT, authenticated)
SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'cff_historial' AND grantee = 'authenticated';
