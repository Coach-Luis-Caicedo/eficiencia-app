/**
 * motor-piio/contratos.js — Fase 0
 *
 * Contratos de datos de PIIO como VALIDADORES DE FORMA (mismo criterio que
 * motor-ifd / motor-fpv): campos obligatorios, tipos, pertenencia a enum,
 * y la semántica de ausencia de §28. NO validan referencias cruzadas entre
 * catálogos (eso es Fase 1), NO resuelven estados (Fase 5+).
 *
 * Formas cubiertas (todas verbatim del documento salvo donde se anota):
 *   METRIC_DEFINITION  §7
 *   KPI_OBSERVATION    §9
 *   KPI_SPEC           §10
 *   EVIDENCE_GROUP     §14
 *   PHENOMENON_SPEC    §25.1
 *   DOMAIN_SPEC        §25.2
 *   REFERENCE_SPEC     §25.3
 *   NODE_SPEC          §25.4
 *   PIIO_INPUT / case  §29 (el documento NO lo define — ambigüedad A,
 *                           decisión de diseño anotada abajo)
 *
 * Las formas de salida (KPI_STATE, PHENOMENON_STATE, DOMAIN_STATE,
 * EFO_STATE) se validan LIGERO en Fase 0 (esqueleto) y completo cuando el
 * orquestador las produzca (Fase 11) — mismo patrón que validarFPVOutput.
 */

'use strict';

var mod = require('./enums');
var ENUMS = mod.ENUMS;
var DOMAINS = mod.DOMAINS;
var esValorDe = mod.esValorDe;

// ── primitivas ───────────────────────────────────────────────────────

function esStringNoVacio(v) { return typeof v === 'string' && v.trim().length > 0; }
function esNumFinito(v) { return typeof v === 'number' && isFinite(v); }
function esBool(v) { return typeof v === 'boolean'; }
function esArrayDeStrings(v) { return Array.isArray(v) && v.every(esStringNoVacio); }
function esArrayNoVacioDeStrings(v) { return Array.isArray(v) && v.length > 0 && v.every(esStringNoVacio); }
function enEnum(nombre) { return function (v) { return esValorDe(ENUMS[nombre], v); }; }

// ─────────────────────────────────────────────────────────────────────
// §28 — clasificarAusencia: semántica del VALOR de una observación.
//
// "Missing no es cero. Cero es un valor válido solo cuando el sistema
//  fuente confirma que representa ausencia observada. [...] Un valor no
//  disponible se representa como null acompañado de status/reason."
//
// obs = { value, quality_status?, absence_reason? }
// → uno de ENUMS.AUSENCIA_KIND.
//
// N_A NUNCA se devuelve aquí — §28: N_A es categoría de pos/traj/pers, no
// de valor. Un value === 'N_A' es un error de uso → 'INVALIDO'.
// ─────────────────────────────────────────────────────────────────────
function clasificarAusencia(obs) {
  if (obs === null || typeof obs !== 'object') return 'INVALIDO';
  var v = obs.value;
  var q = obs.quality_status;

  if (typeof v === 'number' && isFinite(v)) {
    if (v !== 0) return 'VALOR_PRESENTE';
    // v === 0 — solo vale como cero observado si la fuente lo sustenta (§9)
    if (q === 'VALID' || q === 'VALID_WITH_LIMITATIONS') return 'CERO_OBSERVADO';
    return 'INVALIDO';
  }

  if (v === null) {
    if (q === 'MISSING') return 'MISSING';                       // §28 / INV-PIIO-02
    if (esStringNoVacio(obs.absence_reason)) return 'NULL_CON_RAZON';
    return 'INVALIDO';                                           // INV-PIIO-64 / AC74: null sin reason
  }

  // undefined, NaN, string ('N_A' incluido), boolean, objeto…
  return 'INVALIDO';
}

// ── validador genérico de esquema (reusado de FPV/IFD) ────────────────
//
// schema: [{ name, required, check, msg, nullable? }]
//   required  — si falta ⇒ `faltantes`
//   nullable  — un null explícito es aceptable, no se corre `check`
//   check(v)  — true si la forma es válida
function validarObjeto(schema, obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valido: false, faltantes: ['(objeto — llegó ' + (obj === null ? 'null' : Array.isArray(obj) ? 'array' : typeof obj) + ')'], invalidos: [] };
  }
  var faltantes = [], invalidos = [];
  schema.forEach(function (campo) {
    var val = obj[campo.name];
    var ausente = val === undefined || (val === null && !campo.nullable);
    if (ausente) { if (campo.required) faltantes.push(campo.name); return; }
    if (val === null && campo.nullable) return;
    if (!campo.check(val)) invalidos.push(campo.name + ': ' + campo.msg);
  });
  return { valido: faltantes.length === 0 && invalidos.length === 0, faltantes: faltantes, invalidos: invalidos };
}

