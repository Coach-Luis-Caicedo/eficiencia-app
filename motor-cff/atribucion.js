/**
 * motor-cff/atribucion.js — Fase 2
 *
 * Motor determinista de atribución (§11) + profundización y genealogía
 * probatoria (§12). NO resuelve monetización (Fase 1), NO resuelve
 * relaciones/dedup (Fase 3), NO consolida (Fase 4b).
 *
 * ── §11 — las 6 dimensiones y las 3 categorías ───────────────────────────
 *
 * clasificarAtribucion(dimensiones) NO usa porcentajes, scores ponderados
 * ni coeficientes de atribución (§11, literal) — es una tabla de decisión
 * sobre 6 valores categóricos, evaluada en orden estricto:
 * CONFIRMED → SUPPORTED → UNRESOLVED (catch-all). El orden es una decisión
 * explícita de la función, verificada por prueba de mutación (invertir el
 * orden y confirmar que el caso de solapamiento se rompe), no un efecto
 * colateral de cómo quedó escrito el código.
 *
 * CONFIRMED (§11.1) — texto preciso del documento, sin interpretación:
 *   operational_correspondence=YES Y temporal_correspondence=COMPATIBLE Y
 *   organizational_correspondence=MATCH Y operational_evidence=DIRECT Y
 *   alternative_explanation=NONE_DOMINANT. system_convergence NO se exige
 *   en ningún valor particular (§11.1, literal: "puede fortalecer, pero no
 *   es obligatoria cuando la trazabilidad operacional específica ya es
 *   suficiente").
 *
 * SUPPORTED (§11.2) — texto cualitativo; 3 operacionalizaciones acordadas
 * explícitamente con Luis, documentadas también en README:
 *   1. "Correspondencias compatibles" = ninguna de las tres en su valor
 *      NEGATIVO explícito (NO / INCOMPATIBLE / MISMATCH). UNCLEAR SÍ se
 *      admite aquí — a diferencia de CONFIRMED, que exige el positivo
 *      exacto. Es la lectura que deja espacio real entre las dos
 *      categorías en más de un eje.
 *   2. "Convergencia independiente cuando sea necesaria" = CONVERGENT
 *      exigido si operational_evidence=INDIRECT **O** si CUALQUIERA de
 *      las tres correspondencias es UNCLEAR **O** si
 *      alternative_explanation=UNKNOWN — no solo atado al tipo de
 *      evidencia. Decisión interpretativa deliberadamente conservadora:
 *      el documento (§25) declara su sesgo explícito — "ante evidencia
 *      insuficiente, CFF debe perder cobertura antes que inventar valor"
 *      — y entre lecturas compatibles con la letra de "cuando sea
 *      necesaria", esta es la que cae del lado conservador de esa
 *      declaración. La lectura descartada (convergencia atada solo al
 *      tipo de evidencia) permitía que evidencia DIRECT compensara una
 *      correspondencia genuinamente incierta (UNCLEAR) sin ninguna
 *      corroboración adicional. UNKNOWN se sumó a la misma regla en una
 *      segunda revisión (no en la primera versión de esta fase): es el
 *      mismo estado de "no lo sabemos" que UNCLEAR — alternative_
 *      explanation=UNKNOWN es un valor documentado del enum (§11, §22.4),
 *      no un vacío de contrato; el documento simplemente no dice qué
 *      hacer con él en la prosa de §11.2/§11.3, mismo silencio que con
 *      UNCLEAR, mismo principio de §25 aplicado por consistencia.
 *   3. "Las explicaciones competidoras no dominantes deben quedar
 *      explícitas" = cuando alternative_explanation=COMPETING,
 *      conflicting_evidence[] no puede estar vacío — ancla la prosa a un
 *      campo real de ATTRIBUTION_ASSESSMENT (§22.4), no inventa uno nuevo.
 *
 * UNRESOLVED (§11.3) — catch-all: cualquier caso que no alcance CONFIRMED
 * ni SUPPORTED. Los disparadores que el documento enumera explícitamente
 * (relación insostenible, evidencia insuficiente, incompatibilidad
 * temporal/organizacional, alternativa dominante) son ya, cada uno, causa
 * de que SUPPORTED falle — no hace falta una tabla propia para UNRESOLVED.
 *
 * ── §11.4 — no circularidad, verificada por firma de función ─────────────
 *
 * clasificarAtribucion() NO recibe diagnostic_context como parámetro —
 * mismo patrón que calcularIAO() sin brecha en motor-iao: es
 * estructuralmente imposible que un cfg_ref/dyn_ref/efo_ref/aie_ref mueva
 * el veredicto, porque la función ni siquiera los ve. diagnostic_context
 * se transporta como metadata en el ATTRIBUTION_ASSESSMENT (§22.4), fuera
 * de esta función.
 *
 * ── §12 — profundización y genealogía probatoria ─────────────────────────
 *
 * profundizar() SIEMPRE produce una evaluación NUEVA (assessment_version
 * incrementado); NUNCA muta la anterior. La inmutabilidad se verifica por
 * test (Object.freeze + comparación de referencia), no solo por diseño.
 */

'use strict';

// ── §11.1 CONFIRMED ───────────────────────────────────────────────────────

