/**
 * motor-piio/efo.js — Fase 9
 *
 * Motor DOMAIN → EFO (§20–21 / §24). Produce el EFO_STATE final — el
 * output de toda la cascada, lo que PIIO exporta a CFF/IFD y a AIE.
 * "EFO integra DOMAIN_STATE ya resueltos. No reabre KPI ni fenómenos"
 * (§20 / INV-32).
 *
 * Se construye en 2 partes:
 *   9a  §20 — posición (regla de 5 ramas) + deterioración + cobertura +
 *       admisibilidad                                          ← este archivo
 *   9b  §21 — trayectoria / persistencia + scope + orquestador
 *       resolverEFO → EFO_STATE (§24, 23 campos)               ← este archivo
 *
 * ── §20.1 — regla determinista de 5 ramas (COMPLETA, función total) ──
 *
 *   R = dominios REQUIRED clasificables (pos ∈ {F,I,D} ∧ admissibility ≠
 *   NOT_ADMISSIBLE). O_D = ∃ OPTIONAL clasificable con pos D.
 *
 *   1. R = ∅                             → N_A
 *   2. ∃ r ∈ R con pos D                 → D
 *   3. (¬D en R) ∧ (∃ I en R)            → I
 *   4. (todo R es F) ∧ O_D               → I  (+ deterioration_present)
 *   5. (todo R es F) ∧ ¬O_D              → F
 *
 *   Partición de S_R ⊆ {F,I,D} (R ≠ ∅): D∈S_R → 2 ; D∉S_R ∧ I∈S_R → 3 ;
 *   S_R = {F} → 4/5. Cada caso cae en EXACTAMENTE una rama.
 *
 * ── DIFERENCIA con §15/§18 — NO asumir el patrón ───────────────────
 *
 * A nivel EFO un REQUIRED D **gana de plano** (rama 2): {F,D} REQUIRED →
 * EFO **D**, NO I. AC76: "Mayoría de dominios F con REQUIRED D → EFO D;
 * sin votación" / INV-33/75/76. Esto CONTRASTA con `_colapsarDominio`
 * (Fase 8, CORE F+D → I) y con `_colapsarSetDirect` (Fase 7, §15). La
 * cascada cambia de regla en este nivel.
 *
 *   "OPTIONAL no sustituye el núcleo REQUIRED" (INV-36).
 *   "OPTIONAL D no convierte automáticamente EFO en D" (INV-35 — solo a I).
 *   "La ausencia de REQUIRED... no se convierte en I" (§20.1).
 *   "No existe votación, promedio, ponderación ni porcentaje" (§20.1).
 *
 * ── deterioration_present ≠ EFO_pos (§20 / INV-38) ─────────────────
 *
 * `deterioration_present = (∃ REQUIRED clasificable D) ∨ (∃ OPTIONAL
 *  clasificable D)`. AC42: puede ser `true` con `EFO_pos = N_A` (INV-34:
 * "OPTIONAL D no se oculta").
 *
 * ── Ambigüedad AW — COVERAGE_STATUS_EFO (4 valores, §27) sin tabla ──
 *
 * §20 no da tabla. Decisión: FULL = todos los REQUIRED clasificables ;
 * PARTIAL = algunos ; LIMITED = 0 REQUIRED pero ∃ OPTIONAL clasificable ;
 * INSUFFICIENT = nada clasificable. `required_coverage_complete` (§24,
 * boolean separado) = (FULL).
 *
 * ── §20.1 — admisibilidad (líneas 1193–1197) ──────────────────────
 *
 *   F   → exige `required_coverage_complete` ∧ sin OPTIONAL D.
 *   D   → admisible con cobertura parcial si ∃ REQUIRED D válido.
 *   I   → admisible si deriva de evidencia divergente/indeterminada,
 *         no de ausencia.
 *   N_A → NOT_ADMISSIBLE.
 *
 * DECISIÓN (no dictada por el texto — una sola oración cubre "I"): la I de
 * la rama 3 (divergencia real en REQUIRED) → `ADMISSIBLE`; la I de la rama
 * 4 (indeterminación forzada por OPTIONAL D sobre un núcleo F) →
 * `ADMISSIBLE_WITH_LIMITATIONS` + flag. Origen epistémico distinto.
 */

