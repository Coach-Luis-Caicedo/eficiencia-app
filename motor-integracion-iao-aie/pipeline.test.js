/**
 * motor-integracion-iao-aie/pipeline.test.js
 *
 * Tercer arnés de integración real: motor-iao -> AIE (Python real vía
 * subproceso). node motor-integracion-iao-aie/pipeline.test.js
 *
 * Todos los valores numéricos de este archivo se confirmaron primero con
 * `node -e` contra el código real (motor-ice-ieh + motor-iao +
 * rules_2f_3f.run_case), antes de escribir los asserts — no al revés,
 * mismo criterio que motor-integracion-sdmo-aie/pipeline.test.js.
 */

'use strict';

var P = require('./pipeline');

var _ok = 0, _fallos = 0;
function seccion(nombre) { console.log('\n── ' + nombre + ' ' + '─'.repeat(Math.max(0, 66 - nombre.length))); }
function ok(cond, msg) {
  if (cond) { _ok++; console.log('  ✓ ' + msg); }
  else { _fallos++; console.log('  ✗ FALLA: ' + msg); }
}
function eq(a, b, msg) {
  var cond = JSON.stringify(a) === JSON.stringify(b);
  ok(cond, msg + (cond ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']'));
}
function near(a, b, tol, msg) {
  var cond = typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < tol;
  ok(cond, msg + (cond ? '' : '  [recibido=' + a + ' esperado=' + b + ' |diff|=' + Math.abs(a - b) + ']'));
}
function lanza(fn, msg) {
  var lanzo = false, mensaje = '';
  try { fn(); } catch (e) { lanzo = true; mensaje = e.message; }
  ok(lanzo, msg + (lanzo ? '  [' + mensaje.slice(0, 90) + '...]' : ''));
}

var EPS = 1e-9;
// Placeholders explícitos de PENDIENTE_VALIDACION, SOLO para esta batería.
var OPTS = { minReportableN: 1 };

function fav() { return P.calcularVariablesDePersona(new Array(31).fill(5)); }
function det() { return P.calcularVariablesDePersona(new Array(31).fill(1)); }
var IAO_FAV = 10.033333333333331;   // confirmado con node -e antes de escribir asserts
var IAO_DET = 89.96666666666667;

// ═══════════════════════════════════════════════════════════════════════
seccion('calcularSerieOrganizacionalIAO — agregación temporal construida por el arnés');
// ═══════════════════════════════════════════════════════════════════════

var datosFavorables3p = [0, 1, 2].map(function () { return [{ id: 'org', personas: [fav(), fav(), fav()] }]; });
var serieFav = P.calcularSerieOrganizacionalIAO(datosFavorables3p, OPTS);
serieFav.cfg.forEach(function (v, t) {
  near(v, IAO_FAV, EPS, 'período ' + t + ': todos favorables (todos=5) -> iaoOrg = ' + IAO_FAV.toFixed(4) + ' (confirmado a mano)');
});

var mixto = [[{ id: 'org', personas: [fav(), fav(), det()] }]];
var serieMixto = P.calcularSerieOrganizacionalIAO(mixto, OPTS);
near(serieMixto.cfg[0], (2 * IAO_FAV + IAO_DET) / 3, EPS,
  'un período con 2 favorables + 1 deteriorado -> iaoOrg = promedio ponderado por n (confirmado: ' +
  ((2 * IAO_FAV + IAO_DET) / 3).toFixed(4) + ')');

// ═══════════════════════════════════════════════════════════════════════
seccion('Hallazgo de frontera — motor-iao.agregarOrganizacion NO tolera null en personas (a diferencia de motor-sdmo con idas)');
// ═══════════════════════════════════════════════════════════════════════

// motor-sdmo.agregarOrganizacion filtra null en `idas` (no-respuesta individual,
// §2.8). motor-iao.agregarOrganizacion NO tiene el mismo filtro para `personas`
// — llama calcular(pv) directamente sobre cada elemento, sin guardia. Confirmado
// empíricamente antes de diseñar cómo tratarlo (no se asumió simetría con IDA).
lanza(function () { P.MotorIAO.agregarOrganizacion([{ id: 'n1', personas: [fav(), null, fav()] }], OPTS); },
  'motor-iao.agregarOrganizacion LANZA si personas contiene null — a diferencia de motor-sdmo.agregarOrganizacion, ' +
  'que filtra null en idas silenciosamente (asimetría real entre los dos motores, no una suposición)');

// Consecuencia de diseño: la no-respuesta individual de una Persona en un nodo
// se representa OMITIENDO a esa Persona de `personas` (no con un null), y
// ajustando `convocados` si se quiere conservar la tasa de respuesta real.
var conNoRespuesta = P.calcularSerieOrganizacionalIAO(
  [[{ id: 'org', personas: [fav(), fav(), fav()], convocados: 4 }]], OPTS);
