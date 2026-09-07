/**
 * motor-ifd/runIFD.js — Fase 7
 *
 * Orquestador. Encadena Fases 1-6 en el orden del pseudocódigo normativo
 * de §28 y produce el EPD_OUTPUT consolidado (§31), autovalidado.
 *
 *   §27 flujo:  evidencia → admisibilidad → FEP → variable/dominio/evolución
 *               → serie → HMS → método → escenarios → incertidumbre →
 *               impacto → monetización si trazable → atribución →
 *               doble conteo → salida consolidada
 *
 * 7a: runEPD(input) — un solo EPD.
 * 7b (esta entrega): agregarEPDs(outputs) — agregación multi-EPD (§13, §25).
 * 7c: cobertura de §35 (17 pruebas) y §32 (15 reglas).
 *
 * ── Qué NO hace ──────────────────────────────────────────────────────
 *
 * §28: "emit maximum output allowed by evidence". runEPD NUNCA sube el
 * nivel (§30). NUNCA produce una cifra para CFD/CFR/VER/ROI_P/TRE (§24 —
 * marcador). NUNCA deja que attribution_category toque la aritmética
 * económica (§28 CRITICAL INVARIANT; el chequeo vive en economia.js).
 *
 * ── Input rechazado ─────────────────────────────────────────────────
 *
 * §28: "validate attribution_category ∈ {...}; otherwise reject input".
 * Un EPD_INPUT mal formado NO es una excepción de programación: es un
 * resultado de dominio. runEPD devuelve { ok: false, errors: [...] },
 * sin EPD_OUTPUT parcial (decisión A, aprobada por Luis; consistente con
 * runCFF).
 */

'use strict';

var contratos = require('./contratos');
var A = require('./admisibilidad');
var CL = require('./clasificacion');
var P = require('./proyeccion');
var SC = require('./escenarios');
var EC = require('./economia');
var H = require('./heredadas');

// dedupe preservando el orden de primera aparición (§28 recolecta alertas
// de varias fases; A06 puede venir de proyección y de envelope — un solo
// código en la salida).
function unicos(arr) {
  var visto = {}, out = [];
  arr.forEach(function (x) { if (!visto[x]) { visto[x] = true; out.push(x); } });
  return out;
}

/**
 * consolidarEPDOutput(input, partes) → EPD_OUTPUT (§31)
 *
 * `partes` trae lo que la cascada haya producido; los campos que no
 * aplican en una salida terminal (S0/S1) van en null / [] — nunca una
 * cifra fabricada (§26: NULL ≠ 0). heritage_outputs SIEMPRE los 5
 * marcadores (§24), incluso en S0.
 */
function consolidarEPDOutput(input, partes) {
  var eco = partes.economics || {};
  var out = {
    epd_id: input.epd_id,
    engine_version: input.engine_version,
    admissible: partes.admissible,
    FEP: partes.FEP,
    output_level: partes.output_level,
    status: partes.status,
    projection_base: partes.projection ? partes.projection.base : null,
    projection_lower: partes.projection ? partes.projection.lower : null,
    projection_upper: partes.projection ? partes.projection.upper : null,
    economic_base: eco.economic_base != null ? eco.economic_base : null,
    economic_lower: eco.economic_lower != null ? eco.economic_lower : null,
    economic_upper: eco.economic_upper != null ? eco.economic_upper : null,
    attribution_category: input.attribution_category,
    // §31 — variable_type viaja a TODAS las salidas (S0/S1/CUANTIFICADO):
    // siempre existe en la entrada (validarEPDInput lo exige) y la
    // calibración (§36, Fase 8) agrupa por él. No es condicional como
    // impact_type / double_count_ids. (Campo agregado a ESQUEMA_EPD_OUTPUT
    // en 4c1bad2 — reapertura #7.)
    variable_type: input.variable_type,
    scenarios: partes.scenarios || [],
    method: partes.method || null,
    heritage_outputs: H.construirSalidasHeredadas(), // §24 — siempre los 5 marcadores
    alerts: unicos(partes.alerts || []),
    notes: partes.notes || []
  };
  if (input.impact_type !== undefined) out.impact_type = input.impact_type;
  if (input.assumptions !== undefined) out.assumptions = input.assumptions;
  // §31 — "identificadores de doble conteo" viajan a la salida para que la
  // agregación (§25, Fase 7b) los tenga sin volver a pedir el EPD_INPUT.
  // (El campo se agregó a ESQUEMA_EPD_OUTPUT en 86ff75b — reapertura #6.)
  if (input.double_count_ids !== undefined) out.double_count_ids = input.double_count_ids;
  return out;
}

