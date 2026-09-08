/**
 * motor-piio/evidenceGroup.js — Fase 6
 *
 * Control de independencia: colapso de KPI dependientes (§14). Primera
 * fase que combina MÁS DE UN KPI_STATE. §15 ordena: "primero se filtra
 * evidencia utilizable; después se colapsan grupos dependientes".
 *
 * ── §14 — tabla de configuración interna ────────────────────────────
 *
 *   F + F → F      D + D → D      F + I → F
 *   D + I → D      I + I → I      F + D → N_A + INTERNAL_INCONSISTENCY
 *
 * "F+D dentro de la misma unidad de evidencia es inconsistencia técnica,
 *  no divergencia diagnóstica. La resolución debe preservar los KPI
 *  originales y emitir flag." (§14, literal — INV-PIIO-16)
 *
 * ── Ambigüedad AN — la tabla es de PARES; ¿qué con ≥3 KPIs? ─────────
 *
 * §14 NO da regla N-aria. La reducción pairwise-asociativa NO está bien
 * definida: para {F, D, I}, el orden (F+D)→N_A+IC deja "N_A + I", que la
 * tabla NO cubre. NO reintentar pairwise asumiendo que "debería funcionar".
 *
 * REGLA DE CONJUNTO (consistente con las 6 celdas, order-independent):
 *   S = { posiciones distintas entre miembros UTILIZABLES } (pos ∈ {F,I,D})
 *   F ∈ S ∧ D ∈ S  → N_A + INTERNAL_INCONSISTENCY   (F+D domina)
 *   D ∈ S          → D
 *   F ∈ S          → F
 *   solo I         → I
 *   S vacío        → N_A  (sin evidencia — AO, NO es INTERNAL_INCONSISTENCY)
 *
 * ── OJO: INV-17 NO es de aquí ───────────────────────────────────────
 *
 * INV-PIIO-17 ("F+D DIRECT comparable EN FENÓMENO produce I, no mayoría")
 * es de §15 (nivel FENÓMENO, Fase 7). A nivel EVIDENCE_GROUP el F+D da
 * N_A+INTERNAL_INCONSISTENCY (§14 / AC22). Ambas involucran "F+D" pero son
 * reglas distintas de niveles distintos.
 *
 * ── Alcance (AR) ────────────────────────────────────────────────────
 *
 * Fase 6 colapsa `pos` ÚNICAMENTE — la tabla de §14 es puramente `pos`,
 * sin mención de `traj`/`pers`. Esos re-emergen a nivel fenómeno (§15.1) →
 * Fase 7. Los KPI_STATE originales (con su traj/pers) se preservan en
 * `member_states`.
 *
 * ── evidence_proximity (AP) ─────────────────────────────────────────
 *
 * Fase 6 DERIVA `evidence_proximity` de los KPI_SPEC de los miembros:
 * todos iguales → ese valor; mixto → 'MIXED' + flag. NO decide qué
 * significa MIXED — §15 trata DIRECT y PROXY como ramas separadas del
 * pipeline; esa resolución es de Fase 7.
 */

'use strict';

function esStringNoVacio(v) { return typeof v === 'string' && v.trim().length > 0; }

/**
 * filtrarUtilizables(kpiStates) — descarta lo que no aporta posición:
 * admissibility === 'NOT_ADMISSIBLE' (INV-PIIO-01) o pos === 'N_A'.
 */
function filtrarUtilizables(kpiStates) {
  return (Array.isArray(kpiStates) ? kpiStates : []).filter(function (s) {
    return s && s.admissibility !== 'NOT_ADMISSIBLE' && (s.pos === 'F' || s.pos === 'I' || s.pos === 'D');
  });
}

/**
 * _colapsarConjunto(posiciones) → { pos, inconsistente }
 * La regla de conjunto de §14 / AN (order-independent).
 */
function _colapsarConjunto(posiciones) {
  var S = {};
  (posiciones || []).forEach(function (p) { S[p] = true; });
  if (S.F && S.D) return { pos: 'N_A', inconsistente: true };  // §14 / INV-16 — F+D domina
  if (S.D) return { pos: 'D', inconsistente: false };
  if (S.F) return { pos: 'F', inconsistente: false };
  if (S.I) return { pos: 'I', inconsistente: false };
  return { pos: 'N_A', inconsistente: false };                 // S vacío — sin evidencia (AO)
}

/**
 * colapsarGrupo(kpiStatesDelGrupo, egSpec, proximidadPorKpi?) → {
 *   evidence_group_id, phenomenon_id, node_id, period,
 *   pos,                          // §14 — SOLO pos (AR)
 *   evidence_proximity,           // 'DIRECT' | 'PROXY' | 'MIXED' | null (AP)
 *   member_kpi_ids,
 *   member_states,                // los KPI_STATE originales, preservados (§14)
 *   resolution_rule_version, status,
 *   flags: string[]
 * }
 *
 * `proximidadPorKpi` = { <kpi_id>: 'DIRECT' | 'PROXY' } (de los KPI_SPEC).
 */
