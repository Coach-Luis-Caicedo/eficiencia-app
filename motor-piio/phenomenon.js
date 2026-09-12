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
 *   7c  compatibilidad temporal / lag (§17, AC29) + orquestador   ← este archivo
 *       resolverFenomeno → PHENOMENON_STATE (§15.1, 20 campos)
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

var T = require('./temporal'); // Fase 4 — primitivas de serie (7c: resolve_temporal_properties)

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

/* ═══════════════════════════════════════════════════════════════════════
 * 7c — compatibilidad temporal (§17) + orquestador → PHENOMENON_STATE (§15.1)
 *
 * §29: por fenómeno/nodo/período → resolve_phenomenon_state (7a + §17 lag +
 * propagación J) → resolve_phenomenon_coverage_admissibility (7b) →
 * resolve_temporal_properties.
 *
 * ── §17 — compatibilidad temporal y lag ────────────────────────────
 *
 * "Antes de declarar divergencia se verifica contemporaneidad y
 *  compatibilidad temporal. COINCIDENT y LAGGED son roles observacionales.
 *  Una discrepancia compatible con expected_lag se marca
 *  TEMPORAL_LAG_COMPATIBLE y no se convierte automáticamente en
 *  contradicción." / INV-30: "Discrepancia no contemporánea no se declara
 *  contradicción automáticamente."
 *
 * `temporal_role` (COINCIDENT | LAGGED, §10) es un enum COMPUTABLE.
 * `expected_lag` (§10) es TEXTO LIBRE → ambig. AS: la magnitud NO se
 * evalúa. Reparto:
 *   - un contribuyente `temporal_role === 'LAGGED'` → señal computable de
 *     "no contemporánea" → NO se declara la divergencia automáticamente
 *     (INV-30): `pos` I por F+D → `N_A` + flag.
 *   - `expected_lag` presente → SOLO flag `LAG_NO_OPERACIONALIZADO`
 *     (documenta que la excepción TEMPORAL_LAG_COMPATIBLE *podría* aplicar
 *     pero no se pudo verificar). NO cambia `pos`. NO rescata ni suspende.
 *   - todos COINCIDENT, sin expected_lag → §15 estricto: F+D → I (AC25).
 *
 * DECISIÓN (§17 no dice qué produce "no contradicción automática"):
 * `N_A` — "no existe base válida suficiente para clasificar" cuando no se
 * puede confirmar si la divergencia es real o artefacto de lag. Consistente
 * con §30 rectora ("perder cobertura antes que inventar posición"); no se
 * degrada `I` a una lectura inventada (F / "el más reciente").
 *
 * ── Ambigüedad J — ¿qué KPI_STATE aporta traj/pers al fenómeno? ─────
 *
 * El grupo gobernante (7a `governing_group_id`) trae varios `member_states`.
 * Regla: entre los `member_states` con `pos === grupo.pos`, se elige EL PEOR
 * por orden total (traj adversa, luego pers, luego det_run desc, luego
 * kpi_id asc) y se propaga traj/pers/det_run/det_duration de ESE ÚNICO
 * estado real (coherentes entre sí — no re-colapso campo a campo).
 * Para `pos ∈ {I, N_A}` → no se toca `governing_group_id`; traj = pers = N_A.
 *
 * ── DECISIÓN — pos ∈ {I, N_A} → traj = pers = N_A ──────────────────
 *
 * NO está dictado literalmente por §11 (que scopea PERSISTENCE a "posición
 * D" pero no dice "si pos=I entonces traj=N_A"). Es una DECISIÓN de diseño,
 * apoyada en "I = evidencia indeterminada, no resolutiva": un fenómeno cuya
 * posición es indeterminada no tiene una trayectoria significativa.
 *
 * ── Ambigüedad AU — resolve_temporal_properties a nivel fenómeno ────
 *
 * §29 lo llama, pero un fenómeno no tiene serie de valor única. Decisión:
 * las primitivas de Fase 4 (`patronTemporal`/`estabilidadSerie`/`regimen`)
 * corren sobre la serie del KPI gobernante SI el orquestador la recibe en
 * `contextoGobernante`; si no → `INSUFFICIENT` + flag
 * `TEMPORALES_FENOMENO_SIN_SERIE`. Sin inventar, sin reabrir esquemas
 * (`contextoGobernante` es input opcional del orquestador).
 * ═══════════════════════════════════════════════════════════════════════ */

