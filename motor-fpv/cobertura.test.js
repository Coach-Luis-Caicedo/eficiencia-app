/**
 * motor-fpv/cobertura.test.js — Fase 3
 * node motor-fpv/cobertura.test.js
 *
 * Cobertura §7.2.D (CE, PR, CV) + escalera de estatus §8.
 * No hay oráculo numérico externo aquí — §10 no cubre cobertura. Los
 * valores esperados se derivan a mano de las fórmulas literales.
 */

'use strict';

var CB = require('./cobertura');
var PB = require('./poblacional');
var Persona = require('./persona');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }
function near(a, b, m) { var c = typeof a === 'number' && Math.abs(a - b) < 1e-9; ok(c, m + (c ? '' : '  [recibido=' + a + ' esperado=' + b + ']')); }
function lanza(fn, m) { var l = false; try { fn(); } catch (e) { l = true; } ok(l, m); }
// estricto: NaN NO pasa como null (JSON.stringify(NaN) === "null" engañaría a eq)
function esNull(a, m) { ok(a === null, m + (a === null ? '' : '  [recibido=' + a + ']')); }

// perfiles de una posición con el sensor F tomando los valores dados
function perfilesF(valores) {
  return valores.map(function (v, i) {
    return Persona.perfilPersona({ persona_id: 'p' + i, posicion: 'CONSUMIDOR', F: v, P: 3, V: 3 });
  });
}
function pobF(valores) { return PB.poblacionalSensor(perfilesF(valores), 'F'); }

// ═══════════════════════════════════════════════════════════════════════
seccion('§7.2.D — CEⱼ = 100·nᵥ/(nᵥ+nNE)');
// ═══════════════════════════════════════════════════════════════════════

near(CB.coberturaExperiencial(8, 2), 80, 'nᵥ=8, nNE=2 → CE = 800/10 = 80');
near(CB.coberturaExperiencial(5, 0), 100, 'sin NE → CE = 100');
near(CB.coberturaExperiencial(0, 4), 0, 'nᵥ=0, nNE=4 → CE = 0 (no null — denom > 0)');
esNull(CB.coberturaExperiencial(0, 0), 'nᵥ=0, nNE=0 (todo NR / sin respondientes) → CE = null (§14: denom > 0)');
eq(CB.coberturaExperiencial(3, 0), 100, 'NR no entra en el denominador de CE');

// a través de coberturaSensor: NR no mueve CE, NE sí
var cSensorNENR = CB.coberturaSensor(PB.poblacionalSensor(perfilesF([3, 3, 4, 'NE', 'NR', 'NR']), 'F'), undefined, undefined);
eq([cSensorNENR.nv, cSensorNENR.nNE, cSensorNENR.nNR], [3, 1, 2], 'nᵥ=3, nNE=1, nNR=2');
near(cSensorNENR.CE, 75, 'CE = 100·3/(3+1) = 75 — los 2 NR NO cuentan');

// ═══════════════════════════════════════════════════════════════════════
seccion('§7.2.D — CVⱼ = 100·nᵥ/Nelegibles; PR = 100·nrespondentes/Nelegibles');
// ═══════════════════════════════════════════════════════════════════════

var c10de20 = CB.coberturaSensor(pobF([3, 3, 3, 3, 3, 3, 3, 3, 3, 3]), undefined, 20);
near(c10de20.CV, 50, 'nᵥ=10, N_elegibles=20 → CV = 50');
esNull(CB.coberturaSensor(pobF([3, 3]), undefined, undefined).CV, 'sin N_elegibles → CV = null');
esNull(CB.coberturaSensor(pobF([3, 3]), undefined, 0).CV, 'N_elegibles = 0 → CV = null (no división por 0)');
near(CB.coberturaSensor(pobF([3, 3, 3]), undefined, 2).CV, 150, 'N_elegibles < nᵥ → CV = 150 (señal visible, no se recorta)');

