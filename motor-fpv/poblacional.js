/**
 * motor-fpv/poblacional.js — Fase 2
 *
 * Nivel poblacional por sensor (§7.2 A/B/C). El segundo de los tres
 * niveles del motor. Opera SOBRE los perfiles de Fase 1 de UNA posición
 * (§7.2: "para ese sensor dentro de una posición"). La agrupación por
 * posición es del orquestador (Fase 6) — esta función recibe los perfiles
 * ya filtrados a una posición.
 *
 * §7.2 abre: "El motor conserva CUATRO salidas simultáneas: nivel,
 * distribución, heterogeneidad y cobertura." La cobertura (D) es Fase 3.
 * Aquí: A nivel, B distribución, C heterogeneidad.
 *
 * ── nᵥ = respuestas válidas 1–5 (§7.2 / §14) ──────────────────────────
 *
 * NE y NR quedan AMBOS fuera de nᵥ (§14 línea 851: "validos = respuestas
 * j con valor 1..5"). Se conservan `nNE` y `nNR` por separado (§14 línea
 * 853) — `nNE` lo usa la cobertura CE de Fase 3; `nNR` es solo
 * trazabilidad (no entra en ninguna fórmula del documento).
 *
 * §14 línea 855: "si n_valido = 0: estado_j = NO_CALCULABLE; continuar".
 * Con nᵥ ≥ 1 el sensor es al menos DESCRIPTIVO (§8: "Existe al menos una
 * respuesta válida"). El resto de la escalera (CENSAL / INFERENCIAL) es
 * Fase 3 — necesita N_elegibles y el diseño declarado.
 *
 * ── H desde conteos, no desde las fracciones p ───────────────────────
 *
 * §7.2.C escribe `Hⱼ = 50 × Σᵢ Σₖ pᵢ pₖ |i−k|` con las fracciones p.
 * Sustituyendo `pᵢ = nᵢ/nᵥ`:  Hⱼ = 50 × (Σᵢ Σₖ nᵢ nₖ |i−k|) / nᵥ² — la
 * MISMA fórmula, pero con la suma interna en aritmética entera (exacta).
 * Así las 5 filas de la tabla de estrés §10 salen EXACTAS (la delicada:
 * uniforme 1,2,3,4,5 → 50·40/25 = 80, no 80.00000000001). No es una
 * fórmula distinta — es la de §7.2.C con `p` desplegado.
 */

'use strict';

var mod = require('./enums');
var ORDINALES = mod.ENUMS.ESCALA_ORDINAL; // [1,2,3,4,5]

/**
 * mediana(rs) — mediana de las respuestas ORIGINALES 1–5 (§7.2.A "mediana
 * de la respuesta original"). `rs` = array no vacío de enteros 1–5.
 * n par → promedio de los dos centrales (puede dar x.5, p.ej. [3,3,4,4]
 * → 3.5, tabla §10).
 */