'use strict';

var C = require('./contratos'); // validarEFOStateLigero (rechazo de score — AC75)
var T = require('./temporal');   // continuidadRun — historia de EFO_pos (INV-39)

function _tieneFlag(o, f) { return (o && o.flags || []).some(function (x) { return x === f || x.indexOf(f + ':') === 0; }); }
function _clasificable(s) { return !!s && (s.pos === 'F' || s.pos === 'I' || s.pos === 'D') && s.admissibility !== 'NOT_ADMISSIBLE'; }
function _admisibleValido(s) { return !!s && typeof s.admissibility === 'string' && s.admissibility.indexOf('ADMISSIBLE') === 0; }

/**
 * _particionarDominios(domainStates) → {
 *   requiredTotal[], requiredClasificables[], optionalClasificables[],
 *   flags
 * }
 * Partición por DOMAIN_STATE.applicability. NOT_APPLICABLE se ignora.
 */
function _particionarDominios(domainStates) {
  var reqTotal = [], reqCla = [], optCla = [];
  var flags = [];
  (domainStates || []).forEach(function (s) {
    if (!s) return;
    if (s.applicability === 'REQUIRED') {
      reqTotal.push(s);
      if (_clasificable(s)) reqCla.push(s);
    } else if (s.applicability === 'OPTIONAL') {
      if (_clasificable(s)) optCla.push(s);
    } else if (s.applicability !== 'NOT_APPLICABLE') {
      flags.push('DOMAIN_STATE_SIN_APPLICABILITY:' + (s.domain_id || '?'));
    }
  });
  return { requiredTotal: reqTotal, requiredClasificables: reqCla, optionalClasificables: optCla, flags: flags };
}

function _hayPos(lista, pos) { return (lista || []).some(function (s) { return s.pos === pos; }); }

/**
 * posicionEFO(part) → { pos, flags }
 * Regla determinista de 5 ramas de §20.1.
 */
function posicionEFO(part) {
  var p = part || {};
  var R = p.requiredClasificables || [];
  var O = p.optionalClasificables || [];

  if (R.length === 0) return { pos: 'N_A', flags: ['SIN_REQUIRED_CLASIFICABLE'] };                 // rama 1
  if (_hayPos(R, 'D')) return { pos: 'D', flags: [] };                                              // rama 2 — gana de plano (AC76, sin votación)
  if (_hayPos(R, 'I')) return { pos: 'I', flags: [] };                                              // rama 3
  // todos los REQUIRED clasificables son F
  if (_hayPos(O, 'D')) return { pos: 'I', flags: ['EFO_I_POR_OPTIONAL_D'] };                        // rama 4
  return { pos: 'F', flags: [] };                                                                   // rama 5
}

/**
 * deterioracionEFO(part) → { deterioration_present, flags }
 * INV-38: propiedad distinta de EFO_pos. INV-34: OPTIONAL D no se oculta.
 */
function deterioracionEFO(part) {
  var p = part || {};
  var reqD = _hayPos(p.requiredClasificables || [], 'D');
  var optD = _hayPos(p.optionalClasificables || [], 'D');
  var flags = [];
  if (optD && !reqD) flags.push('DETERIORO_SOLO_EN_OPTIONAL'); // AC42 / INV-34
  return { deterioration_present: reqD || optD, flags: flags };
}

/**
 * coberturaEFO(part) → {
 *   coverage_status: FULL | PARTIAL | LIMITED | INSUFFICIENT,
 *   required_coverage_complete, flags
 * }
 * Ambig. AW.
 */
