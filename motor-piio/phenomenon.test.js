/**
 * motor-piio/phenomenon.test.js — Fase 7
 * node motor-piio/phenomenon.test.js
 *
 * Motor KPI → PHENOMENON (§15–17). 7a: resolución DIRECT/PROXY. 7b:
 * cobertura + admisibilidad del fenómeno.
 * Oráculo conductual: AC23 (DIRECT solo F→F), AC24 (solo D→D), AC25
 * (F+D→I), AC26 (DIRECT F + PROXY D → DIRECT gobierna + flag), AC27 (sin
 * DIRECT + PROXY autorizado → PROXY sustenta), AC28 (sin DIRECT + PROXY
 * no autorizado → N_A). AC30 (F favorable + required faltante → parcial,
 * admisibilidad insuficiente), AC31 (D + parcial suficiente → admisible).
 * INV-14/15/17/22/23/77.
 */

'use strict';

var P = require('./phenomenon');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }
function tieneFlag(o, f) { return (o && o.flags || []).some(function (x) { return x === f || x.indexOf(f + ':') === 0; }); }

// salida de colapsarGrupo (Fase 6)
function grp(pos, prox, over) {
  return Object.assign({ evidence_group_id: 'eg?', pos: pos, evidence_proximity: prox || 'DIRECT', flags: [] }, over || {});
}
function phen(over) { return Object.assign({ phenomenon_id: 'ph1', proxy_allowed_as_primary: false }, over || {}); }

// ═══════════════════════════════════════════════════════════════════════
seccion('§15 — tabla DIRECT (COMPLETA: 7 subconjuntos de {F,D,I})');
// ═══════════════════════════════════════════════════════════════════════

eq(P._colapsarSetDirect([grp('F'), grp('F')]).pos, 'F', '{F} → F (AC23)');
eq(P._colapsarSetDirect([grp('D')]).pos, 'D', '{D} → D (AC24)');
eq(P._colapsarSetDirect([grp('I')]).pos, 'I', '{I} → I');
eq(P._colapsarSetDirect([grp('F'), grp('I')]).pos, 'F', '{F,I} → F');
eq(P._colapsarSetDirect([grp('D'), grp('I')]).pos, 'D', '{D,I} → D');
var fd = P._colapsarSetDirect([grp('F'), grp('D')]);
eq(fd.pos, 'I', '{F,D} → I (AC25 / INV-17: divergencia diagnóstica, NO mayoría, NO N_A como en §14)');
ok(tieneFlag(fd, 'DIRECT_F_D_DIVERGENCIA'), '...+ flag DIRECT_F_D_DIVERGENCIA');
eq(P._colapsarSetDirect([grp('F'), grp('D'), grp('I')]).pos, 'I', '{F,D,I} → I (7ª fila, la única de 3 elementos)');
// resolutivo
eq(P._colapsarSetDirect([]).resolutivo, false, 'sin grupos → resolutivo:false (no hay DIRECT utilizable)');
eq(P._colapsarSetDirect([grp('N_A')]).resolutivo, false, 'grupo DIRECT con pos=N_A → no utilizable, resolutivo:false');

// ═══════════════════════════════════════════════════════════════════════
seccion('Ambigüedad L — grupo DIRECT N_A + INTERNAL_INCONSISTENCY');
// ═══════════════════════════════════════════════════════════════════════

var conIncoh = P._colapsarSetDirect([grp('F'), grp('N_A', 'DIRECT', { evidence_group_id: 'egX', flags: ['INTERNAL_INCONSISTENCY'] })]);
eq(conIncoh.pos, 'F', 'F + grupo(N_A+IC) → F (el grupo inconsistente NO entra al set)');
ok(tieneFlag(conIncoh, 'DIRECT_GRUPO_INCONSISTENTE'), '...pero el flag INTERNAL_INCONSISTENCY del grupo SE PROPAGA (ambig. L)');
// grupo N_A simple (sin IC) → no propaga nada
eq(P._colapsarSetDirect([grp('F'), grp('N_A')]).flags, [], 'F + grupo(N_A simple) → sin flags (ausencia ≠ choque)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Ambigüedad AP — grupo MIXED cuenta como DIRECT');
// ═══════════════════════════════════════════════════════════════════════

