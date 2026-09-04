/**
 * motor-cff/enums.js
 *
 * Registro canónico de enums del Documento Técnico CFF v1.1 FINAL v2
 * (docs/EFICIENCIA_Documento_Tecnico_CFF_v1_1_FINAL_v2.docx).
 *
 * Fuentes combinadas, en este orden de precedencia:
 *   1. §21 "Estados canónicos y propagación" — los 6 enums de estado que
 *      se propagan entre capas (única fuente para RELATION_RESOLUTION_STATUS
 *      y CALCULATION_STATUS, que NO aparecen en §23).
 *   2. §23 "Enumeraciones canónicas v1.1" — lista canónica explícita.
 *   3. Enums que solo aparecen inline dentro de un contrato de §22 y que
 *      ni §21 ni §23 listan aparte. El documento no los repite en una tabla
 *      canónica, pero sí los define sin ambigüedad en el propio contrato
 *      (aprobado por Luis: "trato §22 como autoritativo cuando §23 no lo
 *      contradice").
 *
 * Dos entradas de §23 (AVOIDABILITY_STATUS, ERROR_SEVERITY) no cuelgan de
 * ningún contrato de §22 ni de ninguna lógica de Fase 0-5: se registran aquí
 * como vocabulario aislado, sin conectarse a ningún validador, porque el
 * propio documento las define en su lista canónica — no es invención de
 * este módulo. AVOIDABILITY_STATUS pertenece a la capa de evitabilidad
 * (§27, fuera del núcleo CFF, §33.1); no se usa en ningún contrato ni
 * cálculo de este módulo. ERROR_SEVERITY se usa conceptualmente en §25
 * (severidad de fallos), pero no es un campo declarado de ningún contrato
 * de §22 — se deja disponible para cuando la Fase 5 (fallos/short-circuit)
 * lo necesite, sin cablearlo todavía.
 */

'use strict';

