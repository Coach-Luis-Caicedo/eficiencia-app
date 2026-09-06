/**
 * motor-ifd/enums.js — Fase 0
 *
 * Registro canónico de enums del Documento Técnico IFD v1.2.2 FINAL
 * (docs/Documento_Tecnico_IFD_v1_2_2_FINAL.docx).
 *
 * Fuentes, en orden de precedencia:
 *   1. El texto de v1.2.2 cuando enumera valores explícitos.
 *   2. El motor de referencia ya verificado por Luis
 *      (docs/ifd_v1_2_1_engine_atribucion_categorica.py) cuando el texto
 *      nombra un concepto pero no le da código y el engine sí — SALVO para
 *      ver/roi/contención, que el engine calcula pero v1.2.2 §24 dejó
 *      PENDIENTE DE AUDITORÍA (el engine es anterior a esa decisión).
 *   3. Códigos nuevos asignados aquí para lo que ni el texto ni el engine
 *      codifican, documentados como tales.
 */

'use strict';

var ENUMS = {
  // §14 — clasificación de variables. Códigos internos (§14: "Los códigos
  // V1–V5 son internos").
  VARIABLE_TYPE: ['V1', 'V2', 'V3', 'V4', 'V5'],
  // V1 Conteo · V2 Tasa/proporción · V3 Magnitud continua · V4 Stock/acumulación · V5 Capacidad cualitativa o latente

  // §16 — tipo de evolución. El texto nombra 5 dinámicas (aditiva,
  // multiplicativa, acumulativa, limitada, cualitativa) SIN código, y solo
  // da fórmula de proyección para 3 (aditiva/multiplicativa/acumulativa).
  //
  // "limitada" NO es un evolution_type — decisión (b) aprobada por Luis,
  // verificada contra §16/§20/§21/§28: NINGÚN punto del documento trata
  // "multiplicativa + limitada" distinto de "multiplicativa con bounds".
  // El acotamiento es el clamp de dominio §15 (`Y* = min(U, max(L, Ŷ))`),
  // aplicado DESPUÉS de seleccionar el método a CUALQUIER proyección
  // ("sujeto al dominio", §20.2; "enforce natural domain", §28). Un
  // `evolution_type` con un valor que no cambia ningún comportamiento
  // invita a usarlo pensando que hace algo — se elimina. La combinación de
  // §16 ("tasa multiplicativa y limitada") se expresa como `EV-M` +
  // lower_bound/upper_bound declarados.
  //
  // El engine Python usa substrings (`"EV-M" in x.evolution_type`) — frágil.
  // Aquí: IGUALDAD ESTRICTA (contratos.js), nunca includes().
  EVOLUTION_TYPE: ['EV-A', 'EV-M', 'EV-ACUM', 'EV-CUAL'],
  // EV-A aditiva · EV-M multiplicativa · EV-ACUM acumulativa · EV-CUAL cualitativa (sin proyección cuantitativa → S1, como V5)

  // §23.3 — atribución categórica. Texto literal (§23.3, §28, §34, §35):
  // NUNCA coeficiente continuo. Cualquier otro valor (p.ej. "0.70") se
  // rechaza en la entrada.
  ATTRIBUTION_CATEGORY: ['CONFIRMED', 'SUPPORTED', 'UNRESOLVED', 'N_A'],

  // §8 — niveles de salida. "Estos códigos son de implementación y no
  // necesitan exponerse al cliente." §30: degradación S3→S2→S1→S0, nunca
  // sube.
  OUTPUT_LEVEL: ['S0', 'S1', 'S2', 'S3'],
  // S0 no proyectable · S1 escenario cualitativo · S2 rango/cuantificación limitada · S3 escenario cuantificado

  // `status` — del engine de referencia (aprobado por Luis: NO es redundante
  // con S0-S3; el mismo S1 puede llegar por CUALITATIVO —V5 por naturaleza—
  // o DEGRADADO_A_CUALITATIVO —serie insuficiente—, diagnósticos distintos).
  // El texto de v1.2.2 no da un enum `status` de cadenas aparte de S0-S3.
  STATUS: ['NO_PROYECTABLE', 'CUALITATIVO', 'DEGRADADO_A_CUALITATIVO', 'CUANTIFICADO'],

  // §17 — suficiencia de serie. "La serie se clasifica internamente de SS0
  // a SS3". Los mínimos por método son calibrables (ver PARAMS).
  SERIES_SUFFICIENCY: ['SS0', 'SS1', 'SS2', 'SS3'],

  // §21 — escenarios.
  SCENARIO: ['CONTINUIDAD', 'INTENSIFICACION', 'CONTENCION'],

  // §4 — tipología de consecuencias. Anexo B lista "ICAP / IOF / IEP / IEF"
  // como DESCRIPTIVOS INTERNOS. Mapeo contra la tabla de §4:
  IMPACT_TYPE: ['ICAP', 'IOF', 'IEP', 'IEF'],
  // ICAP impacto sobre capacidades · IOF impacto operativo futuro · IEP relevancia estratégica potencial · IEF impacto económico futuro

  // §26 — semántica nula. Un campo puede ser: un número, `null` (NO
  // DETERMINADO), o la cadena 'NA' (NO APLICABLE). El 0 numérico es
  // AUSENCIA DEMOSTRADA — un valor legítimo, no "vacío".
  SEMANTICA_NULA: ['CERO_AUSENCIA_DEMOSTRADA', 'NULL_NO_DETERMINADO', 'NA_NO_APLICABLE']
};

