/**
 * motor-ifd/economia.js — Fase 5
 *
 * Módulo económico (§23). Se activa ÚNICAMENTE después de que Fase 3/4
 * produjo una consecuencia física cuantificada. §23 literal:
 *
 *   CUANTIFICABLE ≠ MONETIZABLE
 *   EXPOSICIÓN ECONÓMICA ≠ ATRIBUCIÓN
 *
 *   §23.1  Puerta       AEᵢ = Unidadᵢ ∧ ValorUnitarioᵢ ∧ TrazabilidadEconómicaᵢ
 *   §23.2  EEB          EEBᵢ = Qᵢ^fut × VUᵢ
 *   §23.3  Atribución   CONFIRMED · SUPPORTED · UNRESOLVED · N_A
 *
 * ── EL INVARIANTE MÁS PROTEGIDO DEL MOTOR ─────────────────────────────
 *
 * §28: "CRITICAL INVARIANT: attribution_category is NOT read in any of
 * these three calculations". §32: ATRIBUIR ≠ PONDERAR ·
 * ATRIBUCIÓN ≠ COEFICIENTE DE DESCUENTO. §34/§35: CONFIRMED, SUPPORTED,
 * UNRESOLVED y N_A producen EXACTAMENTE la misma valoración económica con
 * la misma consecuencia + valor unitario + trazabilidad.
 *
 * En este archivo: la aritmética (`exposicionEconomicaBruta`) NUNCA lee
 * `attribution_category`. `tratamientoAtribucion` lo lee SOLO para decidir
 * qué se puede AFIRMAR sobre la relación — nunca para tocar la cifra.
 *
 * ── §23.1 — tercera condición: `unit` ─────────────────────────────────
 *
 * `unit` = unidad de MEDIDA física ("horas", "eventos"). §31 la lista
 * aparte de "valor unitario y trazabilidad económica"; §12 la distingue
 * ("3.000 horas... 25 unidades monetarias por hora"). El engine Python de
 * referencia NO tiene este campo — divergencia deliberada de §23.1 (ver
 * README, "Alcance del oráculo"). NO se verifica coherencia entre `unit` y
 * nada más: el documento no da un segundo campo de unidad contra el cual
 * comparar. "Unidades incompatibles" (§29 #13 / A15) es un problema de
 * AGREGACIÓN entre EPDs (Fase 7), no de un EPD individual.
 *
 * ── ver / roi / contención — NO ──────────────────────────────────────
 *
 * El engine calcula `ver`/`roi` desde containment_factor. v1.2.2 §24 los
 * dejó PENDIENTE DE AUDITORÍA. Este módulo NO los produce. Los 5
 * marcadores heredados (CFD/CFR/VER/ROI_P/TRE) los arma Fase 6.
 */

'use strict';

var mod = require('./enums');
var ALERTAS = mod.ALERTAS;

function num(v) { return typeof v === 'number' && isFinite(v); }
function strNoVacia(v) { return typeof v === 'string' && v.trim().length > 0; }

// ── §23.1 — Puerta económica ──────────────────────────────────────────

/**
 * evaluarPuertaEconomica(input) → {
 *   abierta: boolean,
 *   condiciones: { unit: boolean, unit_value: boolean, economic_traceability: boolean },
 *   faltantes: string[],
 *   alerta: string|null,          // 'A09' cuando hubo intención económica pero incompleta
 *   nota: string
 * }
 *
 * AE = unit ∧ unit_value ∧ economic_traceability — AND estricto de las 3.
 *
 * Alerta A09 (VALOR_ECONOMICO_INSUFICIENTE, §29 #9): se emite cuando el
 * llamante SEÑALÓ intención económica —`unit_value` presente O
 * `economic_traceability === true`— pero la puerta no está completa. Si no
 * hubo ninguna señal (sin unit_value y trazabilidad falsa) → EPD
 * no-económico: puerta cerrada SIN alerta (§35: "cantidad sin valor
 * unitario → no monetizar", sin más).
 */
function evaluarPuertaEconomica(input) {
  var cond = {
    unit: strNoVacia(input && input.unit),
    unit_value: num(input && input.unit_value),
    economic_traceability: (input && input.economic_traceability) === true
  };
  var abierta = cond.unit && cond.unit_value && cond.economic_traceability;

  var faltantes = [];
  if (!cond.unit) faltantes.push('unit');
  if (!cond.unit_value) faltantes.push('unit_value');
  if (!cond.economic_traceability) faltantes.push('economic_traceability');

  if (abierta) {
    return { abierta: true, condiciones: cond, faltantes: [], alerta: null,
      nota: 'Puerta económica §23.1 abierta: unit + unit_value + economic_traceability.' };
  }

  var huboIntencion = cond.unit_value || cond.economic_traceability;
  return {
    abierta: false,
    condiciones: cond,
    faltantes: faltantes,
    alerta: huboIntencion ? 'A09' : null,
    nota: huboIntencion
      ? 'Puerta económica §23.1 incompleta (falta: ' + faltantes.join(', ') + '). ' +
        'Intención económica señalada pero no se monetiza. A09 ' + ALERTAS.A09 + ' (§29 #9).'
      : 'Sin señal económica (sin unit_value y economic_traceability=false) → EPD no-económico, ' +
        'no se monetiza y no se emite alerta (§35: "cantidad sin valor unitario → no monetizar").'
  };
}

// ── §23.2 — Exposición económica bruta ────────────────────────────────

