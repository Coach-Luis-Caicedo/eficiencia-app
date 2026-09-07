/**
 * motor-piio/config.test.js — Fase 1
 * node motor-piio/config.test.js
 *
 * Las 4 validaciones pre-vuelo (§29 pasos 1–4) + severidades §30.
 * Oráculo conductual: AC70 (catálogo corrupto → BLOCKING), AC71
 * (jerarquía cíclica → BLOCKING), AC49/INV-48 (padre+hijos), AC72
 * (reference version ausente → KPI no clasificable), AC73
 * (metric_definition version ausente → bloquea estado).
 */

'use strict';

var CFG = require('./config');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }
// ¿hay un finding con este code? ¿con esta severidad/scope?
function tiene(res, code) { return res.findings.some(function (f) { return f.code === code; }); }
function findingDe(res, code) { return res.findings.filter(function (f) { return f.code === code; })[0]; }

// ── fixtures — un PIIO_INPUT bien formado (reusa las formas de Fase 0) ──

function md(over) {
  return Object.assign({
    metric_definition_id: 'md1', phenomenon_id: 'ph1', name: 'Tasa X', operational_definition: 'defn',
    unit: '%', metric_type: 'RATE', directionality: 'HIGHER_IS_WORSE',
    source_frequency: 'monthly', calculation_frequency: 'monthly', aggregation_frequency: 'quarterly',
    boundary_behavior: 'INVALID', recurrence_type: 'RATE_BASED', definition_version: 'v1', valid_from: '2026-01-01',
    continuity_mode: 'CONTINUOUS'
  }, over || {});
}
function rs(over) {
  return Object.assign({
    reference_id: 'rc1', reference_role: 'CONDITION', reference_type: 'NORMATIVE', source: 'ISO', valid_from: '2026-01-01',
    rule: 'r', comparability_assessment: 'a', traceability: 't', version: 'v1',
    admissibility_declared: 'ADMISSIBLE'  // reapertura Fase 3 (ambig. X)
  }, over || {});
}
function ph(over) {
  return Object.assign({
    phenomenon_id: 'ph1', name: 'Fenómeno 1', operational_definition: 'd', canonical_domain_id: 'QUALITY',
    recurrence_type: 'RATE_BASED', directionality: 'HIGHER_IS_WORSE', required_evidence_group_ids: ['eg1'],
    optional_evidence_group_ids: [], proxy_allowed_as_primary: false,
    core_or_supporting_by_domain: { QUALITY: 'CORE' }, applicable_node_types: ['ORG'], version: 'v1', valid_from: '2026-01-01'
  }, over || {});
}
function ds(over) {
  return Object.assign({
    domain_id: 'QUALITY', definition: 'd', applicability_by_context: { default: 'REQUIRED' },
    core_phenomenon_ids: ['ph1'], supporting_phenomenon_ids: [], version: 'v1'
  }, over || {});
}
function ns(over) {
  return Object.assign({
    node_id: 'n-root', node_type: 'ORG', active_from: '2026-01-01', aggregation_membership: 'set-root',
    scope_rules: { scope: 'ORGANIZATIONAL' }, version: 'v1', parent_node_id: null
  }, over || {});
}
function ks(over) {
  return Object.assign({
    kpi_id: 'k1', name: 'KPI 1', description: 'd', primary_domain_id: 'QUALITY', primary_phenomenon_id: 'ph1',
    metric_definition_id: 'md1', evidence_group_id: 'eg1', evidence_proximity: 'DIRECT', computation: 'RAW',
    temporal_role: 'COINCIDENT', freshness_spec: { max_age_current: 2 },
    condition_reference_id: 'rc1', temporal_reference_id: 'rt1', definition_version: 'v1', source_requirements: ['ERP']
  }, over || {});
}
function eg(over) {
  return Object.assign({
    evidence_group_id: 'eg1', phenomenon_id: 'ph1', node_id: 'n-root', member_kpi_ids: ['k1'],
    source_lineage_ids: ['src1'], independence_basis: { kind: 'SEPARATE_SOURCE', detail: 'x' },
    resolution_rule_version: 'v1', status: 'ACTIVE'
  }, over || {});
}
function obs(over) {
  return Object.assign({
    observation_id: 'o1', organization_id: 'org1', kpi_id: 'k1', metric_definition_id: 'md1', node_id: 'n-root',
    period_start: '2026-01-01', period_end: '2026-01-31', observed_at: '2026-02-01',
    value: 3.2, unit: '%', source_id: 's1', source_traceable: true, quality_status: 'VALID'
  }, over || {});
}
function input(over) {
  return Object.assign({
    organization_id: 'org1', ruleset_version: 'rs-v1', periods: ['2026-01'],
    domain_catalog: [ds()], phenomenon_catalog: [ph()],
    metric_definitions: [md()], references: [rs(), rs({ reference_id: 'rt1', reference_role: 'TEMPORAL' })],
    node_hierarchy: [ns()], kpi_specs: [ks()], evidence_groups: [eg()], observations: [obs()]
  }, over || {});
}

