/**
 * motor-piio/nodos.test.js — Fase 10
 * node motor-piio/nodos.test.js
 *
 * Nodos, alcance y agregación (§22–23). Oráculo conductual: AC47
 * (SEGMENT_ONLY D no eleva), AC48 (nodos polarizados → preservar
 * node_profile), AC49 (padre + hijos → bloquear doble agregación), AC50
 * (COUNT mutuamente excluyentes → suma válida), AC51 (RATE exposiciones
 * distintas → recomputar, no promedio), AC52/53 (mensual ≠ anual; no
 * anualizar), AC54/55 (exposición ≠ incidencia; preservar ambas lecturas).
 * INV-46–56.
 */

'use strict';

var N = require('./nodos');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }
function near(a, b, m) { ok(typeof a === 'number' && Math.abs(a - b) < 1e-9, m + (Math.abs(a - b) < 1e-9 ? '' : '  [recibido=' + a + ' esperado=' + b + ']')); }
function tieneFlag(o, f) { return (o && o.flags || []).some(function (x) { return x === f || x.indexOf(f + ':') === 0; }); }

// jerarquía: raíz `org` → `a`, `b` ; `a` → `a1`, `a2`
var NODOS = [
  { node_id: 'org', parent_node_id: null, scope_rules: { scope: 'ORGANIZATIONAL' } },
  { node_id: 'a', parent_node_id: 'org', scope_rules: { scope: 'ORGANIZATIONAL' } },
  { node_id: 'b', parent_node_id: 'org', scope_rules: { scope: 'SEGMENT_ONLY' } },
  { node_id: 'a1', parent_node_id: 'a', scope_rules: { scope: 'ORGANIZATIONAL' } },
  { node_id: 'a2', parent_node_id: 'a', scope_rules: { scope: 'ORGANIZATIONAL' } }
];

function oe(over) {
  return Object.assign({
    kpi_id: 'k1', node_id: 'a1', period_start: '2026-03', period_end: '2026-03',
    value: 10, data_quality: 'VALID'
  }, over || {});
}
function md(type, over) { return Object.assign({ metric_definition_id: 'm1', metric_type: type, aggregation_frequency: 'MONTHLY' }, over || {}); }

// ═══════════════════════════════════════════════════════════════════════
seccion('§22 — jerarquía: cadena de ancestros y node_level');
// ═══════════════════════════════════════════════════════════════════════

var byId = {}; NODOS.forEach(function (n) { byId[n.node_id] = n; });
eq(N._cadenaAncestros('a1', byId), ['a', 'org'], 'a1 → [a, org]');
eq(N._cadenaAncestros('org', byId), [], 'raíz → []');
eq(N.nodeLevel('org', byId), 0, 'nodeLevel(org) = 0 (raíz)');
eq(N.nodeLevel('a', byId), 1, 'nodeLevel(a) = 1');
eq(N.nodeLevel('a1', byId), 2, 'nodeLevel(a1) = 2');
// ciclo → no cuelga
var ciclo = { x: { node_id: 'x', parent_node_id: 'y' }, y: { node_id: 'y', parent_node_id: 'x' } };
eq(N._cadenaAncestros('x', ciclo).length <= 2, true, 'ciclo x↔y → _cadenaAncestros no cuelga');

// ═══════════════════════════════════════════════════════════════════════
seccion('§22.1 / INV-48 — validarExclusividadNodos (AC49)');
// ═══════════════════════════════════════════════════════════════════════

eq(N.validarExclusividadNodos(['a1', 'a2', 'b'], NODOS).ok, true, 'a1, a2, b son mutuamente excluyentes → ok');
var conCont = N.validarExclusividadNodos(['a', 'a1'], NODOS);
eq(conCont.ok, false, 'a + a1 (a contiene a a1) → NO ok (INV-48 / AC49)');
eq(conCont.conflictos, [{ hijo: 'a1', ancestro: 'a' }], '...conflicto: a1 tiene a `a` como ancestro en el conjunto');
ok(tieneFlag(conCont, 'CONTENCION_JERARQUICA_EN_AGREGACION'), '...+ flag CONTENCION_JERARQUICA_EN_AGREGACION');
eq(N.validarExclusividadNodos(['org', 'a1'], NODOS).ok, false, 'org + a1 (org es raíz, contiene todo) → NO ok');
ok(tieneFlag(N.validarExclusividadNodos(['a1', 'a1'], NODOS), 'NODOS_DUPLICADOS_EN_AGREGACION'), 'ids duplicados → flag');

// ═══════════════════════════════════════════════════════════════════════
seccion('§23 — _reglaAgregacion por tipo de métrica');
// ═══════════════════════════════════════════════════════════════════════

