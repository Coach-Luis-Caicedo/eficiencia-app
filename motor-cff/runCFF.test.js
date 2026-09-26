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
    compValida({ component_id: 'C_ok', original_value: 500 }),
    compValida({ component_id: 'C1', original_value: 300, shared_cost_id: 'SC1' }),
    compValida({ component_id: 'C2', original_value: 700, shared_cost_id: 'SC1' })
  ] })],
  sharedCosts: { SC1: { baseAsignacionDocumentada: false } }
}));
near(rSC.result.cff_total, 500, '#2 sin base de asignación documentada → SC1 UNALLOCATED, fuera del total (queda solo C_ok=500, no 1500)');
ok(rSC.result.coverage.overall_coverage_status === 'PARTIAL', '#2 — los 2 componentes UNALLOCATED degradan la cobertura a PARTIAL');

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
seccion('Huecos de cobertura cerrados en Fase 5 (INV-01/62/70, AC01/02/05/20/55)');
// ═══════════════════════════════════════════════════════════════════════

// INV-CFF-01 / AC01 / AC02 — no hay ruta KPI → dinero: runCFF SOLO acepta
// eventos con components; sin evento no hay nada que monetizar.
lanza(function () { R.runCFF(casoValido({ eventos: [] })); }, 'INV-01/AC01/AC02 — caso sin eventos → lanza (no existe ruta KPI/diagnóstico → dinero sin CFF_EVENT)');
var rSinComp = R.runCFF(casoValido({ eventos: [eventoValido({ components: [] })] }));
ok(rSinComp.result.cff_total === null || rSinComp.result.cff_total === 0,
  'INV-01 — un evento sin componentes económicos no produce una cifra positiva inventada (N_A o 0, nunca un número derivado del evento)');
ok(rSinComp.result.cff_total !== null || rSinComp.result.coverage.overall_coverage_status === 'INSUFFICIENT',
  'INV-01 — si es null, es por cobertura INSUFFICIENT (no hay universo material), con su status');

// INV-CFF-70 — la cifra consolidada se reconstruye componente por componente:
// Σ event_profile === Σ mechanism_profile === cff_total.
var r70 = R.runCFF(casoValido({ eventos: [eventoValido({ components: [
  compValida({ component_id: 'A', original_value: 300 }),
  compValida({ component_id: 'B', original_value: 200, primary_mechanism: 'REPLACEMENT', financial_nature: 'INCREMENTAL_COST' })
] })] }));
var sumaEvento = r70.result.event_profile.reduce(function (s, x) { return s + x.total; }, 0);
var sumaMecanismo = r70.result.mechanism_profile.reduce(function (s, x) { return s + x.total; }, 0);
near(sumaEvento, r70.result.cff_total, 'INV-70 — Σ event_profile = cff_total (500)');
near(sumaMecanismo, r70.result.cff_total, 'INV-70 — Σ mechanism_profile = cff_total (reconstrucción componente por componente)');

// AC05 — curva de aprendizaje con fórmula interna → ESTIMATED + CONFIRMED, elegible
var rAC05 = R.runCFF(casoValido({ eventos: [eventoValido({ components: [compValida({
  component_id: 'C-CURVA', calculation_mode: 'DERIVED_FORMULA', formula_id: 'F1', formula_version: 'v1', input_variables: ['x'],
  original_value: 1500, monetization_status: 'ESTIMATED', attribution_status: 'CONFIRMED'
})] })] }));
near(rAC05.result.confirmed_estimated, 1500, 'AC05 — ESTIMATED + CONFIRMED (fórmula interna) → entra a confirmed_estimated, elegible');

