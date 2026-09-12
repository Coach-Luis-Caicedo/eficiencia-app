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
var C = require('./contratos');
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
  var directivasPorKpi = {}; // REAPERTURA 12b: mismas directivas ya computadas por KPI, ahora también en un mapa (para resolverFenomeno → contextoGobernante)

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
    directivasPorKpi[kpiSpec.kpi_id] = directivas;
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
            node_id: nodo, period: periodo,
            evalsPorKpi: evalsPorKpi, directivasPorKpi: directivasPorKpi // REAPERTURA 12b
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

/* ═══════════════════════════════════════════════════════════════════════
 * 11b — salidas, versionamiento, publicación (§26 / §31 / §32 / INV-63/67/80)
 *
 * ── §31 — versionamiento (INV-67/AC68) ────────────────────────────
 *
 * "MISMOS INPUTS + MISMAS VERSIONES → MISMO RESULTADO." `calculation_version`
 * y `piio_run_id` son DETERMINISTAS — funciones puras de versiones estables,
 * sin Date.now() ni Math.random(). El ÚNICO campo no determinista es
 * `generated_at`. El test compara dos corridas por deep-equal excluyendo
 * SOLO `piio_run.generated_at`.
 *
 * ── §26 — export a CFF/IFD (INV-43/44/45) ─────────────────────────
 *
 * `construirExport` es PROYECCIÓN PURA: copia campos ya calculados
 * (position/trajectory/admissibility/freshness) y datos crudos
 * (numerator/denominator/exposure/observed_quantity/recurrence/directionality/
 * unit). CERO aritmética nueva — nada de costo, ROI, TRE, proyección.
 * `validarPIIOResult` rechaza cualquier clave económica/predictiva.
 * Incluye los fenómenos `PIIO_COMPATIBLE_PROVISIONAL` (§6.2 — "para CFF/IFD")
 * resueltos aparte; NUNCA entran a `efo_states` (AC63).
 *
 * ── §32 — trazabilidad (INV-80/AC80) ─────────────────────────────
 *
 * "Toda posición EFO debe poder reconstruirse hasta dominios, fenómenos,
 * grupos, KPI, observaciones y referencias." `construirTracePaths` camina
 * la genealogía de abajo hacia arriba: KPI_STATE → EVIDENCE_GROUP →
 * PHENOMENON_STATE → DOMAIN_STATE → EFO_STATE, acumulando ids.
 *
 * ── DECISIONES etiquetadas (11b) ─────────────────────────────────
 *
 *  · PIIO_RESULT — el documento no lo define (perfil ambig. A).
 *  · output_type ∈ {EFO_STATE, DOMAIN_STATE, PHENOMENON_STATE, KPI_STATE,
 *    OPERATIONAL_EXPORT} — §32 nombra el campo sin enum.
 *  · OUTPUT_STATUS — el MAPEO exacto admissibility+data_quality+severidad →
 *    status es decisión; INV-63 exige que el status exista, no cómo se calcula.
 *  · versiones de catálogo (domain_catalog_version, …) no son campos de
 *    PIIO_INPUT → derivadas de los `.version` de los specs, u `opciones.*`.
 * ═══════════════════════════════════════════════════════════════════════ */

var _OUTPUT_STATUS = ['VALID', 'VALID_WITH_LIMITATIONS', 'INSUFFICIENT', 'INVALID', 'NOT_APPLICABLE'];
var _ECON_PROHIBIDAS = ['cost', 'costo', 'roi', 'tre', 'npv', 'projection', 'proyeccion', 'forecast',
  'pronostico', 'monetiz', 'valor_economico', 'economic_value', 'estimated', 'projected', 'predicted', 'prediccion'];

function _distinct(arr) {
  var out = [], seen = {};
  _arr(arr).forEach(function (x) { if (x != null && !seen[x]) { seen[x] = 1; out.push(x); } });
  return out.sort();
}
function _versionesDe(list) { return _distinct(_arr(list).map(function (x) { return x && x.version; })); }

