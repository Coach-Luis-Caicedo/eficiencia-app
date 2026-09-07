/**
 * motor-fpv/enums.js — Fase 0
 *
 * Registro canónico de enums y constantes del Documento Técnico FPV v1.2
 * (docs/Documento_Tecnico_FPV_v1.2_PrePiloto_Stress_Test_Externo.docx).
 *
 * NOTA DE VERSIÓN: el texto interno del documento se identifica como "v1.1"
 * en varios lugares (portada, §5, §11.2, §16, §18) porque el contenido no
 * se actualizó tras el cambio de nombre del archivo a v1.2. El motor, sus
 * archivos y sus commits se refieren SIEMPRE a v1.2. Las citas textuales
 * que incluyan "v1.1" se citan tal cual aparecen.
 *
 * Fuente única: el propio texto de v1.2. NO hay motor de referencia (a
 * diferencia de IFD): el documento define su propio pseudocódigo (§14) y
 * no menciona ningún motor previo. El único oráculo numérico es la tabla
 * de estrés de §10 (5 escenarios sintéticos con L, mediana, H, C ya
 * calculados en el texto) — se reproduce como batería, no hay subprocess.
 *
 * FRASE RECTORA (§18, equivalente a la de IFD §0):
 *   "ANTE EVIDENCIA INSUFICIENTE, FPV DEBE MOSTRAR INCERTIDUMBRE O NO
 *    CALCULAR; NUNCA COMPLETAR LA EVIDENCIA QUE NO EXISTE."
 */

'use strict';

var ENUMS = {
  // §4 — Posiciones de participación. Palabras completas, NO 'C'/'I'/'P':
  // la 'P' de posición colisionaría con el sensor P (Proporcionalidad).
  // "FPV-C / FPV-I / FPV-P" del §11 son ETIQUETAS de salida, no claves.
  POSICION: ['CONSUMIDOR', 'INVERSIONISTA', 'PROVEEDOR'],

  // §3 — Sensores. F Fiabilidad (sensor "Consistencia" · confianza) ·
  // P Proporcionalidad (sensor "Correspondencia" · satisfacción) ·
  // V Vínculo (sensor "Presencia" · apego). Un solo ítem nuclear por
  // sensor por posición (§5) — sin promedio interno a nivel Persona.
  SENSOR: ['F', 'P', 'V'],

  // §6 — códigos de respuesta especiales. NE = "no tengo experiencia
  // suficiente para responder"; NR = omisión / salto del ítem. §6 literal:
  // "NE y NR nunca se fusionan". Ninguno se imputa (no recibe 0, 50 ni
  // otro valor). Un valor de sensor es: 1|2|3|4|5 | 'NE' | 'NR'.
  RESPUESTA_ESPECIAL: ['NE', 'NR'],

  // §8 — Suficiencia de evidencia e incertidumbre. Escalera de estatus de
  // la LECTURA (la asigna el motor, Fase 3 — no la elige el llamante):
  //   NO_CALCULABLE  nᵥ = 0 para el sensor.
  //   DESCRIPTIVO    ≥ 1 respuesta válida; describe solo lo observado.
  //   CENSAL         proporción documentada del universo elegible.
  //   INFERENCIAL    muestra probabilística / modelo inferencial documentado.
  ESTATUS_SENSOR: ['NO_CALCULABLE', 'DESCRIPTIVO', 'CENSAL', 'INFERENCIAL'],

  // §5 — códigos ordinales válidos de la escala.
  ESCALA_ORDINAL: [1, 2, 3, 4, 5]
};

/**
 * s(r) — normalización de presentación (§6).
 *
 *   s(r) = 100 × (r − 1) / 4 = 25 × (r − 1),  para r ∈ {1,2,3,4,5}
 *
 * §6 literal: "La transformación 0–100 es lineal y se utiliza
 * exclusivamente para comunicación, visualización y cálculo descriptivo.
 * No convierte la escala ordinal en una magnitud física ni autoriza
 * interpretar 75 como «75 % de Fiabilidad»." La respuesta original 1–5
 * se conserva siempre.
 *
 * Solo acepta enteros 1–5. NE/NR NO tienen valor numérico (§6) — pasarlos
 * aquí es un error de programación, no un caso de dominio.
 */
function s(r) {
  if (r !== Math.trunc(r) || r < 1 || r > 5) {
    throw new Error('s(r): r="' + r + '" — la normalización §6 solo aplica a enteros 1–5. ' +
      'NE/NR no tienen valor numérico y no se imputan.');
  }
  return 25 * (r - 1);
}

// ── Parámetros calibrables (§8, §15) ──────────────────────────────────
//
// §8 literal: "Los criterios operativos de suficiencia para despliegue
// empresarial deberán calibrarse en el piloto y quedar versionados como
// parámetros del motor, no codificados como verdades conceptuales."
// §18: "Permanecen abiertos únicamente los parámetros que requieren
// evidencia empírica: umbrales de interpretación, criterios operativos de
// suficiencia..."

var PARAMS = {
  // §8 — "Censal": "se observa de forma válida una proporción DOCUMENTADA
  // del universo elegible." El documento NO da el número. Placeholder
  // pre-piloto: la cobertura válida CV (= 100·nᵥ/N_elegibles, §7.2.D) que
  // el sensor debe alcanzar para que el estatus suba a CENSAL. Se usa en
  // Fase 3, no antes.
  UMBRAL_CENSAL_CV: 80, // %  — placeholder, el documento no da valor
  UMBRAL_CENSAL_CV_ESTADO: 'PENDIENTE_CALIBRACION'
};

module.exports = {
  ENUMS: ENUMS,
  s: s,
  PARAMS: PARAMS
};
