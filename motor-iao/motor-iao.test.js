/**
 * ============================================================================
 *  BATERÍA DE VERIFICACIÓN — Motor IAO
 * ============================================================================
 *
 *  Ejecutar:  node motor-iao/motor-iao.test.js
 *  Sin dependencias externas. NO importa motor-ice-ieh — usa valores sintéticos
 *  de las 10 variables. Sale con código 1 si algún assert falla.
 *
 *  Casos:
 *   1. Neutro (10 vars = 50) → IAO = 50, 5 brechas = 0.
 *   2. Perfil a mano: EST=90/FOR=30 → A_EF = 54.7 exacto (§3.7); caso inverso.
 *   3. Los 5 pares contra el documento (pesos internos correctos).
 *   4. Consistencia perfil↔IAO y fórmula expandida.
 *   5. NO NEGOCIABLE — la paradoja de monotonicidad de G_j⁺: reproducida con la
 *      fórmula descartada, y AUSENTE en la que se implementó.
 *   6. Brechas fuera del cálculo: por firma de función y por construcción.
 *   7. Agregación colectiva (§3.9): IAO_g simple, IAO_ORG ponderado por N_g.
 *   8. Estructura, pesos, validación.
 * ============================================================================
 */
'use strict';

var M = require('./motor-iao.js');

// ── Mini-harness ───────────────────────────────────────────────────────────
var _ok = 0, _fallos = 0, EPS = 1e-9;
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ ' + m); } }
function eq(a, b, m) {
  var pass = (typeof a === 'number' && typeof b === 'number') ? Math.abs(a - b) < EPS : a === b;
  if (!pass) console.log('      esperado ' + JSON.stringify(b) + ', obtenido ' + JSON.stringify(a));
  ok(pass, m);
}
function near(a, b, tol, m) {
  var pass = Math.abs(a - b) <= tol;
  if (!pass) console.log('      |' + a + ' − ' + b + '| = ' + Math.abs(a - b) + ' > ' + tol);
  ok(pass, m);
}
function seccion(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 62 - t.length))); }

// Helper: construir las 10 variables desde un objeto parcial (resto = 50).
function vars(o) {
  var base = {}; M.VARIABLES.forEach(function (k) { base[k] = 50; });
  Object.keys(o || {}).forEach(function (k) { base[k] = o[k]; });
  return base;
}
// Helper: todas las de Sistema en s, todas las de Experiencia en e.
function sysExp(s, e) {
  var o = {};
  M.VARIABLES_SISTEMA.forEach(function (k) { o[k] = s; });
  M.VARIABLES_EXPERIENCIA.forEach(function (k) { o[k] = e; });
  return o;
}

// ══════════════════════════════════════════════════════════════════════════
seccion('CASO 1 — Neutro: las 10 variables = 50');
// ══════════════════════════════════════════════════════════════════════════
(function () {
  var r = M.calcular(vars({}));
  eq(r.deficits.D_S, 0.5, 'D_S = 0.5');
  eq(r.deficits.D_E, 0.5, 'D_E = 0.5');
  eq(r.iao, 50, 'IAO = 50');
  eq(M.calcularIAO(vars({})), 50, 'calcularIAO() = 50');
  ['A_EF', 'A_IC', 'A_IE', 'A_NC', 'A_IA'].forEach(function (k) {
    eq(r.perfil[k], 50, 'perfil ' + k + ' = 50');
  });
  ['B_EF', 'B_IC', 'B_IE', 'B_NC', 'B_IA'].forEach(function (k) {
    eq(r.brechas[k], 0, 'brecha ' + k + ' = 0');
  });
})();

// ══════════════════════════════════════════════════════════════════════════
seccion('CASO 2 — Perfil a mano: EST=90, FOR=30  (ejemplo del §3.7)');
// ══════════════════════════════════════════════════════════════════════════
(function () {
  // D_EST = 1−.90 = .10 ; D_FOR = 1−.30 = .70
  // A_EF = 100·(.255·.10 + .745·.70) = 100·(.0255 + .5215) = 54.7
  var p = M.perfilPorPar(vars({ EST: 90, FOR: 30 }));
  // Pesos EXACTOS (12/47, 35/47), no los .255/.745 redondeados del §3.6.
  // A_EF = 100·[(12/47)·.10 + (35/47)·.70] = 2570/47 = 54.680851…
  near(p.A_EF, 2570 / 47, 1e-9, 'A_EF (EST=90, FOR=30) = 2570/47 ≈ 54.68  (pesos exactos, no 54.7)');
  ok(Math.abs(p.A_EF - 54.7) > 1e-4, 'A_EF ≠ 54.7 — el módulo NO usa los pesos redondeados del §3.6');

  // Caso inverso del §3.7: EST=30, FOR=90 → 100·[(12/47)·.70 + (35/47)·.10] = 1190/47
  var pInv = M.perfilPorPar(vars({ EST: 30, FOR: 90 }));
  near(pInv.A_EF, 1190 / 47, 1e-9, 'A_EF (EST=30, FOR=90) = 1190/47 ≈ 25.32  (§3.7, caso inverso)');

  ok(p.A_EF > pInv.A_EF, 'Sistema alto / Experiencia baja activa MÁS que lo contrario — asimetría del §3.5 (no de una función de la brecha)');
})();

