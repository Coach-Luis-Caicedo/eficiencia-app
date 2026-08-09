-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 005: campos nuevos en organizaciones
-- (ficha técnica del Tablero + insumos del CFF, capturados una sola vez
-- al crear la organización — sección 8 del marco)
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- n_empleados NO va aquí — ya existe en organizaciones (aplicado y
-- verificado antes). Esta migración agrega las 4 columnas genuinamente
-- nuevas: sector, salario_promedio, tasa_rotacion_base, dias_ausencia_base.
--
-- Todos nullable, sin default. Para la organización de prueba existente,
-- los valores se actualizan a mano con un UPDATE después de aplicar
-- esto; el "obligatorio" de nombre/n_empleados/sector/áreas se aplica en
-- crear_organizacion() (migración 007) y en el formulario, no aquí — no
-- se puede exigir NOT NULL a nivel de columna sin default porque la
-- organización de prueba ya existe con estos campos vacíos.
--
-- `sector` usa exactamente los 5 valores de SECTOR_BENCHMARKS
-- (workbook.html, código viejo — no se inventó una lista nueva):
-- servicios_prof, manufactura, finanzas_tech, retail_logistica,
-- salud_educacion.
--
-- `tasa_rotacion_base` y `dias_ausencia_base` guardan el dato REAL de la
-- organización cuando el consultor lo tiene — el benchmark sectorial
-- (SECTOR_BENCHMARKS) sigue siendo el valor de referencia/fallback
-- cuando esto no se conoce, no se reemplaza por esto.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE organizaciones ADD COLUMN sector text
  CHECK (sector IS NULL OR sector IN (
    'servicios_prof', 'manufactura', 'finanzas_tech', 'retail_logistica', 'salud_educacion'
  ));

ALTER TABLE organizaciones ADD COLUMN salario_promedio numeric
  CHECK (salario_promedio IS NULL OR salario_promedio >= 0);

ALTER TABLE organizaciones ADD COLUMN tasa_rotacion_base numeric
  CHECK (tasa_rotacion_base IS NULL OR tasa_rotacion_base BETWEEN 0 AND 100);

ALTER TABLE organizaciones ADD COLUMN dias_ausencia_base numeric
  CHECK (dias_ausencia_base IS NULL OR dias_ausencia_base >= 0);


-- ══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════

-- Debe devolver 5 filas: n_empleados, sector, salario_promedio,
-- tasa_rotacion_base, dias_ausencia_base — todas nullable = YES.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'organizaciones'
  AND column_name IN ('n_empleados', 'sector', 'salario_promedio', 'tasa_rotacion_base', 'dias_ausencia_base')
ORDER BY column_name;
