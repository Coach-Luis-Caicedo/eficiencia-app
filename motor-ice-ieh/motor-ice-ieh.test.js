/**
 * ============================================================================
 *  BATERÍA DE VERIFICACIÓN — Motor ICE–IEH v2
 * ============================================================================
 *
 *  Ejecutar:  node motor-ice-ieh/motor-ice-ieh.test.js
 *  Sin dependencias externas. Sale con código 1 si algún caso falla.
 *
 *  Cubre los cinco casos obligatorios del encargo:
 *    1. Todas las respuestas iguales (3)  → ICE = IEH = 50, todas las brechas 0.
 *    2. Ítems inversos (COH-3, EQU-3)     → recodificación ANTES de agregar.
 *    3. IMP-4 (P18)                       → Impacto = promedio de 4 ítems, no 3.
 *    4. IND-EF / IND-IC                   → nunca dentro de ningún promedio.
 *    5. Integridad estructural            → 31 preguntas, códigos sin colisión.
 *  + un caso mixto con aritmética verificada a mano.
 *  + validación de entradas inválidas.
 * ============================================================================
 */
'use strict';

var M = require('./motor-ice-ieh.js');

// ── Mini-harness ───────────────────────────────────────────────────────────
var _fallos = 0;
var _ok = 0;
var EPS = 1e-9;

function ok(cond, msg) {
  if (cond) { _ok++; console.log('  ✓ ' + msg); }
  else { _fallos++; console.log('  ✗ ' + msg); }
}
function eq(a, b, msg) {
  var pass = (typeof a === 'number' && typeof b === 'number')
    ? Math.abs(a - b) < EPS
    : a === b;
  if (!pass) console.log('      esperado ' + JSON.stringify(b) + ', obtenido ' + JSON.stringify(a));
  ok(pass, msg);
}
function seccion(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 66 - t.length))); }

// Helpers de construcción de respuestas.
function todas(v) { var a = []; for (var i = 0; i < 31; i++) a.push(v); return a; }
function conP(base, overrides) {
  var a = base.slice();
  Object.keys(overrides).forEach(function (k) {
    var n = parseInt(k.replace('P', ''), 10);
    a[n - 1] = overrides[k];
  });
  return a;
}

// ══════════════════════════════════════════════════════════════════════════
seccion('CASO 1 — Todas las respuestas = 3');
// ══════════════════════════════════════════════════════════════════════════
(function () {
  var r = M.calcular(todas(3));

  M.VARIABLES.forEach(function (v) {
    eq(r.variables[v], 50, 'variable ' + v + ' = 50');
  });
  eq(r.ice, 50, 'ICE = 50');
  eq(r.ieh, 50, 'IEH = 50');
  Object.keys(r.brechas).forEach(function (k) {
    eq(r.brechas[k], 0, 'brecha ' + k + ' = 0');
  });
  // Señales independientes en el punto neutro de su escala.
  eq(r.senales.correspondencia.valor, 0, 'Señal correspondencia (IND-EF, x=3) = 0');
  eq(r.senales.veracidad.valor, 50, 'Señal veracidad (IND-IC, x=3) = 50');
})();

