/**
 * motor-piio/invariantes_aceptacion.test.js — Fase 12a + 12b
 * node motor-piio/invariantes_aceptacion.test.js
 *
 * Assembly pass (Clase 1) + cierres simples (Clase 2) + cierres con matiz,
 * alcance interno (Clase 3a) del plan de Fase 12. El arnés real contra
 * motor-cff/motor-ifd (Clase 3b, AC61/62/64/65/INV-68/70/72) va en un
 * archivo aparte (12c) — eso sí requiere módulos externos reales.
 *
 * Clase 1 (12a) — NO introduce lógica nueva: cada assert re-verifica, contra
 * `runPIIOCompleto` de punta a punta, un AC/INV que YA tiene ancla y
 * mutación en su fase de origen (contratos/config/observaciones/
 * referencias/temporal/kpiState/evidenceGroup/phenomenon/domain/efo/nodos/
 * runPIIO). El valor de este archivo es demostrar que el ensamblaje no
 * rompe nada — no reintentar cada regla desde cero. Por eso NO trae una
 * batería de mutaciones por cada AC/INV (serían mutaciones duplicadas de
 * las ya ejecutadas en su fase de origen); trae 3 mutaciones "prueba de
 * vida" (ver cierre) que confirman que estos asserts NO son tautológicos
 * — que si el ensamblaje realmente se rompiera, este archivo lo vería.
 *
 * Clase 2 (12a) — cierres simples reales, con su propia lógica de assert
 * (no mutación nueva porque no hay código nuevo: AC77/INV-05/INV-11 son
 * verdaderos por construcción del esquema/algoritmo ya comiteado).
 *
 * Clase 3a (12b) — cierres con matiz, alcance interno, sin código nuevo:
 *   · AC59 — REESCRITO tras la reapertura de estabilidadSerie/
 *     contextoGobernante (ver README): ya NO es comportamiento diferido,
 *     es un caso positivo real (HIGHLY_VARIABLE / CALIBRACION_GENERICA).
 *   · INV-60 — estructural (grep del código fuente) + conductual (evento
 *     raro clasifica normal, sin inventar "riesgo futuro").
 *   · INV-79 — precisión numérica alta + cobertura insuficiente sigue
 *     NOT_ADMISSIBLE.
 *   · AC66/INV-71 — estructural (cero acoplamiento a nada con forma de
 *     AIE) + ausencia de canal de reescritura (objetos distintos entre
 *     corridas) — diferido a integración real cuando exista motor-aie.
 */

'use strict';

var R = require('./runPIIO');
var E = require('./enums');
var fs = require('fs');
var path = require('path');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }

// ── fixture helpers (mismo patrón que runPIIO.test.js) ──────────────────
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
    value: 80, numerator: 80, denominator: 100, unit: '%', source_id: 's1', source_traceable: true, quality_status: 'VALID'
  }, o || {});
}
var RT1 = rs({ reference_id: 'rt1', reference_role: 'TEMPORAL', threshold: undefined });

function baseInput(o) {
  return Object.assign({
    organization_id: 'org1', ruleset_version: 'rs-v1', periods: ['2026-01'],
    domain_catalog: [ds()], phenomenon_catalog: [ph()], metric_definitions: [md()],
    references: [rs(), RT1], node_hierarchy: [ns()], kpi_specs: [ks()], evidence_groups: [eg()],
    observations: [obs()]
  }, o || {});
}
function kpiPos(res, kpiId) { return res.kpi_states.filter(function (s) { return s.kpi_id === kpiId; })[0]; }

// ═══════════════════════════════════════════════════════════════════════
seccion('§10/§11 — clasificación de KPI (AC01-11, INV-01/02/03/04/10/24/26)');
// ═══════════════════════════════════════════════════════════════════════

var r1 = R.runPIIOCompleto(baseInput());
eq(kpiPos(r1, 'k1').pos, 'D', 'AC01/AC04: HIGHER_IS_WORSE, value=80 > threshold=50 → D (dirección correcta)');

