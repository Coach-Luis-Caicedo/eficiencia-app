/**
 * motor-cff/monetizacion.js — Fase 1
 *
 * Motor de monetización: los 4 mecanismos (§6), sus reglas (§8), y las
 * fórmulas de agregación por mecanismo (§35: CA/VCP/CR/VNC). NO resuelve
 * atribución (Fase 2), NO resuelve relaciones/dedup (Fase 3), NO consolida
 * (Fase 4b).
 *
 * ── Qué calcula el motor según calculation_mode (§22.2) — y qué NO ───────
 *
 * DIRECT_VALUE y DERIVED_FORMULA: el motor NO calcula nada. El valor ya fue
 * determinado externamente — a mano (DIRECT_VALUE) o por una fórmula
 * específica de la organización/caso referenciada por formula_id/version
 * (DERIVED_FORMULA, p.ej. AC05 "curva de aprendizaje con fórmula interna
 * controlada"). Evaluar esa fórmula de verdad requeriría un motor de
 * fórmulas genérico — el DSL que ya se descartó explícitamente. La
 * diferencia entre los dos modos es metadata de trazabilidad
 * (formula_id/version/input_variables quedan registrados para auditoría),
 * no que el motor ejecute algo distinto.
 *
 * UNIT_RATE: es el ÚNICO modo donde este módulo calcula algo:
 * original_value = quantity × tarifa. La "tarifa" viene de la
 * MONETARY_BASIS resuelta (monetary_basis_id → objeto MONETARY_BASIS, ya
 * validado por contratos.js). Si la base es un punto (basis_value), el
 * resultado es un punto. Si la base es un rango (basis_value_min/max,
 * §9 — dos fuentes que divergen sin reconciliación), el resultado se
 * propaga matemáticamente como rango: NUNCA se promedia, NUNCA se elige un
 * extremo (mismo principio de §9 aplicado al resultado, no solo a la
 * base). Un resultado en rango no puede declararse monetization_status=
 * OBSERVED (contratos.js, regla 8) — se refuerza aquí en el punto donde el
 * rango se origina, no solo en el validador de contrato.
 *
 * ── Las 4 fórmulas de agregación por mecanismo (§35) ─────────────────────
 *
 * CA/VCP/CR/VNC NO son el cálculo interno de un componente — son la suma
 * (Σ) de varios ECONOMIC_COMPONENT que comparten primary_mechanism. Viven
 * en agregarPorMecanismo(), separadas de resolverValorComponente().
 *
 * ── Prohibiciones de §8 — cómo se protegen ────────────────────────────────
 *
 * §8.2: "Ausentismo, tiempo ocioso e interrupciones exigen reconstruir la
 * consecuencia real: cobertura, redistribución, producción no realizada,
 * retraso u otro efecto. Ausentismo no se monetiza automáticamente como
 * horas × salario" (INV-CFF-46). calcularLostCapacity() lo protege
 * RECHAZANDO el cálculo (no solo "no ofrece un atajo con nombre bonito")
 * cuando resource_type pertenece a RECURSOS_QUE_EXIGEN_RECONSTRUCCION y no
 * se declara una reconstrucción explícita — verificado por prueba de
 * mutación en monetizacion.test.js (degradar el rechazo y confirmar que el
 * caso específico empieza a pasar).
 */

'use strict';

var Contratos = require('./contratos');

// ── §6 mecanismos + §35 fórmulas de agregación ───────────────────────────

var MECANISMOS_A_FORMULA = {
  ADDITIONAL_CONSUMPTION: 'CA',
  LOST_CAPACITY: 'VCP',
  REPLACEMENT: 'CR',
  UNCAPTURED_VALUE: 'VNC'
};

// ── resolverValorComponente — el único lugar donde el motor calcula ──────

/**
 * resolverValorComponente(componente, base)
 *
 * componente: { calculation_mode, quantity?, original_value?,
 *               original_value_min?, original_value_max? }
 * base: la MONETARY_BASIS resuelta (solo se usa si calculation_mode=UNIT_RATE).
 *
 * Devuelve { valor } (punto) o { valorMin, valorMax } (rango). Nunca ambos.
 * No muta ni componente ni base.
 */