// ══════════════════════════════════════════════════════════════════════════
seccion('CASO 2 — Ítems inversos COH-3 (P13) y EQU-3 (P21)');
// ══════════════════════════════════════════════════════════════════════════
(function () {
  // Coherencia: COH-1=4, COH-2=4, COH-3(cruda)=2.
  //   Correcto (recodificar ANTES): COH-3' = 6-2 = 4 → norm 25*(4-1) = 75.
  //                                 Coherencia = prom(75, 75, 75) = 75.
  //   Bug "sin recodificar":        prom(75, 75, 25) = 58.333…  ✗
  //   Bug "recodificar DESPUÉS de agregar": 100 - 58.333… = 41.666…  ✗
  // Equilibrio: EQU-1=2, EQU-2=2, EQU-3(cruda)=4.
  //   Correcto: EQU-3' = 6-4 = 2 → norm 25 → Equilibrio = prom(25, 25, 25) = 25.
  var r = M.calcular(conP(todas(3), {
    P11: 4, P12: 4, P13: 2,
    P19: 2, P20: 2, P21: 4
  }));

  eq(r.detalle.P13.recodificado, 4, 'P13 (COH-3) recodificado 2 → 4 (antes de normalizar)');
  eq(r.detalle.P13.normalizado, 75, 'P13 (COH-3) normalizado = 75');
  eq(r.variables.coherencia, 75, 'Coherencia = 75  (recodificación aplicada antes de agregar)');
  ok(Math.abs(r.variables.coherencia - 58.3333333) > 1, 'Coherencia ≠ 58.33 (no es el bug "sin recodificar")');
  ok(Math.abs(r.variables.coherencia - 41.6666666) > 1, 'Coherencia ≠ 41.67 (no es el bug "recodificar después de agregar")');

  eq(r.detalle.P21.recodificado, 2, 'P21 (EQU-3) recodificado 4 → 2');
  eq(r.detalle.P21.normalizado, 25, 'P21 (EQU-3) normalizado = 25');
  eq(r.variables.equilibrio, 25, 'Equilibrio = 25');

  // Los ítems NO inversos nunca llevan recodificación.
  eq(r.detalle.P11.recodificado, null, 'P11 (COH-1, normal) sin recodificación');
  eq(r.detalle.P1.recodificado, null, 'P1 (EST-1, normal) sin recodificación');

  // Simetría de la recodificación en el punto medio: cruda 3 → 3.
  var r3 = M.calcular(todas(3));
  eq(r3.detalle.P13.recodificado, 3, 'P13 cruda 3 → recodificado 3 (punto medio invariante)');
  eq(r3.detalle.P13.normalizado, 50, 'P13 cruda 3 → normalizado 50');
})();

// ══════════════════════════════════════════════════════════════════════════
seccion('CASO 3 — IMP-4 (P18) entra al promedio de Impacto (4 ítems, no 3)');
// ══════════════════════════════════════════════════════════════════════════
(function () {
  // A: IMP-1=IMP-2=IMP-3=4 (norm 75), IMP-4=4 (norm 75) → Impacto = 75.
  var A = M.calcular(conP(todas(3), { P15: 4, P16: 4, P17: 4, P18: 4 }));
  // B: igual pero IMP-4=1 (norm 0) → Impacto = (75+75+75+0)/4 = 56.25.
  var B = M.calcular(conP(todas(3), { P15: 4, P16: 4, P17: 4, P18: 1 }));

  eq(A.meta.itemsPorVariable.impacto.length, 4, 'Impacto se compone de 4 ítems');
  eq(A.meta.itemsPorVariable.impacto.join(','), 'IMP-1,IMP-2,IMP-3,IMP-4', 'Los 4 ítems son IMP-1..IMP-4');
  eq(A.detalle.P18.entraPromedio, true, 'P18 (IMP-4) entraPromedio = true');
  eq(A.detalle.P18.tipo, 'ampliacion', 'P18 (IMP-4) tipo = ampliacion');
  eq(A.detalle.P18.normalizado, 75, 'P18=4 normaliza como ítem normal → 75');

  eq(A.variables.impacto, 75, 'Caso A (P18=4): Impacto = 75');
  eq(B.variables.impacto, 56.25, 'Caso B (P18=1): Impacto = 56.25');
  ok(A.variables.impacto !== B.variables.impacto, 'Impacto cambia según el valor de P18');

  // Prueba de contraste: si IMP-4 se EXCLUYERA, A y B darían ambos 75.
  var impSin4_A = (A.detalle.P15.normalizado + A.detalle.P16.normalizado + A.detalle.P17.normalizado) / 3;
  var impSin4_B = (B.detalle.P15.normalizado + B.detalle.P16.normalizado + B.detalle.P17.normalizado) / 3;
  eq(impSin4_A, 75, '(control) Impacto sin IMP-4 en A sería 75');
  eq(impSin4_B, 75, '(control) Impacto sin IMP-4 en B sería 75 — el motor NO da esto');
  ok(B.variables.impacto !== impSin4_B, 'El motor incluye IMP-4 (no reproduce el promedio de 3 ítems)');

  // Las demás variables ICE conservan 3 ítems.
  ['estructura', 'intencion', 'nexo'].forEach(function (v) {
    eq(A.meta.itemsPorVariable[v].length, 3, v + ' conserva 3 ítems');
  });
})();

