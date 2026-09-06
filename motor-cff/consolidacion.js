/**
 * motor-cff/consolidacion.js — Fase 4b (ii)
 *
 * Fórmula y orden de consolidación (§19). Ejecuta la secuencia OBLIGATORIA
 *
 *   VALIDAR → NORMALIZAR → RELACIONAR → RESOLVER → SELECCIONAR → SUMAR
 *
 * como seis funciones nombradas llamadas en ese orden — NO seis funciones
 * independientes que casualmente producen el resultado correcto en
 * cualquier secuencia. La dependencia dura, verificada por mutación:
 * RESOLVER **escribe** `ctx.permiteInclusion[component_id]` (a partir de
 * resolverRelacion / costos compartidos / transferencias internas);
 * SELECCIONAR **lee** esa señal para la 7ª condición de admisibilidad
 * (§18). Si SELECCIONAR corre antes, la señal no existe y
 * `admisibilidad.evaluarAdmisibilidad` lanza (por diseño de 4b-i: las 7
 * señales son obligatorias) — el propio guardia de la fase anterior hace
 * imposible ejecutar el pipeline en el orden equivocado sin manipular
 * además el ensamblado de señales.
 *
 * Delega en los módulos de fases previas (no reimplementa nada):
 *   VALIDAR      → temporalidad.validarFrecuenciaConsistente,
 *                  temporalidad.filtrarSumablesPorNaturalezaTemporal
 *   NORMALIZAR   → chequeo de base monetaria común + valuation_basis única
 *                  (INV-CFF-28 / INV-CFF-29); usa moneda.* de forma indirecta
 *   RELACIONAR   → relaciones.validarGrafoContains (ciclo ⇒ BLOCKING, §13.3/AC15)
 *   RESOLVER     → relaciones.resolverRelacion, costos_compartidos.*,
 *                  nodos.clasificarAlcance
 *   SELECCIONAR  → admisibilidad.evaluarAdmisibilidad (§18)
 *   SUMAR        → matriz 2×2 + CFF_CONF / CFF_SUP / CFF_TOTAL (§19)
 *
 * ── Componente con doble falla EXPOSURE + UNRESOLVED — Opción D ──────────
 *
 * Un componente puede traer monetization_status=EXPOSURE Y
 * attribution_status=UNRESOLVED a la vez. Ya está fuera de CFF_TOTAL por la
 * condición 3 de admisibilidad (attribution ∈ {CONFIRMED, SUPPORTED}). Para
 * los totales de diagnóstico se aplica la Opción D, verificada contra el
 * texto: el denominador de cobertura SÍ incluye lo excluido
 *   — §20: "cuánto del universo operativo material dentro del alcance pudo
 *     evaluarse económicamente" (denominador = universo material, no "lo
 *     que llegó a un total"); criterio FULL exige que TODO lo material se
 *     haya evaluado;
 *   — §22.7: material_events_total ≠ material_events_evaluable + campo
 *     excluded_material_events[] ⇒ el total incluye lo excluido.
 * Por tanto el componente con doble falla NO se suma a `exposure_total` ni
 * a `unresolved_impact_total` (evita contar su valor dos veces entre los
 * dos lentes de diagnóstico), se marca en `flags[]`, y cuenta como
 * material-no-evaluado para el insumo de cobertura. No queda oculto
 * (INV-CFF-55: "ausencia de evidencia no se imputa como ausencia de
 * costo"; INV-CFF-50: "toda exclusión conserva motivo y trazabilidad") —
 * es visible por cobertura degradada + flags + su registro de exclusión.
 * NO se crea una tercera categoría/enum: el documento no la insinúa.
 *
 * ── Exclusión por relación + estado EXPOSURE/UNRESOLVED (Paso 3) ─────────
 *
 * El mismo principio se extiende a los totales secundarios: un componente
 * excluido por una relación con riesgo de solapamiento (DUPLICATE,
 * ALTERNATIVE_VALUATION, UNKNOWN, CONTAINS) que además sea EXPOSURE o
 * UNRESOLVED NO se suma a `exposure_total` ni a `unresolved_impact_total`.
 * Dos duplicados EXPOSURE de 6000 c/u darían `exposure_total = 12000` (el
 * doble conteo que INV-CFF-20 existe para evitar en el total principal, ni
 * más ni menos real por ir a un total de diagnóstico); tampoco se elige
 * "uno" (6000) — eso sería la misma invención-de-selección-sin-evidencia
 * rechazada para el total principal. Ambos quedan fuera, registrados con
 * motivo y marcados en `flags[]`. Decisión explícita de Luis.
 *
 * ── Extensión de invocación #6: nodeRaiz ────────────────────────────────
 *
 * nodos.clasificarAlcance(nodeSet, nodeRaiz, nodeHierarchy) necesita el
 * nodo de referencia contra el que se clasifica el nodeSet. CFF_RESULT
 * (§22.8) trae `scope` y `node_set[]` pero no un "id del nodo raíz del
 * alcance". Se recibe explícito — mismo patrón que NODE_HIERARCHY (que
 * tampoco está en §22). Ver README.
 *
 * ── Tolerancia de reconciliación (§19.2) ────────────────────────────────
 *
 * §19.2 exige "tolerancias técnicas configuradas por moneda/precisión"
 * pero no da un valor. `toleranciaReconciliacion` es parámetro explícito.
 * Si no se aporta, se usa SOLO una guarda de drift de punto flotante
 * (1e-9, igual que EPS en moneda.test.js) y se marca
 * `TOLERANCIA_RECONCILIACION_PENDIENTE_VALIDACION` en flags — nunca una
 * tolerancia de negocio inventada (§19.2: "la tolerancia no puede
 * utilizarse para ocultar diferencias materiales").
 */

