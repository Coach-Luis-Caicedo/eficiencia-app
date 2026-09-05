/**
 * motor-cff/versionamiento.js — Fase 5
 *
 * §25 (fallos, advertencias, short-circuit) + §26 (versionamiento,
 * reproducibilidad, auditoría). Funciones puras — NO se cablean al
 * orquestador automáticamente (mismo criterio que estados.js en Fase 0):
 * runCFF.js ya maneja severidad de errores de forma informal; este módulo
 * formaliza §25/§26 y la Parte C de Fase 5 decide si runCFF debe
 * delegarle (con reporte previo, no tocando código comiteado a la ligera).
 *
 * ── §25 — severidad y short-circuit ────────────────────────────────────
 *
 *   WARNING   : no cambia necesariamente el status; conserva la advertencia.
 *   DEGRADED  : la salida afectada no puede superar VALID_WITH_LIMITATIONS.
 *   BLOCKING  : impide publicar la salida afectada; si el problema es
 *               GLOBAL, invalida la corrida completa.
 *
 * "Fallos locales vs. globales": un evento inválido no detiene eventos
 * independientes (local); una moneda base inválida, un grafo económico
 * inconsistente no resoluble o una corrupción de versiones bloquean la
 * corrida completa (global).
 *
 * ── §26 — versionamiento / inmutabilidad / staleness ───────────────────
 *
 *   - Un resultado histórico NUNCA se sobrescribe; una revisión crea una
 *     nueva versión (INV-CFF-65). crearNuevaVersion() no muta la anterior.
 *   - Un cambio de assessment / fórmula / FX / índice de precios / relación
 *     económica / ruleset genera una nueva corrida CUANDO modifica el
 *     resultado (§26, INV-CFF-51) — no por el solo hecho de cambiar.
 *   - STALE (§26.2, INV-CFF-66): no reescribe ni invalida el resultado
 *     histórico; solo indica que existe una versión posterior
 *     potencialmente material. marcarStale() devuelve un objeto NUEVO.
 */

'use strict';

var ENUMS = require('./enums');

// ── §25 — short-circuit ────────────────────────────────────────────────

// Causas de BLOCKING GLOBAL (invalidan la corrida completa), §25 literal.
var CAUSAS_GLOBALES = {
  MONEDA_BASE_INVALIDA: true,
  GRAFO_INCONSISTENTE_NO_RESOLUBLE: true,
  CORRUPCION_VERSIONES: true
};

var ORDEN_SEVERIDAD = { WARNING: 0, DEGRADED: 1, BLOCKING: 2 };

/**
 * evaluarShortCircuit(errores)
 *
 * errores: array de { code, severity: 'WARNING'|'DEGRADED'|'BLOCKING',
 *   scope?: 'local'|'global', ref? }. `scope` se infiere de CAUSAS_GLOBALES
 *   si no viene declarado (un BLOCKING con un code de causa global es
 *   global aunque no lo diga).
 *
 * @returns {{
 *   techoCalculationStatus: 'VALID'|'VALID_WITH_LIMITATIONS'|'INVALID',
 *   corridaInvalidada: boolean,     // hay un BLOCKING global
 *   salidasBloqueadas: string[],    // refs de BLOCKING locales
 *   advertencias: Array             // los WARNING, conservados
 * }}
 */
function evaluarShortCircuit(errores) {
  if (!Array.isArray(errores)) {
    throw new Error('evaluarShortCircuit: se esperaba un array de errores.');
  }
  errores.forEach(function (e) {
    if (!e || ORDEN_SEVERIDAD[e.severity] === undefined) {
      throw new Error('evaluarShortCircuit: severity inválida "' + (e && e.severity) + '" — WARNING|DEGRADED|BLOCKING.');
    }
  });

  var hayBlocking = false, hayDegraded = false;
  var corridaInvalidada = false;
  var salidasBloqueadas = [];
  var advertencias = [];

  errores.forEach(function (e) {
    if (e.severity === 'BLOCKING') {
      hayBlocking = true;
      var esGlobal = e.scope === 'global' || (e.scope == null && CAUSAS_GLOBALES[e.code] === true);
      if (esGlobal) {
        corridaInvalidada = true;
      } else {
        salidasBloqueadas.push(e.ref != null ? e.ref : '(sin ref)');
      }
    } else if (e.severity === 'DEGRADED') {
      hayDegraded = true;
    } else {
      advertencias.push(e);
    }
  });

  var techo = hayBlocking ? 'INVALID' : (hayDegraded ? 'VALID_WITH_LIMITATIONS' : 'VALID');

  return {
    techoCalculationStatus: techo,
    corridaInvalidada: corridaInvalidada,
    salidasBloqueadas: salidasBloqueadas.slice().sort(),
    advertencias: advertencias
  };
}

/**
 * aplicarTecho(statusPropuesto, techo)
 *
 * §25: un DEGRADED impone que la salida no supere VALID_WITH_LIMITATIONS;
 * un BLOCKING la lleva a INVALID. Devuelve el PEOR de los dos según
 * ORDEN_CALIDAD (INVALID > VALID_WITH_LIMITATIONS > VALID). Reutiliza la
 * escala de estados.js sin duplicarla conceptualmente.
 */