var _RANGO_TRAJ = { DETERIORATING: 3, STABLE: 2, IMPROVING: 1, N_A: 0 };
var _RANGO_PERS = { PERSISTENT: 3, REPEATED: 2, POINT: 1, N_A: 0 };
var _RANGO_FRESH = { STALE: 3, AGING: 2, CURRENT: 1, N_A: 0 };

/**
 * _temporalidadPermiteDivergenciaAutomatica(kpiSpecsContribuyentes) →
 *   { permite, flags }
 *
 * §17 / INV-30 / AS. `permite=false` sii algún contribuyente es LAGGED.
 * `expected_lag` presente → solo flag (no afecta `permite`).
 */
function _temporalidadPermiteDivergenciaAutomatica(kpiSpecsContribuyentes) {
  var flags = [];
  var permite = true;
  (kpiSpecsContribuyentes || []).forEach(function (ks) {
    if (!ks) return;
    if (ks.temporal_role === 'LAGGED') {
      permite = false;
      flags.push('SENAL_LAGGED_EN_DIVERGENCIA:' + (ks.kpi_id || '?')); // INV-30
    }
    if (typeof ks.expected_lag === 'string' && ks.expected_lag.trim() !== '') {
      flags.push('LAG_NO_OPERACIONALIZADO:' + (ks.kpi_id || '?')); // AS — magnitud no evaluada
    }
  });
  return { permite: permite, flags: flags };
}

/**
 * _kpiStateGobernante(grupoGobernante) → un KPI_STATE (o null)
 *
 * Ambig. J: entre los `member_states` alineados con `pos` del grupo, el peor
 * por orden total. Order-independent.
 */
function _kpiStateGobernante(grupoGobernante) {
  var g = grupoGobernante || {};
  var estados = (g.member_states || []).filter(function (s) { return s && s.pos === g.pos; });
  if (estados.length === 0) return null;
  estados = estados.slice().sort(function (a, b) {
    var t = (_RANGO_TRAJ[b.traj] || 0) - (_RANGO_TRAJ[a.traj] || 0); if (t) return t;
    var p = (_RANGO_PERS[b.pers] || 0) - (_RANGO_PERS[a.pers] || 0); if (p) return p;
    var d = (b.det_run || 0) - (a.det_run || 0); if (d) return d;
    return String(a.kpi_id || '').localeCompare(String(b.kpi_id || ''));
  });
  return estados[0];
}

/**
 * propagarTemporalidadFenomeno(pos, kpiStateGob, contextoGob) → {
 *   traj, pers, det_run, det_duration, freshness,
 *   temporal_pattern, series_stability, regime_status, flags
 * }
 */
function propagarTemporalidadFenomeno(pos, kpiStateGob, contextoGob) {
  var flags = [];
  var s = kpiStateGob || {};
  var ctx = contextoGob || {};

  var traj, pers, det_run, det_duration;
  if (pos === 'F' || pos === 'D') {
    traj = s.traj || 'N_A';
    if (pos === 'D') {
      pers = s.pers || 'N_A';
      det_run = s.det_run != null ? s.det_run : 0;
      det_duration = s.det_duration != null ? s.det_duration : null;
    } else {
      pers = 'N_A'; det_run = 0; det_duration = null; // §11 — PERSISTENCE es sobre posición D
    }
    if (!kpiStateGob) flags.push('SIN_KPI_STATE_GOBERNANTE');
  } else {
    // DECISIÓN: pos ∈ {I, N_A} → sin trayectoria/persistencia significativa.
    traj = 'N_A'; pers = 'N_A'; det_run = 0; det_duration = null;
  }

  var freshness = s.freshness || 'N_A';

  var temporal_pattern = 'INSUFFICIENT', series_stability = 'INSUFFICIENT', regime_status = null;
  var series_stability_cv = null, series_stability_origen = null;
  if (Array.isArray(ctx.serie) && ctx.serie.length > 0) {
    temporal_pattern = T.patronTemporal(ctx.serie, ctx.periods || []).valor;
    var estab = T.estabilidadSerie(ctx.serie, ctx.umbralesOrg);
    series_stability = estab.valor;
    series_stability_cv = estab.cv != null ? estab.cv : null; // REAPERTURA 12b: cv visible, no descartado
    series_stability_origen = (estab.flags || [])[0] || null; // CALIBRACION_PROPIA|GLOBAL|GENERICA
    regime_status = T.regimen(ctx.directivas || {});
  } else {
    flags.push('TEMPORALES_FENOMENO_SIN_SERIE'); // ambig. AU
  }

  return {
    traj: traj, pers: pers, det_run: det_run, det_duration: det_duration,
    freshness: freshness,
    temporal_pattern: temporal_pattern, series_stability: series_stability, regime_status: regime_status,
    series_stability_cv: series_stability_cv, series_stability_origen: series_stability_origen,
    flags: flags
  };
}

