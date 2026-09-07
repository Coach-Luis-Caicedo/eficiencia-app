/**
 * motor-ifd/proyeccion.test.js — Fase 3
 * node motor-ifd/proyeccion.test.js
 */

'use strict';

var P = require('./proyeccion');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }
function near(a, b, m) { ok(typeof a === 'number' && Math.abs(a - b) < 1e-9, m + (Math.abs(a - b) < 1e-9 ? '' : '  [recibido=' + a + ' esperado=' + b + ']')); }
function lanza(fn, m) { var l = false; try { fn(); } catch (e) { l = true; } ok(l, m); }

function inp(over) {
  return Object.assign({ variable_type: 'V3', evolution_type: 'EV-A', horizon: 6 }, over || {});
}

// ═══════════════════════════════════════════════════════════════════════
seccion('§28 / §19 — seleccionarMetodo: cascada en orden estricto');
// ═══════════════════════════════════════════════════════════════════════

eq(P.seleccionarMetodo(inp({ variable_type: 'V1', events_obs: 504, exposure_obs: 12000, exposure_future: 72000 })).metodo,
  'V1_TASA', 'V1 con tasa + exposición futura → V1_TASA');
eq(P.seleccionarMetodo(inp({ trend_a: 100, trend_b: 5 })).metodo, 'TENDENCIA_LINEAL', 'trend_a + trend_b → TENDENCIA_LINEAL');
eq(P.seleccionarMetodo(inp({ growth_rate: 0.1, baseline: 100, evolution_type: 'EV-M' })).metodo,
  'CRECIMIENTO_MULTIPLICATIVO', 'growth_rate + baseline + EV-M → CRECIMIENTO_MULTIPLICATIVO');
eq(P.seleccionarMetodo(inp({ delta: 400, baseline: 3000, evolution_type: 'EV-A' })).metodo,
  'DELTA_ADITIVO', 'delta + baseline + EV-A → DELTA_ADITIVO');
eq(P.seleccionarMetodo(inp({ baseline: 50 })).metodo, 'CONTINUIDAD', 'solo baseline → CONTINUIDAD');
eq(P.seleccionarMetodo(inp({})).metodo, 'INCOMPATIBLE', 'sin ningún parámetro de método → INCOMPATIBLE');

// orden: tendencia gana sobre EV-M aunque ambos apliquen (§28)
eq(P.seleccionarMetodo(inp({ trend_a: 100, trend_b: 5, growth_rate: 0.1, baseline: 100, evolution_type: 'EV-M' })).metodo,
  'TENDENCIA_LINEAL', 'trend Y growth ambos presentes → gana TENDENCIA_LINEAL (§28: orden estricto)');

// EV-M por IGUALDAD ESTRICTA (en la práctica el contrato Fase 0 ya rechaza
// "EV-MX"; esto verifica la robustez interna): NO se trata como EV-M, así
// que la rama de crecimiento no se elige — cae a CONTINUIDAD (baseline
// presente), nunca a CRECIMIENTO_MULTIPLICATIVO.
var evmx = P.seleccionarMetodo(inp({ growth_rate: 0.1, baseline: 100, evolution_type: 'EV-MX' })).metodo;
ok(evmx !== 'CRECIMIENTO_MULTIPLICATIVO' && evmx === 'CONTINUIDAD',
  'evolution_type="EV-MX" → NO es CRECIMIENTO_MULTIPLICATIVO (igualdad estricta, no substring como el engine); cae a CONTINUIDAD');
eq(P.seleccionarMetodo(inp({ growth_rate: 0.1, evolution_type: 'EV-MX' })).metodo,
  'INCOMPATIBLE', '...y sin baseline, "EV-MX" + growth_rate → INCOMPATIBLE (nada donde caer)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§20 — proyectarBase: aritmética exacta por método');
// ═══════════════════════════════════════════════════════════════════════

near(P.proyectarBase(inp({ variable_type: 'V1', events_obs: 504, exposure_obs: 12000, exposure_future: 72000 }), 'V1_TASA'),
  3024, '§20.1: (504/12000) × 72000 = 0.042 × 72000 = 3024');