// ═════════════════════════════════════════════════════════════════════
// §7 — METRIC_DEFINITION
// ═════════════════════════════════════════════════════════════════════
var ESQUEMA_METRIC_DEFINITION = [
  { name: 'metric_definition_id', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'phenomenon_id', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'name', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'operational_definition', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'numerator_definition', required: false, check: esStringNoVacio, msg: 'string no vacío (opcional)' },
  { name: 'denominator_definition', required: false, check: esStringNoVacio, msg: 'string no vacío (opcional)' },
  { name: 'unit', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'metric_type', required: true, check: enEnum('METRIC_TYPE'), msg: ENUMS.METRIC_TYPE.join(' | ') },
  { name: 'directionality', required: true, check: enEnum('DIRECTIONALITY'), msg: ENUMS.DIRECTIONALITY.join(' | ') },
  { name: 'source_frequency', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'calculation_frequency', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'aggregation_frequency', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'rate_period', required: false, check: esStringNoVacio, msg: 'string no vacío (opcional)' },
  { name: 'annualization_rule', required: false, check: esStringNoVacio, msg: 'string no vacío (opcional; §53: no automática)' },
  { name: 'valid_range_min', required: false, check: esNumFinito, msg: 'número finito (opcional)' },
  { name: 'valid_range_max', required: false, check: esNumFinito, msg: 'número finito (opcional)' },
  { name: 'boundary_behavior', required: true, check: enEnum('BOUNDARY_BEHAVIOR'), msg: ENUMS.BOUNDARY_BEHAVIOR.join(' | ') },
  { name: 'exposure_definition', required: false, check: esStringNoVacio, msg: 'string no vacío (opcional)' },
  { name: 'recurrence_type', required: true, check: enEnum('RECURRENCE_TYPE'), msg: ENUMS.RECURRENCE_TYPE.join(' | ') },
  { name: 'definition_version', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'valid_from', required: true, check: esStringNoVacio, msg: 'string no vacío (fecha)' },
  { name: 'valid_to', required: false, check: esStringNoVacio, msg: 'string no vacío (opcional)' },
  { name: 'continuity_mode', required: true, check: enEnum('CONTINUITY_MODE'), msg: ENUMS.CONTINUITY_MODE.join(' | ') + ' (ambigüedad E — valores reusados de DEFINITION_CONTINUITY)' },
  // ── ambigüedad D: §11.1 exige "reglas explícitas para desviación por
  //    debajo y por encima" para TARGET_RANGE, pero §7 no lista un campo.
  //    Extensión de contrato (decisión de diseño): obligatorio SOLO cuando
  //    directionality === 'TARGET_RANGE'. Se valida en validarMetricDefinition.
  { name: 'target_range_rules', required: false, check: function (v) {
      return v !== null && typeof v === 'object' && !Array.isArray(v) &&
        esStringNoVacio(v.below) && esStringNoVacio(v.above);
    }, msg: '{ below, above } — reglas de clasificación (extensión §7 por ambigüedad D)' }
];

function validarMetricDefinition(obj) {
  var r = validarObjeto(ESQUEMA_METRIC_DEFINITION, obj);
  if (obj && typeof obj === 'object' && obj.directionality === 'TARGET_RANGE') {
    var tr = obj.target_range_rules;
    var ok = tr && typeof tr === 'object' && !Array.isArray(tr) && esStringNoVacio(tr.below) && esStringNoVacio(tr.above);
    if (!ok) {
      r = { valido: false, faltantes: r.faltantes.slice(), invalidos: r.invalidos.slice() };
      r.invalidos.push('target_range_rules: obligatorio con directionality=TARGET_RANGE — { below, above } (§11.1 / ambigüedad D)');
    }
  }
  return r;
}

