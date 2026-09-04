/**
 * motor-cff/contratos.js — Fase 0
 *
 * Los 10 contratos canónicos de datos del CFF (§22.1-22.10) como
 * VALIDADORES, no como lógica de negocio: verifican que un objeto trae
 * los campos obligatorios, que sus tipos son los declarados y que sus
 * enums pertenecen al vocabulario canónico (enums.js). No calculan nada,
 * no imputan nada, no resuelven relaciones ni admisibilidad — eso es de
 * fases posteriores.
 *
 * Sobre "obligatorio / condicional / opcional": el documento marca
 * opcionales con `?`. Los campos sin `?` se tratan como obligatorios,
 * salvo 5 reglas condicionales explícitas (aprobadas por Luis) que hacen
 * obligatorio o prohibido un campo según el valor de otro campo del MISMO
 * objeto — es verificación de coherencia interna, no lógica de negocio:
 *
 *   1. ECONOMIC_COMPONENT.formula_id / .formula_version / .input_variables[]
 *      (no vacío) — obligatorios si calculation_mode === DERIVED_FORMULA.
 *   2. ECONOMIC_RELATION.containment_scope — obligatorio si
 *      relation_type === CONTAINS; RECHAZADO (no debe declararse) en
 *      cualquier otro relation_type.
 *   3. ECONOMIC_RELATION.direction — obligatorio si relation_type ∈
 *      {CONTAINS, DEPENDENT_COST} (relaciones dirigidas); RECHAZADO si
 *      relation_type === DUPLICATE (simétrica — no solo se ignora, se
 *      rechaza si está presente, por instrucción explícita de Luis).
 *      Para INDEPENDENT / ALTERNATIVE_VALUATION / UNKNOWN el documento no
 *      clasifica la relación como dirigida ni como simétrica: se deja
 *      opcional, sin exigir ni rechazar — ver README, "Ambigüedades".
 *   4. MONETARY_BASIS.basis_value XOR (basis_value_min Y basis_value_max)
 *      — nunca los tres, nunca ninguno (§9).
 *   5. ECONOMIC_COMPONENT.normalized_value / .reporting_currency — deben
 *      declararse juntos o ninguno de los dos. Esto es más débil que "la
 *      consolidación multi-moneda los exige": Fase 0 valida UN objeto
 *      aislado y no puede saber si la corrida en la que participará es
 *      multi-moneda — esa obligatoriedad real se aplica en Fase 4a
 *      (normalización), que sí ve el conjunto. Aquí solo se garantiza que
 *      el objeto no declare uno sin el otro.
 *
 * Ninguna otra regla condicional se implementó en Fase 0 aunque el texto del
 * documento sugiera candidatas (p.ej. quantified_overlap_value cuando
 * containment_scope=PARTIAL_QUANTIFIED, o selected_primary cuando
 * relation_type∈{DUPLICATE,ALTERNATIVE_VALUATION}) — quedan señaladas en el
 * README como candidatas de Fase 3 (relaciones), no fabricadas aquí sin
 * aprobación explícita.
 *
 * ── Extensiones de Fase 1 (aprobadas por Luis, documentadas como tales
 *    porque §22.2 no las contempla literalmente) ──────────────────────────
 *
 *   6. ECONOMIC_COMPONENT.recovery_realization_type — campo NUEVO, opcional.
 *      §7.1 define el enum en prosa pero nunca le da un campo en el
 *      contrato; se completa aquí.
 *   7. ECONOMIC_COMPONENT.original_value se vuelve CONDICIONAL: XOR con
 *      (original_value_min Y original_value_max) — mismo patrón que
 *      MONETARY_BASIS.basis_value (regla 4), para el caso en que
 *      calculation_mode=UNIT_RATE resuelve contra una MONETARY_BASIS que
 *      solo trae rango (nunca se promedia, nunca se elige un extremo —
 *      motor-cff/monetizacion.js). original_value_min/max también son
 *      campos NUEVOS, no están en el §22.2 literal.
 *   8. Cuando original_value_min/max están presentes (resultado en rango),
 *      monetization_status NO puede ser OBSERVED — un valor con
 *      incertidumbre estructural no es "observado" en el sentido de §10.
 */

'use strict';

var ENUMS = require('./enums');

// ── Validador genérico ─────────────────────────────────────────────────