near(P.proyectarBase(inp({ trend_a: 100, trend_b: 5, horizon: 6 }), 'TENDENCIA_LINEAL'),
  130, '§20.2: 100 + 5 × 6 = 130');
near(P.proyectarBase(inp({ growth_rate: 0.1, baseline: 100, horizon: 3 }), 'CRECIMIENTO_MULTIPLICATIVO'),
  133.1, '§16: 100 × (1.1)^3 = 100 × 1.331 = 133.1');
near(P.proyectarBase(inp({ delta: 400, baseline: 3000, horizon: 6 }), 'DELTA_ADITIVO'),
  5400, '§12 ejemplo normativo: 3000 + 400 × 6 = 5400 horas de reproceso futuras');
near(P.proyectarBase(inp({ baseline: 42 }), 'CONTINUIDAD'), 42, 'CONTINUIDAD: baseline tal cual = 42');

// ═══════════════════════════════════════════════════════════════════════
seccion('§12 — ejemplo normativo end-to-end (físico, sin monetizar)');
// ═══════════════════════════════════════════════════════════════════════

var ej12 = P.proyectar(inp({ variable_type: 'V3', evolution_type: 'EV-A', delta: 400, baseline: 3000, horizon: 6, lower_bound: 0 }));
near(ej12.projection_base, 5400, '§12: la variable que se proyecta son las HORAS (5400), no los 75.000 de CFF');
eq(ej12.method, 'DELTA_ADITIVO', 'método DELTA_ADITIVO');
ok(ej12.terminal === false, 'no terminal — sigue a escenarios/economía');

// ═══════════════════════════════════════════════════════════════════════
seccion('§15 — clamp de dominio tras proyectar → A06');
// ═══════════════════════════════════════════════════════════════════════

var clamped = P.proyectar(inp({ trend_a: 90, trend_b: 5, horizon: 6, lower_bound: 0, upper_bound: 100 }));
near(clamped.projection_raw, 120, 'proyección cruda = 90 + 5×6 = 120');
near(clamped.projection_base, 100, 'recortada a upper_bound=100 (§15: Y* = min(U, ...))');
eq(clamped.alerts, ['A06'], 'alerta A06 DOMINIO_EXCEDIDO');

var sinClamp = P.proyectar(inp({ trend_a: 10, trend_b: 5, horizon: 6, lower_bound: 0, upper_bound: 100 }));
near(sinClamp.projection_base, 40, '10 + 5×6 = 40 en [0,100] → sin recorte');
eq(sinClamp.alerts, [], 'sin A06');

// ═══════════════════════════════════════════════════════════════════════
seccion('§28 — método incompatible → A05, S1/DEGRADADO_A_CUALITATIVO');
// ═══════════════════════════════════════════════════════════════════════

var incomp = P.proyectar(inp({ variable_type: 'V3', horizon: 6 })); // sin trend, sin baseline, sin nada
ok(incomp.terminal && incomp.resultado.output_level === 'S1' && incomp.resultado.status === 'DEGRADADO_A_CUALITATIVO',
  'ningún método → S1 / DEGRADADO_A_CUALITATIVO (no se fabrica proyección)');
eq(incomp.resultado.alerts, ['A05'], 'alerta A05 METODO_INCOMPATIBLE');

// ═══════════════════════════════════════════════════════════════════════
seccion('§20.1 — conteo bruto V1: no se extrapola cuando el volumen cambia');
// ═══════════════════════════════════════════════════════════════════════

// V1 sin events_obs → cae a CONTINUIDAD. Volumen: 12000 → 72000 = cambio 500% (> 15%)
var v1vol = P.proyectar(inp({ variable_type: 'V1', baseline: 504, exposure_obs: 12000, exposure_future: 72000, horizon: 6 }));
ok(v1vol.terminal && v1vol.resultado.alerts[0] === 'A13',
  'V1 sin tasa + volumen 12000→72000 (cambio 500%) → A13, degrada (§20.1: no se extrapola conteo bruto)');
ok(v1vol.resultado.status === 'DEGRADADO_A_CUALITATIVO', 'status DEGRADADO_A_CUALITATIVO');

