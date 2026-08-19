-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 012: tasa_retrabajo_real — mismo patrón de
-- "dato real prioriza sobre benchmark" ya aplicado a rotación y
-- ausentismo, extendido a retrabajo
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- Contexto: el panel "Ficha financiera" (mockup confirmado con Luis)
-- incluye un 8º campo, "Tasa de retrabajo real", que la migración 011 no
-- contempló (esa migración cubría 7 campos: país + 6 financieros). Es la
-- extensión natural del mismo patrón ya aplicado dos veces en la sección
-- 8 del marco — dato real del cliente por encima del benchmark de
-- manufactura (`TasaRetrabajoBase[0.05–0.15]`) — así que se agrega aquí
-- para que el panel tenga dónde guardarlo, en vez de construir un campo
-- que no persiste nada.
--
-- ESTA ADICIÓN NO FUE PEDIDA EXPLÍCITAMENTE en el prompt del panel — se
-- infiere de la consistencia con el patrón ya aprobado dos veces
-- (rotación, ausentismo) y de que el mockup confirmado ya incluye el
-- campo. Si no era la intención, esta migración es la única pieza a
-- revertir — no toca nada de las migraciones 005-011.
--
-- `tasa_retrabajo_real`: mismo rango que `tasa_rotacion_base` (0-100,
-- puntos porcentuales, no fracción 0-1) — consistente con esa columna,
-- no con la fracción [0.05-0.15] en la que aparece TasaRetrabajoBase en
-- la fórmula del CFF (conversión /100 queda para cuando se implemente el
-- motor, igual que ya aplica hoy para tasa_rotacion_base).
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE organizaciones ADD COLUMN tasa_retrabajo_real numeric
  CHECK (tasa_retrabajo_real IS NULL OR tasa_retrabajo_real BETWEEN 0 AND 100);


-- ══════════════════════════════════════════════════════════════════
-- actualizar_ficha_financiera() — agrega p_tasa_retrabajo_real al final
--
-- CREATE OR REPLACE alcanza aquí (a diferencia de crear_organizacion en
-- la migración 011) porque el parámetro nuevo se agrega al final con
-- DEFAULT NULL, sin reordenar ni insertar en medio — no hace falta
-- DROP FUNCTION.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION actualizar_ficha_financiera(
  p_organizacion_id       uuid,
  p_pais                  text,
  p_salario_promedio      numeric DEFAULT NULL,
  p_tasa_rotacion_base    numeric DEFAULT NULL,
  p_dias_ausencia_base    numeric DEFAULT NULL,
  p_costo_operativo_total numeric DEFAULT NULL,
  p_costo_intervencion    numeric DEFAULT NULL,
  p_ebitda                numeric DEFAULT NULL,
  p_tasa_retrabajo_real   numeric DEFAULT NULL
) RETURNS void
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE organizacion_id = p_organizacion_id AND consultor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'no autorizado para esta organización';
  END IF;

  IF p_pais IS NULL OR p_pais NOT IN ('colombia') THEN
    RAISE EXCEPTION 'país inválido — por ahora el sistema solo soporta: colombia';
  END IF;

  UPDATE organizaciones SET
    pais                  = p_pais,
    salario_promedio      = p_salario_promedio,
    tasa_rotacion_base    = p_tasa_rotacion_base,
    dias_ausencia_base    = p_dias_ausencia_base,
    costo_operativo_total = p_costo_operativo_total,
    costo_intervencion    = p_costo_intervencion,
    ebitda                = p_ebitda,
    tasa_retrabajo_real   = p_tasa_retrabajo_real
  WHERE id = p_organizacion_id;
END;
$$;

GRANT EXECUTE ON FUNCTION actualizar_ficha_financiera(uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════

-- Debe devolver 1 fila: tasa_retrabajo_real
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'organizaciones'
  AND column_name = 'tasa_retrabajo_real';

-- Prueba manual:
-- SELECT actualizar_ficha_financiera('<org_id>', 'colombia', 3500000, 22.5, 7, 900000000, 45000000, 120000000, 8.5);
-- Confirmar: SELECT tasa_retrabajo_real FROM organizaciones WHERE id = '<org_id>';  -- 8.5
