/**
 * motor-fpv/configuracion.js — Fase 4
 *
 * Configuración F–P–V con muestra emparejada (§7.3). Tercer y último nivel
 * del motor (§7: "Persona, población por posición, configuración F–P–V").
 * Compara F, P y V DENTRO de una misma posición usando SOLO las Personas
 * con las tres dimensiones válidas — para no atribuir a la relación una
 * brecha que en realidad viene de haber calculado cada sensor con grupos
 * distintos (§7.3).
 *
 * §7.3 / §14 (bloque CONFIGURACION), verbatim:
 *   matched = personas con F,P,V válidos
 *   Ncfg = tamaño(matched)
 *   si Ncfg > 0:
 *     recalcular LF*, LP*, LV* sobre matched
 *     G = max(LF*,LP*,LV*) - min(LF*,LP*,LV*)
 *     identificar dimensión mínima y máxima
 *     no calcular promedio global F-P-V        ← prohibición explícita
 *
 * §11.2: "Dimensión limitante descriptiva: la de menor L*. Dimensión
 * fortalecida descriptiva: la de mayor L*."
 *
 * ─── Qué NO hace Fase 4 ──────────────────────────────────────────────
 *
 * - NO promedia F+P+V (§7.3 y §14 lo prohíben; §11 tampoco admite índice
 *   global). No hay ningún campo compensatorio en la salida.
 * - NO recalcula distribución ni H sobre el subconjunto emparejado
 *   (decisión E): §7.3 y §14 dicen "se recalculan LF*, LP* y LV*" —
 *   SOLO los niveles. El "distribución e heterogeneidad visibles" de
 *   §11.2 se satisface con la salida por sensor de Fase 2 (evidencia
 *   válida completa) y es disciplina de presentación → Fase 6.
 * - NO pondera (decisión F): §9 es "no ponderado por defecto"; el LF*
 *   ponderado, si lo hay, se layerea en Fase 5.
 * - NO inventa un campo `estatus` (decisión C): §11.2 lista los campos de
 *   la salida configuracional y no incluye estatus. `calculable`
 *   (= Ncfg > 0) es lo único que se reporta sobre suficiencia.
 *
 * ─── Empates — decisión D ────────────────────────────────────────────
 *
 * `limitante` y `fortalecida` son ARRAYS: normalmente ['F'], pero ['F','P']
 * si dos dimensiones empatan en el mínimo (o el máximo). §11.2 usa singular
 * ("la de menor L*") y NO contempla empates — elegir arbitrariamente una
 * de dos empatadas y presentarla como "la limitante" ocultaría la otra.
 *
 * CASO G = 0 (las tres iguales, min === max): `limitante` y `fortalecida`
 * son AMBOS ['F','P','V']. NO se suprimen a null: G = 0 ya es la señal de
 * "sin desbalance interno"; hacer que el motor decida "no hay dimensión
 * limitante cuando está balanceado" sería una regla que el texto no da
 * (§7.3 dice "G mide desbalance... no deterioro", no dice qué hacer con
 * G = 0). El array con las tres es el resultado mecánico y honesto.
 */

'use strict';

var SENSORES = ['F', 'P', 'V'];

/**
 * configuracionFPV(perfiles) → {
 *   Ncfg: number,                    // §7.3 — Personas con rF, rP y rV válidos
 *   calculable: boolean,             // Ncfg > 0
 *   Lstar: { F, P, V } | null,       // §7.3 — LF-star LP-star LV-star sobre el emparejado, 0–100
 *   G: number | null,                // §7.3 — max(Lstar) − min(Lstar)
 *   limitante: string[] | null,      // §11.2 — dimensión(es) de menor L*
 *   fortalecida: string[] | null     // §11.2 — dimensión(es) de mayor L*
 * }
 *
 * `perfiles` = array de `perfilPersona` (Fase 1) de UNA posición. La
 * muestra emparejada es `perfiles.filter(p => p.completo)` — `completo`
 * ya es exactamente "F, P y V los tres válidos" (§7.1).
 */
function configuracionFPV(perfiles) {
  if (!Array.isArray(perfiles)) {
    throw new Error('configuracionFPV: se esperaba un array de perfilPersona (de una posición).');
  }

  var matched = perfiles.filter(function (p) { return p && p.completo === true; });
  var Ncfg = matched.length;

  if (Ncfg === 0) {
    // §14: "si Ncfg > 0" — sin emparejados no hay lectura configuracional.
    return { Ncfg: 0, calculable: false, Lstar: null, G: null, limitante: null, fortalecida: null };
  }

  var suma = { F: 0, P: 0, V: 0 };
  matched.forEach(function (p) {
    suma.F += p.F.s; // s(r) 0–100 — NO p.F.r (crudo 1–5)
    suma.P += p.P.s;
    suma.V += p.V.s;
  });
  var Lstar = { F: suma.F / Ncfg, P: suma.P / Ncfg, V: suma.V / Ncfg };

  var valores = [Lstar.F, Lstar.P, Lstar.V];
  var max = Math.max.apply(null, valores);
  var min = Math.min.apply(null, valores);
  var G = max - min;

  // Empates (decisión D): TODAS las dimensiones en el min / en el max.
  // Los L* son k·25/Ncfg con k entero → dos iguales ⟺ numeradores iguales,
  // la comparación === es exacta (sin drift). Con G = 0 ambos filtros
  // devuelven ['F','P','V'].
  var limitante = SENSORES.filter(function (k) { return Lstar[k] === min; });
  var fortalecida = SENSORES.filter(function (k) { return Lstar[k] === max; });

  return {
    Ncfg: Ncfg,
    calculable: true,
    Lstar: Lstar,
    G: G,
    limitante: limitante,
    fortalecida: fortalecida
  };
}

module.exports = { configuracionFPV: configuracionFPV };
