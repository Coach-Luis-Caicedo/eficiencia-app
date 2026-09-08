/**
 * motor-piio/domain.test.js — Fase 8
 * node motor-piio/domain.test.js
 *
 * Motor PHENOMENON → DOMAIN (§18–19). Oráculo conductual: AC32 (sin CORE
 * utilizable → N_A), AC33 (CORE F + SUPPORTING D → I), AC34 (CORE D +
 * SUPPORTING F → D), AC35 (CORE F+D → I), AC36 (I por divergencia →
 * admisible). INV-18/19/20/21/31.
 */

'use strict';

var D = require('./domain');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }
function tieneFlag(o, f) { return (o && o.flags || []).some(function (x) { return x === f || x.indexOf(f + ':') === 0; }); }

// PHENOMENON_STATE mínimo (la forma que produce Fase 7)
function ps(over) {
  return Object.assign({
    phenomenon_id: 'ph?', node_id: 'n1', period: '2026-03',
    pos: 'F', traj: 'STABLE', pers: 'N_A', det_run: 0,
    admissibility: 'ADMISSIBLE', freshness: 'CURRENT'
  }, over || {});
}
function dspec(over) {
  return Object.assign({
    domain_id: 'PRODUCTIVITY', definition: 'x',
    applicability_by_context: { orgA: 'REQUIRED' },
    core_phenomenon_ids: ['c1'], supporting_phenomenon_ids: ['s1'], version: 'v1'
  }, over || {});
}
function inDom(over) {
  return Object.assign({ domainSpec: dspec(), contexto: 'orgA', phenomenonStates: [], node_id: 'n1', period: '2026-03' }, over || {});
}

// helper: colapso directo con listas de pos
function col(corePos, suppPos) {
  return D._colapsarDominio(
    (corePos || []).map(function (p, i) { return ps({ phenomenon_id: 'c' + i, pos: p }); }),
    (suppPos || []).map(function (p, i) { return ps({ phenomenon_id: 's' + i, pos: p }); })
  );
}

// ═══════════════════════════════════════════════════════════════════════
seccion('§18 — tabla CORE/SUPPORTING (COMPLETA: 8 filas)');
// ═══════════════════════════════════════════════════════════════════════

eq(col([], ['D']).pos, 'N_A', 'fila 1: ninguno CORE + SUPPORTING D → N_A (INV-19: SUPPORTING no sustituye)');
ok(tieneFlag(col([], []), 'SIN_CORE_UTILIZABLE'), '...+ flag SIN_CORE_UTILIZABLE');
eq(col(['F'], []).pos, 'F', 'fila 2: solo F CORE + sin SUPPORTING D → F');
eq(col(['F'], ['D']).pos, 'I', 'fila 3: solo F CORE + SUPPORTING D → I (AC33 / INV-21)');
eq(col(['F', 'I'], []).pos, 'F', 'fila 4: F+I CORE + sin SUPPORTING D → F');
eq(col(['F', 'I'], ['D']).pos, 'I', 'fila 5: F+I CORE + SUPPORTING D → I');
eq(col(['I'], ['F', 'D']).pos, 'I', 'fila 6: solo I CORE → I (SUPPORTING irrelevante)');
eq(col(['D'], ['F']).pos, 'D', 'fila 7: D sin F CORE + SUPPORTING F → D (AC34 / INV-20: no se neutraliza)');
eq(col(['D', 'I'], ['F']).pos, 'D', 'fila 7bis: {D,I} sin F → D');
eq(col(['F', 'D'], ['F']).pos, 'I', 'fila 8: F+D CORE → I (AC35, SUPPORTING irrelevante)');
eq(col(['F', 'D', 'I'], []).pos, 'I', 'fila 8bis: {F,D,I} CORE → I');
// order-independent
eq(D._colapsarDominio([ps({ pos: 'D' }), ps({ pos: 'F' })], []).pos, D._colapsarDominio([ps({ pos: 'F' }), ps({ pos: 'D' })], []).pos, 'el colapso no depende del orden de los CORE');

seccion('§18 — SUPPORTING solo mueve F→I, nunca resuelve ni mejora');

