-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 008: Sensor FPV — tablas y funciones
-- (interfaz — formulario, panel en el Workbook — queda para una
-- migración/prompt aparte, después de que esto esté aplicado y
-- verificado)
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- Diseño: DOCUMENTO_MARCO_SISTEMA_EFICIENCIA.md, sección 10.
--
-- ── Decisiones no explícitas en el diseño de sección 10, resueltas y
-- confirmadas por Luis en conversación ──────────────────────────────
--   1. Periodicidad = semestral ('YYYY-S1'/'YYYY-S2'), no trimestral —
--      sección 10.7 deja ambas abiertas; se elige semestral para
--      reutilizar el mismo cálculo server-side que enviar_respuesta_
--      cuestionario, sin lógica de período nueva.
--   2. Bandas IAO (Seguridad ≤50 / Alerta 50-65 / Amenaza ≥65) para la
--      validación cruzada de 10.6 — prestadas de los umbrales del IDA
--      (sección 9.2), misma fórmula γ/segundo_mayor×100. Tan
--      provisional como el resto (sección 6.4: ningún umbral de
--      severidad está confirmado sin datos del piloto).
--   3. Bandas FPV (alto ≥4 / bajo ≤2, escala 1-5) — heurística simple,
--      simétrica al punto neutro (3), solo para poder comparar contra
--      la banda del IAO en 10.6.
--   4. p_periodo (opcional) agregado a resumen_fpv_organizacion, más
--      allá de la firma original del prompt — sin esto se mezclarían
--      olas de encuesta distintas en el mismo promedio (mismo problema
--      que corrigió la migración 002 para el cuestionario). Por
--      defecto resuelve el período más reciente por actor,
--      independientemente (Inversionista y Consumidor pueden estar en
--      ciclos distintos).
--   5. generar_invitaciones_fpv cubre ambos actores en una función,
--      con Consumidor idempotente: si ya existe un link activo para la
--      organización, lo devuelve en vez de crear uno nuevo — evita que
--      clicks repetidos en el Workbook dupliquen el link público.
--      Reforzado con un índice único parcial a nivel de base de datos.
--   6. Rango de cantidad para Inversionista: 1-500 (vs. 1-5000 para
--      colaboradores) — sección 10.4: "típicamente pocas personas".
-- ══════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════
-- 1. TABLAS
-- ══════════════════════════════════════════════════════════════════

-- ── 1.1 invitaciones_fpv ─────────────────────────────────────────
-- Separada de invitaciones_individuales (marco 10.4): Inversionista usa
-- códigos nominales, uno por persona (mismo patrón que colaboradores).
-- Consumidor usa UN SOLO código por organización — el link público de
-- muestreo — generado/reutilizado por generar_invitaciones_fpv (sección 3.3).
CREATE TABLE IF NOT EXISTS invitaciones_fpv (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id  uuid NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
  tipo_actor       text NOT NULL CHECK (tipo_actor IN ('inversionista', 'consumidor')),
  codigo           text NOT NULL UNIQUE
                     DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  activa           boolean NOT NULL DEFAULT true,
  creado_en        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitaciones_fpv_org ON invitaciones_fpv (organizacion_id);

-- Defensa en profundidad para el singleton de Consumidor (decisión 5
-- arriba) — a nivel de base de datos, no solo en la lógica de la
-- función, por si dos llamadas concurrentes intentan crear el link
-- a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitaciones_fpv_consumidor_unico
  ON invitaciones_fpv (organizacion_id)
  WHERE tipo_actor = 'consumidor' AND activa;

-- ── 1.2 respuestas_fpv ───────────────────────────────────────────
-- Tabla ancha (6 preguntas fijas) — mismo criterio que respuestas_sdmo
-- (migración 001): no varía por par, no necesita formato largo.
--
-- Sin UNIQUE(invitacion_id, periodo): para Consumidor, muchas respuestas
-- comparten el mismo invitacion_id (el único código de la organización)
-- a propósito — no es el mismo caso que invitaciones_individuales, donde
-- un código = una persona. Para Inversionista, en la práctica solo habrá
-- una fila por código/período, pero no se fuerza con una restricción:
-- no aporta nada y complica el caso de alguien corrigiendo su respuesta.
CREATE TABLE IF NOT EXISTS respuestas_fpv (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id     uuid NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
  invitacion_id       uuid NOT NULL REFERENCES invitaciones_fpv(id) ON DELETE CASCADE,
  tipo_actor          text NOT NULL CHECK (tipo_actor IN ('inversionista', 'consumidor')),
  periodo             text NOT NULL,   -- 'YYYY-S1'/'YYYY-S2', calculado server-side
  fiabilidad_1        numeric CHECK (fiabilidad_1 BETWEEN 1 AND 5),
  fiabilidad_2        numeric CHECK (fiabilidad_2 BETWEEN 1 AND 5),
  proporcionalidad_1  numeric CHECK (proporcionalidad_1 BETWEEN 1 AND 5),
  proporcionalidad_2  numeric CHECK (proporcionalidad_2 BETWEEN 1 AND 5),
  vinculo_1           numeric CHECK (vinculo_1 BETWEEN 1 AND 5),
  vinculo_2           numeric CHECK (vinculo_2 BETWEEN 1 AND 5),
  creado_en           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resp_fpv_org_tipo ON respuestas_fpv (organizacion_id, tipo_actor);
CREATE INDEX IF NOT EXISTS idx_resp_fpv_invitacion ON respuestas_fpv (invitacion_id);


-- ══════════════════════════════════════════════════════════════════
-- 2. ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE invitaciones_fpv ENABLE ROW LEVEL SECURITY;
ALTER TABLE respuestas_fpv   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invitaciones_fpv_select_consultor" ON invitaciones_fpv;
CREATE POLICY "invitaciones_fpv_select_consultor"
  ON invitaciones_fpv FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM consultor_organizacion
      WHERE consultor_organizacion.organizacion_id = invitaciones_fpv.organizacion_id
        AND consultor_organizacion.consultor_id = auth.uid()
    )
  );