// ── Catálogo de alertas (§29) ───────────────────────────────────────────
//
// §29 lista 15 alertas CONCEPTUALES, sin códigos. El engine de referencia
// codifica 10 (A01-A07, A09, A10, A12) y SALTA A08 y A11. Cruce §29 ↔
// engine (verificado literal contra ambos textos):
//
//   §29 #1  Evidencia/admisibilidad insuficiente        → A01  (engine)
//   §29 #2  Contradicción material                      → A02  (engine)
//   §29 #3  Trazabilidad insuficiente                   → A03  (engine)
//   §29 #4  Serie insuficiente                          → A04  (engine)
//   §29 #5  Método incompatible                         → A05  (engine)
//   §29 #6  Dominio excedido                            → A06  (engine)
//   §29 #7  Horizonte excedido                          → A07  (engine)
//   §29 #8  Extrapolación no sustentable                → A13  (NUEVO — no A08)
//   §29 #9  Valor económico insuficiente                → A09  (engine)
//   §29 #10 Atribución UNRESOLVED / estado no compatible → A10  (engine)
//   §29 #11 Doble conteo potencial                      → A14  (NUEVO — no A11)
//   §29 #12 Intervención sin evidencia                  → A12  (engine)
//   §29 #13 Unidades incompatibles                      → A15  (NUEVO)
//   §29 #14 Probabilidad no calibrada                   → A16  (NUEVO)
//   §29 #15 Agregación heterogénea                      → A17  (NUEVO)
//
// 10 codificadas por el engine + 5 nuevas = 15. A08 y A11 quedan
// RESERVADOS Y VACÍOS: la coincidencia posicional (A08↔#8, A11↔#11) es
// circunstancial y NO se usa — instrucción explícita de Luis: "ausencia
// heredada del motor de referencia — no se les asigna contenido sin
// evidencia de qué debían representar."

var ALERTAS = {
  A01: 'ADMISIBILIDAD_INSUFICIENTE',        // §29 #1  — engine
  A02: 'EVIDENCIA_CONTRADICTORIA_O_INSUFICIENTE', // §29 #2 — engine
  A03: 'TRAZABILIDAD_INSUFICIENTE',         // §29 #3  — engine
  A04: 'SERIE_INSUFICIENTE',                // §29 #4  — engine
  A05: 'METODO_INCOMPATIBLE',               // §29 #5  — engine
  A06: 'DOMINIO_EXCEDIDO',                  // §29 #6  — engine
  A07: 'HORIZONTE_EXCEDIDO',                // §29 #7  — engine
  // A08 — RESERVADO Y VACÍO (ausencia heredada del engine; sin contenido)
  A09: 'VALOR_ECONOMICO_SIN_TRAZABILIDAD',  // §29 #9  — engine
  A10: 'ATRIBUCION_UNRESOLVED',             // §29 #10 — engine
  // A11 — RESERVADO Y VACÍO (ausencia heredada del engine; sin contenido)
  A12: 'INTERVENCION_SIN_EVIDENCIA',        // §29 #12 — engine
  A13: 'EXTRAPOLACION_NO_SUSTENTABLE',      // §29 #8  — NUEVO
  A14: 'DOBLE_CONTEO_POTENCIAL',            // §29 #11 — NUEVO
  A15: 'UNIDADES_INCOMPATIBLES',            // §29 #13 — NUEVO
  A16: 'PROBABILIDAD_NO_CALIBRADA',         // §29 #14 — NUEVO
  A17: 'AGREGACION_HETEROGENEA'             // §29 #15 — NUEVO
};

var ALERTAS_RESERVADAS = ['A08', 'A11']; // heredadas del engine, sin contenido asignado

// ── Parámetros calibrables (§17, §21.2, §22, §37) ───────────────────────
//
// §37 "Gobernanza de parámetros": los calibrables "cambian solo con
// evidencia documentada". Aquí van con su valor pre-piloto y la marca
// PENDIENTE_CALIBRACION. NUNCA se tratan como cerrados.

var PARAMS = {
  // §22 — amplitud del envelope de incertidumbre por nivel de FEP. El
  // engine usa ±15% (FEP 2) y ±7% (FEP 3), con comentario literal "NOT
  // empirically calibrated". §22: "los parámetros concretos se calibran en
  // piloto".
  ENVELOPE_POR_FEP: { 2: 0.15, 3: 0.07 },
  ENVELOPE_ESTADO: 'PENDIENTE_CALIBRACION',

  // §21.2 — Intensificación. "Q75 es una convención pre-piloto, no un
  // parámetro empíricamente cerrado."
  INTENSIFICACION_PERCENTIL: 75,
  INTENSIFICACION_ESTADO: 'PENDIENTE_CALIBRACION',

  // §17 — umbral de suficiencia de serie para admitir método cuantitativo
  // en V1-V4. El engine usa `series_sufficiency < 2`. §17: "Los mínimos por
  // método son parámetros calibrables, no verdades universales."
  SERIE_MINIMA_CUANTITATIVA: 2, // índice sobre SS0..SS3 (SS2)
  SERIE_MINIMA_ESTADO: 'PENDIENTE_CALIBRACION'
};

module.exports = {
  ENUMS: ENUMS,
  ALERTAS: ALERTAS,
  ALERTAS_RESERVADAS: ALERTAS_RESERVADAS,
  PARAMS: PARAMS
};
