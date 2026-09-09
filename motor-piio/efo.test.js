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
//  9b — §21 traj/pers + scope + orquestador resolverEFO → EFO_STATE (§24)
// ═══════════════════════════════════════════════════════════════════════

function tj(prev, act, o) { return E.trayectoriaEFO(act, prev, o); }

seccion('§21 — trayectoriaEFO: transiciones de posición');

eq(E.trayectoriaEFO('F', null, {}).traj, 'N_A', 'sin posPrevio → N_A (sin comparación temporal admisible)');
eq(E.trayectoriaEFO('F', 'D', { comparacionAdmisible: false }).traj, 'N_A', 'comparacionAdmisible:false → N_A');
// mejora
eq(tj('D', 'I', {}).traj, 'IMPROVING', 'D→I → IMPROVING (cambio no por pérdida de evidencia)');
eq(tj('D', 'F', {}).traj, 'IMPROVING', 'D→F → IMPROVING');
eq(tj('I', 'F', {}).traj, 'IMPROVING', 'I→F → IMPROVING');
// AC46 — pérdida de evidencia
var perdEv = tj('D', 'I', { porPerdidaEvidencia: true });
eq(perdEv.traj, 'N_A', 'AC46: D→I por pérdida de evidencia → NO IMPROVING (decisión: N_A)');
ok(tieneFlag(perdEv, 'MEJORA_APARENTE_POR_PERDIDA_EVIDENCIA'), '...+ flag MEJORA_APARENTE_POR_PERDIDA_EVIDENCIA');
// deterioro — AX
var det = tj('F', 'D', {});
eq(det.traj, 'DETERIORATING', 'AX: F→D sin confirmar operación real → default DETERIORATING (no se oculta la señal)');
ok(tieneFlag(det, 'CAMBIO_OPERACIONAL_NO_CONFIRMADO'), '...+ flag CAMBIO_OPERACIONAL_NO_CONFIRMADO');
eq(tj('F', 'D', { cambioOperacionalReal: true }).flags.length, 0, '...confirmado operación real → DETERIORATING sin flag');
var detNo = tj('I', 'D', { cambioOperacionalReal: false });
eq(detNo.traj, 'N_A', 'AX: I→D + cambioOperacionalReal:false → N_A');
ok(tieneFlag(detNo, 'CAMBIO_NO_REFLEJA_OPERACION_REAL'), '...+ flag CAMBIO_NO_REFLEJA_OPERACION_REAL');

seccion('§21 — trayectoriaEFO: D→D con configuración de dominios (AC44/45)');

eq(tj('D', 'D', { dDominiosPrev: 3, dDominiosActual: 1, nuevosDeterioros: false }).traj, 'IMPROVING', 'AC44: D constante + menos dominios D + sin nuevos → IMPROVING');
eq(tj('D', 'D', { dDominiosPrev: 1, dDominiosActual: 3, nuevosDeterioros: true }).traj, 'DETERIORATING', 'AC45: D constante + nuevos dominios D → DETERIORATING');
eq(tj('D', 'D', { dDominiosPrev: 3, dDominiosActual: 3, nuevosDeterioros: false }).traj, 'STABLE', 'D constante + igual nº dominios D + sin nuevos → STABLE');
var ddSinInfo = tj('D', 'D', {});
eq(ddSinInfo.traj, 'STABLE', 'D→D sin conteos de dominios → STABLE (no se inventa IMPROVING/DETERIORATING)');
ok(tieneFlag(ddSinInfo, 'CONFIG_DOMINIOS_NO_COMPARADA'), '...+ flag CONFIG_DOMINIOS_NO_COMPARADA');
// misma pos no-D
eq(tj('F', 'F', {}).traj, 'STABLE', 'F→F → STABLE');
eq(tj('I', 'I', {}).traj, 'STABLE', 'I→I → STABLE');
// INV-41: "salir de D" NO es alcanzar F — trayectoriaEFO no toca pos, solo traj
eq(tj('D', 'I', {}).traj, 'IMPROVING', 'D→I es IMPROVING pero la POS la fijó la regla de 5 ramas — trayectoriaEFO nunca convierte "salir de D" en pos F (INV-41)');

seccion('§21 — persistenciaEFO: sobre historia de EFO_pos (INV-39)');