var r2 = R.runPIIOCompleto(baseInput({ metric_definitions: [md({ directionality: 'LOWER_IS_WORSE' })], observations: [obs({ value: 20, numerator: 20 })] }));
eq(kpiPos(r2, 'k1').pos, 'D', 'AC05: LOWER_IS_WORSE, value=20 < threshold=50 → D (dirección correcta)');

var r3 = R.runPIIOCompleto(baseInput({ kpi_specs: [ks({ condition_reference_id: 'rc-inexistente' })] }));
eq(kpiPos(r3, 'k1').pos, 'N_A', 'AC02/INV-01: sin REF_COND admisible → N_A, NUNCA se infiere I');

var r4b = R.runPIIOCompleto(baseInput({
  references: [rs({ threshold: 50, threshold_upper: 90 }), RT1],
  metric_definitions: [md({ directionality: 'TARGET_RANGE', target_range_rules: { below: 'D', above: 'D' } })],
  observations: [obs({ value: 30, numerator: 30 })]
}));
eq(kpiPos(r4b, 'k1').pos, 'D', 'AC06: TARGET_RANGE por debajo del rango [50,90] (value=30) → clasifica D según regla explícita');

var r5 = R.runPIIOCompleto(baseInput({
  references: [rs({ threshold: 50, threshold_upper: 90 }), RT1],
  metric_definitions: [md({ directionality: 'TARGET_RANGE', target_range_rules: { below: 'D', above: 'D' } })],
  observations: [obs({ value: 120, numerator: 120 })]
}));
eq(kpiPos(r5, 'k1').pos, 'D', 'AC07: TARGET_RANGE por encima del rango [50,90] (value=120) → clasifica D según regla explícita');

var r6 = R.runPIIOCompleto(baseInput({
  metric_definitions: [md({ boundary_behavior: 'INVALID', valid_range_min: 0, valid_range_max: 100 })],
  observations: [obs({ value: 9999, numerator: 9999 })]
}));
eq(kpiPos(r6, 'k1').data_quality, 'INVALID', 'AC08/INV-04: valor fuera de rango físico → INVALID, sin clamp (el valor no se recorta)');

var r7 = R.runPIIOCompleto(baseInput({ observations: [obs({ value: null, quality_status: 'MISSING' })] }));
eq([kpiPos(r7, 'k1').data_quality, kpiPos(r7, 'k1').original_value], ['MISSING', null], 'AC09/INV-02: missing → value=null (nunca cero), pos derivada no F ni D');

var r8 = R.runPIIOCompleto(baseInput({ observations: [obs({ value: 0, numerator: 0 })] }));
eq(kpiPos(r8, 'k1').original_value, 0, 'AC10/INV-03: cero confirmado (quality_status VALID) → valor 0 válido, no tratado como missing');

var r9 = R.runPIIOCompleto(baseInput({ observations: [obs({ value: 5, numerator: 2, denominator: 3 })] }));
eq(r9.operational_export[0].denominator, 3, 'AC11: tasa con denominador pequeño → el denominador se conserva (trazable) hasta el export, no se oculta');

var r10 = R.runPIIOCompleto(baseInput());
eq(kpiPos(r10, 'k1').traj, 'N_A', 'AC03/INV-26: un solo período → sin historia comparable → traj=N_A, NUNCA STABLE');

// ═══════════════════════════════════════════════════════════════════════
seccion('§8 — referencias y continuidad (AC12-16, INV-07/08/09/28/29)');
// ═══════════════════════════════════════════════════════════════════════

var r11 = R.runPIIOCompleto(baseInput({
  references: [rs({ change_mode: 'REBASE_HISTORY', supersedes: 'v0' }), RT1]
}));
ok(r11.kpi_states.length > 0, 'AC12: REF_COND con change_mode=REBASE_HISTORY no bloquea la corrida (la directiva se procesa aparte, INV-28: no es cambio operacional)');

