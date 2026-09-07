/**
 * motor-fpv/runFPV.js — Fase 6
 *
 * Orquestador del motor FPV. Encadena las Fases 1–5 por posición y produce
 * el FPV_OUTPUT autovalidado (§7 / §11 / §14).
 *
 * §7: "El motor opera en tres niveles: Persona, población por posición de
 * participación y configuración F–P–V. No calcula un promedio global entre
 * consumidor, inversionista y proveedor."
 *
 * §14 SALIDA:
 *   FPV-C / FPV-I / FPV-P
 *   perfil F|P|V + distribución + H + C + cobertura + trazabilidad
 *
 * Una sola entrada `runFPV(input)` — NO hay llamada de agregación aparte:
 * las 3 posiciones son independientes y NUNCA se combinan (§11).
 *
 * ── Contrato de error (patrón runEPD de IFD) ─────────────────────────
 *
 * `runFPV` NO lanza ante input mal formado: devuelve `{ ok:false, errores }`.
 * Lanza `poblacionalSensorPonderado` si una posición pide ponderación y
 * falta un peso — eso se captura y se convierte en `{ ok:false, errores }`
 * (es un problema del input del llamante, no un fallo del motor).
 *
 * ── Decisiones de Fase 6 ─────────────────────────────────────────────
 *
 * A — ponderación OPT-IN por posición: `input.posiciones.<POS>.ponderacion
 *     = { metodologia }`. Presente ⇒ los 3 sensores de esa posición usan
 *     `poblacionalSensorPonderado`. Ausente ⇒ no ponderado (default §9).
 * B — posición SIN respuestas: se emite igual (§11.1: las 3 son
 *     obligatorias), con todos los sensores en NO_CALCULABLE y la
 *     configuración en `calculable:false`. §18: "no calcular" es una salida
 *     válida.
 * C — bandas descriptivas (§7.2.B): NO se incluyen en la salida (decisión
 *     de Luis). Son presentación opcional; `bandasDescriptivas` sigue
 *     exportada desde `poblacional.js` para el llamante que las quiera.
 * D — posición ponderada: emite SOLO las stats ponderadas + `n_no_ponderado`
 *     + `metodologia` (lo que ya devuelve la función de Fase 5). NO un
 *     bloque paralelo sin ponderar — §9 pide conservar el n y la
 *     metodología, no un recálculo completo.
 * E — trazabilidad (§14 "+ trazabilidad"): `meta` con `version` + por
 *     posición `{ n_respondientes, ponderado, metodologia? }`. Mínimo para
 *     reconstruir qué se calculó.
 * F — "conserva siempre la respuesta original" (§6/§1): la salida lleva la
 *     distribución `p₁..p₅` + conteos (`nv/nNE/nNR`), no la lista cruda por
 *     persona (decisión H de Fase 0). La distribución completa a nivel
 *     agregado satisface esa garantía.
 */

'use strict';

var contratos = require('./contratos');
var persona = require('./persona');
var poblacional = require('./poblacional');
var ponderacion = require('./ponderacion');
var cobertura = require('./cobertura');
var configuracion = require('./configuracion');
var ENUMS = require('./enums').ENUMS;

var ETIQUETA = { CONSUMIDOR: 'FPV-C', INVERSIONISTA: 'FPV-I', PROVEEDOR: 'FPV-P' };

/**
 * runFPV(input) → { ok:true, output } | { ok:false, errores:[] }
 *
 * input = {
 *   respuestas: [{ persona_id, posicion, F, P, V, peso? }],   // ≥ 1
 *   posiciones?: {
 *     <POSICION>: {
 *       N_elegibles?: number,
 *       diseno?: { probabilistico, modelo_documentado },
 *       ponderacion?: { metodologia: string }
 *     }
 *   }
 * }
 */
function runFPV(input) {
  var vi = contratos.validarFPVInput(input);
  if (!vi.valido) {
    return {
      ok: false,
      errores: vi.faltantes.map(function (f) { return 'falta: ' + f; }).concat(vi.invalidos)
    };
  }

  var meta = (input.posiciones && typeof input.posiciones === 'object' && !Array.isArray(input.posiciones))
    ? input.posiciones : {};

  // agrupar por posición — SIEMPRE las 3, aunque queden vacías (decisión B)
  var porPos = {};
  ENUMS.POSICION.forEach(function (p) { porPos[p] = []; });
  input.respuestas.forEach(function (r) { porPos[r.posicion].push(r); });

  var salida = { posiciones: {}, meta: { version: 'v1.2', posiciones: {} } };
  var errores = [];

  ENUMS.POSICION.forEach(function (pos) {
    var m = meta[pos] || {};
    var pond = (m.ponderacion && typeof m.ponderacion === 'object') ? m.ponderacion : null;
    var N_elegibles = (typeof m.N_elegibles === 'number') ? m.N_elegibles : undefined;
    var diseno = m.diseno || undefined;
    var perfiles = porPos[pos].map(persona.perfilPersona);

    try {
      var sensores = {};
      ENUMS.SENSOR.forEach(function (sen) {
        var pob = pond
          ? ponderacion.poblacionalSensorPonderado(perfiles, sen, { metodologia: pond.metodologia })
          : poblacional.poblacionalSensor(perfiles, sen);
        sensores[sen] = cobertura.coberturaSensor(pob, diseno, N_elegibles);
      });

      salida.posiciones[pos] = {
        etiqueta: ETIQUETA[pos],
        n_respondientes: perfiles.length,
        participacion: cobertura.participacionPosicion(perfiles, N_elegibles),
        sensores: sensores,
        configuracion: configuracion.configuracionFPV(perfiles)
      };
      // meta.ponderado se deriva de lo que REALMENTE se calculó (la salida
      // del sensor), no de la intención declarada en el input — así no
      // puede mentir si el pipeline no honró la petición de ponderación.
      var fuePonderado = sensores.F && sensores.F.ponderado === true;
      salida.meta.posiciones[pos] = {
        n_respondientes: perfiles.length,
        ponderado: fuePonderado,
        metodologia: fuePonderado ? (sensores.F.metodologia || null) : null
      };
    } catch (e) {
      errores.push('posición ' + pos + ': ' + e.message);
    }
  });

  if (errores.length) return { ok: false, errores: errores };

  // autovalidación — invariante interno, no debería fallar nunca (patrón IFD)
  var vo = contratos.validarFPVOutput(salida);
  if (!vo.valido) {
    return { ok: false, errores: ['salida auto-inválida (invariante interno de runFPV): ' + vo.invalidos.join('; ')] };
  }

  return { ok: true, output: salida };
}

module.exports = { runFPV: runFPV };
