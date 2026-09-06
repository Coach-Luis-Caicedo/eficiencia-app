/**
 * motor-ifd/runIFD.test.js — Fase 7a (runEPD)
 * node motor-ifd/runIFD.test.js
 *
 * End-to-end: el pseudocódigo de §28 encadenado. Cada rama de la cascada
 * (S0 / S1 / CUANTIFICADO) + el EPD_OUTPUT consolidado y autovalidado.
 * La agregación multi-EPD (§13, §25) es 7b — no está aquí.
 */

'use strict';

var R = require('./runIFD');
var C = require('./contratos');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }
function near(a, b, m) { ok(typeof a === 'number' && Math.abs(a - b) < 1e-9, m + (Math.abs(a - b) < 1e-9 ? '' : '  [recibido=' + a + ' esperado=' + b + ']')); }
function out(r) { return (r && r.output) || {}; } // acceso null-safe: si runEPD devolvió { ok:false } no revienta el test

function inp(o) {
  return Object.assign({
    epd_id: 'EPD-1', engine_version: 'ifd-js-0.1',
    deterioration_sustained: true, evidence_present: true, mechanism_traceable: true,
    horizon_defined: true, assumptions_declared: true,
    Q: 3, C: 3, T: 3, R: 3,
    variable_type: 'V3', evolution_type: 'EV-A', series_sufficiency: 3,
    horizon: 6, hms: 12,
    economic_traceability: false, attribution_category: 'CONFIRMED'
  }, o || {});
}
// EPD que llega a CUANTIFICADO con economía: delta 3000 + 400×6 = 5400, FEP 3
function econ(o) {
  return inp(Object.assign({ baseline: 3000, delta: 400, lower_bound: 0, unit: 'horas', unit_value: 25, economic_traceability: true }, o || {}));
}

// ═══════════════════════════════════════════════════════════════════════
seccion('§28 — CUANTIFICADO: la cascada completa end-to-end');
// ═══════════════════════════════════════════════════════════════════════

var q = R.runEPD(econ());
ok(q.ok, 'runEPD ok');
eq(q.output.output_level, 'S3', 'FEP 3, horizonte ≤ HMS → S3');
eq(q.output.status, 'CUANTIFICADO', 'status CUANTIFICADO');
near(q.output.projection_base, 5400, '§20: 3000 + 400×6 = 5400');
near(q.output.projection_lower, 5022, '§22: envelope ±7% → 5022');
near(q.output.projection_upper, 5778, '§22: 5778');
near(q.output.economic_base, 135000, '§23.2 §12: 5400 × 25 = 135.000');
near(q.output.economic_lower, 125550, '§23.2: 5022 × 25');
near(q.output.economic_upper, 144450, '§23.2: 5778 × 25');
eq(q.output.method, 'DELTA_ADITIVO', 'método de §28');
eq(q.output.attribution_category, 'CONFIRMED', 'attribution_category en la salida (§31)');
eq(q.output.scenarios.map(function (s) { return s.escenario; }), ['CONTINUIDAD', 'INTENSIFICACION', 'CONTENCION'], '§21: los 3 escenarios');
near(q.output.scenarios[0].valor, 5400, '§21.1 continuidad = projection_base');
eq(Object.keys(q.output.heritage_outputs).sort(), ['CFD', 'CFR', 'ROI_P', 'TRE', 'VER'], '§24: las 5 salidas heredadas');
ok(Object.keys(q.output.heritage_outputs).every(function (k) { return q.output.heritage_outputs[k].estado === 'PENDIENTE_AUDITORIA'; }), '§24: cada una es el marcador, nunca cifra');
eq(q.output.alerts, [], 'caso limpio → sin alertas');
ok(C.validarEPDOutput(q.output).valido, 'el EPD_OUTPUT se autovalida (§31)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§6 / §7 — S0 NO_PROYECTABLE');
// ═══════════════════════════════════════════════════════════════════════

var s0adm = R.runEPD(inp({ deterioration_sustained: false }));
eq([s0adm.output.output_level, s0adm.output.status], ['S0', 'NO_PROYECTABLE'], 'no admisible → S0');
eq(s0adm.output.alerts, ['A01'], 'A01 ADMISIBILIDAD_INSUFICIENTE');
eq(s0adm.output.projection_base, null, 'S0 → projection_base null (no 0 — §26)');
eq(s0adm.output.economic_base, null, 'S0 → economic_base null');

var s0r0 = R.runEPD(inp({ R: 0 }));
eq(s0r0.output.alerts, ['A03'], '§35: R=0 → S0, A03 TRAZABILIDAD_INSUFICIENTE (no A02)');
var s0c0 = R.runEPD(inp({ C: 0 }));
eq(s0c0.output.alerts, ['A02'], 'FEP=0 por C → A02 (dimensión ≠ R)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§14-18 — S1 CUALITATIVO / DEGRADADO_A_CUALITATIVO');
// ═══════════════════════════════════════════════════════════════════════

