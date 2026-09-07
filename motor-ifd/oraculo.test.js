/**
 * motor-ifd/oraculo.test.js — contraste con el motor de referencia (Python)
 * node motor-ifd/oraculo.test.js
 *
 * "Relación 2" de la regla de las tres relaciones: no traducir la lógica de
 * memoria — correr los mismos casos por ambos motores y confirmar que
 * coinciden. Subproceso Python real (docs/ifd_v1_2_1_engine_..._categorica.py
 * vía oraculo_bridge.py).
 *
 * ALCANCE: admisibilidad + FEP + niveles S0/status/alertas para los casos
 * donde AMBOS motores terminan en esta etapa. NO se contrasta ver / roi /
 * contención — el engine los calcula pero v1.2.2 §24 los dejó PENDIENTE DE
 * AUDITORÍA (ver README, "Alcance del oráculo").
 */

'use strict';

var A = require('./admisibilidad');
var CL = require('./clasificacion');
var P = require('./proyeccion');
var SC = require('./escenarios');
var EC = require('./economia');
var H = require('./heredadas');
var RUN = require('./runIFD');
var cp = require('child_process');
var path = require('path');

var _ok = 0, _fallos = 0, _skip = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }

function oraculo(casos) {
  var r = cp.spawnSync('python3', [path.join(__dirname, 'oraculo_bridge.py')], {
    input: JSON.stringify(casos), encoding: 'utf8'
  });
  if (r.status !== 0) throw new Error('oraculo_bridge.py falló: ' + (r.stderr || r.error));
  return JSON.parse(r.stdout);
}

// ── ¿hay Python? ──
var pyOk = false;
try { pyOk = cp.spawnSync('python3', ['--version']).status === 0; } catch (e) { pyOk = false; }
if (!pyOk) {
  console.log('\n  (python3 no disponible — contraste con el oráculo OMITIDO)\n');
  process.exit(0);
}

// ═══════════════════════════════════════════════════════════════════════
seccion('Fase 1 — admisibilidad + FEP: JS vs. motor de referencia');
// ═══════════════════════════════════════════════════════════════════════

var CASOS = [
  { epd_id: 'c1', Q: 3, C: 3, T: 3, R: 3 },
  { epd_id: 'c2', Q: 3, C: 3, T: 3, R: 1 },
  { epd_id: 'c3', Q: 3, C: 3, T: 3, R: 0 },            // §35 R=0
  { epd_id: 'c4', Q: 2, C: 0, T: 3, R: 3 },            // FEP=0 por C
  { epd_id: 'c5', Q: 1, C: 2, T: 1, R: 2 },            // FEP=1 por Q/T
  { epd_id: 'c6', Q: 2, C: 2, T: 2, R: 2 },            // FEP=2
  { epd_id: 'c7', deterioration_sustained: false, Q: 3, C: 3, T: 3, R: 3 }, // §35 no admisible
  { epd_id: 'c8', assumptions_declared: false, Q: 3, C: 3, T: 3, R: 0 }     // no admisible Y FEP=0
];

var refs = oraculo(CASOS);

