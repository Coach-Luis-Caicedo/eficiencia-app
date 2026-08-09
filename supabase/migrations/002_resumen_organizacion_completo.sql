-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 002: resumen_organizacion_completo
-- Reemplaza resumen_par_organizacion (3.4) y resumen_sdmo_organizacion (3.5)
-- de la migración 001 por una sola función que hace TODO el cálculo
-- server-side (Brecha, IAO, ICE, IEH, resumen SD-MO) y devuelve
-- resultados finales — el Workbook consume el resultado, no reimplementa
-- fórmulas en JavaScript.
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- Fuente de verdad: DOCUMENTO_MARCO_SISTEMA_EFICIENCIA.md, secciones 3
-- (IAO), 5 (Brecha), 6 (trazabilidad), 8.3 (agregación individuo→org).
-- ══════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════
-- Decisión de diseño 1 — agregación del IAO Y del desglose por par:
-- por individuo, no por concepto promediado. Misma vara para ambos.
--
-- El IAO existe para NO diluir una crisis concentrada en pocas personas
-- (razón explícita del piso de amenaza absoluta y de segundo_mayor,
-- marco sección 3). Si se promediara concepto_a/concepto_b/bipolar de
-- TODA la organización primero y se aplicara la fórmula de Amenaza una
-- sola vez sobre esos promedios, ese efecto de dilución ocurriría antes
-- de llegar siquiera al IAO — exactamente lo que el diseño busca evitar.
--
-- Esa misma protección tiene que aplicar al desglose "por par" que ve
-- el consultor, no solo al número agregado del IAO — si no, el IAO
-- podría salir alto por una crisis concentrada en una persona, y el
-- desglose por par (calculado con promedio directo) se vería tranquilo,
-- sin explicar de dónde viene la alerta. Por eso `amenaza_par` (el
-- desglose) y el IAO comparten la misma fuente (`individual_amenaza_par`)
-- y el mismo esquema γ/segundo_mayor — solo cambia el nivel de
-- agrupación: por `par` para el desglose, por `respuesta_id` para el IAO.
--
-- `concepto_a_prom`/`concepto_b_prom`/`bipolar_prom`/`brecha_calculada`/
-- `brecha_final` sí son promedios simples — son insumos descriptivos
-- ("¿qué contestó la organización en promedio?"), no la variable de
-- detección de amenaza concentrada.
--
-- ICE e IEH tampoco tienen ese requisito en el marco (no son índices de
-- detección de amenaza concentrada) — se agregan con promedio simple,
-- por par y luego entre pares. Decisión confirmada en conversación.
--
-- Decisión de diseño 2 — parámetros provisionales (confirmados por
-- Luis en conversación, no calculados — pendientes de calibración con
-- el piloto, marco sección 10). Todos quedan como constantes al inicio
-- de la función — fáciles de encontrar y cambiar cuando llegue la
-- calibración (mismo criterio que PROMPT_CC_AUDITORIA_MOTOR_CALCULO_v2.md
-- exige para todo parámetro "sin validar"):
--   γ (gamma_iao)      = 0.5  — neutro, mismo criterio que SDMO_DELTA en
--                                sdmo.html (ni el promedio ni el
--                                segundo_mayor dominan de entrada).
--   w_neg              = 0.5  — NO simétrico con w_pos=1. Asimetría de
--                                aversión a la pérdida (Kahneman/Tversky):
--                                una Brecha positiva (estructura promete
--                                más de lo que se vive — una promesa
--                                incumplida) se trata como amenaza más
--                                severa que una Brecha negativa de la
--                                misma magnitud (fortaleza informal no
--                                institucionalizada — más cerca de una
--                                sorpresa agradable frágil que de una
--                                pérdida).
--   umbral_piso        = 0.5  — neutro, punto medio de la escala [0,1]
--                                de Concepto_B.
--   α (alpha_brecha)   = 0.5  — provisional según la propia sección 5.2
--                                del marco (con <50-100 respuestas por
--                                par, α=0.5 explícito, no una elección
--                                nueva).
--   umbral de tendencia = 2   — puntos de IDA (escala 0-100) para
--                                clasificar deterioro/mejora/estable en
--                                el SD-MO. Sin base empírica todavía,
--                                mismo tratamiento que los demás.
--
-- Decisión de diseño 3 — periodo. resumen_par_organizacion (001) no
-- filtraba por periodo: agregaba TODAS las filas históricas de
-- respuestas_cuestionario_pares juntas, mezclando semestres distintos
-- de la misma persona. Con el tiempo eso mezclaría el estado actual con
-- el histórico — un vacío heredado, no algo que corresponda repetir.
-- Esta función filtra al periodo más reciente disponible para la
-- organización por defecto (p_periodo = NULL), con la opción de pedir
-- un periodo específico más adelante (paneles de tendencia, fuera de
-- alcance aquí).
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION resumen_organizacion_completo(
  p_organizacion_id uuid,
  p_departamento    text DEFAULT NULL,
  p_periodo         text DEFAULT NULL,
  p_sdmo_dias       int  DEFAULT 30
) RETURNS jsonb
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  -- ── Parámetros provisionales — confirmados por Luis, pendientes de
  -- calibración con datos del piloto (marco, sección 10). Cambiar solo
  -- aquí cuando llegue ese momento.
  v_gamma_iao         CONSTANT numeric := 0.5;  -- peso promedio vs. segundo_mayor (IAO y desglose por par, mismo esquema)
  v_w_neg             CONSTANT numeric := 0.5;  -- peso de Brecha negativa (asimetría pérdida/ganancia)
  v_w_pos             CONSTANT numeric := 1.0;  -- peso de Brecha positiva — fijo, no revisar sin evidencia nueva
  v_umbral_piso       CONSTANT numeric := 0.5;  -- piso de amenaza absoluta sobre Concepto_B
  v_alpha_brecha      CONSTANT numeric := 0.5;  -- combina Brecha_calculada con Bipolar (marco 5.2) hasta tener piloto
  v_tendencia_umbral  CONSTANT numeric := 2;    -- puntos de IDA para clasificar deterioro/mejora/estable — provisional
  v_n_minimo          CONSTANT int     := 8;    -- mínimo de confidencialidad (marco, sección 9.1)

  v_periodo     text;
  v_resultado   jsonb;