// ═════════════════════════════════════════════════════════════════════
// §9 — KPI_OBSERVATION.  `value` es nullable (null + quality_status=MISSING
// para una observación ausente, §28). NO se rellena con 0.
// ═════════════════════════════════════════════════════════════════════
var ESQUEMA_KPI_OBSERVATION = [
  { name: 'observation_id', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'organization_id', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'kpi_id', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'metric_definition_id', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'node_id', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'period_start', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'period_end', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'observed_at', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'value', required: true, nullable: true, check: esNumFinito, msg: 'número finito o null (§28: null ⇒ quality_status=MISSING, nunca 0)' },
  { name: 'unit', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'numerator', required: false, nullable: true, check: esNumFinito, msg: 'número finito (opcional; se preserva si existe, §9.2)' },
  { name: 'denominator', required: false, nullable: true, check: esNumFinito, msg: 'número finito (opcional; se preserva si existe, §9.2)' },
  { name: 'exposure', required: false, nullable: true, check: esNumFinito, msg: 'número finito (opcional; separada de incidencia, INV-55)' },
  { name: 'source_id', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'source_traceable', required: true, check: esBool, msg: 'boolean' },
  { name: 'quality_status', required: true, check: enEnum('DATA_QUALITY_STATUS'), msg: ENUMS.DATA_QUALITY_STATUS.join(' | ') },
  { name: 'flags', required: false, check: function (v) { return Array.isArray(v) && v.every(esStringNoVacio); }, msg: 'array de strings (opcional)' },
  { name: 'absence_reason', required: false, check: esStringNoVacio, msg: 'string no vacío (opcional; requerido si value=null y quality_status≠MISSING — INV-64)' }
];

function validarKpiObservation(obj) {
  var r = validarObjeto(ESQUEMA_KPI_OBSERVATION, obj);
  // §28 / INV-PIIO-64: null publicado requiere reason (MISSING ya lo es)
  if (obj && typeof obj === 'object' && obj.value === null &&
      obj.quality_status !== 'MISSING' && !esStringNoVacio(obj.absence_reason)) {
    r = { valido: false, faltantes: r.faltantes.slice(), invalidos: r.invalidos.slice() };
    r.invalidos.push('absence_reason: value=null con quality_status≠MISSING requiere razón (§28 / INV-PIIO-64)');
  }
  return r;
}

// ═════════════════════════════════════════════════════════════════════
// §10 — KPI_SPEC.  Campos DERIVED-only obligatorios sii computation=DERIVED.
// ═════════════════════════════════════════════════════════════════════
var ESQUEMA_KPI_SPEC = [
  { name: 'kpi_id', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'name', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'description', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'primary_domain_id', required: true, check: function (v) { return esValorDe(DOMAINS, v); }, msg: 'uno de ' + DOMAINS.join(' | ') + ' (§5)' },
  { name: 'primary_phenomenon_id', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'metric_definition_id', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'evidence_group_id', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'evidence_proximity', required: true, check: enEnum('EVIDENCE_PROXIMITY'), msg: ENUMS.EVIDENCE_PROXIMITY.join(' | ') },
  { name: 'computation', required: true, check: enEnum('COMPUTATION'), msg: ENUMS.COMPUTATION.join(' | ') },
  { name: 'temporal_role', required: true, check: enEnum('TEMPORAL_ROLE'), msg: ENUMS.TEMPORAL_ROLE.join(' | ') },
  { name: 'expected_lag', required: false, check: esStringNoVacio, msg: 'string no vacío (opcional; obligatorio de hecho si temporal_role=LAGGED)' },
  { name: 'freshness_spec', required: true, check: function (v) {
      return v !== null && typeof v === 'object' && !Array.isArray(v);
    }, msg: 'objeto (§13; forma exacta calibrable — ambigüedad C)' },
  { name: 'condition_reference_id', required: true, check: esStringNoVacio, msg: 'string no vacío (REF_COND, §8.1)' },
  { name: 'temporal_reference_id', required: true, check: esStringNoVacio, msg: 'string no vacío (REF_TEMP, §8)' },
  { name: 'proxy_allowed_as_primary', required: false, check: esBool, msg: 'boolean (opcional; default false)' },
  { name: 'definition_version', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'source_requirements', required: true, check: function (v) { return Array.isArray(v) && v.every(esStringNoVacio); }, msg: 'array de strings' },
  // DERIVED-only
  { name: 'formula_id', required: false, check: esStringNoVacio, msg: 'string no vacío (obligatorio si computation=DERIVED)' },
  { name: 'formula_version', required: false, check: esStringNoVacio, msg: 'string no vacío (obligatorio si computation=DERIVED)' },
  { name: 'source_variables', required: false, check: esArrayNoVacioDeStrings, msg: 'array no vacío de strings (obligatorio si computation=DERIVED)' }
];