/**
 * rangoIncompatibleConObserved(tieneRangoCompleto, monetizationStatus)
 *
 * Regla 8 (Fase 1) como función pura, exportada — ÚNICA fuente de verdad.
 * La usan tanto reglasCondicionalesEconomicComponent() de este archivo
 * (valida cualquier objeto que entre al sistema) como
 * monetizacion.aplicarResultadoAComponente() (rechaza en el momento en que
 * el rango se origina, antes de que el objeto exista siquiera). Es defensa
 * en profundidad genuina — dos puntos de entrada, una sola regla — no dos
 * implementaciones que puedan divergir: si esto cambia, cambia para los
 * dos llamadores a la vez.
 */
function rangoIncompatibleConObserved(tieneRangoCompleto, monetizationStatus) {
  return !!(tieneRangoCompleto && monetizationStatus === 'OBSERVED');
}

function tipoValido(tipo, valor) {
  if (tipo === 'array') return Array.isArray(valor);
  if (tipo === 'object') return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
  if (tipo === 'number') return typeof valor === 'number' && !isNaN(valor);
  if (tipo === 'string') return typeof valor === 'string';
  if (tipo === 'boolean') return typeof valor === 'boolean';
  throw new Error('tipoValido: tipo de esquema desconocido "' + tipo + '"');
}

/**
 * validarObjeto(schema, obj)
 *
 * schema: array de { name, required, type, enum? }
 *   - enum, si está presente, es una CLAVE de ENUMS (no un array literal) —
 *     salvo que el propio documento no defina el enum (caso RUN_STATUS),
 *     en cuyo campo se omite `enum` y solo se valida el tipo.
 *
 * Devuelve { valido, faltantes: [nombre,...], invalidos: [mensaje,...] }.
 * faltantes = campo obligatorio ausente. invalidos = campo presente pero
 * de tipo o enum incorrecto.
 */
function validarObjeto(schema, obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valido: false, faltantes: ['(objeto completo — se recibió ' + (obj === null ? 'null' : typeof obj) + ')'], invalidos: [] };
  }
  var faltantes = [];
  var invalidos = [];
  schema.forEach(function (campo) {
    var val = obj[campo.name];
    var presente = val !== undefined && val !== null;
    if (!presente) {
      if (campo.required) faltantes.push(campo.name);
      return;
    }
    if (!tipoValido(campo.type, val)) {
      invalidos.push(campo.name + ': se esperaba ' + campo.type + ', llegó ' + (Array.isArray(val) ? 'array' : typeof val));
      return;
    }
    if (campo.enum) {
      var valores = ENUMS[campo.enum];
      if (valores && valores.indexOf(val) === -1) {
        invalidos.push(campo.name + ': "' + val + '" no pertenece a ' + campo.enum + ' (' + valores.join(' | ') + ')');
      }
    }
  });
  return { valido: faltantes.length === 0 && invalidos.length === 0, faltantes: faltantes, invalidos: invalidos };
}

function combinar(base, extraMensajes) {
  var invalidos = base.invalidos.concat(extraMensajes);
  return { valido: base.faltantes.length === 0 && invalidos.length === 0, faltantes: base.faltantes, invalidos: invalidos };
}

// ── §22.1 CFF_EVENT ─────────────────────────────────────────────────────

var ESQUEMA_CFF_EVENT = [
  { name: 'event_id', required: true, type: 'string' },
  { name: 'organization_id', required: true, type: 'string' },
  { name: 'source_type', required: true, type: 'string', enum: 'SOURCE_TYPE' },
  { name: 'source_ids', required: true, type: 'array' },
  { name: 'phenomenon_id', required: true, type: 'string' },
  { name: 'domain_id', required: true, type: 'string' },
  { name: 'node_id', required: true, type: 'string' },
  { name: 'period_start', required: true, type: 'string' },
  { name: 'period_end', required: true, type: 'string' },
  { name: 'event_type', required: true, type: 'string' },
  { name: 'event_description', required: true, type: 'string' },
  { name: 'operational_quantity', required: false, type: 'number' },
  { name: 'operational_unit', required: false, type: 'string' },
  { name: 'metric_definition_version', required: false, type: 'string' },
  { name: 'exposure_definition', required: false, type: 'string' },
  { name: 'status', required: true, type: 'string', enum: 'EVENT_STATUS' },
  { name: 'components', required: true, type: 'array' },
  { name: 'flags', required: true, type: 'array' }
];
function validarCFFEvent(obj) { return validarObjeto(ESQUEMA_CFF_EVENT, obj); }

