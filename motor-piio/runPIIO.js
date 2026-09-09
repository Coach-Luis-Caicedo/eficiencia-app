/**
 * motor-piio/runPIIO.js — Fase 11
 *
 * Orquestador §29. Encadena las 10 fases en el orden runtime del
 * pseudocódigo. Se construye en 2 partes:
 *
 *   11a  encadenado de la cascada (§29 pasos 1–11) + propagación de
 *        errores §30/§30.1 + try/catch por unidad (AC69)      ← este archivo
 *   11b  build_operational_export_for_CFF_IFD (§26) + build_trace_paths
 *        (§32) + persist_immutable_run → PIIO_RUN (§31) + publish +
 *        OUTPUT_STATUS (INV-63) + PIIO_RESULT + determinismo (INV-67/AC68)
 *
 * ── _CONTRATO_INTERFAZ — las 10 fronteras (verificado contra el código) ──
 *
 *  A  input        → F1  validarConfiguracion(input)
 *  B  input        → F2  ingestarObservaciones(input)   [lee observations, kpi_specs]
 *  C  F2 → F5   evals (por kpi_id)          F5 agrupa por kpi_id y deriva `period`
 *                                           de period_start/end (cruce #1 — F5 lo maneja)
 *  D  F3 → F5   referencias: input.references (crudo) + directivas
 *              { cambioReferencia: evaluarCambioReferencia(...),
 *                continuidad: continuidadDefinicion(metricDef) }
 *  E  F1 → F5   reporteFase1 { kpis_degradados, estados_bloqueados }  (ambig. P)
 *  F  F0 → F5   metricDef por metric_definition_id + definition_version (ambig. Q);
 *              F5 renombra metricDef.definition_version → KPI_STATE.metric_definition_version
 *              (cruce #2, anclado en F5 MUT9)
 *  G  F5 → F6   agruparPorEvidenceGroup(kpi_states, input.evidence_groups, input.kpi_specs)
 *  H  F6 → F7   gruposColapsados: grupos.filter(phenomenon_id ∧ node_id ∧ period)
 *  I  F7 → F8   phenomenonStates: filter(node_id ∧ period ∧ (core∪supporting).includes(phenomenon_id));
 *              contexto: _ctxNodo(nodo, input)  ← ambig. AV cableada por 1ª vez (cruce #5)
 *  J  F8 → F9   domainStates: filter(node_id ∧ period) ; nodeSpec: nodeSpecById[nodo]
 *  K  F9 → F10  construirNodeProfile(efo_states, node_hierarchy)
 *
 * ── §30 / §30.1 — propagación de errores ──────────────────────────
 *
 * El orquestador NO inventa severidades — consume las de cada fase:
 *   BLOCKING+GLOBAL  (F1 !ok)          → aborta, run_status BLOCKED (AC70/71)
 *   BLOCKING+STATE   (F5 bloqueado)    → ese estado no se publica; el resto sigue (AC73)
 *   DEGRADED+KPI     (F1 → F5 pos=N_A) → 11b: output_status ≤ VALID_WITH_LIMITATIONS
 *   WARNING          (flags)           → se conserva en findings, no degrada
 *   error local no capturado           → try/catch POR UNIDAD (AC69 / §30.1
 *                                        "propagación por dependencia"): finding
 *                                        BLOCKING/STATE, la unidad no produce estado,
 *                                        las unidades independientes continúan
 *
 * ── DECISIONES etiquetadas (11a) ─────────────────────────────────
 *
 *  · run_status ∈ { COMPLETED, PARTIAL, BLOCKED } — el documento no da enum
 *    (perfil de PIIO_INPUT / ambig. A).
 *  · PIIO_COMPATIBLE_PROVISIONAL (§6.2): PHENOMENON_SPEC no tiene campo
 *    `status` en el esquema de Fase 0 → se lee `phenSpec.status`, sin
 *    validar; `=== 'PIIO_COMPATIBLE_PROVISIONAL'` → excluido de la cascada
 *    EFO (AC63 / INV-69). Sin reabrir Fase 0.
 *  · efoPrevio / historia EFO = null en 11a — una corrida no tiene runs
 *    anteriores; la historia la aporta 11b. `traj = N_A` + flag es lo esperado.
 */