var p3D = E.persistenciaEFO(['D', 'D', 'D'], ['2026-01', '2026-02', '2026-03'], {});
eq([p3D.pers, p3D.det_run], ['REPEATED', 3], 'D,D,D → det_run 3, pers REPEATED (PERS_* sin calibrar)');
ok(tieneFlag(p3D, 'PERS_EFO_NO_CALIBRADA'), '...+ flag PERS_EFO_NO_CALIBRADA');
eq(E.persistenciaEFO(['F', 'D'], ['2026-01', '2026-02'], {}).pers, 'POINT', 'F,D → det_run 1 → POINT');
eq(E.persistenciaEFO(['D', 'F'], ['2026-01', '2026-02'], {}).pers, 'N_A', 'pos actual F (no D) → pers N_A (§11)');
eq(E.persistenciaEFO(['D', 'D', 'F', 'D'], ['2026-01', '2026-02', '2026-03', '2026-04'], {}).det_run, 1, 'D,D,F,D → el F cierra el run → det_run 1 (historia EFO, no herencia de dominios)');
var locus = E.persistenciaEFO(['D', 'D', 'D'], ['2026-01', '2026-02', '2026-03'], { locusVariable: true });
ok(tieneFlag(locus, 'LOCUS_DETERIORO_VARIABLE'), 'AC43: locus del deterioro variable → flag LOCUS_DETERIORO_VARIABLE');
eq(locus.pers, 'REPEATED', '...pero pers sigue la regla de det_run (no se afirma "mismo problema")');

seccion('resolverScope (ambig. O materializada)');

eq(E.resolverScope({ scope_rules: { scope: 'ORGANIZATIONAL' } }).scope, 'ORGANIZATIONAL', 'scope_rules.scope válido → ese valor');
eq(E.resolverScope({ scope_rules: { scope: 'SEGMENT_ONLY' } }).scope, 'SEGMENT_ONLY', 'SEGMENT_ONLY → ese valor');
var scNo = E.resolverScope({});
eq(scNo.scope, 'SEGMENT_ONLY', 'sin scope_rules → SEGMENT_ONLY (DECISIÓN: no auto-eleva a organizacional, INV-47)');
ok(tieneFlag(scNo, 'SCOPE_NO_RESUELTO'), '...+ flag SCOPE_NO_RESUELTO');
ok(tieneFlag(E.resolverScope({ scope_rules: { scope: 'GLOBAL' } }), 'SCOPE_NO_RESUELTO'), 'valor no enum → SEGMENT_ONLY + flag');

seccion('resolverEFO — EFO_STATE completo (§24, 23 campos)');

function dsx(o) {
  return Object.assign({ domain_id: 'd', node_id: 'n1', period: '2026-03', applicability: 'REQUIRED', pos: 'F', admissibility: 'ADMISSIBLE', deterioration_present: false, freshness: 'CURRENT' }, o || {});
}
function inEFO(o) {
  return Object.assign({
    domainStates: [dsx({ domain_id: 'd1' })],
    nodeSpec: { scope_rules: { scope: 'ORGANIZATIONAL' } },
    organization_id: 'org1', node_id: 'n1', period: '2026-03'
  }, o || {});
}

var full = E.resolverEFO(inEFO({
  domainStates: [
    dsx({ domain_id: 'd1', pos: 'D', deterioration_present: true, freshness: 'AGING' }),
    dsx({ domain_id: 'd2', pos: 'F', freshness: 'STALE' })
  ],
  efoPrevio: { pos: 'F' }, opcionesTraj: { cambioOperacionalReal: true },
  historiaEFOPos: ['F', 'D', 'D'], historiaPeriods: ['2026-01', '2026-02', '2026-03']
}));
eq(Object.keys(full).length, 23, 'el EFO_STATE tiene exactamente 23 campos (§24)');
ok(E.validarEFOState(full).ok, 'validarEFOState → ok');
eq([full.pos, full.traj, full.pers], ['D', 'DETERIORATING', 'REPEATED'], 'CORE D REQUIRED → pos D ; F→D → traj DETERIORATING ; historia D,D → pers REPEATED');
eq(full.deterioration_present, true, 'deterioration_present true');
eq(full.freshness, 'STALE', 'freshness = la peor entre los REQUIRED clasificables (STALE > AGING) — decisión');
eq(full.scope, 'ORGANIZATIONAL', 'scope de nodeSpec');
eq(full.node_profile.length, 1, 'node_profile mononodo (Fase 10 extiende)');
eq([full.temporal_pattern, full.series_stability], [null, null], 'temporal_pattern / series_stability → null (opcionales §24, sin serie EFO)');
eq(full.regime_status, 'CONTINUOUS', 'regime_status → default CONTINUOUS');
ok(tieneFlag(full, 'REGIME_STATUS_EFO_POR_DEFECTO'), '...+ flag REGIME_STATUS_EFO_POR_DEFECTO (default etiquetado)');
ok(tieneFlag(full, 'RUN_METADATA_PENDIENTE'), 'piio_run_id/ruleset_version ausentes → flag RUN_METADATA_PENDIENTE (Fase 11)');
ok(tieneFlag(full, 'NODE_PROFILE_MONONODO'), '...+ flag NODE_PROFILE_MONONODO');
eq([full.piio_run_id, full.ruleset_version], [null, null], '...y quedan null (no un valor inventado)');

