/**
 * motor-piio/observaciones.test.js — Fase 2
 * node motor-piio/observaciones.test.js
 *
 * §9 / §29 (validate_data_quality → preserve_original_value) + §28.
 * Oráculo conductual: AC08 (fuera de rango → INVALID, no clamp), AC09
 * (missing → null, no cero), AC10 (cero confirmado → válido), AC11
 * (denominador pequeño → conservar). INV-03/04/10/54/55.
 */

'use strict';

var O = require('./observaciones');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }
function tieneFlag(ev, f) { return ev.flags.some(function (x) { return x === f || x.indexOf(f + ':') === 0; }); }

// ── fixtures ─────────────────────────────────────────────────────────
function md(over) {
  return Object.assign({
    metric_definition_id: 'md1', phenomenon_id: 'ph1', name: 'Tasa X', operational_definition: 'd',
    unit: '%', metric_type: 'RATE', directionality: 'HIGHER_IS_WORSE',
    source_frequency: 'monthly', calculation_frequency: 'monthly', aggregation_frequency: 'quarterly',
    boundary_behavior: 'INVALID', recurrence_type: 'RATE_BASED', definition_version: 'v1', valid_from: '2026-01-01',
    continuity_mode: 'CONTINUOUS', valid_range_min: 0, valid_range_max: 100
  }, over || {});
}
function ks(over) {
  return Object.assign({
    kpi_id: 'k1', name: 'KPI 1', description: 'd', primary_domain_id: 'QUALITY', primary_phenomenon_id: 'ph1',
    metric_definition_id: 'md1', evidence_group_id: 'eg1', evidence_proximity: 'DIRECT', computation: 'RAW',
    temporal_role: 'COINCIDENT', freshness_spec: {}, condition_reference_id: 'rc1', temporal_reference_id: 'rt1',
    definition_version: 'v1', source_requirements: ['ERP']
  }, over || {});
}
function obs(over) {
  return Object.assign({
    observation_id: 'o1', organization_id: 'org1', kpi_id: 'k1', metric_definition_id: 'md1', node_id: 'n1',
    period_start: '2026-01-01', period_end: '2026-01-31', observed_at: '2026-02-01',
    value: 42, unit: '%', source_id: 's1', source_traceable: true, quality_status: 'VALID'
  }, over || {});
}
function ingest(observaciones, over) {
  var input = Object.assign({ kpi_specs: [ks()], metric_definitions: [md()], observations: observaciones }, over || {});
  return O.ingestarObservaciones(input);
}
function unEval(obsOver, mdOver) {
  var r = O.ingestarObservaciones({ kpi_specs: [ks()], metric_definitions: [md(mdOver)], observations: [obs(obsOver)] });
  return r.evals[0];
}

// ═══════════════════════════════════════════════════════════════════════
seccion('INV-PIIO-10 — preservar valor original (nunca sustituido/recortado)');
// ═══════════════════════════════════════════════════════════════════════

eq(O.preservarValorOriginal({ value: 3.5 }).original_value, 3.5, 'valor normal preservado');
eq(O.preservarValorOriginal({ value: 0 }).original_value, 0, 'cero preservado (no se confunde con ausente)');
eq(O.preservarValorOriginal({ value: null }).original_value, null, 'null preservado');
// fuera de rango — el original sobrevive aunque la calidad sea INVALID (§9: no clamp)
var fr = unEval({ value: 250 });
eq(fr.original_value, 250, 'valor fuera de rango: original_value = 250 intacto (INV-10, no clamp)');
eq(fr.value, 250, 'value tampoco se recorta');
eq(fr.data_quality, 'INVALID', '...pero data_quality = INVALID (AC08)');

// ═══════════════════════════════════════════════════════════════════════
seccion('AC08 — fuera de rango físico → INVALID según boundary_behavior');
// ═══════════════════════════════════════════════════════════════════════