BEGIN
  -- ── Verificación de acceso — mismo patrón que las funciones que reemplaza.
  IF NOT EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE organizacion_id = p_organizacion_id AND consultor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'no autorizado para esta organización';
  END IF;

  -- ── Resolver periodo: el más reciente con datos, si no se pide uno explícito.
  IF p_periodo IS NULL THEN
    SELECT periodo INTO v_periodo
    FROM respuestas_cuestionario
    WHERE organizacion_id = p_organizacion_id
    ORDER BY periodo DESC
    LIMIT 1;
  ELSE
    v_periodo := p_periodo;
  END IF;

  WITH
  -- ═══ Brecha por par — promedios descriptivos (insumo, no la variable de amenaza) ═══
  pares_agg AS (
    SELECT
      p.par,
      count(*)          AS n,
      avg(p.concepto_a)  AS concepto_a_prom,
      avg(p.concepto_b)  AS concepto_b_prom,
      avg(p.bipolar)     AS bipolar_prom
    FROM respuestas_cuestionario_pares p
    JOIN respuestas_cuestionario r ON r.id = p.respuesta_id
    WHERE r.organizacion_id = p_organizacion_id
      AND r.periodo = v_periodo
      AND (p_departamento IS NULL OR r.area = NULLIF(trim(lower(p_departamento)), ''))
    GROUP BY p.par
  ),
  pares_final AS (
    SELECT
      par, n,
      (n >= v_n_minimo) AS n_suficiente,
      round(concepto_a_prom::numeric, 4) AS concepto_a_prom,
      round(concepto_b_prom::numeric, 4) AS concepto_b_prom,
      round(bipolar_prom::numeric, 4)    AS bipolar_prom,
      round((concepto_a_prom - concepto_b_prom)::numeric, 4) AS brecha_calculada,
      round(
        (v_alpha_brecha * (concepto_a_prom - concepto_b_prom) + (1 - v_alpha_brecha) * bipolar_prom)::numeric, 4
      ) AS brecha_final
    FROM pares_agg
  ),

  -- ═══ Amenaza_par por INDIVIDUO — fuente compartida del desglose por par Y del IAO ═══
  individual_amenaza AS (
    SELECT
      p.respuesta_id,
      p.par,
      p.concepto_b,
      round((v_alpha_brecha * (p.concepto_a - p.concepto_b) + (1 - v_alpha_brecha) * p.bipolar)::numeric, 4) AS brecha_final_i
    FROM respuestas_cuestionario_pares p
    JOIN respuestas_cuestionario r ON r.id = p.respuesta_id
    WHERE r.organizacion_id = p_organizacion_id
      AND r.periodo = v_periodo
      AND (p_departamento IS NULL OR r.area = NULLIF(trim(lower(p_departamento)), ''))
  ),
  individual_amenaza_par AS (
    SELECT
      respuesta_id,
      par,
      GREATEST(
        GREATEST(brecha_final_i, 0) * v_w_pos + GREATEST(-brecha_final_i, 0) * v_w_neg,
        GREATEST(0, v_umbral_piso - concepto_b)
      ) AS amenaza_par_i
    FROM individual_amenaza
  ),

  -- ═══ Desglose por par — mismo esquema γ/segundo_mayor que el IAO, agrupado
  -- por par en vez de por persona, para que el desglose y el IAO se expliquen
  -- entre sí (ver Decisión de diseño 1) ═══
  par_amenaza_out AS (
    SELECT
      par,
      round(
        (v_gamma_iao * avg(amenaza_par_i)
          + (1 - v_gamma_iao) * (array_agg(amenaza_par_i ORDER BY amenaza_par_i DESC))[2]
        )::numeric, 4
      ) AS amenaza_par
    FROM individual_amenaza_par
    GROUP BY par
  ),

  -- n_suficiente aplica al mismo N≥8 de confidencialidad que ya protege
  -- las tablas base (marco, sección 9.1) — por debajo del mínimo, se
  -- expone n y la bandera, pero no los valores numéricos (evita que un
  -- filtro de departamento angosto reconstruya una lectura casi
  -- individual a través de este resumen).
  pares_out AS (
    SELECT
      f.par, f.n, f.n_suficiente,
      CASE WHEN f.n_suficiente THEN f.concepto_a_prom ELSE NULL END AS concepto_a_prom,
      CASE WHEN f.n_suficiente THEN f.concepto_b_prom ELSE NULL END AS concepto_b_prom,
      CASE WHEN f.n_suficiente THEN f.bipolar_prom ELSE NULL END AS bipolar_prom,
      CASE WHEN f.n_suficiente THEN f.brecha_calculada ELSE NULL END AS brecha_calculada,
      CASE WHEN f.n_suficiente THEN f.brecha_final ELSE NULL END AS brecha_final,
      CASE WHEN f.n_suficiente THEN a.amenaza_par ELSE NULL END AS amenaza_par
    FROM pares_final f
    JOIN par_amenaza_out a ON a.par = f.par
  ),

  -- ═══ ICE / IEH — promedio simple de los 5 conceptos correspondientes.
  -- Se calcula sobre pares_final (no pares_out) para no heredar el
  -- null-gating por-par: ICE/IEH son un promedio entre los 5 pares, y un
  -- solo par con n bajo no debe anular el resto. ═══
  ice_ieh AS (
    SELECT
      round(avg(concepto_a_prom)::numeric, 4) AS ice,
      round(avg(concepto_b_prom)::numeric, 4) AS ieh,
      bool_and(n_suficiente) AS n_suficiente
    FROM pares_final
  ),

  -- ═══ IAO — paso 1: IAO_i por persona (solo respondientes con los 5
  -- pares completos — enviar_respuesta_cuestionario siempre inserta los
  -- 5 juntos; este filtro es una garantía defensiva, no se espera que
  -- descarte nada) ═══
  individual_iao AS (
    SELECT
      respuesta_id,
      avg(amenaza_par_i) AS prom_amenaza,
      (array_agg(amenaza_par_i ORDER BY amenaza_par_i DESC))[2] AS segundo_mayor_amenaza
    FROM individual_amenaza_par
    GROUP BY respuesta_id
    HAVING count(*) = 5
  ),
  individual_iao_final AS (
    SELECT
      respuesta_id,
      100 * (v_gamma_iao * prom_amenaza + (1 - v_gamma_iao) * segundo_mayor_amenaza) AS iao_i
    FROM individual_iao
  ),
  -- ═══ IAO — paso 2: agregación organizacional, mismo esquema γ/segundo_mayor ═══
  iao_org AS (
    SELECT
      count(*) AS n,
      (count(*) >= v_n_minimo) AS n_suficiente,
      avg(iao_i) AS prom_iao_i,
      (array_agg(iao_i ORDER BY iao_i DESC))[2] AS segundo_mayor_iao_i
    FROM individual_iao_final
  ),
  iao_out AS (
    SELECT
      n, n_suficiente,
      CASE WHEN n_suficiente THEN
        round((v_gamma_iao * prom_iao_i + (1 - v_gamma_iao) * segundo_mayor_iao_i)::numeric, 4)
      ELSE NULL END AS iao
    FROM iao_org
  ),

  -- ═══ SD-MO — ventana actual vs. ventana anterior (misma duración) ═══
  sdmo_actual AS (
    SELECT
      count(*) AS n,
      avg(ida_i) AS prom_ida,
      (array_agg(ida_i ORDER BY ida_i DESC))[2] AS segundo_mayor_ida
    FROM respuestas_sdmo
    WHERE organizacion_id = p_organizacion_id
      AND jornada >= current_date - p_sdmo_dias
      AND (p_departamento IS NULL OR area = NULLIF(trim(lower(p_departamento)), ''))
  ),
  sdmo_anterior AS (
    SELECT
      count(*) AS n,
      avg(ida_i) AS prom_ida,
      (array_agg(ida_i ORDER BY ida_i DESC))[2] AS segundo_mayor_ida
    FROM respuestas_sdmo
    WHERE organizacion_id = p_organizacion_id
      AND jornada >= current_date - (p_sdmo_dias * 2)
      AND jornada <  current_date - p_sdmo_dias
      AND (p_departamento IS NULL OR area = NULLIF(trim(lower(p_departamento)), ''))
  ),
  sdmo_out AS (
    SELECT
      a.n,
      (a.n >= v_n_minimo) AS n_suficiente,
      CASE WHEN a.n >= v_n_minimo THEN
        round((v_gamma_iao * a.prom_ida + (1 - v_gamma_iao) * a.segundo_mayor_ida)::numeric, 2)
      ELSE NULL END AS ida_prom,
      p.n AS n_anterior,
      (p.n >= v_n_minimo) AS n_suficiente_anterior,
      CASE WHEN p.n >= v_n_minimo THEN
        round((v_gamma_iao * p.prom_ida + (1 - v_gamma_iao) * p.segundo_mayor_ida)::numeric, 2)
      ELSE NULL END AS ida_prom_anterior
    FROM sdmo_actual a, sdmo_anterior p
  )

  SELECT jsonb_build_object(
    'organizacion_id', p_organizacion_id,
    'periodo', v_periodo,
    'departamento', p_departamento,
    'ice', (SELECT ice FROM ice_ieh),
    'ieh', (SELECT ieh FROM ice_ieh),
    'ice_ieh_n_suficiente', (SELECT n_suficiente FROM ice_ieh),
    'iao', (SELECT iao FROM iao_out),
    'iao_n', (SELECT n FROM iao_out),
    'iao_n_suficiente', (SELECT n_suficiente FROM iao_out),
    'pares', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'par', par,
          'n', n,
          'n_suficiente', n_suficiente,
          'concepto_a_prom', concepto_a_prom,
          'concepto_b_prom', concepto_b_prom,
          'bipolar_prom', bipolar_prom,
          'brecha_calculada', brecha_calculada,
          'brecha_final', brecha_final,
          'amenaza_par', amenaza_par
        ) ORDER BY par
      )
      FROM pares_out
    ),
    'sdmo', (
      SELECT jsonb_build_object(
        'n', n,
        'n_suficiente', n_suficiente,
        'ida_prom', ida_prom,
        'ventana_dias', p_sdmo_dias,
        'tendencia', CASE WHEN n_suficiente AND n_suficiente_anterior THEN
          jsonb_build_object(
            'ida_prom_anterior', ida_prom_anterior,
            'delta', round((ida_prom - ida_prom_anterior)::numeric, 2),
            'direccion', CASE
              WHEN ida_prom - ida_prom_anterior > v_tendencia_umbral THEN 'deterioro'
              WHEN ida_prom - ida_prom_anterior < -v_tendencia_umbral THEN 'mejora'
              ELSE 'estable'
            END
          )
        ELSE NULL END
      )
      FROM sdmo_out
    ),
    'parametros_usados', jsonb_build_object(
      'gamma_iao', v_gamma_iao,
      'w_neg', v_w_neg,
      'w_pos', v_w_pos,
      'umbral_piso', v_umbral_piso,
      'alpha_brecha', v_alpha_brecha,
      'tendencia_umbral_ida', v_tendencia_umbral,
      'n_minimo', v_n_minimo
    )
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$$;

GRANT EXECUTE ON FUNCTION resumen_organizacion_completo(uuid, text, text, int) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- Retirar las funciones que esta reemplaza. Sin consumidor conocido
-- fuera de lo que se está reemplazando (workbook.html nunca llegó a
-- consumirlas — confirmado en auditoría, Etapa 2: cero referencias a
-- Supabase en workbook.html antes de este cambio).
-- ══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS resumen_par_organizacion(uuid, smallint, text);
DROP FUNCTION IF EXISTS resumen_sdmo_organizacion(uuid, date, date, text);


-- ══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════

-- Debe devolver 1 fila (la función nueva)
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'resumen_organizacion_completo';

-- Debe devolver 0 filas (las dos funciones viejas ya no existen)
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('resumen_par_organizacion', 'resumen_sdmo_organizacion');

-- Prueba manual (reemplazar el uuid por el de la organización de prueba):
-- SELECT resumen_organizacion_completo('00000000-0000-0000-0000-000000000000'::uuid);
