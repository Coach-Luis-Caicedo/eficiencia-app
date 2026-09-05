/**
 * motor-cff/consolidacion.test.js — Fase 4b (ii)
 * node motor-cff/consolidacion.test.js
 */

'use strict';

var C = require('./consolidacion');

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
function near(a, b, msg) { ok(typeof a === 'number' && Math.abs(a - b) < 1e-9, msg + (Math.abs(a - b) < 1e-9 ? '' : '  [recibido=' + a + ' esperado=' + b + ']')); }
function lanza(fn, msg) { var l = false; try { fn(); } catch (e) { l = true; } ok(l, msg); }

var HIER = [{ node_id: 'ORG', parent_id: null }, { node_id: 'N1', parent_id: 'ORG' }, { node_id: 'N2', parent_id: 'ORG' }];

function comp(over) {
  return Object.assign({
    component_id: 'C', valor: 1000,
    event_status: 'COMPLETE', monetization_status: 'OBSERVED', attribution_status: 'CONFIRMED',
    monetary_basis_valid: true, temporal_basis_valid: true, scope_valid: true,
    temporal_nature: 'PERIOD_FLOW', aggregation_frequency: 'MONTHLY',
    original_currency: 'USD', valuation_basis: 'NOMINAL', esTransferenciaInternaPura: false
  }, over);
}
function entrada(over) {
  return Object.assign({
    componentes: [comp({ component_id: 'C1' })],
    relaciones: [], nodeHierarchy: HIER, nodeSet: ['ORG'], nodeRaiz: 'ORG', economicScope: 'ORGANIZATION'
  }, over);
}

// ═══════════════════════════════════════════════════════════════════════
seccion('§19 — pipeline feliz: los 4 cuadrantes de la matriz 2×2');
// ═══════════════════════════════════════════════════════════════════════

var r4q = C.consolidarPeriodoYAlcance(entrada({
  componentes: [
    comp({ component_id: 'C1', attribution_status: 'CONFIRMED', monetization_status: 'OBSERVED', valor: 1000 }),
    comp({ component_id: 'C2', attribution_status: 'CONFIRMED', monetization_status: 'ESTIMATED', valor: 200 }),
    comp({ component_id: 'C3', attribution_status: 'SUPPORTED', monetization_status: 'OBSERVED', valor: 50 }),
    comp({ component_id: 'C4', attribution_status: 'SUPPORTED', monetization_status: 'ESTIMATED', valor: 30 })
  ]
}));
near(r4q.confirmed_observed, 1000, 'confirmed_observed = 1000');
near(r4q.confirmed_estimated, 200, 'confirmed_estimated = 200');
near(r4q.supported_observed, 50, 'supported_observed = 50');
near(r4q.supported_estimated, 30, 'supported_estimated = 30');
near(r4q.cff_confirmed, 1200, 'cff_confirmed = 1000 + 200');
near(r4q.cff_supported_additional, 80, 'cff_supported_additional = 50 + 30');
near(r4q.cff_total, 1280, 'cff_total = 1200 + 80');
eq(r4q.coverageInput.componentes_admisibles, 4, '4 componentes admisibles');
eq(r4q.reporting_currency, 'USD', 'reporting_currency propagada');
eq(r4q.valuation_basis, 'NOMINAL', 'valuation_basis propagada');

// ═══════════════════════════════════════════════════════════════════════
seccion('VALIDAR — naturaleza temporal y frecuencia');
// ═══════════════════════════════════════════════════════════════════════

var rTemp = C.consolidarPeriodoYAlcance(entrada({
  componentes: [
    comp({ component_id: 'C1', valor: 500 }),
    comp({ component_id: 'C_stock', valor: 9999, temporal_nature: 'STOCK' }) // sin transformacionValidada
  ]
}));
near(rTemp.cff_total, 500, 'STOCK sin transformación validada NO entra a cff_total (queda en 500, no 10499)');
ok(rTemp.coverageInput.componentes_excluidos.some(function (x) {
  return x.component_id === 'C_stock' && x.categoria === C.CATEGORIAS_EXCLUSION.TEMPORAL;
}), 'C_stock queda registrado como excluido por naturaleza temporal (visible, con motivo)');