-- Sin policy de INSERT: se generan exclusivamente vía generar_invitaciones_fpv().

-- GRANT explícito — "Automatically expose new tables" sigue apagado
-- (mismo hueco que corrigieron las migraciones 003/004). A diferencia de
-- invitaciones_individuales (migración 003, que lo difirió porque nada
-- lo consumía todavía), aquí se agrega ahora por instrucción explícita.
GRANT SELECT ON invitaciones_fpv TO authenticated;

-- respuestas_fpv: deliberadamente SIN ninguna policy para anon ni
-- authenticated — mismo criterio que respuestas_cuestionario/respuestas_sdmo
-- (migración 001, 2.5-2.7). Todo acceso pasa por enviar_respuesta_fpv
-- (escritura) y resumen_fpv_organizacion (lectura, con el mínimo N≥8
-- aplicado solo a Consumidor — marco 10.5).


-- ══════════════════════════════════════════════════════════════════
-- 3. FUNCIONES SECURITY DEFINER
-- ══════════════════════════════════════════════════════════════════

-- ── 3.1 enviar_respuesta_fpv ─────────────────────────────────────
-- Mismo patrón que enviar_respuesta_cuestionario: p_codigo resuelve
-- organizacion_id Y tipo_actor — el cliente anon nunca los ve ni los
-- controla. periodo se calcula server-side.
CREATE OR REPLACE FUNCTION enviar_respuesta_fpv(
  p_codigo             text,
  p_fiabilidad_1       numeric,
  p_fiabilidad_2       numeric,
  p_proporcionalidad_1 numeric,
  p_proporcionalidad_2 numeric,
  p_vinculo_1          numeric,
  p_vinculo_2          numeric
) RETURNS uuid
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_invitacion_id   uuid;
  v_organizacion_id uuid;
  v_tipo_actor      text;
  v_periodo         text;
  v_resp_id         uuid;
BEGIN
  SELECT id, organizacion_id, tipo_actor
    INTO v_invitacion_id, v_organizacion_id, v_tipo_actor
  FROM invitaciones_fpv
  WHERE codigo = p_codigo AND activa;

  IF v_invitacion_id IS NULL THEN
    RAISE EXCEPTION 'código de invitación inválido o inactivo';
  END IF;

  v_periodo := extract(year FROM now())::text
               || CASE WHEN extract(month FROM now()) <= 6 THEN '-S1' ELSE '-S2' END;

  INSERT INTO respuestas_fpv (
    organizacion_id, invitacion_id, tipo_actor, periodo,
    fiabilidad_1, fiabilidad_2, proporcionalidad_1, proporcionalidad_2,
    vinculo_1, vinculo_2
  ) VALUES (
    v_organizacion_id, v_invitacion_id, v_tipo_actor, v_periodo,
    p_fiabilidad_1, p_fiabilidad_2, p_proporcionalidad_1, p_proporcionalidad_2,
    p_vinculo_1, p_vinculo_2
  )
  RETURNING id INTO v_resp_id;

  RETURN v_resp_id;
END;
$$;

GRANT EXECUTE ON FUNCTION enviar_respuesta_fpv(text, numeric, numeric, numeric, numeric, numeric, numeric) TO anon;