function mediana(rs) {
  var s = rs.slice().sort(function (a, b) { return a - b; });
  var n = s.length;
  var m = Math.floor(n / 2);
  return (n % 2 === 1) ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * conteos(rs) → { 1:n1, 2:n2, 3:n3, 4:n4, 5:n5 }  (§7.2.B, nₖ)
 */
function conteos(rs) {
  var c = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  rs.forEach(function (r) { c[r]++; });
  return c;
}

/**
 * heterogeneidad(c, nv) → H  (§7.2.C)
 *
 * H = 50 × (Σᵢ Σₖ nᵢ nₖ |i−k|) / nᵥ²  (= 50 × Σᵢ Σₖ pᵢ pₖ |i−k|).
 * Suma interna sobre los 25 pares (i,k) de códigos 1–5.
 */
function heterogeneidad(c, nv) {
  var suma = 0;
  ORDINALES.forEach(function (i) {
    ORDINALES.forEach(function (k) {
      suma += c[i] * c[k] * Math.abs(i - k);
    });
  });
  return 50 * suma / (nv * nv);
}

/**
 * poblacionalSensor(perfiles, sensor) → {
 *   sensor,
 *   estatus: 'NO_CALCULABLE' | 'DESCRIPTIVO',   // la escalera completa es Fase 3
 *   nv, nNE, nNR,
 *   L: number|null,          // §7.2.A — (1/nᵥ)·Σ s(rᵢ), 0–100
 *   mediana: number|null,    // §7.2.A — de la respuesta original 1–5
 *   p: {1..5}|null,           // §7.2.B — pₖ = nₖ/nᵥ, Σ pₖ = 1
 *   H: number|null,           // §7.2.C — 0–100
 *   C: number|null            // §7.2.C — consenso descriptivo = 100 − H
 * }
 *
 * `perfiles` = array de `perfilPersona` (Fase 1) de UNA posición.
 * `sensor` ∈ {'F','P','V'}.
 */
function poblacionalSensor(perfiles, sensor) {
  if (!Array.isArray(perfiles)) throw new Error('poblacionalSensor: se esperaba un array de perfiles (Fase 1).');
  if (['F', 'P', 'V'].indexOf(sensor) === -1) throw new Error('poblacionalSensor: sensor "' + sensor + '" — debe ser F, P o V.');

  var validos = [], nNE = 0, nNR = 0;
  perfiles.forEach(function (perfil) {
    var d = perfil && perfil[sensor];
    if (!d) return; // perfil sin ese sensor (no debería, pero no se inventa)
    if (d.valido === true && typeof d.r === 'number') validos.push(d.r);
    else if (d.motivo === 'NE') nNE++;
    else if (d.motivo === 'NR') nNR++;
  });

  var nv = validos.length;

  if (nv === 0) {
    // §14 línea 855
    return {
      sensor: sensor, estatus: 'NO_CALCULABLE',
      nv: 0, nNE: nNE, nNR: nNR,
      L: null, mediana: null, p: null, H: null, C: null
    };
  }

  var c = conteos(validos);
  var sumaS = validos.reduce(function (acc, r) { return acc + mod.s(r); }, 0);
  var L = sumaS / nv; // §7.2.A
  var p = {};
  ORDINALES.forEach(function (k) { p[k] = c[k] / nv; }); // §7.2.B
  var H = heterogeneidad(c, nv); // §7.2.C

  return {
    sensor: sensor,
    estatus: 'DESCRIPTIVO', // §8 — al menos 1 válida; CENSAL/INFERENCIAL en Fase 3
    nv: nv, nNE: nNE, nNR: nNR,
    L: L,
    mediana: mediana(validos),
    p: p,
    H: H,
    C: 100 - H
  };
}

/**
 * bandasDescriptivas(p) → { desacuerdo, neutralidad, acuerdo }
 *
 * §7.2.B: "Para lectura rápida PUEDEN MOSTRARSE ADEMÁS tres bandas
 * descriptivas: Desacuerdo = p1+p2; Neutralidad = p3; Acuerdo = p4+p5.
 * Estas bandas NO sustituyen la distribución completa."
 *
 * PRESENTACIÓN OPCIONAL — NO parte del "contenido obligatorio" de §11.1
 * (que lista L, mediana, distribución, H, C, CE, n válido y NE, sin las
 * bandas), NO una de las "cuatro salidas simultáneas" de §7.2. DECISIÓN
 * DE DISEÑO (confirmada por Luis): se calculan en Fase 2 como helper
 * separado — NUNCA dentro de `poblacionalSensor`, que solo devuelve lo
 * obligatorio. El orquestador (Fase 6) decide si las expone.
 *
 * `p` = la distribución de `poblacionalSensor` (objeto {1..5}). No aplica
 * si el sensor es NO_CALCULABLE (p es null).
 */
function bandasDescriptivas(p) {
  if (p === null || typeof p !== 'object') {
    throw new Error('bandasDescriptivas: `p` debe ser la distribución {1..5} de un sensor calculable.');
  }
  return {
    desacuerdo: p[1] + p[2],
    neutralidad: p[3],
    acuerdo: p[4] + p[5]
  };
}

module.exports = {
  poblacionalSensor: poblacionalSensor,
  bandasDescriptivas: bandasDescriptivas,
  mediana: mediana,
  heterogeneidad: heterogeneidad
};
