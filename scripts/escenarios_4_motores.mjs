/**
 * scripts/escenarios_4_motores.mjs
 *
 * Escenarios de FPV / CFF / IFD / PIIO para scripts/simular_organizaciones.mjs
 * -- cierra DISENO_EXTENSION_SIMULACION_4_MOTORES.md (aprobado por Luis).
 * Módulo aparte del script principal para poder probarse solo contra una
 * organización desechable (mini-prueba) antes de la corrida completa.
 *
 * No hace HTTP por su cuenta: cada función `registrar*` recibe `ctx`
 * ({ rpc, conLimite }) del script principal -- sin dependencia circular
 * con simular_organizaciones.mjs.
 *
 * Fuera de alcance, a propósito (no se simula con un sustituto):
 *   - Fenómeno PIIO_COMPATIBLE_PROVISIONAL: `phenomenon_catalog` no tiene
 *     columna `status`, runPIIO.js:219 lee `phenSpec.status` -- inalcanzable
 *     desde producción (PENDIENTES_BRECHAS_WORKER_MOTORES.md §4).
 *   - CFF DEPENDENT_COST: sin evidencia contra producción todavía.
 */

'use strict';

const PERIODOS = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];

function ok(res, etiqueta) {
  if (res.error) throw new Error(etiqueta + ': ' + res.error.message);
  return res.data;
}

// ══════════════════════════════════════════════════════════════════════
// node_hierarchy (041) -- compartida por CFF y PIIO
// ══════════════════════════════════════════════════════════════════════
// hojas: nombres de departamento, mismos que las invitaciones de ICE-IEH/SDMO.
export function nodosOrganizacion(hojas) {
  const nodos = [{
    node_id: 'ORG', parent_node_id: null, node_type: 'ORG', active_from: '2026-04',
    aggregation_membership: 'set-root', scope_rules: { scope: 'ORGANIZATIONAL' }, version: 'v1'
  }];
  hojas.forEach((h, i) => nodos.push({
    node_id: h, parent_node_id: 'ORG', node_type: 'ORG', active_from: '2026-04',
    aggregation_membership: 'set-' + (i + 1), scope_rules: { scope: 'SEGMENT_ONLY' }, version: 'v1'
  }));
  return nodos;
}

export async function registrarNodeHierarchy(ctx, jwt, orgId, nodos) {
  for (const nodo of nodos) { // secuencial: la raíz antes que las hojas
    ok(await ctx.rpc('registrar_nodo_piio', { p_organization_id: orgId, p_nodo: nodo }, jwt), 'registrar_nodo_piio ' + nodo.node_id);
  }
  return nodos.length;
}