function resolverValorComponente(componente, base) {
  if (!componente || typeof componente !== 'object') {
    throw new Error('resolverValorComponente: se esperaba un componente (objeto).');
  }
  var modo = componente.calculation_mode;

  if (modo === 'DIRECT_VALUE' || modo === 'DERIVED_FORMULA') {
    var tieneValorYaDado = componente.original_value != null;
    var tieneRangoYaDado = componente.original_value_min != null && componente.original_value_max != null;
    if (!tieneValorYaDado && !tieneRangoYaDado) {
      throw new Error('resolverValorComponente: calculation_mode=' + modo + ' requiere que el componente ya traiga ' +
        'original_value (o el rango) — este modo no calcula, solo transporta un valor determinado externamente.');
    }
    return tieneValorYaDado
      ? { valor: componente.original_value }
      : { valorMin: componente.original_value_min, valorMax: componente.original_value_max };
  }

  if (modo === 'UNIT_RATE') {
    if (!base || typeof base !== 'object') {
      throw new Error('resolverValorComponente: calculation_mode=UNIT_RATE requiere la MONETARY_BASIS resuelta (base).');
    }
    if (typeof componente.quantity !== 'number' || isNaN(componente.quantity)) {
      throw new Error('resolverValorComponente: calculation_mode=UNIT_RATE requiere componente.quantity numérico.');
    }
    if (base.basis_value != null) {
      return { valor: componente.quantity * base.basis_value };
    }
    if (base.basis_value_min != null && base.basis_value_max != null) {
      // Propagación matemática del rango — nunca se promedia, nunca se
      // elige un extremo (§9, aplicado aquí al resultado).
      return {
        valorMin: componente.quantity * base.basis_value_min,
        valorMax: componente.quantity * base.basis_value_max
      };
    }
    throw new Error('resolverValorComponente: la MONETARY_BASIS no trae basis_value ni un rango completo (basis_value_min/max).');
  }

  throw new Error('resolverValorComponente: calculation_mode desconocido "' + modo + '".');
}

/**
 * aplicarResultadoAComponente(componente, resultado)
 *
 * Combina un componente (posiblemente sin valor todavía) con el resultado
 * de resolverValorComponente(), devolviendo un componente NUEVO (no muta el
 * original) listo para pasar por contratos.validarEconomicComponent().
 * Refuerza aquí mismo, en el punto de origen del rango, la regla 8 de
 * contratos.js (rango ⇒ nunca OBSERVED) — defensa en profundidad GENUINA:
 * ambos puntos de entrada llaman a la misma función pura
 * (Contratos.rangoIncompatibleConObserved), no hay una segunda
 * implementación de la regla que pueda divergir silenciosamente si alguien
 * actualiza una y olvida la otra.
 */
function aplicarResultadoAComponente(componente, resultado) {
  var out = Object.assign({}, componente);
  delete out.original_value;
  delete out.original_value_min;
  delete out.original_value_max;
  if (resultado.valor != null) {
    out.original_value = resultado.valor;
  } else {
    if (Contratos.rangoIncompatibleConObserved(true, out.monetization_status)) {
      throw new Error('aplicarResultadoAComponente: un resultado en rango no puede declararse OBSERVED (§10) — ' +
        'usar ESTIMATED (o EXPOSURE/N_A si corresponde).');
    }
    out.original_value_min = resultado.valorMin;
    out.original_value_max = resultado.valorMax;
  }
  return out;
}

// ── §8.2 LOST_CAPACITY — reconstrucción obligatoria para ciertos recursos ─

// Literal de §8.2: "Ausentismo, tiempo ocioso e interrupciones exigen
// reconstruir la consecuencia real".
var RECURSOS_QUE_EXIGEN_RECONSTRUCCION = ['AUSENTISMO', 'TIEMPO_OCIOSO', 'INTERRUPCION'];