var v5 = R.runEPD(inp({ variable_type: 'V5' }));
var evc = R.runEPD(inp({ evolution_type: 'EV-CUAL' }));
var fep1 = R.runEPD(inp({ Q: 1 }));
var serie = R.runEPD(inp({ variable_type: 'V2', series_sufficiency: 1 }));
ok(v5.ok && evc.ok && fep1.ok && serie.ok, 'los 4 cortes de clasificación → runEPD ok (salida bien formada, sin fuga del corte)');
eq([out(v5).output_level, out(v5).status], ['S1', 'CUALITATIVO'], 'V5 → S1/CUALITATIVO (§20.5)');
eq(out(v5).projection_base, null, 'V5 → sin cifra fabricada');
eq([out(evc).output_level, out(evc).status], ['S1', 'CUALITATIVO'], 'EV-CUAL → S1/CUALITATIVO (§16)');
eq([out(fep1).output_level, out(fep1).status], ['S1', 'CUALITATIVO'], 'effective_FEP=1 → S1/CUALITATIVO');
eq([out(serie).output_level, out(serie).status], ['S1', 'DEGRADADO_A_CUALITATIVO'], 'serie SS1 en V2 → S1/DEGRADADO');
ok((out(serie).alerts || []).indexOf('A04') !== -1, 'A04 SERIE_INSUFICIENTE');

// ═══════════════════════════════════════════════════════════════════════
seccion('§20 — S1 por método / conteo bruto');
// ═══════════════════════════════════════════════════════════════════════

var incompat = R.runEPD(inp({ evolution_type: 'EV-M', baseline: undefined, delta: undefined }));
eq([incompat.output.output_level, incompat.output.status], ['S1', 'DEGRADADO_A_CUALITATIVO'], 'sin parámetros de método → S1/DEGRADADO');
ok(incompat.output.alerts.indexOf('A05') !== -1, 'A05 METODO_INCOMPATIBLE');

var bruto = R.runEPD(inp({ variable_type: 'V1', evolution_type: 'EV-A', delta: 10, baseline: 100, exposure_obs: 12000, exposure_future: 72000, lower_bound: 0 }));
ok(bruto.output.alerts.indexOf('A13') !== -1, '§20.1: V1 con volumen 12000→72000 (500%) → A13, no se extrapola el conteo bruto');

// ═══════════════════════════════════════════════════════════════════════
seccion('§18 — HMS: degradación de effective_FEP (nunca sube, §30)');
// ═══════════════════════════════════════════════════════════════════════

var hms = R.runEPD(econ({ horizon: 20, hms: 12, trend_a: 3000, trend_b: 400, baseline: undefined, delta: undefined }));
eq(hms.output.output_level, 'S2', 'H=20 > HMS=12 → effective_FEP 3→2 → S2 (degradado, no S3)');
ok(hms.output.alerts.indexOf('A07') !== -1, 'A07 HORIZONTE_EXCEDIDO');
near(hms.output.projection_base, 11000, 'tendencia: 3000 + 400×20 = 11000');
near(hms.output.economic_base, 275000, '11000 × 25 = 275.000 (la cifra se calcula igual; solo baja el nivel)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§23 — puerta económica y atribución en la salida consolidada');
// ═══════════════════════════════════════════════════════════════════════

var sinUnit = R.runEPD(econ({ unit: undefined }));
eq(sinUnit.output.economic_base, null, 'sin `unit` → puerta §23.1 cerrada, sin cifra');
ok(sinUnit.output.alerts.indexOf('A09') !== -1, 'A09 VALOR_ECONOMICO_INSUFICIENTE');
eq(sinUnit.output.output_level, 'S3', 'la puerta económica cerrada NO degrada el nivel físico (§20: rama posible)');

var unres = R.runEPD(econ({ attribution_category: 'UNRESOLVED' }));
near(unres.output.economic_base, 135000, '§35: UNRESOLVED → la valoración se conserva, 135.000');
ok(unres.output.alerts.indexOf('A10') !== -1, 'A10: se restringe la afirmación, NO la cifra');

var noEcon = R.runEPD(inp({ baseline: 3000, delta: 400, lower_bound: 0 }));
eq(noEcon.output.economic_base, null, 'EPD no-económico → sin cifra');
eq(noEcon.output.alerts, [], 'EPD no-económico → sin A09 (§35: "no monetizar", sin más)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§15 / §25 — dominio y doble conteo en la salida');
// ═══════════════════════════════════════════════════════════════════════

