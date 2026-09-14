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
seccion('§11.2 — TRAYECTORIA (AC03, INV-26/28/29; AI — REAPERTURA Fase 5, banda RELATIVA de 3 niveles)');
// ═══════════════════════════════════════════════════════════════════════

var rt = { ref: refTemp(), admissibility: 'ADMISSIBLE', flags: [] };
eq(K.resolverTrayectoria([5], rt, {}, 'HIGHER_IS_WORSE', refCond()).traj, 'N_A', 'serie de 1 punto → traj=N_A (AC03 / INV-26)');
ok(tieneFlag(K.resolverTrayectoria([5], rt, {}, 'HIGHER_IS_WORSE', refCond()), 'HISTORIA_INSUFICIENTE'), '...flag HISTORIA_INSUFICIENTE');

eq(mod.PARAMS.TRAJ_STABLE_BAND_GENERICO, 0.05, 'TRAJ_STABLE_BAND_GENERICO formalizado (enums.js) — 5%, informado por sensibilidad sintética, no cita externa');
eq([mod.PARAMS.PERS_REPEATED_MIN_GENERICO, mod.PARAMS.PERS_PERSISTENT_MIN_GENERICO], [2, 8], 'PERS_*_GENERICO formalizados — 2 (mínimo no-trivial) y 8 (Western Electric/Nelson)');

// AI — REAPERTURA: banda relativa (% de cambio respecto al valor anterior),
// 3 niveles de precedencia — CALIBRACION_PROPIA > _GLOBAL > _GENERICA
// (DISENO_TRAJ_STABLE_BAND_PERS.md §6). Ya NUNCA "no calibrado": el
// genérico (0.05 = 5%) siempre clasifica de verdad.
var establePequeno = K.resolverTrayectoria([100, 102], rt, {}, 'HIGHER_IS_WORSE', refCond()); // rel=2/100=2% < 5%
eq(establePequeno.traj, 'STABLE', '100→102 (+2%) < banda genérica 5% → STABLE');
eq(establePequeno.flags, ['CALIBRACION_GENERICA'], '...flags=[CALIBRACION_GENERICA] (sin GLOBAL ni PROPIA, PARAMS.TRAJ_STABLE_BAND sigue null)');

var deterioraGenerico = K.resolverTrayectoria([100, 110], rt, {}, 'HIGHER_IS_WORSE', refCond()); // rel=10/100=10% > 5%
eq(deterioraGenerico.traj, 'DETERIORATING', '100→110 (+10%) > banda genérica 5%, HIGHER_IS_WORSE → DETERIORATING');

var mejoraGenerico = K.resolverTrayectoria([100, 90], rt, {}, 'HIGHER_IS_WORSE', refCond()); // rel=-10%
eq(mejoraGenerico.traj, 'IMPROVING', '100→90 (-10%), HIGHER_IS_WORSE → IMPROVING');

var deterioraLower = K.resolverTrayectoria([100, 90], rt, {}, 'LOWER_IS_WORSE', refCond()); // rel=-10%, LOWER_IS_WORSE → peor
eq(deterioraLower.traj, 'DETERIORATING', '100→90 (-10%), LOWER_IS_WORSE (bajar es peor) → DETERIORATING');

// CALIBRACION_PROPIA gana sobre CALIBRACION_GENERICA
var propiaAncha = K.resolverTrayectoria([100, 110], rt, {}, 'HIGHER_IS_WORSE', refCond(), { band: 0.5 }); // rel=10% < banda propia 50%
eq(propiaAncha.traj, 'STABLE', 'umbralesOrg.band=0.5 (50%) > 10% real → STABLE, aunque el genérico (5%) hubiera dado DETERIORATING');
eq(propiaAncha.flags, ['CALIBRACION_PROPIA'], '...flags=[CALIBRACION_PROPIA]');

// CALIBRACION_GLOBAL gana sobre CALIBRACION_GENERICA cuando está calibrada
mod.PARAMS.TRAJ_STABLE_BAND = 0.5; // mutación de PRUEBA — restaurado abajo
var globalAncha = K.resolverTrayectoria([100, 110], rt, {}, 'HIGHER_IS_WORSE', refCond());
eq(globalAncha.traj, 'STABLE', 'PARAMS.TRAJ_STABLE_BAND=0.5 (CALIBRACION_GLOBAL) > 10% real → STABLE');
eq(globalAncha.flags, ['CALIBRACION_GLOBAL'], '...flags=[CALIBRACION_GLOBAL]');
mod.PARAMS.TRAJ_STABLE_BAND = null; // restaurado — Grupo 1 sigue sin calibrar

// base=0 (valor anterior) → N_A + flag, mismo tratamiento que _cv() con media=0
var baseCero = K.resolverTrayectoria([0, 5], rt, {}, 'HIGHER_IS_WORSE', refCond());
eq(baseCero.traj, 'N_A', 'valor anterior=0 → % de cambio indefinido → traj=N_A');
ok(tieneFlag(baseCero, 'BASE_CERO_TRAYECTORIA_INDEFINIDA'), '...flag BASE_CERO_TRAYECTORIA_INDEFINIDA');

