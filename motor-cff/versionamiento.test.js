/**
 * motor-cff/versionamiento.test.js — Fase 5 (§25-26)
 * node motor-cff/versionamiento.test.js
 */

'use strict';

var V = require('./versionamiento');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }
function lanza(fn, m) { var l = false; try { fn(); } catch (e) { l = true; } ok(l, m); }

// ═══════════════════════════════════════════════════════════════════════
seccion('§25 — evaluarShortCircuit: WARNING / DEGRADED / BLOCKING');
// ═══════════════════════════════════════════════════════════════════════

eq(V.evaluarShortCircuit([]).techoCalculationStatus, 'VALID', 'sin errores → techo VALID');

var soloWarn = V.evaluarShortCircuit([{ code: 'X', severity: 'WARNING', ref: 'a' }]);
eq(soloWarn.techoCalculationStatus, 'VALID', 'solo WARNING → NO baja el techo (sigue VALID)');
eq(soloWarn.advertencias.length, 1, 'la advertencia se conserva');
eq(soloWarn.corridaInvalidada, false, 'WARNING no invalida la corrida');

var conDegraded = V.evaluarShortCircuit([{ code: 'Y', severity: 'DEGRADED', ref: 'b' }]);
eq(conDegraded.techoCalculationStatus, 'VALID_WITH_LIMITATIONS', 'DEGRADED → techo VALID_WITH_LIMITATIONS (no puede superarlo)');
eq(conDegraded.corridaInvalidada, false, 'DEGRADED local no invalida la corrida');

var blockingLocal = V.evaluarShortCircuit([{ code: 'EVENTO_INVALIDO', severity: 'BLOCKING', scope: 'local', ref: 'EV2' }]);
eq(blockingLocal.techoCalculationStatus, 'INVALID', 'BLOCKING → techo INVALID');
eq(blockingLocal.corridaInvalidada, false, 'BLOCKING LOCAL bloquea su salida pero NO invalida la corrida (§25 fallo local)');
eq(blockingLocal.salidasBloqueadas, ['EV2'], 'la salida afectada queda listada como bloqueada');

// ═══════════════════════════════════════════════════════════════════════
seccion('§25 — fallo GLOBAL invalida la corrida completa');
// ═══════════════════════════════════════════════════════════════════════

['MONEDA_BASE_INVALIDA', 'GRAFO_INCONSISTENTE_NO_RESOLUBLE', 'CORRUPCION_VERSIONES'].forEach(function (code) {
  var r = V.evaluarShortCircuit([{ code: code, severity: 'BLOCKING', ref: 'run' }]);
  ok(r.corridaInvalidada, code + ' (BLOCKING) → corridaInvalidada=true (§25: fallo global)');
});

var mixto = V.evaluarShortCircuit([
  { code: 'EVENTO_INVALIDO', severity: 'BLOCKING', scope: 'local', ref: 'EV1' },
  { code: 'MONEDA_BASE_INVALIDA', severity: 'BLOCKING', ref: 'run' },
  { code: 'W', severity: 'WARNING', ref: 'c' }
]);
ok(mixto.corridaInvalidada, 'con un fallo global presente, la corrida se invalida aunque también haya locales');
eq(mixto.salidasBloqueadas, ['EV1'], 'el local sigue registrándose como salida bloqueada');
eq(mixto.advertencias.length, 1, 'el WARNING se conserva');

lanza(function () { V.evaluarShortCircuit([{ code: 'X', severity: 'FATAL' }]); }, 'severity fuera de {WARNING,DEGRADED,BLOCKING} → lanza');

// ── aplicarTecho ──
seccion('§25 — aplicarTecho (el techo gana solo si es peor)');
eq(V.aplicarTecho('VALID', 'VALID_WITH_LIMITATIONS'), 'VALID_WITH_LIMITATIONS', 'techo DEGRADED baja un VALID propuesto');
eq(V.aplicarTecho('INVALID', 'VALID_WITH_LIMITATIONS'), 'INVALID', 'un INVALID propuesto NO se "sube" por un techo más laxo');
eq(V.aplicarTecho('VALID_WITH_LIMITATIONS', 'INVALID'), 'INVALID', 'techo BLOCKING baja a INVALID');

// ═══════════════════════════════════════════════════════════════════════
seccion('§26 — cambioRequiereNuevaCorrida (solo si modifica el resultado)');
// ═══════════════════════════════════════════════════════════════════════

