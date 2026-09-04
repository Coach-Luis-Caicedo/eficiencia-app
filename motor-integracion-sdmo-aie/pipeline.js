/**
 * motor-integracion-sdmo-aie/pipeline.js
 *
 * Segundo arnés de integración real — motor-sdmo -> aie_validation_kit
 * (Python real, vía subproceso, opción (a) aprobada explícitamente sobre
 * reimplementar la lógica en JS). Relación "con otros instrumentos" de la
 * regla de las tres relaciones, aplicada ahora al hueco de motor-sdmo.
 *
 * vendor/motor-sdmo/motor-sdmo.js es copia byte-idéntica de feat/motor-sdmo
 * (confirmado con diff antes de escribir este archivo) — no se modifica.
 * aie_validation_kit/ ya está trackeado en main — se invoca tal cual, sin
 * copiar ni reimplementar rules_2f_3f.run_case().
 */

'use strict';

var path = require('path');
var cp = require('child_process');
var MotorSDMO = require('./vendor/motor-sdmo/motor-sdmo');

var BRIDGE_PATH = path.join(__dirname, 'run_case_bridge.py');

/**
 * calcularSerieOrganizacionalIDA(datosPorPeriodo, opts)
 *
 * CONSTRUCCIÓN DEL ARNÉS — NO es una función de motor-sdmo. motor-sdmo
 * expone `agregarOrganizacion` como snapshot de UN período, a propósito
 * (SDMO se aplica con cadencia, no como serie continua por diseño — ver
 * README, sección "Por qué esta función vive aquí y no en motor-sdmo").
 * Este arnés necesita una SERIE de varios períodos para construir `dyn`.
 *
 * @param {Array<Array<Object|number[]|null>>} datosPorPeriodo  T elementos;
 *   cada uno es un array de respuestas SDMO crudas de quienes respondieron
 *   ese período ({ACU,COM,INV,PEN} o array de 4, o null = no-respuesta
 *   individual). El TAMAÑO de cada array puede variar entre períodos
 *   (composición variable — ver supuesto documentado abajo).
 * @param {Object} opts  { delta, minReportableN, percentilConcentracion, ... }
 *   — los mismos parámetros PENDIENTE_VALIDACION que exige motor-sdmo.
 *
 * SUPUESTO EXPLÍCITO (documentado con el mismo nivel que NODE_HIERARCHY en
 * motor-cff): cada período se agrega con el POOL COMPLETO de quien haya
 * respondido ESE período — composición variable, NO cohorte fija de
 * Personas presentes en todos los períodos. Razón: `agregarOrganizacion`
 * NO lleva ningún identificador de Persona entre llamadas — el pool que
 * recibe son números planos, sin id (mecanismo de anonimización de
 * motor-sdmo, §2.10, decisión explícita: "sin reidentificación por
 * combinación de filtros"). Construir una cohorte fija exigiría una capa
 * de identidad persona-por-período que no existe en ningún lugar del
 * sistema — fabricarla aquí rodearía el diseño de anonimización que
 * motor-sdmo trata como cerrado, no como algo que un arnés deba parchear.
 *
 * LIMITACIÓN QUE ESTO DEJA (no se esconde): `dyn(t)` mezcla cambio real
 * dentro de las mismas Personas con cambio de quién respondió ese período
 * (rotación, ausencias puntuales). Una serie de panel fijo aislaría mejor
 * la tendencia pura, pero no es construible con los datos que el sistema
 * expone hoy — no es que se ignore el problema, es que no se puede evaluar
 * sin una capa de identidad que hoy no existe.
 *
 * @returns {{ dyn: Array<number|null>, detallePorPeriodo: Array<Object> }}
 *   dyn puede contener `null` en un período sin ningún respondiente válido
 *   (motor-sdmo nunca imputa — ver hallazgo de frontera en README sobre por
 *   qué esto rompe a rules_2f_3f.run_case si se le pasa sin filtrar).
 */
