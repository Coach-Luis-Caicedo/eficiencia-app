/**
 * motor-cff/temporalidad.js — Fase 4a
 *
 * Temporalidad, frecuencia y comparabilidad (§16). Este módulo FILTRA y
 * AGRUPA — no transforma ni inventa fórmulas que el documento no da (mismo
 * criterio que costos_compartidos.js en Fase 3: exigir declaración
 * explícita en vez de fabricar un algoritmo).
 *
 * ── Extensión de invocación #1: período del componente ───────────────────
 *
 * §16.2 exige saber a qué período pertenece cada ECONOMIC_COMPONENT de un
 * event_id que atraviesa varios períodos — pero ECONOMIC_COMPONENT (§22.2,
 * Fase 0) NO tiene period_start/period_end propio (solo CFF_EVENT los
 * tiene, a nivel del evento completo). Se recibe como parámetro explícito
 * de quien llama (mismo patrón que esTransferenciaInternaPura/
 * baseAsignacionDocumentada en Fase 3) — NO se agregó a ECONOMIC_COMPONENT
 * en contratos.js. Ver README, "Parámetros de invocación no cubiertos por
 * el contrato de datos".
 *
 * ── Extensión de invocación #2: transformación STOCK/RATE→flujo ──────────
 *
 * §16 exige "transformación validada a flujo" para STOCK/RATE antes de
 * sumar, sin dar el algoritmo (depende del fenómeno). Este módulo NO
 * transforma — filtra: PERIOD_FLOW se suma directo; STOCK/RATE requieren
 * que quien llama declare transformacionValidada=true y aporte
 * valorFlujoEquivalente ya calculado externamente.
 */

'use strict';

// ── §16 — naturaleza temporal: filtrar, no transformar ───────────────────

/**
 * filtrarSumablesPorNaturalezaTemporal(componentes)
 *
 * componentes: array de { component_id, temporal_nature, original_value,
 *   transformacionValidada?, valorFlujoEquivalente? }.
 *
 * @returns {{ sumables: Array<{component_id, valor}>, excluidos: Array<{component_id, motivo}> }}
 */
function filtrarSumablesPorNaturalezaTemporal(componentes) {
  var sumables = [], excluidos = [];
  componentes.forEach(function (c) {
    if (c.temporal_nature === 'PERIOD_FLOW') {
      sumables.push({ component_id: c.component_id, valor: c.original_value });
      return;
    }
    if (c.temporal_nature === 'STOCK' || c.temporal_nature === 'RATE') {
      if (c.transformacionValidada === true && typeof c.valorFlujoEquivalente === 'number') {
        sumables.push({ component_id: c.component_id, valor: c.valorFlujoEquivalente });
        return;
      }
      excluidos.push({
        component_id: c.component_id,
        motivo: c.temporal_nature + ' sin transformación validada a flujo (§16) — se requiere ' +
          'transformacionValidada=true y valorFlujoEquivalente explícito; el motor no inventa la fórmula ' +
          '(depende del fenómeno, el documento no la especifica).'
      });
      return;
    }
    throw new Error('filtrarSumablesPorNaturalezaTemporal: temporal_nature desconocida "' + c.temporal_nature + '" para "' + c.component_id + '".');
  });
  return { sumables: sumables, excluidos: excluidos };
}

/**
 * validarFrecuenciaConsistente(componentes)
 *
 * §16.1: "Una tasa mensual no equivale a una tasa anual; un flujo anual no
 * se divide entre 12 silenciosamente." No hay fórmula de conversión entre
 * frecuencias — se exige que todos los componentes que se van a sumar
 * directamente compartan la misma aggregation_frequency; si no, lanza (no
 * divide ni multiplica en silencio).
 */
function validarFrecuenciaConsistente(componentes) {
  if (!componentes.length) return { valido: true, frecuencia: null };
  var frecuencias = {};
  componentes.forEach(function (c) { frecuencias[c.aggregation_frequency] = true; });
  var distintas = Object.keys(frecuencias);
  if (distintas.length > 1) {
    throw new Error('validarFrecuenciaConsistente: los componentes mezclan aggregation_frequency (' +
      distintas.join(', ') + ') — §16.1 prohíbe dividir/multiplicar silenciosamente para hacerlas compatibles.');
  }
  return { valido: true, frecuencia: distintas[0] };
}

// ── §16.2 — mismo event_id a través de varios períodos ───────────────────

/**
 * agruparComponentesPorPeriodo(eventId, componentesConPeriodo)
 *
 * componentesConPeriodo: array de { component_id, event_id, period_start,
 *   period_end, original_value } — el período viene declarado por quien
 *   llama (extensión #1, ver cabecera).
 *
 * Verifica que todos pertenezcan al MISMO event_id (§16.2: "la partición
 * temporal debe conservar la identidad del evento") y agrupa por período,
 * sumando dentro de cada uno — sin crear un evento nuevo por período.
 *
 * @returns {{
 *   porPeriodo: Array<{ period_start, period_end, componentes: string[], subtotal: number }>,
 *   totalEvento: number
 * }}
 */