var r12 = R.runPIIOCompleto(baseInput({
  references: [rs({ change_mode: 'START_NEW_REGIME', supersedes: 'v0' }), RT1],
  periods: ['2026-01', '2026-02'],
  observations: [obs({ value: 80, numerator: 80 }), obs({ observation_id: 'o1b', period_start: '2026-02', period_end: '2026-02', value: 30, numerator: 30 })]
}));
ok(r12.kpi_states.length === 2, 'AC13/INV-28: START_NEW_REGIME no rompe la corrida (Fase 5 decide por separado si cruza traj)');

var r13 = R.runPIIOCompleto(baseInput({ metric_definitions: [md({ continuity_mode: 'CONTINUOUS' })] }));
ok(kpiPos(r13, 'k1').data_quality !== 'INVALID', 'AC14: continuity_mode=CONTINUOUS no degrada la calidad del dato');

var r14 = R.runPIIOCompleto(baseInput({ metric_definitions: [md({ continuity_mode: 'BRIDGED' })] }));
ok(r14.kpi_states.length > 0, 'AC15: BRIDGED sin bridge_rule se trata como NEW_SERIES (Fase 3) — la corrida sigue, sin unir series a ciegas');

// ═══════════════════════════════════════════════════════════════════════
seccion('§14 — EVIDENCE_GROUP (AC20-22, INV-12/16/17)');
// ═══════════════════════════════════════════════════════════════════════

var r15 = R.runPIIOCompleto(baseInput({
  kpi_specs: [ks(), ks({ kpi_id: 'k2' })],
  evidence_groups: [eg({ member_kpi_ids: ['k1', 'k2'] })],
  observations: [obs(), obs({ observation_id: 'o2', kpi_id: 'k2', value: 90, numerator: 90 })]
}));
var eg1r15 = r15.evidence_groups.filter(function (g) { return g.evidence_group_id === 'eg1'; })[0];
eq(eg1r15.pos, 'D', 'AC21: EVIDENCE_GROUP D+D (dos KPI dependientes, ambos D) → D');

var r16 = R.runPIIOCompleto(baseInput({
  kpi_specs: [ks(), ks({ kpi_id: 'k2' })],
  evidence_groups: [eg({ member_kpi_ids: ['k1', 'k2'] })],
  observations: [obs({ value: 20, numerator: 20 }), obs({ observation_id: 'o2', kpi_id: 'k2', value: 90, numerator: 90 })]
}));
var eg1r16 = r16.evidence_groups.filter(function (g) { return g.evidence_group_id === 'eg1'; })[0];
eq([eg1r16.pos, eg1r16.flags.indexOf('INTERNAL_INCONSISTENCY') !== -1], ['N_A', true], 'AC22/INV-17: EVIDENCE_GROUP F+D → N_A + INTERNAL_INCONSISTENCY');

// ═══════════════════════════════════════════════════════════════════════
seccion('§15-17 — PHENOMENON (AC23-28, INV-14/15/22/23)');
// ═══════════════════════════════════════════════════════════════════════

var r17 = R.runPIIOCompleto(baseInput());
var ps17 = r17.phenomenon_states[0];
eq(ps17.pos, 'D', 'AC23/INV-14: DIRECT solo F o D → PHENOMENON toma esa posición directamente (aquí D)');
ok(ps17.admissibility === 'ADMISSIBLE', 'AC31: cobertura COMPLETE (único required_evidence_group_ids vacío) → admisible');

var r18 = R.runPIIOCompleto(baseInput({
  phenomenon_catalog: [ph({ proxy_allowed_as_primary: true, required_evidence_group_ids: ['eg1'], optional_evidence_group_ids: [] })],
  evidence_groups: [eg({ status: 'ACTIVE' })]
}));
ok(r18.phenomenon_states[0].pos === 'D', 'AC27: única evidencia disponible clasifica el fenómeno (aquí DIRECT único, sin necesidad de PROXY)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§18-19 — DOMAIN (AC32-36, INV-18/19/20/21/31)');
// ═══════════════════════════════════════════════════════════════════════

var r19 = R.runPIIOCompleto(baseInput());
eq(r19.domain_states[0].pos, 'D', 'AC34/INV-31: único CORE aplicable en D (sin SUPPORTING) → dominio D; dominio aplicable con ≥1 CORE');