'use strict';

var temporalidad = require('./temporalidad');
var relaciones = require('./relaciones');
var costosCompartidos = require('./costos_compartidos');
var nodos = require('./nodos');
var admisibilidad = require('./admisibilidad');

var GUARDA_DRIFT = 1e-9;

// Relaciones cuya no-resolución implica riesgo de solapamiento: un
// componente excluido por una de ellas NO puede contar tampoco en los
// totales secundarios de diagnóstico (INV-CFF-20 — la duplicación no deja
// de serlo por ir a exposure_total/unresolved_impact_total en vez de a
// CFF_TOTAL). Decisión de Luis, Paso 3 de Fase 4b-ii.
var RELACIONES_RIESGO_SOLAPAMIENTO = {
  DUPLICATE: true, ALTERNATIVE_VALUATION: true, UNKNOWN: true, CONTAINS: true
};

var CATEGORIAS_EXCLUSION = {
  TEMPORAL: 'NATURALEZA_TEMPORAL_NO_SUMABLE',
  RELACION: 'RELACION_ECONOMICA_NO_PERMITE_INCLUSION',
  COSTO_COMPARTIDO: 'COSTO_COMPARTIDO_UNALLOCATED',
  TRANSFERENCIA_INTERNA: 'TRANSFERENCIA_INTERNA_PURA_ELIMINADA',
  ADMISIBILIDAD: 'FALLA_COMPUERTA_ADMISIBILIDAD_§18',
  DOBLE_FALLA: 'EXPOSURE_Y_UNRESOLVED_NO_SUMADO_A_NINGUN_TOTAL'
};

// ── contexto ────────────────────────────────────────────────────────────