eq(N._reglaAgregacion('COUNT'), 'SUMA', 'COUNT → SUMA');
eq(N._reglaAgregacion('QUANTITY'), 'SUMA', 'QUANTITY → SUMA (no en la tabla §23; se trata como COUNT — decisión AY)');
eq(N._reglaAgregacion('RATE'), 'RECOMPUTAR_COMPONENTES', 'RATE → RECOMPUTAR_COMPONENTES');
eq(N._reglaAgregacion('RATIO'), 'RECOMPUTAR_COMPONENTES', 'RATIO → RECOMPUTAR_COMPONENTES');
eq(N._reglaAgregacion('DURATION'), 'AGREGADOR_DECLARADO', 'DURATION → AGREGADOR_DECLARADO (ambig. AY)');
eq(N._reglaAgregacion('INDEX'), 'AGREGADOR_DECLARADO', 'INDEX → AGREGADOR_DECLARADO');
eq(N._reglaAgregacion('BINARY'), 'AGREGADOR_DECLARADO', 'BINARY → AGREGADOR_DECLARADO');
eq(N._reglaAgregacion('OTHER_VALIDATED'), 'AGREGADOR_DECLARADO', 'OTHER_VALIDATED → AGREGADOR_DECLARADO');

// ═══════════════════════════════════════════════════════════════════════
seccion('§23 — COUNT: suma solo entre nodos mutuamente excluyentes (AC50)');
// ═══════════════════════════════════════════════════════════════════════

var count = N.agregarObservacionesNodos(
  [oe({ node_id: 'a1', value: 12 }), oe({ node_id: 'a2', value: 8 }), oe({ node_id: 'b', value: 5 })],
  md('COUNT'), NODOS, { node_id_objetivo: 'org' });
eq([count.agregable, count.value], [true, 25], 'AC50: COUNT en a1+a2+b (mutuamente excluyentes) → suma 25');
eq(count.source_node_ids, ['a1', 'a2', 'b'], '...source_node_ids preservados');
// contención → NO agrega
var countCont = N.agregarObservacionesNodos(
  [oe({ node_id: 'a', value: 20 }), oe({ node_id: 'a1', value: 12 })],
  md('COUNT'), NODOS, { node_id_objetivo: 'org' });
eq(countCont.agregable, false, 'AC49: COUNT en a + a1 (contención) → NO agregable');
ok(tieneFlag(countCont, 'NO_AGREGABLE_POR_CONTENCION'), '...+ flag NO_AGREGABLE_POR_CONTENCION (INV-48)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§23 / INV-49/50 — RATE: recomputar desde Σnum/Σden, NUNCA promedio');
// ═══════════════════════════════════════════════════════════════════════

// a1: 6/100 = 0.06 ; a2: 30/300 = 0.10 ; promedio simple = 0.08 ; Σnum/Σden = 36/400 = 0.09
var rate = N.agregarObservacionesNodos(
  [oe({ node_id: 'a1', value: 0.06, numerator: 6, denominator: 100 }),
   oe({ node_id: 'a2', value: 0.10, numerator: 30, denominator: 300 })],
  md('RATE'), NODOS, { node_id_objetivo: 'a' });
eq(rate.agregable, true, 'RATE con componentes en ambos → agregable');
near(rate.value, 0.09, 'AC51: valor agregado = Σnum/Σden = 36/400 = 0.09 (NO el promedio simple 0.08)');
eq([rate.numerator, rate.denominator], [36, 400], '...numerator/denominator agregados preservados (INV-54)');
ok(Math.abs(rate.value - 0.08) > 1e-6, 'CONTRASTE con el PIIO viejo: el resultado NO es mean([0.06, 0.10]) = 0.08');
// sin componentes → NO agregable (no se cae a promedio)
var rateSinComp = N.agregarObservacionesNodos(
  [oe({ node_id: 'a1', value: 0.06 }), oe({ node_id: 'a2', value: 0.10 })],
  md('RATE'), NODOS, { node_id_objetivo: 'a' });
eq(rateSinComp.agregable, false, 'RATE sin num/den → NO agregable (NO promedio simple — INV-49/50)');
ok(tieneFlag(rateSinComp, 'SIN_COMPONENTES_PARA_RECOMPUTAR'), '...+ flag SIN_COMPONENTES_PARA_RECOMPUTAR');
eq(rateSinComp.value, null, '...value queda null, no un promedio inventado');

// ═══════════════════════════════════════════════════════════════════════
seccion('§23 / INV-51/52/53 — frecuencia y anualización');
// ═══════════════════════════════════════════════════════════════════════