'use strict';

var config = require('./config');
var observaciones = require('./observaciones');
var referencias = require('./referencias');
var kpiState = require('./kpiState');
var evidenceGroup = require('./evidenceGroup');
var phenomenon = require('./phenomenon');
var domain = require('./domain');
var efo = require('./efo');
var nodos = require('./nodos');

function _arr(x) { return Array.isArray(x) ? x : []; }
function _finding(code, severity, scope, target, message) {
  return { code: code, severity: severity, scope: scope, target: target || null, message: message || '' };
}

/** metricDef por metric_definition_id + definition_version (ambig. Q). */
function _resolverMetricDef(kpiSpec, metricDefs) {
  var ks = kpiSpec || {};
  var found = _arr(metricDefs).filter(function (md) {
    return md && md.metric_definition_id === ks.metric_definition_id && md.definition_version === ks.definition_version;
  })[0];
  return found || null;
}

/** directiva de cambio de referencia para un KPI (si alguna ref suya trae change_mode). */
function _directivaCambio(kpiSpec, references) {
  var ks = kpiSpec || {};
  var ids = [ks.condition_reference_id, ks.temporal_reference_id];
  var refConCambio = _arr(references).filter(function (r) {
    return r && ids.indexOf(r.reference_id) !== -1 && typeof r.change_mode === 'string' && r.change_mode;
  })[0];
  return referencias.evaluarCambioReferencia(refConCambio || null);
}

/** contexto de aplicabilidad de un nodo (ambig. AV — cableado desde NODE_SPEC / org). */
function _ctxNodo(nodeId, input) {
  var ns = _arr(input.node_hierarchy).filter(function (n) { return n && n.node_id === nodeId; })[0] || {};
  var sr = ns.scope_rules || {};
  return sr.context || ns.node_type || input.organization_id || 'DEFAULT';
}

function _nodos(input) { return _arr(input.node_hierarchy).map(function (n) { return n.node_id; }); }
function _nodeSpec(nodeId, input) { return _arr(input.node_hierarchy).filter(function (n) { return n && n.node_id === nodeId; })[0] || null; }

function _porKpi(evals) {
  var m = {};
  _arr(evals).forEach(function (e) { if (e && e.kpi_id) (m[e.kpi_id] = m[e.kpi_id] || []).push(e); });
  return m;
}

function _clasificarRun(findings) {
  if (findings.some(function (f) { return f.severity === 'BLOCKING' && f.scope === 'GLOBAL'; })) return 'BLOCKED';
  if (findings.some(function (f) { return f.severity === 'BLOCKING' || f.severity === 'DEGRADED'; })) return 'PARTIAL';
  return 'COMPLETED';
}

function _vacio(run_status, findings) {
  return {
    kpi_states: [], evidence_groups: [], phenomenon_states: [], domain_states: [],
    efo_states: [], node_profile: [], findings: findings, run_status: run_status
  };
}

/**
 * runPIIO(input) → {
 *   kpi_states[], evidence_groups[], phenomenon_states[], domain_states[],
 *   efo_states[], node_profile[], findings[], run_status
 * }
 * (11b lo envuelve en PIIO_RESULT con PIIO_RUN / TRACE_PATH / export / publish.)
 */
