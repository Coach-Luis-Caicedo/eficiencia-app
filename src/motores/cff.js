/**
 * src/motores/cff.js -- flujo puro de motor-cff
 * (DISENO_WORKER_EJECUCION_MOTORES.md §4.5, cerrado con
 * DISENO_SOBRE_CASO_CFF.md). `relaciones` ya viaja con datos reales,
 * leídos vía motores_eficiencia.leer_relaciones_cff() (042, cierra
 * PENDIENTES_BRECHAS_WORKER_MOTORES.md §2 -- DISENO_RELACIONES_CFF.md).
 *
 * `calcularCff` YA NO exige `sobreCaso` como parámetro externo sin
 * resolver -- lo arma internamente a partir de:
 *   (a) `casoDeclarado` -- fila de motores_eficiencia.cff_casos (036),
 *       los campos de JUICIO (Categoría 2, DISENO_SOBRE_CASO_CFF.md §2).
 *   (b) construirCFFRun() -- los campos MECÁNICOS (Categoría 1, §1),
 *       ensamblados en JS, mismo patrón que construirPIIORun()
 *       (motor-piio/runPIIO.js) -- JS puro, nunca una función SQL.
 */

'use strict';

const { runCFF } = require('../../motor-cff/runCFF');
const { hojasBajo } = require('../../motor-cff/nodos');

// ── Categoría 1 — mecánicos (DISENO_SOBRE_CASO_CFF.md §1) ───────────────

// Versión fija del propio motor CFF -- constante en código, no varía por
// organización ni por corrida (a diferencia de motor-piio, que sí tiene
// catálogos configurables por organización). Cambia solo cuando el
// motor mismo se actualiza -- mismo criterio que motor-piio/runPIIO.js
// trata ruleset_version como insumo externo, aquí es un valor fijo
// porque CFF no tiene el equivalente de catálogos versionables por org.
const RULESET_VERSION_CFF = 'CFF-v1.1';

/**
 * construirCFFRun(organizationId, periods, opciones) -> {
 *   run_id, calculation_version, ruleset_version, calculated_at,
 *   generated_at, update_reason
 * }
 * Mismo patrón que construirPIIORun() (motor-piio/runPIIO.js:363-380):
 * calculation_version es un FINGERPRINT determinista de configuración,
 * no un contador; generated_at/calculated_at son el único campo no
 * determinista (misma marca de tiempo para los dos -- van en dos
 * sub-objetos distintos de la salida de runCFF, CFF_RESULT y CFF_RUN,
 * pero se generan en el mismo instante de la corrida).
 *
 * LIMITACIÓN CONOCIDA, no resuelta aquí: el fingerprint de
 * `calculation_version` de motor-piio incluye las versiones de sus
 * catálogos (domain_catalog, node_hierarchy, etc.). Para CFF, la única
 * fuente de versión externa identificada (DISENO_SOBRE_CASO_CFF.md §1.2)
 * sería node_hierarchy -- pero `node_hierarchy_cff_view` (031, la que
 * expone `leer_node_hierarchy_cff`) NO trae la columna `version` (la
 * vista la recorta a {node_id, parent_id} a propósito, 031). Sin una
 * función de lectura nueva contra la tabla rica (`node_hierarchy`, no la
 * vista), el fingerprint aquí solo incluye `ruleset_version` -- más
 * pobre que el de PIIO, pero no se fabrica una fuente de versión que no
 * existe todavía.
 */
function construirCFFRun(organizationId, periods, opciones) {
  const o = opciones || {};
  const calculationVersion = 'rs=' + RULESET_VERSION_CFF;
  const runId = organizationId + '|' + periods.slice().sort().join(',') + '|' + calculationVersion;
  const ahora = o._now || new Date().toISOString();

  return {
    run_id: runId,
    calculation_version: calculationVersion,
    ruleset_version: RULESET_VERSION_CFF,
    calculated_at: ahora,
    generated_at: ahora,
    update_reason: o.updateReason || 'INITIAL'
  };
}

/**
 * mapearCasoDeclaradoASobreCaso(casoDeclarado) -- traduce las columnas
 * snake_case de cff_casos (036) a las claves EXACTAS que runCFF()/
 * validarCaso() exigen -- que mezclan snake_case y camelCase de verdad
 * (verificado en motor-cff/runCFF.js:117-131: SOLO `economicScope` y
 * `nodeRaiz` son camelCase; el resto -- cff_case_id, period_start,
 * scope, reporting_currency, valuation_basis, run_status -- es
 * snake_case o plano). Hallazgo real, mismo tipo que Q/C/T/R en IFD o
 * "references" en PIIO -- no se asume que las claves coinciden 1:1.
 */
function mapearCasoDeclaradoASobreCaso(casoDeclarado) {
  return {
    cff_case_id: casoDeclarado.cff_case_id,
    period_start: casoDeclarado.period_start,
    period_end: casoDeclarado.period_end,
    scope: casoDeclarado.scope,
    reporting_currency: casoDeclarado.reporting_currency,
    valuation_basis: casoDeclarado.valuation_basis,
    economicScope: casoDeclarado.economic_scope,
    nodeRaiz: casoDeclarado.node_raiz,
    // node_set: NULL en la tabla = default mecánico, se deja NULL aquí
    // a propósito -- calcularCff() lo resuelve con hojasBajo() una vez
    // que tiene nodeHierarchy disponible (esta función no lo recibe).
    node_set: casoDeclarado.node_set,
    run_status: casoDeclarado.run_status,
    coberturaSeniales: {
      tratamientoEconomicoSuficiente: casoDeclarado.cobertura_tratamiento_suficiente,
      dependeDeEstimacionesDebiles: casoDeclarado.cobertura_depende_estimaciones_debiles,
      asignacionesLimitadas: casoDeclarado.cobertura_asignaciones_limitadas,
      baseDefendibleParaCifraConsolidada: casoDeclarado.cobertura_base_defendible
    }
  };
}

