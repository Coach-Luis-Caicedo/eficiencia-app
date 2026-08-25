-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 020: mecanismo de calibración bayesiana
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- Diseño completo discutido y aprobado con Luis antes de escribir este
-- archivo — ver C:\Users\Luis Caicedo\.claude\plans\distributed-brewing-wren.md
-- para el razonamiento completo (por qué Bühlmann, por qué ámbito
-- global/local, qué se descartó y por qué). Resumen de lo que resuelve:
--
-- 1. Corrige un bug real de doble-shrinkage en piioGetBenchmarkEfectivo()
--    (workbook.html) — YA CORREGIDO en ese archivo, no en esta migración
--    (es JS, no SQL). Esta migración construye la infraestructura para
--    generalizar el mismo mecanismo (ya correcto) a los parámetros del
--    sistema pendientes de calibración (marco, sección 12).
-- 2. Resuelve la ambigüedad de qué cuenta como "n" para un parámetro
--    compartido por todo el sistema (ambito='global', pooling entre
--    organizaciones — régimen de Efron & Morris 1975) vs. un dato
--    genuinamente por-organización (ambito='local').
-- 3. Crea las 2 tablas que hoy no existen: calibracion_parametros
--    (caché del posterior actual, sembrada con 10 filas) y
--    calibracion_observaciones (formato largo, una fila por
--    organización-período-parámetro).
--
-- ── Lo que esta migración DELIBERADAMENTE NO hace ──
-- No conecta cff_historial a calibracion_observaciones todavía. El
-- diseño original de este punto asumía que se podía fitear λ_org
-- linealizando la serie real de iao_org_usado contra un IAO_target —
-- resultó falso: IAO_target (simular_ift(), migración 019) se calcula
-- en caliente desde el IAO más reciente cada vez que se invoca, nunca
-- se persiste, y no existe como dato histórico real por período. Fitear
-- contra eso habría producido un número con forma de λ sin sustento
-- estadístico. Ver Anexo 2 del documento de diseño para las alternativas
-- consideradas y por qué ninguna se implementa todavía. Mismo criterio
-- para el mecanismo de observación periódica de s_rot/s_aus/s_ret desde
-- Ficha financiera (Anexo 1) — diseñado, pero su propio proyecto aparte.
--
-- Resultado de esta migración: las 10 filas de calibracion_parametros
-- quedan sembradas con n_acumulado=0, mu_post=mu0 (o NULL donde el
-- marco no documenta un prior — delta_ida, s_sup) — listas para recibir
-- observaciones el día que exista una vía de captura real, sin volver a
-- tocar el esquema.
-- ══════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════
-- 1. calibracion_parametros — caché del posterior actual, un parámetro
--    por fila. Ver plan, sección 3.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE calibracion_parametros (
  parametro         text PRIMARY KEY,
  ambito            text NOT NULL CHECK (ambito IN ('global','local')),
  -- mu0 NULL = el marco no documenta un prior numérico para este
  -- parámetro (ver delta_ida, s_sup abajo) — no se inventa un valor sin
  -- decisión explícita. mu_post se queda NULL también mientras mu0 lo
  -- esté (ver recalcular_calibracion_parametro más abajo).
  mu0               numeric,
  fuente_prior      text NOT NULL,  -- cita obligatoria, incluso "sin anclaje externo"
  k0                numeric NOT NULL DEFAULT 3,
  -- k0_sugerido: output de recalcular_k_credibilidad() (sección 4) —
  -- nunca se auto-aplica a k0. Promoverlo es una decisión manual
  -- explícita, mismo criterio que el cambio de umbral_piso 0.5→0.575
  -- en migración 013.
  k0_sugerido       numeric,
  n_acumulado       int NOT NULL DEFAULT 0,
  mu_post           numeric,
  actualizado_en    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE calibracion_parametros IS
  'Caché del posterior bayesiano actual por parámetro del sistema (marco, sección 12). '
  'mu_post = Z·x̄ + (1−Z)·mu0, Z = n/(n+k0) — Bühlmann (1967). Ver plan de diseño '
  'para el razonamiento completo (distributed-brewing-wren.md).';

COMMENT ON COLUMN calibracion_parametros.ambito IS
  'global = parámetro compartido por todas las organizaciones, n_acumulado poolea '
  'organización-períodos de TODOS los clientes (régimen jerárquico, Efron & Morris 1975). '
  'local = dato por-organización, sin Bühlmann-shrinkage (ver Anexo 1 del plan de diseño).';

ALTER TABLE calibracion_parametros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calibracion_parametros_select_authenticated" ON calibracion_parametros;
CREATE POLICY "calibracion_parametros_select_authenticated"
  ON calibracion_parametros FOR SELECT
  USING (auth.role() = 'authenticated');

GRANT SELECT ON calibracion_parametros TO authenticated;

-- Sembrado inicial — 10 filas, todas ambito='global'. tasa_ineficacia_amenaza
-- queda deliberadamente fuera (sin Costo_innovación_perdida implementado
-- ni vía de captura razonable, confirmado con Luis) — no se siembra una
-- fila que nadie va a poder alimentar.
INSERT INTO calibracion_parametros (parametro, ambito, mu0, fuente_prior) VALUES
  ('w_neg',       'global', 0.5,
    'Sin anclaje externo — peso simétrico de diseño frente a w_pos=1 (marco §4).'),
  ('gamma_iao',   'global', 0.5,
    'Sin anclaje externo — peso de diseño promedio/segundo_mayor (marco §4).'),
  ('umbral_piso', 'global', 0.575,
    'Punto medio WHO-5 (0.50) + MBI Realización personal (≈0.645) — '
    'INVESTIGACION_ANCLAJE_UMBRAL_PISO.md, migración 013.'),
  ('causa_margen','global', 0.15,
    'Sin anclaje externo — margen de clasificación ''mixta'' (marco §4, migración 010).'),
  ('lambda',      'global', 0.0578,  -- ln(2)/12
    'Vida media 12 meses, anclado en literatura de cambio organizacional (marco §8.2).'),
  ('s_rot',       'global', 1,
    'Provisional sin calibrar (marco §7.1/8, migraciones 015/019).'),
  ('s_aus',       'global', 1,
    'Provisional sin calibrar (marco §7.1/8, migraciones 015/019).'),
  ('s_ret',       'global', 1,
    'Provisional sin calibrar (marco §7.1/8, migraciones 015/019).'),
  ('delta_ida',   'global', NULL,
    'GAP — el marco (§9.1) da la fórmula (δ×promedio+(1−δ)×segundo_mayor) pero nunca '
    'documenta un valor numérico de δ, a diferencia de γ (0.5 en código). No se infiere '
    'un valor sin decisión explícita de Luis — fila inactiva hasta entonces.'),
  ('s_sup',       'global', NULL,
    'GAP — fórmula de Costo_supervisión existe (marco §7.1) pero no está implementada '
    'en ningún migration SQL, a diferencia de s_rot/s_aus/s_ret. Sin valor documentado — '
    'fila inactiva hasta implementar la fórmula y decidir el prior.');

-- mu_post arranca igual a mu0 (n_acumulado=0 → Z=0 → mu_post=mu0), excepto
-- donde mu0 es NULL — ahí mu_post también se queda NULL.
UPDATE calibracion_parametros SET mu_post = mu0;


-- ══════════════════════════════════════════════════════════════════
-- 2. calibracion_observaciones — formato largo. Ver plan, sección 3.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE calibracion_observaciones (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id    uuid NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
  periodo            text NOT NULL,
  parametro          text NOT NULL REFERENCES calibracion_parametros(parametro),
  valor_observado    numeric NOT NULL,
  -- 'real' = dato medido directamente; 'estimado_fit' = coeficiente
  -- recuperado ajustando un modelo a datos reales de esa organización.
  -- Sin opción 'proxy' — a diferencia de PIIO, nada en este diseño usa
  -- proxies.
  fuente             text NOT NULL CHECK (fuente IN ('real','estimado_fit')),
  capturado_en       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacion_id, periodo, parametro)
);

