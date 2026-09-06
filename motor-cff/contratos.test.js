/**
 * motor-cff/contratos.test.js — Fase 0
 * node motor-cff/contratos.test.js
 */

'use strict';

var ENUMS = require('./enums');
var Estados = require('./estados');
var C = require('./contratos');

var _ok = 0, _fallos = 0;

function seccion(nombre) {
  console.log('\n── ' + nombre + ' ' + '─'.repeat(Math.max(0, 66 - nombre.length)));
}
function ok(cond, msg) {
  if (cond) { _ok++; console.log('  ✓ ' + msg); }
  else { _fallos++; console.log('  ✗ FALLA: ' + msg); }
}
function eq(a, b, msg) {
  var cond = JSON.stringify(a) === JSON.stringify(b);
  ok(cond, msg + (cond ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']'));
}
function lanza(fn, msg) {
  var lanzo = false;
  try { fn(); } catch (e) { lanzo = true; }
  ok(lanzo, msg);
}

// ═══════════════════════════════════════════════════════════════════════
seccion('enums.js — registro canónico');
// ═══════════════════════════════════════════════════════════════════════

eq(ENUMS.PRIMARY_MECHANISM, ['ADDITIONAL_CONSUMPTION', 'LOST_CAPACITY', 'REPLACEMENT', 'UNCAPTURED_VALUE'], 'PRIMARY_MECHANISM (§23) exacto');
eq(ENUMS.RELATION_TYPE, ['INDEPENDENT', 'DUPLICATE', 'CONTAINS', 'ALTERNATIVE_VALUATION', 'DEPENDENT_COST', 'UNKNOWN'], 'RELATION_TYPE (§23) exacto');
eq(ENUMS.RELATION_RESOLUTION_STATUS, ['RESOLVED', 'PARTIALLY_RESOLVED', 'UNRESOLVED', 'INVALID'], 'RELATION_RESOLUTION_STATUS (solo §21) registrado');
eq(ENUMS.CALCULATION_STATUS, ['VALID', 'VALID_WITH_LIMITATIONS', 'STALE', 'INVALID'], 'CALCULATION_STATUS (solo §21) registrado');
ok(Array.isArray(ENUMS.AVOIDABILITY_STATUS) && ENUMS.AVOIDABILITY_STATUS.length === 3, 'AVOIDABILITY_STATUS registrado (aislado, §27 fuera de núcleo)');
ok(Array.isArray(ENUMS.ERROR_SEVERITY) && ENUMS.ERROR_SEVERITY.length === 3, 'ERROR_SEVERITY registrado (aislado, sin cablear)');
ok(!('RUN_STATUS' in ENUMS), 'RUN_STATUS deliberadamente NO registrado — el documento nunca enumera sus valores');
eq(ENUMS.SOURCE_TYPE, ['PIIO', 'EXTERNAL_OPERATIONAL_RECORD', 'VERIFIED_DIAGNOSTIC_FINDING'], 'SOURCE_TYPE (inline §22.1) registrado como autoritativo');

// ═══════════════════════════════════════════════════════════════════════
seccion('estados.js — resolveStatus (§21)');
// ═══════════════════════════════════════════════════════════════════════

eq(Estados.resolveStatus(['VALID', 'VALID']), 'VALID', 'todos VALID → VALID');
eq(Estados.resolveStatus(['VALID', 'VALID_WITH_LIMITATIONS']), 'VALID_WITH_LIMITATIONS', 'uno VALID_WITH_LIMITATIONS → VALID_WITH_LIMITATIONS');
eq(Estados.resolveStatus(['VALID_WITH_LIMITATIONS', 'INSUFFICIENT']), 'INSUFFICIENT', 'INSUFFICIENT pesa más que VALID_WITH_LIMITATIONS');
eq(Estados.resolveStatus(['INSUFFICIENT', 'INVALID', 'VALID']), 'INVALID', 'INVALID domina sobre cualquier otro');
eq(Estados.resolveStatus(['VALID', 'NOT_APPLICABLE']), 'VALID', 'NOT_APPLICABLE no arrastra ni mejora — se excluye del conjunto');
eq(Estados.resolveStatus(['NOT_APPLICABLE', 'NOT_APPLICABLE']), 'VALID',
  'todas las dependencias N/A → VALID (vacuo tras excluir N/A; documentado como interpretación, no literal del pseudocódigo)');
