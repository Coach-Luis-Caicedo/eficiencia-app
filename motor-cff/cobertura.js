/**
 * motor-cff/cobertura.js — Fase 4b (iii)
 *
 * Cobertura y significado de cero (§20). Dos piezas:
 *
 *   clasificarCobertura(coverageInput, senales) → COVERAGE_STATUS
 *   distinguirCeroDeNA(cffTotal, coverageStatus) → CFF=0  vs  CFF=N_A
 *
 * ── El criterio de §20 es CUALITATIVO, no numérico ──────────────────────
 *
 * Se revisó el documento completo: §20 y §23 definen las 4 categorías de
 * COVERAGE_STATUS solo con prosa ("todos los eventos materiales fueron
 * evaluados"; "algunos no pudieron resolverse pero la cifra sigue siendo
 * útil"; "depende de estimaciones débiles, asignaciones limitadas o
 * cobertura reducida"; "no existe base suficiente para una cifra
 * defendible"). NO hay ningún umbral de porcentaje/ratio en ninguna parte
 * (grep exhaustivo: 0 coincidencias de "%", "umbral", "ratio", "al menos
 * N" junto a cobertura). §20 lo dice de frente: la cobertura "debe ser
 * estructural y acompañarse de hechos objetivos, no convertirse en un
 * score universal". Por eso este módulo NO inventa un corte numérico:
 * clasifica a partir de (a) conteos que ya trae `coverageInput` de
 * consolidacion.js y (b) juicios cualitativos que quien llama declara
 * explícitamente (las cuatro señales). El ratio se calcula y se reporta
 * como dato, pero no decide ninguna frontera.
 *
 * ── coverageInput viene de consolidacion.js — no se recalcula ───────────
 *
 * `coverageInput = { componentes_candidatos, componentes_admisibles,
 *   componentes_excluidos: [{ component_id, motivo, categoria }] }`.
 * `material_no_evaluado` = exclusiones cuya categoría NO es
 * TRANSFERENCIA_INTERNA (una transferencia interna pura eliminada en
 * consolidación ORGANIZATION no es un hueco de cobertura — §14: "los
 * recursos reales consumidos se conservan"; la eliminación es correcta, no
 * una falla de evaluación). Todas las demás categorías —temporal, relación
 * de riesgo, costo compartido UNALLOCATED, admisibilidad, doble falla
 * EXPOSURE+UNRESOLVED (Opción D / Paso 3)— SÍ cuentan como material que
 * no se pudo evaluar.
 *
 * ── CFF = 0  ≠  CFF = N_A (§20, AC21, AC22, AC46) ──────────────────────
 *
 *   CFF = 0    : cobertura suficiente para una cifra + ninguna componente
 *                atribuible con valor positivo. Es un 0 real (AC21). No
 *                demuestra ausencia de fricción (INV-CFF-10).
 *   CFF = N_A  : cobertura INSUFFICIENT — no hay base para una cifra
 *                consolidada defendible. value = null, status = INSUFFICIENT
 *                (AC46: "no 0"; AC22: "nunca 0 por defecto"; §21: "un valor
 *                nulo siempre debe acompañarse de status y reason").
 */

'use strict';

var ENUMS = require('./enums');
var consolidacion = require('./consolidacion');

var CAT = consolidacion.CATEGORIAS_EXCLUSION;

var SENALES_OBLIGATORIAS = [
  'tratamientoEconomicoSuficiente',   // §20 FULL
  'dependeDeEstimacionesDebiles',     // §20 LIMITED (literal)
  'asignacionesLimitadas',            // §20 LIMITED (literal)
  'baseDefendibleParaCifraConsolidada' // §20 INSUFFICIENT (negada)
];