// AC20 — evento válido sin base monetaria resoluble → mon=N_A, no inventar cifra
var rAC20 = R.runCFF(casoValido({ eventos: [eventoValido({ components: [
  compValida({ component_id: 'C-OK', original_value: 800 }),
  { component_id: 'C-SINBASE', event_id: 'EV1', organization_id: 'ORG', phenomenon_id: 'PH1', node_id: 'N1', consequence_id: 'CQ1',
    primary_mechanism: 'ADDITIONAL_CONSUMPTION', financial_nature: 'INCREMENTAL_COST', resource_type: 'X', quantity: 5, unit: 'u',
    temporal_nature: 'PERIOD_FLOW', source_frequency: 'M', calculation_frequency: 'M', aggregation_frequency: 'MONTHLY',
    calculation_mode: 'UNIT_RATE', input_variables: [], monetary_basis_id: 'MBX', original_currency: 'COP', valuation_basis: 'NOMINAL',
    monetization_status: 'N_A', attribution_status: 'CONFIRMED', valuation_role: 'PRIMARY', economic_scope: 'ORGANIZATION',
    counterparty_scope: 'EXTERNAL', dependency_refs: [], include_in_cff: false, flags: [],
    monetary_basis_valid: false, temporal_basis_valid: true, scope_valid: true, esTransferenciaInternaPura: false }
] })] }));
near(rAC20.result.cff_total, 800, 'AC20 — componente sin base monetaria (mon=N_A) queda fuera; no se inventa cifra (cff_total=800, solo C-OK)');

// AC55 — grafo parcialmente irresoluble → consolidar subconjunto seguro + degradar cobertura
var rAC55 = R.runCFF(casoValido({
  eventos: [eventoValido({ components: [
    compValida({ component_id: 'C_safe', original_value: 10000 }),
    compValida({ component_id: 'C_dupA', original_value: 4000 }),
    compValida({ component_id: 'C_dupB', original_value: 4000 })
  ] })],
  relaciones: [{ relation_type: 'DUPLICATE', component_a_id: 'C_dupA', component_b_id: 'C_dupB', resolution_status: 'UNRESOLVED' }],
  coberturaSeniales: { tratamientoEconomicoSuficiente: true, dependeDeEstimacionesDebiles: false, asignacionesLimitadas: false, baseDefendibleParaCifraConsolidada: true }
}));
near(rAC55.result.cff_total, 10000, 'AC55 — el DUPLICATE irresoluble se excluye; el subconjunto seguro (C_safe) sí consolida (10000)');
ok(rAC55.result.coverage.limitations.some(function (l) { return l.indexOf('C_dupA') !== -1 || l.indexOf('C_dupB') !== -1; }),
  'AC55 — los 2 duplicados excluidos quedan declarados en coverage.limitations (exclusión explícita, §20)');
eq(rAC55.result.coverage.overall_coverage_status, 'PARTIAL',
  'AC55 — la exclusión de los 2 duplicados material degrada overall_coverage_status a PARTIAL (fix Fase 5: la 4ª entrada al roll-up ve las exclusiones de consolidación)');
eq(rAC55._meta.coberturaPorCapa.consolidacion, 'PARTIAL',
  'AC55 — la capa de consolidación clasifica PARTIAL (2 de 3 componentes excluidos con motivo)');
// before/after verificado con node -e antes del commit:
//   SIN el fix (roll-up de solo 3 capas)  → overall_coverage_status = FULL
//   CON el fix (roll-up de 4 capas)       → overall_coverage_status = PARTIAL

// ═══════════════════════════════════════════════════════════════════════
seccion('Validación de entrada — campos obligatorios de caso/versión');
// ═══════════════════════════════════════════════════════════════════════

['run_id', 'calculation_version', 'calculated_at', 'coberturaSeniales', 'nodeRaiz'].forEach(function (k) {
  var c = casoValido(); delete c[k];
  lanza(function () { R.runCFF(c); }, 'falta "' + k + '" → lanza');
});

