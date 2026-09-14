/**
 * motor-integracion-piio-aie/pipeline.js
 *
 * Cuarto arnés de integración real — motor-piio -> AIE (Python real, vía
 * classify_3F/classify_2F DIRECTOS, no run_case()). Cierra el vacío de EFO
 * identificado en DISENO_ARNES_PIIO_AIE.md (aprobado antes de escribir
 * código, actualizado tras la reapertura de motor-piio 75c6501/03dc240).
 *
 * Esta rama parte de `feat/motor-piio` (no de `main`) — a diferencia de
 * `motor-integracion-iao-aie`, aquí SÍ hace falta la reapertura de
 * `efo.js` ya comiteada (`_domainStateGobernante`/`propagarTemporalidadEFO`),
 * así que se usa motor-piio completo, tal cual, sin vendorizar nada: la
 * cascada real (`runPIIOCompleto`) requiere prácticamente todos sus
 * módulos (kpiState, phenomenon, domain, efo, nodos, referencias...), y
 * vendorizar solo una parte no tendría sentido.
 *
 * aie_validation_kit/ también ya está en esta rama (heredado de main vía
 * feat/motor-piio) — se invoca tal cual.
 */

'use strict';

var path = require('path');
var cp = require('child_process');
var PIIO = require('../motor-piio/runPIIO');

var BRIDGE_PATH = path.join(__dirname, 'run_case_efo_bridge.py');

// ═══════════════════════════════════════════════════════════════════════
//  Ensamblaje — YA NO hace falta encadenar historia (reapertura 75c6501):
//  una sola llamada a runPIIOCompleto() ya da traj/pers/det_run correctos
//  por período. El arnés solo filtra por node_id y ordena por period.
// ═══════════════════════════════════════════════════════════════════════

/**
 * obtenerSerieEFO(input, nodeId)
 *
 * input: PIIO_INPUT completo (periods[], observations[], domain_catalog,
 *   phenomenon_catalog, metric_definitions, references, node_hierarchy,
 *   kpi_specs, evidence_groups, organization_id, ruleset_version, ...) —
 *   la MISMA forma que runPIIO.test.js ya usa, con historial de varios
 *   períodos embebido en `observations`/`periods`.
 * nodeId: qué nodo de `efo_states` seguir como serie (ver
 *   DISENO_ARNES_PIIO_AIE.md §3, punto 2 — política de multi-nodo no
 *   decidida; para un solo nodo, pasar ese node_id).
 *
 * @returns {{ efoStates: Array<Object>, rachaTrayectoria: Array<number>,
 *   run_status: string, findings: Array<Object> }}
 *   efoStates viene ordenado por `period` ascendente. rachaTrayectoria[i]
 *   = racha de traj==='DETERIORATING' consecutivos terminando en efoStates[i]
 *   (ver calcularRachaTrayectoria — sigue siendo necesaria, la reapertura
 *   corrigió CÓMO se calcula traj/pers/det_run, no qué mide cada uno).
 */
function obtenerSerieEFO(input, nodeId) {
  var resultado = PIIO.runPIIOCompleto(input, {});
  var propios = (resultado.efo_states || [])
    .filter(function (s) { return s && s.node_id === nodeId; })
    .slice()
    .sort(function (a, b) { return String(a.period) < String(b.period) ? -1 : (String(a.period) > String(b.period) ? 1 : 0); });

  var historiaTraj = [];
  var rachaTrayectoria = propios.map(function (s) {
    historiaTraj = historiaTraj.concat([s.traj]);
    return calcularRachaTrayectoria(historiaTraj);
  });

  return { efoStates: propios, rachaTrayectoria: rachaTrayectoria, run_status: resultado.run_status, findings: resultado.findings };
}

/**
 * calcularRachaTrayectoria(historiaTraj)
 *
 * Cuenta períodos consecutivos, terminando en el ÚLTIMO elemento de
 * `historiaTraj`, en que `traj === 'DETERIORATING'`. Análogo en rol a
 * `engine_core.trajectory_run(series, t, 'DETERIORATING')` (usado para
 * `CFG`/`DYN`) — pero cuenta sobre la serie de `traj` que `motor-piio` ya
 * resolvió (tras la reapertura, con historia real), sin recalcular nada.
 *
 * Resuelve `ops_det_run` para `classify_3F`/`classify_2F` — NO se
 * reutiliza `EFO_STATE.det_run` (racha de *posición*, mismo concepto que
 * `pers`, verificado en DISENO_ARNES_PIIO_AIE.md §2 que NO es la racha de
 * *trayectoria* que `ops_det_run` necesita — Escenario C).
 */
function calcularRachaTrayectoria(historiaTraj) {
  var racha = 0;
  for (var i = historiaTraj.length - 1; i >= 0; i--) {
    if (historiaTraj[i] === 'DETERIORATING') racha++;
    else break;
  }
  return racha;
}

// ═══════════════════════════════════════════════════════════════════════
//  Traducción de vocabulario, en la frontera, sin tocar ni motor-piio ni
//  rules_2f_3f.py (DISENO_ARNES_PIIO_AIE.md §1)
// ═══════════════════════════════════════════════════════════════════════

