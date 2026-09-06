/**
 * motor-cff/cobertura.test.js — Fase 4b (iii)
 * node motor-cff/cobertura.test.js
 */

'use strict';

var CO = require('./cobertura');
var CAT = require('./consolidacion').CATEGORIAS_EXCLUSION;
var COVERAGE_STATUS = require('./enums').COVERAGE_STATUS;

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }
function lanza(fn, m) { var l = false; try { fn(); } catch (e) { l = true; } ok(l, m); }

// coverageInput sintético con conteos controlados
function ci(evaluado, noEvaluado, transfInternas) {
  var excl = [];
  for (var i = 0; i < noEvaluado; i++) excl.push({ component_id: 'X' + i, motivo: 'm', categoria: CAT.ADMISIBILIDAD });
  for (var j = 0; j < (transfInternas || 0); j++) excl.push({ component_id: 'T' + j, motivo: 'm', categoria: CAT.TRANSFERENCIA_INTERNA });
  return { componentes_candidatos: evaluado + noEvaluado + (transfInternas || 0), componentes_admisibles: evaluado, componentes_excluidos: excl };
}
function sen(over) {
  return Object.assign({
    tratamientoEconomicoSuficiente: true, dependeDeEstimacionesDebiles: false,
    asignacionesLimitadas: false, baseDefendibleParaCifraConsolidada: true
  }, over);
}

// ═══════════════════════════════════════════════════════════════════════
seccion('§20 — las 4 categorías de COVERAGE_STATUS (un caso claro de cada una)');
// ═══════════════════════════════════════════════════════════════════════

eq(CO.clasificarCobertura(ci(5, 0), sen()).coverage_status, 'FULL',
  'todo el material evaluado + tratamiento suficiente → FULL');
eq(CO.clasificarCobertura(ci(5, 2), sen()).coverage_status, 'PARTIAL',
  '2 materiales no resueltos (con motivo), cifra útil, sin debilidad declarada → PARTIAL');
eq(CO.clasificarCobertura(ci(5, 0), sen({ dependeDeEstimacionesDebiles: true })).coverage_status, 'LIMITED',
  'todo evaluado PERO depende de estimaciones débiles → LIMITED (§20 literal)');
eq(CO.clasificarCobertura(ci(5, 2), sen({ asignacionesLimitadas: true })).coverage_status, 'LIMITED',
  'asignaciones limitadas → LIMITED, gane a PARTIAL');
eq(CO.clasificarCobertura(ci(3, 1), sen({ baseDefendibleParaCifraConsolidada: false })).coverage_status, 'INSUFFICIENT',
  'sin base defendible → INSUFFICIENT');
eq(CO.clasificarCobertura(ci(0, 4), sen()).coverage_status, 'INSUFFICIENT',
  'ninguna componente material llegó a admisible (evaluado=0) → INSUFFICIENT');

// ═══════════════════════════════════════════════════════════════════════
seccion('§14 — transferencias internas eliminadas NO cuentan como hueco de cobertura');
// ═══════════════════════════════════════════════════════════════════════

var rTI = CO.clasificarCobertura(ci(4, 0, 3), sen()); // 3 transferencias internas eliminadas, 0 material sin evaluar
eq(rTI.coverage_status, 'FULL', '4 evaluados + 3 transferencias internas eliminadas + 0 material sin evaluar → FULL');
eq(rTI.material_total, 4, 'material_total descuenta las 3 transferencias internas (7 candidatos − 3 = 4)');
eq(rTI.material_no_evaluado, 0, 'las transferencias internas NO suman a material_no_evaluado');

// ═══════════════════════════════════════════════════════════════════════
seccion('El criterio es CUALITATIVO — el ratio no decide ninguna frontera');
// ═══════════════════════════════════════════════════════════════════════

var base = ci(3, 1); // ratio idéntico (3/4 = 0.75) en los tres casos siguientes
eq(CO.clasificarCobertura(base, sen()).coverage_status, 'PARTIAL', 'ratio 0.75, sin debilidad → PARTIAL');
eq(CO.clasificarCobertura(base, sen({ dependeDeEstimacionesDebiles: true })).coverage_status, 'LIMITED',
  'MISMO ratio 0.75, solo cambia dependeDeEstimacionesDebiles → LIMITED (la frontera PARTIAL/LIMITED es cualitativa, no el ratio)');
eq(CO.clasificarCobertura(base, sen({ baseDefendibleParaCifraConsolidada: false })).coverage_status, 'INSUFFICIENT',
  'MISMO ratio 0.75, solo cambia baseDefendible → INSUFFICIENT');
