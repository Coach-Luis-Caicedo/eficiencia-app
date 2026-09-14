/**
 * motor-piio/kpiState.js — Fase 5
 *
 * Primer NIVEL de la cascada que produce un STATE (§10 KPI_STATE). Integra
 * las salidas de Fase 2 (OBSERVATION_EVAL), Fase 3 (referencia vigente +
 * directivas de cambio) y Fase 4 (primitivas temporales) — §29
 * `resolve_kpi_state`.
 *
 * ── Contrato de interfaz — campos consumidos, con su nombre de origen ──
 *
 *   de Fase 2 (OBSERVATION_EVAL):
 *     .original_value  → KPI_STATE.original_value    (mismo nombre)
 *     .value           → clasificación de pos/traj
 *     .data_quality    → KPI_STATE.data_quality; MISSING/INVALID → pos=N_A (INV-01/02)
 *     .node_id, .period_start, .period_end, .flags   (idénticos)
 *   de Fase 3:
 *     resolverReferenciaVigente(...).ref / .admissibility / .flags
 *     .ref.version     → KPI_STATE.{condition,temporal}_reference_version
 *     evaluarCambioReferencia(...).tipo  ┐  se pasan LITERALES a
 *     continuidadDefinicion(...).modo    ┘  regimen({cambioReferencia,continuidad})
 *     continuidadDefinicion(...).puede_unir_serie  → traj=N_A si false (INV-29)
 *   de Fase 4:
 *     freshness / continuidadRun / regimen / magnitudCambio /
 *     historiaSuficiente / edadEnPeriodos
 *   de Fase 0:
 *     metricDef.definition_version  → KPI_STATE.metric_definition_version
 *       ── RENOMBRE de esquema: §7 lo llama `definition_version`, §10 lo
 *          llama `metric_definition_version`. NO es un campo inventado.
 *
 * ── Ambigüedad AM ────────────────────────────────────────────────────
 *
 * `OBSERVATION_EVAL` (Fase 2) NO conserva `observed_at` (§9 lo tiene; la
 * ingesta lo dejó fuera). Para `freshness`, Fase 5 usa `period_end` como
 * ancla — la edad de lo que el dato REPRESENTA, no de cuándo se registró.
 * Es la lectura correcta para "¿sigue vigente esta observación?". El
 * `observed_at` para trazabilidad lo tiene Fase 11 desde el input crudo.
 * DECISIÓN, sin reabrir Fase 2.
 *
 * ── Cierra ambigüedades diferidas ───────────────────────────────────
 *
 *   P  — KPI degradado en Fase 1 → pos=N_A, admissibility=NOT_ADMISSIBLE.
 *   H  — det_run/det_duration: se computan en Fase 4, se consumen aquí.
 *   AD — método temporal → traj: magnitudCambio con TEMPORAL_METHOD_DEFAULT.
 *   AI/AJ — sin calibrar → N_A/REPEATED + flag, nunca lectura favorable (§30).
 *   AK — `as_of` opcional; sin él → max(period_end) de las observaciones.
 *   AL — KPI_STATE.admissibility usa EVIDENCE_ADMISSIBILITY (§8.2/§27).
 */

'use strict';

var mod = require('./enums');
var PARAMS = mod.PARAMS;
var referencias = require('./referencias');
var temporal = require('./temporal');

function esNum(v) { return typeof v === 'number' && isFinite(v); }
function esValida(dq) { return dq === 'VALID' || dq === 'VALID_WITH_LIMITATIONS'; }

// ═════════════════════════════════════════════════════════════════════
// §11 — POSICIÓN: value contra REF_COND admisible + directionality.
// ═════════════════════════════════════════════════════════════════════
function _distanciaAlRango(v, lower, upper) {
  return v < lower ? (lower - v) : (v > upper ? (v - upper) : 0);
}

