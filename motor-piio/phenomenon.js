/**
 * motor-piio/phenomenon.js — Fase 7
 *
 * Motor KPI → PHENOMENON (§15–17). §15: "primero se filtra evidencia
 * utilizable; después se colapsan grupos dependientes (Fase 6); luego se
 * resuelve la evidencia DIRECT y finalmente se evalúan PROXY."
 *
 * Se construye en 3 partes:
 *   7a  resolución de posición DIRECT/PROXY (§15, AC23–28)     ← este archivo
 *   7b  cobertura + admisibilidad del fenómeno (§16, AC30/31)  ← este archivo
 *   7c  compatibilidad temporal / lag (§17, AC29) + orquestador
 *       resolverFenomeno → PHENOMENON_STATE (§15.1)
 *
 * ── §15 — tabla DIRECT (COMPLETA: 7 filas = los 7 subconjuntos no vacíos
 *    de {F,D,I}, a diferencia de §14 que solo daba los pares) ──────────
 *
 *   {F}→F  {D}→D  {I}→I  {F,I}→F  {D,I}→D  {F,D}→I  {F,D,I}→I
 *
 *   Regla de conjunto:  F∈S ∧ D∈S → I  (INV-PIIO-17: divergencia
 *   diagnóstica, NO mayoría — distinto de §14 donde F+D dentro de UN grupo
 *   da N_A+INTERNAL_INCONSISTENCY); si no F→F; si no D→D; si no I.
 *
 * ── Precedencia (§15, INV-PIIO-14/15) ───────────────────────────────
 *
 * "DIRECT tiene precedencia inferencial frente a PROXY SIN PESOS. Si DIRECT
 *  es resolutivo, PROXY no cambia posición. Si no existe DIRECT utilizable,
 *  PROXY solo puede sustentar posición cuando proxy_allowed_as_primary=true."
 *
 * ── Ambigüedad L — ¿qué es "DIRECT utilizable"? ─────────────────────
 *
 * Grupo DIRECT cuyo `pos ∈ {F, D, I}` → utilizable, entra al set.
 * Grupo DIRECT → `N_A` (todos sus miembros N_A) → NO entra, NO bloquea
 * PROXY. Grupo DIRECT → `N_A` con flag `INTERNAL_INCONSISTENCY` (F+D
 * interno, §14): NO entra al set, pero el flag se PROPAGA al fenómeno.
 *
 * ── Ambigüedad AP — grupo `evidence_proximity = 'MIXED'` (de Fase 6) ─
 *
 * Cuenta como DIRECT para el set de §15 (cualquier evidencia DIRECT en el
 * grupo lo hace grado-DIRECT). §15 no lo dice; Fase 6 ya colapsó el grupo
 * a una sola posición, no se puede separar. Flag
 * `PROXIMIDAD_MIXTA_TRATADA_COMO_DIRECT`.
 */

'use strict';

function _tieneFlag(o, f) { return (o && o.flags || []).some(function (x) { return x === f || x.indexOf(f + ':') === 0; }); }

/**
 * _colapsarSetDirect(grupos) → { pos, resolutivo, flags }
 *
 * `grupos` = salidas de colapsarGrupo (Fase 6) de grado DIRECT. Regla de
 * conjunto de §15. `resolutivo=false` sii no hay ningún grupo con
 * pos ∈ {F,D,I} (→ "no existe DIRECT utilizable", §15).
 */
function _colapsarSetDirect(grupos) {
  var flags = [];
  var S = {};
  (grupos || []).forEach(function (g) {
    if (g && (g.pos === 'F' || g.pos === 'D' || g.pos === 'I')) S[g.pos] = true;
    if (_tieneFlag(g, 'INTERNAL_INCONSISTENCY')) flags.push('DIRECT_GRUPO_INCONSISTENTE:' + (g.evidence_group_id || '?')); // L
  });

  if (S.F && S.D) return { pos: 'I', resolutivo: true, flags: flags.concat(['DIRECT_F_D_DIVERGENCIA']) }; // INV-17
  if (S.F) return { pos: 'F', resolutivo: true, flags: flags };
  if (S.D) return { pos: 'D', resolutivo: true, flags: flags };
  if (S.I) return { pos: 'I', resolutivo: true, flags: flags };
  return { pos: null, resolutivo: false, flags: flags }; // sin DIRECT utilizable
}

