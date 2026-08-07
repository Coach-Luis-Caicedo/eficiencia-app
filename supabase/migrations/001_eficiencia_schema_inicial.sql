-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 001: esquema inicial (reemplaza la API de
-- Railway/FastAPI por Supabase — proyecto propio, separado de A.M.A.R.)
-- Proyecto: kapxcjehfaasttwfnnzq · sa-east-1
-- Ejecutar en: Supabase Dashboard → SQL Editor
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- Diseño aprobado en conversación (ver DOCUMENTO_MARCO_SISTEMA_EFICIENCIA.md
-- para las secciones referenciadas en los comentarios de cada bloque).
--
-- ── Cambio de última hora respecto a la propuesta original ──────────
-- La propuesta inicial usaba UN token compartido por organización
-- (organizaciones.token) + un respondente_id generado en el cliente
-- (sessionStorage, no persistente). Se reemplaza por invitaciones
-- INDIVIDUALES: un código único por persona, generado en bloque al
-- crear las invitaciones, sin nombre asociado (el mapa código↔persona
-- vive fuera de esta base de datos — marco, sección 9.5). El código
-- individual ahora ES el identificador persistente del respondiente
-- — resuelve el hallazgo de que sessionStorage no sobrevive entre
-- dispositivos ni entre cierres de pestaña, algo que la Función de
-- Tendencia del SD-MO (marco, sección 8) necesita para no perder
-- continuidad de una persona que responde desde el celular un día y
-- la computadora otro.
--
-- Token: mismo generador que invitaciones_link de A.M.A.R. — dos
-- gen_random_uuid() concatenados sin guiones (64 hex, 256 bits),
-- nativo desde PG13, sin depender de pgcrypto.
--
-- SECURITY DEFINER en vez de un Worker de borde (como el de A.M.A.R.):
-- decisión explícita — mismo principio aplicado ya varias veces en la
-- reconstrucción del marco, no duplicar infraestructura para la misma
-- tarea conceptual cuando la versión simple logra la misma propiedad
-- de seguridad (el cliente anon nunca ve ni controla organizacion_id,
-- solo pasa un código de invitación). Reconsiderar con un Worker /
-- rate-limiting de borde si en algún momento hay evidencia real de
-- abuso — no antes.
--
-- N≥8-10 (marco, sección 9.1): no se puede expresar en una policy de
-- RLS (RLS evalúa fila por fila, el mínimo es una condición de
-- agregación). Se resuelve bloqueando el acceso directo a las tablas
-- de respuestas para 'authenticated' y 'anon' por completo, exponiendo
-- lectura únicamente a través de funciones SECURITY DEFINER que
-- agregan y aplican el mínimo con HAVING antes de devolver algo.
-- ══════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════
-- 1. TABLAS
-- ══════════════════════════════════════════════════════════════════

-- ── 1.1 organizaciones ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizaciones (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text NOT NULL,
  activa     boolean NOT NULL DEFAULT true,
  creado_en  timestamptz NOT NULL DEFAULT now()
);