// ═══════════════════════════════════════════════════════════════════════
seccion('INV-CFF-70 con exclusiones — los 4 perfiles cuadran con cff_total (PENDIENTES §7)');
// ═══════════════════════════════════════════════════════════════════════
// El test original de INV-70 solo cubría un caso SIN exclusiones, por eso no
// atrapó que los perfiles incluían componentes excluidos por la consolidación
// (transferencia interna, fuera de alcance, CONTAINS, DUPLICATE). Los perfiles
// deben reconstruir cff_total con EXACTAMENTE los componentes que se sumaron.
function sumaPerfil(p) { return p.reduce(function (s, x) { return s + x.total; }, 0); }
function cuadraTodo(r, esperado, etiqueta) {
  var res = r.result;
  near(res.cff_total, esperado, etiqueta + ' — cff_total = ' + esperado);
  near(sumaPerfil(res.event_profile), esperado, etiqueta + ' — Σ event_profile = cff_total');
  near(sumaPerfil(res.mechanism_profile), esperado, etiqueta + ' — Σ mechanism_profile = cff_total');
  near(sumaPerfil(res.financial_nature_profile), esperado, etiqueta + ' — Σ financial_nature_profile = cff_total');
  near(sumaPerfil(res.node_profile), esperado, etiqueta + ' — Σ node_profile = cff_total');
}

// (a) transferencia interna pura: se elimina de la consolidación (§14)
var rIT = R.runCFF(casoValido({ eventos: [eventoValido({ components: [
  compValida({ component_id: 'C_ok', original_value: 1000 }),
  compValida({ component_id: 'C_it', original_value: 100, primary_mechanism: 'REPLACEMENT', esTransferenciaInternaPura: true })
] })] }));
cuadraTodo(rIT, 1000, '(a) transferencia interna pura');
ok(!rIT.result.mechanism_profile.some(function (x) { return x.primary_mechanism === 'REPLACEMENT'; }),
  '(a) el mecanismo del componente eliminado (REPLACEMENT) NO aparece en mechanism_profile');
eq(rIT.result.coverage.attributable_events, 2,
  '(a) coverage.attributable_events NO cambió de significado (sigue contando por estado de monetización/atribución: 2)');

// (b) componente admisible por estado pero FUERA de alcance (scope_valid=false)
var rSc = R.runCFF(casoValido({ eventos: [eventoValido({ components: [
  compValida({ component_id: 'C_ok', original_value: 1000 }),
  compValida({ component_id: 'C_fuera', original_value: 900, scope_valid: false })
] })] }));
cuadraTodo(rSc, 1000, '(b) fuera de alcance');

// (c) CONTAINS FULL: el contenido no se suma sobre el contenedor
var rCo = R.runCFF(casoValido({
  eventos: [eventoValido({ components: [
    compValida({ component_id: 'C_cont', original_value: 1000 }),
    compValida({ component_id: 'C_dentro', original_value: 400, primary_mechanism: 'LOST_CAPACITY', financial_nature: 'CAPACITY_VALUE' })
  ] })],
  relaciones: [{ relation_type: 'CONTAINS', component_a_id: 'C_cont', component_b_id: 'C_dentro', direction: 'A_CONTAINS_B',
    containment_scope: 'FULL', resolution_status: 'RESOLVED' }]
}));
cuadraTodo(rCo, 1000, '(c) CONTAINS FULL');
ok(!rCo.result.financial_nature_profile.some(function (x) { return x.financial_nature === 'CAPACITY_VALUE'; }),
  '(c) la naturaleza del contenido (CAPACITY_VALUE) NO aparece en financial_nature_profile');

// (d) DUPLICATE sin resolver junto a un componente seguro: no hay doble conteo (INV-CFF-20)
var rDu = R.runCFF(casoValido({
  eventos: [eventoValido({ components: [
    compValida({ component_id: 'C_safe', original_value: 10000 }),
    compValida({ component_id: 'C_dupA', original_value: 4000 }),
    compValida({ component_id: 'C_dupB', original_value: 4000 })
  ] })],
  relaciones: [{ relation_type: 'DUPLICATE', component_a_id: 'C_dupA', component_b_id: 'C_dupB', resolution_status: 'UNRESOLVED' }]
}));
cuadraTodo(rDu, 10000, '(d) DUPLICATE sin resolver + componente seguro (antes: perfiles 18000)');