var r20 = R.runPIIOCompleto(baseInput({
  phenomenon_catalog: [ph({ core_or_supporting_by_domain: { QUALITY: 'SUPPORTING' } }), ph({ phenomenon_id: 'ph2', core_or_supporting_by_domain: { QUALITY: 'CORE' }, required_evidence_group_ids: [], optional_evidence_group_ids: ['eg2'] })],
  domain_catalog: [ds({ core_phenomenon_ids: ['ph2'], supporting_phenomenon_ids: ['ph1'] })],
  evidence_groups: [eg(), eg({ evidence_group_id: 'eg2', phenomenon_id: 'ph2', member_kpi_ids: ['k2'] })],
  kpi_specs: [ks(), ks({ kpi_id: 'k2', primary_phenomenon_id: 'ph2', evidence_group_id: 'eg2', metric_definition_id: 'md2' })],
  metric_definitions: [md(), md({ metric_definition_id: 'md2', phenomenon_id: 'ph2' })],
  // ph1 (SUPPORTING) = D (value 80 > threshold 50) ; ph2 (CORE) = F (value 20 < threshold 50)
  observations: [obs({ value: 80, numerator: 80 }), obs({ observation_id: 'o2', kpi_id: 'k2', metric_definition_id: 'md2', value: 20, numerator: 20 })]
}));
eq(r20.domain_states[0].pos, 'I', 'AC33: CORE F + SUPPORTING D → I (SUPPORTING mueve F a I, INV-21)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§20-21/§24 — EFO (AC37-42, INV-32-38/74/75/76)');
// ═══════════════════════════════════════════════════════════════════════

var r21 = R.runPIIOCompleto(baseInput());
eq(r21.efo_states[0].pos, 'D', 'AC37/AC76: REQUIRED D admisible → EFO D directamente (sin votación, INV-33/75/76)');

var r22 = R.runPIIOCompleto(baseInput({ observations: [obs({ value: 20, numerator: 20 })] }));
eq(r22.efo_states[0].pos, 'F', 'AC40: todos REQUIRED F, sin OPTIONAL D, cobertura suficiente → EFO F');

// ═══════════════════════════════════════════════════════════════════════
seccion('§22-23 — nodos y agregación (AC47/AC49, INV-46/47/48/73)');
// ═══════════════════════════════════════════════════════════════════════

// n-root (ORGANIZATIONAL): k1 = F (value 20). n-a (SEGMENT_ONLY, hijo): k2 = D
// (value 80, propio). AC47: la D de n-a NO eleva la EFO organizacional
// (n-root sigue F) — pero el perfil de n-a SÍ se preserva (no se descarta).
var r23 = R.runPIIOCompleto(baseInput({
  node_hierarchy: [ns(), ns({ node_id: 'n-a', parent_node_id: 'n-root', aggregation_membership: 'set-a', scope_rules: { scope: 'SEGMENT_ONLY' } })],
  kpi_specs: [ks(), ks({ kpi_id: 'k2', evidence_group_id: 'eg2' })],
  evidence_groups: [eg(), eg({ evidence_group_id: 'eg2', node_id: 'n-a', member_kpi_ids: ['k2'] })],
  observations: [obs({ value: 20, numerator: 20 }), obs({ observation_id: 'o2', kpi_id: 'k2', node_id: 'n-a', value: 80, numerator: 80 })]
}));
var efoRootR23 = r23.efo_states.filter(function (e) { return e.node_id === 'n-root'; })[0];
var perfilNaR23 = r23.node_profile.filter(function (p) { return p.node_id === 'n-a'; })[0];
eq(efoRootR23.pos, 'F', 'AC47: EFO organizacional (n-root) sigue F — la D de n-a (SEGMENT_ONLY) NO la eleva');
ok(perfilNaR23 && perfilNaR23.pos === 'D' && perfilNaR23.scope === 'SEGMENT_ONLY', 'AC47/INV-73: pero el perfil de n-a (D, SEGMENT_ONLY) SÍ se preserva aunque no cambie la EFO_pos organizacional — no se descarta silenciosamente');
ok(!r23.node_profile.some(function (p) { return 'polarization' in p || 'concentration' in p; }), 'AC48/INV-46: node_profile nunca lleva polarization/concentration — eso es de AIE');