-- ── 1.2 consultores (extensión de auth.users, patrón estándar Supabase) ──
CREATE TABLE IF NOT EXISTS consultores (
  id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre    text NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

-- ── 1.3 consultor_organizacion (puente) ──────────────────────────
CREATE TABLE IF NOT EXISTS consultor_organizacion (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultor_id     uuid NOT NULL REFERENCES consultores(id) ON DELETE CASCADE,
  organizacion_id  uuid NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
  rol              text NOT NULL DEFAULT 'consultor' CHECK (rol IN ('consultor','custodio')),
  vinculado_en     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (consultor_id, organizacion_id)
);

-- ── 1.4 invitaciones_individuales ────────────────────────────────
-- Un código por persona, sin nombre ni email asociado. Se genera en
-- bloque (ver generar_invitaciones_individuales más abajo); RRHH hace
-- el mail-merge del código con la lista real de empleados FUERA de
-- este sistema — EFICIENCIA nunca aprende esa correspondencia.
CREATE TABLE IF NOT EXISTS invitaciones_individuales (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id  uuid NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
  codigo           text NOT NULL UNIQUE
                     DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  activa           boolean NOT NULL DEFAULT true,
  creado_en        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitaciones_individuales_org
  ON invitaciones_individuales (organizacion_id);

-- ── 1.5 respuestas_cuestionario ──────────────────────────────────
-- Header por envío. invitacion_id es ahora el identificador del
-- respondiente — reemplaza el respondente_id de texto libre.
CREATE TABLE IF NOT EXISTS respuestas_cuestionario (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitacion_id   uuid NOT NULL REFERENCES invitaciones_individuales(id) ON DELETE CASCADE,
  organizacion_id uuid NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
  area            text,       -- normalizado (trim + minúsculas) en la función de inserción
  antiguedad      text,
  nivel           text CHECK (nivel IN ('directivo','mando_medio','colaborador')),
  periodo         text NOT NULL,   -- 'YYYY-S1' / 'YYYY-S2', calculado server-side
  respuestas_raw  jsonb NOT NULL,  -- las 25 respuestas 1-5 crudas — trazabilidad completa
                                    -- (marco, sección 6: la cadena empieza en la respuesta cruda)
  creado_en       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invitacion_id, periodo)
);

CREATE INDEX IF NOT EXISTS idx_resp_cuest_org ON respuestas_cuestionario (organizacion_id);
CREATE INDEX IF NOT EXISTS idx_resp_cuest_invitacion ON respuestas_cuestionario (invitacion_id);

-- ── 1.6 respuestas_cuestionario_pares ────────────────────────────
-- Formato largo (1 fila por par, 5 filas por envío) en vez de columnas
-- anchas — el marco analiza siempre "por cada par, por separado"
-- (secciones 5.2, 5.4, 9.4): GROUP BY par es trivial así; con columnas
-- pareX_conceptoY necesitarías UNION o lógica repetida 5 veces.
CREATE TABLE IF NOT EXISTS respuestas_cuestionario_pares (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  respuesta_id      uuid NOT NULL REFERENCES respuestas_cuestionario(id) ON DELETE CASCADE,
  par               smallint NOT NULL CHECK (par BETWEEN 1 AND 5),
  concepto_a        numeric CHECK (concepto_a BETWEEN 0 AND 1),  -- lado ICE
  concepto_b        numeric CHECK (concepto_b BETWEEN 0 AND 1),  -- lado IEH
  bipolar           numeric CHECK (bipolar BETWEEN -1 AND 1),
  -- Nunca se confía en el valor que calcule el cliente — se recalcula
  -- siempre server-side a partir de concepto_a/concepto_b.
  brecha_calculada  numeric GENERATED ALWAYS AS (concepto_a - concepto_b) STORED,
  UNIQUE (respuesta_id, par)
);

CREATE INDEX IF NOT EXISTS idx_resp_cuest_pares_respuesta ON respuestas_cuestionario_pares (respuesta_id);
CREATE INDEX IF NOT EXISTS idx_resp_cuest_pares_par ON respuestas_cuestionario_pares (par);

-- ── 1.7 respuestas_sdmo ──────────────────────────────────────────
-- Tabla ancha (4 ejes fijos) — a diferencia del cuestionario, el SD-MO
-- no tiene el mismo requisito de análisis "por eje separado" en el
-- marco, así que no se normaliza en tabla hija.
CREATE TABLE IF NOT EXISTS respuestas_sdmo (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitacion_id             uuid NOT NULL REFERENCES invitaciones_individuales(id) ON DELETE CASCADE,
  organizacion_id           uuid NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
  area                      text,   -- normalizado igual que en respuestas_cuestionario
  jornada                   date NOT NULL,
  ida_i                     numeric CHECK (ida_i BETWEEN 0 AND 100),
  confianza_temor           numeric CHECK (confianza_temor BETWEEN 0 AND 1),
  colaboracion_retencion    numeric CHECK (colaboracion_retencion BETWEEN 0 AND 1),
  compromiso_desmotivacion  numeric CHECK (compromiso_desmotivacion BETWEEN 0 AND 1),
  creatividad_estres        numeric CHECK (creatividad_estres BETWEEN 0 AND 1),
  creado_en                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invitacion_id, jornada)
);

