/**
 * motor-cff/relaciones.js — Fase 3
 *
 * Relaciones económicas (§13), grafo y detección de ciclos (§13.3).
 * NO clasifica qué relation_type aplica a un par de componentes — eso ya
 * viene decidido en el registro de ECONOMIC_RELATION (§22.5) por quien lo
 * crea. Este módulo aplica las CONSECUENCIAS de una clasificación ya hecha
 * (qué se puede sumar, qué se excluye, por qué) — mismo principio que
 * contratos.js: valida/aplica forma, no infiere contenido.
 *
 * ── Ciclos (§13.3) — generalizado más allá del ejemplo literal ───────────
 *
 * El documento dice: "Ciclos inconsistentes, COMO A CONTAINS B y B CONTAINS
 * A..." — "como" se lee como ejemplo, no como el único caso. Se implementa
 * detección de ciclo general (cualquier longitud) sobre el subgrafo
 * CONTAINS, no solo el caso de 2 nodos. Documentado como interpretación
 * explícita, no como literal del texto.
 *
 * ── El "escape" de ciclos queda inerte — decisión confirmada por Luis ────
 *
 * El texto también dice "...SIN EQUIVALENCIA EXPLÍCITA" — implicando que un
 * ciclo podría ser válido si existe esa equivalencia. Pero ECONOMIC_RELATION
 * (§22.5, Fase 0) no tiene ningún campo para declararla. Confirmado con
 * Luis: NO se fabrica un campo nuevo para esto (mismo criterio que
 * recovery_realization_type/CFF y attribution/AIE — una extensión de
 * contrato se hace cuando Luis la pide explícitamente, no por iniciativa
 * propia). Todo ciclo CONTAINS se trata como inválido SIN excepción — la
 * excepción textual del documento queda inerte por ausencia de mecanismo
 * en el contrato, no por decisión de descartarla conceptualmente.
 */

'use strict';

// ── §13.3 grafo y ciclos ──────────────────────────────────────────────────

/**
 * construirGrafoContains(relaciones)
 *
 * relaciones: array de ECONOMIC_RELATION (o subconjunto con al menos
 *   relation_type, component_a_id, component_b_id).
 * @returns {Object} lista de adyacencia { componentId: [componentId, ...] }
 *   para relation_type === 'CONTAINS' (component_a CONTAINS component_b →
 *   arista dirigida a → b).
 */
function construirGrafoContains(relaciones) {
  var grafo = {};
  relaciones.forEach(function (r) {
    if (r.relation_type !== 'CONTAINS') return;
    if (!grafo[r.component_a_id]) grafo[r.component_a_id] = [];
    grafo[r.component_a_id].push(r.component_b_id);
    if (!grafo[r.component_b_id]) grafo[r.component_b_id] = [];
  });
  return grafo;
}

/**
 * detectarCiclosContains(relaciones)
 *
 * DFS con pila de recursión (coloreo blanco/gris/negro) sobre el subgrafo
 * CONTAINS — detecta cualquier ciclo dirigido, no solo el par A↔B.
 *
 * @returns { tieneCiclo: boolean, ciclos: Array<string[]> }
 *   ciclos: cada uno es la secuencia de component_id que forman el ciclo
 *   (el primero se repite al final para que quede explícito el cierre).
 */
function detectarCiclosContains(relaciones) {
  var grafo = construirGrafoContains(relaciones);
  var estado = {}; // 'gris' = en la pila actual, 'negro' = ya resuelto
  var pila = [];
  var ciclos = [];

  function dfs(nodo) {
    estado[nodo] = 'gris';
    pila.push(nodo);
    (grafo[nodo] || []).forEach(function (vecino) {
      if (estado[vecino] === 'gris') {
        var inicio = pila.indexOf(vecino);
        ciclos.push(pila.slice(inicio).concat(vecino));
      } else if (estado[vecino] !== 'negro') {
        dfs(vecino);
      }
    });
    pila.pop();
    estado[nodo] = 'negro';
  }

  Object.keys(grafo).forEach(function (nodo) {
    if (!estado[nodo]) dfs(nodo);
  });

  return { tieneCiclo: ciclos.length > 0, ciclos: ciclos };
}

