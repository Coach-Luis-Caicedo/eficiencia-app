-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 018: actualizar_ficha_tecnica() (nombre,
-- n_empleados, sector) + guard real de país en actualizar_ficha_financiera()
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- ── Contexto: auditoría 2026-08-21 encontró que 4 de los 5 campos
-- obligatorios de crear_organizacion() (nombre, n_empleados, sector,
-- áreas) no tienen ningún camino de corrección después de creada la
-- organización — solo país lo tiene (actualizar_ficha_financiera(),
-- migración 011), y ese camino resultó no tener protección real: el
-- bloqueo "una vez tiene valor" es puramente de interfaz
-- (workbook.html, `paisSel.disabled = !!d.pais`), sin ningún guard en el
-- backend — país se sobrescribe sin condición en cada guardado.
--
-- ── Diseño confirmado con Luis, 2026-08-21 — NO uniforme entre los 4
-- campos, a propósito:
--
--   nombre, n_empleados: SIEMPRE editables, SIN guard. No son hechos
--     estructurales de una sola vez — son hechos operativos que cambian
--     legítimamente con el tiempo (rebranding, fusión; crecimiento o
--     reducción de plantilla). Un guard "solo si está en NULL" los habría
--     dejado permanentemente congelados, porque NUNCA están en NULL en la
--     práctica: crear_organizacion() los exige con RAISE EXCEPTION y no
--     existe ningún otro INSERT INTO organizaciones en todo el repo — es
--     decir, el guard habría quedado "arreglado en apariencia, roto en la
--     práctica", exactamente el defecto que esta migración corrige para
--     país. n_empleados es además el más urgente de los 4: multiplica los
--     4 componentes del CFF (N), y sin poder actualizarse, el CFF calcula
--     indefinidamente sobre una plantilla desactualizada — un error
--     silencioso que empeora con el tiempo, no uno que se manifiesta una
--     sola vez.
--
--   sector, país: guard real `COALESCE(campo, p_campo)` — solo se aplica
--     si el valor actual es NULL. Estos SÍ son atributos estructurales que
--     no deberían cambiar en operación normal — el problema real es el
--     hueco de backfill de organizaciones creadas antes de que la columna
--     existiera (confirmado con la organización de prueba original, que
--     predata las migraciones 005/006/007 — ver migración 007, líneas
--     474-480, y migración 005, líneas 12-17). Una vez fijado, el valor
--     nunca se sobrescribe desde este RPC, sin importar qué mande el
--     cliente — corrige el mismo defecto que tenía país (bloqueo solo
--     visual) sin reintroducirlo aquí.
--
-- ── Por qué una función nueva (actualizar_ficha_tecnica) y no agregar
-- parámetros a actualizar_ficha_financiera(): evita tocar una firma de 10
-- parámetros que ya funciona en producción — exactamente la causa raíz
-- que la migración 016 tuvo que arreglar (PGRST203, sobrecargas
-- coexistiendo porque CREATE OR REPLACE con una lista de tipos distinta
-- no reemplaza, crea una sobrecarga nueva). actualizar_ficha_financiera()
-- se edita in-place en esta migración SOLO para el guard de país — misma
-- firma exacta (10 parámetros, mismos tipos), sin riesgo de repetir ese
-- bug.
--
-- ── áreas queda fuera de esta migración, a propósito — es una tabla
-- relacionada (areas_organizacion) con inserciones dinámicas, no un campo
-- simple de organizaciones; el propio Luis lo señaló como un caso aparte
-- que merece su propio flujo (agregar/renombrar/quitar), no un campo más
-- en Ficha financiera. Queda documentado como pendiente separado en el
-- marco (sección 8).
-- ══════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════
-- 1. actualizar_ficha_tecnica() — RPC nuevo, único lugar para corregir
--    nombre/n_empleados/sector después del alta.
--
--    Devuelve jsonb (no void): { sector_cambio_ignorado: boolean } —
--    true solo cuando sector ya tenía valor Y p_sector trae algo
--    DISTINTO de ese valor (un intento real de cambiarlo, que el guard
--    ignora). false en el reenvío normal del mismo valor (lo que hace
--    el panel siempre, con el <select> disabled) y cuando sector estaba
--    en NULL y se acaba de fijar. No bloquea el guardado de
--    nombre/n_empleados — es solo rastro para quien revise la respuesta
--    del RPC, señalado a pedido de Luis 2026-08-21.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION actualizar_ficha_tecnica(
  p_organizacion_id uuid,
  p_nombre          text,
  p_n_empleados     int,
  p_sector          text DEFAULT NULL
) RETURNS jsonb
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_sector_actual         text;
  v_sector_cambio_ignorado boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE organizacion_id = p_organizacion_id AND consultor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'no autorizado para esta organización';
  END IF;

  -- nombre, n_empleados: mismas validaciones que crear_organizacion()
  -- (migración 011) — siempre se aplican, no hay guard de NULL porque
  -- estos campos nunca están en NULL para una organización real.
  IF p_nombre IS NULL OR trim(p_nombre) = '' THEN
    RAISE EXCEPTION 'el nombre de la organización es obligatorio';
  END IF;

  IF p_n_empleados IS NULL OR p_n_empleados < 1 THEN
    RAISE EXCEPTION 'el número de empleados es obligatorio y debe ser mayor a 0';
  END IF;

  -- sector: guard real — solo se valida y se aplica si hoy está en NULL.
  -- Si ya tiene valor, p_sector se ignora silenciosamente (COALESCE),
  -- sin importar qué mande el cliente — no se valida en ese caso porque
  -- de todas formas no se va a usar.
  SELECT sector INTO v_sector_actual FROM organizaciones WHERE id = p_organizacion_id;

  IF v_sector_actual IS NULL AND p_sector IS NOT NULL THEN
    IF p_sector NOT IN (
      'servicios_prof', 'manufactura', 'finanzas_tech', 'retail_logistica', 'salud_educacion'
    ) THEN
      RAISE EXCEPTION 'sector inválido — debe ser uno de: servicios_prof, manufactura, finanzas_tech, retail_logistica, salud_educacion';
    END IF;
  END IF;

  -- Rastro de intento de cambio real — distinto del reenvío normal del
  -- mismo valor (que es lo que hace el panel hoy, ya que el <select> de
  -- sector queda disabled con su valor actual una vez fijado, y JS lee
  -- .value igual que con país). Si sector ya tiene valor Y p_sector trae
  -- algo DISTINTO, no es un reenvío — es un intento real de cambiarlo que
  -- el guard va a ignorar; se señala en la respuesta, no se bloquea el
  -- resto del guardado (nombre/n_empleados se aplican igual).
  IF v_sector_actual IS NOT NULL AND p_sector IS NOT NULL AND p_sector <> v_sector_actual THEN
    v_sector_cambio_ignorado := true;
  END IF;

  UPDATE organizaciones SET
    nombre      = trim(p_nombre),
    n_empleados = p_n_empleados,
    sector      = COALESCE(sector, p_sector)
  WHERE id = p_organizacion_id;

  RETURN jsonb_build_object('sector_cambio_ignorado', v_sector_cambio_ignorado);
