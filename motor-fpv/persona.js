/**
 * motor-fpv/persona.js — Fase 1
 *
 * Nivel Persona (§7.1). El más chico de los tres niveles del motor
 * (§7: "Persona, población por posición, configuración F–P–V").
 *
 * §7.1 literal:
 *   "Para una Persona con respuesta válida, cada sensor toma directamente
 *    el valor normalizado correspondiente. Como existe un solo ítem
 *    nuclear por dimensión, no se realiza promedio interno."
 *      F = s(rF) · P = s(rP) · V = s(rV)
 *   "Si una dimensión es NE o NR, esa dimensión queda no calculable para
 *    la Persona. No se completa con las otras dos. El perfil individual
 *    completo existe únicamente cuando F, P y V tienen respuesta válida."
 *
 * ── NE y NR a nivel Persona: MISMO EFECTO ─────────────────────────────
 *
 * §7.1 (línea 404) trata "NE o NR" como UNA sola condición → "no
 * calculable para la Persona, no se completa con las otras dos". A este
 * nivel no hay tratamiento diferenciado.
 *
 * La distinción NE≠NR (§6, "nunca se fusionan") es una regla de
 * CLASIFICACIÓN, no de tratamiento — y sí importa aguas abajo:
 *   - Cobertura CE (§7.2.D / §14): `CE = n_v / (n_v + n_NE)` — NE cuenta
 *     en el denominador, NR no. (Fase 3.)
 *   - §14 conserva `n_valido`, `n_NE`, `n_NR` por separado como conteos.
 *     `n_NR` no entra en ninguna fórmula del documento — solo se reporta
 *     como trazabilidad.
 *
 * DECISIÓN DE ARQUITECTURA (no una necesidad del documento): `sensorPersona`
 * CONSERVA el `motivo` ('NE' | 'NR'). El documento NO exige que la
 * distinción se propague por esta capa — Fase 3 podría, en cambio, volver
 * a leer el valor crudo del input. Se elige pasarlo por aquí para que
 * Fase 2/3 no tengan que re-clasificar cada respuesta. Es una elección de
 * dónde vive la clasificación, no un requisito de §7.1.
 */

'use strict';

var mod = require('./enums');
var s = mod.s;
var contratos = require('./contratos');

/**
 * sensorPersona(valor) → {
 *   valido: boolean,
 *   r?: number,        // la respuesta original 1–5, si válida (§6: "se conserva siempre")
 *   s?: number,        // s(r) = 25·(r−1), 0–100, si válida
 *   motivo?: 'NE' | 'NR'   // si NO válida — conservado para Fase 3 (CE) y §14
 * }
 *
 * `valor` debe venir ya validado por el contrato (1–5 | 'NE' | 'NR').
 * Cualquier otra cosa es un error de programación, no un caso de dominio.
 *
 * El `motivo` se conserva por decisión de arquitectura (ver cabecera),
 * no porque §7.1 lo exija.
 */
function sensorPersona(valor) {
  var clase = contratos.clasificarValorRespuesta(valor);
  if (clase === 'ORDINAL') return { valido: true, r: valor, s: s(valor) };
  if (clase === 'NE') return { valido: false, motivo: 'NE' };
  if (clase === 'NR') return { valido: false, motivo: 'NR' };
  throw new Error('sensorPersona: valor "' + valor + '" no clasificable (§14: 1–5 | NE | NR). ' +
    'Debe venir validado por validarFPVInput.');
}

/**
 * perfilPersona(respuesta) → {
 *   persona_id, posicion,
 *   F: <sensorPersona>, P: <sensorPersona>, V: <sensorPersona>,
 *   completo: boolean,      // §7.1: F, P y V los tres válidos
 *   peso: number | null     // §9, escalar por persona; se propaga sin tocar
 * }
 *
 * §7.1: "El perfil individual completo existe únicamente cuando F, P y V
 * tienen respuesta válida." Una dimensión NE/NR NO se completa con las
 * otras dos — su `s` simplemente no existe.
 */
function perfilPersona(respuesta) {
  var F = sensorPersona(respuesta.F);
  var P = sensorPersona(respuesta.P);
  var V = sensorPersona(respuesta.V);
  return {
    persona_id: respuesta.persona_id,
    posicion: respuesta.posicion,
    F: F, P: P, V: V,
    completo: F.valido && P.valido && V.valido,
    peso: (typeof respuesta.peso === 'number' && isFinite(respuesta.peso)) ? respuesta.peso : null
  };
}

module.exports = {
  sensorPersona: sensorPersona,
  perfilPersona: perfilPersona
};
