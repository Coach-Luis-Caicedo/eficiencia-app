/**
 * motor-piio/domain.js — Fase 8
 *
 * Motor PHENOMENON → DOMAIN (§18–19). Consume los PHENOMENON_STATE de
 * Fase 7 y los agrupa por dominio canónico según CORE / SUPPORTING.
 *
 * ── §18 — tabla CORE/SUPPORTING (COMPLETA: 8 filas = ∅ + los 7
 *    subconjuntos no vacíos de {F,I,D}, como §15, NO pares como §14) ──
 *
 *   CORE utilizable | SUPPORTING D | DOMAIN_pos
 *   ─────────────────────────────────────────────
 *   ninguno         | cualquiera   | N_A          (INV-19 / AC32)
 *   solo F          | no           | F
 *   solo F          | sí           | I            (AC33 / INV-21)
 *   F + I           | no           | F
 *   F + I           | sí           | I
 *   solo I          | cualquiera   | I
 *   D sin F         | cualquiera   | D            (AC34 / INV-20)
 *   F + D           | cualquiera   | I            (AC35)
 *
 *   Regla de conjunto (S = pos de CORE utilizables):
 *     S = ∅            → N_A
 *     F ∈ S ∧ D ∈ S    → I
 *     D ∈ S            → D          (sin mirar SUPPORTING — INV-20)
 *     F ∈ S            → I si algún SUPPORTING utilizable es D (INV-21),
 *                        si no F
 *     solo I           → I
 *
 * ── §18 (línea 1073) — SUPPORTING vs CORE ──────────────────────────
 *
 * "SUPPORTING no sustituye CORE ausente" (INV-19: S=∅ → N_A, no D).
 * "CORE D no se neutraliza con SUPPORTING F" (INV-20: la rama D no mira
 *  SUPPORTING). "SUPPORTING D impide presentar como plenamente favorable
 *  un dominio cuyo núcleo permanece F" (INV-21: F + SUPP D → I).
 * SUPPORTING SOLO puede mover hacia la indeterminación (F→I); nunca
 * resuelve (N_A→X) ni mejora (D→F, I→F). CORE/SUPPORTING no son pesos
 * (INV-18): un fenómeno cuenta como utilizable o no, sin ponderación.
 *
 * ── §19 — admisibilidad del dominio (misma asimetría F/D que §16) ───
 *
 *   F   → CORE requeridos y F; SIN SUPPORTING D; cobertura suficiente.
 *   D   → ≥1 CORE D suficiente y válido; sin CORE F contradictorio.
 *   I   → evidencia válida sustenta (AC36 — I puede ser altamente admisible).
 *   N_A → no existe base suficiente.
 *
 * ── Ambigüedad AV — clave `context` de `applicability_by_context` ────
 *
 * `DOMAIN_SPEC.applicability_by_context` = { <context>: APPLICABILITY }
 * (§25.2), pero NINGÚN esquema formaliza un campo `context`. Decisión
 * (patrón "declarado por el llamante", como M): el orquestador recibe
 * `contexto` (string); se busca en el mapa, con fallback a la clave
 * 'DEFAULT'; ausente → `NOT_APPLICABLE` + flag `CONTEXTO_NO_RESUELTO`.
 * Fase 10/11 lo cablea desde atributos de nodo/organización.
 *
 * ── DECISIÓN (igual que 7c, no dictada por §11) ────────────────────
 *
 * `pos ∈ {I, N_A}` → `traj = pers = N_A`. §11 scopea PERSISTENCE a
 * "posición D" pero no dice "si pos=I entonces traj=N_A"; es decisión
 * apoyada en "I = evidencia indeterminada". `pos = F` → `pers = N_A` (§11).
 *
 * `DOMAIN_STATE` (§18.1, 17 campos) NO lleva
 * `temporal_pattern`/`series_stability`/`regime_status` (a diferencia de
 * `PHENOMENON_STATE`): a nivel dominio solo se propaga traj/pers/det_run.
 */

'use strict';

function _tieneFlag(o, f) { return (o && o.flags || []).some(function (x) { return x === f || x.indexOf(f + ':') === 0; }); }
function _esUtilizable(s) { return !!s && (s.pos === 'F' || s.pos === 'D' || s.pos === 'I') && s.admissibility !== 'NOT_ADMISSIBLE'; }

var _RANGO_TRAJ = { DETERIORATING: 3, STABLE: 2, IMPROVING: 1, N_A: 0 };
var _RANGO_PERS = { PERSISTENT: 3, REPEATED: 2, POINT: 1, N_A: 0 };
var _APPLICABILITY = ['REQUIRED', 'OPTIONAL', 'NOT_APPLICABLE'];

/**
 * _colapsarDominio(coreUtilizables, supportingUtilizables) → { pos, flags }
 * Regla de conjunto de §18 (8 filas). Order-independent.
 */