// Literal de §8.2: "cobertura, redistribución, producción no realizada,
// retraso u otro efecto".
var TIPOS_RECONSTRUCCION = ['COBERTURA', 'REDISTRIBUCION', 'PRODUCCION_NO_REALIZADA', 'RETRASO', 'OTRO'];

/**
 * calcularLostCapacity(componente, base, opts)
 *
 * componente: ECONOMIC_COMPONENT (parcial) con primary_mechanism=LOST_CAPACITY.
 * base: MONETARY_BASIS resuelta (para calculation_mode=UNIT_RATE).
 * opts.reconstruccion: { tipo: uno de TIPOS_RECONSTRUCCION, descripcion? } —
 *   obligatorio cuando resource_type ∈ RECURSOS_QUE_EXIGEN_RECONSTRUCCION.
 *
 * Devuelve { rechazado: true, monetization_status: 'N_A', motivo } cuando
 * se exige reconstrucción y no se declaró (INV-CFF-46) — el motor RECHAZA
 * el cálculo, no simplemente "no ofrece un atajo". En cualquier otro caso,
 * devuelve { rechazado: false, valor|valorMin/valorMax, reconstruccion? }.
 */
function calcularLostCapacity(componente, base, opts) {
  if (!componente || componente.primary_mechanism !== 'LOST_CAPACITY') {
    throw new Error('calcularLostCapacity: el componente debe declarar primary_mechanism=LOST_CAPACITY.');
  }
  var exigeReconstruccion = RECURSOS_QUE_EXIGEN_RECONSTRUCCION.indexOf(componente.resource_type) !== -1;

  if (exigeReconstruccion) {
    var reconstruccion = opts && opts.reconstruccion;
    var tipoValido = reconstruccion && TIPOS_RECONSTRUCCION.indexOf(reconstruccion.tipo) !== -1;
    if (!tipoValido) {
      return {
        rechazado: true,
        monetization_status: 'N_A',
        motivo: 'INV-CFF-46: resource_type="' + componente.resource_type + '" exige reconstruir la consecuencia ' +
          'real (' + TIPOS_RECONSTRUCCION.join(' | ') + ') antes de monetizar — no se acepta cantidad × tarifa ' +
          'de forma automática (§8.2).'
      };
    }
  }

  var valorResuelto = resolverValorComponente(componente, base);
  var resultado = Object.assign({ rechazado: false }, valorResuelto);
  if (exigeReconstruccion) resultado.reconstruccion = opts.reconstruccion;
  return resultado;
}

// ── §35 agregación por mecanismo (CA/VCP/CR/VNC) ─────────────────────────

/**
 * agregarPorMecanismo(componentesValorados)
 *
 * componentesValorados: array de { primary_mechanism, original_currency,
 *   valor? } o { primary_mechanism, original_currency, valorMin?, valorMax? }
 *   — la forma que produce resolverValorComponente(), con primary_mechanism
 *   y original_currency añadidos por quien llama.
 *
 * Devuelve, por cada uno de los 4 mecanismos canónicos:
 *   { formula: 'CA'|'VCP'|'CR'|'VNC', nComponentes, esRango,
 *     suma (solo si !esRango), sumaMin, sumaMax }
 *
 * Rechaza (lanza) si los componentes mezclan original_currency — sumar
 * monedas distintas sin normalizar es INV-CFF-28; esa normalización es
 * Fase 4a, no algo que esta función deba resolver silenciosamente.
 */
