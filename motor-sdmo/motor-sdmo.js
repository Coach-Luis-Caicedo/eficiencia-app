/**
 * ============================================================================
 *  MOTOR DE CÁLCULO — SDMO (Sensor Diario de Modo Operativo) + IDA
 * ============================================================================
 *
 *  Fuente de verdad: docs/DOCUMENTO_TECNICO_SDMO_IAO_v1.md, secciones 2.1–2.10.
 *  (La sección 3 en adelante es IAO — NO forma parte de este módulo.)
 *
 *  MÓDULO AISLADO — mismo criterio que motor-ice-ieh/:
 *    · No toca ningún código de producción (encuestas de clima / pulso incluidas).
 *    · No implementa IAO ni el AIE.
 *    · No se integra a producción hasta aprobación explícita tras revisar la
 *      batería de verificación (motor-sdmo.test.js).
 *
 *  REIMPLEMENTACIÓN, NO DEPENDENCIA CRUZADA. La lógica de "racha de trayectoria
 *  sostenida" (rachaTrayectoria / trayectoria) está REIMPLEMENTADA en JS aquí
 *  dentro. NO se importa nada de aie_validation_kit/ (que es código de PRUEBA en
 *  Python, no producción). engine_core.py:trajectory_run() se usó únicamente como
 *  referencia conceptual de la corrección; no hay `require` ni llamada a Python.
 *
 *  CORRECCIÓN DE PERSISTENCIA (obligatoria, no está en el documento base).
 *  La prueba de estrés del AIE (HALLAZGOS_PRUEBA_ESTRES_AIE.md §3, casos 3 y 11)
 *  detectó que la persistencia CATEGÓRICA pura se resetea justo en el instante
 *  en que la serie cruza de una categoría F/I/D a otra — exactamente cuando se
 *  necesita detectar el cambio. La misma mecánica aplica al SDMO (§2.5, §2.7).
 *  Este módulo implementa desde el principio:
 *
 *      persistencia = (persistencia_categórica  >= PERSIST_MIN)
 *                     OR
 *                     (racha_de_trayectoria_sostenida >= PERSIST_RUN_MIN)
 *
 *  donde la "racha de trayectoria" cuenta períodos consecutivos con la
 *  trayectoria (pendiente sobre ventana móvil) en la MISMA dirección, no
 *  períodos consecutivos en la misma categoría.
 *
 *  PARÁMETROS PENDIENTES DE VALIDACIÓN (§6.2). Ninguno se fija en esta versión.
 *  Todos viven en PENDIENTE_VALIDACION (abajo), valen `null`, y las funciones que
 *  los necesitan EXIGEN que se pasen explícitamente en `opts` — lanzan Error si
 *  faltan. Así, ningún cálculo puede "colarse" con un valor inventado:
 *      δ, TREND_WINDOW, CAMBIO_MINIMO, PERSIST_MIN, PERSIST_RUN_MIN,
 *      UMBRAL_FAVORABLE, UMBRAL_DETERIORADO, MIN_REPORTABLE_N,
 *      PERCENTIL_CONCENTRACION, UMBRAL_CONCENTRACION.
 * ============================================================================
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MotorSDMO = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ══════════════════════════════════════════════════════════════════════════
  //  0. PARÁMETROS PENDIENTES DE VALIDACIÓN — §6.2. NO se fijan aquí.
  // ══════════════════════════════════════════════════════════════════════════
  //
  //  Cada función que necesita uno de estos lo lee de `opts` (o de este objeto
  //  si alguien lo sobrescribe deliberadamente). Mientras valgan `null`, la
  //  función lanza Error pidiendo el valor explícito. El piloto los fijará.
  //
  var PENDIENTE_VALIDACION = {
    // δ — ponderación extensión (M_i) vs. concentración (C_i) en el IDA
    //     individual. §2.6. "No existe todavía evidencia para afirmar que
    //     extensión y concentración deban pesar 50/50 o en otra proporción."
    delta: null,

    // Ventana móvil (nº de períodos) para estimar la pendiente de la
    // trayectoria del IDA. §2.7. En engine_core.py el placeholder de prueba
    // era 3; aquí NO se fija ninguno.
    trendWindow: null,

    // Cambio mínimo detectable: magnitud de pendiente (por período, en la
    // misma escala que la serie) por debajo de la cual la trayectoria se
    // considera "estable". §2.7 ("cambio abrupto", "cambio relevante").
    cambioMinimo: null,

    // Persistencia categórica: nº de períodos consecutivos en la misma
    // categoría F/I/D para considerar la señal "persistente". §2.5, §2.7.
    persistMin: null,

    // Racha de trayectoria sostenida: nº de períodos consecutivos con la
    // trayectoria en la misma dirección. §2.7 + corrección de la prueba de
    // estrés (HALLAZGOS_PRUEBA_ESTRES_AIE.md §3).
    persistRunMin: null,

    // Cortes de categoría del IDA. §2.7 dice explícitamente que NO se fijan
    // valores como "65" o "75" sin evidencia del piloto.
    //   IDA <= umbralFavorable      → 'F' (favorable / menor restricción)
    //   IDA >= umbralDeteriorado    → 'D' (deteriorado / mayor restricción)
    //   intermedio                  → 'I'
    umbralFavorable: null,
    umbralDeteriorado: null,

    // Confidencialidad: N mínimo de Personas para que un nodo genere reporte
    // propio. §2.10 ("N ≥ 8–10" es hipótesis operativa pre-piloto).
    minReportableN: null,

    // Concentración colectiva (§2.9): percentil a usar (p. ej. 75, 90). El
    // documento NO fija cuál. "La fórmula exacta de concentración colectiva
    // —qué percentil, qué umbral— queda para el piloto."
    percentilConcentracion: null,

    // Concentración colectiva (§2.9): umbral para "proporción de Personas por
    // encima de X". Opcional; si no se pasa, no se calcula esa proporción.
    umbralConcentracion: null,

    // Estimador de la pendiente de la trayectoria sobre la ventana móvil.
    // §2.7 solo dice "pendiente sobre una ventana móvil"; qué método concreto
    // (mínimos cuadrados / regresión robusta / Theil–Sen / diferencia
    // extremo-a-extremo) queda PENDIENTE_VALIDACION — misma categoría que δ y
    // persistRunMin. Es una función `(xs, ys) => number`. Se exporta
    // `pendienteLineal` (mínimos cuadrados) para pasarla explícitamente.
    estimadorPendiente: null
  };

  function _param(opts, clave, ctxFn) {
    var v = (opts && opts[clave] !== undefined && opts[clave] !== null)
      ? opts[clave]
      : PENDIENTE_VALIDACION[clave];
    if (v === null || v === undefined) {
      throw new Error(
        'motor-sdmo: "' + clave + '" es PENDIENTE_VALIDACION — pásalo explícitamente en opts a ' +
        ctxFn + '(). El piloto fijará su valor; este módulo no inventa uno.');
    }
    return v;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  1. LAS CUATRO DIMENSIONES Y SUS REACTIVOS  (§2.3, §2.4)
  // ══════════════════════════════════════════════════════════════════════════
  //
  //  Nomenclatura VIGENTE: ACTUAR / COMUNICAR / INVOLUCRARSE / PENSAR.
  //  La nomenclatura histórica (Confianza/Colaboración/Compromiso/Creatividad)
  //  e "INTERACTUAR" quedan DESCARTADAS (§2.3, §5) — no aparecen en este módulo.
  //
  //  Cada reactivo es bipolar en escala 1–5. Los dos polos construyen juntos el
  //  significado del continuo; no se leen como afirmaciones independientes.
  //  Convención de escala (§2.5): 1 = máxima proximidad al polo 1;
  //  5 = máxima proximidad al polo 2 (mayor restricción operacional).
  //
  var DIMENSIONES = [
    {
      codigo: 'ACU', nombre: 'ACTUAR',
      observa: 'Disponibilidad para iniciar, decidir y ejecutar la acción sin inhibiciones relevantes.',
      polo1: 'Hice lo que consideré que debía.',
      polo5: 'No hice algo que sabía que debía hacer.'
    },
    {
      codigo: 'COM', nombre: 'COMUNICAR',
      observa: 'Disponibilidad para expresar aquello que la Persona reconoce como importante, en vez de callarlo.',
      polo1: 'Dije lo que creí importante.',
      polo5: 'Me callé aunque sabía que era importante decirlo.'
    },
    {
      codigo: 'INV', nombre: 'INVOLUCRARSE',
      observa: 'Disposición para aportar atención, energía y compromiso real, más allá del cumplimiento mecánico.',
      polo1: 'Le puse corazón a lo que hice.',
      polo5: 'Hice solo lo que me tocaba, nada más.'
    },
    {
      codigo: 'PEN', nombre: 'PENSAR',
      observa: 'Disponibilidad cognitiva para comprender, decidir, concentrarse y resolver.',
      polo1: 'Mi mente estaba clara.',
      polo5: 'Me costó pensar con claridad.'
    }
  ];
  var CODIGOS = DIMENSIONES.map(function (d) { return d.codigo; }); // ['ACU','COM','INV','PEN']

  // Prefijos de sensor reservados por el instrumento ICE–IEH (motor-ice-ieh/).
  // Se declara aquí solo para verificar en pruebas que NO hay colisión.
  var CODIGOS_RESERVADOS_ICE_IEH = ['EST', 'FOR', 'INE', 'COH', 'IMP', 'EQU', 'NEX', 'CNF', 'ITG', 'ACT'];

  // ══════════════════════════════════════════════════════════════════════════
  //  2. UTILIDADES NUMÉRICAS
  // ══════════════════════════════════════════════════════════════════════════

  function promedio(a) {
    if (!a.length) return null;
    var s = 0; for (var i = 0; i < a.length; i++) s += a[i];
    return s / a.length;
  }
  function desviacionEstandarPoblacional(a) {
    if (a.length < 1) return null;
    var m = promedio(a), s = 0;
    for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
    return Math.sqrt(s / a.length);
  }
  /** Percentil por interpolación lineal entre rangos contiguos (método por
   *  defecto de numpy.percentile). p en [0,100]. */
  function percentil(a, p) {
    if (!a.length) return null;
    var s = a.slice().sort(function (x, y) { return x - y; });
    if (s.length === 1) return s[0];
    var rank = (s.length - 1) * (p / 100);
    var lo = Math.floor(rank), hi = Math.ceil(rank);
    if (lo === hi) return s[lo];
    return s[lo] + (rank - lo) * (s[hi] - s[lo]);
  }
  function rangoIntercuartil(a) {
    if (a.length < 1) return null;
    return percentil(a, 75) - percentil(a, 25);
  }
  function minArr(a) { var m = Infinity; for (var i = 0; i < a.length; i++) if (a[i] < m) m = a[i]; return m; }
  function maxArr(a) { var m = -Infinity; for (var i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m; }
  function dispersionDescriptiva(a) {
    return {
      desviacionEstandar: desviacionEstandarPoblacional(a),
      iqr: rangoIntercuartil(a),
      min: minArr(a),
      max: maxArr(a)
    };
  }
  /** Pendiente de la recta de mínimos cuadrados sobre los puntos (xs[k], ys[k]).
   *  Es UNA opción de `estimadorPendiente` (PENDIENTE_VALIDACION) — se pasa
   *  explícitamente a `trayectoria`; el módulo no la fija como método único. */
  function pendienteLineal(xs, ys) {
    var n = xs.length;
    if (n < 2) return null;
    var mx = promedio(xs), my = promedio(ys), num = 0, den = 0;
    for (var i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) * (xs[i] - mx); }
    return den === 0 ? 0 : num / den;
  }
  function esNumero(v) { return typeof v === 'number' && isFinite(v); }

  // ══════════════════════════════════════════════════════════════════════════
  //  3. NORMALIZACIÓN  (§2.5)
  // ══════════════════════════════════════════════════════════════════════════
  //
  //  z = (x − 1) / 4    escala 1–5 → [0, 1], por cada una de las 4 dimensiones.
  //  z NO representa "porcentaje de Amenaza": es la posición normalizada de la
  //  respuesta hacia el polo de mayor restricción operacional de esa dimensión.
  //
  function normalizar(x) {
    return (x - 1) / 4;
  }

  /**
   * Valida una respuesta individual del SDMO.
   * @param {Object|Array|null|undefined} resp  {ACU,COM,INV,PEN} 1–5, o array de 4,
   *   o null/undefined = NO-RESPUESTA (§2.8 — nunca se imputa).
   * @returns {{ACU,COM,INV,PEN}|null}  el objeto validado, o null si es no-respuesta
   *   (total O parcial — ver decisión abajo).
   * @throws solo si hay valores presentes fuera del rango 1–5 (entero), o si un
   *   array no tiene exactamente 4 posiciones.
   *
   * DECISIÓN CERRADA (mismo principio epistemológico que §2.8 y que el ítem
   * equivalente en ICE–IEH): NO se imputa. Si NO están las 4 respuestas —falten
   * 1, 2, 3 o las 4— ese período NO genera IDA: se trata como **no-respuesta
   * completa** (devuelve `null`, entra a `TasaRespuesta` como ausencia), nunca
   * como IDA parcial ni con relleno. Solo los valores *presentes* pero
   * malformados (fuera de 1–5, no enteros) lanzan `Error` — eso es corrupción
   * de datos, no una elección de participación.
   */
  function validarRespuestaIndividual(resp) {
    if (resp === null || resp === undefined) return null;

    var obj = {};
    if (Array.isArray(resp)) {
      if (resp.length !== 4) {
        throw new Error('motor-sdmo: el array de respuesta debe tener 4 valores [ACU, COM, INV, PEN].');
      }
      CODIGOS.forEach(function (c, i) { obj[c] = resp[i]; });
    } else if (typeof resp === 'object') {
      CODIGOS.forEach(function (c) { obj[c] = resp[c]; });
    } else {
      throw new Error('motor-sdmo: respuesta individual inválida (se esperaba objeto {ACU,COM,INV,PEN}, array de 4, o null).');
    }

    var invalidas = [], presentes = 0;
    CODIGOS.forEach(function (c) {
      var v = obj[c];
      if (v === undefined || v === null || v === '') return;   // dimensión sin responder
      presentes++;
      var n = typeof v === 'number' ? v : Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 5) invalidas.push(c + '=' + JSON.stringify(v));
      else obj[c] = n;
    });

    // Valores presentes pero malformados → error (corrupción, no participación).
    if (invalidas.length) {
      throw new Error('motor-sdmo: respuesta individual inválida — fuera de rango 1–5 (entero): ' + invalidas.join(', '));
    }
    // Faltan respuestas (parcial o total) → no-respuesta completa, sin imputar.
    if (presentes < 4) return null;
    return obj;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  4. CÁLCULO DEL IDA  (§2.6)
  // ══════════════════════════════════════════════════════════════════════════
  //
  //  M_i   = promedio(z_ACU, z_COM, z_INV, z_PEN)          — extensión general
  //  C_i   = segundo valor más alto de las 4 z             — concentración multidim.
  //          (= z_(3) al ordenar z_(1) ≤ z_(2) ≤ z_(3) ≤ z_(4))
  //  IDA_i = 100 × [δ·M_i + (1−δ)·C_i]
  //
  //  C_i sube de forma relevante solo cuando AL MENOS DOS dimensiones presentan
  //  valores elevados — evita que una sola dimensión extrema domine el índice.
  //
  //  δ es PENDIENTE_VALIDACION (§2.6): debe pasarse en opts.delta.
  //
  /**
   * @param {Object|Array|null} resp  respuesta individual (o no-respuesta).
   * @param {Object} opts  { delta } — requerido.
   * @returns {{
   *   respondio: boolean,
   *   z: {ACU,COM,INV,PEN}|null,
   *   M: number|null, C: number|null, IDA: number|null,
   *   delta: number|null
   * }}
   *  Si es no-respuesta: respondio=false y TODO lo demás null. El IDA NUNCA se
   *  calcula como 0 ni como ningún valor de deterioro para una no-respuesta (§2.8).
   */
  function calcularIDA(resp, opts) {
    var r = validarRespuestaIndividual(resp);
    if (r === null) {
      return { respondio: false, z: null, M: null, C: null, IDA: null, delta: null };
    }
    var delta = _param(opts, 'delta', 'calcularIDA');

    var z = {};
    CODIGOS.forEach(function (c) { z[c] = normalizar(r[c]); });

    var ordenados = CODIGOS.map(function (c) { return z[c]; }).sort(function (a, b) { return a - b; });
    var M = promedio(ordenados);
    var C = ordenados[2];                 // z_(3): segundo mayor de las cuatro
    var IDA = 100 * (delta * M + (1 - delta) * C);

    return { respondio: true, z: z, M: M, C: C, IDA: IDA, delta: delta };
  }

  /**
   * Convierte una lista de respuestas por período (cada una {ACU..}|array|null)
   * en la serie de IDA correspondiente (number|null por período).
   */
  function calcularSerieIDA(respuestasPorPeriodo, opts) {
    return respuestasPorPeriodo.map(function (resp) { return calcularIDA(resp, opts).IDA; });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  5. NO-RESPUESTA  (§2.8)  — serie independiente de participación
  // ══════════════════════════════════════════════════════════════════════════
  //
  //  NO RESPUESTA ⇏ AMENAZA. No modifica el IDA. Se registra aparte:
  //  TasaRespuesta_{nodo,t} = respuestas válidas / Personas convocadas
  //
  function tasaRespuesta(respuestasValidas, personasConvocadas) {
    if (!esNumero(personasConvocadas) || personasConvocadas <= 0) return null;
    return respuestasValidas / personasConvocadas;
  }

  /** Serie de tasa de respuesta a partir de [{validas, convocadas}, ...]. */
  function calcularSerieTasaRespuesta(serie) {
    return serie.map(function (p) { return tasaRespuesta(p.validas, p.convocadas); });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  6. CATEGORÍA, TRAYECTORIA Y PERSISTENCIA  (§2.7 + corrección)
  // ══════════════════════════════════════════════════════════════════════════

  /** Categoría F / I / D de un valor de IDA. Cortes PENDIENTE_VALIDACION. */
  function categoria(ida, opts) {
    if (!esNumero(ida)) return null;
    var f = _param(opts, 'umbralFavorable', 'categoria');
    var d = _param(opts, 'umbralDeteriorado', 'categoria');
    if (ida <= f) return 'F';
    if (ida >= d) return 'D';
    return 'I';
  }

  /**
   * Trayectoria del IDA en el período t, a partir de la pendiente estimada sobre
   * la ventana móvil [t−trendWindow+1, t]. Los períodos sin dato (null) se
   * saltan; se estima sobre los puntos disponibles con su índice temporal real.
   * Con menos de 2 puntos → indeterminado.
   *
   * Parámetros (todos PENDIENTE_VALIDACION, se pasan en `opts`):
   *   trendWindow        — tamaño de la ventana móvil.
   *   cambioMinimo       — banda "estable": |pendiente| ≤ cambioMinimo/trendWindow.
   *   estimadorPendiente — función (xs, ys) => number. Ej.: `pendienteLineal`
   *                        (mínimos cuadrados). El método NO se fija en el módulo.
   *
   * @returns {{ pendiente:number|null, direccion:'ascendente'|'estable'|'descendente'|'indeterminado',
   *            movimiento:'deterioro'|'estable'|'recuperacion'|'indeterminado', puntos:number }}
   *   IDA sube  → 'ascendente'  → movimiento 'deterioro'   (mayor restricción, §2.6)
   *   IDA baja  → 'descendente' → movimiento 'recuperacion'
   */
  function trayectoria(serie, t, opts) {
    if (t < 0 || t >= serie.length) throw new Error('motor-sdmo: t fuera de rango en trayectoria().');
    var w = _param(opts, 'trendWindow', 'trayectoria');
    var mdc = _param(opts, 'cambioMinimo', 'trayectoria');
    var estimador = _param(opts, 'estimadorPendiente', 'trayectoria');

    var xs = [], ys = [];
    for (var k = Math.max(0, t - w + 1); k <= t; k++) {
      if (esNumero(serie[k])) { xs.push(k); ys.push(serie[k]); }
    }
    if (ys.length < 2) {
      return { pendiente: null, direccion: 'indeterminado', movimiento: 'indeterminado', puntos: ys.length };
    }
    var m = estimador(xs, ys);
    var umbral = mdc / w;                 // mismo criterio que engine_core.py: slope vs mdc/window
    var dir = (m > umbral) ? 'ascendente' : (m < -umbral) ? 'descendente' : 'estable';
    var mov = (dir === 'ascendente') ? 'deterioro' : (dir === 'descendente') ? 'recuperacion' : 'estable';
    return { pendiente: m, direccion: dir, movimiento: mov, puntos: ys.length };
  }

  /**
   * Persistencia CATEGÓRICA: nº de períodos consecutivos, terminando en t, en
   * que la categoría F/I/D del IDA es la misma que en t.
   *
   * ESTE es el mecanismo con el bug documentado (HALLAZGOS_PRUEBA_ESTRES_AIE.md
   * §3): en el período exacto del cruce de categoría vale 1, aunque la serie
   * lleve varios períodos moviéndose en la misma dirección. NO se usa solo;
   * se combina con rachaTrayectoria() en clasificarSenal().
   */
  function persistenciaCategorica(serie, t, opts) {
    var catT = categoria(serie[t], opts);
    if (catT === null) return 0;
    var run = 0;
    for (var k = t; k >= 0; k--) {
      if (categoria(serie[k], opts) === catT) run++;
      else break;
    }
    return run;
  }

  /**
   * Racha de TRAYECTORIA sostenida: nº de períodos consecutivos, terminando en
   * t, en que trayectoria(...).direccion es la misma que en t (y esa dirección
   * es 'ascendente' o 'descendente' — 'estable'/'indeterminado' cortan la racha).
   *
   * Reimplementación en JS de la idea de engine_core.py:trajectory_run(). A
   * diferencia de persistenciaCategorica(), NO se resetea en el cruce de
   * categoría: mide magnitud/pendiente sostenida, que es lo que se necesita
   * justo en la transición.
   *
   * @returns {{ direccion:string, racha:number }}
   */
  function rachaTrayectoria(serie, t, opts) {
    var dirT = trayectoria(serie, t, opts).direccion;
    if (dirT !== 'ascendente' && dirT !== 'descendente') {
      return { direccion: dirT, racha: 0 };
    }
    var run = 0;
    for (var k = t; k >= 0; k--) {
      if (trayectoria(serie, k, opts).direccion === dirT) run++;
      else break;
    }
    return { direccion: dirT, racha: run };
  }

  /**
   * Clasifica la señal en el período t como 'puntual' | 'repetida' | 'persistente'.
   *
   *   PERSISTENCIA CORREGIDA:
   *     persistente  ⇔  persistenciaCategorica >= PERSIST_MIN
   *                     OR  rachaTrayectoria    >= PERSIST_RUN_MIN
   *     repetida     ⇔  (no persistente) y persistenciaCategorica >= 2
   *     puntual      ⇔  en otro caso
   *
   * PERSIST_MIN y PERSIST_RUN_MIN son PENDIENTE_VALIDACION (opts.persistMin,
   * opts.persistRunMin).
   *
   * @returns {{
   *   clase:'puntual'|'repetida'|'persistente',
   *   persistenciaCategorica:number, rachaTrayectoria:number, direccionRacha:string,
   *   porCategorica:boolean, porRacha:boolean,
   *   umbrales:{persistMin:number, persistRunMin:number}
   * }}
   */
  function clasificarSenal(serie, t, opts) {
    var persistMin = _param(opts, 'persistMin', 'clasificarSenal');
    var persistRunMin = _param(opts, 'persistRunMin', 'clasificarSenal');

    var catRun = persistenciaCategorica(serie, t, opts);
    var rt = rachaTrayectoria(serie, t, opts);

    var porCategorica = catRun >= persistMin;
    var porRacha = rt.racha >= persistRunMin;
    var esPersistente = porCategorica || porRacha;

    var clase = esPersistente ? 'persistente' : (catRun >= 2 ? 'repetida' : 'puntual');

    return {
      clase: clase,
      persistenciaCategorica: catRun,
      rachaTrayectoria: rt.racha,
      direccionRacha: rt.direccion,
      porCategorica: porCategorica,
      porRacha: porRacha,
      umbrales: { persistMin: persistMin, persistRunMin: persistRunMin }
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  7. AGREGACIÓN COLECTIVA  (§2.9)
  // ══════════════════════════════════════════════════════════════════════════
  //
  //  RETIRADO — NO SE IMPLEMENTA: la fórmula histórica "promedio + segundo mayor
  //  entre Personas". Pierde significado proporcional cuando cambia el tamaño
  //  del grupo (el 2º valor entre 8 Personas = 25% del grupo; entre 500 = 0,4%).
  //  Este módulo NO contiene ningún mecanismo de "segundo mayor entre Personas"
  //  ni equivalente.
  //
  //  SÍ se implementa:
  //   · Nivel colectivo:  M_nodo,t = promedio(IDA_i,t)   — simple.
  //   · Concentración/distribución: función basada en PERCENTIL (proporcional al
  //     tamaño del grupo por construcción). Qué percentil / qué umbral →
  //     PENDIENTE_VALIDACION (opts.percentilConcentracion, opts.umbralConcentracion).
  //   · Dispersión descriptiva: desviación estándar, IQR, min, max (sin parámetro).
  //

  /**
   * Concentración colectiva del SDMO por percentil (§2.9).
   * @param {number[]} idas  IDA individuales válidos del nodo (sin no-respuestas).
   * @param {Object} opts  { percentilConcentracion (req.), umbralConcentracion (opc.) }
   * @returns {{
   *   metodo:'percentil', percentil:number, valor:number,
   *   proporcionExcedente?: { umbral:number, valor:number, cuenta:number }
   * }}
   * NOTA: el percentil es proporcional al tamaño del grupo por definición
   * (P90 = "el 10% superior" para cualquier n). Esa es exactamente la propiedad
   * que el "segundo mayor entre Personas" NO garantiza y por la que se retiró.
   */
  function concentracionColectiva(idas, opts) {
    var p = _param(opts, 'percentilConcentracion', 'concentracionColectiva');
    var out = { metodo: 'percentil', percentil: p, valor: percentil(idas, p) };
    if (opts && opts.umbralConcentracion !== undefined && opts.umbralConcentracion !== null) {
      var u = opts.umbralConcentracion;
      var cuenta = idas.filter(function (v) { return v >= u; }).length;
      out.proporcionExcedente = { umbral: u, valor: idas.length ? cuenta / idas.length : null, cuenta: cuenta };
    }
    return out;
  }

  /**
   * Lectura colectiva de un nodo para un período.
   * @param {Array<number|null>} idasIndividuales  IDA por Persona (null = no-respuesta).
   * @param {Object} opts  { minReportableN (req.), percentilConcentracion (req.),
   *                          umbralConcentracion (opc.), personasConvocadas (opc.) }
   * @returns {{
   *   n:number, personasConvocadas:number, tasaRespuesta:number|null,
   *   reportable:boolean,
   *   nivelColectivo:number|null,       // M_nodo,t = promedio(IDA_i)
   *   dispersion:{desviacionEstandar,iqr,min,max}|null,
   *   concentracion: Object|null,
   *   motivo?:string, idasParaAgregar?:number[]
   * }}
   *
   * CONFIDENCIALIDAD (§2.10): si n < minReportableN el nodo NO genera reporte
   * propio — se devuelve reportable=false + idasParaAgregar (para el nivel
   * jerárquico superior). Los campos de nivel/dispersión/concentración se
   * calculan igual, pero NO deben publicarse cuando reportable=false.
   */
  function agregarNodo(idasIndividuales, opts) {
    opts = opts || {};
    var minN = _param(opts, 'minReportableN', 'agregarNodo');

    var validas = idasIndividuales.filter(esNumero);
    var n = validas.length;
    var convocadas = esNumero(opts.personasConvocadas) ? opts.personasConvocadas : idasIndividuales.length;
    var reportable = n >= minN;

    var res = {
      n: n,
      personasConvocadas: convocadas,
      tasaRespuesta: tasaRespuesta(n, convocadas),
      reportable: reportable,
      nivelColectivo: n ? promedio(validas) : null,
      dispersion: n ? dispersionDescriptiva(validas) : null,
      concentracion: n ? concentracionColectiva(validas, opts) : null
    };

    if (!reportable) {
      res.motivo = 'n (' + n + ') < minReportableN (' + minN + ') — el nodo no genera reporte propio (§2.10); ' +
        'sus IDA individuales se agregan al nivel jerárquico superior.';
      res.idasParaAgregar = validas.slice();
    }
    return res;
  }

  /**
   * Agrega varios nodos hijos a su nivel jerárquico superior (§2.10).
   * Los hijos con n < minReportableN NO se reportan solos: sus IDA se combinan
   * en el "pool" del padre. Los hijos reportables se listan aparte.
   *
   * @param {Array<{id?:string, idas:Array<number|null>}>} hijos
   * @param {Object} opts  igual que agregarNodo
   * @returns {{
   *   padre: Object,                 // agregarNodo() sobre el pool combinado
   *   hijosReportables: Array,       // [{id, reporte}]
   *   hijosAbsorbidos: string[],     // ids de los que se agregaron al padre
   *   nPoolAbsorbido:number
   * }}
   */
  function agregarNivelSuperior(hijos, opts) {
    opts = opts || {};
    var minN = _param(opts, 'minReportableN', 'agregarNivelSuperior');

    var pool = [], reportables = [], absorbidos = [];
    hijos.forEach(function (h, idx) {
      var idH = h.id != null ? h.id : ('hijo_' + idx);
      var validas = (h.idas || []).filter(esNumero);
      if (validas.length >= minN) {
        reportables.push({ id: idH, reporte: agregarNodo(h.idas, opts) });
      } else {
        pool = pool.concat(validas);
        absorbidos.push(idH);
      }
    });

    return {
      padre: agregarNodo(pool, opts),
      hijosReportables: reportables,
      hijosAbsorbidos: absorbidos,
      nPoolAbsorbido: pool.length
    };
  }

  /**
   * Agregación a nivel ORGANIZACIÓN (§2.9 + §2.10).
   *
   * §3.9 da IAO_ORG = Σ(N_g·IAO_g)/ΣN_g para el IAO. Para el SDMO esa media
   * ponderada sirve para el NIVEL (es idéntica al pooling de individuos) pero NO
   * para la CONCENTRACIÓN: un percentil no se promedia
   * (P90_org ≠ Σ(N_g·P90_g)/ΣN_g). Por eso la organización se calcula sobre la
   * distribución individual combinada, no sobre los resúmenes de nodo.
   *
   * MECANISMO DE ANONIMIZACIÓN (decisión explícita, no implícita):
   *  1. POOL PLANO Y ANÓNIMO = todos los IDA de respondientes válidos de todos
   *     los nodos, concatenados. NO viaja `nodo_origen` ni ningún otro atributo
   *     junto a cada IDA. Nivel, concentración y dispersión organizacionales se
   *     calculan sobre ese pool. El pool NO se devuelve (los individuos nunca se
   *     reportan, §2.10) — solo su tamaño y los agregados.
   *  2. Ponderación POR RESPONDIENTES: cada IDA cuenta una vez. NUNCA por
   *     convocados — ponderar por convocados sería imputación encubierta (§2.8).
   *  3. `perfilPorNodo` — estructura SEPARADA que sí conserva el `id` del nodo,
   *     para localizar el origen de una señal. Un nodo con n < minReportableN NO
   *     expone estadísticas ahí (§2.10): solo cuántos respondientes aportó al pool.
   *  4. Excluir un nodo DESPUÉS (datos corruptos, etc.) NO se opera sobre el
   *     pool anónimo: se re-ejecuta esta función con `opts.excluirNodos:[id,…]`.
   *     Los `id` disponibles viven en `perfilPorNodo`, no en el pool.
   *  5. El pool no lleva atributos ⇒ no hay subgrupos que intersectar dentro de
   *     él (sin reidentificación por combinación de filtros). Segmentar el pool
   *     por atributos (función, ubicación, turno…) queda fuera de alcance; de
   *     hacerse, pasaría por el mismo gate de minReportableN (tamaño mínimo de
   *     segmento, PENDIENTE_VALIDACION).
   *
   * @param {Array<{id?:string, idas:Array<number|null>, personasConvocadas?:number}>} nodos
   * @param {Object} opts  minReportableN (req.), percentilConcentracion (req.),
   *                        umbralConcentracion (opc.), excluirNodos (opc.: string[])
   * @returns {{
   *   organizacion: { n, personasConvocadas, tasaRespuesta, reportable,
   *                   nivelColectivo, dispersion, concentracion },
   *   perfilPorNodo: Array<Object>,   // por nodo, con id; sub-umbral sin estadísticas
   *   nodosExcluidos: string[]
   * }}
   */
  function agregarOrganizacion(nodos, opts) {
    opts = opts || {};
    var minN = _param(opts, 'minReportableN', 'agregarOrganizacion');
    var excluir = (opts && opts.excluirNodos) ? opts.excluirNodos.slice() : [];

    var pool = [];                 // IDA individuales — ANÓNIMOS, sin nodo_origen
    var convocadasTotal = 0;
    var perfilPorNodo = [];
    var excluidos = [];

    nodos.forEach(function (nodo, idx) {
      var id = nodo.id != null ? nodo.id : ('nodo_' + idx);
      if (excluir.indexOf(id) !== -1) { excluidos.push(id); return; }

      var validas = (nodo.idas || []).filter(esNumero);
      convocadasTotal += esNumero(nodo.personasConvocadas) ? nodo.personasConvocadas : (nodo.idas || []).length;

      // 1. aportar al pool anónimo — sin id, sin ningún atributo
      pool = pool.concat(validas);

      // 3. perfil por nodo, en paralelo, CON id
      if (validas.length >= minN) {
        perfilPorNodo.push({
          id: id, reportable: true, n: validas.length,
          nivelColectivo: promedio(validas),
          dispersion: dispersionDescriptiva(validas),
          concentracion: concentracionColectiva(validas, opts)
        });
      } else {
        perfilPorNodo.push({
          id: id, reportable: false, nAportadoAlPool: validas.length,
          nota: 'n (' + validas.length + ') < minReportableN (' + minN + ') — sin estadísticas propias (§2.10); ' +
            validas.length + ' respondientes aportados al pool organizacional anónimo.'
        });
      }
    });

    var n = pool.length;
    return {
      organizacion: {
        n: n,
        personasConvocadas: convocadasTotal,
        tasaRespuesta: tasaRespuesta(n, convocadasTotal),
        reportable: n >= minN,
        // = Σ(n_g·M_g)/Σn_g (ponderación por respondientes = pooling de individuos)
        nivelColectivo: n ? promedio(pool) : null,
        dispersion: n ? dispersionDescriptiva(pool) : null,
        concentracion: n ? concentracionColectiva(pool, opts) : null
      },
      perfilPorNodo: perfilPorNodo,
      nodosExcluidos: excluidos
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  8. API PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════
  return {
    // datos canónicos
    DIMENSIONES: DIMENSIONES,
    CODIGOS: CODIGOS,
    CODIGOS_RESERVADOS_ICE_IEH: CODIGOS_RESERVADOS_ICE_IEH,
    PENDIENTE_VALIDACION: PENDIENTE_VALIDACION,

    // normalización y IDA (§2.5, §2.6)
    normalizar: normalizar,
    validarRespuestaIndividual: validarRespuestaIndividual,
    calcularIDA: calcularIDA,
    calcularSerieIDA: calcularSerieIDA,

    // no-respuesta (§2.8)
    tasaRespuesta: tasaRespuesta,
    calcularSerieTasaRespuesta: calcularSerieTasaRespuesta,

    // trayectoria y persistencia (§2.7 + corrección)
    categoria: categoria,
    trayectoria: trayectoria,
    persistenciaCategorica: persistenciaCategorica,
    rachaTrayectoria: rachaTrayectoria,
    clasificarSenal: clasificarSenal,

    // agregación colectiva (§2.9) y confidencialidad (§2.10)
    concentracionColectiva: concentracionColectiva,
    agregarNodo: agregarNodo,
    agregarNivelSuperior: agregarNivelSuperior,
    agregarOrganizacion: agregarOrganizacion,

    // utilidades expuestas para pruebas
    percentil: percentil,
    pendienteLineal: pendienteLineal
  };
});