function clasificarPosicion(value, refCond, directionality) {
  if (!refCond || typeof refCond !== 'object') return { pos: 'N_A', flags: ['SIN_REF_COND_ADMISIBLE'] }; // AC02
  if (!esNum(value)) return { pos: 'N_A', flags: ['VALOR_NO_NUMERICO'] };
  if (!esNum(refCond.threshold)) return { pos: 'N_A', flags: ['REF_COND_SIN_THRESHOLD'] };

  var t = refCond.threshold;
  var band = esNum(refCond.band) ? refCond.band : 0;

  if (directionality === 'HIGHER_IS_WORSE') {
    if (value > t + band) return { pos: 'D', flags: [] };
    if (value < t - band) return { pos: 'F', flags: [] };
    return { pos: 'I', flags: [] };
  }
  if (directionality === 'LOWER_IS_WORSE') {
    if (value < t - band) return { pos: 'D', flags: [] };
    if (value > t + band) return { pos: 'F', flags: [] };
    return { pos: 'I', flags: [] };
  }
  if (directionality === 'TARGET_RANGE') {
    var u = refCond.threshold_upper;
    if (!esNum(u)) return { pos: 'N_A', flags: ['TARGET_RANGE_SIN_LIMITE_SUPERIOR'] }; // AC07
    if (value < t - band) return { pos: 'D', flags: ['TARGET_RANGE_BELOW'] };
    if (value > u + band) return { pos: 'D', flags: ['TARGET_RANGE_ABOVE'] };
    return { pos: 'F', flags: [] };
  }
  return { pos: 'N_A', flags: ['DIRECTIONALITY_DESCONOCIDA:' + directionality] };
}

// ═════════════════════════════════════════════════════════════════════
// §11.2 — TRAYECTORIA: magnitud de cambio RELATIVA contra TRAJ_STABLE_BAND.
//
// REAPERTURA (Fase 5, DISENO_TRAJ_STABLE_BAND_PERS.md §2/§6): antes, `mag`
// se comparaba CRUDA (unidades absolutas del KPI) contra `band` — un band
// único no tiene sentido entre KPIs de escalas distintas. Ahora se compara
// `mag / |base|` — % de cambio relativo al valor anterior (HIGHER_IS_WORSE/
// LOWER_IS_WORSE) o al ANCHO del rango, `upper - threshold` (TARGET_RANGE —
// ya lo conoce REFERENCE_SPEC, no se fabrica una tercera forma). `base=0`
// (o indeterminada) → N_A, mismo tratamiento que _cv() con media=0
// (temporal.js). Precedencia de 3 niveles idéntica a estabilidadSerie:
// CALIBRACION_PROPIA (`umbralesOrg.band`) > CALIBRACION_GLOBAL
// (`PARAMS.TRAJ_STABLE_BAND`) > CALIBRACION_GENERICA
// (`PARAMS.TRAJ_STABLE_BAND_GENERICO`) — ya no existe "no calibrado": el
// genérico siempre tiene valor, mismo cambio de postura que tuvo
// estabilidadSerie en la reapertura 12b.
// ═════════════════════════════════════════════════════════════════════
function resolverTrayectoria(serieValores, refTempRes, directivas, directionality, refCond, umbralesOrg) {
  if (!temporal.historiaSuficiente(serieValores)) return { traj: 'N_A', flags: ['HISTORIA_INSUFICIENTE'] }; // INV-26
  if (!refTempRes || !refTempRes.ref || refTempRes.admissibility === 'NOT_ADMISSIBLE') {
    return { traj: 'N_A', flags: ['REF_TEMP_NO_ADMISIBLE'] };
  }
  if (temporal.regimen(directivas || {}) === 'NEW_REGIME') return { traj: 'N_A', flags: ['NEW_REGIME'] }; // INV-28 / AC13
  if (directivas && directivas.continuidad && directivas.continuidad.puede_unir_serie === false) {
    return { traj: 'N_A', flags: ['SERIE_NO_UNE'] }; // INV-29 / AC16
  }

  var mag, base;
  if (directionality === 'TARGET_RANGE') {
    var lo = refCond && refCond.threshold, up = refCond && refCond.threshold_upper;
    if (!esNum(lo) || !esNum(up)) return { traj: 'N_A', flags: ['TARGET_RANGE_SIN_LIMITES'] };
    mag = temporal.magnitudCambio(serieValores.map(function (v) { return _distanciaAlRango(v, lo, up); }));
    base = up - lo; // ancho del rango — REFERENCE_SPEC ya lo conoce (ambig. AI, TARGET_RANGE)
  } else {
    mag = temporal.magnitudCambio(serieValores);
    base = temporal.valorAnteriorDelta(serieValores);
  }
  if (mag === null) return { traj: 'N_A', flags: ['MAGNITUD_NULA'] };
  if (!esNum(base) || base === 0) return { traj: 'N_A', flags: ['BASE_CERO_TRAYECTORIA_INDEFINIDA'] }; // mismo tratamiento que _cv() con media=0
  var relativo = mag / Math.abs(base);

  var uo = umbralesOrg || {};
  var band, origenBand;
  if (esNum(uo.band)) { band = uo.band; origenBand = 'CALIBRACION_PROPIA'; }
  else if (esNum(PARAMS.TRAJ_STABLE_BAND)) { band = PARAMS.TRAJ_STABLE_BAND; origenBand = 'CALIBRACION_GLOBAL'; }
  else { band = PARAMS.TRAJ_STABLE_BAND_GENERICO; origenBand = 'CALIBRACION_GENERICA'; }

  // TARGET_RANGE comparte forma con HIGHER_IS_WORSE: "más" siempre es peor
  // (distancia al rango que crece = tan malo como un valor que empeora) —
  // mismos signos que el early-return original de TARGET_RANGE tenía.
  var peor, mejor;
  if (directionality === 'HIGHER_IS_WORSE' || directionality === 'TARGET_RANGE') {
    peor = relativo > band; mejor = relativo < -band;
  } else {
    peor = relativo < -band; mejor = relativo > band;
  }
  if (peor) return { traj: 'DETERIORATING', flags: [origenBand] };
  if (mejor) return { traj: 'IMPROVING', flags: [origenBand] };
  return { traj: 'STABLE', flags: [origenBand] };
}

