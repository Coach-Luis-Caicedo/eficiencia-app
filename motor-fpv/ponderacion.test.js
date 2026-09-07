/**
 * motor-fpv/ponderacion.test.js — Fase 5
 * node motor-fpv/ponderacion.test.js
 *
 * Ponderación §9. Sin oráculo numérico externo (§10 es no ponderado) —
 * los valores esperados se derivan a mano de Lⱼ,w = Σ wᵢ s(rᵢ) / Σ wᵢ.
 * Cross-check: con pesos iguales debe coincidir EXACTO con Fase 2.
 */

'use strict';

var PW = require('./ponderacion');
var PB = require('./poblacional');
var CB = require('./cobertura');
var Persona = require('./persona');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }
function near(a, b, m) { var c = typeof a === 'number' && Math.abs(a - b) < 1e-9; ok(c, m + (c ? '' : '  [recibido=' + a + ' esperado=' + b + ']')); }
function esNull(a, m) { ok(a === null, m + (a === null ? '' : '  [recibido=' + String(a) + ']')); }
function lanza(fn, m) { var l = false; try { fn(); } catch (e) { l = true; } ok(l, m); }

var MET = { metodologia: 'inverso de probabilidad de selección (declarada)' };
// perfil con sensor F = valor, peso dado
function pf(id, f, peso) { return Persona.perfilPersona({ persona_id: id, posicion: 'CONSUMIDOR', F: f, P: 3, V: 3, peso: peso }); }
function pw(perfiles) { return PW.poblacionalSensorPonderado(perfiles, 'F', MET); }

// ═══════════════════════════════════════════════════════════════════════
seccion('§9 — Lⱼ,w = Σ wᵢ s(rᵢ) / Σ wᵢ  ;  pₖ,w  ;  Hⱼ,w sobre pₖ,w');
// ═══════════════════════════════════════════════════════════════════════

// r=[5,1], w=[3,1]: s=[100,0]; Σw=4; L_w=(3·100+1·0)/4=75
var A = pw([pf('a', 5, 3), pf('b', 1, 1)]);
near(A.L, 75, 'L_w = (3·100 + 1·0)/4 = 75');
near(A.suma_pesos, 4, 'Σ wᵢ = 4');
near(A.p[5], 0.75, 'p₅,w = 3/4');
near(A.p[1], 0.25, 'p₁,w = 1/4');
near(A.p[2] + A.p[3] + A.p[4], 0, 'p₂,w=p₃,w=p₄,w=0');
near(A.p[1] + A.p[5], 1, 'Σ pₖ,w = 1');
// H_w = 50·[ p5·p1·4 + p1·p5·4 ] = 50·(0.75·0.25·4·2) = 50·1.5 = 75
near(A.H, 75, 'H_w = 50·(0.75·0.25·4 ×2) = 75');
near(A.C, 25, 'C_w = 100 − 75 = 25');
eq(A.mediana, 3, 'mediana NO ponderada de [5,1] = 3');

// ═══════════════════════════════════════════════════════════════════════
seccion('Cross-check — pesos iguales ⟹ idéntico a Fase 2 (no ponderado)');
// ═══════════════════════════════════════════════════════════════════════

var rs = [1, 2, 3, 4, 5];
var ponderadoIguales = PW.poblacionalSensorPonderado(rs.map(function (r, i) { return pf('p' + i, r, 7); }), 'F', MET);
var noPonderado = PB.poblacionalSensor(rs.map(function (r, i) { return pf('p' + i, r, 7); }), 'F');
near(ponderadoIguales.L, noPonderado.L, 'L_w (w todos = 7) = L de Fase 2 = 50');
near(ponderadoIguales.H, noPonderado.H, 'H_w = H de Fase 2 = 80 (§10 "distribución uniforme")');
eq(ponderadoIguales.p, noPonderado.p, 'p,w = p de Fase 2 {0.2 ×5}');
eq(ponderadoIguales.mediana, noPonderado.mediana, 'mediana coincide (ambas no ponderadas)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Decisión D — la mediana NO se pondera (§9 no la lista)');
// ═══════════════════════════════════════════════════════════════════════

// r=[1,1,1,5], w=[1,1,1,100]: L_w ≈ 97 pero mediana cruda = 1
var D = pw([pf('a', 1, 1), pf('b', 1, 1), pf('c', 1, 1), pf('d', 5, 100)]);
near(D.L, 10000 / 103, 'L_w = (0+0+0+100·100)/103 ≈ 97.09 — el peso domina');
eq(D.mediana, 1, 'mediana = mediana([1,1,1,5]) = 1 — CRUDA, el peso 100 NO la mueve');
near(D.p[5], 100 / 103, 'p₅,w = 100/103 ≈ 0.971');
near(D.p[1], 3 / 103, 'p₁,w = 3/103 ≈ 0.029');

// ═══════════════════════════════════════════════════════════════════════
seccion('Decisión C/G — Σw por sensor sobre las válidas de ESE sensor');
// ═══════════════════════════════════════════════════════════════════════

// X: F=5 válido, V=NE, peso 10 ; Y: F=3, V=4, peso 2
var X = Persona.perfilPersona({ persona_id: 'X', posicion: 'CONSUMIDOR', F: 5, P: 3, V: 'NE', peso: 10 });
var Y = Persona.perfilPersona({ persona_id: 'Y', posicion: 'CONSUMIDOR', F: 3, P: 3, V: 4, peso: 2 });
var V = PW.poblacionalSensorPonderado([X, Y], 'V', MET);
near(V.suma_pesos, 2, 'sensor V: Σw = 2 — solo Y (la V de X es NE, su peso 10 NO entra)');
near(V.L, 75, 'L_w(V) = (2·s(4))/2 = 75 — no (2·75)/12');
eq(V.nNE, 1, 'nNE(V) = 1 (X)');
var F = PW.poblacionalSensorPonderado([X, Y], 'F', MET);
near(F.suma_pesos, 12, 'sensor F: Σw = 12 — X (10) e Y (2), ambas F válidas');
near(F.L, (10 * 100 + 2 * 50) / 12, 'L_w(F) = (10·100 + 2·50)/12 = 91.67');

