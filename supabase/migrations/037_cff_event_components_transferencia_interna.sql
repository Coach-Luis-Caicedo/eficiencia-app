-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 037: cff_event_components.es_transferencia_interna_pura
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- Cierra DISENO_SENALES_ADMISIBILIDAD_CFF.md: de las 5 señales de
-- admisibilidad (§18) que evaluarAdmisibilidad() exige por componente,
-- 4 se derivan en JS sin tocar el esquema (relationship_resolution_
-- permite_inclusion ya se calcula dentro de consolidacion.js;
-- monetary_basis_valid/temporal_basis_valid/scope_valid se derivan en
-- src/motores/cff.js a partir de campos que YA existen). Solo
-- esTransferenciaInternaPura es juicio genuino del analista, sin forma
-- de derivarse (§14 del documento técnico define el concepto -- "no
-- representa consumo real de recursos, es reasignación contable entre
-- nodos" -- pero no da ninguna regla mecánica para decidirlo por
-- componente).
--
-- Corrección de DDL limpia sobre una tabla ya aplicada (032) -- Luis
-- confirmó que cff_event_components no tiene datos reales todavía
-- ("sistema en construcción"), así que esto es un ALTER TABLE aditivo,
-- no una migración de datos.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE motores_eficiencia.cff_event_components
  ADD COLUMN es_transferencia_interna_pura boolean NOT NULL;

COMMENT ON COLUMN motores_eficiencia.cff_event_components.es_transferencia_interna_pura IS
  'Señal de admisibilidad §18 (esTransferenciaInternaPura en el motor) -- '
  'juicio del analista: ¿este componente representa consumo real de '
  'recursos, o es pura reasignación contable entre nodos internos (§14, '
  'DISENO_SENALES_ADMISIBILIDAD_CFF.md §1.2)? Sin default -- no se '
  'fabrica, el motor tampoco la asume por ausencia '
  '(costos_compartidos.js:filtrarTransferenciasInternasPuras: "no se '
  'asume por ausencia").';

-- ══════════════════════════════════════════════════════════════════
-- Verificación sugerida tras aplicar
-- ══════════════════════════════════════════════════════════════════
-- 1. SELECT column_name, is_nullable FROM information_schema.columns
--    WHERE table_schema='motores_eficiencia' AND table_name='cff_event_components'
--    AND column_name='es_transferencia_interna_pura'; → 1 fila, is_nullable='NO'.
-- 2. Insertar un componente sin esta columna -- debe fallar (NOT NULL,
--    sin DEFAULT).
