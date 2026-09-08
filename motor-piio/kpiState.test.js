/**
 * motor-piio/kpiState.test.js — Fase 5
 * node motor-piio/kpiState.test.js
 *
 * §10 / §11. Primer STATE de la cascada. Oráculo conductual: AC01
 * (clasificación correcta), AC02 (sin REF_COND → N_A), AC03 (sin historia
 * → traj N_A), AC04/05 (dirección), AC06/07 (TARGET_RANGE), AC18 (STALE
 * → no admisible). INV-01/02/05/06/24/25/26.
 * También verifica el CONTRATO DE INTERFAZ con Fases 2/3/4.
 */

'use strict';

var K = require('./kpiState');
var mod = require('./enums');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }
function tieneFlag(o, f) { return (o && o.flags || []).some(function (x) { return x === f || x.indexOf(f + ':') === 0; }); }

// fixtures alineados con las salidas reales de Fases 2/3/4
function refCond(over) {
  return Object.assign({
    reference_id: 'rc1', reference_role: 'CONDITION', reference_type: 'NORMATIVE', source: 'ISO',
    valid_from: '2026-01', rule: 'r', comparability_assessment: 'a', traceability: 't', version: 'vC1',
    admissibility_declared: 'ADMISSIBLE', threshold: 50, band: 0
  }, over || {});
}
function refTemp(over) {
  return Object.assign({
    reference_id: 'rt1', reference_role: 'TEMPORAL', reference_type: 'HISTORICAL', source: 'interno',
    valid_from: '2026-01', rule: 'mes anterior', comparability_assessment: 'a', traceability: 't', version: 'vT1',
    admissibility_declared: 'ADMISSIBLE', threshold: 0
  }, over || {});
}
function md(over) {
  return Object.assign({ metric_definition_id: 'md1', definition_version: 'vMD7', directionality: 'HIGHER_IS_WORSE' }, over || {});
}
function kpiSpec(over) {
  return Object.assign({
    kpi_id: 'k1', condition_reference_id: 'rc1', temporal_reference_id: 'rt1',
    freshness_spec: { max_age_current: 2, max_age_aging: 5 }
  }, over || {});
}
// OBSERVATION_EVAL — la forma EXACTA que produce ingestarObservaciones (Fase 2)
function ev(over) {
  return Object.assign({
    observation_id: 'o1', kpi_id: 'k1', node_id: 'n1', period_start: '2026-03', period_end: '2026-03',
    original_value: 42, value: 42, data_quality: 'VALID', ausencia_kind: 'VALOR_PRESENTE',
    source_id: 's1', source_traceable: true, flags: []
  }, over || {});
}
function serie(vals, over) {
  return vals.map(function (v, i) {
    var mm = ('0' + (i + 1)).slice(-2);
    return ev(Object.assign({ observation_id: 'o' + i, period_start: '2026-' + mm, period_end: '2026-' + mm, value: v, original_value: v }, over || {}));
  });
}
function run(args) {
  return K.resolverKpiState(Object.assign({
    kpiSpec: kpiSpec(), metricDef: md(), referencias: [refCond(), refTemp()], directivas: {}, as_of: '2026-04'
  }, args));
}

// ═══════════════════════════════════════════════════════════════════════
seccion('§11 — POSICIÓN (AC01/04/05/06/07)');
// ═══════════════════════════════════════════════════════════════════════

