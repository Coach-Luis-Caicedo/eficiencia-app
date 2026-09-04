/**
 * motor-integracion/pipeline.test.js
 *
 * Arnés de integración real motor-ice-ieh -> motor-iao. Primera vez que los
 * dos módulos se conectan con la salida real de uno alimentando la entrada
 * real del otro (relación "con otros instrumentos"). Sin sintéticos en el
 * punto de conexión.
 *
 * node motor-integracion/pipeline.test.js
 */

'use strict';

var P = require('./pipeline');

var _ok = 0, _fallos = 0, EPS = 1e-9;
function seccion(nombre) { console.log('\n── ' + nombre + ' ' + '─'.repeat(Math.max(0, 66 - nombre.length))); }
function ok(cond, msg) {
  if (cond) { _ok++; console.log('  ✓ ' + msg); }
  else { _fallos++; console.log('  ✗ FALLA: ' + msg); }
}
function ordenarClaves(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  var out = {};
  Object.keys(obj).sort().forEach(function (k) { out[k] = obj[k]; });
  return out;
}
function eq(a, b, msg) {
  // Compara por contenido, no por orden de claves (los objetos JS no
  // garantizan orden estable entre sí aunque representen el mismo dato).
  var cond = JSON.stringify(ordenarClaves(a)) === JSON.stringify(ordenarClaves(b));
  ok(cond, msg + (cond ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']'));
}
function near(a, b, tol, msg) {
  var cond = typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < tol;
  ok(cond, msg + (cond ? '' : '  [recibido=' + a + ' esperado=' + b + ' |diff|=' + Math.abs(a - b) + ']'));
}
function lanza(fn, msg) {
  var lanzo = false, mensaje = '';
  try { fn(); } catch (e) { lanzo = true; mensaje = e.message; }
  ok(lanzo, msg + (lanzo ? '  [' + mensaje + ']' : ''));
}

function todos(x) { return new Array(31).fill(x); }
function respuestasInversos() { var a = todos(3); a[12] = 1; a[20] = 5; return a; } // P13=COH-3, P21=EQU-3
function respuestasImp4() { var a = todos(3); a[17] = 5; return a; } // P18=IMP-4

// ═══════════════════════════════════════════════════════════════════════
seccion('Hallazgo de frontera #1 — mapeo de claves (nombres NO coinciden)');
// ═══════════════════════════════════════════════════════════════════════

var claves10 = Object.keys(P.MAPA_VARIABLE_A_PREFIJO);
eq(claves10.length, 10, 'el mapa variable->prefijo cubre exactamente las 10 variables (ni IND-EF ni IND-IC)');
eq(P.MAPA_VARIABLE_A_PREFIJO.estructura, 'EST', 'estructura -> EST');
eq(P.MAPA_VARIABLE_A_PREFIJO.fortaleza, 'FOR', 'fortaleza -> FOR');
eq(P.MAPA_VARIABLE_A_PREFIJO.coherencia, 'COH', 'coherencia -> COH');
eq(P.MAPA_VARIABLE_A_PREFIJO.actitud, 'ACT', 'actitud -> ACT');
eq(Object.keys(P.MAPA_PAR_ICEIEH_A_IAO).length, 5, 'el mapa de pares cubre los 5 pares');
eq(P.MAPA_PAR_ICEIEH_A_IAO.estructura_fortaleza, 'EF', 'estructura_fortaleza -> EF');
eq(P.MAPA_PAR_ICEIEH_A_IAO.impacto_equilibrio, 'IE', 'impacto_equilibrio -> IE');

var mapeoInverso = P.mapearVariablesAIao({
  estructura: 1, intencion: 2, impacto: 3, nexo: 4, integracion: 5,
  fortaleza: 6, coherencia: 7, equilibrio: 8, confianza: 9, actitud: 10
});
eq(mapeoInverso, { EST: 1, INE: 2, IMP: 3, NEX: 4, ITG: 5, FOR: 6, COH: 7, EQU: 8, CNF: 9, ACT: 10 },
  'mapearVariablesAIao re-etiqueta valor por valor sin alterar los números');

// ═══════════════════════════════════════════════════════════════════════
seccion('Caso neutro — todas las respuestas = 3');
// ═══════════════════════════════════════════════════════════════════════

var rNeutro = P.ejecutarPipeline(todos(3));
Object.keys(rNeutro.iceIeh.variables).forEach(function (k) {
  near(rNeutro.iceIeh.variables[k], 50, EPS, 'variable "' + k + '" = 50 (neutro)');
});
near(rNeutro.iceIeh.ice, 50, EPS, 'ICE = 50');
near(rNeutro.iceIeh.ieh, 50, EPS, 'IEH = 50');
near(rNeutro.iao.iao, 50, EPS, 'IAO end-to-end = 50 (drift de punto flotante real medido: ' +
  Math.abs(rNeutro.iao.iao - 50).toExponential(2) + ', muy por debajo de la tolerancia 1e-9 que ya usan ' +
  'ambos módulos en sus propias baterías — no es un defecto, es aritmética IEEE-754 real, visible solo ' +
  'porque este arnés usa la salida real de ICE-IEH en vez de un literal "50" tecleado a mano)');