// ═══════════════════════════════════════════════════════════════════════
seccion('Caso bien formado → ok, sin findings');
// ═══════════════════════════════════════════════════════════════════════

var base = CFG.validarConfiguracion(input());
eq(base.ok, true, 'PIIO_INPUT completo y coherente → ok:true');
eq(base.findings, [], 'sin findings');

// forma inválida (Fase 0) → un solo BLOCKING+GLOBAL
var mala = CFG.validarConfiguracion(input({ kpi_specs: [ks({ primary_domain_id: 'X' })] }));
eq(mala.ok, false, 'forma inválida → ok:false');
eq(mala.findings.length, 1, 'un solo finding');
eq([mala.findings[0].code, mala.findings[0].severity, mala.findings[0].scope], ['FORMA_INVALIDA', 'BLOCKING', 'GLOBAL'], 'FORMA_INVALIDA / BLOCKING / GLOBAL — Fase 1 no inspecciona estructura mal formada');

// ═══════════════════════════════════════════════════════════════════════
seccion('§29 paso 1 — configuración de caso');
// ═══════════════════════════════════════════════════════════════════════

var otraOrg = CFG.validarConfiguracion(input({ observations: [obs({ organization_id: 'org-OTRA' })] }));
ok(tiene(otraOrg, 'OBS_OTRA_ORGANIZACION'), 'observación de otra organización → finding');
eq([findingDe(otraOrg, 'OBS_OTRA_ORGANIZACION').severity, findingDe(otraOrg, 'OBS_OTRA_ORGANIZACION').scope], ['BLOCKING', 'GLOBAL'], '...BLOCKING + GLOBAL');
eq(otraOrg.ok, false, '...bloquea la corrida');

// ═══════════════════════════════════════════════════════════════════════
seccion('§29 paso 2 — catálogos (AC70, INV-31, ambigüedad N)');
// ═══════════════════════════════════════════════════════════════════════

var domColgante = CFG.validarConfiguracion(input({ phenomenon_catalog: [ph({ canonical_domain_id: 'RESOURCE_EFFICIENCY' })] }));
ok(tiene(domColgante, 'FENOMENO_DOMINIO_COLGANTE'), 'fenómeno con canonical_domain_id fuera del catálogo → BLOCKING GLOBAL (AC70)');
eq(domColgante.ok, false, '...bloquea');

var fenColgante = CFG.validarConfiguracion(input({ domain_catalog: [ds({ core_phenomenon_ids: ['ph-FANTASMA'] })] }));
ok(tiene(fenColgante, 'DOMINIO_FENOMENO_COLGANTE'), 'dominio con core_phenomenon_id inexistente → BLOCKING GLOBAL');

// INV-31 — dominio aplicable sin CORE
var sinCore = CFG.validarConfiguracion(input({
  domain_catalog: [ds({ core_phenomenon_ids: [], supporting_phenomenon_ids: ['ph1'] })],
  phenomenon_catalog: [ph({ core_or_supporting_by_domain: { QUALITY: 'SUPPORTING' } })]
}));
ok(tiene(sinCore, 'DOMINIO_APLICABLE_SIN_CORE'), 'dominio REQUIRED sin ningún CORE → BLOCKING (INV-PIIO-31)');