/**
 * validarGrafoContains(relaciones)
 *
 * Envoltura de conveniencia: { valido, ciclos }. valido=false invalida el
 * grafo de consolidación completo (§13.3) — no es un fallo de un solo
 * componente, bloquea la corrida afectada (mismo principio que §25
 * BLOCKING para fallos globales).
 */
function validarGrafoContains(relaciones) {
  var r = detectarCiclosContains(relaciones);
  return { valido: !r.tieneCiclo, ciclos: r.ciclos };
}

// ── §13 reglas de suma por tipo de relación ──────────────────────────────

/**
 * resolverRelacion(relacion, valores)
 *
 * relacion: un ECONOMIC_RELATION (relation_type, containment_scope?,
 *   quantified_overlap_value?, selected_primary?, resolution_status,
 *   component_a_id, component_b_id).
 * valores: { [component_id]: number } — el valor monetario ya resuelto de
 *   cada componente (de Fase 1/monetizacion.js), indexado por component_id.
 *
 * NO decide si la relación es de un tipo u otro — eso ya viene en
 * relacion.relation_type. Aplica la consecuencia de sumar/excluir.
 *
 * @returns {{
 *   sumables: Array<{component_id, valor}>,
 *   excluidos: Array<{component_id, motivo}>,
 *   totalParcial: number|null   // suma de `sumables`, o null si ninguno es sumable
 * }}
 */
