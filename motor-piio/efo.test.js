/**
 * motor-piio/efo.test.js — Fase 9
 * node motor-piio/efo.test.js
 *
 * Motor DOMAIN → EFO (§20–21 / §24). 9a: §20 — regla de 5 ramas,
 * deterioración, cobertura, admisibilidad.
 * Oráculo conductual: AC37 (REQUIRED D + OPTIONAL F → D), AC38 (REQUIRED I
 * sin D → I), AC39 (todos REQUIRED F + OPTIONAL D → I + det), AC40 (todos
 * REQUIRED F sin OPTIONAL D → F), AC41 (sin REQUIRED clasif + OPTIONAL F →
 * N_A), AC42 (sin REQUIRED clasif + OPTIONAL D → N_A + det), AC76 (mayoría
 * F + REQUIRED D → D, sin votación). INV-32/33/34/35/36/37/38.
 */

'use strict';

var E = require('./efo');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }
function tieneFlag(o, f) { return (o && o.flags || []).some(function (x) { return x === f || x.indexOf(f + ':') === 0; }); }

// DOMAIN_STATE mínimo (la forma que produce Fase 8)
function ds(over) {
  return Object.assign({
    domain_id: 'PRODUCTIVITY', node_id: 'n1', period: '2026-03',
    applicability: 'REQUIRED', pos: 'F', admissibility: 'ADMISSIBLE',
    deterioration_present: false
  }, over || {});
}
// atajo: construir la partición desde listas de {applicability, pos}
function part(specs) {
  return E._particionarDominios((specs || []).map(function (s, i) {
    return ds({ domain_id: 'd' + i, applicability: s.a || 'REQUIRED', pos: s.p, admissibility: s.adm || 'ADMISSIBLE' });
  }));
}
function posDe(specs) { return E.posicionEFO(part(specs)).pos; }

// ═══════════════════════════════════════════════════════════════════════
seccion('§20.1 — regla determinista de 5 ramas (COMPLETA)');
// ═══════════════════════════════════════════════════════════════════════

// rama 1
eq(posDe([]), 'N_A', 'rama 1: sin dominios → N_A');
eq(posDe([{ a: 'REQUIRED', p: 'F', adm: 'NOT_ADMISSIBLE' }]), 'N_A', 'rama 1: REQUIRED no admisible → no clasificable → N_A');
eq(posDe([{ a: 'OPTIONAL', p: 'F' }]), 'N_A', 'rama 1: solo OPTIONAL clasificable, sin REQUIRED → N_A (INV-36)');
ok(tieneFlag(E.posicionEFO(part([])), 'SIN_REQUIRED_CLASIFICABLE'), '...+ flag SIN_REQUIRED_CLASIFICABLE');

// rama 2 — cualquier REQUIRED D gana de plano
eq(posDe([{ p: 'D' }]), 'D', 'rama 2: un REQUIRED D → D');
eq(posDe([{ p: 'F' }, { p: 'F' }, { p: 'D' }]), 'D', 'rama 2 / AC76: MAYORÍA F + un REQUIRED D → D (sin votación)');
eq(posDe([{ p: 'F' }, { p: 'D' }]), 'D', 'rama 2: {F,D} REQUIRED → D, NO I (DIFIERE de §15/§18 donde F+D → I)');
eq(posDe([{ p: 'F' }, { p: 'I' }, { p: 'D' }]), 'D', 'rama 2: {F,I,D} REQUIRED → D (D domina I y F)');

// rama 3
eq(posDe([{ p: 'I' }]), 'I', 'rama 3: un REQUIRED I (sin D) → I');
eq(posDe([{ p: 'F' }, { p: 'I' }]), 'I', 'rama 3: {F,I} REQUIRED (sin D) → I');

// rama 4 / 5
eq(posDe([{ p: 'F' }, { a: 'OPTIONAL', p: 'D' }]), 'I', 'rama 4: todo REQUIRED F + OPTIONAL D → I');
ok(tieneFlag(E.posicionEFO(part([{ p: 'F' }, { a: 'OPTIONAL', p: 'D' }])), 'EFO_I_POR_OPTIONAL_D'), '...+ flag EFO_I_POR_OPTIONAL_D');
eq(posDe([{ p: 'F' }, { a: 'OPTIONAL', p: 'F' }]), 'F', 'rama 5: todo REQUIRED F + OPTIONAL F (no D) → F');
eq(posDe([{ p: 'F' }]), 'F', 'rama 5: un REQUIRED F, sin OPTIONAL → F');
eq(posDe([{ p: 'F' }, { a: 'OPTIONAL', p: 'I' }]), 'F', 'rama 5: OPTIONAL I no dispara nada → F (INV-35: solo OPTIONAL D, y solo a I)');

// exclusividad: OPTIONAL D con REQUIRED I → sigue rama 3 (I), no rama 4
eq(posDe([{ p: 'I' }, { a: 'OPTIONAL', p: 'D' }]), 'I', 'REQUIRED I + OPTIONAL D → I por rama 3 (la 4 exige "todo REQUIRED F")');

