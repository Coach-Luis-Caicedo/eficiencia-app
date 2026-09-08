/**
 * motor-piio/temporal.test.js — Fase 4
 * node motor-piio/temporal.test.js
 *
 * §11.2 / §11.3 / §12 / §13. Oráculo conductual: AC17/18 (freshness),
 * AC19 (gap > MAX_CONTINUITY_GAP → nuevo run), AC56/57 (shock: marcar, no
 * excluir), AC58/59 (patrón/estabilidad), AC60 (evento raro).
 * INV-07/25/26/57/58/59/61/62.
 */

'use strict';

var T = require('./temporal');
var E = require('./enums');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }
function near(a, b, m) { var c = typeof a === 'number' && Math.abs(a - b) < 1e-9; ok(c, m + (c ? '' : '  [recibido=' + a + ' esperado=' + b + ']')); }
function lanza(fn, m) { var l = false; try { fn(); } catch (e) { l = true; } ok(l, m); }
function tieneFlag(res, f) { return (res.flags || []).some(function (x) { return x === f || x.indexOf(f + ':') === 0; }); }

// ═══════════════════════════════════════════════════════════════════════
seccion('helpers de período');
// ═══════════════════════════════════════════════════════════════════════

eq(T.edadEnPeriodos('2026-01', '2026-08'), 7, "'YYYY-MM' → meses");
eq(T.edadEnPeriodos('2026-12', '2027-03'), 3, 'cruza el año');
eq(T.edadEnPeriodos('2026-01-01', '2026-01-11'), 10, 'ISO completo → días');
eq(T.edadEnPeriodos('2026-01', 'basura'), null, 'no parseable → null');

// ═══════════════════════════════════════════════════════════════════════
seccion('§13 — freshness (AC17/18, INV-61/62)');
// ═══════════════════════════════════════════════════════════════════════

eq(T.freshness(2, { max_age_current: 3, max_age_aging: 6 }), 'CURRENT', 'edad 2 ≤ current 3 → CURRENT (AC17)');
eq(T.freshness(5, { max_age_current: 3, max_age_aging: 6 }), 'AGING', 'edad 5 en (3,6] → AGING');
eq(T.freshness(9, { max_age_current: 3, max_age_aging: 6 }), 'STALE', 'edad 9 > aging 6 → STALE (AC18)');
eq(T.freshness(9, { max_age_current: 3 }), 'STALE', 'sin max_age_aging → CURRENT o STALE, sin banda AGING');
eq(T.freshness(2, {}), 'N_A', 'freshness_spec vacío + PARAMS null → N_A (§13: no se puede determinar, ambig. C)');
eq(T.freshness(-1, { max_age_current: 3 }), 'N_A', 'edad negativa → N_A');
eq(T.freshness('x', { max_age_current: 3 }), 'N_A', 'edad no numérica → N_A');
// INV-62: freshness NUNCA devuelve INVALID
ok(['CURRENT', 'AGING', 'STALE', 'N_A'].indexOf(T.freshness(100, { max_age_current: 1 })) !== -1, 'freshness ∈ FRESHNESS_STATUS — nunca INVALID (INV-62)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§11.3 — continuidadRun (AC19, INV-25)');
// ═══════════════════════════════════════════════════════════════════════

var r1 = T.continuidadRun(['D', 'D', 'D'], ['2026-01', '2026-02', '2026-03']);
eq(r1.det_run, 3, 'D,D,D consecutivos → det_run = 3');
eq(r1.det_duration, 2, 'det_duration = span calendario 2026-01→2026-03 = 2 (ambig. H)');
eq(r1.runs.length, 1, 'un solo run');

var r2 = T.continuidadRun(['D', 'F', 'D'], ['2026-01', '2026-02', '2026-03']);
eq(r2.det_run, 1, 'D,F,D → F cierra el 1er run; det_run del actual = 1');
eq(r2.runs.length, 2, 'dos runs (F = recuperación real)');

var r3 = T.continuidadRun(['D', 'N_A', 'D'], ['2026-01', '2026-02', '2026-03']);
eq(r3.det_run, 2, 'D,N_A,D → N_A transparente, el run continúa; det_run = 2 (INV-25)');
eq(r3.runs.length, 1, 'un solo run (N_A no lo cierra)');

var r4 = T.continuidadRun(['D', 'I'], ['2026-01', '2026-02']);
eq(r4.det_run, 0, 'último pos = I → det_run del actual = 0');
eq(r4.det_duration, 0, '...det_duration = 0');

