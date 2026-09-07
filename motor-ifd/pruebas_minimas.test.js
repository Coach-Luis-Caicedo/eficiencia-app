/**
 * motor-ifd/pruebas_minimas.test.js — Fase 7c
 * node motor-ifd/pruebas_minimas.test.js
 *
 * §35 — las 17 pruebas mínimas de implementación, corridas END-TO-END por
 * runEPD / agregarEPDs (no por las funciones sueltas de cada fase — la
 * mayoría ya están cubiertas ahí; §35 pide que el motor completo las
 * respete). Son 17, no 18 (conteo corregido — el "18" venía arrastrado por
 * error desde Fase 1).
 */

'use strict';

var R = require('./runIFD');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }

function inp(o) {
  return Object.assign({
    epd_id: 'EPD-1', engine_version: 'ifd-js-0.1',
    deterioration_sustained: true, evidence_present: true, mechanism_traceable: true,
    horizon_defined: true, assumptions_declared: true,
    Q: 3, C: 3, T: 3, R: 3, variable_type: 'V3', evolution_type: 'EV-A',
    series_sufficiency: 3, horizon: 6, hms: 12,
    economic_traceability: false, attribution_category: 'CONFIRMED'
  }, o || {});
}
function econ(o) {
  return inp(Object.assign({ baseline: 3000, delta: 400, lower_bound: 0, unit: 'horas', unit_value: 25, economic_traceability: true }, o || {}));
}

// ═══════════════════════════════════════════════════════════════════════
seccion('§35 — 17 pruebas mínimas, end-to-end por runEPD / agregarEPDs');
// ═══════════════════════════════════════════════════════════════════════

// 1 — Falta deterioro sustentado → no proyectable
var p1 = R.runEPD(inp({ deterioration_sustained: false })).output;
ok(p1.output_level === 'S0' && p1.status === 'NO_PROYECTABLE' && p1.alerts.indexOf('A01') !== -1,
  '1. falta deterioro sustentado → S0/NO_PROYECTABLE + A01');

// 2 — R=0 → no proyectable aunque la serie sea estadísticamente fuerte
var p2 = R.runEPD(inp({ R: 0, series_sufficiency: 3 })).output;
ok(p2.output_level === 'S0' && p2.alerts.indexOf('A03') !== -1,
  '2. R=0 con serie SS3 → S0 + A03 (la fuerza estadística de la serie no compensa)');

// 3 — Una dimensión crítica en nivel 1 limita la salida
var p3 = R.runEPD(inp({ Q: 1 })).output;
ok(p3.output_level === 'S1' && p3.status === 'CUALITATIVO',
  '3. Q=1 (effective_FEP=1) → S1/CUALITATIVO (la salida queda limitada)');

// 4 — Proporción fuera de dominio → control obligatorio
var p4 = R.runEPD(inp({ variable_type: 'V2', evolution_type: 'EV-A', trend_a: 0.8, trend_b: 0.1, horizon: 6, lower_bound: 0, upper_bound: 1 })).output;
ok(p4.alerts.indexOf('A06') !== -1 && p4.projection_base === 1,
  '4. V2 proyecta 0.8 + 0.1×6 = 1.4, dominio [0,1] → A06 + recorte a 1 (control obligatorio)');

// 5 — H>HMS → degradación o abstención
var p5 = R.runEPD(inp({ horizon: 20, hms: 12, trend_a: 3000, trend_b: 400 })).output;
ok(p5.alerts.indexOf('A07') !== -1 && p5.output_level === 'S2',
  '5. H=20 > HMS=12 → A07 + degradación effective_FEP 3→2 → S2 (no S3)');

// 6 — Serie insuficiente → impedir método temporal no admisible
var p6 = R.runEPD(inp({ variable_type: 'V2', series_sufficiency: 1, trend_a: 100, trend_b: 5 })).output;
ok(p6.status === 'DEGRADADO_A_CUALITATIVO' && p6.alerts.indexOf('A04') !== -1 && p6.projection_base === null,
  '6. V2 con SS1 + params de tendencia → A04, S1/DEGRADADO, NO se proyecta (método temporal no admisible)');

// 7 — Variable latente sin indicador → impedir porcentaje
var p7 = R.runEPD(inp({ variable_type: 'V5' })).output;
ok(p7.output_level === 'S1' && p7.status === 'CUALITATIVO' && p7.projection_base === null && p7.economic_base === null,
  '7. V5 → S1/CUALITATIVO, sin cifra ni porcentaje fabricado');

// 8 — Cantidad sin valor unitario → no monetizar
var p8 = R.runEPD(inp({ baseline: 3000, delta: 400, lower_bound: 0 })).output; // proyecta, sin unit_value
ok(p8.status === 'CUANTIFICADO' && p8.projection_base === 5400 && p8.economic_base === null && p8.alerts.length === 0,
  '8. proyección OK, sin valor unitario → economic_base null, sin alerta (§35: "no monetizar", sin más)');

// 9 — Atribución UNRESOLVED → conservar valoración, impedir presentarla como costo atribuible demostrado
var p9 = R.runEPD(econ({ attribution_category: 'UNRESOLVED' })).output;
ok(p9.economic_base === 135000 && p9.alerts.indexOf('A10') !== -1,
  '9. UNRESOLVED → economic_base = 135.000 (se conserva) + A10 (restringe la afirmación, no la cifra)');