eq(col([], ['F', 'D', 'I']).pos, 'N_A', 'SUPPORTING con evidencia fuerte + sin CORE → sigue N_A (INV-19)');
eq(col(['D'], ['F', 'F']).pos, 'D', 'SUPPORTING F junto a CORE D → sigue D (INV-20: no mejora)');
eq(col(['D'], ['D']).pos, 'D', 'SUPPORTING D junto a CORE D → sigue D (fila 7 "D sin F + cualquiera"; el flip por SUPPORTING D es SOLO cuando el núcleo es F)');
eq(col(['D', 'I'], ['D']).pos, 'D', '{D,I} CORE + SUPPORTING D → sigue D (idem)');
eq(col(['I'], ['F']).pos, 'I', 'SUPPORTING F junto a CORE solo-I → sigue I (no mejora)');
eq(col(['I'], ['D']).pos, 'I', 'SUPPORTING D junto a CORE solo-I → sigue I (fila 6 "solo I + cualquiera"; SUPPORTING D no lo lleva a nada)');
eq(col(['F'], ['F', 'I']).pos, 'F', 'SUPPORTING F/I (sin D) junto a CORE F → sigue F (solo D dispara el flip)');

// ═══════════════════════════════════════════════════════════════════════
seccion('resolverAplicabilidad (ambig. AV)');
// ═══════════════════════════════════════════════════════════════════════

eq(D.resolverAplicabilidad(dspec({ applicability_by_context: { orgA: 'REQUIRED' } }), 'orgA').applicability, 'REQUIRED', 'contexto presente en el mapa → su valor');
eq(D.resolverAplicabilidad(dspec({ applicability_by_context: { DEFAULT: 'OPTIONAL' } }), 'orgZ').applicability, 'OPTIONAL', 'contexto ausente pero hay DEFAULT → DEFAULT');
var ctxNo = D.resolverAplicabilidad(dspec({ applicability_by_context: { orgA: 'REQUIRED' } }), 'orgZ');
eq(ctxNo.applicability, 'NOT_APPLICABLE', 'contexto ausente sin DEFAULT → NOT_APPLICABLE');
ok(tieneFlag(ctxNo, 'CONTEXTO_NO_RESUELTO'), '...+ flag CONTEXTO_NO_RESUELTO');
ok(tieneFlag(D.resolverAplicabilidad(dspec({ applicability_by_context: { orgA: 'MANDATORIO' } }), 'orgA'), 'APPLICABILITY_INVALIDA'), 'valor no enum → NOT_APPLICABLE + flag');

// ═══════════════════════════════════════════════════════════════════════
seccion('coberturaDominio — 3 valores sobre core_phenomenon_ids');
// ═══════════════════════════════════════════════════════════════════════

var spec2 = dspec({ core_phenomenon_ids: ['c1', 'c2'] });
eq(D.coberturaDominio(spec2, [ps({ phenomenon_id: 'c1', pos: 'F' }), ps({ phenomenon_id: 'c2', pos: 'D' })]).coverage_status, 'COMPLETE', 'los 2 CORE cubiertos → COMPLETE');
eq(D.coberturaDominio(spec2, [ps({ phenomenon_id: 'c1', pos: 'F' })]).coverage_status, 'PARTIAL', '1 de 2 CORE → PARTIAL');
eq(D.coberturaDominio(spec2, []).coverage_status, 'NONE', '0 CORE → NONE');
// un CORE con pos N_A o NOT_ADMISSIBLE no cubre
eq(D.coberturaDominio(spec2, [ps({ phenomenon_id: 'c1', pos: 'F' }), ps({ phenomenon_id: 'c2', pos: 'N_A' })]).coverage_status, 'PARTIAL', 'CORE con pos N_A → no cubre → PARTIAL');
eq(D.coberturaDominio(spec2, [ps({ phenomenon_id: 'c1', pos: 'F' }), ps({ phenomenon_id: 'c2', pos: 'D', admissibility: 'NOT_ADMISSIBLE' })]).coverage_status, 'PARTIAL', 'CORE NOT_ADMISSIBLE → no cubre → PARTIAL');
var covDet = D.coberturaDominio(spec2, [ps({ phenomenon_id: 'c1', pos: 'F' })]);
eq(covDet.core_faltantes, ['c2'], '...core_faltantes lista c2');

// ═══════════════════════════════════════════════════════════════════════
seccion('§19 — admisibilidadDominio: asimetría F/D');
// ═══════════════════════════════════════════════════════════════════════