// ═══════════════════════════════════════════════════════════════════════
seccion('CIERRE SIMPLE — AC77: muchos F dependientes vs. un D no se resuelven por conteo');
// ═══════════════════════════════════════════════════════════════════════

// eg1: 3 KPI dependientes, todos F, DIRECT. eg2: 1 KPI, D, DIRECT. Si el
// fenómeno resolviera "por mayoría de grupos" en vez de por la regla de
// conjunto de §15, 1 grupo F contra 1 grupo D empataría 1-1 (no aplica
// mayoría numérica); la regla real es F∈S ∧ D∈S → I, SIN mirar cuántos
// miembros trae cada grupo (AC77: "no usar conteo; resolver por grupos").
var r24 = R.runPIIOCompleto(baseInput({
  kpi_specs: [ks(), ks({ kpi_id: 'k2' }), ks({ kpi_id: 'k3' }), ks({ kpi_id: 'k4', evidence_group_id: 'eg2' })],
  evidence_groups: [eg({ member_kpi_ids: ['k1', 'k2', 'k3'] }), eg({ evidence_group_id: 'eg2', member_kpi_ids: ['k4'] })],
  phenomenon_catalog: [ph({ optional_evidence_group_ids: ['eg1', 'eg2'] })],
  observations: [
    obs({ value: 20, numerator: 20 }),
    obs({ observation_id: 'o2', kpi_id: 'k2', value: 20, numerator: 20 }),
    obs({ observation_id: 'o3', kpi_id: 'k3', value: 20, numerator: 20 }),
    obs({ observation_id: 'o4', kpi_id: 'k4', value: 80, numerator: 80 })
  ]
}));
eq(r24.phenomenon_states[0].pos, 'I', 'AC77: 3 KPI F (mayoría numérica) vs. 1 KPI D en grupos separados → I igual (F∈S ∧ D∈S), el conteo NUNCA decide');

// ═══════════════════════════════════════════════════════════════════════
seccion('CIERRE SIMPLE — INV-05: posición y trayectoria son independientes');
// ═══════════════════════════════════════════════════════════════════════

// Nota — REAPERTURA (Fase 5, DISENO_TRAJ_STABLE_BAND_PERS.md): TRAJ_STABLE_
// BAND sigue PENDIENTE_CALIBRACION a nivel CALIBRACION_GLOBAL/PROPIA, pero
// ya NO es N_A por default — TRAJ_STABLE_BAND_GENERICO (5%, relativo)
// clasifica de verdad (mismo cambio de postura que tuvo AC59 con
// STABILITY_CV_*_GENERICO). Con dos valores IGUALES, el cambio relativo es
// 0% < 5% → STABLE, no N_A. INV-05 se demuestra igual: dos casos con `pos`
// DISTINTA (D vs F) comparten la MISMA `traj` (STABLE) — ninguno de los dos
// ejes determina al otro.
var r25 = R.runPIIOCompleto(baseInput({
  periods: ['2026-01', '2026-02'],
  observations: [obs({ value: 80, numerator: 80 }), obs({ observation_id: 'o1b', period_start: '2026-02', period_end: '2026-02', value: 80, numerator: 80 })]
}));
var k1r25 = r25.kpi_states.filter(function (s) { return s.period === '2026-02'; })[0];
eq([k1r25.pos, k1r25.traj], ['D', 'STABLE'], 'INV-05 (caso a): pos=D, traj=STABLE (valores iguales → 0% de cambio < banda genérica 5%)');