// gap grande, MAX_CONTINUITY_GAP null → se puentea + flag
var r5 = T.continuidadRun(['D', 'D'], ['2026-01', '2026-09']);
eq(r5.det_run, 2, 'D en 2026-01 y 2026-09, gap 8, MAX_CONTINUITY_GAP null → se puentea (INV-25: ausencia ≠ recuperación)');
ok(tieneFlag(r5, 'GAP_PUENTEADO_SIN_CALIBRAR'), '...flag GAP_PUENTEADO_SIN_CALIBRAR');

// AC19 — con maxGap fijado (override), gap > maxGap → un nuevo D inicia un run nuevo
var r6 = T.continuidadRun(['D', 'D'], ['2026-01', '2026-09'], { maxGap: 3 });
eq(r6.runs.length, 2, 'gap 8 > maxGap 3 → el 2º D inicia un run NUEVO (AC19)');
eq(r6.det_run, 1, '...det_run del run actual (el nuevo) = 1');
var r7 = T.continuidadRun(['D', 'D'], ['2026-01', '2026-03'], { maxGap: 3 });
eq(r7.runs.length, 1, 'gap 2 ≤ maxGap 3 → el run continúa (det_run = 2)');
eq(r7.det_run, 2, '...det_run = 2');

lanza(function () { T.continuidadRun(['D'], ['2026-01', '2026-02']); }, 'longitudes distintas → lanza');
lanza(function () { T.continuidadRun(['X'], ['2026-01']); }, 'posición fuera de F|I|D|N_A → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('§12 — estabilidad (Grupo 1: cortes de CV null → INSUFFICIENT)');
// ═══════════════════════════════════════════════════════════════════════

eq(T.estabilidadSerie([5]).valor, 'INSUFFICIENT', 'serie de 1 punto → INSUFFICIENT');
ok(tieneFlag(T.estabilidadSerie([5]), 'SERIE_MUY_CORTA'), '...flag SERIE_MUY_CORTA');
var est = T.estabilidadSerie([10, 11, 9, 10, 12]);
eq(est.valor, 'INSUFFICIENT', 'serie válida pero STABILITY_CV_* null → INSUFFICIENT (Grupo 1, ambig. AA)');
ok(tieneFlag(est, 'STABILITY_NO_CALIBRADA'), '...flag STABILITY_NO_CALIBRADA (no se inventa una lectura, §30)');
ok(['STABLE', 'MODERATELY_VARIABLE', 'HIGHLY_VARIABLE', 'INSUFFICIENT'].indexOf(est.valor) !== -1, 'estabilidad ∈ SERIES_STABILITY');

// ═══════════════════════════════════════════════════════════════════════
seccion('§12 — patrón temporal (INV-57/58)');
// ═══════════════════════════════════════════════════════════════════════

var pat = T.patronTemporal([1, 2, 3, 4, 5, 6], ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']);
eq(pat.valor, 'INSUFFICIENT', 'PATTERN_* null → INSUFFICIENT (Grupo 1, ambig. AB)');
ok(tieneFlag(pat, 'PATTERN_NO_CALIBRADO'), '...flag PATTERN_NO_CALIBRADO');
ok(E.ENUMS.TEMPORAL_PATTERN.indexOf(pat.valor) !== -1, 'patrón ∈ TEMPORAL_PATTERN — nunca "VOLATILE" ni nada de shock/régimen (INV-57)');
eq(T.patronTemporal(['a', 'b'], []).valor, 'INSUFFICIENT', 'serie no numérica → INSUFFICIENT');

// ═══════════════════════════════════════════════════════════════════════
seccion('§12 — régimen (ambig. AF: DERIVACIÓN de Fase 3, no decisión nueva)');
// ═══════════════════════════════════════════════════════════════════════

eq(T.regimen({}), 'CONTINUOUS', 'sin directivas → CONTINUOUS');
eq(T.regimen({ cambioReferencia: { tipo: 'REBASE_HISTORY' } }), 'CONTINUOUS', 'REBASE_HISTORY → CONTINUOUS (la historia se re-versiona, no es régimen nuevo)');
eq(T.regimen({ cambioReferencia: { tipo: 'START_NEW_REGIME' } }), 'NEW_REGIME', 'START_NEW_REGIME (Fase 3) → NEW_REGIME');
eq(T.regimen({ continuidad: { modo: 'NEW_SERIES' } }), 'NEW_REGIME', 'continuidadDefinicion=NEW_SERIES (Fase 3) → NEW_REGIME');
eq(T.regimen({ continuidad: { modo: 'CONTINUOUS' } }), 'CONTINUOUS', 'continuidad CONTINUOUS → CONTINUOUS');

// ═══════════════════════════════════════════════════════════════════════
seccion('§12 — shock (ambig. AE: utilidad pura; AC56/57, INV-59)');
// ═══════════════════════════════════════════════════════════════════════

eq(T.registrarShock({ status: 'CONFIRMED_EXTERNAL', treatment: 'INCLUDE' }), { shock_status: 'CONFIRMED_EXTERNAL', shock_treatment: 'INCLUDE', flags: [] }, 'shock externo confirmado + INCLUDE → se registra tal cual (AC56)');
eq(T.registrarShock({ status: 'CONFIRMED_INTERNAL', treatment: 'MODEL_SEPARATELY' }).shock_status, 'CONFIRMED_INTERNAL', 'shock interno confirmado se registra (AC57: no se excluye automáticamente)');
var excl = T.registrarShock({ status: 'CONFIRMED_EXTERNAL', treatment: 'EXCLUDE_FROM_STRUCTURAL_CALIBRATION' });
eq(excl.shock_treatment, 'EXCLUDE_FROM_STRUCTURAL_CALIBRATION', 'EXCLUDE se registra...');
ok(tieneFlag(excl, 'EXCLUSION_DIFERIDA'), '...pero con flag EXCLUSION_DIFERIDA (no hay calibración en motor-piio; el shock NO se elimina, INV-59)');
var mala = T.registrarShock({ status: 'HURACAN', treatment: 'INCLUDE' });
eq([mala.shock_status, mala.shock_treatment], ['NONE', 'INCLUDE'], 'declaración inválida → NONE/INCLUDE (no se inventa)');
ok(tieneFlag(mala, 'DECLARACION_SHOCK_INVALIDA'), '...flag DECLARACION_SHOCK_INVALIDA');

// ═══════════════════════════════════════════════════════════════════════
seccion('§11.2 — magnitudCambio (primitiva) + historiaSuficiente');
// ═══════════════════════════════════════════════════════════════════════

eq(T.magnitudCambio([10, 13]), 3, 'DELTA (default): último − anterior = 13 − 10 = 3');
eq(T.magnitudCambio([10, 13, 12]), -1, 'DELTA: 12 − 13 = −1 (ventana 1)');
near(T.magnitudCambio([0, 1, 2, 3], 'SLOPE'), 1, 'SLOPE: pendiente de 0,1,2,3 = 1');
eq(T.magnitudCambio([1, 1, 5, 5], 'ROLLING_COMPARE', { k: 2 }), 4, 'ROLLING_COMPARE k=2: media(5,5) − media(1,1) = 4');
eq(T.magnitudCambio([5]), null, 'serie de 1 punto → null');
eq(T.magnitudCambio([1, 2], 'OTHER_VALIDATED'), null, 'OTHER_VALIDATED → null (lo aporta el llamante)');
eq(T.magnitudCambio([1, 2, 3], 'INVENTADO'), 1, 'método no reconocido → cae al default DELTA');

eq(T.historiaSuficiente([1, 2]), true, 'MIN_HISTORIA_TRAJ null → mínimo absoluto 2, [1,2] suficiente');
eq(T.historiaSuficiente([1]), false, '[1] → insuficiente → traj = N_A en Fase 5 (INV-26)');
eq(T.historiaSuficiente([]), false, '[] → insuficiente');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. freshness: `if (!esNum(curr)) return N_A` → `return CURRENT` → 1 rojo');
console.log('     ("freshness_spec vacío → N_A") — §30 no inventar fresco sin calibrar.');
console.log('  2. continuidadRun: la rama `N_A` cierra el run (`cerrar()`) → 2 rojos');
console.log('     ("D,N_A,D → det_run=2", "un solo run") — INV-25.');
console.log('  3. continuidadRun: `d > gap` → `d < gap` (split invertido) → 4 rojos');
console.log('     (los 4 asserts de AC19: gap 8 ya no rompe, gap 2 sí rompe).');
console.log('  4. estabilidadSerie: no calibrada → devolver `STABLE` en vez de INSUFFICIENT');
console.log('     → 2 rojos ("STABILITY_CV_* null → INSUFFICIENT" + flag) — Grupo 1 / §30.');
console.log('  5. regimen: REBASE_HISTORY también → NEW_REGIME → 1 rojo');
console.log('     ("REBASE_HISTORY → CONTINUOUS") — AF.');
console.log('  6. registrarShock: declaración inválida → devolver el status crudo → 1 rojo');
console.log('     ("HURACAN → NONE/INCLUDE").');
console.log('  7. registrarShock: EXCLUDE sin flag EXCLUSION_DIFERIDA → 1 rojo — el efecto de');
console.log('     EXCLUDE está diferido, no ejecutado (INV-59).');
console.log('  8. magnitudCambio: `m = metodo` (sin fallback al default) → 3 rojos (los 2');
console.log('     DELTA-implícito + "método no reconocido → cae al default DELTA").');
console.log('  9. historiaSuficiente: `>= minimo` → `>= 1` → 1 rojo ("[1] → insuficiente", INV-26).');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