/**
 * finalizar(input, partes) — consolida, AUTOVALIDA (§35: "emit maximum
 * output allowed by evidence" = bien formada, en cualquier nivel S0-S3) y
 * envuelve el resultado. Un EPD_OUTPUT mal formado es un fallo del motor,
 * no un resultado de dominio → { ok: false, errors }.
 */
function finalizar(input, partes) {
  var output = consolidarEPDOutput(input, partes);
  var vo = contratos.validarEPDOutput(output);
  if (!vo.valido) {
    return { ok: false, errors: ['EPD_OUTPUT mal formado: ' + vo.invalidos.concat(vo.faltantes).join('; ')] };
  }
  return { ok: true, output: output };
}

/**
 * runEPD(input) → { ok: boolean, output?: EPD_OUTPUT, errors?: string[] }
 *
 * Un Evento Prospectivo de Deterioro por el pseudocódigo de §28.
 */
function runEPD(input) {
  // ── §28 — validar y, si el motor lo rechaza, no producir salida ──
  var v = contratos.validarEPDInput(input);
  if (!v.valido) {
    var errs = [];
    v.faltantes.forEach(function (f) { errs.push('falta: ' + f); });
    v.invalidos.forEach(function (i) { errs.push(i); });
    return { ok: false, errors: errs };
  }

  var alerts = [], notes = [];

  // ── §6 + §7 — admisibilidad y fuerza de evidencia ──
  var puerta = A.resolverPuertaEvidencia(input);
  if (puerta.terminal) {
    // S0 / NO_PROYECTABLE (no admisible → A01; FEP=0 → A02/A03)
    return finalizar(input, {
      admissible: puerta.resultado.admissible,
      FEP: puerta.resultado.FEP,
      output_level: puerta.resultado.output_level,
      status: puerta.resultado.status,
      alerts: puerta.resultado.alerts,
      notes: puerta.resultado.notes
    });
  }
  var fep = puerta.fep;

  // ── §18 + §14-17 — HMS y compuertas de clasificación ──
  var clas = CL.resolverClasificacion({
    fep: fep,
    horizon: input.horizon,
    hms: input.hms,
    variable_type: input.variable_type,
    evolution_type: input.evolution_type,
    series_sufficiency: input.series_sufficiency
  });
  if (clas.terminal) {
    // S1 / CUALITATIVO (V5, EV-CUAL, effective_FEP==1) o
    // S1 / DEGRADADO_A_CUALITATIVO (serie insuficiente, A04)
    return finalizar(input, {
      admissible: true,
      FEP: fep,
      output_level: clas.resultado.output_level,
      status: clas.resultado.status,
      alerts: clas.resultado.alerts,
      notes: clas.resultado.notes
    });
  }
  var effectiveFep = clas.effectiveFep;
  alerts = alerts.concat(clas.alerts);
  notes = notes.concat(clas.notes);

  // ── §20 — proyección física (selección de método + dominio + §20.1) ──
  var proy = P.proyectar(input);
  if (proy.terminal) {
    // S1 / DEGRADADO_A_CUALITATIVO (A05 método incompatible, A13 §20.1)
    return finalizar(input, {
      admissible: true,
      FEP: fep,
      output_level: proy.resultado.output_level,
      status: proy.resultado.status,
      alerts: alerts.concat(proy.resultado.alerts),
      notes: notes.concat(proy.resultado.notes)
    });
  }
  alerts = alerts.concat(proy.alerts);
  notes = notes.concat(proy.notes);
  var projBase = proy.projection_base;

  // ── §22 — incertidumbre (envelope por effective_FEP) ──
  var env = SC.calcularEnvelope(projBase, effectiveFep, input.lower_bound, input.upper_bound);
  alerts = alerts.concat(env.alerts);
  var proyeccion = { base: env.B, lower: env.L, upper: env.U };

  // ── §21 — los 3 escenarios (cada uno una proyección física distinta) ──
  var scenarios = [
    SC.escenarioContinuidad(projBase),
    SC.escenarioIntensificacion(input, projBase),
    SC.escenarioContencion(input, projBase)
  ];
  scenarios.forEach(function (s) {
    if (s.alerts) alerts = alerts.concat(s.alerts);
    if (s.notes) notes = notes.concat(s.notes);
    if (s.audit && s.audit.length) {
      s.audit.forEach(function (a) { notes.push('AUDIT ' + a.code + ': ' + (a.nota || JSON.stringify(a))); });
    }
  });

  // ── §23 — monetización (puerta §23.1 → EEB §23.2 → atribución §23.3) ──
  var eco = EC.monetizar(input, proyeccion);
  alerts = alerts.concat(eco.alerts);
  notes = notes.concat(eco.notes);

  // ── §25 — control de doble conteo ANTES de agregar (§28) ──
  var dc = H.detectarDobleConteo(input.double_count_ids || []);
  if (dc.alerta) {
    alerts.push(dc.alerta);
    notes.push('§25: solapamiento material en double_count_ids (' + JSON.stringify(dc.pares_solapados) +
      ') → agregación automática bloqueada.');
  }
  if (dc.invalidos.length) dc.invalidos.forEach(function (m) { notes.push('double_count_ids: ' + m); });

  // ── nivel de salida: CUANTIFICADO → techo por effective_FEP (§8) ──
  var outputLevel = A.nivelSalidaMax(effectiveFep);
  A.verificarFuerzaSalida(outputLevel, fep); // salvaguarda §8/§30: nunca sube

  return finalizar(input, {
    admissible: true,
    FEP: fep,
    output_level: outputLevel,
    status: 'CUANTIFICADO',
    alerts: alerts,
    notes: notes,
    projection: proyeccion,
    scenarios: scenarios,
    economics: eco,
    method: proy.method
  });
}