// ── §22.2 ECONOMIC_COMPONENT ─────────────────────────────────────────────

var ESQUEMA_ECONOMIC_COMPONENT = [
  { name: 'component_id', required: true, type: 'string' },
  { name: 'event_id', required: true, type: 'string' },
  { name: 'organization_id', required: true, type: 'string' },
  { name: 'phenomenon_id', required: true, type: 'string' },
  { name: 'node_id', required: true, type: 'string' },
  { name: 'consequence_id', required: true, type: 'string' },
  { name: 'primary_mechanism', required: true, type: 'string', enum: 'PRIMARY_MECHANISM' },
  { name: 'financial_nature', required: true, type: 'string', enum: 'FINANCIAL_NATURE' },
  { name: 'resource_type', required: true, type: 'string' }, // vocabulario abierto, no enumerado por el documento
  { name: 'quantity', required: true, type: 'number' },
  { name: 'unit', required: true, type: 'string' },
  { name: 'temporal_nature', required: true, type: 'string', enum: 'TEMPORAL_NATURE' },
  { name: 'source_frequency', required: true, type: 'string' },
  { name: 'calculation_frequency', required: true, type: 'string' },
  { name: 'aggregation_frequency', required: true, type: 'string' },
  { name: 'calculation_mode', required: true, type: 'string', enum: 'CALCULATION_MODE' },
  { name: 'formula_id', required: false, type: 'string' },
  { name: 'formula_version', required: false, type: 'string' },
  { name: 'input_variables', required: true, type: 'array' },
  { name: 'monetary_basis_id', required: true, type: 'string' },
  { name: 'original_value', required: false, type: 'number' }, // Fase 1: condicional — ver regla 7 (XOR con el rango)
  { name: 'original_value_min', required: false, type: 'number' }, // NUEVO, Fase 1 — no está en §22.2 literal
  { name: 'original_value_max', required: false, type: 'number' }, // NUEVO, Fase 1 — no está en §22.2 literal
  { name: 'original_currency', required: true, type: 'string' },
  { name: 'normalized_value', required: false, type: 'number' },
  { name: 'reporting_currency', required: false, type: 'string' },
  { name: 'valuation_basis', required: true, type: 'string', enum: 'VALUATION_BASIS' },
  { name: 'monetization_status', required: true, type: 'string', enum: 'MONETIZATION_STATUS' },
  { name: 'attribution_status', required: true, type: 'string', enum: 'ATTRIBUTION_STATUS' },
  { name: 'valuation_role', required: true, type: 'string', enum: 'VALUATION_ROLE' },
  { name: 'economic_scope', required: true, type: 'string', enum: 'ECONOMIC_SCOPE' },
  { name: 'counterparty_scope', required: true, type: 'string', enum: 'COUNTERPARTY_SCOPE' },
  { name: 'shared_cost_id', required: false, type: 'string' },
  { name: 'deduplication_group_id', required: false, type: 'string' },
  { name: 'dependency_refs', required: true, type: 'array' },
  { name: 'include_in_cff', required: true, type: 'boolean' },
  { name: 'exclusion_reason', required: false, type: 'string' },
  { name: 'flags', required: true, type: 'array' },
  { name: 'recovery_realization_type', required: false, type: 'string', enum: 'RECOVERY_REALIZATION_TYPE' } // NUEVO, Fase 1 — §7.1 sin campo en §22.2
];