function _colapsarDominio(coreUtilizables, supportingUtilizables) {
  var flags = [];
  var S = {};
  (coreUtilizables || []).forEach(function (s) {
    if (s && (s.pos === 'F' || s.pos === 'D' || s.pos === 'I')) S[s.pos] = true;
  });

  if (!S.F && !S.D && !S.I) return { pos: 'N_A', flags: ['SIN_CORE_UTILIZABLE'] }; // INV-19 / AC32
  if (S.F && S.D) return { pos: 'I', flags: ['CORE_F_D_DIVERGENCIA'] };            // AC35
  if (S.D) return { pos: 'D', flags: flags };                                       // AC34 — sin mirar SUPPORTING (INV-20)
  if (S.F) {
    var suppD = (supportingUtilizables || []).some(function (s) { return s && s.pos === 'D'; });
    if (suppD) return { pos: 'I', flags: ['SUPPORTING_D_IMPIDE_F_PLENA'] };         // AC33 / INV-21
    return { pos: 'F', flags: flags };
  }
  return { pos: 'I', flags: flags };                                                // solo I
}

/**
 * resolverAplicabilidad(domainSpec, contexto) → { applicability, flags }
 * Ambig. AV.
 */
function resolverAplicabilidad(domainSpec, contexto) {
  var mapa = (domainSpec || {}).applicability_by_context || {};
  var apl = null;
  if (contexto != null && Object.prototype.hasOwnProperty.call(mapa, contexto)) apl = mapa[contexto];
  else if (Object.prototype.hasOwnProperty.call(mapa, 'DEFAULT')) apl = mapa.DEFAULT;

  if (apl == null) {
    return { applicability: 'NOT_APPLICABLE', flags: ['CONTEXTO_NO_RESUELTO:' + String(contexto)] };
  }
  if (_APPLICABILITY.indexOf(apl) === -1) {
    return { applicability: 'NOT_APPLICABLE', flags: ['APPLICABILITY_INVALIDA:' + String(apl)] };
  }
  return { applicability: apl, flags: [] };
}

/**
 * coberturaDominio(domainSpec, phenStates, phenSpecsPorId) → {
 *   coverage_status: COMPLETE | PARTIAL | NONE,
 *   core_cubiertos[], core_faltantes[], flags
 * }
 * "Cubre" = PHENOMENON_STATE presente, `pos ∈ {F,D,I}`, `admissibility ≠
 * NOT_ADMISSIBLE`.
 */
function coberturaDominio(domainSpec, phenStates, phenSpecsPorId) {
  var coreIds = ((domainSpec || {}).core_phenomenon_ids || []).slice();
  var byId = {};
  (phenStates || []).forEach(function (s) { if (s && s.phenomenon_id) byId[s.phenomenon_id] = s; });
  function cubre(id) { return _esUtilizable(byId[id]); }

  var cub = coreIds.filter(cubre);
  var falt = coreIds.filter(function (id) { return !cubre(id); });
  var flags = [];
  var coverage_status;
  if (coreIds.length === 0) {
    flags.push('DOMINIO_SIN_CORE'); // INV-31 — debió pillarlo Fase 1
    coverage_status = 'NONE';
  } else if (cub.length === coreIds.length) {
    coverage_status = 'COMPLETE';
  } else if (cub.length > 0) {
    coverage_status = 'PARTIAL';
  } else {
    coverage_status = 'NONE';
  }
  return { coverage_status: coverage_status, core_cubiertos: cub, core_faltantes: falt, flags: flags };
}

/**
 * admisibilidadDominio({ pos, coverage_status, coreUtilizables,
 *   supportingUtilizables }) → { admissibility, flags }   (§19)
 */
function admisibilidadDominio(args) {
  var a = args || {};
  var pos = a.pos, cov = a.coverage_status;
  var coreUtil = a.coreUtilizables || [];
  var suppUtil = a.supportingUtilizables || [];

  if (pos === 'N_A' || pos == null) return { admissibility: 'NOT_ADMISSIBLE', flags: ['SIN_POSICION'] };
  if (pos === 'I') return { admissibility: 'ADMISSIBLE', flags: [] }; // AC36 — "I puede ser altamente admisible"

  if (pos === 'D') {
    var hayCoreDValido = coreUtil.some(function (s) {
      return s && s.pos === 'D' && typeof s.admissibility === 'string' && s.admissibility.indexOf('ADMISSIBLE') === 0;
    });
    if (!hayCoreDValido) return { admissibility: 'NOT_ADMISSIBLE', flags: ['SIN_CORE_D_VALIDO'] };
    // §19: D NO exige cobertura suficiente — solo ≥1 CORE D válido.
    return cov === 'COMPLETE'
      ? { admissibility: 'ADMISSIBLE', flags: [] }
      : { admissibility: 'ADMISSIBLE_WITH_LIMITATIONS', flags: ['COBERTURA_CORE_PARCIAL_D'] };
  }

  // pos === 'F'. §19 exige además "sin SUPPORTING D" — pero _colapsarDominio
  // ya garantiza que F + SUPPORTING D → I, así que si pos==='F' no hay
  // SUPPORTING D utilizable. No se re-chequea (sería rama muerta).
  if (cov !== 'COMPLETE') return { admissibility: 'NOT_ADMISSIBLE', flags: ['COBERTURA_CORE_INCOMPLETA_F'] };
  return { admissibility: 'ADMISSIBLE', flags: [] };
}

