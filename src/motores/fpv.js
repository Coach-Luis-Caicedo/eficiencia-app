/**
 * src/motores/fpv.js -- flujo puro de motor-fpv
 * (DISENO_WORKER_EJECUCION_MOTORES.md §4.4). Sin adaptador -- runFPV
 * consume la forma de fpv_respuestas directo.
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
 * calcularFpv(filas) -> { ok, output } | { ok:false, errores }
 * `filas` = salida de motores_eficiencia.leer_respuestas_fpv()
 *   -- {persona_id, posicion, f, p, v, peso}.
 */
function calcularFpv(filas) {
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
  return runFPV({ respuestas: respuestas });
}

module.exports = { calcularFpv };