/**
 * particionarPorProximidad(gruposColapsados) → { direct, proxy, flags }
 *
 * DIRECT-grade = evidence_proximity 'DIRECT' o 'MIXED' (ambig. AP).
 * PROXY-grade  = 'PROXY'. Sin proximidad → se ignora + flag.
 */
function particionarPorProximidad(gruposColapsados) {
  var direct = [], proxy = [], flags = [];
  (gruposColapsados || []).forEach(function (g) {
    if (!g) return;
    if (g.evidence_proximity === 'DIRECT') direct.push(g);
    else if (g.evidence_proximity === 'MIXED') {
      direct.push(g);
      flags.push('PROXIMIDAD_MIXTA_TRATADA_COMO_DIRECT:' + (g.evidence_group_id || '?')); // AP
    } else if (g.evidence_proximity === 'PROXY') proxy.push(g);
    else flags.push('GRUPO_SIN_PROXIMIDAD:' + (g.evidence_group_id || '?'));
  });
  return { direct: direct, proxy: proxy, flags: flags };
}

/**
 * resolverDirectYProxy(gruposColapsados, phenSpec) → {
 *   pos,                          // F | I | D | N_A
 *   evidence_basis,               // DIRECT | PROXY | NONE (§15.1)
 *   governing_group_id,           // el grupo cuya posición gobierna, o null
 *   flags: string[]
 * }
 *
 * §15 / INV-PIIO-14/15 / AC23–28.
 */
function resolverDirectYProxy(gruposColapsados, phenSpec) {
  var spec = phenSpec || {};
  var part = particionarPorProximidad(gruposColapsados);
  var flags = part.flags.slice();

  var direct = _colapsarSetDirect(part.direct);
  flags = flags.concat(direct.flags);

  if (direct.resolutivo) {
    // DIRECT gobierna; PROXY no cambia la posición (§15). AC26: flag si el
    // PROXY discrepa.
    var proxyDiscrepa = part.proxy.some(function (g) {
      return (g.pos === 'F' || g.pos === 'D' || g.pos === 'I') && g.pos !== direct.pos;
    });
    if (proxyDiscrepa) flags.push('PROXY_DISCREPA_DE_DIRECT'); // AC26
    var gov = part.direct.filter(function (g) {
      return g.pos === direct.pos || (direct.pos === 'I' && (g.pos === 'F' || g.pos === 'D'));
    })[0];
    return {
      pos: direct.pos, evidence_basis: 'DIRECT',
      governing_group_id: gov ? gov.evidence_group_id : null, flags: flags
    };
  }

  // No existe DIRECT utilizable (§15).
  if (spec.proxy_allowed_as_primary === true) {
    var proxyRes = _colapsarSetDirect(part.proxy); // misma regla de conjunto
    if (proxyRes.resolutivo) {
      var govP = part.proxy.filter(function (g) {
        return g.pos === proxyRes.pos || (proxyRes.pos === 'I' && (g.pos === 'F' || g.pos === 'D'));
      })[0];
      return {
        pos: proxyRes.pos, evidence_basis: 'PROXY',
        governing_group_id: govP ? govP.evidence_group_id : null,
        flags: flags.concat(proxyRes.flags, ['PROXY_COMO_PRIMARIO']) // AC27 / INV-15
      };
    }
    return { pos: 'N_A', evidence_basis: 'NONE', governing_group_id: null, flags: flags.concat(['SIN_EVIDENCIA_UTILIZABLE']) };
  }

  // PROXY existe pero no está autorizado como primario (AC28 / INV-15).
  var hayProxy = part.proxy.some(function (g) { return g.pos === 'F' || g.pos === 'D' || g.pos === 'I'; });
  return {
    pos: 'N_A', evidence_basis: 'NONE', governing_group_id: null,
    flags: flags.concat([hayProxy ? 'PROXY_NO_AUTORIZADO_COMO_PRIMARIO' : 'SIN_EVIDENCIA_UTILIZABLE'])
  };
}