function calcularSerieOrganizacionalIDA(datosPorPeriodo, opts) {
  var dyn = [];
  var detallePorPeriodo = [];
  datosPorPeriodo.forEach(function (respuestasPeriodo) {
    var idasPeriodo = respuestasPeriodo.map(function (resp) {
      return MotorSDMO.calcularIDA(resp, opts).IDA; // null si es no-respuesta individual
    });
    var r = MotorSDMO.agregarOrganizacion([{ id: 'organizacion', idas: idasPeriodo }], opts);
    dyn.push(r.organizacion.nivelColectivo);
    detallePorPeriodo.push(r);
  });
  return { dyn: dyn, detallePorPeriodo: detallePorPeriodo };
}

/**
 * ejecutarAIE(cfg, dyn, ops)
 *
 * Invoca rules_2f_3f.run_case() REAL como subproceso Python (opción (a) —
 * una sola fuente de verdad, sin reimplementar la clasificación en JS).
 *
 * GUARDA DE FRONTERA (construida aquí, no en Python): rules_2f_3f.run_case
 * no maneja `null`/`None` en `cfg` o `dyn` — engine_core.position() compara
 * `x <= TH_FI` directamente y lanza TypeError sin contexto útil si x es
 * None (confirmado empíricamente, ver README "Hallazgo de frontera #1").
 * Esta función detecta el caso ANTES de invocar Python y lanza un error
 * claro en su lugar — no decide qué hacer con esos períodos (¿excluirlos?
 * ¿tratarlos como N/A explícito, como ya hace `ops`?), eso es una decisión
 * de diseño que no le corresponde fabricar a este arnés.
 */