// ═════════════════════════════════════════════════════════════════════
// §11.3 / §28 — PERSISTENCIA sobre det_run (solo si pos actual = D).
//
// REAPERTURA (Fase 5, DISENO_TRAJ_STABLE_BAND_PERS.md §5/§6): precedencia
// de 3 niveles idéntica a estabilidadSerie — CALIBRACION_PROPIA
// (`opciones.umbralesOrg.{repeatedMin,persistentMin}`) > CALIBRACION_GLOBAL
// (`PARAMS.PERS_REPEATED_MIN`/`_PERSISTENT_MIN`) > CALIBRACION_GENERICA
// (`PARAMS.PERS_REPEATED_MIN_GENERICO`/`_PERSISTENT_MIN_GENERICO`). Ya no
// existe "no calibrado": el genérico siempre distingue POINT/REPEATED/
// PERSISTENT. `opciones` se reusa — ya traía `.maxGap` para
// `continuidadRun`; ahora también puede traer `.umbralesOrg`.
// ═════════════════════════════════════════════════════════════════════
function clasificarPersistencia(pos, secuenciaPos, periods, opciones) {
  if (pos !== 'D') return { pers: 'N_A', det_run: 0, det_duration: 0, flags: [] }; // §28: current pos≠D → pers=N_A

  var cr = temporal.continuidadRun(secuenciaPos, periods, opciones);
  var flags = cr.flags.slice();

  var uo = (opciones && opciones.umbralesOrg) || {};
  var repMin, perMin, origenPers;
  if (esNum(uo.repeatedMin) && esNum(uo.persistentMin)) {
    repMin = uo.repeatedMin; perMin = uo.persistentMin; origenPers = 'CALIBRACION_PROPIA';
  } else if (esNum(PARAMS.PERS_REPEATED_MIN) && esNum(PARAMS.PERS_PERSISTENT_MIN)) {
    repMin = PARAMS.PERS_REPEATED_MIN; perMin = PARAMS.PERS_PERSISTENT_MIN; origenPers = 'CALIBRACION_GLOBAL';
  } else {
    repMin = PARAMS.PERS_REPEATED_MIN_GENERICO; perMin = PARAMS.PERS_PERSISTENT_MIN_GENERICO; origenPers = 'CALIBRACION_GENERICA';
  }
  flags.push(origenPers);

  var pers = cr.det_run < repMin ? 'POINT' : (cr.det_run < perMin ? 'REPEATED' : 'PERSISTENT');
  return { pers: pers, det_run: cr.det_run, det_duration: cr.det_duration, flags: flags };
}

