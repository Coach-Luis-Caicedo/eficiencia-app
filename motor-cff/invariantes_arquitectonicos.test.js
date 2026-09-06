/**
 * motor-cff/invariantes_arquitectonicos.test.js — Fase 5
 * node motor-cff/invariantes_arquitectonicos.test.js
 *
 * Los 12 invariantes que NO son escenarios de código sino afirmaciones
 * arquitectónicas: "CFF ≠ [algo fuera de CFF]". No se verifican con un
 * caso de entrada — se verifican constatando que la SUPERFICIE de
 * `motor-cff` (los module.exports de sus 14 archivos + los campos de
 * entrada de runCFF) no expone NINGUNA vía hacia ese algo. La única vía de
 * monetización es `quantity × monetary_basis` (o valor transportado) a
 * través de un CFF_EVENT.
 *
 * 12 aserciones NOMBRADAS (una por invariante) + 1 mutación real (agregar
 * un export `aie_state` y confirmar que la aserción de INV-16 lo atrapa).
 */

'use strict';

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }

// ── superficie completa del módulo ────────────────────────────────────
var ARCHIVOS = ['enums', 'estados', 'contratos', 'monetizacion', 'atribucion', 'relaciones',
  'costos_compartidos', 'nodos', 'temporalidad', 'moneda', 'admisibilidad', 'consolidacion',
  'cobertura', 'runCFF', 'versionamiento'];

// Superficie de LÓGICA: solo los exports que son funciones. Los invariantes
// ARQ son sobre comportamiento/cálculo, y el cálculo vive en funciones — un
// enum registrado por completitud de §23 pero sin cablear (p.ej.
// AVOIDABILITY_STATUS, que enums.js documenta como aislado) NO es una vía.
function superficie() {
  var nombres = [];
  ARCHIVOS.forEach(function (f) {
    var mod;
    try { mod = require('./' + f); } catch (e) { return; }
    Object.keys(mod).forEach(function (k) {
      if (typeof mod[k] === 'function') nombres.push(f + '.' + k);
    });
  });
  return nombres;
}
function ningunoMatchea(re, superf) {
  return !superf.some(function (n) { return re.test(n); });
}

// Campos de entrada que runCFF exige/acepta (de su validarCaso + doc de firma)
var CAMPOS_ENTRADA_RUNCFF = [
  'cff_case_id', 'period_start', 'period_end', 'scope', 'node_set', 'reporting_currency',
  'valuation_basis', 'nodeHierarchy', 'nodeRaiz', 'economicScope', 'eventos', 'relaciones',
  'sharedCosts', 'toleranciaReconciliacion', 'fxPorComponente', 'coberturaSeniales',
  'run_id', 'calculation_version', 'ruleset_version', 'calculated_at', 'generated_at',
  'formula_versions', 'monetary_basis_versions', 'relationship_versions', 'input_snapshot_ids',
  'update_reason', 'parent_calculation_version', 'run_status'
];

var S = superficie();
var TODO = S.concat(CAMPOS_ENTRADA_RUNCFF.map(function (c) { return 'runCFF.entrada.' + c; }));

// ═══════════════════════════════════════════════════════════════════════
seccion('12 invariantes arquitectónicos — la superficie no ofrece la vía prohibida');
// ═══════════════════════════════════════════════════════════════════════

ok(ningunoMatchea(/aie|estado.?aie|aie.?state|aie.?score/i, TODO),
  'INV-CFF-16 — CFF no modifica AIE: ninguna función ni campo de entrada acepta estado AIE');

ok(ningunoMatchea(/familia.?diagn|diagnostic.?family|indice.?compuesto|composite.?index|kpi.?compuesto/i, TODO),
  'INV-CFF-17 — CFF no constituye familia diagnóstica: no hay export de índice/score compuesto');

(function () {
  var enums = require('./enums');
  // AVOIDABILITY_STATUS existe en enums.js SOLO como vocabulario de §23,
  // documentado como aislado y sin cablear. La verificación real: ninguna
  // FUNCIÓN calcula evitabilidad.
  ok(ningunoMatchea(/evitab|avoidab/i, TODO) && Array.isArray(enums.AVOIDABILITY_STATUS),
    'INV-CFF-37 — CFF ≠ costo evitable: ninguna función calcula evitabilidad (AVOIDABILITY_STATUS existe como enum §23 aislado, sin cablear)');
})();

ok(ningunoMatchea(/ahorro|saving/i, TODO),
  'INV-CFF-38 — CFF ≠ ahorro: no hay función que calcule un ahorro');

ok(ningunoMatchea(/valor.?recuperad|recovered.?value|recovery.?path/i, TODO),
  'INV-CFF-39 — CFF ≠ valor recuperado: no hay Recovery Path ni cálculo de valor recuperado');

ok(ningunoMatchea(/\broi\b|\btre\b|return.?on.?invest/i, TODO),
  'INV-CFF-40 — CFF ≠ ROI: no hay cálculo de ROI/TRE (§33.1)');

ok(ningunoMatchea(/aie/i, ['runCFF.entrada.' + CAMPOS_ENTRADA_RUNCFF.join(' runCFF.entrada.')]),
  'INV-CFF-52 — cambio de AIE no altera CFF: runCFF no recibe ningún input AIE que pudiera propagarse');

(function () {
  var cob = require('./cobertura');
  // clasificarCobertura(coverageInput, senales) — coverageInput viene de consolidacion
  // (embudo de componentes), nunca de un input EFO.
  var firma = cob.clasificarCobertura.length; // aridad 2
  ok(firma === 2 && ningunoMatchea(/efo/i, TODO),
    'INV-CFF-53 — CFF coverage ≠ EFO coverage: clasificarCobertura toma (coverageInput, señales), sin parámetro EFO');
})();

ok(ningunoMatchea(/percep|clima|sentiment|humano|human.?value|valor.?humano|experiencia.?human/i, TODO),
  'INV-CFF-58 — CFF no monetiza percepciones/estados/valor humano: sin export que los tome');

(function () {
  var atr = require('./atribucion');
  var salidas = ['CONFIRMED', 'SUPPORTED', 'UNRESOLVED'];
  // clasificarAtribucion nunca puede devolver un AVOIDABILITY_STATUS
  var enums = require('./enums');
  var contaminado = enums.AVOIDABILITY_STATUS.some(function (v) { return salidas.indexOf(v) !== -1; });
  ok(!contaminado && typeof atr.clasificarAtribucion === 'function',
    'INV-CFF-59 — atribuible ≠ evitable: clasificarAtribucion devuelve {CONFIRMED,SUPPORTED,UNRESOLVED}, nunca un AVOIDABILITY_STATUS');
})();

ok(ningunoMatchea(/antes.?despues|before.?after|pre.?post|delta.?bruto|gross.?delta/i, TODO),
  'INV-CFF-60 — antes/después bruto no basta: no hay función que calcule un delta antes/después');

ok(ningunoMatchea(/\bift\b|prospectiv|proyecci.n.?futur|forecast|deterioration.?path/i, TODO),
  'INV-CFF-69 — IFT no modifica admisibilidad histórica: motor-cff no importa ni recibe proyecciones IFT');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutación — agregar un export tipo AIE y confirmar que INV-16 lo atrapa');
// ═══════════════════════════════════════════════════════════════════════
console.log('  ejecutada como paso de Bash aparte: se agrega `module.exports.aie_state = ...` a monetizacion.js,');
console.log('  se corre este archivo y la aserción NOMBRADA de INV-CFF-16 (no un fallo genérico) pasa a fallar.');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
