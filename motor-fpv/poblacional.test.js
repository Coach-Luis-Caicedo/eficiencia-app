/**
 * motor-fpv/poblacional.test.js — Fase 2
 * node motor-fpv/poblacional.test.js
 *
 * Incluye el ORÁCULO NUMÉRICO: la tabla de estrés §10 (5 escenarios con
 * L / mediana / H / C ya calculados en el texto del documento). No hay
 * subprocess — el "oráculo" es el propio documento. Las 5 filas salen
 * EXACTAS (H se calcula desde conteos, ver poblacional.js).
 */

'use strict';

var PB = require('./poblacional');
var Persona = require('./persona');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }
function near(a, b, m) { ok(typeof a === 'number' && Math.abs(a - b) < 1e-9, m + (typeof a === 'number' && Math.abs(a - b) < 1e-9 ? '' : '  [recibido=' + a + ' esperado=' + b + ']')); }
function lanza(fn, m) { var l = false; try { fn(); } catch (e) { l = true; } ok(l, m); }

// perfiles de UNA posición donde el sensor `sensor` toma los valores de la lista
function perfilesDesde(valores, sensor) {
  return valores.map(function (v, i) {
    var resp = { persona_id: 'p' + i, posicion: 'CONSUMIDOR', F: 3, P: 3, V: 3 };
    resp[sensor || 'F'] = v;
    return Persona.perfilPersona(resp);
  });
}
function poblac(valores) { return PB.poblacionalSensor(perfilesDesde(valores, 'F'), 'F'); }

// ═══════════════════════════════════════════════════════════════════════
seccion('ORÁCULO §10 — tabla de estrés del motor: las 5 filas exactas');
// ═══════════════════════════════════════════════════════════════════════

var ESCENARIOS = [
  { nombre: 'Neutralidad uniforme', r: [3, 3, 3, 3, 3], L: 50, mediana: 3, H: 0, C: 100 },
  { nombre: 'Extremos enfrentados', r: [1, 1, 5, 5], L: 50, mediana: 3, H: 100, C: 0 },
  { nombre: 'Cercanía 3–4', r: [3, 3, 4, 4], L: 62.5, mediana: 3.5, H: 25, C: 75 },
  { nombre: 'Máximo favorable', r: [5, 5, 5, 5], L: 100, mediana: 5, H: 0, C: 100 },
  { nombre: 'Distribución uniforme', r: [1, 2, 3, 4, 5], L: 50, mediana: 3, H: 80, C: 20 }
];

ESCENARIOS.forEach(function (e) {
  var o = poblac(e.r);
  near(o.L, e.L, '§10 "' + e.nombre + '" ' + JSON.stringify(e.r) + ': L = ' + e.L);
  eq(o.mediana, e.mediana, '§10 "' + e.nombre + '": mediana = ' + e.mediana);
  near(o.H, e.H, '§10 "' + e.nombre + '": H = ' + e.H + (e.nombre === 'Distribución uniforme' ? ' (la delicada — 50·40/25 exacto)' : ''));
  near(o.C, e.C, '§10 "' + e.nombre + '": C = ' + e.C);
});

// ═══════════════════════════════════════════════════════════════════════
seccion('§7.2.A — Lⱼ = (1/nᵥ)·Σ s(rᵢ), y mediana de la respuesta original');
// ═══════════════════════════════════════════════════════════════════════

near(poblac([5, 5, 5]).L, 100, '[5,5,5] → L = 100');
near(poblac([1, 1, 1]).L, 0, '[1,1,1] → L = 0');
near(poblac([2, 4]).L, 50, '[2,4] → (s(2)+s(4))/2 = (25+75)/2 = 50');
near(poblac([1, 2, 4]).L, (0 + 25 + 75) / 3, '[1,2,4] → L = 100/3 ≈ 33.33');

eq(PB.mediana([1, 1, 5, 5]), 3, 'mediana [1,1,5,5] = (1+5)/2 = 3 (n par)');
eq(PB.mediana([3, 3, 4, 4]), 3.5, 'mediana [3,3,4,4] = 3.5');
eq(PB.mediana([1, 2, 3, 4, 5]), 3, 'mediana [1,2,3,4,5] = 3 (n impar)');
eq(PB.mediana([4]), 4, 'mediana [4] = 4');
eq(PB.mediana([5, 1, 3, 2, 4]), 3, 'mediana no depende del orden de entrada');

// ═══════════════════════════════════════════════════════════════════════
seccion('§7.2.B — distribución ordinal pₖ = nₖ/nᵥ, Σ pₖ = 1');
// ═══════════════════════════════════════════════════════════════════════

var o5 = poblac([1, 2, 3, 4, 5]);
eq(o5.p, { 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2, 5: 0.2 }, '[1,2,3,4,5] → p = {0.2 ×5}');
near(o5.p[1] + o5.p[2] + o5.p[3] + o5.p[4] + o5.p[5], 1, 'Σ pₖ = 1');
var o13 = poblac([1, 1, 1, 3]);
near(o13.p[1], 0.75, '[1,1,1,3] → p[1] = 3/4 = 0.75');
near(o13.p[3], 0.25, 'p[3] = 1/4');
near(o13.p[2] + o13.p[4] + o13.p[5], 0, 'p[2]=p[4]=p[5]=0');

// ═══════════════════════════════════════════════════════════════════════
seccion('§7.2.C — H = 50·Σᵢ Σₖ pᵢpₖ|i−k| (distancia ordinal), C = 100−H');
// ═══════════════════════════════════════════════════════════════════════

