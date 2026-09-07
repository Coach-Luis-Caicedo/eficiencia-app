/**
 * motor-fpv/cobertura.js — Fase 3
 *
 * Cobertura experiencial y participación (§7.2.D) + escalera de estatus de
 * la lectura (§8). Toma el resultado de `poblacionalSensor` (Fase 2) y le
 * añade CE, CV y `estatus`; PR se calcula a nivel POSICIÓN (no sensor).
 *
 * §7.2.D literal:
 *   CEⱼ = 100 × nᵥ / (nᵥ + nNE)        [§14 l.875: "si denominador > 0"]
 *   PR  = 100 × nrespondentes / Nelegibles
 *   CVⱼ = 100 × nᵥ / Nelegibles
 *   "PR y CV no se interpretan por sí solas como prueba de
 *    representatividad."
 *
 * §8 — escalera (tabla literal):
 *   No calculable   nᵥ = 0 para el sensor.              → no se produce nivel
 *   Descriptivo     ≥ 1 respuesta válida.                → solo lo observado
 *   Censal          "proporción DOCUMENTADA del universo → mostrar CV y
 *                    elegible, observada de forma válida"    no respuesta
 *   Inferencial     "muestra probabilística O diseño con → puede añadir
 *                    modelo inferencial explícito y docum."   intervalos
 *
 * ─── DESVIACIÓN DELIBERADA del pseudocódigo §14 (decisión E) ───────────
 *
 * §14 hace `continuar` inmediatamente tras `estado_j = NO_CALCULABLE`
 * (nᵥ = 0), lo que en la letra del pseudocódigo SALTA también el cálculo
 * de CEⱼ. Este motor NO sigue esa rama: calcula CE (y CV) también cuando
 * nᵥ = 0. Justificación — §8 dice que NO_CALCULABLE veta *el nivel*, no la
 * cobertura; §7.2 lista la cobertura como una de las cuatro salidas
 * SIMULTÁNEAS e independientes; para un sensor todo-NE, CE = 100·0/(0+nNE)
 * = 0 es información real ("0 % de quienes se involucraron tiene
 * experiencia suficiente"), no un hueco. Es una desviación del
 * pseudocódigo, no una lectura de él — se nombra como tal.
 *
 * ─── Qué NO hace Fase 3 (decisión F) ─────────────────────────────────
 *
 * INFERENCIAL habilita "intervalos de incertidumbre y generalización
 * según el diseño" (§8). Fase 3 NO calcula esos intervalos: solo marca
 * `intervalos_permitidos: true`. El cálculo real exige metadata de diseño
 * (estratos, conglomerados, ponderaciones — §8/§14) que el input no lleva,
 * y §15 pide "análisis de sensibilidad antes de introducir cualquier
 * ponderación, umbral o índice". Se expone el permiso, no el número.
 *
 * ─── Lo que el motor NO puede verificar (decisión D, ya anotada) ──────
 *
 * `diseno.probabilistico` / `diseno.modelo_documentado` los DECLARA el
 * llamante. El motor los registra, no los audita. Un llamante que mienta
 * puede inflar el estatus a INFERENCIAL sin que el motor lo detecte.
 */

'use strict';

var mod = require('./enums');
var UMBRAL_CENSAL_CV = mod.PARAMS.UMBRAL_CENSAL_CV; // 80 (%), PENDIENTE_CALIBRACION

function esNumeroPositivo(x) {
  return typeof x === 'number' && isFinite(x) && x > 0;
}

/**
 * coberturaExperiencial(nv, nNE) → CE | null   (§7.2.D)
 * CE = 100·nᵥ/(nᵥ+nNE). Denominador 0 (nadie válido ni NE — p.ej. todo NR
 * o sensor sin respondientes) → null (§14 l.875 "si denominador > 0").
 */
function coberturaExperiencial(nv, nNE) {
  var denom = nv + nNE;
  return denom > 0 ? 100 * nv / denom : null;
}

/**
 * coberturaValida(nv, N_elegibles) → CV | null   (§7.2.D)
 * CV = 100·nᵥ/N_elegibles. Sin N_elegibles (o ≤ 0) → null.
 * El motor NO valida que N_elegibles ≥ nᵥ — si el llamante pasa un marco
 * inconsistente, CV puede pasar de 100 (señal visible de input malo, no se
 * recorta ni se oculta: misma línea que decisión D, el motor registra).
 */
function coberturaValida(nv, N_elegibles) {
  return esNumeroPositivo(N_elegibles) ? 100 * nv / N_elegibles : null;
}

/**
 * disenoHabilitaInferencia(diseno) → boolean   (§8, "muestra probabilística
 * O diseño con modelo inferencial explícito y documentado" — es un "o").
 */
