/**
 * motor-cff/moneda.js — Fase 4a
 *
 * Moneda, FX y base nominal/real (§17). Precisión computacional completa
 * (§17.2) — el redondeo nunca se usa en pasos intermedios, solo en
 * presentación final (mismo patrón que motor-ice-ieh.redondear()/
 * formatearParaPresentacion() y motor-iao, aplicado aquí a la
 * consolidación monetaria).
 *
 * ── Extensión de invocación #3: objeto FX completo ────────────────────────
 *
 * §17.1 exige que toda conversión declare "tasa, fuente, fecha y método".
 * MONETARY_BASIS.fx_reference? (§22.3, Fase 0) es solo un puntero/string,
 * no ese objeto estructurado. Se recibe como parámetro explícito de quien
 * llama — mismo patrón que las demás extensiones de invocación. Ver
 * README, "Parámetros de invocación no cubiertos por el contrato de datos".
 */

'use strict';

// ── §17.1 — conversión de moneda, tasa/fuente/fecha/método explícitos ────

/**
 * convertirMoneda(componente, fx)
 *
 * componente: { component_id, original_value, original_currency }.
 * fx: { tasa, fuente, fecha, metodo, monedaDestino } — declarado por quien
 *   llama, NUNCA fabricado internamente (§17.1: "Cambios por FX son
 *   cambios de base monetaria, no deterioro operacional" — el motor no
 *   decide una tasa, solo aplica la que se le entrega con su procedencia).
 *
 * Preserva el valor original intacto (§17: "VALOR ORIGINAL ≠ VALOR
 * NORMALIZADO... los valores normalizados nunca reemplazan el valor
 * original") — devuelve un objeto NUEVO con normalized_value agregado,
 * sin mutar el componente de entrada.
 *
 * @returns componente + { normalized_value, reporting_currency, fx: {tasa,fuente,fecha,metodo} }
 */
function convertirMoneda(componente, fx) {
  if (typeof componente.original_value !== 'number') {
    throw new Error('convertirMoneda: componente.original_value debe ser numérico.');
  }
  ['tasa', 'fuente', 'fecha', 'metodo', 'monedaDestino'].forEach(function (campo) {
    if (fx == null || fx[campo] == null) {
      throw new Error('convertirMoneda: fx.' + campo + ' es obligatorio (§17.1: "toda conversión debe declarar ' +
        'tasa, fuente, fecha y método") — no se fabrica internamente.');
    }
  });
  var out = Object.assign({}, componente);
  out.normalized_value = componente.original_value * fx.tasa; // precisión completa, sin redondear aquí
  out.reporting_currency = fx.monedaDestino;
  out.fx = { tasa: fx.tasa, fuente: fx.fuente, fecha: fx.fecha, metodo: fx.metodo };
  return out;
}

/**
 * sumarConMonedaControlada(componentes)
 *
 * componentes: array de { component_id, original_value, original_currency,
 *   normalized_value?, reporting_currency? }.
 *
 * Nunca suma monedas distintas sin conversión explícita y trazable (§17,
 * literal). Si todos comparten original_currency, se suman directo. Si
 * hay más de una original_currency, TODOS deben traer normalized_value +
 * reporting_currency ya resuelto (vía convertirMoneda) Y compartir el
 * mismo reporting_currency — si no, lanza (no convierte por su cuenta).
 */
function sumarConMonedaControlada(componentes) {
  var monedasOriginales = {};
  componentes.forEach(function (c) { monedasOriginales[c.original_currency] = true; });
  if (Object.keys(monedasOriginales).length === 1) {
    var totalDirecto = componentes.reduce(function (s, c) { return s + c.original_value; }, 0);
    return { total: totalDirecto, moneda: Object.keys(monedasOriginales)[0], convertido: false };
  }

  var reportingCurrencies = {};
  componentes.forEach(function (c) {
    if (typeof c.normalized_value !== 'number' || !c.reporting_currency) {
      throw new Error('sumarConMonedaControlada: componentes con original_currency mixtas (' +
        Object.keys(monedasOriginales).join(', ') + ') requieren normalized_value + reporting_currency ' +
        'ya resueltos (vía convertirMoneda) para "' + c.component_id + '" — no se suma sin conversión explícita.');
    }
    reportingCurrencies[c.reporting_currency] = true;
  });
  if (Object.keys(reportingCurrencies).length > 1) {
    throw new Error('sumarConMonedaControlada: los normalized_value no comparten un mismo reporting_currency (' +
      Object.keys(reportingCurrencies).join(', ') + ') — no se puede consolidar en más de una base monetaria a la vez.');
  }
  var totalNormalizado = componentes.reduce(function (s, c) { return s + c.normalized_value; }, 0);
  return { total: totalNormalizado, moneda: Object.keys(reportingCurrencies)[0], convertido: true };
}

// ── §17.2 — precisión computacional completa ─────────────────────────────

/**
 * redondear(valor, decimales) — capa de presentación únicamente, nunca se
 * usa dentro de sumarConMonedaControlada/convertirMoneda. Mismo patrón que
 * motor-ice-ieh.js/motor-iao.js.
 */
function redondear(valor, decimales) {
  if (typeof valor !== 'number' || !isFinite(valor)) return valor;
  var d = (decimales === undefined) ? 2 : decimales;
  var f = Math.pow(10, d);
  return Math.round(valor * f) / f;
}

module.exports = {
  convertirMoneda: convertirMoneda,
  sumarConMonedaControlada: sumarConMonedaControlada,
  redondear: redondear
};
