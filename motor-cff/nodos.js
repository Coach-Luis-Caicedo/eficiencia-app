/**
 * motor-cff/nodos.js — Fase 3
 *
 * Nodos y alcance organizacional (§15): las 4 reglas LEAF_ONLY / AGGREGATE_ONLY /
 * NO_PARENT_CHILD_DOUBLE_COUNT / SEGMENT_ONLY.
 *
 * ── NODE_HIERARCHY — extensión de este módulo, no del documento ──────────
 *
 * §15 exige "una jerarquía explícita" de nodos pero el documento NUNCA
 * define el contrato de esa jerarquía (no hay NODE_HIERARCHY en §22).
 * Aprobado por Luis: se recibe como input explícito, mínimo:
 *
 *   NODE_HIERARCHY = [{ node_id, parent_id }, ...]   (parent_id=null en la raíz)
 *
 * Es infraestructura que §15 exige para poder ejecutarse, no alcance
 * fabricado — mismo criterio que la agregación temporal del arnés
 * motor-sdmo↔AIE (motor-integracion-sdmo-aie/pipeline.js).
 */

'use strict';

function _validarJerarquia(nodeHierarchy) {
  if (!Array.isArray(nodeHierarchy)) {
    throw new Error('nodos: NODE_HIERARCHY debe ser un array de {node_id, parent_id}.');
  }
  var vistos = {};
  nodeHierarchy.forEach(function (n) {
    if (!n || typeof n.node_id !== 'string') {
      throw new Error('nodos: cada entrada de NODE_HIERARCHY requiere node_id (string).');
    }
    if (n.parent_id !== null && typeof n.parent_id !== 'string') {
      throw new Error('nodos: parent_id de "' + n.node_id + '" debe ser string o null (raíz).');
    }
    if (vistos[n.node_id]) {
      throw new Error('nodos: node_id "' + n.node_id + '" declarado más de una vez en NODE_HIERARCHY.');
    }
    vistos[n.node_id] = true;
  });
  nodeHierarchy.forEach(function (n) {
    if (n.parent_id !== null && !vistos[n.parent_id]) {
      throw new Error('nodos: parent_id "' + n.parent_id + '" (declarado por "' + n.node_id + '") no existe en NODE_HIERARCHY.');
    }
  });
}

function _mapaPorId(nodeHierarchy) {
  var m = {};
  nodeHierarchy.forEach(function (n) { m[n.node_id] = n; });
  return m;
}

/** hijosDirectos(nodeId, nodeHierarchy) → array de node_id */
function hijosDirectos(nodeId, nodeHierarchy) {
  return nodeHierarchy.filter(function (n) { return n.parent_id === nodeId; }).map(function (n) { return n.node_id; });
}

/** esHoja(nodeId, nodeHierarchy) → true si no tiene hijos */
function esHoja(nodeId, nodeHierarchy) {
  return hijosDirectos(nodeId, nodeHierarchy).length === 0;
}

/** descendientes(nodeId, nodeHierarchy) → todos los descendientes (no incluye nodeId) */
function descendientes(nodeId, nodeHierarchy) {
  var out = [];
  var pendientes = hijosDirectos(nodeId, nodeHierarchy).slice();
  while (pendientes.length) {
    var actual = pendientes.shift();
    out.push(actual);
    pendientes = pendientes.concat(hijosDirectos(actual, nodeHierarchy));
  }
  return out;
}

/** hojas(nodeId, nodeHierarchy) → subconjunto de descendientes(+nodeId si es hoja) que son hojas */
function hojasBajo(nodeId, nodeHierarchy) {
  if (esHoja(nodeId, nodeHierarchy)) return [nodeId];
  var out = [];
  descendientes(nodeId, nodeHierarchy).forEach(function (d) {
    if (esHoja(d, nodeHierarchy)) out.push(d);
  });
  return out;
}

/** ancestros(nodeId, nodeHierarchy) → array de node_id, de padre inmediato a raíz */
function ancestros(nodeId, nodeHierarchy) {
  var mapa = _mapaPorId(nodeHierarchy);
  var out = [];
  var actual = mapa[nodeId];
  if (!actual) throw new Error('nodos: node_id "' + nodeId + '" no existe en NODE_HIERARCHY.');
  while (actual.parent_id !== null) {
    out.push(actual.parent_id);
    actual = mapa[actual.parent_id];
  }
  return out;
}