COMMENT ON TABLE calibracion_observaciones IS
  'Observaciones reales/estimadas por organización-período-parámetro, formato largo '
  '(una fila por parámetro, no una columna por parámetro — agregar un parámetro nuevo '
  'no requiere migración de esquema). UNIQUE(organizacion_id,periodo,parametro) replica '
  'la disciplina de "un punto por período" de cff_historial (migración 014).';

CREATE INDEX idx_calibracion_obs_parametro ON calibracion_observaciones (parametro);
CREATE INDEX idx_calibracion_obs_org ON calibracion_observaciones (organizacion_id);

ALTER TABLE calibracion_observaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calibracion_observaciones_select_consultor" ON calibracion_observaciones;
CREATE POLICY "calibracion_observaciones_select_consultor"
  ON calibracion_observaciones FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM consultor_organizacion
      WHERE consultor_organizacion.organizacion_id = calibracion_observaciones.organizacion_id
        AND consultor_organizacion.consultor_id = auth.uid()
    )
  );

GRANT SELECT ON calibracion_observaciones TO authenticated;

-- Sin policy de INSERT/UPDATE en ninguna de las 2 tablas — todo escribe
-- vía funciones SECURITY DEFINER (recalcular_calibracion_parametro más
-- abajo, y el futuro punto de captura del Anexo 1/2), igual que el resto
-- de las tablas de negocio del sistema.


