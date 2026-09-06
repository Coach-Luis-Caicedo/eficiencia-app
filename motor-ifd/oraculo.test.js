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
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos, ' + _skip + ' omitidos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
