/**
 * motor-piio/referencias.js — Fase 3
 *
 * Referencias de condición y tiempo (§8). Fase 3 RESUELVE la referencia
 * vigente por período y produce las directivas de cambio; NO clasifica
 * pos/traj (Fase 5) ni re-versiona estados históricos (Fase 11).
 *
 * §8: REF_COND ≠ REF_TEMP (INV-PIIO-08). REF_COND clasifica posición,
 * REF_TEMP evalúa cambio. Una organización puede ser estable y estar
 * deteriorada.
 *
 * §8.1: "Las referencias se seleccionan; no se promedian" (INV-PIIO-09).
 * Se garantiza estructuralmente: `resolverReferenciaVigente` devuelve
 * EXACTAMENTE UNA referencia (la misma instancia del input) o `null` —
 * nunca una combinada/sintetizada.
 *
 * ── Ambigüedad W (no promediar, sin alternativa) ────────────────────
 *
 * §8.1 prohíbe promediar pero NO dice cómo elegir cuando hay varias
 * candidatas. Con un solo `condition_reference_id`/`temporal_reference_id`
 * por KPI_SPEC, la única multiplicidad posible: varias VERSIONES del mismo
 * `reference_id` con ventanas de vigencia que se solapan para un período.
 *
 * DECISIÓN DE DISEÑO: ventanas solapadas = inconsistencia de config →
 * `NOT_ADMISSIBLE` para ese período + flag `REFERENCIA_VERSIONES_SOLAPADAS`.
 * NO "la más reciente gana" silenciosa (§30: "perder cobertura antes que
 * inventar posición").
 *
 * ── Reapertura de Fase 0 (ambigüedades X, Y) ────────────────────────
 *
 * `REFERENCE_SPEC` ganó `admissibility_declared` (obligatorio),
 * `critical_failure?`, `change_mode?`/`supersedes?`. `METRIC_DEFINITION`
 * ganó `bridge_rule?`. Ver la tabla de Reaperturas del README (commit
 * `fa0a467`).
 */

'use strict';

function esStringNoVacio(v) { return typeof v === 'string' && v.trim().length > 0; }

/**
 * _vigente(refSpec, period) — ¿la ventana de vigencia contiene `period`?
 * Comparación lexicográfica de fechas ISO (mismo formato). `valid_to`
 * ausente = ventana abierta.
 */
function _vigente(refSpec, period) {
  if (!esStringNoVacio(refSpec.valid_from) || !esStringNoVacio(period)) return false;
  if (period < refSpec.valid_from) return false;
  if (esStringNoVacio(refSpec.valid_to) && period > refSpec.valid_to) return false;
  return true;
}

/**
 * admisibilidadReferencia(refSpec) → EVIDENCE_ADMISSIBILITY
 *
 * §8.2: la vigencia la chequea `resolverReferenciaVigente` (mecánica); las
 * otras 4 dimensiones (pertinencia, comparabilidad, trazabilidad,
 * estabilidad) las declaró el analista en `admissibility_declared`. Un
 * `critical_failure` presente fuerza `NOT_ADMISSIBLE` (§8.2: "un fallo
 * crítico impide usarla").
 */
function admisibilidadReferencia(refSpec) {
  if (!refSpec || typeof refSpec !== 'object') return 'NOT_ADMISSIBLE';
  if (esStringNoVacio(refSpec.critical_failure)) return 'NOT_ADMISSIBLE';
  return refSpec.admissibility_declared || 'NOT_ADMISSIBLE';
}

/**
 * resolverReferenciaVigente(references, reference_id, role, period) → {
 *   ref: REFERENCE_SPEC | null,   // EXACTAMENTE una instancia del input, o null
 *   admissibility: EVIDENCE_ADMISSIBILITY,
 *   flags: string[]
 * }
 *
 * `role` ∈ {'CONDITION','TEMPORAL'} (INV-PIIO-08 — no se cruzan).
 */