eq(K.clasificarPosicion(70, refCond({ threshold: 50 }), 'HIGHER_IS_WORSE').pos, 'D', 'HIGHER_IS_WORSE, value 70 > threshold 50 → D (AC04)');
eq(K.clasificarPosicion(30, refCond({ threshold: 50 }), 'HIGHER_IS_WORSE').pos, 'F', 'value 30 < 50 → F');
eq(K.clasificarPosicion(50, refCond({ threshold: 50, band: 0 }), 'HIGHER_IS_WORSE').pos, 'I', 'value exactamente en el umbral → I (no resolutivo)');
eq(K.clasificarPosicion(51, refCond({ threshold: 50, band: 3 }), 'HIGHER_IS_WORSE').pos, 'I', 'value 51 dentro de band 3 → I');
eq(K.clasificarPosicion(30, refCond({ threshold: 50 }), 'LOWER_IS_WORSE').pos, 'D', 'LOWER_IS_WORSE, value 30 < 50 → D (AC05)');
eq(K.clasificarPosicion(70, refCond({ threshold: 50 }), 'LOWER_IS_WORSE').pos, 'F', 'LOWER_IS_WORSE, value 70 > 50 → F');
// TARGET_RANGE
eq(K.clasificarPosicion(60, refCond({ threshold: 40, threshold_upper: 80 }), 'TARGET_RANGE').pos, 'F', 'TARGET_RANGE, value 60 en [40,80] → F');
var below = K.clasificarPosicion(30, refCond({ threshold: 40, threshold_upper: 80 }), 'TARGET_RANGE');
eq(below.pos, 'D', 'TARGET_RANGE, value 30 < 40 → D (AC06)');
ok(tieneFlag(below, 'TARGET_RANGE_BELOW'), '...flag TARGET_RANGE_BELOW');
ok(tieneFlag(K.clasificarPosicion(90, refCond({ threshold: 40, threshold_upper: 80 }), 'TARGET_RANGE'), 'TARGET_RANGE_ABOVE'), 'value 90 > 80 → flag TARGET_RANGE_ABOVE (AC07)');
eq(K.clasificarPosicion(60, refCond({ threshold: 40 }), 'TARGET_RANGE').pos, 'N_A', 'TARGET_RANGE sin threshold_upper → N_A + flag');

// AC02 — sin REF_COND admisible
eq(K.clasificarPosicion(70, null, 'HIGHER_IS_WORSE'), { pos: 'N_A', flags: ['SIN_REF_COND_ADMISIBLE'] }, 'refCond null → pos=N_A, NO inferir I (AC02)');
eq(K.clasificarPosicion('x', refCond(), 'HIGHER_IS_WORSE').pos, 'N_A', 'value no numérico → N_A');

// ═══════════════════════════════════════════════════════════════════════
seccion('§11.2 — TRAYECTORIA (AC03, INV-26/28/29; AI sin calibrar → N_A)');
// ═══════════════════════════════════════════════════════════════════════

var rt = { ref: refTemp(), admissibility: 'ADMISSIBLE', flags: [] };
eq(K.resolverTrayectoria([5], rt, {}, 'HIGHER_IS_WORSE', refCond()).traj, 'N_A', 'serie de 1 punto → traj=N_A (AC03 / INV-26)');
ok(tieneFlag(K.resolverTrayectoria([5], rt, {}, 'HIGHER_IS_WORSE', refCond()), 'HISTORIA_INSUFICIENTE'), '...flag HISTORIA_INSUFICIENTE');
// AI — TRAJ_STABLE_BAND null → N_A (nunca STABLE)
var sinBanda = K.resolverTrayectoria([10, 13], rt, {}, 'HIGHER_IS_WORSE', refCond());
eq(sinBanda.traj, 'N_A', 'TRAJ_STABLE_BAND null → traj=N_A (NO STABLE — INV-26, ambig. AI)');
ok(tieneFlag(sinBanda, 'TRAJ_BAND_NO_CALIBRADO'), '...flag TRAJ_BAND_NO_CALIBRADO');
// REF_TEMP no admisible — se verifica por el FLAG, no solo por traj (con
// TRAJ_STABLE_BAND null TODO da N_A; el flag distingue la causa)
var noRT = K.resolverTrayectoria([10, 13], { ref: null, admissibility: 'NOT_ADMISSIBLE', flags: [] }, {}, 'HIGHER_IS_WORSE', refCond());
eq(noRT.traj, 'N_A', 'REF_TEMP no admisible → traj=N_A');
ok(tieneFlag(noRT, 'REF_TEMP_NO_ADMISIBLE'), '...por REF_TEMP_NO_ADMISIBLE (no por TRAJ_BAND_NO_CALIBRADO)');
// NEW_REGIME (INV-28 / AC13)
var nr = K.resolverTrayectoria([10, 13], rt, { cambioReferencia: { tipo: 'START_NEW_REGIME' } }, 'HIGHER_IS_WORSE', refCond());
eq(nr.traj, 'N_A', 'NEW_REGIME → traj=N_A (INV-28)');
ok(tieneFlag(nr, 'NEW_REGIME') && !tieneFlag(nr, 'TRAJ_BAND_NO_CALIBRADO'), '...por NEW_REGIME — la rama se evalúa ANTES del chequeo de banda (INV-28)');
// SERIE_NO_UNE (INV-29 / AC16)
var snu = K.resolverTrayectoria([10, 13], rt, { continuidad: { puede_unir_serie: false } }, 'HIGHER_IS_WORSE', refCond());
eq(snu.traj, 'N_A', 'serie no une → traj=N_A (INV-29)');
ok(tieneFlag(snu, 'SERIE_NO_UNE'), '...por SERIE_NO_UNE (INV-29)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§11.3 / §28 — PERSISTENCIA');
// ═══════════════════════════════════════════════════════════════════════