/**
 * _phenStateGobernante(phenStatesAlineados) → un PHENOMENON_STATE (o null)
 * Regla J extendida a dominio: el peor por orden total.
 */
function _phenStateGobernante(phenStatesAlineados) {
  var e = (phenStatesAlineados || []).slice();
  if (e.length === 0) return null;
  e.sort(function (a, b) {
    var t = (_RANGO_TRAJ[b.traj] || 0) - (_RANGO_TRAJ[a.traj] || 0); if (t) return t;
    var p = (_RANGO_PERS[b.pers] || 0) - (_RANGO_PERS[a.pers] || 0); if (p) return p;
    var d = (b.det_run || 0) - (a.det_run || 0); if (d) return d;
    return String(a.phenomenon_id || '').localeCompare(String(b.phenomenon_id || ''));
  });
  return e[0];
}

/**
 * propagarTemporalidadDominio(pos, phenStateGob) → {
 *   traj, pers, det_run, det_duration, freshness, flags
 * }
 */
function propagarTemporalidadDominio(pos, phenStateGob) {
  var flags = [];
  var s = phenStateGob || {};
  var traj, pers, det_run, det_duration;

  if (pos === 'F' || pos === 'D') {
    traj = s.traj || 'N_A';
    if (pos === 'D') {
      pers = s.pers || 'N_A';
      det_run = s.det_run != null ? s.det_run : 0;
      det_duration = s.det_duration != null ? s.det_duration : null;
    } else {
      pers = 'N_A'; det_run = 0; det_duration = null; // §11 — PERSISTENCE es sobre D
    }
    if (!phenStateGob) flags.push('SIN_PHENOMENON_STATE_GOBERNANTE');
  } else {
    // DECISIÓN: pos ∈ {I, N_A} → sin trayectoria/persistencia significativa.
    traj = 'N_A'; pers = 'N_A'; det_run = 0; det_duration = null;
  }

  return {
    traj: traj, pers: pers, det_run: det_run, det_duration: det_duration,
    freshness: s.freshness || 'N_A', flags: flags
  };
}

/**
 * resolverDominio(input) → DOMAIN_STATE (§18.1 — 17 campos)
 *
 * input = {
 *   domainSpec, contexto?,
 *   phenomenonStates[],                     // PHENOMENON_STATE de Fase 7 (de este nodo/período)
 *   phenSpecsPorId?, node_id?, period?
 * }
 */