function coberturaEFO(part) {
  var p = part || {};
  var reqTotal = p.requiredTotal || [];
  var reqCla = p.requiredClasificables || [];
  var optCla = p.optionalClasificables || [];

  var required_coverage_complete = reqTotal.length > 0 && reqCla.length === reqTotal.length;
  var coverage_status;
  if (reqTotal.length > 0 && reqCla.length === reqTotal.length) coverage_status = 'FULL';
  else if (reqCla.length > 0) coverage_status = 'PARTIAL';
  else if (optCla.length > 0) coverage_status = 'LIMITED';
  else coverage_status = 'INSUFFICIENT';

  var flags = [];
  if (reqTotal.length === 0) flags.push('SIN_DOMINIOS_REQUIRED'); // INV-31 / config
  return { coverage_status: coverage_status, required_coverage_complete: required_coverage_complete, flags: flags };
}

/**
 * admisibilidadEFO({ pos, coverage_status, required_coverage_complete,
 *   part }) → { admissibility, flags }   (§20.1 líneas 1193–1197)
 */
function admisibilidadEFO(args) {
  var a = args || {};
  var pos = a.pos;
  var part = a.part || {};
  var R = part.requiredClasificables || [];
  var O = part.optionalClasificables || [];

  if (pos === 'N_A' || pos == null) return { admissibility: 'NOT_ADMISSIBLE', flags: ['SIN_POSICION'] };

  if (pos === 'F') {
    // §20.1: F exige required_coverage_complete ∧ sin OPTIONAL D. La rama 5
    // ya garantiza "sin OPTIONAL D", así que el gate real es la cobertura.
    if (!a.required_coverage_complete) {
      return { admissibility: 'NOT_ADMISSIBLE', flags: ['REQUIRED_COVERAGE_INCOMPLETA_F'] }; // INV-37
    }
    return { admissibility: 'ADMISSIBLE', flags: [] };
  }

  if (pos === 'D') {
    var hayReqDValido = R.some(function (s) { return s.pos === 'D' && _admisibleValido(s); });
    if (!hayReqDValido) return { admissibility: 'NOT_ADMISSIBLE', flags: ['SIN_REQUIRED_D_VALIDO'] };
    // §20.1: D admisible con cobertura parcial — NO exige cobertura completa.
    return a.coverage_status === 'FULL'
      ? { admissibility: 'ADMISSIBLE', flags: [] }
      : { admissibility: 'ADMISSIBLE_WITH_LIMITATIONS', flags: ['COBERTURA_EFO_PARCIAL_D'] };
  }

  // pos === 'I'. DECISIÓN (una sola oración en §20.1 cubre "I"):
  //  - rama 3 (∃ REQUIRED I por evidencia divergente/indeterminada) → ADMISSIBLE
  //  - rama 4 (todo REQUIRED F, I forzada por OPTIONAL D) → ADMISSIBLE_WITH_LIMITATIONS
  var iPorRequired = R.some(function (s) { return s.pos === 'I'; });
  if (iPorRequired) return { admissibility: 'ADMISSIBLE', flags: [] };
  var iPorOptional = R.length > 0 && R.every(function (s) { return s.pos === 'F'; }) && O.some(function (s) { return s.pos === 'D'; });
  if (iPorOptional) return { admissibility: 'ADMISSIBLE_WITH_LIMITATIONS', flags: ['EFO_I_ADMISIBILIDAD_LIMITADA_POR_OPTIONAL'] };
  return { admissibility: 'ADMISSIBLE_WITH_LIMITATIONS', flags: ['EFO_I_ORIGEN_NO_RECONOCIDO'] };
}