eq(D.admisibilidadDominio({ pos: 'I', coverage_status: 'PARTIAL' }).admissibility, 'ADMISSIBLE', 'I → ADMISSIBLE aunque cobertura parcial (AC36: I altamente admisible)');
eq(D.admisibilidadDominio({ pos: 'N_A', coverage_status: 'COMPLETE' }).admissibility, 'NOT_ADMISSIBLE', 'N_A → NOT_ADMISSIBLE');

// ── dirección F: F exige cobertura COMPLETE (§19) ──
var adF = D.admisibilidadDominio({ pos: 'F', coverage_status: 'PARTIAL', coreUtilizables: [ps({ pos: 'F' })] });
eq(adF.admissibility, 'NOT_ADMISSIBLE', '§19 F: cobertura PARTIAL → NOT_ADMISSIBLE (F exige cobertura suficiente)');
ok(tieneFlag(adF, 'COBERTURA_CORE_INCOMPLETA_F'), '...+ flag COBERTURA_CORE_INCOMPLETA_F');
eq(D.admisibilidadDominio({ pos: 'F', coverage_status: 'COMPLETE', coreUtilizables: [ps({ pos: 'F' })] }).admissibility, 'ADMISSIBLE', 'F + COMPLETE → ADMISSIBLE');

// ── dirección D: D NO exige cobertura, solo ≥1 CORE D válido (§19) ──
var adD = D.admisibilidadDominio({ pos: 'D', coverage_status: 'PARTIAL', coreUtilizables: [ps({ pos: 'D', admissibility: 'ADMISSIBLE' })] });
eq(adD.admissibility, 'ADMISSIBLE_WITH_LIMITATIONS', '§19 D: PARTIAL + ≥1 CORE D válido → ADMISSIBLE_WITH_LIMITATIONS (D no exige cobertura)');
eq(D.admisibilidadDominio({ pos: 'D', coverage_status: 'COMPLETE', coreUtilizables: [ps({ pos: 'D', admissibility: 'ADMISSIBLE' })] }).admissibility, 'ADMISSIBLE', 'D + COMPLETE + CORE D válido → ADMISSIBLE');
var adDsin = D.admisibilidadDominio({ pos: 'D', coverage_status: 'COMPLETE', coreUtilizables: [ps({ pos: 'D', admissibility: 'ADMISSIBLE_WITH_LIMITATIONS' })] });
eq(adDsin.admissibility, 'ADMISSIBLE', 'D con CORE D "ADMISSIBLE_WITH_LIMITATIONS" → sigue contando como válido (empieza con ADMISSIBLE)');
eq(D.admisibilidadDominio({ pos: 'D', coverage_status: 'COMPLETE', coreUtilizables: [ps({ pos: 'D', admissibility: 'NOT_ADMISSIBLE' })] }).admissibility, 'NOT_ADMISSIBLE', 'D sin ningún CORE D válido → NOT_ADMISSIBLE');

// asimetría explícita
ok(adF.admissibility === 'NOT_ADMISSIBLE' && adD.admissibility === 'ADMISSIBLE_WITH_LIMITATIONS',
   'ASIMETRÍA §19: con cobertura PARTIAL, F → NOT_ADMISSIBLE y D → ADMISSIBLE_WITH_LIMITATIONS');

// ═══════════════════════════════════════════════════════════════════════
seccion('Ambig. J — _phenStateGobernante: el peor alineado');
// ═══════════════════════════════════════════════════════════════════════

var gob = D._phenStateGobernante([
  ps({ phenomenon_id: 'pA', pos: 'D', traj: 'STABLE', pers: 'POINT', det_run: 2 }),
  ps({ phenomenon_id: 'pB', pos: 'D', traj: 'DETERIORATING', pers: 'REPEATED', det_run: 1 })
]);
eq(gob.phenomenon_id, 'pB', 'gana pB (traj DETERIORATING > STABLE)');
eq(D._phenStateGobernante([ps({ phenomenon_id: 'pX', pos: 'D', traj: 'STABLE', pers: 'POINT', det_run: 1 }), ps({ phenomenon_id: 'pY', pos: 'D', traj: 'STABLE', pers: 'POINT', det_run: 4 })]).phenomenon_id, 'pY', 'desempate por det_run desc');
eq(D._phenStateGobernante([]), null, 'sin alineados → null');