function agregarPorMecanismo(componentesValorados) {
  if (!Array.isArray(componentesValorados)) {
    throw new Error('agregarPorMecanismo: se esperaba un array de componentes valorados.');
  }

  var monedas = {};
  componentesValorados.forEach(function (c) {
    if (c.original_currency != null) monedas[c.original_currency] = true;
  });
  if (Object.keys(monedas).length > 1) {
    throw new Error('agregarPorMecanismo: los componentes mezclan monedas (' + Object.keys(monedas).join(', ') +
      ') sin normalizar — INV-CFF-28. La normalización de moneda es Fase 4a; esta función no suma monedas distintas.');
  }

  var resultado = {};
  Object.keys(MECANISMOS_A_FORMULA).forEach(function (mecanismo) {
    resultado[mecanismo] = {
      formula: MECANISMOS_A_FORMULA[mecanismo],
      nComponentes: 0, esRango: false, suma: null, sumaMin: null, sumaMax: null
    };
  });

  componentesValorados.forEach(function (c) {
    var mecanismo = c.primary_mechanism;
    if (!resultado.hasOwnProperty(mecanismo)) {
      throw new Error('agregarPorMecanismo: primary_mechanism desconocido "' + mecanismo + '".');
    }
    var acc = resultado[mecanismo];
    var esPunto = c.valor != null;
    var esRango = c.valorMin != null && c.valorMax != null;
    if (!esPunto && !esRango) {
      throw new Error('agregarPorMecanismo: un componente no trae valor resuelto (ni valor ni valorMin/valorMax).');
    }
    acc.nComponentes++;
    if (esRango) acc.esRango = true;
    var min = esPunto ? c.valor : c.valorMin;
    var max = esPunto ? c.valor : c.valorMax;
    acc.sumaMin = (acc.sumaMin == null ? 0 : acc.sumaMin) + min;
    acc.sumaMax = (acc.sumaMax == null ? 0 : acc.sumaMax) + max;
  });

  Object.keys(resultado).forEach(function (mecanismo) {
    var acc = resultado[mecanismo];
    if (acc.nComponentes > 0 && !acc.esRango) {
      acc.suma = acc.sumaMin; // sumaMin === sumaMax cuando todos los componentes son punto
    }
  });

  return resultado;
}

// ── §8.5 preferencia COMPONENT_BASED sobre benchmark agregado ────────────

/**
 * preferirBaseMonetaria(candidatas)
 *
 * candidatas: array de MONETARY_BASIS (o { basis_type, ... }) que valoran
 * el mismo concepto. Prefiere la primera que NO sea EXTERNAL_BENCHMARK
 * (§8.5: "CFF debe preferir modelos COMPONENT_BASED a multiplicadores
 * agregados... un benchmark agregado puede usarse... pero nunca como
 * sustituto automático de evidencia interna pertinente"). Si todas son
 * EXTERNAL_BENCHMARK, la usa mecánicamente y marca la limitación con un
 * flag — no juzga si "la transferencia es admisible" (§8.5), eso excede
 * lo que esta función puede decidir sin más contexto.
 *
 * Devuelve { seleccionada, flags: [] | ['SOLO_BENCHMARK_DISPONIBLE'] }.
 */
function preferirBaseMonetaria(candidatas) {
  if (!Array.isArray(candidatas) || candidatas.length === 0) {
    throw new Error('preferirBaseMonetaria: se esperaba un array no vacío de MONETARY_BASIS candidatas.');
  }
  var noBenchmark = candidatas.filter(function (b) { return b.basis_type !== 'EXTERNAL_BENCHMARK'; });
  if (noBenchmark.length > 0) {
    return { seleccionada: noBenchmark[0], flags: [] };
  }
  return { seleccionada: candidatas[0], flags: ['SOLO_BENCHMARK_DISPONIBLE'] };
}

module.exports = {
  MECANISMOS_A_FORMULA: MECANISMOS_A_FORMULA,
  RECURSOS_QUE_EXIGEN_RECONSTRUCCION: RECURSOS_QUE_EXIGEN_RECONSTRUCCION,
  TIPOS_RECONSTRUCCION: TIPOS_RECONSTRUCCION,
  resolverValorComponente: resolverValorComponente,
  aplicarResultadoAComponente: aplicarResultadoAComponente,
  calcularLostCapacity: calcularLostCapacity,
  agregarPorMecanismo: agregarPorMecanismo,
  preferirBaseMonetaria: preferirBaseMonetaria
};