var part = P.particionarPorProximidad([grp('F', 'DIRECT'), grp('D', 'MIXED'), grp('I', 'PROXY')]);
eq(part.direct.length, 2, 'DIRECT + MIXED → 2 grupos en direct');
eq(part.proxy.length, 1, 'PROXY → 1 grupo en proxy');
ok(part.flags.some(function (f) { return f.indexOf('PROXIMIDAD_MIXTA_TRATADA_COMO_DIRECT') === 0; }), '...+ flag por el MIXED');
ok(P.particionarPorProximidad([grp('F', 'X')]).flags.some(function (f) { return f.indexOf('GRUPO_SIN_PROXIMIDAD') === 0; }), 'proximidad desconocida → flag GRUPO_SIN_PROXIMIDAD');

// ═══════════════════════════════════════════════════════════════════════
seccion('§15 / INV-14/15 — precedencia DIRECT sobre PROXY (AC26/27/28)');
// ═══════════════════════════════════════════════════════════════════════

// AC26 — DIRECT F + PROXY D → DIRECT gobierna, flag si el PROXY discrepa
var ac26 = P.resolverDirectYProxy([grp('F', 'DIRECT', { evidence_group_id: 'd1' }), grp('D', 'PROXY', { evidence_group_id: 'p1' })], phen());
eq([ac26.pos, ac26.evidence_basis], ['F', 'DIRECT'], 'DIRECT F + PROXY D → pos=F, evidence_basis=DIRECT (INV-14: sin pesos)');
ok(tieneFlag(ac26, 'PROXY_DISCREPA_DE_DIRECT'), '...+ flag PROXY_DISCREPA_DE_DIRECT (AC26 "flag si procede")');
eq(ac26.governing_group_id, 'd1', 'governing_group_id = el grupo DIRECT');
// PROXY que concuerda con DIRECT → sin flag de discrepancia
ok(!tieneFlag(P.resolverDirectYProxy([grp('F', 'DIRECT'), grp('F', 'PROXY')], phen()), 'PROXY_DISCREPA_DE_DIRECT'), 'PROXY concuerda con DIRECT → sin flag');

// AC27 — sin DIRECT + PROXY autorizado → PROXY sustenta
var ac27 = P.resolverDirectYProxy([grp('D', 'PROXY', { evidence_group_id: 'p1' })], phen({ proxy_allowed_as_primary: true }));
eq([ac27.pos, ac27.evidence_basis], ['D', 'PROXY'], 'sin DIRECT + proxy_allowed_as_primary → pos=D, evidence_basis=PROXY (AC27 / INV-15)');
ok(tieneFlag(ac27, 'PROXY_COMO_PRIMARIO'), '...+ flag PROXY_COMO_PRIMARIO');

// AC28 — sin DIRECT + PROXY NO autorizado → N_A
var ac28 = P.resolverDirectYProxy([grp('D', 'PROXY')], phen({ proxy_allowed_as_primary: false }));
eq([ac28.pos, ac28.evidence_basis], ['N_A', 'NONE'], 'sin DIRECT + PROXY no autorizado → pos=N_A, evidence_basis=NONE (AC28)');
ok(tieneFlag(ac28, 'PROXY_NO_AUTORIZADO_COMO_PRIMARIO'), '...+ flag PROXY_NO_AUTORIZADO_COMO_PRIMARIO');

// DIRECT resolutivo → PROXY autorizado NO cambia la posición (§15)
var dirGana = P.resolverDirectYProxy([grp('F', 'DIRECT'), grp('D', 'PROXY')], phen({ proxy_allowed_as_primary: true }));
eq(dirGana.pos, 'F', 'DIRECT resolutivo → PROXY autorizado NO cambia posición (§15: "si DIRECT es resolutivo, PROXY no cambia")');

// nada utilizable
eq(P.resolverDirectYProxy([grp('N_A', 'DIRECT')], phen({ proxy_allowed_as_primary: true })).pos, 'N_A', 'todo N_A → N_A + SIN_EVIDENCIA_UTILIZABLE');
ok(tieneFlag(P.resolverDirectYProxy([], phen()), 'SIN_EVIDENCIA_UTILIZABLE'), 'sin grupos → SIN_EVIDENCIA_UTILIZABLE');

// F+D DIRECT vía resolverDirectYProxy (extremo a extremo)
eq(P.resolverDirectYProxy([grp('F', 'DIRECT'), grp('D', 'DIRECT')], phen()).pos, 'I', 'F+D DIRECT extremo a extremo → I (INV-17)');

// ═══════════════════════════════════════════════════════════════════════
//  7b — cobertura + admisibilidad del fenómeno (§16)
// ═══════════════════════════════════════════════════════════════════════