// ══════════════════════════════════════════════════════════════════════════
seccion('CASO 3 — Los 5 pares del perfil contra el documento (§3.6)');
// ══════════════════════════════════════════════════════════════════════════
(function () {
  // Sistema = 20 (déficit .8) ; Experiencia = 80 (déficit .2), en los 5 pares.
  // Pesos internos EXACTOS: EF/IE → 12/47, 35/47 ; IC → 10/31, 21/31 ;
  //                         NC → .3, .7 (cierra exacto) ; IA → 5/12, 7/12.
  var p = M.perfilPorPar(sysExp(20, 80));
  near(p.A_EF, 100 * ((12 / 47) * 0.8 + (35 / 47) * 0.2), 1e-9, 'A_EF = 100·[(12/47)·.8 + (35/47)·.2]');
  near(p.A_IC, 100 * ((10 / 31) * 0.8 + (21 / 31) * 0.2), 1e-9, 'A_IC = 100·[(10/31)·.8 + (21/31)·.2]');
  near(p.A_IE, 100 * ((12 / 47) * 0.8 + (35 / 47) * 0.2), 1e-9, 'A_IE = 100·[(12/47)·.8 + (35/47)·.2]');
  near(p.A_NC, 100 * (0.300 * 0.8 + 0.700 * 0.2), 1e-9, 'A_NC = 100·(.300·.8 + .700·.2) = 38.0');
  near(p.A_IA, 100 * ((5 / 12) * 0.8 + (7 / 12) * 0.2), 1e-9, 'A_IA = 100·[(5/12)·.8 + (7/12)·.2]');

  // Mapeo de par → variables (§3.6 / §3.7)
  var mapa = M.PARES.map(function (x) { return x.clave + ':' + x.sistema + '↔' + x.experiencia; }).join(' ');
  eq(mapa, 'EF:EST↔FOR IC:INE↔COH IE:IMP↔EQU NC:NEX↔CNF IA:ITG↔ACT', 'pares correctamente mapeados a sus variables');
})();

// ══════════════════════════════════════════════════════════════════════════
seccion('CASO 4 — Consistencia perfil↔IAO y fórmula expandida (§3.5, §3.6)');
// ══════════════════════════════════════════════════════════════════════════
(function () {
  var v = vars({ EST: 70, INE: 40, IMP: 55, NEX: 80, ITG: 30, FOR: 45, COH: 60, EQU: 35, CNF: 50, ACT: 65 });
  var directo = M.calcularIAO(v);

  // 1) Fórmula expandida del §3.5 — coeficientes .060 / .175 / .126 / .140 / .084.
  //    Son exactos (=.30/5, =.70·peso), así que debe coincidir EXACTAMENTE.
  var D = M.calcular(v).deficits.porVariable;
  var expandida = 100 * (
    0.060 * (D.EST + D.INE + D.IMP + D.NEX + D.ITG) +
    0.175 * D.FOR + 0.126 * D.COH + 0.175 * D.EQU + 0.140 * D.CNF + 0.084 * D.ACT);
  eq(directo, expandida, 'IAO directo = fórmula expandida del §3.5 (exacto)');

  // 2) Reensamblado desde el perfil. Los pesos internos del par se derivan
  //    EXACTOS de los coeficientes globales, así que la coincidencia es al
  //    margen de punto flotante — NO un margen de diseño.
  var p = M.perfilPorPar(v);
  var wPar = {}; M.PARES.forEach(function (x) { wPar[x.clave] = x.pesoPar; });
  var desdePerfil = wPar.EF * p.A_EF + wPar.IC * p.A_IC + wPar.IE * p.A_IE + wPar.NC * p.A_NC + wPar.IA * p.A_IA;
  near(desdePerfil, directo, 1e-9, 'IAO reensamblado desde los 5 perfiles = IAO directo (coincidencia exacta, Δ < 1e-9)');

  // 3) calcular().iao usa la misma vía que calcularIAO().
  eq(M.calcular(v).iao, directo, 'calcular().iao = calcularIAO()');
})();

