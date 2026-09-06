/**
 * motor-ifd/proyeccion.js — Fase 3
 *
 * Proyección física de la consecuencia futura EN SU UNIDAD NATURAL (§20),
 * antes de cualquier monetización (Fase 5). "PROYECCIÓN ≠ PREDICCIÓN" (§0,
 * §32): esto produce un escenario condicionado por evidencia, no una
 * predicción probabilística.
 *
 * ── §19 / §28 — selección de método (cascada ordenada) ─────────────────
 *
 * §19 dice "matriz de compatibilidad, no score ponderado" pero NO enumera
 * la matriz. §28 (pseudocódigo normativo) da el orden:
 *   1. V1_TASA          — V1 con events_obs / exposure_obs / exposure_future
 *   2. TENDENCIA_LINEAL — trend_a + trend_b · h                (trend_a, trend_b)
 *   3. CRECIMIENTO_MULT — baseline · (1+g)^h        (growth_rate, baseline, EV-M)
 *   4. DELTA_ADITIVO    — baseline + delta · h         (delta, baseline, EV-A)
 *   5. CONTINUIDAD      — baseline
 *   6. INCOMPATIBLE     — A05, S1/DEGRADADO_A_CUALITATIVO
 * La "matriz" de §19 se realiza como esta cascada + las restricciones de
 * fórmula por tipo de §20.
 *
 * `evolution_type` se compara por IGUALDAD ESTRICTA (`=== 'EV-M'`), nunca
 * `includes()` — divergencia deliberada con el engine (que usa
 * `"EV-M" in ...`), documentada en el README.
 *
 * ── §20.1 — "no se extrapola un conteo bruto cuando el volumen cambia" ──
 *
 * Solo V1, solo si el método NO es V1_TASA (que ya es volumen-consciente).
 * Si exposure_obs Y exposure_future están presentes → el motor CALCULA
 * `|exposure_future − exposure_obs| / exposure_obs` vs
 * PARAMS.VOLUME_CHANGE_MATERIAL_PCT. Declaración explícita
 * `volume_change_material` solo como último recurso. El motor manda; si el
 * declarado contradice el calculado, se registra en `audit[]` (no se
 * descarta ni se rechaza el input). Cambio material → A13, degrada.
 *
 * ── §15 — dominio ─────────────────────────────────────────────────────
 * `clampDominio` (Fase 2) tras proyectar. Recorte → A06.
 */

'use strict';

var mod = require('./enums');
var PARAMS = mod.PARAMS;
var CL = require('./clasificacion');

var METODOS = ['V1_TASA', 'TENDENCIA_LINEAL', 'CRECIMIENTO_MULTIPLICATIVO', 'DELTA_ADITIVO', 'CONTINUIDAD'];

function num(v) { return typeof v === 'number' && isFinite(v); }

/**
 * seleccionarMetodo(input) → { metodo, razon }  (metodo === 'INCOMPATIBLE' si ninguno aplica)
 *
 * Cascada de §28, en orden estricto. El primero cuyos parámetros existen
 * gana (§28: "select projection method in this order when admissible").
 */
function seleccionarMetodo(input) {
  if (input.variable_type === 'V1' && num(input.events_obs) && num(input.exposure_obs) && input.exposure_obs !== 0 && num(input.exposure_future)) {
    return { metodo: 'V1_TASA', razon: 'V1 con tasa observada y exposición futura (§20.1)' };
  }
  if (num(input.trend_a) && num(input.trend_b)) {
    return { metodo: 'TENDENCIA_LINEAL', razon: 'parámetros de tendencia lineal presentes (§20.2/20.3)' };
  }
  if (num(input.growth_rate) && num(input.baseline) && input.evolution_type === 'EV-M') {
    return { metodo: 'CRECIMIENTO_MULTIPLICATIVO', razon: 'growth_rate + baseline + EV-M (§16 multiplicativa)' };
  }
  if (num(input.delta) && num(input.baseline) && input.evolution_type === 'EV-A') {
    return { metodo: 'DELTA_ADITIVO', razon: 'delta + baseline + EV-A (§16 aditiva)' };
  }
  if (num(input.baseline)) {
    return { metodo: 'CONTINUIDAD', razon: 'continuidad basada en baseline/estabilidad' };
  }
  return { metodo: 'INCOMPATIBLE', razon: 'ningún método cuantitativo admisible: faltan los parámetros de todos los métodos de §20' };
}

/**
 * proyectarBase(input, metodo) → number  (la proyección cruda, sin clamp)
 */
function proyectarBase(input, metodo) {
  var h = input.horizon;
  if (!num(h)) throw new Error('proyectarBase: horizon debe ser numérico.');
  switch (metodo) {
    case 'V1_TASA':
      return (input.events_obs / input.exposure_obs) * input.exposure_future;
    case 'TENDENCIA_LINEAL':
      return input.trend_a + input.trend_b * h;
    case 'CRECIMIENTO_MULTIPLICATIVO':
      return input.baseline * Math.pow(1 + input.growth_rate, h);
    case 'DELTA_ADITIVO':
      return input.baseline + input.delta * h;
    case 'CONTINUIDAD':
      return input.baseline;
    default:
      throw new Error('proyectarBase: método desconocido "' + metodo + '".');
  }
}