// TARGET_RANGE — base = ANCHO DEL RANGO (upper−threshold), no valor_anterior
var rangoDetGenerico = K.resolverTrayectoria([90, 100], rt, {}, 'TARGET_RANGE', refCond({ threshold: 40, threshold_upper: 80 }));
// distancias: dist(90)=10, dist(100)=20 → mag=10; ancho=80-40=40 → rel=10/40=25% > 5%
eq(rangoDetGenerico.traj, 'DETERIORATING', 'TARGET_RANGE: distancia crece de 10→20 (rel=25% del ancho 40) > banda 5% → DETERIORATING');
var rangoAnchoCero = K.resolverTrayectoria([90, 100], rt, {}, 'TARGET_RANGE', refCond({ threshold: 50, threshold_upper: 50 }));
eq(rangoAnchoCero.traj, 'N_A', 'TARGET_RANGE con ancho de rango 0 (threshold=threshold_upper) → BASE_CERO → N_A');
ok(tieneFlag(rangoAnchoCero, 'BASE_CERO_TRAYECTORIA_INDEFINIDA'), '...mismo flag que el caso HIGHER_IS_WORSE, no una tercera forma fabricada');

// REF_TEMP no admisible / NEW_REGIME / SERIE_NO_UNE — se evalúan ANTES de
// tocar la banda (ningún flag de CALIBRACION_* — la rama nunca llegó ahí)
var noRT = K.resolverTrayectoria([10, 13], { ref: null, admissibility: 'NOT_ADMISSIBLE', flags: [] }, {}, 'HIGHER_IS_WORSE', refCond());
eq(noRT.traj, 'N_A', 'REF_TEMP no admisible → traj=N_A');
eq(noRT.flags, ['REF_TEMP_NO_ADMISIBLE'], '...flags=[REF_TEMP_NO_ADMISIBLE], sin CALIBRACION_* (nunca se resolvió banda)');
// NEW_REGIME (INV-28 / AC13)
var nr = K.resolverTrayectoria([10, 13], rt, { cambioReferencia: { tipo: 'START_NEW_REGIME' } }, 'HIGHER_IS_WORSE', refCond());
eq(nr.traj, 'N_A', 'NEW_REGIME → traj=N_A (INV-28)');
eq(nr.flags, ['NEW_REGIME'], '...flags=[NEW_REGIME] únicamente — la rama se evalúa ANTES de resolver la banda (INV-28)');
// SERIE_NO_UNE (INV-29 / AC16)
var snu = K.resolverTrayectoria([10, 13], rt, { continuidad: { puede_unir_serie: false } }, 'HIGHER_IS_WORSE', refCond());
eq(snu.traj, 'N_A', 'serie no une → traj=N_A (INV-29)');
ok(tieneFlag(snu, 'SERIE_NO_UNE'), '...por SERIE_NO_UNE (INV-29)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§11.3 / §28 — PERSISTENCIA (AJ — REAPERTURA Fase 5, 3 niveles de precedencia)');
// ═══════════════════════════════════════════════════════════════════════

eq(K.clasificarPersistencia('F', ['F'], ['2026-01'], {}), { pers: 'N_A', det_run: 0, det_duration: 0, flags: [] }, 'pos actual ≠ D → pers=N_A (§28 literal)');
var p1 = K.clasificarPersistencia('D', ['D'], ['2026-01'], {});
eq(p1.pers, 'POINT', 'det_run 1 → POINT');
eq([p1.det_run, p1.det_duration], [1, 0], 'det_run=1, det_duration=0');
eq(p1.flags, ['CALIBRACION_GENERICA'], '...flags=[CALIBRACION_GENERICA] (PARAMS.PERS_* siguen null)');

var p3 = K.clasificarPersistencia('D', ['D', 'D', 'D'], ['2026-01', '2026-02', '2026-03'], {});
eq(p3.pers, 'REPEATED', 'det_run=3: repMin_generico=2 ≤ 3 < perMin_generico=8 → REPEATED');
eq([p3.det_run, p3.det_duration], [3, 2], 'det_run=3, det_duration=2 (span calendario, ambig. H)');

// PERSISTENT — ancla Western Electric Rule 4 / Nelson Rule 2 (8 puntos)
var secD8 = ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D'];
var perD8 = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
var p8 = K.clasificarPersistencia('D', secD8, perD8, {});
eq(p8.pers, 'PERSISTENT', 'det_run=8 (perMin_generico) → PERSISTENT — ancla real de control de procesos (Western Electric/Nelson)');
eq(p8.flags, ['CALIBRACION_GENERICA'], '...flags=[CALIBRACION_GENERICA]');