/** _calculationVersion(input) → string determinista (sin timestamp — INV-67). */
function _calculationVersion(input) {
  var inp = input || {};
  return [
    'rs=' + (inp.ruleset_version || '?'),
    'dc=' + _versionesDe(inp.domain_catalog).join('+'),
    'pc=' + _versionesDe(inp.phenomenon_catalog).join('+'),
    'md=' + _distinct(_arr(inp.metric_definitions).map(function (m) { return m && (m.metric_definition_id + '@' + m.definition_version); })).join('+'),
    'rf=' + _distinct(_arr(inp.references).map(function (r) { return r && (r.reference_id + '@' + r.version); })).join('+'),
    'nh=' + _versionesDe(inp.node_hierarchy).join('+')
  ].join('|');
}
/** _piioRunId(input, calcVer) → string determinista. */
function _piioRunId(input, calcVer) {
  var inp = input || {};
  return (inp.organization_id || 'org?') + '|' + _arr(inp.periods).slice().sort().join(',') + '|' + calcVer;
}

/** construirPIIORun(input, res11a, opciones) → PIIO_RUN (§31 — 15 campos). */
function construirPIIORun(input, res11a, opciones) {
  var inp = input || {}, o = opciones || {};
  var calcVer = _calculationVersion(inp);
  return {
    piio_run_id: _piioRunId(inp, calcVer),
    organization_id: inp.organization_id || null,
    period: _arr(inp.periods).slice().sort().join(','),
    calculation_version: calcVer,
    parent_calculation_version: o.parentCalculationVersion != null ? o.parentCalculationVersion : null,
    ruleset_version: inp.ruleset_version || null,
    domain_catalog_version: o.domainCatalogVersion != null ? o.domainCatalogVersion : _versionesDe(inp.domain_catalog).join('+'),
    phenomenon_catalog_version: o.phenomenonCatalogVersion != null ? o.phenomenonCatalogVersion : _versionesDe(inp.phenomenon_catalog).join('+'),
    metric_definition_versions: _distinct(_arr(inp.metric_definitions).map(function (m) { return m && (m.metric_definition_id + '@' + m.definition_version); })),
    reference_versions: _distinct(_arr(inp.references).map(function (r) { return r && (r.reference_id + '@' + r.version); })),
    node_hierarchy_version: o.nodeHierarchyVersion != null ? o.nodeHierarchyVersion : _versionesDe(inp.node_hierarchy).join('+'),
    source_snapshot_ids: _distinct(_arr(inp.observations).map(function (ob) { return ob && ob.source_id; }).concat(_arr(o.snapshots))),
    update_reason: o.updateReason != null ? o.updateReason : 'INITIAL',
    generated_at: o._now != null ? o._now : new Date().toISOString(), // ÚNICO no determinista
    run_status: res11a.run_status
  };
}

/** _outputStatus(estado, findings) → OUTPUT_STATUS (§27 / §30 / INV-63 — mapeo = decisión). */
function _outputStatus(estado, findings) {
  var e = estado || {};
  var target = e.efo_state_id || e.domain_state_id || e.phenomenon_state_id || e.kpi_state_id || e.node_id;
  if (e.applicability === 'NOT_APPLICABLE') return 'NOT_APPLICABLE';
  if (e.data_quality === 'INVALID') return 'INVALID';
  if (e.admissibility === 'NOT_ADMISSIBLE') return 'INSUFFICIENT';
  var degradado = _arr(findings).some(function (f) {
    return f.severity === 'DEGRADED' && (f.scope === 'GLOBAL' || f.target === target || f.target === e.kpi_id || f.target === e.node_id);
  });
  if (degradado || e.admissibility === 'ADMISSIBLE_WITH_LIMITATIONS' || e.data_quality === 'VALID_WITH_LIMITATIONS') return 'VALID_WITH_LIMITATIONS';
  return 'VALID';
}

/** publicar(res11a, piio_run_id, ruleset_version, findings) — INV-63: status + trazabilidad. */
function publicar(res11a, piio_run_id, ruleset_version, findings) {
  function stamp(s) {
    if (!s) return;
    s.piio_run_id = piio_run_id;
    if ('ruleset_version' in s && s.ruleset_version == null) s.ruleset_version = ruleset_version || null;
    s.output_status = _outputStatus(s, findings);
  }
  _arr(res11a.efo_states).forEach(stamp);
  _arr(res11a.domain_states).forEach(stamp);
  _arr(res11a.phenomenon_states).forEach(stamp);
  _arr(res11a.kpi_states).forEach(stamp);
}