// (e) todo excluido: cff_total null (INSUFFICIENT) y perfiles VACÍOS, no el doble conteo de antes (2000)
var rNada = R.runCFF(casoValido({
  eventos: [eventoValido({ components: [
    compValida({ component_id: 'C_dupA', original_value: 1000 }),
    compValida({ component_id: 'C_dupB', original_value: 1000 })
  ] })],
  relaciones: [{ relation_type: 'DUPLICATE', component_a_id: 'C_dupA', component_b_id: 'C_dupB', resolution_status: 'UNRESOLVED' }]
}));
eq(rNada.result.cff_total, null, '(e) sin componentes seleccionables → cff_total = null (N_A, nunca 0)');
eq([rNada.result.event_profile.length, rNada.result.mechanism_profile.length, rNada.result.financial_nature_profile.length, rNada.result.node_profile.length],
  [0, 0, 0, 0], '(e) los 4 perfiles quedan vacíos (antes reportaban 2000: el doble conteo que cff_total se niega a sumar)');

// (f) el valor del perfil es el MISMO con que se sumó (transformación STOCK -> flujo), no original_value
var rSt = R.runCFF(casoValido({ eventos: [eventoValido({ components: [
  compValida({ component_id: 'C1', original_value: 500 }),
  compValida({ component_id: 'C2', original_value: 0, temporal_nature: 'STOCK', transformacionValidada: true, valorFlujoEquivalente: 120 })
] })] }));
cuadraTodo(rSt, 620, '(f) STOCK con transformación validada: el perfil usa el valor sumado (120), no original_value (0)');

// ═══════════════════════════════════════════════════════════════════════
seccion('exposure_total / unresolved_impact_total respetan node_set (PENDIENTES §7 Q1)');
// ═══════════════════════════════════════════════════════════════════════
seccion('Q5 — con cobertura INSUFFICIENT: cuadrantes, subtotales y perfiles también vacíos (PENDIENTES §7)');
// ═══════════════════════════════════════════════════════════════════════
var rQ5 = R.runCFF(casoValido({
  coberturaSeniales: { tratamientoEconomicoSuficiente: false, dependeDeEstimacionesDebiles: false, asignacionesLimitadas: false, baseDefendibleParaCifraConsolidada: false }
}));
var resQ5 = rQ5.result;
eq(resQ5.cff_total, null, 'Q5: cff_total = null');
['confirmed_observed', 'confirmed_estimated', 'supported_observed', 'supported_estimated', 'cff_confirmed', 'cff_supported_additional'].forEach(function (k) {
  eq(resQ5[k], null, 'Q5: ' + k + ' = null (no una cifra parcial junto a un total N_A)');
});
['event_profile', 'mechanism_profile', 'financial_nature_profile', 'node_profile'].forEach(function (k) {
  eq(resQ5[k], [], 'Q5: ' + k + ' vacío');
});
ok(rQ5._meta.contratoResultValido, 'Q5: el CFF_RESULT con cuadrantes null VALIDA (regla 9 extendida)  [' + rQ5._meta.contratoResultProblemas.join('; ') + ']');
// contraste: cuadrante null FUERA del caso N_A → el contrato lo rechaza
var q5malo = JSON.parse(JSON.stringify(rSc.result));
q5malo.confirmed_observed = null;
ok(!contratos.validarCFFResult(q5malo).valido, 'Q5: confirmed_observed=null con cobertura no insuficiente → el contrato lo RECHAZA');
// y sin insuficiencia las cifras siguen presentes
ok(typeof rSc.result.confirmed_observed === 'number' && rSc.result.event_profile.length > 0, 'Q5: sin insuficiencia, cuadrantes y perfiles siguen poblados');

// ═══════════════════════════════════════════════════════════════════════
seccion('Q3 — coverage.limitations incluye lo descartado antes de la consolidación (PENDIENTES §7)');
// ═══════════════════════════════════════════════════════════════════════
var rQ3 = R.runCFF(casoValido({ eventos: [eventoValido({ components: [
  compValida({ component_id: 'C_ok', original_value: 1000 }),
  compValida({ component_id: 'C_lc', original_value: 300, primary_mechanism: 'LOST_CAPACITY', resource_type: 'AUSENTISMO' })
] })] }));
var lim = rQ3.result.coverage.limitations;
ok(lim.some(function (x) { return x.indexOf('C_lc') === 0 && x.indexOf('LOST_CAPACITY_SIN_RECONSTRUCCION') !== -1; }),
  'Q3: LOST_CAPACITY sin reconstrucción figura en limitations con su causa  [' + JSON.stringify(lim) + ']');