CREATE INDEX IF NOT EXISTS idx_resp_sdmo_org ON respuestas_sdmo (organizacion_id);
CREATE INDEX IF NOT EXISTS idx_resp_sdmo_invitacion ON respuestas_sdmo (invitacion_id);
CREATE INDEX IF NOT EXISTS idx_resp_sdmo_jornada ON respuestas_sdmo (jornada);

-- ── 1.8 log_acceso_confidencial ──────────────────────────────────
-- Tabla lista para el rol de custodio (marco, sección 9.2). El flujo
-- de consulta que escribe aquí (función SECURITY DEFINER dedicada,
-- con más acceso que resumen_par_organizacion) no se construye en
-- esta migración — pendiente hasta que se active el rol.
CREATE TABLE IF NOT EXISTS log_acceso_confidencial (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  custodio_id      uuid NOT NULL REFERENCES consultores(id) ON DELETE CASCADE,
  organizacion_id  uuid NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
  consulta         text NOT NULL,
  consultado_en    timestamptz NOT NULL DEFAULT now()
);


-- ══════════════════════════════════════════════════════════════════
-- 2. ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE organizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultores ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultor_organizacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitaciones_individuales ENABLE ROW LEVEL SECURITY;
ALTER TABLE respuestas_cuestionario ENABLE ROW LEVEL SECURITY;
ALTER TABLE respuestas_cuestionario_pares ENABLE ROW LEVEL SECURITY;
ALTER TABLE respuestas_sdmo ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_acceso_confidencial ENABLE ROW LEVEL SECURITY;

-- ── 2.1 organizaciones ───────────────────────────────────────────
DROP POLICY IF EXISTS "organizaciones_select_consultor" ON organizaciones;
CREATE POLICY "organizaciones_select_consultor"
  ON organizaciones FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM consultor_organizacion
      WHERE consultor_organizacion.organizacion_id = organizaciones.id
        AND consultor_organizacion.consultor_id = auth.uid()
    )
  );
-- Sin policy de INSERT/UPDATE para authenticated — la creación de
-- organizaciones la hace Luis manualmente (o vía service_role) por
-- ahora. No hay flujo de autoservicio todavía.

-- ── 2.2 consultores ───────────────────────────────────────────────
DROP POLICY IF EXISTS "consultores_select_propio" ON consultores;
CREATE POLICY "consultores_select_propio"
  ON consultores FOR SELECT
  USING (id = auth.uid());

-- ── 2.3 consultor_organizacion ────────────────────────────────────
DROP POLICY IF EXISTS "consultor_organizacion_select_propio" ON consultor_organizacion;
CREATE POLICY "consultor_organizacion_select_propio"
  ON consultor_organizacion FOR SELECT
  USING (consultor_id = auth.uid());
-- Sin policy de INSERT/DELETE para authenticated — vincular
-- consultor↔organización es manual (service_role) mientras Luis sea
-- el único que asigna accesos.

-- ── 2.4 invitaciones_individuales ─────────────────────────────────
-- SELECT para consultores vinculados (ver progreso: cuántos códigos
-- existen, cuáles están activos — sin nombre asociado, no hay riesgo
-- de identificación). Sin policy de INSERT para nadie: se generan
-- exclusivamente vía generar_invitaciones_individuales() (sección 3).
DROP POLICY IF EXISTS "invitaciones_individuales_select_consultor" ON invitaciones_individuales;
CREATE POLICY "invitaciones_individuales_select_consultor"
  ON invitaciones_individuales FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM consultor_organizacion
      WHERE consultor_organizacion.organizacion_id = invitaciones_individuales.organizacion_id
        AND consultor_organizacion.consultor_id = auth.uid()
    )
  );