// ══════════════════════════════════════════════════════════════════════════
seccion('CASO 4 — IND-EF (P7) e IND-IC (P14) nunca entran a un promedio');
// ══════════════════════════════════════════════════════════════════════════
(function () {
  // Base todas 3; llevamos P7 e P14 a extremos opuestos y comprobamos que
  // Estructura/Fortaleza e Intención/Coherencia (y ICE, IEH) no se mueven.
  var ext1 = M.calcular(conP(todas(3), { P7: 5, P14: 1 }));
  var ext2 = M.calcular(conP(todas(3), { P7: 1, P14: 5 }));

  ['estructura', 'fortaleza', 'intencion', 'coherencia'].forEach(function (v) {
    eq(ext1.variables[v], 50, v + ' = 50 pese a P7=5 / P14=1');
    eq(ext2.variables[v], 50, v + ' = 50 pese a P7=1 / P14=5');
  });
  eq(ext1.ice, 50, 'ICE = 50 (IND-* no afectan)');
  eq(ext1.ieh, 50, 'IEH = 50 (IND-* no afectan)');
  eq(ext2.ice, 50, 'ICE = 50 (extremo opuesto)');
  eq(ext2.ieh, 50, 'IEH = 50 (extremo opuesto)');

  // Se reportan aparte, con su fórmula propia.
  eq(ext1.senales.correspondencia.valor, 1, 'IND-EF x=5 → d = +1');
  eq(ext1.senales.veracidad.valor, 0, 'IND-IC x=1 → s = 0');
  eq(ext2.senales.correspondencia.valor, -1, 'IND-EF x=1 → d = -1');
  eq(ext2.senales.veracidad.valor, 100, 'IND-IC x=5 → s = 100');

  // Marcas estructurales.
  eq(ext1.detalle.P7.entraPromedio, false, 'P7 (IND-EF) entraPromedio = false');
  eq(ext1.detalle.P14.entraPromedio, false, 'P14 (IND-IC) entraPromedio = false');
  eq(ext1.detalle.P7.plano, 'IND', 'P7 plano = IND (ni ICE ni IEH)');
  eq(ext1.detalle.P14.plano, 'IND', 'P14 plano = IND (ni ICE ni IEH)');

  // Ningún listado de ítems de variable contiene IND-EF / IND-IC.
  var todosLosItems = [];
  Object.keys(ext1.meta.itemsPorVariable).forEach(function (v) {
    todosLosItems = todosLosItems.concat(ext1.meta.itemsPorVariable[v]);
  });
  ok(todosLosItems.indexOf('IND-EF') === -1, 'IND-EF no aparece en itemsPorVariable de ninguna variable');
  ok(todosLosItems.indexOf('IND-IC') === -1, 'IND-IC no aparece en itemsPorVariable de ninguna variable');
  eq(todosLosItems.length, 29, 'Total de ítems que entran a promedios = 29 (31 − IND-EF − IND-IC)');
  eq(ext1.meta.itemsPorVariable.estructura.join(','), 'EST-1,EST-2,EST-3', 'Estructura = EST-1..3 (sin IND-EF)');
  eq(ext1.meta.itemsPorVariable.coherencia.join(','), 'COH-1,COH-2,COH-3', 'Coherencia = COH-1..3 (sin IND-IC)');
})();