/**
 * exposicionEconomicaBruta(proyeccion, unitValue) → {
 *   economic_base: number|null, economic_lower: number|null, economic_upper: number|null
 * }
 *
 * §23.2: EEBᵢ = Qᵢ^fut × VUᵢ. `proyeccion` = { base, lower, upper } — el
 * envelope [L, B, U] de §22 (Fase 4). Los rangos monetarios provienen de
 * la incertidumbre de la PROYECCIÓN (§23.3: "nunca de convertir la
 * atribución en un porcentaje"). Null-safe: componente de proyección null
 * → componente económico null.
 *
 * NO lee attribution_category. Ni siquiera lo recibe.
 */
function exposicionEconomicaBruta(proyeccion, unitValue) {
  if (!num(unitValue)) {
    throw new Error('exposicionEconomicaBruta: unit_value debe ser numérico (la puerta §23.1 debió filtrarlo).');
  }
  var p = proyeccion || {};
  var mul = function (x) { return num(x) ? x * unitValue : null; };
  return {
    economic_base: mul(p.base),
    economic_lower: mul(p.lower),
    economic_upper: mul(p.upper)
  };
}

// ── §23.3 — Tratamiento por categoría de atribución ───────────────────

/**
 * tratamientoAtribucion(categoria) → {
 *   categoria: string, alerta: string|null, afirmacion: string, nota: string
 * }
 *
 * §23.3: "Determinar qué puede afirmarse sobre esa relación SIN alterar
 * aritméticamente el valor económico." NUNCA devuelve un número, un
 * coeficiente ni un factor. Solo texto sobre la afirmación.
 *
 * Precondición: `categoria` ya validada por validarAtribucionCategoria
 * (contratos.js) — es una de las 4 discretas.
 */
function tratamientoAtribucion(categoria) {
  switch (categoria) {
    case 'CONFIRMED':
      return { categoria: categoria, alerta: null, afirmacion: 'COSTO_ATRIBUIBLE_CONFIRMADO',
        nota: 'La relación está confirmada según los criterios vigentes; la categoría acompaña la cifra, no la multiplica (§23.3).' };
    case 'SUPPORTED':
      return { categoria: categoria, alerta: null, afirmacion: 'COSTO_ATRIBUIBLE_SUSTENTADO',
        nota: 'La relación está sustentada; se comunica con ese nivel de evidencia, sin descuento porcentual (§23.3).' };
    case 'UNRESOLVED':
      return { categoria: categoria, alerta: 'A10', afirmacion: 'VALORACION_NO_ATRIBUIBLE_DEMOSTRADA',
        nota: 'La valoración económica puede reportarse, pero NO debe presentarse como costo atribuible demostrado (§23.3/§28). A10 ' + ALERTAS.A10 + '.' };
    case 'N_A':
      return { categoria: categoria, alerta: null, afirmacion: 'ATRIBUCION_NO_APLICA',
        nota: 'La atribución no aplica al caso; no se introduce coeficiente sustituto (§23.3).' };
    default:
      // No debería llegar (contrato ya validó). Defensivo, no inventa nada.
      throw new Error('tratamientoAtribucion: categoría no reconocida "' + categoria + '" — el contrato debió rechazarla.');
  }
}

// ── Orquestación del módulo económico ────────────────────────────────

/**
 * monetizar(input, proyeccion) → {
 *   economic_base, economic_lower, economic_upper,   // number|null
 *   puerta,                                          // resultado de evaluarPuertaEconomica
 *   atribucion,                                      // resultado de tratamientoAtribucion | null
 *   alerts: string[], notes: string[]
 * }
 *
 * `proyeccion` = { base, lower, upper } (envelope §22). Se asume llamado
 * SOLO tras una proyección física exitosa (§23: "la economía se activa
 * únicamente después de proyectar una consecuencia cuantificable").
 *
 * ORDEN (§28): puerta → EEB → tratamiento de atribución. La aritmética
 * (paso EEB) NO lee attribution_category; el tratamiento lo lee solo para
 * la afirmación, jamás para la cifra.
 */
function monetizar(input, proyeccion) {
  var puerta = evaluarPuertaEconomica(input);

  if (!puerta.abierta) {
    return {
      economic_base: null, economic_lower: null, economic_upper: null,
      puerta: puerta,
      atribucion: null,
      alerts: puerta.alerta ? [puerta.alerta] : [],
      notes: [puerta.nota]
    };
  }

  var eeb = exposicionEconomicaBruta(proyeccion, input.unit_value); // NO recibe attribution_category
  var atr = tratamientoAtribucion(input.attribution_category);

  var notes = [
    'MONETIZACIÓN ≠ ATRIBUCIÓN. La categoría de atribución no multiplica, reduce ni amplifica el valor económico (§23.3/§32).',
    'EEB §23.2: ' + (proyeccion && proyeccion.base) + ' ' + input.unit + ' × ' + input.unit_value +
      ' = ' + eeb.economic_base + '.',
    atr.nota
  ];

  return {
    economic_base: eeb.economic_base,
    economic_lower: eeb.economic_lower,
    economic_upper: eeb.economic_upper,
    puerta: puerta,
    atribucion: atr,
    alerts: atr.alerta ? [atr.alerta] : [],
    notes: notes
  };
}

module.exports = {
  evaluarPuertaEconomica: evaluarPuertaEconomica,
  exposicionEconomicaBruta: exposicionEconomicaBruta,
  tratamientoAtribucion: tratamientoAtribucion,
  monetizar: monetizar
};
