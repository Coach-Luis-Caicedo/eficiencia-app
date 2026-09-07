/**
 * motor-fpv/persona.test.js — Fase 1
 * node motor-fpv/persona.test.js
 */

'use strict';

var P = require('./persona');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }
function lanza(fn, m) { var l = false; try { fn(); } catch (e) { l = true; } ok(l, m); }

function resp(over) {
  return Object.assign({ persona_id: 'p1', posicion: 'CONSUMIDOR', F: 4, P: 3, V: 5 }, over || {});
}

// ═══════════════════════════════════════════════════════════════════════
seccion('§7.1 — sensorPersona: s(r) directo, sin promedio interno');
// ═══════════════════════════════════════════════════════════════════════

eq(P.sensorPersona(1), { valido: true, r: 1, s: 0 }, 'r=1 → { valido, r:1, s:0 }');
eq(P.sensorPersona(3), { valido: true, r: 3, s: 50 }, 'r=3 → s:50');
eq(P.sensorPersona(5), { valido: true, r: 5, s: 100 }, 'r=5 → s:100');
ok(P.sensorPersona(4).s === 75 && P.sensorPersona(4).r === 4, 'r=4 → s:75, y conserva la respuesta original (§6)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§7.1 — NE y NR: MISMO efecto (no calculable), motivo conservado');
// ═══════════════════════════════════════════════════════════════════════

var sNE = P.sensorPersona('NE');
var sNR = P.sensorPersona('NR');
ok(sNE.valido === false && sNR.valido === false, '§7.1: NE y NR → ambos `valido: false` (no calculable para la Persona)');
ok(sNE.s === undefined && sNR.s === undefined, 'ninguno tiene `s` — no se imputa (§6)');
eq(sNE.motivo, 'NE', 'NE → motivo "NE"');
eq(sNR.motivo, 'NR', 'NR → motivo "NR"');
ok(sNE.motivo !== sNR.motivo, '§6: el motivo distingue NE de NR (nunca se fusionan) aunque el efecto sea el mismo');

lanza(function () { P.sensorPersona(0); }, 'valor 0 (no validado) → lanza');
lanza(function () { P.sensorPersona(undefined); }, 'valor ausente → lanza (debe venir del contrato)');
lanza(function () { P.sensorPersona('3'); }, 'valor "3" cadena → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('§7.1 — perfilPersona: completo sólo con F, P y V válidos');
// ═══════════════════════════════════════════════════════════════════════

var completo = P.perfilPersona(resp());
ok(completo.completo === true, 'F=4, P=3, V=5 → perfil completo');
eq([completo.F.s, completo.P.s, completo.V.s], [75, 50, 100], 's(4), s(3), s(5) = 75, 50, 100');
eq(completo.persona_id, 'p1', 'persona_id se propaga');
eq(completo.posicion, 'CONSUMIDOR', 'posicion se propaga');

// ═══════════════════════════════════════════════════════════════════════
seccion('§7.1 — "no se completa con las otras dos"');
// ═══════════════════════════════════════════════════════════════════════

var conNE = P.perfilPersona(resp({ F: 5, P: 5, V: 'NE' }));
ok(conNE.completo === false, 'V=NE → perfil NO completo');
ok(conNE.V.valido === false && conNE.V.motivo === 'NE', 'V queda no calculable, motivo NE');
ok(conNE.V.s === undefined, '§7.1: V.s NO existe — NO se completa con (F+P)/2 = 5 ni con nada');
eq([conNE.F.s, conNE.P.s], [100, 100], 'F y P siguen con su s(5) real — la dimensión NE no las contamina');

var conNR = P.perfilPersona(resp({ F: 'NR', P: 2, V: 4 }));
ok(conNR.completo === false && conNR.F.motivo === 'NR', 'F=NR → no completo, motivo NR');
ok(conNR.F.s === undefined, 'F.s no existe');

var dosNulos = P.perfilPersona(resp({ F: 'NE', P: 'NR', V: 3 }));
ok(dosNulos.completo === false, 'F=NE, P=NR → no completo');
eq([dosNulos.F.motivo, dosNulos.P.motivo], ['NE', 'NR'], 'cada dimensión conserva su propio motivo');
ok(dosNulos.V.valido === true && dosNulos.V.s === 50, 'la única dimensión válida (V=3) sí se calcula');

var todosNulos = P.perfilPersona(resp({ F: 'NR', P: 'NR', V: 'NR' }));
ok(todosNulos.completo === false && !todosNulos.F.valido && !todosNulos.P.valido && !todosNulos.V.valido,
  'las 3 en NR → perfil sin ninguna dimensión calculable');

// ═══════════════════════════════════════════════════════════════════════
seccion('§9 — peso: escalar por persona, se propaga sin tocar');
// ═══════════════════════════════════════════════════════════════════════

eq(P.perfilPersona(resp({ peso: 2.5 })).peso, 2.5, 'peso 2.5 → se propaga tal cual');
eq(P.perfilPersona(resp()).peso, null, 'sin peso → null (no 1, no se inventa — §9: por defecto no ponderado)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. sensorPersona: la rama "NR" devuelve { valido: true } (sin s ni r) → 5 rojos:');
console.log('     "NE/NR ambos valido:false", "NR → motivo NR", "F=NR → no completo", "cada dimensión');
console.log('     conserva su motivo", "las 3 en NR". (Si además la mutación pusiera s:0 rompe 2 más');
console.log('     — "ninguno tiene s", "F.s no existe" — pero la forma canónica de la mutación es');
console.log('     solo el flip de `valido`, 5 rojos.)');
console.log('  2. perfilPersona: completar V.s con (F.s+P.s)/2 cuando V es NE → 1 rojo: "V.s NO existe,');
console.log('     no se completa con (F+P)/2".');
console.log('  3. `completo` con OR en vez de AND → 3 rojos: los 3 casos "no completo" pasan a completo.');
console.log('  4. sensorPersona no conserva el motivo para NE (solo { valido:false }) → 3 rojos:');
console.log('     "NE → motivo NE", "V no calculable motivo NE", "cada dimensión conserva su motivo".');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