function reglasCondicionalesEconomicComponent(obj) {
  var extra = [];
  if (obj && obj.calculation_mode === 'DERIVED_FORMULA') {
    if (obj.formula_id == null) extra.push('formula_id requerido cuando calculation_mode=DERIVED_FORMULA');
    if (obj.formula_version == null) extra.push('formula_version requerido cuando calculation_mode=DERIVED_FORMULA');
    if (!Array.isArray(obj.input_variables) || obj.input_variables.length === 0) {
      extra.push('input_variables[] no puede estar vacío cuando calculation_mode=DERIVED_FORMULA');
    }
  }
  if (obj) {
    var tieneNorm = obj.normalized_value != null;
    var tieneRepCur = obj.reporting_currency != null;
    if (tieneNorm !== tieneRepCur) {
      extra.push('normalized_value y reporting_currency deben declararse juntos o ninguno de los dos (coherencia de Fase 0)');
    }
  }
  if (obj) {
    // Regla 7 (Fase 1): original_value XOR (original_value_min Y original_value_max).
    var tieneValor = obj.original_value != null;
    var tieneMin = obj.original_value_min != null;
    var tieneMax = obj.original_value_max != null;
    var tieneRangoCompleto = tieneMin && tieneMax;
    var tieneRangoParcial = tieneMin !== tieneMax;
    if (tieneRangoParcial) {
      extra.push('original_value_min y original_value_max deben declararse juntos (rango completo) o ninguno');
    }
    if (tieneValor && tieneRangoCompleto) {
      extra.push('original_value y original_value_min/max son mutuamente excluyentes — no declarar ambos, no promediar (mismo principio que MONETARY_BASIS.basis_value, §9)');
    }
    if (!tieneValor && !tieneRangoCompleto) {
      extra.push('debe declararse original_value, o original_value_min y original_value_max — ninguna representación de valor presente');
    }
    // Regla 8 (Fase 1): un resultado en rango no puede declararse OBSERVED.
    // Ver también motor-cff/monetizacion.js (aplicarResultadoAComponente) —
    // ambos llaman a rangoIncompatibleConObserved(), no hay una segunda
    // implementación que pueda divergir.
    if (rangoIncompatibleConObserved(tieneRangoCompleto, obj.monetization_status)) {
      extra.push('monetization_status no puede ser OBSERVED cuando el valor es un rango (original_value_min/max) — un valor con incertidumbre estructural no es "observado" (§10); debe ser ESTIMATED (o EXPOSURE/N_A)');
    }
  }
  return extra;
}

function validarEconomicComponent(obj) {
  var base = validarObjeto(ESQUEMA_ECONOMIC_COMPONENT, obj);
  return combinar(base, reglasCondicionalesEconomicComponent(obj));
}

// ── §22.3 MONETARY_BASIS ─────────────────────────────────────────────────

var ESQUEMA_MONETARY_BASIS = [
  { name: 'monetary_basis_id', required: true, type: 'string' },
  { name: 'basis_type', required: true, type: 'string' }, // enumerado en prosa §9 (ACCOUNTING_ACTUAL...), no repetido en §23 — se registra igual, ver README
  { name: 'basis_value', required: false, type: 'number' }, // condicionalmente obligatorio — ver regla XOR abajo
  { name: 'basis_value_min', required: false, type: 'number' },
  { name: 'basis_value_max', required: false, type: 'number' },
  { name: 'basis_unit', required: true, type: 'string' },
  { name: 'source', required: true, type: 'string' },
  { name: 'source_reference', required: true, type: 'string' },
  { name: 'currency', required: true, type: 'string' },
  { name: 'valuation_date', required: true, type: 'string' },
  { name: 'valid_from', required: true, type: 'string' },
  { name: 'valid_to', required: true, type: 'string' },
  { name: 'valuation_basis', required: true, type: 'string', enum: 'VALUATION_BASIS' },
  { name: 'fx_reference', required: false, type: 'string' },
  { name: 'price_index_reference', required: false, type: 'string' },
  { name: 'version', required: true, type: 'string' },
  { name: 'flags', required: true, type: 'array' }
];

var BASIS_TYPES = ['ACCOUNTING_ACTUAL', 'CONTRACTUAL_RATE', 'CALCULATED_INTERNAL', 'INTERNAL_STANDARD', 'EXTERNAL_BENCHMARK']; // §9

function reglasCondicionalesMonetaryBasis(obj) {
  var extra = [];
  if (!obj) return extra;
  if (obj.basis_type != null && BASIS_TYPES.indexOf(obj.basis_type) === -1) {
    extra.push('basis_type: "' + obj.basis_type + '" no pertenece a los tipos de §9 (' + BASIS_TYPES.join(' | ') + ')');
  }
  var tieneValue = obj.basis_value != null;
  var tieneMin = obj.basis_value_min != null;
  var tieneMax = obj.basis_value_max != null;
  var tieneRangoCompleto = tieneMin && tieneMax;
  var tieneRangoParcial = tieneMin !== tieneMax;
  if (tieneRangoParcial) {
    extra.push('basis_value_min y basis_value_max deben declararse juntos (rango completo) o ninguno');
  }
  if (tieneValue && tieneRangoCompleto) {
    extra.push('basis_value y basis_value_min/max son mutuamente excluyentes (§9) — no declarar ambos, no promediar');
  }
  if (!tieneValue && !tieneRangoCompleto) {
    extra.push('debe declararse basis_value, o basis_value_min y basis_value_max — ninguna representación presente');
  }
  return extra;
}

