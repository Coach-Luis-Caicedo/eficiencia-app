/**
 * motor-ifd/escenarios.test.js — Fase 4
 * node motor-ifd/escenarios.test.js
 */

'use strict';

var S = require('./escenarios');
var E = require('./enums');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }
function near(a, b, m) { ok(typeof a === 'number' && Math.abs(a - b) < 1e-9, m + (Math.abs(a - b) < 1e-9 ? '' : '  [recibido=' + a + ' esperado=' + b + ']')); }
function lanza(fn, m) { var l = false; try { fn(); } catch (e) { l = true; } ok(l, m); }

function inp(over) {
  return Object.assign({ variable_type: 'V3', evolution_type: 'EV-A', horizon: 3 }, over || {});
}

// ═══════════════════════════════════════════════════════════════════════
seccion('percentil — interpolación lineal (tipo 7)');
// ═══════════════════════════════════════════════════════════════════════

near(S.percentil([10, 10, 10], 75), 10, 'Q75 de [10,10,10] = 10');
near(S.percentil([10, 18], 75), 16, 'Q75 de [10,18]: idx=0.75 → 10 + 0.75×8 = 16');
near(S.percentil([5, 8, 10, 18], 75), 12, 'Q75 de [5,8,10,18]: idx=2.25 → 10 + 0.25×8 = 12');
near(S.percentil([42], 75), 42, 'Q75 de un solo valor = ese valor');

// ═══════════════════════════════════════════════════════════════════════
seccion('§21.1 — escenarioContinuidad: Ŷ_H, sin multiplicador');
// ═══════════════════════════════════════════════════════════════════════