// CALIBRACION_PROPIA gana sobre CALIBRACION_GENERICA
var propia = K.clasificarPersistencia('D', ['D', 'D', 'D'], ['2026-01', '2026-02', '2026-03'], { umbralesOrg: { repeatedMin: 5, persistentMin: 10 } });
eq(propia.pers, 'POINT', 'det_run=3 < repeatedMin propio (5) → POINT, aunque el genérico (repMin=2) hubiera dado REPEATED');
eq(propia.flags, ['CALIBRACION_PROPIA'], '...flags=[CALIBRACION_PROPIA]');

// CALIBRACION_GLOBAL gana sobre CALIBRACION_GENERICA cuando está calibrada
mod.PARAMS.PERS_REPEATED_MIN = 5; mod.PARAMS.PERS_PERSISTENT_MIN = 10; // mutación de PRUEBA — restaurado abajo
var global3 = K.clasificarPersistencia('D', ['D', 'D', 'D'], ['2026-01', '2026-02', '2026-03'], {});
eq(global3.pers, 'POINT', 'PARAMS.PERS_REPEATED_MIN=5 (CALIBRACION_GLOBAL) > det_run=3 → POINT');
eq(global3.flags, ['CALIBRACION_GLOBAL'], '...flags=[CALIBRACION_GLOBAL]');
mod.PARAMS.PERS_REPEATED_MIN = null; mod.PARAMS.PERS_PERSISTENT_MIN = null; // restaurado — Grupo 1 sigue sin calibrar

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
console.log('  3. resolverTrayectoria: `mag === null` → tratar como MAGNITUD_NULA de todas formas');
console.log('     (quitar el guard de base=0) → ver mutación C de la REAPERTURA más abajo.');
console.log('  4. resolverTrayectoria: quitar la rama NEW_REGIME → 2 rojos (traj deja de ser N_A y');
console.log('     los flags dejan de ser solo [NEW_REGIME] — cae al cálculo real, INV-28).');
console.log('  5. resolverTrayectoria: SERIE_NO_UNE → devolver STABLE → 2 rojos (traj + flag) — INV-29.');
console.log('  5b. quitar la rama !historiaSuficiente → 1 rojo ("1 punto → HISTORIA_INSUFICIENTE", AC03).');
console.log('  6. clasificarPersistencia: quitar `pos !== D` → 1 rojo ("pos≠D → pers=N_A", §28).');
console.log('  7. [OBSOLETA tras REAPERTURA Fase 5] "sin calibrar det_run>=2 → PERSISTENT" ya no aplica');
console.log('     — el genérico siempre calibra. Ver mutaciones A2/A3 de la REAPERTURA más abajo.');
console.log('  8. resolverAdmisibilidad: quitar `STALE` → 1 rojo ("STALE → NOT_ADMISSIBLE", AC18).');
console.log('  9. resolverKpiState: `mdVer = metricDef.definition_version` → `.version` → 1 rojo');
console.log('     (CONTRATO DE INTERFAZ: §7 dice definition_version, §10 metric_definition_version).');
console.log('  10. resolverKpiState: `if (degradado)` de pos → `if (false)` → 1 rojo ("degradado →');
console.log('      pos=N_A", ambig. P). (Los otros asserts de P los cubren admissibility/flag/traj.)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones REAPERTURA Fase 5 (banda/persistencia relativas, 3 niveles) — Bash aparte');
// ═══════════════════════════════════════════════════════════════════════
console.log('  A1. enums.js: `TRAJ_STABLE_BAND_GENERICO: 0.05` → `0.99` → 5 rojos: el assert directo del');
console.log('      valor de la constante, + los 4 fixtures que dependen del 5% genérico (DETERIORATING/');
console.log('      IMPROVING de HIGHER_IS_WORSE, DETERIORATING de LOWER_IS_WORSE, DETERIORATING de');
console.log('      TARGET_RANGE — todos caen a STABLE).');
console.log('  A2. enums.js: `PERS_REPEATED_MIN_GENERICO: 2` → `99` → 3 rojos: el assert directo (array');
console.log('      [repMin,perMin]) + "det_run=3 → REPEATED" y "det_run=8 → PERSISTENT", que caen ambos');
console.log('      a POINT (ningún det_run llega a 99).');
console.log('  A3. enums.js: `PERS_PERSISTENT_MIN_GENERICO: 8` → `99` → 2 rojos: el assert directo (array');
console.log('      [repMin,perMin]) + "det_run=8 → PERSISTENT", que pasa a REPEATED.');
console.log('  B.  resolverTrayectoria: `if (esNum(uo.band))` → `if (false)` (CALIBRACION_PROPIA nunca');
console.log('      gana) → 2 rojos (traj + flags de "propiaAncha", cae a CALIBRACION_GENERICA).');
console.log('  C.  resolverTrayectoria: quitar el guard `!esNum(base) || base === 0` → 4 rojos (2 fixtures');
console.log('      × traj+flag: "valor anterior=0" Y "TARGET_RANGE ancho=0" — MISMO guard cubre ambos,');
console.log('      ninguno degrada a N_A, terminan clasificando con Infinity/NaN sin control).');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