/* ═══════════════════════════════════════════════════════════════════════
 * 9b — §21 trayectoria/persistencia + scope + orquestador → EFO_STATE (§24)
 *
 * §29: resolve_efo_position → resolve_efo_deterioration_present →
 *      resolve_efo_trajectory_persistence → resolve_efo_coverage_admissibility.
 *
 * ── §21 — trayectoria EFO (líneas 1210–1222) ──────────────────────
 *
 * "EFO_traj integra transición de posición y cambio de configuración de
 *  dominios. Puede mejorar o deteriorarse aun cuando EFO_pos permanezca D"
 *  (INV-40).
 *
 *   D→{I,F} / I→F  → IMPROVING   SI el cambio no deriva de pérdida de evidencia
 *   F→{I,D} / I→D  → DETERIORATING SI el cambio refleja operación real
 *   D→D, menos dominios D, sin nuevos deterioros → puede IMPROVING (AC44)
 *   D→D, nuevos dominios D → puede DETERIORATING (AC45)
 *   sin comparación temporal admisible → N_A
 *   "Salir de D no equivale a alcanzar F; RECOVERY pertenece a AIE" (INV-41)
 *
 * ── Cómo se tratan los "puede ser" (postura interpretativa explícita) ──
 *
 *  · Mejora + pérdida de evidencia: AC46 da la condición NEGATIVA
 *    operacionalizable → está en el código (`porPerdidaEvidencia` → N_A,
 *    no IMPROVING). El relleno positivo (qué es en vez de IMPROVING) es
 *    DECISIÓN: N_A + flag.
 *  · Deterioro "si refleja operación real": el texto NO da mecanismo
 *    evaluable → ambigüedad AX. Default DETERIORATING + flag (resultado que
 *    el texto enuncia; una señal de deterioro no se oculta — perfil INV-34);
 *    `cambioOperacionalReal === false` → N_A + flag.
 *  · AC44/AC45: el texto NOMBRA la condición cualitativa ("menos/más
 *    dominios D") pero SIGUE diciendo "puede ser", no "es". Postura
 *    adoptada: tratamos "puede ser X" como "ES X, dada la condición
 *    nombrada" SÓLO cuando el llamante provee los conteos concretos
 *    (`opciones.dDominios*` / `nuevosDeterioros`). NO es que el texto
 *    operacionalice AC44/45 del todo — es una lectura específica de "puede"
 *    condicionada a datos presentes. Ausentes → STABLE + flag.
 *
 * ── §21 — persistencia EFO ────────────────────────────────────────
 *
 * `EFO_det_run` sobre la historia de EFO_pos (INV-39 — NO hereda la
 * persistencia de los dominios). `pos ≠ D` → `pers = N_A` (§11). AC43:
 * locus del deterioro variable entre dominios → la persistencia significa
 * "condición operacional deteriorada persistente, no el mismo problema"
 * → flag `LOCUS_DETERIORO_VARIABLE`.
 *
 * ── Ambigüedad O — materializada aquí ─────────────────────────────
 *
 * `resolverScope` deriva `EFO_STATE.scope` de `NODE_SPEC.scope_rules.scope`
 * (∈ SCOPE = ORGANIZATIONAL | SEGMENT_ONLY). Ausente/inválido →
 * `SEGMENT_ONLY` + flag (DECISIÓN: conservador, no auto-eleva a
 * organizacional — INV-47). No reabre la decisión de Fase 1.
 *
 * ── EFO_STATE (§24, 23 campos) — fuentes ──────────────────────────
 *
 * 9a: pos, deterioration_present, coverage_status, required_coverage_complete,
 *     admissibility.  9b: traj, pers, det_run, det_duration, scope.
 * Derivaciones nuevas (DECISIÓN etiquetada): `freshness` = la peor entre
 * los DOMAIN_STATE REQUIRED clasificables ; `regime_status` = input o
 * default 'CONTINUOUS' + flag ; `node_profile` = mononodo (Fase 10 extiende).
 * `temporal_pattern?`/`series_stability?` → null (opcionales en §24; sin
 * serie de valor única a nivel EFO). `piio_run_id`/`ruleset_version` → input
 * o null + flag RUN_METADATA_PENDIENTE (Fase 11).
 * ═══════════════════════════════════════════════════════════════════════ */

var _RANGO_FRESH = { STALE: 3, AGING: 2, CURRENT: 1, N_A: 0 };
var _SCOPE = ['ORGANIZATIONAL', 'SEGMENT_ONLY'];

var _MEJORA = { 'D>I': 1, 'D>F': 1, 'I>F': 1 };
var _DETERIORO = { 'F>I': 1, 'F>D': 1, 'I>D': 1 };

