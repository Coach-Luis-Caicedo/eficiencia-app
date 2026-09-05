/**
 * motor-cff/runCFF.js — Fase 4b (iv)
 *
 * Algoritmo determinista end-to-end (§24). Orquestador top-level: llama en
 * el orden de §24 a todo lo construido en las fases anteriores y arma, por
 * primera vez, el objeto de contrato COMPLETO — CFF_RESULT (§22.8), más
 * CFF_RUN (§22.9) y TRACE_PATH (§22.10).
 *
 *   validate_case → create_run → [por evento/componente:
 *     clasificar mecanismo+naturaleza · validar cantidad/unidad/temporal ·
 *     resolver base monetaria · calcular/observar valor · clasificar
 *     monetización · evaluar atribución] → normalizar moneda/tiempo →
 *   consolidar (§19, vía consolidacion.js) → resolver cobertura y estado →
 *   invariantes → trazabilidad → CFF_RESULT
 *
 * NO reimplementa ninguna regla: delega en contratos / monetizacion /
 * atribucion / moneda / consolidacion (que a su vez usa temporalidad /
 * relaciones / costos_compartidos / nodos / admisibilidad) / cobertura.
 *
 * ── resolveStatus (§21) — dónde se usa, verificado contra el texto ──────
 *
 * §24 pone `resolve_coverage_and_status()` como UN paso, después de
 * `calculate_evidence_matrix_and_CFF()` y antes de `run_invariants()` —
 * la resolución de estado ocurre UNA vez, a nivel de CFF_RESULT, no
 * tejida capa por capa. §21 da la cascada (INVALID > INSUFFICIENT >
 * VALID_WITH_LIMITATIONS > VALID) y el principio "una salida no puede
 * tener mayor calidad que una dependencia crítica", pero NO enumera qué
 * dependencias son "críticas" ni cómo el resultado (un OUTPUT_STATUS, que
 * incluye INSUFFICIENT) mapea a CFF_RESULT.calculation_status (un
 * CALCULATION_STATUS, que NO tiene INSUFFICIENT). Decisiones explícitas,
 * aprobadas por Luis, documentadas como tales:
 *
 *   Críticas para calculation_status:
 *     (a) ¿algún evento retenido con status INVALID / contrato inválido? → INVALID
 *     (b) overall_coverage_status mapeado a OUTPUT_STATUS
 *         (FULL→VALID, PARTIAL/LIMITED→VALID_WITH_LIMITATIONS, INSUFFICIENT→INSUFFICIENT)
 *     (c) severidad de errors[]: BLOCKING no-cobertura → INVALID; DEGRADED → VALID_WITH_LIMITATIONS (§25)
 *   resolveStatus() sobre ese conjunto → OUTPUT_STATUS.
 *
 *   Mapa OUTPUT_STATUS → CALCULATION_STATUS:
 *     VALID→VALID · VALID_WITH_LIMITATIONS→VALID_WITH_LIMITATIONS ·
 *     INSUFFICIENT→INVALID · INVALID→INVALID
 *   INSUFFICIENT y INVALID colapsan en `calculation_status`, PERO la
 *   distinción NO se pierde: vive intacta en
 *   `coverage.overall_coverage_status` (=== 'INSUFFICIENT' solo en el caso
 *   de insuficiencia) y en el `code` tipado de errors[]
 *   (COBERTURA_INSUFICIENTE vs. CICLO_ECONOMICO / INVARIANTE_VIOLADO). Un
 *   consumidor distingue "tráeme más evidencia" de "arréglame un bug" por
 *   esos dos campos, nunca por `calculation_status` solo.
 *
 * ── cff_total nulable — regla condicional 9 de contratos.js (Fase 4b-iv) ──
 *
 * PRIMER cambio a un contrato de Fase 0 desde una fase posterior (decisión
 * excepcional). `cff_total === null` solo si calculation_status==='INVALID'
 * Y overall_coverage_status==='INSUFFICIENT' (caso N_A). Ver contratos.js.
 *
 * ── Determinismo (AC51) ─────────────────────────────────────────────────
 *
 * runCFF NO genera timestamps ni ids: `calculated_at`, `generated_at`,
 * `run_id` y todas las versiones son INPUTS (AC51: "mismos inputs Y
 * versiones → mismo resultado"). Todo array del CFF_RESULT se ordena por
 * una clave estable antes de devolverse, para que dos corridas con los
 * mismos inputs produzcan un objeto idéntico byte a byte aunque el orden
 * de iteración de algún objeto intermedio no esté garantizado.
 */