function validarMonetaryBasis(obj) {
  var base = validarObjeto(ESQUEMA_MONETARY_BASIS, obj);
  return combinar(base, reglasCondicionalesMonetaryBasis(obj));
}

// ── §22.4 ATTRIBUTION_ASSESSMENT ─────────────────────────────────────────

var ESQUEMA_ATTRIBUTION_ASSESSMENT = [
  { name: 'assessment_id', required: true, type: 'string' },
  { name: 'assessment_version', required: true, type: 'string' },
  { name: 'event_id', required: true, type: 'string' },
  { name: 'operational_correspondence', required: true, type: 'string', enum: 'OPERATIONAL_CORRESPONDENCE' },
  { name: 'temporal_correspondence', required: true, type: 'string', enum: 'TEMPORAL_CORRESPONDENCE' },
  { name: 'organizational_correspondence', required: true, type: 'string', enum: 'ORGANIZATIONAL_CORRESPONDENCE' },
  { name: 'operational_evidence', required: true, type: 'string', enum: 'OPERATIONAL_EVIDENCE' },
  { name: 'system_convergence', required: true, type: 'string', enum: 'SYSTEM_CONVERGENCE' },
  { name: 'alternative_explanation', required: true, type: 'string', enum: 'ALTERNATIVE_EXPLANATION' },
  { name: 'diagnostic_context', required: true, type: 'object' }, // contenedor obligatorio; sus 4 sub-refs (cfg_ref? etc.) son todos opcionales, sin tipar aparte
  { name: 'supporting_evidence', required: true, type: 'array' },
  { name: 'conflicting_evidence', required: true, type: 'array' },
  { name: 'excluded_causes', required: true, type: 'array' },
  { name: 'unresolved_causes', required: true, type: 'array' },
  { name: 'status', required: true, type: 'string', enum: 'ATTRIBUTION_STATUS' },
  { name: 'rationale', required: true, type: 'string' },
  { name: 'created_at', required: true, type: 'string' }
];
function validarAttributionAssessment(obj) { return validarObjeto(ESQUEMA_ATTRIBUTION_ASSESSMENT, obj); }

// ── §22.5 ECONOMIC_RELATION ──────────────────────────────────────────────

var ESQUEMA_ECONOMIC_RELATION = [
  { name: 'relation_id', required: true, type: 'string' },
  { name: 'component_a_id', required: true, type: 'string' },
  { name: 'component_b_id', required: true, type: 'string' },
  { name: 'relation_type', required: true, type: 'string', enum: 'RELATION_TYPE' },
  { name: 'direction', required: false, type: 'string' }, // condicional — ver reglas abajo
  { name: 'effective_from', required: true, type: 'string' },
  { name: 'effective_to', required: true, type: 'string' },
  { name: 'containment_scope', required: false, type: 'string', enum: 'CONTAINMENT_SCOPE' }, // condicional
  { name: 'quantified_overlap_value', required: false, type: 'number' },
  { name: 'selected_primary', required: false, type: 'string' },
  { name: 'resolution_status', required: true, type: 'string', enum: 'RELATION_RESOLUTION_STATUS' },
  { name: 'resolution_method', required: true, type: 'string' }, // no enumerado por el documento
  { name: 'rationale', required: true, type: 'string' },
  { name: 'version', required: true, type: 'string' }
];

var RELACIONES_DIRIGIDAS = ['CONTAINS', 'DEPENDENT_COST']; // §13.3
var RELACIONES_SIMETRICAS = ['DUPLICATE']; // §13.3 — la única que el documento clasifica explícitamente como simétrica

