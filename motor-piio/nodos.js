/**
 * motor-piio/nodos.js — Fase 10
 *
 * Nodos, alcance y agregación operacional (§22–23). NO produce un estado
 * de la cascada — da las utilidades para (a) agregar observaciones entre
 * nodos por tipo de métrica (§23) y (b) construir el `node_profile[]` y
 * decidir qué evidencia eleva la EFO organizacional (§22).
 *
 * ── §22 — SCOPE ───────────────────────────────────────────────────
 *
 *   ORGANIZATIONAL  → pertenece al universo que resuelve la EFO organizacional
 *   SEGMENT_ONLY    → resuelve el nodo; se conserva para localización;
 *                     NO eleva por sí solo la EFO organizacional (INV-47/AC47)
 *
 * "La EFO organizacional se calcula con evidencia cuyo alcance sea
 *  ORGANIZATIONAL o con una regla explícita de agregación de nodos
 *  mutuamente excluyentes. Nunca se mezclan padre e hijos si el padre ya
 *  los contiene" (INV-48/AC49).
 *
 * "PIIO entrega node_profile[]; AIE decide NODE_CONCENTRATION y
 *  POLARIZATION. PIIO no duplica esos modificadores" (INV-46/AC48).
 *
 * ── §23 — agregación por tipo de métrica ──────────────────────────
 *
 *   COUNT / QUANTITY       → SUMA (solo unidades mutuamente excluyentes)
 *   RATE / RATIO           → RECOMPUTAR desde Σnumerador / Σdenominador
 *                            (NUNCA promedio simple de tasas — INV-49/50/AC51)
 *   DURATION/INDEX/BINARY/
 *   OTHER_VALIDATED        → requiere agregador declarado (ambig. AY)
 *
 * "Promedio de tasas ≠ tasa agregada, salvo igualdad de exposición o regla
 *  explícita." Frecuencia (fuente/cálculo/agregación) se conserva
 *  (INV-51/52); anualización NO es automática (INV-53/AC53). Exposición se
 *  mantiene separada de incidencia (INV-55); aumento de exposición ≠
 *  deterioro (INV-56/AC54/55 — se preservan ambas lecturas).
 *
 * ── Contraste con el PIIO viejo ──────────────────────────────────
 *
 * `INVENTARIO_PIIO_ANTIGUO.md`: el panel anterior hacía roll-up = promedio
 * simple (`avg(valor)`) uniforme entre áreas para las 3 tasas — justo lo
 * que INV-49/50/AC51 prohíben. `agregarObservacionesNodos` implementa el
 * invariante de verdad: RATE → Σnum/Σden, nunca `mean(tasas)`.
 *
 * ── Ambigüedad AY — agregador de DURATION/INDEX/BINARY/OTHER_VALIDATED ──
 *
 * §23 exige "definir agregador operacional válido" / "método válido" pero
 * NINGÚN campo de `METRIC_DEFINITION` lo declara. Perfil de S (RULE_DEFINED)
 * / shock / lag: se DIFIERE → `agregable: false` + flag `AGREGADOR_NO_DEFINIDO`,
 * sin reabrir el contrato. `QUANTITY` (en el enum §27, no en la tabla §23)
 * → se trata como `COUNT` (suma).
 *
 * ── DECISIÓN etiquetada — roll-up de EFO_STATE entre nodos ────────
 *
 * §22 permite "regla explícita de agregación de nodos" pero el documento
 * NUNCA da una regla para agregar ESTADOS (pos/traj/pers) entre nodos —
 * solo §23 para valores de observación (antes de la cascada). PIIO calcula
 * la EFO organizacional SOLO desde evidencia `ORGANIZATIONAL`;
 * `nodosParaEFOOrganizacional` FILTRA, no mezcla estados.
 */

'use strict';

var _SCOPE = ['ORGANIZATIONAL', 'SEGMENT_ONLY'];
var _SUMA = { COUNT: 1, QUANTITY: 1 };
var _RECOMPUTAR = { RATE: 1, RATIO: 1 };