/**
 * traducirOpsP(pos) — 'N_A' (enum real de PIIO) -> 'N/A' (sentinela que
 * classify_3F/classify_2F usan para "OPS ausente"). ÚNICA traducción
 * necesaria — traj/pers con 'N_A' se comportan correctamente sin
 * traducir (comparaciones de desigualdad o pertenencia en rules_2f_3f.py,
 * nunca `== 'N_A'` exacto).
 */
function traducirOpsP(pos) {
  return pos === 'N_A' ? 'N/A' : pos;
}

/**
 * mapaOpsPorPeriodo(efoStates, rachaTrayectoria)
 *
 * Construye un mapa { period: {p, t, pers, det_run} } — por PERÍODO REAL
 * (string), no por posición de array.
 *
 * HALLAZGO REAL (encontrado al probar un hueco de evidencia, no supuesto):
 * `runPIIO.js:261` (`if (domStates.length === 0) return;`) NO produce
 * ningún `EFO_STATE` para un período sin ningún `DOMAIN_STATE` — el array
 * `efo_states` queda MÁS CORTO que la lista real de períodos, no rellena
 * con `pos:'N_A'`. Esto es distinto de un `EFO_STATE` que SÍ existe con
 * `pos:'N_A'` (evidencia insuficiente pero evaluada) — aquí no hay ni
 * evaluación. Indexar `opsFilas` por posición de array (como se hizo en
 * el primer intento) desalinea todo lo que viene después del primer hueco
 * — se encontró probando exactamente este caso, no en la revisión de
 * diseño. Por eso el mapa se construye por `period`, y `alinearPorPeriodo`
 * (más abajo) rellena explícitamente los períodos ausentes con el mismo
 * default que `rules_2f_3f.run_case()` ya usa para "OPS no presente"
 * (`pers:'POINT', det_run:0` — ver `engine_core.py`/`rules_2f_3f.py`).
 */
function mapaOpsPorPeriodo(efoStates, rachaTrayectoria) {
  var mapa = {};
  efoStates.forEach(function (s, i) {
    mapa[s.period] = { p: traducirOpsP(s.pos), t: s.traj, pers: s.pers, det_run: rachaTrayectoria[i] };
  });
  return mapa;
}

/**
 * alinearPorPeriodo(periodosReales, inputPeriods, mapaOps)
 *
 * `periodosReales`: índices (0-based) que `segmentarPorHuecos` ya devuelve
 * para un segmento de cfg/dyn — posiciones dentro de `inputPeriods`, NO
 * períodos de EFO.
 * `inputPeriods`: `input.periods` completo (mismo largo y mismo orden que
 * `cfgSerie`/`dynSerie` — contrato explícito de `ejecutarPipeline`).
 * `mapaOps`: de `mapaOpsPorPeriodo`.
 *
 * Un período real sin ninguna entrada en `mapaOps` (hueco de evidencia,
 * `runPIIO.js` nunca produjo su `EFO_STATE`) recibe el mismo default que
 * `run_case()` usa para "OPS no presente": `{p:'N/A', t:'N_A',
 * pers:'POINT', det_run:0}` — no se inventa un valor distinto.
 */
