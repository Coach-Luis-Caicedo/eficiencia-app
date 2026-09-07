/**
 * motor-ifd/calibracion.js — Fase 8
 *
 * §36 — Verificación posterior y calibración. Módulo RETROSPECTIVO: se
 * corre DESPUÉS del piloto, con valores observados reales (Y_obs). NO
 * toca el camino de cálculo en vivo.
 *
 *   Errorᵢ = Y_obs − Y_proj
 *   EAᵢ    = |Y_obs − Y_proj|
 *   MAE    = (1/n) Σ |Y_obs − Y_proj|
 *   Sesgo  = (1/n) Σ (Y_proj − Y_obs)
 *
 * ── SIGNO DE `Sesgo` — literal de §36, opuesto a `Error` ─────────────
 *
 * `Error = Y_obs − Y_proj` PERO `Sesgo = (1/n) Σ (Y_proj − Y_obs)` —
 * signos OPUESTOS. Se implementa EXACTAMENTE como §36 lo escribe, no se
 * "corrige" para que ambos usen la misma convención (eso sería fabricar
 * una lectura que el documento no pide). Consecuencia: `Sesgo > 0` ⟺ el
 * motor SOBRE-proyecta en promedio (Y_proj mayor que Y_obs).
 *
 * ── "Los errores solo se agregan entre variables comparables" (§36) ──
 *
 * §36 no define qué hace comparables a dos variables — no hay frase de
 * refuerzo (a diferencia de "material" en §25). DECISIÓN DE DISEÑO DE
 * LUIS (como "dirección adversa" §21.2, `unit` §23.1, "homogéneo"=mismo
 * impact_type §29#15): se toma "mismo variable_type" como criterio de
 * comparabilidad. calibrarLote agrupa por variable_type y NUNCA produce un
 * MAE/Sesgo global cruzando tipos. Una lectura más estricta podría exigir
 * además la misma unidad física — pero `unit` no está en EPD_OUTPUT
 * (reapertura #7 se acotó a variable_type) y §36 no lo especifica.
 *
 * ── QUÉ SE PUEDE AFIRMAR CON DATOS SINTÉTICOS vs. QUÉ QUEDA PENDIENTE ─
 *
 * AHORA (datos sintéticos): que la aritmética de Error/EA/MAE/Sesgo/
 * cobertura es correcta según §36, y que la regla de comparabilidad se
 * hace cumplir. Verificable con mutación real.
 *
 * PENDIENTE HASTA EL PILOTO: si el motor CALIBRA BIEN — si el MAE real es
 * aceptable, si el Sesgo real es cercano a cero, si la cobertura empírica
 * se acerca a la nominal del envelope (±7% / ±15%, hoy PENDIENTE_CALIBRACION).
 * Y la calibración de rúbricas / suficiencia de serie / HMS / percentiles /
 * métodos por variable / parámetros de contención (§36 los enumera; todos
 * siguen abiertos). Nada de eso se puede afirmar con datos inventados.
 *
 * Sin contraste con el oráculo: el engine Python no tiene función de
 * calibración agregada (como agregarEPDs).
 */

'use strict';

var contratos = require('./contratos');

function num(v) { return typeof v === 'number' && isFinite(v); }

// ── §36 — métricas puntuales ─────────────────────────────────────────

/** Errorᵢ = Y_obs − Y_proj  (§36) */
function errorEPD(y_obs, y_proj) {
  if (!num(y_obs) || !num(y_proj)) throw new Error('errorEPD: y_obs e y_proj deben ser numéricos.');
  return y_obs - y_proj;
}

/** EAᵢ = |Y_obs − Y_proj|  (§36) */
function errorAbsoluto(y_obs, y_proj) {
  return Math.abs(errorEPD(y_obs, y_proj));
}

// ── §36 — métricas de lote ───────────────────────────────────────────

function _validarPares(pares, quien) {
  if (!Array.isArray(pares) || pares.length === 0) {
    throw new Error(quien + ': se esperaba un array no vacío de { y_obs, y_proj }.');
  }
  pares.forEach(function (p, i) {
    if (!p || !num(p.y_obs) || !num(p.y_proj)) throw new Error(quien + ': par[' + i + '] inválido (y_obs/y_proj numéricos).');
  });
}

/** MAE = (1/n) Σ |Y_obs − Y_proj|  (§36) */
function mae(pares) {
  _validarPares(pares, 'mae');
  var s = pares.reduce(function (acc, p) { return acc + Math.abs(p.y_obs - p.y_proj); }, 0);
  return s / pares.length;
}

/**
 * Sesgo = (1/n) Σ (Y_proj − Y_obs)  (§36, LITERAL — opuesto a Error)
 * Sesgo > 0 ⟺ el motor sobre-proyecta.
 */
function sesgo(pares) {
  _validarPares(pares, 'sesgo');
  var s = pares.reduce(function (acc, p) { return acc + (p.y_proj - p.y_obs); }, 0);
  return s / pares.length;
}