ok(!lim.some(function (x) { return x.indexOf('C_ok') === 0; }), 'Q3: el componente consolidado NO figura');

// ═══════════════════════════════════════════════════════════════════════
seccion('Q4 — "sin cifra" explícito (monetization_status=N_A sin valor), sin centinela (PENDIENTES §7)');
// ═══════════════════════════════════════════════════════════════════════
function sinValor(o) { var c = compValida(o); delete c.original_value; return c; }
var rQ4 = R.runCFF(casoValido({ eventos: [eventoValido({ components: [
  compValida({ component_id: 'C_ok', original_value: 1000 }),
  sinValor({ component_id: 'C_sin_cifra', monetization_status: 'N_A' })
] })] }));
near(rQ4.result.cff_total, 1000, 'Q4: el "sin cifra" no suma ni resta: cff_total = 1000');
ok(!rQ4.result.errors.some(function (e) { return e.ref === 'C_sin_cifra'; }), 'Q4: NO es un error de datos (antes: COMPONENTE_SIN_VALOR)');
ok(rQ4.result.warnings.some(function (w) { return w.code === 'COMPONENTE_SIN_CIFRA_DECLARADA' && w.ref === 'C_sin_cifra'; }), 'Q4: queda declarado como warning COMPONENTE_SIN_CIFRA_DECLARADA');
ok(rQ4.result.coverage.limitations.some(function (x) { return x.indexOf('C_sin_cifra') === 0 && x.indexOf('SIN_CIFRA_DECLARADA') !== -1; }),
  'Q4: figura en coverage.limitations  [' + JSON.stringify(rQ4.result.coverage.limitations) + ']');
ok(!rQ4.result.event_profile.some(function (x) { return JSON.stringify(x).indexOf('C_sin_cifra') !== -1; }), 'Q4: no aparece en perfiles');
// equivalencia con el modo anterior (cifra de relleno que el motor descartaba): misma cobertura global
var rQ4viejo = R.runCFF(casoValido({ eventos: [eventoValido({ components: [
  compValida({ component_id: 'C_ok', original_value: 1000 }),
  compValida({ component_id: 'C_sin_cifra', original_value: 12345, monetization_status: 'N_A' })
] })] }));
eq(rQ4.result.coverage.overall_coverage_status, rQ4viejo.result.coverage.overall_coverage_status,
  'Q4: la cobertura global es la MISMA que con la cifra de relleno que ya se descartaba (' + rQ4viejo.result.coverage.overall_coverage_status + ')');
near(rQ4.result.cff_total, rQ4viejo.result.cff_total, 'Q4: y el mismo cff_total');
// solo con otro estado, sigue siendo error de datos
var rQ4err = R.runCFF(casoValido({ eventos: [eventoValido({ components: [
  compValida({ component_id: 'C_ok', original_value: 1000 }),
  sinValor({ component_id: 'C_falta', monetization_status: 'OBSERVED' })
] })] }));
ok(rQ4err.result.errors.some(function (e) { return e.code === 'COMPONENTE_SIN_VALOR' && e.ref === 'C_falta'; }), 'Q4: OBSERVED sin valor sigue siendo COMPONENTE_SIN_VALOR (la excepción es solo N_A)');