function resolverDominio(input) {
  var inp = input || {};
  var domainSpec = inp.domainSpec || {};
  var phenStates = Array.isArray(inp.phenomenonStates) ? inp.phenomenonStates : [];
  var flags = [];

  var sid = (domainSpec.domain_id || 'dom?') + '|' + (inp.node_id || '?') + '|' + (inp.period || '?');

  // 1 — aplicabilidad (§19 / línea 1731: NOT_APPLICABLE → sin posición inventada)
  var apl = resolverAplicabilidad(domainSpec, inp.contexto);
  flags = flags.concat(apl.flags);
  if (apl.applicability === 'NOT_APPLICABLE') {
    return {
      domain_state_id: sid, domain_id: domainSpec.domain_id || null,
      node_id: inp.node_id || null, period: inp.period || null,
      applicability: 'NOT_APPLICABLE', pos: 'N_A',
      traj: 'N_A', pers: 'N_A', det_run: 0, det_duration: null,
      admissibility: 'NOT_ADMISSIBLE', freshness: 'N_A', coverage_status: 'NONE',
      deterioration_present: false, core_profile: [], supporting_profile: [],
      flags: flags.concat(['DOMINIO_NO_APLICABLE'])
    };
  }

  // 2 — partir en CORE / SUPPORTING según el spec
  var coreIds = (domainSpec.core_phenomenon_ids || []);
  var suppIds = (domainSpec.supporting_phenomenon_ids || []);
  var core = [], supporting = [];
  phenStates.forEach(function (s) {
    if (!s) return;
    if (coreIds.indexOf(s.phenomenon_id) !== -1) core.push(s);
    else if (suppIds.indexOf(s.phenomenon_id) !== -1) supporting.push(s);
    else flags.push('PHENOMENON_SIN_ROL_EN_DOMINIO:' + (s.phenomenon_id || '?'));
  });

  // 3 — utilizables (INV-18: utilizable o no, sin ponderar)
  var coreUtil = core.filter(_esUtilizable);
  var suppUtil = supporting.filter(_esUtilizable);

  // 4 — colapso §18
  var col = _colapsarDominio(coreUtil, suppUtil);
  var pos = col.pos;
  flags = flags.concat(col.flags);

  // 5 — cobertura
  var cob = coberturaDominio(domainSpec, phenStates);
  flags = flags.concat(cob.flags);

  // 6 — admisibilidad §19
  var adm = admisibilidadDominio({
    pos: pos, coverage_status: cob.coverage_status,
    coreUtilizables: coreUtil, supportingUtilizables: suppUtil
  });

  // 7 — propagación J: CORE utilizables alineados con la pos del dominio
  var alineados = coreUtil.filter(function (s) { return s.pos === pos; });
  var gob = _phenStateGobernante(alineados);
  var temp = propagarTemporalidadDominio(pos, gob);
  flags = flags.concat(temp.flags);

  // 8 — deterioration_present: D directo, o I con un CORE utilizable D
  var huboCoreD = coreUtil.some(function (s) { return s.pos === 'D'; });
  var deterioration_present = pos === 'D' || (pos === 'I' && huboCoreD);

  // 9 — perfiles
  function perfil(s) {
    return { phenomenon_id: s.phenomenon_id || null, pos: s.pos, admissibility: s.admissibility || null, utilizable: _esUtilizable(s) };
  }

  return {
    domain_state_id: sid,
    domain_id: domainSpec.domain_id || null,
    node_id: inp.node_id || null,
    period: inp.period || null,
    applicability: apl.applicability,
    pos: pos,
    traj: temp.traj,
    pers: temp.pers,
    det_run: temp.det_run,
    det_duration: temp.det_duration,
    admissibility: adm.admissibility,
    freshness: temp.freshness,
    coverage_status: cob.coverage_status,
    deterioration_present: deterioration_present,
    core_profile: core.map(perfil),
    supporting_profile: supporting.map(perfil),
    flags: flags.concat(adm.flags)
  };
}

var _POSICION = ['F', 'I', 'D', 'N_A'];
var _ADMIS = ['ADMISSIBLE', 'ADMISSIBLE_WITH_LIMITATIONS', 'NOT_ADMISSIBLE'];
var _COVERAGE = ['COMPLETE', 'PARTIAL', 'NONE'];
var _CAMPOS_DOMAIN_STATE = [
  'domain_state_id', 'domain_id', 'node_id', 'period', 'applicability', 'pos', 'traj', 'pers',
  'det_run', 'det_duration', 'admissibility', 'freshness', 'coverage_status', 'deterioration_present',
  'core_profile', 'supporting_profile', 'flags'
];

/** validarDomainState(state) → { ok, errores[] } — chequeo de forma ligero (§18.1). */
function validarDomainState(state) {
  var errores = [];
  if (state === null || typeof state !== 'object' || Array.isArray(state)) {
    return { ok: false, errores: ['no es un objeto'] };
  }
  _CAMPOS_DOMAIN_STATE.forEach(function (k) { if (!(k in state)) errores.push('falta el campo ' + k); });
  if (_POSICION.indexOf(state.pos) === -1) errores.push('pos inválida: ' + state.pos);
  if (_APPLICABILITY.indexOf(state.applicability) === -1) errores.push('applicability inválida: ' + state.applicability);
  if (_ADMIS.indexOf(state.admissibility) === -1) errores.push('admissibility inválida: ' + state.admissibility);
  if (_COVERAGE.indexOf(state.coverage_status) === -1) errores.push('coverage_status inválido: ' + state.coverage_status);
  if (!Array.isArray(state.core_profile)) errores.push('core_profile no es array');
  if (!Array.isArray(state.supporting_profile)) errores.push('supporting_profile no es array');
  if (!Array.isArray(state.flags)) errores.push('flags no es array');
  if (typeof state.deterioration_present !== 'boolean') errores.push('deterioration_present no es boolean');
  return { ok: errores.length === 0, errores: errores };
}

module.exports = {
  _colapsarDominio: _colapsarDominio,
  resolverAplicabilidad: resolverAplicabilidad,
  coberturaDominio: coberturaDominio,
  admisibilidadDominio: admisibilidadDominio,
  _phenStateGobernante: _phenStateGobernante,
  propagarTemporalidadDominio: propagarTemporalidadDominio,
  resolverDominio: resolverDominio,
  validarDomainState: validarDomainState
};
