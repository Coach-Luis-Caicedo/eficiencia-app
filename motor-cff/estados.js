/**
 * motor-cff/estados.js
 *
 * §21 "Estados canónicos y propagación" — SOLO la función de propagación
 * `resolve_status()`, como función pura. NO está cableada a ningún
 * pipeline todavía: eso es explícitamente Fase 4b/5 (`resolve_coverage_
 * and_status()` dentro del orquestador `runCFF()`, §24). Aquí se
 * construye y se prueba de forma aislada porque varios contratos
 * posteriores (CFF_RESULT.calculation_status, CFF_COVERAGE.*_status)
 * dependen de que esta función exista y esté verificada antes.
 *
 * Pseudocódigo del documento (§21):
 *
 *   resolve_status(inputs):
 *     if any critical == INVALID:                 return INVALID
 *     if any critical == INSUFFICIENT:             return INSUFFICIENT
 *     if any critical == VALID_WITH_LIMITATIONS:   return VALID_WITH_LIMITATIONS
 *     return VALID
 *
 * "Una salida downstream no puede tener mayor calidad que una dependencia
 * crítica" (§21) — de ahí el nombre ORDEN_CALIDAD: de peor a mejor,
 * INVALID > INSUFFICIENT > VALID_WITH_LIMITATIONS > VALID.
 */

'use strict';

var ENUMS = require('./enums');

// Orden de severidad, de peor a mejor. NOT_APPLICABLE queda fuera a
// propósito: "NOT_APPLICABLE no es una forma de insuficiencia" (§21) — no
// es una posición degradada dentro de esta escala, es la ausencia de la
// escala. Ver nota de interpretación más abajo.
var ORDEN_CALIDAD = ['INVALID', 'INSUFFICIENT', 'VALID_WITH_LIMITATIONS', 'VALID'];

/**
 * resolveStatus(inputsCriticos)
 *
 * inputsCriticos: array de valores OUTPUT_STATUS — el status de cada
 * dependencia CRÍTICA de la salida que se está resolviendo. "Crítica"
 * es una decisión de quien llama (qué dependencias son críticas para
 * ESTA salida en particular): esta función no lo decide, solo aplica
 * la cascada sobre el conjunto que se le entrega.
 *
 * Nota de interpretación (no literal del pseudocódigo, que no menciona
 * NOT_APPLICABLE en absoluto): una dependencia marcada NOT_APPLICABLE se
 * excluye del conjunto antes de aplicar la cascada. Ni cuenta como
 * degradación (no es INSUFFICIENT/INVALID/VALID_WITH_LIMITATIONS) ni se
 * trata silenciosamente como VALID (sería fabricar calidad que esa
 * dependencia no tiene — no aplica, punto). Si señalas que esta lectura
 * no es la que querías, se corrige — es una inferencia explícita, no un
 * hecho verificado línea por línea del documento.
 *
 * Devuelve un OUTPUT_STATUS. Lanza si `inputsCriticos` no es un array o
 * si contiene un valor que no es un OUTPUT_STATUS válido.
 */
function resolveStatus(inputsCriticos) {
  if (!Array.isArray(inputsCriticos)) {
    throw new Error('resolveStatus: se esperaba un array de OUTPUT_STATUS críticos.');
  }
  inputsCriticos.forEach(function (s) {
    if (ENUMS.OUTPUT_STATUS.indexOf(s) === -1) {
      throw new Error('resolveStatus: "' + s + '" no es un OUTPUT_STATUS válido (' +
        ENUMS.OUTPUT_STATUS.join(' | ') + ').');
    }
  });

  var relevantes = inputsCriticos.filter(function (s) { return s !== 'NOT_APPLICABLE'; });

  if (relevantes.indexOf('INVALID') !== -1) return 'INVALID';
  if (relevantes.indexOf('INSUFFICIENT') !== -1) return 'INSUFFICIENT';
  if (relevantes.indexOf('VALID_WITH_LIMITATIONS') !== -1) return 'VALID_WITH_LIMITATIONS';
  return 'VALID';
}

module.exports = {
  ORDEN_CALIDAD: ORDEN_CALIDAD,
  resolveStatus: resolveStatus
};
