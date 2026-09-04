/**
 * motor-integracion/pipeline.js
 *
 * Arnés de integración REAL entre motor-ice-ieh y motor-iao — primera vez
 * que se conectan de verdad (relación "con otros instrumentos" de la regla
 * de las tres relaciones). Los dos módulos en vendor/ son copias sin
 * modificar de sus ramas fuente (confirmado byte-idéntico antes de escribir
 * este archivo) — este harness NO toca motor-ice-ieh.js ni motor-iao.js,
 * solo los usa por su API pública tal como está.
 *
 * ── Hallazgo de frontera #1: los nombres de clave NO coinciden ───────────
 *
 * motor-ice-ieh.calcular().variables usa las 10 claves completas en
 * español (estructura, intencion, impacto, nexo, integracion, fortaleza,
 * coherencia, equilibrio, confianza, actitud). motor-iao.calcular() exige
 * las claves cortas (EST, INE, IMP, NEX, ITG, FOR, COH, EQU, CNF, ACT) — su
 * propio comentario dice "mismos códigos que ICE-IEH, contrato compartido",
 * pero el objeto que ICE-IEH realmente expone no usa esos códigos como
 * clave de nivel superior; los códigos solo viven en `prefijo`, un campo de
 * metadata POR PREGUNTA (PREGUNTAS[i].prefijo), no en el objeto `variables`
 * agregado. Sin un adaptador explícito, la salida real de motor-ice-ieh NO
 * es directamente consumible por motor-iao — ningún test aislado de
 * ninguno de los dos módulos podía detectar esto, porque motor-iao siempre
 * se probó con sintéticos ya en formato EST/INE/... y motor-ice-ieh nunca
 * necesitó producir esa forma para sus propias pruebas.
 *
 * El mapeo en sí NO es ambiguo (cada variable tiene exactamente un prefijo,
 * verificable 1:1 desde PREGUNTAS) — es mecánico, no una decisión de
 * diseño con varias lecturas posibles. Se construye aquí DERIVADO de la
 * metadata que motor-ice-ieh ya expone (PREGUNTAS, PARES), no hardcodeado
 * a mano: si motor-ice-ieh cambiara algún nombre de variable, este mapeo lo
 * sigue automáticamente en vez de quedar desincronizado en silencio.
 */

'use strict';

var MotorICEIEH = require('./vendor/motor-ice-ieh/motor-ice-ieh');
var MotorIAO = require('./vendor/motor-iao/motor-iao');

/**
 * { estructura: 'EST', intencion: 'INE', impacto: 'IMP', nexo: 'NEX',
 *   integracion: 'ITG', fortaleza: 'FOR', coherencia: 'COH',
 *   equilibrio: 'EQU', confianza: 'CNF', actitud: 'ACT' }
 * Derivado de PREGUNTAS (plano ICE|IEH) — no incluye IND-EF/IND-IC.
 */
function construirMapaVariableAPrefijo() {
  var mapa = {};
  MotorICEIEH.PREGUNTAS.forEach(function (p) {
    if (p.plano !== 'ICE' && p.plano !== 'IEH') return; // excluye IND-EF/IND-IC
    if (mapa[p.variable] && mapa[p.variable] !== p.prefijo) {
      throw new Error('construirMapaVariableAPrefijo: "' + p.variable + '" tiene más de un prefijo (' +
        mapa[p.variable] + ' vs ' + p.prefijo + ').');
    }
    mapa[p.variable] = p.prefijo;
  });
  return mapa;
}
var MAPA_VARIABLE_A_PREFIJO = construirMapaVariableAPrefijo();

/**
 * { estructura_fortaleza: 'EF', intencion_coherencia: 'IC',
 *   impacto_equilibrio: 'IE', nexo_confianza: 'NC', integracion_actitud: 'IA' }
 * Derivado cruzando MotorICEIEH.PARES (nombres largos) con MotorIAO.PARES
 * (códigos de par) a través del mapa de variables — no hardcodeado.
 */