// ══════════════════════════════════════════════════════════════════════
// CFF
// ══════════════════════════════════════════════════════════════════════
const COMPONENTE_BASE = {
  phenomenon_id: 'FEN1', consequence_id: 'CONS', primary_mechanism: 'ADDITIONAL_CONSUMPTION',
  financial_nature: 'INCREMENTAL_COST', resource_type: 'horas_hombre', quantity: 10, unit: 'hora',
  temporal_nature: 'PERIOD_FLOW', source_frequency: 'monthly', calculation_frequency: 'monthly',
  aggregation_frequency: 'monthly', calculation_mode: 'DIRECT_VALUE', input_variables: [],
  monetary_basis_id: 'MB1', original_currency: 'COP', valuation_basis: 'NOMINAL',
  monetization_status: 'OBSERVED', attribution_status: 'CONFIRMED', valuation_role: 'PRIMARY',
  economic_scope: 'NODE', counterparty_scope: 'INTERNAL', dependency_refs: [], include_in_cff: true,
  flags: [], es_transferencia_interna_pura: false
};
function comp(id, nodo, valor, over) {
  return Object.assign({}, COMPONENTE_BASE, { component_id: id, node_id: nodo, original_value: valor }, over || {});
}
function evento(id, nodo, periodo, componentes) {
  return {
    event: { event_id: id, source_type: 'EXTERNAL_OPERATIONAL_RECORD', phenomenon_id: 'FEN1', domain_id: 'QUALITY',
      node_id: nodo, period_start: periodo, period_end: periodo, event_type: 'tipo', event_description: 'evento ' + id, status: 'COMPLETE' },
    components: componentes
  };
}
function caso(id, periodo, over) {
  return Object.assign({
    cff_case_id: id, period_start: periodo, period_end: periodo, scope: 'CFF simulación ' + id,
    economic_scope: 'ORGANIZATION', valuation_basis: 'NOMINAL', node_raiz: 'ORG', node_set: null,
    cobertura_tratamiento_suficiente: true, cobertura_depende_estimaciones_debiles: false,
    cobertura_asignaciones_limitadas: false, cobertura_base_defendible: true, run_status: 'COMPLETED'
  }, over || {});
}
// Un caso por (organización, período): leer_eventos_cff filtra por rango de
// período, NO por caso -- dos casos en el mismo período verían los mismos
// eventos. Escenarios con cobertura distinta van en períodos distintos.
export function cffSana() {
  return { casos: [{
    caso: caso('CASO-SANA-2026-06', '2026-06', { node_set: ['Operaciones', 'Administración'] }),
    eventos: [
      // escenario 1 -- caso limpio
      evento('EV-S1', 'Operaciones', '2026-06', [comp('C-S1', 'Operaciones', 800)]),
      // escenario 5 -- múltiples componentes, mezcla de mecanismo/naturaleza
      evento('EV-S5', 'Operaciones', '2026-06', [
        comp('C-S5a', 'Operaciones', 1200, { primary_mechanism: 'LOST_CAPACITY', financial_nature: 'CAPACITY_VALUE', resource_type: 'ventas_perdidas', monetization_status: 'ESTIMATED' }),
        comp('C-S5b', 'Operaciones', 500, { primary_mechanism: 'REPLACEMENT', attribution_status: 'SUPPORTED' }),
        comp('C-S5c', 'Administración', 300, { primary_mechanism: 'UNCAPTURED_VALUE', financial_nature: 'UNCAPTURED_MARGIN', monetization_status: 'ESTIMATED' })
      ]),
      // escenario 7 -- C-S7a contiene por completo a C-S7b (relación real, 042)
      evento('EV-S7', 'Operaciones', '2026-06', [comp('C-S7a', 'Operaciones', 2000), comp('C-S7b', 'Operaciones', 400)])
    ],
    relaciones: [{
      relation_id: 'REL-S7', component_a_id: 'C-S7a', component_b_id: 'C-S7b', relation_type: 'CONTAINS',
      direction: 'C-S7a_CONTAINS_C-S7b', effective_from: '2026-06', effective_to: '2026-06', containment_scope: 'FULL',
      resolution_status: 'RESOLVED', resolution_method: 'juicio del analista',
      rationale: 'el componente C-S7a incluye por completo el alcance de C-S7b', version: 'v1'
    }],
    // 800 + (1200+500+300) + 2000 (C-S7b, contenido, NO suma) = 4800
    esperado: { cff_total: 4800 }
  }] };
}
export function cffAlerta() {
  return { casos: [
    {
      caso: caso('CASO-ALERTA-2026-06', '2026-06', { node_set: ['Ventas', 'Producción'] }),
      eventos: [ // escenario 2 -- un componente fuera del node_set
        evento('EV-A2', 'Ventas', '2026-06', [comp('C-A2a', 'Ventas', 700), comp('C-A2b', 'Bodega', 900)])
      ],
      relaciones: [],
      esperado: { cff_total: 700, calculation_status: 'VALID_WITH_LIMITATIONS' }
    },
    {
      // escenario 6 -- cobertura insuficiente: cff_total = null, nunca 0 (AC46)
      caso: caso('CASO-ALERTA-2026-07', '2026-07', { node_set: ['Ventas', 'Producción'], cobertura_base_defendible: false }),
      eventos: [
        evento('EV-A6', 'Ventas', '2026-07', [
          comp('C-A6a', 'Ventas', 600, { monetization_status: 'EXPOSURE' }),
          comp('C-A6b', 'Producción', 450, { attribution_status: 'UNRESOLVED' })
        ])
      ],
      relaciones: [],
      esperado: { cff_total: null, calculation_status: 'INVALID' }
    }
  ] };
}
export function cffPequena(periodo = '2026-06') {
  return { casos: [{
    // escenario 4 -- node_set NULL: se resuelve con hojasBajo(ORG)
    caso: caso('CASO-PEQ-' + periodo, periodo, { node_set: null }),
    eventos: [ // escenario 3 -- transferencia interna pura eliminada
      evento('EV-P3-' + periodo, 'Equipo B', periodo, [
        comp('C-P3a-' + periodo, 'Equipo B', 500),
        comp('C-P3b-' + periodo, 'Equipo B', 200, { es_transferencia_interna_pura: true })
      ])
    ],
    relaciones: [],
    esperado: { cff_total: 500 }
  }] };
}