function reglasCondicionalesEconomicRelation(obj) {
  var extra = [];
  if (!obj) return extra;

  if (obj.relation_type === 'CONTAINS') {
    if (obj.containment_scope == null) extra.push('containment_scope requerido cuando relation_type=CONTAINS (§13.1)');
  } else if (obj.containment_scope != null) {
    extra.push('containment_scope no aplica fuera de relation_type=CONTAINS (presente en "' + obj.relation_type + '")');
  }

  if (RELACIONES_DIRIGIDAS.indexOf(obj.relation_type) !== -1) {
    if (obj.direction == null) extra.push('direction requerido cuando relation_type=' + obj.relation_type + ' (relación dirigida, §13.3)');
  } else if (RELACIONES_SIMETRICAS.indexOf(obj.relation_type) !== -1) {
    if (obj.direction != null) extra.push('direction no debe declararse en relation_type=' + obj.relation_type + ' (relación simétrica, §13.3) — rechazado, no solo ignorado');
  }
  // INDEPENDENT / ALTERNATIVE_VALUATION / UNKNOWN: el documento no las
  // clasifica como dirigidas ni simétricas — direction queda opcional,
  // sin exigir ni rechazar. Ver README, "Ambigüedades".

  return extra;
}

function validarEconomicRelation(obj) {
  var base = validarObjeto(ESQUEMA_ECONOMIC_RELATION, obj);
  return combinar(base, reglasCondicionalesEconomicRelation(obj));
}

// ── §22.6 CONSOLIDATION_GROUP ─────────────────────────────────────────────

var ESQUEMA_CONSOLIDATION_GROUP = [
  { name: 'group_id', required: true, type: 'string' },
  { name: 'scope', required: true, type: 'string' }, // posible reutilización de ECONOMIC_SCOPE — no forzado, ver README
  { name: 'node_set', required: true, type: 'array' },
  { name: 'period_start', required: true, type: 'string' },
  { name: 'period_end', required: true, type: 'string' },
  { name: 'component_ids', required: true, type: 'array' },
  { name: 'selected_components', required: true, type: 'array' },
  { name: 'excluded_components', required: true, type: 'array' },
  { name: 'unresolved_components', required: true, type: 'array' },
  { name: 'resolution_status', required: true, type: 'string', enum: 'RELATION_RESOLUTION_STATUS' },
  { name: 'resolution_rule', required: true, type: 'string' },
  { name: 'rationale', required: true, type: 'string' },
  { name: 'version', required: true, type: 'string' }
];
function validarConsolidationGroup(obj) { return validarObjeto(ESQUEMA_CONSOLIDATION_GROUP, obj); }

// ── §22.7 CFF_COVERAGE ────────────────────────────────────────────────────

var ESQUEMA_CFF_COVERAGE = [
  { name: 'case_scope', required: true, type: 'string' },
  { name: 'material_events_total', required: true, type: 'number' },
  { name: 'material_events_evaluable', required: true, type: 'number' },
  { name: 'monetizable_events', required: true, type: 'number' },
  { name: 'attributable_events', required: true, type: 'number' },
  { name: 'unresolved_events', required: true, type: 'number' },
  { name: 'excluded_material_events', required: true, type: 'array' },
  { name: 'operational_coverage_status', required: true, type: 'string', enum: 'COVERAGE_STATUS' },
  { name: 'monetization_coverage_status', required: true, type: 'string', enum: 'COVERAGE_STATUS' },
  { name: 'attribution_coverage_status', required: true, type: 'string', enum: 'COVERAGE_STATUS' },
  { name: 'overall_coverage_status', required: true, type: 'string', enum: 'COVERAGE_STATUS' },
  { name: 'limitations', required: true, type: 'array' }
];
function validarCFFCoverage(obj) { return validarObjeto(ESQUEMA_CFF_COVERAGE, obj); }

// ── §22.8 CFF_RESULT ──────────────────────────────────────────────────────