// spec de fenómeno: 2 grupos requeridos, 1 opcional
function pspec(over) {
  return Object.assign({
    phenomenon_id: 'ph1',
    required_evidence_group_ids: ['egA', 'egB'],
    optional_evidence_group_ids: ['egO'],
    proxy_allowed_as_primary: false
  }, over || {});
}
// grupo colapsado (Fase 6) con id + pos
function gc(id, pos) { return { evidence_group_id: id, pos: pos }; }

seccion('§16 — coberturaFenomeno: COMPLETE | PARTIAL | NONE');

eq(P.coberturaFenomeno(pspec(), [gc('egA', 'F'), gc('egB', 'D')]).coverage_status, 'COMPLETE', 'los 2 requeridos cubiertos → COMPLETE');
eq(P.coberturaFenomeno(pspec(), [gc('egA', 'F')]).coverage_status, 'PARTIAL', '1 de 2 requeridos → PARTIAL');
eq(P.coberturaFenomeno(pspec(), [gc('egO', 'F')]).coverage_status, 'NONE', '0 requeridos cubiertos (solo un opcional) → NONE');
eq(P.coberturaFenomeno(pspec(), []).coverage_status, 'NONE', 'sin grupos → NONE');
// un grupo que colapsó a N_A NO cubre
eq(P.coberturaFenomeno(pspec(), [gc('egA', 'F'), gc('egB', 'N_A')]).coverage_status, 'PARTIAL', 'egB colapsó a N_A → NO cubre → PARTIAL');
var cobDet = P.coberturaFenomeno(pspec(), [gc('egA', 'F'), gc('egB', 'N_A')]);
eq(cobDet.required_faltantes, ['egB'], '...required_faltantes lista egB');
eq(cobDet.optional_cubiertos, [], '...optional_cubiertos vacío');
// fenómeno sin requeridos
var sinReq = P.coberturaFenomeno(pspec({ required_evidence_group_ids: [] }), [gc('egO', 'D')]);
eq(sinReq.coverage_status, 'COMPLETE', 'sin requeridos + un grupo cubre → COMPLETE');
ok(tieneFlag(sinReq, 'FENOMENO_SIN_REQUIRED_GROUPS'), '...+ flag FENOMENO_SIN_REQUIRED_GROUPS');
eq(P.coberturaFenomeno(pspec({ required_evidence_group_ids: [] }), []).coverage_status, 'NONE', 'sin requeridos + nada cubre → NONE');

seccion('§16 — admisibilidadFenomeno: COMPLETE / NONE / N_A');

eq(P.admisibilidadFenomeno({ pos: 'F', evidence_basis: 'DIRECT', coverage_status: 'COMPLETE' }).admissibility, 'ADMISSIBLE', 'F + COMPLETE → ADMISSIBLE');
eq(P.admisibilidadFenomeno({ pos: 'D', evidence_basis: 'DIRECT', coverage_status: 'COMPLETE' }).admissibility, 'ADMISSIBLE', 'D + COMPLETE → ADMISSIBLE');
eq(P.admisibilidadFenomeno({ pos: 'I', evidence_basis: 'DIRECT', coverage_status: 'COMPLETE' }).admissibility, 'ADMISSIBLE', 'I + COMPLETE → ADMISSIBLE (INV-23: I plenamente admisible)');
eq(P.admisibilidadFenomeno({ pos: 'F', evidence_basis: 'DIRECT', coverage_status: 'NONE' }).admissibility, 'NOT_ADMISSIBLE', 'F + NONE → NOT_ADMISSIBLE');
eq(P.admisibilidadFenomeno({ pos: 'D', evidence_basis: 'DIRECT', coverage_status: 'NONE' }).admissibility, 'NOT_ADMISSIBLE', 'D + NONE → NOT_ADMISSIBLE');
eq(P.admisibilidadFenomeno({ pos: 'N_A', coverage_status: 'COMPLETE' }).admissibility, 'NOT_ADMISSIBLE', 'N_A + COMPLETE → NOT_ADMISSIBLE (sin posición)');
ok(tieneFlag(P.admisibilidadFenomeno({ pos: 'N_A', coverage_status: 'COMPLETE' }), 'SIN_POSICION'), '...+ flag SIN_POSICION');

seccion('§16 — el trato ASIMÉTRICO F vs D con coverage=PARTIAL (AC30 / AC31)');