eq(K.clasificarPersistencia('F', ['F'], ['2026-01'], {}), { pers: 'N_A', det_run: 0, det_duration: 0, flags: [] }, 'pos actual ≠ D → pers=N_A (§28 literal)');
var p1 = K.clasificarPersistencia('D', ['D'], ['2026-01'], {});
eq(p1.pers, 'POINT', 'det_run 1 → POINT');
eq([p1.det_run, p1.det_duration], [1, 0], 'det_run=1, det_duration=0');
var p3 = K.clasificarPersistencia('D', ['D', 'D', 'D'], ['2026-01', '2026-02', '2026-03'], {});
eq(p3.pers, 'REPEATED', 'det_run 3, PERS_* null → REPEATED (no se puede distinguir de PERSISTENT, ambig. AJ)');
ok(tieneFlag(p3, 'PERS_UMBRAL_NO_CALIBRADO'), '...flag PERS_UMBRAL_NO_CALIBRADO');
eq([p3.det_run, p3.det_duration], [3, 2], 'det_run=3, det_duration=2 (span calendario, ambig. H)');
// N_A transparente (INV-25)
var pNA = K.clasificarPersistencia('D', ['D', 'N_A', 'D'], ['2026-01', '2026-02', '2026-03'], {});
eq(pNA.det_run, 2, 'D,N_A,D → det_run=2 (N_A transparente, INV-25)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§10 / INV-78 — ADMISIBILIDAD');
// ═══════════════════════════════════════════════════════════════════════

var rcOK = { ref: refCond(), admissibility: 'ADMISSIBLE', flags: [] };
eq(K.resolverAdmisibilidad('VALID', rcOK, 'CURRENT'), 'ADMISSIBLE', 'todo bien → ADMISSIBLE');
eq(K.resolverAdmisibilidad('MISSING', rcOK, 'CURRENT'), 'NOT_ADMISSIBLE', 'data MISSING → NOT_ADMISSIBLE (INV-01)');
eq(K.resolverAdmisibilidad('VALID', rcOK, 'STALE'), 'NOT_ADMISSIBLE', 'freshness STALE → NOT_ADMISSIBLE (AC18)');
eq(K.resolverAdmisibilidad('VALID', { ref: null, admissibility: 'NOT_ADMISSIBLE', flags: [] }, 'CURRENT'), 'NOT_ADMISSIBLE', 'REF_COND no admisible → NOT_ADMISSIBLE');
eq(K.resolverAdmisibilidad('VALID_WITH_LIMITATIONS', rcOK, 'CURRENT'), 'ADMISSIBLE_WITH_LIMITATIONS', 'data VWL → WITH_LIMITATIONS');
eq(K.resolverAdmisibilidad('VALID', rcOK, 'AGING'), 'ADMISSIBLE_WITH_LIMITATIONS', 'freshness AGING → WITH_LIMITATIONS');

// ═══════════════════════════════════════════════════════════════════════
seccion('resolverKpiState — encadenado + CONTRATO DE INTERFAZ');
// ═══════════════════════════════════════════════════════════════════════

var r = run({ evals: serie([30, 70, 55]) });
eq(r.estados.length, 3, 'una serie de 3 obs → 3 KPI_STATE');
eq(r.estados.map(function (s) { return s.pos; }), ['F', 'D', 'D'], 'pos por período: 30→F, 70→D, 55→D (threshold 50, HIGHER_IS_WORSE)');
// interfaz: original_value (Fase 2), metric_definition_version (RENOMBRE de definition_version)
eq(r.estados[0].original_value, 30, 'original_value viene de OBSERVATION_EVAL.original_value (Fase 2)');
eq(r.estados[0].metric_definition_version, 'vMD7', 'metric_definition_version ← metricDef.definition_version (RENOMBRE de esquema §7→§10, no inventado)');
eq(r.estados[0].condition_reference_version, 'vC1', 'condition_reference_version ← refCond.version (Fase 3)');
eq(r.estados[0].temporal_reference_version, 'vT1', 'temporal_reference_version ← refTemp.version');
eq(r.estados[0].data_quality, 'VALID', 'data_quality ← OBSERVATION_EVAL.data_quality (Fase 2)');
// forma del KPI_STATE (§10)
eq(Object.keys(r.estados[0]).sort(), ['admissibility', 'condition_reference_version', 'data_quality', 'det_duration', 'det_run', 'flags', 'freshness', 'kpi_id', 'kpi_state_id', 'metric_definition_version', 'node_id', 'original_value', 'period', 'pers', 'pos', 'temporal_reference_version', 'traj'].sort(), 'KPI_STATE tiene exactamente los campos de §10');