/**
 * trayectoriaEFO(posActual, posPrevio, opciones) → { traj, flags }
 */
function trayectoriaEFO(posActual, posPrevio, opciones) {
  var o = opciones || {};
  var flags = [];

  if (posPrevio == null || o.comparacionAdmisible === false) {
    return { traj: 'N_A', flags: ['SIN_COMPARACION_TEMPORAL'] };
  }
  if (posActual === 'N_A' || posPrevio === 'N_A') {
    return { traj: 'N_A', flags: ['POS_N_A_EN_LA_COMPARACION'] };
  }

  var t = posPrevio + '>' + posActual;

  if (_MEJORA[t]) {
    if (o.porPerdidaEvidencia === true) {
      // AC46: "no declarar IMPROVING". Relleno positivo = DECISIÓN: N_A.
      return { traj: 'N_A', flags: ['MEJORA_APARENTE_POR_PERDIDA_EVIDENCIA'] };
    }
    // INV-41: "salir de D" NO equivale a alcanzar F — esto es traj, no pos;
    // el pos ya lo fijó la regla de 5 ramas, aquí no se toca.
    return { traj: 'IMPROVING', flags: flags };
  }

  if (_DETERIORO[t]) {
    if (o.cambioOperacionalReal === false) {
      return { traj: 'N_A', flags: ['CAMBIO_NO_REFLEJA_OPERACION_REAL'] };
    }
    if (o.cambioOperacionalReal !== true) flags.push('CAMBIO_OPERACIONAL_NO_CONFIRMADO'); // AX
    return { traj: 'DETERIORATING', flags: flags };
  }

  if (posActual === 'D' && posPrevio === 'D') {
    var tienenConteos = typeof o.dDominiosPrev === 'number' && typeof o.dDominiosActual === 'number';
    if (o.nuevosDeterioros === true) return { traj: 'DETERIORATING', flags: flags };           // AC45
    if (tienenConteos && o.dDominiosActual < o.dDominiosPrev) return { traj: 'IMPROVING', flags: flags }; // AC44
    if (!tienenConteos && o.nuevosDeterioros == null) flags.push('CONFIG_DOMINIOS_NO_COMPARADA');
    return { traj: 'STABLE', flags: flags };
  }

  // misma pos (F→F, I→I) u otra transición sin regla → STABLE
  return { traj: 'STABLE', flags: flags };
}

/**
 * persistenciaEFO(historiaEFOPos, periods, opciones) → {
 *   pers, det_run, det_duration, flags
 * }
 * INV-39: sobre la historia de EFO_pos. §11: pers sólo si pos actual = D.
 */
function persistenciaEFO(historiaEFOPos, periods, opciones) {
  var o = opciones || {};
  var serie = Array.isArray(historiaEFOPos) ? historiaEFOPos : [];
  var per = Array.isArray(periods) ? periods : serie.map(function (_, i) { return String(i + 1); });
  var flags = [];

  var cont;
  try {
    cont = T.continuidadRun(serie, per, { maxGap: o.maxGap });
  } catch (e) {
    return { pers: 'N_A', det_run: 0, det_duration: null, flags: ['HISTORIA_EFO_INVALIDA'] };
  }
  flags = flags.concat(cont.flags || []);

  var posActual = serie.length ? serie[serie.length - 1] : null;
  if (posActual !== 'D') {
    return { pers: 'N_A', det_run: cont.det_run, det_duration: cont.det_duration, flags: flags }; // §11
  }

  var pers;
  var pMin = null; // PARAMS.PERS_REPEATED_MIN / _PERSISTENT_MIN — Grupo 1, null
  if (pMin == null) {
    pers = cont.det_run >= 2 ? 'REPEATED' : 'POINT';
    flags.push('PERS_EFO_NO_CALIBRADA');
  }
  if (o.locusVariable === true) flags.push('LOCUS_DETERIORO_VARIABLE'); // AC43
  return { pers: pers, det_run: cont.det_run, det_duration: cont.det_duration, flags: flags };
}

