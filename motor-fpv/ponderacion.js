/**
 * motor-fpv/ponderacion.js — Fase 5
 *
 * Ponderación §9. El cálculo por defecto del motor es NO ponderado
 * (`poblacionalSensor`, Fase 2). Esta función es la variante ponderada
 * paralela — NO modifica Fase 2.
 *
 * §9 literal:
 *   "El cálculo por defecto es no ponderado. Solo se aplican pesos cuando
 *    el diseño de muestreo, la probabilidad de selección o un
 *    procedimiento de calibración documentado los justifica. Si existen
 *    pesos wᵢ, el nivel y la distribución se calculan con los pesos
 *    normalizados sobre respuestas válidas."
 *      Lⱼ,w = Σ wᵢ s(rᵢⱼ) / Σ wᵢ
 *      pₖ,w = Σ wᵢ I(rᵢⱼ = k) / Σ wᵢ
 *   "La heterogeneidad se calcula entonces sobre pₖ,w. Los resultados
 *    ponderados deben conservar también n no ponderado y metodología de
 *    ponderación."
 *
 * ─── Qué pondera §9 y qué NO ─────────────────────────────────────────
 *
 * §9 pondera EXPLÍCITAMENTE: el nivel (Lⱼ,w), la distribución (pₖ,w) y —
 * derivada de pₖ,w — la heterogeneidad (Hⱼ,w, C = 100 − H). Nada más.
 *
 * - MEDIANA: NO está en la lista de §9. Se reporta la mediana NO ponderada
 *   de §7.2.A (sobre las respuestas crudas válidas). §11.1 la exige como
 *   contenido obligatorio; §9 no la toca. Decisión de diseño (lectura de
 *   la lista de §9 como exhaustiva de lo que la ponderación alcanza —
 *   §9 da fórmula explícita para L y p, y ninguna para la mediana).
 * - COBERTURA (CE/CV/PR, §7.2.D): NO se pondera (decisión E). No es "el
 *   nivel" ni "la distribución" — es participación/experiencia sobre
 *   CONTEOS de personas. `coberturaSensor` (Fase 3) opera sobre `nv`/`nNE`
 *   de esta salida, que son conteos sin ponderar.
 * - CONFIGURACIÓN F–P–V (§7.3): NO se pondera aquí (decisión F, DIFERIDA).
 *   §7.3 y §14 (bloque CONFIGURACION completo) no mencionan pesos ni de
 *   pasada. Un LF*,w sería extensión analógica; si se necesita, será una
 *   decisión nueva y consciente, no algo que se cuele por analogía con L.
 *
 * ─── Pesos: todo o nada por sensor (decisión B) ──────────────────────
 *
 * §9: "Si existen pesos wᵢ" — presupone que existen para la muestra.
 * Mezclar respondientes ponderados y no ponderados es incoherente. Si el
 * llamante pide ponderado y ALGUNA persona con respuesta válida a ese
 * sensor no tiene `peso` numérico positivo → se LANZA (contrato del
 * llamante mal formado, no condición de dominio). No se trata el peso
 * faltante como 1.
 *
 * ─── Normalización por sensor (decisión G, Fase 0) ──────────────────
 *
 * Σ wᵢ es sobre las personas con respuesta VÁLIDA a ESE sensor. Persona
 * con F válido y V='NE': su peso entra en Σw de F, no de V.
 *
 * ─── Metodología: se declara, no se deriva (decisión G) ─────────────
 *
 * §9: "deben conservar [...] metodología de ponderación." `opciones.
 * metodologia` (string no vacío) es REQUERIDO — el motor la registra y la
 * devuelve, no la audita (mismo patrón que `diseno` en Fase 3).
 *
 * ─── Segmentación (§9 último párrafo) ───────────────────────────────
 *
 * NO se implementa. Segmentar por antigüedad/producto/canal/región es el
 * llamante troceando el input y llamando al motor por trozo. "El motor no
 * atribuye causalidad a diferencias entre segmentos" ya se respeta — el
 * motor nunca emite afirmaciones causales.
 */

'use strict';

var mod = require('./enums');
var poblacional = require('./poblacional');
var ORDINALES = mod.ENUMS.ESCALA_ORDINAL; // [1,2,3,4,5]

function esPesoValido(w) {
  return typeof w === 'number' && isFinite(w) && w > 0;
}