function validarKpiSpec(obj) {
  var r = validarObjeto(ESQUEMA_KPI_SPEC, obj);
  if (obj && typeof obj === 'object' && obj.computation === 'DERIVED') {
    var faltan = [];
    if (!esStringNoVacio(obj.formula_id)) faltan.push('formula_id');
    if (!esStringNoVacio(obj.formula_version)) faltan.push('formula_version');
    if (!esArrayNoVacioDeStrings(obj.source_variables)) faltan.push('source_variables');
    if (faltan.length) {
      r = { valido: false, faltantes: r.faltantes.concat(faltan.map(function (f) { return f + ' (computation=DERIVED, §10)'; })), invalidos: r.invalidos.slice() };
    }
  }
  // INV-PIIO-13: DERIVED no implica menor proximidad — no se fuerza
  // evidence_proximity según computation. Aquí solo se documenta.
  return r;
}

// ═════════════════════════════════════════════════════════════════════
// §14 — EVIDENCE_GROUP
// ═════════════════════════════════════════════════════════════════════
var ESQUEMA_EVIDENCE_GROUP = [
  { name: 'evidence_group_id', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'phenomenon_id', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'node_id', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'member_kpi_ids', required: true, check: esArrayNoVacioDeStrings, msg: 'array no vacío de strings' },
  { name: 'source_lineage_ids', required: true, check: esArrayDeStrings, msg: 'array de strings' },
  // ambigüedad G: §14 nombra el campo, sin enum/formato. Enum corto +
  // texto libre. DECISIÓN DE DISEÑO, anotada.
  { name: 'independence_basis', required: true, check: function (v) {
      return v !== null && typeof v === 'object' && !Array.isArray(v) &&
        esValorDe(['SEPARATE_SOURCE', 'SEPARATE_METHOD', 'SEPARATE_PROCESS', 'DECLARED_OTHER'], v.kind) &&
        esStringNoVacio(v.detail);
    }, msg: '{ kind: SEPARATE_SOURCE|SEPARATE_METHOD|SEPARATE_PROCESS|DECLARED_OTHER, detail } (ambigüedad G)' },
  { name: 'resolution_rule_version', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'status', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'flags', required: false, check: function (v) { return Array.isArray(v) && v.every(esStringNoVacio); }, msg: 'array de strings (opcional)' }
];
function validarEvidenceGroup(obj) { return validarObjeto(ESQUEMA_EVIDENCE_GROUP, obj); }

// ═════════════════════════════════════════════════════════════════════
// §25.1 — PHENOMENON_SPEC
// ═════════════════════════════════════════════════════════════════════
var ESQUEMA_PHENOMENON_SPEC = [
  { name: 'phenomenon_id', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'name', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'operational_definition', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'canonical_domain_id', required: true, check: function (v) { return esValorDe(DOMAINS, v); }, msg: 'uno de ' + DOMAINS.join(' | ') },
  { name: 'recurrence_type', required: true, check: enEnum('RECURRENCE_TYPE'), msg: ENUMS.RECURRENCE_TYPE.join(' | ') },
  { name: 'directionality', required: true, check: enEnum('DIRECTIONALITY'), msg: ENUMS.DIRECTIONALITY.join(' | ') },
  { name: 'exposure_definition', required: false, check: esStringNoVacio, msg: 'string no vacío (opcional)' },
  { name: 'unit_of_effect', required: false, check: esStringNoVacio, msg: 'string no vacío (opcional)' },
  { name: 'required_evidence_group_ids', required: true, check: esArrayDeStrings, msg: 'array de strings' },
  { name: 'optional_evidence_group_ids', required: true, check: esArrayDeStrings, msg: 'array de strings' },
  { name: 'proxy_allowed_as_primary', required: true, check: esBool, msg: 'boolean' },
  // roles CORE/SUPPORTING por dominio — §18. Mapa { <domain_id>: 'CORE'|'SUPPORTING' }.
  { name: 'core_or_supporting_by_domain', required: true, check: function (v) {
      if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
      var ks = Object.keys(v);
      return ks.length > 0 && ks.every(function (k) {
        return esValorDe(DOMAINS, k) && (v[k] === 'CORE' || v[k] === 'SUPPORTING');
      });
    }, msg: '{ <domain_id>: CORE|SUPPORTING } no vacío (§18)' },
  { name: 'applicable_node_types', required: true, check: esArrayDeStrings, msg: 'array de strings' },
  { name: 'version', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'valid_from', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'valid_to', required: false, check: esStringNoVacio, msg: 'string no vacío (opcional)' }
];
function validarPhenomenonSpec(obj) { return validarObjeto(ESQUEMA_PHENOMENON_SPEC, obj); }