// ═════════════════════════════════════════════════════════════════════
// §10 / INV-78 — ADMISIBILIDAD del KPI_STATE (dimensión separada de la
// magnitud). EVIDENCE_ADMISSIBILITY (ambig. AL).
// ═════════════════════════════════════════════════════════════════════
function resolverAdmisibilidad(dataQuality, refCondRes, freshnessStatus) {
  if (dataQuality === 'MISSING' || dataQuality === 'INVALID') return 'NOT_ADMISSIBLE'; // INV-01
  if (!refCondRes || !refCondRes.ref || refCondRes.admissibility === 'NOT_ADMISSIBLE') return 'NOT_ADMISSIBLE'; // AC02
  if (freshnessStatus === 'STALE') return 'NOT_ADMISSIBLE'; // AC18 — no para nueva inferencia
  if (dataQuality === 'VALID_WITH_LIMITATIONS' ||
      refCondRes.admissibility === 'ADMISSIBLE_WITH_LIMITATIONS' ||
      freshnessStatus === 'AGING') {
    return 'ADMISSIBLE_WITH_LIMITATIONS';
  }
  return 'ADMISSIBLE';
}

// ═════════════════════════════════════════════════════════════════════
// §29 resolve_kpi_state — encadena todo sobre la SERIE de un (kpi, node).
//
// resolverKpiState({ evals, kpiSpec, metricDef, referencias, directivas,
//                    reporteFase1?, as_of?, opciones? }) → {
//   estados: KPI_STATE[],       // uno por período, en orden cronológico
//   bloqueado: boolean,         // AC73 — KPI en estados_bloqueados de Fase 1
//   flags: string[]
// }
//
// opciones? = { continuidadRun?, umbralesTrayectoria?, umbralesPersistencia? }
//   continuidadRun         → pasado tal cual a clasificarPersistencia/
//                            continuidadRun (ya existía — `.maxGap`).
//   umbralesTrayectoria    → { band } — CALIBRACION_PROPIA por organización
//                            para resolverTrayectoria (DISENO_TRAJ_STABLE_
//                            BAND_PERS.md §6). Mismo mecanismo real que
//                            PIIO_INPUT.umbralesEstabilidad (phenomenon.js).
//   umbralesPersistencia   → { repeatedMin, persistentMin } — ídem, para
//                            clasificarPersistencia (opciones.umbralesOrg).
// ═════════════════════════════════════════════════════════════════════
function resolverKpiState(args) {
  var evals = Array.isArray(args.evals) ? args.evals.slice() : [];
  var kpiSpec = args.kpiSpec || {};
  var metricDef = args.metricDef || null;
  var refs = Array.isArray(args.referencias) ? args.referencias : [];
  var directivas = args.directivas || {};
  var rep = args.reporteFase1 || {};
  var opciones = args.opciones || {};

  var kpi_id = kpiSpec.kpi_id;
  var degradado = Array.isArray(rep.kpis_degradados) && rep.kpis_degradados.indexOf(kpi_id) !== -1;
  var bloqueado = Array.isArray(rep.estados_bloqueados) && rep.estados_bloqueados.indexOf(kpi_id) !== -1;
  if (bloqueado) {
    return { estados: [], bloqueado: true, flags: ['ESTADO_BLOQUEADO_FASE1'] }; // AC73
  }

  evals.sort(function (a, b) { return String(a.period_start) < String(b.period_start) ? -1 : 1; });

  var ahora = args.as_of;
  if (!ahora) {
    evals.forEach(function (e) { if (!ahora || String(e.period_end) > String(ahora)) ahora = e.period_end; });
  }

  var directionality = metricDef ? metricDef.directionality : null;
  var mdVer = metricDef ? metricDef.definition_version : null; // → metric_definition_version

  var secuenciaPos = [], periodos = [], estados = [];

  for (var i = 0; i < evals.length; i++) {
    var ev = evals[i];
    var period = ev.period_start;
    var valida = esValida(ev.data_quality);

    var refCondRes = referencias.resolverReferenciaVigente(refs, kpiSpec.condition_reference_id, 'CONDITION', period);
    var refTempRes = referencias.resolverReferenciaVigente(refs, kpiSpec.temporal_reference_id, 'TEMPORAL', period);

    // ── pos ──
    var pos, posFlags;
    if (degradado) { pos = 'N_A'; posFlags = ['KPI_DEGRADADO_FASE1']; }         // P
    else if (!valida) { pos = 'N_A'; posFlags = ['DATO_NO_VALIDO:' + ev.data_quality]; } // INV-01/02
    else { var cp = clasificarPosicion(ev.value, refCondRes.ref, directionality); pos = cp.pos; posFlags = cp.flags; }

    secuenciaPos.push(pos);
    periodos.push(period);

    // ── traj ── (serie de valores válidos hasta e incluyendo i)
    var serieHasta = evals.slice(0, i + 1).filter(function (e) { return esValida(e.data_quality) && esNum(e.value); }).map(function (e) { return e.value; });
    var traj, trajFlags;
    if (degradado) { traj = 'N_A'; trajFlags = ['KPI_DEGRADADO_FASE1']; }
    else if (!valida) { traj = 'N_A'; trajFlags = ['SIN_VALOR_ACTUAL']; }
    else { var ct = resolverTrayectoria(serieHasta, refTempRes, directivas, directionality, refCondRes.ref, opciones.umbralesTrayectoria); traj = ct.traj; trajFlags = ct.flags; }

    // ── pers / det_run / det_duration ──
    var opcionesPersistencia = Object.assign({}, opciones.continuidadRun, { umbralesOrg: opciones.umbralesPersistencia });
    var cper = clasificarPersistencia(pos, secuenciaPos.slice(), periodos.slice(), opcionesPersistencia);

    // ── freshness (ambig. AM: ancla = period_end) ──
    var age = temporal.edadEnPeriodos(ev.period_end, ahora);
    var freshnessStatus = temporal.freshness(age, kpiSpec.freshness_spec);

    // ── admissibility ──
    var admissibility = degradado ? 'NOT_ADMISSIBLE' : resolverAdmisibilidad(ev.data_quality, refCondRes, freshnessStatus);

    estados.push({
      kpi_state_id: kpi_id + '@' + ev.node_id + '@' + period,
      kpi_id: kpi_id,
      node_id: ev.node_id,
      period: period,
      original_value: ev.original_value,
      pos: pos,
      traj: traj,
      pers: cper.pers,
      det_run: cper.det_run,
      det_duration: cper.det_duration,
      admissibility: admissibility,
      freshness: freshnessStatus,
      data_quality: ev.data_quality,
      condition_reference_version: refCondRes.ref ? refCondRes.ref.version : null,
      temporal_reference_version: refTempRes.ref ? refTempRes.ref.version : null,
      metric_definition_version: mdVer,
      flags: [].concat(ev.flags || [], posFlags, trajFlags, cper.flags, refCondRes.flags || [], refTempRes.flags || [])
    });
  }

  return { estados: estados, bloqueado: false, flags: degradado ? ['KPI_DEGRADADO_FASE1'] : [] };
}

module.exports = {
  clasificarPosicion: clasificarPosicion,
  resolverTrayectoria: resolverTrayectoria,
  clasificarPersistencia: clasificarPersistencia,
  resolverAdmisibilidad: resolverAdmisibilidad,
  resolverKpiState: resolverKpiState
};