'use strict';

var contratos = require('./contratos');
var monetizacion = require('./monetizacion');
var atribucion = require('./atribucion');
var moneda = require('./moneda');
var consolidacion = require('./consolidacion');
var cobertura = require('./cobertura');
var estados = require('./estados');

var MONETIZACION_ADMISIBLE = ['OBSERVED', 'ESTIMATED'];
var ATRIBUCION_ADMISIBLE = ['CONFIRMED', 'SUPPORTED'];

// ── mapas de estado (decisiones explícitas, ver cabecera) ────────────────

function mapCoberturaAOutputStatus(cov) {
  if (cov === 'FULL') return 'VALID';
  if (cov === 'PARTIAL' || cov === 'LIMITED') return 'VALID_WITH_LIMITATIONS';
  if (cov === 'INSUFFICIENT') return 'INSUFFICIENT';
  throw new Error('mapCoberturaAOutputStatus: COVERAGE_STATUS desconocido "' + cov + '".');
}

function mapOutputACalculationStatus(out) {
  if (out === 'VALID') return 'VALID';
  if (out === 'VALID_WITH_LIMITATIONS') return 'VALID_WITH_LIMITATIONS';
  if (out === 'INSUFFICIENT' || out === 'INVALID') return 'INVALID';
  throw new Error('mapOutputACalculationStatus: OUTPUT_STATUS inesperado "' + out + '".');
}

// ── helpers deterministas ───────────────────────────────────────────────

