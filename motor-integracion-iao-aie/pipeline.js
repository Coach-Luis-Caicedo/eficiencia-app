/**
 * motor-integracion-iao-aie/pipeline.js
 *
 * Tercer arnés de integración real — motor-iao -> AIE (Python real, vía el
 * mismo subproceso que ya usa motor-integracion-sdmo-aie). Cierra el vacío
 * longitudinal de CFG (§2 del diseño en DISENO_ARNES_IAO_AIE.md, aprobado
 * antes de escribir este archivo).
 *
 * Esta rama parte de `main`, donde motor-ice-ieh/ y motor-iao/ YA están
 * mergeados (a diferencia de cuando se escribieron feat/motor-integracion y
 * feat/motor-integracion-sdmo-aie, que tuvieron que vendorizar copias porque
 * esas ramas no existían todavía en main) — por eso aquí se importan
 * directamente por ruta relativa, sin vendor/.
 *
 * aie_validation_kit/ también ya está en main — se invoca tal cual, sin
 * copiar ni reimplementar rules_2f_3f.run_case() (mismo criterio que
 * motor-integracion-sdmo-aie).
 *
 * Lo que SÍ se trae copiado (no se puede requerir entre ramas no
 * mergeadas): el adaptador de claves de feat/motor-integracion (bcaea53) y
 * segmentarPorHuecos/ejecutarAIE de feat/motor-integracion-sdmo-aie
 * (685d140) — copiados byte-idénticos, confirmado con diff contra el
 * commit fuente antes de escribir este archivo, sin modificar ni una
 * línea de su lógica.
 */

'use strict';

var path = require('path');
var cp = require('child_process');
var MotorICEIEH = require('../motor-ice-ieh/motor-ice-ieh');
var MotorIAO = require('../motor-iao/motor-iao');

var BRIDGE_PATH = path.join(__dirname, 'run_case_bridge.py');

// ═══════════════════════════════════════════════════════════════════════
//  Adaptador de claves — copiado byte-idéntico de feat/motor-integracion
//  (bcaea53, motor-integracion/pipeline.js). NO modificado.
// ═══════════════════════════════════════════════════════════════════════

/**
 * { estructura: 'EST', intencion: 'INE', impacto: 'IMP', nexo: 'NEX',
 *   integracion: 'ITG', fortaleza: 'FOR', coherencia: 'COH',
 *   equilibrio: 'EQU', confianza: 'CNF', actitud: 'ACT' }
 * Derivado de PREGUNTAS (plano ICE|IEH) — no incluye IND-EF/IND-IC.
 */
function construirMapaVariableAPrefijo() {
  var mapa = {};
  MotorICEIEH.PREGUNTAS.forEach(function (p) {
    if (p.plano !== 'ICE' && p.plano !== 'IEH') return; // excluye IND-EF/IND-IC
    if (mapa[p.variable] && mapa[p.variable] !== p.prefijo) {
      throw new Error('construirMapaVariableAPrefijo: "' + p.variable + '" tiene más de un prefijo (' +
        mapa[p.variable] + ' vs ' + p.prefijo + ').');
    }
    mapa[p.variable] = p.prefijo;
  });
  return mapa;
}
var MAPA_VARIABLE_A_PREFIJO = construirMapaVariableAPrefijo();

/**
 * mapearVariablesAIao(variablesIceIeh) — { estructura: 78.3, ... } →
 * { EST: 78.3, ... }. Pura, no muta la entrada.
 */
function mapearVariablesAIao(variablesIceIeh) {
  var out = {};
  Object.keys(MAPA_VARIABLE_A_PREFIJO).forEach(function (varLarga) {
    out[MAPA_VARIABLE_A_PREFIJO[varLarga]] = variablesIceIeh[varLarga];
  });
  return out;
}

/**
 * calcularVariablesDePersona(respuestas31)
 *
 * Punto de composición entre los dos arneses previos: 31 respuestas ICE-IEH
 * de una Persona -> motor-ice-ieh.calcular() (real) -> mapearVariablesAIao()
 * (adaptador de bcaea53, sin modificar) -> variables en las claves cortas
 * que motor-iao.agregarOrganizacion espera dentro de cada nodo.
 *
 * NO forma parte de calcularSerieOrganizacionalIAO (ver más abajo) — el
 * diseño (§2, "de dónde vienen las personas") mantiene esta conversión como
 * un paso separado, explícito, para no duplicar dentro de este arnés lo que
 * el arnés de bcaea53 ya prueba con sus propios 100 asserts.
 */
function calcularVariablesDePersona(respuestas31) {
  return mapearVariablesAIao(MotorICEIEH.calcular(respuestas31).variables);
}

// ═══════════════════════════════════════════════════════════════════════
//  Pieza nueva de este arnés — ensamblaje temporal de CFG
// ═══════════════════════════════════════════════════════════════════════