// ═══════════════════════════════════════════════════════════════════════
seccion('propagarTemporalidadDominio — traj/pers según pos');
// ═══════════════════════════════════════════════════════════════════════

eq([D.propagarTemporalidadDominio('D', ps({ traj: 'DETERIORATING', pers: 'PERSISTENT', det_run: 3 })).traj, D.propagarTemporalidadDominio('D', ps({ traj: 'DETERIORATING', pers: 'PERSISTENT', det_run: 3 })).pers], ['DETERIORATING', 'PERSISTENT'], 'pos D → traj/pers del gobernante');
eq(D.propagarTemporalidadDominio('F', ps({ traj: 'IMPROVING', pers: 'PERSISTENT' })).pers, 'N_A', 'pos F → pers N_A (§11)');
eq([D.propagarTemporalidadDominio('I', ps({ traj: 'DETERIORATING', pers: 'PERSISTENT' })).traj, D.propagarTemporalidadDominio('I', ps({ traj: 'DETERIORATING' })).pers], ['N_A', 'N_A'], 'pos I → traj = pers = N_A (DECISIÓN)');
eq(D.propagarTemporalidadDominio('N_A', ps({ traj: 'STABLE' })).traj, 'N_A', 'pos N_A → traj N_A');

// ═══════════════════════════════════════════════════════════════════════
seccion('resolverDominio — DOMAIN_STATE completo (§18.1, 17 campos)');
// ═══════════════════════════════════════════════════════════════════════

// NOT_APPLICABLE → sin posición inventada (línea 1731)
var na = D.resolverDominio(inDom({
  domainSpec: dspec({ applicability_by_context: { orgA: 'NOT_APPLICABLE' } }),
  phenomenonStates: [ps({ phenomenon_id: 'c1', pos: 'D' })]
}));
eq([na.applicability, na.pos], ['NOT_APPLICABLE', 'N_A'], 'NOT_APPLICABLE → pos N_A, sin colapsar (línea 1731: no posición inventada)');
ok(tieneFlag(na, 'DOMINIO_NO_APLICABLE'), '...+ flag DOMINIO_NO_APLICABLE');
eq(Object.keys(na).length, 17, '...el DOMAIN_STATE tiene 17 campos');

// caso CORE D → dominio D
var domD = D.resolverDominio(inDom({
  domainSpec: dspec({ core_phenomenon_ids: ['c1'], supporting_phenomenon_ids: ['s1'] }),
  phenomenonStates: [
    ps({ phenomenon_id: 'c1', pos: 'D', traj: 'DETERIORATING', pers: 'REPEATED', det_run: 2, admissibility: 'ADMISSIBLE' }),
    ps({ phenomenon_id: 's1', pos: 'F', admissibility: 'ADMISSIBLE' })
  ]
}));
eq(Object.keys(domD).length, 17, 'DOMAIN_STATE de 17 campos');
ok(D.validarDomainState(domD).ok, 'validarDomainState → ok');
eq([domD.pos, domD.traj, domD.pers, domD.det_run], ['D', 'DETERIORATING', 'REPEATED', 2], 'CORE D + SUPPORTING F → pos D, traj/pers propagados (INV-20)');
eq(domD.deterioration_present, true, 'pos D → deterioration_present true');
eq(domD.admissibility, 'ADMISSIBLE', 'D + COMPLETE + CORE D válido → ADMISSIBLE');
eq(domD.core_profile.length, 1, 'core_profile: un resumen por CORE');
eq(domD.supporting_profile.length, 1, 'supporting_profile: un resumen por SUPPORTING');
eq(domD.applicability, 'REQUIRED', 'applicability resuelta del contexto');

// caso CORE F + SUPPORTING D → I, deterioration_present por el SUPPORTING... no: por CORE. Aquí CORE es F.
var domI = D.resolverDominio(inDom({
  domainSpec: dspec({ core_phenomenon_ids: ['c1'], supporting_phenomenon_ids: ['s1'] }),
  phenomenonStates: [
    ps({ phenomenon_id: 'c1', pos: 'F', admissibility: 'ADMISSIBLE' }),
    ps({ phenomenon_id: 's1', pos: 'D', admissibility: 'ADMISSIBLE' })
  ]
}));
eq(domI.pos, 'I', 'CORE F + SUPPORTING D → I (AC33)');
eq([domI.traj, domI.pers], ['N_A', 'N_A'], '...traj = pers = N_A (pos I)');
eq(domI.deterioration_present, false, '...deterioration_present false (el CORE no es D; el SUPPORTING D no cuenta para deterioro de dominio)');
eq(domI.admissibility, 'ADMISSIBLE', 'I → ADMISSIBLE (AC36)');