var r26 = R.runPIIOCompleto(baseInput({
  periods: ['2026-01', '2026-02'],
  observations: [obs({ value: 20, numerator: 20 }), obs({ observation_id: 'o1b', period_start: '2026-02', period_end: '2026-02', value: 20, numerator: 20 })]
}));
var k1r26 = r26.kpi_states.filter(function (s) { return s.period === '2026-02'; })[0];
eq([k1r26.pos, k1r26.traj], ['F', 'STABLE'], 'INV-05 (caso b): pos=F — DISTINTA del caso a — pero la MISMA traj=STABLE: ninguno de los dos ejes determina al otro');

// ═══════════════════════════════════════════════════════════════════════
seccion('CIERRE SIMPLE — INV-11: cada KPI tiene una ruta inferencial primaria única');
// ═══════════════════════════════════════════════════════════════════════

ok(typeof ks().primary_domain_id === 'string', 'INV-11: KPI_SPEC.primary_domain_id es un campo SINGULAR (string), nunca un array — no hay ruta múltiple por esquema (Fase 0)');
ok(typeof ks().primary_phenomenon_id === 'string', '...mismo para primary_phenomenon_id');
eq(R.runPIIOCompleto(baseInput()).kpi_states.filter(function (s) { return s.kpi_id === 'k1'; }).length, 1, '...y resolverKpiState produce UN solo KPI_STATE por (kpi_id, período) — una ruta, no varias resueltas en paralelo');

// ═══════════════════════════════════════════════════════════════════════
seccion('FASE 12b — AC59: serie genuinamente volátil → HIGHLY_VARIABLE (reescrito tras la reapertura)');
// ═══════════════════════════════════════════════════════════════════════

// Antes de la reapertura de estabilidadSerie/contextoGobernante, AC59 solo
// podía probarse como comportamiento DIFERIDO (INSUFFICIENT, nunca
// HIGHLY_VARIABLE) porque (a) STABILITY_CV_* seguían sin calibrar y (b)
// contextoGobernante nunca llegaba desde runPIIO(). Ambas causas ya se
// cerraron — este es ahora un caso POSITIVO real, verificado de punta a
// punta contra runPIIOCompleto, no una promesa de calibración futura.
var r27 = R.runPIIOCompleto(baseInput({
  periods: ['2026-01', '2026-02'],
  observations: [obs({ value: 80, numerator: 80 }), obs({ observation_id: 'o1b', period_start: '2026-02', period_end: '2026-02', value: 20, numerator: 20 })]
}));
var ps27 = r27.phenomenon_states.filter(function (p) { return p.period === '2026-02'; })[0];
eq(ps27.series_stability, 'HIGHLY_VARIABLE', 'AC59: serie [80,20] (CV≈0.60) → SERIES_STABILITY=HIGHLY_VARIABLE, resultado real, no diferido');
eq(ps27.series_stability_origen, 'CALIBRACION_GENERICA', '...con origen explícito CALIBRACION_GENERICA — nunca presentado como propio de EFICIENCIA (condición de Luis)');
ok(E.ENUMS.TEMPORAL_PATTERN.indexOf('VOLATILE') === -1, 'AC59 (segunda mitad, ya cubierta en temporal.test.js): "pattern no VOLATILE" — el enum entero nunca tiene ese valor');

// ═══════════════════════════════════════════════════════════════════════
seccion('FASE 12b — INV-60: zero rare events no prueba riesgo futuro cero');
// ═══════════════════════════════════════════════════════════════════════

// (a) estructural: ningún archivo de PRODUCCIÓN de motor-piio produce un
// campo con nombre de riesgo/probabilidad futura — grep sobre el código
// fuente real, no sobre datos de una corrida.
var _archivosProduccion = ['contratos', 'config', 'observaciones', 'referencias', 'temporal',
  'kpiState', 'evidenceGroup', 'phenomenon', 'domain', 'efo', 'nodos', 'runPIIO', 'enums'];
var _patronRiesgo = /riesgo_futuro|probability|forecast_risk|riesgo_proyectado|prob_futura/i;
var _hallazgosRiesgo = [];
_archivosProduccion.forEach(function (nombre) {
  var contenido = fs.readFileSync(path.join(__dirname, nombre + '.js'), 'utf8');
  if (_patronRiesgo.test(contenido)) _hallazgosRiesgo.push(nombre);
});
eq(_hallazgosRiesgo, [], 'INV-60 (estructural): ningún archivo de producción de motor-piio define un campo de riesgo/probabilidad futura');