/**
 * calcularSerieOrganizacionalIAO(datosPorPeriodo, opts)
 *
 * CONSTRUCCIÓN DE ESTE ARNÉS — no es una función de motor-iao. Espejo, a
 * nivel de rol, de calcularSerieOrganizacionalIDA (motor-integracion-sdmo-aie
 * /pipeline.js) — pero NO una copia literal: motor-iao.agregarOrganizacion
 * espera nodos con PERSONAS CRUDAS (recalcula internamente, ver README,
 * "Hallazgo — agregarOrganizacion NO es intercambiable entre IAO e IDA"),
 * a diferencia de motor-sdmo.agregarOrganizacion, que espera escalares ya
 * calculados. Por eso esta función recibe `nodos` reales por período, sin
 * aplanar — no un pool de escalares como hacía la versión de IDA.
 *
 * @param {Array<Array<{id, personas: Array<Object|null>, convocados?: number}>>} datosPorPeriodo
 *   T elementos; cada uno es exactamente la forma que
 *   motor-iao.agregarOrganizacion ya acepta como `nodos`. Cada persona ya
 *   viene en claves cortas (EST/FOR/...) — ver calcularVariablesDePersona
 *   más arriba para cómo se llega ahí desde respuestas crudas.
 * @param {Object} opts  { minReportableN, umbralPolarizacionEntreNodos, ... }
 *   — los mismos PENDIENTE_VALIDACION que ya exige motor-iao.
 * @returns {{ cfg: Array<number|null>, detallePorPeriodo: Array<Object> }}
 *   cfg puede contener `null` en un período sin ningún respondiente válido
 *   en ningún nodo (motor-iao.agregarOrganizacion da iaoOrg=null si n=0 —
 *   mismo principio de no-imputación que motor-sdmo).
 */
function calcularSerieOrganizacionalIAO(datosPorPeriodo, opts) {
  var cfg = [];
  var detallePorPeriodo = [];
  datosPorPeriodo.forEach(function (nodosDelPeriodo) {
    var r = MotorIAO.agregarOrganizacion(nodosDelPeriodo, opts);
    cfg.push(r.organizacion.iaoOrg);
    detallePorPeriodo.push(r);
  });
  return { cfg: cfg, detallePorPeriodo: detallePorPeriodo };
}

// ═══════════════════════════════════════════════════════════════════════
//  Copiado byte-idéntico de feat/motor-integracion-sdmo-aie (685d140,
//  motor-integracion-sdmo-aie/pipeline.js) — agnóstico de IAO/IDA por
//  construcción (opera sobre dos arrays planos de number|null), NO
//  modificado ni una línea.
// ═══════════════════════════════════════════════════════════════════════

/**
 * ejecutarAIE(cfg, dyn, ops)
 *
 * Invoca rules_2f_3f.run_case() REAL como subproceso Python (opción (a) —
 * una sola fuente de verdad, sin reimplementar la clasificación en JS).
 *
 * GUARDA DE FRONTERA (construida aquí, no en Python): rules_2f_3f.run_case
 * no maneja `null`/`None` en `cfg` o `dyn` — engine_core.position() compara
 * `x <= TH_FI` directamente y lanza TypeError sin contexto útil si x es
 * None. Esta función detecta el caso ANTES de invocar Python y lanza un
 * error claro en su lugar — no decide qué hacer con esos períodos, eso es
 * una decisión de diseño que no le corresponde fabricar a este arnés.
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
 * propio hueco NO pertenece a ningún segmento. Ver motor-integracion-sdmo-aie
 * /README.md para la justificación completa (por qué "excluir el período"
 * sin más mezclaría trayectorias que en la realidad no son contiguas).
 *
 * @returns {Array<{periodosReales:number[], cfg:number[], dyn:number[]}>}
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
 * ejecutarPipeline(datosPorPeriodo, dynSerie, opts)
 *
 * datosPorPeriodo (nodos reales de motor-iao, por período) -> motor-iao real
 *   (calcularSerieOrganizacionalIAO) -> cfg
 *   -> segmentarPorHuecos(cfg, dynSerie) -> rules_2f_3f.run_case() real
 *   (subproceso), UNA VEZ POR SEGMENTO, nunca sobre la serie completa
 *   aplanada.
 *
 * Escenario simétrico al de motor-integracion-sdmo-aie (685d140): allá `cfg`
 * era sintético y `dyn` real; aquí `dyn` se recibe como parámetro y es
 * sintético (motor-sdmo real ya se conectó por separado, en la otra rama —
 * conectar los dos arneses en una sola cadena habría mezclado dos cierres
 * de hueco distintos en un solo commit, mismo criterio documentado en
 * motor-integracion-sdmo-aie/README.md para la razón inversa). `dyn` se
 * marca explícitamente como sintético en cada caso de prueba.
 *
 * `ops` se fija en null para todos los períodos (PIIO/EFO — encargo 3,
 * pendiente, no se construye aquí) — camino 2F explícito.
 *
 * @returns {{
 *   cfg: Array<number|null>,
 *   detallePorPeriodo: Array<Object>,
 *   segmentos: Array<{periodosReales:number[], cfg:number[], dyn:number[], aie:Array<Object>}>
 * }}
 */
function ejecutarPipeline(datosPorPeriodo, dynSerie, opts) {
  var serieCfg = calcularSerieOrganizacionalIAO(datosPorPeriodo, opts);
  var segmentos = segmentarPorHuecos(serieCfg.cfg, dynSerie).map(function (seg) {
    var ops = seg.dyn.map(function () { return null; });
    var aie = ejecutarAIE(seg.cfg, seg.dyn, ops);
    return { periodosReales: seg.periodosReales, cfg: seg.cfg, dyn: seg.dyn, aie: aie };
  });
  return { cfg: serieCfg.cfg, detallePorPeriodo: serieCfg.detallePorPeriodo, segmentos: segmentos };
}

module.exports = {
  MotorICEIEH: MotorICEIEH,
  MotorIAO: MotorIAO,
  MAPA_VARIABLE_A_PREFIJO: MAPA_VARIABLE_A_PREFIJO,
  mapearVariablesAIao: mapearVariablesAIao,
  calcularVariablesDePersona: calcularVariablesDePersona,
  calcularSerieOrganizacionalIAO: calcularSerieOrganizacionalIAO,
  segmentarPorHuecos: segmentarPorHuecos,
  ejecutarAIE: ejecutarAIE,
  ejecutarPipeline: ejecutarPipeline
};
