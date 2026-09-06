/**
 * Validación estadística de motor-iao — dos preguntas.
 *   Q1: ¿`dispersionEntreNodos` distingue polarización real de ruido interno?
 *   Q2: ¿la regla de compuerta de PRECISIÓN produce una clasificación sensata?
 *
 * Ejecutar:  node motor-iao/sim/sim.js
 * Todos los números de HALLAZGOS_MOTOR_IAO.md salen de aquí.
 * Datos 100% sintéticos con parámetros conocidos. La simulación drivea
 * motor-iao.js DIRECTAMENTE (no una reimplementación).
 */
'use strict';

var M = require('../motor-iao.js');
var G = require('./generador.js');

var LINEA = '─'.repeat(72);
function h(t) { console.log('\n' + LINEA + '\n' + t + '\n' + LINEA); }
function row(cells, widths) {
  console.log(cells.map(function (c, i) { return String(c).padEnd(widths[i]); }).join(''));
}

// Umbrales DE PRUEBA (los reales son PENDIENTE_VALIDACION). Fijados por Luis
// salvo el corte de dispersión de IAO, marcado abajo.
var U_POL_ENTRE = 20;
var U_POL_POOL = 25;
var U_PRECISION = {
  precisionNMinCatastrofico: 5,        // Luis
  precisionNAlto: 30,                  // Luis
  precisionTasaMinCatastrofica: 0.3,   // Luis
  precisionTasaAlta: 0.7,              // Luis
  precisionCorteDispersionMedia: 12,   // <-- placeholder de simulación (IAO 0–100)
  precisionCorteDispersionAlta: 25     // <-- placeholder de simulación (IAO 0–100)
};

