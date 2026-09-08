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
 *       resolverEFO → EFO_STATE (§24, 23 campos)
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

module.exports = {
  _particionarDominios: _particionarDominios,
  posicionEFO: posicionEFO,
  deterioracionEFO: deterioracionEFO,
  coberturaEFO: coberturaEFO,
  admisibilidadEFO: admisibilidadEFO
  // 9b añade: trayectoriaEFO, persistenciaEFO, resolverScope, resolverEFO, validarEFOState
};