function _nuevoContexto(entrada) {
  if (!entrada || !Array.isArray(entrada.componentes) || entrada.componentes.length === 0) {
    throw new Error('consolidarPeriodoYAlcance: se esperaba entrada.componentes como array no vacío.');
  }
  if (!Array.isArray(entrada.relaciones)) {
    throw new Error('consolidarPeriodoYAlcance: entrada.relaciones debe ser un array (vacío si no hay relaciones).');
  }
  if (!Array.isArray(entrada.nodeHierarchy) || !Array.isArray(entrada.nodeSet) || !entrada.nodeRaiz) {
    throw new Error('consolidarPeriodoYAlcance: se requieren nodeHierarchy (array), nodeSet (array) y nodeRaiz (string).');
  }
  if (!entrada.economicScope) {
    throw new Error('consolidarPeriodoYAlcance: se requiere economicScope (NODE | BUSINESS_UNIT | ORGANIZATION).');
  }
  var ids = {};
  entrada.componentes.forEach(function (c) {
    if (!c || typeof c.component_id !== 'string') {
      throw new Error('consolidarPeriodoYAlcance: cada componente requiere component_id (string).');
    }
    if (ids[c.component_id]) {
      throw new Error('consolidarPeriodoYAlcance: component_id "' + c.component_id + '" duplicado en la entrada.');
    }
    ids[c.component_id] = true;
    if (typeof c.valor !== 'number') {
      throw new Error('consolidarPeriodoYAlcance: el componente "' + c.component_id + '" no trae `valor` numérico ' +
        '(valor monetario ya resuelto por Fase 1). consolidacion.js no monetiza.');
    }
  });
  return {
    entrada: entrada,
    componentes: entrada.componentes,
    porId: entrada.componentes.reduce(function (m, c) { m[c.component_id] = c; return m; }, {}),
    tolerancia: (typeof entrada.toleranciaReconciliacion === 'number') ? entrada.toleranciaReconciliacion : null,
    // salidas de pasos
    temporalExcluidos: {},   // id → motivo
    valores: {},             // id → valor efectivo en reporting_currency (paso 2)
    reportingCurrency: null,
    valuationBasis: null,
    permiteInclusion: {},    // id → boolean  (lo ESCRIBE paso 4, lo LEE paso 5)
    motivoNoInclusion: {},   // id → motivo
    excluidoPorRelacionRiesgo: {},  // id → relation_type (§ INV-CFF-20 / Paso 3)
    alcanceClasificacion: null,
    admisibles: [],
    excluidos: [],           // [{ component_id, motivo, categoria }]
    quadrantes: { confirmed_observed: 0, confirmed_estimated: 0, supported_observed: 0, supported_estimated: 0 },
    exposure_total: 0,
    unresolved_impact_total: 0,
    flags: []
  };
}

function _registrarExclusion(ctx, componentId, motivo, categoria) {
  ctx.excluidos.push({ component_id: componentId, motivo: motivo, categoria: categoria });
}

// ── PASO 1 — VALIDAR ────────────────────────────────────────────────────

function _paso1Validar(ctx) {
  // §16.1 — frecuencia consistente (lanza si mezcla)
  temporalidad.validarFrecuenciaConsistente(ctx.componentes.map(function (c) {
    return { aggregation_frequency: c.aggregation_frequency };
  }));

  // §16 — naturaleza temporal: PERIOD_FLOW se suma; STOCK/RATE solo con
  // transformación validada; el resto se excluye (visible, con motivo).
  var filtro = temporalidad.filtrarSumablesPorNaturalezaTemporal(ctx.componentes.map(function (c) {
    return {
      component_id: c.component_id,
      temporal_nature: c.temporal_nature,
      original_value: c.valor,
      transformacionValidada: c.transformacionValidada,
      valorFlujoEquivalente: c.valorFlujoEquivalente
    };
  }));
  ctx._valorTemporal = {};
  filtro.sumables.forEach(function (s) { ctx._valorTemporal[s.component_id] = s.valor; });
  filtro.excluidos.forEach(function (e) {
    ctx.temporalExcluidos[e.component_id] = e.motivo;
    _registrarExclusion(ctx, e.component_id, e.motivo, CATEGORIAS_EXCLUSION.TEMPORAL);
  });
}

// ── PASO 2 — NORMALIZAR ─────────────────────────────────────────────────