function ejecutarAIE(cfg, dyn, ops) {
  [['cfg', cfg], ['dyn', dyn]].forEach(function (par) {
    var nombre = par[0], serie = par[1];
    serie.forEach(function (v, t) {
      if (v === null || v === undefined || typeof v !== 'number' || !isFinite(v)) {
        throw new Error('ejecutarAIE: ' + nombre + '[' + t + ']=' + v + ' — rules_2f_3f.run_case() no admite ' +
          'null/NaN en cfg/dyn (lanza TypeError sin contexto útil dentro de engine_core.position()). ' +
          'Este período no tiene una posición numérica válida; decidir cómo tratarlo ' +
          '(excluir el período, propagar N/A explícito como ya hace ops, u otra política) ' +
          'es una decisión de diseño pendiente, no algo que este arnés deba fabricar.');
      }
    });
  });

  var payload = JSON.stringify({ cfg: cfg, dyn: dyn, ops: ops });
  var resultado = cp.spawnSync('python3', [BRIDGE_PATH], { input: payload, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (resultado.error) {
    throw new Error('ejecutarAIE: no se pudo invocar python3 — ' + resultado.error.message);
  }
  if (resultado.status !== 0) {
    throw new Error('ejecutarAIE: rules_2f_3f.run_case() falló (exit ' + resultado.status + ') — ' + resultado.stderr);
  }
  return JSON.parse(resultado.stdout);
}

/**
 * segmentarPorHuecos(cfgSerie, dyn)
 *
 * Parte los índices [0..T-1] en segmentos CONTIGUOS, cortando en cualquier
 * período donde cfg o dyn no sea un número finito (null/NaN/undefined). El
 * propio hueco NO pertenece a ningún segmento.
 *
 * Por qué existe: engine_core.trajectory()/persistence() del prototipo AIE
 * calculan sobre una ventana por POSICIÓN en la lista, no por tiempo
 * calendario — no distinguen "período consecutivo real" de "período
 * consecutivo en el array". Si un hueco (nivelColectivo=null, motor-sdmo
 * nunca imputa, §2.8) se excluyera de la serie sin más, los períodos que
 * quedan se tratarían como si fueran consecutivos cuando no lo son — una
 * trayectoria podría "cruzar" el hueco y mezclar dos tramos que en la
 * realidad no son contiguos. Verificado el efecto exacto de esto (no solo
 * argumentado) en pipeline.test.js, sección "sin segmentar vs. segmentado".
 *
 * PIIO ya resolvió este problema (MAX_CONTINUITY_GAP, N/A como estado
 * propio) — pero engine_core.py del prototipo AIE no tiene esa maquinaria,
 * y este arnés NO se la agrega: modificar el kit de prueba de estrés que ya
 * produjo los resultados 2F/3F documentados como hallazgo obligaría a
 * revisitar si esos resultados siguen siendo válidos — fuera de alcance de
 * este arnés. La segmentación resuelve el problema DESDE AFUERA, sin tocar
 * engine_core.py ni rules_2f_3f.py.
 *
 * @returns {Array<{periodosReales:number[], cfg:number[], dyn:number[]}>}
 *   Cada segmento con su propio índice local implícito (posición dentro del
 *   array `cfg`/`dyn` del segmento) — run_case() lo recibe como si fuera una
 *   serie nueva empezando en t=0, no arrastra el índice del período real.
 */
function segmentarPorHuecos(cfgSerie, dyn) {
  function esValido(v) { return typeof v === 'number' && isFinite(v); }
  var segmentos = [];
  var actual = null;
  for (var t = 0; t < dyn.length; t++) {
    if (esValido(cfgSerie[t]) && esValido(dyn[t])) {
      if (!actual) {
        actual = { periodosReales: [], cfg: [], dyn: [] };
        segmentos.push(actual);
      }
      actual.periodosReales.push(t);
      actual.cfg.push(cfgSerie[t]);
      actual.dyn.push(dyn[t]);
    } else {
      actual = null; // corta aquí — el hueco mismo no entra a ningún segmento
    }
  }
  return segmentos;
}

/**
 * ejecutarPipeline(datosPorPeriodo, cfgSerie, opts)
 *
 * datosPorPeriodo -> motor-sdmo real (calcularIDA + agregarOrganizacion) -> dyn
 *   -> segmentarPorHuecos() -> rules_2f_3f.run_case() real (subproceso), UNA
 *   VEZ POR SEGMENTO, nunca sobre la serie completa aplanada.
 *
 * cfgSerie se recibe como parámetro, NO se deriva de motor-iao en este
 * arnés — el hueco de relación 2 de motor-iao ya se cerró por separado en
 * motor-integracion/ (ICE-IEH -> IAO). cfgSerie aquí es sintético y se
 * marca como tal en cada caso de prueba.
 *
 * ops se fija en null para todos los períodos de cada segmento (PIIO/EFO no
 * existen como módulo todavía) — camino 2F explícito, no una limitación
 * oculta.
 *
 * @returns {{
 *   dyn: Array<number|null>,             // serie completa, huecos visibles
 *   detallePorPeriodo: Array<Object>,
 *   segmentos: Array<{periodosReales:number[], cfg:number[], dyn:number[], aie:Array<Object>}>
 * }}
 *   Un segmento con menos de TRAJ_WINDOW períodos (engine_core.py, =3) da
 *   trayectoria INDETERMINATE en sus primeros puntos — comportamiento
 *   CORRECTO del motor con evidencia insuficiente, no un caso de error.
 */
function ejecutarPipeline(datosPorPeriodo, cfgSerie, opts) {
  var serieDyn = calcularSerieOrganizacionalIDA(datosPorPeriodo, opts);
  var segmentos = segmentarPorHuecos(cfgSerie, serieDyn.dyn).map(function (seg) {
    var ops = seg.dyn.map(function () { return null; });
    var aie = ejecutarAIE(seg.cfg, seg.dyn, ops);
    return { periodosReales: seg.periodosReales, cfg: seg.cfg, dyn: seg.dyn, aie: aie };
  });
  return { dyn: serieDyn.dyn, detallePorPeriodo: serieDyn.detallePorPeriodo, segmentos: segmentos };
}

module.exports = {
  MotorSDMO: MotorSDMO,
  calcularSerieOrganizacionalIDA: calcularSerieOrganizacionalIDA,
  segmentarPorHuecos: segmentarPorHuecos,
  ejecutarAIE: ejecutarAIE,
  ejecutarPipeline: ejecutarPipeline
};
