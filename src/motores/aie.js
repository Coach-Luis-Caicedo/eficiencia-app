/**
 * src/motores/aie.js -- flujo puro de motor-aie
 * (DISENO_WORKER_EJECUCION_MOTORES.md §4.8/§5). Usa
 * motor-aie/runCase.js -- el ensamblador de producción ya verificado
 * contra las 19 884 filas del fixture real (0 discrepancias) -- NUNCA
 * invoca Python. Esta función es intencionalmente la más delgada de las
 * 8: la orquestación de "correr motor-iao/motor-sdmo/motor-piio por cada
 * período de la serie" vive en el handler HTTP (worker.js), porque es
 * inherentemente asíncrona (una llamada RPC por período) -- no pertenece
 * a una función pura.
 */

'use strict';

const { runCase } = require('../../motor-aie/runCase');

/**
 * calcularAie(cfg, dyn, ops) -> Array<Object>  (18 campos por fila, uno
 * por período -- ver motor-aie/runCase.js).
 * `cfg`/`dyn`/`ops` ya deben venir armadas por el llamante (una serie
 * completa, mismo período a período) -- ver worker.js para cómo se arman
 * llamando a calcularIao/calcularSdmo/calcularPiio en cadena.
 */
function calcularAie(cfg, dyn, ops) {
  return runCase(cfg, dyn, ops);
}

module.exports = { calcularAie };