var rStockOk = C.consolidarPeriodoYAlcance(entrada({
  componentes: [comp({ component_id: 'C1', valor: 500 }),
    comp({ component_id: 'C_stock', valor: 0, temporal_nature: 'STOCK', transformacionValidada: true, valorFlujoEquivalente: 120 })]
}));
near(rStockOk.cff_total, 620, 'STOCK CON transformación validada entra por su valorFlujoEquivalente (500 + 120)');

lanza(function () {
  C.consolidarPeriodoYAlcance(entrada({
    componentes: [comp({ component_id: 'C1', aggregation_frequency: 'MONTHLY' }),
      comp({ component_id: 'C2', aggregation_frequency: 'ANNUAL' })]
  }));
}, 'frecuencias mezcladas (MONTHLY + ANNUAL) → lanza (§16.1, no divide silenciosamente)');

// ═══════════════════════════════════════════════════════════════════════
seccion('NORMALIZAR — base monetaria y valuation_basis');
// ═══════════════════════════════════════════════════════════════════════

lanza(function () {
  C.consolidarPeriodoYAlcance(entrada({
    componentes: [comp({ component_id: 'C1', valuation_basis: 'NOMINAL' }),
      comp({ component_id: 'C2', valuation_basis: 'REAL' })]
  }));
}, 'NOMINAL + REAL mezclados → lanza (INV-CFF-29)');

lanza(function () {
  C.consolidarPeriodoYAlcance(entrada({
    componentes: [comp({ component_id: 'C1', original_currency: 'USD' }),
      comp({ component_id: 'C2', original_currency: 'EUR' })] // sin normalized_value
  }));
}, 'monedas distintas sin normalized_value resuelto → lanza (INV-CFF-28)');

var rMulti = C.consolidarPeriodoYAlcance(entrada({
  componentes: [
    comp({ component_id: 'C1', original_currency: 'USD', normalized_value: 100, reporting_currency: 'EUR', valor: 120 }),
    comp({ component_id: 'C2', original_currency: 'GBP', normalized_value: 50, reporting_currency: 'EUR', valor: 40 })
  ]
}));
near(rMulti.cff_total, 150, 'multi-moneda con normalized_value a EUR común → cff_total = 100 + 50 (usa normalized, no valor original)');
eq(rMulti.reporting_currency, 'EUR', 'reporting_currency = EUR');

// ═══════════════════════════════════════════════════════════════════════
seccion('RELACIONAR — ciclo CONTAINS bloquea (§13.3 / AC15)');
// ═══════════════════════════════════════════════════════════════════════

lanza(function () {
  C.consolidarPeriodoYAlcance(entrada({
    componentes: [comp({ component_id: 'C1' }), comp({ component_id: 'C2' })],
    relaciones: [
      { relation_type: 'CONTAINS', component_a_id: 'C1', component_b_id: 'C2', containment_scope: 'FULL', direction: 'A_CONTAINS_B', resolution_status: 'RESOLVED' },
      { relation_type: 'CONTAINS', component_a_id: 'C2', component_b_id: 'C1', containment_scope: 'FULL', direction: 'A_CONTAINS_B', resolution_status: 'RESOLVED' }
    ]
  }));
}, 'ciclo C1 CONTAINS C2 / C2 CONTAINS C1 → lanza (BLOCKING)');

// ═══════════════════════════════════════════════════════════════════════
seccion('RESOLVER — costos compartidos, transferencias internas, jerarquía');
// ═══════════════════════════════════════════════════════════════════════

var rSCsin = C.consolidarPeriodoYAlcance(entrada({
  componentes: [comp({ component_id: 'C1', valor: 300, shared_cost_id: 'SC1' }),
    comp({ component_id: 'C2', valor: 700, shared_cost_id: 'SC1' })]
}));
near(rSCsin.cff_total, 0, 'costo compartido sin base de asignación documentada → UNALLOCATED, fuera de cff_total (0, no 1000)');
ok(rSCsin.coverageInput.componentes_excluidos.some(function (x) { return x.categoria === C.CATEGORIAS_EXCLUSION.COSTO_COMPARTIDO; }),
  'los componentes UNALLOCATED quedan registrados con su categoría');