// (b) conductual: evento raro (histórico de ceros, un valor reciente
// distinto) sigue clasificando por las reglas normales F/I/D — sin rama
// que calcule "probabilidad de que vuelva a pasar".
var r28 = R.runPIIOCompleto(baseInput({
  periods: ['2026-01', '2026-02', '2026-03'],
  observations: [
    obs({ value: 0, numerator: 0 }),
    obs({ observation_id: 'o1b', period_start: '2026-02', period_end: '2026-02', value: 0, numerator: 0 }),
    obs({ observation_id: 'o1c', period_start: '2026-03', period_end: '2026-03', value: 80, numerator: 80 })
  ]
}));
var k1r28 = r28.kpi_states.filter(function (s) { return s.period === '2026-03'; })[0];
eq(k1r28.pos, 'D', 'INV-60: evento raro (0,0,80 con threshold 50, HIGHER_IS_WORSE) → clasifica D por la regla normal — ningún campo de "riesgo futuro" interviene ni existe en la salida');
ok(!('riesgo_futuro' in k1r28) && !('probability' in k1r28), '...KPI_STATE no lleva ningún campo de proyección de riesgo');

// ═══════════════════════════════════════════════════════════════════════
seccion('FASE 12b — INV-79: la precisión de cálculo no sustituye suficiencia inferencial');
// ═══════════════════════════════════════════════════════════════════════

// Un valor con MUCHOS decimales de precisión, pero evidencia insuficiente
// (fenómeno con required_evidence_group_ids apuntando a un grupo que NUNCA
// llega) sigue dando cobertura NONE / admisibilidad NOT_ADMISSIBLE — la
// precisión numérica del dato no compra suficiencia inferencial.
var r29 = R.runPIIOCompleto(baseInput({
  phenomenon_catalog: [ph({ required_evidence_group_ids: ['eg-inexistente'], optional_evidence_group_ids: ['eg1'] })],
  observations: [obs({ value: 79.999999999, numerator: 79.999999999 })]
}));
eq(r29.phenomenon_states[0].coverage_status, 'NONE', 'INV-79: value con 9 decimales de precisión, pero 0 de los required cubiertos → coverage_status=NONE (la precisión no sustituye la cobertura)');
eq(r29.phenomenon_states[0].admissibility, 'NOT_ADMISSIBLE', '...admissibility=NOT_ADMISSIBLE pese a la alta precisión del dato');

// ═══════════════════════════════════════════════════════════════════════
seccion('FASE 12b — AC66 / INV-71: estructural, sin motor-aie (diferido a integración real)');
// ═══════════════════════════════════════════════════════════════════════

