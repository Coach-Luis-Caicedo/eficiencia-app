/**
 * ============================================================================
 *  MOTOR DE CÁLCULO — Instrumento ICE–IEH v2 (31 preguntas)
 * ============================================================================
 *
 *  Fuente única de verdad: docs/DOCUMENTO_TECNICO_ICE_IEH_v2.md
 *  Secciones implementadas: 2.3 (numeración global), 2.4 (códigos de sensor),
 *  3.7 / 4.7 / 5.8 / 6.7 / 7.8 (matrices canónicas por bloque),
 *  8.2 (clasificación por tipo), 8.3 (regla de agregación),
 *  8.4 (normalización por tipo de ítem), 8.5 (cálculo de variables),
 *  8.6 (ICE, IEH, brechas), 8.7 (señales independientes).
 *
 *  MÓDULO AISLADO — NO toca el motor de 25 preguntas de workbook.html.
 *  No se integra a producción hasta aprobación explícita tras revisar la
 *  batería de verificación (motor-ice-ieh.test.js).
 *
 *  Este cálculo NO depende de ningún parámetro marcado PENDIENTE_VALIDACION
 *  en el documento técnico (sección 10.2): pesos diferenciales entre sensores,
 *  umbrales verde/ámbar/rojo, fórmulas de dispersión/precisión y ponderación
 *  poblacional quedan fuera de alcance porque ICE/IEH/Brecha no los usan.
 *
 *  Notas de implementación (ambigüedades resueltas y decisiones cerradas):
 *  ver README.md, sección "Notas de implementación".
 * ============================================================================
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MotorICEIEH = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ══════════════════════════════════════════════════════════════════════════
  //  1. ESTRUCTURA CANÓNICA DE LAS 31 PREGUNTAS
  //     (Documento Técnico, secciones 3.7, 4.7, 5.8, 6.7, 7.8)
  // ══════════════════════════════════════════════════════════════════════════
  //
  //  Campos:
  //    g       — numeración global P1–P31 (única válida para código/BD/reportes, §2.3)
  //    local   — numeración local dentro del bloque (solo lectura interna, §2.3)
  //    bloque  — 1..5
  //    plano   — 'ICE' | 'IEH' | 'IND'  (IND = ni ICE ni IEH: señal independiente)
  //    variable— clave canónica de la variable observada (o 'estructura_fortaleza'
  //              / 'intencion_coherencia' para las preguntas de par IND-*)
  //    codigo  — código de sensor sin colisión entre variables (§2.4), o IND-EF/IND-IC
  //    prefijo — EST, FOR, INE, COH, IMP, EQU, NEX, CNF, ITG, ACT  (nombres de
  //              campo/columna canónicos — NO el acróstico plano de 25 preguntas)
  //    sensor  — nombre/objeto del sensor tal como lo fija el documento
  //    tipo    — 'normal' | 'inversa' | 'ampliacion' | 'bipolar_ind' | 'sintesis_ind'
  //    entraPromedio — true si la respuesta entra al promedio de `variable` (§8.3)
  //
  var PREGUNTAS = [
    // ── Bloque 1 — Estructura ↔ Fortaleza (P1–P7) ──────────────────────────
    { g: 'P1',  local: 'P1', bloque: 1, plano: 'ICE', variable: 'estructura', codigo: 'EST-1', prefijo: 'EST', sensor: 'Organización',            tipo: 'normal',       entraPromedio: true },
    { g: 'P2',  local: 'P2', bloque: 1, plano: 'ICE', variable: 'estructura', codigo: 'EST-2', prefijo: 'EST', sensor: 'Coordinación',            tipo: 'normal',       entraPromedio: true },
    { g: 'P3',  local: 'P3', bloque: 1, plano: 'ICE', variable: 'estructura', codigo: 'EST-3', prefijo: 'EST', sensor: 'Conciliación',            tipo: 'normal',       entraPromedio: true },
    { g: 'P4',  local: 'P4', bloque: 1, plano: 'IEH', variable: 'fortaleza',  codigo: 'FOR-1', prefijo: 'FOR', sensor: 'Seguridad',               tipo: 'normal',       entraPromedio: true },
    { g: 'P5',  local: 'P5', bloque: 1, plano: 'IEH', variable: 'fortaleza',  codigo: 'FOR-2', prefijo: 'FOR', sensor: 'Cuidado',                 tipo: 'normal',       entraPromedio: true },
    { g: 'P6',  local: 'P6', bloque: 1, plano: 'IEH', variable: 'fortaleza',  codigo: 'FOR-3', prefijo: 'FOR', sensor: 'Valoración',              tipo: 'normal',       entraPromedio: true },
    { g: 'P7',  local: 'P7', bloque: 1, plano: 'IND', variable: 'estructura_fortaleza', codigo: 'IND-EF', prefijo: 'IND', sensor: 'Correspondencia percibida (bipolar direccional)', tipo: 'bipolar_ind', entraPromedio: false },

    // ── Bloque 2 — Intención ↔ Coherencia (P8–P14) ─────────────────────────
    { g: 'P8',  local: 'P1', bloque: 2, plano: 'ICE', variable: 'intencion',  codigo: 'INE-1', prefijo: 'INE', sensor: 'Propósito ↔ configuración',              tipo: 'normal',  entraPromedio: true },
    { g: 'P9',  local: 'P2', bloque: 2, plano: 'ICE', variable: 'intencion',  codigo: 'INE-2', prefijo: 'INE', sensor: 'Declaración ↔ orientación para actuar',   tipo: 'normal',  entraPromedio: true },
    { g: 'P10', local: 'P3', bloque: 2, plano: 'ICE', variable: 'intencion',  codigo: 'INE-3', prefijo: 'INE', sensor: 'Identidad ↔ acciones',                    tipo: 'normal',  entraPromedio: true },
    { g: 'P11', local: 'P4', bloque: 2, plano: 'IEH', variable: 'coherencia', codigo: 'COH-1', prefijo: 'COH', sensor: 'Declaración ↔ experiencia',               tipo: 'normal',  entraPromedio: true },
    { g: 'P12', local: 'P5', bloque: 2, plano: 'IEH', variable: 'coherencia', codigo: 'COH-2', prefijo: 'COH', sensor: 'Integridad reconocida',                   tipo: 'normal',  entraPromedio: true },
    { g: 'P13', local: 'P6', bloque: 2, plano: 'IEH', variable: 'coherencia', codigo: 'COH-3', prefijo: 'COH', sensor: 'Contradicción experimentada',             tipo: 'inversa', entraPromedio: true },
    { g: 'P14', local: 'P7', bloque: 2, plano: 'IND', variable: 'intencion_coherencia', codigo: 'IND-IC', prefijo: 'IND', sensor: 'Veracidad (síntesis unidireccional)', tipo: 'sintesis_ind', entraPromedio: false },

    // ── Bloque 3 — Impacto ↔ Equilibrio (P15–P21) ─────────────────────────
    { g: 'P15', local: 'P1', bloque: 3, plano: 'ICE', variable: 'impacto',    codigo: 'IMP-1', prefijo: 'IMP', sensor: 'Tiempo',        tipo: 'normal',     entraPromedio: true },
    { g: 'P16', local: 'P2', bloque: 3, plano: 'ICE', variable: 'impacto',    codigo: 'IMP-2', prefijo: 'IMP', sensor: 'Energía',       tipo: 'normal',     entraPromedio: true },
    { g: 'P17', local: 'P3', bloque: 3, plano: 'ICE', variable: 'impacto',    codigo: 'IMP-3', prefijo: 'IMP', sensor: 'Capacidades',   tipo: 'normal',     entraPromedio: true },
    // IMP-4 (P18): "ampliación", NO es un cuarto sensor, pero SÍ entra al
    // promedio de Impacto (§5.4 y §8.3). Normaliza igual que un ítem normal (§8.4).
    { g: 'P18', local: 'P4', bloque: 3, plano: 'ICE', variable: 'impacto',    codigo: 'IMP-4', prefijo: 'IMP', sensor: 'Vida (ampliación de alcance)', tipo: 'ampliacion', entraPromedio: true },
    { g: 'P19', local: 'P5', bloque: 3, plano: 'IEH', variable: 'equilibrio', codigo: 'EQU-1', prefijo: 'EQU', sensor: 'Reconocimiento', tipo: 'normal',     entraPromedio: true },
    { g: 'P20', local: 'P6', bloque: 3, plano: 'IEH', variable: 'equilibrio', codigo: 'EQU-2', prefijo: 'EQU', sensor: 'Pertinencia',    tipo: 'normal',     entraPromedio: true },
    { g: 'P21', local: 'P7', bloque: 3, plano: 'IEH', variable: 'equilibrio', codigo: 'EQU-3', prefijo: 'EQU', sensor: 'Suficiencia',    tipo: 'inversa',    entraPromedio: true },

    // ── Bloque 4 — Nexo ↔ Confianza (P22–P27) ─────────────────────────────
    { g: 'P22', local: 'P1', bloque: 4, plano: 'ICE', variable: 'nexo',      codigo: 'NEX-1', prefijo: 'NEX', sensor: 'Identidad y aspiración',   tipo: 'normal', entraPromedio: true },
    { g: 'P23', local: 'P2', bloque: 4, plano: 'ICE', variable: 'nexo',      codigo: 'NEX-2', prefijo: 'NEX', sensor: 'Importancia de participar', tipo: 'normal', entraPromedio: true },
    { g: 'P24', local: 'P3', bloque: 4, plano: 'ICE', variable: 'nexo',      codigo: 'NEX-3', prefijo: 'NEX', sensor: 'Disposición a contribuir',  tipo: 'normal', entraPromedio: true },
    { g: 'P25', local: 'P4', bloque: 4, plano: 'IEH', variable: 'confianza', codigo: 'CNF-1', prefijo: 'CNF', sensor: 'Experiencia acumulada',    tipo: 'normal', entraPromedio: true },
    { g: 'P26', local: 'P5', bloque: 4, plano: 'IEH', variable: 'confianza', codigo: 'CNF-2', prefijo: 'CNF', sensor: 'Respaldo experimentado',   tipo: 'normal', entraPromedio: true },
    { g: 'P27', local: 'P6', bloque: 4, plano: 'IEH', variable: 'confianza', codigo: 'CNF-3', prefijo: 'CNF', sensor: 'Pertenencia',              tipo: 'normal', entraPromedio: true },

    // ── Bloque 5 — Integración ↔ Actitud (P28–P31) ────────────────────────
    // Solo 2 preguntas por variable — arquitectura confirmada (§7.3, §7.9).
    // NO fabricar una tercera pregunta ni un tercer sensor.
    { g: 'P28', local: 'P1', bloque: 5, plano: 'ICE', variable: 'integracion', codigo: 'ITG-1', prefijo: 'ITG', sensor: 'Comprensión del efecto sobre otros',       tipo: 'normal', entraPromedio: true },
    { g: 'P29', local: 'P2', bloque: 5, plano: 'ICE', variable: 'integracion', codigo: 'ITG-2', prefijo: 'ITG', sensor: 'Reconocimiento de la propia contribución', tipo: 'normal', entraPromedio: true },
    { g: 'P30', local: 'P3', bloque: 5, plano: 'IEH', variable: 'actitud',     codigo: 'ACT-1', prefijo: 'ACT', sensor: 'Compromiso derivado del significado',       tipo: 'normal', entraPromedio: true },
    { g: 'P31', local: 'P4', bloque: 5, plano: 'IEH', variable: 'actitud',     codigo: 'ACT-2', prefijo: 'ACT', sensor: 'Representación mediante la conducta',        tipo: 'normal', entraPromedio: true }
  ];

  // Índice rápido por número global.
  var POR_GLOBAL = {};
  PREGUNTAS.forEach(function (p) { POR_GLOBAL[p.g] = p; });

  // ── Definición de las 10 variables y su composición (§8.5) ──────────────
  // El número de ítems por variable es asimétrico POR DISEÑO (§2.2, §8.5):
  // 4 (Impacto) · 3 (Estructura, Fortaleza, Intención, Coherencia, Equilibrio,
  // Nexo, Confianza) · 2 (Integración, Actitud).
  var VARIABLES_ICE = ['estructura', 'intencion', 'impacto', 'nexo', 'integracion'];
  var VARIABLES_IEH = ['fortaleza', 'coherencia', 'equilibrio', 'confianza', 'actitud'];
  var VARIABLES = VARIABLES_ICE.concat(VARIABLES_IEH);

  // ── Pares para el cálculo de brechas (§8.6) ─────────────────────────────
  //   Brecha_par = variable_ICE − variable_IEH
  //   Signo: positivo = el lado ICE (sistema) puntúa por encima del lado IEH
  //          (experiencia); negativo = la experiencia supera lo declarado.
  var PARES = [
    { clave: 'estructura_fortaleza',  ice: 'estructura',  ieh: 'fortaleza'  },
    { clave: 'intencion_coherencia',  ice: 'intencion',   ieh: 'coherencia' },
    { clave: 'impacto_equilibrio',    ice: 'impacto',     ieh: 'equilibrio' },
    { clave: 'nexo_confianza',        ice: 'nexo',        ieh: 'confianza'  },
    { clave: 'integracion_actitud',   ice: 'integracion', ieh: 'actitud'    }
  ];

  // ══════════════════════════════════════════════════════════════════════════
  //  2. NORMALIZACIÓN POR TIPO DE ÍTEM (Documento Técnico, sección 8.4)
  // ══════════════════════════════════════════════════════════════════════════

  /** Ítem normal:  s = 25 × (x − 1)   → rango [0, 100]. x = respuesta cruda 1–5. */
  function normalizarNormal(x) {
    return 25 * (x - 1);
  }

  /**
   * Recodificación del ítem inverso (COH-3, EQU-3).
   * Se aplica ANTES de agregar, nunca después de normalizar (§8.4).
   * x' = 6 − x   (1↔5, 2↔4, 3↔3). Luego se normaliza con la fórmula normal:
   *   25 × (x' − 1) = 25 × (5 − x)   → idéntico a la fórmula inversa del §8.4.
   */
  function recodificarInversa(x) {
    return 6 - x;
  }

  /** Ítem bipolar independiente (IND-EF, P7):  d = (x − 3) / 2   → rango [−1, +1].
   *  Fórmula literal del §8.4. Convención de signo (nota §8.4 corregida
   *  2026-09-03, ver README): d > 0 → predomina Fortaleza (IEH); d < 0 →
   *  predomina Estructura (ICE); d = 0 → sin predominancia. El motor NO fija
   *  la etiqueta "domina X" — devuelve solo el valor numérico; la capa de
   *  presentación aplica la convención. No afecta ICE, IEH ni brechas (§8.7). */
  function valorBipolarInd(x) {
    return (x - 3) / 2;
  }

  /** Ítem de síntesis independiente (IND-IC, P14):  s = 25 × (x − 1)  → [0, 100].
   *  Misma fórmula que un ítem normal, pero se reporta aparte — nunca se
   *  promedia dentro de Coherencia (§8.4, §8.7). */
  function normalizarSintesisInd(x) {
    return 25 * (x - 1);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  3. UTILIDADES
  // ══════════════════════════════════════════════════════════════════════════

  function promedio(arr) {
    if (!arr.length) return null;
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  /**
   * Normaliza la entrada a un objeto { P1..P31: número }.
   * Acepta:
   *   - Array de 31 elementos (índice 0 = P1)
   *   - Objeto con claves 'P1'..'P31'
   *   - Objeto con claves numéricas 1..31
   * Valida que cada respuesta sea un entero en el rango 1–5.
   * Lanza Error con el detalle de todas las preguntas problemáticas.
   */
  function normalizarEntrada(respuestas) {
    if (respuestas == null || typeof respuestas !== 'object') {
      throw new Error('motor-ice-ieh: se esperaba un array de 31 respuestas o un objeto {P1..P31}.');
    }

    var crudas = {};
    var faltantes = [];
    var invalidas = [];

    for (var i = 0; i < PREGUNTAS.length; i++) {
      var g = PREGUNTAS[i].g;              // 'P1'..'P31'
      var n = i + 1;                       // 1..31
      var v;
      if (Array.isArray(respuestas)) {
        v = respuestas[i];
      } else if (Object.prototype.hasOwnProperty.call(respuestas, g)) {
        v = respuestas[g];
      } else if (Object.prototype.hasOwnProperty.call(respuestas, n)) {
        v = respuestas[n];
      } else if (Object.prototype.hasOwnProperty.call(respuestas, String(n))) {
        v = respuestas[String(n)];
      } else {
        v = undefined;
      }

      if (v === undefined || v === null || v === '') {
        faltantes.push(g);
        continue;
      }
      var num = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(num) || !Number.isInteger(num) || num < 1 || num > 5) {
        invalidas.push(g + '=' + JSON.stringify(v));
        continue;
      }
      crudas[g] = num;
    }

    if (Array.isArray(respuestas) && respuestas.length !== 31) {
      throw new Error('motor-ice-ieh: el array debe tener exactamente 31 respuestas (recibidas: ' + respuestas.length + ').');
    }
    if (faltantes.length || invalidas.length) {
      var partes = [];
      if (faltantes.length) partes.push('faltantes: ' + faltantes.join(', '));
      if (invalidas.length) partes.push('fuera de rango 1–5 (entero): ' + invalidas.join(', '));
      throw new Error('motor-ice-ieh: respuestas inválidas — ' + partes.join(' | '));
    }
    return crudas;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  4. MOTOR PRINCIPAL
  //     Secuencia de cálculo (Documento Técnico, sección 8.10):
  //       RESPUESTA 1–5
  //         → RECODIFICACIÓN (solo COH-3, EQU-3)
  //         → NORMALIZACIÓN 0–100  (o [−1,+1] para IND-EF)
  //         → AGREGACIÓN POR VARIABLE (10 variables, regla §8.3)
  //         → ICE, IEH  ←→  BRECHA POR PAR (5 pares)
  //         → SEÑALES INDEPENDIENTES (IND-EF, IND-IC)
  //     Nivel/dispersión/precisión y ponderación poblacional NO se calculan
  //     aquí: sus fórmulas están PENDIENTES DE PILOTO (§8.8, §8.9, §10.2).
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * @param {number[]|Object} respuestas  31 respuestas crudas (1–5).
   * @returns {{
   *   variables: Object,        // 10 variables, score 0–100
   *   ice: number, ieh: number, // índices 0–100
   *   brechas: Object,          // 5 brechas por par, ICE − IEH
   *   senales: Object,          // correspondencia [−1,+1] y veracidad [0,100]
   *   detalle: Object,          // por pregunta: crudo, recodificado, normalizado, entraPromedio
   *   meta: Object              // conteo de ítems por variable, versión de instrumento
   * }}
   */
  function calcular(respuestas) {
    var crudas = normalizarEntrada(respuestas);

    // ── 4.1 Detalle por pregunta: recodificación + normalización ──────────
    var detalle = {};
    PREGUNTAS.forEach(function (p) {
      var x = crudas[p.g];
      var recodificado = null;
      var normalizado = null;   // 0–100 para ítems de variable y síntesis
      var valor = null;         // [−1,+1] solo para el bipolar independiente

      if (p.tipo === 'inversa') {
        recodificado = recodificarInversa(x);              // ANTES de agregar (§8.4)
        normalizado = normalizarNormal(recodificado);       // = 25 × (5 − x)
      } else if (p.tipo === 'bipolar_ind') {
        valor = valorBipolarInd(x);                         // [−1, +1]
      } else if (p.tipo === 'sintesis_ind') {
        normalizado = normalizarSintesisInd(x);             // [0, 100], se reporta aparte
      } else {
        // 'normal' y 'ampliacion' (IMP-4) — misma fórmula (§8.4)
        normalizado = normalizarNormal(x);
      }

      detalle[p.g] = {
        global: p.g,
        local: p.local,
        bloque: p.bloque,
        plano: p.plano,
        variable: p.variable,
        codigo: p.codigo,
        prefijo: p.prefijo,
        sensor: p.sensor,
        tipo: p.tipo,
        crudo: x,
        recodificado: recodificado,
        normalizado: normalizado,
        valor: valor,
        entraPromedio: p.entraPromedio
      };
    });

    // ── 4.2 Agregación por variable (regla única §8.3) ────────────────────
    // Una pregunta entra al promedio de una variable si y solo si observa esa
    // variable (aunque amplíe su alcance). Se excluye si observa la relación
    // entre las dos variables del par → IND-EF (P7) e IND-IC (P14) fuera.
    var variables = {};
    var itemsPorVariable = {};
    VARIABLES.forEach(function (v) {
      var items = PREGUNTAS.filter(function (p) {
        return p.variable === v && p.entraPromedio;
      });
      var normalizados = items.map(function (p) { return detalle[p.g].normalizado; });
      variables[v] = promedio(normalizados);
      itemsPorVariable[v] = items.map(function (p) { return p.codigo; });
    });

    // ── 4.3 ICE, IEH (§8.6) ──────────────────────────────────────────────
    // Promedio NO ponderado de los 5 scores de variable de cada plano.
    // Cada variable pesa igual en su índice, independientemente de su número
    // de ítems (asimetría aceptada por diseño, §8.5).
    var ice = promedio(VARIABLES_ICE.map(function (v) { return variables[v]; }));
    var ieh = promedio(VARIABLES_IEH.map(function (v) { return variables[v]; }));

    // ── 4.4 Brechas por par (§8.6) ───────────────────────────────────────
    var brechas = {};
    PARES.forEach(function (par) {
      brechas[par.clave] = variables[par.ice] - variables[par.ieh];
    });

    // ── 4.5 Señales independientes (§8.7) — NO forman parte de ICE ni IEH ─
    var senales = {
      correspondencia: {           // IND-EF (P7), Bloque 1
        codigo: 'IND-EF',
        crudo: crudas.P7,
        valor: detalle.P7.valor    // ∈ [−1, +1]
      },
      veracidad: {                 // IND-IC (P14), Bloque 2
        codigo: 'IND-IC',
        crudo: crudas.P14,
        valor: detalle.P14.normalizado  // ∈ [0, 100]
      }
    };

    return {
      variables: variables,
      ice: ice,
      ieh: ieh,
      brechas: brechas,
      senales: senales,
      detalle: detalle,
      meta: {
        instrumento: 'ICE-IEH',
        version: 'v2',
        totalPreguntas: PREGUNTAS.length,          // 31
        itemsPorVariable: itemsPorVariable,        // { estructura: ['EST-1',...], ... }
        variablesICE: VARIABLES_ICE.slice(),
        variablesIEH: VARIABLES_IEH.slice(),
        excluidasDePromedio: ['IND-EF', 'IND-IC']
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  5. CAPA DE PRESENTACIÓN — redondeo (DECISIÓN CERRADA, no depende del piloto)
  // ══════════════════════════════════════════════════════════════════════════
  //
  //  `calcular()` SIEMPRE devuelve precisión completa (float). El redondeo se
  //  aplica SOLO aquí, sobre el resultado final — nunca sobre valores intermedios
  //  antes de agregarlos (ver README, "Notas de implementación", punto 2).
  //  Default: 1 decimal.

  /** Redondea un número a `decimales` (default 1). Deja intactos null y no-finitos. */
  function redondear(valor, decimales) {
    if (typeof valor !== 'number' || !isFinite(valor)) return valor;
    var d = (decimales === undefined) ? 1 : decimales;
    var f = Math.pow(10, d);
    return Math.round(valor * f) / f;
  }

  /**
   * Devuelve una COPIA del resultado de `calcular()` con todos los números de la
   * vista resumida (ice, ieh, variables, brechas, señales) redondeados a
   * `decimales` (default 1), lista para pantalla o reporte. No muta el original.
   * `detalle` y `meta` no se incluyen — se toman del resultado original si se
   * necesitan.
   */
  function formatearParaPresentacion(resultado, decimales) {
    var d = (decimales === undefined) ? 1 : decimales;
    var out = {
      ice: redondear(resultado.ice, d),
      ieh: redondear(resultado.ieh, d),
      variables: {},
      brechas: {},
      senales: {
        correspondencia: {
          codigo: resultado.senales.correspondencia.codigo,
          crudo: resultado.senales.correspondencia.crudo,
          valor: redondear(resultado.senales.correspondencia.valor, d)
        },
        veracidad: {
          codigo: resultado.senales.veracidad.codigo,
          crudo: resultado.senales.veracidad.crudo,
          valor: redondear(resultado.senales.veracidad.valor, d)
        }
      }
    };
    Object.keys(resultado.variables).forEach(function (k) {
      out.variables[k] = redondear(resultado.variables[k], d);
    });
    Object.keys(resultado.brechas).forEach(function (k) {
      out.brechas[k] = redondear(resultado.brechas[k], d);
    });
    return out;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  6. API PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════
  return {
    calcular: calcular,
    // Capa de presentación (redondeo — nunca sobre intermedios):
    redondear: redondear,
    formatearParaPresentacion: formatearParaPresentacion,
    // Exposición de internals para pruebas y para el eventual corte a producción:
    PREGUNTAS: PREGUNTAS,
    VARIABLES: VARIABLES,
    VARIABLES_ICE: VARIABLES_ICE,
    VARIABLES_IEH: VARIABLES_IEH,
    PARES: PARES,
    normalizarNormal: normalizarNormal,
    recodificarInversa: recodificarInversa,
    valorBipolarInd: valorBipolarInd,
    normalizarSintesisInd: normalizarSintesisInd,
    normalizarEntrada: normalizarEntrada
  };
});