CASOS.forEach(function (caso, i) {
  var ref = refs[i];
  var gates = Object.assign({
    deterioration_sustained: true, evidence_present: true, mechanism_traceable: true,
    horizon_defined: true, assumptions_declared: true
  }, caso);
  var adm = A.evaluarAdmisibilidad(gates);
  var fep = A.calcularFEP(caso).fep;

  ok(adm.admisible === ref.admissible, caso.epd_id + ': admissible JS=' + adm.admisible + ' == ref=' + ref.admissible);
  ok(fep === ref.FEP, caso.epd_id + ': FEP JS=' + fep + ' == ref=' + ref.FEP + ' (§7 min no compensatorio)');

  var res = A.resolverPuertaEvidencia(gates);
  if (res.terminal) {
    ok(res.resultado.output_level === ref.output_level,
      caso.epd_id + ': terminal — output_level JS=' + res.resultado.output_level + ' == ref=' + ref.output_level);
    ok(res.resultado.status === ref.status,
      caso.epd_id + ': terminal — status JS=' + res.resultado.status + ' == ref=' + ref.status);
    ok(JSON.stringify(res.resultado.alerts) === JSON.stringify(ref.alert_codes),
      caso.epd_id + ': terminal — alertas JS=' + JSON.stringify(res.resultado.alerts) + ' == ref=' + JSON.stringify(ref.alert_codes));
  } else {
    // no terminal en Fase 1: el engine puede terminar en S1 (FEP==1) — eso
    // es Fase 2 en este motor. Solo se contrasta que el techo por evidencia
    // del JS coincida con el nivel del engine cuando ESTE también terminó
    // en S0 (nunca lo hace si no es terminal). Aquí basta admissible+FEP.
    ok(res.nivelMax === A.nivelSalidaMax(ref.FEP),
      caso.epd_id + ': no terminal — techo JS=' + res.nivelMax + ' == nivelSalidaMax(refFEP)=' + A.nivelSalidaMax(ref.FEP));
  }
});

console.log('\n  Nota: el engine termina en S1/CUALITATIVO cuando FEP==1 (casos c2, c5) — este motor');
console.log('  difiere el corte S1 a Fase 2 (interactúa con variable_type/HMS). No es discrepancia:');
console.log('  admissible y FEP coinciden, que es todo lo que Fase 1 decide.');

// ═══════════════════════════════════════════════════════════════════════
seccion('Fase 2 — compuertas de clasificación: JS vs. motor de referencia');
// ═══════════════════════════════════════════════════════════════════════

var CASOS2 = [
  { epd_id: 'g_v5', variable_type: 'V5', Q: 3, C: 3, T: 3, R: 3 },
  { epd_id: 'g_fep1', Q: 1, C: 3, T: 3, R: 3, variable_type: 'V1' },
  { epd_id: 'g_hms', horizon: 20, hms: 12, Q: 3, C: 3, T: 3, R: 3, variable_type: 'V3', series_sufficiency: 3, trend_a: 100, trend_b: 5 },
  { epd_id: 'g_serie', series_sufficiency: 1, variable_type: 'V2', Q: 3, C: 3, T: 3, R: 3 }
];
var refs2 = oraculo(CASOS2);

CASOS2.forEach(function (caso, i) {
  var ref = refs2[i];
  var fep = A.calcularFEP(caso).fep;
  var cl = CL.resolverClasificacion({
    fep: fep,
    horizon: caso.horizon != null ? caso.horizon : 6,
    hms: caso.hms != null ? caso.hms : 12,
    variable_type: caso.variable_type,
    evolution_type: caso.evolution_type || 'EV-A',
    series_sufficiency: caso.series_sufficiency != null ? caso.series_sufficiency : 3
  });
  if (cl.terminal) {
    ok(cl.resultado.output_level === ref.output_level && cl.resultado.status === ref.status,
      caso.epd_id + ': terminal JS ' + cl.resultado.output_level + '/' + cl.resultado.status +
      ' == ref ' + ref.output_level + '/' + ref.status);
    ok(JSON.stringify(cl.resultado.alerts) === JSON.stringify(ref.alert_codes),
      caso.epd_id + ': alertas JS=' + JSON.stringify(cl.resultado.alerts) + ' == ref=' + JSON.stringify(ref.alert_codes));
  } else {
    ok(cl.nivelMax === ref.output_level,
      caso.epd_id + ': no terminal — techo JS=' + cl.nivelMax + ' == output_level engine=' + ref.output_level);
    ok(JSON.stringify(cl.alerts) === JSON.stringify(ref.alert_codes),
      caso.epd_id + ': alertas JS=' + JSON.stringify(cl.alerts) + ' == ref=' + JSON.stringify(ref.alert_codes) + ' (A07 del horizonte)');
  }
});

console.log('\n  Nota: EV-CUAL no se contrasta — el engine no chequea evolution_type cualitativa;');
console.log('  este motor lo corta a S1 con respaldo de §16 (divergencia documentada).');

