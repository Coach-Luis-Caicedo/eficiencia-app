-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 021: fix de regresión — benchmark de sector
-- de rotación (migración 017) se perdió silenciosamente en la 019
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- ── Qué se rompió, y cómo se confirmó ──
--
-- La migración 017 agregó un segundo nivel de prioridad a TasaRotación-
-- Base: dato real del cliente > benchmark de sector (retail_logistica
-- 69%, manufactura 44%, salud_educacion 14.45%, todos con fuente citada
-- — ver 017:36-66) > sin benchmark (servicios_prof/finanzas_tech, a
-- propósito). Ese cambio vivía dentro de `_calcular_cff_interno()`
-- (única función de cálculo en ese momento).
--
-- La migración 019 (motor IFT) extrajo el cálculo puro de los 4
-- componentes a una función nueva, `_calcular_cff_puro()`, para que
-- `simular_ift()` pudiera llamarlo 37 veces sin escribir a
-- `cff_historial`. Su propio header afirma textualmente: "Cuerpo de
-- cálculo idéntico al de _calcular_cff_interno original — ningún
-- número ni fórmula cambia" (019:79-80). **Esa afirmación es falsa**
-- respecto al estado post-017: `_calcular_cff_puro()` fue extraída de
-- la versión de `_calcular_cff_interno()` anterior a la 017, no de la
-- vigente en ese momento — el bloque de rotación volvió a ser
-- `IF tasa_rotacion_base IS NOT NULL ... ELSE NULL`, sin las 3 ramas
-- `ELSIF sector = ...` de la 017, y la variable `v_tasa_rotacion_fuente`
-- ni siquiera quedó declarada (019:105-108 vs. 017:100-105). Como
-- `_calcular_cff_interno()` pasó a ser un wrapper delgado sobre
-- `_calcular_cff_puro()` (019:252-295), y `simular_ift()` llama
-- directamente a `_calcular_cff_puro()`, el benchmark de sector quedó
-- muerto en TODA la app desde que se aplicó la 019 — no es un caso
-- límite, es el 100% de las organizaciones de esos 3 sectores sin dato
-- real de rotación.
--
-- Confirmado con prueba en vivo (2026-08-25, organización de prueba
-- 129cc362-a6de-42c2-8321-153c8d4a4977): con sector='manufactura' y
-- tasa_rotacion_base=NULL, `calcular_cff()` devolvió
-- `rotacion.incluido=false, razon="Falta tasa de rotación base"` — el
-- comportamiento pre-017, no el esperado ("benchmark sector
-- manufactura..."). Nota operativa: esa prueba dejó el `sector` de esa
-- organización fijado en 'manufactura' de forma permanente (guard de
-- una sola vez, `018:129-136`, `COALESCE(sector, p_sector)` — no hay
-- camino de RPC para revertirlo). Si se quiere esa organización sin
-- sector otra vez, hace falta un UPDATE manual directo en Supabase.
--
-- ── Qué corrige esta migración ──
--
-- Reintroduce las 3 ramas `ELSIF sector = ...` de la migración 017
-- dentro de `_calcular_cff_puro()` — la fuente de verdad real desde la
-- 019, no `_calcular_cff_interno()` (que ya no tiene lógica propia,
-- solo delega). Mismo texto, mismos 3 benchmarks, misma cita de fuente
-- que la 017 — no se re-deriva nada, se restaura lo que ya estaba
-- aprobado y documentado. `_calcular_cff_interno()` y `simular_ift()`
-- no cambian: ambos ya delegan a `_calcular_cff_puro()`, el fix las
-- alcanza automáticamente en cuanto se aplica aquí.
--
-- Firma sin cambios (uuid, numeric, boolean) — CREATE OR REPLACE
-- alcanza, sin riesgo de sobrecarga PGRST203 (mismo criterio que la
-- migración 018 documentó para casos sin cambio de tipos).
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION _calcular_cff_puro(
  p_organizacion_id  uuid,
  p_iao_org          numeric,
  p_iao_n_suficiente boolean
) RETURNS jsonb
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_org record;

  v_s_rot CONSTANT numeric := 1;
  v_s_aus CONSTANT numeric := 1;
  v_s_ret CONSTANT numeric := 1;

  v_dias_laborales_anio CONSTANT numeric := 242;

  v_tasa_rotacion          numeric;
  v_tasa_rotacion_fuente   text;
  v_tasa_ausentismo        numeric;
  v_tasa_ausentismo_fuente text;
  v_tasa_retrabajo         numeric;
  v_tasa_retrabajo_fuente  text;

  v_desenganche         numeric;
  v_desenganche_incluido boolean;
  v_desenganche_razon    text;

  v_rotacion          numeric;
  v_rotacion_incluido  boolean;
  v_rotacion_razon     text;

  v_ausentismo         numeric;
  v_ausentismo_incluido boolean;
  v_ausentismo_razon    text;

  v_retrabajo          numeric;
  v_retrabajo_incluido  boolean;
  v_retrabajo_razon     text;

  v_total     numeric;
  v_detalle   jsonb;
BEGIN
  SELECT * INTO v_org FROM organizaciones WHERE id = p_organizacion_id;

  IF NOT COALESCE(p_iao_n_suficiente, false) OR p_iao_org IS NULL THEN
    v_detalle := jsonb_build_object(
      'desenganche', jsonb_build_object('incluido', false, 'razon', 'IAO_org insuficiente (N<8) para este período'),
      'rotacion',    jsonb_build_object('incluido', false, 'razon', 'IAO_org insuficiente (N<8) para este período'),
      'ausentismo',  jsonb_build_object('incluido', false, 'razon', 'IAO_org insuficiente (N<8) para este período'),
      'retrabajo',   jsonb_build_object('incluido', false, 'razon', 'IAO_org insuficiente (N<8) para este período')
    );
    RETURN jsonb_build_object(
      'iao_org_usado', NULL, 'costo_desenganche', NULL, 'costo_rotacion', NULL,
      'costo_ausentismo', NULL, 'costo_retrabajo', NULL, 'costo_total', NULL, 'detalle', v_detalle
    );
  END IF;

  -- ── Costo_desenganche = N × Salario_promedio × 0.26 × (IAO_org/100)
  IF v_org.n_empleados IS NOT NULL AND v_org.salario_promedio IS NOT NULL THEN
    v_desenganche := v_org.n_empleados * v_org.salario_promedio * 0.26 * (p_iao_org / 100);
    v_desenganche_incluido := true;
    v_desenganche_razon := 'Calculado con salario promedio real';
  ELSE
    v_desenganche := NULL;
    v_desenganche_incluido := false;
    v_desenganche_razon := 'Falta salario promedio';
  END IF;

  -- ── TasaRotaciónBase — prioridad de 2 niveles RESTAURADA (migración
  -- 017): dato real del cliente > benchmark de sector. Sin tercer nivel
  -- genérico nacional (cifras nacionales colombianas divergentes, sin
  -- metodología reconciliable — ver 017:24-34). tasa_rotacion_base se
  -- guarda en puntos porcentuales (0-100, migración 005).
  IF v_org.tasa_rotacion_base IS NOT NULL THEN
    v_tasa_rotacion := v_org.tasa_rotacion_base / 100;
    v_tasa_rotacion_fuente := 'dato real del cliente';
  ELSIF v_org.sector = 'retail_logistica' THEN
    v_tasa_rotacion := 0.69;   -- Michael Page Colombia 2023
    v_tasa_rotacion_fuente := 'benchmark sector retail_logistica (Michael Page Colombia 2023, 69%)';
  ELSIF v_org.sector = 'manufactura' THEN
    v_tasa_rotacion := 0.44;   -- Michael Page Colombia 2023
    v_tasa_rotacion_fuente := 'benchmark sector manufactura (Michael Page Colombia 2023, 44%)';
  ELSIF v_org.sector = 'salud_educacion' THEN
    v_tasa_rotacion := 0.1445; -- punto medio ACHC médicos 13.1% / enfermería 15.8%, mayo-jun 2024
    v_tasa_rotacion_fuente := 'benchmark sector salud_educacion (ACHC 2024, punto medio médicos/enfermería 13.1%-15.8%)';
  ELSE
    v_tasa_rotacion := NULL;   -- servicios_prof, finanzas_tech, o sector NULL: sin benchmark de respaldo (evidencia insuficiente)
    v_tasa_rotacion_fuente := NULL;
  END IF;

  -- ── Costo_rotación = N × TasaRotación × (1+s_rot×IAO_org/100) × Salario_promedio × Multiplicador_rol
  IF v_org.n_empleados IS NOT NULL AND v_tasa_rotacion IS NOT NULL
     AND v_org.salario_promedio IS NOT NULL AND v_org.multiplicador_rol IS NOT NULL THEN
    v_rotacion := v_org.n_empleados
                  * v_tasa_rotacion
                  * (1 + v_s_rot * p_iao_org / 100)
                  * v_org.salario_promedio
                  * v_org.multiplicador_rol;
    v_rotacion_incluido := true;
    v_rotacion_razon := 'Calculado — tasa de rotación: ' || v_tasa_rotacion_fuente;
  ELSE
    v_rotacion := NULL;
    v_rotacion_incluido := false;
    v_rotacion_razon := 'Falta ' || concat_ws(', ',
      CASE WHEN v_tasa_rotacion IS NULL THEN 'tasa de rotación base (sin dato real ni benchmark de sector para este sector)' END,
      CASE WHEN v_org.salario_promedio IS NULL THEN 'salario promedio' END,
      CASE WHEN v_org.multiplicador_rol IS NULL THEN 'multiplicador de rol' END
    );
  END IF;

  -- ── Costo_ausentismo — sin cambios respecto a la 019.
  IF v_org.dias_ausencia_base IS NOT NULL THEN
    v_tasa_ausentismo := v_org.dias_ausencia_base / v_dias_laborales_anio;
    v_tasa_ausentismo_fuente := 'dato real del cliente';
  ELSIF v_org.pais = 'colombia' THEN
    v_tasa_ausentismo := 9.4 / v_dias_laborales_anio;  -- EALI 2024, CESLA-ANDI
    v_tasa_ausentismo_fuente := 'benchmark Colombia (EALI 2024)';
  ELSE
    v_tasa_ausentismo := 0.0145;  -- punto medio 0.010-0.019 — rama hoy inalcanzable (solo existe 'colombia')
    v_tasa_ausentismo_fuente := 'benchmark genérico internacional (sin especificidad regional)';
  END IF;

  IF v_org.n_empleados IS NOT NULL AND v_org.salario_promedio IS NOT NULL THEN
    v_ausentismo := v_org.n_empleados * v_org.salario_promedio * v_tasa_ausentismo * (1 + v_s_aus * p_iao_org / 100);
    v_ausentismo_incluido := true;
    v_ausentismo_razon := 'Calculado — tasa de ausentismo: ' || v_tasa_ausentismo_fuente;
  ELSE
    v_ausentismo := NULL;
    v_ausentismo_incluido := false;
    v_ausentismo_razon := 'Falta ' || concat_ws(', ',
      CASE WHEN v_org.n_empleados IS NULL THEN 'número de empleados' END,
      CASE WHEN v_org.salario_promedio IS NULL THEN 'salario promedio' END
    );
  END IF;

  -- ── Costo_retrabajo — sin cambios respecto a la 019.
  IF v_org.tasa_retrabajo_real IS NOT NULL THEN
    v_tasa_retrabajo := v_org.tasa_retrabajo_real / 100;
    v_tasa_retrabajo_fuente := 'dato real del cliente';
  ELSE
    v_tasa_retrabajo := 0.10;  -- punto medio del rango 0.05-0.15 (benchmark de manufactura, marco sección 8)
    v_tasa_retrabajo_fuente := 'benchmark de manufactura (5%-15%)';
  END IF;

  IF v_org.costo_operativo_total IS NOT NULL THEN
    v_retrabajo := v_org.costo_operativo_total * v_tasa_retrabajo * (1 + v_s_ret * p_iao_org / 100);
    v_retrabajo_incluido := true;
    v_retrabajo_razon := 'Calculado — tasa de retrabajo: ' || v_tasa_retrabajo_fuente;
  ELSE
    v_retrabajo := NULL;
    v_retrabajo_incluido := false;
    v_retrabajo_razon := 'Falta costo operativo total — componente omitido, no estimado con benchmark (marco, sección 8)';
  END IF;

  v_total := CASE
    WHEN NOT v_desenganche_incluido AND NOT v_rotacion_incluido AND NOT v_ausentismo_incluido AND NOT v_retrabajo_incluido
      THEN NULL
    ELSE COALESCE(v_desenganche,0) + COALESCE(v_rotacion,0) + COALESCE(v_ausentismo,0) + COALESCE(v_retrabajo,0)
  END;

  v_detalle := jsonb_build_object(
    'desenganche', jsonb_build_object('incluido', v_desenganche_incluido, 'razon', v_desenganche_razon),
    'rotacion',    jsonb_build_object('incluido', v_rotacion_incluido, 'razon', v_rotacion_razon),
    'ausentismo',  jsonb_build_object('incluido', v_ausentismo_incluido, 'razon', v_ausentismo_razon),
    'retrabajo',   jsonb_build_object('incluido', v_retrabajo_incluido, 'razon', v_retrabajo_razon)
  );

  RETURN jsonb_build_object(
    'iao_org_usado', p_iao_org, 'costo_desenganche', v_desenganche, 'costo_rotacion', v_rotacion,
    'costo_ausentismo', v_ausentismo, 'costo_retrabajo', v_retrabajo, 'costo_total', v_total, 'detalle', v_detalle
  );
END;
$$;

-- Nota: _calcular_cff_puro no tiene GRANT propio (SECURITY DEFINER,
-- solo invocable desde _calcular_cff_interno() y simular_ift()) —
-- CREATE OR REPLACE no cambia permisos, no hace falta volver a otorgar
-- nada.


-- ══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════

-- 1. Repetir la prueba en vivo de esta sesión con una organización real
--    de sector retail_logistica/manufactura/salud_educacion sin
--    tasa_rotacion_base: calcular_cff() debe devolver
--    rotacion.incluido=true, razon citando el benchmark de sector.
-- SELECT calcular_cff('<org_id>');

-- 2. Confirmar que servicios_prof/finanzas_tech sin dato real siguen
--    exactamente igual (rotacion.incluido=false, sin benchmark).

-- 3. Confirmar que simular_ift() (que llama a _calcular_cff_puro
--    directamente) también refleja el fix — proyectar una organización
--    de uno de los 3 sectores sin tasa_rotacion_base real y confirmar
--    que costo_rotacion ya no es NULL en la serie proyectada.