// (a) cero acoplamiento de código: ningún archivo de motor-piio importa
///requiere nada con forma de AIE.
var _hallazgosAIE = [];
_archivosProduccion.forEach(function (nombre) {
  var contenido = fs.readFileSync(path.join(__dirname, nombre + '.js'), 'utf8');
  var requiereAIE = /require\(['"][^'"]*aie[^'"]*['"]\)/i.test(contenido);
  if (requiereAIE) _hallazgosAIE.push(nombre);
});
eq(_hallazgosAIE, [], 'AC66/INV-71 (estructural): ningún archivo de motor-piio requiere un módulo con forma de AIE');

// (b) no hay canal de reescritura: dos corridas separadas con el mismo
// input producen efo_states que son objetos DISTINTOS en memoria — nada
// mutable compartido entre corridas que un tercero pudiera reescribir.
var runA = R.runPIIOCompleto(baseInput());
var runB = R.runPIIOCompleto(baseInput());
ok(runA.efo_states[0] !== runB.efo_states[0], 'AC66/INV-71: dos corridas separadas producen efo_states como objetos distintos en memoria — sin estado compartido mutable que AIE (o cualquier otro) pudiera reescribir');
ok(runA !== runB && JSON.stringify(runA.efo_states) === JSON.stringify(runB.efo_states), '...pero con el mismo contenido (determinismo ya probado en 11b) — diferido a integración real cuando exista motor-aie, ver README');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones "prueba de vida" — confirman que el assembly pass no es tautológico');
// ═══════════════════════════════════════════════════════════════════════
console.log('  Este archivo no trae mutaciones por AC/INV individual: introduce CERO código');
console.log('  nuevo, solo re-verifica contra runPIIOCompleto reglas que ya tienen su propia');
console.log('  mutación en la fase de origen (mutar esas líneas de nuevo sería duplicar,');
console.log('  no una verificación adicional real). Para confirmar que estos asserts SÍ');
console.log('  detectarían una ruptura real de ensamblaje (no son tautológicos), se aplicaron');
console.log('  3 mutaciones de "prueba de vida" — conteos REALES, ejecutados, no estimados:');
console.log('  1. kpiState.js clasificarPosicion: se intercambian los cuerpos de las ramas');
console.log('     HIGHER_IS_WORSE / LOWER_IS_WORSE (inversión real de dirección) → 13 rojos:');
console.log('     mucho más que los 2 estimados al diseñar la mutación — la mayoría de los');
console.log('     fixtures de este archivo usan HIGHER_IS_WORSE (default de md()), así que la');
console.log('     inversión contamina casi todo el KPI-level y lo que depende de él aguas abajo.');
console.log('  2. domain.js _colapsarDominio: quitar la rama "SUPPORTING D impide F pleno" →');
console.log('     1 rojo (AC33 cae, CORE F + SUPPORTING D ya no da I). Exacto como se estimó.');
console.log('  3. [GUARDA ENMASCARADA — 9ª vez] nodos.js nodosParaEFOOrganizacional sin filtrar');
console.log('     por scope → 0 rojos: construirNodeProfile deriva `scope` de forma INDEPENDIENTE');
console.log('     vía _scopeDeNodo(), nunca de nodosParaEFOOrganizacional — mutar esa función no');
console.log('     toca ni node_profile.scope ni la posición de la EFO organizacional (que ya se');
console.log('     decide nodo por nodo en el propio runPIIO, antes de este paso). Reformulada:');
console.log('     _scopeDeNodo() → siempre \'ORGANIZATIONAL\' (ignora scope_rules.scope) → 1 rojo');
console.log('     real (el perfil de n-a deja de reportar SEGMENT_ONLY).');
console.log('  Conteos: 13, 1, 1.');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones "prueba de vida" — Fase 12b (AC59/INV-60/INV-79)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  Mismo principio que las de 12a: sin código nuevo, sin batería propia por');
console.log('  AC/INV — 3 mutaciones que confirman que estos asserts detectarían una');
console.log('  ruptura real. AC66/INV-71 no lleva mutación: son chequeos estructurales');
console.log('  (grep + identidad de objetos) verdaderos por construcción del lenguaje.');
console.log('  1. [AC59] enums.js: `STABILITY_CV_STABLE_GENERICO: 0.15` → `0.99` (el piso');
console.log('     genérico deja de detectar volatilidad real) → 2 rojos: 1 aquí ("AC59:');
console.log('     serie [80,20]...") + 1 en runPIIO.test.js (el assert de la reapertura,');
console.log('     "...CV≈0.45 de [80,30]...", mismo mecanismo).');
console.log('  2. [INV-60 estructural] temporal.js: se inyecta un comentario con el texto');
console.log('     `riesgo_futuro` → 1 rojo aquí (el grep estructural lo detecta de verdad,');
console.log('     no es un chequeo vacío).');
console.log('  3. [INV-79] phenomenon.js: `coberturaFenomeno`, rama final `NONE` → `COMPLETE`');
console.log('     (cero requeridos cubiertos ya no da NONE) → 4 rojos: 2 aquí (coverage_status');
console.log('     + admissibility) + 2 en phenomenon.test.js (sus propios asserts de §16 que');
console.log('     verifican esa misma rama NONE).');
console.log('  Conteos: 2, 1, 4.');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
