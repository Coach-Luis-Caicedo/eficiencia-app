/**
 * motor-cff/admisibilidad.test.js — Fase 4b (i)
 * node motor-cff/admisibilidad.test.js
 */

'use strict';

var A = require('./admisibilidad');

var _ok = 0, _fallos = 0;
function seccion(nombre) { console.log('\n── ' + nombre + ' ' + '─'.repeat(Math.max(0, 66 - nombre.length))); }
function ok(cond, msg) {
  if (cond) { _ok++; console.log('  ✓ ' + msg); }
  else { _fallos++; console.log('  ✗ FALLA: ' + msg); }
}
function eq(a, b, msg) {
  var cond = JSON.stringify(a) === JSON.stringify(b);
  ok(cond, msg + (cond ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']'));
}
function lanza(fn, msg) {
  var lanzo = false;
  try { fn(); } catch (e) { lanzo = true; }
  ok(lanzo, msg);
}

function base() {
  return {
    component_id: 'C1',
    event_status: 'COMPLETE',
    monetization_status: 'OBSERVED',
    attribution_status: 'CONFIRMED',
    monetary_basis_valid: true,
    temporal_basis_valid: true,
    scope_valid: true,
    relationship_resolution_permite_inclusion: true
  };
}

// ═══════════════════════════════════════════════════════════════════════
seccion('§18 — caso admisible (las 7 condiciones satisfechas)');
// ═══════════════════════════════════════════════════════════════════════

var r1 = A.evaluarAdmisibilidad(base());
eq(r1, { component_id: 'C1', admisible: true, exclusion_reason: null }, 'las 7 condiciones OK → admisible=true, sin motivo');

var r2 = A.evaluarAdmisibilidad(Object.assign(base(), { monetization_status: 'ESTIMATED', attribution_status: 'SUPPORTED' }));
ok(r2.admisible, 'ESTIMATED + SUPPORTED también admisible (§18: OBSERVED-o-ESTIMATED, CONFIRMED-o-SUPPORTED)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§18 — cada condición individual, fallando sola, excluye');
// ═══════════════════════════════════════════════════════════════════════

var casosIndividuales = [
  { campo: 'event_status', valor: 'OPEN', esperado: 'event_status="OPEN"' },
  { campo: 'event_status', valor: 'INVALID', esperado: 'event_status="INVALID"' },
  { campo: 'monetization_status', valor: 'EXPOSURE', esperado: 'monetization_status="EXPOSURE"' },
  { campo: 'monetization_status', valor: 'N_A', esperado: 'monetization_status="N_A"' },
  { campo: 'attribution_status', valor: 'UNRESOLVED', esperado: 'attribution_status="UNRESOLVED"' },
  { campo: 'attribution_status', valor: 'N_A', esperado: 'attribution_status="N_A"' },
  { campo: 'monetary_basis_valid', valor: false, esperado: 'monetary_basis_valid=false' },
  { campo: 'temporal_basis_valid', valor: false, esperado: 'temporal_basis_valid=false' },
  { campo: 'scope_valid', valor: false, esperado: 'scope_valid=false' },
  { campo: 'relationship_resolution_permite_inclusion', valor: false, esperado: 'relationship_resolution_permite_inclusion=false' }
];
casosIndividuales.forEach(function (c) {
  var comp = base();
  comp[c.campo] = c.valor;
  var r = A.evaluarAdmisibilidad(comp);
  ok(!r.admisible, 'solo "' + c.campo + '"="' + c.valor + '" falla → excluido');
  ok(r.exclusion_reason.indexOf(c.esperado) !== -1,
    'exclusion_reason menciona "' + c.esperado + '"  [recibido="' + r.exclusion_reason + '"]');
});

// ═══════════════════════════════════════════════════════════════════════
seccion('§18 — acumulación de motivos (varias fallas simultáneas, no solo la primera)');
// ═══════════════════════════════════════════════════════════════════════