/**
 * agregarEPDs(outputs) → {
 *   ok: boolean,
 *   componente?: 'IFD_economico_futuro',
 *   economic_total?, economic_lower_total?, economic_upper_total?,  // number|null
 *   n_cuantificados?, por_epd?: [...], cualitativos?: [...],
 *   alerts?: string[], notes?: string[], aggregation_blocked?: boolean,
 *   errors?: string[]
 * }
 *
 * §13 — "lectura ejecutiva acumulada": suma el componente FUTURO de IFD.
 * `Impacto acumulado analítico = CFF_realizado + IFD_económico_futuro` — la
 * parte CFF NO es de este motor; aquí solo se produce `IFD_económico_futuro`
 * y se etiqueta como tal (§13: "conservar ambos componentes separados").
 *
 * §25 / §28 — "check double counting BEFORE aggregation": se corre
 * detectarDobleConteo sobre la UNIÓN de las claves de todos los EPD que se
 * iban a sumar. Solapamiento material → A14 + aggregation_blocked.
 *
 * §29 #15 / §32 — "IMPACTOS HETEROGÉNEOS NO SE SUMAN ARBITRARIAMENTE":
 * impact_type distinto entre los EPD a sumar → A17 + aggregation_blocked.
 * DECISIÓN DE DISEÑO DE LUIS (no lectura cerrada): §32 no define "homogéneo"
 * con la fuerza con que §25 definió "material" (ahí había frase de
 * refuerzo). Se toma "mismo impact_type" como criterio de homogeneidad —
 * documentado con la misma honestidad que "dirección adversa" (§21.2) o
 * `unit` (§23.1).
 *
 * `aggregation_blocked` → los totales van en null (§35: "impedir suma
 * automática"). `por_epd` siempre lista los componentes para que un humano
 * pueda decidir con la información a la vista.
 *
 * Solo se suman EPD `CUANTIFICADO` con `economic_base` numérico. Los demás
 * (S0, S1, CUANTIFICADO sin economía) van en `cualitativos`, sin cifra
 * (decisión C).
 */