// ══════════════════════════════════════════════════════════════════════════
seccion('CASO 5 — Integridad estructural de las 31 preguntas');
// ══════════════════════════════════════════════════════════════════════════
(function () {
  var P = M.PREGUNTAS;
  eq(P.length, 31, 'Hay 31 preguntas');

  // Numeración global P1..P31 contigua y sin huecos.
  var globales = P.map(function (p) { return p.g; });
  var esperado = [];
  for (var i = 1; i <= 31; i++) esperado.push('P' + i);
  eq(globales.join(' '), esperado.join(' '), 'Numeración global P1..P31 contigua y en orden');

  // Conteo por bloque: 7 / 7 / 7 / 6 / 4.
  var porBloque = [0, 0, 0, 0, 0];
  P.forEach(function (p) { porBloque[p.bloque - 1]++; });
  eq(porBloque.join(','), '7,7,7,6,4', 'Preguntas por bloque = 7,7,7,6,4 (total 31)');

  // Los 10 prefijos de sensor, exactamente y sin colisión.
  var prefijosVar = {};
  P.forEach(function (p) {
    if (p.prefijo !== 'IND') {
      prefijosVar[p.variable] = prefijosVar[p.variable] || p.prefijo;
      eq(p.prefijo, prefijosVar[p.variable], p.codigo + ' usa el prefijo de su variable (' + prefijosVar[p.variable] + ')');
    }
  });
  var setPrefijos = Object.keys(prefijosVar).map(function (v) { return prefijosVar[v]; }).sort();
  eq(setPrefijos.join(','), 'ACT,CNF,COH,EQU,EST,FOR,IMP,INE,ITG,NEX',
    'Los 10 prefijos son EST/FOR/INE/COH/IMP/EQU/NEX/CNF/ITG/ACT, sin colisión');

  // Códigos de sensor únicos.
  var codigos = P.map(function (p) { return p.codigo; });
  eq(new Set(codigos).size, 31, 'Los 31 códigos de sensor/ítem son únicos');

  // Clasificación por tipo (§8.2): 26 normal + 2 inversa + 1 ampliación
  // + 1 bipolar_ind + 1 sintesis_ind = 31.
  var porTipo = {};
  P.forEach(function (p) { porTipo[p.tipo] = (porTipo[p.tipo] || 0) + 1; });
  eq(porTipo.normal, 26, '26 ítems normales');
  eq(porTipo.inversa, 2, '2 ítems inversos (COH-3, EQU-3)');
  eq(porTipo.ampliacion, 1, '1 ítem de ampliación (IMP-4)');
  eq(porTipo.bipolar_ind, 1, '1 ítem bipolar independiente (IND-EF)');
  eq(porTipo.sintesis_ind, 1, '1 ítem de síntesis independiente (IND-IC)');

  // Reparto ICE / IEH de las variables (§8.6).
  eq(M.VARIABLES_ICE.join(','), 'estructura,intencion,impacto,nexo,integracion', 'Variables ICE');
  eq(M.VARIABLES_IEH.join(','), 'fortaleza,coherencia,equilibrio,confianza,actitud', 'Variables IEH');

  // Inversos e IMP-4 marcados como se espera.
  eq(P.filter(function (p) { return p.tipo === 'inversa'; }).map(function (p) { return p.codigo; }).join(','),
    'COH-3,EQU-3', 'Los inversos son exactamente COH-3 y EQU-3');
  eq(P.filter(function (p) { return !p.entraPromedio; }).map(function (p) { return p.codigo; }).join(','),
    'IND-EF,IND-IC', 'Las únicas excluidas de promedio son IND-EF e IND-IC');
})();