var clamp = R.runEPD(econ({ trend_a: 90, trend_b: 5, baseline: undefined, delta: undefined, lower_bound: 0, upper_bound: 100 }));
ok(clamp.output.alerts.indexOf('A06') !== -1, '§15: 90 + 5×6 = 120 recortado a 100 → A06 DOMINIO_EXCEDIDO');
near(clamp.output.projection_base, 100, 'projection_base recortado a upper_bound');
eq(clamp.output.alerts, ['A06'], 'A06 UNA sola vez aunque proyección Y envelope recorten (dedup §28)');

var kk = { event_id: 'E1', resource_id: 'R1', cost_component_id: 'CC1', period_id: '2026-Q1' };
var dc = R.runEPD(econ({ double_count_ids: [kk, kk] }));
ok(dc.output.alerts.indexOf('A14') !== -1, '§25: misma clave de solapamiento dos veces → A14 DOBLE_CONTEO_POTENCIAL');
ok(dc.output.notes.some(function (n) { return n.indexOf('agregación automática bloqueada') !== -1; }), '§25/§35: nota de bloqueo de la agregación');
eq(dc.output.double_count_ids, [kk, kk], '§31: double_count_ids viaja de EPD_INPUT a EPD_OUTPUT (la agregación §25 lo necesita)');
eq(R.runEPD(econ()).output.double_count_ids, undefined, 'sin double_count_ids en la entrada → ausente en la salida (opcional)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§28 — input rechazado: { ok: false, errors }, sin EPD_OUTPUT');
// ═══════════════════════════════════════════════════════════════════════

var badAtr = R.runEPD(inp({ attribution_category: 0.7 }));
ok(!badAtr.ok && badAtr.output === undefined, 'atribución 0.70 → { ok:false }, sin output parcial');
ok(badAtr.errors.some(function (e) { return e.indexOf('attribution_category') !== -1; }), 'el error nombra attribution_category');

var badFalta = R.runEPD(inp({ Q: undefined }));
ok(!badFalta.ok && badFalta.errors.some(function (e) { return e.indexOf('Q') !== -1; }), 'falta Q → { ok:false }, Q en errors');

// ═══════════════════════════════════════════════════════════════════════
seccion('§35 — "misma entrada + misma versión → misma salida" (determinismo)');
// ═══════════════════════════════════════════════════════════════════════

var d1 = R.runEPD(econ());
var d2 = R.runEPD(econ());
ok(JSON.stringify(d1) === JSON.stringify(d2), 'dos ejecuciones de la misma entrada → salida idéntica (deep-equal)');
var d3 = R.runEPD(econ({ attribution_category: 'UNRESOLVED' }));
ok(JSON.stringify(d1) !== JSON.stringify(d3), 'entrada distinta → salida distinta (el deep-equal no es trivialmente cierto)');

// El deep-equal de dos ejecuciones síncronas NO detecta un Date.now() en una
// nota (ambas caen en el mismo ms). Guarda robusta: ninguna fuente de estado
// no determinista en runIFD.js. `Math.random()` sí lo detecta el deep-equal;
// `Date.now()` solo esta grep lo agarra.
var fs = require('fs');
var src = fs.readFileSync(require('path').join(__dirname, 'runIFD.js'), 'utf8');
ok(!/Date\.now|Math\.random|new Date\b/.test(src),
  'runIFD.js no contiene Date.now / Math.random / new Date — sin estado oculto no determinista (§35)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. `if (clas.terminal)` -> `if (false)`: el corte de clasificación (V5/EV-CUAL/FEP1/');
console.log('     serie) deja de detener la cascada. Mecanismo real de la falla: cuando terminal===true,');
console.log('     resolverClasificacion devuelve { terminal, resultado:{...} } SIN alerts/notes a nivel');
console.log('     superior; al seguir, `clas.alerts` es undefined y alerts.concat(undefined) mete un');
console.log('     código de alerta inválido -> validarEPDOutput rechaza -> runEPD devuelve { ok:false }.');
console.log('     El assert "los 4 cortes -> runEPD ok" y los eq de output_level/status fallan (7 rojos).');
console.log('  2. output_level = nivelSalidaMax(fep) en vez de effectiveFep → el caso HMS da S3 en');
console.log('     vez de S2 (la degradación de §18 se pierde, §30 violado).');
console.log('  3. quitar unicos() (dedup de alertas) → el caso de clamp da ["A06","A06"] (proyección');
console.log('     y envelope ambos recortan) en vez de ["A06"].');
console.log('  4a. meter Math.random() en una nota de consolidarEPDOutput → el deep-equal de dos');
console.log('      ejecuciones falla. 4b. Date.now(): el deep-equal NO lo agarra (mismo ms) —');
console.log('      lo agarra la guarda grep "sin Date.now/Math.random en runIFD.js".');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