var ORDEN_CALIDAD = ['INVALID', 'VALID_WITH_LIMITATIONS', 'VALID']; // peor → mejor (subconjunto de estados.ORDEN_CALIDAD sin INSUFFICIENT)
function aplicarTecho(statusPropuesto, techo) {
  [statusPropuesto, techo].forEach(function (s) {
    if (ORDEN_CALIDAD.indexOf(s) === -1) {
      throw new Error('aplicarTecho: "' + s + '" fuera de {INVALID, VALID_WITH_LIMITATIONS, VALID}.');
    }
  });
  return ORDEN_CALIDAD.indexOf(statusPropuesto) < ORDEN_CALIDAD.indexOf(techo) ? statusPropuesto : techo;
}

// ── §26 — versionamiento ───────────────────────────────────────────────

// §26 literal: "Un cambio de assessment, fórmula, FX, índice de precios,
// relación económica o ruleset genera una nueva corrida cuando modifica el
// resultado."
var TIPOS_CAMBIO_VERSIONABLES = ['ASSESSMENT', 'FORMULA', 'FX', 'INDICE_PRECIOS', 'RELACION_ECONOMICA', 'RULESET'];

/**
 * cambioRequiereNuevaCorrida(tipoCambio, modificaResultado)
 *
 * §26 / INV-CFF-51: SOLO se exige nueva corrida si el cambio es de un tipo
 * versionable Y efectivamente modifica el resultado. Un cambio versionable
 * que NO modifica el resultado no fuerza una corrida nueva; un cambio de
 * un tipo no listado tampoco.
 */
function cambioRequiereNuevaCorrida(tipoCambio, modificaResultado) {
  if (typeof modificaResultado !== 'boolean') {
    throw new Error('cambioRequiereNuevaCorrida: modificaResultado debe declararse explícito (boolean) — ' +
      '§26 condiciona la nueva corrida a que el cambio modifique el resultado, no se infiere.');
  }
  return TIPOS_CAMBIO_VERSIONABLES.indexOf(tipoCambio) !== -1 && modificaResultado === true;
}

/**
 * crearNuevaVersion(runAnterior, cambios)
 *
 * INV-CFF-65: un resultado histórico no se sobrescribe. Devuelve un CFF_RUN
 * NUEVO con parent_calculation_version = runAnterior.calculation_version;
 * NO muta `runAnterior` (se congela con Object.freeze como garantía y la
 * inmutabilidad se verifica por test).
 *
 * cambios: { calculation_version (nueva, obligatoria), update_reason
 *   (obligatoria), ...campos a sobreescribir }.
 */
function crearNuevaVersion(runAnterior, cambios) {
  if (!runAnterior || typeof runAnterior !== 'object') {
    throw new Error('crearNuevaVersion: runAnterior debe ser un CFF_RUN.');
  }
  cambios = cambios || {};
  if (!cambios.calculation_version || !cambios.update_reason) {
    throw new Error('crearNuevaVersion: se requieren cambios.calculation_version (nueva) y cambios.update_reason.');
  }
  if (cambios.calculation_version === runAnterior.calculation_version) {
    throw new Error('crearNuevaVersion: la nueva calculation_version no puede ser igual a la anterior (' +
      runAnterior.calculation_version + ') — una revisión crea una versión DISTINTA (INV-CFF-65).');
  }
  Object.freeze(runAnterior);

  var nueva = {};
  Object.keys(runAnterior).forEach(function (k) { nueva[k] = runAnterior[k]; });
  Object.keys(cambios).forEach(function (k) { nueva[k] = cambios[k]; });
  nueva.parent_calculation_version = runAnterior.calculation_version;
  return nueva;
}

/**
 * marcarStale(resultadoHistorico, calculationVersionVigente)
 *
 * §26.2 / INV-CFF-66: STALE no reescribe ni invalida el resultado
 * histórico — indica que existe una versión posterior potencialmente
 * material. Devuelve un objeto NUEVO con calculation_status='STALE' y
 * stale_ref; NO toca el original (congelado + verificado por test).
 */
function marcarStale(resultadoHistorico, calculationVersionVigente) {
  if (!resultadoHistorico || typeof resultadoHistorico !== 'object') {
    throw new Error('marcarStale: resultadoHistorico debe ser un CFF_RESULT.');
  }
  if (!calculationVersionVigente) {
    throw new Error('marcarStale: se requiere la calculation_version vigente (la que vuelve STALE a esta).');
  }
  if (calculationVersionVigente === resultadoHistorico.calculation_version) {
    throw new Error('marcarStale: la versión vigente no puede ser la misma que se marca STALE.');
  }
  if (ENUMS.CALCULATION_STATUS.indexOf('STALE') === -1) {
    throw new Error('marcarStale: STALE no está en CALCULATION_STATUS (imposible).');
  }
  Object.freeze(resultadoHistorico);

  var copia = {};
  Object.keys(resultadoHistorico).forEach(function (k) { copia[k] = resultadoHistorico[k]; });
  copia.calculation_status = 'STALE';
  copia.stale_ref = calculationVersionVigente;
  copia.stale_note = 'STALE (§26.2, INV-CFF-66): existe la versión ' + calculationVersionVigente +
    ' como posterior potencialmente material. Este resultado histórico NO es falso ni se invalida — solo deja de ser ' +
    'la versión vigente para decisiones actuales.';
  return copia;
}

module.exports = {
  evaluarShortCircuit: evaluarShortCircuit,
  aplicarTecho: aplicarTecho,
  cambioRequiereNuevaCorrida: cambioRequiereNuevaCorrida,
  crearNuevaVersion: crearNuevaVersion,
  marcarStale: marcarStale,
  CAUSAS_GLOBALES: CAUSAS_GLOBALES,
  TIPOS_CAMBIO_VERSIONABLES: TIPOS_CAMBIO_VERSIONABLES
};
