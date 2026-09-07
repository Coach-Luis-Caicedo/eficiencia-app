/**
 * motor-ifd/escenarios.js — Fase 4
 *
 * Escenarios (§21) e incertidumbre (§22). Tres escenarios, cada uno una
 * proyección física DISTINTA desde el mismo punto de partida:
 *
 *   §21.1  Continuidad     Y_H^CONT = Ŷ_H         (la proyección base, sin multiplicador)
 *   §21.2  Intensificación Yₜ(1+g_int)^h  |  Yₜ + h·δ_int
 *   §21.3  Contención      Ŷ_H · (1 − containment_factor)   (solo con evidencia ≥ 2)
 *
 *   §22    Incertidumbre   [L, B, U]  — envelope por effective_FEP
 *
 * El engine Python NO tiene escenarios ni intensificación — quedan fuera
 * del contraste con el oráculo (solo el envelope §22 se contrasta).
 *
 * ── §21.2 — de dónde sale g_int / δ_int ───────────────────────────────
 *
 * §21.2 presupone "variabilidad histórica adversa cuando la serie es
 * suficiente" pero NO define "adversa". El término aparece una sola vez en
 * todo el documento (línea 584) y nunca se operacionaliza.
 *
 * DECISIÓN DE DISEÑO DE LUIS (confirmada explícita, como la precedencia
 * motor-manda de §20.1 en 015a3bd — NO es una cita del documento): la
 * dirección adversa se deriva del signo de la trayectoria neta de la
 * serie, s = Math.sign(serie[último] − serie[primero]); solo cuentan los
 * cambios período a período cuyo signo coincide con s. Argumento de
 * respaldo: esta cascada solo corre tras §6 confirmar
 * deterioration_sustained, así que por construcción la serie ya se mueve
 * en la dirección del deterioro; la única alternativa sería inventar un
 * campo de polaridad por variable que el documento no da.
 *
 * Con serie_historica de ≥ INTENSIFICACION_MIN_PUNTOS puntos, el motor
 * deriva g_int del Q75 de esos cambios adversos. Sin serie suficiente →
 * declaración explícita (growth_rate_intensificacion /
 * delta_intensificacion). Sin ninguna → cualitativa. Precedencia
 * serie-vs-declaración: el motor manda con el calculado, registra la
 * discrepancia en audit[] (patrón §20.1).
 */

'use strict';

var mod = require('./enums');
var PARAMS = mod.PARAMS;
var CL = require('./clasificacion');

function num(v) { return typeof v === 'number' && isFinite(v); }

/**
 * percentil(valores, p) — interpolación lineal (tipo 7, el default de numpy/R).
 * valores no vacío. p en 0..100.
 */
function percentil(valores, p) {
  var s = valores.slice().sort(function (a, b) { return a - b; });
  if (s.length === 1) return s[0];
  var idx = (p / 100) * (s.length - 1);
  var lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] + (idx - lo) * (s[hi] - s[lo]);
}

// ── §21.1 — Continuidad ────────────────────────────────────────────────

function escenarioContinuidad(projBase) {
  if (!num(projBase)) throw new Error('escenarioContinuidad: projBase debe ser numérico.');
  return { escenario: 'CONTINUIDAD', valor: projBase, cualitativo: false };
}

// ── §21.2 — Intensificación ───────────────────────────────────────────

/**
 * derivarIntensificacionDeSerie(serie, multiplicativo) → { param, s, nAdversos } | null
 *
 * null = serie insuficiente / sin trayectoria neta / sin cambios adversos.
 */
function derivarIntensificacionDeSerie(serie, multiplicativo) {
  if (!Array.isArray(serie) || serie.length < PARAMS.INTENSIFICACION_MIN_PUNTOS) return null;
  if (!serie.every(function (x) { return num(x); })) return null;

  var s = Math.sign(serie[serie.length - 1] - serie[0]); // dirección NETA
  if (s === 0) return null; // sin trayectoria neta → no hay señal de intensificación

  var cambios = [];
  for (var i = 1; i < serie.length; i++) {
    if (multiplicativo) {
      if (serie[i - 1] === 0) continue; // cambio relativo indefinido, se omite
      cambios.push((serie[i] - serie[i - 1]) / serie[i - 1]);
    } else {
      cambios.push(serie[i] - serie[i - 1]);
    }
  }
  var adversos = cambios.filter(function (c) { return Math.sign(c) === s; });
  if (adversos.length === 0) return null; // ningún cambio en la dirección de s

  var q75 = percentil(adversos.map(Math.abs), PARAMS.INTENSIFICACION_PERCENTIL);
  return { param: s * q75, s: s, nAdversos: adversos.length };
}