// caso F+D CORE → I con deterioration_present true
var domIfd = D.resolverDominio(inDom({
  domainSpec: dspec({ core_phenomenon_ids: ['c1', 'c2'], supporting_phenomenon_ids: [] }),
  phenomenonStates: [ps({ phenomenon_id: 'c1', pos: 'F', admissibility: 'ADMISSIBLE' }), ps({ phenomenon_id: 'c2', pos: 'D', admissibility: 'ADMISSIBLE' })]
}));
eq([domIfd.pos, domIfd.deterioration_present], ['I', true], 'CORE F+D → I + deterioration_present true (hubo CORE D)');

// fenómeno que no está en ninguna lista → flag, se ignora
var domHuerf = D.resolverDominio(inDom({
  domainSpec: dspec({ core_phenomenon_ids: ['c1'], supporting_phenomenon_ids: [] }),
  phenomenonStates: [ps({ phenomenon_id: 'c1', pos: 'F', admissibility: 'ADMISSIBLE' }), ps({ phenomenon_id: 'xx', pos: 'D', admissibility: 'ADMISSIBLE' })]
}));
eq(domHuerf.pos, 'F', 'un fenómeno sin rol en el dominio se ignora (xx no arrastra la pos a I)');
ok(tieneFlag(domHuerf, 'PHENOMENON_SIN_ROL_EN_DOMINIO'), '...+ flag PHENOMENON_SIN_ROL_EN_DOMINIO');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. _colapsarDominio: S vacío → `F` en vez de `N_A` → fila 1 / AC32 / INV-19 cae.');
console.log('  2. _colapsarDominio: `S.F && S.D → I` → `D` → fila 8 / AC35 cae.');
console.log('  3. [INV-20] _colapsarDominio: mover el chequeo `suppD` ANTES de `if (S.D)` (el flip');
console.log('     por SUPPORTING D aplica también al núcleo D) → 2 rojos: "CORE D + SUPP D → D"');
console.log('     (fila 7) y "{D,I} + SUPP D → D" (pasarían a I). Una formulación más estrecha');
console.log('     de esta mutación quedaba enmascarada hasta añadir esos 2 asserts.');
console.log('  4. [INV-21] _colapsarDominio: quitar el chequeo `suppD` → "solo F + SUPP D → I"');
console.log('     (filas 3, 5) cae, da F.');
console.log('  5. [INV-19/20 opuesto] _colapsarDominio: SUPPORTING `F` también dispara el flip →');
console.log('     "SUPPORTING F/I sin D + CORE F → F" cae (el flip es específico a D).');
console.log('  6. resolverDominio: NOT_APPLICABLE no corta → colapsa igual → "NOT_APPLICABLE → pos');
console.log('     N_A sin colapso" cae (línea 1731).');
console.log('  7. coberturaDominio: CORE con pos N_A cuenta como cubierto → "CORE N_A → PARTIAL" cae.');
console.log('  8. [asimetría F] admisibilidadDominio: F + PARTIAL → ADMISSIBLE → §19 "F exige');
console.log('     cobertura suficiente" cae.');
console.log('  9. [asimetría D] admisibilidadDominio: D + PARTIAL usa la regla de F (→');
console.log('     NOT_ADMISSIBLE) → §19 "D solo exige ≥1 CORE D válido" cae.');
console.log('  10. _phenStateGobernante: `[0]` sin ordenar → "gana pB" y el desempate por det_run caen (J).');
console.log('  11. propagarTemporalidadDominio: `pos ∈ {I,N_A}` propaga traj → "pos I → traj/pers N_A" cae.');
console.log('  12. resolverDominio: deterioration_present sin la rama `pos===I && huboCoreD` →');
console.log('      "CORE F+D → I + deterioration_present true" cae.');
console.log('  Conteos: 2, 3, 2, 4, 1, 2, 1, 3, 2, 2, 2, 1.');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