ok(CO.clasificarCobertura(base, sen()).criterio_es_cualitativo === true, 'el resultado marca criterio_es_cualitativo=true');
ok(CO.clasificarCobertura(base, sen()).cobertura_ratio === 0.75, 'cobertura_ratio se reporta (0.75) como dato, no como decisión');

// ═══════════════════════════════════════════════════════════════════════
seccion('Partición — verificación INDEPENDIENTE del orden, sobre los 64 casos');
// ═══════════════════════════════════════════════════════════════════════

// NO se replica el árbol de decisión. Se evalúan las 4 CONDICIONES CRUDAS
// (textuales) por separado y se comprueba:
//   (a) exhaustividad: en cada caso al menos una condición cruda es verdadera (sin huecos);
//   (b) la implementación devuelve la de MAYOR precedencia entre las verdaderas;
//   (c) se localizan los solapamientos reales y se confirma hacia dónde los resuelve.
var CRUDAS = CO.CONDICIONES_CRUDAS, PREC = CO.PRECEDENCIA;
var combos = 0, sinNinguna = 0, discrepPrecedencia = 0, fueraEnum = 0;
var solapes = { 'INSUFFICIENT+LIMITED': 0, 'INSUFFICIENT+FULL': 0, 'INSUFFICIENT+PARTIAL': 0, 'LIMITED+FULL': 0, 'LIMITED+PARTIAL': 0, 'FULL+PARTIAL': 0 };

[true, false].forEach(function (t) { [true, false].forEach(function (d) { [true, false].forEach(function (a) { [true, false].forEach(function (b) {
  [0, 3].forEach(function (ev) { [0, 2].forEach(function (noev) {
    combos++;
    var s = { tratamientoEconomicoSuficiente: t, dependeDeEstimacionesDebiles: d, asignacionesLimitadas: a, baseDefendibleParaCifraConsolidada: b };
    var input = ci(ev, noev);
    var verdaderas = PREC.filter(function (cat) { return CRUDAS[cat](input, s); });

    if (verdaderas.length === 0) { sinNinguna++; console.log('    ✗ hueco: ' + JSON.stringify({ ev: ev, noev: noev, s: s })); }

    // registrar solapamientos entre pares
    for (var x = 0; x < verdaderas.length; x++) for (var y = x + 1; y < verdaderas.length; y++) {
      var clave = verdaderas[x] + '+' + verdaderas[y];
      if (solapes[clave] !== undefined) solapes[clave]++;
    }

    var got = CO.clasificarCobertura(input, s).coverage_status;
    if (COVERAGE_STATUS.indexOf(got) === -1) fueraEnum++;
    // (b) la implementación = la verdadera de mayor precedencia
    if (verdaderas.length && got !== verdaderas[0]) {
      discrepPrecedencia++;
      console.log('    ✗ precedencia: verdaderas=' + JSON.stringify(verdaderas) + ' impl=' + got);
    }
  }); });
}); }); }); });

ok(combos === 64, 'se recorrieron los 64 casos (2^4 señales × {0,3} evaluado × {0,2} no-evaluado)');
ok(sinNinguna === 0, '(a) exhaustivo: NINGÚN caso queda sin una condición cruda verdadera — sin huecos');
ok(fueraEnum === 0, 'todo resultado está dentro de COVERAGE_STATUS');
ok(discrepPrecedencia === 0, '(b) la implementación devuelve siempre la condición cruda de mayor precedencia entre las verdaderas');

// (c) los solapamientos reales y su resolución
ok(solapes['FULL+PARTIAL'] === 0, '(c) FULL y PARTIAL NUNCA solapan (noEvaluado===0 vs >0) — disjuntos de verdad');
ok(solapes['LIMITED+FULL'] > 0, '(c) LIMITED y FULL SÍ solapan en la representación cruda (todo evaluado + señal de debilidad) — la precedencia (§21) lo resuelve hacia LIMITED');
ok(solapes['LIMITED+PARTIAL'] > 0, '(c) LIMITED y PARTIAL SÍ solapan (exclusiones + debilidad) — la precedencia (decisión de diseño, §25/INV-CFF-54) lo resuelve hacia LIMITED');
ok(solapes['INSUFFICIENT+LIMITED'] + solapes['INSUFFICIENT+FULL'] + solapes['INSUFFICIENT+PARTIAL'] > 0,
  '(c) INSUFFICIENT solapa con las otras en crudo (las señales de debilidad/exclusión pueden coexistir con "sin cifra") — la precedencia textual (§20: "la cifra existe" vs "no existe base") lo resuelve hacia INSUFFICIENT');

// confirmación puntual del solape LIMITED/FULL que expuso la Mutación 2
var casoSolape = ci(3, 0); // todo evaluado
var sSolape = sen({ dependeDeEstimacionesDebiles: true });
ok(CRUDAS.FULL(casoSolape, sSolape) === true && CRUDAS.LIMITED(casoSolape, sSolape) === true,
  'el caso "todo evaluado + estimaciones débiles" satisface AMBAS condiciones crudas FULL y LIMITED — el solape es real, no aparente');