// ══════════════════════════════════════════════════════════════════════════
seccion('CASO 5 — [NO NEGOCIABLE] Paradoja de monotonicidad de G_j⁺ (§3.7)');
// ══════════════════════════════════════════════════════════════════════════
(function () {
  // Fórmula DESCARTADA (§3.7): H = 1−E ; G⁺ = max(S−E, 0) ; A = H + G⁺·E
  // (S, E = valores normalizados 0–1, mayor = mejor; A = activación, mayor = peor)
  function Gj_descartada(S, E) { return (1 - E) + Math.max(S - E, 0) * E; }

  var aDesc70 = Gj_descartada(0.70, 0.40);
  var aDesc90 = Gj_descartada(0.90, 0.40);
  eq(aDesc70, 0.72, 'G_j⁺ descartada: A(S=.70, E=.40) = 0.72');
  eq(aDesc90, 0.80, 'G_j⁺ descartada: A(S=.90, E=.40) = 0.80');
  ok(aDesc90 > aDesc70, 'G_j⁺ descartada TIENE la paradoja: mejorar el Sistema SUBE la activación (.72 → .80)');

  // Fórmula IMPLEMENTADA — mismo escenario (Experiencia const 40, Sistema 70→90).
  var iao70 = M.calcularIAO(sysExp(70, 40));
  var iao90 = M.calcularIAO(sysExp(90, 40));
  eq(iao70, 51, 'IAO implementado: Sistema=70, Exp=40 → 51');
  eq(iao90, 45, 'IAO implementado: Sistema=90, Exp=40 → 45');
  ok(iao90 < iao70, 'IAO implementado NO tiene la paradoja: mejorar el Sistema BAJA (o iguala) la activación (51 → 45)');

  // Mismo control sobre el perfil por par (pesos exactos 12/47, 35/47).
  var aef70 = M.perfilPorPar(vars({ EST: 70, FOR: 40 })).A_EF;   // 100·[(12/47)·.30 + (35/47)·.60] = 2460/47
  var aef90 = M.perfilPorPar(vars({ EST: 90, FOR: 40 })).A_EF;   // 100·[(12/47)·.10 + (35/47)·.60] = 2220/47
  near(aef70, 2460 / 47, 1e-9, 'A_EF: EST=70, FOR=40 → 2460/47 ≈ 52.34');
  near(aef90, 2220 / 47, 1e-9, 'A_EF: EST=90, FOR=40 → 2220/47 ≈ 47.23');
  ok(aef90 < aef70, 'perfil A_EF tampoco tiene la paradoja');

  // Barrido: Experiencia const 40, Sistema de 50 a 100 — IAO monótonamente NO creciente.
  var prev = Infinity, monotona = true, s;
  for (s = 50; s <= 100; s += 5) {
    var cur = M.calcularIAO(sysExp(s, 40));
    if (cur > prev + 1e-9) monotona = false;
    prev = cur;
  }
  ok(monotona, 'barrido Sistema 50→100 (Exp=40): IAO nunca aumenta al mejorar el Sistema');

  // Y la inversa: empeorar el Sistema nunca BAJA el IAO.
  var subeAlEmpeorar = true;
  for (s = 100; s >= 50; s -= 5) {
    var a = M.calcularIAO(sysExp(s, 40));
    var b = M.calcularIAO(sysExp(s - 5 >= 50 ? s - 5 : s, 40));
    if (b < a - 1e-9) subeAlEmpeorar = false;
  }
  ok(subeAlEmpeorar, 'barrido inverso: empeorar el Sistema nunca reduce el IAO (sin la anomalía inversa del §3.7)');
})();

// ══════════════════════════════════════════════════════════════════════════
seccion('CASO 6 — Brechas fuera del cálculo del IAO (§3.7)');
// ══════════════════════════════════════════════════════════════════════════
(function () {
  // Por FIRMA: calcularIAO tiene un solo parámetro formal — no puede recibir una brecha.
  eq(M.calcularIAO.length, 1, 'calcularIAO tiene aridad 1 (solo `variables`) — sin parámetro de brecha');

  // Un argumento extra (p. ej. brechas inyectadas) es ignorado por completo.
  var v = vars({ EST: 80, FOR: 20 });
  eq(M.calcularIAO(v), M.calcularIAO(v, { brechas: [999, 999, 999, 999, 999] }),
    'un 2º argumento con "brechas" no cambia el IAO (se ignora)');

  // Por CONSTRUCCIÓN: dos entradas con el MISMO D_S y D_E (→ mismo IAO) pero
  // brechas OPUESTAS. FOR y EQU pesan igual (.25), así que intercambiarlas
  // preserva D_E.
  var v1 = vars({ FOR: 20, EQU: 80 });   // B_EF = 50−20 = +30 ; B_IE = 50−80 = −30
  var v2 = vars({ FOR: 80, EQU: 20 });   // B_EF = 50−80 = −30 ; B_IE = 50−20 = +30
  eq(M.calcularIAO(v1), 50, 'IAO(v1) = 50');
  eq(M.calcularIAO(v2), 50, 'IAO(v2) = 50  → idéntico pese a brechas opuestas');
  eq(M.calcularBrechas(v1).B_EF, 30, 'brechas(v1).B_EF = +30');
  eq(M.calcularBrechas(v2).B_EF, -30, 'brechas(v2).B_EF = −30');
  ok(M.calcularBrechas(v1).B_EF !== M.calcularBrechas(v2).B_EF &&
     Math.abs(M.calcularIAO(v1) - M.calcularIAO(v2)) < 1e-9,
    'brechas opuestas, IAO idéntico ⇒ la brecha no alimenta el IAO por ninguna ruta');

  // calcular() expone la brecha aparte, sin que toque el iao.
  var r = M.calcular(v1);
  eq(r.iao, M.calcularIAO(v1), 'calcular().iao = calcularIAO() (sin intervención de brechas)');
  eq(r.brechas.B_EF, 30, 'calcular().brechas.B_EF = +30 (se expone como diagnóstico)');
})();