export async function registrarCff(ctx, jwt, orgId, escenario) {
  let llamadas = 0;
  for (const c of escenario.casos) {
    ok(await ctx.rpc('registrar_caso_cff', { p_organization_id: orgId, p_caso: c.caso }, jwt), 'registrar_caso_cff ' + c.caso.cff_case_id); llamadas++;
    for (const e of c.eventos) {
      ok(await ctx.rpc('registrar_evento_cff', { p_organization_id: orgId, p_event: e.event, p_components: e.components }, jwt), 'registrar_evento_cff ' + e.event.event_id); llamadas++;
    }
    if (c.relaciones.length) {
      ok(await ctx.rpc('registrar_relaciones_cff', { p_organization_id: orgId, p_relaciones: c.relaciones }, jwt), 'registrar_relaciones_cff ' + c.caso.cff_case_id); llamadas++;
    }
  }
  return llamadas;
}

// ══════════════════════════════════════════════════════════════════════
// IFD -- 8 EPDs, uno por celda de INVESTIGACION_SIMULACION_IFD.md §3
// ══════════════════════════════════════════════════════════════════════
const EPD_BASE = {
  engine_version: 'v1.2.2', deterioration_sustained: true, evidence_present: true, mechanism_traceable: true,
  horizon_defined: true, assumptions_declared: true, q: 3, c: 3, t: 3, r: 3, variable_type: 'V2', evolution_type: 'EV-A',
  series_sufficiency: 3, horizon: 6, baseline: 3000, delta: 400, economic_traceability: true, attribution_category: 'CONFIRMED'
};
function epd(id, over) { return Object.assign({}, EPD_BASE, { epd_id: id }, over || {}); }
export function epdsIfd() {
  return [
    { epd: epd('EPD-1-no-admisible', { horizon_defined: false }), esperado: 'S0' },
    { epd: epd('EPD-2-trazabilidad-nula', { q: 2, c: 2, t: 2, r: 0, attribution_category: 'SUPPORTED' }), esperado: 'S0' },
    { epd: epd('EPD-3-evidencia-debil', { q: 1, c: 3, t: 3, r: 3, attribution_category: 'SUPPORTED' }), esperado: 'S1' },
    { epd: epd('EPD-4-evidencia-media', { q: 2, c: 2, t: 2, r: 2, evolution_type: 'EV-M', growth_rate: 0.05, delta: null, attribution_category: 'SUPPORTED' }), esperado: 'S2' },
    { epd: epd('EPD-5-evidencia-fuerte'), esperado: 'S3' },
    { epd: epd('EPD-6-V5-latente', { variable_type: 'V5', evolution_type: 'EV-CUAL', baseline: null, delta: null, attribution_category: 'UNRESOLVED' }), esperado: 'S1' },
    { epd: epd('EPD-7-V1-tasa', { variable_type: 'V1', frequency: 0.02, exposure_obs: 1000, events_obs: 20, exposure_future: 1500, baseline: null, delta: null, attribution_category: 'N_A' }), esperado: 'S3' },
    { epd: epd('EPD-8-serie-insuficiente', { series_sufficiency: 1 }), esperado: 'S1' }
  ];
}
export async function registrarIfd(ctx, jwt, orgId, lista) {
  for (const it of lista) {
    ok(await ctx.rpc('registrar_epd_ifd', { p_organization_id: orgId, p_epd: it.epd }, jwt), 'registrar_epd_ifd ' + it.epd.epd_id);
  }
  return lista.length;
}

