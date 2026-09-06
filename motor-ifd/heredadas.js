/**
 * motor-ifd/heredadas.js — Fase 6
 *
 * Tres cosas que el motor debe hacer ANTES de consolidar la salida y que
 * el documento deja explícitamente sin fórmula o sin operacionalizar:
 *
 *   §24  Salidas heredadas   CFD / CFR / VER / ROI_P / TRE — marcador
 *                            congelado, NUNCA una cifra
 *   §25  Doble conteo        Overlapᵢⱼ = f(EventID, ResourceID,
 *                            CostComponentID, PeriodID) — alerta + bloqueo
 *   §38  Versionamiento      registro de cambio calibrable (6 datos)
 *
 * ── §24 — por qué un MARCADOR y no una cifra ─────────────────────────
 *
 * §24 literal: "En v1.2.2 NO se fija fórmula normativa para ninguna de
 * estas cinco salidas." Y para cada una (§24.1-24.5): "Fórmula normativa:
 * PENDIENTE DE AUDITORÍA HISTÓRICA CONTRA IFT v1.0 FINAL." El engine
 * Python de referencia SÍ calcula VER y ROI_P — es anterior a esta
 * decisión. Este motor NO. `construirSalidasHeredadas()` devuelve las 5
 * como `{ estado: 'PENDIENTE_AUDITORIA' }`, objetos SEPARADOS (§24: "No
 * presentar CFR = VER como decisión metodológica cerrada" — no se colapsan
 * ni se comparten referencia).
 *
 * ── §25 — qué es "solapamiento material" ────────────────────────────
 *
 * El documento da la firma `Overlapᵢⱼ = f(EventID, ResourceID,
 * CostComponentID, PeriodID)` pero no define `f` ni "material". La frase
 * más fuerte del texto ancla la definición: "Un mismo costo no puede
 * aparecer incorporado dentro de otra consecuencia y sumarse nuevamente."
 * → dos impactos son EL MISMO costo (solapamiento material) cuando
 * coinciden en los CUATRO identificadores. Coincidencia parcial (mismo
 * evento+recurso, distinto período) → NO material: períodos o componentes
 * distintos son costos distintos. Decisión A aprobada por Luis.
 *
 * La comparación entre EPDs distintos es de la AGREGACIÓN (Fase 7).
 * `detectarDobleConteo` se prueba aquí en aislamiento — Fase 7 lo llamará
 * con las claves de varios EPDs.
 */

'use strict';

var contratos = require('./contratos');

function esIdentificador(v) {
  return (typeof v === 'string' && v.trim().length > 0) || (typeof v === 'number' && isFinite(v));
}

// ── §24 — salidas heredadas ──────────────────────────────────────────

/**
 * construirSalidasHeredadas() → { CFD, CFR, VER, ROI_P, TRE }
 *
 * Cada una: un objeto NUEVO { estado: 'PENDIENTE_AUDITORIA' }. Ninguna
 * comparte referencia (§24: CFR ≠ VER, ni siquiera el mismo objeto).
 * Pasa validarSalidasHeredadas por construcción (cross-check en el test).
 */
function construirSalidasHeredadas() {
  var salida = {};
  contratos.SALIDAS_HEREDADAS.forEach(function (k) {
    salida[k] = { estado: contratos.MARCADOR_HEREDADO_ESTADO };
  });
  return salida;
}

// ── §25 — control de doble conteo ────────────────────────────────────

/**
 * claveSolapamiento(x) → { valido, motivo, clave }
 *
 * §25 / §31: una clave de solapamiento es la 4-tupla
 * { event_id, resource_id, cost_component_id, period_id }. Los 4
 * obligatorios; cada uno string no vacío o número finito.
 */
