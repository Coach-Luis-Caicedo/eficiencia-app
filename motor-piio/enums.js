/**
 * motor-piio/enums.js — Fase 0
 *
 * Registro canónico de enums y constantes del Documento Técnico PIIO
 * v1.1 FINAL (EFICIENCIA_Documento_Tecnico_PIIO_v1_1_FINAL.docx).
 *
 * PIIO = Panel de Indicadores de Impacto Operativo. Produce la EFO
 * (Evidencia de Funcionamiento Operativo) para el AIE mediante una cascada
 * inferencial DETERMINISTA de 6 niveles (§4):
 *
 *   OBSERVACIÓN → KPI_STATE → EVIDENCE_GROUP → PHENOMENON_STATE
 *              → DOMAIN_STATE → EFO_STATE → AIE
 *
 * Sin promedios, sin pesos universales, sin votación, sin score 0–100
 * (§4, §20.1, §35, INV-PIIO-75/76). Cada nivel agrega significado sin
 * borrar el anterior (INV-PIIO-10).
 *
 * FRASE RECTORA (§30, equivalente a la de IFD §0 / FPV §18):
 *   "Ante evidencia insuficiente, PIIO debe perder cobertura antes que
 *    inventar posición."
 *
 * ── Oráculo ──────────────────────────────────────────────────────────
 *
 * NO hay motor de referencia (ni Python como IFD, ni tabla numérica como
 * FPV §10). El oráculo son los 80 invariantes `INV-PIIO-01..80` (§33 —
 * cada uno un "nunca/siempre" duro) y los 80 casos de aceptación
 * `AC01..80` (§34 — cobertura de cada rama de la cascada). Varios AC son
 * CONDUCTUALES, no numéricos ("según regla explícita", "puede ser
 * IMPROVING") — se testea el resultado tal como el texto lo enuncia.
 *
 * ── Alcance CERRADO — interoperabilidad (§26, §1.4, INV-PIIO-43/44/45) ─
 *
 * PIIO exporta `PIIO_OPERATIONAL_EXPORT` (fenómenos / métricas /
 * exposición / nodos) hacia CFF e IFD. PIIO NUNCA calcula costo, ROI,
 * TRE ni proyección predictiva — eso es exclusivo de CFF/IFD. No se
 * implementa nada de esa lógica en motor-piio, ni "de conveniencia".
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────
// §5 — Taxonomía canónica de dominios (7). Cada dominio se configura por
// contexto como REQUIRED | OPTIONAL | NOT_APPLICABLE. Tiempo es dimensión
// transversal; Personas no es dominio PIIO; Costo pertenece a CFF.
// ─────────────────────────────────────────────────────────────────────
var DOMAINS = [
  'PRODUCTIVITY',            // resultado producido vs capacidad operacional utilizada
  'QUALITY',                 // conformidad del resultado con requisitos/condiciones
  'COMPLIANCE',              // entrega de lo comprometido dentro de lo acordado
  'OPERATIONAL_CONTINUITY',  // disponibilidad y funcionamiento de procesos/sistemas
  'OPERATIONAL_AVAILABILITY',// disponibilidad efectiva de la capacidad humana
  'OPERATIONAL_SAFETY',      // eventos que comprometen integridad de Personas/activos
  'RESOURCE_EFFICIENCY'      // consumo/aprovechamiento/pérdida de recursos operativos
];

// ─────────────────────────────────────────────────────────────────────
// §27 — Estados canónicos v1.1 (23 enums). Verbatim del documento.
// ─────────────────────────────────────────────────────────────────────
var ENUMS = {
  // §11 / §27. I = evidencia válida indeterminada/no resolutiva/divergente.
  // N_A = no existe base válida suficiente para clasificar. NO son lo mismo
  // (INV-PIIO-24: N_A no es posición intermedia).
  POSITION: ['F', 'I', 'D', 'N_A'],
  TRAJECTORY: ['IMPROVING', 'STABLE', 'DETERIORATING', 'N_A'],
  PERSISTENCE: ['POINT', 'REPEATED', 'PERSISTENT', 'N_A'],

  OUTPUT_STATUS: ['VALID', 'VALID_WITH_LIMITATIONS', 'INSUFFICIENT', 'INVALID', 'NOT_APPLICABLE'],

  // §8.2 (admisibilidad de referencia) y §27 (EVIDENCE_ADMISSIBILITY) usan
  // los MISMOS tres valores — misma escala.
  EVIDENCE_ADMISSIBILITY: ['ADMISSIBLE', 'ADMISSIBLE_WITH_LIMITATIONS', 'NOT_ADMISSIBLE'],

  DATA_QUALITY_STATUS: ['VALID', 'VALID_WITH_LIMITATIONS', 'MISSING', 'INVALID'],

  // §13. Freshness NO se reduce a un booleano global.
  FRESHNESS_STATUS: ['CURRENT', 'AGING', 'STALE', 'N_A'],

  // §16 (nivel fenómeno) vs §27 COVERAGE_STATUS_EFO (nivel EFO) — escalas
  // distintas, a propósito.
  COVERAGE_STATUS_PHENOMENON: ['COMPLETE', 'PARTIAL', 'NONE'],
  COVERAGE_STATUS_EFO: ['FULL', 'PARTIAL', 'LIMITED', 'INSUFFICIENT'],

  APPLICABILITY: ['REQUIRED', 'OPTIONAL', 'NOT_APPLICABLE'],
  EVIDENCE_PROXIMITY: ['DIRECT', 'PROXY'],
  COMPUTATION: ['RAW', 'DERIVED'],
  TEMPORAL_ROLE: ['COINCIDENT', 'LAGGED'],

  // §11.1. TARGET_RANGE requiere reglas explícitas para desviación por
  // debajo y por encima (§7 — target_range_rules en METRIC_DEFINITION).
  DIRECTIONALITY: ['HIGHER_IS_WORSE', 'LOWER_IS_WORSE', 'TARGET_RANGE'],

  RECURRENCE_TYPE: ['RATE_BASED', 'COUNT_BASED', 'CONTINUOUS', 'EPISODIC'],

  TEMPORAL_PATTERN: ['NONE_DETECTED', 'TREND', 'SEASONAL', 'TREND_AND_SEASONAL', 'INSUFFICIENT'],
  SERIES_STABILITY: ['STABLE', 'MODERATELY_VARIABLE', 'HIGHLY_VARIABLE', 'INSUFFICIENT'],
  REGIME_STATUS: ['CONTINUOUS', 'NEW_REGIME'],
  SHOCK_STATUS: ['NONE', 'SUSPECTED', 'CONFIRMED_EXTERNAL', 'CONFIRMED_INTERNAL'],

  REFERENCE_CHANGE_MODE: ['REBASE_HISTORY', 'START_NEW_REGIME'],
  DEFINITION_CONTINUITY: ['CONTINUOUS', 'BRIDGED', 'NEW_SERIES'],

  SCOPE: ['ORGANIZATIONAL', 'SEGMENT_ONLY'],
  ERROR_SEVERITY: ['WARNING', 'DEGRADED', 'BLOCKING'],

  // ── enums definidos fuera de §27 ──────────────────────────────────

  // §7 — METRIC_DEFINITION.metric_type
  METRIC_TYPE: ['COUNT', 'RATE', 'RATIO', 'DURATION', 'QUANTITY', 'INDEX', 'BINARY', 'OTHER_VALIDATED'],
  // §7 — METRIC_DEFINITION.boundary_behavior
  BOUNDARY_BEHAVIOR: ['INVALID', 'NOT_APPLICABLE', 'RULE_DEFINED'],
  // §7 — METRIC_DEFINITION.continuity_mode. El documento nombra el campo
  // pero NO enumera sus valores (ambigüedad E) — se reusan los de
  // DEFINITION_CONTINUITY (§8.4), concepto contiguo, hasta que el texto
  // diga otra cosa. DECISIÓN DE DISEÑO, anotada.
  CONTINUITY_MODE: ['CONTINUOUS', 'BRIDGED', 'NEW_SERIES'],

  // §8.1 — REFERENCE_SPEC.reference_type (referencias de condición)
  REFERENCE_TYPE: ['NORMATIVE', 'TECHNICAL', 'HISTORICAL', 'VALIDATED_TARGET', 'COMPARABLE_BENCHMARK'],
  // §25.3 — REFERENCE_SPEC.reference_role
  REFERENCE_ROLE: ['CONDITION', 'TEMPORAL'],

  // §12 — SHOCK_TREATMENT
  SHOCK_TREATMENT: ['INCLUDE', 'EXCLUDE_FROM_STRUCTURAL_CALIBRATION', 'MODEL_SEPARATELY'],

  // §11.2 — TEMPORAL_METHOD (para calcular trayectoria; no hay ventana universal)
  TEMPORAL_METHOD: ['DELTA', 'SLOPE', 'ROLLING_COMPARE', 'OTHER_VALIDATED'],

  // §15.1 — PHENOMENON_STATE.evidence_basis
  EVIDENCE_BASIS: ['DIRECT', 'PROXY', 'NONE'],

  // §28 — clasificación semántica del VALOR de una observación: 0, missing
  // y null quedan separados. `N_A` NO está aquí — §28 es explícito: "N_A es
  // una categoría semántica de posición/trayectoria/persistencia, no un
  // sustituto genérico de null". La produce clasificarAusencia().
  AUSENCIA_KIND: ['VALOR_PRESENTE', 'CERO_OBSERVADO', 'MISSING', 'NULL_CON_RAZON', 'INVALIDO']
};

// ─────────────────────────────────────────────────────────────────────
// Parámetros calibrables (§13, §31, §35). El documento los nombra pero no
// da valores — quedan versionados como parámetros del motor, PENDIENTE_
// CALIBRACION (mismo patrón que UMBRAL_CENSAL_CV del FPV).
// ─────────────────────────────────────────────────────────────────────
var PARAMS = {
  // §11.3 / AC19 — si el gap entre observaciones D supera este límite, un
  // nuevo D inicia un nuevo run (no continúa el anterior). El documento lo
  // referencia por nombre, nunca lo valúa.
  MAX_CONTINUITY_GAP: null,
  MAX_CONTINUITY_GAP_ESTADO: 'PENDIENTE_CALIBRACION',

  // §13 — cómo se deriva FRESHNESS_STATUS de freshness_spec + período +
  // ahora. §13 da solo el enum, no la fórmula (ambigüedad C). Forma
  // decidida: edad (en unidades de calculation_frequency) <= CURRENT →
  // CURRENT; <= AGING → AGING; si no → STALE.
  FRESHNESS_MAX_AGE_CURRENT: null,
  FRESHNESS_MAX_AGE_AGING: null,
  FRESHNESS_ESTADO: 'PENDIENTE_CALIBRACION',

  // ── REAPERTURA (Fase 4) — constantes calibrables de temporal.js. El
  //    documento nombra los conceptos (§11.2 "no existe ventana universal",
  //    §12) pero no da NINGÚN número. Todas null + PENDIENTE_CALIBRACION;
  //    ninguna requiere decisión de diseño — se fijan en el piloto.

  // §12 — SERIES_STABILITY: cortes del coeficiente de variación (ambig. AA).
  // CV <= STABLE → STABLE; <= MODERATE → MODERATELY_VARIABLE; si no → HIGHLY_VARIABLE.
  // Slot para una futura CALIBRACION_GLOBAL propia de EFICIENCIA — se
  // mantienen null a propósito.
  STABILITY_CV_STABLE: null,
  STABILITY_CV_MODERATE: null,

  // REAPERTURA (Fase 12b, decisión de negocio de Luis, NO dictada por el
  // documento): umbrales genéricos de RESPALDO — convención estadística
  // general (regla de bolsillo del coeficiente de variación: <=15% baja
  // dispersión, <=30% moderada), NO derivada de datos de EFICIENCIA.
  // Solo se usan cuando NO hay calibración propia por organización NI
  // calibración global (ver referencias.js/temporal.js: precedencia
  // CALIBRACION_PROPIA > CALIBRACION_GLOBAL > CALIBRACION_GENERICA).
  // Provisional hasta que exista calibración real por organización.
  STABILITY_CV_STABLE_GENERICO: 0.15,
  STABILITY_CV_MODERATE_GENERICO: 0.30,
  STABILITY_CV_GENERICO_FUENTE: 'Convención estadística general del coeficiente de variación (<=15% baja dispersión, <=30% moderada). NO derivada de datos de EFICIENCIA. Provisional hasta calibración propia por organización.',

  // §12 — TEMPORAL_PATTERN (ambig. AB): mínimo de puntos para intentar
  // detección; pendiente relativa que cuenta como TREND; fuerza de
  // autocorrelación estacional que cuenta como SEASONAL.
  PATTERN_MIN_PUNTOS: null,
  PATTERN_TREND_SLOPE: null,
  PATTERN_SEASONAL: null,

  // §11.2 / INV-PIIO-26 — mínimo de historia comparable para traj ≠ N_A (ambig. AC).
  // Slot para una futura CALIBRACION_GLOBAL propia de EFICIENCIA — se
  // mantiene null a propósito, mismo criterio que STABILITY_CV_STABLE/_MODERATE.
  MIN_HISTORIA_TRAJ: null,

  // REAPERTURA (Fase 4, AUDITORIA_PARAMETROS_CALIBRACION.md §1.5): genérico
  // de RESPALDO — NO es una convención estadística (a diferencia de
  // STABILITY_CV_*_GENERICO). Es el mínimo matemático absoluto: con menos de
  // 2 puntos no existe ningún cambio que calcular (magnitudCambio() y
  // _pendiente() de temporal.js exigen al menos 2 valores para una resta o
  // una pendiente). Formaliza un valor que ya regía de hecho, sin nombre,
  // en historiaSuficiente() — no cambia ningún comportamiento. Solo se usa
  // cuando NO hay CALIBRACION_GLOBAL (arriba); provisional hasta calibración
  // propia por organización, igual que los demás genéricos de este bloque.
  MIN_HISTORIA_TRAJ_GENERICO: 2,
  MIN_HISTORIA_TRAJ_GENERICO_FUENTE: 'Mínimo matemático absoluto para calcular un cambio entre dos puntos (resta o pendiente de 2 valores) — NO es una convención estadística ni deriva de datos de EFICIENCIA. Provisional hasta calibración propia por organización.',

  // §12 / INV-PIIO-58 — densidad mínima (puntos observados / períodos del
  // rango) por debajo de la cual la serie es "sparse" (ambig. AG).
  SPARSITY_MIN_DENSIDAD: null,

  // §11.2 — TEMPORAL_METHOD (ambig. AD): no aparece en ningún esquema.
  // Default DELTA (comparar con el período anterior). Override por-KPI →
  // diferido (reapertura solo si el piloto lo pide). La VENTANA sigue sin
  // número.
  TEMPORAL_METHOD_DEFAULT: 'DELTA',
  TEMPORAL_WINDOW: null,

  TEMPORAL_ESTADO: 'PENDIENTE_CALIBRACION',

  // ── REAPERTURA (Fase 5) — Grupo 1 de kpiState.js. §11 nombra los
  //    conceptos sin dar número.

  // §11.2 / AI — magnitud de cambio por debajo de la cual traj = STABLE.
  // Slot para una futura CALIBRACION_GLOBAL propia de EFICIENCIA — se
  // mantiene null a propósito, mismo criterio que STABILITY_CV_STABLE/_MODERATE.
  TRAJ_STABLE_BAND: null,

  // REAPERTURA (Fase 5, DISENO_TRAJ_STABLE_BAND_PERS.md §4): genérico de
  // RESPALDO, RELATIVO (fracción de cambio respecto al valor/base anterior
  // — nunca un número absoluto, ver kpiState.js: la escala cruda de cada
  // KPI hace inútil un band absoluto único). Investigado primero si existía
  // algo citable (MDC — Minimal Detectable Change): existe la FÓRMULA
  // (MDC95 = 1.96·√2·SEM) pero exige SEM de mediciones repetidas que no
  // existen pre-piloto — mismo vacío que motivó INVESTIGACION_ANCLAJE_
  // UMBRAL_PISO.md. No se encontró ninguna convención universal de "% de
  // cambio significativo" en literatura de KPI de negocio. Este valor NO
  // es esa convención — es el resultado de un ejercicio de sensibilidad
  // con series sintéticas (motor-piio/sim/sensibilidad_traj_stable_band.js):
  // valida que el mecanismo (banda relativa) funciona razonablemente frente
  // a ruido y tendencias de distinta magnitud y escala — no determina cuál
  // es el número correcto para EFICIENCIA. MENOS autoridad que
  // STABILITY_CV_*_GENERICO a propósito — ver TRAJ_STABLE_BAND_GENERICO_FUENTE.
  TRAJ_STABLE_BAND_GENERICO: 0.05,
  TRAJ_STABLE_BAND_GENERICO_FUENTE: 'Informado por un ejercicio de sensibilidad con datos sintéticos inventados para este propósito (motor-piio/sim/sensibilidad_traj_stable_band.js) — NO es una convención externa citable, NO deriva de organizaciones reales. Mismo perfil de evidencia que el generador de statistical_simulation.py en aie_validation_kit: valida que el mecanismo (banda relativa) funciona razonablemente frente a ruido y tendencias de distinta magnitud y escala — no determina cuál es el número correcto para EFICIENCIA. Más provisional que STABILITY_CV_*_GENERICO (que sí tiene cita externa real) — sujeto a corrección temprana con el primer dato real del piloto.',

  // §11.3 / AJ — cortes de det_run para POINT → REPEATED → PERSISTENT.
  // Slot para una futura CALIBRACION_GLOBAL propia de EFICIENCIA — se
  // mantienen null a propósito.
  PERS_REPEATED_MIN: null,
  PERS_PERSISTENT_MIN: null,

  // REAPERTURA (Fase 5, DISENO_TRAJ_STABLE_BAND_PERS.md §5): genéricos de
  // RESPALDO. PERS_REPEATED_MIN_GENERICO=2 es el mínimo no-trivial (más de
  // un punto) que ya regía de hecho sin calibrar (kpiState.js). PERS_
  // PERSISTENT_MIN_GENERICO=8 SÍ tiene anclaje externo real — Regla 4 de
  // Western Electric / Regla 2 de Nelson (8-9 puntos consecutivos del mismo
  // lado de la línea central → señal de desplazamiento sostenido, no
  // ruido) — a diferencia de TRAJ_STABLE_BAND_GENERICO. Ver PERS_GENERICO_
  // FUENTE para la limitación de aplicabilidad (supuestos de estacionariedad
  // de SPC que una serie organizacional puede no cumplir).
  PERS_REPEATED_MIN_GENERICO: 2,
  PERS_PERSISTENT_MIN_GENERICO: 8,
  PERS_GENERICO_FUENTE: 'PERS_REPEATED_MIN_GENERICO: mínimo no-trivial (más de un punto), ya vigente de hecho sin calibrar. PERS_PERSISTENT_MIN_GENERICO: ancla a la Regla 4 de Western Electric / Regla 2 de Nelson (8-9 puntos consecutivos del mismo lado de la línea central → señal de desplazamiento sostenido, no ruido) — convención real y citada del control estadístico de procesos (Western Electric Co., SQC Handbook, 1956; Nelson, Journal of Quality Technology, 1984). Limitación de aplicabilidad: esas tasas de falsa alarma asumen un proceso aproximadamente estacionario con ruido i.i.d. alrededor de una media conocida — una serie de KPI organizacional puede violar ese supuesto (autocorrelación, estacionalidad). El número es una convención externa real; la garantía estadística detrás de ese número no se traslada automáticamente a series organizacionales. Provisional hasta calibración propia por organización.',

  KPISTATE_ESTADO: 'PENDIENTE_CALIBRACION'
};

// ─────────────────────────────────────────────────────────────────────
function esValorDe(lista, v) {
  return Array.isArray(lista) && lista.indexOf(v) !== -1;
}

module.exports = {
  DOMAINS: DOMAINS,
  ENUMS: ENUMS,
  PARAMS: PARAMS,
  esValorDe: esValorDe
};