// ═══════════════════════════════════════════════════════════════════════
seccion('cost_reconciliation — 5 categorías + lo que el documento no define (PENDIENTES §7)');
// ═══════════════════════════════════════════════════════════════════════
// Cada componente cae en EXACTAMENTE una categoría; los montos salen de los totales que el motor ya
// calcula. Las reglas de clasificación se prueban con la matriz COMPLETA monetización x atribución.
function reconDe(comps, extra) {
  return R.runCFF(casoValido(Object.assign({ eventos: [eventoValido({ components: [compValida({ component_id: 'BASE', original_value: 1000 })].concat(comps) })] }, extra || {}))).result.cost_reconciliation;
}
function enDonde(rec, id) {
  var sitios = [];
  var c = rec.categorias, s = rec.sin_categoria_definida;
  if (c.efectos_sin_valoracion.componentes.some(function (x) { return x.component_id === id; })) sitios.push('efectos_sin_valoracion');
  if (s.doble_falla_exposure_unresolved.componentes.indexOf(id) !== -1) sitios.push('doble_falla');
  if (s.atribucion_na.componentes.indexOf(id) !== -1) sitios.push('atribucion_na');
  if (rec.excluidos_por_consolidacion.componentes.some(function (x) { return x.component_id === id; })) sitios.push('excluidos_por_consolidacion');
  return sitios;
}
var esperado = {
  'OBSERVED|CONFIRMED': 'costo', 'OBSERVED|SUPPORTED': 'costo', 'OBSERVED|UNRESOLVED': 'pendiente', 'OBSERVED|N_A': 'atribucion_na',
  'ESTIMATED|CONFIRMED': 'costo', 'ESTIMATED|SUPPORTED': 'costo', 'ESTIMATED|UNRESOLVED': 'pendiente', 'ESTIMATED|N_A': 'atribucion_na',
  'EXPOSURE|CONFIRMED': 'exposicion', 'EXPOSURE|SUPPORTED': 'exposicion', 'EXPOSURE|UNRESOLVED': 'doble_falla', 'EXPOSURE|N_A': 'exposicion',
  'N_A|CONFIRMED': 'efectos_sin_valoracion', 'N_A|SUPPORTED': 'efectos_sin_valoracion', 'N_A|UNRESOLVED': 'efectos_sin_valoracion', 'N_A|N_A': 'efectos_sin_valoracion'
};
['OBSERVED', 'ESTIMATED', 'EXPOSURE', 'N_A'].forEach(function (mon) {
  ['CONFIRMED', 'SUPPORTED', 'UNRESOLVED', 'N_A'].forEach(function (att) {
    var comp = mon === 'N_A' ? sinValor({ component_id: 'X', monetization_status: mon, attribution_status: att })
      : compValida({ component_id: 'X', original_value: 100, monetization_status: mon, attribution_status: att });
    var rec = reconDe([comp]);
    var clave = mon + '|' + att, esp = esperado[clave];
    var nCosto = rec.categorias.costo_atribuido.n, nPend = rec.categorias.atribucion_pendiente.n, nExp = rec.categorias.exposicion.n;
    var real;
    if (nCosto === 2) real = 'costo';                       // BASE + X
    else if (nPend === 1) real = 'pendiente';
    else if (nExp === 1) real = 'exposicion';
    else { var sit = enDonde(rec, 'X'); real = sit.length === 1 ? sit[0] : 'AMBIGUO:' + sit.join('+'); }
    eq(real, esp, 'matriz ' + clave + ' → ' + esp);
    ok(rec.verificacion.cuadra && rec.verificacion.componentes_considerados === 2, 'matriz ' + clave + ' — partición exhaustiva (cuadra, 2 componentes)');
  });
});

// montos = los totales que el motor ya calcula (la reconciliación no calcula nada nuevo)
var rMontos = R.runCFF(casoValido({ eventos: [eventoValido({ components: [
  compValida({ component_id: 'A', original_value: 1000 }),
  compValida({ component_id: 'P', original_value: 200, attribution_status: 'UNRESOLVED' }),
  compValida({ component_id: 'E', original_value: 500, monetization_status: 'EXPOSURE' }),
  compValida({ component_id: 'D', original_value: 70, monetization_status: 'EXPOSURE', attribution_status: 'UNRESOLVED' }),
  compValida({ component_id: 'Z', original_value: 33, attribution_status: 'N_A' })
] })] })).result;
var cr = rMontos.cost_reconciliation;
near(cr.categorias.costo_atribuido.monto, rMontos.cff_total, 'monto costo_atribuido = cff_total');
near(cr.categorias.atribucion_pendiente.monto, rMontos.unresolved_impact_total, 'monto atribucion_pendiente = unresolved_impact_total (200)');
near(cr.categorias.exposicion.monto, rMontos.exposure_total, 'monto exposicion = exposure_total (500)');
near(cr.sin_categoria_definida.doble_falla_exposure_unresolved.suma_cifras_declaradas, 70, 'doble falla: la cifra declarada (70) se muestra, no queda invisible');
eq(cr.sin_categoria_definida.doble_falla_exposure_unresolved.monto, null, 'doble falla: monto = null (el documento no define el cruce)');
near(cr.sin_categoria_definida.atribucion_na.suma_cifras_declaradas, 33, 'atribución N_A: la cifra declarada (33) se muestra');
eq(cr.sin_categoria_definida.atribucion_na.monto, null, 'atribución N_A: monto = null (el documento no la define)');
ok(!/1000|200|500/.test(JSON.stringify([cr.sin_categoria_definida.doble_falla_exposure_unresolved, cr.sin_categoria_definida.atribucion_na])), 'las cifras de otras categorías no se cuelan en las categorías sin definición');

