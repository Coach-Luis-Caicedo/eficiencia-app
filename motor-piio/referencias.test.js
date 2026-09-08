/**
 * motor-piio/referencias.test.js — Fase 3
 * node motor-piio/referencias.test.js
 *
 * §8 (referencias condición/tiempo). Oráculo conductual: AC12 (REBASE_
 * HISTORY → nueva versión histórica, original intacta), AC13 (START_NEW_
 * REGIME → no mezclar regímenes), AC14/15/16 (definición CONTINUOUS/
 * BRIDGED/NEW_SERIES), INV-08/09/28/29.
 */

'use strict';

var R = require('./referencias');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }
function tieneFlag(res, f) { return (res.flags || []).some(function (x) { return x === f || x.indexOf(f + ':') === 0; }); }
// accesores tolerantes: `res.ref` puede ser null (comportamiento válido); una
// mutación que lo deja null no debe crashear la batería (patrón dig() de Fase 1)
function refVer(res) { return res && res.ref ? res.ref.version : null; }
function refRol(res) { return res && res.ref ? res.ref.reference_role : null; }

function ref(over) {
  return Object.assign({
    reference_id: 'rc1', reference_role: 'CONDITION', reference_type: 'NORMATIVE', source: 'ISO',
    valid_from: '2026-01', rule: 'r', comparability_assessment: 'a', traceability: 't', version: 'v1',
    admissibility_declared: 'ADMISSIBLE', threshold: 50  // reapertura Fase 5 (AH)
  }, over || {});
}
function md(over) {
  return Object.assign({ metric_definition_id: 'md1', continuity_mode: 'CONTINUOUS' }, over || {});
}

// ═══════════════════════════════════════════════════════════════════════
seccion('INV-PIIO-08 — REF_COND ≠ REF_TEMP (no se cruzan)');
// ═══════════════════════════════════════════════════════════════════════

var refs = [ref({ reference_id: 'x', reference_role: 'CONDITION' }), ref({ reference_id: 'x', reference_role: 'TEMPORAL' })];
eq(refRol(R.resolverReferenciaVigente(refs, 'x', 'CONDITION', '2026-03')), 'CONDITION', 'role CONDITION → devuelve la de rol CONDITION');
eq(refRol(R.resolverReferenciaVigente(refs, 'x', 'TEMPORAL', '2026-03')), 'TEMPORAL', 'role TEMPORAL → devuelve la de rol TEMPORAL');
eq(R.resolverReferenciaVigente([ref({ reference_role: 'TEMPORAL' })], 'rc1', 'CONDITION', '2026-03').ref, null, 'pedir CONDITION cuando solo hay TEMPORAL → ref = null (no se cruza)');

// ═══════════════════════════════════════════════════════════════════════
seccion('INV-PIIO-09 — no se promedian (devuelve UNA instancia o null)');
// ═══════════════════════════════════════════════════════════════════════

var unica = ref({ version: 'v1' });
var res1 = R.resolverReferenciaVigente([unica], 'rc1', 'CONDITION', '2026-05');
ok(res1.ref === unica, 'resolverReferenciaVigente devuelve la MISMA instancia del input (no una copia/combinada)');

// ventanas solapadas → NO se elige una — ambigüedad W
var solapadas = [
  ref({ version: 'v1', valid_from: '2026-01', valid_to: '2026-12' }),
  ref({ version: 'v2', valid_from: '2026-06', valid_to: '2027-06' })
];
var resSolap = R.resolverReferenciaVigente(solapadas, 'rc1', 'CONDITION', '2026-08');
eq(resSolap.ref, null, 'período 2026-08 en 2 ventanas → ref = null (no "la más reciente gana")');
eq(resSolap.admissibility, 'NOT_ADMISSIBLE', '...admissibility = NOT_ADMISSIBLE (§30: perder cobertura antes que inventar)');
ok(tieneFlag(resSolap, 'REFERENCIA_VERSIONES_SOLAPADAS'), '...flag REFERENCIA_VERSIONES_SOLAPADAS');
// pero un período FUERA del solapamiento resuelve limpio
eq(refVer(R.resolverReferenciaVigente(solapadas, 'rc1', 'CONDITION', '2026-03')), 'v1', 'período 2026-03 (solo en v1) → resuelve v1');
eq(refVer(R.resolverReferenciaVigente(solapadas, 'rc1', 'CONDITION', '2027-03')), 'v2', 'período 2027-03 (solo en v2) → resuelve v2');