function _num(x) { return typeof x === 'number' && isFinite(x); }
function _indexar(nodeSpecs) {
  var m = {};
  (nodeSpecs || []).forEach(function (n) { if (n && n.node_id) m[n.node_id] = n; });
  return m;
}

/**
 * _cadenaAncestros(nodeId, nodesById) → [padre, abuelo, ...] (sin el propio)
 * Guarda de ciclo con set de visitados + tope duro.
 */
function _cadenaAncestros(nodeId, nodesById) {
  var cadena = [];
  var vistos = {};
  var actual = (nodesById[nodeId] || {}).parent_node_id;
  var i = 0;
  while (actual != null && i < 10000) {
    if (vistos[actual]) return cadena; // ciclo — se corta, devuelve lo acumulado
    vistos[actual] = true;
    cadena.push(actual);
    actual = (nodesById[actual] || {}).parent_node_id;
    i++;
  }
  return cadena;
}

/** nodeLevel(nodeId, nodesById) → profundidad desde la raíz (raíz = 0). Ambig. O. */
function nodeLevel(nodeId, nodesById) {
  return _cadenaAncestros(nodeId, nodesById).length;
}

function _scopeDeNodo(nodeSpec) {
  var s = (nodeSpec || {}).scope_rules || {};
  return _SCOPE.indexOf(s.scope) !== -1 ? s.scope : 'SEGMENT_ONLY';
}

/**
 * validarExclusividadNodos(nodeIds, nodeSpecs) → { ok, conflictos[], flags }
 * INV-48/AC49: ningún nodo del conjunto es ancestro de otro. Para una
 * petición de agregación ad-hoc (distinto del chequeo de
 * `aggregation_membership` declarado de Fase 1).
 */
function validarExclusividadNodos(nodeIds, nodeSpecs) {
  var ids = Array.isArray(nodeIds) ? nodeIds.slice() : [];
  var byId = _indexar(nodeSpecs);
  var enConjunto = {};
  ids.forEach(function (id) { enConjunto[id] = true; });

  var conflictos = [];
  ids.forEach(function (id) {
    _cadenaAncestros(id, byId).forEach(function (anc) {
      if (enConjunto[anc]) conflictos.push({ hijo: id, ancestro: anc });
    });
  });

  var flags = [];
  if (conflictos.length) flags.push('CONTENCION_JERARQUICA_EN_AGREGACION'); // AC49
  // ids repetidos
  if (new Set(ids).size !== ids.length) flags.push('NODOS_DUPLICADOS_EN_AGREGACION');

  return { ok: conflictos.length === 0, conflictos: conflictos, flags: flags };
}

/** _reglaAgregacion(metricType) → 'SUMA' | 'RECOMPUTAR_COMPONENTES' | 'AGREGADOR_DECLARADO' */
function _reglaAgregacion(metricType) {
  if (_SUMA[metricType]) return 'SUMA';
  if (_RECOMPUTAR[metricType]) return 'RECOMPUTAR_COMPONENTES';
  return 'AGREGADOR_DECLARADO'; // DURATION / INDEX / BINARY / OTHER_VALIDATED — ambig. AY
}

/**
 * agregarObservacionesNodos(evals, metricDef, nodeSpecs, opciones) → {
 *   kpi_id, node_id, period_start, period_end,
 *   metric_type, aggregation_rule,
 *   value, numerator?, denominator?, exposure?,
 *   source_node_ids[], agregable, flags
 * }
 *
 * `evals` = OBSERVATION_EVAL[] del MISMO kpi_id en nodos distintos.
 * NUNCA promedio simple de tasas (§23 / INV-49/50).
 */