/**
 * _construirContextoGobernante(kpiId, evalsPorKpi, directivasPorKpi, hastaPeriodo)
 * → { serie[], periods[], directivas } | null
 *
 * REAPERTURA 12b (Commit B) — cierra la ambigüedad AU: antes,
 * `contextoGobernante` era un input opcional del orquestador que NUNCA se
 * cableaba (`runPIIO.js` no lo pasaba en ninguna de sus 2 llamadas) — código
 * muerto en producción. Ahora se DERIVA del `evalsPorKpi` que `runPIIO()`
 * ya construye (agrupado por kpi_id, todos los períodos), sin inventar
 * ninguna fuente de datos nueva.
 *
 * Dos reglas, mismo criterio que `kpiState.js` (línea 222) usa para la
 * serie de trayectoria del propio KPI — consistencia entre niveles:
 *   1. TRUNCA por período: solo evals con period_start <= hastaPeriodo
 *      (nunca mira el futuro — misma causalidad que Fase 5).
 *   2. FILTRA por calidad: solo data_quality válida + value numérico.
 */
function _construirContextoGobernante(kpiId, evalsPorKpi, directivasPorKpi, hastaPeriodo) {
  var evals = (evalsPorKpi && kpiId && evalsPorKpi[kpiId]) || [];
  var util = evals.filter(function (e) {
    if (!e) return false;
    if (hastaPeriodo != null && String(e.period_start) > String(hastaPeriodo)) return false; // sin fuga de futuro
    return (e.data_quality === 'VALID' || e.data_quality === 'VALID_WITH_LIMITATIONS') && typeof e.value === 'number' && isFinite(e.value);
  }).slice().sort(function (a, b) { return String(a.period_start) < String(b.period_start) ? -1 : 1; });
  return {
    serie: util.map(function (e) { return e.value; }),
    periods: util.map(function (e) { return e.period_start; }),
    directivas: (directivasPorKpi && kpiId && directivasPorKpi[kpiId]) || {}
  };
}

/**
 * resolverFenomeno(input) → PHENOMENON_STATE (§15.1 — 20 campos oficiales
 * + 2 diagnósticos aditivos de la reapertura 12b: series_stability_cv,
 * series_stability_origen)
 *
 * input = {
 *   phenSpec, gruposColapsados[],           // Fase 6 (de este fenómeno/nodo/período)
 *   kpiSpecsPorId?,                          // { kpi_id: KPI_SPEC } — para §17
 *   contextoGobernante?,                     // override manual explícito — máxima precedencia (AU)
 *   evalsPorKpi?,                            // { kpi_id: OBSERVATION_EVAL[] } — deriva contextoGobernante si no viene explícito
 *   directivasPorKpi?,                       // { kpi_id: {cambioReferencia, continuidad} }
 *   umbralesEstabilidad?,                    // { stable, moderate } — CALIBRACION_PROPIA por organización (12b)
 *   node_id?, period?
 * }
 */
