/**
 * src/motores/iao.js -- flujo puro de motor-iao
 * (DISENO_WORKER_EJECUCION_MOTORES.md §4.3). motor-iao NO tiene tabla ni
 * función de lectura propia -- consume la salida YA calculada de
 * motor-ice-ieh, vía el adaptador de claves (DISENO_INTEGRADO...§2.2-2.3).
 */

'use strict';

const MotorICEIEH = require('../../motor-ice-ieh/motor-ice-ieh');
const MotorIAO = require('../../motor-iao/motor-iao');
const { mapearVariablesAIao } = require('../lib/adaptadorIceIehIao');

/**
 * calcularIao(filasIceIeh, opts) -> { organizacion, perfilPorNodo, ... }
 * `filasIceIeh` = salida de motores_eficiencia.leer_respuestas_ice_ieh()
 *   -- MISMA función que alimenta a motor-ice-ieh directo (§4.1), reusada
 *   aquí, no una lectura propia (DISEÑO §2, cierre).
 */
function calcularIao(filasIceIeh, opts) {
  const porNodo = {};
  filasIceIeh.forEach((fila) => {
    const variables = MotorICEIEH.calcular(fila.respuestas).variables;
    const mapeadas = mapearVariablesAIao(variables);
    (porNodo[fila.node_id] = porNodo[fila.node_id] || []).push(mapeadas);
  });
  const nodos = Object.keys(porNodo).map((nodeId) => ({ id: nodeId, personas: porNodo[nodeId] }));

  return MotorIAO.agregarOrganizacion(nodos, opts);
}

module.exports = { calcularIao };