// ═══════════════════════════════════════════════════════════════════════
seccion('§8.2 — admisibilidad: vigencia (mecánica) + veredicto declarado');
// ═══════════════════════════════════════════════════════════════════════

eq(R.admisibilidadReferencia(ref({ admissibility_declared: 'ADMISSIBLE' })), 'ADMISSIBLE', 'admissibility_declared se propaga');
eq(R.admisibilidadReferencia(ref({ admissibility_declared: 'ADMISSIBLE_WITH_LIMITATIONS' })), 'ADMISSIBLE_WITH_LIMITATIONS', 'WITH_LIMITATIONS se propaga');
eq(R.admisibilidadReferencia(ref({ admissibility_declared: 'ADMISSIBLE', critical_failure: 'fusión cambió el marco comparable' })), 'NOT_ADMISSIBLE', 'critical_failure presente → NOT_ADMISSIBLE aunque el declarado sea ADMISSIBLE (§8.2)');

// vigencia
eq(R.resolverReferenciaVigente([ref({ valid_from: '2026-01', valid_to: '2026-06' })], 'rc1', 'CONDITION', '2026-09').ref, null, 'período posterior a valid_to → fuera de vigencia');
ok(tieneFlag(R.resolverReferenciaVigente([ref({ valid_from: '2026-01', valid_to: '2026-06' })], 'rc1', 'CONDITION', '2026-09'), 'FUERA_DE_VIGENCIA'), '...flag FUERA_DE_VIGENCIA');
eq(R.resolverReferenciaVigente([ref({ valid_from: '2026-05' })], 'rc1', 'CONDITION', '2026-02').ref, null, 'período anterior a valid_from → fuera de vigencia');
eq(refVer(R.resolverReferenciaVigente([ref({ valid_from: '2026-01' })], 'rc1', 'CONDITION', '2030-01')), 'v1', 'valid_to ausente → ventana abierta hacia el futuro');
// referencia vigente pero con veredicto NOT_ADMISSIBLE declarado → se devuelve, admissibility lo refleja
var noAdm = R.resolverReferenciaVigente([ref({ admissibility_declared: 'NOT_ADMISSIBLE' })], 'rc1', 'CONDITION', '2026-03');
ok(noAdm.ref !== null, 'referencia vigente con admissibility_declared=NOT_ADMISSIBLE → SÍ se devuelve la ref');
eq(noAdm.admissibility, 'NOT_ADMISSIBLE', '...pero admissibility = NOT_ADMISSIBLE (Fase 5 la ignora para clasificar)');

// no encontrada
ok(tieneFlag(R.resolverReferenciaVigente([], 'rc1', 'CONDITION', '2026-03'), 'REFERENCIA_NO_ENCONTRADA'), 'sin ninguna referencia con ese id/rol → flag REFERENCIA_NO_ENCONTRADA');

// ═══════════════════════════════════════════════════════════════════════
seccion('§8.3 — cambios de referencia (solo directiva, no ejecución)');
// ═══════════════════════════════════════════════════════════════════════