function construirMapaParIceIehAIao() {
  var mapa = {};
  MotorICEIEH.PARES.forEach(function (parIce) {
    var codSistema = MAPA_VARIABLE_A_PREFIJO[parIce.ice];
    var codExperiencia = MAPA_VARIABLE_A_PREFIJO[parIce.ieh];
    var candidatos = MotorIAO.PARES.filter(function (p) {
      return p.sistema === codSistema && p.experiencia === codExperiencia;
    });
    if (candidatos.length !== 1) {
      throw new Error('construirMapaParIceIehAIao: no se encontró (o se encontró más de un) par IAO ' +
        'correspondiente a "' + parIce.clave + '" (' + codSistema + '/' + codExperiencia + ').');
    }
    mapa[parIce.clave] = candidatos[0].clave;
  });
  return mapa;
}
var MAPA_PAR_ICEIEH_A_IAO = construirMapaParIceIehAIao();

/**
 * mapearVariablesAIao(variablesIceIeh) — { estructura: 78.3, ... } →
 * { EST: 78.3, ... }. Pura, no muta la entrada.
 */
function mapearVariablesAIao(variablesIceIeh) {
  var out = {};
  Object.keys(MAPA_VARIABLE_A_PREFIJO).forEach(function (varLarga) {
    out[MAPA_VARIABLE_A_PREFIJO[varLarga]] = variablesIceIeh[varLarga];
  });
  return out;
}

/**
 * ejecutarPipeline(respuestas)
 *
 * 31 respuestas (P1-P31) → motor-ice-ieh.calcular() → 10 variables (mapeadas)
 * → motor-iao.calcular() → { iceIeh, variablesParaIao, iao }.
 *
 * Sin sintéticos en el punto de conexión: variablesParaIao es exactamente
 * la salida real de motor-ice-ieh, solo re-etiquetada por clave.
 */
function ejecutarPipeline(respuestas) {
  var iceIeh = MotorICEIEH.calcular(respuestas);
  var variablesParaIao = mapearVariablesAIao(iceIeh.variables);
  var iao = MotorIAO.calcular(variablesParaIao);
  return { iceIeh: iceIeh, variablesParaIao: variablesParaIao, iao: iao };
}

/**
 * compararBrechas(resultadoPipeline)
 *
 * Compara, para los 5 pares, la brecha calculada por motor-ice-ieh (§8.6,
 * dentro de resultadoPipeline.iceIeh.brechas) contra la recalculada de
 * forma independiente por motor-iao (dentro de resultadoPipeline.iao.brechas)
 * a partir de las MISMAS 10 variables (ya mapeadas). Devuelve un array de
 * { par, iceIeh, iao, diferencia, coincideExacto } — no colapsa el resultado
 * a un solo booleano, para que la comparación numérica sea inspeccionable.
 */
function compararBrechas(resultadoPipeline) {
  return MotorICEIEH.PARES.map(function (parIce) {
    var claveIao = MAPA_PAR_ICEIEH_A_IAO[parIce.clave];
    var valorIceIeh = resultadoPipeline.iceIeh.brechas[parIce.clave];
    var valorIao = resultadoPipeline.iao.brechas['B_' + claveIao];
    return {
      par: parIce.clave,
      claveIao: claveIao,
      iceIeh: valorIceIeh,
      iao: valorIao,
      diferencia: valorIceIeh - valorIao,
      coincideExacto: valorIceIeh === valorIao
    };
  });
}

module.exports = {
  MotorICEIEH: MotorICEIEH,
  MotorIAO: MotorIAO,
  MAPA_VARIABLE_A_PREFIJO: MAPA_VARIABLE_A_PREFIJO,
  MAPA_PAR_ICEIEH_A_IAO: MAPA_PAR_ICEIEH_A_IAO,
  mapearVariablesAIao: mapearVariablesAIao,
  ejecutarPipeline: ejecutarPipeline,
  compararBrechas: compararBrechas
};
