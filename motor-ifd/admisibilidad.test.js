/**
 * motor-ifd/admisibilidad.test.js — Fase 1
 * node motor-ifd/admisibilidad.test.js
 */

'use strict';

var A = require('./admisibilidad');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }
function lanza(fn, m) { var l = false; try { fn(); } catch (e) { l = true; } ok(l, m); }

function gates(over) {
  return Object.assign({
    deterioration_sustained: true, evidence_present: true, mechanism_traceable: true,
    horizon_defined: true, assumptions_declared: true
  }, over || {});
}
function entrada(over) {
  return Object.assign(gates(), { Q: 3, C: 3, T: 3, R: 3 }, over || {});
}

// ═══════════════════════════════════════════════════════════════════════
seccion('§6 — evaluarAdmisibilidad: AND estricto de las 5 puertas');
// ═══════════════════════════════════════════════════════════════════════

eq(A.evaluarAdmisibilidad(gates()), { admisible: true, puertasFallidas: [], alerta: null }, 'las 5 puertas true → admisible');

A.PUERTAS_ADMISIBILIDAD.forEach(function (p) {
  var r = A.evaluarAdmisibilidad(gates(defObj(p, false)));
  ok(!r.admisible && r.puertasFallidas.indexOf(p) !== -1 && r.alerta === 'A01',
    'solo "' + p + '"=false → NO admisible, alerta A01 (§6: falta un elemento esencial)');
});
function defObj(k, v) { var o = {}; o[k] = v; return o; }

ok(!A.evaluarAdmisibilidad(gates({ evidence_present: undefined })).admisible,
  'puerta ausente (undefined) → NO admisible (el motor no completa vacíos, §6)');
ok(!A.evaluarAdmisibilidad(gates({ mechanism_traceable: 'sí' })).admisible,
  'puerta no booleana ("sí") → NO admisible (solo `true` cuenta)');

var multiFalla = A.evaluarAdmisibilidad(gates({ deterioration_sustained: false, assumptions_declared: false }));
eq(multiFalla.puertasFallidas, ['deterioration_sustained', 'assumptions_declared'], 'múltiples fallas → todas listadas');

// ═══════════════════════════════════════════════════════════════════════
seccion('§7 — calcularFEP: min no compensatorio');
// ═══════════════════════════════════════════════════════════════════════

eq(A.calcularFEP({ Q: 3, C: 3, T: 3, R: 3 }).fep, 3, 'Q=C=T=R=3 → FEP=3');
var f1 = A.calcularFEP({ Q: 3, C: 3, T: 3, R: 1 });
eq(f1.fep, 1, 'Q=C=T=3, R=1 → FEP=1 (NO 2.5 — la más débil manda)');
eq(f1.dimensionMinima, 'R', 'la dimensión mínima es R');
eq(A.calcularFEP({ Q: 2, C: 0, T: 3, R: 3 }).fep, 0, 'C=0 → FEP=0');
eq(A.calcularFEP({ Q: 1, C: 2, T: 1, R: 2 }).fep, 1, 'min(1,2,1,2)=1');

lanza(function () { A.calcularFEP({ Q: 3, C: 3, T: 3, R: 4 }); }, 'R=4 (fuera de 0-3) → lanza');
lanza(function () { A.calcularFEP({ Q: 2.5, C: 3, T: 3, R: 3 }); }, 'Q=2.5 (no entero) → lanza');
lanza(function () { A.calcularFEP({ Q: 3, C: 3, T: 3 }); }, 'falta R → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('§8 — nivelSalidaMax + verificarFuerzaSalida (FUERZA DE SALIDA ≤ FUERZA DE EVIDENCIA)');
// ═══════════════════════════════════════════════════════════════════════

eq([0, 1, 2, 3].map(A.nivelSalidaMax), ['S0', 'S1', 'S2', 'S3'], 'mapeo FEP→nivel: 0→S0, 1→S1, 2→S2, 3→S3');
ok(A.verificarFuerzaSalida('S1', 3).valido, 'S1 con FEP=3 → válido (por debajo del techo, degradación permitida §30)');
ok(A.verificarFuerzaSalida('S2', 2).valido, 'S2 con FEP=2 → válido (justo en el techo)');
lanza(function () { A.verificarFuerzaSalida('S3', 1); }, 'S3 con FEP=1 → lanza (excede el techo por evidencia, §8)');
lanza(function () { A.verificarFuerzaSalida('S2', 1); }, 'S2 con FEP=1 → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('resolverPuertaEvidencia — S0 terminal (no admisible / FEP=0)');
// ═══════════════════════════════════════════════════════════════════════

var rNoAdm = A.resolverPuertaEvidencia(entrada({ deterioration_sustained: false }));
ok(rNoAdm.terminal && rNoAdm.resultado.output_level === 'S0' && rNoAdm.resultado.status === 'NO_PROYECTABLE',
  '§35 "falta deterioro sustentado → no proyectable": S0 / NO_PROYECTABLE');
eq(rNoAdm.resultado.alerts, ['A01'], 'alerta A01');
eq(rNoAdm.resultado.admissible, false, 'admissible=false');

// §35: "R=0 → no proyectable aunque la serie sea estadísticamente fuerte"
var rR0 = A.resolverPuertaEvidencia(entrada({ R: 0 }));
ok(rR0.terminal && rR0.resultado.output_level === 'S0', 'R=0 (Q=C=T=3) → S0 (§35: aunque la serie sea fuerte)');
eq(rR0.resultado.admissible, true, 'admissible=true (las 5 puertas están; el problema es FEP=0)');
eq(rR0.resultado.alerts, ['A03'], 'R=0 → alerta A03 (TRAZABILIDAD_INSUFICIENTE), no A02');

var rC0 = A.resolverPuertaEvidencia(entrada({ C: 0 }));
eq(rC0.resultado.alerts, ['A02'], 'C=0 (no R) → alerta A02 (EVIDENCIA_CONTRADICTORIA_O_INSUFICIENTE)');

var rSigue = A.resolverPuertaEvidencia(entrada({ Q: 3, C: 3, T: 3, R: 1 }));
eq({ terminal: rSigue.terminal, fep: rSigue.fep, nivelMax: rSigue.nivelMax }, { terminal: false, fep: 1, nivelMax: 'S1' },
  'FEP=1, admisible → NO terminal, sigue con techo S1 (§35: "una dimensión crítica en nivel 1 limita la salida")');

var rPleno = A.resolverPuertaEvidencia(entrada());
eq({ terminal: rPleno.terminal, fep: rPleno.fep, nivelMax: rPleno.nivelMax }, { terminal: false, fep: 3, nivelMax: 'S3' },
  'FEP=3, admisible → sigue con techo S3');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. §7: FEP como PROMEDIO PURO en vez de min (un solo cambio: `min` → `sum/length`).');
console.log('     Q=C=T=3,R=1 → (3+3+3+1)/4 = 2.5 (correcto: 1). Q=C=T=3,R=0 → 2.25 (correcto: 0):');
console.log('     R=0 (trazabilidad nula) daría FEP>0. Downstream: nivelSalidaMax(2.25) lanza');
console.log('     ("FEP fuera de 0-3") — evidencia adicional, no un 2do defecto. La no-compensación se pierde.');
console.log('  2. §6: admisibilidad como mayoría (>=3 de 5) → 4 puertas true, 1 false pasa a admisible.');
console.log('  3. §6/§35: alerta de FEP=0 siempre A02 → el caso R=0 pierde el código A03 específico.');
console.log('  4. §8: nivelSalidaMax permite S3 con FEP=1 → verificarFuerzaSalida deja de lanzar.');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