// Condiciones CRUDAS (textuales) de cada categoría, ANTES de aplicar
// precedencia. NO son mutuamente excluyentes — la batería las usa para
// verificar exhaustividad y localizar los solapamientos que la precedencia
// resuelve (ver cabecera). Exportadas para esa prueba independiente.
function _m(coverageInput) {
  var noCuentan = coverageInput.componentes_excluidos.filter(function (x) { return x.categoria === CAT.TRANSFERENCIA_INTERNA; });
  return {
    total: coverageInput.componentes_candidatos - noCuentan.length,
    evaluado: coverageInput.componentes_admisibles,
    noEvaluado: coverageInput.componentes_excluidos.length - noCuentan.length
  };
}
var CONDICIONES_CRUDAS = {
  // §20 INSUFFICIENT: "No existe base suficiente para una cifra defendible"
  INSUFFICIENT: function (ci, s) { var m = _m(ci); return m.total <= 0 || s.baseDefendibleParaCifraConsolidada === false || m.evaluado === 0; },
  // §20 LIMITED: "depende de estimaciones débiles, asignaciones limitadas o cobertura reducida"
  LIMITED: function (ci, s) { return s.dependeDeEstimacionesDebiles === true || s.asignacionesLimitadas === true || s.tratamientoEconomicoSuficiente === false; },
  // §20 FULL: "Todos los materiales fueron evaluados con tratamiento económico suficiente para la salida"
  FULL: function (ci, s) { return _m(ci).noEvaluado === 0 && s.tratamientoEconomicoSuficiente === true; },
  // §20 PARTIAL: "Algunos eventos materiales no pudieron resolverse... su exclusión es explícita"
  PARTIAL: function (ci, s) { return _m(ci).noEvaluado > 0; }
};
var PRECEDENCIA = ['INSUFFICIENT', 'LIMITED', 'FULL', 'PARTIAL'];

/**
 * clasificarCobertura(coverageInput, senales)
 *
 * senales: objeto con las 4 señales booleanas obligatorias (juicios
 *   cualitativos que §20 exige "acompañar de hechos objetivos" — este
 *   módulo no los infiere, los recibe declarados; lanza si falta alguno).
 *
 * Orden de evaluación ESTRICTO y deliberado:
 * INSUFFICIENT → LIMITED → FULL → PARTIAL (mismo patrón que
 * clasificarAtribucion). Las condiciones CRUDAS (textuales) de las 4
 * categorías NO son mutuamente excluyentes por sí solas — hay dos
 * solapamientos reales, y el resultado final lo decide la precedencia, no
 * que las categorías sean disjuntas por definición. Cada precedencia y su
 * respaldo:
 *
 *   1. INSUFFICIENT sobre las otras tres — RESPALDO TEXTUAL. §20 define
 *      FULL/PARTIAL/LIMITED presuponiendo que "la cifra existe" ("evaluados
 *      para la salida" / "la cifra sigue siendo útil" / "La cifra existe,
 *      pero..."). INSUFFICIENT es "No existe base suficiente para una cifra
 *      consolidada defendible" — sin cifra. Es disjunto del resto por la
 *      letra misma: cifra vs. no-cifra. Solapa en la representación cruda
 *      solo porque las señales de debilidad (LIMITED) y de exclusión
 *      (PARTIAL) pueden estar presentes aunque no haya cifra; la
 *      precedencia las descarta correctamente.
 *
 *   2. LIMITED sobre FULL — RESPALDO TEXTUAL, vía §21 (no §20). FULL exige
 *      "tratamiento económico SUFICIENTE para la salida". §21: "Una salida
 *      downstream no puede tener mayor calidad que una dependencia
 *      crítica." Una estimación débil o una asignación limitada declarada
 *      es una dependencia crítica degradada → la clasificación (una salida
 *      de calidad) no puede ser FULL por encima de ella. No es que §20
 *      diga "LIMITED gana"; es que §21 impide que FULL supere a su insumo
 *      más débil.
 *
 *   3. LIMITED sobre PARTIAL — DECISIÓN DE DISEÑO, sin respaldo textual
 *      directo. §20 no da regla para una cifra que a la vez tiene
 *      exclusiones explícitas (PARTIAL) y descansa en estimaciones débiles
 *      (LIMITED). Se elige LIMITED —el estado más degradado y más
 *      informativo— por el sesgo de §25 ("perder cobertura antes que
 *      inventar valor") e INV-CFF-54 ("cobertura baja limita la
 *      interpretación"). Mismo carácter que la precedencia RESOLVER→
 *      SELECCIONAR de 4b-ii: una razón real, no una cita de §20. Si se
 *      quiere la lectura contraria (PARTIAL gana), es un cambio de una
 *      línea documentado, no una reescritura.
 *
 *   4. FULL vs. PARTIAL — disjuntos de verdad, sin precedencia que
 *      justificar: `material_no_evaluado === 0` vs. `> 0`.
 *
 * La batería verifica esto con una comprobación independiente del orden:
 * evalúa las 4 condiciones crudas por separado sobre los 64 casos,
 * confirma que en cada caso al menos una es verdadera (exhaustivo, sin
 * huecos), localiza los solapamientos, y confirma que la implementación
 * resuelve cada uno hacia la categoría de mayor precedencia documentada.
 *
 * @returns {{
 *   coverage_status: 'FULL'|'PARTIAL'|'LIMITED'|'INSUFFICIENT',
 *   material_total, material_evaluado, material_no_evaluado,
 *   cobertura_ratio: number|null,   // informativo, sin umbral de decisión
 *   exclusiones_que_cuentan: Array,
 *   criterio_es_cualitativo: true,
 *   razon: string
 * }}
 */