/** construirExport(res11a, input, piio_run_id, evals) → PIIO_OPERATIONAL_EXPORT[] (§26 — 21 campos/fila). */
function construirExport(res11a, input, piio_run_id, evals) {
  var inp = input || {};
  var evalKey = {};
  _arr(evals).forEach(function (ev) { if (ev) evalKey[ev.kpi_id + '|' + ev.node_id + '|' + ev.period_start] = ev; });
  var mdKey = {};
  _arr(inp.metric_definitions).forEach(function (m) { if (m) mdKey[m.metric_definition_id + '@' + m.definition_version] = m; });
  var ksById = {};
  _arr(inp.kpi_specs).forEach(function (k) { if (k && k.kpi_id) ksById[k.kpi_id] = k; });
  var egById = {};
  _arr(res11a.evidence_groups).forEach(function (g) { if (g && g.evidence_group_id) egById[g.evidence_group_id] = g; });
  var phById = {};
  _arr(inp.phenomenon_catalog).forEach(function (p) { if (p) phById[p.phenomenon_id] = p; });

  // adoptados: de res11a.  provisionales: resolver aparte (§6.2 — para CFF/IFD, NO EFO).
  var estados = _arr(res11a.phenomenon_states).slice();
  var kpiSpecsPorId = ksById;
  // REAPERTURA 12b: evalsPorKpi sí se puede reconstruir aquí (trivial, mismo
  // helper _porKpi ya usado en runPIIO()) — pero directivasPorKpi vive en el
  // closure de runPIIO() y depende de `references`/`metric_definitions` por
  // KPI; recomputarla aquí duplicaría lógica de Fase 3 solo para fenómenos
  // provisionales, que de todos modos NUNCA alimentan la cascada EFO (AC63/
  // §6.2). Asimetría DECIDIDA, no un descuido: regime_status de los
  // provisionales queda sin cambio de comportamiento (directivas={}).
  var evalsPorKpiExport = _porKpi(evals);
  _arr(inp.phenomenon_catalog).forEach(function (phenSpec) {
    if (!phenSpec || phenSpec.status !== 'PIIO_COMPATIBLE_PROVISIONAL') return;
    _arr(inp.node_hierarchy).forEach(function (ns) {
      _arr(inp.periods).forEach(function (per) {
        var grupos = _arr(res11a.evidence_groups).filter(function (g) {
          return g && g.phenomenon_id === phenSpec.phenomenon_id && g.node_id === ns.node_id && g.period === per;
        });
        if (grupos.length === 0) return;
        try {
          var ps = phenomenon.resolverFenomeno({
            phenSpec: phenSpec, gruposColapsados: grupos, kpiSpecsPorId: kpiSpecsPorId, node_id: ns.node_id, period: per,
            evalsPorKpi: evalsPorKpiExport
          });
          ps._provisional = true;
          estados.push(ps);
        } catch (e) { /* fenómeno provisional que no resuelve → no va al export */ }
      });
    });
  });

  var rows = [];
  estados.forEach(function (ps) {
    var phenSpec = phById[ps.phenomenon_id] || {};
    var kpiIds = [];
    _arr(ps.evidence_group_profile).forEach(function (gp) {
      var g = egById[gp.evidence_group_id];
      if (g) kpiIds = kpiIds.concat(_arr(g.member_kpi_ids));
    });
    _distinct(kpiIds).forEach(function (kid) {
      var ks = ksById[kid];
      if (!ks) return;
      var md = mdKey[ks.metric_definition_id + '@' + ks.definition_version];
      if (!md) return;
      var ev = evalKey[kid + '|' + ps.node_id + '|' + ps.period];
      rows.push({
        organization_id: inp.organization_id || null,
        phenomenon_id: ps.phenomenon_id,
        phenomenon_version: phenSpec.version || null,
        domain_id: phenSpec.canonical_domain_id || null,
        node_id: ps.node_id,
        period: ps.period,
        metric_definition_id: md.metric_definition_id,
        metric_definition_version: md.definition_version,
        recurrence_type: md.recurrence_type || null,
        directionality: md.directionality || null,
        numerator: ev && ev.numerator != null ? ev.numerator : null,
        denominator: ev && ev.denominator != null ? ev.denominator : null,
        exposure: ev && ev.exposure != null ? ev.exposure : null,
        observed_quantity: ev && ev.value != null ? ev.value : null,
        unit: md.unit || null,
        position: ps.pos,
        trajectory: ps.traj,
        admissibility: ps.admissibility,
        freshness: ps.freshness,
        source_refs: ev && ev.source_id ? [ev.source_id] : [],
        piio_run_id: piio_run_id
      });
    });
  });
  rows.sort(function (a, b) {
    var ka = a.phenomenon_id + '|' + a.domain_id + '|' + a.node_id + '|' + a.period + '|' + a.metric_definition_id;
    var kb = b.phenomenon_id + '|' + b.domain_id + '|' + b.node_id + '|' + b.period + '|' + b.metric_definition_id;
    return ka < kb ? -1 : (ka > kb ? 1 : 0);
  });
  return rows;
}