var frecMix = N.agregarObservacionesNodos(
  [oe({ node_id: 'a1', value: 5, numerator: 5, denominator: 100, period_start: '2026-01', period_end: '2026-01' }),
   oe({ node_id: 'a2', value: 5, numerator: 5, denominator: 100, period_start: '2026-01', period_end: '2026-12' })],
  md('RATE'), NODOS, { node_id_objetivo: 'a' });
eq(frecMix.agregable, false, 'AC52: períodos distintos (mensual vs anual) → NO agregable');
ok(tieneFlag(frecMix, 'FRECUENCIA_INCOMPATIBLE'), '...+ flag FRECUENCIA_INCOMPATIBLE');
// anualización NO automática
var anual = N.agregarObservacionesNodos(
  [oe({ node_id: 'a1', value: 0.05, numerator: 5, denominator: 100 }),
   oe({ node_id: 'a2', value: 0.05, numerator: 5, denominator: 100 })],
  md('RATE', { rate_period: 'MONTHLY', annualization_rule: 'x12' }), NODOS, { node_id_objetivo: 'a' });
near(anual.value, 0.05, 'AC53: mensual con annualization_rule → NO se anualiza (0.05, no 0.60)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§23 / INV-55/56 — exposición separada; lecturaDual (AC54/55)');
// ═══════════════════════════════════════════════════════════════════════

var conExp = N.agregarObservacionesNodos(
  [oe({ node_id: 'a1', value: 0.05, numerator: 5, denominator: 100, exposure: 1000 }),
   oe({ node_id: 'a2', value: 0.05, numerator: 10, denominator: 200, exposure: 4000 })],
  md('RATE'), NODOS, { node_id_objetivo: 'a' });
eq(conExp.exposure, 5000, 'INV-55: Σexposure = 5000, SEPARADA de value');
near(conExp.value, 15 / 300, '...value = Σnum/Σden = 15/300 = 0.05 (sin la exposición dentro)');
var dual = N.lecturaDual(conExp, [oe({ numerator: 5 }), oe({ numerator: 10 })]);
eq([dual.tasa, dual.eventos_absolutos, dual.exposicion_total], [0.05, 15, 5000], 'AC54/55: lecturaDual preserva tasa=0.05, eventos_absolutos=15, exposicion_total=5000 — las 3 por separado');
// cuando el eval agregado NO trae numerator, eventos_absolutos se recompone desde los fuente
var dualSinNum = N.lecturaDual({ value: 0.05, exposure: 5000 }, [oe({ numerator: 5 }), oe({ numerator: 10 })]);
eq(dualSinNum.eventos_absolutos, 15, 'lecturaDual: sin numerator en el agregado → suma los numeradores de los fuente (no pierde los eventos absolutos)');
var dualNada = N.lecturaDual({ value: 0.05 }, []);
ok(tieneFlag(dualNada, 'EVENTOS_ABSOLUTOS_NO_DISPONIBLES'), '...sin ninguna fuente de eventos → flag EVENTOS_ABSOLUTOS_NO_DISPONIBLES');

// ═══════════════════════════════════════════════════════════════════════
seccion('§23 — AGREGADOR_DECLARADO (ambig. AY)');
// ═══════════════════════════════════════════════════════════════════════

var durAgg = N.agregarObservacionesNodos(
  [oe({ node_id: 'a1', value: 30 }), oe({ node_id: 'a2', value: 45 })],
  md('DURATION'), NODOS, { node_id_objetivo: 'a' });
eq(durAgg.agregable, false, 'DURATION → NO agregable (sin agregador declarado — ambig. AY, no se asume media)');
ok(tieneFlag(durAgg, 'AGREGADOR_NO_DEFINIDO'), '...+ flag AGREGADOR_NO_DEFINIDO');
eq(durAgg.value, null, '...value null, no una media inventada');

// ═══════════════════════════════════════════════════════════════════════
seccion('§22.2 — construirNodeProfile (superconjunto de 9b, sin AIE)');
// ═══════════════════════════════════════════════════════════════════════