/**
 * escenarioIntensificacion(input, projBase)
 *
 * input: EPD_INPUT (usa evolution_type, baseline, horizon, serie_historica,
 *   growth_rate_intensificacion / delta_intensificacion).
 *
 * @returns {{
 *   escenario: 'INTENSIFICACION',
 *   valor: number|null, cualitativo: boolean,
 *   param: number|null, fuente: 'SERIE'|'DECLARACION'|'CUALITATIVO',
 *   alerts: string[], notes: string[], audit: Array
 * }}
 */
function escenarioIntensificacion(input, projBase) {
  var multiplicativo = input.evolution_type === 'EV-M';
  var aditivo = input.evolution_type === 'EV-A';
  var audit = [];

  var cualitativa = function (motivo) {
    return { escenario: 'INTENSIFICACION', valor: null, cualitativo: true, param: null,
      fuente: 'CUALITATIVO', alerts: [], notes: [motivo], audit: audit };
  };

  if (!multiplicativo && !aditivo) {
    return cualitativa('§21.2 solo da fórmula de intensificación para EV-M (multiplicativa) y EV-A (aditiva); ' +
      'evolution_type=' + input.evolution_type + ' → Intensificación cualitativa.');
  }
  if (!num(input.baseline)) {
    return cualitativa('Sin baseline (Yₜ) desde el cual proyectar la intensificación → cualitativa.');
  }

  // 1 — de la serie histórica
  var deSerie = derivarIntensificacionDeSerie(input.serie_historica, multiplicativo);

  // 2 — declarado
  var declarado = null;
  if (multiplicativo && num(input.growth_rate_intensificacion)) declarado = input.growth_rate_intensificacion;
  else if (aditivo && num(input.delta_intensificacion)) declarado = input.delta_intensificacion;

  var param, fuente;
  if (deSerie) {
    param = deSerie.param;
    fuente = 'SERIE';
    // 4 — precedencia: si además hay declaración y no coinciden
    if (declarado !== null) {
      var coincide;
      if (declarado === 0) coincide = Math.abs(param) < PARAMS.INTENSIFICACION_DISCREPANCIA_TOL;
      else coincide = Math.abs(param - declarado) / Math.abs(declarado) < PARAMS.INTENSIFICACION_DISCREPANCIA_TOL;
      if (!coincide) {
        audit.push({
          code: 'DISCREPANCIA_INTENSIFICACION',
          declarado: declarado,
          calculado: param,
          tolerancia: PARAMS.INTENSIFICACION_DISCREPANCIA_TOL,
          nota: 'El llamante declaró ' + (multiplicativo ? 'growth_rate_intensificacion' : 'delta_intensificacion') +
            '=' + declarado + '; el motor calculó ' + param + ' de serie_historica (Q75 de ' + deSerie.nAdversos +
            ' cambios adversos). El motor manda: se usa el calculado (§21.2, patrón §20.1).'
        });
      }
    }
  } else if (declarado !== null) {
    param = declarado;
    fuente = 'DECLARACION';
  } else {
    return cualitativa('Ni serie_historica suficiente (≥ ' + PARAMS.INTENSIFICACION_MIN_PUNTOS +
      ' puntos con trayectoria adversa) ni ' + (multiplicativo ? 'growth_rate_intensificacion' : 'delta_intensificacion') +
      ' declarado → Intensificación cualitativa (§21.2: "puede utilizar... cuando la serie es suficiente").');
  }

  var valor;
  if (multiplicativo) {
    valor = input.baseline * Math.pow(1 + param, input.horizon); // §21.2 Yₜ(1+g_int)^h
  } else {
    valor = input.baseline + input.horizon * param;              // §21.2 Yₜ + h·δ_int
  }

  return {
    escenario: 'INTENSIFICACION',
    valor: valor,
    cualitativo: false,
    param: param,
    fuente: fuente,
    alerts: [],
    notes: ['Intensificación (' + (multiplicativo ? 'multiplicativa' : 'aditiva') + ', fuente=' + fuente +
      ', param=' + param + '): ' + input.baseline + (multiplicativo ? ' × (1+' + param + ')^' + input.horizon : ' + ' + input.horizon + '×' + param) + ' = ' + valor + '.'],
    audit: audit
  };
}