// merge de las listas de genealogía. `parent_state_ids` NO se acumula aquí —
// cada nivel fija sus padres inmediatos.
function _mergeGen(a, b) {
  var campos = ['observation_ids', 'kpi_ids', 'evidence_group_ids', 'phenomenon_ids',
    'domain_ids', 'reference_ids', 'metric_definition_ids', 'source_ids', 'version_ids'];
  var out = { parent_state_ids: _arr(a.parent_state_ids).slice() };
  campos.forEach(function (c) { out[c] = _distinct(_arr(a[c]).concat(_arr(b[c]))); });
  return out;
}

/** construirTracePaths(res11a, evals, input, exportRows) → TRACE_PATH[] (§32 — 12 campos/fila). */
function construirTracePaths(res11a, evals, input, exportRows) {
  var inp = input || {};
  var ksById = {};
  _arr(inp.kpi_specs).forEach(function (k) { if (k && k.kpi_id) ksById[k.kpi_id] = k; });
  var evalPorKpiNodoPeriodo = {};
  _arr(evals).forEach(function (ev) { if (ev) (evalPorKpiNodoPeriodo[ev.kpi_id + '|' + ev.node_id + '|' + ev.period_start] = evalPorKpiNodoPeriodo[ev.kpi_id + '|' + ev.node_id + '|' + ev.period_start] || []).push(ev); });

  function base(extra) {
    return Object.assign({
      parent_state_ids: [], observation_ids: [], kpi_ids: [], evidence_group_ids: [], phenomenon_ids: [],
      domain_ids: [], reference_ids: [], metric_definition_ids: [], source_ids: [], version_ids: []
    }, extra || {});
  }

  // ── genealogía por KPI_STATE ──
  var genKpi = {};
  _arr(res11a.kpi_states).forEach(function (s) {
    var ks = ksById[s.kpi_id] || {};
    var evs = evalPorKpiNodoPeriodo[s.kpi_id + '|' + s.node_id + '|' + s.period] || [];
    genKpi[s.kpi_state_id] = base({
      kpi_ids: [s.kpi_id],
      observation_ids: _distinct(evs.map(function (e) { return e.observation_id; })),
      reference_ids: _distinct([ks.condition_reference_id, ks.temporal_reference_id]),
      metric_definition_ids: _distinct([ks.metric_definition_id]),
      source_ids: _distinct(evs.map(function (e) { return e.source_id; })),
      version_ids: _distinct([s.metric_definition_version, s.condition_reference_version, s.temporal_reference_version])
    });
  });

  // ── genealogía por EVIDENCE_GROUP ──
  var genEg = {};
  _arr(res11a.evidence_groups).forEach(function (g) {
    var acc = base({ evidence_group_ids: [g.evidence_group_id], phenomenon_ids: [g.phenomenon_id] });
    _arr(g.member_states).forEach(function (ms) {
      var gk = genKpi[ms && ms.kpi_state_id];
      if (gk) acc = _mergeGen(acc, gk);
      if (ms && ms.kpi_state_id) acc.parent_state_ids = _distinct(acc.parent_state_ids.concat([ms.kpi_state_id]));
    });
    genEg[g.evidence_group_id + '|' + g.node_id + '|' + g.period] = acc;
  });

  // ── genealogía por PHENOMENON_STATE ──
  var genPhen = {};
  _arr(res11a.phenomenon_states).forEach(function (ps) {
    var acc = base({ phenomenon_ids: [ps.phenomenon_id] });
    _arr(ps.evidence_group_profile).forEach(function (gp) {
      var ge = genEg[gp.evidence_group_id + '|' + ps.node_id + '|' + ps.period];
      if (ge) { acc = _mergeGen(acc, ge); acc.parent_state_ids = _distinct(acc.parent_state_ids.concat([gp.evidence_group_id])); }
    });
    genPhen[ps.phenomenon_state_id] = acc;
    genPhen['_key|' + ps.phenomenon_id + '|' + ps.node_id + '|' + ps.period] = acc;
  });

  // ── genealogía por DOMAIN_STATE ──
  var genDom = {};
  _arr(res11a.domain_states).forEach(function (ds) {
    var acc = base({ domain_ids: [ds.domain_id] });
    _arr(ds.core_profile).concat(_arr(ds.supporting_profile)).forEach(function (pp) {
      var gp = genPhen['_key|' + pp.phenomenon_id + '|' + ds.node_id + '|' + ds.period];
      if (gp) { acc = _mergeGen(acc, gp); }
    });
    // parent_state_ids: los phenomenon_state_id de este nodo/período
    _arr(res11a.phenomenon_states).forEach(function (ps) {
      if (ps.node_id === ds.node_id && ps.period === ds.period) acc.parent_state_ids = _distinct(acc.parent_state_ids.concat([ps.phenomenon_state_id]));
    });
    genDom[ds.domain_state_id] = acc;
    genDom['_key|' + ds.domain_id + '|' + ds.node_id + '|' + ds.period] = acc;
  });

  // ── genealogía por EFO_STATE ──
  var genEfo = {};
  _arr(res11a.efo_states).forEach(function (es) {
    var acc = base({});
    _arr(es.domain_profile).forEach(function (dp) {
      var gd = genDom['_key|' + dp.domain_id + '|' + es.node_id + '|' + es.period];
      if (gd) acc = _mergeGen(acc, gd);
    });
    _arr(res11a.domain_states).forEach(function (ds) {
      if (ds.node_id === es.node_id && ds.period === es.period) acc.parent_state_ids = _distinct(acc.parent_state_ids.concat([ds.domain_state_id]));
    });
    genEfo[es.efo_state_id] = acc;
  });

  var traces = [];
  _arr(res11a.kpi_states).forEach(function (s) { traces.push(Object.assign({ output_id: s.kpi_state_id, output_type: 'KPI_STATE' }, genKpi[s.kpi_state_id])); });
  _arr(res11a.phenomenon_states).forEach(function (s) { traces.push(Object.assign({ output_id: s.phenomenon_state_id, output_type: 'PHENOMENON_STATE' }, genPhen[s.phenomenon_state_id])); });
  _arr(res11a.domain_states).forEach(function (s) { traces.push(Object.assign({ output_id: s.domain_state_id, output_type: 'DOMAIN_STATE' }, genDom[s.domain_state_id])); });
  _arr(res11a.efo_states).forEach(function (s) { traces.push(Object.assign({ output_id: s.efo_state_id, output_type: 'EFO_STATE' }, genEfo[s.efo_state_id])); });
  _arr(exportRows).forEach(function (row) {
    var gp = genPhen['_key|' + row.phenomenon_id + '|' + row.node_id + '|' + row.period] || base({ phenomenon_ids: [row.phenomenon_id] });
    traces.push(Object.assign({ output_id: row.phenomenon_id + '|' + row.node_id + '|' + row.period + '|' + row.metric_definition_id, output_type: 'OPERATIONAL_EXPORT' },
      _mergeGen(gp, base({ metric_definition_ids: [row.metric_definition_id], source_ids: _arr(row.source_refs) }))));
  });
  traces.sort(function (a, b) { return (a.output_type + a.output_id) < (b.output_type + b.output_id) ? -1 : 1; });
  return traces;
}