// INV-31 — dominio NO aplicable sin CORE → NO se reporta
var noAplicable = CFG.validarConfiguracion(input({
  domain_catalog: [ds({ applicability_by_context: { default: 'NOT_APPLICABLE' }, core_phenomenon_ids: [] })],
  phenomenon_catalog: [ph({ core_or_supporting_by_domain: {} })],
  kpi_specs: [ks()], // el kpi sigue apuntando a QUALITY/ph1 pero eso es Fase 5
  evidence_groups: [eg()], observations: [obs()]
}));
ok(!tiene(noAplicable, 'DOMINIO_APLICABLE_SIN_CORE'), 'dominio NOT_APPLICABLE sin CORE → NO se reporta (INV-31 solo aplica a dominios aplicables)');

// ambigüedad N — desacuerdo domain.core vs phenomenon.role
var incoherente = CFG.validarConfiguracion(input({
  domain_catalog: [ds({ core_phenomenon_ids: ['ph1'] })],
  phenomenon_catalog: [ph({ core_or_supporting_by_domain: { QUALITY: 'SUPPORTING' } })]
}));
ok(tiene(incoherente, 'CATALOGO_INCONSISTENTE_CORE') || tiene(incoherente, 'CATALOGO_INCONSISTENTE_INVERSO'),
  'domain dice CORE, phenomenon dice SUPPORTING → BLOCKING GLOBAL (ambigüedad N: deben concordar)');
eq(incoherente.ok, false, '...bloquea — no se resuelve eligiendo un lado');

// ambigüedad N — caso que SOLO el chequeo inverso atrapa (P declara rol para
// un D que no lo lista, con D no aplicable para que INV-31 no interfiera)
var soloInverso = CFG.validarConfiguracion(input({
  domain_catalog: [
    ds({ core_phenomenon_ids: ['ph1'] }),
    ds({ domain_id: 'PRODUCTIVITY', applicability_by_context: { default: 'NOT_APPLICABLE' }, core_phenomenon_ids: [], supporting_phenomenon_ids: [] })
  ],
  phenomenon_catalog: [ph({ core_or_supporting_by_domain: { QUALITY: 'CORE', PRODUCTIVITY: 'SUPPORTING' } })]
}));
ok(tiene(soloInverso, 'CATALOGO_INCONSISTENTE_INVERSO'), 'phenomenon declara SUPPORTING para PRODUCTIVITY, que no lo lista → detectado solo por el chequeo inverso (ambig. N es bidireccional)');
ok(!tiene(soloInverso, 'CATALOGO_INCONSISTENTE_CORE') && !tiene(soloInverso, 'DOMINIO_APLICABLE_SIN_CORE'), '...y ningún otro chequeo lo atrapa (aislado)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§29 paso 3 — jerarquía de nodos (AC71, INV-48, ambigüedad M)');
// ═══════════════════════════════════════════════════════════════════════

var padreColgante = CFG.validarConfiguracion(input({ node_hierarchy: [ns({ node_id: 'n1', parent_node_id: 'n-FANTASMA' })] }));
ok(tiene(padreColgante, 'NODO_PADRE_COLGANTE'), 'parent_node_id inexistente → BLOCKING GLOBAL');

var ciclo = CFG.validarConfiguracion(input({
  node_hierarchy: [
    ns({ node_id: 'nA', parent_node_id: 'nB', aggregation_membership: 'set-a' }),
    ns({ node_id: 'nB', parent_node_id: 'nA', aggregation_membership: 'set-b' })
  ]
}));
ok(tiene(ciclo, 'JERARQUIA_CICLICA'), 'ciclo nA→nB→nA → BLOCKING GLOBAL (AC71)');
eq(ciclo.ok, false, '...bloquea la corrida');
// ciclo de 3
var ciclo3 = CFG.validarConfiguracion(input({
  node_hierarchy: [
    ns({ node_id: 'c1', parent_node_id: 'c2', aggregation_membership: 's1' }),
    ns({ node_id: 'c2', parent_node_id: 'c3', aggregation_membership: 's2' }),
    ns({ node_id: 'c3', parent_node_id: 'c1', aggregation_membership: 's3' })
  ]
}));
ok(tiene(ciclo3, 'JERARQUIA_CICLICA'), 'ciclo de 3 (c1→c2→c3→c1) → BLOCKING GLOBAL');