// ══════════════════════════════════════════════════════════════════════════
seccion('CASO 7 — Agregación colectiva (§3.9): IAO_g simple, IAO_ORG ponderado');
// ══════════════════════════════════════════════════════════════════════════
(function () {
  var nodo = M.agregarNodo([48, 50, 52], { minReportableN: 3 });
  eq(nodo.n, 3, 'nodo: n = 3');
  eq(nodo.iaoNodo, 50, 'IAO_g = promedio simple de los IAO individuales = 50');
  eq(nodo.reportable, true, 'nodo reportable (n ≥ 3)');

  var chico = M.agregarNodo([50, 50], { minReportableN: 8 });
  eq(chico.reportable, false, 'nodo n=2 < 8 → no reportable');
  eq(chico.iaosParaAgregar.length, 2, 'nodo chico expone sus 2 IAO para el nivel superior');

  // agregarOrganizacion recibe DATOS POR PERSONA (las 10 variables de cada una).
  // Persona con las 10 variables = x  ⇒  IAO = 100 − x  (D_S = D_E = 1 − x/100).
  function persona(x) { var o = {}; M.VARIABLES.forEach(function (k) { o[k] = x; }); return o; }
  // A: 10 personas con vars=60 → IAO_g = 40.  B: 4 con vars=30 → 70 (sub-umbral).  C: 20 con vars=45 → 55.
  var nodos = [
    { id: 'A', personas: Array(10).fill(0).map(function () { return persona(60); }) },
    { id: 'B', personas: Array(4).fill(0).map(function () { return persona(30); }) },
    { id: 'C', personas: Array(20).fill(0).map(function () { return persona(45); }) }
  ];
  var org = M.agregarOrganizacion(nodos, { minReportableN: 8 });

  eq(org.organizacion.n, 34, 'pool organizacional = 34 (incluye los 4 de B)');
  near(org.organizacion.iaoOrg, (10 * 40 + 4 * 70 + 20 * 55) / 34, 1e-9, 'IAO_ORG = Σ(n_g·IAO_g)/Σn_g = 1780/34 ≈ 52.35');

  // Cuatro cálculos distintos; solo uno coincide con IAO_ORG.
  ok(Math.abs(org.organizacion.iaoOrg - (40 + 70 + 55) / 3) > 1, 'IAO_ORG ≠ promedio simple de las medias de nodo (55)');
  ok(Math.abs(org.organizacion.iaoOrg - (40 + 55) / 2) > 1, 'IAO_ORG ≠ promedio de las medias de nodos reportables (47.5)');
  near(org.organizacion.iaoOrg, 1780 / 34, 1e-9, 'IAO_ORG = promedio del pool de 34 individuos (idéntico a la ponderación por n_g)');

  var pB = org.perfilPorNodo.find(function (x) { return x.id === 'B'; });
  eq(pB.reportable, false, 'perfilPorNodo[B]: reportable = false');
  eq(pB.iaoNodo, undefined, 'perfilPorNodo[B]: SIN iaoNodo (§3.11 — nodo sub-umbral no expone estadísticas)');
  eq(pB.perfil, undefined, 'perfilPorNodo[B]: SIN perfil');
  eq(pB.nAportadoAlPool, 4, 'perfilPorNodo[B]: aportó 4 al pool');

  ok(org.organizacion.pool === undefined && org.organizacion.poolIao === undefined,
    'organizacion: no expone el pool (individuos nunca reportados, §3.8/§3.11)');

  var sinB = M.agregarOrganizacion(nodos, { minReportableN: 8, excluirNodos: ['B'] });
  eq(sinB.organizacion.n, 30, 'excluirNodos:["B"] → pool = 30');
  near(sinB.organizacion.iaoOrg, (10 * 40 + 20 * 55) / 30, 1e-9, 'excluir B → IAO_ORG = 1500/30 = 50');
  eq(sinB.nodosExcluidos.join(','), 'B', 'nodosExcluidos = [B]');
  ok(!sinB.perfilPorNodo.some(function (x) { return x.id === 'B'; }), 'B ya no aparece en perfilPorNodo');

  try { M.agregarNodo([1, 2], {}); ok(false, 'agregarNodo sin minReportableN → error (no lanzó)'); }
  catch (e) { ok(e.message.indexOf('minReportableN') !== -1, 'agregarNodo sin minReportableN → error'); }
})();

