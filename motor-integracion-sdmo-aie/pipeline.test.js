/**
 * motor-integracion-sdmo-aie/pipeline.test.js
 *
 * Segundo arnés de integración real: motor-sdmo -> aie_validation_kit
 * (Python real vía subproceso). node motor-integracion-sdmo-aie/pipeline.test.js
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
// Placeholders explícitos de PENDIENTE_VALIDACION, SOLO para esta batería —
// mismo criterio que motor-iao.test.js/sim: no son valores calibrados.
var OPTS = { delta: 0.5, minReportableN: 3, percentilConcentracion: 90 };

function respFavorable() { return { ACU: 1, COM: 1, INV: 1, PEN: 1 }; }
function respDeteriorada() { return { ACU: 5, COM: 5, INV: 5, PEN: 5 }; }

// ═══════════════════════════════════════════════════════════════════════
seccion('calcularSerieOrganizacionalIDA — agregación temporal construida por el arnés');
// ═══════════════════════════════════════════════════════════════════════

var datosFavorables3p = [
  [respFavorable(), respFavorable(), respFavorable()],
  [respFavorable(), respFavorable(), respFavorable()],
  [respFavorable(), respFavorable(), respFavorable()]
];
var serieFav = P.calcularSerieOrganizacionalIDA(datosFavorables3p, OPTS);
eq(serieFav.dyn, [0, 0, 0], 'todos responden el polo favorable en los 3 períodos -> dyn = [0,0,0] exacto (M=C=0 para todos)');

var mixto = [[respFavorable(), respFavorable(), { ACU: 2, COM: 1, INV: 1, PEN: 1 }]];
var serieMixto = P.calcularSerieOrganizacionalIDA(mixto, OPTS);
near(serieMixto.dyn[0], 25 / 24, EPS,
  'un período con 2 favorables + 1 casi-favorable (ACU=2) -> nivelColectivo = 25/24 ' +
  '(verificado a mano: z_ACU=.25 resto 0, M=.0625, C=0, IDA=100*.5*.0625=3.125; avg(0,0,3.125)=25/24)');

// No-respuesta individual dentro de un período no corrompe el agregado —
// motor-sdmo filtra null antes de promediar (§2.8, nunca se imputa).
var conNoRespuesta = [[respFavorable(), null, respFavorable(), respFavorable()]];
var serieConNoResp = P.calcularSerieOrganizacionalIDA(conNoRespuesta, OPTS);
eq(serieConNoResp.dyn, [0], 'una no-respuesta individual dentro del período (null) no cambia el nivel colectivo (se filtra, no se imputa)');
eq(serieConNoResp.detallePorPeriodo[0].organizacion.n, 3, 'n cuenta solo los 3 respondientes válidos, no los 4 convocados implícitos');

// ── Hallazgo de frontera: período sin ningún respondiente válido -> null ──
var todosSinResponder = [[null, null, null]];
var serieSinResp = P.calcularSerieOrganizacionalIDA(todosSinResponder, OPTS);
eq(serieSinResp.dyn, [null], 'período sin ningún respondiente válido -> nivelColectivo=null (comportamiento correcto de motor-sdmo, §2.8: no se imputa)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Hallazgo de frontera — dyn con null hace tronar rules_2f_3f.run_case, y el arnés lo detecta antes');
// ═══════════════════════════════════════════════════════════════════════

lanza(function () { P.ejecutarAIE([50], [null], [null]); },
  'ejecutarAIE detecta dyn=[null] ANTES de invocar Python y lanza un error con contexto ' +
  '(sin la guarda, rules_2f_3f.run_case()->engine_core.position() lanza TypeError crudo: ' +
  '"<= not supported between NoneType and int" — confirmado empíricamente antes de escribir esta guarda)');
lanza(function () { P.ejecutarAIE([null], [50], [null]); },
  'lo mismo para cfg=[null]');
lanza(function () { P.ejecutarAIE([NaN], [50], [null]); },
  'lo mismo para NaN (JSON.stringify(NaN) da "null", que dispararía el mismo TypeError en Python)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Puente a Python — confirmación de que ejecuta engine_core real, no un stub');
// ═══════════════════════════════════════════════════════════════════════

var aieDirecto = P.ejecutarAIE([50, 50, 50, 50], [10, 10, 10, 10], [null, null, null, null]);
eq(aieDirecto.length, 4, 'ejecutarAIE devuelve una fila por período (4 períodos -> 4 filas)');
// engine_core.TH_FI=33 (posición <=33 => 'F'), TH_ID=66. CFG=50 cae 33<50<=66 => 'I' —
// valor real observado, no el que se había asumido al escribir el test por primera vez.
eq(aieDirecto[0].CFG_pos, 'I', 'CFG=50 -> CFG_pos="I" (engine_core.TH_FI=33 < 50 <= TH_ID=66) — ' +
  'confirma que el puente ejecuta los umbrales reales de engine_core.py, no una lectura asumida');
eq(aieDirecto[0].DYN_pos, 'F', 'DYN=10 -> DYN_pos="F" (10 <= TH_FI=33)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Caso end-to-end #1 — organización estable, cfg y dyn favorables (real motor-sdmo)');
// ═══════════════════════════════════════════════════════════════════════

var datosEstableFavorable = [0, 1, 2, 3].map(function () {
  return [respFavorable(), respFavorable(), respFavorable(), respFavorable(), respFavorable()];
});
var cfgFavorable = [10, 10, 10, 10]; // sintético, marcado explícitamente como tal — ver README
var r1 = P.ejecutarPipeline(datosEstableFavorable, cfgFavorable, OPTS);
eq(r1.dyn, [0, 0, 0, 0], 'dyn real (motor-sdmo, todos favorable) = [0,0,0,0] exacto en los 4 períodos');
eq(r1.segmentos.length, 1, 'sin huecos -> un solo segmento, cubre los 4 períodos');
eq(r1.segmentos[0].periodosReales, [0, 1, 2, 3], 'el segmento único declara explícitamente sus 4 períodos reales');
r1.segmentos[0].aie.forEach(function (fila, t) {
  eq(fila.CFG_pos, 'F', 'período ' + t + ': CFG_pos=F (10 <= 33)');
  eq(fila.DYN_pos, 'F', 'período ' + t + ': DYN_pos=F (dyn real de motor-sdmo = 0 <= 33)');
  eq(fila.AIE_2F, 'REG_CONVERGENT', 'período ' + t + ': AIE_2F=REG_CONVERGENT (CFG y DYN ambos F)');
});

// ═══════════════════════════════════════════════════════════════════════
seccion('Caso end-to-end #2 — dyn real deteriorándose, cfg sintético estable (confirma AIE_2F ante alteración dinámica)');
// ═══════════════════════════════════════════════════════════════════════

// 5 períodos: la organización pasa de mayoría favorable a mayoría deteriorada.
var datosDeteriorando = [
  [respFavorable(), respFavorable(), respFavorable(), respFavorable(), respFavorable()],
  [respFavorable(), respFavorable(), respFavorable(), respDeteriorada(), respFavorable()],
  [respFavorable(), respFavorable(), respDeteriorada(), respDeteriorada(), respFavorable()],
  [respFavorable(), respDeteriorada(), respDeteriorada(), respDeteriorada(), respFavorable()],
  [respDeteriorada(), respDeteriorada(), respDeteriorada(), respDeteriorada(), respFavorable()]
];
var cfgEstable = [10, 10, 10, 10, 10]; // sintético
var r2 = P.ejecutarPipeline(datosDeteriorando, cfgEstable, OPTS);
console.log('  dyn real (motor-sdmo) a lo largo de 5 períodos:', JSON.stringify(r2.dyn.map(function (v) { return Math.round(v * 100) / 100; })));
ok(r2.dyn[4] > r2.dyn[0], 'dyn sube monótonamente de un período mayoritariamente favorable a uno mayoritariamente deteriorado (' +
  r2.dyn[0].toFixed(2) + ' -> ' + r2.dyn[4].toFixed(2) + ')');
eq(r2.segmentos.length, 1, 'sin huecos -> un solo segmento, cubre los 5 períodos');
var aie2 = r2.segmentos[0].aie;
eq(aie2[0].DYN_pos, 'F', 'período 0: DYN_pos=F (todos favorable)');
eq(aie2[4].DYN_pos, 'D', 'período 4: DYN_pos=D (4 de 5 deteriorados, mayoría domina el promedio)');
eq(aie2[4].CFG_pos, 'F', 'período 4: CFG_pos sigue F (sintético, sin cambiar)');
eq(aie2[4].AIE_2F, 'TR_DYNAMIC_ALTERATION', 'período 4: AIE_2F=TR_DYNAMIC_ALTERATION (CFG favorable, DYN deteriorado — exactamente la ' +
  'situación que R08 nombra: alteración dinámica sin cambio de configuración)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Caso end-to-end #3 — 3 segmentos separados por 2 huecos (períodos sin respondientes)');
// ═══════════════════════════════════════════════════════════════════════

// 9 períodos reales, datos SDMO reales (enteros 1-5, no valores inventados):
// segmento A (0-2, deteriorando: 1,3,5 de 5 personas responden el polo
// deteriorado), hueco (3, nadie responde), segmento B (4-6, recuperando:
// 5,3,1 de 5 deterioradas), hueco (7, nadie responde), segmento C (8, un
// solo período — demasiado corto para TRAJ_WINDOW=3, INDETERMINATE esperado).
function fav() { return { ACU: 1, COM: 1, INV: 1, PEN: 1 }; }
function det() { return { ACU: 5, COM: 5, INV: 5, PEN: 5 }; }
function mezcla(nDeterioradas, nTotal) {
  var a = [];
  for (var i = 0; i < nDeterioradas; i++) a.push(det());
  for (var j = nDeterioradas; j < nTotal; j++) a.push(fav());
  return a;
}
var datosConHuecos = [
  mezcla(1, 5), mezcla(3, 5), mezcla(5, 5),   // segmento A: dyn real 20,60,100 (deteriorando)
  [null],                                      // HUECO (período 3, nadie responde)
  mezcla(5, 5), mezcla(3, 5), mezcla(1, 5),   // segmento B: dyn real 100,60,20 (recuperando)
  [null],                                      // HUECO (período 7, nadie responde)
  mezcla(2, 5)                                 // segmento C: dyn real 40, 1 solo período
];
var cfgConHuecos = new Array(9).fill(10); // sintético, constante
var r3 = P.ejecutarPipeline(datosConHuecos, cfgConHuecos, OPTS);

// Valores de dyn confirmados primero con node -e antes de escribir estos
// asserts (no al revés): [20,60,100,null,100,60,20,null,40].
eq(r3.dyn, [20, 60, 100, null, 100, 60, 20, null, 40], 'dyn real de motor-sdmo, con los 2 huecos visibles como null');

eq(r3.segmentos.length, 3, '9 períodos con 2 huecos -> exactamente 3 segmentos');
eq(r3.segmentos[0].periodosReales, [0, 1, 2], 'segmento A = períodos reales [0,1,2] (antes del primer hueco)');
eq(r3.segmentos[1].periodosReales, [4, 5, 6], 'segmento B = períodos reales [4,5,6] (entre los dos huecos, NO incluye el 3 ni el 7)');
eq(r3.segmentos[2].periodosReales, [8], 'segmento C = período real [8] solamente (después del segundo hueco)');

// Segmento A: dyn 20,60,100 -> pendiente (mínimos cuadrados, x=[0,1,2]):
// mx=1, my=60; num=(-1)(-40)+(0)(0)+(1)(40)=80; den=2; slope=40.
// mdc/window=5/3≈1.667 -> 40>1.667 -> DETERIORATING (verificado con node -e antes de escribir el assert).
eq(r3.segmentos[0].aie.map(function (f) { return f.DYN; }), [20, 60, 100], 'segmento A conserva sus 3 valores reales de dyn, en orden');
eq(r3.segmentos[0].aie[0].DYN_traj, 'INDETERMINATE', 'segmento A, local t=0 (real t=0): INDETERMINATE (t<window-1=2, evidencia insuficiente — correcto, no error)');
eq(r3.segmentos[0].aie[1].DYN_traj, 'INDETERMINATE', 'segmento A, local t=1 (real t=1): INDETERMINATE (mismo motivo)');
eq(r3.segmentos[0].aie[2].DYN_traj, 'DETERIORATING', 'segmento A, local t=2 (real t=2): DETERIORATING (pendiente=40, verificado)');

// Segmento B: dyn 100,60,20 -> my=60; num=(-1)(40)+(0)(0)+(1)(-40)=-80; slope=-40.
// -40 < -1.667 -> IMPROVING (verificado con node -e).
eq(r3.segmentos[1].aie.map(function (f) { return f.DYN; }), [100, 60, 20], 'segmento B conserva sus 3 valores reales de dyn, en orden');
eq(r3.segmentos[1].aie[0].DYN_traj, 'INDETERMINATE',
  'segmento B, local t=0 (real t=4, el período INMEDIATAMENTE DESPUÉS del hueco): INDETERMINATE — ' +
  'confirma que el segmento reinicia su propio índice local, NO hereda continuidad del segmento A ' +
  '(si heredara, con 3 puntos de historial ya tendría una trayectoria calculada, no INDETERMINATE)');
eq(r3.segmentos[1].aie[2].DYN_traj, 'IMPROVING', 'segmento B, local t=2 (real t=6): IMPROVING (pendiente=-40, verificado)');

// Segmento C: 1 solo período -> local t=0 < window-1(2) -> INDETERMINATE. No es
// un caso de error: es el motor reconociendo evidencia insuficiente, mismo
// principio que rige en todo el resto del sistema.
eq(r3.segmentos[2].aie.length, 1, 'segmento C tiene exactamente 1 fila (1 período real)');
eq(r3.segmentos[2].aie[0].DYN, 40, 'segmento C conserva su valor real de dyn (40)');
eq(r3.segmentos[2].aie[0].DYN_traj, 'INDETERMINATE', 'segmento C, único período: INDETERMINATE (evidencia insuficiente, no un error)');

// ── La prueba de que la segmentación cambia el resultado: comparación directa
//    contra "aplanar y concatenar" (el comportamiento que NO se implementó) ──
seccion('Sin segmentar vs. segmentado — la diferencia real en el punto exacto del corte');
var dynConcatenadoIgnorandoHuecos = [20, 60, 100, 100, 60, 20, 40]; // huecos removidos, sin marcar el corte
var cfgConcatenado = new Array(7).fill(10);
var opsConcatenado = new Array(7).fill(null);
var aieConcatenado = P.ejecutarAIE(cfgConcatenado, dynConcatenadoIgnorandoHuecos, opsConcatenado);
// En la serie concatenada, el índice 3 (valor 100) es el primer punto real del
// tramo B (real t=4), pero aquí aparece en la posición t=3 del array (no t=0
// de su propio segmento) -> window=[índices 1,2,3]=[60,100,100], que MEZCLA
// la cola del segmento A con el inicio del segmento B.
near((function () {
  var y = [60, 100, 100], x = [0, 1, 2];
  var mx = 1, my = (60 + 100 + 100) / 3;
  var num = (x[0] - mx) * (y[0] - my) + (x[1] - mx) * (y[1] - my) + (x[2] - mx) * (y[2] - my);
  return num / 2;
})(), 20, EPS, 'pendiente calculada a mano para la ventana contaminada [60,100,100] = 20 (verificación del cálculo de contraste)');
eq(aieConcatenado[3].DYN_traj, 'DETERIORATING',
  'SIN segmentar: el punto que corresponde al inicio real del segmento B (índice 3 = valor 100, real t=4) ' +
  'sale "DETERIORATING" — la ventana [60,100,100] mezcla la cola de A con el comienzo de B, cruzando ' +
  'el hueco como si los períodos fueran calendario-consecutivos');
ok(aieConcatenado[3].DYN_traj !== r3.segmentos[1].aie[0].DYN_traj,
  'CON segmentación (comportamiento implementado): el mismo período real (t=4, inicio de B) da "' +
  r3.segmentos[1].aie[0].DYN_traj + '" en vez de "' + aieConcatenado[3].DYN_traj + '" — la diferencia ' +
  'es la prueba de que segmentar cambia el resultado, no es un ejercicio cosmético');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