// ── Señales de admisibilidad §18 (DISENO_SENALES_ADMISIBILIDAD_CFF.md) ──
//
// De las 5, `relationship_resolution_permite_inclusion` NO se toca aquí
// -- consolidacion.js:_paso5Seleccionar la sobreescribe siempre con
// ctx.permiteInclusion[component_id] (verificado por lectura Y por
// ejecución, §1.1), así que cualquier valor que se ponga en el
// componente crudo se ignora. Las otras 3 sí se resuelven aquí, antes
// de que runCFF() las exija.

/**
 * scopeValido(nodeId, nodeSetResuelto) -- DISENO_SENALES_ADMISIBILIDAD_CFF.md
 * §1.5: mejor interpretación disponible, confirmada contra el documento
 * técnico completo (§19, correspondencia categórica con "alcance de
 * nodos") -- el component.node_id participa válidamente del nodeSet ya
 * resuelto para el caso.
 */
function scopeValido(nodeId, nodeSetResuelto) {
  return nodeSetResuelto.indexOf(nodeId) !== -1;
}

/**
 * resolverSenalesComponente(componenteCrudo, nodeSetResuelto) -- agrega
 * las 3 señales derivables (§1.3/§1.4/§1.5) + remapea
 * es_transferencia_interna_pura (snake_case, columna de 037) a
 * esTransferenciaInternaPura (camelCase, la que costos_compartidos.js
 * exige) -- sin mutar la entrada.
 *
 * `monetary_basis_valid`/`temporal_basis_valid` se fijan `true`
 * incondicional: un componente que llega hasta acá ya sobrevivió (o
 * sobrevivirá, dentro del mismo runCFF()) los pasos de grupo VALIDAR/
 * NORMALIZAR (_paso1Validar/_paso2Normalizar, consolidacion.js) que son,
 * con evidencia, la validación real de "base temporal"/"base monetaria"
 * -- si de verdad fueran inválidos, esos pasos excluyen o lanzan ANTES
 * de que este valor importe (DISENO_SENALES_ADMISIBILIDAD_CFF.md §1.3/§1.4).
 */
function resolverSenalesComponente(componenteCrudo, nodeSetResuelto) {
  return Object.assign({}, componenteCrudo, {
    monetary_basis_valid: true,
    temporal_basis_valid: true,
    scope_valid: scopeValido(componenteCrudo.node_id, nodeSetResuelto),
    esTransferenciaInternaPura: componenteCrudo.es_transferencia_interna_pura
  });
}

/**
 * calcularCff(eventosConComponentes, casoDeclarado, nodeHierarchy, relacionesCrudas, organizationId, periods, opciones) -> CFF_RESULT
 *
 * `eventosConComponentes` = salida de motores_eficiencia.leer_eventos_cff().
 * `casoDeclarado` = salida de motores_eficiencia.leer_caso_cff() (036) --
 *   UNA fila (un caso ya declarado por un analista vía registrar_caso_cff).
 * `nodeHierarchy` = salida de motores_eficiencia.leer_node_hierarchy_cff()
 *   (036) -- forma {node_id, parent_id} que consolidarPeriodoYAlcance exige.
 * `relacionesCrudas` = salida de motores_eficiencia.leer_relaciones_cff()
 *   (042) -- array de ECONOMIC_RELATION, snake_case directo, sin mapeo
 *   de claves (a diferencia de casoDeclarado -- verificado en
 *   motor-cff/relaciones.js, INVESTIGACION_RELACIONES_CFF.md §2).
 */
function calcularCff(eventosConComponentes, casoDeclarado, nodeHierarchy, relacionesCrudas, organizationId, periods, opciones) {
  const sobreCasoDeclarado = mapearCasoDeclaradoASobreCaso(casoDeclarado);

  // node_set: si quedó NULL (default mecánico pedido, Luis confirmación
  // 1), resolverlo aquí con hojasBajo() -- motor-cff/nodos.js, mismo
  // criterio que clasificarAlcance ya usa internamente.
  if (sobreCasoDeclarado.node_set == null) {
    sobreCasoDeclarado.node_set = hojasBajo(sobreCasoDeclarado.nodeRaiz, nodeHierarchy);
  }

  // Señales de admisibilidad por componente -- DEBE correr después de
  // resolver node_set (scope_valid lo necesita ya resuelto, no NULL).
  const eventosConSenales = eventosConComponentes.map(function (ev) {
    return Object.assign({}, ev, {
      components: ev.components.map(function (c) {
        return resolverSenalesComponente(c, sobreCasoDeclarado.node_set);
      })
    });
  });

  const genealogia = construirCFFRun(organizationId, periods, opciones);

  const caso = Object.assign(
    {},
    sobreCasoDeclarado,
    genealogia,
    { nodeHierarchy: nodeHierarchy, eventos: eventosConSenales, relaciones: relacionesCrudas || [] }
  );

  return runCFF(caso);
}

module.exports = { calcularCff, construirCFFRun, mapearCasoDeclaradoASobreCaso, resolverSenalesComponente, scopeValido };
