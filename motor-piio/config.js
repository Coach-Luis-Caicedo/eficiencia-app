/**
 * motor-piio/config.js — Fase 1
 *
 * Las 4 validaciones pre-vuelo de §29 (pasos 1–4):
 *   validate_case_configuration()
 *   validate_domain_and_phenomenon_catalog()
 *   validate_node_hierarchy()
 *   validate_metric_definitions_and_references()
 *
 * NO mutan estado. Producen un REPORTE con severidad (§30):
 *
 *   finding = {
 *     code,                         // slug estable
 *     severity: WARNING|DEGRADED|BLOCKING,
 *     scope: GLOBAL|STATE|KPI,
 *     target?,                      // kpi_id / node_id / phenomenon_id afectado
 *     message
 *   }
 *
 * §30: "Un error local de un KPI no debe invalidar evidencia
 * independiente. Un error estructural de catálogo, jerarquía de nodos o
 * ruleset puede bloquear la corrida."
 *
 *   BLOCKING + GLOBAL  → la corrida no puede proceder (AC70 catálogo
 *                         corrupto, AC71 jerarquía cíclica).
 *   BLOCKING + STATE   → bloquea el estado afectado, no la corrida
 *                         (AC73 metric_definition version ausente).
 *   DEGRADED + KPI     → el KPI queda no clasificable → Fase 5 lo fuerza
 *                         a pos=N_A (AC72 reference version ausente,
 *                         ambigüedad P).
 *
 * `ok` = no hay BLOCKING+GLOBAL. Los hallazgos STATE/KPI dejan seguir la
 * corrida y degradan ese elemento aguas abajo.
 *
 * ── Ambigüedad M (nodos "mutuamente excluyentes") ────────────────────
 *
 * §22 / §22.1 mencionan "mutuamente excluyentes" 3 veces y NUNCA lo
 * operacionalizan. Lo único operativo del texto: aciclicidad (AC71) y
 * "contención jerárquica" (INV-PIIO-48 — padre/ancestro no se agrega con
 * su descendiente). `NODE_SPEC.parent_node_id` es singular (Fase 0) → es
 * un BOSQUE, no un DAG.
 *
 * DECISIÓN DE DISEÑO: el motor VERIFICA que dentro de un
 * `aggregation_membership` declarado, ningún miembro sea ancestro de otro
 * (cadena `parent_node_id`). NO verifica —ni puede— solapamiento real
 * entre `NODE_SET` distintos, ni entre hermanos que representen
 * poblaciones que se traslapan: eso vive fuera de los datos (mismo patrón
 * que "diseño_muestral declarado por el llamante" del FPV — el motor
 * registra la declaración, audita solo lo que ve).
 *
 * ── Ambigüedad O (node_level / scope) ───────────────────────────────
 *
 * §22 dice "cada observación y estado conserva node_id, node_level y
 * scope". Realidad de los esquemas: `node_level` NO aparece como campo
 * explícito en NINGÚN esquema de todo el documento; `scope` SOLO aparece
 * en `EFO_STATE` (§24) — ni `KPI_OBSERVATION`, ni `NODE_SPEC`, ni
 * `PHENOMENON_STATE`, ni `DOMAIN_STATE`. La prosa promete algo que ningún
 * esquema cumple completo.
 *
 * DECISIÓN: `node_level` = profundidad desde la raíz (derivada aquí de la
 * cadena de padres). `scope` = `NODE_SPEC.scope_rules.scope ∈ SCOPE`
 * (`ORGANIZATIONAL | SEGMENT_ONLY`). **`EFO_STATE.scope` YA tiene forma
 * fijada por §24** — la derivación de aquí debe ser consistente con eso,
 * y Fase 9 NO reabre esta decisión.
 */

'use strict';

var mod = require('./enums');
var contratos = require('./contratos');
var ENUMS = mod.ENUMS;

function esStringNoVacio(v) { return typeof v === 'string' && v.trim().length > 0; }

