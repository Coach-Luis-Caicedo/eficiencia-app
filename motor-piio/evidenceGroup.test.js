/**
 * motor-piio/evidenceGroup.test.js — Fase 6
 * node motor-piio/evidenceGroup.test.js
 *
 * §14 — colapso de KPI dependientes. Oráculo conductual: AC20 (F+F→F),
 * AC21 (D+D→D), AC22 (F+D→N_A+INTERNAL_INCONSISTENCY). INV-12/16.
 * (INV-17 es §15, NO aquí.)
 */

'use strict';

var EG = require('./evidenceGroup');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }
function tieneFlag(o, f) { return (o && o.flags || []).some(function (x) { return x === f || x.indexOf(f + ':') === 0; }); }

// KPI_STATE mínimo (la forma que produce Fase 5)
function st(pos, over) {
  return Object.assign({ kpi_id: 'k?', node_id: 'n1', period: '2026-03', pos: pos, traj: 'STABLE', pers: 'N_A', admissibility: 'ADMISSIBLE' }, over || {});
}
function eg(over) {
  return Object.assign({ evidence_group_id: 'eg1', phenomenon_id: 'ph1', member_kpi_ids: ['ka', 'kb'], resolution_rule_version: 'rrv1', status: 'ACTIVE' }, over || {});
}
function colap(posArr, over, prox) {
  var states = posArr.map(function (p, i) { return st(p, { kpi_id: 'k' + i }); });
  return EG.colapsarGrupo(states, eg(over), prox);
}

// ═══════════════════════════════════════════════════════════════════════
seccion('§14 — la tabla de pares (AC20/21/22)');
// ═══════════════════════════════════════════════════════════════════════

eq(colap(['F', 'F']).pos, 'F', 'F + F → F (AC20)');
eq(colap(['D', 'D']).pos, 'D', 'D + D → D (AC21)');
eq(colap(['F', 'I']).pos, 'F', 'F + I → F');
eq(colap(['D', 'I']).pos, 'D', 'D + I → D');
eq(colap(['I', 'I']).pos, 'I', 'I + I → I');
var fd = colap(['F', 'D']);
eq(fd.pos, 'N_A', 'F + D → N_A (AC22 — inconsistencia técnica, NO divergencia, INV-16)');
ok(tieneFlag(fd, 'INTERNAL_INCONSISTENCY'), '...+ flag INTERNAL_INCONSISTENCY (§14 literal)');
// preservar los KPI originales (§14 literal)
eq(fd.member_states.length, 2, 'member_states preserva los 2 KPI_STATE originales (§14)');
eq((fd.member_states[0] || {}).pos, 'F', '...con su pos original intacto');  // accesor tolerante (5ª vez del patrón)

// ═══════════════════════════════════════════════════════════════════════
seccion('Ambigüedad AN — regla de conjunto para ≥3 KPIs');
// ═══════════════════════════════════════════════════════════════════════

eq(colap(['F', 'F', 'F']).pos, 'F', '{F} (3 KPIs) → F');
eq(colap(['D', 'I', 'I']).pos, 'D', '{D,I} → D');
eq(colap(['F', 'I', 'I', 'I']).pos, 'F', '{F,I} → F');
// el caso que la reducción pairwise deja indefinido:
var fdi = colap(['F', 'D', 'I']);
eq(fdi.pos, 'N_A', '{F,D,I} → N_A (F∧D domina — pairwise (F+D)→N_A+IC deja "N_A+I" indefinido)');
ok(tieneFlag(fdi, 'INTERNAL_INCONSISTENCY'), '...+ INTERNAL_INCONSISTENCY');
// order-independent
eq(EG.colapsarGrupo([st('I'), st('F'), st('D')], eg()).pos, EG.colapsarGrupo([st('D'), st('F'), st('I')], eg()).pos, 'el resultado no depende del orden de los miembros');
eq(colap(['D', 'D', 'F']).pos, 'N_A', 'D,D,F → N_A+IC (basta un F junto a un D)');

// ═══════════════════════════════════════════════════════════════════════
seccion('AO — miembros N_A; filtrarUtilizables (INV-01)');
// ═══════════════════════════════════════════════════════════════════════

eq(colap(['F', 'N_A']).pos, 'F', 'F + N_A → F (N_A se descarta del colapso)');
var todosNA = colap(['N_A', 'N_A']);
eq(todosNA.pos, 'N_A', 'todos N_A → grupo N_A');
ok(!tieneFlag(todosNA, 'INTERNAL_INCONSISTENCY'), '...SIN INTERNAL_INCONSISTENCY (ausencia de evidencia, no un choque — AO)');
eq(colap([]).pos, 'N_A', 'grupo vacío → N_A');

// INV-01 — un miembro no admisible no aporta posición aunque tenga pos
var conNoAdm = EG.colapsarGrupo([st('F', { kpi_id: 'ka' }), st('D', { kpi_id: 'kb', admissibility: 'NOT_ADMISSIBLE' })], eg());
eq(conNoAdm.pos, 'F', 'F (admisible) + D (NOT_ADMISSIBLE) → F (el no admisible se descarta, INV-01)');
ok(!tieneFlag(conNoAdm, 'INTERNAL_INCONSISTENCY'), '...sin INTERNAL_INCONSISTENCY (el D no admisible no cuenta)');

eq(EG.filtrarUtilizables([st('F'), st('N_A'), st('D', { admissibility: 'NOT_ADMISSIBLE' }), st('I')]).map(function (s) { return s.pos; }), ['F', 'I'], 'filtrarUtilizables descarta N_A y NOT_ADMISSIBLE');

