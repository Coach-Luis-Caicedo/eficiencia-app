/**
 * motor-ifd/contratos.test.js — Fase 0
 * node motor-ifd/contratos.test.js
 */

'use strict';

var C = require('./contratos');
var E = require('./enums');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }

function epdInput(over) {
  return Object.assign({
    epd_id: 'EPD-1', engine_version: 'ifd-js-0.1',
    deterioration_sustained: true, evidence_present: true, mechanism_traceable: true,
    horizon_defined: true, assumptions_declared: true,
    Q: 3, C: 3, T: 3, R: 3,
    variable_type: 'V1', evolution_type: 'EV-A', series_sufficiency: 3,
    horizon: 6, hms: 12,
    economic_traceability: false, attribution_category: 'UNRESOLVED'
  }, over || {});
}

// ═══════════════════════════════════════════════════════════════════════
seccion('enums.js — vocabulario canónico');
// ═══════════════════════════════════════════════════════════════════════

eq(E.ENUMS.VARIABLE_TYPE, ['V1', 'V2', 'V3', 'V4', 'V5'], 'VARIABLE_TYPE (§14) — V1..V5');
eq(E.ENUMS.EVOLUTION_TYPE, ['EV-A', 'EV-M', 'EV-ACUM', 'EV-CUAL'], 'EVOLUTION_TYPE (§16) — 4 valores (EV-LIM eliminado: "limitada" = clamp §15, no un tipo)');
eq(E.ENUMS.ATTRIBUTION_CATEGORY, ['CONFIRMED', 'SUPPORTED', 'UNRESOLVED', 'N_A'], 'ATTRIBUTION_CATEGORY (§23.3) — 4 discretas, ningún coeficiente');
eq(E.ENUMS.OUTPUT_LEVEL, ['S0', 'S1', 'S2', 'S3'], 'OUTPUT_LEVEL (§8) — S0..S3');
eq(E.ENUMS.STATUS, ['NO_PROYECTABLE', 'CUALITATIVO', 'DEGRADADO_A_CUALITATIVO', 'CUANTIFICADO'], 'STATUS (engine) — 4 estados, no redundante con S0-S3');
eq(E.ENUMS.SCENARIO, ['CONTINUIDAD', 'INTENSIFICACION', 'CONTENCION'], 'SCENARIO (§21) — 3 escenarios');

// ═══════════════════════════════════════════════════════════════════════
seccion('Catálogo de alertas (§29) — 15 códigos, A08/A11 reservados y vacíos');
// ═══════════════════════════════════════════════════════════════════════

eq(Object.keys(E.ALERTAS).length, 15, '15 alertas codificadas (10 del engine + 5 nuevas A13-A17)');
eq(E.ALERTAS_RESERVADAS, ['A08', 'A11'], 'A08 y A11 quedan reservados y vacíos');
ok(!('A08' in E.ALERTAS) && !('A11' in E.ALERTAS), 'A08/A11 NO están en el catálogo (no se les asigna contenido)');
eq(E.ALERTAS.A01, 'ADMISIBILIDAD_INSUFICIENTE', 'A01 = §29 #1 (del engine)');
eq(E.ALERTAS.A12, 'INTERVENCION_SIN_EVIDENCIA', 'A12 = §29 #12 (del engine)');
eq(E.ALERTAS.A13, 'EXTRAPOLACION_NO_SUSTENTABLE', 'A13 = §29 #8 (NUEVO — no A08, coincidencia posicional NO usada)');
eq(E.ALERTAS.A14, 'DOBLE_CONTEO_POTENCIAL', 'A14 = §29 #11 (NUEVO — no A11)');
eq(E.ALERTAS.A17, 'AGREGACION_HETEROGENEA', 'A17 = §29 #15 (NUEVO)');
eq(E.ALERTAS.A09, 'VALOR_ECONOMICO_INSUFICIENTE', 'A09 = §29 #9 texto literal (renombrada Fase 5: cubre falta de trazabilidad O de unidad §23.1)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Parámetros calibrables (§17, §21.2, §22) — PENDIENTE_CALIBRACION, no cerrados');
// ═══════════════════════════════════════════════════════════════════════