function clasificarCobertura(coverageInput, senales) {
  if (!coverageInput || typeof coverageInput !== 'object' || !Array.isArray(coverageInput.componentes_excluidos)) {
    throw new Error('clasificarCobertura: se esperaba coverageInput de consolidacion.js ' +
      '({ componentes_candidatos, componentes_admisibles, componentes_excluidos:[] }).');
  }
  senales = senales || {};
  SENALES_OBLIGATORIAS.forEach(function (k) {
    if (typeof senales[k] !== 'boolean') {
      throw new Error('clasificarCobertura: falta la señal cualitativa "' + k + '" (boolean) — §20 exige que la ' +
        'cobertura se acompañe de hechos objetivos; este módulo no la infiere.');
    }
  });

  var noCuentan = coverageInput.componentes_excluidos.filter(function (x) { return x.categoria === CAT.TRANSFERENCIA_INTERNA; });
  var exclusionesQueCuentan = coverageInput.componentes_excluidos.filter(function (x) { return x.categoria !== CAT.TRANSFERENCIA_INTERNA; });

  var materialTotal = coverageInput.componentes_candidatos - noCuentan.length;
  var materialEvaluado = coverageInput.componentes_admisibles;
  var materialNoEvaluado = exclusionesQueCuentan.length;
  var ratio = materialTotal > 0 ? materialEvaluado / materialTotal : null;

  // La clasificación ES, literalmente, "la primera condición cruda
  // verdadera en orden de precedencia" (ver cabecera). Una sola fuente:
  // CONDICIONES_CRUDAS + PRECEDENCIA, no un if/else paralelo.
  var status = null;
  for (var i = 0; i < PRECEDENCIA.length && status === null; i++) {
    if (CONDICIONES_CRUDAS[PRECEDENCIA[i]](coverageInput, senales)) status = PRECEDENCIA[i];
  }
  if (status === null) {
    // imposible: PARTIAL(noEvaluado>0) o FULL(noEvaluado===0) siempre cubre.
    throw new Error('clasificarCobertura: ninguna condición cruda coincidió — hueco en la partición (no debería pasar).');
  }

  var RAZONES = {
    INSUFFICIENT: materialTotal <= 0
      ? 'No hay universo material que evaluar (todo candidato eran transferencias internas eliminadas o conjunto vacío) — sin base para una cifra (§20).'
      : (senales.baseDefendibleParaCifraConsolidada === false
        ? 'baseDefendibleParaCifraConsolidada=false — §20: "No existe base suficiente para una cifra consolidada defendible".'
        : 'Ninguna componente material llegó a ser admisible (material_evaluado=0) — no hay cifra que sostener (§20).'),
    LIMITED: 'La cifra existe pero ' + [
      senales.dependeDeEstimacionesDebiles ? 'depende de estimaciones débiles' : null,
      senales.asignacionesLimitadas ? 'las asignaciones son limitadas' : null,
      senales.tratamientoEconomicoSuficiente === false ? 'el tratamiento económico no es suficiente para la salida' : null
    ].filter(Boolean).join('; ') + ' (§20 LIMITED; precede a FULL por §21 — "una salida no puede tener mayor calidad que una dependencia crítica").',
    FULL: 'Todo el material del alcance fue evaluado con tratamiento económico suficiente (§20, FULL).',
    PARTIAL: materialNoEvaluado + ' componente(s) material(es) no pudieron resolverse, pero la cifra sigue siendo útil y su exclusión es explícita y con motivo (§20, PARTIAL).'
  };
  var razon = RAZONES[status];

  return {
    coverage_status: status,
    material_total: materialTotal,
    material_evaluado: materialEvaluado,
    material_no_evaluado: materialNoEvaluado,
    cobertura_ratio: ratio,
    exclusiones_que_cuentan: exclusionesQueCuentan,
    criterio_es_cualitativo: true,
    razon: razon
  };
}

