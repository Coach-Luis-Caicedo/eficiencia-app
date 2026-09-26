-- ══════════════════════════════════════════════════════════════════
-- 045 — cff_event_components admite "sin cifra" explícito (monetization_status = 'N_A')
--
-- Cierra la parte de base de datos de PENDIENTES_BRECHAS_WORKER_MOTORES.md §7
-- Q4 (decisión de Luis, 2026-09-26): el analista debe poder declarar un impacto
-- detectado pero no cuantificado SIN inventar un número (sin valor centinela).
--
-- 032 fijó el CHECK de la regla 7 de motor-cff/contratos.js: exactamente UNA
-- representación de valor (original_value, o el par min/max), nunca ninguna.
-- El contrato del motor ahora admite ninguna representación SOLO cuando
-- monetization_status = 'N_A' (regla 7b). Esta migración alinea el CHECK:
--
--   antes:  (value AND NOT min AND NOT max) OR (NOT value AND min AND max)
--   ahora:  lo anterior
--           OR (monetization_status = 'N_A' AND value IS NULL AND min IS NULL AND max IS NULL)
--
-- Con cualquier otro estado la cifra sigue siendo obligatoria. El CHECK de 032
-- no tiene nombre explícito, así que se localiza por su definición en vez de
-- asumir el nombre autogenerado.
-- ══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_nombre text;
BEGIN
  SELECT conname INTO v_nombre
  FROM pg_constraint
  WHERE conrelid = 'motores_eficiencia.cff_event_components'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%original_value_min%'
    AND pg_get_constraintdef(oid) ILIKE '%original_value_max%'
    AND pg_get_constraintdef(oid) NOT ILIKE '%monetization_status%';

  IF v_nombre IS NULL THEN
    RAISE EXCEPTION '045: no se encontró el CHECK de la regla 7 (original_value XOR rango) en cff_event_components; ¿ya se aplicó, o cambió el esquema?';
  END IF;

  EXECUTE format('ALTER TABLE motores_eficiencia.cff_event_components DROP CONSTRAINT %I', v_nombre);
END $$;

ALTER TABLE motores_eficiencia.cff_event_components
  ADD CONSTRAINT cff_event_components_valor_o_sin_cifra CHECK (
    (original_value IS NOT NULL AND original_value_min IS NULL AND original_value_max IS NULL)
    OR (original_value IS NULL AND original_value_min IS NOT NULL AND original_value_max IS NOT NULL)
    OR (monetization_status = 'N_A' AND original_value IS NULL AND original_value_min IS NULL AND original_value_max IS NULL)
  );

COMMENT ON CONSTRAINT cff_event_components_valor_o_sin_cifra ON motores_eficiencia.cff_event_components IS
  'Regla 7 de contratos.js: exactamente una representación de valor (original_value, o min+max), '
  'salvo regla 7b: monetization_status=N_A puede no traer ninguna ("detectado, no cuantificado"; '
  'PENDIENTES §7 Q4). Sin valor centinela.';

-- (no se agregan funciones; el REVOKE de cierre de las migraciones con funciones no aplica)

-- ══════════════════════════════════════════════════════════════════
-- Verificación esperada tras aplicar
-- 1. INSERT de un componente con monetization_status='N_A' y los 3 valores NULL -> acepta.
-- 2. Igual con monetization_status='OBSERVED' -> falla por cff_event_components_valor_o_sin_cifra.
-- 3. N_A con solo original_value_min -> falla (rango incompleto).
-- 4. Los componentes existentes (con cifra) siguen cumpliendo el CHECK.
-- ══════════════════════════════════════════════════════════════════