// ═══════════════════════════════════════════════════════════════════════
seccion('AP — evidence_proximity derivada (MIXED no se resuelve aquí)');
// ═══════════════════════════════════════════════════════════════════════

eq(colap(['F', 'F'], {}, { k0: 'DIRECT', k1: 'DIRECT' }).evidence_proximity, 'DIRECT', 'todos DIRECT → DIRECT');
eq(colap(['F', 'F'], {}, { k0: 'PROXY', k1: 'PROXY' }).evidence_proximity, 'PROXY', 'todos PROXY → PROXY');
var mix = colap(['F', 'F'], {}, { k0: 'DIRECT', k1: 'PROXY' });
eq(mix.evidence_proximity, 'MIXED', 'DIRECT + PROXY → MIXED (Fase 7 decide qué significa, AP)');
ok(tieneFlag(mix, 'PROXIMIDAD_MIXTA'), '...+ flag PROXIMIDAD_MIXTA');
eq(colap(['F', 'F']).evidence_proximity, null, 'sin mapa de proximidad → null');

// ═══════════════════════════════════════════════════════════════════════
seccion('AQ — status ≠ ACTIVE');
// ═══════════════════════════════════════════════════════════════════════

var dep = colap(['D', 'D'], { status: 'DEPRECATED' });
eq(dep.pos, 'D', 'status DEPRECATED → se colapsa igual (no se descarta evidencia en silencio, §30)');
ok(tieneFlag(dep, 'EVIDENCE_GROUP_NO_ACTIVO'), '...+ flag EVIDENCE_GROUP_NO_ACTIVO');
ok(!tieneFlag(colap(['D', 'D']), 'EVIDENCE_GROUP_NO_ACTIVO'), 'status ACTIVE → sin flag');

// ═══════════════════════════════════════════════════════════════════════
seccion('agruparPorEvidenceGroup — consistencia + agrupación');
// ═══════════════════════════════════════════════════════════════════════

var ks = [
  { kpi_id: 'ka', evidence_group_id: 'eg1', evidence_proximity: 'DIRECT' },
  { kpi_id: 'kb', evidence_group_id: 'eg1', evidence_proximity: 'DIRECT' }
];
var egs = [eg({ member_kpi_ids: ['ka', 'kb'] })];
var estados = [
  st('F', { kpi_id: 'ka', node_id: 'n1', period: '2026-03' }),
  st('D', { kpi_id: 'kb', node_id: 'n1', period: '2026-03' }),
  st('D', { kpi_id: 'ka', node_id: 'n1', period: '2026-04' }),
  st('D', { kpi_id: 'kb', node_id: 'n1', period: '2026-04' })
];
var ag = EG.agruparPorEvidenceGroup(estados, egs, ks);
eq(ag.grupos.length, 2, 'se agrupa por (evidence_group_id, node_id, period) → 2 grupos (03 y 04)');
eq(ag.grupos.map(function (g) { return g.pos; }).sort(), ['D', 'N_A'], '2026-03: F+D → N_A+IC; 2026-04: D+D → D');
eq(ag.flags, [], 'config consistente → sin flags');

// inconsistencia: kb no está en member_kpi_ids
var agIncoh = EG.agruparPorEvidenceGroup(estados, [eg({ member_kpi_ids: ['ka'] })], ks);
ok(agIncoh.flags.some(function (f) { return f.indexOf('EVIDENCE_GROUP_INCONSISTENTE') === 0; }), 'kb apunta a eg1 pero eg1.member_kpi_ids no lo lista → flag EVIDENCE_GROUP_INCONSISTENTE');

var agHuerfano = EG.agruparPorEvidenceGroup(estados, [], ks);
ok(agHuerfano.flags.some(function (f) { return f.indexOf('KPI_APUNTA_A_GRUPO_INEXISTENTE') === 0; }), 'kpi apunta a un evidence_group que no existe → flag');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. _colapsarConjunto: `S.F && S.D` → `S.F || S.D` → 12 rojos (F/D solos');
console.log('     pasan a N_A+IC — toca casi todas las celdas).');
console.log('  2. _colapsarConjunto: quitar la rama `S.F && S.D` → 6 rojos (F+D pasa a D — INV-16).');
console.log('  3. _colapsarConjunto: `if (S.D)` ANTES de `if (S.F && S.D)` → 6 rojos (F+D→D).');
console.log('  4. _colapsarConjunto: S vacío → `{ pos: I }` → 2 rojos ("grupo vacío → N_A",');
console.log('     "todos N_A → N_A") — AO.');
console.log('  5. filtrarUtilizables: no filtrar `pos === N_A` → 1 rojo (el test directo de');
console.log('     filtrarUtilizables; el colapso es robusto porque no chequea S["N_A"]).');
console.log('  6. filtrarUtilizables: no filtrar `NOT_ADMISSIBLE` → 3 rojos (INV-01).');
console.log('  7. colapsarGrupo: `member_states: []` → 2 rojos (§14 "preservar los originales";');
console.log('     accesor tolerante en el 2º assert — 5ª vez del patrón).');
console.log('  8. colapsarGrupo: F+D sin push INTERNAL_INCONSISTENCY → 2 rojos (AC22).');
console.log('  9. colapsarGrupo: proximidad mixta → `pk[0]` en vez de MIXED → 2 rojos (AP).');
console.log('  10. agruparPorEvidenceGroup: quitar el chequeo de consistencia → 2 rojos');
console.log('      (EVIDENCE_GROUP_INCONSISTENTE, KPI_APUNTA_A_GRUPO_INEXISTENTE).');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