/**
 * distinguirCeroDeNA(cffTotal, coverageStatus)
 *
 * cffTotal: number ≥ 0 (el CFF_TOTAL calculado por consolidacion.js). El
 *   nulo NO se recibe — lo produce ESTA función a partir de la cobertura.
 * coverageStatus: un COVERAGE_STATUS (de clasificarCobertura).
 *
 * @returns {{ resultado:'CFF_CERO'|'CFF_N_A'|'CFF_POSITIVO', value:number|null,
 *             status:'VALID'|'VALID_WITH_LIMITATIONS'|'INSUFFICIENT', razon:string }}
 */
function distinguirCeroDeNA(cffTotal, coverageStatus) {
  if (ENUMS.COVERAGE_STATUS.indexOf(coverageStatus) === -1) {
    throw new Error('distinguirCeroDeNA: coverageStatus "' + coverageStatus + '" no es un COVERAGE_STATUS válido.');
  }
  if (typeof cffTotal !== 'number' || !isFinite(cffTotal)) {
    throw new Error('distinguirCeroDeNA: cffTotal debe ser numérico y finito — el valor nulo lo produce esta ' +
      'función a partir de la cobertura, no se recibe como entrada (§21: un nulo siempre con status y reason).');
  }
  if (cffTotal < 0) {
    throw new Error('distinguirCeroDeNA: cffTotal=' + cffTotal + ' < 0 — el CFF (costo de fricción) no puede ser ' +
      'negativo; un valor negativo es un defecto aguas arriba, no un resultado válido.');
  }

  // ── la guarda: cobertura INSUFFICIENT ⇒ N_A, NUNCA 0 (AC46, AC22) ──
  if (coverageStatus === 'INSUFFICIENT') {
    return _verificarValorConsistente({
      resultado: 'CFF_N_A',
      value: null,
      status: 'INSUFFICIENT',
      razon: 'Cobertura INSUFFICIENT — no hay base para una cifra consolidada defendible. value=null, ' +
        'status=INSUFFICIENT (AC46: "no 0"; AC22: "nunca 0 por defecto"). N_A ≠ 0: no demuestra ausencia de fricción.'
    });
  }

  var status = coverageStatus === 'FULL' ? 'VALID' : 'VALID_WITH_LIMITATIONS';

  if (cffTotal === 0) {
    return _verificarValorConsistente({
      resultado: 'CFF_CERO',
      value: 0,
      status: status,
      razon: 'Cobertura ' + coverageStatus + ' (suficiente para una cifra) y ninguna componente atribuible con valor ' +
        'positivo → CFF = 0 real (AC21). No demuestra ausencia de fricción (INV-CFF-10).'
    });
  }

  return _verificarValorConsistente({
    resultado: 'CFF_POSITIVO',
    value: cffTotal,
    status: status,
    razon: 'Cobertura ' + coverageStatus + ' → cifra consolidada con status ' + status + '.'
  });
}