function alinearPorPeriodo(periodosReales, inputPeriods, mapaOps) {
  return periodosReales.map(function (idx) {
    var periodo = inputPeriods[idx];
    return mapaOps[periodo] || { p: 'N/A', t: 'N_A', pers: 'POINT', det_run: 0 };
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  Copiado byte-idéntico de feat/motor-integracion-sdmo-aie (685d140) —
//  agnóstico de la fuente, opera sobre dos arrays planos de number|null.
//  Sigue aplicando a CFG/DYN sin cambios (DISENO_ARNES_PIIO_AIE.md §3: el
//  problema que resuelve NO aplica al eje de EFO, que ya representa la
//  ausencia con 'N/A' período por período dentro de classify_3F).
// ═══════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════
//  Puente a Python que llama classify_3F/classify_2F DIRECTAMENTE, no
//  run_case() (DISENO_ARNES_PIIO_AIE.md §2: run_case() decide "¿OPS
//  presente?" con un solo chequeo global sobre ops[0] — con disponibilidad
//  mixta real, o truena o descarta señal en silencio; classify_3F ya
//  acepta 'N/A' por período sin ese problema).
// ═══════════════════════════════════════════════════════════════════════

/**
 * ejecutarAIE_EFO(cfg, dyn, opsFilaPorPeriodo)
 *
 * `cfg`/`dyn`: arrays de números (mismo contrato que las otras 2 ramas —
 * el puente calcula cfg_p/dyn_p/cfg_t/dyn_t con engine_core). `ops`: array
 * de {p,t,pers,det_run} YA categóricos, mismo largo que cfg/dyn, alineados
 * por ÍNDICE LOCAL del llamador (la alineación por período REAL ya ocurrió
 * antes de llamar esta función — ver ejecutarPipeline).
 */
function ejecutarAIE_EFO(cfg, dyn, opsFilaPorPeriodo) {
  [['cfg', cfg], ['dyn', dyn]].forEach(function (par) {
    var nombre = par[0], serie = par[1];
    serie.forEach(function (v, t) {
      if (v === null || v === undefined || typeof v !== 'number' || !isFinite(v)) {
        throw new Error('ejecutarAIE_EFO: ' + nombre + '[' + t + ']=' + v + ' — no admite null/NaN. ' +
          'A diferencia de EFO (que representa ausencia con "N/A" período por período), CFG/DYN siguen ' +
          'necesitando segmentarPorHuecos antes de llegar aquí.');
      }
    });
  });
  if (opsFilaPorPeriodo.length !== cfg.length) {
    throw new Error('ejecutarAIE_EFO: opsFilaPorPeriodo debe tener el mismo largo que cfg/dyn (' +
      opsFilaPorPeriodo.length + ' vs ' + cfg.length + ') — desalineación por período real, no fabricar un resultado parcial.');
  }

  var payload = JSON.stringify({ cfg: cfg, dyn: dyn, ops: opsFilaPorPeriodo });
  var resultado = cp.spawnSync('python3', [BRIDGE_PATH], { input: payload, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (resultado.error) {
    throw new Error('ejecutarAIE_EFO: no se pudo invocar python3 — ' + resultado.error.message);
  }
  if (resultado.status !== 0) {
    throw new Error('ejecutarAIE_EFO: el puente falló (exit ' + resultado.status + ') — ' + resultado.stderr);
  }
  return JSON.parse(resultado.stdout);
}

/**
 * ejecutarPipeline(input, nodeId, cfgSerie, dynSerie)
 *
 * CONTRATO EXPLÍCITO: `cfgSerie`/`dynSerie` tienen el MISMO largo y el
 * MISMO orden que `input.periods` — `cfgSerie[i]`/`dynSerie[i]`
 * corresponden a `input.periods[i]`. Sin este contrato no hay forma de
 * alinear EFO (que puede tener menos entradas que `input.periods` — ver
 * `mapaOpsPorPeriodo`) contra CFG/DYN (que siempre tienen una entrada por
 * período de `input.periods`, con `segmentarPorHuecos` marcando los
 * huecos con `null`/`NaN`).
 *
 * input/nodeId -> obtenerSerieEFO() (motor-piio real, runPIIOCompleto) ->
 *   efoStates + rachaTrayectoria (puede faltar una entrada por período —
 *   hueco real de evidencia, `runPIIO.js` nunca produjo su EFO_STATE).
 * cfgSerie/dynSerie -> segmentarPorHuecos() (sí se segmentan, igual que en
 *   las otras 2 ramas) -> por cada segmento, `alinearPorPeriodo` busca el
 *   ops de cada índice real por su STRING de período (`input.periods[i]`),
 *   nunca por posición de array de `efoStates` -> ejecutarAIE_EFO() una
 *   vez por segmento.
 *
 * `cfgSerie`/`dynSerie` son sintéticos en este arnés (alcance explícito,
 * mismo criterio que las otras 2 ramas — CFG y DYN reales ya se
 * conectaron por separado, en sus propios arneses).
 *
 * @returns {{
 *   efoStates: Array<Object>, rachaTrayectoria: Array<number>,
 *   run_status: string,
 *   segmentos: Array<{periodosReales:number[], cfg:number[], dyn:number[], aie:Array<Object>}>
 * }}
 */
function ejecutarPipeline(input, nodeId, cfgSerie, dynSerie) {
  var serieEFO = obtenerSerieEFO(input, nodeId);
  var mapaOps = mapaOpsPorPeriodo(serieEFO.efoStates, serieEFO.rachaTrayectoria);
  var inputPeriods = input.periods || [];

  var segmentos = segmentarPorHuecos(cfgSerie, dynSerie).map(function (seg) {
    var opsDelSegmento = alinearPorPeriodo(seg.periodosReales, inputPeriods, mapaOps);
    var aie = ejecutarAIE_EFO(seg.cfg, seg.dyn, opsDelSegmento);
    return { periodosReales: seg.periodosReales, cfg: seg.cfg, dyn: seg.dyn, aie: aie };
  });

  return {
    efoStates: serieEFO.efoStates, rachaTrayectoria: serieEFO.rachaTrayectoria,
    run_status: serieEFO.run_status, segmentos: segmentos
  };
}

module.exports = {
  PIIO: PIIO,
  obtenerSerieEFO: obtenerSerieEFO,
  calcularRachaTrayectoria: calcularRachaTrayectoria,
  traducirOpsP: traducirOpsP,
  mapaOpsPorPeriodo: mapaOpsPorPeriodo,
  alinearPorPeriodo: alinearPorPeriodo,
  segmentarPorHuecos: segmentarPorHuecos,
  ejecutarAIE_EFO: ejecutarAIE_EFO,
  ejecutarPipeline: ejecutarPipeline
};