// ══════════════════════════════════════════════════════════════════════
// FPV -- población propia (cliente-N/inversionista-N/proveedor-N), un período
// ══════════════════════════════════════════════════════════════════════
const PERIODO_FPV = '2026-09';
function personas(posicion, prefijo, valores, peso) {
  return valores.map((v, i) => Object.assign(
    { persona_id: prefijo + '-' + (i + 1), posicion, f: String(v[0]), p: String(v[1]), v: String(v[2]) },
    peso ? { peso: peso[i % peso.length] } : {}));
}
export function fpvSana(periodo = PERIODO_FPV) {
  return {
    periodo,
    config: [
      // CENSAL: 12 respondientes / N_elegibles 14 = CV 85.7 >= 80; diseño declarado ambos false -> NO escala a INFERENCIAL
      { posicion: 'CONSUMIDOR', period: periodo, n_elegibles: 14, diseno_probabilistico: false, diseno_modelo_documentado: false },
      { posicion: 'INVERSIONISTA', period: periodo, ponderacion_metodologia: 'inverso de probabilidad de selección' }
    ],
    respuestas: [
      ...personas('CONSUMIDOR', 'cliente', [[4,4,4],[4,4,5],[4,4,4],[5,4,4],[4,4,4],[4,3,4],[3,4,4],[4,4,4],[4,5,4],[5,4,4],[4,4,4],[4,4,3]]),
      ...personas('INVERSIONISTA', 'inversionista', [[4,4,3],[3,4,4],[4,4,4],[5,4,4],[4,3,4],[4,4,4],[3,4,3],[4,5,4],[4,4,4],[4,4,5]], [1, 2, 3]),
      ...personas('PROVEEDOR', 'proveedor', [[4,4,4],[3,4,4],[4,3,4],[4,4,3],[5,4,4],[4,4,4],[4,5,4],[4,4,5]])
    ],
    esperado: { CONSUMIDOR: 'CENSAL', INVERSIONISTA: 'DESCRIPTIVO(ponderado)', PROVEEDOR: 'DESCRIPTIVO' }
  };
}
export function fpvAlerta(periodo = PERIODO_FPV) {
  return {
    periodo,
    config: [],
    respuestas: [
      // polarización: mitad 1, mitad 5 -> mismo nivel medio, H alta
      ...personas('CONSUMIDOR', 'cliente', [[1,1,1],[5,5,5],[1,1,1],[5,5,5],[1,1,1],[5,5,5],[1,1,1],[5,5,5],[1,1,1],[5,5,5],[1,1,1],[5,5,5]]),
      // NE abundante en P (sin experiencia): CE bajo, NR = 0
      ...personas('INVERSIONISTA', 'inversionista', [[3,'NE',3],[3,'NE',4],[2,'NE',3],[3,'NE',3],[4,'NE',3],[3,'NE',2],[3,4,3],[3,3,3],[2,3,3],[3,4,4]]),
      // NR abundante en P (omisión): CE distinto del caso NE aunque el conteo de "no respuesta" sea igual
      ...personas('PROVEEDOR', 'proveedor', [[3,'NR',3],[3,'NR',4],[2,'NR',3],[3,'NR',3],[4,'NR',3],[3,4,3],[3,3,3],[2,3,3]])
    ],
    esperado: { CONSUMIDOR: 'H alta', INVERSIONISTA: 'P: CE bajo por NE', PROVEEDOR: 'P: NR sin afectar CE' }
  };
}
export function fpvMejora(periodo = PERIODO_FPV) {
  return {
    periodo,
    config: [
      // INFERENCIAL: basta UNO de probabilistico/modelo_documentado en true (cobertura.js disenoHabilitaInferencia)
      { posicion: 'INVERSIONISTA', period: periodo, diseno_probabilistico: true, diseno_modelo_documentado: false }
    ],
    respuestas: [
      // muestra parcial: 4 responden los 3 sensores, 6 solo F (P/V = NR) -> Ncfg=4 vs nv(F)=10
      ...personas('CONSUMIDOR', 'cliente', [[4,4,4],[4,4,4],[3,4,4],[4,3,4],[4,'NR','NR'],[3,'NR','NR'],[4,'NR','NR'],[5,'NR','NR'],[4,'NR','NR'],[3,'NR','NR']]),
      ...personas('INVERSIONISTA', 'inversionista', [[4,4,4],[4,3,4],[3,4,4],[4,4,3],[4,4,4],[5,4,4],[4,4,4],[3,4,4],[4,4,5],[4,4,4]])
      // PROVEEDOR: posición vacía a propósito, sin ninguna respuesta
    ],
    esperado: { CONSUMIDOR: 'Ncfg<nv', INVERSIONISTA: 'INFERENCIAL', PROVEEDOR: 'NO_CALCULABLE' }
  };
}
export function fpvPequena(periodo = PERIODO_FPV) {
  return {
    periodo,
    config: [],
    respuestas: personas('CONSUMIDOR', 'cliente', [[4,4,4],[4,5,4],[4,4,4],[3,4,4],[4,4,5]]),
    esperado: { CONSUMIDOR: 'DESCRIPTIVO' }
  };
}