function claveSolapamiento(x) {
  var campos = ['event_id', 'resource_id', 'cost_component_id', 'period_id'];
  if (x === null || typeof x !== 'object' || Array.isArray(x)) {
    return { valido: false, motivo: 'clave de solapamiento: se esperaba objeto con ' + campos.join(', '), clave: null };
  }
  var faltan = campos.filter(function (c) { return !esIdentificador(x[c]); });
  if (faltan.length) {
    return { valido: false, motivo: 'clave de solapamiento: identificador(es) ausente(s) o inválido(s): ' + faltan.join(', '), clave: null };
  }
  return {
    valido: true, motivo: null,
    clave: { event_id: x.event_id, resource_id: x.resource_id, cost_component_id: x.cost_component_id, period_id: x.period_id }
  };
}

/**
 * overlapMaterial(a, b) → boolean
 *
 * §25: `f(EventID, ResourceID, CostComponentID, PeriodID)`. Material ⟺ los
 * CUATRO identificadores iguales (ancla textual: "un mismo costo... dentro
 * de otra consecuencia"). Igualdad estricta (`===`) — un id numérico 3 no
 * coincide con la cadena "3".
 *
 * Precondición: a y b son claves válidas (claveSolapamiento).
 */
function overlapMaterial(a, b) {
  return a.event_id === b.event_id &&
         a.resource_id === b.resource_id &&
         a.cost_component_id === b.cost_component_id &&
         a.period_id === b.period_id;
}

/**
 * detectarDobleConteo(claves) → {
 *   pares_solapados: Array<[number, number]>,   // índices i<j con overlap material
 *   alerta: 'A14' | null,
 *   bloquear_agregacion: boolean,
 *   invalidos: string[]                          // claves mal formadas
 * }
 *
 * §25: "Si existe solapamiento material, el sistema genera alerta y
 * bloquea la agregación automática." §35: "Doble conteo → impedir suma
 * automática." Un solo par material → A14 + bloquear_agregacion = true.
 */
function detectarDobleConteo(claves) {
  if (!Array.isArray(claves)) {
    return { pares_solapados: [], alerta: null, bloquear_agregacion: false,
      invalidos: ['detectarDobleConteo: se esperaba un array de claves de solapamiento'] };
  }
  var normal = [], invalidos = [];
  claves.forEach(function (c, i) {
    var v = claveSolapamiento(c);
    if (v.valido) normal.push(v.clave);
    else invalidos.push('clave[' + i + ']: ' + v.motivo);
  });

  var pares = [];
  for (var i = 0; i < normal.length; i++) {
    for (var j = i + 1; j < normal.length; j++) {
      if (overlapMaterial(normal[i], normal[j])) pares.push([i, j]);
    }
  }
  var hay = pares.length > 0;
  return {
    pares_solapados: pares,
    alerta: hay ? 'A14' : null,
    bloquear_agregacion: hay,
    invalidos: invalidos
  };
}

// ── §38 — registro de cambio calibrable ──────────────────────────────

/**
 * construirRegistroCalibracion(campos) → { valido, faltantes, registro }
 *
 * §38: "Cualquier cambio calibrable debe documentar parámetro anterior,
 * parámetro nuevo, evidencia, muestra, efecto y versión." Aquí se exige
 * además `parametro` (cuál cambió). NO calcula nada — solo valida que el
 * registro esté completo. La matemática de calibración (§36) es Fase 8.
 *
 * El determinismo de §35 ("misma entrada + misma versión → misma salida")
 * se verifica en Fase 7, cuando exista el orquestador runIFD.
 */
function construirRegistroCalibracion(campos) {
  var requeridos = ['parametro', 'anterior', 'nuevo', 'evidencia', 'muestra', 'efecto', 'version'];
  var c = campos || {};
  var faltantes = requeridos.filter(function (k) {
    return c[k] === undefined || c[k] === null || (typeof c[k] === 'string' && c[k].trim() === '');
  });
  if (faltantes.length) {
    return { valido: false, faltantes: faltantes, registro: null };
  }
  var registro = {};
  requeridos.forEach(function (k) { registro[k] = c[k]; });
  return { valido: true, faltantes: [], registro: registro };
}

module.exports = {
  construirSalidasHeredadas: construirSalidasHeredadas,
  claveSolapamiento: claveSolapamiento,
  overlapMaterial: overlapMaterial,
  detectarDobleConteo: detectarDobleConteo,
  construirRegistroCalibracion: construirRegistroCalibracion
};
