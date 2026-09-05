/**
 * motor-cff/runCFF.test.js — Fase 4b (iv)
 * node motor-cff/runCFF.test.js
 */

'use strict';

var R = require('./runCFF');
var contratos = require('./contratos');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function near(a, b, m) { ok(typeof a === 'number' && Math.abs(a - b) < 1e-6, m + (Math.abs(a - b) < 1e-6 ? '' : '  [recibido=' + a + ' esperado=' + b + ']')); }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }
function lanza(fn, m) { var l = false; try { fn(); } catch (e) { l = true; } ok(l, m); }

// ── constructores de datos válidos ─────────────────────────────────────

function compValida(over) {
  return Object.assign({
    component_id: 'C1', event_id: 'EV1', organization_id: 'ORG', phenomenon_id: 'PH1',
    node_id: 'N1', consequence_id: 'CQ1',
    primary_mechanism: 'ADDITIONAL_CONSUMPTION', financial_nature: 'INCREMENTAL_COST',
    resource_type: 'INSUMO', quantity: 1, unit: 'unidad',
    temporal_nature: 'PERIOD_FLOW', source_frequency: 'MONTHLY', calculation_frequency: 'MONTHLY',
    aggregation_frequency: 'MONTHLY', calculation_mode: 'DIRECT_VALUE', input_variables: [],
    monetary_basis_id: 'MB1', original_value: 1000, original_currency: 'COP',
    valuation_basis: 'NOMINAL', monetization_status: 'OBSERVED', attribution_status: 'CONFIRMED',
    valuation_role: 'PRIMARY', economic_scope: 'ORGANIZATION', counterparty_scope: 'EXTERNAL',
    dependency_refs: [], include_in_cff: true, flags: [],
    // señales para consolidacion / admisibilidad
    monetary_basis_valid: true, temporal_basis_valid: true, scope_valid: true,
    esTransferenciaInternaPura: false
  }, over);
}
function eventoValido(over) {
  return Object.assign({
    event_id: 'EV1', organization_id: 'ORG', source_type: 'PIIO', source_ids: ['S1'],
    phenomenon_id: 'PH1', domain_id: 'D1', node_id: 'N1',
    period_start: '2026-01-01', period_end: '2026-01-31', event_type: 'INCIDENTE',
    event_description: 'x', status: 'COMPLETE', flags: [], components: [compValida()]
  }, over);
}
function casoValido(over) {
  return Object.assign({
    cff_case_id: 'CASE1', period_start: '2026-01-01', period_end: '2026-01-31',
    scope: 'ORGANIZATION', node_set: ['ORG'], nodeRaiz: 'ORG', economicScope: 'ORGANIZATION',
    reporting_currency: 'COP', valuation_basis: 'NOMINAL',
    nodeHierarchy: [{ node_id: 'ORG', parent_id: null }, { node_id: 'N1', parent_id: 'ORG' }],
    eventos: [eventoValido()], relaciones: [],
    coberturaSeniales: { tratamientoEconomicoSuficiente: true, dependeDeEstimacionesDebiles: false, asignacionesLimitadas: false, baseDefendibleParaCifraConsolidada: true },
    run_id: 'RUN1', calculation_version: 'calc-v1', ruleset_version: 'rules-v1',
    calculated_at: '2026-02-01T00:00:00Z', generated_at: '2026-02-01T00:00:00Z',
    formula_versions: [], monetary_basis_versions: ['mb-v1'], relationship_versions: [],
    input_snapshot_ids: ['snap-1'], update_reason: 'corrida inicial', run_status: 'COMPLETED'
  }, over);
}

// ═══════════════════════════════════════════════════════════════════════
seccion('§24 — pipeline feliz: CFF_RESULT completo y válido contra el contrato');
// ═══════════════════════════════════════════════════════════════════════