END;
$$;

GRANT EXECUTE ON FUNCTION actualizar_ficha_tecnica(uuid, text, int, text) TO authenticated;


-- ══════════════════════════════════════════════════════════════════
-- 2. actualizar_ficha_financiera() — misma firma exacta (10 parámetros),
--    solo cambia la lógica interna de país: de sobrescritura
--    incondicional a guard real (COALESCE, solo si hoy es NULL). Cuerpo
--    completo reproducido porque CREATE OR REPLACE lo exige (mismo
--    criterio que la migración 015 con resumen_organizacion_completo()).
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
  p_tasa_retrabajo_real   numeric DEFAULT NULL,
  p_multiplicador_rol     numeric DEFAULT NULL
) RETURNS void
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_periodo_actual text;
  v_iao_existente  numeric;
  v_pais_actual    text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM consultor_organizacion
    WHERE organizacion_id = p_organizacion_id AND consultor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'no autorizado para esta organización';
  END IF;

  -- país: guard real — reemplaza el bloqueo solo-visual que existía
  -- antes (ff-pais.disabled en el panel, sin protección de backend,
  -- auditado 2026-08-21). Se valida p_pais solo cuando efectivamente se
  -- va a aplicar (país actual en NULL) — si ya tiene valor, p_pais se
  -- ignora silenciosamente vía COALESCE más abajo, sin importar qué
  -- mande el cliente.
  SELECT pais INTO v_pais_actual FROM organizaciones WHERE id = p_organizacion_id;

  IF v_pais_actual IS NULL THEN
    IF p_pais IS NULL OR p_pais NOT IN ('colombia') THEN
      RAISE EXCEPTION 'país inválido — por ahora el sistema solo soporta: colombia';
    END IF;
  END IF;

  IF p_multiplicador_rol IS NOT NULL AND p_multiplicador_rol NOT IN (0.30, 0.50, 0.70) THEN
    RAISE EXCEPTION 'multiplicador de rol inválido — debe ser 0.30 (operativo), 0.50 (medio) o 0.70 (directivo)';
  END IF;

  UPDATE organizaciones SET
    pais                  = COALESCE(pais, p_pais),
    salario_promedio      = p_salario_promedio,
    tasa_rotacion_base    = p_tasa_rotacion_base,
    dias_ausencia_base    = p_dias_ausencia_base,
    costo_operativo_total = p_costo_operativo_total,
    costo_intervencion    = p_costo_intervencion,
    ebitda                = p_ebitda,
    tasa_retrabajo_real   = p_tasa_retrabajo_real,
    multiplicador_rol     = p_multiplicador_rol
  WHERE id = p_organizacion_id;

  -- ── Disparo 2: sin cambios de lógica respecto a la migración 015 —
  -- editar Ficha financiera nunca crea un punto nuevo en cff_historial,
  -- solo recalcula uno que ya existía para el período actual.
  SELECT periodo INTO v_periodo_actual
  FROM respuestas_cuestionario
  WHERE organizacion_id = p_organizacion_id
  ORDER BY periodo DESC
  LIMIT 1;

  IF v_periodo_actual IS NOT NULL THEN
    SELECT iao_org_usado INTO v_iao_existente
    FROM cff_historial
    WHERE organizacion_id = p_organizacion_id AND periodo = v_periodo_actual;

    IF FOUND THEN
      BEGIN
        PERFORM _calcular_cff_interno(p_organizacion_id, v_periodo_actual, v_iao_existente, v_iao_existente IS NOT NULL);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END IF;