-- ── 2.5 / 2.6 / 2.7 tablas de respuestas ──────────────────────────
-- Deliberadamente SIN ninguna policy de SELECT/INSERT para 'anon' ni
-- 'authenticated'. RLS habilitado + cero policies = acceso denegado
-- por defecto para esos roles. Todo el tráfico pasa por funciones
-- SECURITY DEFINER (sección 3): escritura vía enviar_respuesta_*,
-- lectura vía resumen_*. Ni siquiera el consultor dueño de la
-- organización puede hacer SELECT directo — más estricto que "N≥8-10
-- documentado como regla", el mínimo queda forzado en el único camino
-- de lectura que existe. Si esto resulta demasiado restrictivo para
-- trabajo real de QA fila por fila, es una decisión reversible.
--
-- (respuestas_cuestionario, respuestas_cuestionario_pares, respuestas_sdmo)

-- ── 2.8 log_acceso_confidencial ───────────────────────────────────
-- Sin policy de lectura para nadie salvo service_role — se escribe
-- desde una función SECURITY DEFINER todavía no construida (ver 1.8).


-- ══════════════════════════════════════════════════════════════════
-- 3. FUNCIONES SECURITY DEFINER
-- ══════════════════════════════════════════════════════════════════

-- ── 3.1 generar_invitaciones_individuales ─────────────────────────
-- Genera N códigos de invitación en bloque para una organización.
-- El consultor exporta el resultado (id, codigo) y hace el mail-merge
-- con la lista real de empleados fuera de este sistema.
CREATE OR REPLACE FUNCTION generar_invitaciones_individuales(
  p_organizacion_id uuid,
  p_cantidad int
) RETURNS TABLE (id uuid, codigo text)
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE organizacion_id = p_organizacion_id AND consultor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'no autorizado para esta organización';
  END IF;

  IF p_cantidad < 1 OR p_cantidad > 5000 THEN
    RAISE EXCEPTION 'cantidad fuera de rango (1-5000)';
  END IF;

  RETURN QUERY
  INSERT INTO invitaciones_individuales (organizacion_id)
  SELECT p_organizacion_id FROM generate_series(1, p_cantidad)
  RETURNING invitaciones_individuales.id, invitaciones_individuales.codigo;
END;
$$;

GRANT EXECUTE ON FUNCTION generar_invitaciones_individuales(uuid, int) TO authenticated;


-- ── 3.2 enviar_respuesta_cuestionario ──────────────────────────────
-- p_codigo resuelve invitacion_id + organizacion_id — el cliente
-- (anon) nunca pasa ni ve un organizacion_id directo. periodo se
-- calcula server-side, no se confía en el reloj del cliente.
-- p_pares: jsonb array de 5 objetos {par, concepto_a, concepto_b, bipolar}
-- (forma exacta del objeto `pares` que ya produce calcScores() en
-- cuestionario.html — ver paso 3 de esta migración de arquitectura).
CREATE OR REPLACE FUNCTION enviar_respuesta_cuestionario(
  p_codigo          text,
  p_area            text,
  p_antiguedad      text,
  p_nivel           text,
  p_pares           jsonb,
  p_respuestas_raw  jsonb
) RETURNS uuid
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_invitacion_id  uuid;
  v_organizacion_id uuid;
  v_periodo        text;
  v_area           text;
  v_resp_id        uuid;
  v_par            jsonb;