// ═════════════════════════════════════════════════════════════════════
// §25.2 — DOMAIN_SPEC
// ═════════════════════════════════════════════════════════════════════
var ESQUEMA_DOMAIN_SPEC = [
  { name: 'domain_id', required: true, check: function (v) { return esValorDe(DOMAINS, v); }, msg: 'uno de ' + DOMAINS.join(' | ') + ' (§5)' },
  { name: 'definition', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'applicability_by_context', required: true, check: function (v) {
      // mapa { <context>: REQUIRED|OPTIONAL|NOT_APPLICABLE }
      if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
      var ks = Object.keys(v);
      return ks.length > 0 && ks.every(function (k) { return esValorDe(ENUMS.APPLICABILITY, v[k]); });
    }, msg: '{ <contexto>: REQUIRED|OPTIONAL|NOT_APPLICABLE } no vacío' },
  { name: 'core_phenomenon_ids', required: true, check: esArrayDeStrings, msg: 'array de strings' },
  { name: 'supporting_phenomenon_ids', required: true, check: esArrayDeStrings, msg: 'array de strings' },
  { name: 'version', required: true, check: esStringNoVacio, msg: 'string no vacío' }
];
function validarDomainSpec(obj) { return validarObjeto(ESQUEMA_DOMAIN_SPEC, obj); }

// ═════════════════════════════════════════════════════════════════════
// §25.3 — REFERENCE_SPEC
// ═════════════════════════════════════════════════════════════════════
var ESQUEMA_REFERENCE_SPEC = [
  { name: 'reference_id', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'reference_role', required: true, check: enEnum('REFERENCE_ROLE'), msg: ENUMS.REFERENCE_ROLE.join(' | ') + ' (REF_COND vs REF_TEMP, §8)' },
  { name: 'reference_type', required: true, check: enEnum('REFERENCE_TYPE'), msg: ENUMS.REFERENCE_TYPE.join(' | ') },
  { name: 'source', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'valid_from', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'valid_to', required: false, check: esStringNoVacio, msg: 'string no vacío (opcional)' },
  { name: 'rule', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'comparability_assessment', required: true, check: esStringNoVacio, msg: 'string no vacío (§8.2)' },
  { name: 'traceability', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'version', required: true, check: esStringNoVacio, msg: 'string no vacío' }
];
function validarReferenceSpec(obj) { return validarObjeto(ESQUEMA_REFERENCE_SPEC, obj); }

// ═════════════════════════════════════════════════════════════════════
// §25.4 — NODE_SPEC
// ═════════════════════════════════════════════════════════════════════
var ESQUEMA_NODE_SPEC = [
  { name: 'node_id', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'parent_node_id', required: false, nullable: true, check: esStringNoVacio, msg: 'string no vacío o null (raíz)' },
  { name: 'node_type', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'active_from', required: true, check: esStringNoVacio, msg: 'string no vacío' },
  { name: 'active_to', required: false, check: esStringNoVacio, msg: 'string no vacío (opcional)' },
  { name: 'aggregation_membership', required: true, check: esStringNoVacio, msg: 'string no vacío (a qué NODE_SET pertenece, §22.1)' },
  { name: 'scope_rules', required: true, check: function (v) {
      return v !== null && typeof v === 'object' && !Array.isArray(v);
    }, msg: 'objeto (§22)' },
  { name: 'version', required: true, check: esStringNoVacio, msg: 'string no vacío' }
];
function validarNodeSpec(obj) { return validarObjeto(ESQUEMA_NODE_SPEC, obj); }