// Extrae la dispersión de B_EF de una organización generada.
function dispsBEF(nodos, opts) {
  var org = M.agregarOrganizacion(nodos, Object.assign({ minReportableN: 8 }, opts || {}));
  var b = org.organizacion.brechasOrg.B_EF;
  return {
    entre: b.dispersionEntreNodos, entreAj: b.dispersionEntreNodosAjustada,
    pool: b.dispersionPool, nReportables: b.porNodo.length
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  Q1 — dispersionEntreNodos vs ruido interno
// ════════════════════════════════════════════════════════════════════════════
function q1() {
  h('Q1  ¿`dispersionEntreNodos` aísla la polarización real del ruido interno?');
  console.log('Generador: nNodos nodos, personas por nodo fijas salvo indicación.');
  console.log('  magnitud_polarizacion_real = std de las MEDIAS de nodo (B_EF)');
  console.log('  magnitud_ruido_interno     = std de los individuos DENTRO de cada nodo');

  // ── Check 1: polReal = 0, ruido creciente, muchas repeticiones ────────────
  h('Q1.1  polReal = 0, ruido interno alto — repetido, no un solo ejemplo');
  row(['ruido', 'reps', 'entreNodos cruda', 'entreNodos AJUST.', 'pool'], [8, 7, 20, 20, 10]);
  [5, 15, 30].forEach(function (ruido) {
    var entre = [], entreAj = [], pool = [];
    for (var rep = 0; rep < 600; rep++) {
      var g = G.generarOrgPolarizacion({
        nNodos: 6, personasPorNodo: 25,
        magnitudPolarizacionReal: 0, magnitudRuidoInterno: ruido, seed: 1000 + rep
      });
      var d = dispsBEF(g.nodos);
      entre.push(d.entre); entreAj.push(d.entreAj); pool.push(d.pool);
    }
    row([ruido, 600,
      G.media(entre).toFixed(2) + ' (p95 ' + G.percentil(entre, 0.95).toFixed(1) + ')',
      G.media(entreAj).toFixed(2) + ' (p95 ' + G.percentil(entreAj, 0.95).toFixed(1) + ')',
      G.media(pool).toFixed(2)], [8, 7, 20, 20, 10]);
  });
  console.log('Esperado: la cruda tiene un piso ≈ ruido/√25; la AJUSTADA lo elimina (≈ 0).');

  // ── Check 2: polReal creciente, ruido bajo ───────────────────────────────
  h('Q1.2  polReal creciente, ruido interno bajo (=5) — proporcionalidad');
  var xs = [], ys = [];
  row(['polReal', 'dispEntreNodos media (400 reps)'], [10, 32]);
  [0, 5, 10, 20, 30, 40].forEach(function (pol) {
    var entre = [];
    for (var rep = 0; rep < 400; rep++) {
      var g = G.generarOrgPolarizacion({
        nNodos: 6, personasPorNodo: 25,
        magnitudPolarizacionReal: pol, magnitudRuidoInterno: 5, seed: 2000 + rep
      });
      entre.push(dispsBEF(g.nodos).entre);
    }
    var m = G.media(entre);
    xs.push(pol); ys.push(m);
    row([pol, m.toFixed(2)], [10, 32]);
  });
  var fit = G.olsMultiple(xs.map(function (x) { return [1, x]; }), ys);
  var yhat = xs.map(function (x) { return fit[0] + fit[1] * x; });
  var ybar = G.media(ys);
  var ssTot = ys.reduce(function (s, y) { return s + (y - ybar) * (y - ybar); }, 0);
  var ssRes = ys.reduce(function (s, y, i) { return s + (y - yhat[i]) * (y - yhat[i]); }, 0);
  console.log('Ajuste  dispEntreNodos ≈ ' + fit[0].toFixed(2) + ' + ' + fit[1].toFixed(3) + '·polReal'
    + '   (R² = ' + (1 - ssRes / ssTot).toFixed(4) + ')');
  console.log('Esperado: pendiente cercana a 1, R² alto — sube de forma proporcional.');

  // ── Check 3: AMBOS altos — ¿el ruido contamina dispEntreNodos? ────────────
  h('Q1.3  polReal y ruido interno variados de forma independiente (grid × 250 reps)');
  var reg = { X: [], yEntre: [], yEntreAj: [], yPool: [] };
  var pols = [0, 10, 20, 30], ruidos = [0, 10, 20, 30];
  row(['polReal\\ruido', ruidos[0], ruidos[1], ruidos[2], ruidos[3]], [14, 14, 14, 14, 14]);
  pols.forEach(function (pol) {
    var celdas = [];
    ruidos.forEach(function (ruido) {
      var entreAj = [];
      for (var rep = 0; rep < 250; rep++) {
        var g = G.generarOrgPolarizacion({
          nNodos: 6, personasPorNodo: 25,
          magnitudPolarizacionReal: pol, magnitudRuidoInterno: ruido, seed: 3000 + rep
        });
        var d = dispsBEF(g.nodos);
        entreAj.push(d.entreAj);
        reg.X.push([1, pol, ruido]); reg.yEntre.push(d.entre); reg.yEntreAj.push(d.entreAj); reg.yPool.push(d.pool);
      }
      celdas.push(G.media(entreAj).toFixed(1));
    });
    row(['pol=' + pol, celdas[0], celdas[1], celdas[2], celdas[3]], [14, 14, 14, 14, 14]);
  });
  console.log('(cada celda = dispEntreNodosAJUSTADA media — debe responder a polReal, no a ruido)');
  var bEntre = G.olsMultiple(reg.X, reg.yEntre);
  var bEntreAj = G.olsMultiple(reg.X, reg.yEntreAj);
  var bPool = G.olsMultiple(reg.X, reg.yPool);
  console.log('\nRegresión  dispEntreNodos (cruda) ~ 1 + polReal + ruidoInterno:');
  console.log('   intercepto ' + bEntre[0].toFixed(4) + '   coef polReal ' + bEntre[1].toFixed(4)
    + '   coef ruidoInterno ' + bEntre[2].toFixed(4));
  console.log('Regresión  dispEntreNodosAJUSTADA ~ 1 + polReal + ruidoInterno:');
  console.log('   intercepto ' + bEntreAj[0].toFixed(4) + '   coef polReal ' + bEntreAj[1].toFixed(4)
    + '   coef ruidoInterno ' + bEntreAj[2].toFixed(4) + '   <-- ¿más cerca de 0 que la cruda?');
  console.log('Regresión  dispPool ~ 1 + polReal + ruidoInterno:');
  console.log('   intercepto ' + bPool[0].toFixed(4) + '   coef polReal ' + bPool[1].toFixed(4)
    + '   coef ruidoInterno ' + bPool[2].toFixed(4));
  console.log('\nDerivaciones exactas:');
  console.log('   razón de sensibilidad al ruido interno  = coefRuido(pool) / coefRuido(entreNodos)');
  console.log('                                           = ' + bPool[2].toFixed(4) + ' / ' + bEntre[2].toFixed(4)
    + ' = ' + (bPool[2] / bEntre[2]).toFixed(2) + '×');
  console.log('   ventaja señal-ruido = [coefPol/coefRuido]_entreNodos / [coefPol/coefRuido]_pool');
  console.log('                       = (' + (bEntre[1] / bEntre[2]).toFixed(2) + ') / (' + (bPool[1] / bPool[2]).toFixed(2)
    + ') = ' + ((bEntre[1] / bEntre[2]) / (bPool[1] / bPool[2])).toFixed(2) + '×');

  // ── Check 4: nodo pequeño sub-umbral con polarización real ───────────────
  h('Q1.4  nodos desiguales: 3 grandes (n=30, mu≈0) + 1 chico (n=6, mu=+80, sub-umbral)');
  var missEntre = 0, catchPool = 0, entreVals = [], poolVals = [];
  for (var rep = 0; rep < 400; rep++) {
    var g = G.generarOrgPolarizacion({
      personasPorNodo: [30, 30, 30, 6],
      muNodos: [0, 0, 0, 80], magnitudRuidoInterno: 5, seed: 4000 + rep
    });
    var d = dispsBEF(g.nodos);              // minReportableN = 8 ⇒ el nodo de 6 no entra a porNodo
    entreVals.push(d.entre); poolVals.push(d.pool);
    if (d.entre < 10) missEntre++;
    if (d.pool > 15) catchPool++;
  }
  console.log('nReportables (nodos en porNodo) = 3  (el nodo de 6 queda fuera, §3.11)');
  console.log('dispEntreNodos: media ' + G.media(entreVals).toFixed(2) + ', p95 ' + G.percentil(entreVals, 0.95).toFixed(2)
    + '  → invisible al foco del nodo chico en ' + (missEntre / 400 * 100).toFixed(1) + '% de las corridas (dispEntre < 10)');
  console.log('dispPool:       media ' + G.media(poolVals).toFixed(2) + ', p05 ' + G.percentil(poolVals, 0.05).toFixed(2)
    + '  → capta el foco en ' + (catchPool / 400 * 100).toFixed(1) + '% de las corridas (dispPool > 15)');
  console.log('Esperado: dispEntreNodos NO lo ve (sistemático), dispPool SÍ lo capta (consistente).');
}

// ════════════════════════════════════════════════════════════════════════════
//  Q2 — regla de compuerta de PRECISIÓN
// ════════════════════════════════════════════════════════════════════════════
function q2() {
  h('Q2  ¿la regla de compuerta de PRECISIÓN produce clasificación sensata?');
  console.log('Umbrales de prueba: N_min=5, N_alto=30, tasa_min=0.3, tasa_alta=0.7, corte_disp=25');
  console.log('(N/tasa: Luis.  corte_disp: placeholder de simulación — Luis no lo fijó.)');
  var DIS = M.DISENOS_MUESTRALES;
  function P(n, conv, dis, disp) {
    return M.clasificarPrecision({ n: n, convocados: conv, disenoMuestral: dis, dispersionPoolIao: disp }, U_PRECISION).nivel;
  }

  // ── Check 1: la distribución no colapsa ──────────────────────────────────
  h('Q2.1  distribución de ALTA / MEDIA / BAJA sobre 8000 combinaciones aleatorias');
  var r = G.rng(777), cuenta = { ALTA: 0, MEDIA: 0, BAJA: 0 };
  for (var i = 0; i < 8000; i++) {
    var n = 1 + Math.floor(r() * 60);
    var tasa = 0.05 + r() * 0.95;
    var conv = Math.max(n, Math.ceil(n / tasa));
    var dis = DIS[Math.floor(r() * 4)];
    var disp = r() * 45;
    cuenta[P(n, conv, dis, disp)]++;
  }
  ['ALTA', 'MEDIA', 'BAJA'].forEach(function (k) {
    console.log('  ' + k.padEnd(6) + (cuenta[k] / 8000 * 100).toFixed(1) + '%  (' + cuenta[k] + ')');
  });
  console.log('Esperado: ninguna clase en 0% ni ~100%.');

  // condicionado a diseño conocido (CENSO/ALEATORIO) — más representativo de uso real
  var r2 = G.rng(778), c2 = { ALTA: 0, MEDIA: 0, BAJA: 0 };
  for (i = 0; i < 8000; i++) {
    var nn = 1 + Math.floor(r2() * 60), tt = 0.05 + r2() * 0.95;
    c2[P(nn, Math.max(nn, Math.ceil(nn / tt)), r2() < 0.5 ? 'CENSO' : 'ALEATORIO', r2() * 45)]++;
  }
  console.log('\nCondicionado a diseño ∈ {CENSO, ALEATORIO} (uso real típico):');
  ['ALTA', 'MEDIA', 'BAJA'].forEach(function (k) {
    console.log('  ' + k.padEnd(6) + (c2[k] / 8000 * 100).toFixed(1) + '%  (' + c2[k] + ')');
  });

  // ── Check 2: comportamiento en los bordes ────────────────────────────────
  h('Q2.2  casos límite — ¿saltos de una sola categoría o absurdos?');
  console.log('Eje N (tasa=.9, CENSO, disp=5):');
  [3, 4, 5, 6, 7, 29, 30, 31].forEach(function (n) { console.log('   N=' + n + '  → ' + P(n, Math.ceil(n / 0.9), 'CENSO', 5)); });
  console.log('Eje tasa_respuesta (N=40, CENSO, disp=5):');
  [0.28, 0.29, 0.30, 0.31, 0.69, 0.70, 0.71].forEach(function (t) {
    console.log('   tasa=' + t.toFixed(2) + '  → ' + P(40, Math.round(40 / t), 'CENSO', 5));
  });
  console.log('Eje dispersionPoolIao (N=40, tasa=.9, CENSO):');
  [23, 24, 25, 26].forEach(function (d) { console.log('   disp=' + d + '  → ' + P(40, 45, 'CENSO', d)); });
  console.log('Eje diseño_muestral (N=40, tasa=.9, disp=5):');
  DIS.forEach(function (dis) { console.log('   ' + dis.padEnd(12) + '→ ' + P(40, 45, dis, 5)); });

  // ── Check 3: la compuerta nunca es de mayoría ────────────────────────────
  h('Q2.3  4 factores "ALTA" + 1 catastrófico  ⇒  SIEMPRE BAJA (compuerta, no mayoría)');
  var buenos = { n: 40, conv: 45, dis: 'CENSO', disp: 5 };  // los 4 en zona ALTA
  var catastroficos = [
    ['N', function (o) { o.n = 2; }],
    ['N', function (o) { o.n = 4; }],
    ['tasa_respuesta', function (o) { o.conv = 1000; }],   // tasa 0.04
    ['tasa_respuesta', function (o) { o.conv = 200; }],    // tasa 0.20
    ['diseño = CONVENIENCIA', function (o) { o.dis = 'CONVENIENCIA'; }],
    ['diseño = UNKNOWN', function (o) { o.dis = 'UNKNOWN'; }],
    ['dispersión alta', function (o) { o.disp = 30; }],
    ['dispersión alta', function (o) { o.disp = 45; }]
  ];
  var todasBaja = true;
  catastroficos.forEach(function (c) {
    var o = Object.assign({}, buenos); c[1](o);
    var nivel = P(o.n, o.conv, o.dis, o.disp);
    if (nivel !== 'BAJA') todasBaja = false;
    console.log('   ' + c[0].padEnd(24) + '(resto en ALTA) → ' + nivel);
  });
  console.log(todasBaja
    ? '✓ Todos BAJA — la compuerta nunca deja que 4 buenos compensen 1 catastrófico.'
    : '✗ HALLAZGO: algún factor catastrófico NO forzó BAJA.');

  // barrido exhaustivo de la propiedad de compuerta
  var total = 0, fallos = 0;
  [2, 3, 4].forEach(function (n) {                          // N catastrófico
    [45].forEach(function (conv) {
      ['CENSO', 'ALEATORIO'].forEach(function (dis) {
        [0, 5, 10, 20].forEach(function (disp) {
          total++; if (P(n, conv, dis, disp) !== 'BAJA') fallos++;
        });
      });
    });
  });
  console.log('Barrido N catastrófico × (todo lo demás ALTA-válido): ' + (total - fallos) + '/' + total + ' → BAJA');
}

q1();
q2();
console.log('\n' + LINEA + '\nFin de la simulación.\n' + LINEA);