/**
 * resolverScope(nodeSpec) → { scope, flags }   (ambig. O materializada)
 */
function resolverScope(nodeSpec) {
  var sr = (nodeSpec || {}).scope_rules || {};
  if (_SCOPE.indexOf(sr.scope) !== -1) return { scope: sr.scope, flags: [] };
  // DECISIÓN: sin scope declarado → SEGMENT_ONLY (no auto-eleva, INV-47).
  return { scope: 'SEGMENT_ONLY', flags: ['SCOPE_NO_RESUELTO:' + String(sr.scope)] };
}

function _freshnessEFO(part) {
  var reqCla = (part || {}).requiredClasificables || [];
  if (reqCla.length === 0) return 'N_A';
  var peor = 'N_A', peorR = 0;
  reqCla.forEach(function (s) {
    var r = _RANGO_FRESH[s.freshness] != null ? _RANGO_FRESH[s.freshness] : 0;
    if (r > peorR) { peorR = r; peor = s.freshness; }
  });
  return peor;
}

var _POSICION = ['F', 'I', 'D', 'N_A'];
var _CAMPOS_EFO_STATE = [
  'efo_state_id', 'organization_id', 'node_id', 'scope', 'period', 'pos', 'traj', 'pers',
  'det_run', 'det_duration', 'admissibility', 'freshness', 'coverage_status',
  'required_coverage_complete', 'deterioration_present', 'domain_profile', 'node_profile',
  'temporal_pattern', 'series_stability', 'regime_status', 'flags', 'piio_run_id', 'ruleset_version'
];

/**
 * resolverEFO(input) → EFO_STATE (§24 — 23 campos)
 *
 * input = {
 *   domainStates[], nodeSpec?,
 *   organization_id?, node_id?, period?,
 *   efoPrevio?,                              // { pos } del período anterior
 *   historiaEFOPos?, historiaPeriods?,       // para pers/det_run (INV-39)
 *   opcionesTraj?, opcionesPers?,
 *   regimeStatus?, piio_run_id?, ruleset_version?
 * }
 */
function resolverEFO(input) {
  var inp = input || {};
  var domainStates = Array.isArray(inp.domainStates) ? inp.domainStates : [];
  var flags = [];

  // §29 — 4 pasos
  var part = _particionarDominios(domainStates);
  flags = flags.concat(part.flags);

  var posRes = posicionEFO(part);
  var pos = posRes.pos;
  flags = flags.concat(posRes.flags);

  var detRes = deterioracionEFO(part);
  flags = flags.concat(detRes.flags);

  var cobRes = coberturaEFO(part);
  flags = flags.concat(cobRes.flags);

  var admRes = admisibilidadEFO({
    pos: pos, coverage_status: cobRes.coverage_status,
    required_coverage_complete: cobRes.required_coverage_complete, part: part
  });
  flags = flags.concat(admRes.flags);

  var trajRes = trayectoriaEFO(pos, (inp.efoPrevio || {}).pos, inp.opcionesTraj);
  flags = flags.concat(trajRes.flags);

  var histPos = Array.isArray(inp.historiaEFOPos) && inp.historiaEFOPos.length ? inp.historiaEFOPos : [pos];
  var histPer = Array.isArray(inp.historiaPeriods) && inp.historiaPeriods.length ? inp.historiaPeriods : [inp.period || '1'];
  var persRes = persistenciaEFO(histPos, histPer, inp.opcionesPers);
  flags = flags.concat(persRes.flags);

  var scopeRes = resolverScope(inp.nodeSpec);
  flags = flags.concat(scopeRes.flags);

  // regime_status (§24, requerido) — sin fuente natural a nivel EFO
  var regime_status = inp.regimeStatus;
  if (regime_status == null) { regime_status = 'CONTINUOUS'; flags.push('REGIME_STATUS_EFO_POR_DEFECTO'); }

  // run metadata (§24) — Fase 11
  var piio_run_id = inp.piio_run_id != null ? inp.piio_run_id : null;
  var ruleset_version = inp.ruleset_version != null ? inp.ruleset_version : null;
  if (piio_run_id == null || ruleset_version == null) flags.push('RUN_METADATA_PENDIENTE');

  function perfilDom(s) {
    return {
      domain_id: s.domain_id || null, applicability: s.applicability || null,
      pos: s.pos, admissibility: s.admissibility || null,
      deterioration_present: !!s.deterioration_present, clasificable: _clasificable(s)
    };
  }

  flags.push('NODE_PROFILE_MONONODO'); // Fase 10 lo extiende a multi-nodo

  return {
    efo_state_id: (inp.organization_id || 'org?') + '|' + (inp.node_id || '?') + '|' + (inp.period || '?'),
    organization_id: inp.organization_id || null,
    node_id: inp.node_id || null,
    scope: scopeRes.scope,
    period: inp.period || null,
    pos: pos,
    traj: trajRes.traj,
    pers: persRes.pers,
    det_run: persRes.det_run,
    det_duration: persRes.det_duration,
    admissibility: admRes.admissibility,
    freshness: _freshnessEFO(part),
    coverage_status: cobRes.coverage_status,
    required_coverage_complete: cobRes.required_coverage_complete,
    deterioration_present: detRes.deterioration_present,
    domain_profile: domainStates.map(perfilDom),
    node_profile: [{
      node_id: inp.node_id || null, scope: scopeRes.scope,
      pos: pos, deterioration_present: detRes.deterioration_present
    }],
    temporal_pattern: null,   // §24: opcional (?)
    series_stability: null,   // §24: opcional (?)
    regime_status: regime_status,
    flags: flags,
    piio_run_id: piio_run_id,
    ruleset_version: ruleset_version
  };
}