/**
 * poblacionalSensorPonderado(perfiles, sensor, opciones) → {
 *   sensor,
 *   estatus: 'NO_CALCULABLE' | 'DESCRIPTIVO',
 *   ponderado: true,
 *   metodologia: string,          // §9 — declarada por el llamante
 *   nv, nNE, nNR,
 *   n_no_ponderado: number,       // §9 — "conservar n no ponderado" (= nv)
 *   suma_pesos: number,           // Σ wᵢ sobre las válidas de este sensor
 *   L: number|null,               // §9 — Lⱼ,w
 *   mediana: number|null,         // §7.2.A — NO ponderada (§9 no la lista)
 *   p: {1..5}|null,                // §9 — pₖ,w, Σ pₖ,w = 1
 *   H: number|null,               // §9 — sobre pₖ,w
 *   C: number|null                // 100 − H
 * }
 *
 * Misma FORMA que `poblacionalSensor` (Fase 2) + `ponderado`/`metodologia`/
 * `n_no_ponderado`/`suma_pesos`, para que `coberturaSensor` (Fase 3) la
 * consuma igual.
 */
function poblacionalSensorPonderado(perfiles, sensor, opciones) {
  if (!Array.isArray(perfiles)) throw new Error('poblacionalSensorPonderado: se esperaba un array de perfiles (Fase 1).');
  if (['F', 'P', 'V'].indexOf(sensor) === -1) throw new Error('poblacionalSensorPonderado: sensor "' + sensor + '" — debe ser F, P o V.');
  if (!opciones || typeof opciones.metodologia !== 'string' || !opciones.metodologia.trim()) {
    throw new Error('poblacionalSensorPonderado: `opciones.metodologia` (string no vacío) es requerida — §9: ' +
      '"los resultados ponderados deben conservar [...] metodología de ponderación".');
  }

  var validos = []; // { r, s, w }
  var nNE = 0, nNR = 0;
  perfiles.forEach(function (perfil) {
    var d = perfil && perfil[sensor];
    if (!d) return;
    if (d.valido === true && typeof d.r === 'number') {
      if (!esPesoValido(perfil.peso)) {
        throw new Error('poblacionalSensorPonderado: la persona "' + (perfil.persona_id) +
          '" tiene respuesta válida a ' + sensor + ' pero `peso` no es un número positivo (' + perfil.peso + '). ' +
          '§9: la ponderación es todo o nada — no se imputa un peso.');
      }
      validos.push({ r: d.r, s: mod.s(d.r), w: perfil.peso });
    } else if (d.motivo === 'NE') nNE++;
    else if (d.motivo === 'NR') nNR++;
  });

  var nv = validos.length;

  if (nv === 0) {
    return {
      sensor: sensor, estatus: 'NO_CALCULABLE', ponderado: true, metodologia: opciones.metodologia,
      nv: 0, nNE: nNE, nNR: nNR, n_no_ponderado: 0, suma_pesos: 0,
      L: null, mediana: null, p: null, H: null, C: null
    };
  }

  var sumaPesos = validos.reduce(function (acc, v) { return acc + v.w; }, 0);

  // Lⱼ,w = Σ wᵢ s(rᵢ) / Σ wᵢ
  var L = validos.reduce(function (acc, v) { return acc + v.w * v.s; }, 0) / sumaPesos;

  // pₖ,w = Σ wᵢ I(rᵢ = k) / Σ wᵢ
  var p = {};
  ORDINALES.forEach(function (k) {
    var num = validos.reduce(function (acc, v) { return acc + (v.r === k ? v.w : 0); }, 0);
    p[k] = num / sumaPesos;
  });

  // Hⱼ,w = 50 · Σᵢ Σₖ pᵢ,w pₖ,w |i−k|   (sobre pₖ,w — §9)
  var H = 0;
  ORDINALES.forEach(function (i) {
    ORDINALES.forEach(function (k) { H += p[i] * p[k] * Math.abs(i - k); });
  });
  H = 50 * H;

  return {
    sensor: sensor,
    estatus: 'DESCRIPTIVO',
    ponderado: true,
    metodologia: opciones.metodologia,
    nv: nv, nNE: nNE, nNR: nNR,
    n_no_ponderado: nv,      // §9 — conservado (aquí nv YA es el conteo sin ponderar)
    suma_pesos: sumaPesos,
    L: L,
    mediana: poblacional.mediana(validos.map(function (v) { return v.r; })), // §7.2.A — NO ponderada
    p: p,
    H: H,
    C: 100 - H
  };
}

module.exports = { poblacionalSensorPonderado: poblacionalSensorPonderado };