eq(E.PARAMS.ENVELOPE_POR_FEP, { 2: 0.15, 3: 0.07 }, 'envelope §22: ±15% (FEP2) / ±7% (FEP3), valores del engine');
eq(E.PARAMS.ENVELOPE_ESTADO, 'PENDIENTE_CALIBRACION', 'envelope marcado PENDIENTE_CALIBRACION');
eq(E.PARAMS.INTENSIFICACION_PERCENTIL, 75, 'Q75 §21.2, convención pre-piloto');
eq(E.PARAMS.SERIE_MINIMA_CUANTITATIVA, 2, 'umbral de serie §17 = 2 (constante editable, no hardcodeada en la lógica)');
eq(E.PARAMS.VOLUME_CHANGE_MATERIAL_ESTADO, 'PENDIENTE_CALIBRACION', '§20.1: umbral de cambio de volumen — placeholder, el documento no da valor');
ok(C.validarEPDInput(epdInput({ volume_change_material: true })).valido, 'volume_change_material:true → válido (campo opcional, §20.1)');
ok(C.validarEPDInput(epdInput({ volume_change_material: null })).valido, 'volume_change_material:null → válido (nullable)');
ok(!C.validarEPDInput(epdInput({ volume_change_material: 'si' })).valido, 'volume_change_material:"si" → inválido (boolean o null, nunca cadena)');

// ── §21.2 — params de intensificación (reapertura de Fase 0, 4ª) ──
eq(E.PARAMS.INTENSIFICACION_MIN_PUNTOS, 4, '§21.2: mínimo de puntos de serie_historica para derivar por Q75 (documento no da número)');
eq(E.PARAMS.INTENSIFICACION_MIN_PUNTOS_ESTADO, 'PENDIENTE_CALIBRACION', 'INTENSIFICACION_MIN_PUNTOS marcado PENDIENTE_CALIBRACION');
eq(E.PARAMS.INTENSIFICACION_DISCREPANCIA_TOL, 0.05, '§21.2: tolerancia serie-vs-declarado (patrón §20.1)');
eq(E.PARAMS.INTENSIFICACION_DISCREPANCIA_TOL_ESTADO, 'PENDIENTE_CALIBRACION', 'INTENSIFICACION_DISCREPANCIA_TOL marcado PENDIENTE_CALIBRACION');

// ── §21.2 — serie_historica + growth_rate_intensificacion + delta_intensificacion ──
ok(C.validarEPDInput(epdInput({ serie_historica: [10, 15, 20, 25] })).valido, 'serie_historica: array de números → válido');
ok(C.validarEPDInput(epdInput({ serie_historica: null })).valido, 'serie_historica:null → válido (nullable, campo opcional)');
var rSerie = C.validarEPDInput(epdInput({ serie_historica: [10, 'x', 20] }));
ok(!rSerie.valido && rSerie.invalidos.some(function (m) { return m.indexOf('serie_historica') !== -1; }),
  'serie_historica con un elemento no numérico → inválido, nombrado en invalidos');
ok(!C.validarEPDInput(epdInput({ serie_historica: [10, Infinity, 20] })).valido, 'serie_historica con Infinity → inválido (debe ser finito)');
ok(C.validarEPDInput(epdInput({ growth_rate_intensificacion: 0.2 })).valido, 'growth_rate_intensificacion: número → válido');
ok(C.validarEPDInput(epdInput({ delta_intensificacion: null })).valido, 'delta_intensificacion:null → válido (nullable)');
ok(!C.validarEPDInput(epdInput({ growth_rate_intensificacion: 'alto' })).valido, 'growth_rate_intensificacion:"alto" → inválido (número o null)');

// ── §23.1 — campo `unit` (unidad física, reapertura de Fase 0, 4ª) ──
ok(C.validarEPDInput(epdInput({ unit: 'horas' })).valido, 'unit:"horas" → válido (string)');
ok(C.validarEPDInput(epdInput({ unit: null })).valido, 'unit:null → válido (nullable — un EPD no-económico no lo trae)');
ok(C.validarEPDInput(epdInput()).valido, 'unit ausente → válido (opcional, la puerta §23.1 vive en economia.js)');
ok(!C.validarEPDInput(epdInput({ unit: 3 })).valido, 'unit:3 (número) → inválido (es un rótulo string: "horas", "eventos")');

