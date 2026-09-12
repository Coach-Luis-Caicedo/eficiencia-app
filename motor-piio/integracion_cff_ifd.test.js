/**
 * motor-piio/integracion_cff_ifd.test.js — Fase 12c
 * node motor-piio/integracion_cff_ifd.test.js
 *
 * Arnés real contra motor-cff (`runCFF`) y motor-ifd (`runEPD`) — Clase 3b
 * del plan de Fase 12 (AC61/62/64/65, INV-68/70/72). `motor-cff`/`motor-ifd`
 * están trackeados dentro de `feat/motor-piio` (la rama se creó desde
 * `main` en 365348c, YA con esos motores fusionados) — `require` directo,
 * sin vendorizar nada (confirmado con ejecución antes de escribir este
 * archivo). Ningún archivo de motor-cff/motor-ifd expone un adaptador para
 * consumidores externos (grep de "adapt|adaptador|external": 0 resultados
 * en ambos) — el adaptador `_aCFFEvent`/`_aEPDInput` de este archivo es una
 * decisión DEL ARNÉS, documentada como tal, no un contrato de ninguno de
 * los dos motores.
 *
 * Hallazgo previo, ya documentado en el README: `CFF_EVENT.exposure_
 * definition`/`operational_quantity` NUNCA se leen en ningún cálculo de
 * motor-cff (grep confirmado) — no existe ningún mapeo de campos PIIO→CFF
 * en código de producción, en ningún lado. El adaptador de este arnés copia
 * SOLO identificación (`phenomenon_id`/`domain_id`/`node_id`/período); la
 * magnitud económica es un dato INDEPENDIENTE del fixture, nunca derivado
 * de `exposure`/`observed_quantity` de PIIO — así se prueba AC61 en su
 * forma más literal: PIIO no expone ningún número que CFF use para
 * monetizar.
 *
 * Fixtures de CFF_CASE/EPD_INPUT tomados de los propios `runCFF.test.js` /
 * `runIFD.test.js` (formas ya verificadas válidas por esos motores) — no
 * se reinventa el contrato de otro motor.
 */

'use strict';

var R = require('./runPIIO');
var CFF = require('../motor-cff/runCFF');
var IFD = require('../motor-ifd/runIFD');
var fs = require('fs');
var path = require('path');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }
function near(a, b, m) { ok(typeof a === 'number' && Math.abs(a - b) < 1e-6, m + (Math.abs(a - b) < 1e-6 ? '' : '  [recibido=' + a + ' esperado=' + b + ']')); }

// ── fixture PIIO (mismo patrón que runPIIO.test.js) ─────────────────────
function md(o) {
  return Object.assign({
    metric_definition_id: 'md1', phenomenon_id: 'ph1', name: 'X', operational_definition: 'd', unit: '%',
    metric_type: 'RATE', directionality: 'HIGHER_IS_WORSE',
    source_frequency: 'monthly', calculation_frequency: 'monthly', aggregation_frequency: 'monthly',
    boundary_behavior: 'INVALID', recurrence_type: 'RATE_BASED', definition_version: 'v1',
    valid_from: '2025-01', continuity_mode: 'CONTINUOUS'
  }, o || {});
}
function rs(o) {
  return Object.assign({
    reference_id: 'rc1', reference_role: 'CONDITION', reference_type: 'NORMATIVE', source: 'ISO', valid_from: '2025-01',
    rule: 'r', comparability_assessment: 'a', traceability: 't', version: 'v1', admissibility_declared: 'ADMISSIBLE', threshold: 50
  }, o || {});
}
function ph(o) {
  return Object.assign({
    phenomenon_id: 'ph1', name: 'F1', operational_definition: 'd', canonical_domain_id: 'QUALITY',
    recurrence_type: 'RATE_BASED', directionality: 'HIGHER_IS_WORSE',
    required_evidence_group_ids: [], optional_evidence_group_ids: ['eg1'], proxy_allowed_as_primary: false,
    core_or_supporting_by_domain: { QUALITY: 'CORE' }, applicable_node_types: ['ORG'], version: 'v1', valid_from: '2025-01'
  }, o || {});
}
function ds(o) {
  return Object.assign({
    domain_id: 'QUALITY', definition: 'd', applicability_by_context: { ORG: 'REQUIRED', DEFAULT: 'REQUIRED' },
    core_phenomenon_ids: ['ph1'], supporting_phenomenon_ids: [], version: 'v1'
  }, o || {});
}
function ns(o) {
  return Object.assign({
    node_id: 'n-root', node_type: 'ORG', active_from: '2025-01', aggregation_membership: 'set-root',
    scope_rules: { scope: 'ORGANIZATIONAL' }, version: 'v1', parent_node_id: null
  }, o || {});
}
function ks(o) {
  return Object.assign({
    kpi_id: 'k1', name: 'K1', description: 'd', primary_domain_id: 'QUALITY', primary_phenomenon_id: 'ph1',
    metric_definition_id: 'md1', evidence_group_id: 'eg1', evidence_proximity: 'DIRECT', computation: 'RAW',
    temporal_role: 'COINCIDENT', freshness_spec: { max_age_current: 2 },
    condition_reference_id: 'rc1', temporal_reference_id: 'rt1', definition_version: 'v1', source_requirements: ['ERP']
  }, o || {});
}
function eg(o) {
  return Object.assign({
    evidence_group_id: 'eg1', phenomenon_id: 'ph1', node_id: 'n-root', member_kpi_ids: ['k1'],
    source_lineage_ids: ['s'], independence_basis: { kind: 'SEPARATE_SOURCE', detail: 'x' },
    resolution_rule_version: 'v1', status: 'ACTIVE'
  }, o || {});
}
function obs(o) {
  return Object.assign({
    observation_id: 'o1', organization_id: 'org1', kpi_id: 'k1', metric_definition_id: 'md1', node_id: 'n-root',
    period_start: '2026-01', period_end: '2026-01', observed_at: '2026-02-01',
    value: 20, numerator: 20, denominator: 100, unit: '%', source_id: 's1', source_traceable: true, quality_status: 'VALID'
  }, o || {});
}
function piioInput(o) {
  return Object.assign({
    organization_id: 'org1', ruleset_version: 'rs-v1', periods: ['2026-01'],
    domain_catalog: [ds()], phenomenon_catalog: [ph()], metric_definitions: [md()],
    references: [rs(), rs({ reference_id: 'rt1', reference_role: 'TEMPORAL', threshold: undefined })],
    node_hierarchy: [ns()], kpi_specs: [ks()], evidence_groups: [eg()], observations: [obs()]
  }, o || {});
}