BEGIN
  SELECT id, organizacion_id INTO v_invitacion_id, v_organizacion_id
  FROM invitaciones_individuales
  WHERE codigo = p_codigo AND activa;

  IF v_invitacion_id IS NULL THEN
    RAISE EXCEPTION 'código de invitación inválido o inactivo';
  END IF;

  v_periodo := extract(year FROM now())::text
               || CASE WHEN extract(month FROM now()) <= 6 THEN '-S1' ELSE '-S2' END;
  v_area := NULLIF(trim(lower(p_area)), '');

  INSERT INTO respuestas_cuestionario
    (invitacion_id, organizacion_id, area, antiguedad, nivel, periodo, respuestas_raw)
  VALUES
    (v_invitacion_id, v_organizacion_id, v_area, p_antiguedad, p_nivel, v_periodo, p_respuestas_raw)
  ON CONFLICT (invitacion_id, periodo) DO UPDATE
    SET area = EXCLUDED.area,
        antiguedad = EXCLUDED.antiguedad,
        nivel = EXCLUDED.nivel,
        respuestas_raw = EXCLUDED.respuestas_raw
  RETURNING id INTO v_resp_id;

  DELETE FROM respuestas_cuestionario_pares WHERE respuesta_id = v_resp_id;

  FOR v_par IN SELECT * FROM jsonb_array_elements(p_pares) LOOP
    INSERT INTO respuestas_cuestionario_pares (respuesta_id, par, concepto_a, concepto_b, bipolar)
    VALUES (
      v_resp_id,
      (v_par->>'par')::smallint,
      (v_par->>'concepto_a')::numeric,
      (v_par->>'concepto_b')::numeric,
      (v_par->>'bipolar')::numeric
    );
  END LOOP;

  RETURN v_resp_id;
END;
$$;

GRANT EXECUTE ON FUNCTION enviar_respuesta_cuestionario(text, text, text, text, jsonb, jsonb) TO anon;


-- ── 3.3 enviar_respuesta_sdmo ──────────────────────────────────────
CREATE OR REPLACE FUNCTION enviar_respuesta_sdmo(
  p_codigo                     text,
  p_area                       text,
  p_jornada                    date,
  p_ida_i                      numeric,
  p_confianza_temor            numeric,
  p_colaboracion_retencion     numeric,
  p_compromiso_desmotivacion   numeric,
  p_creatividad_estres         numeric
) RETURNS uuid
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_invitacion_id   uuid;
  v_organizacion_id uuid;
  v_area            text;
  v_resp_id         uuid;
BEGIN
  SELECT id, organizacion_id INTO v_invitacion_id, v_organizacion_id
  FROM invitaciones_individuales
  WHERE codigo = p_codigo AND activa;

  IF v_invitacion_id IS NULL THEN
    RAISE EXCEPTION 'código de invitación inválido o inactivo';
  END IF;

  v_area := NULLIF(trim(lower(p_area)), '');

  INSERT INTO respuestas_sdmo
    (invitacion_id, organizacion_id, area, jornada, ida_i,
     confianza_temor, colaboracion_retencion, compromiso_desmotivacion, creatividad_estres)
  VALUES
    (v_invitacion_id, v_organizacion_id, v_area, p_jornada, p_ida_i,
     p_confianza_temor, p_colaboracion_retencion, p_compromiso_desmotivacion, p_creatividad_estres)
  ON CONFLICT (invitacion_id, jornada) DO UPDATE
    SET area = EXCLUDED.area,
        ida_i = EXCLUDED.ida_i,
        confianza_temor = EXCLUDED.confianza_temor,
        colaboracion_retencion = EXCLUDED.colaboracion_retencion,
        compromiso_desmotivacion = EXCLUDED.compromiso_desmotivacion,
        creatividad_estres = EXCLUDED.creatividad_estres
  RETURNING id INTO v_resp_id;

  RETURN v_resp_id;
END;
$$;

GRANT EXECUTE ON FUNCTION enviar_respuesta_sdmo(text, text, date, numeric, numeric, numeric, numeric, numeric) TO anon;