function esConfirmed(d) {
  return d.operational_correspondence === 'YES' &&
    d.temporal_correspondence === 'COMPATIBLE' &&
    d.organizational_correspondence === 'MATCH' &&
    d.operational_evidence === 'DIRECT' &&
    d.alternative_explanation === 'NONE_DOMINANT';
}

// ── §11.2 SUPPORTED (3 operacionalizaciones acordadas) ───────────────────

function esSupported(d) {
  var sinNegativoOperacional = d.operational_correspondence !== 'NO';
  var sinNegativoTemporal = d.temporal_correspondence !== 'INCOMPATIBLE';
  var sinNegativoOrganizacional = d.organizational_correspondence !== 'MISMATCH';
  var correspondenciasSinNegativo = sinNegativoOperacional && sinNegativoTemporal && sinNegativoOrganizacional;

  var evidenciaSuficiente = d.operational_evidence === 'DIRECT' || d.operational_evidence === 'INDIRECT';

  // "Incierta" cubre las 3 correspondencias en UNCLEAR y también
  // alternative_explanation=UNKNOWN — mismo estado de "no lo sabemos",
  // mismo tratamiento por el mismo principio (§25: perder cobertura antes
  // que inventar certeza). Confirmado con Luis tras revisar el enum
  // literal de alternative_explanation (§11 / §22.4): UNKNOWN es un valor
  // documentado, no un vacío de contrato — el silencio está en la prosa de
  // clasificación (§11.2/§11.3 no lo mencionan), no en el enum.
  var algunaDimensionIncierta = d.operational_correspondence === 'UNCLEAR' ||
    d.temporal_correspondence === 'UNCLEAR' ||
    d.organizational_correspondence === 'UNCLEAR' ||
    d.alternative_explanation === 'UNKNOWN';
  var necesitaConvergencia = d.operational_evidence === 'INDIRECT' || algunaDimensionIncierta;
  var convergenciaOk = !necesitaConvergencia || d.system_convergence === 'CONVERGENT';

  var sinAlternativaDominante = d.alternative_explanation !== 'DOMINANT';
  var competidorasExplicitas = d.alternative_explanation !== 'COMPETING' ||
    (Array.isArray(d.conflicting_evidence) && d.conflicting_evidence.length > 0);

  return correspondenciasSinNegativo && evidenciaSuficiente && convergenciaOk &&
    sinAlternativaDominante && competidorasExplicitas;
}

/**
 * clasificarAtribucion(d)
 *
 * d: { operational_correspondence, temporal_correspondence,
 *      organizational_correspondence, operational_evidence,
 *      system_convergence, alternative_explanation, conflicting_evidence? }
 * — deliberadamente NO incluye diagnostic_context (§11.4).
 *
 * Devuelve 'CONFIRMED' | 'SUPPORTED' | 'UNRESOLVED'. Orden de evaluación
 * ESTRICTO y deliberado: CONFIRMED antes que SUPPORTED — un caso puede
 * satisfacer ambas fórmulas (evidencia DIRECT + correspondencias exactas
 * + alternativa NONE_DOMINANT), y debe ganar la categoría más fuerte.
 */
function clasificarAtribucion(d) {
  if (!d || typeof d !== 'object') {
    throw new Error('clasificarAtribucion: se esperaba un objeto con las 6 dimensiones.');
  }
  if (esConfirmed(d)) return 'CONFIRMED';
  if (esSupported(d)) return 'SUPPORTED';
  return 'UNRESOLVED';
}

// ── §12 profundización y genealogía probatoria ───────────────────────────

/**
 * profundizar(evaluacionPrevia, cambios)
 *
 * evaluacionPrevia: un ATTRIBUTION_ASSESSMENT (o subconjunto con al menos
 *   assessment_id/assessment_version).
 * cambios: campos nuevos que la profundización trae (nueva evidencia,
 *   nuevas correspondencias, etc.) — se combinan sobre evaluacionPrevia.
 *
 * Devuelve una evaluación NUEVA con assessment_version incrementado
 * (esquema "vN" → "v(N+1)"; si no matchea ese patrón, se anexa
 * "-profundizada" en vez de fallar silenciosamente). NUNCA muta
 * evaluacionPrevia — se congela con Object.freeze antes de devolverla,
 * así una mutación accidental posterior lanza en vez de corromper la
 * genealogía en silencio.
 */
function profundizar(evaluacionPrevia, cambios) {
  if (!evaluacionPrevia || typeof evaluacionPrevia !== 'object') {
    throw new Error('profundizar: se esperaba una evaluación previa (objeto).');
  }
  var version = evaluacionPrevia.assessment_version;
  var match = typeof version === 'string' && version.match(/^v(\d+)$/);
  var nuevaVersion = match ? ('v' + (parseInt(match[1], 10) + 1)) : (String(version) + '-profundizada');

  var nueva = Object.assign({}, evaluacionPrevia, cambios || {}, {
    assessment_version: nuevaVersion,
    version_anterior: evaluacionPrevia.assessment_version
  });

  Object.freeze(evaluacionPrevia); // la genealogía nunca se sobrescribe silenciosamente
  return nueva;
}

module.exports = {
  clasificarAtribucion: clasificarAtribucion,
  profundizar: profundizar,
  // expuestas para pruebas dirigidas a cada mitad de la tabla de decisión
  esConfirmed: esConfirmed,
  esSupported: esSupported
};
