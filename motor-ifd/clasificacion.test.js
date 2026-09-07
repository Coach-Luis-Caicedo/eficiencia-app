/**
 * motor-ifd/clasificacion.test.js — Fase 2
 * node motor-ifd/clasificacion.test.js
 */

'use strict';

var CL = require('./clasificacion');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }
function lanza(fn, m) { var l = false; try { fn(); } catch (e) { l = true; } ok(l, m); }

function ent(over) {
  return Object.assign({
    fep: 3, horizon: 6, hms: 12, variable_type: 'V1', evolution_type: 'EV-A', series_sufficiency: 3
  }, over || {});
}

// ═══════════════════════════════════════════════════════════════════════
seccion('§18 / §28 — aplicarHMS');
// ═══════════════════════════════════════════════════════════════════════

eq(CL.aplicarHMS(3, 6, 12), { effectiveFep: 3, alerta: null, degradado: false, nota: null }, 'H=6 ≤ HMS=12 → sin cambio');
eq(CL.aplicarHMS(3, 6, null).effectiveFep, 3, 'hms=null (no declarado) → sin cambio, no es fallo');
var deg = CL.aplicarHMS(3, 20, 12);
eq({ f: deg.effectiveFep, a: deg.alerta, d: deg.degradado }, { f: 2, a: 'A07', d: true }, 'H=20 > HMS=12 → A07, effective_fep 3→2');
eq(CL.aplicarHMS(2, 20, 12).effectiveFep, 1, 'fep=2, H>HMS → effective_fep 2→1');
eq(CL.aplicarHMS(1, 20, 12).effectiveFep, 1, 'fep=1, H>HMS → effective_fep se queda en 1 (§28: nunca por debajo de S1)');
lanza(function () { CL.aplicarHMS(4, 6, 12); }, 'fep=4 → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('§15 — clampDominio: Y* = min(U, max(L, Ŷ))');
// ═══════════════════════════════════════════════════════════════════════

eq(CL.clampDominio(50, 0, 100), { valor: 50, recortado: false, alerta: null }, '50 en [0,100] → sin recorte');
eq(CL.clampDominio(-5, 0, 100), { valor: 0, recortado: true, alerta: 'A06' }, '-5 con L=0 → sube a 0 (max(L, y)), A06');
eq(CL.clampDominio(150, 0, 100), { valor: 100, recortado: true, alerta: 'A06' }, '150 con U=100 → baja a 100 (min(U, y)), A06');
eq(CL.clampDominio(-5, null, 100).valor, -5, 'sin lower_bound → no se acota por abajo (§15: valores negativos legítimos)');
eq(CL.clampDominio(0.7, 0, 1).valor, 0.7, 'proporción 0.7 en [0,1] → válida');
lanza(function () { CL.clampDominio(Infinity, 0, 100); }, 'y=Infinity → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('§17 — clasificarSuficienciaSerie');
// ═══════════════════════════════════════════════════════════════════════

eq(CL.clasificarSuficienciaSerie(3), { nivel: 'SS3', indice: 3, permiteCuantitativa: true }, 'ss=3 → SS3, cuantitativa OK');
eq(CL.clasificarSuficienciaSerie(2).permiteCuantitativa, true, 'ss=2 → SS2, cuantitativa OK (justo en el umbral)');
eq(CL.clasificarSuficienciaSerie(1).permiteCuantitativa, false, 'ss=1 → SS1, NO cuantitativa');
eq(CL.clasificarSuficienciaSerie(0).permiteCuantitativa, false, 'ss=0 → SS0, NO cuantitativa');
lanza(function () { CL.clasificarSuficienciaSerie(5); }, 'ss=5 → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('resolverClasificacion — las 4 compuertas, en orden');
// ═══════════════════════════════════════════════════════════════════════

// V5 antes que todo lo demás (salvo HMS que solo ajusta effective_fep)
var v5 = CL.resolverClasificacion(ent({ variable_type: 'V5' }));
ok(v5.terminal && v5.resultado.output_level === 'S1' && v5.resultado.status === 'CUALITATIVO',
  'V5 → S1 / CUALITATIVO terminal (§20.5, §35: variable latente no produce cifra)');
ok(v5.resultado.notes.some(function (n) { return n.indexOf('capacidad latente') !== -1; }), 'nota: "no se fabrica una cifra para una capacidad latente"');

// V5 gana incluso con serie insuficiente (status CUALITATIVO, no DEGRADADO)
var v5serieMala = CL.resolverClasificacion(ent({ variable_type: 'V5', series_sufficiency: 0 }));
eq(v5serieMala.resultado.status, 'CUALITATIVO', 'V5 con serie SS0 → status CUALITATIVO (por naturaleza), NO DEGRADADO_A_CUALITATIVO');

var evcual = CL.resolverClasificacion(ent({ evolution_type: 'EV-CUAL' }));
ok(evcual.terminal && evcual.resultado.status === 'CUALITATIVO', 'EV-CUAL → S1 / CUALITATIVO (§16: dinámica cualitativa sin fórmula)');

var fep1 = CL.resolverClasificacion(ent({ fep: 1 }));
ok(fep1.terminal && fep1.resultado.status === 'CUALITATIVO', 'effective_fep=1 → S1 / CUALITATIVO');

// fep=2 pero H>HMS degrada a 1 → S1
var degToS1 = CL.resolverClasificacion(ent({ fep: 2, horizon: 20, hms: 12 }));
ok(degToS1.terminal && degToS1.resultado.status === 'CUALITATIVO', 'fep=2 + H>HMS → effective_fep=1 → S1');
eq(degToS1.resultado.alerts, ['A07'], 'lleva la alerta A07 del horizonte');

// serie insuficiente en V1-V4 → DEGRADADO_A_CUALITATIVO (status distinto)
var serieMala = CL.resolverClasificacion(ent({ variable_type: 'V3', series_sufficiency: 1 }));
ok(serieMala.terminal && serieMala.resultado.status === 'DEGRADADO_A_CUALITATIVO',
  'V3 + serie SS1 → S1 / DEGRADADO_A_CUALITATIVO (distinto de CUALITATIVO — diagnóstico diferente)');
eq(serieMala.resultado.alerts, ['A04'], 'alerta A04 SERIE_INSUFICIENTE');

// serie insuficiente NO aplica a V5 (ya cortó antes) — cubierto arriba

// caso que SÍ pasa a Fase 3
var sigue = CL.resolverClasificacion(ent());
eq({ t: sigue.terminal, ef: sigue.effectiveFep, nm: sigue.nivelMax }, { t: false, ef: 3, nm: 'S3' },
  'V1, EV-A, FEP=3, serie SS3, H≤HMS → NO terminal, sigue a Fase 3 con effective_fep=3, techo S3');

var sigueDeg = CL.resolverClasificacion(ent({ fep: 3, horizon: 20, hms: 12 }));
eq({ ef: sigueDeg.effectiveFep, nm: sigueDeg.nivelMax, al: sigueDeg.alerts }, { ef: 2, nm: 'S2', al: ['A07'] },
  'FEP=3 + H>HMS → sigue con effective_fep=2, techo S2, alerta A07');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. §20.5/§35: quitar la compuerta V5 → un V5 con parámetros de proyección pasa a NO');
console.log('     terminal (proyectaría una cifra fabricada en Fase 3).');
console.log('  2. §28: aplicarHMS con `fep-1` en vez de `max(1, fep-1)` → fep=1 + H>HMS da effective_fep=0');
console.log('     (bajaría a S0 cuando §28 dice "nunca por debajo de S1").');
console.log('  3. §18: aplicarHMS con `false && horizon > hms` → A07 nunca se emite, nunca degrada.');
console.log('  4. §15: clampDominio con `Math.min(lower, out)` en vez de `Math.max` → y=-5 con L=0 no sube a 0.');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