// ══════════════════════════════════════════════════════════════════════════
seccion('CASO 6 — Mixto, aritmética verificada a mano');
// ══════════════════════════════════════════════════════════════════════════
(function () {
  // Construcción (norm = 25×(x−1); inversos recodificados 6−x antes):
  //  Estructura  P1=5,P2=4,P3=3        → 100,75,50            → 75
  //  Fortaleza   P4=2,P5=2,P6=2        → 25,25,25             → 25
  //  Intención   P8=4,P9=4,P10=4       → 75,75,75             → 75
  //  Coherencia  P11=3,P12=3,P13=3(inv)→ 50,50,50 (6-3=3)     → 50
  //  Impacto     P15=5,P16=5,P17=5,P18=1 → 100,100,100,0      → 75
  //  Equilibrio  P19=4,P20=4,P21=2(inv)→ 75,75,75 (6-2=4)     → 75
  //  Nexo        P22=2,P23=2,P24=2     → 25,25,25             → 25
  //  Confianza   P25=4,P26=4,P27=4     → 75,75,75             → 75
  //  Integración P28=5,P29=3           → 100,50               → 75
  //  Actitud     P30=1,P31=1           → 0,0                  → 0
  //  IND-EF      P7=4  → d = (4−3)/2 = 0.5
  //  IND-IC      P14=2 → s = 25×(2−1) = 25
  //
  //  ICE = (75+75+75+25+75)/5 = 325/5 = 65
  //  IEH = (25+50+75+75+0)/5  = 225/5 = 45
  //  Brechas: EF 75−25=50 · IC 75−50=25 · IE 75−75=0 · NC 25−75=−50 · IA 75−0=75
  var r = M.calcular({
    P1: 5, P2: 4, P3: 3, P4: 2, P5: 2, P6: 2, P7: 4,
    P8: 4, P9: 4, P10: 4, P11: 3, P12: 3, P13: 3, P14: 2,
    P15: 5, P16: 5, P17: 5, P18: 1, P19: 4, P20: 4, P21: 2,
    P22: 2, P23: 2, P24: 2, P25: 4, P26: 4, P27: 4,
    P28: 5, P29: 3, P30: 1, P31: 1
  });

  eq(r.variables.estructura, 75, 'Estructura = 75');
  eq(r.variables.fortaleza, 25, 'Fortaleza = 25');
  eq(r.variables.intencion, 75, 'Intención = 75');
  eq(r.variables.coherencia, 50, 'Coherencia = 50');
  eq(r.variables.impacto, 75, 'Impacto = 75 (con IMP-4=1)');
  eq(r.variables.equilibrio, 75, 'Equilibrio = 75 (EQU-3 inv recodificado)');
  eq(r.variables.nexo, 25, 'Nexo = 25');
  eq(r.variables.confianza, 75, 'Confianza = 75');
  eq(r.variables.integracion, 75, 'Integración = 75 (2 ítems)');
  eq(r.variables.actitud, 0, 'Actitud = 0 (2 ítems)');

  eq(r.ice, 65, 'ICE = 65');
  eq(r.ieh, 45, 'IEH = 45');

  eq(r.brechas.estructura_fortaleza, 50, 'Brecha Estructura−Fortaleza = 50');
  eq(r.brechas.intencion_coherencia, 25, 'Brecha Intención−Coherencia = 25');
  eq(r.brechas.impacto_equilibrio, 0, 'Brecha Impacto−Equilibrio = 0');
  eq(r.brechas.nexo_confianza, -50, 'Brecha Nexo−Confianza = -50 (experiencia supera al sistema)');
  eq(r.brechas.integracion_actitud, 75, 'Brecha Integración−Actitud = 75');

  eq(r.senales.correspondencia.valor, 0.5, 'Señal correspondencia (IND-EF, x=4) = 0.5');
  eq(r.senales.veracidad.valor, 25, 'Señal veracidad (IND-IC, x=2) = 25');

  // Consistencia interna: ICE = promedio de sus 5 variables; brecha = resta directa.
  var iceManual = (r.variables.estructura + r.variables.intencion + r.variables.impacto +
    r.variables.nexo + r.variables.integracion) / 5;
  eq(r.ice, iceManual, 'ICE coincide con el promedio de sus 5 variables');
})();