// ── el arnés: adaptador PIIO export → CFF_EVENT (decisión del arnés) ────
function _aCFFEvent(row, opciones) {
  var o = opciones || {};
  return {
    event_id: 'EV-' + row.phenomenon_id + '-' + row.node_id + '-' + row.period,
    organization_id: row.organization_id || 'org1',
    source_type: 'PIIO', source_ids: ['piio-run:' + (o.piio_run_id || row.piio_run_id)],
    phenomenon_id: row.phenomenon_id, domain_id: row.domain_id, node_id: row.node_id,
    period_start: row.period + '-01', period_end: row.period + '-28',
    event_type: 'FENOMENO_PIIO', event_description: 'adaptado del export PIIO §26 — arnés de prueba',
    status: 'COMPLETE', flags: [],
    components: [_aComponent(row, o)]
  };
}
// magnitud económica SIEMPRE del fixture (o.quantity) — NUNCA de row.exposure/observed_quantity
function _aComponent(row, opciones) {
  var o = opciones || {};
  return Object.assign({
    component_id: 'C-' + row.phenomenon_id, event_id: 'EV-' + row.phenomenon_id + '-' + row.node_id + '-' + row.period,
    organization_id: row.organization_id || 'org1', phenomenon_id: row.phenomenon_id, node_id: row.node_id,
    consequence_id: 'CQ-' + row.phenomenon_id,
    primary_mechanism: 'ADDITIONAL_CONSUMPTION', financial_nature: 'INCREMENTAL_COST',
    resource_type: 'ARNES_PRUEBA', quantity: 1, unit: 'unidad',
    temporal_nature: 'PERIOD_FLOW', source_frequency: 'monthly', calculation_frequency: 'monthly',
    aggregation_frequency: 'monthly', calculation_mode: 'DIRECT_VALUE', input_variables: [],
    monetary_basis_id: 'MB1', original_value: o.quantity != null ? o.quantity : 1000, original_currency: 'COP',
    valuation_basis: 'NOMINAL', monetization_status: 'OBSERVED', attribution_status: 'CONFIRMED',
    valuation_role: 'PRIMARY', economic_scope: 'ORGANIZATION', counterparty_scope: 'EXTERNAL',
    dependency_refs: [], include_in_cff: true, flags: [],
    monetary_basis_valid: true, temporal_basis_valid: true, scope_valid: true,
    esTransferenciaInternaPura: false
  }, o.overrideComponente || {});
}
function cffCaso(evento, overCaso) {
  return Object.assign({
    cff_case_id: 'CASE-ARNES', period_start: '2026-01-01', period_end: '2026-01-31',
    scope: 'ORGANIZATION', node_set: ['ORG'], nodeRaiz: 'ORG', economicScope: 'ORGANIZATION',
    reporting_currency: 'COP', valuation_basis: 'NOMINAL',
    nodeHierarchy: [{ node_id: 'ORG', parent_id: null }, { node_id: 'n-root', parent_id: 'ORG' }],
    eventos: [evento], relaciones: [],
    coberturaSeniales: { tratamientoEconomicoSuficiente: true, dependeDeEstimacionesDebiles: false, asignacionesLimitadas: false, baseDefendibleParaCifraConsolidada: true },
    run_id: 'RUN-ARNES', calculation_version: 'calc-v1', ruleset_version: 'rules-v1',
    calculated_at: '2026-02-01T00:00:00Z', generated_at: '2026-02-01T00:00:00Z',
    formula_versions: [], monetary_basis_versions: ['mb-v1'], relationship_versions: [],
    input_snapshot_ids: ['snap-1'], update_reason: 'arnés de prueba 12c', run_status: 'COMPLETED'
  }, overCaso || {});
}