near(conNoRespuesta.cfg[0], IAO_FAV, EPS,
  '3 respondientes válidos de 4 convocados (1 no-respuesta representada por omisión, no por null) -> iaoOrg = 10.0333 sin corromperse');
eq(conNoRespuesta.detallePorPeriodo[0].organizacion.n, 3, 'n cuenta solo los 3 respondientes válidos');
near(conNoRespuesta.detallePorPeriodo[0].organizacion.tasaRespuesta, 0.75, EPS, 'tasaRespuesta = 3/4 = 0.75');

// ═══════════════════════════════════════════════════════════════════════
seccion('Nodo no-reportable (n < minReportableN) — SÍ aporta al pool organizacional (caso pedido explícitamente por Luis)');
// ═══════════════════════════════════════════════════════════════════════

var rNoReportable = P.MotorIAO.agregarOrganizacion(
  [{ id: 'n1', personas: [fav()], convocados: 2 }], { minReportableN: 2 });
eq(rNoReportable.perfilPorNodo[0].reportable, false, 'nodo con n=1 < minReportableN=2 -> reportable=false');
eq(rNoReportable.perfilPorNodo[0].nAportadoAlPool, 1, 'el nodo declara explícitamente cuántos respondientes aportó al pool (1)');
near(rNoReportable.organizacion.iaoOrg, IAO_FAV, EPS,
  'PERO organizacion.iaoOrg SÍ incluye a esa persona (10.0333) — el nodo no reporta estadísticas propias, ' +
  'pero su respondiente no desaparece del nivel organizacional (§3.9/§3.11, verificado contra el código real, no supuesto)');

// Caso mixto: nodo A reportable (2 favorables) + nodo B no-reportable (1 deteriorado) en la misma llamada.
var rMezclaNodos = P.MotorIAO.agregarOrganizacion([
  { id: 'A', personas: [fav(), fav()] },
  { id: 'B', personas: [det()], convocados: 3 }
], { minReportableN: 2 });
eq(rMezclaNodos.organizacion.n, 3, 'organizacion.n = 3 (2 de A + 1 de B, aunque B no sea reportable)');
near(rMezclaNodos.organizacion.iaoOrg, (2 * IAO_FAV + IAO_DET) / 3, EPS,
  'iaoOrg pondera por n de cada nodo, incluido el no-reportable (confirmado: ' +
  ((2 * IAO_FAV + IAO_DET) / 3).toFixed(4) + ', igual fórmula Σ(n_g·IAO_g)/Σn_g del §3.9)');
eq(rMezclaNodos.perfilPorNodo[0].reportable, true, 'nodo A (n=2 >= minReportableN=2): reportable=true');
eq(rMezclaNodos.perfilPorNodo[1].reportable, false, 'nodo B (n=1 < minReportableN=2): reportable=false, pero ya se confirmó arriba que sigue contando en el pool');

// ═══════════════════════════════════════════════════════════════════════
seccion('Período sin ningún respondiente válido en ningún nodo -> cfg=null');
// ═══════════════════════════════════════════════════════════════════════

var serieVacia = P.calcularSerieOrganizacionalIAO([[{ id: 'org', personas: [] }]], OPTS);
eq(serieVacia.cfg, [null], 'período sin ningún respondiente -> iaoOrg=null (comportamiento correcto de motor-iao, análogo a motor-sdmo §2.8: no se imputa)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Hallazgo de frontera — cfg con null hace tronar rules_2f_3f.run_case, y el arnés lo detecta antes');
// ═══════════════════════════════════════════════════════════════════════

lanza(function () { P.ejecutarAIE([null], [50], [null]); },
  'ejecutarAIE detecta cfg=[null] ANTES de invocar Python y lanza un error con contexto (mismo hallazgo de ' +
  '685d140, ahora confirmado también desde el lado de CFG en vez de DYN)');
lanza(function () { P.ejecutarAIE([50], [null], [null]); }, 'lo mismo para dyn=[null]');
lanza(function () { P.ejecutarAIE([NaN], [50], [null]); }, 'lo mismo para NaN');

// ═══════════════════════════════════════════════════════════════════════
seccion('Puente a Python — confirmación de que ejecuta engine_core real, no un stub');
// ═══════════════════════════════════════════════════════════════════════