export async function registrarFpv(ctx, jwt, orgId, esc) {
  let llamadas = 0;
  for (const cfg of esc.config) {
    ok(await ctx.rpc('registrar_config_posicion_fpv', { p_organization_id: orgId, p_config: cfg }, jwt), 'registrar_config_posicion_fpv ' + cfg.posicion); llamadas++;
  }
  const asignaciones = esc.respuestas.map((r) => ({ persona_id: r.persona_id, posicion: r.posicion }));
  const codigos = {};
  for (let i = 0; i < asignaciones.length; i += 50) { // lotes de 50, secuencial
    const lote = ok(await ctx.rpc('generar_invitaciones_fpv', { p_organization_id: orgId, p_asignaciones: asignaciones.slice(i, i + 50) }, jwt), 'generar_invitaciones_fpv'); llamadas++;
    lote.forEach((inv) => { codigos[inv.posicion + '|' + inv.persona_id] = inv.codigo; });
  }
  const fallidas = [];
  await ctx.conLimite(esc.respuestas, 10, async (r) => {
    const cuerpo = { p_codigo: codigos[r.posicion + '|' + r.persona_id], p_f: r.f, p_p: r.p, p_v: r.v, p_period: esc.periodo };
    if (r.peso !== undefined) cuerpo.p_peso = r.peso;
    const res = await ctx.rpc('registrar_respuesta_fpv', cuerpo, null);
    if (res.error) fallidas.push({ persona_id: r.persona_id, error: res.error.message });
  });
  return { llamadas: llamadas + esc.respuestas.length, fallidas, periodo: esc.periodo };
}

// ══════════════════════════════════════════════════════════════════════
// PIIO -- catálogo mínimo + observaciones (DISENO_EXTENSION...§2.4)
// ══════════════════════════════════════════════════════════════════════
const SALUD_ESTABLE = [0.85, 0.88, 0.84, 0.90, 0.86, 0.87];
const SALUD_DETERIORO = [0.90, 0.75, 0.60, 0.45, 0.30, 0.15];
const ULTIMO_DIA = { '2026-04': 28, '2026-05': 28, '2026-06': 28, '2026-07': 28, '2026-08': 28, '2026-09': 28 };