// mismo caso pero volumen estable → SÍ proyecta continuidad
var v1estable = P.proyectar(inp({ variable_type: 'V1', baseline: 504, exposure_obs: 12000, exposure_future: 12500, horizon: 6 }));
near(Math.abs(12500 - 12000) / 12000, 0.041666666, 'cambio 4.17% (< 15%) — no material');
ok(!v1estable.terminal && v1estable.projection_base === 504, 'V1 sin tasa + volumen ~estable → CONTINUIDAD proyecta (504)');

// V1 CON método de tasa → el chequeo §20.1 no aplica (la tasa ya es volumen-consciente)
var v1tasa = P.proyectar(inp({ variable_type: 'V1', events_obs: 504, exposure_obs: 12000, exposure_future: 72000, horizon: 6, lower_bound: 0 }));
near(v1tasa.projection_base, 3024, 'V1_TASA con el mismo salto de volumen → proyecta 3024 (la tasa lo maneja), sin A13');

// no se puede calcular + declaración explícita
var v1declTrue = P.proyectar(inp({ variable_type: 'V1', baseline: 504, horizon: 6, volume_change_material: true }));
eq(v1declTrue.resultado.alerts, ['A13'], 'sin exposure_obs/future + volume_change_material=true → A13');
var v1declFalse = P.proyectar(inp({ variable_type: 'V1', baseline: 504, horizon: 6, volume_change_material: false }));
ok(!v1declFalse.terminal && v1declFalse.projection_base === 504, 'sin exposure + volume_change_material=false → proyecta (504)');

// ni cálculo ni declaración → A13 (§0)
var v1nada = P.proyectar(inp({ variable_type: 'V1', baseline: 504, horizon: 6 }));
eq(v1nada.resultado.alerts, ['A13'], 'V1 continuidad, sin exposure y sin declaración → A13 (§0: perder precisión antes que inventarla)');

// precedencia: declarado contradice calculado → el motor manda + audit (ambos sentidos)
var v1discrep = P.proyectar(inp({ variable_type: 'V1', baseline: 504, exposure_obs: 12000, exposure_future: 72000, horizon: 6, volume_change_material: false }));
ok(v1discrep.terminal && v1discrep.resultado.alerts[0] === 'A13',
  'declarado false pero calculado material (500%) → el MOTOR MANDA: A13 (usa el cálculo)');
ok(v1discrep.audit.some(function (a) { return a.code === 'DISCREPANCIA_VOLUME_CHANGE_MATERIAL' && a.declarado === false && a.calculado === true; }),
  'la discrepancia queda en audit[] (declarado=false, calculado=true) — no se descarta ni se rechaza');

// sentido inverso: SÍ calculable, calculado NO-material, pero declarado true
var v1discrepInv = P.proyectar(inp({ variable_type: 'V1', baseline: 504, exposure_obs: 12000, exposure_future: 12500, horizon: 6, volume_change_material: true }));
ok(!v1discrepInv.terminal && v1discrepInv.projection_base === 504 && JSON.stringify(v1discrepInv.alerts) === '[]',
  'declarado true pero calculado NO-material (4.17%) → el MOTOR MANDA: proyecta 504, sin A13 (el cálculo prevalece en ambos sentidos)');
ok(v1discrepInv.audit.some(function (a) { return a.code === 'DISCREPANCIA_VOLUME_CHANGE_MATERIAL' && a.declarado === true && a.calculado === false; }),
  'la discrepancia inversa también queda en audit[] (declarado=true, calculado=false)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. §20.1: quitar chequeoVolumenV1 → V1 con volumen 12000→72000 (500%) proyecta 504 (conteo');
console.log('     bruto) y NO degrada, en vez de terminal A13.');
console.log('  2. §28: saltar V1_TASA (= moverlo al final de la cascada) → V1 con params de tasa + baseline=99');
console.log('     proyecta CONTINUIDAD=99 en vez de V1_TASA=(504/12000)×13000=546.');
console.log('  3. §28: cambiar la rama INCOMPATIBLE por un fallback a CONTINUIDAD → un caso sin baseline ni');
console.log('     método lanza en proyectarBase (baseline undefined) en vez de degradar limpio a A05.');
console.log('  4. §15: no aplicar clampDominio → proyección 90+5×6=120 con upper_bound=100 sale 120, [] en');
console.log('     vez de 100, [A06].');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