var rSCcon = C.consolidarPeriodoYAlcance(entrada({
  componentes: [comp({ component_id: 'C1', valor: 300, shared_cost_id: 'SC1' }),
    comp({ component_id: 'C2', valor: 700, shared_cost_id: 'SC1' })],
  sharedCosts: { SC1: { baseAsignacionDocumentada: true } }
}));
near(rSCcon.cff_total, 1000, 'con base de asignación documentada → se suman (300 + 700)');

var rTransfOrg = C.consolidarPeriodoYAlcance(entrada({
  economicScope: 'ORGANIZATION',
  componentes: [comp({ component_id: 'C1', valor: 400, esTransferenciaInternaPura: true }),
    comp({ component_id: 'C2', valor: 600, esTransferenciaInternaPura: false })]
}));
near(rTransfOrg.cff_total, 600, 'transferencia interna pura eliminada al consolidar a ORGANIZATION (queda 600, no 1000)');

var rTransfNode = C.consolidarPeriodoYAlcance(entrada({
  economicScope: 'NODE', nodeSet: ['N1'], nodeRaiz: 'N1',
  componentes: [comp({ component_id: 'C1', valor: 400, esTransferenciaInternaPura: true }),
    comp({ component_id: 'C2', valor: 600, esTransferenciaInternaPura: false })]
}));
near(rTransfNode.cff_total, 1000, 'a nivel NODE la "transferencia interna" sigue siendo real para el nodo → 400 + 600');

lanza(function () {
  C.consolidarPeriodoYAlcance(entrada({ nodeSet: ['ORG', 'N1'], nodeRaiz: 'ORG' }));
}, 'nodeSet con padre e hijo (ORG + N1) → lanza (NO_PARENT_CHILD_DOUBLE_COUNT, BLOCKING)');

// ═══════════════════════════════════════════════════════════════════════
seccion('SUMAR — EXPOSURE / UNRESOLVED / doble falla (Opción D)');
// ═══════════════════════════════════════════════════════════════════════

var rDF = C.consolidarPeriodoYAlcance(entrada({
  componentes: [
    comp({ component_id: 'C_conf', valor: 12000, attribution_status: 'CONFIRMED', monetization_status: 'OBSERVED' }),
    comp({ component_id: 'C_exp', valor: 8000, attribution_status: 'CONFIRMED', monetization_status: 'EXPOSURE' }),
    comp({ component_id: 'C_unr', valor: 3000, attribution_status: 'UNRESOLVED', monetization_status: 'OBSERVED' }),
    comp({ component_id: 'C_both', valor: 5000, attribution_status: 'UNRESOLVED', monetization_status: 'EXPOSURE' })
  ]
}));
near(rDF.cff_total, 12000, 'cff_total = 12000 — solo el componente admisible (EXPOSURE y UNRESOLVED nunca entran, §19)');
near(rDF.exposure_total, 8000, 'exposure_total = 8000 — SOLO C_exp; C_both (doble falla) NO suma aquí (Opción D), no 13000');
near(rDF.unresolved_impact_total, 3000, 'unresolved_impact_total = 3000 — SOLO C_unr; C_both NO suma aquí (Opción D), no 8000');
ok(rDF.flags.some(function (f) { return f.indexOf('C_both') !== -1 && f.indexOf('EXPOSURE_Y_UNRESOLVED') !== -1; }),
  'C_both marcado en flags[] a nivel de resultado — visible, no oculto (INV-CFF-55)');
ok(rDF.coverageInput.componentes_excluidos.some(function (x) {
  return x.component_id === 'C_both' && x.categoria === C.CATEGORIAS_EXCLUSION.DOBLE_FALLA;
}), 'C_both registrado como excluido con motivo (INV-CFF-50) — cuenta como material-no-evaluado para cobertura (§20)');

// ═══════════════════════════════════════════════════════════════════════
seccion('SUMAR — excluido por relación de riesgo + EXPOSURE/UNRESOLVED (Paso 3, INV-CFF-20)');
// ═══════════════════════════════════════════════════════════════════════