// ══════════════════════════════════════════════════════════════════════════
seccion('CASO 8 — Estructura, pesos y validación');
// ══════════════════════════════════════════════════════════════════════════
(function () {
  eq(M.VARIABLES.join(','), 'EST,INE,IMP,NEX,ITG,FOR,COH,EQU,CNF,ACT', 'orden canónico de las 10 variables (Sistema, luego Experiencia)');
  eq(M.VARIABLES_SISTEMA.join(','), 'EST,INE,IMP,NEX,ITG', 'lado Sistema');
  eq(M.VARIABLES_EXPERIENCIA.join(','), 'FOR,COH,EQU,CNF,ACT', 'lado Experiencia');

  // Contrato compartido con ICE–IEH (no es colisión); sin choque con SDMO.
  var sdmo = ['ACU', 'COM', 'INV', 'PEN'];
  ok(M.VARIABLES.every(function (k) { return sdmo.indexOf(k) === -1; }), 'ninguna variable del IAO choca con los códigos del SDMO (ACU/COM/INV/PEN)');

  // Pesos §3.5
  eq(M.PESOS.sistema + M.PESOS.experiencia, 1, 'PESOS: .30 + .70 = 1');
  var e = M.PESOS.expVar;
  eq(e.FOR + e.COH + e.EQU + e.CNF + e.ACT, 1, 'PESOS.expVar suma 1 (.25+.18+.25+.20+.12)');

  // Pesos §3.6 — DERIVADOS de los coeficientes globales, exactos (no los .255/.745 del documento).
  var sumaPar = M.PARES.reduce(function (s, p) { return s + p.pesoPar; }, 0);
  near(sumaPar, 1, 1e-9, 'suma de pesos por par (.235+.186+.235+.200+.144) = 1');
  M.PARES.forEach(function (p) {
    near(p.wSistema + p.wExperiencia, 1, 1e-12, 'par ' + p.clave + ': pesos internos suman 1');
    // pesoPar = coef global sistémico (.06) + coef global experiencial (.70·peso) — EXACTO.
    near(p.pesoPar, 0.06 + 0.70 * e[p.experiencia], 1e-12, 'par ' + p.clave + ': pesoPar = coef. global Sistema + Experiencia (exacto)');
    // wSistema = coefSistema / pesoPar — EXACTO.
    near(p.wSistema, 0.06 / p.pesoPar, 1e-12, 'par ' + p.clave + ': wSistema = coefSistema / pesoPar (exacto)');
  });
  // El módulo NO usa los literales redondeados del §3.6.
  var ef = M.PARES.find(function (p) { return p.clave === 'EF'; });
  near(ef.wSistema, 12 / 47, 1e-12, 'peso interno EF = 12/47 exacto');
  ok(Math.abs(ef.wSistema - 0.255) > 1e-6, 'peso interno EF ≠ 0.255 (el literal redondeado del §3.6)');
  var ia = M.PARES.find(function (p) { return p.clave === 'IA'; });
  near(ia.wSistema, 5 / 12, 1e-12, 'peso interno IA = 5/12 exacto');
  ok(Math.abs(ia.wSistema - 0.417) > 1e-6, 'peso interno IA ≠ 0.417 (el literal redondeado del §3.6)');

  // Déficit
  eq(M.deficit(0), 1, 'deficit(0) = 1');
  eq(M.deficit(100), 0, 'deficit(100) = 0');
  eq(M.deficit(50), 0.5, 'deficit(50) = 0.5');
  near(M.deficit(200 / 3), 1 / 3, 1e-12, 'deficit(66.666…) = 1/3 (acepta variables no enteras de ICE–IEH)');

  // Validación
  function lanza(fn, frag, m) {
    try { fn(); ok(false, m + ' (no lanzó)'); }
    catch (err) { ok(String(err.message).indexOf(frag) !== -1, m + '  [' + err.message.slice(0, 66) + '…]'); }
  }
  lanza(function () { var o = vars({}); delete o.CNF; M.calcularIAO(o); }, 'faltantes', 'falta una variable → error');
  lanza(function () { M.calcularIAO(vars({ EST: -1 })); }, 'fuera de rango', 'variable = −1 → error');
  lanza(function () { M.calcularIAO(vars({ EST: 101 })); }, 'fuera de rango', 'variable = 101 → error');
  lanza(function () { M.calcularIAO(vars({ EST: 'x' })); }, 'fuera de rango', 'variable no numérica → error');
  lanza(function () { M.calcularIAO([1, 2, 3, 4, 5, 6, 7, 8, 9]); }, '10 variables', 'array de 9 → error');
  lanza(function () { M.calcularIAO(null); }, 'objeto', 'null → error');

  // array y objeto equivalentes
  var arr = [70, 40, 55, 80, 30, 45, 60, 35, 50, 65];
  var obj = { EST: 70, INE: 40, IMP: 55, NEX: 80, ITG: 30, FOR: 45, COH: 60, EQU: 35, CNF: 50, ACT: 65 };
  eq(M.calcularIAO(arr), M.calcularIAO(obj), 'array (orden canónico) y objeto dan el mismo IAO');

  // rango de salida
  eq(M.calcularIAO(sysExp(100, 100)), 0, 'IAO = 0 cuando todas las variables = 100 (sin déficit)');
  eq(M.calcularIAO(sysExp(0, 0)), 100, 'IAO = 100 cuando todas las variables = 0 (déficit máximo)');
})();