near(poblac([3, 3, 3]).H, 0, 'todos iguales → H = 0');
near(poblac([1, 5]).H, 100, '[1,5] → 50·(1·1·4 ×2)/4 = 100 (máxima separación)');
near(poblac([1, 5]).C, 0, 'C = 100 − 100 = 0');
near(poblac([3, 4]).H, 25, '[3,4] → 50·(1·1·1 ×2)/4 = 25 (categorías vecinas)');
near(poblac([1, 2, 3, 4, 5]).H + poblac([1, 2, 3, 4, 5]).C, 100, 'H + C = 100 siempre');
// 1 y 5 más lejos que 3 y 4 (§7.2.C literal)
ok(poblac([1, 1, 5, 5]).H > poblac([3, 3, 4, 4]).H, '§7.2.C: [1,1,5,5] más heterogéneo que [3,3,4,4] (1–5 más lejos que 3–4)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§14 / §8 — nᵥ, NE/NR fuera; nᵥ=0 → NO_CALCULABLE');
// ═══════════════════════════════════════════════════════════════════════

var conNulos = PB.poblacionalSensor(perfilesDesde([3, 3, 'NE', 'NR', 5, 'NE'], 'F'), 'F');
eq([conNulos.nv, conNulos.nNE, conNulos.nNR], [3, 2, 1], 'nᵥ=3 (los 1–5), nNE=2, nNR=1 — contados por separado (§14)');
near(conNulos.L, (50 + 50 + 100) / 3, 'L solo sobre los válidos: (50+50+100)/3');
eq(conNulos.estatus, 'DESCRIPTIVO', 'nᵥ ≥ 1 → DESCRIPTIVO (§8; CENSAL/INFERENCIAL es Fase 3)');

var todoNE = PB.poblacionalSensor(perfilesDesde(['NE', 'NE', 'NE'], 'F'), 'F');
eq(todoNE.estatus, 'NO_CALCULABLE', '§14: nᵥ=0 → NO_CALCULABLE');
eq([todoNE.L, todoNE.mediana, todoNE.p, todoNE.H, todoNE.C], [null, null, null, null, null], 'NO_CALCULABLE → sin nivel/distribución/H/C (§14: "no se produce nivel")');
eq([todoNE.nv, todoNE.nNE], [0, 3], 'pero nᵥ=0 y nNE=3 sí se reportan');

var mezclaNulos = PB.poblacionalSensor(perfilesDesde(['NE', 'NR', 'NR'], 'F'), 'F');
eq([mezclaNulos.estatus, mezclaNulos.nNE, mezclaNulos.nNR], ['NO_CALCULABLE', 1, 2], 'NE + NR sin ningún válido → NO_CALCULABLE, ambos conteos');

lanza(function () { PB.poblacionalSensor('no soy array', 'F'); }, 'perfiles no-array → lanza');
lanza(function () { PB.poblacionalSensor([], 'X'); }, 'sensor "X" → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('§7.2.B — bandasDescriptivas: PRESENTACIÓN OPCIONAL, helper aparte');
// ═══════════════════════════════════════════════════════════════════════

var b = PB.bandasDescriptivas({ 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2, 5: 0.2 });
eq(b, { desacuerdo: 0.4, neutralidad: 0.2, acuerdo: 0.4 }, 'Desacuerdo=p1+p2, Neutralidad=p3, Acuerdo=p4+p5 (§7.2.B)');
near(b.desacuerdo + b.neutralidad + b.acuerdo, 1, 'las 3 bandas suman 1');
var b2 = PB.bandasDescriptivas({ 1: 0.5, 2: 0.1, 3: 0, 4: 0.1, 5: 0.3 });
eq(b2, { desacuerdo: 0.6, neutralidad: 0, acuerdo: 0.4 }, 'segundo caso');
lanza(function () { PB.bandasDescriptivas(null); }, 'bandasDescriptivas(null) → lanza (no aplica a sensor NO_CALCULABLE)');

// DECISIÓN estructural: las bandas NUNCA están en la salida de poblacionalSensor
var claves = Object.keys(poblac([3, 3, 4, 4]));
ok(claves.indexOf('bandas') === -1 && claves.indexOf('desacuerdo') === -1 && claves.indexOf('acuerdo') === -1,
  'poblacionalSensor NO devuelve las bandas — presentación opcional §7.2.B, no contenido obligatorio §11.1');
eq(claves.sort(), ['C', 'H', 'L', 'mediana', 'nNE', 'nNR', 'nv', 'p', 'sensor', 'estatus'].sort(),
  'poblacionalSensor devuelve solo el núcleo obligatorio (§7.2 A/B/C + nᵥ/nNE/nNR)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. heterogeneidad: `Math.abs(i - k)` → `(i - k)` → Σ nᵢnₖ(i−k) = 0 por');
console.log('     simetría → toda H colapsa a 0.  → 10 rojos (3 filas §10 con H≠0 ×2 col');
console.log('     H/C, + [1,5] H, + [1,5] C, + [3,4] H, + comparación [1,1,5,5]>[3,3,4,4]).');
console.log('     "H + C = 100 siempre" NO cae (0 + 100 = 100).');
console.log('  2. L: `sumaS / nv` → `sumaS` (olvidar /nᵥ).  → 9 rojos (4 filas §10 con');
console.log('     L≠sumaS + uniforme, [5,5,5], [2,4], [1,2,4], y L-sobre-válidos).');
console.log('  3. mediana n par: `(s[m-1] + s[m]) / 2` → `s[m]` (tomar solo el central');
console.log('     alto).  → 4 rojos ([1,1,5,5]→5, [3,3,4,4]→4, y sus dos filas §10).');
console.log('  4. poblacionalSensor agrega `bandas: bandasDescriptivas(p)` a su retorno.');
console.log('     → 2 rojos (la clave prohibida + la lista exacta de claves del núcleo).');
console.log('     §7.2.B es presentación opcional, NO contenido obligatorio §11.1.');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