var fechasMal = CFG.validarConfiguracion(input({ node_hierarchy: [ns({ active_from: '2026-06-01', active_to: '2026-01-01' })] }));
ok(tiene(fechasMal, 'NODO_FECHAS_INVALIDAS'), 'active_from posterior a active_to → finding');
eq(findingDe(fechasMal, 'NODO_FECHAS_INVALIDAS').severity, 'DEGRADED', '...DEGRADED (no bloquea la corrida entera)');

// ambigüedad M — padre + hijo en el mismo NODE_SET
var contencion = CFG.validarConfiguracion(input({
  node_hierarchy: [
    ns({ node_id: 'n-root', aggregation_membership: 'set-org' }),
    ns({ node_id: 'n-hijo', parent_node_id: 'n-root', aggregation_membership: 'set-org' })
  ]
}));
ok(tiene(contencion, 'NODE_SET_CONTENCION'), 'padre y descendiente en el mismo aggregation_membership → BLOCKING GLOBAL (INV-48 / ambigüedad M)');
eq(contencion.ok, false, '...bloquea');

// ambigüedad M — padre e hijo en SETS DISTINTOS → NO se reporta (el motor no ve solapamiento entre sets)
var setsDistintos = CFG.validarConfiguracion(input({
  node_hierarchy: [
    ns({ node_id: 'n-root', aggregation_membership: 'set-A' }),
    ns({ node_id: 'n-hijo', parent_node_id: 'n-root', aggregation_membership: 'set-B' })
  ]
}));
ok(!tiene(setsDistintos, 'NODE_SET_CONTENCION'), 'padre e hijo en aggregation_membership distintos → NO se reporta (ambigüedad M: el motor solo verifica dentro de un set)');

// hermanos (ninguno ancestro del otro) en el mismo set → OK
var hermanos = CFG.validarConfiguracion(input({
  node_hierarchy: [
    ns({ node_id: 'n-root', aggregation_membership: 'set-padre' }),
    ns({ node_id: 'n-a', parent_node_id: 'n-root', aggregation_membership: 'set-hijos' }),
    ns({ node_id: 'n-b', parent_node_id: 'n-root', aggregation_membership: 'set-hijos' })
  ]
}));
ok(!tiene(hermanos, 'NODE_SET_CONTENCION'), 'dos hermanos en el mismo set → válido (ninguno es ancestro del otro)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§29 paso 4 — métricas y referencias (AC72, AC73, ambig. P/Q)');
// ═══════════════════════════════════════════════════════════════════════

// Q — metric_definition version no resuelve
var mdVer = CFG.validarConfiguracion(input({ kpi_specs: [ks({ definition_version: 'v99' })] }));
ok(tiene(mdVer, 'MD_VERSION_NO_RESUELVE'), 'kpi_spec.definition_version sin METRIC_DEFINITION correspondiente → finding (AC73 / ambig. Q)');
eq([findingDe(mdVer, 'MD_VERSION_NO_RESUELVE').severity, findingDe(mdVer, 'MD_VERSION_NO_RESUELVE').scope], ['BLOCKING', 'STATE'], '...BLOCKING + STATE (bloquea el estado, no la corrida)');
eq(mdVer.ok, true, '...la corrida SÍ procede (el estado afectado se bloquea aguas abajo)');
eq(mdVer.estados_bloqueados, ['k1'], '...k1 en estados_bloqueados');

// el caso puede traer md1@v1 y md1@v2 (§7) — el spec elige
var dosVersiones = CFG.validarConfiguracion(input({
  metric_definitions: [md({ definition_version: 'v1' }), md({ definition_version: 'v2' })],
  kpi_specs: [ks({ definition_version: 'v2' })]
}));
ok(!tiene(dosVersiones, 'MD_VERSION_NO_RESUELVE'), 'md1@v1 y md1@v2 en el caso, spec pide v2 → resuelve (ambig. Q)');