// ── dirección F: AC30 — F + required faltante → cobertura parcial, NO admisible ──
var af = P.admisibilidadFenomeno({ pos: 'F', evidence_basis: 'DIRECT', coverage_status: 'PARTIAL' });
eq(af.admissibility, 'NOT_ADMISSIBLE', 'AC30: F + PARTIAL → NOT_ADMISSIBLE (F exige cobertura COMPLETE — ambig. AT)');
ok(tieneFlag(af, 'COBERTURA_REQUERIDA_INCOMPLETA_F'), '...+ flag COBERTURA_REQUERIDA_INCOMPLETA_F');

// ── dirección D: AC31 — D + parcial + unidad autorizada + sin contradicción → admisible con limitaciones ──
var ad = P.admisibilidadFenomeno({ pos: 'D', evidence_basis: 'DIRECT', coverage_status: 'PARTIAL', flags: [] });
eq(ad.admissibility, 'ADMISSIBLE_WITH_LIMITATIONS', 'AC31: D + PARTIAL + DIRECT + sin contradicción → ADMISSIBLE_WITH_LIMITATIONS');
ok(tieneFlag(ad, 'COBERTURA_PARCIAL_D_SUFICIENTE'), '...+ flag COBERTURA_PARCIAL_D_SUFICIENTE');
// D sostenido por PROXY autorizado también cuenta como "unidad autorizada"
eq(P.admisibilidadFenomeno({ pos: 'D', evidence_basis: 'PROXY', coverage_status: 'PARTIAL', flags: [] }).admissibility, 'ADMISSIBLE_WITH_LIMITATIONS', 'D + PARTIAL + PROXY autorizado → ADMISSIBLE_WITH_LIMITATIONS');

// mismo coverage=PARTIAL, mismas condiciones favorables → F cae, D no. La asimetría existe.
ok(af.admissibility === 'NOT_ADMISSIBLE' && ad.admissibility === 'ADMISSIBLE_WITH_LIMITATIONS',
   'ASIMETRÍA: con coverage=PARTIAL idéntico, F → NOT_ADMISSIBLE y D → ADMISSIBLE_WITH_LIMITATIONS');

seccion('§16 — D + PARTIAL: las dos condiciones que pueden faltar');

// falta unidad autorizada (evidence_basis NONE)
var dSinAut = P.admisibilidadFenomeno({ pos: 'D', evidence_basis: 'NONE', coverage_status: 'PARTIAL', flags: [] });
eq(dSinAut.admissibility, 'NOT_ADMISSIBLE', 'D + PARTIAL + sin unidad autorizada → NOT_ADMISSIBLE');
ok(tieneFlag(dSinAut, 'D_PARCIAL_SIN_UNIDAD_AUTORIZADA'), '...+ flag D_PARCIAL_SIN_UNIDAD_AUTORIZADA');
// hay contradicción DIRECT F sin resolver (flag de 7a)
var dContra = P.admisibilidadFenomeno({ pos: 'D', evidence_basis: 'DIRECT', coverage_status: 'PARTIAL', flags: ['DIRECT_GRUPO_INCONSISTENTE:egX'] });
eq(dContra.admissibility, 'NOT_ADMISSIBLE', 'D + PARTIAL + contradicción DIRECT F sin resolver → NOT_ADMISSIBLE (§16)');
ok(tieneFlag(dContra, 'CONTRADICCION_DIRECT_F_SIN_RESOLVER'), '...+ flag CONTRADICCION_DIRECT_F_SIN_RESOLVER');

seccion('§16 — I + PARTIAL (INV-23) ; INV-22 estructural');

var ai = P.admisibilidadFenomeno({ pos: 'I', evidence_basis: 'DIRECT', coverage_status: 'PARTIAL' });
eq(ai.admissibility, 'ADMISSIBLE_WITH_LIMITATIONS', 'I + PARTIAL → ADMISSIBLE_WITH_LIMITATIONS (INV-23: no se degrada a NOT_ADMISSIBLE por cobertura parcial sola)');
ok(tieneFlag(ai, 'COBERTURA_PARCIAL'), '...+ flag COBERTURA_PARCIAL');
// INV-22 / INV-77: admisibilidadFenomeno nunca emite pos ni la deriva de la cobertura
ok(!('pos' in P.admisibilidadFenomeno({ pos: 'F', coverage_status: 'NONE' })),
   'INV-22: admisibilidadFenomeno NO devuelve `pos` — la cobertura insuficiente degrada admisibilidad, no convierte la posición en I');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones 7a — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. _colapsarSetDirect: `S.F && S.D → I` → `→ N_A` (regla de §14 en vez de §15)');