-- ── 3.4 resumen_par_organizacion ───────────────────────────────────
-- Primer corte del camino de lectura para el Workbook — se amplía
-- según necesidad real cuando se construya esa parte (fuera de
-- alcance de esta migración). Aplica el mínimo N≥8-10 con HAVING:
-- si no se cumple, la función devuelve 0 filas, no un error ni datos
-- parciales.
CREATE OR REPLACE FUNCTION resumen_par_organizacion(
  p_organizacion_id uuid,
  p_par             smallint,
  p_departamento    text DEFAULT NULL
) RETURNS TABLE (
  n                 bigint,
  concepto_a_prom   numeric,
  concepto_b_prom   numeric,
  bipolar_prom      numeric,
  brecha_prom       numeric
)
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE organizacion_id = p_organizacion_id AND consultor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'no autorizado para esta organización';
  END IF;

  RETURN QUERY
  SELECT
    count(*),
    avg(p.concepto_a),
    avg(p.concepto_b),
    avg(p.bipolar),
    avg(p.brecha_calculada)
  FROM respuestas_cuestionario_pares p
  JOIN respuestas_cuestionario r ON r.id = p.respuesta_id
  WHERE r.organizacion_id = p_organizacion_id
    AND p.par = p_par
    AND (p_departamento IS NULL OR r.area = NULLIF(trim(lower(p_departamento)), ''))
  HAVING count(*) >= 8;
END;
$$;

GRANT EXECUTE ON FUNCTION resumen_par_organizacion(uuid, smallint, text) TO authenticated;


-- ── 3.5 resumen_sdmo_organizacion ──────────────────────────────────
-- Mismo criterio de N≥8-10 aplicado al SD-MO, agregado por rango de
-- fechas (la Función de Tendencia del marco, sección 8, necesita
-- ventanas de tiempo, no solo un promedio total).
CREATE OR REPLACE FUNCTION resumen_sdmo_organizacion(
  p_organizacion_id uuid,
  p_desde           date,
  p_hasta           date,
  p_departamento    text DEFAULT NULL
) RETURNS TABLE (
  n                             bigint,
  ida_i_prom                    numeric,
  confianza_temor_prom          numeric,
  colaboracion_retencion_prom   numeric,
  compromiso_desmotivacion_prom numeric,
  creatividad_estres_prom       numeric
)
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE organizacion_id = p_organizacion_id AND consultor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'no autorizado para esta organización';
  END IF;

  RETURN QUERY
  SELECT
    count(*),
    avg(ida_i),
    avg(confianza_temor),
    avg(colaboracion_retencion),
    avg(compromiso_desmotivacion),
    avg(creatividad_estres)
  FROM respuestas_sdmo
  WHERE organizacion_id = p_organizacion_id
    AND jornada BETWEEN p_desde AND p_hasta
    AND (p_departamento IS NULL OR area = NULLIF(trim(lower(p_departamento)), ''))
  HAVING count(*) >= 8;
END;
$$;

GRANT EXECUTE ON FUNCTION resumen_sdmo_organizacion(uuid, date, date, text) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════

-- Debe devolver 8 filas
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'organizaciones','consultores','consultor_organizacion',
    'invitaciones_individuales','respuestas_cuestionario',
    'respuestas_cuestionario_pares','respuestas_sdmo','log_acceso_confidencial'
  );

-- Debe devolver true para las 8 tablas (RLS habilitado)
SELECT relname, relrowsecurity FROM pg_class
WHERE relname IN (
  'organizaciones','consultores','consultor_organizacion',
  'invitaciones_individuales','respuestas_cuestionario',
  'respuestas_cuestionario_pares','respuestas_sdmo','log_acceso_confidencial'
);

-- Debe devolver 5 filas (organizaciones, consultores, consultor_organizacion,
-- invitaciones_individuales × 1 policy cada una)
SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public';

-- Debe devolver 5 filas (las funciones SECURITY DEFINER de la sección 3)
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name IN (
  'generar_invitaciones_individuales','enviar_respuesta_cuestionario',
  'enviar_respuesta_sdmo','resumen_par_organizacion','resumen_sdmo_organizacion'
);

-- Sanity check del generador de código: debe devolver 64 (solo hex, sin guiones)
SELECT length(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));