END;
$$;

-- Nota: GRANT ya existe desde la migración 015 (misma firma exacta, no
-- hace falta volver a otorgarlo) — GRANT EXECUTE ON FUNCTION
-- actualizar_ficha_financiera(uuid, text, numeric, numeric, numeric,
-- numeric, numeric, numeric, numeric, numeric) TO authenticated.


-- ══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════

-- 1. Debe devolver 2 filas.
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('actualizar_ficha_tecnica', 'actualizar_ficha_financiera');

-- 2. Confirmar estado real antes de probar nada (no asumir NULL):
-- SELECT nombre, n_empleados, sector, pais FROM organizaciones WHERE id = '<org_id>';

-- 3. Probar guard de sector — con una organización cuyo sector sea NULL:
-- SELECT actualizar_ficha_tecnica('<org_id>', 'Nombre sin cambios', 100, 'manufactura');
-- Debe devolver {"sector_cambio_ignorado": false} — sector estaba en NULL, se acaba de fijar.
-- SELECT sector FROM organizaciones WHERE id = '<org_id>';  -- debe quedar 'manufactura'
-- SELECT actualizar_ficha_tecnica('<org_id>', 'Nombre sin cambios', 100, 'retail_logistica');
-- Debe devolver {"sector_cambio_ignorado": true} — sector ya tenía valor, el intento se ignoró.
-- SELECT sector FROM organizaciones WHERE id = '<org_id>';  -- debe seguir 'manufactura', el segundo intento se ignora
-- SELECT actualizar_ficha_tecnica('<org_id>', 'Nombre sin cambios', 100, 'manufactura');
-- Debe devolver {"sector_cambio_ignorado": false} — reenvío del mismo valor ya guardado, no es un intento de cambio real.

-- 4. Probar que n_empleados SÍ se puede actualizar repetidamente (a
-- diferencia de sector) — mismo id, dos llamadas con números distintos:
-- SELECT actualizar_ficha_tecnica('<org_id>', 'Nombre sin cambios', 120, NULL);
-- SELECT n_empleados FROM organizaciones WHERE id = '<org_id>';  -- 120
-- SELECT actualizar_ficha_tecnica('<org_id>', 'Nombre sin cambios', 95, NULL);
-- SELECT n_empleados FROM organizaciones WHERE id = '<org_id>';  -- 95, se actualizó de nuevo

-- 5. Probar guard de país con actualizar_ficha_financiera() — mismo
-- patrón que el punto 3, con una organización cuyo país sea NULL.