function resolverReferenciaVigente(references, reference_id, role, period) {
  var arr = Array.isArray(references) ? references : [];
  var mismoIdRol = arr.filter(function (r) {
    return r && r.reference_id === reference_id && r.reference_role === role;
  });

  if (mismoIdRol.length === 0) {
    return { ref: null, admissibility: 'NOT_ADMISSIBLE', flags: ['REFERENCIA_NO_ENCONTRADA'] };
  }

  var aplicables = mismoIdRol.filter(function (r) { return _vigente(r, period); });

  if (aplicables.length === 0) {
    return { ref: null, admissibility: 'NOT_ADMISSIBLE', flags: ['FUERA_DE_VIGENCIA'] };
  }
  if (aplicables.length > 1) {
    // ambigüedad W — no se elige silenciosamente
    var versiones = aplicables.map(function (r) { return r.version; }).join(',');
    return {
      ref: null, admissibility: 'NOT_ADMISSIBLE',
      flags: ['REFERENCIA_VERSIONES_SOLAPADAS:' + versiones]
    };
  }

  var ref = aplicables[0];
  return { ref: ref, admissibility: admisibilidadReferencia(ref), flags: [] };
}

/**
 * evaluarCambioReferencia(refNueva) → {
 *   tipo: 'SIN_CAMBIO' | 'REBASE_HISTORY' | 'START_NEW_REGIME',
 *   supersedes?: string,
 *   directiva: string   // qué debe hacer aguas abajo (Fase 5 / Fase 11)
 * }
 *
 * §8.3. Fase 3 SOLO emite la directiva — no ejecuta el rebase ni rompe la
 * serie. INV-PIIO-28: un cambio de referencia no equivale a un cambio
 * operacional; la directiva es lo que impide que Fase 5 lo lea como
 * deterioro/mejora.
 */
function evaluarCambioReferencia(refNueva) {
  if (!refNueva || typeof refNueva !== 'object' || !esStringNoVacio(refNueva.change_mode)) {
    return { tipo: 'SIN_CAMBIO', directiva: 'ninguna' };
  }
  if (refNueva.change_mode === 'REBASE_HISTORY') {
    return {
      tipo: 'REBASE_HISTORY', supersedes: refNueva.supersedes,
      directiva: 'Fase 11 re-versiona los estados históricos contra esta referencia; NO sobrescribe versiones anteriores (§31). INV-28: no es un cambio operacional.'
    };
  }
  if (refNueva.change_mode === 'START_NEW_REGIME') {
    return {
      tipo: 'START_NEW_REGIME', supersedes: refNueva.supersedes,
      directiva: 'Fase 5 NO calcula traj a través del cambio (regímenes no comparables). INV-28: el salto aparente no es deterioro/mejora.'
    };
  }
  return { tipo: 'SIN_CAMBIO', directiva: 'change_mode no reconocido: ' + refNueva.change_mode };
}

/**
 * continuidadDefinicion(metricDef) → {
 *   modo: 'CONTINUOUS' | 'BRIDGED' | 'NEW_SERIES',
 *   puede_unir_serie: boolean,
 *   flags: string[]
 * }
 *
 * §8.4 / AC14/15/16 / INV-PIIO-29. `BRIDGED` sin `bridge_rule` → se trata
 * como `NEW_SERIES` (AC15: "solo unir con bridge validado"). `NEW_SERIES`
 * impide calcular trayectoria a través de la ruptura.
 */
function continuidadDefinicion(metricDef) {
  var cm = metricDef && metricDef.continuity_mode;
  if (cm === 'CONTINUOUS') {
    return { modo: 'CONTINUOUS', puede_unir_serie: true, flags: [] };
  }
  if (cm === 'BRIDGED') {
    if (esStringNoVacio(metricDef.bridge_rule)) {
      return { modo: 'BRIDGED', puede_unir_serie: true, flags: [] };
    }
    return { modo: 'NEW_SERIES', puede_unir_serie: false, flags: ['BRIDGE_SIN_REGLA'] };
  }
  // NEW_SERIES (o cualquier otra cosa — el contrato ya restringe el enum)
  return { modo: 'NEW_SERIES', puede_unir_serie: false, flags: [] };
}

module.exports = {
  resolverReferenciaVigente: resolverReferenciaVigente,
  admisibilidadReferencia: admisibilidadReferencia,
  evaluarCambioReferencia: evaluarCambioReferencia,
  continuidadDefinicion: continuidadDefinicion
};