// ═════════════════════════════════════════════════════════════════════
// §29 — PIIO_INPUT / `case`.  EL DOCUMENTO NO LO DEFINE (ambigüedad A).
//
// DECISIÓN DE DISEÑO DE LUIS (patrón "decisión A" del FPV): un objeto
// único con los catálogos + la jerarquía de nodos + los specs +
// referencias + evidence groups + observaciones + ruleset, para UNA
// organización y uno o más períodos. Fase 0 valida la forma de alto nivel
// (arrays presentes, ruleset/organization); la validación cruzada de
// catálogos/jerarquía/versiones es Fase 1.
// ═════════════════════════════════════════════════════════════════════
function validarPIIOInput(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valido: false, faltantes: ['PIIO_INPUT (objeto)'], invalidos: [] };
  }
  var faltantes = [], invalidos = [];

  if (!esStringNoVacio(obj.organization_id)) faltantes.push('organization_id');
  if (!esStringNoVacio(obj.ruleset_version)) faltantes.push('ruleset_version');
  if (!Array.isArray(obj.periods) || obj.periods.length === 0 || !obj.periods.every(esStringNoVacio)) {
    faltantes.push('periods (array no vacío de strings)');
  }

  [
    ['domain_catalog', validarDomainSpec],
    ['phenomenon_catalog', validarPhenomenonSpec],
    ['metric_definitions', validarMetricDefinition],
    ['references', validarReferenceSpec],
    ['node_hierarchy', validarNodeSpec],
    ['kpi_specs', validarKpiSpec],
    ['evidence_groups', validarEvidenceGroup],
    ['observations', validarKpiObservation]
  ].forEach(function (par) {
    var clave = par[0], fn = par[1];
    var arr = obj[clave];
    if (!Array.isArray(arr)) { faltantes.push(clave + ' (array)'); return; }
    arr.forEach(function (el, i) {
      var v = fn(el);
      (v.faltantes || []).forEach(function (f) { invalidos.push(clave + '[' + i + ']: falta ' + f); });
      (v.invalidos || []).forEach(function (m) { invalidos.push(clave + '[' + i + ']: ' + m); });
    });
  });

  return { valido: faltantes.length === 0 && invalidos.length === 0, faltantes: faltantes, invalidos: invalidos };
}

// ═════════════════════════════════════════════════════════════════════
// Formas de SALIDA — validación LIGERA en Fase 0 (esqueleto + prohibición
// de score EFO 0–100). Forma interna completa → Fase 11 (patrón FPV).
//
// §35 / AC75 / INV-PIIO-75/76: NO existe un score EFO 0–100 ni promedio
// ponderado de dominios. Se rechaza cualquier clave que lo sugiera.
// ═════════════════════════════════════════════════════════════════════
var CLAVES_SCORE_PROHIBIDAS = ['efo_score', 'efo_total', 'efo_index', 'score', 'puntaje',
  'domain_weighted_average', 'promedio_dominios', 'efo_0_100', 'weighted_score'];

function _sinScore(obj, ruta, invalidos) {
  if (!obj || typeof obj !== 'object') return;
  CLAVES_SCORE_PROHIBIDAS.forEach(function (c) {
    if (c in obj) invalidos.push(ruta + '.' + c + ': §35 / INV-PIIO-75/76 — no existe score EFO 0–100 ni promedio ponderado de dominios');
  });
}

function validarEFOStateLigero(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valido: false, invalidos: ['EFO_STATE (objeto)'] };
  }
  var invalidos = [];
  ['efo_state_id', 'organization_id', 'node_id', 'scope', 'period', 'pos', 'admissibility', 'piio_run_id', 'ruleset_version'].forEach(function (k) {
    if (!(k in obj)) invalidos.push('EFO_STATE: falta `' + k + '` (§24)');
  });
  if ('pos' in obj && !esValorDe(ENUMS.POSITION, obj.pos)) invalidos.push('EFO_STATE.pos: ' + ENUMS.POSITION.join(' | '));
  _sinScore(obj, 'EFO_STATE', invalidos);
  return { valido: invalidos.length === 0, invalidos: invalidos };
}

module.exports = {
  clasificarAusencia: clasificarAusencia,
  validarObjeto: validarObjeto,
  validarMetricDefinition: validarMetricDefinition,
  validarKpiObservation: validarKpiObservation,
  validarKpiSpec: validarKpiSpec,
  validarEvidenceGroup: validarEvidenceGroup,
  validarPhenomenonSpec: validarPhenomenonSpec,
  validarDomainSpec: validarDomainSpec,
  validarReferenceSpec: validarReferenceSpec,
  validarNodeSpec: validarNodeSpec,
  validarPIIOInput: validarPIIOInput,
  validarEFOStateLigero: validarEFOStateLigero,
  CLAVES_SCORE_PROHIBIDAS: CLAVES_SCORE_PROHIBIDAS
};