function agregarObservacionesNodos(evals, metricDef, nodeSpecs, opciones) {
  var lista = Array.isArray(evals) ? evals : [];
  var md = metricDef || {};
  var o = opciones || {};
  var flags = [];

  var regla = _reglaAgregacion(md.metric_type);
  var out = {
    kpi_id: (lista[0] || {}).kpi_id || null,
    node_id: o.node_id_objetivo || null,
    period_start: (lista[0] || {}).period_start || null,
    period_end: (lista[0] || {}).period_end || null,
    metric_type: md.metric_type || null,
    aggregation_rule: regla,
    value: null, numerator: null, denominator: null, exposure: null,
    source_node_ids: [], agregable: false, flags: flags
  };

  // solo valores utilizables
  var util = lista.filter(function (e) {
    return e && _num(e.value) && (e.data_quality === 'VALID' || e.data_quality === 'VALID_WITH_LIMITATIONS');
  });
  var descartados = lista.length - util.length;
  if (descartados > 0) flags.push('OBSERVACIONES_NO_UTILIZABLES_DESCARTADAS:' + descartados);
  out.source_node_ids = util.map(function (e) { return e.node_id; });

  if (util.length === 0) { flags.push('SIN_OBSERVACIONES_AGREGABLES'); return out; }

  // (a) exclusividad mutua de los nodos fuente
  var excl = validarExclusividadNodos(out.source_node_ids, nodeSpecs);
  flags = flags.concat(excl.flags);
  out.flags = flags;
  if (!excl.ok) { flags.push('NO_AGREGABLE_POR_CONTENCION'); return out; } // INV-48

  // (b) frecuencia de agregación compatible (INV-51/52)
  var periodosOk = util.every(function (e) {
    return e.period_start === util[0].period_start && e.period_end === util[0].period_end;
  });
  if (o.periodosCompatibles === false || !periodosOk) {
    flags.push('FRECUENCIA_INCOMPATIBLE'); // INV-52 — tasa mensual ≠ anual
    return out;
  }

  // exposición: SIEMPRE separada de la incidencia (INV-55), nunca dentro de `value`
  var exps = util.map(function (e) { return e.exposure; }).filter(_num);
  if (exps.length === util.length) out.exposure = exps.reduce(function (a, b) { return a + b; }, 0);
  else if (exps.length > 0) flags.push('EXPOSICION_PARCIAL_NO_AGREGADA');

  if (regla === 'SUMA') {
    out.value = util.reduce(function (a, e) { return a + e.value; }, 0);
    out.numerator = out.value; // para COUNT/QUANTITY el valor ES el conteo
    out.agregable = true;
    return out;
  }

  if (regla === 'RECOMPUTAR_COMPONENTES') {
    var nums = util.map(function (e) { return e.numerator; });
    var dens = util.map(function (e) { return e.denominator; });
    if (!nums.every(_num) || !dens.every(_num)) {
      flags.push('SIN_COMPONENTES_PARA_RECOMPUTAR'); // NO se cae a promedio simple (INV-49/50)
      return out;
    }
    var sn = nums.reduce(function (a, b) { return a + b; }, 0);
    var sd = dens.reduce(function (a, b) { return a + b; }, 0);
    if (sd === 0) { flags.push('DENOMINADOR_AGREGADO_CERO'); return out; }
    out.numerator = sn; out.denominator = sd; out.value = sn / sd; // Σnum / Σden
    out.agregable = true;
    // sin anualización automática (INV-53/AC53) — se agrega en la granularidad dada
    return out;
  }

  // AGREGADOR_DECLARADO — ambig. AY
  flags.push('AGREGADOR_NO_DEFINIDO:' + md.metric_type);
  return out;
}

/**
 * lecturaDual(evalAgregado, evalsFuente) → {
 *   tasa, eventos_absolutos, exposicion_total, flags
 * }
 * INV-56 / AC54/55: "la tasa mejora pero los eventos absolutos suben por
 * crecimiento" se PRESERVA, no se confunde.
 */
