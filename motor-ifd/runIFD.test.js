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
seccion('§13 / §25 / §29#15 — agregarEPDs: roll-up multi-EPD (Fase 7b)');
// ═══════════════════════════════════════════════════════════════════════

function salidaEcon(o) { return R.runEPD(econ(Object.assign({ impact_type: 'IOF' }, o))).output; }
var A = salidaEcon({ epd_id: 'A' });                          // 5400 × 25 = 135.000
var B = salidaEcon({ epd_id: 'B', delta: 200 });              // (3000 + 200×6) × 25 = 4200 × 25 = 105.000

var agg = R.agregarEPDs([A, B]);
ok(agg.ok, 'agregarEPDs ok');
eq(agg.componente, 'IFD_economico_futuro', '§13: el total se etiqueta como componente FUTURO, nunca se mezcla con CFF_realizado');
near(agg.economic_total, 240000, '§13: 135.000 + 105.000 = 240.000');
near(agg.economic_lower_total, 223200, 'lower sumado: 125.550 + 97.650');
near(agg.economic_upper_total, 256800, 'upper sumado: 144.450 + 112.350');
eq(agg.n_cuantificados, 2, '2 EPD cuantificados');
eq(agg.aggregation_blocked, false, 'homogéneos, sin solape → no bloqueado');

// cualitativos no se suman
var Vq = R.runEPD(inp({ epd_id: 'Vq', variable_type: 'V5' })).output;
var aggQ = R.agregarEPDs([A, Vq]);
near(aggQ.economic_total, 135000, 'el EPD cualitativo (V5) NO entra en la suma');
eq(aggQ.cualitativos.map(function (c) { return c.epd_id; }), ['Vq'], 'el V5 va en cualitativos, sin cifra');
eq(aggQ.n_cuantificados, 1, 'solo A cuenta como cuantificado');

// todos cualitativos → total null (no 0, §26)
var aggAllQ = R.agregarEPDs([Vq, R.runEPD(inp({ epd_id: 'Vq2', variable_type: 'V5' })).output]);
eq(aggAllQ.economic_total, null, 'sin EPD cuantificado → economic_total null (§26: no 0)');

// CUANTIFICADO pero sin economía (puerta §23.1 cerrada) → NO entra en la suma
var NE = R.runEPD(econ({ epd_id: 'NE', unit: undefined })).output; // status CUANTIFICADO, economic_base null
eq(NE.status, 'CUANTIFICADO', 'NE llega a CUANTIFICADO (proyección OK) pero economic_base es null');
var aggNE = R.agregarEPDs([A, NE]);
eq(aggNE.n_cuantificados, 1, 'un CUANTIFICADO sin economic_base numérico NO cuenta como cuantificado en la suma');
ok(aggNE.cualitativos.some(function (c) { return c.epd_id === 'NE'; }), 'NE va en cualitativos');
near(aggNE.economic_total, 135000, 'el total es solo el de A, sin contaminación de null');

// §25 — solapamiento material entre EPDs → A14 + bloqueo
var kAgg = { event_id: 'Ev', resource_id: 'Re', cost_component_id: 'Co', period_id: 'Pe' };
var D1 = salidaEcon({ epd_id: 'D1', double_count_ids: [kAgg] });
var D2 = salidaEcon({ epd_id: 'D2', double_count_ids: [kAgg] });
var aggDC = R.agregarEPDs([D1, D2]);
ok(aggDC.alerts.indexOf('A14') !== -1, '§25: misma clave en dos EPD → A14 en la agregación');
eq(aggDC.aggregation_blocked, true, '§25/§35: "impedir suma automática" → aggregation_blocked');
eq(aggDC.economic_total, null, 'bloqueado → economic_total null');
ok(aggDC.por_epd.length === 2, 'por_epd sigue listando los 2 componentes (para decisión humana)');