/* ═══════════════════════════════════════════════════════════════════════
 * 7b — cobertura + admisibilidad del fenómeno (§16)
 *
 * §16: "Cada fenómeno declara grupos requeridos y opcionales.
 *  COVERAGE_STATUS = COMPLETE | PARTIAL | NONE en el nivel fenómeno. La
 *  cobertura no se usa como peso." / "Puede existir F observable con
 *  cobertura parcial y admisibilidad insuficiente; D puede ser admisible
 *  con cobertura parcial si una unidad autorizada establece deterioro y
 *  no existe contradicción DIRECT F sin resolver." / "Detectar deterioro
 *  y demostrar favorabilidad completa no exigen necesariamente la misma
 *  cobertura."
 *
 * ── El trato ASIMÉTRICO (§16 / AC30 / AC31 / AC78 / AC79) ────────────
 *
 *   pos=F + coverage=PARTIAL  → NOT_ADMISSIBLE  (F "demostrar favorabilidad
 *                               completa" exige cobertura COMPLETE — ambig. AT,
 *                               espejo de §20.1 "EFO_admissibility para F exige
 *                               required_coverage_complete")
 *   pos=D + coverage=PARTIAL  → ADMISSIBLE_WITH_LIMITATIONS  SII
 *                               (a) unidad autorizada establece el deterioro
 *                                   (evidence_basis ∈ {DIRECT, PROXY}) Y
 *                               (b) no hay contradicción DIRECT F sin resolver
 *                                   (sin flag DIRECT_GRUPO_INCONSISTENTE de 7a);
 *                               si no → NOT_ADMISSIBLE
 *   pos=I + coverage=PARTIAL  → ADMISSIBLE_WITH_LIMITATIONS  (INV-23: I no se
 *                               degrada a NOT_ADMISSIBLE por cobertura parcial sola)
 *
 * ── INV-22 / INV-77 ────────────────────────────────────────────────
 *
 * `admisibilidadFenomeno` NO tiene ninguna rama que lea `coverage_status`
 * para decidir `pos` — la cobertura insuficiente degrada admisibilidad,
 * nunca convierte la posición en I (INV-22) ni se multiplica con ella
 * (INV-77). La función devuelve `{ admissibility, flags }` — sin campo `pos`.
 *
 * ── Fuera de alcance de 7b ─────────────────────────────────────────
 *
 * "F + OPTIONAL D bloquea F" es regla de §20.1 (nivel EFO) — Fase 9. §16
 * NO la enuncia a nivel fenómeno. 7b no la aplica.
 * ═══════════════════════════════════════════════════════════════════════ */

var _POS_UTILIZABLE = { F: true, D: true, I: true };

/**
 * coberturaFenomeno(phenSpec, gruposColapsados) → {
 *   coverage_status,                       // COMPLETE | PARTIAL | NONE
 *   required_cubiertos[], required_faltantes[], optional_cubiertos[],
 *   flags
 * }
 *
 * `gruposColapsados` = salidas de colapsarGrupo (Fase 6) de este
 * fenómeno/nodo/período. Un grupo "cubre" sii está presente con
 * `pos ∈ {F, D, I}` — un grupo que colapsó a `N_A` NO cubre.
 */