function agruparComponentesPorPeriodo(eventId, componentesConPeriodo) {
  if (!Array.isArray(componentesConPeriodo) || !componentesConPeriodo.length) {
    throw new Error('agruparComponentesPorPeriodo: se esperaba un array no vacío de componentes con período.');
  }
  componentesConPeriodo.forEach(function (c) {
    if (c.event_id !== eventId) {
      throw new Error('agruparComponentesPorPeriodo: componente "' + c.component_id + '" tiene event_id="' +
        c.event_id + '", distinto de "' + eventId + '" — §16.2 exige conservar la identidad del evento, ' +
        'no partir en eventos nuevos.');
    }
  });

  var grupos = {};
  var orden = [];
  componentesConPeriodo.forEach(function (c) {
    var clave = c.period_start + '..' + c.period_end;
    if (!grupos[clave]) {
      grupos[clave] = { period_start: c.period_start, period_end: c.period_end, componentes: [], subtotal: 0 };
      orden.push(clave);
    }
    grupos[clave].componentes.push(c.component_id);
    grupos[clave].subtotal += c.original_value;
  });

  var porPeriodo = orden.map(function (clave) { return grupos[clave]; });
  var totalEvento = porPeriodo.reduce(function (s, g) { return s + g.subtotal; }, 0);
  return { porPeriodo: porPeriodo, totalEvento: totalEvento };
}

// ── §16.3 — anualización post-consolidación ──────────────────────────────

/**
 * anualizar(valorConsolidado, valorAnualizadoPropuesto, opts)
 *
 * §16.3: "La anualización ocurre DESPUÉS de consolidar y solo si el
 * período es representativo, existe recurrencia suficiente, la
 * estacionalidad está controlada y el fenómeno no es extraordinario. Debe
 * registrar método, supuestos y período base."
 *
 * El documento exige las 4 condiciones de la compuerta, pero NO da la
 * fórmula de escalamiento (depende del fenómeno, mismo motivo que
 * STOCK/RATE→flujo) — esta función NO calcula el valor anualizado, lo
 * recibe ya calculado (`valorAnualizadoPropuesto`) y decide si la
 * compuerta permite aceptarlo como parte del registro. NUNCA modifica
 * `valorConsolidado` (el total consolidado permanece intacto como fuente
 * de verdad — arquitectura confirmada por Luis).
 *
 * @param {number} valorConsolidado  CFF_TOTAL ya consolidado (no se toca).
 * @param {number} valorAnualizadoPropuesto  calculado externamente.
 * @param {{ periodoRepresentativo:boolean, recurrenciaSuficiente:boolean,
 *           estacionalidadControlada:boolean, esExtraordinario:boolean,
 *           metodo:string, supuestos:string, periodoBase:string }} opts
 * @returns {{ aceptada:boolean, annualization:Object|null, motivo:string }}
 */
function anualizar(valorConsolidado, valorAnualizadoPropuesto, opts) {
  if (typeof valorConsolidado !== 'number') {
    throw new Error('anualizar: valorConsolidado debe ser numérico.');
  }
  opts = opts || {};
  var faltantes = ['periodoRepresentativo', 'recurrenciaSuficiente', 'estacionalidadControlada', 'esExtraordinario']
    .filter(function (k) { return typeof opts[k] !== 'boolean'; });
  if (faltantes.length) {
    throw new Error('anualizar: faltan condiciones booleanas explícitas de la compuerta §16.3: ' + faltantes.join(', ') + '.');
  }
  if (!opts.metodo || !opts.supuestos || !opts.periodoBase) {
    throw new Error('anualizar: §16.3 exige registrar método, supuestos y período base — no se anualiza sin ellos.');
  }

  var razonesRechazo = [];
  if (!opts.periodoRepresentativo) razonesRechazo.push('el período no es representativo');
  if (!opts.recurrenciaSuficiente) razonesRechazo.push('no existe recurrencia suficiente');
  if (!opts.estacionalidadControlada) razonesRechazo.push('la estacionalidad no está controlada');
  if (opts.esExtraordinario) razonesRechazo.push('el fenómeno es extraordinario');

  if (razonesRechazo.length) {
    return {
      aceptada: false,
      annualization: null,
      motivo: 'Compuerta §16.3 no satisfecha: ' + razonesRechazo.join('; ') + '. valorConsolidado permanece como única cifra válida.'
    };
  }

  return {
    aceptada: true,
    annualization: {
      valorAnualizado: valorAnualizadoPropuesto,
      metodo: opts.metodo,
      supuestos: opts.supuestos,
      periodoBase: opts.periodoBase
    },
    motivo: 'Compuerta §16.3 satisfecha — annualization se agrega como registro aparte, valorConsolidado no se modifica.'
  };
}

module.exports = {
  filtrarSumablesPorNaturalezaTemporal: filtrarSumablesPorNaturalezaTemporal,
  validarFrecuenciaConsistente: validarFrecuenciaConsistente,
  agruparComponentesPorPeriodo: agruparComponentesPorPeriodo,
  anualizar: anualizar
};