function resolverRelacion(relacion, valores) {
  var a = relacion.component_a_id, b = relacion.component_b_id;
  var va = valores[a], vb = valores[b];
  if (typeof va !== 'number' || typeof vb !== 'number') {
    throw new Error('resolverRelacion: se requiere el valor resuelto de ambos componentes (' + a + ', ' + b + ').');
  }

  function ambosSumables(motivo) {
    return { sumables: [{ component_id: a, valor: va }, { component_id: b, valor: vb }], excluidos: [], totalParcial: va + vb, motivo: motivo };
  }
  function ningunoSumable(motivo) {
    return {
      sumables: [], excluidos: [{ component_id: a, motivo: motivo }, { component_id: b, motivo: motivo }],
      totalParcial: null, motivo: motivo
    };
  }
  function soloUno(idElegido, valorElegido, idExcluido, motivo) {
    return {
      sumables: [{ component_id: idElegido, valor: valorElegido }],
      excluidos: [{ component_id: idExcluido, motivo: motivo }],
      totalParcial: valorElegido, motivo: motivo
    };
  }

  switch (relacion.relation_type) {
    case 'INDEPENDENT':
      // "Pueden sumarse si ambas son admisibles" (§13) — la admisibilidad
      // (§18) es de Fase 4b; aquí se asume que ya se filtró antes de llegar.
      return ambosSumables('INDEPENDENT: pérdidas distintas, ambas admisibles → se suman');

    case 'DUPLICATE':
      // Simétrica. Requiere selección explícita de una representación —
      // nunca promediar (§13, §22, INV-CFF-22). Sin resolución/selección
      // clara, no se puede determinar cuál mantener sin arriesgar doble
      // conteo → conservador, se excluyen ambos del total pleno (§25: perder
      // cobertura antes que inventar valor).
      if (relacion.resolution_status === 'RESOLVED' && relacion.selected_primary) {
        var elegidoDup = relacion.selected_primary;
        var otroDup = elegidoDup === a ? b : a;
        if (elegidoDup !== a && elegidoDup !== b) {
          throw new Error('resolverRelacion: selected_primary "' + elegidoDup + '" no es ni component_a_id ni component_b_id.');
        }
        return soloUno(elegidoDup, valores[elegidoDup], otroDup, 'DUPLICATE resuelto: se mantiene la representación seleccionada (' + elegidoDup + ')');
      }
      return ningunoSumable('DUPLICATE sin resolver: no hay selected_primary confirmado — se excluyen ambos del total pleno para no arriesgar doble conteo');

    case 'CONTAINS':
      if (relacion.containment_scope === 'FULL') {
        // "FULL impide sumar contenedor y contenido" — se conserva el
        // CONTENEDOR (component_a, que ya incorpora al contenido), se
        // excluye el CONTENIDO — mismo principio que AGGREGATE_ONLY (§15):
        // usar el agregado que ya contiene a sus descendientes.
        return soloUno(a, va, b, 'CONTAINS FULL: se conserva el contenedor (' + a + '), se excluye el contenido (' + b + ') ya incorporado en él');
      }
      if (relacion.containment_scope === 'PARTIAL_QUANTIFIED') {
        var overlap = relacion.quantified_overlap_value;
        if (typeof overlap !== 'number') {
          throw new Error('resolverRelacion: CONTAINS PARTIAL_QUANTIFIED requiere quantified_overlap_value numérico.');
        }
        // Inclusión-exclusión: total = contenedor + contenido − solapamiento,
        // para no contar el tramo compartido dos veces ("descomposición
        // mutuamente exclusiva", §13.1).
        var totalPQ = va + vb - overlap;
        return {
          sumables: [{ component_id: a, valor: va }, { component_id: b, valor: vb }],
          excluidos: [],
          totalParcial: totalPQ,
          ajusteSolapamiento: overlap,
          motivo: 'CONTAINS PARTIAL_QUANTIFIED: total = ' + a + ' + ' + b + ' − solapamiento(' + overlap + ') = ' + totalPQ
        };
      }
      if (relacion.containment_scope === 'PARTIAL_UNQUANTIFIED') {
        // "Impide un total conjunto pleno" (§13.1, AC10) — no se produce
        // total pleno; ambos quedan visibles pero fuera del total.
        return ningunoSumable('CONTAINS PARTIAL_UNQUANTIFIED: solapamiento no cuantificado — no se produce un total pleno (§13.1, AC10)');
      }
      throw new Error('resolverRelacion: CONTAINS requiere containment_scope válido (ya debería haber sido exigido por contratos.js).');

    case 'ALTERNATIVE_VALUATION':
      // "Seleccionar una valoración primaria común; no promediar" — mismo
      // patrón que DUPLICATE: sin selección resuelta, no se puede promediar
      // ni adivinar cuál usar → se excluyen ambas del total pleno.
      if (relacion.resolution_status === 'RESOLVED' && relacion.selected_primary) {
        var elegidoAV = relacion.selected_primary;
        var otroAV = elegidoAV === a ? b : a;
        if (elegidoAV !== a && elegidoAV !== b) {
          throw new Error('resolverRelacion: selected_primary "' + elegidoAV + '" no es ni component_a_id ni component_b_id.');
        }
        return soloUno(elegidoAV, valores[elegidoAV], otroAV, 'ALTERNATIVE_VALUATION resuelta: se mantiene la valoración seleccionada (' + elegidoAV + '), nunca se promedia');
      }
      return ningunoSumable('ALTERNATIVE_VALUATION sin resolver: no hay selected_primary — no se promedia, se excluyen ambas del total pleno');

    case 'DEPENDENT_COST':
      // "Puede sumarse solo si la frontera económica es distinta y no está
      // contenida" — Fase 3 no demuestra la frontera; usa resolution_status
      // como el registro de que esa demostración ya ocurrió (§13.2:
      // "si la frontera económica no puede demostrarse, la relación
      // permanece UNRESOLVED").
      if (relacion.resolution_status === 'RESOLVED') {
        return ambosSumables('DEPENDENT_COST resuelto: frontera económica distinta demostrada, consumos separados → se suman');
      }
      return ningunoSumable('DEPENDENT_COST sin resolver (§13.2): la frontera económica no fue demostrada — no se suma');

    case 'UNKNOWN':
      // "No presumir independencia; excluir del total pleno si el riesgo de
      // solapamiento es material." El documento no da un campo para medir
      // "materialidad" — por el mismo sesgo de §25 (perder cobertura antes
      // que inventar valor), se trata como material por defecto: se
      // excluyen ambos, visibles pero fuera del total pleno.
      return ningunoSumable('UNKNOWN: relación no resoluble con la evidencia disponible — se trata el riesgo de solapamiento como material por defecto (§25), se excluyen ambos del total pleno');

    default:
      throw new Error('resolverRelacion: relation_type desconocido "' + relacion.relation_type + '".');
  }
}

module.exports = {
  construirGrafoContains: construirGrafoContains,
  detectarCiclosContains: detectarCiclosContains,
  validarGrafoContains: validarGrafoContains,
  resolverRelacion: resolverRelacion
};
