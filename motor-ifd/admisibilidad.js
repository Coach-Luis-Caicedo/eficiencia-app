/**
 * motor-ifd/admisibilidad.js — Fase 1
 *
 * Puerta de admisibilidad (§6) + fuerza de evidencia prospectiva (§7) +
 * niveles de salida (§8). Es la entrada del motor: sin evidencia
 * suficiente, no hay proyección — "IFD DEBE PERDER PRECISIÓN ANTES QUE
 * INVENTARLA" (§0).
 *
 * NO proyecta (Fase 3), NO clasifica variable (Fase 2), NO monetiza
 * (Fase 5). Aquí solo se decide si el EPD puede siquiera empezar y con qué
 * techo de fuerza.
 *
 * ── §6 — Aᵢ = Dᵢ ∧ Eᵢ ∧ Mᵢ ∧ Hᵢ ∧ Sᵢ ─────────────────────────────────
 *
 * AND ESTRICTO de las 5 puertas (deterioro sustentado, evidencia
 * utilizable, mecanismo prospectivo razonable, horizonte definido,
 * supuestos declarados). No es un score, no hay "4 de 5 basta". Si
 * cualquiera falla → NO PROYECTABLE (S0), alerta A01.
 *
 * ── §7 — FEPᵢ = min(Qᵢ, Cᵢ, Tᵢ, Rᵢ) ──────────────────────────────────
 *
 * NO COMPENSATORIA: la dimensión más débil fija la fuerza. Q=C=T=3, R=1 →
 * FEP=1, no 2.5. "lo estructural es la regla de fuerza máxima de
 * evidencia" (§7 literal).
 *
 * ── §8 — FUERZA DE SALIDA ≤ FUERZA DE EVIDENCIA ───────────────────────
 *
 * El nivel de salida (S0..S3) nunca puede exceder lo que FEP permite. El
 * mapeo directo es FEP→nivel (0→S0, 1→S1, 2→S2, 3→S3); fases posteriores
 * pueden DEGRADAR pero nunca subir (§30). `verificarFuerzaSalida()` es la
 * salvaguarda de ese invariante.
 */

'use strict';

var mod = require('./enums');
var ENUMS = mod.ENUMS;

var PUERTAS_ADMISIBILIDAD = [
  'deterioration_sustained', 'evidence_present', 'mechanism_traceable',
  'horizon_defined', 'assumptions_declared'
];

var DIMENSIONES_FEP = ['Q', 'C', 'T', 'R'];

var NIVEL_POR_FEP = { 0: 'S0', 1: 'S1', 2: 'S2', 3: 'S3' }; // §8, mapeo directo
var ORDEN_NIVEL = ['S0', 'S1', 'S2', 'S3'];

/**
 * evaluarAdmisibilidad(gates)
 *
 * gates: objeto con las 5 puertas booleanas (§6). Cualquiera ausente o no
 * booleana → se trata como fallo de esa puerta (el motor no completa
 * vacíos, §6).
 *
 * @returns {{ admisible: boolean, puertasFallidas: string[], alerta: string|null }}
 */
function evaluarAdmisibilidad(gates) {
  if (!gates || typeof gates !== 'object') {
    throw new Error('evaluarAdmisibilidad: se esperaba un objeto con las 5 puertas de §6.');
  }
  var fallidas = PUERTAS_ADMISIBILIDAD.filter(function (p) { return gates[p] !== true; });
  var admisible = fallidas.length === 0;
  return {
    admisible: admisible,
    puertasFallidas: fallidas,
    alerta: admisible ? null : 'A01' // ADMISIBILIDAD_INSUFICIENTE
  };
}

/**
 * calcularFEP(dims)
 *
 * dims: { Q, C, T, R } enteros 0-3. §7: FEP = min. NO promedio, NO suma
 * ponderada — regla no compensatoria.
 *
 * @returns {{ fep: number, dimensionMinima: string, dims: object }}
 */
function calcularFEP(dims) {
  if (!dims || typeof dims !== 'object') {
    throw new Error('calcularFEP: se esperaba { Q, C, T, R }.');
  }
  DIMENSIONES_FEP.forEach(function (d) {
    var v = dims[d];
    if (typeof v !== 'number' || v !== Math.trunc(v) || v < 0 || v > 3) {
      throw new Error('calcularFEP: ' + d + '="' + v + '" — cada dimensión de §7 es un entero 0-3.');
    }
  });
  var valores = DIMENSIONES_FEP.map(function (d) { return dims[d]; });
  var fep = Math.min.apply(null, valores);
  var dimensionMinima = DIMENSIONES_FEP[valores.indexOf(fep)];
  return { fep: fep, dimensionMinima: dimensionMinima, dims: { Q: dims.Q, C: dims.C, T: dims.T, R: dims.R } };
}