function resolverFenomeno(input) {
  var inp = input || {};
  var phenSpec = inp.phenSpec || {};
  var grupos = Array.isArray(inp.gruposColapsados) ? inp.gruposColapsados : [];
  var kpiSpecs = inp.kpiSpecsPorId || {};
  var ctxGobManual = inp.contextoGobernante || null; // override explícito — máxima precedencia
  var flags = [];

  // 1 — resolve_phenomenon_state: posición DIRECT/PROXY (7a)
  var res7a = resolverDirectYProxy(grupos, phenSpec);
  var pos = res7a.pos;
  var evidence_basis = res7a.evidence_basis;
  flags = flags.concat(res7a.flags || []);

  // 2 — §17: antes de fijar I por divergencia, verificar contemporaneidad
  if (pos === 'I' && _tieneFlag(res7a, 'DIRECT_F_D_DIVERGENCIA')) {
    var contribuyentes = particionarPorProximidad(grupos).direct.filter(function (g) {
      return g && (g.pos === 'F' || g.pos === 'D');
    });
    var specsContrib = [];
    contribuyentes.forEach(function (g) {
      (g.member_kpi_ids || []).forEach(function (id) { if (kpiSpecs[id]) specsContrib.push(kpiSpecs[id]); });
    });
    var compat = _temporalidadPermiteDivergenciaAutomatica(specsContrib);
    flags = flags.concat(compat.flags);
    if (!compat.permite) {
      pos = 'N_A';
      flags.push('DIVERGENCIA_F_D_SUSPENDIDA_POR_LAG'); // AC29 / INV-30
    }
  }

  // 3 — resolve_phenomenon_coverage_admissibility (7b)
  var cob = coberturaFenomeno(phenSpec, grupos);
  var adm = admisibilidadFenomeno({
    pos: pos, evidence_basis: evidence_basis,
    flags: res7a.flags, coverage_status: cob.coverage_status
  });

  // 4 — propagación J: grupo gobernante → KPI_STATE gobernante
  var gob = null;
  for (var i = 0; i < grupos.length; i++) {
    if (grupos[i] && grupos[i].evidence_group_id === res7a.governing_group_id) { gob = grupos[i]; break; }
  }
  var kpiStateGob = gob ? _kpiStateGobernante(gob) : null;

  // REAPERTURA 12b: precedencia — override manual > derivación automática
  // (solo si HAY gobernante real; nunca se inventa una serie fantasma) >
  // comportamiento previo sin cambios (TEMPORALES_FENOMENO_SIN_SERIE).
  var ctxGob = ctxGobManual;
  if (!ctxGob && kpiStateGob && inp.evalsPorKpi) {
    ctxGob = _construirContextoGobernante(kpiStateGob.kpi_id, inp.evalsPorKpi, inp.directivasPorKpi, inp.period);
  }
  if (ctxGob && inp.umbralesEstabilidad) {
    ctxGob = Object.assign({}, ctxGob, { umbralesOrg: inp.umbralesEstabilidad });
  }

  // 5 — resolve_temporal_properties
  var temp = propagarTemporalidadFenomeno(pos, kpiStateGob, ctxGob);
  flags = flags.concat(temp.flags);

  // 6 — deterioration_present (§15.1): D directo, o I con un contribuyente D
  var huboD = grupos.some(function (g) { return g && g.pos === 'D'; });
  var deterioration_present = pos === 'D' || (pos === 'I' && huboD);

  // 7 — perfiles
  var evidence_group_profile = grupos.map(function (g) {
    return {
      evidence_group_id: g.evidence_group_id || null,
      pos: g.pos,
      evidence_proximity: g.evidence_proximity || null,
      member_kpi_ids: (g.member_kpi_ids || []).slice(),
      inconsistente: _tieneFlag(g, 'INTERNAL_INCONSISTENCY')
    };
  });
  var metric_definition_versions = [];
  grupos.forEach(function (g) {
    (g.member_states || []).forEach(function (s) {
      var v = s && s.metric_definition_version;
      if (v != null && metric_definition_versions.indexOf(v) === -1) metric_definition_versions.push(v);
    });
  });

  return {
    phenomenon_state_id: (phenSpec.phenomenon_id || 'ph?') + '|' + (inp.node_id || '?') + '|' + (inp.period || '?'),
    phenomenon_id: phenSpec.phenomenon_id || null,
    node_id: inp.node_id || null,
    period: inp.period || null,
    pos: pos,
    traj: temp.traj,
    pers: temp.pers,
    det_run: temp.det_run,
    det_duration: temp.det_duration,
    admissibility: adm.admissibility,
    freshness: temp.freshness,
    coverage_status: cob.coverage_status,
    evidence_basis: evidence_basis,
    evidence_group_profile: evidence_group_profile,
    metric_definition_versions: metric_definition_versions,
    temporal_pattern: temp.temporal_pattern,
    series_stability: temp.series_stability,
    // REAPERTURA 12b (aditivo — §15.1 sigue teniendo sus 20 campos
    // oficiales, validarPhenomenonState no cambia): cv y origen de la
    // calibración de series_stability, antes descartados por el llamador.
    series_stability_cv: temp.series_stability_cv,
    series_stability_origen: temp.series_stability_origen,
    regime_status: temp.regime_status,
    deterioration_present: deterioration_present,
    flags: flags.concat(cob.flags, adm.flags)
  };
}