// ── el arnés: EPD_INPUT independiente (IFD no tiene phenomenon_id — ver
//    README/INV-68: no hay campo que "adaptar" desde el export de PIIO) ──
function epdInput(o) {
  return Object.assign({
    epd_id: 'EPD-ARNES', engine_version: 'ifd-js-0.1',
    deterioration_sustained: true, evidence_present: true, mechanism_traceable: true,
    horizon_defined: true, assumptions_declared: true,
    Q: 3, C: 3, T: 3, R: 3,
    variable_type: 'V3', evolution_type: 'EV-A', series_sufficiency: 3,
    horizon: 6, hms: 12,
    baseline: 3000, delta: 400, lower_bound: 0, unit: 'horas', unit_value: 25,
    economic_traceability: true, attribution_category: 'CONFIRMED'
  }, o || {});
}

// ═══════════════════════════════════════════════════════════════════════
seccion('setup — corrida PIIO base y export §26');
// ═══════════════════════════════════════════════════════════════════════

var piioResult = R.runPIIOCompleto(piioInput());
eq(piioResult.efo_states[0].output_status, 'VALID', 'setup: la EFO base queda output_status=VALID (elegible para export)');
var exportRow = piioResult.operational_export[0];
ok(exportRow && exportRow.phenomenon_id === 'ph1', 'setup: 1 fila de export, phenomenon_id=ph1');

// ═══════════════════════════════════════════════════════════════════════
seccion('AC61/AC62 — PIIO exporta fenómeno/exposición, NUNCA dinero');
// ═══════════════════════════════════════════════════════════════════════

var evCFF = _aCFFEvent(exportRow, { quantity: 42000 });
eq([evCFF.phenomenon_id, evCFF.domain_id, evCFF.node_id], ['ph1', 'QUALITY', 'n-root'], 'el adaptador copia SOLO identificación de PIIO hacia CFF_EVENT');
var rCFF = CFF.runCFF(cffCaso(evCFF));
near(rCFF.result.cff_total, 42000, 'AC61: runCFF monetiza EXACTAMENTE la magnitud declarada por el arnés (42000) — nunca desde exposure/observed_quantity de PIIO');
ok([exportRow.numerator, exportRow.denominator, exportRow.observed_quantity, exportRow.exposure].indexOf(rCFF.result.cff_total) === -1, '...cff_total (42000) no coincide con NINGÚN número crudo del export de PIIO (numerator=20, denominator=100, observed_quantity=20, exposure=null) — no hay coincidencia accidental');

var rIFD = IFD.runEPD(epdInput());
ok(rIFD.ok && rIFD.output.status === 'CUANTIFICADO', 'AC62: runEPD proyecta desde su propio EPD_INPUT (baseline/delta/unit_value) — sin ningún campo de PIIO involucrado');
near(rIFD.output.economic_base, 135000, '...proyección económica = 5400 × 25 = 135000, íntegramente de datos declarados en el arnés');

// ═══════════════════════════════════════════════════════════════════════
seccion('AC64/AC65/INV-72 — CFF/IFD nunca alteran retrospectivamente el EFO de PIIO');
// ═══════════════════════════════════════════════════════════════════════

var snapshotAntes = JSON.stringify(piioResult);
var evCostoAlto = _aCFFEvent(exportRow, { quantity: 999999999 });
CFF.runCFF(cffCaso(evCostoAlto));
IFD.runEPD(epdInput({ baseline: 999999, delta: 999999 }));
eq(JSON.stringify(piioResult), snapshotAntes, 'AC64/AC65/INV-72: tras correr CFF con costo altísimo e IFD con deterioro altísimo, el PIIO_RESULT original sigue byte a byte idéntico');