var r = R.runCFF(casoValido());
near(r.result.cff_total, 1000, 'cff_total = 1000');
near(r.result.confirmed_observed, 1000, 'confirmed_observed = 1000');
eq(r.result.calculation_status, 'VALID', 'calculation_status = VALID (cobertura FULL, sin errores)');
eq(r.result.coverage.overall_coverage_status, 'FULL', 'overall_coverage_status = FULL');
ok(r._meta.contratoResultValido, 'el CFF_RESULT armado valida contra contratos.validarCFFResult()  [' + r._meta.contratoResultProblemas.join('; ') + ']');
ok(contratos.validarCFFCoverage(r.result.coverage).valido, 'el CFF_COVERAGE embebido valida contra su contrato §22.7');
ok(contratos.validarCFFRun(r.run).valido, 'el CFF_RUN armado valida contra §22.9  [' + contratos.validarCFFRun(r.run).faltantes.concat(contratos.validarCFFRun(r.run).invalidos).join('; ') + ']');
ok(contratos.validarTracePath(r.trace).valido, 'el TRACE_PATH armado valida contra §22.10');
eq(r.result.calculated_at, '2026-02-01T00:00:00Z', 'calculated_at = el del input (no generado dentro)');

// ═══════════════════════════════════════════════════════════════════════
seccion('AC51 — determinismo: dos corridas con los mismos inputs → objeto idéntico');
// ═══════════════════════════════════════════════════════════════════════

var caso = casoValido({
  eventos: [eventoValido({
    components: [
      compValida({ component_id: 'C1', original_value: 300 }),
      compValida({ component_id: 'C2', original_value: 700, primary_mechanism: 'LOST_CAPACITY', financial_nature: 'CAPACITY_VALUE', attribution_status: 'SUPPORTED', monetization_status: 'ESTIMATED' }),
      compValida({ component_id: 'C3', original_value: 150, monetization_status: 'EXPOSURE' })
    ]
  })],
  relaciones: [{ relation_type: 'INDEPENDENT', component_a_id: 'C1', component_b_id: 'C2', resolution_status: 'RESOLVED' }]
});
var r1 = R.runCFF(caso);
var r2 = R.runCFF(caso);
eq(JSON.stringify(r1.result), JSON.stringify(r2.result), 'CFF_RESULT idéntico byte a byte entre las dos corridas');
eq(JSON.stringify(r1.trace), JSON.stringify(r2.trace), 'TRACE_PATH idéntico');
eq(JSON.stringify(r1.run), JSON.stringify(r2.run), 'CFF_RUN idéntico');
near(r1.result.cff_total, 1000, 'cff_total = 300 + 700 (C3 EXPOSURE fuera)');
near(r1.result.exposure_total, 150, 'exposure_total = 150 (C3)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Propagación end-to-end — indemnización legal $7.000.000 COP, intacta');
// ═══════════════════════════════════════════════════════════════════════

var rLegal = R.runCFF(casoValido({
  eventos: [eventoValido({
    event_description: 'Indemnización por fallo laboral',
    components: [compValida({
      component_id: 'C-LEGAL', primary_mechanism: 'ADDITIONAL_CONSUMPTION', financial_nature: 'INCREMENTAL_COST',
      resource_type: 'INDEMNIZACION', original_value: 7000000, original_currency: 'COP',
      monetization_status: 'OBSERVED', attribution_status: 'CONFIRMED'
    })]
  })]
}));
near(rLegal.result.cff_total, 7000000, 'cff_total = 7.000.000 exacto, de punta a punta por runCFF (no solo en monetizacion aislado)');
near(rLegal.result.confirmed_observed, 7000000, 'entra al cuadrante confirmed_observed sin pérdida');
eq(rLegal.result.mechanism_profile, [{ primary_mechanism: 'ADDITIONAL_CONSUMPTION', total: 7000000 }], 'mechanism_profile refleja el monto íntegro');