// tipo: 'sana' (BRIDGED con bridge_rule, NEW_SERIES) | 'deterioro' (BRIDGED SIN regla)
export function catalogoPiio(orgId, tipo, hoja) {
  const sana = tipo === 'sana';
  const salud = sana ? SALUD_ESTABLE : SALUD_DETERIORO;
  const ctxApp = { ORG: 'REQUIRED', DEFAULT: 'REQUIRED' };
  ctxApp[orgId] = 'REQUIRED';
  const md = (id, ph, name, dir, cont, extra) => Object.assign({
    metric_definition_id: id, phenomenon_id: ph, name, operational_definition: 'definición operativa de ' + name, unit: '%',
    metric_type: 'RATE', directionality: dir, source_frequency: 'monthly', calculation_frequency: 'monthly',
    aggregation_frequency: 'monthly', boundary_behavior: 'INVALID', recurrence_type: 'RATE_BASED',
    definition_version: 'v1', valid_from: '2026-04', continuity_mode: cont
  }, extra || {});
  const ph = (id, name, dominio, dir, egs) => ({
    phenomenon_id: id, name, operational_definition: 'definición operativa de ' + name, canonical_domain_id: dominio,
    recurrence_type: 'RATE_BASED', directionality: dir, required_evidence_group_ids: [], optional_evidence_group_ids: egs,
    proxy_allowed_as_primary: false, core_or_supporting_by_domain: { [dominio]: 'CORE' }, applicable_node_types: ['ORG'],
    version: 'v1', valid_from: '2026-04'
  });
  const ks = (id, name, dominio, phn, mdid, egid) => ({
    kpi_id: id, name, description: 'KPI ' + name, primary_domain_id: dominio, primary_phenomenon_id: phn,
    metric_definition_id: mdid, evidence_group_id: egid, evidence_proximity: 'DIRECT', computation: 'RAW',
    temporal_role: 'COINCIDENT', freshness_spec: { max_age_current: 2 }, condition_reference_id: 'REF-COND',
    temporal_reference_id: 'REF-TEMP', definition_version: 'v1', source_requirements: ['ERP']
  });
  const eg = (id, phn, kpi) => ({
    evidence_group_id: id, phenomenon_id: phn, node_id: hoja, member_kpi_ids: [kpi], source_lineage_ids: ['sistema-simulado'],
    independence_basis: { kind: 'SEPARATE_SOURCE', detail: 'fuente única simulada' }, resolution_rule_version: 'v1', status: 'ACTIVE'
  });
  const obs = (kpi, mdid, dirHigherWorse) => PERIODOS.map((p, i) => {
    const valor = Math.round(100 * (dirHigherWorse ? 1 - salud[i] : salud[i]));
    return {
      observation_id: 'OBS-' + kpi + '-' + p, kpi_id: kpi, metric_definition_id: mdid, node_id: hoja,
      period_start: p, period_end: p, observed_at: p + '-' + ULTIMO_DIA[p] + 'T12:00:00Z',
      value: valor, numerator: valor, denominator: 100, unit: '%', source_id: 'sistema-simulado',
      source_traceable: true, quality_status: 'VALID'
    };
  });
  return {
    dominios: [
      { domain_id: 'QUALITY', definition: 'Calidad de la operación', applicability_by_context: ctxApp, core_phenomenon_ids: ['PH-CALIDAD', 'PH-REPROCESO'], supporting_phenomenon_ids: [], version: 'v1' },
      { domain_id: 'OPERATIONAL_CONTINUITY', definition: 'Continuidad operativa', applicability_by_context: ctxApp, core_phenomenon_ids: ['PH-CONTINUIDAD'], supporting_phenomenon_ids: [], version: 'v1' }
    ],
    fenomenos: [
      ph('PH-CALIDAD', 'Defectos de calidad', 'QUALITY', 'HIGHER_IS_WORSE', ['EG-CAL']),
      ph('PH-REPROCESO', 'Reproceso', 'QUALITY', 'HIGHER_IS_WORSE', ['EG-REP']),
      ph('PH-CONTINUIDAD', 'Cumplimiento de continuidad', 'OPERATIONAL_CONTINUITY', 'LOWER_IS_WORSE', ['EG-CON'])
    ],
    metricas: [
      md('MD-CAL', 'PH-CALIDAD', 'Tasa de defectos', 'HIGHER_IS_WORSE', 'CONTINUOUS'),
      // Sana: BRIDGED CON regla (une la serie). Deterioro: BRIDGED SIN regla -> NEW_SERIES + BRIDGE_SIN_REGLA
      md('MD-CON', 'PH-CONTINUIDAD', 'Cumplimiento de continuidad', 'LOWER_IS_WORSE', 'BRIDGED',
        sana ? { bridge_rule: 'empalme por factor de escala 1:1 validado por el analista' } : {}),
      // Sana: NEW_SERIES (rompe la trayectoria). Deterioro: CONTINUOUS
      md('MD-REP', 'PH-REPROCESO', 'Tasa de reproceso', 'HIGHER_IS_WORSE', sana ? 'NEW_SERIES' : 'CONTINUOUS')
    ],
    referencias: [
      { reference_id: 'REF-COND', reference_role: 'CONDITION', reference_type: 'NORMATIVE', source: 'política interna simulada',
        valid_from: '2026-04', rule: 'umbral de condición', comparability_assessment: 'comparable', traceability: 'trazable',
        version: 'v1', admissibility_declared: 'ADMISSIBLE', threshold: 50 },
      { reference_id: 'REF-TEMP', reference_role: 'TEMPORAL', reference_type: 'NORMATIVE', source: 'política interna simulada',
        valid_from: '2026-04', rule: 'referencia temporal', comparability_assessment: 'comparable', traceability: 'trazable',
        version: 'v1', admissibility_declared: 'ADMISSIBLE' }
    ],
    kpis: [
      ks('KPI-CAL', 'Tasa de defectos', 'QUALITY', 'PH-CALIDAD', 'MD-CAL', 'EG-CAL'),
      ks('KPI-CON', 'Cumplimiento de continuidad', 'OPERATIONAL_CONTINUITY', 'PH-CONTINUIDAD', 'MD-CON', 'EG-CON'),
      ks('KPI-REP', 'Tasa de reproceso', 'QUALITY', 'PH-REPROCESO', 'MD-REP', 'EG-REP')
    ],
    grupos: [eg('EG-CAL', 'PH-CALIDAD', 'KPI-CAL'), eg('EG-CON', 'PH-CONTINUIDAD', 'KPI-CON'), eg('EG-REP', 'PH-REPROCESO', 'KPI-REP')],
    observaciones: [...obs('KPI-CAL', 'MD-CAL', true), ...obs('KPI-CON', 'MD-CON', false), ...obs('KPI-REP', 'MD-REP', true)]
  };
}