console.log('     → 3 rojos ("{F,D}→I", "{F,D,I}→I", extremo a extremo — INV-17).');
console.log('  2. _colapsarSetDirect: `if (S.F)` ANTES de `if (S.F && S.D)` → 4 rojos ("{F,D}→I"');
console.log('     da F, el flag DIRECT_F_D_DIVERGENCIA no sale, "{F,D,I}→I" y extremo a extremo).');
console.log('  3. _colapsarSetDirect: fallthrough final `resolutivo: false` → `true` → 8 rojos');
console.log('     (los 2 de "sin DIRECT utilizable → resolutivo false"/N_A + AC27 + AC28 +');
console.log('     "todo N_A → N_A" + SIN_EVIDENCIA_UTILIZABLE — sin crash, EXIT:1 limpio).');
console.log('  4. _colapsarSetDirect: no propagar el flag de grupo inconsistente → 1 rojo (L).');
console.log('  5. particionarPorProximidad: MIXED → proxy en vez de direct → 2 rojos (AP).');
console.log('  6. resolverDirectYProxy: `if (direct.resolutivo)` → `if (false)` (nunca corta) →');
console.log('     5 rojos (AC26 pos/basis/gov, "PROXY no cambia posición", extremo a extremo).');
console.log('  7. resolverDirectYProxy: `proxy_allowed_as_primary === true` → `!== undefined`');
console.log('     → 2 rojos ("PROXY no autorizado → N_A" — AC28 / INV-15).');
console.log('  8. resolverDirectYProxy: no emitir PROXY_DISCREPA_DE_DIRECT → 1 rojo (AC26).');
console.log('  Conteos 7a: 3, 4, 8, 1, 2, 5, 2, 1.');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones 7b — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. coberturaFenomeno: un grupo con pos=N_A cuenta como cubierto');
console.log('     (`_POS_UTILIZABLE[g.pos]` → `g.pos != null`) → "egB colapsó a N_A → PARTIAL"');
console.log('     y "required_faltantes lista egB" caen.');
console.log('  2. coberturaFenomeno: 0 requeridos cubiertos → PARTIAL en vez de NONE →');
console.log('     "0 requeridos → NONE" y "sin grupos → NONE" caen.');
console.log('  3. [ASIMETRÍA, dirección F] admisibilidadFenomeno: se quita la rama');
console.log('     `pos===F` (cae al tratamiento genérico D/PROXY) → AC30 "F + PARTIAL →');
console.log('     NOT_ADMISSIBLE" y su flag caen (F pasa a ADMISSIBLE_WITH_LIMITATIONS).');
console.log('  4. [ASIMETRÍA, dirección D] admisibilidadFenomeno: `if (autorizada && !contradiccionF)`');
console.log('     → `if (false)` (D + PARTIAL usa la regla de F, siempre NOT_ADMISSIBLE) → AC31');
console.log('     "D + PARTIAL + DIRECT → ADMISSIBLE_WITH_LIMITATIONS" (×2: DIRECT y PROXY) + flag caen.');
console.log('  5. admisibilidadFenomeno: `contradiccionF` fijo a `false` (se ignora el flag de 7a)');
console.log('     → 2 rojos ("D + PARTIAL + contradicción DIRECT F → NOT_ADMISSIBLE" + su flag).');
console.log('  6. admisibilidadFenomeno: la rama `coverage===NONE` → ADMISSIBLE → 2 rojos');
console.log('     ("F+NONE", "D+NONE"). El assert INV-22 sigue verde: la mutación no añade `pos`.');
console.log('  7. admisibilidadFenomeno: la rama `pos===I` con PARTIAL → NOT_ADMISSIBLE → 1 rojo');
console.log('     (INV-23 "I + PARTIAL → ADMISSIBLE_WITH_LIMITATIONS"; el flag sigue saliendo).');
console.log('  8. admisibilidadFenomeno: la rama `pos===N_A` → ADMISSIBLE → 1 rojo ("N_A +');
console.log('     COMPLETE → NOT_ADMISSIBLE"; el flag SIN_POSICION sigue saliendo).');
console.log('  Conteos 7b: 2, 2, 3, 4, 2, 2, 1, 1.');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