// ═══════════════════════════════════════════════════════════════════════
seccion('§5/§31 — validarEPDInput');
// ═══════════════════════════════════════════════════════════════════════

ok(C.validarEPDInput(epdInput()).valido, 'EPD_INPUT completo y correcto → válido');

var rFalta = C.validarEPDInput(epdInput({ Q: undefined }));
ok(!rFalta.valido && rFalta.faltantes.indexOf('Q') !== -1, 'sin Q → inválido, Q en faltantes');

var rVar = C.validarEPDInput(epdInput({ variable_type: 'V9' }));
ok(!rVar.valido && rVar.invalidos.some(function (m) { return m.indexOf('V9') !== -1; }), 'variable_type fuera de V1..V5 → inválido');

var rQrango = C.validarEPDInput(epdInput({ C: 4 }));
ok(!rQrango.valido && rQrango.invalidos.some(function (m) { return m.indexOf('C') !== -1; }), 'C=4 (fuera de 0-3) → inválido');
var rQfloat = C.validarEPDInput(epdInput({ T: 2.5 }));
ok(!rQfloat.valido, 'T=2.5 (no entero) → inválido');

ok(C.validarEPDInput(epdInput({ hms: null })).valido, 'hms=null (no declarado, §26) → válido (nullable)');
ok(C.validarEPDInput(epdInput({ baseline: null, unit_value: null })).valido, 'campos de proyección/economía null → válidos (nullable §26)');

// ── evolution_type: IGUALDAD ESTRICTA, no coincidencia parcial ──
var rEvMX = C.validarEPDInput(epdInput({ evolution_type: 'EV-MX' }));
ok(!rEvMX.valido && rEvMX.invalidos.some(function (m) { return m.indexOf('EV-MX') !== -1; }),
  '§ambigüedad 2: "EV-MX" → RECHAZADO por igualdad estricta, NO aceptado como match parcial de "EV-M"');
var rEvMAL = C.validarEPDInput(epdInput({ evolution_type: 'EV-MAL' }));
ok(!rEvMAL.valido, '"EV-MAL" → rechazado (el engine Python lo aceptaría por `"EV-M" in ...`; este motor no)');

// ── series_sufficiency numérico 0-3 ──
var rSS = C.validarEPDInput(epdInput({ series_sufficiency: 'SS2' }));
ok(!rSS.valido && rSS.invalidos.some(function (m) { return m.indexOf('series_sufficiency') !== -1; }),
  'series_sufficiency="SS2" (cadena) → inválido — es número 0-3 para contrastar con el engine');
ok(C.validarEPDInput(epdInput({ series_sufficiency: 1 })).valido, 'series_sufficiency=1 → válido');

// ═══════════════════════════════════════════════════════════════════════
seccion('§23.3/§28/§35 — validarAtribucionCategoria: NUNCA coeficiente continuo');
// ═══════════════════════════════════════════════════════════════════════

['CONFIRMED', 'SUPPORTED', 'UNRESOLVED', 'N_A'].forEach(function (c) {
  ok(C.validarAtribucionCategoria(c).valido, c + ' → válido');
});
ok(!C.validarAtribucionCategoria('0.70').valido, '"0.70" (cadena numérica) → RECHAZADO (§35: atribución continua se rechaza)');
ok(!C.validarAtribucionCategoria(0.70).valido, '0.70 (número) → RECHAZADO');
ok(!C.validarAtribucionCategoria(1).valido, '1 (número) → RECHAZADO');
ok(!C.validarAtribucionCategoria(0).valido, '0 → RECHAZADO (0 no es una categoría, aunque sea "ausencia" en §26)');
ok(!C.validarAtribucionCategoria('').valido, 'cadena vacía → RECHAZADO');
ok(!C.validarAtribucionCategoria(undefined).valido, 'undefined → RECHAZADO');
ok(!C.validarAtribucionCategoria('confirmed').valido, '"confirmed" (minúscula) → RECHAZADO (igualdad estricta)');
ok(C.validarAtribucionCategoria('0.70').motivo.indexOf('coeficiente continuo') !== -1, 'el motivo nombra el defecto: "NUNCA es un coeficiente continuo"');

