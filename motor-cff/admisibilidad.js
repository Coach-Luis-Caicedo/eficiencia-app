/**
 * motor-cff/admisibilidad.js — Fase 4b (i)
 *
 * COMPONENT_ADMISSIBILITY (§18) — compuerta AND estricta. Texto literal:
 * "Un componente puede entrar al universo elegible solo si supera puertas
 * de validez. No existe score ponderado." Las 7 condiciones se evalúan
 * TODAS; basta que UNA falle para excluir — no se promedian ni se
 * compensan entre sí.
 *
 * Primera pieza de Fase 4b que COMPONE señales ya producidas por fases
 * anteriores, en vez de calcular algo nuevo: se verificó contra los
 * module.exports reales de contratos.js, monetizacion.js, atribucion.js,
 * temporalidad.js, nodos.js y relaciones.js que NINGUNO expone hoy
 * monetary_basis_valid / temporal_basis_valid / scope_valid /
 * relationship_resolution_permite_inclusion como campo ya resuelto — son
 * señales que el orquestador (consolidacion.js, Fase 4b-ii) debe calcular
 * llamando a esos módulos y ensamblar antes de invocar esta compuerta.
 * Este módulo no las recalcula, no asume un valor por defecto si faltan
 * (lanza) y no sabe nada de moneda, atribución ni grafos — solo aplica
 * §18 sobre las 7 señales que recibe ya resueltas.
 *
 * event_status: EVENT_STATUS (§22.1, CFF_EVENT — "referenciado por §18
 * COMPONENT_ADMISSIBILITY", nota literal en enums.js).
 *
 * ── Salvaguarda de consistencia interna ─────────────────────────────────
 *
 * §18 es una compuerta binaria: un componente o entra limpio al universo
 * elegible, o queda excluido con motivo. No hay estado intermedio. La
 * salida de esta función refleja eso como un invariante estricto:
 *   admisible === true   ⟺   exclusion_reason === null
 * verificarConsistenciaInterna() se ejecuta sobre TODA salida antes de
 * devolverla y lanza si el par se desincroniza. Con el código correcto
 * nunca se dispara — la batería normal no puede ejercitarlo por la ruta
 * pública.
 *
 * Cubre una clase de mutación distinta de la que atrapa la batería:
 *   - Mutación tipo "solo excluir si fallan las 7" (AND → corte en el
 *     extremo): da un resultado incorrecto pero BIEN FORMADO
 *     (admisible=true + exclusion_reason=null es una forma válida). La
 *     salvaguarda NO la ve; la atrapan los 10 casos de condición
 *     individual de la batería.
 *   - Mutación tipo "crédito parcial" (admisible = fallan menos de N),
 *     que deja el motivo adjunto: produce admisible=true CON
 *     exclusion_reason no nulo — par desincronizado. Esta la atrapa la
 *     salvaguarda en tiempo de ejecución, con error explícito. Verificado
 *     con `admisible: motivos.length >= 4` y 4 condiciones fallando.
 *
 * Se prueba llamándola directamente con datos manipulados (expuesta en
 * module.exports para eso, igual que esConfirmed/esSupported en
 * atribucion.js).
 */

'use strict';

var MONETIZATION_ADMISIBLES = ['OBSERVED', 'ESTIMATED'];
var ATTRIBUTION_ADMISIBLES = ['CONFIRMED', 'SUPPORTED'];

var SEÑALES_OBLIGATORIAS = [
  'component_id', 'event_status', 'monetization_status', 'attribution_status',
  'monetary_basis_valid', 'temporal_basis_valid', 'scope_valid',
  'relationship_resolution_permite_inclusion'
];

/**
 * evaluarAdmisibilidad(componente)
 *
 * componente: {
 *   component_id,
 *   event_status,                                 // EVENT_STATUS
 *   monetization_status,                           // MONETIZATION_STATUS
 *   attribution_status,                            // ATTRIBUTION_STATUS
 *   monetary_basis_valid,                          // boolean, ya resuelto
 *   temporal_basis_valid,                          // boolean, ya resuelto
 *   scope_valid,                                   // boolean, ya resuelto
 *   relationship_resolution_permite_inclusion      // boolean, ya resuelto
 * }
 *
 * Evalúa las 7 condiciones de §18 de forma independiente (ninguna se deja
 * de evaluar por encontrar la primera falla) y acumula TODOS los motivos
 * de exclusión — no solo el primero — porque §18 exige conservar motivo
 * para el registro (no elimina el componente, solo lo excluye del
 * universo elegible con su razón).
 *
 * @returns {{ component_id, admisible: boolean, exclusion_reason: string|null }}
 */