eq(Estados.resolveStatus([]), 'VALID', 'conjunto vacío → VALID (vacuo)');
lanza(function () { Estados.resolveStatus('VALID'); }, 'resolveStatus rechaza un no-array');
lanza(function () { Estados.resolveStatus(['NO_EXISTE']); }, 'resolveStatus rechaza un valor fuera de OUTPUT_STATUS');

// ═══════════════════════════════════════════════════════════════════════
seccion('§22.1 CFF_EVENT');
// ═══════════════════════════════════════════════════════════════════════

var eventoValido = {
  event_id: 'EVT-1', organization_id: 'ORG-1', source_type: 'PIIO', source_ids: ['S1'],
  phenomenon_id: 'PHEN-1', domain_id: 'DOM-1', node_id: 'NODE-1',
  period_start: '2026-01-01', period_end: '2026-01-31',
  event_type: 'RETRABAJO', event_description: 'Retrabajo documentado en línea 3',
  status: 'COMPLETE', components: [], flags: []
};
ok(C.validarCFFEvent(eventoValido).valido, 'CFF_EVENT completo y correcto → válido');

var eventoIncompleto = { event_id: 'EVT-2' };
var rIncompleto = C.validarCFFEvent(eventoIncompleto);
ok(!rIncompleto.valido, 'CFF_EVENT incompleto → inválido');
ok(rIncompleto.faltantes.indexOf('node_id') !== -1 && rIncompleto.faltantes.indexOf('status') !== -1,
  'campos obligatorios ausentes se listan en faltantes (node_id, status), no se imputan');

var eventoEnumMalo = Object.assign({}, eventoValido, { source_type: 'RUMOR' });
ok(!C.validarCFFEvent(eventoEnumMalo).valido, 'source_type fuera de SOURCE_TYPE → inválido');
ok(C.validarCFFEvent(eventoEnumMalo).invalidos.some(function (m) { return m.indexOf('source_type') !== -1; }), 'el mensaje identifica el campo');

var eventoStatusMalo = Object.assign({}, eventoValido, { status: 'PENDIENTE' });
ok(!C.validarCFFEvent(eventoStatusMalo).valido, 'status fuera de EVENT_STATUS (OPEN|COMPLETE|INVALID) → inválido');

var eventoConOpcionales = Object.assign({}, eventoValido, {
  operational_quantity: 12, operational_unit: 'horas', metric_definition_version: 'v1', exposure_definition: 'ref-x'
});
ok(C.validarCFFEvent(eventoConOpcionales).valido, 'opcionales presentes y bien tipados no rompen la validez');