var estados = [
  { node_id: 'a1', pos: 'D', traj: 'DETERIORATING', pers: 'REPEATED', deterioration_present: true, admissibility: 'ADMISSIBLE', coverage_status: 'FULL' },
  { node_id: 'b', pos: 'F', traj: 'STABLE', pers: 'N_A', deterioration_present: false, admissibility: 'ADMISSIBLE', coverage_status: 'FULL' }
];
var prof = N.construirNodeProfile(estados, NODOS);
eq(prof.length, 2, 'un elemento por nodo');
eq(prof[0], { node_id: 'a1', node_level: 2, scope: 'ORGANIZATIONAL', pos: 'D', traj: 'DETERIORATING', pers: 'REPEATED', deterioration_present: true, admissibility: 'ADMISSIBLE', coverage_status: 'FULL' }, 'a1: 9 campos (superconjunto de los 4 de 9b: node_id/scope/pos/deterioration_present)');
eq(prof[1].scope, 'SEGMENT_ONLY', 'b: scope SEGMENT_ONLY del nodeSpec');
// los 4 campos de 9b están todos presentes con el mismo nombre y forma
['node_id', 'scope', 'pos', 'deterioration_present'].forEach(function (k) {
  ok(k in prof[0], 'campo de 9b `' + k + '` presente en el perfil de Fase 10');
});
// INV-46 — no modificadores de AIE
ok(!N.contieneModificadorAIE(prof[0]), 'INV-46: el perfil NO trae node_concentration / polarization');
ok(N.contieneModificadorAIE({ node_id: 'x', polarization: 0.5 }), 'contieneModificadorAIE detecta una clave prohibida');

// ═══════════════════════════════════════════════════════════════════════
seccion('§22 / INV-47 — nodosParaEFOOrganizacional (AC47)');
// ═══════════════════════════════════════════════════════════════════════

var orgFilt = N.nodosParaEFOOrganizacional([
  { node_id: 'a1', pos: 'F' }, { node_id: 'a2', pos: 'F' }, { node_id: 'b', pos: 'D' }
], NODOS);
eq(orgFilt.organizacionales.map(function (s) { return s.node_id; }), ['a1', 'a2'], 'solo a1, a2 (ORGANIZATIONAL) entran al roll-up organizacional');
eq(orgFilt.segmentOnly.map(function (s) { return s.node_id; }), ['b'], 'b (SEGMENT_ONLY) queda fuera');
ok(tieneFlag(orgFilt, 'SEGMENT_ONLY_D_NO_ELEVA'), 'AC47: b es SEGMENT_ONLY y está en D → flag SEGMENT_ONLY_D_NO_ELEVA (no eleva por sí solo)');
ok(tieneFlag(orgFilt, 'SEGMENT_ONLY_NO_ELEVA'), '...+ flag general SEGMENT_ONLY_NO_ELEVA');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. [CONTRASTE con PIIO viejo] agregarObservacionesNodos: RATE → `mean(tasas)` en vez');
console.log('     de `Σnum/Σden` → 2 rojos ("valor = 0.09 no 0.08", "NO es mean([0.06,0.10])") — AC51/INV-49/50.');
console.log('  2. RATE sin componentes → promedio simple en vez de NO_AGREGABLE → 2 rojos.');
console.log('  3. agregarObservacionesNodos: COUNT no chequea exclusividad → 2 rojos (AC49).');
console.log('  4. no chequea períodos compatibles → 2 rojos (AC52).');
console.log('  5. agregarObservacionesNodos, rama RECOMPUTAR_COMPONENTES: la línea');
console.log('     `out.value = sn / sd;`  →  `out.value = (sn/sd) + out.exposure; out.exposure = null;`');
console.log('     (la exposición se pliega en `value` Y se anula el campo separado) → 3 rojos');
console.log('     ("Σexposure separada", "value sin exposición", lecturaDual) — INV-55/AC54/55.');
console.log('  6. _reglaAgregacion: la línea de FALLTHROUGH  return "AGREGADOR_DECLARADO"  →');
console.log('     return "SUMA"  (afecta a los 4 tipos, no solo DURATION) → 7 rojos (los 4');
console.log('     asserts de tipo + los 3 del test durAgg — agregable/flag/value) — AY.');
console.log('  7. lecturaDual: no recompone eventos_absolutos desde los fuente → 1 rojo (AC54/55).');
console.log('  8. validarExclusividadNodos: no recorre la cadena de ancestros → 6 rojos (INV-48/AC49).');
console.log('  9. nodeLevel: cuenta desde 1 (incluye el propio) → 4 rojos ("nodeLevel(org)=0" etc.).');
console.log('  10. construirNodeProfile: emite un campo polarization → 2 rojos (INV-46).');
console.log('  11. nodosParaEFOOrganizacional: SEGMENT_ONLY entra a organizacionales → 4 rojos (AC47/INV-47).');
console.log('  12. agregarObservacionesNodos: RATE mensual × 12 (anualiza) → 4 rojos (AC53).');
console.log('  Conteos: 2, 2, 2, 2, 3, 7, 1, 6, 4, 2, 4, 4.');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