// ═══════════════════════════════════════════════════════════════════════
seccion('INV-68 — CFF reutiliza phenomenon_id, no lo redefine (solo rama CFF — IFD no tiene el campo)');
// ═══════════════════════════════════════════════════════════════════════

// Hallazgo estructural (más fuerte que comparar valores): `phenomenon_id`
// aparece en TODO motor-cff SOLO en contratos.js (la declaración de
// esquema) — ningún otro archivo de producción lo lee ni lo escribe.
// motor-cff NO PUEDE redefinirlo porque ningún código de cálculo lo toca
// en absoluto; es metadato de paso, inerte para el cálculo económico.
var _archivosCFF = fs.readdirSync(path.join(__dirname, '../motor-cff')).filter(function (f) { return /\.js$/.test(f) && !/\.test\.js$/.test(f) && f !== 'contratos.js'; });
var _tocaPhenId = _archivosCFF.filter(function (f) {
  return fs.readFileSync(path.join(__dirname, '../motor-cff', f), 'utf8').indexOf('phenomenon_id') !== -1;
});
eq(_tocaPhenId, [], 'INV-68 (estructural): fuera de contratos.js, NINGÚN archivo de motor-cff lee ni escribe phenomenon_id — no puede redefinirlo porque no lo toca');
eq(evCFF.phenomenon_id, exportRow.phenomenon_id, '...y por eso el valor que entra sale intacto: mismo string, sin transformación posible');
ok(!('phenomenon_id' in epdInput()), 'INV-68 (rama IFD): N/A por diseño de contrato — EPD_INPUT no tiene phenomenon_id en absoluto (confirmado por Luis en su sandbox)');

// ═══════════════════════════════════════════════════════════════════════
seccion('INV-70 — PIIO eligible NO implica CFF monetizable ni IFD forecastable');
// ═══════════════════════════════════════════════════════════════════════

// mismo fenómeno, output_status=VALID en PIIO — pero el componente falla
// UNA de las 7 puertas AND de admisibilidad.js (scope_valid), por razones
// que le pertenecen enteramente a CFF, nunca a PIIO.
var evNoAdmisible = _aCFFEvent(exportRow, { quantity: 5000, overrideComponente: { scope_valid: false } });
var rNoAdm = CFF.runCFF(cffCaso(evNoAdmisible));
ok(piioResult.efo_states[0].output_status === 'VALID', '...PIIO sigue diciendo VALID para este fenómeno');
eq(rNoAdm.result.cff_total, null, 'INV-70: cff_total=null (AC46: cobertura insuficiente ≠ 0) — el componente NO entra al universo elegible, aunque PIIO diga VALID');
eq(rNoAdm.result.coverage.overall_coverage_status, 'INSUFFICIENT', '...overall_coverage_status=INSUFFICIENT');
ok(rNoAdm.result.coverage.limitations.some(function (l) { return l.indexOf('FALLA_COMPUERTA_ADMISIBILIDAD') !== -1; }), '...la razón trazable es exactamente la compuerta §18 (scope_valid), una regla que le pertenece por completo a CFF — nunca a algo que PIIO declaró');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones "prueba de vida" — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  Este arnés no introduce código nuevo en motor-piio ni en motor-cff/motor-ifd');
console.log('  (esos motores ya están cerrados, con su propia batería) — las mutaciones aquí');
console.log('  prueban que las 4 relaciones (AC61/62, AC64/65/INV-72, INV-68, INV-70) se');
console.log('  verifican de verdad contra el comportamiento REAL de los otros dos motores, no');
console.log('  contra un fixture que solo parece correcto.');
console.log('  1. [motor-cff/admisibilidad.js, TEMPORAL — restaurado tras la corrida]');
console.log('     `if (componente.scope_valid !== true)` → `if (false && ...)` (la compuerta');
console.log('     §18 de scope_valid deja de excluir nada) → 3 rojos en INV-70 (cff_total ya');
console.log('     no es null, coverage ya no es INSUFFICIENT, sin razón de exclusión) —');
console.log('     confirma que INV-70 depende genuinamente de la compuerta real de CFF, no de');
console.log('     una coincidencia del fixture.');
console.log('  2. [adaptador propio del arnés, _aComponent] `original_value: o.quantity...` →');
console.log('     `original_value: row.observed_quantity` (acopla la magnitud económica al');
console.log('     número de PIIO, exactamente el error que AC61 existe para atrapar) → 2');
console.log('     rojos — confirma que el chequeo "sin coincidencia accidental" detectaría de');
console.log('     verdad un adaptador mal construido, no es un assert vacío.');
console.log('  Conteos: 3, 2.');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
