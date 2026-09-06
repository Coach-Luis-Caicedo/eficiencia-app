/**
 * motor-ifd/clasificacion.js — Fase 2
 *
 * Entre la puerta de evidencia (Fase 1) y la proyección física (Fase 3):
 * las cuatro compuertas que degradan o cortan la salida a cualitativa
 * ANTES de intentar cuantificar — más los helpers de dominio (§15) y
 * suficiencia de serie (§17).
 *
 *   §18/§28  aplicarHMS          — H > HMS → A07, effective_fep = max(1, fep-1)
 *   §14/§20.5 V5                 — capacidad latente → S1/CUALITATIVO, sin cifra
 *   §16      EV-CUAL             — dinámica cualitativa → S1/CUALITATIVO
 *   §7/§28   effective_fep == 1  — fuerza mínima → S1/CUALITATIVO
 *   §17/§35  serie insuficiente  — SS<SS2 en V1-V4 → A04, S1/DEGRADADO_A_CUALITATIVO
 *
 * §19 (AMₘ, matriz de compatibilidad) y la selección de método: van en
 * Fase 3 — dependen de los parámetros de proyección (trend_a, growth_rate,
 * …) que aún no se leen aquí. §28 da la cascada; §19 "matriz" se realiza
 * como esa cascada (el texto no enumera tabla).
 *
 * ── V5 se evalúa ANTES que effective_fep == 1 ──────────────────────────
 * Mismo orden que el engine de referencia: una capacidad latente es
 * cualitativa por naturaleza, no "degradada por falta de evidencia" — el
 * `status` distingue los dos (CUALITATIVO vs DEGRADADO_A_CUALITATIVO).
 *
 * ── EV-CUAL: comportamiento que el engine no tiene, respaldado por §16 ──
 * El engine no chequea `evolution_type == cualitativa`. §16 lista
 * "cualitativa" como una dinámica y NO le da fórmula de proyección → una
 * variable de evolución cualitativa no se puede cuantificar. Se trata como
 * V5 (S1/CUALITATIVO). Divergencia deliberada con el oráculo, documentada.
 */

'use strict';

var mod = require('./enums');
var PARAMS = mod.PARAMS;
var adm = require('./admisibilidad');

/**
 * aplicarHMS(fep, horizon, hms) — §18 / §28
 *
 * hms === null | undefined  → HMS no declarado, no aplica (no es un fallo:
 *   §18 "cuando correspondan"). fep se conserva.
 * Si horizon > hms → alerta A07, effective_fep = max(1, fep-1) — "degrade
 *   effective_FEP by one level, never below S1" (§28 literal).
 *
 * @returns {{ effectiveFep:number, alerta:string|null, degradado:boolean, nota:string|null }}
 */
function aplicarHMS(fep, horizon, hms) {
  if (typeof fep !== 'number' || fep < 0 || fep > 3 || fep !== Math.trunc(fep)) {
    throw new Error('aplicarHMS: fep="' + fep + '" — entero 0-3.');
  }
  if (hms === null || hms === undefined) {
    return { effectiveFep: fep, alerta: null, degradado: false, nota: null };
  }
  if (typeof hms !== 'number' || typeof horizon !== 'number') {
    throw new Error('aplicarHMS: horizon y hms deben ser numéricos cuando hms está declarado.');
  }
  if (horizon > hms) {
    return {
      effectiveFep: Math.max(1, fep - 1),
      alerta: 'A07',
      degradado: true,
      nota: 'Salida degradada por exceder el horizonte sustentable (H=' + horizon + ' > HMS=' + hms + '). §28: nunca por debajo de S1.'
    };
  }
  return { effectiveFep: fep, alerta: null, degradado: false, nota: null };
}

/**
 * clampDominio(y, lower, upper) — §15: Y* = min(U, max(L, Ŷ))
 *
 * lower / upper `null` | `undefined` → sin límite en ese lado (§15: "No se
 * imponen límites universales"). Recorte → alerta A06.
 *
 * @returns {{ valor:number, recortado:boolean, alerta:string|null }}
 */
