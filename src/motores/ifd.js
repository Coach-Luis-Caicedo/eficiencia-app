/**
 * src/motores/ifd.js -- flujo puro de motor-ifd
 * (DISENO_WORKER_EJECUCION_MOTORES.md §4.6). Cada fila de `ifd_epd` ya
 * tiene la forma EPD_INPUT (transcrita 1:1 en 032). Si hay más de un
 * EPD, agrega con agregarEPDs() -- §13, no se detalla más allá de
 * invocarla (fuera de alcance de este encargo, DISEÑO §7).
 *
 * Hallazgo real (encontrado por ejecución, src/worker.test.mjs): las
 * columnas `q`/`c`/`t`/`r` de `ifd_epd` (032, minúscula, convención SQL)
 * NO coinciden con lo que ESQUEMA_EPD_INPUT exige -- `Q`/`C`/`T`/`R`,
 * MAYÚSCULA exacta, verificado contra motor-ifd/contratos.js (único caso
 * de mayúscula en todo el esquema, las ~38 claves restantes sí coinciden
 * 1:1 con las columnas de la tabla). Sin este remapeo, runEPD() rechaza
 * TODO EPD con "falta: Q, C, T, R" aunque los datos estén completos.
 */

'use strict';

const { runEPD, agregarEPDs } = require('../../motor-ifd/runIFD');

/**
 * calcularIfd(filas) -> { porEpd: [...], agregado: EPD_OUTPUT[]|null }
 * `filas` = salida de motores_eficiencia.leer_epd_ifd().
 */
function calcularIfd(filas) {
  const porEpd = filas.map((fila) => {
    const input = Object.assign({}, fila, { Q: fila.q, C: fila.c, T: fila.t, R: fila.r });
    delete input.q; delete input.c; delete input.t; delete input.r;
    return runEPD(input);
  });
  const outputsValidos = porEpd.filter((r) => r.ok).map((r) => r.output);

  let agregado = null;
  if (outputsValidos.length > 1) {
    agregado = agregarEPDs(outputsValidos);
  }

  return { porEpd: porEpd, agregado: agregado };
}

module.exports = { calcularIfd };
