/**
 * src/motores/sdmo.js -- flujo puro de motor-sdmo
 * (DISENO_WORKER_EJECUCION_MOTORES.md §4.2). Cascada de 2 pasos interna
 * al motor (DISENO_INTEGRADO_TABLAS_ENTRADA_5_MOTORES.md §2.3): primero
 * calcularIDA por persona, LUEGO agregar -- distinto de motor-iao, que
 * agrega variables crudas directamente.
 */

'use strict';

const MotorSDMO = require('../../motor-sdmo/motor-sdmo');

/**
 * calcularSdmo(filas, opts) -> { porPersona, organizacion, perfilPorNodo, nodosExcluidos }
 * `filas` = salida de motores_eficiencia.leer_respuestas_sdmo()
 *   -- cada una con {persona_id, node_id, jornada, acu, com, inv, pen}.
 * `opts.delta` es PENDIENTE_VALIDACION (motor-sdmo.js:334) -- el llamante
 * lo debe traer, no sale de Supabase (DISEÑO §4.2, señalado, no resuelto).
 * `opts.minReportableN` -- mismo tipo de pendiente para la agregación.
 *
 * Hallazgo real (encontrado por ejecución, src/worker.test.mjs):
 * `calcularIDA()` NO devuelve el escalar IDA directo -- devuelve
 * `{respondio, z, M, C, IDA, delta}` (motor-sdmo.js), con el número (o
 * `null` si `respondio:false`) en `.IDA`. `agregarOrganizacion()` exige
 * `idas: Array<number|null>` (motor-sdmo.js:494) -- pasarle el objeto
 * completo lo hace fallar silenciosamente el filtro `esNumero()` interno
 * y excluir a TODOS los respondientes sin avisar (nivelColectivo daba
 * `null` incluso con datos válidos). Corregido extrayendo `.IDA`
 * explícito antes de agrupar por nodo.
 */
function calcularSdmo(filas, opts) {
  const porPersona = filas.map((fila) => {
    const resultado = MotorSDMO.calcularIDA(
      { ACU: fila.acu, COM: fila.com, INV: fila.inv, PEN: fila.pen },
      opts
    );
    return { persona_id: fila.persona_id, node_id: fila.node_id, ida: resultado.IDA, detalle: resultado };
  });

  const porNodo = {};
  porPersona.forEach((p) => {
    (porNodo[p.node_id] = porNodo[p.node_id] || []).push(p.ida);
  });
  const nodos = Object.keys(porNodo).map((nodeId) => ({ id: nodeId, idas: porNodo[nodeId] }));

  const agregado = MotorSDMO.agregarOrganizacion(nodos, opts);
  return {
    porPersona: porPersona,
    organizacion: agregado.organizacion,
    perfilPorNodo: agregado.perfilPorNodo,
    nodosExcluidos: agregado.nodosExcluidos
  };
}

module.exports = { calcularSdmo };