/**
 * validarConjuntoNodos(nodeSet, nodeHierarchy, opts)
 *
 * Verifica NO_PARENT_CHILD_DOUBLE_COUNT: ningún nodo del conjunto puede ser
 * ancestro de otro nodo del mismo conjunto — sumar ambos sumaría dos veces
 * lo que el padre ya contiene (si el padre es AGGREGATE_ONLY) o violaría
 * la exclusión mutua exigida por §15 en cualquier caso.
 *
 * @returns { valido, violaciones: [{ padre, hijo }] }
 */
function validarConjuntoNodos(nodeSet, nodeHierarchy) {
  _validarJerarquia(nodeHierarchy);
  if (!Array.isArray(nodeSet) || nodeSet.length === 0) {
    throw new Error('nodos: nodeSet debe ser un array no vacío de node_id.');
  }
  var violaciones = [];
  nodeSet.forEach(function (nodoA) {
    var antepasadosA = ancestros(nodoA, nodeHierarchy);
    nodeSet.forEach(function (nodoB) {
      if (nodoA === nodoB) return;
      if (antepasadosA.indexOf(nodoB) !== -1) {
        violaciones.push({ padre: nodoB, hijo: nodoA });
      }
    });
  });
  return { valido: violaciones.length === 0, violaciones: violaciones };
}

/**
 * clasificarAlcance(nodeSet, nodeRaiz, nodeHierarchy)
 *
 * Clasifica un nodeSet, relativo a un nodo raíz de referencia (p.ej. el
 * nodo "ORGANIZACION"), en uno de:
 *   - 'AGGREGATE_ONLY'  — nodeSet = [nodeRaiz] exactamente (un solo nodo
 *                          agregado cuyo valor ya contiene a sus descendientes).
 *   - 'LEAF_ONLY'       — nodeSet = exactamente el conjunto de hojas bajo
 *                          nodeRaiz (mutuamente excluyentes, perímetro completo).
 *   - 'SEGMENT'         — nodeSet no cubre el perímetro completo de nodeRaiz
 *                          (ni como agregado único, ni como el total de hojas)
 *                          → SEGMENT_ONLY: no se escala a nodeRaiz sin modelo
 *                          explícito de representatividad (§15, la propia regla).
 *
 * NO_PARENT_CHILD_DOUBLE_COUNT se valida siempre, sea cual sea la clasificación
 * — un nodeSet con violaciones no es válido bajo ninguna de las 3 etiquetas.
 */
function clasificarAlcance(nodeSet, nodeRaiz, nodeHierarchy) {
  var validacion = validarConjuntoNodos(nodeSet, nodeHierarchy);
  if (!validacion.valido) {
    return { alcance: 'INVALIDO', razon: 'NO_PARENT_CHILD_DOUBLE_COUNT violado', violaciones: validacion.violaciones };
  }

  if (nodeSet.length === 1 && nodeSet[0] === nodeRaiz) {
    return { alcance: 'AGGREGATE_ONLY', razon: 'nodeSet es el nodo raíz agregado (' + nodeRaiz + ')' };
  }

  var hojasRaiz = hojasBajo(nodeRaiz, nodeHierarchy).slice().sort();
  var setOrdenado = nodeSet.slice().sort();
  var esTodasLasHojas = JSON.stringify(hojasRaiz) === JSON.stringify(setOrdenado);
  if (esTodasLasHojas) {
    return { alcance: 'LEAF_ONLY', razon: 'nodeSet cubre exactamente las hojas de ' + nodeRaiz + ' (perímetro completo)' };
  }

  return {
    alcance: 'SEGMENT',
    razon: 'nodeSet no cubre el perímetro completo de ' + nodeRaiz + ' (ni agregado único, ni todas sus hojas) — ' +
      'SEGMENT_ONLY: no se escala a ' + nodeRaiz + ' sin modelo explícito de representatividad (§15)',
    hojasEsperadas: hojasRaiz,
    hojasRecibidas: setOrdenado
  };
}

module.exports = {
  hijosDirectos: hijosDirectos,
  esHoja: esHoja,
  descendientes: descendientes,
  hojasBajo: hojasBajo,
  ancestros: ancestros,
  validarConjuntoNodos: validarConjuntoNodos,
  clasificarAlcance: clasificarAlcance
};