// El contrato de EPD_INPUT también lo rechaza en el campo:
var rAtr = C.validarEPDInput(epdInput({ attribution_category: '0.70' }));
ok(!rAtr.valido && rAtr.invalidos.some(function (m) { return m.indexOf('attribution_category') !== -1; }),
  'EPD_INPUT con attribution_category="0.70" → inválido en el campo');

// ═══════════════════════════════════════════════════════════════════════
seccion('§26 — clasificarValorNulo: 0 ≠ NULL ≠ NA');
// ═══════════════════════════════════════════════════════════════════════

eq(C.clasificarValorNulo(0), 'CERO_AUSENCIA_DEMOSTRADA', '0 → ausencia DEMOSTRADA (valor legítimo, no vacío)');
eq(C.clasificarValorNulo(null), 'NULL_NO_DETERMINADO', 'null → no determinado');
eq(C.clasificarValorNulo('NA'), 'NA_NO_APLICABLE', "'NA' → no aplicable");
eq(C.clasificarValorNulo(42.5), 'VALOR', 'número finito → VALOR');
eq(C.clasificarValorNulo(undefined), 'INVALIDO', 'undefined → INVALIDO (no es ninguna de las 3 categorías de §26)');
eq(C.clasificarValorNulo(NaN), 'INVALIDO', 'NaN → INVALIDO');
ok(C.clasificarValorNulo(0) !== C.clasificarValorNulo(null), '§26 literal: "NO DETERMINADO ≠ AUSENCIA DE IMPACTO"');

// ═══════════════════════════════════════════════════════════════════════
seccion('§31/§24 — validarEPDOutput: alertas conocidas, A08/A11 nunca emitidas');
// ═══════════════════════════════════════════════════════════════════════

function epdOutput(over) {
  return Object.assign({
    epd_id: 'EPD-1', engine_version: 'ifd-js-0.1', admissible: true, FEP: 3,
    output_level: 'S3', status: 'CUANTIFICADO',
    projection_base: 3024, projection_lower: 2812, projection_upper: 3235,
    economic_base: 54432, economic_lower: 50623, economic_upper: 58241,
    attribution_category: 'CONFIRMED', method: 'V1_RATE',
    heritage_outputs: { CFD: { estado: 'PENDIENTE_AUDITORIA' }, CFR: { estado: 'PENDIENTE_AUDITORIA' }, VER: { estado: 'PENDIENTE_AUDITORIA' }, ROI_P: { estado: 'PENDIENTE_AUDITORIA' }, TRE: { estado: 'PENDIENTE_AUDITORIA' } },
    alerts: [], notes: []
  }, over || {});
}
ok(C.validarEPDOutput(epdOutput()).valido, 'EPD_OUTPUT completo → válido  [' + C.validarEPDOutput(epdOutput()).invalidos.join('; ') + ']');
ok(C.validarEPDOutput(epdOutput({ alerts: [{ code: 'A05' }] })).valido, 'alerta A05 (conocida) → válida');
ok(!C.validarEPDOutput(epdOutput({ alerts: [{ code: 'A08' }] })).valido, 'alerta A08 (reservada y vacía) → RECHAZADA');
ok(!C.validarEPDOutput(epdOutput({ alerts: [{ code: 'A11' }] })).valido, 'alerta A11 (reservada y vacía) → RECHAZADA');
ok(!C.validarEPDOutput(epdOutput({ alerts: [{ code: 'A99' }] })).valido, 'alerta A99 (desconocida) → RECHAZADA');
ok(!C.validarEPDOutput(epdOutput({ output_level: 'S4' })).valido, 'output_level S4 (fuera de S0-S3) → inválido');

// ── §24 — forma congelada de heritage_outputs (reapertura de Fase 0, 5ª) ──
eq(C.SALIDAS_HEREDADAS, ['CFD', 'CFR', 'VER', 'ROI_P', 'TRE'], 'las 5 salidas heredadas de §24');
ok(C.validarSalidasHeredadas({ CFD: { estado: 'PENDIENTE_AUDITORIA' }, CFR: { estado: 'PENDIENTE_AUDITORIA' }, VER: { estado: 'PENDIENTE_AUDITORIA' }, ROI_P: { estado: 'PENDIENTE_AUDITORIA' }, TRE: { estado: 'PENDIENTE_AUDITORIA' } }).valido,
  'las 5 con el marcador correcto → válido');
