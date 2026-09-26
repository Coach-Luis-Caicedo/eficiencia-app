'use strict';

/**
 * motor-cff/reconciliacion.js -- cost_reconciliation: reorganiza lo que runCFF ya calcula y
 * clasifica en la estructura de 5 categorías que pidió la auditoría (PENDIENTES §7, Q1-Q5 y la
 * ronda de cost_reconciliation). No calcula ningún monto nuevo: cada monto sale de un total que
 * el motor ya produce (cff_total, unresolved_impact_total, exposure_total).
 *
 * ── Las 5 categorías y el campo que alimenta cada una ─────────────────────
 *   costo_atribuido        cff_total (los 4 cuadrantes). null si cobertura INSUFFICIENT (Q5).
 *   atribucion_pendiente   unresolved_impact_total: monetización OBSERVED/ESTIMATED con atribución
 *                          UNRESOLVED. Cita: AC42 "UNRESOLVED con valor monetizado: Visible, pero
 *                          fuera de cff_total".
 *   otras_causas           NO DERIVABLE hoy: el documento usa UNRESOLVED (§11.3) para "evidencia
 *                          insuficiente" Y para "explicación alternativa dominante"; la diferencia
 *                          solo existe en la dimensión alternative_explanation de las
 *                          attribution_dimensions, y la base de datos no la guarda (el Worker
 *                          siempre recibe attribution_status ya resuelto). monto = null + nota;
 *                          NO se fusiona con atribucion_pendiente (decisión de Luis).
 *   exposicion             exposure_total. Cita: AC41 "EXPOSURE con valor monetario alto: Visible,
 *                          pero fuera de cff_total".
 *   efectos_sin_valoracion monetización N_A ("No existe base suficiente para clasificar
 *                          monetización", §10; AC20 "no inventar cifra") y lo descartado antes de
 *                          consolidar por falta de valor utilizable. Sin monto: por definición no
 *                          hay cifra (regla 7b). Cita para N_A x CONFIRMED/SUPPORTED: §10 define N_A
 *                          sin referirse a la atribución y "Calidad de monetización != calidad de
 *                          atribución" -> el eje monetario manda, va aquí.
 *
 * ── Sin definición en el documento (categoría separada, NO metida en "otras causas") ──
 *   doble_falla_exposure_unresolved   EXPOSURE + UNRESOLVED. El documento no define el cruce; la
 *        falla es de AMBOS ejes (EXPOSURE ya es una falla de monetización), así que no se le
 *        asigna a "atribución pendiente". Opción D (consolidacion.js): no suma a ningún total.
 *   atribucion_na   atribución N_A con monetización OBSERVED/ESTIMATED. §11 solo define
 *        CONFIRMED/SUPPORTED/UNRESOLVED; el documento no define N_A de atribución, y §18 exige
 *        CONFIRMED/SUPPORTED para entrar a CFF, así que tampoco "no requiere atribución".
 *   Para estos dos: monto = null (la clasificación no está definida) + suma_cifras_declaradas
 *   (las cifras SÍ existen; se muestran para que no queden invisibles, sin sumarlas a nada).
 *
 * ── Fuera de las 5 categorías, para que la partición sea exhaustiva ────────
 *   excluidos_por_consolidacion   componentes con cifra y atribución admisibles que la
 *        consolidación no suma (duplicados, transferencias internas, contención, costo compartido
 *        sin asignar...): no son costo perdido ni pendiente, evitan doble conteo (§13, §14).
 *   fuera_de_alcance   componentes fuera del node_set del caso (scope_valid=false): no forman parte
 *        del resultado (Q1) y no se clasifican.
 *   Los componentes de eventos retenidos (INVALID) no llegan a este nivel: ver
 *   coverage.excluded_material_events.
 *
 * Invariante (verificacion.cuadra): cada componente de un evento no retenido cae en EXACTAMENTE una
 * categoría; Σ n de categorías + fuera_de_alcance = componentes considerados.
 */

var NOTA_OTRAS_CAUSAS = 'No derivable con los datos actuales: el motor no distingue esta causa dentro de UNRESOLVED ' +
  '(§11.3 usa UNRESOLVED para evidencia insuficiente y para explicación alternativa dominante; la dimensión ' +
  'alternative_explanation no se persiste). Mejora futura ligada a la captura propia de CFF.';
var NOTA_DOBLE_FALLA = 'El documento no define EXPOSURE + UNRESOLVED. Falla en ambos ejes (monetización y atribución): ' +
  'no se asigna a atribución pendiente ni a exposición (Opción D: no suma a ningún total).';
var NOTA_ATRIBUCION_NA = 'El documento no define attribution_status=N_A (§11 solo define CONFIRMED/SUPPORTED/UNRESOLVED) y §18 ' +
  'exige CONFIRMED/SUPPORTED para entrar a CFF. Visible y fuera de todo total (§19).';
var NOTA_EXCLUIDOS_CONS = 'Cifra y atribución admisibles, pero la consolidación no los suma para evitar doble conteo o por regla ' +
  'de alcance temporal/relación (§13, §14); no son costo perdido.';
var NOTA_SIN_VALORACION = 'Sin cifra por definición (monetization_status=N_A o descartado antes de consolidar). La causa fina solo ' +
  'está registrada para LOST_CAPACITY_SIN_RECONSTRUCCION y los descartes previos; un N_A declarado no guarda su causa.';

function _ordenarPorId(lista) {
  return lista.slice().sort(function (a, b) { return a.component_id < b.component_id ? -1 : a.component_id > b.component_id ? 1 : 0; });
}