var aieDirecto = P.ejecutarAIE([10.033333333333331, 10.033333333333331], [10, 10], [null, null]);
eq(aieDirecto.length, 2, 'ejecutarAIE devuelve una fila por período');
eq(aieDirecto[0].CFG_pos, 'F', 'CFG=10.03 -> CFG_pos="F" (engine_core.TH_FI=33, 10.03<=33) — umbrales reales, no asumidos');
eq(aieDirecto[0].DYN_pos, 'F', 'DYN=10 -> DYN_pos="F"');
eq(aieDirecto[0].AIE_2F, 'REG_CONVERGENT', 'CFG y DYN ambos F -> AIE_2F=REG_CONVERGENT');

// ═══════════════════════════════════════════════════════════════════════
seccion('Caso end-to-end #1 — organización estable, cfg real y dyn sintético favorables');
// ═══════════════════════════════════════════════════════════════════════

var datosEstableFavorable = [0, 1, 2, 3].map(function () {
  return [{ id: 'org', personas: [fav(), fav(), fav(), fav(), fav()] }];
});
var dynFavorable = [10, 10, 10, 10]; // sintético, marcado explícitamente como tal — motor-sdmo real ya se conectó en la otra rama (685d140)
var r1 = P.ejecutarPipeline(datosEstableFavorable, dynFavorable, OPTS);
r1.cfg.forEach(function (v) { near(v, IAO_FAV, EPS, 'cfg real (motor-iao, todos favorable) = ' + IAO_FAV.toFixed(4) + ' exacto en cada período'); });
eq(r1.segmentos.length, 1, 'sin huecos -> un solo segmento, cubre los 4 períodos');
eq(r1.segmentos[0].periodosReales, [0, 1, 2, 3], 'el segmento único declara explícitamente sus 4 períodos reales');
r1.segmentos[0].aie.forEach(function (fila, t) {
  eq(fila.CFG_pos, 'F', 'período ' + t + ': CFG_pos=F');
  eq(fila.DYN_pos, 'F', 'período ' + t + ': DYN_pos=F (sintético)');
  eq(fila.AIE_2F, 'REG_CONVERGENT', 'período ' + t + ': AIE_2F=REG_CONVERGENT');
});

// ═══════════════════════════════════════════════════════════════════════
seccion('Caso end-to-end #2 — cfg real deteriorándose, dyn sintético estable (confirma AIE_2F ante TR_LATENT_COMPATIBLE)');
// ═══════════════════════════════════════════════════════════════════════

// 5 períodos: la organización pasa de mayoría favorable a mayoría deteriorada
// (composición del nodo, no de las respuestas de una sola persona).
var datosDeteriorando = [
  [{ id: 'org', personas: [fav(), fav(), fav(), fav(), fav()] }],
  [{ id: 'org', personas: [fav(), fav(), fav(), det(), fav()] }],
  [{ id: 'org', personas: [fav(), fav(), det(), det(), fav()] }],
  [{ id: 'org', personas: [fav(), det(), det(), det(), fav()] }],
  [{ id: 'org', personas: [det(), det(), det(), det(), fav()] }]
];
var dynEstable = [10, 10, 10, 10, 10]; // sintético
var r2 = P.ejecutarPipeline(datosDeteriorando, dynEstable, OPTS);
console.log('  cfg real (motor-iao) a lo largo de 5 períodos:', JSON.stringify(r2.cfg.map(function (v) { return Math.round(v * 100) / 100; })));
eq(r2.cfg.map(function (v) { return Math.round(v * 100) / 100; }), [10.03, 26.02, 42.01, 57.99, 73.98],
  'cfg real confirmado a mano con node -e antes de escribir este assert');
eq(r2.segmentos.length, 1, 'sin huecos -> un solo segmento, cubre los 5 períodos');
var aie2 = r2.segmentos[0].aie;
eq(aie2[0].CFG_pos, 'F', 'período 0: CFG_pos=F (todos favorable)');
eq(aie2[4].CFG_pos, 'D', 'período 4: CFG_pos=D (4 de 5 deteriorados, mayoría domina el promedio)');
eq(aie2[4].DYN_pos, 'F', 'período 4: DYN_pos sigue F (sintético, sin cambiar)');
eq(aie2[4].AIE_2F, 'TR_LATENT_COMPATIBLE', 'período 4: AIE_2F=TR_LATENT_COMPATIBLE (CFG deteriorado, DYN favorable — ' +
  'exactamente la situación que R09 nombra: deterioro latente en la configuración sin alteración dinámica; el ' +
  'complemento especular de TR_DYNAMIC_ALTERATION que ya confirmó 685d140 para el caso DYN-deteriorado)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Caso end-to-end #3 — 3 segmentos separados por 2 huecos (períodos sin respondientes)');
// ═══════════════════════════════════════════════════════════════════════