// ══════════════════════════════════════════════════════════════════════════
seccion('CASO 9 — Perfil y brechas a nivel organización (§3.9)');
// ══════════════════════════════════════════════════════════════════════════
(function () {
  function persona(o) { var b = {}; M.VARIABLES.forEach(function (k) { b[k] = 50; }); Object.keys(o).forEach(function (k) { b[k] = o[k]; }); return b; }

  // Dos nodos con brechas OPUESTAS en el par EF, homogéneos por dentro:
  //   P: 10 personas EST=90, FOR=10  → B_EF = +80 ;  Q: 10 personas EST=10, FOR=90 → B_EF = −80
  var P = Array(10).fill(0).map(function () { return persona({ EST: 90, FOR: 10 }); });
  var Q = Array(10).fill(0).map(function () { return persona({ EST: 10, FOR: 90 }); });
  var nodos = [{ id: 'P', personas: P }, { id: 'Q', personas: Q }];

  var org = M.agregarOrganizacion(nodos, { minReportableN: 8 });
  near(org.organizacion.iaoOrg, 50, 1e-9, 'IAO_ORG = 50  (el nivel aparenta neutralidad)');

  // Perfil organizacional: media + DOS dispersiones, por par.
  var aEF = org.organizacion.perfilOrg.A_EF;
  ok(aEF.dispersionPool > 5 && aEF.dispersionEntreNodos > 5,
    'perfilOrg.A_EF: dispersionPool ' + aEF.dispersionPool.toFixed(1) + ' y dispersionEntreNodos ' + aEF.dispersionEntreNodos.toFixed(1) + ' — los dos nodos no coinciden');

  // Brechas: DOS dispersiones + DOS rangos, NO un promedio único.
  var bEF = org.organizacion.brechasOrg.B_EF;
  near(bEF.mediaPool, 0, 1e-9, 'brechasOrg.B_EF: mediaPool ≈ 0  → un promedio SOLO diría "alineado"');
  near(bEF.dispersionEntreNodos, 80, 1e-9, 'brechasOrg.B_EF: dispersionEntreNodos (cruda) = 80');
  near(bEF.dispersionEntreNodosAjustada, 80, 1e-9, 'brechasOrg.B_EF: dispersionEntreNodosAjustada = 80  (nodos homogéneos ⇒ sin piso de ruido que restar)');
  near(bEF.dispersionPool, 80, 1e-9, 'brechasOrg.B_EF: dispersionPool = 80');
  eq(bEF.rangoEntreNodos.join(','), '-80,80', 'brechasOrg.B_EF: rangoEntreNodos [−80, +80]');
  eq(bEF.rangoPool.join(','), '-80,80', 'brechasOrg.B_EF: rangoPool [−80, +80]');
  eq(bEF.porNodo.map(function (x) { return x.id + '=' + x.valor; }).join(','), 'P=80,Q=-80', 'brechasOrg.B_EF: valor por nodo visible');
  eq(bEF.polarizacion.entreNodos, null, 'polarizacion.entreNodos = null sin su umbral (dispersión cruda igual se reporta)');
  eq(bEF.polarizacion.pool, null, 'polarizacion.pool = null sin su umbral');

  // Con AMBOS umbrales fijados (valores de PRUEBA, escalas distintas).
  var orgU = M.agregarOrganizacion(nodos, {
    minReportableN: 8, umbralPolarizacionEntreNodos: 20, umbralPolarizacionPool: 25
  });
  eq(orgU.organizacion.brechasOrg.B_EF.polarizacion.entreNodos, true, 'B_EF.polarizacion.entreNodos = true (80 > 20)');
  eq(orgU.organizacion.brechasOrg.B_EF.polarizacion.pool, true, 'B_EF.polarizacion.pool = true (80 > 25)');
  eq(orgU.organizacion.brechasOrg.B_IC.polarizacion.entreNodos, false, 'B_IC.polarizacion.entreNodos = false (par no polarizado)');
  eq(orgU.organizacion.brechasOrg.B_IC.polarizacion.pool, false, 'B_IC.polarizacion.pool = false');

  eq(M.PENDIENTE_VALIDACION.umbralPolarizacionEntreNodos, null, 'umbralPolarizacionEntreNodos: PENDIENTE_VALIDACION');
  eq(M.PENDIENTE_VALIDACION.umbralPolarizacionPool, null, 'umbralPolarizacionPool: PENDIENTE_VALIDACION');

  var pP = org.perfilPorNodo.find(function (x) { return x.id === 'P'; });
  ok(pP.reportable && pP.perfil.A_EF !== undefined && pP.brechas.B_EF === 80,
    'perfilPorNodo[P]: nodo reportable expone sus 5 A_j y 5 B_j');

  // Ajuste por sesgo de muestra finita (HALLAZGOS H1/H2): 3 nodos SIN polarización
  // real (misma media) pero con ruido interno alto → la cruda infla, la ajustada ≈ 0.
  var ruido = [];
  for (var g = 0; g < 3; g++) {
    var ppl = [];
    for (var i = 0; i < 12; i++) {
      var b = (Math.sin(g * 7 + i * 3) * 40);          // ruido determinista, media ≈ 0 por nodo
      ppl.push(persona({ EST: 50 + b / 2, FOR: 50 - b / 2 }));
    }
    ruido.push({ id: 'r' + g, personas: ppl });
  }
  var rBEF = M.agregarOrganizacion(ruido, { minReportableN: 8 }).organizacion.brechasOrg.B_EF;
  ok(rBEF.dispersionEntreNodos > rBEF.dispersionEntreNodosAjustada,
    'sin polarización real + ruido interno: cruda (' + rBEF.dispersionEntreNodos.toFixed(2) +
    ') > ajustada (' + rBEF.dispersionEntreNodosAjustada.toFixed(2) + ') — el ajuste resta el piso de ruido');
  ok(rBEF.dispersionEntreNodosAjustada < rBEF.dispersionEntreNodos * 0.6,
    'la ajustada cae bien por debajo de la cruda (el piso de ruido era la mayor parte)');
})();