// ═══════════════════════════════════════════════════════════════════════
seccion('Fase 3 — proyección física §20: JS vs. motor de referencia');
// ═══════════════════════════════════════════════════════════════════════

var CASOS3 = [
  { epd_id: 'p_v1tasa', variable_type: 'V1', evolution_type: 'EV-A', events_obs: 504, exposure_obs: 12000, exposure_future: 72000, lower_bound: 0 },
  { epd_id: 'p_trend', variable_type: 'V3', evolution_type: 'EV-A', trend_a: 100, trend_b: 5, horizon: 6 },
  { epd_id: 'p_mult', variable_type: 'V3', evolution_type: 'EV-M', growth_rate: 0.1, baseline: 100, horizon: 3 },
  { epd_id: 'p_delta', variable_type: 'V3', evolution_type: 'EV-A', delta: 400, baseline: 3000, horizon: 6, lower_bound: 0 },
  { epd_id: 'p_clamp', variable_type: 'V3', evolution_type: 'EV-A', trend_a: 90, trend_b: 5, horizon: 6, lower_bound: 0, upper_bound: 100 }
];
var refs3 = oraculo(CASOS3);

CASOS3.forEach(function (caso, i) {
  var ref = refs3[i];
  var pr = P.proyectar(Object.assign({ horizon: 6 }, caso));
  var base = pr.terminal ? null : pr.projection_base;
  ok(typeof base === 'number' && typeof ref.projection_base === 'number' && Math.abs(base - ref.projection_base) < 1e-6,
    caso.epd_id + ': projection_base JS=' + base + ' == ref=' + ref.projection_base + ' (§20)');
  var refAlerts = ref.alert_codes.filter(function (c) { return c === 'A06'; });
  var jsAlerts = (pr.alerts || []).filter(function (c) { return c === 'A06'; });
  ok(JSON.stringify(jsAlerts) === JSON.stringify(refAlerts),
    caso.epd_id + ': alertas de dominio JS=' + JSON.stringify(jsAlerts) + ' == ref=' + JSON.stringify(refAlerts));
});

console.log('\n  Nota: el chequeo de conteo bruto V1 (§20.1) y EV-CUAL son de este motor — el engine no los');
console.log('  tiene. Los casos con esos rasgos se excluyen del contraste (ver README).');

// ═══════════════════════════════════════════════════════════════════════
seccion('Fase 4 — envelope §22: JS vs. motor de referencia');
// ═══════════════════════════════════════════════════════════════════════
//
// ALCANCE: solo el envelope [L, U] de §22. Intensificación (§21.2) y los
// escenarios continuidad/contención NO se contrastan — el engine no los
// tiene (ver README, "Alcance del oráculo"). El engine SÍ calcula
// projection_lower/upper con la misma amplitud por effective_FEP.

var CASOS4 = [
  // delta: 3000 + 400×6 = 5400; FEP=3, horizon 6 ≤ HMS 12 → effective_FEP=3 → ±7%
  { epd_id: 'env_fep3', variable_type: 'V3', evolution_type: 'EV-A', delta: 400, baseline: 3000, horizon: 6, hms: 12, lower_bound: 0, Q: 3, C: 3, T: 3, R: 3 },
  // trend: 3000 + 400×20 = 11000; horizon 20 > HMS 12 → A07, effective_FEP = max(1,3-1)=2 → ±15%
  { epd_id: 'env_fep2', variable_type: 'V3', evolution_type: 'EV-A', trend_a: 3000, trend_b: 400, horizon: 20, hms: 12, lower_bound: 0, Q: 3, C: 3, T: 3, R: 3 }
];
var refs4 = oraculo(CASOS4);

