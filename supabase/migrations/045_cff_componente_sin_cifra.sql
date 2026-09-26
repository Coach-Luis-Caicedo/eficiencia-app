-- ══════════════════════════════════════════════════════════════════
-- 045 — cff_event_components admite "sin cifra" explícito (monetization_status = 'N_A')
--
-- Cierra la parte de base de datos de PENDIENTES_BRECHAS_WORKER_MOTORES.md §7
-- Q4 (decisión de Luis, 2026-09-26): el analista debe poder declarar un impacto
-- detectado pero no cuantificado SIN inventar un número (sin valor centinela).
--
-- 032 fijó el CHECK de la regla 7 de motor-cff/contratos.js: exactamente UNA
-- representación de valor (original_value, o el par min/max), nunca ninguna.
-- El contrato del motor ahora hace mutuamente excluyentes N_A y la cifra
-- (regla 7b, en las DOS direcciones). Esta migración alinea el CHECK:
--
--   antes:  (value AND NOT min AND NOT max) OR (NOT value AND min AND max)
--   ahora:  monetization_status <> 'N_A' AND (lo anterior)
--           OR monetization_status =  'N_A' AND value IS NULL AND min IS NULL AND max IS NULL
--
-- Con N_A NO se admite ninguna cifra (N_A = "sin base para valorar", AC20/INV-CFF-55);
-- con cualquier otro estado la cifra sigue siendo obligatoria. Antes de escribirla
-- se contó en producción (2026-09-26): 0 filas con N_A (12 componentes en total),
-- así que el CHECK no deja ninguna fila inconsistente. El CHECK de 032 no tiene
-- nombre explícito: se localiza por su definición en vez de asumir el autogenerado.
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
    (monetization_status <> 'N_A' AND (
      (original_value IS NOT NULL AND original_value_min IS NULL AND original_value_max IS NULL)
      OR (original_value IS NULL AND original_value_min IS NOT NULL AND original_value_max IS NOT NULL)))
    OR (monetization_status = 'N_A' AND original_value IS NULL AND original_value_min IS NULL AND original_value_max IS NULL)
  );

COMMENT ON CONSTRAINT cff_event_components_valor_o_sin_cifra ON motores_eficiencia.cff_event_components IS
  'Reglas 7/7b de contratos.js: exactamente una representación de valor (original_value, o min+max) '
  'con cualquier estado salvo N_A; con monetization_status=N_A, NINGUNA ("detectado, no cuantificado", '
  'sin valor centinela; PENDIENTES §7 Q4).';

-- (no se agregan funciones; el REVOKE de cierre de las migraciones con funciones no aplica)

-- ══════════════════════════════════════════════════════════════════
-- Verificación esperada tras aplicar
-- 1. INSERT de un componente con monetization_status='N_A' y los 3 valores NULL -> acepta;
--    con N_A y original_value (o rango) -> falla.
-- 2. Igual con monetization_status='OBSERVED' -> falla por cff_event_components_valor_o_sin_cifra.
-- 3. N_A con solo original_value_min -> falla (rango incompleto).
-- 4. Los componentes existentes (con cifra) siguen cumpliendo el CHECK.
-- ══════════════════════════════════════════════════════════════════