// ══════════════════════════════════════════════════════════════════════════
seccion('CASO 7 — Validación de entradas inválidas');
// ══════════════════════════════════════════════════════════════════════════
(function () {
  function lanza(fn, frag, msg) {
    try { fn(); ok(false, msg + ' (no lanzó)'); }
    catch (e) { ok(String(e.message).indexOf(frag) !== -1, msg + '  [' + e.message + ']'); }
  }
  lanza(function () { M.calcular(null); }, 'array de 31', 'null → error');
  lanza(function () { M.calcular(todas(3).slice(0, 30)); }, '31 respuestas', 'array de 30 → error');
  lanza(function () { M.calcular(conP(todas(3), { P5: 0 })); }, 'fuera de rango', 'respuesta 0 → error');
  lanza(function () { M.calcular(conP(todas(3), { P5: 6 })); }, 'fuera de rango', 'respuesta 6 → error');
  lanza(function () { M.calcular(conP(todas(3), { P5: 3.5 })); }, 'fuera de rango', 'respuesta 3.5 (no entero) → error');
  var faltan = {}; for (var i = 1; i <= 30; i++) faltan['P' + i] = 3;
  lanza(function () { M.calcular(faltan); }, 'faltantes', 'objeto sin P31 → error "faltantes"');

  // Entradas equivalentes: array, objeto Pn, objeto n.
  var a = M.calcular(todas(3));
  var b = M.calcular((function () { var o = {}; for (var i = 1; i <= 31; i++) o['P' + i] = 3; return o; })());
  var c = M.calcular((function () { var o = {}; for (var i = 1; i <= 31; i++) o[i] = 3; return o; })());
  eq(a.ice, b.ice, 'Array y objeto {Pn} dan el mismo ICE');
  eq(a.ice, c.ice, 'Array y objeto {n} dan el mismo ICE');
})();

// ══════════════════════════════════════════════════════════════════════════
seccion('CASO 8 — Capa de presentación: redondeo solo en la salida final');
// ══════════════════════════════════════════════════════════════════════════
(function () {
  // redondear(): primitivo escalar, default 1 decimal.
  eq(M.redondear(58.3333333, 1), 58.3, 'redondear(58.333…, 1) = 58.3');
  eq(M.redondear(56.25, 1), 56.3, 'redondear(56.25, 1) = 56.3');
  eq(M.redondear(66.66666, 2), 66.67, 'redondear(66.666…, 2) = 66.67');
  eq(M.redondear(50, 1), 50, 'redondear(50) = 50');
  eq(M.redondear(-0.5, 1), -0.5, 'redondear(-0.5) = -0.5');
  eq(M.redondear(null), null, 'redondear(null) = null (no toca no-numéricos)');

  // calcular() conserva precisión completa; el redondeo NO ocurre dentro.
  var r = M.calcular(conP(todas(3), { P1: 4, P2: 4 })); // Estructura = (75+75+50)/3
  eq(r.variables.estructura, 200 / 3, 'calcular(): Estructura = 200/3 exacto (NO 66.7)');

  // formatearParaPresentacion(): copia redondeada, sin mutar el original.
  var f = M.formatearParaPresentacion(r);
  eq(f.variables.estructura, 66.7, 'formatear(): Estructura → 66.7 (1 decimal)');
  eq(r.variables.estructura, 200 / 3, 'el resultado original NO se mutó (sigue 200/3)');
  eq(M.formatearParaPresentacion(r, 2).variables.estructura, 66.67, 'formatear(r, 2): Estructura → 66.67');

  // ICE se calcula desde variables de precisión completa, no desde las redondeadas.
  var iceDesdeRaw = (r.variables.estructura + r.variables.intencion + r.variables.impacto +
    r.variables.nexo + r.variables.integracion) / 5;
  eq(r.ice, iceDesdeRaw, 'ICE proviene de las variables sin redondear (redondeo nunca en intermedios)');
  eq(f.ice, M.redondear(r.ice, 1), 'formatear(): ICE = redondear(ICE_completo, 1)');

  // Señales también se redondean en la vista.
  var rs = M.calcular(conP(todas(3), { P7: 4, P14: 2 }));
  eq(M.formatearParaPresentacion(rs).senales.correspondencia.valor, 0.5, 'formatear(): señal correspondencia → 0.5');
})();

// ── Resumen ────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(70));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(70));
process.exit(_fallos ? 1 : 0);