ok(!C.validarSalidasHeredadas({ CFD: { estado: 'PENDIENTE_AUDITORIA' }, CFR: { estado: 'PENDIENTE_AUDITORIA' }, VER: 21772.8, ROI_P: { estado: 'PENDIENTE_AUDITORIA' }, TRE: { estado: 'PENDIENTE_AUDITORIA' } }).valido,
  'VER = 21772.8 (un número) → RECHAZADO — §24 no fija fórmula, nunca es una cifra');
ok(!C.validarEPDOutput(epdOutput({ heritage_outputs: { CFD: { estado: 'PENDIENTE_AUDITORIA' }, CFR: { estado: 'PENDIENTE_AUDITORIA' }, VER: 21772.8, ROI_P: { estado: 'PENDIENTE_AUDITORIA' }, TRE: { estado: 'PENDIENTE_AUDITORIA' } } })).valido,
  'validarEPDOutput también rechaza VER numérico (la forma se hace cumplir en el output)');
ok(!C.validarSalidasHeredadas({ CFD: { estado: 'PENDIENTE_AUDITORIA' }, CFR: { estado: 'PENDIENTE_AUDITORIA' }, VER: { estado: 'PENDIENTE_AUDITORIA' }, ROI_P: { estado: 'PENDIENTE_AUDITORIA' } }).valido,
  'falta TRE → RECHAZADO (deben estar las 5)');
ok(!C.validarSalidasHeredadas({ CFD: { estado: 'PENDIENTE_AUDITORIA' }, CFR: { estado: 'PENDIENTE_AUDITORIA' }, VER: { estado: 'PENDIENTE_AUDITORIA' }, ROI_P: { estado: 'PENDIENTE_AUDITORIA' }, TRE: { estado: 'PENDIENTE_AUDITORIA' }, EXTRA: { estado: 'PENDIENTE_AUDITORIA' } }).valido,
  'clave EXTRA → RECHAZADO (ni más ni menos que 5)');
ok(!C.validarSalidasHeredadas({ CFD: { estado: 'AUDITADO' }, CFR: { estado: 'PENDIENTE_AUDITORIA' }, VER: { estado: 'PENDIENTE_AUDITORIA' }, ROI_P: { estado: 'PENDIENTE_AUDITORIA' }, TRE: { estado: 'PENDIENTE_AUDITORIA' } }).valido,
  'estado distinto de PENDIENTE_AUDITORIA → RECHAZADO');
ok(!C.validarSalidasHeredadas({ CFD: { estado: 'PENDIENTE_AUDITORIA', valor: 100 }, CFR: { estado: 'PENDIENTE_AUDITORIA' }, VER: { estado: 'PENDIENTE_AUDITORIA' }, ROI_P: { estado: 'PENDIENTE_AUDITORIA' }, TRE: { estado: 'PENDIENTE_AUDITORIA' } }).valido,
  'marcador con clave extra ({estado, valor}) → RECHAZADO (marcador EXACTO, no un contenedor de cifra)');

// ── §31 — double_count_ids en EPD_OUTPUT (reapertura de Fase 0, 6ª) ──
ok(C.validarEPDOutput(epdOutput({ double_count_ids: [{ event_id: 'E1', resource_id: 'R1', cost_component_id: 'CC1', period_id: 'P1' }] })).valido,
  'double_count_ids: array en EPD_OUTPUT → válido (§31; la agregación §25 lo necesita)');
ok(C.validarEPDOutput(epdOutput()).valido, 'double_count_ids ausente en EPD_OUTPUT → válido (opcional)');
ok(!C.validarEPDOutput(epdOutput({ double_count_ids: 'E1|R1|CC1|P1' })).valido, 'double_count_ids cadena → inválido (es array)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutación — validarAtribucionCategoria (§35: coeficiente continuo se rechaza)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  ejecutada como paso de Bash aparte: si validarAtribucionCategoria acepta un número 0-1 como');
console.log('  "categoría", el assert "0.70 (número) → RECHAZADO" y el de EPD_INPUT pasan a fallar');
console.log('  específicamente — mismo invariante que Luis verificó por mutación en el engine Python.');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