var part = CB.participacionPosicion(perfilesF([3, 'NE', 'NR', 5]), 10);
eq(part.nrespondentes, 4, 'nrespondentes = 4 — todos los que enviaron, incl. NE y NR (decisión D)');
near(part.PR, 40, 'PR = 100·4/10 = 40');
esNull(CB.participacionPosicion(perfilesF([3, 3]), undefined).PR, 'sin N_elegibles → PR = null');
eq(CB.participacionPosicion([], 10), { nrespondentes: 0, PR: 0 }, 'posición sin respondientes → nrespondentes=0, PR=0');
lanza(function () { CB.participacionPosicion('no-array', 10); }, 'perfiles no-array → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('§8 — escalera de estatus (decisión B: más alto aplicable)');
// ═══════════════════════════════════════════════════════════════════════

// piso: nᵥ determina NO_CALCULABLE vs DESCRIPTIVO
eq(CB.coberturaSensor(pobF(['NE', 'NE']), undefined, undefined).estatus, 'NO_CALCULABLE', 'nᵥ=0 → NO_CALCULABLE');
eq(CB.coberturaSensor(pobF([3, 4]), undefined, undefined).estatus, 'DESCRIPTIVO', 'nᵥ≥1, sin diseño ni marco → DESCRIPTIVO');

// CENSAL: CV ≥ UMBRAL_CENSAL_CV (80), y solo con N_elegibles
var censal = CB.coberturaSensor(pobF([3, 3, 3, 3, 3, 3, 3, 3, 3]), undefined, 10); // nᵥ=9, CV=90
eq(censal.estatus, 'CENSAL', 'CV = 90 ≥ 80 → CENSAL');
eq([censal.censal_aplica, censal.inferencial_aplica], [true, false], 'censal_aplica=true, inferencial_aplica=false');
var borde = CB.coberturaSensor(pobF([3, 3, 3, 3, 3, 3, 3, 3]), undefined, 10); // nᵥ=8, CV=80 exacto
eq(borde.estatus, 'CENSAL', 'CV = 80 exacto → CENSAL (≥, no >)');
var casiCensal = CB.coberturaSensor(pobF([3, 3, 3, 3, 3, 3, 3]), undefined, 10); // nᵥ=7, CV=70
eq(casiCensal.estatus, 'DESCRIPTIVO', 'CV = 70 < 80 → sigue DESCRIPTIVO');

// INFERENCIAL: probabilistico O modelo_documentado (es un "o", §8)
eq(CB.coberturaSensor(pobF([3, 4]), { probabilistico: true }, undefined).estatus, 'INFERENCIAL', 'diseño probabilístico → INFERENCIAL (sin marco)');
eq(CB.coberturaSensor(pobF([3, 4]), { modelo_documentado: true }, undefined).estatus, 'INFERENCIAL', 'solo modelo_documentado → INFERENCIAL (el "o" de §8)');
eq(CB.coberturaSensor(pobF([3, 4]), { probabilistico: false, modelo_documentado: false }, undefined).estatus, 'DESCRIPTIVO', 'diseño declarado no inferencial → DESCRIPTIVO');
eq(CB.disenoHabilitaInferencia({ probabilistico: 'sí' }), false, 'probabilistico truthy-no-boolean → NO habilita (exige === true)');

// precedencia: INFERENCIAL gana a CENSAL cuando ambos aplican
var ambos = CB.coberturaSensor(pobF([3, 3, 3, 3, 3, 3, 3, 3, 3]), { probabilistico: true }, 10); // CV=90 y probabilístico
eq(ambos.estatus, 'INFERENCIAL', 'CV≥80 Y probabilístico → INFERENCIAL (precedencia §8, decisión B)');
eq([ambos.censal_aplica, ambos.inferencial_aplica], [true, true], 'ambos flags true — el llamante ve por qué');

// piso duro: nᵥ=0 gana a cualquier diseño
var ncNoInf = CB.coberturaSensor(pobF(['NE', 'NE']), { probabilistico: true }, 4);
eq(ncNoInf.estatus, 'NO_CALCULABLE', 'nᵥ=0 + diseño probabilístico → SIGUE NO_CALCULABLE (§8 fila 1: no hay nivel que inferir)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Decisión E — CE/CV se calculan también con nᵥ=0 (DESVIACIÓN de §14)');
// ═══════════════════════════════════════════════════════════════════════

var todoNE = CB.coberturaSensor(PB.poblacionalSensor(perfilesF(['NE', 'NE', 'NE']), 'F'), undefined, 6);
eq(todoNE.estatus, 'NO_CALCULABLE', 'sensor todo-NE → NO_CALCULABLE');
near(todoNE.CE, 0, 'PERO CE = 100·0/(0+3) = 0 — NO null (decisión E: §14 haría `continuar` y lo saltaría)');
near(todoNE.CV, 0, 'y CV = 100·0/6 = 0 (mismo criterio)');
esNull(todoNE.L, 'el NIVEL sí queda null — es lo único que §8 fila 1 veta');
var todoNR = CB.coberturaSensor(PB.poblacionalSensor(perfilesF(['NR', 'NR']), 'F'), undefined, 6);
esNull(todoNR.CE, 'sensor todo-NR → CE = null (denom = nᵥ+nNE = 0)');
near(todoNR.CV, 0, 'pero CV = 0 (N_elegibles conocido, 0 válidos)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Decisión F — INFERENCIAL habilita intervalos, NO los calcula');
// ═══════════════════════════════════════════════════════════════════════

var inf = CB.coberturaSensor(pobF([2, 3, 4, 5]), { probabilistico: true }, undefined);
eq(inf.intervalos_permitidos, true, 'INFERENCIAL → intervalos_permitidos = true');
ok(!('intervalo_L' in inf) && !('ic95' in inf) && !('L_inf' in inf) && !('L_sup' in inf),
  'NINGÚN intervalo calculado — Fase 3 expone el permiso, no el número (decisión F)');
eq(CB.coberturaSensor(pobF([2, 3]), undefined, undefined).intervalos_permitidos, false, 'sin diseño inferencial → intervalos_permitidos = false');

// ═══════════════════════════════════════════════════════════════════════
seccion('coberturaSensor — preserva el núcleo de Fase 2 + valida entrada');
// ═══════════════════════════════════════════════════════════════════════

var base = pobF([1, 2, 3, 4, 5]);
var conCob = CB.coberturaSensor(base, undefined, 10);
eq([conCob.L, conCob.H, conCob.C, conCob.mediana], [base.L, base.H, base.C, base.mediana], 'L/H/C/mediana de Fase 2 intactos');
eq(conCob.p, base.p, 'distribución p intacta');
eq(base.estatus, 'DESCRIPTIVO', 'Fase 2 sola deja el piso DESCRIPTIVO...');
eq(CB.coberturaSensor(base, { probabilistico: true }, 10).estatus, 'INFERENCIAL', '...y Fase 3 lo promueve');
lanza(function () { CB.coberturaSensor(null); }, 'coberturaSensor(null) → lanza');
lanza(function () { CB.coberturaSensor({ nv: 3 }); }, 'coberturaSensor sin nNE → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. escaleraEstatus: quitar el piso `if (nv === 0) return NO_CALCULABLE`');
console.log('     → un sensor todo-NE (con o sin diseño) sube a DESCRIPTIVO/INFERENCIAL.');
console.log('     → 3 rojos (nᵥ=0→NO_CALCULABLE, nᵥ=0+probabilístico→NO_CALCULABLE, todo-NE).');
console.log('  2. CENSAL: `CV >= UMBRAL` → `CV > UMBRAL`.');
console.log('     → 1 rojo ("CV = 80 exacto → CENSAL").');
console.log('  3. disenoHabilitaInferencia: `||` → `&&` (exigir ambos).');
console.log('     → 6 rojos (solo-probabilístico, solo-modelo_documentado, CV∧prob→INFER,');
console.log('        flags [true,true], intervalos_permitidos, "Fase 3 lo promueve").');
console.log('  4. coberturaExperiencial: denom `nv + nNE` → `nv` (los NE dejan de contar).');
console.log('     → 4 rojos (CE 80, CE 0-con-NE, CE 75-con-NR, CE 0 del todo-NE).');
console.log('  5. Decisión E revertida: reintroducir el `continuar` de §14 — con nᵥ=0,');
console.log('     CE y CV vuelven a null.');
console.log('     → 3 rojos (CE=0 del todo-NE, CV=0 del todo-NE, CV=0 del todo-NR).');
console.log('  6. participacionPosicion: quitar la guarda `esNumeroPositivo(N_elegibles)`');
console.log('     → PR = 100·n/undefined = NaN en vez de null.');
console.log('     → 1 rojo ("sin N_elegibles → PR = null"; `esNull` distingue NaN de null).');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