// ═══════════════════════════════════════════════════════════════════════
seccion('Decisión B — pesos incompletos → LANZA (no se imputa 1)');
// ═══════════════════════════════════════════════════════════════════════

lanza(function () { pw([pf('a', 5, 3), pf('b', 1, null)]); }, 'una persona válida sin peso → lanza');
lanza(function () { pw([pf('a', 5, 3), pf('b', 1, 0)]); }, 'peso = 0 → lanza (§ESQUEMA: > 0)');
lanza(function () { pw([pf('a', 5, 3), pf('b', 1, -2)]); }, 'peso negativo → lanza');
// pero: persona SIN peso cuya respuesta a este sensor es NE/NR → NO estorba
var conNEsinPeso = Persona.perfilPersona({ persona_id: 'z', posicion: 'CONSUMIDOR', F: 'NE', P: 3, V: 3 });
var okNE = PW.poblacionalSensorPonderado([pf('a', 5, 3), conNEsinPeso], 'F', MET);
near(okNE.L, 100, 'persona con F=NE y sin peso NO bloquea el cálculo de F (su peso no aplica a F)');
eq(okNE.nNE, 1, 'y se cuenta como nNE');

// ═══════════════════════════════════════════════════════════════════════
seccion('Decisión G — `metodologia` requerida');
// ═══════════════════════════════════════════════════════════════════════

lanza(function () { PW.poblacionalSensorPonderado([pf('a', 5, 3)], 'F'); }, 'sin opciones → lanza');
lanza(function () { PW.poblacionalSensorPonderado([pf('a', 5, 3)], 'F', {}); }, 'sin metodologia → lanza');
lanza(function () { PW.poblacionalSensorPonderado([pf('a', 5, 3)], 'F', { metodologia: '   ' }); }, 'metodologia en blanco → lanza');
eq(pw([pf('a', 5, 3)]).metodologia, MET.metodologia, 'metodologia se registra tal cual en la salida');

// ═══════════════════════════════════════════════════════════════════════
seccion('§9 — conserva n no ponderado y Σ pesos; nv=0 → NO_CALCULABLE');
// ═══════════════════════════════════════════════════════════════════════

var conteo = pw([pf('a', 5, 100), pf('b', 5, 100), pf('c', 5, 100)]);
eq(conteo.n_no_ponderado, 3, 'n_no_ponderado = 3 (conteo de personas, NO Σ pesos = 300)');
near(conteo.suma_pesos, 300, 'suma_pesos = 300');
eq(conteo.ponderado, true, 'ponderado = true');

var vacio = PW.poblacionalSensorPonderado([
  Persona.perfilPersona({ persona_id: 'a', posicion: 'CONSUMIDOR', F: 'NE', P: 3, V: 3, peso: 5 })
], 'F', MET);
eq(vacio.estatus, 'NO_CALCULABLE', 'nv=0 → NO_CALCULABLE');
esNull(vacio.L, 'L = null');
eq([vacio.n_no_ponderado, vacio.suma_pesos], [0, 0], 'n_no_ponderado=0, suma_pesos=0');

// ═══════════════════════════════════════════════════════════════════════
seccion('Composición — coberturaSensor (Fase 3) consume la salida ponderada');
// ═══════════════════════════════════════════════════════════════════════

var base = pw([pf('a', 5, 3), pf('b', 1, 1),
  Persona.perfilPersona({ persona_id: 'c', posicion: 'CONSUMIDOR', F: 'NE', P: 3, V: 3, peso: 1 })]);
var conCob = CB.coberturaSensor(base, undefined, 4);
near(conCob.CE, 100 * 2 / (2 + 1), 'CE = 100·nv/(nv+nNE) = 66.7 — cobertura SIN ponderar (decisión E)');
near(conCob.CV, 50, 'CV = 100·2/4 = 50 — sobre conteos, no pesos');
near(conCob.L, base.L, 'coberturaSensor preserva la L ponderada');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. L_w: `acc + v.w * v.s` → `acc + v.s` (numerador sin wᵢ).  → 6 rojos.');
console.log('  2. p_w: `(v.r === k ? v.w : 0)` → `(v.r === k ? 1 : 0)` (conteo simple).');
console.log('     → 7 rojos (p_w, Σp_w, H_w y C_w derivados, cross-check con Fase 2).');
console.log('  3. normalización: `/ sumaPesos` → `/ nv` en L_w (dividir por conteo).  → 6 rojos.');
console.log('  4. H_w: recalculada sobre p de CONTEOS (no ponderado) en vez de p,w.  → 2 rojos');
console.log('     (H_w y C_w del escenario A; el cross-check con w iguales sigue verde).');
console.log('  5. Decisión B revertida: peso faltante → v.w = 1 (imputar) en vez de lanzar.');
console.log('     → 3 rojos (los 3 `lanza` de peso ausente / 0 / negativo).');
console.log('  6. Decisión C revertida: sumaPesos = Σ de TODOS los perfiles con peso,');
console.log('     no solo los válidos a este sensor.  → 2 rojos (Σw(V) y L_w(V)).');
console.log('  7. `n_no_ponderado: nv` → `n_no_ponderado: sumaPesos` (no conservar el n crudo).');
console.log('     → 1 rojo.');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