function agregarEPDs(outputs) {
  if (!Array.isArray(outputs)) {
    return { ok: false, errors: ['agregarEPDs: se esperaba un array de EPD_OUTPUT'] };
  }
  var errores = [];
  outputs.forEach(function (o, i) {
    var vo = contratos.validarEPDOutput(o);
    if (!vo.valido) errores.push('outputs[' + i + ']: ' + vo.invalidos.concat(vo.faltantes).join('; '));
  });
  if (errores.length) return { ok: false, errors: errores };

  var cuantificados = [], cualitativos = [];
  outputs.forEach(function (o) {
    if (o.status === 'CUANTIFICADO' && typeof o.economic_base === 'number') cuantificados.push(o);
    else cualitativos.push({ epd_id: o.epd_id, output_level: o.output_level, status: o.status });
  });

  var alerts = [], notes = [], aggregation_blocked = false;

  // §25 — doble conteo sobre la UNIÓN de claves, ANTES de sumar
  var todasLasClaves = [];
  cuantificados.forEach(function (o) {
    (o.double_count_ids || []).forEach(function (k) { todasLasClaves.push(k); });
  });
  var dc = H.detectarDobleConteo(todasLasClaves);
  dc.invalidos.forEach(function (m) { notes.push('double_count_ids: ' + m); });
  if (dc.alerta) {
    alerts.push('A14');
    aggregation_blocked = true;
    notes.push('§25: solapamiento material entre EPDs (pares de claves ' + JSON.stringify(dc.pares_solapados) +
      ') → agregación automática bloqueada.');
  }

  // §29 #15 / §32 — heterogeneidad de impact_type
  var tipos = {};
  cuantificados.forEach(function (o) { if (o.impact_type !== undefined) tipos[o.impact_type] = true; });
  var tiposDistintos = Object.keys(tipos);
  if (tiposDistintos.length > 1) {
    alerts.push('A17');
    aggregation_blocked = true;
    notes.push('§29 #15 / §32: impact_type heterogéneo (' + tiposDistintos.join(', ') +
      ') → agregación automática bloqueada. Decisión de diseño: "homogéneo" = mismo impact_type ' +
      '(§32 "no se suman arbitrariamente" no lo define con la fuerza de §25).');
  }

  var sumar = function (campo) {
    return cuantificados.reduce(function (acc, o) { return acc + o[campo]; }, 0);
  };
  var hayLower = cuantificados.length > 0 && cuantificados.every(function (o) { return typeof o.economic_lower === 'number'; });
  var hayUpper = cuantificados.length > 0 && cuantificados.every(function (o) { return typeof o.economic_upper === 'number'; });
  var puedeSumar = !aggregation_blocked && cuantificados.length > 0;

  if (cuantificados.length === 0) {
    notes.push('Sin EPD CUANTIFICADO con economía → no hay nada que agregar (economic_total = null, no 0 — §26).');
  }

  return {
    ok: true,
    componente: 'IFD_economico_futuro', // §13: separado de CFF_realizado, siempre
    economic_total: puedeSumar ? sumar('economic_base') : null,
    economic_lower_total: (puedeSumar && hayLower) ? sumar('economic_lower') : null,
    economic_upper_total: (puedeSumar && hayUpper) ? sumar('economic_upper') : null,
    n_cuantificados: cuantificados.length,
    por_epd: cuantificados.map(function (o) {
      return { epd_id: o.epd_id, economic_base: o.economic_base, economic_lower: o.economic_lower, economic_upper: o.economic_upper, impact_type: o.impact_type };
    }),
    cualitativos: cualitativos,
    alerts: unicos(alerts),
    notes: notes,
    aggregation_blocked: aggregation_blocked
  };
}

module.exports = {
  runEPD: runEPD,
  agregarEPDs: agregarEPDs,
  consolidarEPDOutput: consolidarEPDOutput
};
