/**
 * motor-cff/costos_compartidos.test.js — Fase 3
 * node motor-cff/costos_compartidos.test.js
 */

'use strict';

var CC = require('./costos_compartidos');

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

// ═══════════════════════════════════════════════════════════════════════
seccion('§14 — no prorrateo igualitario por defecto (caso donde alguien podría verse tentado)');
// ═══════════════════════════════════════════════════════════════════════

// 3 nodos comparten un costo de licencia de software: cada uno reporta un
// original_value distinto (no partes iguales) — el escenario típico donde,
// SIN criterio defendible, alguien prorratearía en partes iguales "porque
// no se sabe mejor". El motor NO debe hacerlo por defecto.
var grupoLicencia = [
  { component_id: 'C1', original_value: 500 },
  { component_id: 'C2', original_value: 300 },
  { component_id: 'C3', original_value: 200 }
];

var rSinBase = CC.resolverCostoCompartido(grupoLicencia, {});
eq(rSinBase.estado, 'UNALLOCATED', 'sin base de asignación documentada → UNALLOCATED, no se suma');
eq(rSinBase.sumables, [], 'ningún componente se marca sumable por defecto');
eq(rSinBase.totalParcial, null, 'totalParcial=null — el motor NO calcula ni un prorrateo igualitario (1000/3=333.33) ni ningún otro reparto inventado');

var rBaseFalse = CC.resolverCostoCompartido(grupoLicencia, { baseAsignacionDocumentada: false });
eq(rBaseFalse.estado, 'UNALLOCATED', 'baseAsignacionDocumentada=false explícito → mismo resultado, UNALLOCATED');

var rConBase = CC.resolverCostoCompartido(grupoLicencia, { baseAsignacionDocumentada: true, descripcionBase: 'prorrateo por uso medido de licencias' });
eq(rConBase.estado, 'ASIGNADO', 'con base documentada → ASIGNADO');
eq(rConBase.totalParcial, 1000, 'con base documentada, se suman los originales tal cual (500+300+200=1000), no se recalculan');

lanza(function () { CC.resolverCostoCompartido([], {}); }, 'grupo vacío → lanza');

// ── Mutación real: forzar que el motor prorratee por defecto y confirmar
//    que el caso específico (sin base documentada) empieza a "sumar" ──
seccion('Mutación — no-prorrateo por defecto');
console.log('  (ejecutada como paso de Bash aparte antes del commit — ver mensaje de cierre)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§14 — transferencias internas puras: eliminadas a nivel ORGANIZACION, conservadas a nivel NODE');
// ═══════════════════════════════════════════════════════════════════════

var componentes = [
  { component_id: 'REAL-1', original_value: 800, esTransferenciaInternaPura: false },
  { component_id: 'TRANSF-1', original_value: 300, esTransferenciaInternaPura: true },
  { component_id: 'TRANSF-2', original_value: 300, esTransferenciaInternaPura: true } // el "espejo" de TRANSF-1 en otro nodo
];

var rNode = CC.filtrarTransferenciasInternasPuras(componentes, 'NODE');
eq(rNode.conservados.length, 3, 'a nivel NODE, las 3 se conservan (la transferencia sigue siendo real para ESE nodo)');
eq(rNode.eliminados, [], 'a nivel NODE, nada se elimina');

var rOrg = CC.filtrarTransferenciasInternasPuras(componentes, 'ORGANIZATION');
eq(rOrg.conservados.map(function (c) { return c.component_id; }), ['REAL-1'], 'a nivel ORGANIZATION, solo el consumo real (REAL-1) se conserva');
eq(rOrg.eliminados.map(function (c) { return c.component_id; }), ['TRANSF-1', 'TRANSF-2'], 'las 2 transferencias puras se eliminan de la consolidación organizacional');

lanza(function () { CC.filtrarTransferenciasInternasPuras([{ component_id: 'X', original_value: 1 }], 'ORGANIZATION'); },
  'componente sin esTransferenciaInternaPura declarado explícitamente → lanza (no se asume false por ausencia)');
lanza(function () { CC.filtrarTransferenciasInternasPuras(componentes, 'OTRO_ALCANCE'); },
  'alcanceObjetivo inválido → lanza');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