// 10 — Doble conteo → impedir suma automática
var kk = { event_id: 'E', resource_id: 'R', cost_component_id: 'CC', period_id: 'P' };
var e10a = R.runEPD(econ({ epd_id: 'a', impact_type: 'IOF', double_count_ids: [kk] })).output;
var e10b = R.runEPD(econ({ epd_id: 'b', impact_type: 'IOF', double_count_ids: [kk] })).output;
var agg10 = R.agregarEPDs([e10a, e10b]);
ok(agg10.alerts.indexOf('A14') !== -1 && agg10.aggregation_blocked === true && agg10.economic_total === null,
  '10. dos EPD con la misma clave de solapamiento → A14, suma automática bloqueada, economic_total null');

// 11 — Intervención sin evidencia → impedir salida económica de recuperación que dependa de contención
var p11 = R.runEPD(econ({ containment_factor: 0.30, containment_evidence_level: 1, intervention_cost: 50000 })).output;
var conten11 = p11.scenarios.filter(function (s) { return s.escenario === 'CONTENCION'; })[0];
ok(conten11.cualitativo === true && p11.alerts.indexOf('A12') !== -1 &&
   p11.heritage_outputs.VER.estado === 'PENDIENTE_AUDITORIA' && p11.heritage_outputs.ROI_P.estado === 'PENDIENTE_AUDITORIA',
  '11. contención con evidencia nivel 1 → A12, escenario cualitativo, ver/roi NUNCA se producen (marcador §24)');

// 12 — CFD/CFR/VER/ROI_P/TRE → no validar fórmula normativa
var p12 = R.runEPD(econ()).output;
ok(['CFD', 'CFR', 'VER', 'ROI_P', 'TRE'].every(function (k) {
  return p12.heritage_outputs[k] && p12.heritage_outputs[k].estado === 'PENDIENTE_AUDITORIA' && Object.keys(p12.heritage_outputs[k]).length === 1;
}), '12. las 5 salidas heredadas → { estado: "PENDIENTE_AUDITORIA" }, nunca una fórmula/cifra');

// 13 — Flujos no temporalizables → impedir métrica temporal de recuperación; TRE pendiente de auditoría
// (No hay campo de "temporalizabilidad" en EPD_INPUT — la garantía es que TRE
//  es un marcador congelado y el motor no produce ninguna métrica temporal
//  de recuperación en ningún camino.)
var p13 = R.runEPD(econ({ containment_factor: 0.30, containment_evidence_level: 3, intervention_cost: 50000 })).output;
ok(p13.heritage_outputs.TRE.estado === 'PENDIENTE_AUDITORIA' &&
   !/tiempo_recuperacion|payback|meses_retorno|recovery_time/i.test(JSON.stringify(Object.keys(p13))),
  '13. TRE = marcador; ni con contención de evidencia máxima se produce una métrica temporal de recuperación');

// 14 — Relevancia estratégica → no score competitivo
var p14 = R.runEPD(inp({ impact_type: 'IEP', baseline: 3000, delta: 400, lower_bound: 0 })).output;
ok(!/score|ranking|competit|ventaja|posicion_mercado/i.test(JSON.stringify(Object.keys(p14))) &&
   ['S0', 'S1', 'S2', 'S3'].indexOf(p14.output_level) !== -1,
  '14. impact_type IEP → sin campo de score/ranking competitivo; el nivel sigue acotado por evidencia');

// 15 — Misma entrada + misma versión → misma salida
var d1 = R.runEPD(econ());
var d2 = R.runEPD(econ());
ok(JSON.stringify(d1) === JSON.stringify(d2), '15. dos ejecuciones de la misma entrada → salida idéntica (deep-equal)');

// 16 — Misma consecuencia + VU + trazabilidad + distinta attribution_category → misma valoración
var v16 = ['CONFIRMED', 'SUPPORTED', 'UNRESOLVED', 'N_A'].map(function (cat) {
  return R.runEPD(econ({ attribution_category: cat })).output.economic_base;
});
ok(v16.every(function (x) { return x === 135000; }),
  '16. las 4 categorías de atribución → economic_base = 135.000 idéntico (§34: la categoría no pondera)');

// 17 — Entrada de atribución continua (0.70) → rechazar
var r17 = R.runEPD(inp({ attribution_category: 0.7 }));
ok(r17.ok === false && r17.output === undefined && r17.errors.some(function (e) { return e.indexOf('attribution_category') !== -1; }),
  '17. attribution_category = 0.70 → { ok:false }, sin EPD_OUTPUT');

// ── conteo ──
console.log('\n  17 pruebas de §35, todas end-to-end por el orquestador. (Las de #4/#6/#7');
console.log('  ya tenían cobertura en las baterías de fase; aquí se confirman a través de runEPD.)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutación — ejecutada como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  runEPD: `alerts.concat(eco.alerts)` → `alerts.concat([])` (no propagar las alertas');
console.log('  del módulo económico) → §35.9 falla por su nombre: UNRESOLVED conserva la cifra');
console.log('  (135.000) pero se pierde A10, así que la salida ya no "impide presentarla como costo');
console.log('  atribuible demostrado". 1 rojo.');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