function clampDominio(y, lower, upper) {
  if (typeof y !== 'number' || !isFinite(y)) {
    throw new Error('clampDominio: y="' + y + '" no es un número finito.');
  }
  var out = y;
  if (typeof lower === 'number') out = Math.max(lower, out);
  if (typeof upper === 'number') out = Math.min(upper, out);
  var recortado = out !== y;
  return { valor: out, recortado: recortado, alerta: recortado ? 'A06' : null };
}

/**
 * clasificarSuficienciaSerie(ss) — §17
 *
 * ss: entero 0-3 (SS0..SS3). `permiteCuantitativa` sii ss >=
 * PARAMS.SERIE_MINIMA_CUANTITATIVA (calibrable, §17).
 */
function clasificarSuficienciaSerie(ss) {
  if ([0, 1, 2, 3].indexOf(ss) === -1) {
    throw new Error('clasificarSuficienciaSerie: ss="' + ss + '" — entero 0-3.');
  }
  return {
    nivel: ['SS0', 'SS1', 'SS2', 'SS3'][ss],
    indice: ss,
    permiteCuantitativa: ss >= PARAMS.SERIE_MINIMA_CUANTITATIVA
  };
}

var VARIABLES_CUANTITATIVAS = ['V1', 'V2', 'V3', 'V4'];

/**
 * resolverClasificacion({ fep, horizon, hms, variable_type, evolution_type,
 *   series_sufficiency })
 *
 * `fep` es el de Fase 1 (resolverPuertaEvidencia devolvió terminal:false).
 *
 * @returns {{
 *   terminal:boolean,
 *   resultado?: { output_level, status, alerts:[], notes:[] },
 *   effectiveFep?:number, nivelMax?:string, alerts?:string[]
 * }}
 */
function resolverClasificacion(input) {
  var hms = aplicarHMS(input.fep, input.horizon, input.hms);
  var alerts = hms.alerta ? [hms.alerta] : [];
  var notes = hms.nota ? [hms.nota] : [];

  // 1 — V5: capacidad latente, cualitativa por naturaleza (§14/§20.5)
  if (input.variable_type === 'V5') {
    return {
      terminal: true,
      resultado: {
        output_level: 'S1', status: 'CUALITATIVO', alerts: alerts,
        notes: notes.concat(['V5: no se fabrica una cifra para una capacidad latente (§20.5).'])
      }
    };
  }

  // 2 — EV-CUAL: dinámica cualitativa, sin fórmula de proyección (§16)
  if (input.evolution_type === 'EV-CUAL') {
    return {
      terminal: true,
      resultado: {
        output_level: 'S1', status: 'CUALITATIVO', alerts: alerts,
        notes: notes.concat(['evolution_type=EV-CUAL: dinámica cualitativa, §16 no le da fórmula de proyección.'])
      }
    };
  }

  // 3 — fuerza mínima: la evidencia solo permite escenario cualitativo (§7/§28)
  if (hms.effectiveFep === 1) {
    return {
      terminal: true,
      resultado: {
        output_level: 'S1', status: 'CUALITATIVO', alerts: alerts,
        notes: notes.concat(['La fuerza de evidencia (effective_FEP=1) limita la salida a escenario cualitativo.'])
      }
    };
  }

  // 4 — serie insuficiente para modelación cuantitativa (§17/§35)
  var serie = clasificarSuficienciaSerie(input.series_sufficiency);
  if (!serie.permiteCuantitativa && VARIABLES_CUANTITATIVAS.indexOf(input.variable_type) !== -1) {
    return {
      terminal: true,
      resultado: {
        output_level: 'S1', status: 'DEGRADADO_A_CUALITATIVO',
        alerts: alerts.concat(['A04']),
        notes: notes.concat(['Serie ' + serie.nivel + ' insuficiente para modelación cuantitativa en ' + input.variable_type + ' (§17).'])
      }
    };
  }

  // sigue a proyección (Fase 3)
  return {
    terminal: false,
    effectiveFep: hms.effectiveFep,
    nivelMax: adm.nivelSalidaMax(hms.effectiveFep),
    alerts: alerts,
    notes: notes,
    serie: serie
  };
}

module.exports = {
  aplicarHMS: aplicarHMS,
  clampDominio: clampDominio,
  clasificarSuficienciaSerie: clasificarSuficienciaSerie,
  resolverClasificacion: resolverClasificacion,
  VARIABLES_CUANTITATIVAS: VARIABLES_CUANTITATIVAS
};