/**
 * nivelSalidaMax(fep) → 'S0' | 'S1' | 'S2' | 'S3'  (§8, techo por evidencia)
 */
function nivelSalidaMax(fep) {
  if (NIVEL_POR_FEP[fep] === undefined) {
    throw new Error('nivelSalidaMax: FEP="' + fep + '" fuera de 0-3.');
  }
  return NIVEL_POR_FEP[fep];
}

/**
 * verificarFuerzaSalida(outputLevel, fep)
 *
 * §8 / §30: el nivel de salida NUNCA puede exceder el que FEP permite.
 * Lanza si `outputLevel` es más alto que `nivelSalidaMax(fep)`. Con el
 * código correcto no se dispara — expuesta para prueba dirigida.
 */
function verificarFuerzaSalida(outputLevel, fep) {
  var idxSalida = ORDEN_NIVEL.indexOf(outputLevel);
  var idxTecho = ORDEN_NIVEL.indexOf(nivelSalidaMax(fep));
  if (idxSalida === -1) {
    throw new Error('verificarFuerzaSalida: outputLevel "' + outputLevel + '" no es S0..S3.');
  }
  if (idxSalida > idxTecho) {
    throw new Error('verificarFuerzaSalida: output_level ' + outputLevel + ' excede el techo por evidencia ' +
      nivelSalidaMax(fep) + ' (FEP=' + fep + ') — §8: "FUERZA DE SALIDA ≤ FUERZA DE EVIDENCIA"; §30: la ' +
      'degradación nunca sube.');
  }
  return { valido: true, techo: nivelSalidaMax(fep) };
}

/**
 * resolverPuertaEvidencia(input)
 *
 * Combina §6 + §7 y produce, o bien un RESULTADO TERMINAL S0 (no
 * admisible, o FEP=0), o bien la señal `continuar` con el FEP y el techo
 * para que Fases 2+ sigan.
 *
 * input: { deterioration_sustained, evidence_present, mechanism_traceable,
 *   horizon_defined, assumptions_declared, Q, C, T, R }
 *
 * @returns {{
 *   terminal: boolean,
 *   resultado?: { admissible, FEP, output_level, status, alerts, notes },
 *   fep?: number, nivelMax?: string, admisible?: boolean
 * }}
 */
function resolverPuertaEvidencia(input) {
  var adm = evaluarAdmisibilidad(input);
  var f = calcularFEP(input);

  if (!adm.admisible) {
    return {
      terminal: true,
      resultado: {
        admissible: false, FEP: f.fep, output_level: 'S0', status: 'NO_PROYECTABLE',
        alerts: ['A01'],
        notes: ['§6: puerta(s) de admisibilidad no satisfecha(s): ' + adm.puertasFallidas.join(', ') +
          '. El motor no completa vacíos con coeficientes genéricos.']
      }
    };
  }

  if (f.fep === 0) {
    // §6 / §35: "R=0 → no proyectable aunque la serie sea estadísticamente
    // fuerte". Si la dimensión en 0 es R → trazabilidad insuficiente (A03);
    // si es otra → contradicción/evidencia insuficiente (A02). Mismo
    // criterio que el engine de referencia.
    var alerta = input.R === 0 ? 'A03' : 'A02';
    return {
      terminal: true,
      resultado: {
        admissible: true, FEP: 0, output_level: 'S0', status: 'NO_PROYECTABLE',
        alerts: [alerta],
        notes: ['§7: FEP=0 por ' + f.dimensionMinima + '=0 — fuerza de evidencia nula, no proyectable.']
      }
    };
  }

  return {
    terminal: false,
    fep: f.fep,
    dimensionMinima: f.dimensionMinima,
    nivelMax: nivelSalidaMax(f.fep),
    admisible: true
  };
}

module.exports = {
  evaluarAdmisibilidad: evaluarAdmisibilidad,
  calcularFEP: calcularFEP,
  nivelSalidaMax: nivelSalidaMax,
  verificarFuerzaSalida: verificarFuerzaSalida,
  resolverPuertaEvidencia: resolverPuertaEvidencia,
  PUERTAS_ADMISIBILIDAD: PUERTAS_ADMISIBILIDAD,
  DIMENSIONES_FEP: DIMENSIONES_FEP,
  ORDEN_NIVEL: ORDEN_NIVEL
};
