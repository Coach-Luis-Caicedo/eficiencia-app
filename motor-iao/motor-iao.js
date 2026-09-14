/**
 * ============================================================================
 *  MOTOR DE CÁLCULO — IAO (Índice de Activación Organizacional)
 * ============================================================================
 *
 *  Fuente de verdad: docs/DOCUMENTO_TECNICO_SDMO_IAO_v1.md, sección 3 en
 *  adelante (la sección 2 es SDMO — otro módulo).
 *
 *  MÓDULO AISLADO — mismo criterio que motor-ice-ieh/ y motor-sdmo/:
 *    · No recalcula nada de ICE–IEH. Su contrato de entrada son las 10
 *      variables YA calculadas, en escala 0–100.
 *    · NO importa motor-ice-ieh (ver README): las pruebas usan valores
 *      sintéticos de las 10 variables. Que la salida real de motor-ice-ieh
 *      encaje con esta entrada es una cuestión de integración (arnés, paso 3).
 *    · No implementa el AIE. No se integra a producción hasta aprobación
 *      explícita tras revisar la batería de verificación.
 *
 *  BRECHAS FUERA DEL CÁLCULO (§3.7, decisión con evidencia). Se evaluó una
 *  formulación no lineal (`G_j⁺`) que amplificaba el IAO según la dirección de
 *  la brecha; se descartó porque producía una PARADOJA DE MONOTONICIDAD
 *  (mejorar el Sistema aumentaba la activación inferida). Este módulo NO
 *  implementa `G_j⁺` ni ninguna variante. `calcularIAO()` recibe SOLO las 10
 *  variables — nunca una brecha. Las brechas se calculan y exponen aparte
 *  (`calcularBrechas`), estructuralmente sin ruta hacia el IAO.
 *
 *  PESOS PRE-PILOTO. Los coeficientes del §3.5 (relación 30/70, ponderación
 *  experiencial .25/.18/.25/.20/.12) están marcados en el documento como
 *  "Cerrado — pre-piloto" (§6.1): valores vigentes, sujetos a recalibración con
 *  datos propios (§6.2). Se usan como se dan, en la constante PESOS — y TODO lo
 *  demás se deriva de ahí: los coeficientes globales de la fórmula expandida y
 *  los pesos internos por par (NO se toman los literales redondeados a 3
 *  decimales que imprime el §3.6). Lo que el documento deja SIN valor —umbrales
 *  Seguridad/Alerta/Amenaza, cortes de dispersión, fórmula de precisión— NO se
 *  implementa. Son PENDIENTE_VALIDACION: `minReportableN` (§3.11) y
 *  `umbralPolarizacion` (§3.9, dispersión de brechas para declarar polarización).
 * ============================================================================
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MotorIAO = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ══════════════════════════════════════════════════════════════════════════
  //  0. PARÁMETROS PENDIENTES DE VALIDACIÓN (§6.2)
  // ══════════════════════════════════════════════════════════════════════════
  var PENDIENTE_VALIDACION = {
    // §3.11 — "N ≥ 8–10" es hipótesis operativa pre-piloto. Sin valor: las
    // funciones de agregación lo EXIGEN explícito en opts (lanzan si falta) —
    // reportar un nodo pequeño sin este umbral sería una brecha de
    // confidencialidad.
    minReportableN: null,

    // §3.9 — polarización de las brechas por par. Se calculan DOS dispersiones
    // (entre nodos / pool de individuos) que no viven en la misma escala de
    // magnitud, así que cada una lleva su propio umbral. Sin valor:
    // `agregarOrganizacion` SIEMPRE reporta las dispersiones crudas; solo los
    // veredictos booleanos quedan en `null` hasta fijar los umbrales.
    // NOTA: el veredicto `polarizacion.entreNodos` se evalúa contra la
    // dispersión entre nodos AJUSTADA (corregida por sesgo de muestra finita —
    // HALLAZGOS_MOTOR_IAO.md H1/H2), no contra la cruda.
    umbralPolarizacionEntreNodos: null,
    umbralPolarizacionPool: null,

    // §3.9 / §6.2 — clasificación de PRECISIÓN (regla de compuerta, NO de
    // mayoría). `clasificarPrecision` EXIGE los seis en opts. `representatividad`
    // NO entra a la compuerta: es PENDIENTE_FORMALIZACION (falta el concepto de
    // dato poblacional de referencia, no solo el número).
    precisionNMinCatastrofico: null,   // N < esto ⇒ BAJA
    precisionNAlto: null,              // N ≥ esto (y el resto ok) ⇒ ALTA
    precisionTasaMinCatastrofica: null,// tasa_respuesta < esto ⇒ BAJA
    precisionTasaAlta: null,           // tasa_respuesta ≥ esto (y el resto ok) ⇒ ALTA
    // §3.9 prevé dispersión "baja/media/alta" → DOS cortes:
    precisionCorteDispersionMedia: null, // media ≤ dispPool(IAO) < alta ⇒ tope MEDIA (no ALTA)
    precisionCorteDispersionAlta: null   // dispPool(IAO) ≥ alta ⇒ "alta" ⇒ BAJA
  };

  // ══════════════════════════════════════════════════════════════════════════
  //  0b. GENÉRICOS DE RESPALDO — REAPERTURA (DISENO_CALIBRACION_SDMO_IAO.md).
  //  Solo `minReportableN` tiene entrada aquí — todos los demás PENDIENTE_
  //  VALIDACION de arriba siguen exigiendo el valor explícito, sin cambio.
  //  Precedencia (mismo patrón que motor-piio/temporal.js:estabilidadSerie):
  //  CALIBRACION_PROPIA (opts[clave]) > CALIBRACION_GLOBAL
  //  (PENDIENTE_VALIDACION[clave]) > CALIBRACION_GENERICA (GENERICO[clave]).
  // ══════════════════════════════════════════════════════════════════════════
  var GENERICO = {
    // Umbral mínimo de N para reporte de grupo sin comprometer confidencialidad
    // — convención real de la industria de encuestas organizacionales
    // (WorkBuzz, 15Five, Effectory, Supermood: default N=5; Gallup: 4-5 según
    // configuración). NO derivada de datos de EFICIENCIA. La hipótesis interna
    // previa de este módulo ("N≥8-10 pre-piloto", §3.11 arriba) es MÁS
    // conservadora que este genérico — alternativa disponible si se prefiere
    // priorizar cautela sobre la convención de industria. Provisional hasta
    // calibración propia por organización.
    minReportableN: 5
  };
  var GENERICO_FUENTE = {
    minReportableN: 'Convención real de la industria de encuestas organizacionales ' +
      '(WorkBuzz/15Five/Effectory/Supermood: default N=5; Gallup: 4-5). NO derivada de ' +
      'datos de EFICIENCIA. La hipótesis interna previa ("N≥8-10 pre-piloto") es MÁS ' +
      'conservadora — alternativa disponible. Provisional hasta calibración propia por organización.'
  };

  function _param(opts, clave, ctxFn) {
    var v = (opts && opts[clave] !== undefined && opts[clave] !== null)
      ? opts[clave] : PENDIENTE_VALIDACION[clave];
    if ((v === null || v === undefined) && GENERICO[clave] !== undefined) {
      v = GENERICO[clave]; // CALIBRACION_GENERICA — solo para claves con entrada en GENERICO
    }
    if (v === null || v === undefined) {
      throw new Error('motor-iao: "' + clave + '" es PENDIENTE_VALIDACION — pásalo explícitamente en opts a ' +
        ctxFn + '(). El piloto fijará su valor.');
    }
    return v;
  }

  /** _paramOrigen(opts, clave) → 'CALIBRACION_PROPIA'|'CALIBRACION_GLOBAL'|'CALIBRACION_GENERICA'|null
   *  Compañera de _param — NO cambia su forma de retorno (Opción A,
   *  DISENO_CALIBRACION_SDMO_IAO.md §4.3) para no tocar los ~15 call sites
   *  existentes. Solo se usa donde hace falta trazar el origen (agregarNodo/
   *  agregarOrganizacion, §4.5) — asume que _param ya validó que hay valor. */
  function _paramOrigen(opts, clave) {
    if (opts && opts[clave] !== undefined && opts[clave] !== null) return 'CALIBRACION_PROPIA';
    if (PENDIENTE_VALIDACION[clave] !== null && PENDIENTE_VALIDACION[clave] !== undefined) return 'CALIBRACION_GLOBAL';
    if (GENERICO[clave] !== undefined) return 'CALIBRACION_GENERICA';
    return null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  1. CONTRATO DE ENTRADA — las 10 variables de ICE–IEH (§3.4)
  // ══════════════════════════════════════════════════════════════════════════
  //
  //  Escala 0–100 (las variables YA calculadas por el instrumento ICE–IEH).
  //  Los códigos cortos (EST, FOR...) son vocabulario COMPARTIDO a nivel de
  //  metadata — motor-ice-ieh.js declara ese mismo código en `prefijo` por
  //  cada pregunta (PREGUNTAS[i].prefijo) — no una colisión de nombres.
  //
  //  ESO NO SIGNIFICA que las claves coincidan directamente al conectar los
  //  dos módulos: `motor-ice-ieh.calcular().variables` expone las 10
  //  variables con claves en ESPAÑOL COMPLETO (estructura, fortaleza,
  //  coherencia...), no con estos códigos cortos. Cualquier código que
  //  conecte motor-ice-ieh con este módulo necesita un adaptador explícito
  //  claves-largas → códigos-cortos — NO puede asumir que basta con pasar
  //  el objeto `variables` de motor-ice-ieh tal cual. Verificado con datos
  //  reales (no sintéticos) en el primer arnés de integración real entre
  //  ambos módulos: motor-integracion/pipeline.js, commit bcaea53 — el
  //  adaptador ahí construido se deriva de motor-ice-ieh.PREGUNTAS/PARES,
  //  no está hardcodeado, así que sigue automáticamente cualquier cambio de
  //  nombre de variable en motor-ice-ieh.
  //
  var VARIABLES_SISTEMA     = ['EST', 'INE', 'IMP', 'NEX', 'ITG'];
  var VARIABLES_EXPERIENCIA = ['FOR', 'COH', 'EQU', 'CNF', 'ACT'];
  // Orden canónico para entrada por array (§3.4: primero Sistema, luego Experiencia).
  var VARIABLES = VARIABLES_SISTEMA.concat(VARIABLES_EXPERIENCIA);

  // ── Pesos de la fórmula global (§3.5). PRE-PILOTO — "Cerrado — pre-piloto"
  //    (§6.1); recalibración con datos propios pendiente (§6.2). Editar aquí
  //    si el piloto los recalibra — TODO lo demás se deriva de estos números.
  var PESOS = {
    // Relación Sistema / Experiencia — 30/70, hipótesis pre-piloto (§3.5, §6.2).
    sistema: 0.30,
    experiencia: 0.70,
    // Lado Sistema: ponderación UNIFORME (1/5 c/u) — sin evidencia para pesos
    // sistémicos diferenciales (§3.5).
    // Lado Experiencia: ponderación teórica diferenciada informada por evidencia
    // externa (§3.5). Suma 1.
    expVar: { FOR: 0.25, COH: 0.18, EQU: 0.25, CNF: 0.20, ACT: 0.12 }
  };

  // Coeficiente global de cada variable en la fórmula expandida del §3.5.
  //   Sistema:     .30 / 5           = .06  (idéntico para las 5)
  //   Experiencia: .70 · peso_exp                                (.175 .126 .175 .140 .084)
  function _coefSistema()          { return PESOS.sistema / VARIABLES_SISTEMA.length; }
  function _coefExperiencia(clave) { return PESOS.experiencia * PESOS.expVar[clave]; }

  // ── Pares (§3.6 / §3.7) — mismos 5 pares que ICE–IEH ──────────────────────
  //  Los pesos internos del par se DERIVAN de los coeficientes globales del
  //  §3.5 (exactos), NO se toman de los literales redondeados a 3 decimales que
  //  imprime el §3.6. Así el reensamblado del IAO desde los perfiles coincide
  //  con el cálculo directo hasta la precisión de punto flotante, no dentro de
  //  un margen de diseño (corrección de Luis, 2026-09-03).
  var PARES = [
    { clave: 'EF', nombre: 'Estructura ↔ Fortaleza', sistema: 'EST', experiencia: 'FOR' },
    { clave: 'IC', nombre: 'Intención ↔ Coherencia', sistema: 'INE', experiencia: 'COH' },
    { clave: 'IE', nombre: 'Impacto ↔ Equilibrio',   sistema: 'IMP', experiencia: 'EQU' },
    { clave: 'NC', nombre: 'Nexo ↔ Confianza',       sistema: 'NEX', experiencia: 'CNF' },
    { clave: 'IA', nombre: 'Integración ↔ Actitud',  sistema: 'ITG', experiencia: 'ACT' }
  ];
  PARES.forEach(function (par) {
    var cS = _coefSistema();                       // .06
    var cE = _coefExperiencia(par.experiencia);    // .70 · peso_exp
    par.coefSistema = cS;
    par.coefExperiencia = cE;
    par.pesoPar = cS + cE;                         // peso del par al reensamblar el IAO
    par.wSistema = cS / par.pesoPar;               // peso interno EXACTO (no .255 etc.)
    par.wExperiencia = cE / par.pesoPar;
  });

  // ══════════════════════════════════════════════════════════════════════════
  //  2. UTILIDADES
  // ══════════════════════════════════════════════════════════════════════════
  function esNumero(v) { return typeof v === 'number' && isFinite(v); }
  function promedio(a) { if (!a.length) return null; var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
  function desviacionEstandarPoblacional(a) {
    if (!a.length) return null;
    var m = promedio(a), s = 0;
    for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
    return Math.sqrt(s / a.length);
  }
  function percentil(a, p) {
    if (!a.length) return null;
    var s = a.slice().sort(function (x, y) { return x - y; });
    if (s.length === 1) return s[0];
    var rank = (s.length - 1) * (p / 100), lo = Math.floor(rank), hi = Math.ceil(rank);
    return lo === hi ? s[lo] : s[lo] + (rank - lo) * (s[hi] - s[lo]);
  }
  function minArr(a) { var m = Infinity; for (var i = 0; i < a.length; i++) if (a[i] < m) m = a[i]; return m; }
  function maxArr(a) { var m = -Infinity; for (var i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m; }
  function dispersionDescriptiva(a) {
    return {
      desviacionEstandar: desviacionEstandarPoblacional(a),
      iqr: a.length ? percentil(a, 75) - percentil(a, 25) : null,
      min: minArr(a), max: maxArr(a)
    };
  }

  /**
   * Normaliza y valida la entrada a { EST..ACT: número 0–100 }.
   * Acepta: objeto con las 10 claves, o array de 10 en orden
   * [EST, INE, IMP, NEX, ITG, FOR, COH, EQU, CNF, ACT].
   * @throws con el detalle de todas las variables faltantes / fuera de rango.
   */
  function validarVariables(entrada) {
    if (entrada == null || typeof entrada !== 'object') {
      throw new Error('motor-iao: se esperaba un objeto {EST..ACT} o un array de 10 variables (escala 0–100).');
    }
    if (Array.isArray(entrada) && entrada.length !== 10) {
      throw new Error('motor-iao: el array debe tener exactamente 10 variables en orden [' + VARIABLES.join(', ') + '].');
    }
    var out = {}, faltantes = [], invalidas = [];
    VARIABLES.forEach(function (k, i) {
      var v = Array.isArray(entrada) ? entrada[i]
        : (Object.prototype.hasOwnProperty.call(entrada, k) ? entrada[k] : undefined);
      if (v === undefined || v === null || v === '') { faltantes.push(k); return; }
      var n = typeof v === 'number' ? v : Number(v);
      if (!isFinite(n) || n < 0 || n > 100) { invalidas.push(k + '=' + JSON.stringify(v)); return; }
      out[k] = n;
    });
    if (faltantes.length || invalidas.length) {
      var partes = [];
      if (faltantes.length) partes.push('faltantes: ' + faltantes.join(', '));
      if (invalidas.length) partes.push('fuera de rango 0–100: ' + invalidas.join(', '));
      throw new Error('motor-iao: variables inválidas — ' + partes.join(' | '));
    }
    return out;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  3. TRANSFORMACIÓN A DÉFICIT  (§3.4)
  // ══════════════════════════════════════════════════════════════════════════
  //  D_X = 1 − X/100.   D_X=0 → sin déficit ; D_X=1 → déficit máximo.
  function deficit(x) { return 1 - x / 100; }

  /** Déficits de las 10 variables + D_S y D_E (§3.5). Uso interno. */
  function _deficits(v) {
    var D = {};
    VARIABLES.forEach(function (k) { D[k] = deficit(v[k]); });
    var D_S = (D.EST + D.INE + D.IMP + D.NEX + D.ITG) / 5;             // §3.5, uniforme
    var e = PESOS.expVar;
    var D_E = e.FOR * D.FOR + e.COH * D.COH + e.EQU * D.EQU + e.CNF * D.CNF + e.ACT * D.ACT; // §3.5, ponderado
    return { porVariable: D, D_S: D_S, D_E: D_E };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  4. IAO, PERFIL POR PAR, BRECHAS  (§3.5, §3.6, §3.7)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * IAO = 100 × [.30·D_S + .70·D_E]   (§3.5).
   * RECIBE SOLO LAS 10 VARIABLES. No hay ningún parámetro de brecha — por firma
   * de función, una brecha no puede modificar este resultado (§3.7).
   * @param {Object|Array} variables  las 10 variables ICE–IEH (0–100).
   * @returns {number}  IAO ∈ [0, 100]. Mayor IAO = configuración más compatible
   *          con activación defensiva (NO un % de Amenaza).
   */
  function calcularIAO(variables) {
    var d = _deficits(validarVariables(variables));
    return 100 * (PESOS.sistema * d.D_S + PESOS.experiencia * d.D_E);
  }

  /**
   * Perfil de activación por par (§3.6): A_j = 100 × [wS·D_S_var + wE·D_E_var].
   * `wS` / `wE` son los coeficientes globales del §3.5 normalizados dentro del
   * par, EXACTOS (derivados en tiempo de ejecución) — no los literales
   * redondeados a 3 decimales del §3.6. Reensamblar el IAO como
   * Σ pesoPar_j · A_j reproduce el cálculo directo salvo error de punto flotante.
   * @returns {{ A_EF, A_IC, A_IE, A_NC, A_IA }}  cada uno ∈ [0, 100].
   */
  function perfilPorPar(variables) {
    var v = validarVariables(variables), out = {};
    PARES.forEach(function (par) {
      out['A_' + par.clave] = 100 * (par.wSistema * deficit(v[par.sistema]) + par.wExperiencia * deficit(v[par.experiencia]));
    });
    return out;
  }

  /**
   * Brechas por par (§3.7): B_j = S_j − E_j en escala 0–100.
   *   B_j > 0 → la valoración del Sistema supera a la Experiencia.
   *   B_j < 0 → la Experiencia supera a la valoración del Sistema.
   * SE EXPONEN COMO DIAGNÓSTICO DE DESACOPLE. NO entran al cálculo del IAO
   * (§3.7) — ninguna función de este módulo que produzca el IAO las recibe.
   * @returns {{ B_EF, B_IC, B_IE, B_NC, B_IA }}
   */
  function calcularBrechas(variables) {
    var v = validarVariables(variables), out = {};
    PARES.forEach(function (par) { out['B_' + par.clave] = v[par.sistema] - v[par.experiencia]; });
    return out;
  }

  /**
   * Resultado completo para una Persona (§3.8: la Persona es la unidad de
   * cálculo, NO de diagnóstico — el IAO se reporta a nivel colectivo).
   * @returns {{ iao, deficits:{D_S,D_E,porVariable}, perfil, brechas, meta }}
   */
  function calcular(variables) {
    var v = validarVariables(variables);
    var d = _deficits(v);
    return {
      iao: 100 * (PESOS.sistema * d.D_S + PESOS.experiencia * d.D_E),
      deficits: { D_S: d.D_S, D_E: d.D_E, porVariable: d.porVariable },
      perfil: perfilPorPar(v),      // §3.6
      brechas: calcularBrechas(v),  // §3.7 — en paralelo, fuera del IAO
      meta: {
        instrumento: 'IAO', version: 'v1',
        variablesSistema: VARIABLES_SISTEMA.slice(),
        variablesExperiencia: VARIABLES_EXPERIENCIA.slice(),
        pesos: PESOS,
        nota: 'Pesos pre-piloto (§3.5/§3.6, §6.1). Sin umbrales Seguridad/Alerta/Amenaza (§6.2, pendientes).'
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  5. AGREGACIÓN COLECTIVA  (§3.9) + CONFIDENCIALIDAD (§3.11)
  // ══════════════════════════════════════════════════════════════════════════
  //  §3.9 SÍ especifica ambas fórmulas (a diferencia del SDMO §2.9):
  //     IAO_g   = Σ IAO_i / n_g                 (Personas con igual peso)
  //     IAO_ORG = Σ (N_g · IAO_g) / Σ N_g       (entre nodos)
  //  N_g = respondientes del nodo (no convocados) — misma decisión que SDMO:
  //  ponderar por convocados sería imputación encubierta (§3.10: la no-respuesta
  //  afecta la precisión, no el nivel).

  /**
   * Lectura de un nodo. §3.9: IAO_g = promedio simple de los IAO individuales.
   * @param {Array<number|null>} iaosIndividuales  IAO por Persona (null = no calculado / no-respuesta).
   * @param {Object} opts  { minReportableN (req.), convocados (opc.) }
   */
  function agregarNodo(iaosIndividuales, opts) {
    opts = opts || {};
    var minN = _param(opts, 'minReportableN', 'agregarNodo');
    var validos = iaosIndividuales.filter(esNumero);
    var n = validos.length;
    var convocados = esNumero(opts.convocados) ? opts.convocados : iaosIndividuales.length;
    var reportable = n >= minN;
    var res = {
      n: n, convocados: convocados,
      tasaRespuesta: convocados > 0 ? n / convocados : null,
      reportable: reportable,
      minReportableN_origen: _paramOrigen(opts, 'minReportableN'),
      iaoNodo: n ? promedio(validos) : null,          // §3.9
      dispersion: n ? dispersionDescriptiva(validos) : null
    };
    if (!reportable) {
      res.motivo = 'n (' + n + ') < minReportableN (' + minN + ') — el nodo no genera reporte propio (§3.11); ' +
        'sus IAO individuales se agregan al nivel superior.';
      res.iaosParaAgregar = validos.slice();
    }
    return res;
  }

  var CLAVES_A = PARES.map(function (p) { return 'A_' + p.clave; });
  var CLAVES_B = PARES.map(function (p) { return 'B_' + p.clave; });

  var DISENOS_MUESTRALES = ['CENSO', 'ALEATORIO', 'CONVENIENCIA', 'UNKNOWN'];

  /**
   * Clasificación de PRECISIÓN (§3.9 / §6.2) — grado de confianza en el nivel
   * reportado. Acompaña al IAO; NO lo modifica.
   *
   * REGLA DE COMPUERTA (todas las condiciones, NO de mayoría):
   *   BAJA  si  N < precisionNMinCatastrofico
   *         ∨ tasa_respuesta < precisionTasaMinCatastrofica
   *         ∨ disenoMuestral ∈ {CONVENIENCIA, UNKNOWN}
   *         ∨ dispersionPoolIao ≥ precisionCorteDispersionAlta   (dispersión "alta")
   *   ALTA  si  N ≥ precisionNAlto
   *         ∧ tasa_respuesta ≥ precisionTasaAlta
   *         ∧ disenoMuestral ∈ {CENSO, ALEATORIO}
   *         ∧ dispersionPoolIao < precisionCorteDispersionMedia   (dispersión "baja")
   *   MEDIA en cualquier otro caso — incluye dispersión "media"
   *         (precisionCorteDispersionMedia ≤ dispPool < precisionCorteDispersionAlta):
   *         no es catastrófica, pero impide ALTA. §3.9 prevé baja/media/alta.
   *
   * `UNKNOWN` cuenta como catastrófico junto a `CONVENIENCIA`: sin evidencia de
   * cómo se recolectaron los datos, no se asume lo favorable. `diseño_muestral`
   * es binario a propósito — no se suaviza (decisión de Luis).
   *
   * `representatividad` (§3.9) queda FUERA de la compuerta —
   * PENDIENTE_FORMALIZACION: requiere una estructura poblacional de referencia
   * que el sistema aún no modela; no falta el número, falta el concepto de dato.
   *
   * @param {{n:number, convocados:number, disenoMuestral?:string, dispersionPoolIao:number}} datos
   * @param {Object} opts  los 6 umbrales PENDIENTE_VALIDACION (requeridos).
   * @returns {{ nivel:'ALTA'|'MEDIA'|'BAJA', factores:Object, representatividad:'PENDIENTE_FORMALIZACION' }}
   */
  function clasificarPrecision(datos, opts) {
    opts = opts || {};
    var nMinCat = _param(opts, 'precisionNMinCatastrofico', 'clasificarPrecision');
    var nAlto = _param(opts, 'precisionNAlto', 'clasificarPrecision');
    var tasaMinCat = _param(opts, 'precisionTasaMinCatastrofica', 'clasificarPrecision');
    var tasaAlta = _param(opts, 'precisionTasaAlta', 'clasificarPrecision');
    var corteMedia = _param(opts, 'precisionCorteDispersionMedia', 'clasificarPrecision');
    var corteAlta = _param(opts, 'precisionCorteDispersionAlta', 'clasificarPrecision');

    var N = datos.n;
    var convocados = datos.convocados;
    var tasa = (esNumero(convocados) && convocados > 0) ? N / convocados : null;
    var diseno = DISENOS_MUESTRALES.indexOf(datos.disenoMuestral) !== -1 ? datos.disenoMuestral : 'UNKNOWN';
    var dispIao = datos.dispersionPoolIao;
    var nivelDisp = !esNumero(dispIao) ? 'desconocida'
      : (dispIao >= corteAlta ? 'alta' : (dispIao >= corteMedia ? 'media' : 'baja'));

    var catastroficos = [];
    if (!(esNumero(N) && N >= nMinCat)) catastroficos.push('N (' + N + ') < ' + nMinCat);
    if (!(esNumero(tasa) && tasa >= tasaMinCat)) catastroficos.push('tasa_respuesta (' + (tasa == null ? '—' : tasa.toFixed(3)) + ') < ' + tasaMinCat);
    if (diseno === 'CONVENIENCIA' || diseno === 'UNKNOWN') catastroficos.push('diseño_muestral = ' + diseno);
    if (nivelDisp === 'alta') catastroficos.push('dispersionPoolIao (' + dispIao.toFixed(2) + ') ≥ ' + corteAlta + ' (alta)');

    var esAlta = (esNumero(N) && N >= nAlto) &&
      (esNumero(tasa) && tasa >= tasaAlta) &&
      (diseno === 'CENSO' || diseno === 'ALEATORIO') &&
      nivelDisp === 'baja';

    var nivel = catastroficos.length ? 'BAJA' : (esAlta ? 'ALTA' : 'MEDIA');

    return {
      nivel: nivel,
      factores: {
        n: N, convocados: convocados, tasaRespuesta: tasa,
        disenoMuestral: diseno, dispersionPoolIao: dispIao, nivelDispersion: nivelDisp,
        catastroficos: catastroficos
      },
      representatividad: 'PENDIENTE_FORMALIZACION'
    };
  }

  function _precisionParamsDisponibles(opts) {
    return opts &&
      opts.precisionNMinCatastrofico != null && opts.precisionNAlto != null &&
      opts.precisionTasaMinCatastrofica != null && opts.precisionTasaAlta != null &&
      opts.precisionCorteDispersionMedia != null && opts.precisionCorteDispersionAlta != null;
  }

  /**
   * Agregación a nivel ORGANIZACIÓN (§3.9 + §3.11) — nivel + perfil + brechas.
   *
   * CONTRATO: cada nodo aporta los DATOS POR PERSONA (`personas`: las 10
   * variables de cada Persona), no un IAO ya calculado. A diferencia del SDMO
   * —donde el IDA depende de δ (pendiente) y por eso se pasaban IDAs
   * pre-calculados— el IAO se deriva por completo de las 10 variables, así que
   * la organización se calcula desde los datos por Persona.
   *
   *   IAO_ORG   = Σ (n_g · IAO_g) / Σ n_g                     (§3.9)
   *   perfilOrg — por par: media del pool + dispersión (pool y entre nodos).
   *   brechasOrg — §3.9 PROHÍBE promediar brechas ("(+40)+(−40)→0 no es
   *               alineación sino polarización"). Por par se reporta DOS
   *               dispersiones y DOS rangos, porque no viven en la misma escala:
   *                 · entreNodos — sobre las medias de los nodos reportables
   *                   (la señal de fractura estructural);
   *                 · pool — sobre todos los individuos (within + between).
   *               Cada una con su propio veredicto `polarizacion.{entreNodos,pool}`
   *               (bool), que solo existe si su umbral respectivo está fijado
   *               (`umbralPolarizacionEntreNodos` / `umbralPolarizacionPool`);
   *               si no, `null` — las dispersiones crudas SIEMPRE se reportan.
   *   organizacion.precision — clasificación de PRECISIÓN (§3.9). Solo si los 5
   *               umbrales PENDIENTE_VALIDACION están en opts; si no, `null`.
   *
   * MECANISMO DE ANONIMIZACIÓN — idéntico a motor-sdmo/agregarOrganizacion:
   *  · pools planos y anónimos (sin nodo_origen), NO se devuelven;
   *  · perfilPorNodo en paralelo, CON id; nodo n<minReportableN sin estadísticas;
   *  · exclusión posterior vía opts.excluirNodos, nunca cirugía sobre el pool.
   *
   * @param {Array<{id?:string, personas:Array<Object|Array>, convocados?:number}>} nodos
   * @param {Object} opts  { minReportableN (req.), excluirNodos (opc.),
   *                          umbralPolarizacionEntreNodos (opc.),
   *                          umbralPolarizacionPool (opc.),
   *                          disenoMuestral (opc.), y los 6 umbrales de precisión (opc.) }
   */
  function agregarOrganizacion(nodos, opts) {
    opts = opts || {};
    var minN = _param(opts, 'minReportableN', 'agregarOrganizacion');
    var uPolEntre = (opts.umbralPolarizacionEntreNodos != null) ? opts.umbralPolarizacionEntreNodos : null;
    var uPolPool = (opts.umbralPolarizacionPool != null) ? opts.umbralPolarizacionPool : null;
    var excluir = (opts.excluirNodos) ? opts.excluirNodos.slice() : [];

    // Pools anónimos de individuos (sin nodo_origen). No se devuelven.
    var poolIao = [];
    var poolA = {}; CLAVES_A.forEach(function (k) { poolA[k] = []; });
    var poolB = {}; CLAVES_B.forEach(function (k) { poolB[k] = []; });

    var convocadosTotal = 0, perfilPorNodo = [], excluidos = [];
    var sumaNgIaog = 0, sumaNg = 0;
    var brechaPorNodo = {}; CLAVES_B.forEach(function (k) { brechaPorNodo[k] = []; });
    var perfilPorNodoMedias = {}; CLAVES_A.forEach(function (k) { perfilPorNodoMedias[k] = []; });
    // varianza de muestreo de cada media de nodo: s²_g / n_g  — para el ajuste
    // por sesgo de muestra finita de dispersionEntreNodos (HALLAZGOS H1/H2).
    var brechaVarSobreN = {}; CLAVES_B.forEach(function (k) { brechaVarSobreN[k] = []; });
    var perfilVarSobreN = {}; CLAVES_A.forEach(function (k) { perfilVarSobreN[k] = []; });

    nodos.forEach(function (nodo, idx) {
      var id = nodo.id != null ? nodo.id : ('nodo_' + idx);
      if (excluir.indexOf(id) !== -1) { excluidos.push(id); return; }

      var personas = nodo.personas || [];
      convocadosTotal += esNumero(nodo.convocados) ? nodo.convocados : personas.length;

      var iaosN = [], aN = {}, bN = {};
      CLAVES_A.forEach(function (k) { aN[k] = []; });
      CLAVES_B.forEach(function (k) { bN[k] = []; });
      personas.forEach(function (pv) {
        var r = calcular(pv);                          // valida + calcula iao/perfil/brechas
        iaosN.push(r.iao); poolIao.push(r.iao);
        CLAVES_A.forEach(function (k) { aN[k].push(r.perfil[k]); poolA[k].push(r.perfil[k]); });
        CLAVES_B.forEach(function (k) { bN[k].push(r.brechas[k]); poolB[k].push(r.brechas[k]); });
      });

      var nG = iaosN.length;
      if (nG) { sumaNgIaog += nG * promedio(iaosN); sumaNg += nG; }

      if (nG >= minN) {
        var perfilN = {}, brechasN = {};
        CLAVES_A.forEach(function (k) {
          perfilN[k] = promedio(aN[k]);
          perfilPorNodoMedias[k].push(perfilN[k]);
          var sA = desviacionEstandarPoblacional(aN[k]) || 0;
          perfilVarSobreN[k].push(sA * sA / nG);
        });
        CLAVES_B.forEach(function (k) {
          brechasN[k] = promedio(bN[k]);
          brechaPorNodo[k].push({ id: id, valor: brechasN[k] });
          var sB = desviacionEstandarPoblacional(bN[k]) || 0;
          brechaVarSobreN[k].push(sB * sB / nG);
        });
        perfilPorNodo.push({
          id: id, reportable: true, n: nG,
          iaoNodo: promedio(iaosN),
          perfil: perfilN, brechas: brechasN,
          dispersionIao: dispersionDescriptiva(iaosN)
        });
      } else {
        perfilPorNodo.push({
          id: id, reportable: false, nAportadoAlPool: nG,
          nota: 'n (' + nG + ') < minReportableN (' + minN + ') — sin estadísticas propias (§3.11); ' +
            nG + ' respondientes aportados al pool organizacional anónimo.'
        });
      }
    });

    var n = poolIao.length;

    // std de una lista con < 2 elementos = 0 (no hay variación observable).
    function stdSeguro(a) { return a.length ? desviacionEstandarPoblacional(a) : null; }
    function rangoSeguro(a) { return a.length ? [minArr(a), maxArr(a)] : null; }

    // Dispersión ENTRE NODOS ajustada por sesgo de muestra finita (HALLAZGOS H1/H2):
    //   d_ajustada² = max(0,  Var(medias_de_nodo)  −  mean_g( s²_g / n_g ) )
    // resta el piso de ruido de muestreo de cada media de nodo. Con < 2 nodos
    // reportables no hay varianza entre-nodos observable → 0.
    function dispEntreNodosAjustada(medias, varsSobreN) {
      if (medias.length < 2) return 0;
      var s = desviacionEstandarPoblacional(medias) || 0;
      var ruidoMuestral = promedio(varsSobreN) || 0;
      return Math.sqrt(Math.max(0, s * s - ruidoMuestral));
    }

    var perfilOrg = null;
    if (n) {
      perfilOrg = {};
      CLAVES_A.forEach(function (k) {
        perfilOrg[k] = {
          media: promedio(poolA[k]),
          dispersionPool: stdSeguro(poolA[k]),
          dispersionEntreNodos: stdSeguro(perfilPorNodoMedias[k]),                    // cruda, visible
          dispersionEntreNodosAjustada: dispEntreNodosAjustada(perfilPorNodoMedias[k], perfilVarSobreN[k])
        };
      });
    }

    var brechasOrg = null;
    if (n) {
      brechasOrg = {};
      CLAVES_B.forEach(function (k) {
        var mediasNodo = brechaPorNodo[k].map(function (x) { return x.valor; });
        var dEntre = stdSeguro(mediasNodo);                                          // cruda, visible
        var dEntreAj = dispEntreNodosAjustada(mediasNodo, brechaVarSobreN[k]);        // ajustada — la que gobierna el veredicto
        var dPool = stdSeguro(poolB[k]);
        brechasOrg[k] = {
          porNodo: brechaPorNodo[k].slice(),           // media de cada nodo reportable
          mediaPool: promedio(poolB[k]),               // contextualizada, nunca sola (§3.9)
          dispersionEntreNodos: dEntre,                // std cruda de las medias de nodo
          dispersionEntreNodosAjustada: dEntreAj,      // corregida por sesgo de muestra finita
          dispersionPool: dPool,                       // std sobre todos los individuos
          rangoEntreNodos: rangoSeguro(mediasNodo),
          rangoPool: rangoSeguro(poolB[k]),
          umbralPolarizacionEntreNodos: uPolEntre,
          umbralPolarizacionPool: uPolPool,
          polarizacion: {
            entreNodos: (uPolEntre == null || mediasNodo.length < 2) ? null : (dEntreAj > uPolEntre),
            pool: (uPolPool == null || dPool == null) ? null : (dPool > uPolPool)
          }
        };
      });
    }

    var dispersionIao = n ? dispersionDescriptiva(poolIao) : null;
    var precision = null;
    if (n && _precisionParamsDisponibles(opts)) {
      precision = clasificarPrecision({
        n: n,
        convocados: convocadosTotal,
        disenoMuestral: opts.disenoMuestral,
        dispersionPoolIao: dispersionIao ? dispersionIao.desviacionEstandar : null
      }, opts);
    }

    return {
      organizacion: {
        n: n,
        convocados: convocadosTotal,
        tasaRespuesta: convocadosTotal > 0 ? n / convocadosTotal : null,
        reportable: n >= minN,
        minReportableN_origen: _paramOrigen(opts, 'minReportableN'),
        iaoOrg: sumaNg ? sumaNgIaog / sumaNg : null,     // Σ(n_g·IAO_g)/Σn_g (§3.9)
        dispersionIao: dispersionIao,
        perfilOrg: perfilOrg,
        brechasOrg: brechasOrg,
        precision: precision                            // §3.9 — acompaña al IAO, no lo modifica
      },
      perfilPorNodo: perfilPorNodo,
      nodosExcluidos: excluidos
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  6. API PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════
  return {
    // contrato y constantes
    VARIABLES: VARIABLES,
    VARIABLES_SISTEMA: VARIABLES_SISTEMA,
    VARIABLES_EXPERIENCIA: VARIABLES_EXPERIENCIA,
    PARES: PARES,
    PESOS: PESOS,
    DISENOS_MUESTRALES: DISENOS_MUESTRALES,
    PENDIENTE_VALIDACION: PENDIENTE_VALIDACION,
    GENERICO: GENERICO,
    GENERICO_FUENTE: GENERICO_FUENTE,

    // cálculo individual (§3.4–3.7)
    deficit: deficit,
    validarVariables: validarVariables,
    calcularIAO: calcularIAO,        // SOLO recibe variables — nunca brechas
    perfilPorPar: perfilPorPar,
    calcularBrechas: calcularBrechas,
    calcular: calcular,

    // agregación colectiva (§3.9) y confidencialidad (§3.11)
    agregarNodo: agregarNodo,
    agregarOrganizacion: agregarOrganizacion,
    clasificarPrecision: clasificarPrecision,   // §3.9 — regla de compuerta

    // utilidades expuestas para pruebas
    percentil: percentil,
    desviacionEstandarPoblacional: desviacionEstandarPoblacional
  };
});