CASOS4.forEach(function (caso, i) {
  var ref = refs4[i];
  var fep = A.calcularFEP(caso).fep;
  var hms = CL.aplicarHMS(fep, caso.horizon, caso.hms);
  var pr = P.proyectar(Object.assign({ horizon: caso.horizon }, caso));
  var env = SC.calcularEnvelope(pr.projection_base, hms.effectiveFep, caso.lower_bound, caso.upper_bound);

  ok(Math.abs(pr.projection_base - ref.projection_base) < 1e-6,
    caso.epd_id + ': projection_base JS=' + pr.projection_base + ' == ref=' + ref.projection_base);
  ok(Math.abs(env.L - ref.projection_lower) < 1e-6,
    caso.epd_id + ': envelope L JS=' + env.L + ' == ref=' + ref.projection_lower +
    ' (effective_FEP=' + hms.effectiveFep + ', ±' + (env.amplitud_pct * 100) + '%)');
  ok(Math.abs(env.U - ref.projection_upper) < 1e-6,
    caso.epd_id + ': envelope U JS=' + env.U + ' == ref=' + ref.projection_upper);
});

console.log('\n  Nota: solo el envelope §22 coincide con el engine. Continuidad/Intensificación/Contención');
console.log('  (§21) son de este motor — el engine no los tiene (ver README).');

// ═══════════════════════════════════════════════════════════════════════
seccion('Fase 5 — módulo económico §23: JS vs. motor de referencia');
// ═══════════════════════════════════════════════════════════════════════
//
// EEB (§23.2) e invariante de atribución (§34/§35). El engine modela 2
// condiciones de puerta (§23.1); el motor JS agrega `unit` (3ª condición).
// Los casos que contrastan valor llevan `unit` → ambos coinciden. La
// divergencia (unit ausente) se asevera aparte, NO contra el engine.

// delta 3000 + 400×6 = 5400; FEP 3; envelope ±7% → [5022, 5778]
// unit_value 25 → §12 normativo: 5400 × 25 = 135000
var ECON = {
  variable_type: 'V3', evolution_type: 'EV-A', delta: 400, baseline: 3000,
  horizon: 6, hms: 12, lower_bound: 0, Q: 3, C: 3, T: 3, R: 3,
  unit_value: 25, economic_traceability: true
};
var CASOS5 = [
  { epd_id: 'econ_confirmed', attribution_category: 'CONFIRMED' },
  { epd_id: 'econ_supported', attribution_category: 'SUPPORTED' },
  { epd_id: 'econ_unresolved', attribution_category: 'UNRESOLVED' },
  { epd_id: 'econ_na', attribution_category: 'N_A' }
].map(function (o) { return Object.assign({}, ECON, o); });
var refs5 = oraculo(CASOS5);

var jsValoraciones = [];
CASOS5.forEach(function (caso, i) {
  var ref = refs5[i];
  var fep = A.calcularFEP(caso).fep;
  var hms = CL.aplicarHMS(fep, caso.horizon, caso.hms);
  var pr = P.proyectar(Object.assign({ horizon: caso.horizon }, caso));
  var env = SC.calcularEnvelope(pr.projection_base, hms.effectiveFep, caso.lower_bound, caso.upper_bound);
  var m = EC.monetizar(Object.assign({ unit: 'horas' }, caso), { base: env.B, lower: env.L, upper: env.U });
  jsValoraciones.push(m.economic_base);

  ok(Math.abs(m.economic_base - ref.economic_base) < 1e-6,
    caso.epd_id + ': economic_base JS=' + m.economic_base + ' == ref=' + ref.economic_base + ' (§23.2 EEB = Q^fut × VU)');
  ok(Math.abs(m.economic_lower - ref.economic_lower) < 1e-6,
    caso.epd_id + ': economic_lower JS=' + m.economic_lower + ' == ref=' + ref.economic_lower);
  ok(Math.abs(m.economic_upper - ref.economic_upper) < 1e-6,
    caso.epd_id + ': economic_upper JS=' + m.economic_upper + ' == ref=' + ref.economic_upper);

  var jsA10 = m.alerts.indexOf('A10') !== -1;
  var refA10 = ref.alert_codes.indexOf('A10') !== -1;
  ok(jsA10 === refA10,
    caso.epd_id + ': alerta A10 (atribución UNRESOLVED) JS=' + jsA10 + ' == ref=' + refA10);
});