/**
 * cobertura(items) → { n, dentro, fuera, tasa }
 *
 * §36: "Cuando se emitan rangos, también debe evaluarse cobertura: si el
 * valor observado cae dentro del intervalo proyectado." items =
 * [{ y_obs, L, U }]. Solo EPD que emitieron rango — los que no, no entran
 * aquí. Frontera incluida (L ≤ y_obs ≤ U). `tasa` = null si n === 0.
 */
function cobertura(items) {
  if (!Array.isArray(items)) throw new Error('cobertura: se esperaba un array de { y_obs, L, U }.');
  var dentro = 0, n = 0;
  items.forEach(function (it, i) {
    if (!it || !num(it.y_obs) || !num(it.L) || !num(it.U)) throw new Error('cobertura: item[' + i + '] inválido (y_obs/L/U numéricos).');
    n++;
    if (it.y_obs >= it.L && it.y_obs <= it.U) dentro++;
  });
  return { n: n, dentro: dentro, fuera: n - dentro, tasa: n === 0 ? null : dentro / n };
}

// ── §36 — calibración de un lote de EPD_OUTPUT + Y_obs ───────────────

/**
 * calibrarLote(observaciones) → {
 *   ok: boolean,
 *   por_variable: { <variable_type>: { n, mae, sesgo, cobertura } },
 *   no_calibrables: [{ epd_id, output_level, status, motivo }],
 *   notes: string[],
 *   errors?: string[]
 * }
 *
 * observaciones = [{ output: EPD_OUTPUT, y_obs: number }]. Opera solo
 * sobre EPD_OUTPUT (como agregarEPDs); y_obs es el único dato nuevo (del
 * piloto). Extrae y_proj = projection_base, y L/U = projection_lower/upper.
 *
 * §36 "los errores solo se agregan entre variables comparables": se
 * agrupa por variable_type; NUNCA se produce un MAE/Sesgo global cruzando
 * tipos (decisión de diseño — ver cabecera).
 *
 * Solo entran los EPD CUANTIFICADO con projection_base numérico
 * (decisión D). Los S0/S1 van en no_calibrables, sin métrica — nunca
 * hicieron una afirmación cuantitativa que calibrar.
 */
function calibrarLote(observaciones) {
  if (!Array.isArray(observaciones)) {
    return { ok: false, errors: ['calibrarLote: se esperaba un array de { output, y_obs }.'] };
  }
  var errores = [];
  observaciones.forEach(function (o, i) {
    if (!o || typeof o !== 'object') { errores.push('obs[' + i + ']: no es un objeto { output, y_obs }'); return; }
    if (!num(o.y_obs)) errores.push('obs[' + i + ']: y_obs debe ser numérico (es el valor observado del piloto)');
    var vo = contratos.validarEPDOutput(o.output);
    if (!vo.valido) errores.push('obs[' + i + '].output: ' + vo.invalidos.concat(vo.faltantes).join('; '));
    else if (!o.output.variable_type) errores.push('obs[' + i + '].output: falta variable_type (§36 agrupa por él; runEPD siempre lo emite)');
  });
  if (errores.length) return { ok: false, errors: errores };

  var grupos = {};       // variable_type → { pares:[], rangos:[] }
  var noCalibrables = [];
  var notes = [];

  observaciones.forEach(function (o) {
    var out = o.output;
    if (out.status !== 'CUANTIFICADO' || !num(out.projection_base)) {
      noCalibrables.push({
        epd_id: out.epd_id, output_level: out.output_level, status: out.status,
        motivo: 'sin proyección cuantitativa que calibrar (§36 solo aplica a CUANTIFICADO)'
      });
      return;
    }
    var vt = out.variable_type;
    if (!grupos[vt]) grupos[vt] = { pares: [], rangos: [] };
    grupos[vt].pares.push({ y_obs: o.y_obs, y_proj: out.projection_base });
    if (num(out.projection_lower) && num(out.projection_upper)) {
      grupos[vt].rangos.push({ y_obs: o.y_obs, L: out.projection_lower, U: out.projection_upper });
    }
  });

  var porVariable = {};
  Object.keys(grupos).forEach(function (vt) {
    var g = grupos[vt];
    porVariable[vt] = {
      n: g.pares.length,
      mae: mae(g.pares),
      sesgo: sesgo(g.pares),
      cobertura: g.rangos.length ? cobertura(g.rangos)
        : { n: 0, dentro: 0, fuera: 0, tasa: null } // ninguno emitió rango
    };
  });

  var tipos = Object.keys(porVariable);
  if (tipos.length > 1) {
    notes.push('§36: ' + tipos.length + ' variable_type distintos (' + tipos.join(', ') +
      ') — las métricas se reportan POR grupo. NO se produce un MAE/Sesgo global cruzando tipos ' +
      '("los errores solo se agregan entre variables comparables").');
  }
  if (noCalibrables.length) {
    notes.push(noCalibrables.length + ' EPD sin proyección cuantitativa → listados en no_calibrables, sin métrica.');
  }

  return { ok: true, por_variable: porVariable, no_calibrables: noCalibrables, notes: notes };
}

module.exports = {
  errorEPD: errorEPD,
  errorAbsoluto: errorAbsoluto,
  mae: mae,
  sesgo: sesgo,
  cobertura: cobertura,
  calibrarLote: calibrarLote
};
