/**
 * src/lib/adaptadorIceIehIao.js
 *
 * Adaptador de claves motor-ice-ieh -> motor-iao -- lógica derivada de
 * motor-integracion/pipeline.js:46-58 ("Hallazgo de frontera #1":
 * motor-ice-ieh.calcular().variables usa nombres largos en español,
 * motor-iao.calcular() exige códigos cortos), pero reimportada aquí
 * contra los motores REALES de la raíz del repo, no contra el `vendor/`
 * de ese harness -- confirmado por diff que `vendor/motor-iao/motor-iao.js`
 * está desactualizado respecto a `motor-iao/motor-iao.js`
 * (DISENO_EJECUCION_MOTORES_CONTRA_DATOS_GUARDADOS.md §2.3).
 *
 * Solo se porta `mapearVariablesAIao` (+ su dependencia,
 * `construirMapaVariableAPrefijo`) -- `construirMapaParIceIehAIao` y
 * `compararBrechas` del harness original eran herramientas de
 * verificación (comparar Brecha calculada por los dos motores), no hacen
 * falta para calcular un IAO real.
 */

'use strict';

const MotorICEIEH = require('../../motor-ice-ieh/motor-ice-ieh');

/**
 * { estructura: 'EST', intencion: 'INE', impacto: 'IMP', nexo: 'NEX',
 *   integracion: 'ITG', fortaleza: 'FOR', coherencia: 'COH',
 *   equilibrio: 'EQU', confianza: 'CNF', actitud: 'ACT' }
 * Derivado de PREGUNTAS (plano ICE|IEH) -- no incluye IND-EF/IND-IC.
 * Mismo mecanismo exacto que motor-integracion/pipeline.js:46-57.
 */
function construirMapaVariableAPrefijo() {
  const mapa = {};
  MotorICEIEH.PREGUNTAS.forEach((p) => {
    if (p.plano !== 'ICE' && p.plano !== 'IEH') return;
    if (mapa[p.variable] && mapa[p.variable] !== p.prefijo) {
      throw new Error('construirMapaVariableAPrefijo: "' + p.variable + '" tiene más de un prefijo (' +
        mapa[p.variable] + ' vs ' + p.prefijo + ').');
    }
    mapa[p.variable] = p.prefijo;
  });
  return mapa;
}
const MAPA_VARIABLE_A_PREFIJO = construirMapaVariableAPrefijo();

/**
 * mapearVariablesAIao(variablesIceIeh) -- { estructura: 78.3, ... } ->
 * { EST: 78.3, ... }. Pura, no muta la entrada.
 */
function mapearVariablesAIao(variablesIceIeh) {
  const out = {};
  Object.keys(MAPA_VARIABLE_A_PREFIJO).forEach((varLarga) => {
    out[MAPA_VARIABLE_A_PREFIJO[varLarga]] = variablesIceIeh[varLarga];
  });
  return out;
}

module.exports = { MAPA_VARIABLE_A_PREFIJO, mapearVariablesAIao };