function _paso2Normalizar(ctx) {
  var activos = ctx.componentes.filter(function (c) { return !ctx.temporalExcluidos[c.component_id]; });

  // valuation_basis única (INV-CFF-29: NOMINAL y REAL no se mezclan)
  var bases = {};
  activos.forEach(function (c) { if (c.valuation_basis) bases[c.valuation_basis] = true; });
  var basesDistintas = Object.keys(bases);
  if (basesDistintas.length > 1) {
    throw new Error('NORMALIZAR: los componentes mezclan valuation_basis (' + basesDistintas.join(', ') +
      ') — INV-CFF-29 prohíbe mezclar NOMINAL y REAL en una misma consolidación.');
  }
  ctx.valuationBasis = basesDistintas[0] || null;

  // base monetaria común (INV-CFF-28: monedas distintas no se suman sin normalización)
  var monedas = {};
  activos.forEach(function (c) { monedas[c.original_currency] = true; });
  var monedasDistintas = Object.keys(monedas);

  if (monedasDistintas.length === 1) {
    ctx.reportingCurrency = monedasDistintas[0];
    activos.forEach(function (c) { ctx.valores[c.component_id] = ctx._valorTemporal[c.component_id]; });
    return;
  }

  // multi-moneda: cada activo debe traer normalized_value + reporting_currency ya resueltos
  var reporting = {};
  activos.forEach(function (c) {
    if (typeof c.normalized_value !== 'number' || !c.reporting_currency) {
      throw new Error('NORMALIZAR: original_currency mixtas (' + monedasDistintas.join(', ') + ') — el componente "' +
        c.component_id + '" no trae normalized_value + reporting_currency ya resueltos (§17 / INV-CFF-28: no se suma ' +
        'sin conversión explícita y trazable).');
    }
    reporting[c.reporting_currency] = true;
  });
  var reportingDistintas = Object.keys(reporting);
  if (reportingDistintas.length > 1) {
    throw new Error('NORMALIZAR: los normalized_value no comparten un mismo reporting_currency (' +
      reportingDistintas.join(', ') + ') — no se consolida en más de una base monetaria a la vez.');
  }
  ctx.reportingCurrency = reportingDistintas[0];
  activos.forEach(function (c) { ctx.valores[c.component_id] = c.normalized_value; });
}

// ── PASO 3 — RELACIONAR ─────────────────────────────────────────────────

function _paso3Relacionar(ctx) {
  var v = relaciones.validarGrafoContains(ctx.entrada.relaciones);
  if (!v.valido) {
    throw new Error('RELACIONAR: el grafo CONTAINS tiene ciclo(s) ' + JSON.stringify(v.ciclos) +
      ' — §13.3 / AC15: grafo inválido, se bloquea la consolidación afectada (BLOCKING).');
  }
}

// ── PASO 4 — RESOLVER (escribe ctx.permiteInclusion) ────────────────────