function evaluarAdmisibilidad(componente) {
  if (!componente || typeof componente !== 'object') {
    throw new Error('evaluarAdmisibilidad: se esperaba un objeto de señales de componente.');
  }
  SEÑALES_OBLIGATORIAS.forEach(function (campo) {
    if (componente[campo] === undefined) {
      throw new Error('evaluarAdmisibilidad: falta la señal "' + campo + '" — §18 exige las 7 condiciones ya ' +
        'resueltas por las fases anteriores; este módulo no las recalcula ni asume un valor por defecto.');
    }
  });

  var motivos = [];

  if (componente.event_status !== 'COMPLETE') {
    motivos.push('event_status="' + componente.event_status + '" (§18 exige COMPLETE)');
  }
  if (MONETIZATION_ADMISIBLES.indexOf(componente.monetization_status) === -1) {
    motivos.push('monetization_status="' + componente.monetization_status + '" (§18 exige OBSERVED o ESTIMATED)');
  }
  if (ATTRIBUTION_ADMISIBLES.indexOf(componente.attribution_status) === -1) {
    motivos.push('attribution_status="' + componente.attribution_status + '" (§18 exige CONFIRMED o SUPPORTED)');
  }
  if (componente.monetary_basis_valid !== true) {
    motivos.push('monetary_basis_valid=' + componente.monetary_basis_valid + ' (§18 exige true)');
  }
  if (componente.temporal_basis_valid !== true) {
    motivos.push('temporal_basis_valid=' + componente.temporal_basis_valid + ' (§18 exige true)');
  }
  if (componente.scope_valid !== true) {
    motivos.push('scope_valid=' + componente.scope_valid + ' (§18 exige true)');
  }
  if (componente.relationship_resolution_permite_inclusion !== true) {
    motivos.push('relationship_resolution_permite_inclusion=' + componente.relationship_resolution_permite_inclusion +
      ' (§18 exige que la resolución de relaciones permita la inclusión)');
  }

  if (motivos.length) {
    return verificarConsistenciaInterna({
      component_id: componente.component_id,
      admisible: false,
      exclusion_reason: motivos.join('; ') + '. §18: "Un fallo crítico produce exclusión. La exclusión conserva ' +
        'motivo y no elimina el registro."'
    });
  }
  return verificarConsistenciaInterna({ component_id: componente.component_id, admisible: true, exclusion_reason: null });
}

/**
 * verificarConsistenciaInterna(resultado)
 *
 * Invariante binario de §18: admisible===true ⟺ exclusion_reason===null.
 * Lanza si el par está desincronizado. Con el código correcto nunca se
 * dispara por la ruta pública — ver cabecera del módulo.
 */
function verificarConsistenciaInterna(resultado) {
  var admisibleLimpio = resultado.admisible === true && resultado.exclusion_reason === null;
  var excluidoConMotivo = resultado.admisible === false &&
    typeof resultado.exclusion_reason === 'string' && resultado.exclusion_reason.length > 0;
  if (!admisibleLimpio && !excluidoConMotivo) {
    throw new Error('evaluarAdmisibilidad: inconsistencia interna — "admisible" y "exclusion_reason" deben ir ' +
      'siempre juntos (admisible=true ⟺ exclusion_reason=null). Recibido: admisible=' + resultado.admisible +
      ', exclusion_reason=' + JSON.stringify(resultado.exclusion_reason) + '. §18 es compuerta binaria: o entra ' +
      'limpio, o queda excluido con motivo — no hay estado intermedio.');
  }
  return resultado;
}

module.exports = {
  evaluarAdmisibilidad: evaluarAdmisibilidad,
  // expuesta para prueba dirigida a la salvaguarda (misma convención que
  // esConfirmed/esSupported en atribucion.js) — la ruta pública no puede
  // ejercitarla porque el código correcto nunca viola el invariante.
  verificarConsistenciaInterna: verificarConsistenciaInterna
};