ok(!C.validarCFFEvent(null).valido, 'CFF_EVENT null → inválido, no lanza');
ok(!C.validarCFFEvent('no-es-objeto').valido, 'CFF_EVENT no-objeto → inválido, no lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('§22.2 ECONOMIC_COMPONENT — esquema + 4 reglas condicionales (2 de Fase 0, 2 extensiones de Fase 1)');
// ═══════════════════════════════════════════════════════════════════════

function componenteBase(extra) {
  return Object.assign({
    component_id: 'COMP-1', event_id: 'EVT-1', organization_id: 'ORG-1',
    phenomenon_id: 'PHEN-1', node_id: 'NODE-1', consequence_id: 'CONS-1',
    primary_mechanism: 'ADDITIONAL_CONSUMPTION', financial_nature: 'INCREMENTAL_COST',
    resource_type: 'HORAS_EXTRA', quantity: 10, unit: 'horas',
    temporal_nature: 'PERIOD_FLOW', source_frequency: 'MENSUAL', calculation_frequency: 'MENSUAL',
    aggregation_frequency: 'MENSUAL', calculation_mode: 'UNIT_RATE',
    input_variables: [], monetary_basis_id: 'MB-1', original_value: 1000, original_currency: 'COP',
    valuation_basis: 'NOMINAL', monetization_status: 'OBSERVED', attribution_status: 'CONFIRMED',
    valuation_role: 'PRIMARY', economic_scope: 'NODE', counterparty_scope: 'INTERNAL',
    dependency_refs: [], include_in_cff: true, flags: []
  }, extra || {});
}

ok(C.validarEconomicComponent(componenteBase()).valido, 'ECONOMIC_COMPONENT (UNIT_RATE, sin fórmula) → válido');

var rDerivadaSinNada = C.validarEconomicComponent(componenteBase({ calculation_mode: 'DERIVED_FORMULA' }));
ok(!rDerivadaSinNada.valido, 'DERIVED_FORMULA sin formula_id/version/input_variables → inválido');
ok(rDerivadaSinNada.invalidos.length === 3, 'las 3 exigencias de DERIVED_FORMULA se reportan (formula_id, formula_version, input_variables)');

var rDerivadaCompleta = C.validarEconomicComponent(componenteBase({
  calculation_mode: 'DERIVED_FORMULA', formula_id: 'F-1', formula_version: 'v1', input_variables: ['x']
}));
ok(rDerivadaCompleta.valido, 'DERIVED_FORMULA con formula_id+version+input_variables no vacío → válido');

var rNormSinCurrency = C.validarEconomicComponent(componenteBase({ normalized_value: 900 }));
ok(!rNormSinCurrency.valido, 'normalized_value sin reporting_currency → inválido (coherencia)');
var rCurrencySinNorm = C.validarEconomicComponent(componenteBase({ reporting_currency: 'USD' }));
ok(!rCurrencySinNorm.valido, 'reporting_currency sin normalized_value → inválido (coherencia)');
var rAmbos = C.validarEconomicComponent(componenteBase({ normalized_value: 900, reporting_currency: 'USD' }));
ok(rAmbos.valido, 'normalized_value y reporting_currency juntos → válido');
ok(C.validarEconomicComponent(componenteBase()).valido, 'ninguno de los dos (caso base) → válido, no se exige multi-moneda fuera de contexto');

var rMecanismoMalo = C.validarEconomicComponent(componenteBase({ primary_mechanism: 'CUALQUIER_COSA' }));
ok(!rMecanismoMalo.valido, 'primary_mechanism fuera de PRIMARY_MECHANISM → inválido');

var rFaltaCampo = C.validarEconomicComponent({ component_id: 'C1' });
ok(!rFaltaCampo.valido && rFaltaCampo.faltantes.length > 10, 'objeto casi vacío → decenas de campos en faltantes, ninguno imputado');

// ── Fase 1, regla 7: original_value XOR (original_value_min Y original_value_max) ──

function componenteRango(extra) {
  var c = componenteBase(extra);
  delete c.original_value; // el caso base fija original_value=1000; para probar el rango hay que quitarlo
  return c;
}

ok(!C.validarEconomicComponent(componenteRango()).valido,
  'sin original_value ni rango → inválido (ninguna representación de valor presente)');
ok(C.validarEconomicComponent(componenteRango({ original_value_min: 900, original_value_max: 1100, monetization_status: 'ESTIMATED' })).valido,
  'solo rango completo (sin original_value), con monetization_status=ESTIMATED → válido');
ok(!C.validarEconomicComponent(componenteRango({ original_value_min: 900 })).valido,
  'solo original_value_min sin original_value_max → inválido (rango incompleto)');
ok(!C.validarEconomicComponent(componenteBase({ original_value_min: 900, original_value_max: 1100 })).valido,
  'original_value (del caso base) + rango completo a la vez → inválido (mutuamente excluyentes)');

// ── Fase 1, regla 8: rango presente ⇒ monetization_status ≠ OBSERVED ──

var rRangoObserved = C.validarEconomicComponent(componenteRango({
  original_value_min: 900, original_value_max: 1100, monetization_status: 'OBSERVED'
}));
ok(!rRangoObserved.valido, 'rango + monetization_status=OBSERVED → inválido (un rango no es "observado", §10)');
ok(rRangoObserved.invalidos.some(function (m) { return m.indexOf('OBSERVED') !== -1; }), 'el mensaje explica por qué');
ok(C.validarEconomicComponent(componenteRango({ original_value_min: 900, original_value_max: 1100, monetization_status: 'EXPOSURE' })).valido,
  'rango + monetization_status=EXPOSURE → válido (solo OBSERVED está prohibido con rango)');
ok(C.validarEconomicComponent(componenteRango({ original_value_min: 900, original_value_max: 1100, monetization_status: 'N_A' })).valido,
  'rango + monetization_status=N_A → válido (completa los 4 valores de MONETIZATION_STATUS contra la regla: únicamente OBSERVED queda excluido)');

// ── Fase 1: recovery_realization_type (§7.1, campo nuevo — extensión del contrato) ──

ok(C.validarEconomicComponent(componenteBase({ recovery_realization_type: 'CASH_COST_AVOIDANCE' })).valido,
  'recovery_realization_type con valor válido del enum → válido');
ok(C.validarEconomicComponent(componenteBase()).valido,
  'recovery_realization_type ausente → sigue válido (campo opcional, §7.1 no lo exige)');
ok(!C.validarEconomicComponent(componenteBase({ recovery_realization_type: 'GANANCIA_INVENTADA' })).valido,
  'recovery_realization_type fuera de RECOVERY_REALIZATION_TYPE → inválido');

// ── Fase 5: regla 10 — salary_derived ⇒ salary_basis_kind (§8.4/§9) ──

ok(C.validarEconomicComponent(componenteBase()).valido,
  'salary_derived ausente → válido (campo opcional; el mecanismo interino no lo exige a todo componente)');
ok(C.validarEconomicComponent(componenteBase({ salary_derived: true, salary_basis_kind: 'FULLY_LOADED_COST' })).valido,
  'salary_derived=true CON salary_basis_kind → válido');
var rSalarioSinKind = C.validarEconomicComponent(componenteBase({ salary_derived: true }));
ok(!rSalarioSinKind.valido, 'salary_derived=true SIN salary_basis_kind → inválido (§8.4: debe declararse cuál base)');
ok(rSalarioSinKind.invalidos.some(function (m) { return m.indexOf('salary_basis_kind') !== -1; }), 'el mensaje identifica salary_basis_kind');
ok(!C.validarEconomicComponent(componenteBase({ salary_derived: true, salary_basis_kind: 'NETO' })).valido,
  'salary_basis_kind fuera de SALARY_BASIS_KIND → inválido');
ok(C.validarEconomicComponent(componenteBase({ salary_derived: false })).valido,
  'salary_derived=false → no exige salary_basis_kind');

var rIncludeString = C.validarEconomicComponent(componenteBase({ include_in_cff: 'true' }));
ok(!rIncludeString.valido, 'include_in_cff como string "true" → inválido por tipo (se exige boolean real)');
ok(rIncludeString.invalidos.some(function (m) { return m.indexOf('include_in_cff') !== -1; }), 'el mensaje identifica include_in_cff, no otro campo');
var rIncludeNumero = C.validarEconomicComponent(componenteBase({ include_in_cff: 1 }));
ok(!rIncludeNumero.valido, 'include_in_cff como número 1 → inválido por tipo (no se acepta 1/0 como sustituto de true/false)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§22.3 MONETARY_BASIS — XOR basis_value / rango (§9)');
// ═══════════════════════════════════════════════════════════════════════

function basisBase(extra) {
  return Object.assign({
    monetary_basis_id: 'MB-1', basis_type: 'ACCOUNTING_ACTUAL', basis_unit: 'COP/hora',
    source: 'nómina interna', source_reference: 'ref-nomina-2026-01', currency: 'COP',
    valuation_date: '2026-01-31', valid_from: '2026-01-01', valid_to: '2026-01-31',
    valuation_basis: 'NOMINAL', version: 'v1', flags: []
  }, extra || {});
}

ok(C.validarMonetaryBasis(basisBase({ basis_value: 15000 })).valido, 'solo basis_value → válido');
ok(C.validarMonetaryBasis(basisBase({ basis_value_min: 14000, basis_value_max: 16000 })).valido, 'solo rango completo (sin basis_value) → válido');

var rTodos = C.validarMonetaryBasis(basisBase({ basis_value: 15000, basis_value_min: 14000, basis_value_max: 16000 }));
ok(!rTodos.valido, 'basis_value + rango completo a la vez → inválido (mutuamente excluyentes, §9)');

var rNinguno = C.validarMonetaryBasis(basisBase());
ok(!rNinguno.valido, 'ni basis_value ni rango → inválido (ninguna representación monetaria)');

var rRangoParcial = C.validarMonetaryBasis(basisBase({ basis_value_min: 14000 }));
ok(!rRangoParcial.valido, 'solo basis_value_min sin basis_value_max → inválido (rango incompleto)');

var rBasisTypeMalo = C.validarMonetaryBasis(basisBase({ basis_value: 1, basis_type: 'INVENTADO' }));
ok(!rBasisTypeMalo.valido, 'basis_type fuera de los 5 de §9 → inválido');

// ═══════════════════════════════════════════════════════════════════════
seccion('§22.4 ATTRIBUTION_ASSESSMENT');
// ═══════════════════════════════════════════════════════════════════════

function assessmentBase(extra) {
  return Object.assign({
    assessment_id: 'AA-1', assessment_version: 'v1', event_id: 'EVT-1',
    operational_correspondence: 'YES', temporal_correspondence: 'COMPATIBLE',
    organizational_correspondence: 'MATCH', operational_evidence: 'DIRECT',
    system_convergence: 'CONVERGENT', alternative_explanation: 'NONE_DOMINANT',
    diagnostic_context: {}, supporting_evidence: [], conflicting_evidence: [],
    excluded_causes: [], unresolved_causes: [], status: 'CONFIRMED',
    rationale: 'Evidencia operacional directa y correspondencia completa.', created_at: '2026-01-31'
  }, extra || {});
}

ok(C.validarAttributionAssessment(assessmentBase()).valido, 'ATTRIBUTION_ASSESSMENT completo → válido');
ok(!C.validarAttributionAssessment(assessmentBase({ system_convergence: 'TAL_VEZ' })).valido, 'system_convergence fuera de enum → inválido');
var rSinContexto = C.validarAttributionAssessment(Object.assign({}, assessmentBase(), { diagnostic_context: undefined }));
ok(!rSinContexto.valido && rSinContexto.faltantes.indexOf('diagnostic_context') !== -1, 'diagnostic_context ausente → faltante (el contenedor es obligatorio aunque sus 4 refs internas sean opcionales)');
var rContextoArray = C.validarAttributionAssessment(assessmentBase({ diagnostic_context: [] }));
ok(!rContextoArray.valido, 'diagnostic_context como array (no objeto) → inválido por tipo');

// ═══════════════════════════════════════════════════════════════════════
seccion('§22.5 ECONOMIC_RELATION — 2 reglas condicionales (containment_scope, direction)');
// ═══════════════════════════════════════════════════════════════════════

function relacionBase(extra) {
  return Object.assign({
    relation_id: 'REL-1', component_a_id: 'COMP-1', component_b_id: 'COMP-2',
    relation_type: 'INDEPENDENT', effective_from: '2026-01-01', effective_to: '2026-01-31',
    resolution_status: 'RESOLVED', resolution_method: 'revisión manual de fronteras económicas',
    rationale: 'Consumos distintos, fronteras económicas separadas.', version: 'v1'
  }, extra || {});
}

ok(C.validarEconomicRelation(relacionBase()).valido, 'INDEPENDENT sin containment_scope ni direction → válido');
ok(C.validarEconomicRelation(relacionBase({ direction: 'A_TO_B' })).valido, 'INDEPENDENT con direction presente → válido (no clasificada ni dirigida ni simétrica, no se rechaza)');

var rContainsSinScope = C.validarEconomicRelation(relacionBase({ relation_type: 'CONTAINS', direction: 'A_TO_B' }));
ok(!rContainsSinScope.valido, 'CONTAINS sin containment_scope → inválido (§13.1 "debe declarar")');

var rContainsOk = C.validarEconomicRelation(relacionBase({
  relation_type: 'CONTAINS', direction: 'A_TO_B', containment_scope: 'FULL'
}));
ok(rContainsOk.valido, 'CONTAINS con containment_scope y direction → válido');

var rContainsSinDireccion = C.validarEconomicRelation(relacionBase({
  relation_type: 'CONTAINS', containment_scope: 'FULL'
}));
ok(!rContainsSinDireccion.valido, 'CONTAINS sin direction → inválido (relación dirigida, §13.3)');

var rDuplicateConDireccion = C.validarEconomicRelation(relacionBase({
  relation_type: 'DUPLICATE', direction: 'A_TO_B'
}));
ok(!rDuplicateConDireccion.valido, 'DUPLICATE con direction presente → RECHAZADO (relación simétrica, no solo ignorado)');

var rDuplicateOk = C.validarEconomicRelation(relacionBase({ relation_type: 'DUPLICATE' }));
ok(rDuplicateOk.valido, 'DUPLICATE sin direction ni containment_scope → válido');

var rDuplicateConScope = C.validarEconomicRelation(relacionBase({
  relation_type: 'DUPLICATE', containment_scope: 'FULL'
}));
ok(!rDuplicateConScope.valido, 'containment_scope fuera de CONTAINS (aquí en DUPLICATE) → inválido');

var rDependentSinDireccion = C.validarEconomicRelation(relacionBase({ relation_type: 'DEPENDENT_COST' }));
ok(!rDependentSinDireccion.valido, 'DEPENDENT_COST sin direction → inválido (también dirigida)');

ok(!C.validarEconomicRelation(relacionBase({ resolution_status: 'QUIEN_SABE' })).valido, 'resolution_status fuera de RELATION_RESOLUTION_STATUS → inválido');

// ═══════════════════════════════════════════════════════════════════════
seccion('§22.6-22.10 — resto de contratos (esquema plano, sin condicionales)');
// ═══════════════════════════════════════════════════════════════════════

var grupoValido = {
  group_id: 'CG-1', scope: 'NODE', node_set: ['NODE-1'], period_start: '2026-01-01', period_end: '2026-01-31',
  component_ids: ['COMP-1'], selected_components: ['COMP-1'], excluded_components: [], unresolved_components: [],
  resolution_status: 'RESOLVED', resolution_rule: 'sin relaciones pendientes', rationale: 'único componente admisible',
  version: 'v1'
};
ok(C.validarConsolidationGroup(grupoValido).valido, 'CONSOLIDATION_GROUP completo → válido');
ok(!C.validarConsolidationGroup({}).valido, 'CONSOLIDATION_GROUP vacío → inválido, todos los campos en faltantes');

var coberturaValida = {
  case_scope: 'ORG-1/2026-01', material_events_total: 10, material_events_evaluable: 8,
  monetizable_events: 7, attributable_events: 6, unresolved_events: 1,
  excluded_material_events: ['EVT-9'], operational_coverage_status: 'PARTIAL',
  monetization_coverage_status: 'PARTIAL', attribution_coverage_status: 'PARTIAL',
  overall_coverage_status: 'PARTIAL', limitations: ['2 eventos sin base monetaria']
};
ok(C.validarCFFCoverage(coberturaValida).valido, 'CFF_COVERAGE completo → válido');
ok(!C.validarCFFCoverage(Object.assign({}, coberturaValida, { overall_coverage_status: 'BUENA' })).valido,
  'overall_coverage_status fuera de COVERAGE_STATUS → inválido');

var resultadoValido = {
  cff_run_id: 'RUN-1', cff_case_id: 'CASE-1', calculation_version: 'v1', ruleset_version: 'v1.1',
  period_start: '2026-01-01', period_end: '2026-01-31', scope: 'ORGANIZATION', node_set: ['ORG-1'],
  reporting_currency: 'COP', valuation_basis: 'NOMINAL',
  confirmed_observed: 100, confirmed_estimated: 0, supported_observed: 20, supported_estimated: 0,
  cff_confirmed: 100, cff_supported_additional: 20, cff_total: 120,
  coverage: coberturaValida, event_profile: [], mechanism_profile: [], financial_nature_profile: [], node_profile: [],
  calculation_status: 'VALID', warnings: [], errors: [], dependency_refs: [], calculated_at: '2026-02-01'
};
ok(C.validarCFFResult(resultadoValido).valido, 'CFF_RESULT completo (sin exposure_total/unresolved_impact_total/annualization) → válido');
ok(!C.validarCFFResult(Object.assign({}, resultadoValido, { calculation_status: 'CASI' })).valido,
  'calculation_status fuera de CALCULATION_STATUS → inválido');
ok(C.validarCFFResult(Object.assign({}, resultadoValido, { exposure_total: 50, unresolved_impact_total: 30, annualization: { metodo: 'x' } })).valido,
  'con los 3 opcionales presentes y bien tipados → sigue válido');

var runValido = {
  run_id: 'RUN-1', cff_case_id: 'CASE-1', calculation_version: 'v1', ruleset_version: 'v1.1',
  formula_versions: [], monetary_basis_versions: [], relationship_versions: [], input_snapshot_ids: [],
  update_reason: 'primera corrida', generated_at: '2026-02-01', run_status: 'CUALQUIER_STRING_NO_ENUMERADO'
};
ok(C.validarCFFRun(runValido).valido,
  'CFF_RUN con run_status arbitrario (string) → válido: el documento no define su enum, solo se valida tipo');
ok(!C.validarCFFRun({}).valido, 'CFF_RUN vacío → inválido');

var traceValido = {
  output_id: 'CFF_RESULT-1', event_ids: ['EVT-1'], component_ids: ['COMP-1'], source_ids: ['S1'],
  formula_ids: [], monetary_basis_ids: ['MB-1'], assessment_ids: ['AA-1'], relationship_ids: [], version_ids: ['v1']
};
ok(C.validarTracePath(traceValido).valido, 'TRACE_PATH completo → válido');
ok(!C.validarTracePath({ output_id: 'X' }).valido, 'TRACE_PATH incompleto → inválido, faltantes listados');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