function _sinEconomia(obj, ruta, errs) {
  if (!obj || typeof obj !== 'object') return;
  Object.keys(obj).forEach(function (k) {
    var kl = String(k).toLowerCase();
    if (_ECON_PROHIBIDAS.some(function (p) { return kl.indexOf(p) !== -1; })) {
      errs.push(ruta + '.' + k + ': §26 / INV-43/44/45 — PIIO no monetiza, no proyecta costo, no calcula ROI/TRE');
    }
  });
}

/** validarPIIOResult(result) → { ok, errores[] } — INV-63 / INV-80 / §35. */
function validarPIIOResult(result) {
  var errs = [];
  var r = result || {};
  ['piio_run', 'efo_states', 'domain_states', 'phenomenon_states', 'kpi_states', 'operational_export', 'trace_paths', 'findings', 'run_status'].forEach(function (k) {
    if (!(k in r)) errs.push('PIIO_RESULT: falta ' + k);
  });
  if (r.piio_run && Object.keys(r.piio_run).length !== 15) errs.push('PIIO_RUN no tiene 15 campos (§31): ' + Object.keys(r.piio_run).length);
  _sinEconomia(r.piio_run, 'piio_run', errs);

  var tpById = {};
  _arr(r.trace_paths).forEach(function (t) { tpById[t.output_id] = t; });

  _arr(r.efo_states).forEach(function (e) {
    var lig = C.validarEFOStateLigero(e);
    if (!lig.valido) errs = errs.concat(lig.invalidos.map(function (x) { return e.efo_state_id + ': ' + x; }));
    if (!e.output_status || _OUTPUT_STATUS.indexOf(e.output_status) === -1) errs.push('EFO ' + e.efo_state_id + ' publicada sin output_status válido (INV-63)');
    if (!e.piio_run_id) errs.push('EFO ' + e.efo_state_id + ' sin piio_run_id (INV-63)');
    var tp = tpById[e.efo_state_id];
    if (!tp) errs.push('EFO ' + e.efo_state_id + ' sin TRACE_PATH (INV-63)');
    else if (tp.observation_ids.length === 0 || tp.reference_ids.length === 0) errs.push('TRACE de ' + e.efo_state_id + ' no llega a observaciones/referencias (INV-80/AC80)');
  });
  _arr(r.operational_export).forEach(function (row, i) { _sinEconomia(row, 'export[' + i + ']', errs); });

  return { ok: errs.length === 0, errores: errs };
}