-- ══════════════════════════════════════════════════════════════════
-- 3. recalcular_calibracion_parametro — recomputa n_acumulado y mu_post
--    para UN parámetro, agregando TODAS sus observaciones (pooling
--    global — ver ambito, comentario de columna arriba). Se dispara
--    solo via trigger (sección siguiente), nunca se llama directo desde
--    el cliente — sin GRANT a authenticated.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION recalcular_calibracion_parametro(p_parametro text)
RETURNS void
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_mu0 numeric;
  v_k0  numeric;
  v_n   int;
  v_xbar numeric;
  v_z   numeric;
BEGIN
  SELECT mu0, k0 INTO v_mu0, v_k0
  FROM calibracion_parametros WHERE parametro = p_parametro;

  IF NOT FOUND THEN
    RETURN;  -- parámetro desconocido — no debería pasar (FK ya lo impide en observaciones)
  END IF;

  SELECT count(*), avg(valor_observado) INTO v_n, v_xbar
  FROM calibracion_observaciones WHERE parametro = p_parametro;

  v_n := COALESCE(v_n, 0);

  IF v_mu0 IS NULL THEN
    -- Sin prior documentado (delta_ida, s_sup mientras no se decida un
    -- valor) — no se blende contra nada. n_acumulado se actualiza para
    -- que quede visible cuánto dato real ya existe, pero mu_post se
    -- queda NULL a propósito.
    UPDATE calibracion_parametros
    SET n_acumulado = v_n, mu_post = NULL, actualizado_en = now()
    WHERE parametro = p_parametro;
    RETURN;
  END IF;

  IF v_n = 0 THEN
    v_z := 0;
    v_xbar := v_mu0;  -- sin observaciones, x̄ no está definido — no se usa (Z=0)
  ELSE
    v_z := v_n::numeric / (v_n + v_k0);
  END IF;

  UPDATE calibracion_parametros
  SET n_acumulado = v_n,
      mu_post = v_z * v_xbar + (1 - v_z) * v_mu0,
      actualizado_en = now()
  WHERE parametro = p_parametro;
END;
$$;

CREATE OR REPLACE FUNCTION _trg_recalcular_calibracion_parametro()
RETURNS trigger
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalcular_calibracion_parametro(OLD.parametro);
    RETURN OLD;
  ELSE
    PERFORM recalcular_calibracion_parametro(NEW.parametro);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_calibracion_observaciones_recalcular ON calibracion_observaciones;
CREATE TRIGGER trg_calibracion_observaciones_recalcular
  AFTER INSERT OR UPDATE OR DELETE ON calibracion_observaciones
  FOR EACH ROW EXECUTE FUNCTION _trg_recalcular_calibracion_parametro();


