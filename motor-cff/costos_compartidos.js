/**
 * motor-cff/costos_compartidos.js — Fase 3
 *
 * Costos compartidos, asignación y transferencias internas (§14).
 *
 * ── Costos compartidos — no prorratear sin evidencia ─────────────────────
 *
 * "Un costo compartido se registra una sola vez... La falta de criterio
 * defendible no autoriza prorrateos iguales arbitrarios." ECONOMIC_COMPONENT
 * ya tiene `shared_cost_id?` (Fase 0), pero el documento no da un campo que
 * diga si el original_value de cada componente del grupo YA es su porción
 * asignada (sumar es seguro) o si cada uno reporta el monto completo
 * (sumar duplicaría). Aprobado por Luis: quien llama declara explícitamente,
 * junto con el grupo, si existe una base de asignación documentada
 * (`baseAsignacionDocumentada: true|false`). Sin ella (o en false), el
 * grupo se marca UNALLOCATED y se excluye de la suma — visible, no
 * eliminado del registro — en vez de prorratear igual por defecto.
 *
 * ── Transferencias internas puras — requieren declaración explícita ──────
 *
 * Verificado antes de fabricar un campo (a pedido de Luis): ninguno de los
 * 4 PRIMARY_MECHANISM describe una reasignación contable pura (los 4 exigen
 * una consecuencia operacional real de fricción) — pero primary_mechanism
 * es OBLIGATORIO en ECONOMIC_COMPONENT (§22.2), así que todo componente,
 * sea transferencia pura o no, must declarar uno de los 4 valores para
 * pasar la validación de contrato. La sola presencia de un primary_mechanism
 * válido NUNCA distingue un componente genuino de una transferencia
 * disfrazada con el mecanismo de su origen — no hay señal utilizable en el
 * contrato existente. Se requiere que quien llama declare explícitamente
 * `esTransferenciaInternaPura: true|false` por componente.
 */

'use strict';

/**
 * resolverCostoCompartido(grupo, opts)
 *
 * grupo: array de { component_id, original_value } — todos los componentes
 *   que comparten un mismo shared_cost_id.
 * opts: { baseAsignacionDocumentada: boolean, descripcionBase?: string }
 *
 * @returns {{
 *   estado: 'ASIGNADO'|'UNALLOCATED',
 *   sumables: Array<{component_id, valor}>,   // [] si UNALLOCATED
 *   totalParcial: number|null,
 *   motivo: string
 * }}
 */
function resolverCostoCompartido(grupo, opts) {
  if (!Array.isArray(grupo) || grupo.length === 0) {
    throw new Error('resolverCostoCompartido: se esperaba un array no vacío de componentes del grupo compartido.');
  }
  opts = opts || {};
  if (opts.baseAsignacionDocumentada !== true) {
    return {
      estado: 'UNALLOCATED',
      sumables: [],
      totalParcial: null,
      motivo: 'Sin base de asignación documentada — el grupo permanece UNALLOCATED (§14: "la falta de criterio ' +
        'defendible no autoriza prorrateos iguales arbitrarios"). Los componentes siguen visibles en el registro, ' +
        'excluidos solo de la suma.'
    };
  }
  var sumables = grupo.map(function (c) { return { component_id: c.component_id, valor: c.original_value }; });
  var total = grupo.reduce(function (s, c) { return s + c.original_value; }, 0);
  return {
    estado: 'ASIGNADO',
    sumables: sumables,
    totalParcial: total,
    motivo: 'Base de asignación documentada' + (opts.descripcionBase ? ' (' + opts.descripcionBase + ')' : '') +
      ' — se asume que original_value de cada componente ya es su porción asignada; se suman sin reprocesar.'
  };
}

/**
 * filtrarTransferenciasInternasPuras(componentes)
 *
 * componentes: array de ECONOMIC_COMPONENT (o subconjunto), cada uno con un
 *   campo adicional `esTransferenciaInternaPura: boolean` — DECLARADO por
 *   quien llama (no existe en el contrato ECONOMIC_COMPONENT de §22.2; ver
 *   nota de cabecera sobre por qué primary_mechanism no sirve como señal).
 *   Componentes sin este campo se tratan como NO transferencia (false por
 *   ausencia no es lo mismo que confirmarlo — se exige explícito).
 *
 * "Transferencias internas puras se eliminan en consolidación
 * organizacional. Los recursos reales consumidos se conservan." (§14)
 *
 * @param {string} alcanceObjetivo  'NODE' | 'ORGANIZATION' — a qué alcance
 *   se está consolidando. Las transferencias puras solo se eliminan cuando
 *   el alcance objetivo es ORGANIZATION (a nivel de NODE siguen siendo
 *   reales para ese nodo — el §14 solo habla de "consolidación
 *   organizacional").
 *
 * @returns {{ conservados: Array, eliminados: Array }}
 */
function filtrarTransferenciasInternasPuras(componentes, alcanceObjetivo) {
  if (alcanceObjetivo !== 'NODE' && alcanceObjetivo !== 'ORGANIZATION') {
    throw new Error('filtrarTransferenciasInternasPuras: alcanceObjetivo debe ser "NODE" o "ORGANIZATION".');
  }
  componentes.forEach(function (c) {
    if (typeof c.esTransferenciaInternaPura !== 'boolean') {
      throw new Error('filtrarTransferenciasInternasPuras: el componente "' + c.component_id + '" no declara ' +
        'esTransferenciaInternaPura explícitamente (true/false) — no se asume por ausencia.');
    }
  });
  if (alcanceObjetivo === 'NODE') {
    return { conservados: componentes.slice(), eliminados: [] };
  }
  var conservados = componentes.filter(function (c) { return !c.esTransferenciaInternaPura; });
  var eliminados = componentes.filter(function (c) { return c.esTransferenciaInternaPura; });
  return { conservados: conservados, eliminados: eliminados };
}

module.exports = {
  resolverCostoCompartido: resolverCostoCompartido,
  filtrarTransferenciasInternasPuras: filtrarTransferenciasInternasPuras
};