// ═══════════════════════════════════════════════════════════════════════
seccion('§20 / INV-38 — deterioration_present ≠ EFO_pos');
// ═══════════════════════════════════════════════════════════════════════

function detDe(specs) { return E.deterioracionEFO(part(specs)).deterioration_present; }
eq(detDe([{ p: 'D' }, { a: 'OPTIONAL', p: 'F' }]), true, 'AC37: REQUIRED D → deterioration_present true');
eq(detDe([{ p: 'I' }]), false, 'AC38: REQUIRED I sin D → deterioration_present false');
eq(detDe([{ p: 'F' }, { a: 'OPTIONAL', p: 'D' }]), true, 'AC39: todo REQUIRED F + OPTIONAL D → deterioration_present true');
eq(detDe([{ p: 'F' }]), false, 'AC40: todo REQUIRED F sin OPTIONAL D → deterioration_present false');
eq(detDe([{ a: 'OPTIONAL', p: 'F' }]), false, 'AC41: sin REQUIRED clasif + OPTIONAL F → deterioration_present false');
// AC42 — el caso decisivo: pos N_A pero deterioration_present true
var ac42 = part([{ a: 'OPTIONAL', p: 'D' }]);
eq([E.posicionEFO(ac42).pos, E.deterioracionEFO(ac42).deterioration_present], ['N_A', true],
   'AC42: sin REQUIRED clasificable + OPTIONAL D → EFO_pos N_A PERO deterioration_present true (INV-34)');
ok(tieneFlag(E.deterioracionEFO(ac42), 'DETERIORO_SOLO_EN_OPTIONAL'), '...+ flag DETERIORO_SOLO_EN_OPTIONAL');

// ═══════════════════════════════════════════════════════════════════════
seccion('coberturaEFO — FULL | PARTIAL | LIMITED | INSUFFICIENT (ambig. AW)');
// ═══════════════════════════════════════════════════════════════════════

function covDe(specs) { return E.coberturaEFO(part(specs)); }
eq(covDe([{ p: 'F' }, { p: 'D' }]).coverage_status, 'FULL', 'los 2 REQUIRED clasificables → FULL');
eq(covDe([{ p: 'F' }, { p: 'F' }]).required_coverage_complete, true, '...required_coverage_complete = true');
var parc = E._particionarDominios([ds({ domain_id: 'd0', pos: 'F' }), ds({ domain_id: 'd1', pos: 'F', admissibility: 'NOT_ADMISSIBLE' })]);
eq(E.coberturaEFO(parc).coverage_status, 'PARTIAL', '1 de 2 REQUIRED clasificable → PARTIAL');
eq(E.coberturaEFO(parc).required_coverage_complete, false, '...required_coverage_complete = false');
eq(covDe([{ a: 'OPTIONAL', p: 'F' }]).coverage_status, 'LIMITED', '0 REQUIRED clasificable + OPTIONAL clasificable → LIMITED');
eq(covDe([]).coverage_status, 'INSUFFICIENT', 'nada clasificable → INSUFFICIENT');
var soloReqNoAdm = E._particionarDominios([ds({ pos: 'F', admissibility: 'NOT_ADMISSIBLE' })]);
eq(E.coberturaEFO(soloReqNoAdm).coverage_status, 'INSUFFICIENT', 'REQUIRED presente pero ninguno clasificable, sin OPTIONAL → INSUFFICIENT');

// ═══════════════════════════════════════════════════════════════════════
seccion('§20.1 — admisibilidadEFO: asimetría F/D + las dos I');
// ═══════════════════════════════════════════════════════════════════════

function admDe(specs) {
  var p = part(specs);
  return E.admisibilidadEFO({
    pos: E.posicionEFO(p).pos,
    coverage_status: E.coberturaEFO(p).coverage_status,
    required_coverage_complete: E.coberturaEFO(p).required_coverage_complete,
    part: p
  });
}

eq(admDe([{ a: 'OPTIONAL', p: 'D' }]).admissibility, 'NOT_ADMISSIBLE', 'pos N_A → NOT_ADMISSIBLE');

// dirección F — exige required_coverage_complete
eq(admDe([{ p: 'F' }, { p: 'F' }]).admissibility, 'ADMISSIBLE', 'F + FULL → ADMISSIBLE');
var fParc = E.admisibilidadEFO({ pos: 'F', coverage_status: 'PARTIAL', required_coverage_complete: false, part: part([{ p: 'F' }]) });
eq(fParc.admissibility, 'NOT_ADMISSIBLE', '§20.1 F: sin required_coverage_complete → NOT_ADMISSIBLE (INV-37)');
ok(tieneFlag(fParc, 'REQUIRED_COVERAGE_INCOMPLETA_F'), '...+ flag REQUIRED_COVERAGE_INCOMPLETA_F');