// otras_causas: visible, no derivable, sin fusionar con atribución pendiente
eq(cr.categorias.otras_causas.monto, null, 'otras_causas: monto = null (no derivable)');
eq(cr.categorias.otras_causas.derivable, false, 'otras_causas: derivable = false, explícito');
ok(/no distingue esta causa dentro de UNRESOLVED/.test(cr.categorias.otras_causas.nota), 'otras_causas: nota explícita de por qué no es derivable');
ok(cr.categorias.atribucion_pendiente.n === 1, 'otras_causas NO se fusiona con atribucion_pendiente (P sigue solo en pendiente)');

// alcance (Q1): fuera de node_set no se clasifica, se cuenta aparte
var rFuera = reconDe([compValida({ component_id: 'F', original_value: 999, monetization_status: 'EXPOSURE', scope_valid: false })]);
eq(rFuera.fuera_de_alcance.n, 1, 'fuera de alcance: contado aparte');
eq(rFuera.categorias.exposicion.n, 0, 'fuera de alcance: NO cuenta como exposición');
ok(rFuera.verificacion.cuadra, 'fuera de alcance: la partición sigue cuadrando');

// excluidos por la consolidación (duplicado sin resolver): con cifra pero no suman
var rDupRec = reconDe([compValida({ component_id: 'DA', original_value: 4000 }), compValida({ component_id: 'DB', original_value: 4000 })],
  { relaciones: [{ relation_type: 'DUPLICATE', component_a_id: 'DA', component_b_id: 'DB', resolution_status: 'UNRESOLVED' }] });
eq(rDupRec.excluidos_por_consolidacion.componentes.map(function (x) { return x.component_id; }), ['DA', 'DB'], 'duplicado sin resolver → excluidos_por_consolidacion (no costo perdido)');
ok(rDupRec.categorias.costo_atribuido.n === 1 && rDupRec.verificacion.cuadra, 'duplicado: solo BASE en costo y la partición cuadra');

// EXPOSURE duplicados con relación de riesgo (INV-CFF-20): ni a exposición (no se cuenta dos veces) ni se pierden
var rRiesgo = reconDe([compValida({ component_id: 'RA', original_value: 6000, monetization_status: 'EXPOSURE' }), compValida({ component_id: 'RB', original_value: 6000, monetization_status: 'EXPOSURE' })],
  { relaciones: [{ relation_type: 'DUPLICATE', component_a_id: 'RA', component_b_id: 'RB', resolution_status: 'UNRESOLVED' }] });
eq(rRiesgo.excluidos_por_consolidacion.componentes, [{ component_id: 'RA', categoria: 'RELACION_ECONOMICA_NO_PERMITE_INCLUSION' }, { component_id: 'RB', categoria: 'RELACION_ECONOMICA_NO_PERMITE_INCLUSION' }],
  'EXPOSURE duplicados sin resolver → excluidos_por_consolidacion (no se cuentan dos veces en exposición)');
ok(rRiesgo.categorias.exposicion.n === 0 && rRiesgo.categorias.exposicion.monto === 0 && rRiesgo.verificacion.cuadra, 'y no aparecen en exposición (monto 0) y la partición cuadra');

// efectos sin valoración: con causa donde existe (LOST_CAPACITY) y "sin cifra" declarado
var rEf = reconDe([compValida({ component_id: 'LC', original_value: 300, primary_mechanism: 'LOST_CAPACITY', resource_type: 'AUSENTISMO' }),
  sinValor({ component_id: 'SC', monetization_status: 'N_A' })]);
