/**
 * Generador sintético para la validación estadística de motor-iao.
 * Parámetros CONOCIDOS y controlables — igual criterio que aie_validation_kit.
 * No usa datos reales ni benchmarks de CFF: esto es sobre la mecánica
 * estadística interna, no sobre magnitudes económicas.
 */
'use strict';

/** PRNG determinista (mulberry32) — reproducibilidad. */
function rng(seed) {
  var s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal(0,1) por Box–Muller. */
function randn(r) {
  var u = 1 - r(), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

/**
 * Una Persona cuyo par EF tiene brecha objetivo `bEF` (= EST − FOR).
 * El resto de variables se fija en 50 → aísla el comportamiento del par EF.
 * bEF se clampa a [−100, 100]; EST y FOR resultan automáticamente en [0, 100].
 */
function personaConBrechaEF(bEF) {
  var b = clamp(bEF, -100, 100);
  return {
    EST: 50 + b / 2, INE: 50, IMP: 50, NEX: 50, ITG: 50,
    FOR: 50 - b / 2, COH: 50, EQU: 50, CNF: 50, ACT: 50
  };
}

/**
 * Organización sintética para Q1 (polarización de brechas).
 * @param {Object} p
 *   nNodos
 *   personasPorNodo        número, o array de longitud nNodos (tamaños desiguales)
 *   magnitudPolarizacionReal  desviación estándar de las MEDIAS de nodo (B_EF)
 *   magnitudRuidoInterno      desviación estándar de los individuos DENTRO de cada nodo
 *   seed
 *   muNodos                (opc.) medias de nodo forzadas — para el caso del nodo
 *                          pequeño con polarización real (check 4)
 * @returns {{ nodos: Array<{id, personas}>, muNodos: number[] }}
 */
function generarOrgPolarizacion(p) {
  var r = rng(p.seed || 1);
  var tamanos = Array.isArray(p.personasPorNodo)
    ? p.personasPorNodo.slice()
    : Array(p.nNodos).fill(p.personasPorNodo);

  var muNodos = p.muNodos
    ? p.muNodos.slice()
    : tamanos.map(function () { return randn(r) * (p.magnitudPolarizacionReal || 0); });

  var nodos = muNodos.map(function (mu, g) {
    var personas = [];
    for (var i = 0; i < tamanos[g]; i++) {
      var b = mu + randn(r) * (p.magnitudRuidoInterno || 0);
      personas.push(personaConBrechaEF(b));
    }
    return { id: 'n' + g, personas: personas };
  });

  return { nodos: nodos, muNodos: muNodos };
}

// ── estadística de apoyo ───────────────────────────────────────────────────
function media(a) { return a.reduce(function (s, x) { return s + x; }, 0) / a.length; }
function std(a) {
  if (a.length < 2) return 0;
  var m = media(a);
  return Math.sqrt(a.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / a.length);
}
function percentil(a, q) {
  var s = a.slice().sort(function (x, y) { return x - y; });
  var idx = clamp(Math.round((s.length - 1) * q), 0, s.length - 1);
  return s[idx];
}
/** Regresión lineal múltiple por mínimos cuadrados (X ya con columna de 1s). */
function olsMultiple(X, y) {
  var k = X[0].length, n = X.length;
  var XtX = [], Xty = [];
  for (var a = 0; a < k; a++) {
    Xty[a] = 0; XtX[a] = [];
    for (var b = 0; b < k; b++) XtX[a][b] = 0;
  }
  for (var i = 0; i < n; i++) {
    for (a = 0; a < k; a++) {
      Xty[a] += X[i][a] * y[i];
      for (b = 0; b < k; b++) XtX[a][b] += X[i][a] * X[i][b];
    }
  }
  // Gauss-Jordan
  var M = XtX.map(function (row, ri) { return row.concat([Xty[ri]]); });
  for (var col = 0; col < k; col++) {
    var piv = col;
    for (var rr = col + 1; rr < k; rr++) if (Math.abs(M[rr][col]) > Math.abs(M[piv][col])) piv = rr;
    var tmp = M[col]; M[col] = M[piv]; M[piv] = tmp;
    var d = M[col][col];
    for (var cc = col; cc <= k; cc++) M[col][cc] /= d;
    for (rr = 0; rr < k; rr++) {
      if (rr === col) continue;
      var f = M[rr][col];
      for (cc = col; cc <= k; cc++) M[rr][cc] -= f * M[col][cc];
    }
  }
  return M.map(function (row) { return row[k]; });
}

module.exports = {
  rng: rng, randn: randn, clamp: clamp,
  personaConBrechaEF: personaConBrechaEF,
  generarOrgPolarizacion: generarOrgPolarizacion,
  media: media, std: std, percentil: percentil, olsMultiple: olsMultiple
};