/**
 * validarEFOState(state) → { ok, errores[] }
 * Forma completa de §24 (23 campos) + reuso de validarEFOStateLigero de
 * Fase 0 (rechazo de CLAVES_SCORE_PROHIBIDAS — §35 / AC75).
 */
function validarEFOState(state) {
  var errores = [];
  if (state === null || typeof state !== 'object' || Array.isArray(state)) {
    return { ok: false, errores: ['no es un objeto'] };
  }
  _CAMPOS_EFO_STATE.forEach(function (k) { if (!(k in state)) errores.push('falta el campo ' + k); });
  if (_POSICION.indexOf(state.pos) === -1) errores.push('pos inválida: ' + state.pos);
  if (_SCOPE.indexOf(state.scope) === -1) errores.push('scope inválido: ' + state.scope);
  if (['ADMISSIBLE', 'ADMISSIBLE_WITH_LIMITATIONS', 'NOT_ADMISSIBLE'].indexOf(state.admissibility) === -1) errores.push('admissibility inválida: ' + state.admissibility);
  if (['FULL', 'PARTIAL', 'LIMITED', 'INSUFFICIENT'].indexOf(state.coverage_status) === -1) errores.push('coverage_status inválido: ' + state.coverage_status);
  if (typeof state.required_coverage_complete !== 'boolean') errores.push('required_coverage_complete no es boolean');
  if (typeof state.deterioration_present !== 'boolean') errores.push('deterioration_present no es boolean');
  ['domain_profile', 'node_profile', 'flags'].forEach(function (k) { if (!Array.isArray(state[k])) errores.push(k + ' no es array'); });

  var ligero = C.validarEFOStateLigero(state);
  if (!ligero.valido) errores = errores.concat(ligero.invalidos); // incluye rechazo de score (AC75)

  return { ok: errores.length === 0, errores: errores };
}

module.exports = {
  _particionarDominios: _particionarDominios,
  posicionEFO: posicionEFO,
  deterioracionEFO: deterioracionEFO,
  coberturaEFO: coberturaEFO,
  admisibilidadEFO: admisibilidadEFO,
  trayectoriaEFO: trayectoriaEFO,
  persistenciaEFO: persistenciaEFO,
  resolverScope: resolverScope,
  resolverEFO: resolverEFO,
  validarEFOState: validarEFOState
};