// ══════════════════════════════════════════════════════════════════════════
seccion('CASO 10 — Clasificación de PRECISIÓN (§3.9, regla de compuerta)');
// ══════════════════════════════════════════════════════════════════════════
(function () {
  // Umbrales DE PRUEBA (los reales son PENDIENTE_VALIDACION §6.2). El §3.9 prevé
  // dispersión baja/media/alta → DOS cortes (media 12, alta 25).
  var U = {
    precisionNMinCatastrofico: 5, precisionNAlto: 30,
    precisionTasaMinCatastrofica: 0.3, precisionTasaAlta: 0.7,
    precisionCorteDispersionMedia: 12, precisionCorteDispersionAlta: 25
  };
  function P(datos) { return M.clasificarPrecision(datos, U); }

  // Todo bueno (dispersión "baja") → ALTA
  eq(P({ n: 40, convocados: 50, disenoMuestral: 'CENSO', dispersionPoolIao: 10 }).nivel, 'ALTA',
    'N=40, tasa=.8, CENSO, disp=10 (baja) → ALTA');

  // Cada catastrófico, con los otros 3 buenos → BAJA (regla de compuerta, no mayoría)
  eq(P({ n: 4, convocados: 50, disenoMuestral: 'CENSO', dispersionPoolIao: 10 }).nivel, 'BAJA', 'N=4 (< 5) → BAJA aunque el resto sea bueno');
  eq(P({ n: 40, convocados: 200, disenoMuestral: 'CENSO', dispersionPoolIao: 10 }).nivel, 'BAJA', 'tasa=.2 (< .3) → BAJA aunque el resto sea bueno');
  eq(P({ n: 40, convocados: 50, disenoMuestral: 'CONVENIENCIA', dispersionPoolIao: 10 }).nivel, 'BAJA', 'diseño = CONVENIENCIA → BAJA');
  eq(P({ n: 40, convocados: 50, disenoMuestral: 'UNKNOWN', dispersionPoolIao: 10 }).nivel, 'BAJA', 'diseño = UNKNOWN → BAJA (no se asume lo favorable)');
  eq(P({ n: 40, convocados: 50 }).nivel, 'BAJA', 'diseño ausente → tratado como UNKNOWN → BAJA');
  eq(P({ n: 40, convocados: 50, disenoMuestral: 'CENSO', dispersionPoolIao: 30 }).nivel, 'BAJA', 'dispersionPoolIao=30 (≥ 25, alta) → BAJA');

  // Corte "media" de dispersión (§3.9): 12 ≤ disp < 25 NO es catastrófico, pero impide ALTA.
  var m = P({ n: 40, convocados: 50, disenoMuestral: 'CENSO', dispersionPoolIao: 18 });
  eq(m.nivel, 'MEDIA', 'disp=18 (media): todo lo demás en ALTA, pero dispersión "media" → tope MEDIA (no ALTA, no BAJA)');
  eq(m.factores.nivelDispersion, 'media', 'factores.nivelDispersion = "media"');
  eq(m.factores.catastroficos.length, 0, 'dispersión "media" NO es catastrófica (no salta a BAJA)');
  eq(P({ n: 40, convocados: 50, disenoMuestral: 'CENSO', dispersionPoolIao: 12 }).nivel, 'MEDIA', 'disp=12 (justo en el corte media) → MEDIA');
  eq(P({ n: 40, convocados: 50, disenoMuestral: 'CENSO', dispersionPoolIao: 11.9 }).nivel, 'ALTA', 'disp=11.9 (< corte media) → ALTA — transición un paso');

  // 3 de 4 buenos NO compensan 1 catastrófico
  var r = P({ n: 40, convocados: 200, disenoMuestral: 'CENSO', dispersionPoolIao: 10 });
  eq(r.nivel, 'BAJA', '3 factores buenos + tasa catastrófica → BAJA (no ALTA por mayoría)');
  eq(r.factores.catastroficos.length, 1, 'se registra exactamente 1 factor catastrófico');

  // Zona MEDIA por N/tasa (sin catastróficos, sin alcanzar cortes de ALTA)
  eq(P({ n: 20, convocados: 40, disenoMuestral: 'ALEATORIO', dispersionPoolIao: 10 }).nivel, 'MEDIA',
    'N=20 (≥5, <30), tasa=.5 (≥.3, <.7), ALEATORIO, disp baja → MEDIA');

  // representatividad queda fuera de la compuerta
  eq(P({ n: 40, convocados: 50, disenoMuestral: 'CENSO', dispersionPoolIao: 10 }).representatividad, 'PENDIENTE_FORMALIZACION',
    'representatividad = PENDIENTE_FORMALIZACION (fuera de la compuerta, falta el concepto de dato)');

  // clasificarPrecision exige los 6 umbrales
  try { M.clasificarPrecision({ n: 10, convocados: 20, disenoMuestral: 'CENSO', dispersionPoolIao: 5 }, {}); ok(false, 'sin umbrales → error (no lanzó)'); }
  catch (e) { ok(e.message.indexOf('precision') !== -1, 'clasificarPrecision sin umbrales → error'); }
  try { M.clasificarPrecision({ n: 10, convocados: 20, disenoMuestral: 'CENSO', dispersionPoolIao: 5 }, Object.assign({}, U, { precisionCorteDispersionMedia: null })); ok(false, 'sin corte media → error (no lanzó)'); }
  catch (e) { ok(e.message.indexOf('precisionCorteDispersionMedia') !== -1, 'clasificarPrecision sin precisionCorteDispersionMedia → error'); }

  // Integrado en agregarOrganizacion cuando se pasan los umbrales.
  function persona(x) { var o = {}; M.VARIABLES.forEach(function (k) { o[k] = x; }); return o; }
  var nodos = [{ id: 'X', personas: Array(40).fill(0).map(function () { return persona(50); }), convocados: 50 }];
  var org = M.agregarOrganizacion(nodos, Object.assign({ minReportableN: 8, disenoMuestral: 'CENSO' }, U));
  eq(org.organizacion.precision.nivel, 'ALTA', 'agregarOrganizacion: precision.nivel = ALTA (N=40, tasa=.8, CENSO, disp=0)');
  var org2 = M.agregarOrganizacion(nodos, { minReportableN: 8 });
  eq(org2.organizacion.precision, null, 'agregarOrganizacion sin umbrales de precisión → precision = null');
})();

// ── Resumen ────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(70));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(70));
process.exit(_fallos ? 1 : 0);