// ── §21.3 — Contención (escenario FÍSICO — NO el ver/roi de §24) ───────

/**
 * escenarioContencion(input, projBase)
 *
 * §21.3: "Solo se cuantifica cuando existe evidencia sobre comportamiento
 * favorable o intervención." → containment_factor presente Y
 * containment_evidence_level >= 2. Sin evidencia suficiente → cualitativa,
 * y si containment_factor se declaró sin evidencia → A12.
 *
 * IMPORTANTE: esto produce la proyección física bajo contención
 * (`Ŷ_H · (1 − cf)`), NO el `ver`/`roi` económico — esas 5 salidas siguen
 * PENDIENTE DE AUDITORÍA (§24, Fase 6).
 */
function escenarioContencion(input, projBase) {
  if (!num(projBase)) throw new Error('escenarioContencion: projBase debe ser numérico.');
  var cf = input.containment_factor;
  var nivel = num(input.containment_evidence_level) ? input.containment_evidence_level : 0;

  if (!num(cf)) {
    return { escenario: 'CONTENCION', valor: null, cualitativo: true, alerts: [],
      notes: ['Sin containment_factor → contención cualitativa (§21.3).'] };
  }
  if (nivel < 2) {
    return { escenario: 'CONTENCION', valor: null, cualitativo: true, alerts: ['A12'],
      notes: ['containment_factor=' + cf + ' declarado pero containment_evidence_level=' + nivel +
        ' < 2 → contención cualitativa, A12 INTERVENCION_SIN_EVIDENCIA (§21.3).'] };
  }
  var valor = projBase * (1 - cf);
  return {
    escenario: 'CONTENCION', valor: valor, cualitativo: false, alerts: [],
    notes: ['Contención (evidencia nivel ' + nivel + '): ' + projBase + ' × (1 − ' + cf + ') = ' + valor +
      '. Proyección FÍSICA bajo contención — NO es ver/roi (§24, pendiente de auditoría).']
  };
}

// ── §22 — Incertidumbre ──────────────────────────────────────────────

/**
 * calcularEnvelope(projBase, effectiveFep, lower, upper)
 *
 * §22: IFDᵢ = [Lᵢ, Bᵢ, Uᵢ]. Amplitud por effective_FEP
 * (PARAMS.ENVELOPE_POR_FEP, PENDIENTE_CALIBRACION). Clamp de dominio §15 a
 * L y U. Solo aplica a FEP ∈ {2, 3} (FEP ≤ 1 ya cortó a S1 en Fase 2).
 *
 * §22 también admite la forma [Lᵢ, Uᵢ] (sin central) cuando el método solo
 * permite rango — NINGÚN método de la cascada pre-piloto está en ese caso
 * (todos dan un punto), así que aquí B siempre existe. Documentado.
 */
function calcularEnvelope(projBase, effectiveFep, lower, upper) {
  if (!num(projBase)) throw new Error('calcularEnvelope: projBase debe ser numérico.');
  var pct = PARAMS.ENVELOPE_POR_FEP[effectiveFep];
  if (pct === undefined) {
    throw new Error('calcularEnvelope: no hay envelope definido para effective_FEP=' + effectiveFep +
      ' (§22 solo aplica a FEP 2-3; FEP ≤ 1 corta a S1 en Fase 2).');
  }
  var lowClamp = CL.clampDominio(projBase * (1 - pct), lower, upper);
  var upClamp = CL.clampDominio(projBase * (1 + pct), lower, upper);
  var alerts = [];
  if (lowClamp.alerta || upClamp.alerta) alerts.push('A06');
  return {
    L: lowClamp.valor,
    B: projBase,
    U: upClamp.valor,
    amplitud_pct: pct,
    estado_calibracion: PARAMS.ENVELOPE_ESTADO,
    alerts: alerts
  };
}

module.exports = {
  percentil: percentil,
  escenarioContinuidad: escenarioContinuidad,
  derivarIntensificacionDeSerie: derivarIntensificacionDeSerie,
  escenarioIntensificacion: escenarioIntensificacion,
  escenarioContencion: escenarioContencion,
  calcularEnvelope: calcularEnvelope
};