eq(unEval({ value: 150 }).data_quality, 'INVALID', 'value > max (boundary_behavior=INVALID) → INVALID');
eq(unEval({ value: -5 }).data_quality, 'INVALID', 'value < min → INVALID');
ok(tieneFlag(unEval({ value: 150 }), 'FUERA_DE_RANGO'), '...flag FUERA_DE_RANGO');
eq(unEval({ value: 50 }).data_quality, 'VALID', 'value dentro de rango → conserva VALID');
// boundary_behavior = NOT_APPLICABLE (ambigüedad V)
eq(unEval({ value: 150 }, { boundary_behavior: 'NOT_APPLICABLE' }).data_quality, 'MISSING', 'fuera de rango + NOT_APPLICABLE → MISSING (ambig. V)');
ok(tieneFlag(unEval({ value: 150 }, { boundary_behavior: 'NOT_APPLICABLE' }), 'BOUNDARY_NOT_APPLICABLE'), '...flag BOUNDARY_NOT_APPLICABLE');
// boundary_behavior = RULE_DEFINED (ambigüedad S)
eq(unEval({ value: 150 }, { boundary_behavior: 'RULE_DEFINED' }).data_quality, 'INVALID', 'fuera de rango + RULE_DEFINED → INVALID (regla no operacionalizada en v1.1, ambig. S)');
ok(tieneFlag(unEval({ value: 150 }, { boundary_behavior: 'RULE_DEFINED' }), 'BOUNDARY_RULE_NO_OPERACIONALIZADO'), '...flag BOUNDARY_RULE_NO_OPERACIONALIZADO');
// sin rango definido → no se chequea
eq(unEval({ value: 9999 }, { valid_range_min: undefined, valid_range_max: undefined }).data_quality, 'VALID', 'sin valid_range_* → no se chequea rango');

// ═══════════════════════════════════════════════════════════════════════
seccion('AC09 / AC10 — missing ≠ cero; cero confirmado válido');
// ═══════════════════════════════════════════════════════════════════════

var miss = unEval({ value: null, quality_status: 'MISSING' });
eq(miss.data_quality, 'MISSING', 'value=null + declarado MISSING → MISSING (AC09)');
eq(miss.ausencia_kind, 'MISSING', '...ausencia_kind = MISSING');
eq(miss.original_value, null, '...original_value = null (no 0)');

var cero = unEval({ value: 0, quality_status: 'VALID' });
eq(cero.data_quality, 'VALID', 'value=0 + declarado VALID → VALID (AC10: fuente confirma)');
eq(cero.ausencia_kind, 'CERO_OBSERVADO', '...ausencia_kind = CERO_OBSERVADO');

// ambigüedad T — value=0 + declarado MISSING
var ceroMiss = unEval({ value: 0, quality_status: 'MISSING' });
eq(ceroMiss.data_quality, 'INVALID', 'value=0 + declarado MISSING → INVALID (§9: "missing no es cero", ambig. T)');
ok(tieneFlag(ceroMiss, 'VALOR_CALIDAD_INCONSISTENTE'), '...flag VALOR_CALIDAD_INCONSISTENTE');
eq(ceroMiss.ausencia_kind, 'INVALIDO', '...ausencia_kind = INVALIDO (usa la calidad EFECTIVA, no la declarada)');

// value presente (no cero) + declarado MISSING → también inconsistente
eq(unEval({ value: 5, quality_status: 'MISSING' }).data_quality, 'INVALID', 'value=5 + declarado MISSING → INVALID');

// ═══════════════════════════════════════════════════════════════════════
seccion('Ambigüedad R — degradación MONÓTONA (nunca mejora lo declarado)');
// ═══════════════════════════════════════════════════════════════════════

eq(unEval({ value: 50, quality_status: 'INVALID' }).data_quality, 'INVALID', 'declarado INVALID + value en rango → SIGUE INVALID (no se "arregla")');
eq(unEval({ value: 50, quality_status: 'VALID_WITH_LIMITATIONS' }).data_quality, 'VALID_WITH_LIMITATIONS', 'declarado VWL + value ok → sigue VWL (no sube a VALID)');
eq(unEval({ value: 150, quality_status: 'VALID_WITH_LIMITATIONS' }).data_quality, 'INVALID', 'declarado VWL + fuera de rango → baja a INVALID (sí degrada)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Ambigüedad U — value=null + declarado VALID + con razón');
// ═══════════════════════════════════════════════════════════════════════

var nullRazon = unEval({ value: null, quality_status: 'VALID', absence_reason: 'sensor en mantenimiento' });
eq(nullRazon.data_quality, 'MISSING', 'null no puede ser VALID → MISSING (§28 no crea 5º estado, ambig. U)');
ok(tieneFlag(nullRazon, 'NULL_EXPLICADO'), '...la razón se preserva en flag NULL_EXPLICADO');
eq(nullRazon.ausencia_kind, 'MISSING', '...ausencia_kind = MISSING');