// dirección D — NO exige cobertura completa
var dParc = E.admisibilidadEFO({ pos: 'D', coverage_status: 'PARTIAL', required_coverage_complete: false, part: E._particionarDominios([ds({ pos: 'D', admissibility: 'ADMISSIBLE' })]) });
eq(dParc.admissibility, 'ADMISSIBLE_WITH_LIMITATIONS', '§20.1 D: cobertura PARTIAL + REQUIRED D válido → ADMISSIBLE_WITH_LIMITATIONS (D no exige cobertura completa)');
eq(admDe([{ p: 'D' }]).admissibility, 'ADMISSIBLE', 'D + FULL + REQUIRED D válido → ADMISSIBLE');
var dSin = E.admisibilidadEFO({ pos: 'D', coverage_status: 'FULL', required_coverage_complete: true, part: E._particionarDominios([ds({ pos: 'D', admissibility: 'NOT_ADMISSIBLE' })]) });
eq(dSin.admissibility, 'NOT_ADMISSIBLE', 'pos D pero ningún REQUIRED D válido → NOT_ADMISSIBLE');

// asimetría explícita
ok(fParc.admissibility === 'NOT_ADMISSIBLE' && dParc.admissibility === 'ADMISSIBLE_WITH_LIMITATIONS',
   'ASIMETRÍA §20.1: con cobertura parcial, F → NOT_ADMISSIBLE y D → ADMISSIBLE_WITH_LIMITATIONS');

// las dos I (DECISIÓN etiquetada)
eq(admDe([{ p: 'I' }]).admissibility, 'ADMISSIBLE', 'I de rama 3 (REQUIRED I) → ADMISSIBLE');
var i4 = admDe([{ p: 'F' }, { a: 'OPTIONAL', p: 'D' }]);
eq(i4.admissibility, 'ADMISSIBLE_WITH_LIMITATIONS', 'I de rama 4 (forzada por OPTIONAL D) → ADMISSIBLE_WITH_LIMITATIONS (DECISIÓN: origen epistémico distinto)');
ok(tieneFlag(i4, 'EFO_I_ADMISIBILIDAD_LIMITADA_POR_OPTIONAL'), '...+ flag EFO_I_ADMISIBILIDAD_LIMITADA_POR_OPTIONAL');

// ═══════════════════════════════════════════════════════════════════════
seccion('_particionarDominios — NOT_APPLICABLE se ignora');
// ═══════════════════════════════════════════════════════════════════════

var conNA = E._particionarDominios([ds({ pos: 'D' }), ds({ domain_id: 'x', applicability: 'NOT_APPLICABLE', pos: 'D' })]);
eq(conNA.requiredClasificables.length, 1, 'un DOMAIN_STATE NOT_APPLICABLE no entra en ninguna lista');
eq(E.posicionEFO(conNA).pos, 'D', '...y no afecta la posición');
ok(tieneFlag(E._particionarDominios([ds({ applicability: 'RARO', pos: 'F' })]), 'DOMAIN_STATE_SIN_APPLICABILITY'), 'applicability desconocida → flag');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones 9a — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. posicionEFO: rama 1 (R=∅) → `F` en vez de `N_A` → 4 rojos (los 3 de "→ N_A"');
console.log('     + AC42 pos).');
console.log('  2. [EFO ≠ §18] posicionEFO: rama 2 `_hayPos(R,D) → D` → `→ I` (mezcla como §18)');
console.log('     → 6 rojos (los 4 casos de rama 2 + admisibilidad D + partición). LA mutación');
console.log('     que prueba que EFO no sigue el patrón de §15/§18.');
console.log('  3. posicionEFO: rama 2 exige que TODOS los REQUIRED sean D (no "al menos uno") →');
console.log('     3 rojos ({F,D}→F, {F,I,D}→I, AC76→F).');
console.log('  4. posicionEFO: rama 3 antes de rama 2 (I gana sobre D) → 1 rojo ("{F,I,D} → D").');
console.log('  5. posicionEFO: rama 4 no mira OPTIONAL D → 4 rojos ("todo REQUIRED F + OPTIONAL D');
console.log('     → I" pos/flag + la admisibilidad de esa I).');
console.log('  6. deterioracionEFO: quitar la parte OPTIONAL → 2 rojos (AC39, AC42).');
console.log('  7. coberturaEFO: LIMITED colapsa a INSUFFICIENT → 1 rojo ("OPTIONAL clasif → LIMITED").');
console.log('  8. coberturaEFO: required_coverage_complete = (reqCla.length > 0) → 1 rojo');
console.log('     ("PARTIAL → required_coverage_complete false").');
console.log('  9. [asimetría F] admisibilidadEFO: F sin el chequeo required_coverage_complete →');
console.log('     3 rojos (INV-37 valor + flag + el assert de la asimetría).');
console.log('  10. [asimetría D] admisibilidadEFO: D exige coverage FULL (usa la regla de F) →');
console.log('      2 rojos (D+PARTIAL+REQUIRED D válido + el assert de la asimetría).');
console.log('  11. admisibilidadEFO: las dos I colapsan (rama 4 → ADMISSIBLE) → 2 rojos');
console.log('      ("I rama 4 → ADMISSIBLE_WITH_LIMITATIONS" valor + flag).');
console.log('  Conteos 9a: 4, 6, 3, 1, 4, 2, 1, 1, 3, 2, 2.');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