function runPIIO(input) {
  var inp = input || {};
  var findings = [];
  var periodos = _arr(inp.periods);
  var nodeIds = _nodos(inp);

  // ── §29 pasos 1–4: validación (F1) ──────────────────────────────
  var cfg = config.validarConfiguracion(inp);
  findings = findings.concat(cfg.findings || []);
  if (!cfg.ok) {
    return _vacio('BLOCKED', findings); // §30 BLOCKING+GLOBAL / AC70/71
  }

  // ── §29 paso 5: ingest (F2) ─────────────────────────────────────
  var ing;
  try { ing = observaciones.ingestarObservaciones(inp); }
  catch (e) {
    findings.push(_finding('INGEST_ERROR', 'BLOCKING', 'GLOBAL', null, String(e && e.message)));
    return _vacio('BLOCKED', findings);
  }
  _arr(ing.skipped).forEach(function (s) {
    findings.push(_finding('OBSERVACION_OMITIDA', 'WARNING', 'KPI', s.observation_id || null, s.reason || ''));
  });
  var evalsPorKpi = _porKpi(ing.evals);

  // ── §29 paso 6: resolve_kpi_state (F5), por kpi_spec ────────────
  var kpi_states = [];
  _arr(inp.kpi_specs).forEach(function (kpiSpec) {
    var metricDef = _resolverMetricDef(kpiSpec, inp.metric_definitions);
    if (!metricDef) {
      findings.push(_finding('METRIC_DEFINITION_VERSION_AUSENTE', 'BLOCKING', 'STATE', kpiSpec.kpi_id, 'no resuelve ' + kpiSpec.metric_definition_id + '@' + kpiSpec.definition_version)); // AC73
      return;
    }
    var directivas = {
      cambioReferencia: _directivaCambio(kpiSpec, inp.references),
      continuidad: referencias.continuidadDefinicion(metricDef)
    };
    try {
      var r = kpiState.resolverKpiState({
        evals: evalsPorKpi[kpiSpec.kpi_id] || [],
        kpiSpec: kpiSpec, metricDef: metricDef,
        referencias: inp.references, directivas: directivas,
        reporteFase1: { kpis_degradados: cfg.kpis_degradados, estados_bloqueados: cfg.estados_bloqueados }
      });
      if (r.bloqueado) {
        findings.push(_finding('KPI_STATE_BLOQUEADO', 'BLOCKING', 'STATE', kpiSpec.kpi_id, 'bloqueado en Fase 1 (AC73)'));
        return; // no publica ese estado; el resto de la cascada continúa
      }
      kpi_states = kpi_states.concat(r.estados || []);
    } catch (e) {
      findings.push(_finding('KPI_ERROR', 'BLOCKING', 'STATE', kpiSpec.kpi_id, String(e && e.message))); // AC69 / §30.1
    }
  });

  // ── §29 paso 7: resolve_evidence_groups (F6) ────────────────────
  var evidence_groups = [];
  try {
    var eg = evidenceGroup.agruparPorEvidenceGroup(kpi_states, inp.evidence_groups, inp.kpi_specs);
    evidence_groups = eg.grupos || [];
    _arr(eg.flags).forEach(function (fl) { findings.push(_finding('EVIDENCE_GROUP', 'WARNING', 'STATE', null, String(fl))); });
  } catch (e) {
    findings.push(_finding('EVIDENCE_GROUP_ERROR', 'BLOCKING', 'GLOBAL', null, String(e && e.message)));
  }

  var kpiSpecsPorId = {};
  _arr(inp.kpi_specs).forEach(function (k) { if (k && k.kpi_id) kpiSpecsPorId[k.kpi_id] = k; });

  // ── §29 paso 8: resolve_phenomenon_state (F7), por (fenómeno, nodo, período) ──
  var phenomenon_states = [];
  _arr(inp.phenomenon_catalog).forEach(function (phenSpec) {
    if (phenSpec && phenSpec.status === 'PIIO_COMPATIBLE_PROVISIONAL') {
      findings.push(_finding('FENOMENO_PROVISIONAL_EXCLUIDO', 'WARNING', 'STATE', phenSpec.phenomenon_id, 'PIIO_COMPATIBLE_PROVISIONAL no alimenta EFO (§6.2 / AC63 / INV-69)'));
      return;
    }
    nodeIds.forEach(function (nodo) {
      periodos.forEach(function (periodo) {
        var grupos = evidence_groups.filter(function (g) {
          return g && g.phenomenon_id === phenSpec.phenomenon_id && g.node_id === nodo && g.period === periodo;
        });
        if (grupos.length === 0) return; // nada que resolver aquí
        try {
          phenomenon_states.push(phenomenon.resolverFenomeno({
            phenSpec: phenSpec, gruposColapsados: grupos, kpiSpecsPorId: kpiSpecsPorId,
            node_id: nodo, period: periodo
          }));
        } catch (e) {
          findings.push(_finding('PHENOMENON_ERROR', 'BLOCKING', 'STATE', phenSpec.phenomenon_id, String(e && e.message)));
        }
      });
    });
  });

  // ── §29 paso 9: resolve_domain_state (F8), por (dominio, nodo, período) ──
  var domain_states = [];
  _arr(inp.domain_catalog).forEach(function (domainSpec) {
    var idsDom = _arr(domainSpec.core_phenomenon_ids).concat(_arr(domainSpec.supporting_phenomenon_ids));
    nodeIds.forEach(function (nodo) {
      periodos.forEach(function (periodo) {
        var phenStates = phenomenon_states.filter(function (ps) {
          return ps && ps.node_id === nodo && ps.period === periodo && idsDom.indexOf(ps.phenomenon_id) !== -1;
        });
        if (phenStates.length === 0) return;
        try {
          domain_states.push(domain.resolverDominio({
            domainSpec: domainSpec, contexto: _ctxNodo(nodo, inp),
            phenomenonStates: phenStates, node_id: nodo, period: periodo
          }));
        } catch (e) {
          findings.push(_finding('DOMAIN_ERROR', 'BLOCKING', 'STATE', domainSpec.domain_id, String(e && e.message)));
        }
      });
    });
  });

  // ── §29 paso 10: resolve_efo (F9), por (nodo, período) ──────────
  var efo_states = [];
  nodeIds.forEach(function (nodo) {
    periodos.forEach(function (periodo) {
      var domStates = domain_states.filter(function (ds) { return ds && ds.node_id === nodo && ds.period === periodo; });
      if (domStates.length === 0) return;
      try {
        efo_states.push(efo.resolverEFO({
          domainStates: domStates, nodeSpec: _nodeSpec(nodo, inp),
          organization_id: inp.organization_id, node_id: nodo, period: periodo,
          efoPrevio: null
        }));
      } catch (e) {
        findings.push(_finding('EFO_ERROR', 'BLOCKING', 'STATE', nodo, String(e && e.message)));
      }
    });
  });

  // ── §29 paso 11: build_domain_and_node_profiles (F10) ──────────
  var node_profile = [];
  try {
    node_profile = nodos.construirNodeProfile(efo_states, inp.node_hierarchy);
    var orgFilt = nodos.nodosParaEFOOrganizacional(efo_states, inp.node_hierarchy);
    _arr(orgFilt.flags).forEach(function (fl) { findings.push(_finding('NODE_SCOPE', 'WARNING', 'STATE', null, String(fl))); });
  } catch (e) {
    findings.push(_finding('NODE_PROFILE_ERROR', 'WARNING', 'GLOBAL', null, String(e && e.message)));
  }

  return {
    kpi_states: kpi_states,
    evidence_groups: evidence_groups,
    phenomenon_states: phenomenon_states,
    domain_states: domain_states,
    efo_states: efo_states,
    node_profile: node_profile,
    findings: findings,
    run_status: _clasificarRun(findings)
  };
}

module.exports = {
  runPIIO: runPIIO,
  _resolverMetricDef: _resolverMetricDef,
  _directivaCambio: _directivaCambio,
  _ctxNodo: _ctxNodo,
  _clasificarRun: _clasificarRun
};