-- ══════════════════════════════════════════════════════════════════
-- 4. recalcular_k_credibilidad — re-estimación ON-DEMAND de K por
--    método de momentos (Bühlmann 1967): K̂ = Var_dentro_de_grupo /
--    Var_entre_grupos, usando cada organización que aporta al parámetro
--    como un "grupo". NUNCA se llama automáticamente ni sobrescribe k0
--    — solo calcula y guarda una sugerencia en k0_sugerido. Promoverla
--    a k0 es un UPDATE manual explícito (ver plan, sección 1).
--
--    Requiere ≥2 organizaciones con ≥2 observaciones cada una para el
--    parámetro — si no se cumple, deja k0_sugerido sin tocar y no falla
--    (RAISE NOTICE en vez de excepción, para que se pueda llamar sin
--    verificar el umbral primero).
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION recalcular_k_credibilidad(p_parametro text)
RETURNS numeric
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_var_entre  numeric;
  v_var_dentro numeric;
  v_k_sugerido numeric;
  v_grupos_validos int;
BEGIN
  -- Grupos = organizaciones con ≥2 observaciones reales del parámetro.
  SELECT count(*) INTO v_grupos_validos
  FROM (
    SELECT organizacion_id
    FROM calibracion_observaciones
    WHERE parametro = p_parametro
    GROUP BY organizacion_id
    HAVING count(*) >= 2
  ) g;

  IF v_grupos_validos < 2 THEN
    RAISE NOTICE 'recalcular_k_credibilidad(%): solo % organización(es) con ≥2 observaciones — se necesitan ≥2 para estimar K. k0_sugerido no se toca.',
      p_parametro, v_grupos_validos;
    RETURN NULL;
  END IF;

  -- Varianza "dentro": promedio de la varianza de cada organización
  -- respecto a su propia media. Varianza "entre": varianza de las
  -- medias por organización respecto a la media global.
  SELECT avg(var_org) INTO v_var_dentro
  FROM (
    SELECT organizacion_id, var_samp(valor_observado) AS var_org
    FROM calibracion_observaciones
    WHERE parametro = p_parametro
    GROUP BY organizacion_id
    HAVING count(*) >= 2
  ) d;

  SELECT var_samp(media_org) INTO v_var_entre
  FROM (
    SELECT organizacion_id, avg(valor_observado) AS media_org
    FROM calibracion_observaciones
    WHERE parametro = p_parametro
    GROUP BY organizacion_id
    HAVING count(*) >= 2
  ) e;

  IF v_var_entre IS NULL OR v_var_entre = 0 THEN
    RAISE NOTICE 'recalcular_k_credibilidad(%): varianza entre organizaciones es 0 o indefinida — K no estimable todavía.', p_parametro;
    RETURN NULL;
  END IF;

  v_k_sugerido := v_var_dentro / v_var_entre;

  UPDATE calibracion_parametros
  SET k0_sugerido = v_k_sugerido, actualizado_en = now()
  WHERE parametro = p_parametro;

  RETURN v_k_sugerido;
END;
$$;

-- Sin GRANT a authenticated — se corre manualmente (Luis/consultor admin
-- vía SQL editor de Supabase) cuando se quiera revisar si K=3 sigue
-- siendo razonable, no automáticamente.


-- ══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════

-- 1. Debe devolver 10 filas, n_acumulado=0 en todas, mu_post=mu0 excepto
--    delta_ida/s_sup (ambos NULL).
SELECT parametro, ambito, mu0, mu_post, k0, n_acumulado
FROM calibracion_parametros ORDER BY parametro;

-- 2. Debe devolver 2 filas.
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('calibracion_parametros', 'calibracion_observaciones');

-- 3. Prueba del trigger — usar un organizacion_id real de prueba.
-- INSERT INTO calibracion_observaciones (organizacion_id, periodo, parametro, valor_observado, fuente)
--   VALUES ('<uuid_organizacion_prueba>', '2026-01', 'w_neg', 0.62, 'real');
-- SELECT n_acumulado, mu_post FROM calibracion_parametros WHERE parametro = 'w_neg';
-- -- Esperado: n_acumulado=1, mu_post = (1*0.62 + 3*0.5)/(1+3) = 0.53

-- 4. RLS — como consultor SIN vínculo a la organización de prueba:
-- SELECT * FROM calibracion_observaciones WHERE organizacion_id = '<uuid_organizacion_prueba>';
-- -- Esperado: 0 filas. Como consultor vinculado (consultor_organizacion): la fila del paso 3.

-- 5. calibracion_parametros es de lectura abierta a cualquier authenticated
--    (no por-organización) — confirmar que un consultor sin ningún vínculo
--    igual puede leer las 10 filas del paso 1.