eq(rEf.categorias.efectos_sin_valoracion.componentes, [{ component_id: 'LC', causa: 'LOST_CAPACITY_SIN_RECONSTRUCCION' }, { component_id: 'SC', causa: 'SIN_CIFRA_DECLARADA' }],
  'efectos_sin_valoracion: LOST_CAPACITY con su causa fina; N_A sin cifra como SIN_CIFRA_DECLARADA (la causa por la que no hay base no se guarda)');
// defensa: un N_A que llegue CON cifra (el contrato ya lo marca inválido) igual no suma ni se pierde
var rNaCifra = reconDe([compValida({ component_id: 'NC', original_value: 555, monetization_status: 'N_A' })]);
eq(rNaCifra.categorias.efectos_sin_valoracion.componentes, [{ component_id: 'NC', causa: 'MONETIZACION_N_A' }], 'N_A con cifra (contrato inválido): clasificado en efectos_sin_valoracion, causa MONETIZACION_N_A');
ok(rNaCifra.categorias.costo_atribuido.n === 1 && rNaCifra.verificacion.cuadra, 'N_A con cifra: no entra a costo_atribuido y la partición cuadra');
eq(rEf.categorias.efectos_sin_valoracion.monto, null, 'efectos_sin_valoracion: monto = null (sin cifra por definición)');

// INSUFFICIENT (Q5): costo sin monto, pero la partición cuadra y no desaparecen componentes
var rIns = R.runCFF(casoValido({ coberturaSeniales: { tratamientoEconomicoSuficiente: false, dependeDeEstimacionesDebiles: false, asignacionesLimitadas: false, baseDefendibleParaCifraConsolidada: false } })).result.cost_reconciliation;
eq(rIns.categorias.costo_atribuido.monto, null, 'INSUFFICIENT: costo_atribuido.monto = null (mismo criterio que cff_total, Q5)');
ok(/INSUFFICIENT/.test(rIns.categorias.costo_atribuido.nota) && rIns.verificacion.cuadra, 'INSUFFICIENT: con nota y la partición sigue cuadrando');

// determinismo y forma
var recA = JSON.stringify(reconDe([sinValor({ component_id: 'S1', monetization_status: 'N_A' }), compValida({ component_id: 'S2', original_value: 5, monetization_status: 'EXPOSURE' })]));
var recB = JSON.stringify(reconDe([compValida({ component_id: 'S2', original_value: 5, monetization_status: 'EXPOSURE' }), sinValor({ component_id: 'S1', monetization_status: 'N_A' })]));
eq(recA, recB, 'determinista: el orden de entrada de los componentes no cambia la reconciliación');

// ═══════════════════════════════════════════════════════════════════════
// El documento define exposure_total solo como campo de CFF_RESULT (que lleva
// node_set) y no respalda un total "amplio": un componente fuera del alcance no
// suma a ningún total, igual que cff_total.
var rQ1 = R.runCFF(casoValido({ eventos: [eventoValido({ components: [
  compValida({ component_id: 'C_ok', original_value: 1000 }),
  compValida({ component_id: 'C_exp_dentro', original_value: 500, monetization_status: 'EXPOSURE' }),
  compValida({ component_id: 'C_exp_fuera', original_value: 999, monetization_status: 'EXPOSURE', scope_valid: false }),
  compValida({ component_id: 'C_unr_dentro', original_value: 200, attribution_status: 'UNRESOLVED' }),
  compValida({ component_id: 'C_unr_fuera', original_value: 777, attribution_status: 'UNRESOLVED', scope_valid: false })
] })] }));
near(rQ1.result.exposure_total, 500, 'Q1: exposure_total = solo la EXPOSURE dentro del alcance (500, no 1499)');
near(rQ1.result.unresolved_impact_total, 200, 'Q1: unresolved_impact_total = solo la UNRESOLVED dentro del alcance (200, no 977)');
near(rQ1.result.cff_total, 1000, 'Q1: cff_total no cambia');

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