function _paso4Resolver(ctx) {
  var activos = ctx.componentes.filter(function (c) { return !ctx.temporalExcluidos[c.component_id]; });
  activos.forEach(function (c) { ctx.permiteInclusion[c.component_id] = true; });

  function bloquear(id, motivo) {
    if (ctx.permiteInclusion[id] === undefined) return; // temporalmente excluido, ya está fuera
    ctx.permiteInclusion[id] = false;
    if (!ctx.motivoNoInclusion[id]) ctx.motivoNoInclusion[id] = motivo;
  }

  // 4.1 relaciones económicas (§13) — resolverRelacion aplica la consecuencia
  ctx.entrada.relaciones.forEach(function (rel) {
    var a = rel.component_a_id, b = rel.component_b_id;
    if (ctx.valores[a] === undefined || ctx.valores[b] === undefined) return; // fuera de este período/alcance
    var r = relaciones.resolverRelacion(rel, ctx.valores);
    r.excluidos.forEach(function (e) {
      bloquear(e.component_id, 'Relación ' + rel.relation_type + ': ' + e.motivo);
      if (RELACIONES_RIESGO_SOLAPAMIENTO[rel.relation_type]) {
        ctx.excluidoPorRelacionRiesgo[e.component_id] = rel.relation_type;
      }
    });
  });

  // 4.2 costos compartidos (§14) — sin base de asignación documentada ⇒ UNALLOCATED
  var grupos = {};
  activos.forEach(function (c) {
    if (c.shared_cost_id) {
      (grupos[c.shared_cost_id] = grupos[c.shared_cost_id] || []).push(c);
    }
  });
  Object.keys(grupos).forEach(function (scid) {
    var opts = (ctx.entrada.sharedCosts && ctx.entrada.sharedCosts[scid]) || {};
    var res = costosCompartidos.resolverCostoCompartido(
      grupos[scid].map(function (c) { return { component_id: c.component_id, original_value: ctx.valores[c.component_id] }; }),
      opts
    );
    if (res.estado === 'UNALLOCATED') {
      grupos[scid].forEach(function (c) {
        bloquear(c.component_id, 'Costo compartido ' + scid + ' UNALLOCATED: ' + res.motivo);
        _registrarExclusion(ctx, c.component_id, res.motivo, CATEGORIAS_EXCLUSION.COSTO_COMPARTIDO);
      });
    }
  });

  // 4.3 transferencias internas puras (§14) — se eliminan solo al consolidar a ORGANIZATION
  var alcanceObjetivo = ctx.entrada.economicScope === 'ORGANIZATION' ? 'ORGANIZATION' : 'NODE';
  var filtro = costosCompartidos.filtrarTransferenciasInternasPuras(
    activos.map(function (c) {
      return { component_id: c.component_id, esTransferenciaInternaPura: c.esTransferenciaInternaPura };
    }),
    alcanceObjetivo
  );
  filtro.eliminados.forEach(function (e) {
    bloquear(e.component_id, 'Transferencia interna pura eliminada en consolidación ORGANIZATION (§14, INV-CFF-26)');
    _registrarExclusion(ctx, e.component_id,
      'Transferencia interna pura eliminada en consolidación ORGANIZATION (§14)', CATEGORIAS_EXCLUSION.TRANSFERENCIA_INTERNA);
  });

  // 4.4 jerarquía de nodos (§15) — NO_PARENT_CHILD_DOUBLE_COUNT ⇒ BLOCKING
  ctx.alcanceClasificacion = nodos.clasificarAlcance(ctx.entrada.nodeSet, ctx.entrada.nodeRaiz, ctx.entrada.nodeHierarchy);
  if (ctx.alcanceClasificacion.alcance === 'INVALIDO') {
    throw new Error('RESOLVER: nodeSet inválido — ' + ctx.alcanceClasificacion.razon + ' ' +
      JSON.stringify(ctx.alcanceClasificacion.violaciones) + ' (§15, NO_PARENT_CHILD_DOUBLE_COUNT: BLOCKING).');
  }

  // registrar exclusiones por relación (las que no fueron ya registradas por 4.2/4.3)
  activos.forEach(function (c) {
    if (ctx.permiteInclusion[c.component_id] === false) {
      var yaRegistrado = ctx.excluidos.some(function (x) {
        return x.component_id === c.component_id &&
          (x.categoria === CATEGORIAS_EXCLUSION.COSTO_COMPARTIDO || x.categoria === CATEGORIAS_EXCLUSION.TRANSFERENCIA_INTERNA);
      });
      if (!yaRegistrado) {
        _registrarExclusion(ctx, c.component_id, ctx.motivoNoInclusion[c.component_id] || 'relación no permite inclusión',
          CATEGORIAS_EXCLUSION.RELACION);
      }
    }
  });
}

// ── PASO 5 — SELECCIONAR (lee ctx.permiteInclusion) ─────────────────────

function _paso5Seleccionar(ctx) {
  ctx.componentes.forEach(function (c) {
    if (ctx.temporalExcluidos[c.component_id]) return; // ya excluido en paso 1

    var senales = {
      component_id: c.component_id,
      event_status: c.event_status,
      monetization_status: c.monetization_status,
      attribution_status: c.attribution_status,
      monetary_basis_valid: c.monetary_basis_valid,
      temporal_basis_valid: c.temporal_basis_valid,
      scope_valid: c.scope_valid,
      // ── la dependencia de orden: esta señal la ESCRIBE _paso4Resolver ──
      relationship_resolution_permite_inclusion: ctx.permiteInclusion[c.component_id]
    };

    var r = admisibilidad.evaluarAdmisibilidad(senales);
    if (r.admisible) {
      ctx.admisibles.push(c);
    } else {
      var yaRegistrado = ctx.excluidos.some(function (x) { return x.component_id === c.component_id; });
      if (!yaRegistrado) {
        _registrarExclusion(ctx, c.component_id, r.exclusion_reason, CATEGORIAS_EXCLUSION.ADMISIBILIDAD);
      }
    }
  });
}

// ── PASO 6 — SUMAR ─────────────────────────────────────────────────────