ok(jsValoraciones.every(function (v) { return v === jsValoraciones[0] && v === 135000; }),
  'INVARIANTE §34/§35: las 4 categorías → 135000 idéntico (engine y JS coinciden en que la atribución no pondera)');
ok(refs5.every(function (r) { return r.economic_base === refs5[0].economic_base; }),
  'el engine también da la misma cifra para las 4 categorías (regresión v1.2.1 del propio engine)');

// Divergencia deliberada §23.1 — NO contra el engine
var sinUnit = EC.monetizar(Object.assign({}, ECON, { attribution_category: 'CONFIRMED' }), { base: 5400, lower: 5022, upper: 5778 });
ok(sinUnit.economic_base === null && sinUnit.alerts.indexOf('A09') !== -1,
  'sin `unit`: el motor JS cierra la puerta (§23.1, 3 condiciones) + A09 — el engine SÍ monetizaría (solo 2). Divergencia documentada.');

console.log('\n  Nota: los casos económicos del contraste llevan `unit` → JS y engine coinciden exacto en');
console.log('  economic_base/lower/upper y en la alerta A10. La 3ª condición de §23.1 (unit) es');
console.log('  divergencia deliberada: se asevera aparte, no contra el engine (ver README).');

// ═══════════════════════════════════════════════════════════════════════
seccion('Fase 6 — salidas heredadas §24: contraste de NO-equivalencia');
// ═══════════════════════════════════════════════════════════════════════
//
// El engine SÍ calcula VER/ROI_P desde los campos de contención — es
// anterior a v1.2.2 §24 (PENDIENTE DE AUDITORÍA, sin fórmula normativa).
// Este motor NUNCA produce una cifra ahí. El contraste verifica la
// DIVERGENCIA, no la coincidencia.

var CASO6 = Object.assign({}, ECON, {
  attribution_category: 'CONFIRMED',
  containment_factor: 0.30, containment_evidence_level: 2, intervention_cost: 100000
});
var ref6 = oraculo([CASO6])[0];

ok(typeof ref6.VER === 'number',
  'el engine SÍ calcula VER (= ' + ref6.VER + ') desde containment_factor — es pre-§24');
ok(typeof ref6.ROI_P === 'number',
  'el engine SÍ calcula ROI_P (= ' + ref6.ROI_P + ')');

var sh = H.construirSalidasHeredadas();
ok(JSON.stringify(sh.VER) === JSON.stringify({ estado: 'PENDIENTE_AUDITORIA' }),
  'el motor JS: VER = { estado: "PENDIENTE_AUDITORIA" } — NUNCA la cifra ' + ref6.VER + ' del engine (§24)');
ok(JSON.stringify(sh.ROI_P) === JSON.stringify({ estado: 'PENDIENTE_AUDITORIA' }),
  'el motor JS: ROI_P = marcador, no ' + ref6.ROI_P);
ok(['CFD', 'CFR', 'VER', 'ROI_P', 'TRE'].every(function (key) { return typeof sh[key] === 'object' && sh[key].estado === 'PENDIENTE_AUDITORIA'; }),
  'las 5 salidas heredadas son marcador — divergencia con el engine DOCUMENTADA, no es discrepancia');

console.log('\n  Nota: esto NO es un fallo del JS ni del engine — el engine es de una etapa anterior a');
console.log('  §24. El invariante que SÍ se comparte y se contrasta arriba (Fase 5) es que la atribución');
console.log('  no multiplica economic_base. ver/roi quedan PENDIENTE DE AUDITORÍA (§24).');

// ═══════════════════════════════════════════════════════════════════════
seccion('Fase 7a — runEPD: salida consolidada completa JS vs. run_epd del engine');
// ═══════════════════════════════════════════════════════════════════════
//
// El contraste más fuerte: la cascada entera de §28 por ambos motores. Solo
// casos NO divergentes (sin EV-CUAL, sin §20.1, con `unit`, sin recorte de
// envelope). Se comparan admissible, FEP, output_level, status,
// projection_*, economic_* y las alertas compartibles (A01-A07, A09, A10).