function coberturaFenomeno(phenSpec, gruposColapsados) {
  var spec = phenSpec || {};
  var req = (spec.required_evidence_group_ids || []).slice();
  var opt = (spec.optional_evidence_group_ids || []).slice();
  var flags = [];

  var cubre = {};
  (gruposColapsados || []).forEach(function (g) {
    if (g && g.evidence_group_id && _POS_UTILIZABLE[g.pos]) cubre[g.evidence_group_id] = true;
  });

  var reqCub = req.filter(function (id) { return cubre[id]; });
  var reqFalt = req.filter(function (id) { return !cubre[id]; });
  var optCub = opt.filter(function (id) { return cubre[id]; });

  var coverage_status;
  if (req.length === 0) {
    flags.push('FENOMENO_SIN_REQUIRED_GROUPS');
    coverage_status = Object.keys(cubre).length > 0 ? 'COMPLETE' : 'NONE';
  } else if (reqCub.length === req.length) {
    coverage_status = 'COMPLETE';
  } else if (reqCub.length > 0) {
    coverage_status = 'PARTIAL';
  } else {
    coverage_status = 'NONE';
  }

  return {
    coverage_status: coverage_status,
    required_cubiertos: reqCub,
    required_faltantes: reqFalt,
    optional_cubiertos: optCub,
    flags: flags
  };
}

/**
 * admisibilidadFenomeno({ pos, evidence_basis, flags, coverage_status }) → {
 *   admissibility,                 // EVIDENCE_ADMISSIBILITY
 *   flags
 * }
 *
 * §16 / AC30 / AC31 / INV-22/23/77. `pos`/`evidence_basis`/`flags` vienen
 * de 7a (`resolverDirectYProxy`); `coverage_status` de `coberturaFenomeno`.
 */
function admisibilidadFenomeno(args) {
  var a = args || {};
  var pos = a.pos;
  var cov = a.coverage_status;
  var basis = a.evidence_basis;

  if (pos === 'N_A' || pos == null) {
    return { admissibility: 'NOT_ADMISSIBLE', flags: ['SIN_POSICION'] };
  }
  if (cov === 'NONE') {
    return { admissibility: 'NOT_ADMISSIBLE', flags: ['COBERTURA_NULA'] };
  }
  if (cov === 'COMPLETE') {
    return { admissibility: 'ADMISSIBLE', flags: [] };
  }

  // cobertura PARTIAL (o desconocida → se trata como PARTIAL + flag).
  var flags = [];
  if (cov !== 'PARTIAL') flags.push('COVERAGE_STATUS_DESCONOCIDO:' + String(cov));

  if (pos === 'F') {
    // Ambig. AT: F + PARTIAL nunca alcanza ADMISSIBLE (AC30 / AC78).
    return { admissibility: 'NOT_ADMISSIBLE', flags: flags.concat(['COBERTURA_REQUERIDA_INCOMPLETA_F']) };
  }
  if (pos === 'I') {
    // INV-23: I no se degrada a NOT_ADMISSIBLE por cobertura parcial sola.
    return { admissibility: 'ADMISSIBLE_WITH_LIMITATIONS', flags: flags.concat(['COBERTURA_PARCIAL']) };
  }

  // pos === 'D' — §16: admisible con parcial SII unidad autorizada + sin contradicción DIRECT F.
  var autorizada = basis === 'DIRECT' || basis === 'PROXY';
  var contradiccionF = _tieneFlag(a, 'DIRECT_GRUPO_INCONSISTENTE');
  if (autorizada && !contradiccionF) {
    return { admissibility: 'ADMISSIBLE_WITH_LIMITATIONS', flags: flags.concat(['COBERTURA_PARCIAL_D_SUFICIENTE']) }; // AC31 / AC79
  }
  return {
    admissibility: 'NOT_ADMISSIBLE',
    flags: flags.concat([contradiccionF ? 'CONTRADICCION_DIRECT_F_SIN_RESOLVER' : 'D_PARCIAL_SIN_UNIDAD_AUTORIZADA'])
  };
}

module.exports = {
  particionarPorProximidad: particionarPorProximidad,
  resolverDirectYProxy: resolverDirectYProxy,
  _colapsarSetDirect: _colapsarSetDirect,
  coberturaFenomeno: coberturaFenomeno,
  admisibilidadFenomeno: admisibilidadFenomeno
};