var ESQUEMA_CFF_RESULT = [
  { name: 'cff_run_id', required: true, type: 'string' },
  { name: 'cff_case_id', required: true, type: 'string' },
  { name: 'calculation_version', required: true, type: 'string' },
  { name: 'ruleset_version', required: true, type: 'string' },
  { name: 'period_start', required: true, type: 'string' },
  { name: 'period_end', required: true, type: 'string' },
  { name: 'scope', required: true, type: 'string' },
  { name: 'node_set', required: true, type: 'array' },
  { name: 'reporting_currency', required: true, type: 'string' },
  { name: 'valuation_basis', required: true, type: 'string', enum: 'VALUATION_BASIS' },
  { name: 'confirmed_observed', required: true, type: 'number' },
  { name: 'confirmed_estimated', required: true, type: 'number' },
  { name: 'supported_observed', required: true, type: 'number' },
  { name: 'supported_estimated', required: true, type: 'number' },
  { name: 'cff_confirmed', required: true, type: 'number' },
  { name: 'cff_supported_additional', required: true, type: 'number' },
  { name: 'cff_total', required: true, type: 'number' },
  { name: 'exposure_total', required: false, type: 'number' },
  { name: 'unresolved_impact_total', required: false, type: 'number' },
  { name: 'coverage', required: true, type: 'object' }, // CFF_COVERAGE embebido
  { name: 'event_profile', required: true, type: 'array' },
  { name: 'mechanism_profile', required: true, type: 'array' },
  { name: 'financial_nature_profile', required: true, type: 'array' },
  { name: 'node_profile', required: true, type: 'array' },
  { name: 'annualization', required: false, type: 'object' },
  { name: 'calculation_status', required: true, type: 'string', enum: 'CALCULATION_STATUS' },
  { name: 'warnings', required: true, type: 'array' },
  { name: 'errors', required: true, type: 'array' },
  { name: 'dependency_refs', required: true, type: 'array' },
  { name: 'calculated_at', required: true, type: 'string' }
];
function validarCFFResult(obj) { return validarObjeto(ESQUEMA_CFF_RESULT, obj); }

// ── §22.9 CFF_RUN ──────────────────────────────────────────────────────────

var ESQUEMA_CFF_RUN = [
  { name: 'run_id', required: true, type: 'string' },
  { name: 'cff_case_id', required: true, type: 'string' },
  { name: 'calculation_version', required: true, type: 'string' },
  { name: 'parent_calculation_version', required: false, type: 'string' },
  { name: 'ruleset_version', required: true, type: 'string' },
  { name: 'formula_versions', required: true, type: 'array' },
  { name: 'monetary_basis_versions', required: true, type: 'array' },
  { name: 'relationship_versions', required: true, type: 'array' },
  { name: 'input_snapshot_ids', required: true, type: 'array' },
  { name: 'update_reason', required: true, type: 'string' },
  { name: 'generated_at', required: true, type: 'string' },
  // run_status: sin `enum:` — el documento no define sus valores en ningún
  // lugar (ni §21, ni §23, ni nota inline). Se valida solo tipo. Ver README.
  { name: 'run_status', required: true, type: 'string' }
];
function validarCFFRun(obj) { return validarObjeto(ESQUEMA_CFF_RUN, obj); }

// ── §22.10 TRACE_PATH ──────────────────────────────────────────────────────

var ESQUEMA_TRACE_PATH = [
  { name: 'output_id', required: true, type: 'string' },
  { name: 'event_ids', required: true, type: 'array' },
  { name: 'component_ids', required: true, type: 'array' },
  { name: 'source_ids', required: true, type: 'array' },
  { name: 'formula_ids', required: true, type: 'array' },
  { name: 'monetary_basis_ids', required: true, type: 'array' },
  { name: 'assessment_ids', required: true, type: 'array' },
  { name: 'relationship_ids', required: true, type: 'array' },
  { name: 'version_ids', required: true, type: 'array' }
];
function validarTracePath(obj) { return validarObjeto(ESQUEMA_TRACE_PATH, obj); }

module.exports = {
  // validadores
  validarCFFEvent: validarCFFEvent,
  validarEconomicComponent: validarEconomicComponent,
  validarMonetaryBasis: validarMonetaryBasis,
  validarAttributionAssessment: validarAttributionAssessment,
  validarEconomicRelation: validarEconomicRelation,
  validarConsolidationGroup: validarConsolidationGroup,
  validarCFFCoverage: validarCFFCoverage,
  validarCFFResult: validarCFFResult,
  validarCFFRun: validarCFFRun,
  validarTracePath: validarTracePath,
  // utilidades expuestas para tests / reutilización
  validarObjeto: validarObjeto,
  BASIS_TYPES: BASIS_TYPES,
  RELACIONES_DIRIGIDAS: RELACIONES_DIRIGIDAS,
  RELACIONES_SIMETRICAS: RELACIONES_SIMETRICAS,
  // regla 8 (Fase 1), única fuente de verdad — también la usa monetizacion.js
  rangoIncompatibleConObserved: rangoIncompatibleConObserved
};