var _POSICION = ['F', 'I', 'D', 'N_A'];
var _ADMIS = ['ADMISSIBLE', 'ADMISSIBLE_WITH_LIMITATIONS', 'NOT_ADMISSIBLE'];
var _COVERAGE = ['COMPLETE', 'PARTIAL', 'NONE'];
var _CAMPOS_PHENOMENON_STATE = [
  'phenomenon_state_id', 'phenomenon_id', 'node_id', 'period', 'pos', 'traj', 'pers',
  'det_run', 'det_duration', 'admissibility', 'freshness', 'coverage_status', 'evidence_basis',
  'evidence_group_profile', 'metric_definition_versions', 'temporal_pattern', 'series_stability',
  'regime_status', 'deterioration_present', 'flags'
];

/**
 * validarPhenomenonState(state) → { ok, errores[] } — chequeo de forma ligero
 * (§15.1, 20 campos). Patrón `validarFPVOutput`.
 */
function validarPhenomenonState(state) {
  var errores = [];
  if (state === null || typeof state !== 'object' || Array.isArray(state)) {
    return { ok: false, errores: ['no es un objeto'] };
  }
  _CAMPOS_PHENOMENON_STATE.forEach(function (k) {
    if (!(k in state)) errores.push('falta el campo ' + k);
  });
  if (_POSICION.indexOf(state.pos) === -1) errores.push('pos inválida: ' + state.pos);
  if (_ADMIS.indexOf(state.admissibility) === -1) errores.push('admissibility inválida: ' + state.admissibility);
  if (_COVERAGE.indexOf(state.coverage_status) === -1) errores.push('coverage_status inválido: ' + state.coverage_status);
  if (['DIRECT', 'PROXY', 'NONE'].indexOf(state.evidence_basis) === -1) errores.push('evidence_basis inválido: ' + state.evidence_basis);
  if (!Array.isArray(state.evidence_group_profile)) errores.push('evidence_group_profile no es array');
  if (!Array.isArray(state.metric_definition_versions)) errores.push('metric_definition_versions no es array');
  if (!Array.isArray(state.flags)) errores.push('flags no es array');
  if (typeof state.deterioration_present !== 'boolean') errores.push('deterioration_present no es boolean');
  return { ok: errores.length === 0, errores: errores };
}

module.exports = {
  particionarPorProximidad: particionarPorProximidad,
  resolverDirectYProxy: resolverDirectYProxy,
  _colapsarSetDirect: _colapsarSetDirect,
  coberturaFenomeno: coberturaFenomeno,
  admisibilidadFenomeno: admisibilidadFenomeno,
  _temporalidadPermiteDivergenciaAutomatica: _temporalidadPermiteDivergenciaAutomatica,
  _kpiStateGobernante: _kpiStateGobernante,
  propagarTemporalidadFenomeno: propagarTemporalidadFenomeno,
  _construirContextoGobernante: _construirContextoGobernante,
  resolverFenomeno: resolverFenomeno,
  validarPhenomenonState: validarPhenomenonState
};