function finding(code, severity, scope, message, target) {
  var f = { code: code, severity: severity, scope: scope, message: message };
  if (target !== undefined) f.target = target;
  return f;
}

function indexarPorClave(arr, clave) {
  var m = {};
  (arr || []).forEach(function (el) { if (el && esStringNoVacio(el[clave])) m[el[clave]] = el; });
  return m;
}

// ─────────────────────────────────────────────────────────────────────
// §29 paso 1 — validate_case_configuration
// ─────────────────────────────────────────────────────────────────────
function validarConfiguracionCaso(input, F) {
  var org = input.organization_id;
  (input.observations || []).forEach(function (o, i) {
    if (o && esStringNoVacio(o.organization_id) && o.organization_id !== org) {
      F.push(finding('OBS_OTRA_ORGANIZACION', 'BLOCKING', 'GLOBAL',
        'observations[' + i + ']: organization_id "' + o.organization_id + '" ≠ "' + org + '" del caso'));
    }
  });
}

// ─────────────────────────────────────────────────────────────────────
// §29 paso 2 — validate_domain_and_phenomenon_catalog (AC70, INV-PIIO-31)
// ─────────────────────────────────────────────────────────────────────
function validarCatalogos(input, F) {
  var dominios = indexarPorClave(input.domain_catalog, 'domain_id');
  var fenomenos = indexarPorClave(input.phenomenon_catalog, 'phenomenon_id');

  // fenómeno → dominio canónico existe
  (input.phenomenon_catalog || []).forEach(function (ph) {
    if (!ph) return;
    if (!dominios[ph.canonical_domain_id]) {
      F.push(finding('FENOMENO_DOMINIO_COLGANTE', 'BLOCKING', 'GLOBAL',
        'phenomenon "' + ph.phenomenon_id + '": canonical_domain_id "' + ph.canonical_domain_id + '" no está en el catálogo de dominios', ph.phenomenon_id));
    }
  });

  // dominio → fenómenos core/supporting existen  +  INV-31  +  consistencia N
  (input.domain_catalog || []).forEach(function (d) {
    if (!d) return;
    var core = Array.isArray(d.core_phenomenon_ids) ? d.core_phenomenon_ids : [];
    var supp = Array.isArray(d.supporting_phenomenon_ids) ? d.supporting_phenomenon_ids : [];

    core.concat(supp).forEach(function (pid) {
      if (!fenomenos[pid]) {
        F.push(finding('DOMINIO_FENOMENO_COLGANTE', 'BLOCKING', 'GLOBAL',
          'domain "' + d.domain_id + '": phenomenon_id "' + pid + '" no está en el catálogo de fenómenos', d.domain_id));
      }
    });

    // INV-PIIO-31 — dominio APLICABLE (algún contexto REQUIRED u OPTIONAL) tiene ≥1 CORE
    var aplicable = d.applicability_by_context && typeof d.applicability_by_context === 'object' &&
      Object.keys(d.applicability_by_context).some(function (k) {
        return d.applicability_by_context[k] === 'REQUIRED' || d.applicability_by_context[k] === 'OPTIONAL';
      });
    if (aplicable && core.length === 0) {
      F.push(finding('DOMINIO_APLICABLE_SIN_CORE', 'BLOCKING', 'GLOBAL',
        'domain "' + d.domain_id + '": aplicable (REQUIRED/OPTIONAL en algún contexto) pero sin ningún CORE (INV-PIIO-31)', d.domain_id));
    }

    // consistencia N — domain.core lista P ⟺ P.core_or_supporting_by_domain[domain]='CORE'
    core.forEach(function (pid) {
      var ph = fenomenos[pid];
      if (ph && (!ph.core_or_supporting_by_domain || ph.core_or_supporting_by_domain[d.domain_id] !== 'CORE')) {
        F.push(finding('CATALOGO_INCONSISTENTE_CORE', 'BLOCKING', 'GLOBAL',
          'domain "' + d.domain_id + '" lista a "' + pid + '" como CORE, pero el fenómeno no declara CORE para ese dominio (ambigüedad N: deben concordar)', d.domain_id));
      }
    });
    supp.forEach(function (pid) {
      var ph = fenomenos[pid];
      if (ph && (!ph.core_or_supporting_by_domain || ph.core_or_supporting_by_domain[d.domain_id] !== 'SUPPORTING')) {
        F.push(finding('CATALOGO_INCONSISTENTE_SUPPORTING', 'BLOCKING', 'GLOBAL',
          'domain "' + d.domain_id + '" lista a "' + pid + '" como SUPPORTING, pero el fenómeno no declara SUPPORTING para ese dominio (ambigüedad N)', d.domain_id));
      }
    });
  });

  // el sentido inverso: P declara un rol para D ⟹ D debe listarlo en esa categoría
  (input.phenomenon_catalog || []).forEach(function (ph) {
    if (!ph || !ph.core_or_supporting_by_domain || typeof ph.core_or_supporting_by_domain !== 'object') return;
    Object.keys(ph.core_or_supporting_by_domain).forEach(function (did) {
      var rol = ph.core_or_supporting_by_domain[did];
      var d = dominios[did];
      if (!d) return; // ya reportado como colgante si es canonical_domain_id
      var lista = rol === 'CORE' ? d.core_phenomenon_ids : d.supporting_phenomenon_ids;
      if (!Array.isArray(lista) || lista.indexOf(ph.phenomenon_id) === -1) {
        F.push(finding('CATALOGO_INCONSISTENTE_INVERSO', 'BLOCKING', 'GLOBAL',
          'phenomenon "' + ph.phenomenon_id + '" declara ' + rol + ' para domain "' + did + '", pero el dominio no lo lista en esa categoría (ambigüedad N)', ph.phenomenon_id));
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────
// §29 paso 3 — validate_node_hierarchy (AC71, AC49, INV-PIIO-48; ambig. M)
// ─────────────────────────────────────────────────────────────────────
function _cadenaAncestros(nodeId, nodosById) {
  // devuelve [padre, abuelo, …] hasta la raíz, o null si hay ciclo / padre colgante
  var vistos = {};
  var cur = nodosById[nodeId];
  var cadena = [];
  var guarda = 0;
  while (cur && cur.parent_node_id !== undefined && cur.parent_node_id !== null) {
    if (vistos[cur.node_id]) return null;         // ciclo
    vistos[cur.node_id] = true;
    var padre = nodosById[cur.parent_node_id];
    if (!padre) return { colgante: cur.parent_node_id };  // padre no existe
    cadena.push(padre.node_id);
    cur = padre;
    if (++guarda > 10000) return null;
  }
  return cadena;
}

function validarJerarquiaNodos(input, F) {
  var nodos = Array.isArray(input.node_hierarchy) ? input.node_hierarchy : [];
  var nodosById = indexarPorClave(nodos, 'node_id');

  nodos.forEach(function (n) {
    if (!n) return;

    // padre colgante
    if (n.parent_node_id !== undefined && n.parent_node_id !== null && !nodosById[n.parent_node_id]) {
      F.push(finding('NODO_PADRE_COLGANTE', 'BLOCKING', 'GLOBAL',
        'node "' + n.node_id + '": parent_node_id "' + n.parent_node_id + '" no existe en la jerarquía', n.node_id));
    }

    // ciclo
    var cad = _cadenaAncestros(n.node_id, nodosById);
    if (cad === null) {
      F.push(finding('JERARQUIA_CICLICA', 'BLOCKING', 'GLOBAL',
        'node "' + n.node_id + '": la cadena de parent_node_id forma un ciclo (AC71)', n.node_id));
    }

    // fechas
    if (esStringNoVacio(n.active_from) && esStringNoVacio(n.active_to) && !(String(n.active_from) < String(n.active_to))) {
      F.push(finding('NODO_FECHAS_INVALIDAS', 'DEGRADED', 'STATE',
        'node "' + n.node_id + '": active_from "' + n.active_from + '" no es anterior a active_to "' + n.active_to + '"', n.node_id));
    }
  });

  // ambigüedad M — dentro de cada aggregation_membership, ningún miembro es
  // ancestro de otro (INV-PIIO-48: contención jerárquica).
  var porSet = {};
  nodos.forEach(function (n) {
    if (n && esStringNoVacio(n.aggregation_membership)) {
      (porSet[n.aggregation_membership] = porSet[n.aggregation_membership] || []).push(n.node_id);
    }
  });
  Object.keys(porSet).forEach(function (setId) {
    var miembros = porSet[setId];
    miembros.forEach(function (a) {
      var cadA = _cadenaAncestros(a, nodosById);
      if (!Array.isArray(cadA)) return; // ciclo/colgante ya reportado
      miembros.forEach(function (b) {
        if (a === b) return;
        if (cadA.indexOf(b) !== -1) {
          F.push(finding('NODE_SET_CONTENCION', 'BLOCKING', 'GLOBAL',
            'NODE_SET "' + setId + '": node "' + b + '" es ancestro de "' + a + '" — no son mutuamente excluyentes para agregación (INV-PIIO-48 / ambigüedad M)', setId));
        }
      });
    });
  });
}

// ─────────────────────────────────────────────────────────────────────
// §29 paso 4 — validate_metric_definitions_and_references (AC72, AC73)
// ─────────────────────────────────────────────────────────────────────
function _resolverMetricDefinition(mds, id, version) {
  return (mds || []).filter(function (m) {
    return m && m.metric_definition_id === id && m.definition_version === version;
  })[0] || null;
}
function _hayReferenciaConRol(refs, id, rol) {
  return (refs || []).some(function (r) { return r && r.reference_id === id && r.reference_role === rol; });
}

function validarMetricasYReferencias(input, F) {
  var mds = input.metric_definitions || [];
  var refs = input.references || [];
  var fenomenos = indexarPorClave(input.phenomenon_catalog, 'phenomenon_id');
  var kpisById = indexarPorClave(input.kpi_specs, 'kpi_id');

  // METRIC_DEFINITION.phenomenon_id existe
  mds.forEach(function (m) {
    if (m && !fenomenos[m.phenomenon_id]) {
      F.push(finding('MD_FENOMENO_COLGANTE', 'BLOCKING', 'GLOBAL',
        'metric_definition "' + m.metric_definition_id + '": phenomenon_id "' + m.phenomenon_id + '" no está en el catálogo', m.metric_definition_id));
    }
  });

  // KPI_SPEC — resolución de métrica (Q) + referencias por rol
  (input.kpi_specs || []).forEach(function (ks) {
    if (!ks) return;

    // Q — metric_definition_id + definition_version resuelve
    if (!_resolverMetricDefinition(mds, ks.metric_definition_id, ks.definition_version)) {
      F.push(finding('MD_VERSION_NO_RESUELVE', 'BLOCKING', 'STATE',
        'kpi "' + ks.kpi_id + '": no hay METRIC_DEFINITION con id "' + ks.metric_definition_id + '" y definition_version "' + ks.definition_version + '" (AC73 / ambigüedad Q)', ks.kpi_id));
    }

    // P — REF_COND con rol CONDITION, REF_TEMP con rol TEMPORAL
    if (!_hayReferenciaConRol(refs, ks.condition_reference_id, 'CONDITION')) {
      F.push(finding('REF_COND_NO_RESUELVE', 'DEGRADED', 'KPI',
        'kpi "' + ks.kpi_id + '": condition_reference_id "' + ks.condition_reference_id + '" no resuelve a un REFERENCE_SPEC con reference_role=CONDITION (AC72 / ambigüedad P) → pos=N_A en Fase 5', ks.kpi_id));
    }
    if (!_hayReferenciaConRol(refs, ks.temporal_reference_id, 'TEMPORAL')) {
      F.push(finding('REF_TEMP_NO_RESUELVE', 'DEGRADED', 'KPI',
        'kpi "' + ks.kpi_id + '": temporal_reference_id "' + ks.temporal_reference_id + '" no resuelve a un REFERENCE_SPEC con reference_role=TEMPORAL → traj=N_A en Fase 5', ks.kpi_id));
    }
  });

  // observaciones — kpi_id / metric_definition_id resuelven; md coincide con la del spec
  (input.observations || []).forEach(function (o, i) {
    if (!o) return;
    var ks = kpisById[o.kpi_id];
    if (!ks) {
      F.push(finding('OBS_KPI_COLGANTE', 'DEGRADED', 'KPI',
        'observations[' + i + ']: kpi_id "' + o.kpi_id + '" no tiene KPI_SPEC — la observación se ignora (§30: error local no invalida evidencia independiente)', o.kpi_id));
      return;
    }
    if (o.metric_definition_id !== ks.metric_definition_id) {
      F.push(finding('OBS_MD_DISTINTA_DEL_SPEC', 'DEGRADED', 'KPI',
        'observations[' + i + ']: metric_definition_id "' + o.metric_definition_id + '" ≠ la del KPI_SPEC ("' + ks.metric_definition_id + '")', o.kpi_id));
    }
  });
}

// ─────────────────────────────────────────────────────────────────────
// Orquestación de las 4 — §29 pasos 1–4
// ─────────────────────────────────────────────────────────────────────
/**
 * validarConfiguracion(input) → {
 *   ok: boolean,                 // no hay BLOCKING+GLOBAL — la corrida puede proceder
 *   findings: finding[],
 *   kpis_degradados: string[],   // kpi_id con hallazgo DEGRADED de alcance KPI
 *   estados_bloqueados: string[] // target con hallazgo BLOCKING de alcance STATE
 * }
 *
 * Corre primero la validación de forma de Fase 0 (`validarPIIOInput`); si
 * la forma es inválida, devuelve un único BLOCKING+GLOBAL — Fase 1 no
 * inspecciona una estructura mal formada.
 */
function validarConfiguracion(input) {
  var forma = contratos.validarPIIOInput(input);
  if (!forma.valido) {
    var msg = forma.faltantes.map(function (f) { return 'falta ' + f; }).concat(forma.invalidos).join(' · ');
    return {
      ok: false,
      findings: [finding('FORMA_INVALIDA', 'BLOCKING', 'GLOBAL', 'PIIO_INPUT no pasa la validación de forma de Fase 0: ' + msg)],
      kpis_degradados: [], estados_bloqueados: []
    };
  }

  var F = [];
  validarConfiguracionCaso(input, F);
  validarCatalogos(input, F);
  validarJerarquiaNodos(input, F);
  validarMetricasYReferencias(input, F);

  var ok = !F.some(function (f) { return f.severity === 'BLOCKING' && f.scope === 'GLOBAL'; });
  var kpis_degradados = [];
  var estados_bloqueados = [];
  F.forEach(function (f) {
    if (f.severity === 'DEGRADED' && f.scope === 'KPI' && f.target && kpis_degradados.indexOf(f.target) === -1) kpis_degradados.push(f.target);
    if (f.severity === 'BLOCKING' && f.scope === 'STATE' && f.target && estados_bloqueados.indexOf(f.target) === -1) estados_bloqueados.push(f.target);
  });

  return { ok: ok, findings: F, kpis_degradados: kpis_degradados, estados_bloqueados: estados_bloqueados };
}

module.exports = {
  validarConfiguracion: validarConfiguracion,
  validarConfiguracionCaso: validarConfiguracionCaso,
  validarCatalogos: validarCatalogos,
  validarJerarquiaNodos: validarJerarquiaNodos,
  validarMetricasYReferencias: validarMetricasYReferencias
};