// EPDs con claves NO solapadas → suma normal
var D3 = salidaEcon({ epd_id: 'D3', double_count_ids: [kAgg] });
var D4 = salidaEcon({ epd_id: 'D4', double_count_ids: [Object.assign({}, kAgg, { period_id: 'Pe2' })] });
eq(R.agregarEPDs([D3, D4]).aggregation_blocked, false, 'claves con distinto período → no material → suma normal');

// §29 #15 / §32 — impact_type heterogéneo → A17 + bloqueo
var het = R.agregarEPDs([A, salidaEcon({ epd_id: 'H', impact_type: 'ICAP' })]);
ok(het.alerts.indexOf('A17') !== -1, '§29 #15: IOF + ICAP → A17 AGREGACION_HETEROGENEA');
eq(het.aggregation_blocked, true, '§32: "impactos heterogéneos no se suman arbitrariamente" → bloqueo');
eq(het.economic_total, null, 'heterogéneo → economic_total null');

// entrada mal formada
ok(!R.agregarEPDs('no soy array').ok, 'no-array → { ok:false }');
var badOut = JSON.parse(JSON.stringify(A)); badOut.heritage_outputs.VER = 123;
ok(!R.agregarEPDs([badOut]).ok, 'EPD_OUTPUT mal formado (VER numérico) → { ok:false }');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. `if (clas.terminal)` -> `if (false)`: el corte de clasificación (V5/EV-CUAL/FEP1/');
console.log('     serie) deja de detener la cascada. Mecanismo real de la falla: cuando terminal===true,');
console.log('     resolverClasificacion devuelve { terminal, resultado:{...} } SIN alerts/notes a nivel');
console.log('     superior; al seguir, `clas.alerts` es undefined y alerts.concat(undefined) mete un');
console.log('     código de alerta inválido -> validarEPDOutput rechaza -> runEPD devuelve { ok:false }.');
console.log('     8 rojos: "los 4 cortes -> runEPD ok", los eq de status/nivel de V5/EV-CUAL/FEP1/serie,');
console.log('     A04, y "el V5 NO entra en la suma" de 7b (el Vq malformado hace que agregarEPDs lo rechace).');
console.log('  2. output_level = nivelSalidaMax(fep) en vez de effectiveFep → el caso HMS da S3 en');
console.log('     vez de S2 (la degradación de §18 se pierde, §30 violado).');
console.log('  3. quitar unicos() (dedup de alertas) → el caso de clamp da ["A06","A06"] (proyección');
console.log('     y envelope ambos recortan) en vez de ["A06"].');
console.log('  4a. meter Math.random() en una nota de consolidarEPDOutput → el deep-equal de dos');
console.log('      ejecuciones falla. 4b. Date.now(): el deep-equal NO lo agarra (mismo ms) —');
console.log('      lo agarra la guarda grep "sin Date.now/Math.random en runIFD.js".');
console.log('  --- 7b (agregarEPDs) — conteo de rojos verificado ---');
console.log('  5. detectarDobleConteo([]) en vez de la unión de claves → dos EPD que solapan se');
console.log('     suman igual (sin A14, aggregation_blocked queda false). 3 rojos.');
console.log('  6. `tiposDistintos.length > 1` → `> 0` → dos EPD del MISMO impact_type se marcan A17');
console.log('     y se bloquean (falso positivo). 7 rojos (incluye los 3 del total + lower/upper +');
console.log('     el caso de distinto período + el del V5 que ahora también sale null).');
console.log('  7. quitar `!aggregation_blocked` de la definición de `puedeSumar` → los roll-ups');
console.log('     bloqueados por §25/§29#15 emiten total igual (§35 violado). 2 rojos (aggDC, het;');
console.log('     el caso "sin EPD cuantificado" lo protege la otra guarda, cuantificados.length>0).');
console.log('  8. quitar `&& typeof o.economic_base === "number"` del filtro → un EPD CUANTIFICADO');
console.log('     con puerta económica cerrada (NE) cuenta como cuantificado. 2 rojos');
console.log('     (n_cuantificados, NE-en-cualitativos). NO da NaN: en JS `null + número = número`');
console.log('     (null se coacciona a 0), así que economic_total no cambia — coincidencia, no protección.');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
