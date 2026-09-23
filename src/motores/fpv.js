/**
 * src/motores/fpv.js -- flujo puro de motor-fpv
 * (DISENO_WORKER_EJECUCION_MOTORES.md §4.4). Sin adaptador -- runFPV
 * consume la forma de fpv_respuestas directo. `posiciones` ya viaja con
 * datos reales, leídos vía motores_eficiencia.leer_config_posiciones_fpv()
 * (043, cierra PENDIENTES_BRECHAS_WORKER_MOTORES.md §1 --
 * DISENO_CONFIG_POSICION_FPV.md).
 */

'use strict';

const { runFPV } = require('../../motor-fpv/runFPV');

/**
 * valorFpv(v) -- convierte el texto crudo de fpv_respuestas.{f,p,v} a lo
 * que clasificarValorRespuesta() (motor-fpv/contratos.js) realmente
 * exige: 'NE'/'NR' pasan tal cual, pero un ordinal 1-5 debe ser un
 * NÚMERO, no el string '1'..'5' que guarda la tabla (032) --
 * esEnteroFinito() usa `typeof v === 'number'` estricto, sin coerción.
 * Hallazgo real, encontrado por ejecución (src/worker.test.mjs): pasar
 * el string tal cual hace que runFPV rechace la respuesta como INVALIDO.
 */
function valorFpv(v) {
  if (v === 'NE' || v === 'NR') return v;
  return Number(v);
}

/**
 * ensamblarPosiciones(filasConfig) -- reconstruye la forma anidada que
 * runFPV.js:65-74 exige ({ <POSICION>: { N_elegibles?, diseno?,
 * ponderacion? } }) a partir de las filas planas de
 * motores_eficiencia.leer_config_posiciones_fpv() (043) -- a lo sumo 3
 * filas (una por posición), no hace falta ningún join en SQL.
 */
function ensamblarPosiciones(filasConfig) {
  const posiciones = {};
  (filasConfig || []).forEach((fila) => {
    const meta = {};
    if (fila.n_elegibles !== null && fila.n_elegibles !== undefined) meta.N_elegibles = fila.n_elegibles;
    if (fila.diseno_probabilistico !== null && fila.diseno_probabilistico !== undefined) {
      meta.diseno = {
        probabilistico: fila.diseno_probabilistico,
        modelo_documentado: fila.diseno_modelo_documentado
      };
    }
    if (fila.ponderacion_metodologia !== null && fila.ponderacion_metodologia !== undefined) {
      meta.ponderacion = { metodologia: fila.ponderacion_metodologia };
    }
    posiciones[fila.posicion] = meta;
  });
  return posiciones;
}

/**
 * calcularFpv(filas, filasConfig) -> { ok, output } | { ok:false, errores }
 * `filas` = salida de motores_eficiencia.leer_respuestas_fpv()
 *   -- {persona_id, posicion, f, p, v, peso}.
 * `filasConfig` = salida de motores_eficiencia.leer_config_posiciones_fpv()
 *   -- {posicion, period, n_elegibles, diseno_probabilistico,
 *       diseno_modelo_documentado, ponderacion_metodologia}, 0-3 filas.
 */
function calcularFpv(filas, filasConfig) {
  const respuestas = filas.map((fila) => {
    const r = {
      persona_id: fila.persona_id,
      posicion: fila.posicion,
      F: valorFpv(fila.f),
      P: valorFpv(fila.p),
      V: valorFpv(fila.v)
    };
    if (fila.peso !== null && fila.peso !== undefined) r.peso = fila.peso;
    return r;
  });
  return runFPV({ respuestas: respuestas, posiciones: ensamblarPosiciones(filasConfig) });
}

module.exports = { calcularFpv, ensamblarPosiciones };