var rDupExp = C.consolidarPeriodoYAlcance(entrada({
  componentes: [
    comp({ component_id: 'C_dup_a', valor: 6000, monetization_status: 'EXPOSURE', attribution_status: 'CONFIRMED' }),
    comp({ component_id: 'C_dup_b', valor: 6000, monetization_status: 'EXPOSURE', attribution_status: 'CONFIRMED' })
  ],
  relaciones: [
    { relation_type: 'DUPLICATE', component_a_id: 'C_dup_a', component_b_id: 'C_dup_b', resolution_status: 'UNRESOLVED' }
  ]
}));
near(rDupExp.exposure_total, 0,
  'dos DUPLICATE sin resolver, ambos EXPOSURE 6000 → exposure_total = 0 (ambos excluidos por la relación) — NO 12000 (doble conteo), NO 6000 (selección sin evidencia)');
near(rDupExp.cff_total, 0, 'cff_total = 0 (ninguno admisible: EXPOSURE + relación no permite inclusión)');
ok(rDupExp.flags.some(function (f) { return f.indexOf('C_dup_a') !== -1 && f.indexOf('DUPLICATE') !== -1 && f.indexOf('INV-CFF-20') !== -1; }),
  'C_dup_a marcado en flags[] con el motivo (excluido por DUPLICATE, no sumado a totales secundarios)');
ok(rDupExp.flags.some(function (f) { return f.indexOf('C_dup_b') !== -1; }), 'C_dup_b también marcado en flags[]');
ok(rDupExp.coverageInput.componentes_excluidos.filter(function (x) { return x.component_id === 'C_dup_a'; }).length >= 1,
  'C_dup_a registrado como excluido (material-no-evaluado para cobertura)');

// mismo trato para UNRESOLVED vía CONTAINS PARTIAL_UNQUANTIFIED (también ningunoSumable)
var rContUnr = C.consolidarPeriodoYAlcance(entrada({
  componentes: [
    comp({ component_id: 'C_x', valor: 4000, attribution_status: 'UNRESOLVED', monetization_status: 'OBSERVED' }),
    comp({ component_id: 'C_y', valor: 4000, attribution_status: 'UNRESOLVED', monetization_status: 'OBSERVED' })
  ],
  relaciones: [
    { relation_type: 'CONTAINS', component_a_id: 'C_x', component_b_id: 'C_y', containment_scope: 'PARTIAL_UNQUANTIFIED', direction: 'A_CONTAINS_B', resolution_status: 'PARTIALLY_RESOLVED' }
  ]
}));
near(rContUnr.unresolved_impact_total, 0,
  'CONTAINS PARTIAL_UNQUANTIFIED (sin total pleno), ambos UNRESOLVED → unresolved_impact_total = 0, no 8000');

// control: sin la relación de riesgo, los mismos dos EXPOSURE SÍ suman (una vez cada uno)
var rExpSinRel = C.consolidarPeriodoYAlcance(entrada({
  componentes: [
    comp({ component_id: 'C_e1', valor: 6000, monetization_status: 'EXPOSURE', attribution_status: 'CONFIRMED' }),
    comp({ component_id: 'C_e2', valor: 6000, monetization_status: 'EXPOSURE', attribution_status: 'CONFIRMED' })
  ]
}));
near(rExpSinRel.exposure_total, 12000, 'control: sin relación de solapamiento, dos EXPOSURE de 6000 → exposure_total = 12000 (cada uno una vez, correcto)');

// ═══════════════════════════════════════════════════════════════════════
seccion('AC45 — verificarReconciliacionCuadrantes (prueba dirigida)');
// ═══════════════════════════════════════════════════════════════════════

var reconOk = C.verificarReconciliacionCuadrantes(
  { confirmed_observed: 12000, confirmed_estimated: 0, supported_observed: 0, supported_estimated: 0, cff_total: 12000 });
eq(reconOk.sumaCuadrantes, 12000, 'suma de cuadrantes = cff_total → válido');