eq(CO.clasificarCobertura(casoSolape, sSolape).coverage_status, 'LIMITED',
  '...y la precedencia lo resuelve hacia LIMITED (§21: la clasificación no puede superar en calidad a una dependencia crítica degradada)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Señales cualitativas obligatorias — ninguna se asume');
// ═══════════════════════════════════════════════════════════════════════

CO.SENALES_OBLIGATORIAS.forEach(function (k) {
  var s = sen(); delete s[k];
  lanza(function () { CO.clasificarCobertura(ci(3, 0), s); }, 'falta "' + k + '" → lanza');
});
lanza(function () { CO.clasificarCobertura(null, sen()); }, 'coverageInput inválido → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('§20 / AC21 / AC22 / AC46 — CFF = 0  vs  CFF = N_A');
// ═══════════════════════════════════════════════════════════════════════

var cero = CO.distinguirCeroDeNA(0, 'FULL');
eq({ r: cero.resultado, v: cero.value, s: cero.status }, { r: 'CFF_CERO', v: 0, s: 'VALID' },
  'cobertura FULL + cff_total 0 → CFF_CERO, value=0, status=VALID (AC21)');

var ceroLim = CO.distinguirCeroDeNA(0, 'PARTIAL');
eq({ v: ceroLim.value, s: ceroLim.status }, { v: 0, s: 'VALID_WITH_LIMITATIONS' },
  'cobertura PARTIAL + cff_total 0 → value=0, status=VALID_WITH_LIMITATIONS');

var na = CO.distinguirCeroDeNA(0, 'INSUFFICIENT');
eq({ r: na.resultado, v: na.value, s: na.status }, { r: 'CFF_N_A', v: null, s: 'INSUFFICIENT' },
  'cobertura INSUFFICIENT + cff_total 0 → CFF_N_A, value=null, status=INSUFFICIENT (AC46: NO 0)');

var pos = CO.distinguirCeroDeNA(1280, 'FULL');
eq({ v: pos.value, s: pos.status }, { v: 1280, s: 'VALID' }, 'cff_total positivo + FULL → passthrough, value=1280, VALID');

lanza(function () { CO.distinguirCeroDeNA(null, 'FULL'); }, 'cffTotal null → lanza (el nulo lo produce esta función, no se recibe)');
lanza(function () { CO.distinguirCeroDeNA(-5, 'FULL'); }, 'cffTotal negativo → lanza (el CFF no puede ser < 0)');
lanza(function () { CO.distinguirCeroDeNA(0, 'NOPE'); }, 'coverageStatus fuera del enum → lanza');

// ── salvaguarda de consistencia interna (prueba dirigida) ──
seccion('Salvaguarda — value=null ⟺ CFF_N_A ⟺ status=INSUFFICIENT');
ok(CO._verificarValorConsistente({ resultado: 'CFF_N_A', value: null, status: 'INSUFFICIENT' }).resultado === 'CFF_N_A',
  'trío consistente (N_A / null / INSUFFICIENT) pasa');
ok(CO._verificarValorConsistente({ resultado: 'CFF_CERO', value: 0, status: 'VALID' }).value === 0, 'trío consistente (CERO / 0 / VALID) pasa');
lanza(function () { CO._verificarValorConsistente({ resultado: 'CFF_N_A', value: 0, status: 'INSUFFICIENT' }); },
  'N_A con value=0 → lanza (exactamente la imputación que AC46 prohíbe)');
lanza(function () { CO._verificarValorConsistente({ resultado: 'CFF_N_A', value: null, status: 'VALID' }); },
  'N_A con status VALID → lanza (trío desincronizado)');
lanza(function () { CO._verificarValorConsistente({ resultado: 'CFF_CERO', value: null, status: 'VALID' }); },
  'CFF_CERO con value=null → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones — ejecutadas como paso de Bash aparte (ver mensaje de cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. quitar la guarda "coverageStatus===INSUFFICIENT ⇒ N_A": el caso (INSUFFICIENT, cff_total 0)');
console.log('     pasa de {value:null, status:INSUFFICIENT} a {value:0, status:VALID_WITH_LIMITATIONS} — la');
console.log('     imputación de "missing como cero" que AC46 prohíbe explícitamente.');
console.log('  2. invertir FULL y LIMITED en PRECEDENCIA: el caso (todo evaluado, dependeDeEstimacionesDebiles=true),');
console.log('     que satisface AMBAS condiciones crudas, pasa de LIMITED a FULL — la precedencia (§21) es lo que decide.');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