-- ── 3.2 resumen_fpv_organizacion ─────────────────────────────────
-- Confidencialidad diferenciada (marco 10.5): Inversionista sin mínimo
-- N (el Directivo ya lo conoce); Consumidor con el mismo N≥8 que el
-- resto del sistema. Incluye la validación cruzada liviana de 10.6:
-- reutiliza el IAO que ya calcula resumen_organizacion_completo (no lo
-- recalcula — el FPV no toca el núcleo estadístico, marco 10.2).
CREATE OR REPLACE FUNCTION resumen_fpv_organizacion(
  p_organizacion_id uuid,
  p_periodo         text DEFAULT NULL
) RETURNS jsonb
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_n_minimo     CONSTANT int := 8;  -- marco 9.1 — aplica SOLO a consumidor (marco 10.5)
  v_iao_json     jsonb;
  v_iao          numeric;
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
  v_iao_n_sufic := (v_iao_json->>'iao_n_suficiente')::boolean;

  -- Bandas prestadas del IDA (sección 9.2) — mismo 0-100, misma fórmula
  -- γ/segundo_mayor. Provisional, igual que todo umbral no calibrado
  -- (marco 6.4) — sin datos del piloto no hay número definitivo.
  v_iao_banda := CASE
    WHEN v_iao IS NULL OR NOT v_iao_n_sufic THEN NULL
    WHEN v_iao >= 65 THEN 'amenaza'
    WHEN v_iao <= 50 THEN 'seguridad'
    ELSE 'alerta'
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


-- ── 3.3 generar_invitaciones_fpv ─────────────────────────────────
-- Inversionista: genera p_cantidad códigos nominales nuevos, mismo
-- patrón que generar_invitaciones_individuales (rango más chico: 1-500,
-- marco 10.4 — "típicamente pocas personas").
--
-- Consumidor: idempotente. Un solo link por organización — si ya existe
-- uno activo, lo devuelve en vez de crear otro (evita que reintentos
-- desde el Workbook dupliquen el link público). Reforzado con el índice
-- único parcial de la sección 1.1.
CREATE OR REPLACE FUNCTION generar_invitaciones_fpv(
  p_organizacion_id uuid,
  p_tipo_actor      text,
  p_cantidad        int DEFAULT NULL
) RETURNS TABLE (id uuid, codigo text)
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_existente_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE organizacion_id = p_organizacion_id AND consultor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'no autorizado para esta organización';
  END IF;

  IF p_tipo_actor NOT IN ('inversionista', 'consumidor') THEN
    RAISE EXCEPTION 'tipo de actor inválido — debe ser inversionista o consumidor';
  END IF;

  IF p_tipo_actor = 'inversionista' THEN
    IF p_cantidad IS NULL OR p_cantidad < 1 OR p_cantidad > 500 THEN
      RAISE EXCEPTION 'cantidad fuera de rango (1-500) para inversionista';
    END IF;

    RETURN QUERY
    INSERT INTO invitaciones_fpv (organizacion_id, tipo_actor)
    SELECT p_organizacion_id, 'inversionista' FROM generate_series(1, p_cantidad)
    RETURNING invitaciones_fpv.id, invitaciones_fpv.codigo;

  ELSE -- consumidor
    IF p_cantidad IS NOT NULL AND p_cantidad <> 1 THEN
      RAISE EXCEPTION 'consumidor usa un único link por organización — no se acepta cantidad';
    END IF;

    SELECT invitaciones_fpv.id INTO v_existente_id
    FROM invitaciones_fpv
    WHERE organizacion_id = p_organizacion_id AND tipo_actor = 'consumidor' AND activa
    LIMIT 1;

    IF v_existente_id IS NOT NULL THEN
      RETURN QUERY
      SELECT invitaciones_fpv.id, invitaciones_fpv.codigo
      FROM invitaciones_fpv WHERE invitaciones_fpv.id = v_existente_id;
    ELSE
      RETURN QUERY
      INSERT INTO invitaciones_fpv (organizacion_id, tipo_actor)
      VALUES (p_organizacion_id, 'consumidor')
      RETURNING invitaciones_fpv.id, invitaciones_fpv.codigo;
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION generar_invitaciones_fpv(uuid, text, int) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════

-- Debe devolver 2 filas
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('invitaciones_fpv', 'respuestas_fpv');

-- Debe devolver true para ambas
SELECT relname, relrowsecurity FROM pg_class
WHERE relname IN ('invitaciones_fpv', 'respuestas_fpv');

-- Debe devolver 3 filas (las 3 funciones nuevas)
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('enviar_respuesta_fpv', 'resumen_fpv_organizacion', 'generar_invitaciones_fpv');

-- Prueba manual 1 (usuario autenticado real, organización de prueba):
-- SELECT * FROM generar_invitaciones_fpv('<org_id>', 'inversionista', 3);   -- 3 filas
-- SELECT * FROM generar_invitaciones_fpv('<org_id>', 'consumidor', 1);      -- 1 fila
-- SELECT * FROM generar_invitaciones_fpv('<org_id>', 'consumidor', 1);      -- MISMA fila (idempotente)

-- Prueba manual 2 (rol anon, con un código real de los generados arriba):
-- SELECT enviar_respuesta_fpv('<código inversionista>', 5,5,4,4,5,5);
-- SELECT enviar_respuesta_fpv('<código consumidor>', 3,3,2,2,3,3);

-- Prueba manual 3 (usuario autenticado):
-- SELECT resumen_fpv_organizacion('<org_id>');