lanza(function () {
  C.verificarReconciliacionCuadrantes(
    { confirmed_observed: 12000, confirmed_estimated: 0, supported_observed: 0, supported_estimated: 0, cff_total: 23000 });
}, 'cff_total (23000) ≠ suma cuadrantes (12000) → lanza (AC45: bloquear publicación)');

var reconDrift = C.verificarReconciliacionCuadrantes(
  { confirmed_observed: 12000, confirmed_estimated: 0, supported_observed: 0, supported_estimated: 0, cff_total: 12000 + 1e-11 });
ok(reconDrift.valido, 'diferencia de 1e-11 (drift de punto flotante) queda dentro de la guarda por defecto (1e-9)');

lanza(function () {
  C.verificarReconciliacionCuadrantes(
    { confirmed_observed: 12000, confirmed_estimated: 0, supported_observed: 0, supported_estimated: 0, cff_total: 12000.5 }, 0.1);
}, 'con tolerancia de negocio 0.1, una diferencia de 0.5 sigue lanzando (§19.2: no oculta diferencias materiales)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutación 1 — orden RESOLVER↔SELECCIONAR');
// ═══════════════════════════════════════════════════════════════════════

var entMut1 = entrada({
  componentes: [
    comp({ component_id: 'C_ind', valor: 20000 }),
    comp({ component_id: 'C_dup_a', valor: 5000 }),
    comp({ component_id: 'C_dup_b', valor: 5000 })
  ],
  relaciones: [
    { relation_type: 'DUPLICATE', component_a_id: 'C_dup_a', component_b_id: 'C_dup_b', resolution_status: 'UNRESOLVED' }
  ]
});
var rMut1Ok = C.consolidarPeriodoYAlcance(entMut1);
near(rMut1Ok.cff_total, 20000, 'orden correcto: DUPLICATE sin resolver → ambos excluidos → cff_total = 20000 (solo C_ind)');

// (1a) el guardia de 4b-i hace imposible correr SELECCIONAR antes de RESOLVER
lanza(function () {
  var ctx = C._nuevoContexto(entMut1);
  C._paso1Validar(ctx); C._paso2Normalizar(ctx); C._paso3Relacionar(ctx);
  C._paso5Seleccionar(ctx); // ← ANTES de _paso4Resolver: ctx.permiteInclusion está vacío
}, '(1a) SELECCIONAR antes de RESOLVER → evaluarAdmisibilidad lanza (falta la 7ª señal) — el orden es una dependencia real, no de estilo');

console.log('  (1b) mutación de código —swap de _paso4/_paso5 + default de la señal a true— ejecutada como paso de');
console.log('       Bash aparte: cff_total pasa de 20000 a 30000, diferencia 10000 exacta (doble conteo del hecho');
console.log('       DUPLICATE). Ver mensaje de cierre.');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutación 2 — AC45 / exclusión de EXPOSURE y UNRESOLVED del total');
// ═══════════════════════════════════════════════════════════════════════

var entMut2 = entrada({
  componentes: [
    comp({ component_id: 'C_conf', valor: 12000, attribution_status: 'CONFIRMED', monetization_status: 'OBSERVED' }),
    comp({ component_id: 'C_exp', valor: 8000, attribution_status: 'CONFIRMED', monetization_status: 'EXPOSURE' }),
    comp({ component_id: 'C_unr', valor: 3000, attribution_status: 'UNRESOLVED', monetization_status: 'OBSERVED' })
  ]
});
var rMut2Ok = C.consolidarPeriodoYAlcance(entMut2);
near(rMut2Ok.cff_total, 12000, 'orden correcto: cff_total = 12000; exposure_total = 8000 y unresolved_impact_total = 3000 aparte');
near(rMut2Ok.exposure_total, 8000, 'exposure_total = 8000, fuera de cff_total');
near(rMut2Ok.unresolved_impact_total, 3000, 'unresolved_impact_total = 3000, fuera de cff_total');
console.log('  mutación de código —sumar exposure_total + unresolved_impact_total a cff_total— ejecutada como paso de');
console.log('  Bash aparte: cff_total pasa a 23000, verificarReconciliacionCuadrantes lanza (23000 ≠ 12000). Ver cierre.');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