['A_EF', 'A_IC', 'A_IE', 'A_NC', 'A_IA'].forEach(function (k) {
  near(rNeutro.iao.perfil[k], 50, EPS, 'perfil.' + k + ' = 50 (neutro)');
});
Object.keys(rNeutro.iceIeh.brechas).forEach(function (k) {
  near(rNeutro.iceIeh.brechas[k], 0, EPS, 'brecha "' + k + '" = 0 (neutro)');
});

// ═══════════════════════════════════════════════════════════════════════
seccion('Caso ítems inversos (COH-3=1, EQU-3=5) — confirma recodificación end-to-end');
// ═══════════════════════════════════════════════════════════════════════

var rInv = P.ejecutarPipeline(respuestasInversos());
// Sin recodificación, coherencia sería avg(50,50,0)=33.33 y equilibrio avg(50,50,100)=66.67 — LO CONTRARIO.
near(rInv.iceIeh.variables.coherencia, 200 / 3, EPS,
  'coherencia = 66.67 (COH-3=1 recodificado a 5 -> normalizado 100; SIN recodificar habría dado 33.33)');
near(rInv.iceIeh.variables.equilibrio, 100 / 3, EPS,
  'equilibrio = 33.33 (EQU-3=5 recodificado a 1 -> normalizado 0; SIN recodificar habría dado 66.67)');
near(rInv.variablesParaIao.COH, 200 / 3, EPS, 'motor-iao recibe COH ya recodificado (66.67), no tiene que saber nada de inversión de ítems');
near(rInv.variablesParaIao.EQU, 100 / 3, EPS, 'motor-iao recibe EQU ya recodificado (33.33)');
near(rInv.iao.perfil.A_IC, 100 * ((10 / 31) * 0.5 + (21 / 31) * (1 / 3)), EPS,
  'A_IC del perfil IAO refleja la coherencia ya recodificada (fórmula exacta con D_INE=.5, D_COH=1/3)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Caso IMP-4 (P18=5, resto neutro) — confirma propagación del 4º ítem de Impacto');
// ═══════════════════════════════════════════════════════════════════════

var rImp4 = P.ejecutarPipeline(respuestasImp4());
// impacto = avg(50,50,50,100) = 62.5. Si IMP-4 NO entrara al promedio, impacto seguiría en 50.
near(rImp4.iceIeh.variables.impacto, 62.5, EPS, 'impacto = 62.5 (IMP-1..3=50, IMP-4=100 -> avg de 4 ítems, no de 3)');
near(rImp4.iceIeh.ice, 52.5, EPS, 'ICE sube a 52.5 (único cambio: impacto)');
near(rImp4.variablesParaIao.IMP, 62.5, EPS, 'motor-iao recibe IMP=62.5 (el 4º ítem ya está promediado adentro)');
near(rImp4.iao.perfil.A_IE, 100 * ((12 / 47) * deficit(62.5) + (35 / 47) * deficit(50)), EPS,
  'A_IE del perfil IAO refleja el D_IMP desplazado por IMP-4 (fórmula exacta de pesos)');
function deficit(x) { return 1 - x / 100; }

// ═══════════════════════════════════════════════════════════════════════
seccion('Casos extremos — todas las respuestas en 1, todas en 5');
// ═══════════════════════════════════════════════════════════════════════

var rTodos1 = P.ejecutarPipeline(todos(1));
near(rTodos1.iceIeh.variables.estructura, 0, EPS, 'todos_1: estructura = 0');
near(rTodos1.iceIeh.variables.coherencia, 100 / 3, EPS, 'todos_1: coherencia = 33.33 (COH-3 inversa sube el promedio)');
near(rTodos1.iceIeh.ice, 0, EPS, 'todos_1: ICE = 0 exacto');
Object.keys(rTodos1.iceIeh.variables).forEach(function (k) {
  var v = rTodos1.iceIeh.variables[k];
  ok(v >= 0 && v <= 100, 'todos_1: variable "' + k + '" = ' + v + ' está dentro de [0,100]');
});
ok(rTodos1.iao.iao >= 0 && rTodos1.iao.iao <= 100, 'todos_1: IAO end-to-end dentro de [0,100] (' + rTodos1.iao.iao + ')');