/** runPIIOCompleto(input, opciones) → PIIO_RESULT — el orquestador §29 completo. */
function runPIIOCompleto(input, opciones) {
  var o = opciones || {};
  var res11a = runPIIO(input);
  var piioRun = construirPIIORun(input, res11a, o);

  function ensamblar(exp, tp) {
    return {
      piio_run: piioRun,
      efo_states: _arr(res11a.efo_states), domain_states: _arr(res11a.domain_states),
      phenomenon_states: _arr(res11a.phenomenon_states), kpi_states: _arr(res11a.kpi_states),
      evidence_groups: _arr(res11a.evidence_groups), node_profile: _arr(res11a.node_profile),
      operational_export: exp, trace_paths: tp,
      findings: res11a.findings, run_status: res11a.run_status
    };
  }

  if (res11a.run_status === 'BLOCKED') {
    return ensamblar([], []); // §30: fallo global — no se publican salidas
  }

  var ing = observaciones.ingestarObservaciones(input);
  publicar(res11a, piioRun.piio_run_id, input && input.ruleset_version, res11a.findings);
  var operational_export = construirExport(res11a, input, piioRun.piio_run_id, ing.evals);
  var trace_paths = construirTracePaths(res11a, ing.evals, input, operational_export);

  var result = ensamblar(operational_export, trace_paths);
  var val = validarPIIOResult(result);
  val.errores.forEach(function (er) { result.findings.push(_finding('PIIO_RESULT_INVARIANTE', 'WARNING', 'GLOBAL', null, er)); });
  return result;
}