function lecturaDual(evalAgregado, evalsFuente) {
  var ag = evalAgregado || {};
  var fuente = Array.isArray(evalsFuente) ? evalsFuente : [];
  var flags = [];

  var tasa = _num(ag.value) ? ag.value : null;
  var eventos;
  if (_num(ag.numerator)) eventos = ag.numerator;
  else {
    var nums = fuente.map(function (e) { return e.numerator; }).filter(_num);
    eventos = nums.length ? nums.reduce(function (a, b) { return a + b; }, 0) : null;
  }
  var expTotal = _num(ag.exposure) ? ag.exposure : null;

  if (tasa != null && eventos == null) flags.push('EVENTOS_ABSOLUTOS_NO_DISPONIBLES');
  return { tasa: tasa, eventos_absolutos: eventos, exposicion_total: expTotal, flags: flags };
}

var _CLAVES_AIE_PROHIBIDAS = ['node_concentration', 'polarization', 'concentration', 'polarizacion', 'nodo_concentracion'];

/**
 * construirNodeProfile(estadosPorNodo, nodeSpecs) → [{
 *   node_id, node_level, scope, pos, traj, pers,
 *   deterioration_present, admissibility, coverage_status
 * }]
 * §22.2 — superconjunto del elemento mínimo de 4 campos de Fase 9b.
 * NO concentration/polarization (INV-46/AC48).
 */
function construirNodeProfile(estadosPorNodo, nodeSpecs) {
  var byId = _indexar(nodeSpecs);
  return (estadosPorNodo || []).map(function (s) {
    var st = s || {};
    return {
      node_id: st.node_id || null,
      node_level: st.node_id ? nodeLevel(st.node_id, byId) : null,
      scope: _scopeDeNodo(byId[st.node_id]),
      pos: st.pos != null ? st.pos : 'N_A',
      traj: st.traj != null ? st.traj : 'N_A',
      pers: st.pers != null ? st.pers : 'N_A',
      deterioration_present: !!st.deterioration_present,
      admissibility: st.admissibility != null ? st.admissibility : null,
      coverage_status: st.coverage_status != null ? st.coverage_status : null
    };
  });
}

/** ¿un objeto trae alguna clave de modificador de AIE? (INV-46) */
function contieneModificadorAIE(obj) {
  if (!obj || typeof obj !== 'object') return false;
  return _CLAVES_AIE_PROHIBIDAS.some(function (c) { return c in obj; });
}

/**
 * nodosParaEFOOrganizacional(estadosPorNodo, nodeSpecs) → {
 *   organizacionales[], segmentOnly[], flags
 * }
 * INV-47/AC47: SEGMENT_ONLY no eleva por sí solo la EFO organizacional.
 */
function nodosParaEFOOrganizacional(estadosPorNodo, nodeSpecs) {
  var byId = _indexar(nodeSpecs);
  var org = [], seg = [];
  var flags = [];
  (estadosPorNodo || []).forEach(function (s) {
    if (!s) return;
    var sc = _scopeDeNodo(byId[s.node_id]);
    if (sc === 'ORGANIZATIONAL') org.push(s);
    else { seg.push(s); if (s.pos === 'D') flags.push('SEGMENT_ONLY_D_NO_ELEVA:' + (s.node_id || '?')); } // AC47
  });
  if (seg.length) flags.push('SEGMENT_ONLY_NO_ELEVA:' + seg.length);
  return { organizacionales: org, segmentOnly: seg, flags: flags };
}

module.exports = {
  _cadenaAncestros: _cadenaAncestros,
  nodeLevel: nodeLevel,
  validarExclusividadNodos: validarExclusividadNodos,
  _reglaAgregacion: _reglaAgregacion,
  agregarObservacionesNodos: agregarObservacionesNodos,
  lecturaDual: lecturaDual,
  construirNodeProfile: construirNodeProfile,
  contieneModificadorAIE: contieneModificadorAIE,
  nodosParaEFOOrganizacional: nodosParaEFOOrganizacional
};