// ═══════════════════════════════════════════════════════════════════════
seccion('resolveStatus (§21) — una dependencia crítica degradada baja el estado final');
// ═══════════════════════════════════════════════════════════════════════

var rLim = R.runCFF(casoValido({
  coberturaSeniales: { tratamientoEconomicoSuficiente: true, dependeDeEstimacionesDebiles: true, asignacionesLimitadas: false, baseDefendibleParaCifraConsolidada: true }
}));
eq(rLim._meta.coberturaPorCapa.monetizacion, 'LIMITED', 'la señal dependeDeEstimacionesDebiles degrada la capa de monetización a LIMITED');
eq(rLim.result.coverage.overall_coverage_status, 'LIMITED', 'overall_coverage_status = LIMITED (roll-up del peor)');
eq(rLim._meta.outputStatus, 'VALID_WITH_LIMITATIONS', 'resolveStatus, ahora sí invocada de verdad, devuelve VALID_WITH_LIMITATIONS');
eq(rLim.result.calculation_status, 'VALID_WITH_LIMITATIONS', 'calculation_status refleja la degradación (§21: no puede superar a su dependencia crítica)');
near(rLim.result.cff_total, 1000, 'la cifra sigue existiendo (LIMITED ≠ sin cifra)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Caso N_A — cff_total null, contrato válido por la regla condicional 9');
// ═══════════════════════════════════════════════════════════════════════

var rNA = R.runCFF(casoValido({
  coberturaSeniales: { tratamientoEconomicoSuficiente: false, dependeDeEstimacionesDebiles: false, asignacionesLimitadas: false, baseDefendibleParaCifraConsolidada: false }
}));
eq(rNA.result.cff_total, null, 'cff_total = null (N_A por insuficiencia, no 0)');
eq(rNA.result.coverage.overall_coverage_status, 'INSUFFICIENT', 'overall_coverage_status = INSUFFICIENT');
eq(rNA.result.calculation_status, 'INVALID', 'calculation_status = INVALID (mapeo INSUFFICIENT→INVALID)');
ok(rNA.result.errors.some(function (e) { return e.code === 'COBERTURA_INSUFICIENTE'; }),
  'errors[] contiene el code COBERTURA_INSUFICIENTE — la distinción "falta evidencia" vs "hay bug" NO se pierde');
ok(rNA._meta.contratoResultValido, 'el CFF_RESULT con cff_total=null VALIDA contra el contrato (regla 9: nulable sii INVALID+INSUFFICIENT)  [' + rNA._meta.contratoResultProblemas.join('; ') + ']');

// contraste: cff_total=null en un INVALID que NO es por insuficiencia → el contrato lo RECHAZA
var falso = JSON.parse(JSON.stringify(rNA.result));
falso.cff_total = null;
falso.calculation_status = 'INVALID';
falso.coverage.overall_coverage_status = 'FULL'; // no es insuficiencia
ok(!contratos.validarCFFResult(falso).valido, 'cff_total=null con overall_coverage_status=FULL (INVALID por otra causa) → el contrato lo RECHAZA');

// ═══════════════════════════════════════════════════════════════════════
seccion('Los 7 parámetros de invocación — cableados a la función correcta');
// ═══════════════════════════════════════════════════════════════════════

// #1 esTransferenciaInternaPura + #6 nodeRaiz + economicScope ORGANIZATION
var rTI = R.runCFF(casoValido({
  eventos: [eventoValido({ components: [
    compValida({ component_id: 'C1', original_value: 400, esTransferenciaInternaPura: true }),
    compValida({ component_id: 'C2', original_value: 600, esTransferenciaInternaPura: false })
  ] })]
}));
near(rTI.result.cff_total, 600, '#1 esTransferenciaInternaPura + #6 nodeRaiz: la transferencia interna se elimina en ORGANIZATION → 600');