/**
 * chequeoVolumenV1(input, metodo) — §20.1
 *
 * @returns {{ material: boolean, alerta: string|null, cambio: number|null, audit: Array, motivo: string|null }}
 */
function chequeoVolumenV1(input, metodo) {
  var audit = [];
  if (input.variable_type !== 'V1' || metodo === 'V1_TASA') {
    return { material: false, alerta: null, cambio: null, audit: audit, motivo: null };
  }
  var eo = input.exposure_obs, ef = input.exposure_future;
  var puedeCalcular = num(eo) && num(ef) && eo !== 0;

  if (puedeCalcular) {
    var cambio = Math.abs(ef - eo) / Math.abs(eo);
    var material = cambio > PARAMS.VOLUME_CHANGE_MATERIAL_PCT;
    if (typeof input.volume_change_material === 'boolean' && input.volume_change_material !== material) {
      // el motor manda; se registra la discrepancia (no se descarta ni se rechaza)
      audit.push({
        code: 'DISCREPANCIA_VOLUME_CHANGE_MATERIAL',
        declarado: input.volume_change_material,
        calculado: material,
        cambio_relativo: cambio,
        umbral: PARAMS.VOLUME_CHANGE_MATERIAL_PCT,
        nota: 'El llamante declaró volume_change_material=' + input.volume_change_material +
          '; el motor calculó ' + material + ' (cambio ' + (cambio * 100).toFixed(2) + '% vs umbral ' +
          (PARAMS.VOLUME_CHANGE_MATERIAL_PCT * 100) + '%). El motor manda: se usa el valor calculado (§20.1).'
      });
    }
    return {
      material: material,
      alerta: material ? 'A13' : null,
      cambio: cambio,
      audit: audit,
      motivo: material ? ('V1 sin método de tasa; el volumen cambia ' + (cambio * 100).toFixed(2) +
        '% (> ' + (PARAMS.VOLUME_CHANGE_MATERIAL_PCT * 100) + '%) — no se extrapola un conteo bruto (§20.1).') : null
    };
  }

  // no se puede calcular → declaración explícita como último recurso
  if (input.volume_change_material === true) {
    return { material: true, alerta: 'A13', cambio: null, audit: audit,
      motivo: 'V1 sin método de tasa; volume_change_material=true declarado (§20.1).' };
  }
  if (input.volume_change_material === false) {
    return { material: false, alerta: null, cambio: null, audit: audit, motivo: null };
  }
  // ni cálculo ni declaración → §0: perder precisión antes que inventarla
  return {
    material: true, alerta: 'A13', cambio: null, audit: audit,
    motivo: 'V1 sin método de tasa, sin exposure_obs/future para calcular el cambio de volumen y sin ' +
      'volume_change_material declarado — §20.1 impide extrapolar el conteo bruto sin esa certeza (§0).'
  };
}

/**
 * proyectar(input) — Fase 3 completa
 *
 * input: EPD_INPUT + `effective_fep` de Fase 2 (para nada aquí salvo
 * traza) + `nivelMax`.
 *
 * @returns {{
 *   terminal: boolean,
 *   resultado?: { output_level, status, alerts:[], notes:[] },
 *   projection_base?: number, method?: string, alerts?: string[], notes?: string[], audit?: Array
 * }}
 */
function proyectar(input) {
  var sel = seleccionarMetodo(input);
  var alerts = [], notes = [], audit = [];

  if (sel.metodo === 'INCOMPATIBLE') {
    return {
      terminal: true,
      resultado: {
        output_level: 'S1', status: 'DEGRADADO_A_CUALITATIVO',
        alerts: ['A05'], notes: [sel.razon]
      }
    };
  }

  // §20.1 — conteo bruto V1
  var vol = chequeoVolumenV1(input, sel.metodo);
  audit = audit.concat(vol.audit);
  if (vol.alerta) {
    return {
      terminal: true,
      resultado: {
        output_level: 'S1', status: 'DEGRADADO_A_CUALITATIVO',
        alerts: [vol.alerta], notes: [vol.motivo]
      },
      audit: audit
    };
  }

  var raw = proyectarBase(input, sel.metodo);
  notes.push('Método: ' + sel.metodo + ' — ' + sel.razon + '. Proyección cruda = ' + raw + '.');

  var clamp = CL.clampDominio(raw, input.lower_bound, input.upper_bound);
  if (clamp.alerta) {
    alerts.push(clamp.alerta);
    notes.push('Dominio §15: ' + raw + ' recortado a ' + clamp.valor + '.');
  }

  return {
    terminal: false,
    projection_base: clamp.valor,
    projection_raw: raw,
    method: sel.metodo,
    alerts: alerts,
    notes: notes,
    audit: audit
  };
}

module.exports = {
  seleccionarMetodo: seleccionarMetodo,
  proyectarBase: proyectarBase,
  chequeoVolumenV1: chequeoVolumenV1,
  proyectar: proyectar,
  METODOS: METODOS
};