function _paso6Sumar(ctx) {
  ctx.admisibles.forEach(function (c) {
    var val = ctx.valores[c.component_id];
    var confirmado = c.attribution_status === 'CONFIRMED';
    var observado = c.monetization_status === 'OBSERVED';
    var clave = (confirmado ? 'confirmed_' : 'supported_') + (observado ? 'observed' : 'estimated');
    ctx.quadrantes[clave] += val;
  });

  // totales de diagnóstico, fuera de CFF_TOTAL (§19: "permanecen visibles,
  // pero no entran al CFF consolidado")
  ctx.componentes.forEach(function (c) {
    var val = ctx.valores[c.component_id];
    if (val === undefined) return; // sin valor resuelto (temporalmente excluido)
    var esExposure = c.monetization_status === 'EXPOSURE';
    var esUnresolved = c.attribution_status === 'UNRESOLVED';
    if (!esExposure && !esUnresolved) return;

    var estado = (esExposure ? 'EXPOSURE' : '') + (esExposure && esUnresolved ? '+' : '') + (esUnresolved ? 'UNRESOLVED' : '');

    // (a) excluido por una relación con riesgo de solapamiento → tampoco
    //     cuenta en los totales secundarios (INV-CFF-20 / Paso 3): si dos
    //     componentes son el mismo hecho contado dos veces, esa duplicación
    //     no deja de serlo por ir a un total de diagnóstico. Mismo trato de
    //     visibilidad que la doble falla (Opción D): ya está registrado como
    //     excluido (categoría RELACION, en _paso4Resolver), y se agrega el
    //     flag a nivel de resultado.
    var relRiesgo = ctx.excluidoPorRelacionRiesgo[c.component_id];
    if (relRiesgo) {
      ctx.flags.push('COMPONENTE_' + estado + ':"' + c.component_id + '" excluido por relación ' + relRiesgo +
        ' con riesgo de solapamiento — NO se suma a exposure_total ni a unresolved_impact_total (INV-CFF-20). ' +
        'Ya registrado como excluido; visible por cobertura degradada y este flag.');
      return;
    }

    // (b) doble falla EXPOSURE + UNRESOLVED (Opción D)
    if (esExposure && esUnresolved) {
      ctx.flags.push('COMPONENTE_EXPOSURE_Y_UNRESOLVED:"' + c.component_id + '" no sumado a exposure_total ni a ' +
        'unresolved_impact_total (Opción D, §20 + INV-CFF-55/50) — visible por cobertura degradada y este flag.');
      _registrarExclusion(ctx, c.component_id,
        'monetization_status=EXPOSURE Y attribution_status=UNRESOLVED — no se suma a ningún total de diagnóstico para ' +
        'no contar su valor dos veces; cuenta como material-no-evaluado para cobertura (§20).',
        CATEGORIAS_EXCLUSION.DOBLE_FALLA);
      return;
    }

    // (c) exposición / impacto no resuelto, limpio de solapamiento
    if (esExposure) ctx.exposure_total += val;
    else ctx.unresolved_impact_total += val;
  });
}

// ── invariante AC45 — reconciliación de los 4 cuadrantes con CFF_TOTAL ───

/**
 * verificarReconciliacionCuadrantes(parcial, tolerancia)
 *
 * parcial: { confirmed_observed, confirmed_estimated, supported_observed,
 *   supported_estimated, cff_total }.
 *
 * AC45: si CFF_TOTAL no coincide con la suma de los 4 cuadrantes → lanza
 * ("Bloquear publicación", literal). Expuesta para prueba dirigida (misma
 * convención que verificarConsistenciaInterna en admisibilidad.js).
 */
function verificarReconciliacionCuadrantes(parcial, tolerancia) {
  var suma = parcial.confirmed_observed + parcial.confirmed_estimated +
    parcial.supported_observed + parcial.supported_estimated;
  var tol = (typeof tolerancia === 'number') ? tolerancia : GUARDA_DRIFT;
  if (Math.abs(parcial.cff_total - suma) > tol) {
    throw new Error('verificarReconciliacionCuadrantes: cff_total (' + parcial.cff_total + ') no coincide con la suma ' +
      'de los 4 cuadrantes (' + suma + '), diferencia ' + (parcial.cff_total - suma) + ' > tolerancia ' + tol +
      ' — AC45 exige bloquear publicación. EXPOSURE / UNRESOLVED / N_A no entran a CFF_TOTAL (§19); si la diferencia ' +
      'viene de sumarlos, ese es el defecto. (§19.2: la tolerancia no puede usarse para ocultar diferencias materiales.)');
  }
  return { valido: true, sumaCuadrantes: suma };
}