// orden de dependencia: dominio -> fenómeno -> métrica -> referencia -> kpi -> evidence group
export async function registrarPiio(ctx, jwt, orgId, cat) {
  let llamadas = 0;
  const paso = async (fn, param, lista, etiqueta) => {
    for (const x of lista) { ok(await ctx.rpc(fn, { p_organization_id: orgId, [param]: x }, jwt), fn + ' ' + etiqueta(x)); llamadas++; }
  };
  await paso('registrar_dominio_piio', 'p_dominio', cat.dominios, (x) => x.domain_id);
  await paso('registrar_fenomeno_piio', 'p_fenomeno', cat.fenomenos, (x) => x.phenomenon_id);
  await paso('registrar_metric_definition_piio', 'p_metric', cat.metricas, (x) => x.metric_definition_id);
  await paso('registrar_reference_spec_piio', 'p_reference', cat.referencias, (x) => x.reference_id);
  await paso('registrar_kpi_spec_piio', 'p_kpi_spec', cat.kpis, (x) => x.kpi_id);
  await paso('registrar_evidence_group_piio', 'p_grupo', cat.grupos, (x) => x.evidence_group_id);
  ok(await ctx.rpc('registrar_observaciones_piio', { p_organization_id: orgId, p_observaciones: cat.observaciones }, jwt), 'registrar_observaciones_piio'); llamadas++;
  return llamadas;
}