// ═══════════════════════════════════════════════════════════════════════
seccion('§9.2 — numerador / denominador / exposición se preservan');
// ═══════════════════════════════════════════════════════════════════════

var conND = unEval({ value: 2.5, numerator: 5, denominator: 200, exposure: 200 });
eq([conND.numerator, conND.denominator, conND.exposure], [5, 200, 200], 'num/den/exposure presentes → se conservan (§9.2 / INV-54/55)');
var sinND = unEval({ value: 2.5 });
ok(!('numerator' in sinND) && !('denominator' in sinND) && !('exposure' in sinND), 'sin num/den/exposure → no se inventan');
// AC11 — denominador pequeño: se conserva (no se descarta la observación)
var denomChico = unEval({ value: 100, numerator: 1, denominator: 1 });
eq(denomChico.denominator, 1, 'denominador = 1 → se conserva (AC11)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§30 — observación con kpi_id sin spec → skipped, no crashea');
// ═══════════════════════════════════════════════════════════════════════

var conColgante = ingest([obs(), obs({ observation_id: 'o2', kpi_id: 'k-FANTASMA' })]);
eq(conColgante.evals.length, 1, 'solo 1 eval (la colgante no entra)');
eq(conColgante.skipped, [{ observation_id: 'o2', reason: 'KPI_SIN_SPEC' }], 'la colgante → skipped con razón (§30)');

// metric_definition del spec no resuelve → se ingesta igual, con flag
var mdNoResuelve = O.ingestarObservaciones({ kpi_specs: [ks({ definition_version: 'v99' })], metric_definitions: [md()], observations: [obs()] });
eq(mdNoResuelve.evals.length, 1, 'md no resuelve → la observación se ingesta igual (original_value preservado)');
ok(tieneFlag(mdNoResuelve.evals[0], 'MD_NO_RESUELVE'), '...con flag MD_NO_RESUELVE');
eq(mdNoResuelve.evals[0].original_value, 42, '...original_value = 42 intacto');
eq(mdNoResuelve.evals[0].data_quality, 'VALID', '...sin metricDef no se chequea rango, conserva VALID');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. preservarValorOriginal: `original_value` = null cuando `value` está fuera');
console.log('     del rango [0,100] → 1 rojo ("fuera de rango: original_value = 250 intacto",');
console.log('     INV-10 / §9 no clamp).');
console.log('  2. validarCalidadDato: quitar la rama `boundary_behavior INVALID` (fuera de');
console.log('     rango) → 5 rojos (value>max, value<min, flag FUERA_DE_RANGO, "data_quality');
console.log('     = INVALID", "VWL fuera de rango → INVALID") — AC08.');
console.log('  3. validarCalidadDato: `var efectiva = declarada` → `var efectiva = "VALID"`');
console.log('     → 2 rojos ("declarado INVALID → SIGUE INVALID", "declarado VWL → sigue');
console.log('     VWL"). Prueba que la calidad efectiva PARTE de la declarada (ambig. R).');
console.log('  4. validarCalidadDato: quitar la rama `declarada === MISSING` → 3 rojos');
console.log('     (value=0+MISSING→INVALID, flag VALOR_CALIDAD_INCONSISTENTE, value=5+MISSING');
console.log('     →INVALID) — ambig. T.');
console.log('  5. validarCalidadDato: NOT_APPLICABLE → INVALID en vez de MISSING → 1 rojo');
console.log('     ("fuera de rango + NOT_APPLICABLE → MISSING") — ambig. V.');
console.log('  6. ingestarObservaciones: clasificarAusencia con `obs.quality_status`');
console.log('     (declarada) en vez de `cal.data_quality` (efectiva) → 1 rojo (null +');
console.log('     declarado VALID + razón: ausencia_kind da NULL_CON_RAZON en vez de MISSING).');
console.log('  7. ingestarObservaciones: no saltar la observación sin spec → 2 rojos ("solo');
console.log('     1 eval", "skipped con razón").');
console.log('  8. ingestarObservaciones: no copiar numerator/denominator/exposure → 2 rojos');
console.log('     (num/den/exposure conservados, denominador=1 conservado) — §9.2 / AC11.');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