eq(S.escenarioContinuidad(5400), { escenario: 'CONTINUIDAD', valor: 5400, cualitativo: false }, 'CONTINUIDAD = projBase tal cual (5400)');
lanza(function () { S.escenarioContinuidad(null); }, 'projBase null → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('§21.2 — derivarIntensificacionDeSerie');
// ═══════════════════════════════════════════════════════════════════════

// multiplicativo, crecimiento 10% puro
var mult = S.derivarIntensificacionDeSerie([100, 110, 121, 133.1], true);
near(mult.param, 0.10, 'serie [100,110,121,133.1] (10% puro): g_int = +1 × Q75([.1,.1,.1]) = 0.10');
eq(mult.s, 1, 'dirección neta s = +1');

// aditivo, +5 puro
var add = S.derivarIntensificacionDeSerie([10, 15, 20, 25], false);
near(add.param, 5, 'serie [10,15,20,25] (+5 puro): delta_int = +1 × Q75([5,5,5]) = 5');

// trayectoria MIXTA — solo los cambios adversos entran
var mix = S.derivarIntensificacionDeSerie([10, 20, 12, 30, 25], false);
eq(mix.s, 1, 'serie [10,20,12,30,25]: neta s=+1');
near(mix.param, 16, 'cambios +10,-8,+18,-5 → adversos [+10,+18] → Q75([10,18])=16 → delta_int=+16 (mejoras -8,-5 NO cuentan)');

// serie insuficiente
ok(S.derivarIntensificacionDeSerie([10, 15, 20], false) === null, 'serie de 3 puntos (< MIN=4) → null');
// sin trayectoria neta
ok(S.derivarIntensificacionDeSerie([50, 60, 40, 50], false) === null, 's=0 (primer=último) → null');
// sin cambios adversos (neta por extremos, pero camino sin ningún paso en esa dirección — raro)
ok(S.derivarIntensificacionDeSerie([10, 5, 8, 6, 4], true) === null || S.derivarIntensificacionDeSerie([10, 5, 8, 6, 4], true).s === -1,
  'serie decreciente [10,5,8,6,4]: s=-1, adversos son los cambios negativos');
// cambio relativo con 0 en el denominador → se omite
var conCero = S.derivarIntensificacionDeSerie([0, 10, 20, 30], true);
ok(conCero !== null && conCero.s === 1, 'serie [0,10,20,30] mult: el cambio con serie[0]=0 se omite, el resto sí cuenta');

// ═══════════════════════════════════════════════════════════════════════
seccion('§21.2 — escenarioIntensificacion: los 3 niveles + precedencia');
// ═══════════════════════════════════════════════════════════════════════

// 1 — de la serie (aditivo)
var i1 = S.escenarioIntensificacion(inp({ evolution_type: 'EV-A', baseline: 25, horizon: 3, serie_historica: [10, 15, 20, 25] }));
near(i1.param, 5, 'delta_int derivado = 5');
near(i1.valor, 40, 'Yₜ + h·δ_int = 25 + 3×5 = 40');
eq(i1.fuente, 'SERIE', 'fuente = SERIE');

// 1 — de la serie (multiplicativo)
var i1m = S.escenarioIntensificacion(inp({ evolution_type: 'EV-M', baseline: 133.1, horizon: 3, serie_historica: [100, 110, 121, 133.1] }));
near(i1m.param, 0.10, 'g_int derivado = 0.10');
near(i1m.valor, 177.1561, 'Yₜ(1+g_int)^h = 133.1 × 1.1^3 = 133.1 × 1.331 = 177.1561');

// 2 — declaración explícita (sin serie suficiente)
var i2 = S.escenarioIntensificacion(inp({ evolution_type: 'EV-A', baseline: 100, horizon: 4, delta_intensificacion: 7 }));
near(i2.valor, 128, 'sin serie, delta_intensificacion=7 declarado → 100 + 4×7 = 128');
eq(i2.fuente, 'DECLARACION', 'fuente = DECLARACION');

// 3 — cualitativa (ni serie ni declaración)
var i3 = S.escenarioIntensificacion(inp({ evolution_type: 'EV-A', baseline: 100, horizon: 4 }));
ok(i3.cualitativo && i3.valor === null && i3.fuente === 'CUALITATIVO', 'ni serie ni declaración → Intensificación cualitativa (valor null)');

// 3 — sin baseline → cualitativa
var i3b = S.escenarioIntensificacion(inp({ evolution_type: 'EV-A', horizon: 4, serie_historica: [10, 15, 20, 25] }));
ok(i3b.cualitativo, 'sin baseline (Yₜ) → cualitativa aunque la serie alcance');

// 3 — evolution_type sin fórmula de §21.2 → cualitativa
var i3c = S.escenarioIntensificacion(inp({ evolution_type: 'EV-ACUM', baseline: 100, horizon: 4, serie_historica: [10, 15, 20, 25] }));
ok(i3c.cualitativo, 'EV-ACUM → cualitativa (§21.2 solo da fórmula para EV-M/EV-A)');

// 4 — precedencia: serie calculable Y declaración, fuera de tolerancia
var i4 = S.escenarioIntensificacion(inp({ evolution_type: 'EV-A', baseline: 100, horizon: 3, serie_historica: [10, 15, 20, 25], delta_intensificacion: 20 }));
near(i4.param, 5, 'serie da delta_int=5; declarado=20 → el MOTOR MANDA con el calculado (5)');
near(i4.valor, 115, '100 + 3×5 = 115 (NO 100 + 3×20 = 160)');
ok(i4.audit.some(function (a) { return a.code === 'DISCREPANCIA_INTENSIFICACION' && a.declarado === 20 && a.calculado === 5; }),
  'la discrepancia (declarado 20 vs calculado 5, |15|/20 = 0.75 > 0.05) queda en audit[]');

// 4 — dentro de tolerancia → sin audit
var i4ok = S.escenarioIntensificacion(inp({ evolution_type: 'EV-A', baseline: 100, horizon: 3, serie_historica: [10, 15, 20, 25], delta_intensificacion: 5.1 }));
ok(i4ok.audit.length === 0, 'declarado 5.1 vs calculado 5 (|0.1|/5.1 = 0.0196 < 0.05) → coinciden, sin audit');

// ═══════════════════════════════════════════════════════════════════════
seccion('§21.3 — escenarioContencion: proyección FÍSICA, no ver/roi');
// ═══════════════════════════════════════════════════════════════════════

var c1 = S.escenarioContencion(inp({ containment_factor: 0.30, containment_evidence_level: 2 }), 5400);
near(c1.valor, 3780, '5400 × (1 − 0.30) = 3780 (proyección física bajo contención)');
ok(c1.notes[0].indexOf('NO es ver/roi') !== -1, 'la nota aclara: NO es ver/roi (§24, pendiente de auditoría)');

var c2 = S.escenarioContencion(inp({ containment_factor: 0.30, containment_evidence_level: 1 }), 5400);
ok(c2.cualitativo && c2.valor === null, 'evidence_level=1 < 2 → cualitativa');
eq(c2.alerts, ['A12'], 'A12 INTERVENCION_SIN_EVIDENCIA');

var c3 = S.escenarioContencion(inp({}), 5400);
ok(c3.cualitativo && c3.alerts.length === 0, 'sin containment_factor → cualitativa, sin A12 (no se declaró intervención)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§22 — calcularEnvelope: [L, B, U] por effective_FEP');
// ═══════════════════════════════════════════════════════════════════════

var e2 = S.calcularEnvelope(100, 2, null, null);
near(e2.L, 85, 'FEP=2 → L = 100 × 0.85 = 85');
near(e2.B, 100, 'FEP=2 → B = projBase = 100');
near(e2.U, 115, 'FEP=2 → U = 100 × 1.15 ≈ 115');
var e3 = S.calcularEnvelope(100, 3, null, null);
near(e3.L, 93, 'FEP=3 → L = 100 × 0.93 = 93');
near(e3.U, 107, 'FEP=3 → U = 100 × 1.07 = 107');
eq(e2.estado_calibracion, 'PENDIENTE_CALIBRACION', 'marcado PENDIENTE_CALIBRACION (§22)');

var eClamp = S.calcularEnvelope(100, 2, 0, 110);
near(eClamp.L, 85, 'L=85 sin recorte');
near(eClamp.U, 110, 'U≈115 recortado a upper_bound=110 (§15)');
eq(eClamp.alerts, ['A06'], 'A06 por el recorte del envelope');

lanza(function () { S.calcularEnvelope(100, 1, null, null); }, 'FEP=1 → lanza (no hay envelope; FEP≤1 corta a S1 en Fase 2)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. quitar el filtro por dirección s → serie [10,20,12,30,25] EV-A: correcto delta_int=16');
console.log('     (adversos [+10,+18]); mutado usa todos [+10,-8,+18,-5] → Q75(|.|)=12. Distinto y menor.');
console.log('  2. quitar `if (s === 0) return null` → serie [50,50,50,50] EV-M: correcto → cualitativa;');
console.log('     mutado → g_int = Q75([0,0,0]) = 0 → valor = 50 (proyecta con g_int=0 en vez de caer).');
console.log('  3. `< MIN_PUNTOS` → `< MIN_PUNTOS - 1` → serie de 3 puntos [10,15,20] se cuela al cálculo');
console.log('     (delta_int=5) en vez de tratarse como insuficiente.');
console.log('  4. quitar el chequeo de discrepancia → serie da 5, declarado 20 → sin entrada en audit[]');
console.log('     (aunque el motor sigue mandando con el calculado, la señal humana se pierde sin registro).');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