function base7(o) {
  return Object.assign({
    epd_id: 'r7', engine_version: 'ifd-js-0.1',
    deterioration_sustained: true, evidence_present: true, mechanism_traceable: true,
    horizon_defined: true, assumptions_declared: true,
    Q: 3, C: 3, T: 3, R: 3, variable_type: 'V3', evolution_type: 'EV-A',
    series_sufficiency: 3, horizon: 6, hms: 12,
    economic_traceability: false, attribution_category: 'CONFIRMED'
  }, o || {});
}
var ECON7 = { lower_bound: 0, unit: 'horas', unit_value: 25, economic_traceability: true };
var CASOS7 = [
  base7(Object.assign({ epd_id: 'r7_cuant', baseline: 3000, delta: 400 }, ECON7)),
  base7(Object.assign({ epd_id: 'r7_hms', trend_a: 3000, trend_b: 400, horizon: 20 }, ECON7)),
  base7({ epd_id: 'r7_s0adm', deterioration_sustained: false, baseline: 3000, delta: 400 }),
  base7({ epd_id: 'r7_s0r0', R: 0, baseline: 3000, delta: 400 }),
  base7({ epd_id: 'r7_fep1', Q: 1, baseline: 3000, delta: 400 }),
  base7({ epd_id: 'r7_serie', variable_type: 'V2', series_sufficiency: 1, baseline: 3000, delta: 400 }),
  base7(Object.assign({ epd_id: 'r7_unres', baseline: 3000, delta: 400, attribution_category: 'UNRESOLVED' }, ECON7))
];
var refs7 = oraculo(CASOS7);
var CODIGOS_COMPARTIBLES = ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A09', 'A10'];
function eqArr(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

CASOS7.forEach(function (caso, i) {
  var ref = refs7[i];
  var r = RUN.runEPD(caso);
  ok(r.ok, caso.epd_id + ': runEPD ok');
  var o = r.output;
  ok(o.admissible === ref.admissible && o.FEP === ref.FEP,
    caso.epd_id + ': admissible/FEP JS=' + o.admissible + '/' + o.FEP + ' == ref=' + ref.admissible + '/' + ref.FEP);
  ok(o.output_level === ref.output_level && o.status === ref.status,
    caso.epd_id + ': ' + o.output_level + '/' + o.status + ' == ref ' + ref.output_level + '/' + ref.status);
  var cmp = function (a, b) { return (a == null && b == null) || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-6); };
  ok(cmp(o.projection_base, ref.projection_base) && cmp(o.projection_lower, ref.projection_lower) && cmp(o.projection_upper, ref.projection_upper),
    caso.epd_id + ': projection_* JS=[' + o.projection_base + ',' + o.projection_lower + ',' + o.projection_upper + '] == ref=[' + ref.projection_base + ',' + ref.projection_lower + ',' + ref.projection_upper + ']');
  ok(cmp(o.economic_base, ref.economic_base) && cmp(o.economic_lower, ref.economic_lower) && cmp(o.economic_upper, ref.economic_upper),
    caso.epd_id + ': economic_* JS=' + o.economic_base + ' == ref=' + ref.economic_base);
  var jsC = o.alerts.filter(function (c) { return CODIGOS_COMPARTIBLES.indexOf(c) !== -1; }).sort();
  var refC = ref.alert_codes.filter(function (c) { return CODIGOS_COMPARTIBLES.indexOf(c) !== -1; }).sort();
  ok(eqArr(jsC, refC), caso.epd_id + ': alertas compartibles JS=' + JSON.stringify(jsC) + ' == ref=' + JSON.stringify(refC));
});

console.log('\n  Nota: la cascada entera de §28 coincide JS↔engine en los casos no divergentes.');
console.log('  Las divergencias deliberadas (EV-CUAL, §20.1, 3ª condición de puerta §23.1, A06 de');
console.log('  envelope, marcadores §24) se contrastan por separado arriba, nunca contra el engine.');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos, ' + _skip + ' omitidos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