// #2 sharedCosts.baseAsignacionDocumentada
var rSC = R.runCFF(casoValido({
  eventos: [eventoValido({ components: [
    compValida({ component_id: 'C1', original_value: 300, shared_cost_id: 'SC1' }),
    compValida({ component_id: 'C2', original_value: 700, shared_cost_id: 'SC1' })
  ] })],
  sharedCosts: { SC1: { baseAsignacionDocumentada: false } }
}));
near(rSC.result.cff_total, 0, '#2 sin base de asignación documentada → UNALLOCATED, fuera del total');

// #3 period del componente + #4 transformación STOCK→flujo
var rTemp = R.runCFF(casoValido({
  eventos: [eventoValido({ components: [
    compValida({ component_id: 'C1', original_value: 500 }),
    compValida({ component_id: 'C2', original_value: 0, temporal_nature: 'STOCK', transformacionValidada: true, valorFlujoEquivalente: 120 })
  ] })]
}));
near(rTemp.result.cff_total, 620, '#4 STOCK con transformación validada entra por su valorFlujoEquivalente (500 + 120)');

// #5 objeto FX completo
var rFX = R.runCFF(casoValido({
  reporting_currency: 'USD',
  eventos: [eventoValido({ components: [compValida({ component_id: 'C1', original_value: 4200, original_currency: 'COP' })] })],
  fxPorComponente: { C1: { tasa: 1 / 4200, fuente: 'BanRep', fecha: '2026-01-15', metodo: 'spot', monedaDestino: 'USD' } }
}));
near(rFX.result.cff_total, 1, '#5 FX explícito: 4200 COP × (1/4200) = 1 USD');
eq(rFX.result.reporting_currency, 'USD', '#5 reporting_currency propagada');

// #7 toleranciaReconciliacion ausente → flag PENDIENTE_VALIDACION
ok(r.result.warnings.some(function (w) { return String(w.detalle).indexOf('TOLERANCIA_RECONCILIACION_PENDIENTE_VALIDACION') !== -1; }),
  '#7 toleranciaReconciliacion no aportada → warning PENDIENTE_VALIDACION en el resultado');

// ═══════════════════════════════════════════════════════════════════════
seccion('Eventos inválidos — retenidos, no detienen los válidos (§24, AC53)');
// ═══════════════════════════════════════════════════════════════════════

var rMix = R.runCFF(casoValido({
  eventos: [
    eventoValido({ event_id: 'EV_OK', components: [compValida({ component_id: 'C_OK', event_id: 'EV_OK', original_value: 5000 })] }),
    eventoValido({ event_id: 'EV_BAD', status: 'INVALID', components: [compValida({ component_id: 'C_BAD', event_id: 'EV_BAD', original_value: 9999 })] })
  ]
}));
near(rMix.result.cff_total, 5000, 'el evento INVALID no aporta; el válido sí (5000, no 14999)');
ok(rMix.result.errors.some(function (e) { return e.code === 'EVENTO_INVALIDO' && e.ref === 'EV_BAD'; }), 'el evento retenido queda en errors[] con su motivo');

// ═══════════════════════════════════════════════════════════════════════
seccion('Validación de entrada — campos obligatorios de caso/versión');
// ═══════════════════════════════════════════════════════════════════════

['run_id', 'calculation_version', 'calculated_at', 'coberturaSeniales', 'nodeRaiz'].forEach(function (k) {
  var c = casoValido(); delete c[k];
  lanza(function () { R.runCFF(c); }, 'falta "' + k + '" → lanza');
});

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones — ejecutadas como paso de Bash aparte (ver mensaje de cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. AC51: inyectar un valor no determinista (Math.random) en un campo del CFF_RESULT →');
console.log('     la comparación byte a byte de las dos corridas falla.');
console.log('  2. Regla 9: quitar el chequeo overall_coverage_status===INSUFFICIENT en validarCFFResult →');
console.log('     un cff_total=null con cobertura FULL (INVALID por otra causa) pasa a validar indebidamente.');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
