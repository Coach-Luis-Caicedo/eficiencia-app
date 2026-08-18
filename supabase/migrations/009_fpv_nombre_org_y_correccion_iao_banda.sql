-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 009: nombre de organización por código FPV
-- + corrección de iao_banda en resumen_fpv_organizacion (migración 008)
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- Corrección: iao_banda (008) usaba umbrales prestados del IDA (65/50)
-- en vez de los que el Workbook ya usa para colorear el IAO en todos
-- lados (estadoDesdeIAO, workbook.html — 0.15/0.35 sobre amenaza_par,
-- marco 6.4). Se alinea aquí, antes de construir el panel que los
-- mostraría lado a lado. También se exponen 'iao'/'iao_n' crudos para
-- que el Workbook reutilice estadoDesdeIAO()/_badgeEstado() en vez de
-- duplicar la clasificación en el backend.
-- ══════════════════════════════════════════════════════════════════


-- ── 1. organizacion_nombre_por_codigo_fpv ────────────────────────
-- Mismo patrón que areas_por_codigo (migración 007): resuelve el
-- nombre desde el código, sin exponer organizacion_id al cliente
-- anónimo. Necesario para el encabezado de contexto obligatorio del
-- formulario (marco 10.3).
CREATE OR REPLACE FUNCTION organizacion_nombre_por_codigo_fpv(p_codigo text)
RETURNS text
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_organizacion_id uuid;
  v_nombre          text;
BEGIN
  SELECT organizacion_id INTO v_organizacion_id
  FROM invitaciones_fpv
  WHERE codigo = p_codigo AND activa;

  IF v_organizacion_id IS NULL THEN
    RAISE EXCEPTION 'código de invitación inválido o inactivo';
  END IF;

  SELECT nombre INTO v_nombre FROM organizaciones WHERE id = v_organizacion_id;
  RETURN v_nombre;
END;
$$;

GRANT EXECUTE ON FUNCTION organizacion_nombre_por_codigo_fpv(text) TO anon;