function ordenarPor(arr, clave) {
  return arr.slice().sort(function (a, b) {
    var ka = String(a[clave]), kb = String(b[clave]);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}
function unicosOrdenados(arr) {
  var vistos = {};
  arr.forEach(function (x) { if (x != null) vistos[x] = true; });
  return Object.keys(vistos).sort();
}

// ── S1 — validate_case ──────────────────────────────────────────────────

function validarCaso(caso) {
  var errores = [];
  if (!caso || typeof caso !== 'object') throw new Error('runCFF: se esperaba un objeto de caso.');
  ['cff_case_id', 'period_start', 'period_end', 'scope', 'reporting_currency', 'valuation_basis',
    'economicScope', 'nodeRaiz', 'run_id', 'calculation_version', 'ruleset_version',
    'calculated_at', 'generated_at', 'update_reason', 'run_status'].forEach(function (k) {
    if (caso[k] === undefined || caso[k] === null) throw new Error('runCFF: falta el campo obligatorio de caso/versión "' + k + '".');
  });
  if (!Array.isArray(caso.eventos) || caso.eventos.length === 0) throw new Error('runCFF: caso.eventos debe ser un array no vacío.');
  if (!Array.isArray(caso.relaciones)) throw new Error('runCFF: caso.relaciones debe ser un array (vacío si no hay).');
  if (!caso.coberturaSeniales) throw new Error('runCFF: falta caso.coberturaSeniales (§20, 4 señales cualitativas).');

  caso.eventos.forEach(function (ev) {
    var vEv = contratos.validarCFFEvent(ev);
    if (!vEv.valido) {
      errores.push({ code: 'CONTRATO_INVALIDO', severity: 'BLOCKING', layer: 'event',
        ref: ev.event_id || '(sin event_id)', detalle: vEv.faltantes.concat(vEv.invalidos).join('; ') });
    }
    (ev.components || []).forEach(function (c) {
      var vC = contratos.validarEconomicComponent(c);
      if (!vC.valido) {
        errores.push({ code: 'CONTRATO_INVALIDO', severity: 'BLOCKING', layer: 'component',
          ref: c.component_id || '(sin component_id)', detalle: vC.faltantes.concat(vC.invalidos).join('; ') });
      }
    });
  });
  return errores;
}

// ── S2 — create_run ─────────────────────────────────────────────────────

function crearRun(caso) {
  var run = {
    run_id: caso.run_id,
    cff_case_id: caso.cff_case_id,
    calculation_version: caso.calculation_version,
    ruleset_version: caso.ruleset_version,
    formula_versions: (caso.formula_versions || []).slice().sort(),
    monetary_basis_versions: (caso.monetary_basis_versions || []).slice().sort(),
    relationship_versions: (caso.relationship_versions || []).slice().sort(),
    input_snapshot_ids: (caso.input_snapshot_ids || []).slice().sort(),
    update_reason: caso.update_reason,
    generated_at: caso.generated_at,
    run_status: caso.run_status
  };
  if (caso.parent_calculation_version != null) run.parent_calculation_version = caso.parent_calculation_version;
  return run;
}

// ── S3 — resolución por evento / componente ─────────────────────────────

function resolverComponente(ev, c, caso, errores, warnings) {
  var out = {
    component_id: c.component_id,
    event_id: ev.event_id,
    event_status: ev.status,
    primary_mechanism: c.primary_mechanism,
    financial_nature: c.financial_nature,
    temporal_nature: c.temporal_nature,
    aggregation_frequency: c.aggregation_frequency,
    original_currency: c.original_currency,
    valuation_basis: c.valuation_basis,
    monetization_status: c.monetization_status,
    monetary_basis_valid: c.monetary_basis_valid,
    temporal_basis_valid: c.temporal_basis_valid,
    scope_valid: c.scope_valid,
    esTransferenciaInternaPura: c.esTransferenciaInternaPura,
    shared_cost_id: c.shared_cost_id,
    transformacionValidada: c.transformacionValidada,
    valorFlujoEquivalente: c.valorFlujoEquivalente,
    _resuelto: true
  };

  // valor: pre-resuelto, o UNIT_RATE
  if (typeof c.original_value === 'number') {
    out.valor = c.original_value;
  } else if (c.calculation_mode === 'UNIT_RATE' && c.monetary_basis && typeof c.quantity === 'number') {
    var r = monetizacion.resolverValorComponente(c, c.monetary_basis);
    if (typeof r.valor !== 'number') {
      errores.push({ code: 'VALOR_EN_RANGO_NO_CONSOLIDABLE', severity: 'DEGRADED', layer: 'component', ref: c.component_id,
        detalle: 'UNIT_RATE resolvió a rango [' + r.valorMin + ', ' + r.valorMax + ']; runCFF consolida solo valores puntuales.' });
      out._excluidoValor = true;
      out.valor = 0;
    } else {
      out.valor = r.valor;
    }
  } else {
    errores.push({ code: 'COMPONENTE_SIN_VALOR', severity: 'DEGRADED', layer: 'component', ref: c.component_id,
      detalle: 'no trae original_value numérico ni datos UNIT_RATE (calculation_mode+monetary_basis+quantity).' });
    out._excluidoValor = true;
    out.valor = 0;
  }

  // §8.2 LOST_CAPACITY — reconstrucción obligatoria para ciertos recursos
  if (c.primary_mechanism === 'LOST_CAPACITY' &&
      monetizacion.RECURSOS_QUE_EXIGEN_RECONSTRUCCION.indexOf(c.resource_type) !== -1) {
    var tieneRecon = c.reconstruccion && monetizacion.TIPOS_RECONSTRUCCION.indexOf(c.reconstruccion.tipo) !== -1;
    if (!tieneRecon) {
      errores.push({ code: 'LOST_CAPACITY_SIN_RECONSTRUCCION', severity: 'DEGRADED', layer: 'component', ref: c.component_id,
        detalle: 'primary_mechanism=LOST_CAPACITY con resource_type=' + c.resource_type + ' exige reconstrucción (§8.2, INV-CFF-46).' });
      out.monetization_status = 'N_A';
      out._excluidoValor = true;
    }
  }

  // atribución: pre-resuelta, o desde las 6 dimensiones
  if (ATRIBUCION_ADMISIBLE.concat(['UNRESOLVED', 'N_A']).indexOf(c.attribution_status) !== -1) {
    out.attribution_status = c.attribution_status;
  } else if (c.attribution_dimensions) {
    out.attribution_status = atribucion.clasificarAtribucion(c.attribution_dimensions);
  } else {
    errores.push({ code: 'ATRIBUCION_SIN_RESOLVER', severity: 'DEGRADED', layer: 'component', ref: c.component_id,
      detalle: 'no trae attribution_status ni attribution_dimensions.' });
    out.attribution_status = 'UNRESOLVED';
  }
  if (out.attribution_status === 'UNRESOLVED' && c.deepening_applicable === true) {
    warnings.push({ code: 'DEEPENING_REQUIRED', layer: 'component', ref: c.component_id,
      detalle: 'atribución UNRESOLVED y profundización aplicable (§12).' });
  }

  // #5 — normalización de moneda (§24 normalize_currency_...): TODO componente
  // llega a consolidacion.js ya en la reporting_currency del caso. El valor
  // ORIGINAL se preserva en _originalValue/_originalCurrency + fx para la
  // trazabilidad (§17: "los valores normalizados nunca reemplazan el valor
  // original") — `valor` es solo la cifra de trabajo de la consolidación.
  out._originalValue = out.valor;
  out._originalCurrency = c.original_currency;
  if (c.original_currency !== caso.reporting_currency) {
    var fx = caso.fxPorComponente && caso.fxPorComponente[c.component_id];
    if (!fx) {
      errores.push({ code: 'FX_FALTANTE', severity: 'DEGRADED', layer: 'component', ref: c.component_id,
        detalle: 'original_currency=' + c.original_currency + ' ≠ reporting_currency=' + caso.reporting_currency +
          ' y no hay entrada en fxPorComponente (§17.1).' });
      out._excluidoValor = true;
    } else {
      var conv = moneda.convertirMoneda({ component_id: c.component_id, original_value: out.valor, original_currency: c.original_currency }, fx);
      out.normalized_value = conv.normalized_value;
      out.fx = conv.fx;
      out.valor = conv.normalized_value;          // cifra de trabajo, ya normalizada
      out.original_currency = caso.reporting_currency; // consolidacion ve un conjunto uniforme
    }
  }

  return out;
}

// ── S5 — cobertura por capa ─────────────────────────────────────────────

function coverageInputCapa(componentes, predEvaluado, categoria) {
  var excl = componentes.filter(function (c) { return !predEvaluado(c); })
    .map(function (c) { return { component_id: c.component_id, motivo: categoria, categoria: categoria }; });
  return {
    componentes_candidatos: componentes.length,
    componentes_admisibles: componentes.filter(predEvaluado).length,
    componentes_excluidos: excl
  };
}

// ── S7 — trazabilidad ───────────────────────────────────────────────────

function construirTrace(caso, run, componentesResueltos) {
  var eventIds = [], sourceIds = [], compIds = [], formulaIds = [], mbIds = [], assessmentIds = [], relIds = [];
  caso.eventos.forEach(function (ev) {
    eventIds.push(ev.event_id);
    (ev.source_ids || []).forEach(function (s) { sourceIds.push(s); });
    (ev.components || []).forEach(function (c) {
      compIds.push(c.component_id);
      if (c.formula_id) formulaIds.push(c.formula_id);
      if (c.monetary_basis_id) mbIds.push(c.monetary_basis_id);
      if (c.assessment_id) assessmentIds.push(c.assessment_id);
    });
  });
  caso.relaciones.forEach(function (r) { if (r.relationship_id) relIds.push(r.relationship_id); });
  return {
    output_id: run.run_id,
    event_ids: unicosOrdenados(eventIds),
    component_ids: unicosOrdenados(compIds),
    source_ids: unicosOrdenados(sourceIds),
    formula_ids: unicosOrdenados(formulaIds),
    monetary_basis_ids: unicosOrdenados(mbIds),
    assessment_ids: unicosOrdenados(assessmentIds),
    relationship_ids: unicosOrdenados(relIds),
    version_ids: unicosOrdenados([run.calculation_version, run.ruleset_version]
      .concat(run.formula_versions, run.monetary_basis_versions, run.relationship_versions))
  };
}

// ── perfil (groupby determinista) ───────────────────────────────────────

function perfilPor(componentes, clave, valorFn) {
  var acc = {};
  componentes.forEach(function (c) {
    var k = c[clave];
    acc[k] = (acc[k] || 0) + valorFn(c);
  });
  return Object.keys(acc).sort().map(function (k) {
    var o = {}; o[clave] = k; o.total = acc[k]; return o;
  });
}

// ═══════════════════════════════════════════════════════════════════════
// runCFF
// ═══════════════════════════════════════════════════════════════════════

function runCFF(caso) {
  var errores = validarCaso(caso);
  var warnings = [];
  var run = crearRun(caso);

  // S3 — resolución por evento/componente. Eventos con status INVALID o
  // contrato inválido: se retienen, sus componentes NO entran (§24
  // retain_event_and_continue; §25 fallo local).
  var eventosConError = {};
  errores.forEach(function (e) { if (e.layer === 'event') eventosConError[e.ref] = true; });

  var resueltos = [];
  caso.eventos.forEach(function (ev) {
    if (ev.status === 'INVALID' || eventosConError[ev.event_id]) {
      if (ev.status === 'INVALID') {
        errores.push({ code: 'EVENTO_INVALIDO', severity: 'BLOCKING', layer: 'event', ref: ev.event_id,
          detalle: 'CFF_EVENT.status = INVALID — retenido, sus componentes no entran a consolidación (§24).' });
      }
      return;
    }
    (ev.components || []).forEach(function (c) {
      resueltos.push(resolverComponente(ev, c, caso, errores, warnings));
    });
  });

  var paraConsolidar = resueltos.filter(function (c) { return !c._excluidoValor; });

  // S4 — consolidación (§19) — delega el pipeline de 6 pasos
  var cons;
  if (paraConsolidar.length === 0) {
    cons = {
      reporting_currency: caso.reporting_currency, valuation_basis: caso.valuation_basis,
      confirmed_observed: 0, confirmed_estimated: 0, supported_observed: 0, supported_estimated: 0,
      cff_confirmed: 0, cff_supported_additional: 0, cff_total: 0,
      exposure_total: 0, unresolved_impact_total: 0, flags: [],
      coverageInput: { componentes_candidatos: 0, componentes_admisibles: 0, componentes_excluidos: [] }
    };
  } else {
    cons = consolidacion.consolidarPeriodoYAlcance({
      componentes: paraConsolidar,
      relaciones: caso.relaciones,
      nodeHierarchy: caso.nodeHierarchy,
      nodeSet: caso.node_set,
      nodeRaiz: caso.nodeRaiz,
      economicScope: caso.economicScope,
      sharedCosts: caso.sharedCosts,
      toleranciaReconciliacion: caso.toleranciaReconciliacion
    });
  }

  // S5 — resolve_coverage_and_status
  var todosComponentes = resueltos;
  var covOperacional = cobertura.clasificarCobertura(
    coverageInputCapa(todosComponentes, function (c) { return !c._excluidoValor; }, 'OPERACIONAL_NO_EVALUABLE'),
    caso.coberturaSeniales);
  var evaluables = todosComponentes.filter(function (c) { return !c._excluidoValor; });
  var covMonetizacion = cobertura.clasificarCobertura(
    coverageInputCapa(evaluables, function (c) { return MONETIZACION_ADMISIBLE.indexOf(c.monetization_status) !== -1; }, 'MONETIZACION_NO_OBSERVADA_NI_ESTIMADA'),
    caso.coberturaSeniales);
  var monetizables = evaluables.filter(function (c) { return MONETIZACION_ADMISIBLE.indexOf(c.monetization_status) !== -1; });
  var covAtribucion = cobertura.clasificarCobertura(
    coverageInputCapa(monetizables, function (c) { return ATRIBUCION_ADMISIBLE.indexOf(c.attribution_status) !== -1; }, 'ATRIBUCION_NO_RESUELTA'),
    caso.coberturaSeniales);

  var overallCoverage = cobertura.rollupCobertura([
    covOperacional.coverage_status, covMonetizacion.coverage_status, covAtribucion.coverage_status
  ]);

  var ceroDeNA = cobertura.distinguirCeroDeNA(cons.cff_total, overallCoverage);
  var cffTotalFinal = ceroDeNA.value; // null si N_A

  // calculation_status — resolveStatus (§21) sobre las dependencias críticas
  var hayEventoInvalido = errores.some(function (e) { return e.layer === 'event' && e.severity === 'BLOCKING'; });
  var hayBlockingNoCobertura = errores.some(function (e) {
    return e.severity === 'BLOCKING' && e.code !== 'COBERTURA_INSUFICIENTE' && e.layer !== 'event';
  });
  var hayDegraded = errores.some(function (e) { return e.severity === 'DEGRADED'; });
  var criticas = [
    hayEventoInvalido || hayBlockingNoCobertura ? 'INVALID' : 'VALID',
    mapCoberturaAOutputStatus(overallCoverage),
    hayDegraded ? 'VALID_WITH_LIMITATIONS' : 'VALID'
  ];
  var outputStatus = estados.resolveStatus(criticas);
  var calculationStatus = mapOutputACalculationStatus(outputStatus);

  if (overallCoverage === 'INSUFFICIENT') {
    errores.push({ code: 'COBERTURA_INSUFICIENTE', severity: 'BLOCKING', layer: 'result', ref: caso.cff_case_id,
      detalle: 'overall_coverage_status = INSUFFICIENT → cff_total = null, status = N_A (AC46). ' + ceroDeNA.razon });
  }

  // S6 — invariantes (subconjunto; batería completa en Fase 5)
  if (cffTotalFinal === null && !(calculationStatus === 'INVALID' && overallCoverage === 'INSUFFICIENT')) {
    errores.push({ code: 'INVARIANTE_VIOLADO', severity: 'BLOCKING', layer: 'result', ref: 'INV-CFF-67',
      detalle: 'cff_total=null sin la combinación (INVALID + INSUFFICIENT) que lo habilita.' });
    calculationStatus = 'INVALID';
  }
  if (cffTotalFinal === 0 && overallCoverage === 'INSUFFICIENT') {
    errores.push({ code: 'INVARIANTE_VIOLADO', severity: 'BLOCKING', layer: 'result', ref: 'AC46',
      detalle: 'cff_total=0 con cobertura INSUFFICIENT — prohibido (AC46: "nunca 0 por defecto").' });
    calculationStatus = 'INVALID';
  }

  // S7 — trazabilidad
  var trace = construirTrace(caso, run, resueltos);

  // perfiles (solo sobre lo que entró al total; deterministas)
  var admisiblesFinales = paraConsolidar.filter(function (c) {
    return MONETIZACION_ADMISIBLE.indexOf(c.monetization_status) !== -1 &&
      ATRIBUCION_ADMISIBLE.indexOf(c.attribution_status) !== -1;
  });
  var valorDe = function (c) { return typeof c.normalized_value === 'number' ? c.normalized_value : c.valor; };

  // S8 — CFF_COVERAGE
  var coverage = {
    case_scope: caso.scope,
    material_events_total: caso.eventos.length,
    material_events_evaluable: caso.eventos.length - Object.keys(eventosConError).length -
      caso.eventos.filter(function (e) { return e.status === 'INVALID'; }).length,
    monetizable_events: monetizables.length,
    attributable_events: admisiblesFinales.length,
    unresolved_events: todosComponentes.filter(function (c) { return c.attribution_status === 'UNRESOLVED'; }).length,
    excluded_material_events: unicosOrdenados(Object.keys(eventosConError)),
    operational_coverage_status: covOperacional.coverage_status,
    monetization_coverage_status: covMonetizacion.coverage_status,
    attribution_coverage_status: covAtribucion.coverage_status,
    overall_coverage_status: overallCoverage,
    limitations: ordenarPor(cons.coverageInput.componentes_excluidos, 'component_id')
      .map(function (x) { return x.component_id + ': ' + x.categoria; })
  };

  // S8 — CFF_RESULT completo
  var result = {
    cff_run_id: run.run_id,
    cff_case_id: caso.cff_case_id,
    calculation_version: caso.calculation_version,
    ruleset_version: caso.ruleset_version,
    period_start: caso.period_start,
    period_end: caso.period_end,
    scope: caso.scope,
    node_set: (caso.node_set || []).slice().sort(),
    reporting_currency: caso.reporting_currency,
    valuation_basis: caso.valuation_basis,
    confirmed_observed: cons.confirmed_observed,
    confirmed_estimated: cons.confirmed_estimated,
    supported_observed: cons.supported_observed,
    supported_estimated: cons.supported_estimated,
    cff_confirmed: cons.cff_confirmed,
    cff_supported_additional: cons.cff_supported_additional,
    cff_total: cffTotalFinal,
    exposure_total: cons.exposure_total,
    unresolved_impact_total: cons.unresolved_impact_total,
    coverage: coverage,
    event_profile: perfilPor(admisiblesFinales.map(function (c) {
      return { event_id: c.event_id, v: valorDe(c) };
    }), 'event_id', function (c) { return c.v; }),
    mechanism_profile: perfilPor(admisiblesFinales, 'primary_mechanism', valorDe),
    financial_nature_profile: perfilPor(admisiblesFinales, 'financial_nature', valorDe),
    node_profile: perfilPor(admisiblesFinales.map(function (c) {
      var ev = caso.eventos.filter(function (e) { return e.event_id === c.event_id; })[0];
      return { node_id: ev ? ev.node_id : '(sin nodo)', v: valorDe(c) };
    }), 'node_id', function (c) { return c.v; }),
    calculation_status: calculationStatus,
    warnings: ordenarPor(warnings.concat(cons.flags.map(function (f) { return { code: 'CONSOLIDACION', detalle: f }; })), 'detalle'),
    errors: ordenarPor(errores, 'code'),
    dependency_refs: unicosOrdenados(
      trace.component_ids.concat(trace.event_ids, trace.monetary_basis_ids, trace.relationship_ids)),
    calculated_at: caso.calculated_at
  };

  var vRes = contratos.validarCFFResult(result);

  return {
    result: result,
    run: run,
    trace: trace,
    _meta: {
      contratoResultValido: vRes.valido,
      contratoResultProblemas: vRes.faltantes.concat(vRes.invalidos),
      coberturaPorCapa: {
        operacional: covOperacional.coverage_status,
        monetizacion: covMonetizacion.coverage_status,
        atribucion: covAtribucion.coverage_status
      },
      outputStatus: outputStatus,
      ceroDeNA: ceroDeNA
    }
  };
}

module.exports = {
  runCFF: runCFF,
  mapCoberturaAOutputStatus: mapCoberturaAOutputStatus,
  mapOutputACalculationStatus: mapOutputACalculationStatus
};