V.TIPOS_CAMBIO_VERSIONABLES.forEach(function (t) {
  ok(V.cambioRequiereNuevaCorrida(t, true) === true, t + ' que MODIFICA el resultado → nueva corrida (INV-CFF-51)');
  ok(V.cambioRequiereNuevaCorrida(t, false) === false, t + ' que NO modifica el resultado → NO fuerza nueva corrida (§26)');
});
ok(V.cambioRequiereNuevaCorrida('CAMBIO_COSMETICO', true) === false, 'un tipo de cambio no versionable → no fuerza corrida ni modificando el resultado');
lanza(function () { V.cambioRequiereNuevaCorrida('FORMULA'); }, 'modificaResultado no declarado → lanza (no se infiere)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§26 / INV-CFF-65 — crearNuevaVersion no sobrescribe la anterior');
// ═══════════════════════════════════════════════════════════════════════

var runV1 = {
  run_id: 'R1', cff_case_id: 'C1', calculation_version: 'calc-v1', ruleset_version: 'rules-v1',
  formula_versions: ['f1'], monetary_basis_versions: ['m1'], relationship_versions: [],
  input_snapshot_ids: ['s1'], update_reason: 'inicial', generated_at: 't1', run_status: 'COMPLETED'
};
var runV1Snapshot = JSON.stringify(runV1);
var runV2 = V.crearNuevaVersion(runV1, { calculation_version: 'calc-v2', update_reason: 'nueva assessment', ruleset_version: 'rules-v2' });
eq(JSON.stringify(runV1), runV1Snapshot, 'runV1 queda intacto tras crear la v2 (INV-CFF-65)');
eq(runV2.parent_calculation_version, 'calc-v1', 'runV2.parent_calculation_version apunta a la anterior');
eq(runV2.calculation_version, 'calc-v2', 'runV2 tiene su propia calculation_version');
eq(runV2.ruleset_version, 'rules-v2', 'runV2 aplica el campo sobreescrito');
eq(runV2.cff_case_id, 'C1', 'runV2 hereda lo no sobreescrito');
ok(Object.isFrozen(runV1), 'runV1 quedó congelado (garantía adicional de inmutabilidad)');
lanza(function () { V.crearNuevaVersion(runV1, { calculation_version: 'calc-v1', update_reason: 'x' }); },
  'nueva calculation_version igual a la anterior → lanza (una revisión crea una versión DISTINTA)');
lanza(function () { V.crearNuevaVersion(runV1, { update_reason: 'x' }); }, 'sin calculation_version nueva → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('§26.2 / INV-CFF-66 — marcarStale no reescribe ni invalida el histórico');
// ═══════════════════════════════════════════════════════════════════════

var histo = { cff_run_id: 'R1', calculation_version: 'calc-v1', cff_total: 5000, calculation_status: 'VALID' };
var histoSnapshot = JSON.stringify(histo);
var stale = V.marcarStale(histo, 'calc-v2');
eq(JSON.stringify(histo), histoSnapshot, 'el resultado histórico NO se toca (INV-CFF-66: STALE no reescribe)');
eq(stale.calculation_status, 'STALE', 'la copia marcada tiene calculation_status=STALE');
eq(stale.cff_total, 5000, 'la cifra histórica se conserva en la copia (STALE no la invalida)');
eq(stale.stale_ref, 'calc-v2', 'stale_ref apunta a la versión vigente');
ok(Object.isFrozen(histo), 'el histórico quedó congelado');
lanza(function () { V.marcarStale(histo, 'calc-v1'); }, 'marcar STALE con la misma versión → lanza');
lanza(function () { V.marcarStale(null, 'calc-v2'); }, 'histórico no-objeto → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones — ejecutadas como paso de Bash aparte (ver mensaje de cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. §25 severidad: tratar BLOCKING como DEGRADED → techoCalculationStatus baja de INVALID a');
console.log('     VALID_WITH_LIMITATIONS y una salida bloqueada deja de listarse (regla negativa de §25).');
console.log('  2. §25 global/local: tratar un code de CAUSAS_GLOBALES como local → corridaInvalidada pasa a');
console.log('     false (un fallo que debía invalidar la corrida completa deja de hacerlo).');
console.log('  3. §26 INV-CFF-65: hacer que crearNuevaVersion mute runAnterior → el snapshot histórico cambia.');
console.log('  4. §26 INV-CFF-51: quitar la condición modificaResultado → un cambio no material fuerza corrida.');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