function colapsarGrupo(kpiStatesDelGrupo, egSpec, proximidadPorKpi) {
  var spec = egSpec || {};
  var pmap = proximidadPorKpi || {};
  var todos = Array.isArray(kpiStatesDelGrupo) ? kpiStatesDelGrupo.slice() : [];
  var utilizables = filtrarUtilizables(todos);
  var flags = [];

  var colapso = _colapsarConjunto(utilizables.map(function (s) { return s.pos; }));
  if (colapso.inconsistente) flags.push('INTERNAL_INCONSISTENCY');            // §14 / AC22
  if (esStringNoVacio(spec.status) && spec.status !== 'ACTIVE') {
    flags.push('EVIDENCE_GROUP_NO_ACTIVO:' + spec.status);                    // AQ — no se descarta en silencio (§30)
  }

  // evidence_proximity derivada de los miembros utilizables (AP)
  var prox = {};
  utilizables.forEach(function (s) { var p = pmap[s.kpi_id]; if (p) prox[p] = true; });
  var pk = Object.keys(prox);
  var evidence_proximity = pk.length === 0 ? null : (pk.length === 1 ? pk[0] : 'MIXED');
  if (evidence_proximity === 'MIXED') flags.push('PROXIMIDAD_MIXTA');

  var primero = todos[0] || {};
  return {
    evidence_group_id: spec.evidence_group_id || null,
    phenomenon_id: spec.phenomenon_id || null,
    node_id: primero.node_id || null,
    period: primero.period || null,
    pos: colapso.pos,
    evidence_proximity: evidence_proximity,
    member_kpi_ids: Array.isArray(spec.member_kpi_ids) ? spec.member_kpi_ids.slice() : todos.map(function (s) { return s.kpi_id; }),
    member_states: todos,                        // §14 — preservar los KPI originales
    resolution_rule_version: spec.resolution_rule_version || null,
    status: spec.status || null,
    flags: flags
  };
}

/**
 * agruparPorEvidenceGroup(kpiStates, egSpecs, kpiSpecs) → {
 *   grupos: <salida de colapsarGrupo>[],   // uno por (evidence_group_id, node_id, period)
 *   flags: string[]                        // inconsistencias de configuración
 * }
 *
 * Chequea la consistencia bidireccional kpi_spec.evidence_group_id ⟺
 * eg.member_kpi_ids (Fase 1 no lo cubre).
 */
function agruparPorEvidenceGroup(kpiStates, egSpecs, kpiSpecs) {
  var egById = {};
  (egSpecs || []).forEach(function (e) { if (e && esStringNoVacio(e.evidence_group_id)) egById[e.evidence_group_id] = e; });
  var ksById = {};
  (kpiSpecs || []).forEach(function (k) { if (k && esStringNoVacio(k.kpi_id)) ksById[k.kpi_id] = k; });

  var proximidadPorKpi = {};
  Object.keys(ksById).forEach(function (kid) {
    if (esStringNoVacio(ksById[kid].evidence_proximity)) proximidadPorKpi[kid] = ksById[kid].evidence_proximity;
  });

  var flags = [];
  (kpiSpecs || []).forEach(function (k) {
    if (!k || !esStringNoVacio(k.evidence_group_id)) return;
    var eg = egById[k.evidence_group_id];
    if (!eg) { flags.push('KPI_APUNTA_A_GRUPO_INEXISTENTE:' + k.kpi_id + '->' + k.evidence_group_id); return; }
    if (!Array.isArray(eg.member_kpi_ids) || eg.member_kpi_ids.indexOf(k.kpi_id) === -1) {
      flags.push('EVIDENCE_GROUP_INCONSISTENTE:' + k.kpi_id + ' no está en member_kpi_ids de ' + eg.evidence_group_id);
    }
  });

  var grupos = {};
  (kpiStates || []).forEach(function (s) {
    if (!s) return;
    var ks = ksById[s.kpi_id];
    var egid = ks && ks.evidence_group_id;
    if (!esStringNoVacio(egid)) return;
    var key = egid + '|' + s.node_id + '|' + s.period;
    (grupos[key] = grupos[key] || { egid: egid, states: [] }).states.push(s);
  });

  var resultados = Object.keys(grupos).map(function (key) {
    var g = grupos[key];
    return colapsarGrupo(g.states, egById[g.egid], proximidadPorKpi);
  });

  return { grupos: resultados, flags: flags };
}

module.exports = {
  filtrarUtilizables: filtrarUtilizables,
  colapsarGrupo: colapsarGrupo,
  agruparPorEvidenceGroup: agruparPorEvidenceGroup
};