// P — referencia por rol
var refCond = CFG.validarConfiguracion(input({ references: [rs({ reference_id: 'rt1', reference_role: 'TEMPORAL' })] }));
ok(tiene(refCond, 'REF_COND_NO_RESUELVE'), 'condition_reference_id sin REFERENCE_SPEC con rol CONDITION → finding (AC72)');
eq([findingDe(refCond, 'REF_COND_NO_RESUELVE').severity, findingDe(refCond, 'REF_COND_NO_RESUELVE').scope], ['DEGRADED', 'KPI'], '...DEGRADED + KPI (→ pos=N_A en Fase 5, no aborta — ambig. P)');
eq(refCond.ok, true, '...la corrida procede');
eq(refCond.kpis_degradados, ['k1'], '...k1 en kpis_degradados');

// P — rol equivocado: condition_reference_id apunta a una referencia con rol TEMPORAL
var rolMal = CFG.validarConfiguracion(input({ references: [rs({ reference_id: 'rc1', reference_role: 'TEMPORAL' }), rs({ reference_id: 'rt1', reference_role: 'TEMPORAL' })] }));
ok(tiene(rolMal, 'REF_COND_NO_RESUELVE'), 'condition_reference_id → referencia con rol TEMPORAL → cuenta como no-resuelto (rol importa)');

// MD.phenomenon_id colgante
var mdFen = CFG.validarConfiguracion(input({ metric_definitions: [md({ phenomenon_id: 'ph-FANTASMA' })] }));
ok(tiene(mdFen, 'MD_FENOMENO_COLGANTE'), 'metric_definition.phenomenon_id fuera del catálogo → BLOCKING GLOBAL');

// observación con kpi_id colgante → DEGRADED KPI, no bloquea (§30)
var obsColg = CFG.validarConfiguracion(input({ observations: [obs(), obs({ observation_id: 'o2', kpi_id: 'k-FANTASMA' })] }));
ok(tiene(obsColg, 'OBS_KPI_COLGANTE'), 'observación con kpi_id sin spec → finding');
eq([findingDe(obsColg, 'OBS_KPI_COLGANTE').severity, findingDe(obsColg, 'OBS_KPI_COLGANTE').scope], ['DEGRADED', 'KPI'], '...DEGRADED + KPI (§30: error local no invalida evidencia independiente)');
eq(obsColg.ok, true, '...la corrida procede');

var obsMd = CFG.validarConfiguracion(input({ observations: [obs({ metric_definition_id: 'md-OTRO' })] }));
ok(tiene(obsMd, 'OBS_MD_DISTINTA_DEL_SPEC'), 'observación con metric_definition_id ≠ el del spec → finding');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. _cadenaAncestros: `if (vistos[...]) return null` → `return cadena` al');
console.log('     re-visitar → 3 rojos (ciclo de 2: JERARQUIA_CICLICA + "...bloquea";');
console.log('     ciclo de 3: JERARQUIA_CICLICA). La guarda a 10000 NO lo enmascara —');
console.log('     el visited-set dispara antes.');
console.log('  2. validarJerarquiaNodos: quitar NODE_SET_CONTENCION → 2 rojos');
console.log('     ("padre+hijo en el mismo set → BLOCKING" + "...bloquea") — INV-48.');
console.log('  3. validarCatalogos: quitar INV-31 (DOMINIO_APLICABLE_SIN_CORE) → 1 rojo.');
console.log('  4. validarCatalogos: quitar el bloque de consistencia INVERSA → 1 rojo');
console.log('     ("phenomenon SUPPORTING para PRODUCTIVITY que no lo lista", ambig. N bidir.).');
console.log('  5. _resolverMetricDefinition: ignorar definition_version → 1 rojo (ambig. Q).');
console.log('  6. _hayReferenciaConRol: ignorar el rol → 1 rojo (ambig. P — rol importa).');
console.log('  7. validarConfiguracion: `ok` = no hay NINGÚN BLOCKING (en vez de solo GLOBAL)');
console.log('     → 1 rojo ("MD version STATE: la corrida SÍ procede").');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