/* ═══════════════════════════════════════════════════════════════════════
 * REAPERTURA Fase 11 — rebasarHistoria (§8.3 / §31 / AC12 / AC13 / INV-66)
 *
 * Hallazgo de Fase 12 (auditoría de cobertura INV/AC): §31 dice que
 * `REBASE_HISTORY` "produce nuevas versiones de estados históricos; no
 * sobrescribe versiones anteriores" — Fase 3 (`evaluarCambioReferencia`)
 * ya emitía la DIRECTIVA, pero nada la ejecutaba. Este es exactamente el
 * perfil de reapertura de Fase 0 (fa0a467/8051890/cc24b3a): una fase
 * posterior encuentra un hueco real en código ya comiteado.
 *
 * INV-66 se prueba en el alcance de lo que `motor-piio` construye: PUREZA
 * del recálculo, nunca mutación del resultado previo. La persistencia de
 * múltiples versiones históricas direccionables es responsabilidad de la
 * capa de almacenamiento externa — fuera de alcance de un módulo de
 * cálculo puro (mismo patrón que AE/S/AY). `rebasarHistoria` NO se marca
 * como "INV-66 cerrado" sin más; cierra su mitad computable.
 *
 * Reusa `runPIIOCompleto` entera — CERO lógica de cascada duplicada.
 * "Rebasar historia" = volver a correr el motor sobre el mismo input
 * histórico, con la referencia nueva AGREGADA (nunca reemplazada) a
 * `input.references`; `resolverReferenciaVigente` (Fase 3, sin tocar)
 * decide por vigencia cuál referencia aplica a cada período — §8.3
 * "legítimamente aplicable a la historia" sale gratis de ese mecanismo
 * existente, sin validación nueva. `parent_calculation_version` /
 * `update_reason` (ya construidos en 11b, §31) son el enganche de
 * versionamiento — no se inventa un campo nuevo.
 *
 * HALLAZGO DE SMOKE-TEST (antes de mostrarlo): la versión superada casi
 * siempre queda declarada con `valid_to` abierto (nadie sabe de antemano
 * que la van a rebasar) — "agregar y dejar que Fase 3 decida por vigencia"
 * entonces CHOCA con la ambigüedad W (ventanas solapadas → NOT_ADMISSIBLE,
 * no "la más nueva gana"), y el período rebasado queda N_A en vez de
 * clasificar con la referencia nueva. `rebasarHistoria` por eso SÍ cierra
 * la ventana de la versión que `supersedes` señala (nunca la elimina —
 * sigue en el array, solo con `valid_to` acotado un período antes del
 * `valid_from` de la nueva) — sin eso, la función no cumple §8.3 en el
 * caso común. `_periodoAnterior` es aritmética de calendario local, NO
 * reabre `REFERENCE_SPEC` (Fase 0) — ningún campo nuevo.
 * ═══════════════════════════════════════════════════════════════════════ */
function _periodoAnterior(period) {
  var partes = String(period).split('-');
  var y = parseInt(partes[0], 10), m = parseInt(partes[1], 10) - 1;
  if (m < 1) { m = 12; y -= 1; }
  return y + '-' + (m < 10 ? '0' + m : '' + m);
}
function rebasarHistoria(inputHistorico, referenciaRebaseada, corridaPrevia) {
  var directiva = referencias.evaluarCambioReferencia(referenciaRebaseada);
  if (directiva.tipo !== 'REBASE_HISTORY') {
    // Fase 5 no confía ciegamente en que el llamante ya validó el modo —
    // esta función tampoco (mismo principio que la validación de forma).
    return { rechazado: true, motivo: 'REFERENCIA_NO_ES_REBASE_HISTORY:' + directiva.tipo };
  }
  var rb = referenciaRebaseada;
  var references = _arr(inputHistorico && inputHistorico.references).map(function (r) {
    // cierra la ventana de la versión superada (§8.3) — nunca la quita del array (§31: no sobrescribe)
    var esLaSuperada = r && rb.supersedes && r.reference_id === rb.reference_id &&
      r.reference_role === rb.reference_role && r.version === rb.supersedes;
    if (esLaSuperada && (!r.valid_to || r.valid_to >= rb.valid_from)) {
      return Object.assign({}, r, { valid_to: _periodoAnterior(rb.valid_from) });
    }
    return r;
  }).concat([rb]);
  var inputRebaseado = Object.assign({}, inputHistorico || {}, { references: references });
  var parentCalcVer = (corridaPrevia && corridaPrevia.piio_run) ? corridaPrevia.piio_run.calculation_version : null;
  var resultado = runPIIOCompleto(inputRebaseado, { parentCalculationVersion: parentCalcVer, updateReason: 'REBASE_HISTORY' });
  resultado.change_mode = 'REBASE_HISTORY';
  return resultado;
}

module.exports = {
  runPIIO: runPIIO,
  runPIIOCompleto: runPIIOCompleto,
  construirPIIORun: construirPIIORun,
  construirExport: construirExport,
  construirTracePaths: construirTracePaths,
  publicar: publicar,
  validarPIIOResult: validarPIIOResult,
  rebasarHistoria: rebasarHistoria,
  _resolverMetricDef: _resolverMetricDef,
  _directivaCambio: _directivaCambio,
  _ctxNodo: _ctxNodo,
  _clasificarRun: _clasificarRun,
  _calculationVersion: _calculationVersion,
  _piioRunId: _piioRunId,
  _outputStatus: _outputStatus,
  _periodoAnterior: _periodoAnterior
};