function disenoHabilitaInferencia(diseno) {
  if (!diseno || typeof diseno !== 'object') return false;
  return diseno.probabilistico === true || diseno.modelo_documentado === true;
}

/**
 * escaleraEstatus(nv, censalAplica, inferencialAplica) → ESTATUS_SENSOR
 *
 * §8. La escalera NO es estrictamente monótona (decisión B): CENSAL
 * depende de *cobertura*, INFERENCIAL depende de *diseño* — son upgrades
 * independientes sobre el piso DESCRIPTIVO. Se reporta el MÁS ALTO
 * aplicable, precedencia INFERENCIAL > CENSAL > DESCRIPTIVO.
 *
 * `nv = 0` → NO_CALCULABLE SIEMPRE, gane lo que gane el diseño: §8 fila 1
 * ("no se produce nivel") — no hay lectura inferencial de un nivel que no
 * existe. Es un piso duro, no "el más bajo aplicable".
 */
function escaleraEstatus(nv, censalAplica, inferencialAplica) {
  if (nv === 0) return 'NO_CALCULABLE';
  if (inferencialAplica) return 'INFERENCIAL';
  if (censalAplica) return 'CENSAL';
  return 'DESCRIPTIVO';
}

/**
 * coberturaSensor(pob, diseno?, N_elegibles?) → {
 *   ...pob,                       // todo lo de poblacionalSensor (Fase 2)
 *   CE: number|null,              // §7.2.D
 *   CV: number|null,              // §7.2.D — solo si N_elegibles
 *   estatus: ESTATUS_SENSOR,      // §8 — reemplaza el piso de Fase 2
 *   censal_aplica: boolean,       // decisión B — por qué el estatus es el que es
 *   inferencial_aplica: boolean,
 *   intervalos_permitidos: boolean  // decisión F — permiso, no cálculo
 * }
 *
 * `pob` = salida de `poblacionalSensor`. `diseno` y `N_elegibles` vienen de
 * `posiciones.<POS>` (decisión D/F de Fase 0) — el orquestador los extrae.
 */
function coberturaSensor(pob, diseno, N_elegibles) {
  if (!pob || typeof pob !== 'object' || typeof pob.nv !== 'number' || typeof pob.nNE !== 'number') {
    throw new Error('coberturaSensor: se esperaba una salida de poblacionalSensor (con nv y nNE numéricos).');
  }

  var CE = coberturaExperiencial(pob.nv, pob.nNE);   // decisión E: también con nv = 0
  var CV = coberturaValida(pob.nv, N_elegibles);      // decisión E: también con nv = 0

  var censalAplica = CV !== null && CV >= UMBRAL_CENSAL_CV;
  var inferencialAplica = disenoHabilitaInferencia(diseno);
  var estatus = escaleraEstatus(pob.nv, censalAplica, inferencialAplica);

  var salida = {};
  Object.keys(pob).forEach(function (k) { salida[k] = pob[k]; });
  salida.CE = CE;
  salida.CV = CV;
  salida.estatus = estatus;
  salida.censal_aplica = censalAplica;
  salida.inferencial_aplica = inferencialAplica;
  salida.intervalos_permitidos = inferencialAplica; // NO los calcula (decisión F)
  return salida;
}

/**
 * participacionPosicion(perfiles, N_elegibles?) → { nrespondentes, PR }
 *
 * §7.2.D / §14: PR = 100·nrespondentes/Nelegibles. PR NO lleva subíndice ⱼ
 * — es de POSICIÓN, no de sensor.
 *
 * `nrespondentes` (decisión D): personas que ENVIARON respuesta a esa
 * posición, aunque sea toda NE/NR. Un `perfilPersona` existe por cada fila
 * de `respuestas` — así que es el conteo de personas distintas. La
 * unicidad (posicion, persona_id) ya la fuerza `validarFPVInput`; el
 * `Set` es defensivo.
 */
function participacionPosicion(perfiles, N_elegibles) {
  if (!Array.isArray(perfiles)) {
    throw new Error('participacionPosicion: se esperaba un array de perfilPersona (de una posición).');
  }
  var ids = {};
  perfiles.forEach(function (p) { if (p && p.persona_id != null) ids[p.persona_id] = true; });
  var nrespondentes = Object.keys(ids).length;
  var PR = esNumeroPositivo(N_elegibles) ? 100 * nrespondentes / N_elegibles : null;
  return { nrespondentes: nrespondentes, PR: PR };
}

module.exports = {
  coberturaSensor: coberturaSensor,
  participacionPosicion: participacionPosicion,
  coberturaExperiencial: coberturaExperiencial,
  coberturaValida: coberturaValida,
  disenoHabilitaInferencia: disenoHabilitaInferencia,
  escaleraEstatus: escaleraEstatus
};