var rTodos5 = P.ejecutarPipeline(todos(5));
near(rTodos5.iceIeh.variables.estructura, 100, EPS, 'todos_5: estructura = 100');
near(rTodos5.iceIeh.variables.coherencia, 200 / 3, EPS, 'todos_5: coherencia = 66.67 (COH-3 inversa baja el promedio)');
near(rTodos5.iceIeh.ice, 100, EPS, 'todos_5: ICE = 100 exacto');
Object.keys(rTodos5.iceIeh.variables).forEach(function (k) {
  var v = rTodos5.iceIeh.variables[k];
  ok(v >= 0 && v <= 100, 'todos_5: variable "' + k + '" = ' + v + ' está dentro de [0,100]');
});
ok(rTodos5.iao.iao >= 0 && rTodos5.iao.iao <= 100, 'todos_5: IAO end-to-end dentro de [0,100] (' + rTodos5.iao.iao + ')');

// ═══════════════════════════════════════════════════════════════════════
seccion('Comparación de brechas — motor-ice-ieh §8.6 vs. recomputado en motor-iao');
// ═══════════════════════════════════════════════════════════════════════

var CASOS_BRECHAS = [
  ['neutro', todos(3)],
  ['inversos', respuestasInversos()],
  ['imp4', respuestasImp4()],
  ['todos_1', todos(1)],
  ['todos_5', todos(5)]
];

console.log('\n  Tabla comparativa (valor motor-ice-ieh §8.6  vs.  recomputado en motor-iao):\n');
CASOS_BRECHAS.forEach(function (caso) {
  var nombre = caso[0], respuestas = caso[1];
  var r = P.ejecutarPipeline(respuestas);
  var comp = P.compararBrechas(r);
  console.log('  ── caso "' + nombre + '" ──');
  comp.forEach(function (c) {
    console.log('    ' + c.par.padEnd(22) + ' iceIeh=' + String(c.iceIeh).padEnd(20) +
      ' iao(B_' + c.claveIao + ')=' + String(c.iao).padEnd(20) +
      ' diff=' + c.diferencia + '  coincideExacto=' + c.coincideExacto);
  });
  comp.forEach(function (c) {
    ok(c.coincideExacto, 'caso "' + nombre + '", par ' + c.par + ': brecha idéntica bit a bit ' +
      '(motor-ice-ieh=' + c.iceIeh + ' === motor-iao(B_' + c.claveIao + ')=' + c.iao + ')');
  });
});

// ═══════════════════════════════════════════════════════════════════════
seccion('Validación de frontera en motor-iao — ¿rechaza fuera de [0,100] / NaN / null?');
// ═══════════════════════════════════════════════════════════════════════

var baseValida = { EST: 50, INE: 50, IMP: 50, NEX: 50, ITG: 50, FOR: 50, COH: 50, EQU: 50, CNF: 50, ACT: 50 };

lanza(function () { P.MotorIAO.validarVariables(Object.assign({}, baseValida, { EST: 100.0001 })); },
  'motor-iao YA rechaza un valor justo fuera de 100 (100.0001) — validación existente, no una regla nueva que haya que agregar');
lanza(function () { P.MotorIAO.validarVariables(Object.assign({}, baseValida, { FOR: -0.0001 })); },
  'motor-iao YA rechaza un valor justo fuera de 0 (-0.0001)');
lanza(function () { P.MotorIAO.validarVariables(Object.assign({}, baseValida, { COH: NaN })); },
  'motor-iao YA rechaza NaN');
lanza(function () {
  var sinImp = Object.assign({}, baseValida); delete sinImp.IMP;
  P.MotorIAO.validarVariables(sinImp);
}, 'motor-iao YA rechaza una variable faltante');
lanza(function () { P.ejecutarPipeline(todos(3).concat([3])); },
  'el pipeline completo rechaza un array de 32 respuestas (motor-ice-ieh valida el conteo antes de llegar a motor-iao)');

// Confirmación empírica de que el PIPELINE REAL nunca puede generar un valor
// que dispare esta validación: cada ítem normalizado es 25×(entero 1-5 − 1)
// ∈ {0,25,50,75,100} exacto, y el promedio de valores dentro de [0,100] no
// puede salir de [0,100] ni ser NaN (cada variable tiene ≥2 ítems fijos por
// PREGUNTAS, nunca 0). Verificado, no solo argumentado: 20000 conjuntos de
// 31 respuestas aleatorias (enteros 1-5) a través del pipeline completo.
seccion('Confirmación empírica: el pipeline real NUNCA dispara la validación de rango');
var N_ALEATORIOS = 20000, fallosAleatorios = 0;
for (var i = 0; i < N_ALEATORIOS; i++) {
  var resp = [];
  for (var j = 0; j < 31; j++) resp.push(1 + Math.floor(Math.random() * 5));
  try { P.ejecutarPipeline(resp); } catch (e) { fallosAleatorios++; }
}
eq(fallosAleatorios, 0, N_ALEATORIOS + ' conjuntos de 31 respuestas aleatorias (enteros 1-5) por el pipeline completo -> 0 rechazos ' +
  '(la validación de motor-iao existe y funciona, pero ninguna respuesta real de ICE-IEH puede violarla estructuralmente)');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
