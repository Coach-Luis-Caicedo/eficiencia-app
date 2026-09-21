/**
 * src/motores/piio.js -- flujo puro de motor-piio
 * (DISENO_WORKER_EJECUCION_MOTORES.md §4.7). El más simple de los 8 --
 * toda la complejidad de ensamblar PIIO_INPUT ya vive en
 * motores_eficiencia.leer_datos_piio() (035).
 */

'use strict';

const { runPIIOCompleto } = require('../../motor-piio/runPIIO');

/**
 * calcularPiio(datosPiio, opciones) -> PIIO_RESULT
 * `datosPiio` = salida (ya parseada) de motores_eficiencia.leer_datos_piio().
 */
function calcularPiio(datosPiio, opciones) {
  return runPIIOCompleto(datosPiio, opciones);
}

module.exports = { calcularPiio };