eq(R.evaluarCambioReferencia(ref()).tipo, 'SIN_CAMBIO', 'sin change_mode → SIN_CAMBIO');
var rebase = R.evaluarCambioReferencia(ref({ change_mode: 'REBASE_HISTORY', supersedes: 'v0' }));
eq(rebase.tipo, 'REBASE_HISTORY', 'change_mode REBASE_HISTORY → tipo REBASE_HISTORY');
eq(rebase.supersedes, 'v0', '...supersedes = v0');
ok(/Fase 11/.test(rebase.directiva) && /no sobrescribe|NO sobrescribe/i.test(rebase.directiva), '...directiva menciona Fase 11 + no sobrescribir (AC12 / §31)');
var regimen = R.evaluarCambioReferencia(ref({ change_mode: 'START_NEW_REGIME', supersedes: 'v0' }));
eq(regimen.tipo, 'START_NEW_REGIME', 'change_mode START_NEW_REGIME → tipo START_NEW_REGIME');
ok(/Fase 5/.test(regimen.directiva) && /traj/i.test(regimen.directiva), '...directiva: Fase 5 no calcula traj a través del cambio (AC13 / INV-28)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§8.4 — continuidad de definición (AC14/15/16, INV-29)');
// ═══════════════════════════════════════════════════════════════════════

eq(R.continuidadDefinicion(md({ continuity_mode: 'CONTINUOUS' })), { modo: 'CONTINUOUS', puede_unir_serie: true, flags: [] }, 'CONTINUOUS → se une la serie (AC14)');
eq(R.continuidadDefinicion(md({ continuity_mode: 'BRIDGED', bridge_rule: 'x1.08' })), { modo: 'BRIDGED', puede_unir_serie: true, flags: [] }, 'BRIDGED + bridge_rule → se une (AC15: bridge validado)');
var brSinRegla = R.continuidadDefinicion(md({ continuity_mode: 'BRIDGED' }));
eq(brSinRegla.modo, 'NEW_SERIES', 'BRIDGED sin bridge_rule → tratado como NEW_SERIES (AC15 / ambig. Y)');
eq(brSinRegla.puede_unir_serie, false, '...puede_unir_serie = false');
ok(tieneFlag(brSinRegla, 'BRIDGE_SIN_REGLA'), '...flag BRIDGE_SIN_REGLA');
eq(R.continuidadDefinicion(md({ continuity_mode: 'NEW_SERIES' })), { modo: 'NEW_SERIES', puede_unir_serie: false, flags: [] }, 'NEW_SERIES → traj no cruza la ruptura (AC16 / INV-29)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. resolverReferenciaVigente: quitar el filtro por `reference_role`');
console.log('     → 3 rojos (los 2 de "role X → devuelve la de rol X" + "pedir CONDITION');
console.log('     con solo TEMPORAL → ref=null") — INV-08 se cruzan.');
console.log('  2. `aplicables.length > 1` → `false` (devolver aplicables[0])');
console.log('     → 3 rojos (ref=null, admissibility=NOT_ADMISSIBLE, flag SOLAPADAS) — ambig. W.');
console.log('  3. admisibilidadReferencia: ignorar `critical_failure`');
console.log('     → 1 rojo ("critical_failure → NOT_ADMISSIBLE") — §8.2.');
console.log('  4. _vigente: quitar la cota `period > valid_to`');
console.log('     → 3 rojos (posterior a valid_to: ref + flag FUERA_DE_VIGENCIA; y "solo en v2"');
console.log('     ahora cae en el solapamiento).');
console.log('  5. evaluarCambioReferencia: REBASE_HISTORY y START_NEW_REGIME → misma rama');
console.log('     → 2 rojos (tipo START_NEW_REGIME, directiva menciona Fase 5/traj).');
console.log('  6. continuidadDefinicion: BRIDGED sin bridge_rule → devolver modo BRIDGED');
console.log('     → 2 rojos (modo NEW_SERIES, puede_unir_serie=false).');
console.log('  7. resolverReferenciaVigente: `Object.assign({}, aplicables[0])` (copia)');
console.log('     → 1 rojo ("devuelve la MISMA instancia del input") — INV-09.');
console.log('');
console.log('  Nota: MUT1 y MUT4 crasheaban la batería (`.ref.X` sobre null) hasta añadir');
console.log('  los accesores tolerantes refVer/refRol — mismo patrón que dig() en Fase 1.');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