// P — KPI degradado en Fase 1 → pos=N_A
var deg = run({ evals: serie([30, 70]), reporteFase1: { kpis_degradados: ['k1'], estados_bloqueados: [] } });
eq(deg.estados.map(function (s) { return s.pos; }), ['N_A', 'N_A'], 'KPI en kpis_degradados → pos=N_A en todos los períodos (ambig. P)');
eq(deg.estados[0].admissibility, 'NOT_ADMISSIBLE', '...admissibility=NOT_ADMISSIBLE');
ok(tieneFlag(deg.estados[0], 'KPI_DEGRADADO_FASE1'), '...flag KPI_DEGRADADO_FASE1');
// AC73 — KPI bloqueado
var blk = run({ evals: serie([30]), reporteFase1: { kpis_degradados: [], estados_bloqueados: ['k1'] } });
eq([blk.bloqueado, blk.estados.length], [true, 0], 'KPI en estados_bloqueados → bloqueado:true, sin estados (AC73)');

// dato no válido → pos=N_A, traj=N_A (INV-01/02)
var conMissing = run({ evals: [ev({ period_start: '2026-01', value: 30 }), ev({ period_start: '2026-02', value: null, data_quality: 'MISSING', original_value: null })] });
eq(conMissing.estados[1].pos, 'N_A', 'período con data_quality=MISSING → pos=N_A (INV-02)');
eq(conMissing.estados[1].traj, 'N_A', '...traj=N_A');
eq(conMissing.estados[1].admissibility, 'NOT_ADMISSIBLE', '...admissibility=NOT_ADMISSIBLE');
eq(conMissing.estados[1].original_value, null, '...original_value=null preservado (INV-10)');

// freshness — ancla period_end (ambig. AM)
var fr = run({ evals: [ev({ period_start: '2026-01', period_end: '2026-01', value: 30 })], as_of: '2026-08' });
eq(fr.estados[0].freshness, 'STALE', 'obs de 2026-01, as_of 2026-08 (edad 7) > aging 5 → STALE (ancla = period_end, ambig. AM)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. clasificarPosicion HIGHER_IS_WORSE: `> t + band` → `> t` (sin band) → 1 rojo');
console.log('     ("value 51 dentro de band 3 → I").');
console.log('  2. clasificarPosicion: sin refCond → `{ pos:F }` → 1 rojo ("refCond null → N_A", AC02).');
console.log('  3. resolverTrayectoria: `!esNum(band)` → `STABLE` en vez de `N_A` → 2 rojos');
console.log('     (traj N_A + flag TRAJ_BAND_NO_CALIBRADO) — AI / INV-26, nunca STABLE sin info.');
console.log('  4. resolverTrayectoria: quitar la rama NEW_REGIME → 1 rojo ("...por NEW_REGIME";');
console.log('     con band null todo da N_A, el FLAG distingue la causa — INV-28).');
console.log('  5. resolverTrayectoria: SERIE_NO_UNE → devolver STABLE → 2 rojos (traj + flag) — INV-29.');
console.log('  5b. quitar la rama !historiaSuficiente → 1 rojo ("1 punto → HISTORIA_INSUFICIENTE", AC03).');
console.log('  6. clasificarPersistencia: quitar `pos !== D` → 1 rojo ("pos≠D → pers=N_A", §28).');
console.log('  7. clasificarPersistencia: sin calibrar det_run>=2 → PERSISTENT → 1 rojo ("→ REPEATED", AJ).');
console.log('  8. resolverAdmisibilidad: quitar `STALE` → 1 rojo ("STALE → NOT_ADMISSIBLE", AC18).');
console.log('  9. resolverKpiState: `mdVer = metricDef.definition_version` → `.version` → 1 rojo');
console.log('     (CONTRATO DE INTERFAZ: §7 dice definition_version, §10 metric_definition_version).');
console.log('  10. resolverKpiState: `if (degradado)` de pos → `if (false)` → 1 rojo ("degradado →');
console.log('      pos=N_A", ambig. P). (Los otros asserts de P los cubren admissibility/flag/traj.)');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