-- ── 2. resumen_fpv_organizacion — corrección de umbrales + iao crudo ──
CREATE OR REPLACE FUNCTION resumen_fpv_organizacion(
  p_organizacion_id uuid,
  p_periodo         text DEFAULT NULL
) RETURNS jsonb
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_n_minimo     CONSTANT int := 8;
  v_iao_json     jsonb;
  v_iao          numeric;
  v_iao_n        bigint;
  v_iao_n_sufic  boolean;
  v_iao_banda    text;
  v_resultado    jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE organizacion_id = p_organizacion_id AND consultor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'no autorizado para esta organización';
  END IF;

  v_iao_json := resumen_organizacion_completo(p_organizacion_id);
  v_iao := (v_iao_json->>'iao')::numeric;
  v_iao_n := (v_iao_json->>'iao_n')::bigint;
  v_iao_n_sufic := (v_iao_json->>'iao_n_suficiente')::boolean;

  -- Mismos umbrales que estadoDesdeIAO en workbook.html (marco 6.4:
  -- 0.15/0.35 sobre amenaza_par, ×100 para la escala del IAO) — antes
  -- de esta corrección usaba 65/50, prestados sin relación del IDA.
  v_iao_banda := CASE
    WHEN v_iao IS NULL OR NOT v_iao_n_sufic THEN NULL
    WHEN v_iao > 35 THEN 'amenaza'
    WHEN v_iao > 15 THEN 'alerta'
    ELSE 'seguridad'
  END;

  WITH
  inv AS (
    SELECT
      count(*) AS n,
      avg((fiabilidad_1 + fiabilidad_2) / 2.0)             AS fiabilidad,
      avg((proporcionalidad_1 + proporcionalidad_2) / 2.0) AS proporcionalidad,
      avg((vinculo_1 + vinculo_2) / 2.0)                   AS vinculo
    FROM respuestas_fpv
    WHERE organizacion_id = p_organizacion_id
      AND tipo_actor = 'inversionista'
      AND periodo = COALESCE(p_periodo, (
        SELECT periodo FROM respuestas_fpv
        WHERE organizacion_id = p_organizacion_id AND tipo_actor = 'inversionista'
        ORDER BY periodo DESC LIMIT 1))
  ),
  inv_out AS (
    SELECT
      n,
      round(fiabilidad::numeric, 2)       AS fiabilidad,
      round(proporcionalidad::numeric, 2) AS proporcionalidad,
      round(vinculo::numeric, 2)          AS vinculo,
      CASE WHEN n = 0 THEN NULL ELSE
        CASE
          WHEN (fiabilidad + proporcionalidad + vinculo) / 3.0 >= 4 THEN 'alto'
          WHEN (fiabilidad + proporcionalidad + vinculo) / 3.0 <= 2 THEN 'bajo'
          ELSE 'neutral'
        END
      END AS banda
    FROM inv
  ),
  con AS (
    SELECT
      count(*) AS n,
      avg((fiabilidad_1 + fiabilidad_2) / 2.0)             AS fiabilidad,
      avg((proporcionalidad_1 + proporcionalidad_2) / 2.0) AS proporcionalidad,
      avg((vinculo_1 + vinculo_2) / 2.0)                   AS vinculo
    FROM respuestas_fpv
    WHERE organizacion_id = p_organizacion_id
      AND tipo_actor = 'consumidor'
      AND periodo = COALESCE(p_periodo, (
        SELECT periodo FROM respuestas_fpv
        WHERE organizacion_id = p_organizacion_id AND tipo_actor = 'consumidor'
        ORDER BY periodo DESC LIMIT 1))
  ),
  con_out AS (
    SELECT
      n,
      (n >= v_n_minimo) AS n_suficiente,
      CASE WHEN n >= v_n_minimo THEN round(fiabilidad::numeric, 2) ELSE NULL END AS fiabilidad,
      CASE WHEN n >= v_n_minimo THEN round(proporcionalidad::numeric, 2) ELSE NULL END AS proporcionalidad,
      CASE WHEN n >= v_n_minimo THEN round(vinculo::numeric, 2) ELSE NULL END AS vinculo,
      CASE WHEN n >= v_n_minimo THEN
        CASE
          WHEN (fiabilidad + proporcionalidad + vinculo) / 3.0 >= 4 THEN 'alto'
          WHEN (fiabilidad + proporcionalidad + vinculo) / 3.0 <= 2 THEN 'bajo'
          ELSE 'neutral'
        END
      ELSE NULL END AS banda
    FROM con
  )
  SELECT jsonb_build_object(
    'organizacion_id', p_organizacion_id,
    'iao', v_iao,
    'iao_n', v_iao_n,
    'iao_banda', v_iao_banda,
    'inversionista', (
      SELECT jsonb_build_object(
        'n', n, 'fiabilidad', fiabilidad, 'proporcionalidad', proporcionalidad,
        'vinculo', vinculo, 'banda', banda
      ) FROM inv_out
    ),
    'consumidor', (
      SELECT jsonb_build_object(
        'n', n, 'n_suficiente', n_suficiente, 'fiabilidad', fiabilidad,
        'proporcionalidad', proporcionalidad, 'vinculo', vinculo, 'banda', banda
      ) FROM con_out
    ),
    'incoherencia_iao', CASE
      WHEN v_iao_banda IS NULL THEN NULL
      ELSE (
        SELECT bool_or(
          (v_iao_banda = 'amenaza' AND banda = 'alto') OR
          (v_iao_banda = 'seguridad' AND banda = 'bajo')
        )
        FROM (SELECT banda FROM inv_out UNION ALL SELECT banda FROM con_out) b
        WHERE banda IS NOT NULL
      )
    END
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$$;

GRANT EXECUTE ON FUNCTION resumen_fpv_organizacion(uuid, text) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════

-- Debe devolver 2 filas
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('organizacion_nombre_por_codigo_fpv', 'resumen_fpv_organizacion');

-- Prueba manual (rol anon, código real):
-- SELECT organizacion_nombre_por_codigo_fpv('<código>');

-- Prueba manual (usuario autenticado) — confirmar que iao/iao_n aparecen
-- y que iao_banda coincide con lo que el Tablero ya muestra para esa
-- organización:
-- SELECT resumen_fpv_organizacion('<org_id>');