var ENUMS = {
  // ── §21 (autoridad) / §23 (repetidos ahí) ────────────────────────────
  OUTPUT_STATUS: ['VALID', 'VALID_WITH_LIMITATIONS', 'INSUFFICIENT', 'INVALID', 'NOT_APPLICABLE'],
  MONETIZATION_STATUS: ['OBSERVED', 'ESTIMATED', 'EXPOSURE', 'N_A'],
  ATTRIBUTION_STATUS: ['CONFIRMED', 'SUPPORTED', 'UNRESOLVED', 'N_A'],
  COVERAGE_STATUS: ['FULL', 'PARTIAL', 'LIMITED', 'INSUFFICIENT'],
  // Solo en §21 — no aparecen en la tabla de §23.
  RELATION_RESOLUTION_STATUS: ['RESOLVED', 'PARTIALLY_RESOLVED', 'UNRESOLVED', 'INVALID'],
  CALCULATION_STATUS: ['VALID', 'VALID_WITH_LIMITATIONS', 'STALE', 'INVALID'],

  // ── Solo en §23 ───────────────────────────────────────────────────────
  PRIMARY_MECHANISM: ['ADDITIONAL_CONSUMPTION', 'LOST_CAPACITY', 'REPLACEMENT', 'UNCAPTURED_VALUE'],
  FINANCIAL_NATURE: ['INCREMENTAL_COST', 'CAPACITY_VALUE', 'UNCAPTURED_MARGIN'],
  RELATION_TYPE: ['INDEPENDENT', 'DUPLICATE', 'CONTAINS', 'ALTERNATIVE_VALUATION', 'DEPENDENT_COST', 'UNKNOWN'],
  CONTAINMENT_SCOPE: ['FULL', 'PARTIAL_QUANTIFIED', 'PARTIAL_UNQUANTIFIED'],
  TEMPORAL_NATURE: ['PERIOD_FLOW', 'STOCK', 'RATE'],
  VALUATION_BASIS: ['NOMINAL', 'REAL'],

  // ── Aisladas, fuera del núcleo — registradas por completitud de §23,
  //    NO conectadas a ningún contrato ni lógica de este módulo. ────────
  ERROR_SEVERITY: ['WARNING', 'DEGRADED', 'BLOCKING'],
  AVOIDABILITY_STATUS: ['AVOIDABLE', 'PARTIALLY_AVOIDABLE', 'NOT_ESTABLISHED'], // §27 — fuera de núcleo (§33.1)

  // ── Inline-only en §22, tratadas como autoritativas (aprobado) ───────
  SOURCE_TYPE: ['PIIO', 'EXTERNAL_OPERATIONAL_RECORD', 'VERIFIED_DIAGNOSTIC_FINDING'], // §22.1 CFF_EVENT.source_type
  EVENT_STATUS: ['OPEN', 'COMPLETE', 'INVALID'], // §22.1 CFF_EVENT.status (referenciado por §18 COMPONENT_ADMISSIBILITY)
  CALCULATION_MODE: ['UNIT_RATE', 'DIRECT_VALUE', 'DERIVED_FORMULA'], // §22.2 ECONOMIC_COMPONENT.calculation_mode
  VALUATION_ROLE: ['PRIMARY', 'INCLUDED', 'ALTERNATIVE', 'EXCLUDED'], // §22.2 ECONOMIC_COMPONENT.valuation_role
  ECONOMIC_SCOPE: ['NODE', 'BUSINESS_UNIT', 'ORGANIZATION'], // §22.2 ECONOMIC_COMPONENT.economic_scope
  COUNTERPARTY_SCOPE: ['INTERNAL', 'EXTERNAL', 'NONE'], // §22.2 ECONOMIC_COMPONENT.counterparty_scope

  // Las 6 dimensiones del motor determinista de atribución (§11, §22.4)
  OPERATIONAL_CORRESPONDENCE: ['YES', 'NO', 'UNCLEAR'],
  TEMPORAL_CORRESPONDENCE: ['COMPATIBLE', 'INCOMPATIBLE', 'UNCLEAR'],
  ORGANIZATIONAL_CORRESPONDENCE: ['MATCH', 'MISMATCH', 'UNCLEAR'],
  OPERATIONAL_EVIDENCE: ['DIRECT', 'INDIRECT', 'NONE'],
  SYSTEM_CONVERGENCE: ['CONVERGENT', 'MIXED', 'ABSENT', 'NOT_APPLICABLE'],
  ALTERNATIVE_EXPLANATION: ['NONE_DOMINANT', 'COMPETING', 'DOMINANT', 'UNKNOWN'],

  // §7.1 "Realización económica" — EXTENSIÓN de Fase 1, aprobada por Luis.
  // El documento define este enum en prosa (§7.1) pero §22.2 ECONOMIC_COMPONENT
  // nunca le da un campo en el contrato — es un vacío del documento, no una
  // omisión de Fase 0. Se agrega aquí y el campo correspondiente se agrega a
  // ESQUEMA_ECONOMIC_COMPONENT en contratos.js (recovery_realization_type?,
  // opcional). No modifica el CFF observado (§7.1: "únicamente preserva la
  // naturaleza de una eventual recuperación").
  RECOVERY_REALIZATION_TYPE: ['CASH_COST_AVOIDANCE', 'CAPTURED_MARGIN', 'CAPACITY_RELEASE', 'OTHER_VALIDATED']

  // RUN_STATUS (§22.9 CFF_RUN.run_status) — deliberadamente NO registrado
  // aquí. El documento nunca enumera sus valores posibles en ningún lugar
  // (ni §21, ni §23, ni una nota inline junto al contrato). No es un
  // enum inline-autoritativo como los de arriba: es un campo sin
  // definición. Fabricar valores (p.ej. copiar CALCULATION_STATUS) sería
  // inventar alcance que el documento no dio. El validador de CFF_RUN
  // (contratos.js) exige que `run_status` esté presente y sea string,
  // pero NO valida contra un enum — ver README, "Ambigüedades".
};

module.exports = ENUMS;