/**
 * construirReconciliacion(entrada) -> cost_reconciliation
 * entrada: { resueltos, cons, errores, cffTotal, exposureTotal, unresolvedTotal }
 *   resueltos: componentes resueltos de los eventos no retenidos (con _sinCifra/_excluidoValor,
 *              scope_valid, monetization_status, attribution_status, valor)
 *   cons: salida de consolidarPeriodoYAlcance (seleccionados, diagnosticos, valores, coverageInput)
 *   cffTotal: cff_total FINAL (null si INSUFFICIENT)
 */
function construirReconciliacion(entrada) {
  var cons = entrada.cons;
  var resueltos = entrada.resueltos;
  var errores = entrada.errores || [];
  var seleccionados = {};
  (cons.seleccionados || []).forEach(function (s) { seleccionados[s.component_id] = true; });
  var diag = cons.diagnosticos || {};
  var motivoExcl = {};
  ((cons.coverageInput && cons.coverageInput.componentes_excluidos) || []).forEach(function (x) {
    if (!motivoExcl[x.component_id]) motivoExcl[x.component_id] = x.categoria;
  });

  var cubetas = { costo: [], pendiente: [], exposicion: [], sinValoracion: [], dobleFalla: [], atribucionNA: [], excluidosCons: [] };
  var fueraAlcance = 0;

  resueltos.forEach(function (c) {
    var id = c.component_id;
    if (c.scope_valid !== true) { fueraAlcance++; return; }                        // Q1: no forma parte del resultado
    if (c._excluidoValor || c._sinCifra || c.monetization_status === 'N_A') {       // el eje monetario manda (§10)
      var causas;
      if (c._sinCifra) causas = ['SIN_CIFRA_DECLARADA'];
      else if (c._excluidoValor) {
        causas = errores.filter(function (e) { return e.layer === 'component' && e.ref === id; })
          .map(function (e) { return e.code; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort();
        if (!causas.length) causas = ['DESCARTADO_ANTES_DE_CONSOLIDAR'];
      } else causas = ['MONETIZACION_N_A'];
      cubetas.sinValoracion.push({ component_id: id, causa: causas.join(', ') });
      return;
    }
    var d = diag[id];
    if (d && d.destino === 'EXPOSURE') { cubetas.exposicion.push({ component_id: id }); return; }
    if (d && d.destino === 'UNRESOLVED') { cubetas.pendiente.push({ component_id: id }); return; }
    if (d && d.destino === 'DOBLE_FALLA') { cubetas.dobleFalla.push({ component_id: id, valor: d.valor }); return; }
    if (d && d.destino === 'RELACION_RIESGO') { cubetas.excluidosCons.push({ component_id: id, categoria: 'RELACION_ECONOMICA_NO_PERMITE_INCLUSION' }); return; }
    if (seleccionados[id]) { cubetas.costo.push({ component_id: id }); return; }
    if (c.attribution_status === 'N_A') {
      var v = cons.valores ? cons.valores[id] : undefined;
      cubetas.atribucionNA.push({ component_id: id, valor: typeof v === 'number' ? v : c.valor });
      return;
    }
    cubetas.excluidosCons.push({ component_id: id, categoria: motivoExcl[id] || 'SIN_MOTIVO_REGISTRADO' });
  });

  function suma(lista) { return lista.reduce(function (s, x) { return s + (typeof x.valor === 'number' ? x.valor : 0); }, 0); }
  function ids(lista) { return _ordenarPorId(lista); }

  var n = cubetas.costo.length + cubetas.pendiente.length + cubetas.exposicion.length + cubetas.sinValoracion.length +
    cubetas.dobleFalla.length + cubetas.atribucionNA.length + cubetas.excluidosCons.length;
  var considerados = resueltos.length;

  return {
    categorias: {
      costo_atribuido: { monto: entrada.cffTotal, n: cubetas.costo.length, fuente: 'cff_total',
        nota: entrada.cffTotal === null ? 'Cobertura INSUFFICIENT: sin cifra defendible (AC46); los componentes seleccionados se cuentan pero no se publica monto.' : null },
      atribucion_pendiente: { monto: entrada.unresolvedTotal, n: cubetas.pendiente.length, fuente: 'unresolved_impact_total', nota: null },
      otras_causas: { monto: null, n: null, derivable: false, nota: NOTA_OTRAS_CAUSAS },
      exposicion: { monto: entrada.exposureTotal, n: cubetas.exposicion.length, fuente: 'exposure_total', nota: null },
      efectos_sin_valoracion: { monto: null, n: cubetas.sinValoracion.length, componentes: ids(cubetas.sinValoracion), nota: NOTA_SIN_VALORACION }
    },
    sin_categoria_definida: {
      doble_falla_exposure_unresolved: { monto: null, suma_cifras_declaradas: suma(cubetas.dobleFalla), n: cubetas.dobleFalla.length,
        componentes: ids(cubetas.dobleFalla).map(function (x) { return x.component_id; }), nota: NOTA_DOBLE_FALLA },
      atribucion_na: { monto: null, suma_cifras_declaradas: suma(cubetas.atribucionNA), n: cubetas.atribucionNA.length,
        componentes: ids(cubetas.atribucionNA).map(function (x) { return x.component_id; }), nota: NOTA_ATRIBUCION_NA }
    },
    excluidos_por_consolidacion: { monto: null, n: cubetas.excluidosCons.length, componentes: ids(cubetas.excluidosCons), nota: NOTA_EXCLUIDOS_CONS },
    fuera_de_alcance: { n: fueraAlcance },
    verificacion: { componentes_considerados: considerados, componentes_clasificados: n + fueraAlcance, cuadra: (n + fueraAlcance) === considerados }
  };
}

module.exports = { construirReconciliacion: construirReconciliacion };