/**
 * _verificarValorConsistente(r) — invariante: value===null ⟺
 * resultado==='CFF_N_A' ⟺ status==='INSUFFICIENT'. Lanza si el trío se
 * desincroniza (una N_A que se cuela como 0, o un 0 sin cobertura que lo
 * respalde). Con el código correcto nunca se dispara por la ruta pública;
 * expuesta para prueba dirigida (convención esConfirmed/esSupported).
 */
function _verificarValorConsistente(r) {
  var esNA = r.resultado === 'CFF_N_A';
  var valorNulo = r.value === null;
  var statusInsuf = r.status === 'INSUFFICIENT';
  if (esNA !== valorNulo || esNA !== statusInsuf) {
    throw new Error('distinguirCeroDeNA: inconsistencia interna — "CFF_N_A ⟺ value=null ⟺ status=INSUFFICIENT" ' +
      'debe cumplirse en bloque. Recibido: resultado=' + r.resultado + ', value=' + JSON.stringify(r.value) +
      ', status=' + r.status + '. AC46 prohíbe que una insuficiencia (N_A) se reporte como 0.');
  }
  if (r.resultado === 'CFF_CERO' && r.value !== 0) {
    throw new Error('distinguirCeroDeNA: inconsistencia interna — resultado=CFF_CERO con value=' + JSON.stringify(r.value) + '.');
  }
  return r;
}

/**
 * rollupCobertura(statuses) → COVERAGE_STATUS
 *
 * Toma varios COVERAGE_STATUS (p.ej. los de las capas operacional /
 * monetización / atribución) y devuelve el PEOR — el `overall_coverage_
 * status` de CFF_COVERAGE (§22.7). Orden de severidad:
 * INSUFFICIENT > LIMITED > PARTIAL > FULL.
 *
 * Es análoga a estados.resolveStatus (§21) —misma idea de propagación: la
 * salida no puede tener mayor calidad que su peor insumo— pero sobre un
 * VOCABULARIO DISTINTO (COVERAGE_STATUS, no OUTPUT_STATUS). Deliberadamente
 * NO reutiliza el nombre `resolveStatus` para que nadie las confunda.
 */
var ORDEN_COBERTURA = ['INSUFFICIENT', 'LIMITED', 'PARTIAL', 'FULL']; // peor → mejor
function rollupCobertura(statuses) {
  if (!Array.isArray(statuses) || statuses.length === 0) {
    throw new Error('rollupCobertura: se esperaba un array no vacío de COVERAGE_STATUS.');
  }
  statuses.forEach(function (s) {
    if (ENUMS.COVERAGE_STATUS.indexOf(s) === -1) {
      throw new Error('rollupCobertura: "' + s + '" no es un COVERAGE_STATUS válido.');
    }
  });
  for (var i = 0; i < ORDEN_COBERTURA.length; i++) {
    if (statuses.indexOf(ORDEN_COBERTURA[i]) !== -1) return ORDEN_COBERTURA[i];
  }
  return 'FULL';
}

module.exports = {
  clasificarCobertura: clasificarCobertura,
  distinguirCeroDeNA: distinguirCeroDeNA,
  rollupCobertura: rollupCobertura,
  _verificarValorConsistente: _verificarValorConsistente,
  SENALES_OBLIGATORIAS: SENALES_OBLIGATORIAS,
  ORDEN_COBERTURA: ORDEN_COBERTURA,
  // expuestas para la prueba independiente del orden (ver cabecera)
  CONDICIONES_CRUDAS: CONDICIONES_CRUDAS,
  PRECEDENCIA: PRECEDENCIA
};