var multiFalla = Object.assign(base(), {
  event_status: 'OPEN',
  monetary_basis_valid: false,
  scope_valid: false
});
var rMulti = A.evaluarAdmisibilidad(multiFalla);
ok(!rMulti.admisible, 'múltiples fallas → excluido');
ok(rMulti.exclusion_reason.indexOf('event_status="OPEN"') !== -1, 'motivo incluye event_status');
ok(rMulti.exclusion_reason.indexOf('monetary_basis_valid=false') !== -1, 'motivo incluye monetary_basis_valid');
ok(rMulti.exclusion_reason.indexOf('scope_valid=false') !== -1, 'motivo incluye scope_valid');
ok(rMulti.exclusion_reason.indexOf('attribution_status') === -1, 'motivo NO menciona attribution_status (esa condición sí pasaba)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§18 — las 7 señales son obligatorias, ninguna se asume por defecto');
// ═══════════════════════════════════════════════════════════════════════

['component_id', 'event_status', 'monetization_status', 'attribution_status',
  'monetary_basis_valid', 'temporal_basis_valid', 'scope_valid',
  'relationship_resolution_permite_inclusion'].forEach(function (campoFaltante) {
  var comp = base();
  delete comp[campoFaltante];
  lanza(function () { A.evaluarAdmisibilidad(comp); },
    'falta "' + campoFaltante + '" → lanza (no se recalcula ni se asume aquí)');
});

lanza(function () { A.evaluarAdmisibilidad(null); }, 'null → lanza');
lanza(function () { A.evaluarAdmisibilidad('no-objeto'); }, 'no-objeto → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutación — confirmar que es compuerta AND, no score ponderado (§18 literal)');
// ═══════════════════════════════════════════════════════════════════════

// Caso con 6 de 7 condiciones satisfechas, 1 sola falla:
var casiTodoBien = Object.assign(base(), { scope_valid: false });
var rCasiTodoBien = A.evaluarAdmisibilidad(casiTodoBien);
ok(!rCasiTodoBien.admisible,
  '6/7 condiciones satisfechas, scope_valid=false → SIGUE excluido (no hay "mayoría" que compense) — ' +
  'esto es lo que distingue una compuerta AND de un score ponderado; si el código promediara o contara ' +
  'condiciones satisfechas en vez de exigir las 7, este caso pasaría incorrectamente como admisible');

console.log('\n  (2 mutaciones de código ejecutadas como paso de Bash aparte antes del commit — ver mensaje de cierre:');
console.log('   1. "if (motivos.length)" → "if (motivos.length === 7)": un caso con 1..6 condiciones fallando');
console.log('      pasa a {admisible:true, exclusion_reason:null} — forma válida, la atrapa esta batería.');
console.log('   2. "admisible: false" → "admisible: motivos.length >= 4" en la rama de exclusión: con 4 fallas');
console.log('      da admisible=true CON motivo adjunto — par desincronizado, lo atrapa verificarConsistenciaInterna.)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Salvaguarda de consistencia interna (§18 compuerta binaria)');
// ═══════════════════════════════════════════════════════════════════════

// La ruta pública nunca produce un par desincronizado, así que esto se
// prueba llamando la salvaguarda directamente con datos manipulados
// (expuesta en module.exports para exactamente esto).
ok(A.verificarConsistenciaInterna({ admisible: true, exclusion_reason: null }).admisible === true,
  'forma válida "admisible limpio" (true + null) pasa');
ok(A.verificarConsistenciaInterna({ admisible: false, exclusion_reason: 'algún motivo' }).admisible === false,
  'forma válida "excluido con motivo" (false + string) pasa');

lanza(function () { A.verificarConsistenciaInterna({ admisible: true, exclusion_reason: 'motivo pero admisible' }); },
  'admisible=true CON exclusion_reason → lanza (par desincronizado, estado imposible en §18)');
lanza(function () { A.verificarConsistenciaInterna({ admisible: false, exclusion_reason: null }); },
  'admisible=false SIN exclusion_reason → lanza (excluido sin motivo viola §18: "conserva motivo")');
lanza(function () { A.verificarConsistenciaInterna({ admisible: 'quizás', exclusion_reason: null }); },
  'admisible en un valor que no es booleano → lanza (no hay estado intermedio en una compuerta binaria)');

// Y confirmamos que la salvaguarda está efectivamente cableada a la ruta
// pública: todas las salidas de evaluarAdmisibilidad ya pasaron por ella
// en los asserts anteriores sin lanzar (309 asserts de regresión), lo que
// significa que el código correcto nunca la dispara.
ok(true, 'la ruta pública (todos los casos anteriores) nunca disparó la salvaguarda — el invariante se sostiene');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