// ningún campo undefined
var undef = Object.keys(full).filter(function (k) { return full[k] === undefined; });
eq(undef, [], 'ningún campo del EFO_STATE queda undefined');

// run metadata provista → sin flag
var conRun = E.resolverEFO(inEFO({ piio_run_id: 'run1', ruleset_version: 'rs1', regimeStatus: 'NEW_REGIME' }));
ok(!tieneFlag(conRun, 'RUN_METADATA_PENDIENTE'), 'con piio_run_id + ruleset_version → sin flag RUN_METADATA_PENDIENTE');
eq(conRun.regime_status, 'NEW_REGIME', 'regimeStatus provisto → se usa (sin default)');
ok(!tieneFlag(conRun, 'REGIME_STATUS_EFO_POR_DEFECTO'), '...sin flag de default');

// rechazo de score (AC75) vía validarEFOState
var conScore = Object.assign({}, full, { efo_total: 87 });
ok(!E.validarEFOState(conScore).ok, 'validarEFOState rechaza un EFO_STATE con `efo_total` (AC75 / INV-75/76)');

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
seccion('Mutaciones 9b — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. trayectoriaEFO: sin posPrevio → STABLE en vez de N_A → "sin posPrevio → N_A" y');
console.log('     "comparacionAdmisible:false → N_A" caen.');
console.log('  2. trayectoriaEFO: mejora sin la guarda porPerdidaEvidencia → AC46 "D→I por pérdida');
console.log('     de evidencia → N_A" + su flag caen.');
console.log('  3. [AX] trayectoriaEFO: deterioro ignora cambioOperacionalReal === false → "I→D +');
console.log('     cambioOperacionalReal:false → N_A" + su flag caen.');
console.log('  4. trayectoriaEFO: _MEJORA y _DETERIORO intercambiados → D→I da DETERIORATING y');
console.log('     F→D da IMPROVING → varios asserts de transición caen.');
console.log('  5. trayectoriaEFO: D→D con menos dominios D no da IMPROVING (ignora dDominios*) →');
console.log('     AC44 cae.');
console.log('  6. trayectoriaEFO: D→D con nuevosDeterioros no da DETERIORATING → AC45 cae.');
console.log('  7. trayectoriaEFO: el `return STABLE` del bloque D→D → `return IMPROVING` → 2 rojos');
console.log('     ("D→D igual nº dominios → STABLE", "D→D sin conteos → STABLE") — no se inventa dirección.');
console.log('  8. persistenciaEFO: pos actual ≠ D no fuerza pers = N_A → "pos actual F → pers N_A"');
console.log('     (§11) cae.');
console.log('  9. [INV-39] persistenciaEFO: cuenta los `D` crudos de la serie (no continuidadRun) →');
console.log('     "D,D,F,D → det_run 1" cae (heredaría persistencia en vez de historia EFO: da 3).');
console.log('  10. resolverScope: default ORGANIZATIONAL en vez de SEGMENT_ONLY → 1 rojo ("sin');
console.log('      scope_rules → SEGMENT_ONLY", INV-47; el flag SCOPE_NO_RESUELTO se sigue emitiendo).');
console.log('  11. resolverEFO: regime_status default sin el flag REGIME_STATUS_EFO_POR_DEFECTO →');
console.log('      el assert del flag cae.');
console.log('  12. resolverEFO: freshness fijo a CURRENT (no la peor) → "freshness = la peor');
console.log('      (STALE > AGING)" cae.');
console.log('  13. validarEFOState: no encadena validarEFOStateLigero → "rechaza efo_total" (AC75) cae.');
console.log('  Conteos 9b: 2, 2, 2, 11, 1, 1, 2, 1, 1, 1, 1, 1, 1.');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
