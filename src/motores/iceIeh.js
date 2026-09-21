/**
 * src/motores/iceIeh.js -- flujo puro de motor-ice-ieh
 * (DISENO_WORKER_EJECUCION_MOTORES.md §4.1). Sin fetch/HTTP aquí --
 * recibe las filas ya leídas de Supabase, devuelve el resultado.
 */

'use strict';

const MotorICEIEH = require('../../motor-ice-ieh/motor-ice-ieh');

/**
 * calcularIceIeh(filas) -> [{persona_id, node_id, ...resultado}]
 * `filas` = salida de motores_eficiencia.leer_respuestas_ice_ieh()
 *   -- cada una con {persona_id, node_id, respuestas, ...}.
 * Sin agregación -- cada fila es independiente (motor-ice-ieh.js:255).
 */
function calcularIceIeh(filas) {
  return filas.map((fila) => {
    const resultado = MotorICEIEH.calcular(fila.respuestas);
    return Object.assign({ persona_id: fila.persona_id, node_id: fila.node_id }, resultado);
  });
}

module.exports = { calcularIceIeh };