function mezcla(nDeterioradas, nTotal) {
  var a = [];
  for (var i = 0; i < nDeterioradas; i++) a.push(det());
  for (var j = nDeterioradas; j < nTotal; j++) a.push(fav());
  return a;
}
var datosConHuecos = [
  [{ id: 'org', personas: mezcla(1, 5) }], [{ id: 'org', personas: mezcla(3, 5) }], [{ id: 'org', personas: mezcla(5, 5) }], // segmento A: deteriorando
  [{ id: 'org', personas: [] }],                                                                                            // HUECO (período 3)
  [{ id: 'org', personas: mezcla(5, 5) }], [{ id: 'org', personas: mezcla(3, 5) }], [{ id: 'org', personas: mezcla(1, 5) }], // segmento B: recuperando
  [{ id: 'org', personas: [] }],                                                                                            // HUECO (período 7)
  [{ id: 'org', personas: mezcla(2, 5) }]                                                                                   // segmento C: 1 solo período
];
var dynConHuecos = new Array(9).fill(10); // sintético, constante
var r3 = P.ejecutarPipeline(datosConHuecos, dynConHuecos, OPTS);

// Valores de cfg confirmados con node -e antes de escribir estos asserts.
var CFG_ESPERADO = [26.02, 57.99333333333332, 89.96666666666667, null,
  89.96666666666667, 57.99333333333332, 26.02, null, 42.00666666666667];
eq(r3.cfg, CFG_ESPERADO, 'cfg real de motor-iao, con los 2 huecos visibles como null');

eq(r3.segmentos.length, 3, '9 períodos con 2 huecos -> exactamente 3 segmentos');
eq(r3.segmentos[0].periodosReales, [0, 1, 2], 'segmento A = períodos reales [0,1,2]');
eq(r3.segmentos[1].periodosReales, [4, 5, 6], 'segmento B = períodos reales [4,5,6] (NO incluye el 3 ni el 7)');
eq(r3.segmentos[2].periodosReales, [8], 'segmento C = período real [8] solamente');

eq(r3.segmentos[0].aie[0].CFG_traj, 'INDETERMINATE', 'segmento A, local t=0: INDETERMINATE (evidencia insuficiente, correcto)');
eq(r3.segmentos[0].aie[1].CFG_traj, 'INDETERMINATE', 'segmento A, local t=1: INDETERMINATE (mismo motivo)');
eq(r3.segmentos[0].aie[2].CFG_traj, 'DETERIORATING', 'segmento A, local t=2: DETERIORATING (confirmado con node -e)');

eq(r3.segmentos[1].aie[0].CFG_traj, 'INDETERMINATE',
  'segmento B, local t=0 (real t=4, inmediatamente después del hueco): INDETERMINATE — confirma que el segmento ' +
  'reinicia su propio índice local, NO hereda continuidad del segmento A');
eq(r3.segmentos[1].aie[2].CFG_traj, 'IMPROVING', 'segmento B, local t=2 (real t=6): IMPROVING (confirmado con node -e)');

eq(r3.segmentos[2].aie.length, 1, 'segmento C tiene exactamente 1 fila');
eq(r3.segmentos[2].aie[0].CFG, 42.00666666666667, 'segmento C conserva su valor real de cfg');
eq(r3.segmentos[2].aie[0].CFG_traj, 'INDETERMINATE', 'segmento C, único período: INDETERMINATE (evidencia insuficiente, no un error)');

// ── Prueba de que la segmentación cambia el resultado (comparación directa
//    contra "aplanar y concatenar") ──
seccion('Sin segmentar vs. segmentado — la diferencia real en el punto exacto del corte (para CFG, no solo para DYN)');
var cfgConcatenadoIgnorandoHuecos = [26.02, 57.99333333333332, 89.96666666666667, 89.96666666666667, 57.99333333333332, 26.02, 42.00666666666667];
var dynConcatenado = new Array(7).fill(10);
var opsConcatenado = new Array(7).fill(null);
var aieConcatenado = P.ejecutarAIE(cfgConcatenadoIgnorandoHuecos, dynConcatenado, opsConcatenado);
eq(aieConcatenado[3].CFG_traj, 'DETERIORATING',
  'SIN segmentar: el punto que corresponde al inicio real del segmento B (índice 3, real t=4) sale ' +
  '"DETERIORATING" — la ventana mezcla la cola de A con el comienzo de B (confirmado con node -e)');
ok(aieConcatenado[3].CFG_traj !== r3.segmentos[1].aie[0].CFG_traj,
  'CON segmentación: el mismo período real (t=4, inicio de B) da "' + r3.segmentos[1].aie[0].CFG_traj +
  '" en vez de "' + aieConcatenado[3].CFG_traj + '" — la diferencia es la prueba de que segmentar cambia el ' +
  'resultado también para CFG, no solo para DYN (685d140 solo lo había probado del lado de DYN)');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
