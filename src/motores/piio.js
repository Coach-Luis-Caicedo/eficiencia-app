/**
 * src/motores/piio.js -- flujo puro de motor-piio
 * (DISENO_WORKER_EJECUCION_MOTORES.md §4.7). El más simple de los 8 --
 * toda la complejidad de ensamblar PIIO_INPUT ya vive en
 * motores_eficiencia.leer_datos_piio() (035).
 *
 * ruleset_version (PENDIENTES_BRECHAS_WORKER_MOTORES.md §6,
 * INVESTIGACION_RULESET_VERSION_PIIO.md): sin este campo,
 * leer_datos_piio() no lo provee y runPIIOCompleto() bloquea la corrida
 * (FORMA_INVALIDA -> BLOCKED). Verificado por grep + ejecución: el motor
 * nunca ramifica sobre el VALOR de ruleset_version (cero comparaciones
 * ===/switch/.match), solo lo exige como etiqueta no vacía y lo usa como
 * un componente más de calculation_version -- no hay evidencia de que
 * varíe por organización, y el motor no podría honrar esa variación
 * aunque existiera. Mismo criterio que RULESET_VERSION_CFF
 * (src/motores/cff.js): constante en código, sube manualmente cuando
 * cambie PARAMS o una regla de derivación de motor-piio (INV-PIIO-65).
 * Hoy nada hace cumplir ese incremento -- es disciplina manual.
 */

'use strict';

const { runPIIOCompleto } = require('../../motor-piio/runPIIO');

const RULESET_VERSION_PIIO = 'PIIO-v1.1';

/**
 * calcularPiio(datosPiio, opciones) -> PIIO_RESULT
 * `datosPiio` = salida (ya parseada) de motores_eficiencia.leer_datos_piio().
 *
 * Inyección NO destructiva de ruleset_version: si datosPiio ya trae un
 * valor persistido (leer_datos_piio lo devuelve en el futuro), ese gana
 * -- la constante es solo el valor por defecto cuando no hay ninguno.
 */
function calcularPiio(datosPiio, opciones) {
  const datosConRuleset = Object.assign(
    { ruleset_version: RULESET_VERSION_PIIO },
    datosPiio
  );
  return runPIIOCompleto(datosConRuleset, opciones);
}

module.exports = { calcularPiio, RULESET_VERSION_PIIO };