// ── orquestador ────────────────────────────────────────────────────────

/**
 * consolidarPeriodoYAlcance(entrada) → campos numéricos de CFF_RESULT +
 * insumo de cobertura. NO arma el objeto CFF_RESULT completo (eso es
 * runCFF, 4b-iv); NO clasifica COVERAGE_STATUS (eso es cobertura.js, 4b-iii).
 *
 * entrada: {
 *   componentes: [{ component_id, valor, event_status, monetization_status,
 *     attribution_status, monetary_basis_valid, temporal_basis_valid,
 *     scope_valid, temporal_nature, aggregation_frequency, original_currency,
 *     valuation_basis, normalized_value?, reporting_currency?, shared_cost_id?,
 *     esTransferenciaInternaPura, transformacionValidada?, valorFlujoEquivalente? }],
 *   relaciones: [ECONOMIC_RELATION],
 *   nodeHierarchy: [{ node_id, parent_id }],
 *   nodeSet: [node_id],
 *   nodeRaiz: node_id,
 *   economicScope: 'NODE' | 'BUSINESS_UNIT' | 'ORGANIZATION',
 *   sharedCosts?: { [shared_cost_id]: { baseAsignacionDocumentada: boolean, descripcionBase? } },
 *   toleranciaReconciliacion?: number
 * }
 */
function consolidarPeriodoYAlcance(entrada) {
  var ctx = _nuevoContexto(entrada);
  _paso1Validar(ctx);
  _paso2Normalizar(ctx);
  _paso3Relacionar(ctx);
  _paso4Resolver(ctx);     // §19: RESOLVER escribe ctx.permiteInclusion
  _paso5Seleccionar(ctx);  // §19: SELECCIONAR lee ctx.permiteInclusion — depende de _paso4Resolver
  _paso6Sumar(ctx);

  var q = ctx.quadrantes;
  var cff_confirmed = q.confirmed_observed + q.confirmed_estimated;
  var cff_supported_additional = q.supported_observed + q.supported_estimated;
  var cff_total = cff_confirmed + cff_supported_additional;

  if (ctx.tolerancia === null) {
    ctx.flags.push('TOLERANCIA_RECONCILIACION_PENDIENTE_VALIDACION — sin valor de negocio aportado; se usa solo la ' +
      'guarda de drift de punto flotante (' + GUARDA_DRIFT + '), no una tolerancia material (§19.2).');
  }
  verificarReconciliacionCuadrantes(
    { confirmed_observed: q.confirmed_observed, confirmed_estimated: q.confirmed_estimated,
      supported_observed: q.supported_observed, supported_estimated: q.supported_estimated, cff_total: cff_total },
    ctx.tolerancia
  );

  return {
    reporting_currency: ctx.reportingCurrency,
    valuation_basis: ctx.valuationBasis,
    confirmed_observed: q.confirmed_observed,
    confirmed_estimated: q.confirmed_estimated,
    supported_observed: q.supported_observed,
    supported_estimated: q.supported_estimated,
    cff_confirmed: cff_confirmed,
    cff_supported_additional: cff_supported_additional,
    cff_total: cff_total,
    exposure_total: ctx.exposure_total,
    unresolved_impact_total: ctx.unresolved_impact_total,
    alcance_clasificacion: ctx.alcanceClasificacion,
    flags: ctx.flags,
    coverageInput: {
      componentes_candidatos: ctx.componentes.length,
      componentes_admisibles: ctx.admisibles.length,
      componentes_excluidos: ctx.excluidos
    }
  };
}

module.exports = {
  consolidarPeriodoYAlcance: consolidarPeriodoYAlcance,
  verificarReconciliacionCuadrantes: verificarReconciliacionCuadrantes,
  CATEGORIAS_EXCLUSION: CATEGORIAS_EXCLUSION,
  // pasos expuestos para prueba dirigida al orden (convención esConfirmed/esSupported)
  _nuevoContexto: _nuevoContexto,
  _paso1Validar: _paso1Validar,
  _paso2Normalizar: _paso2Normalizar,
  _paso3Relacionar: _paso3Relacionar,
  _paso4Resolver: _paso4Resolver,
  _paso5Seleccionar: _paso5Seleccionar,
  _paso6Sumar: _paso6Sumar
};
