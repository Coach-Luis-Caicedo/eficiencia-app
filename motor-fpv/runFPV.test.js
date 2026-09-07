/**
 * motor-fpv/runFPV.test.js — Fase 6
 * node motor-fpv/runFPV.test.js
 *
 * Orquestador runFPV §7 / §11 / §14. Encadena Fases 1–5 por posición.
 * Los valores numéricos ya están verificados en las baterías de cada fase
 * — aquí se verifica el ENCADENADO, la forma de la salida, la disciplina
 * §19.8/§11, y el contrato de error.
 */

'use strict';

var R = require('./runFPV');
var PB = require('./poblacional');
var CF = require('./configuracion');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }
function near(a, b, m) { var c = typeof a === 'number' && Math.abs(a - b) < 1e-9; ok(c, m + (c ? '' : '  [recibido=' + a + ' esperado=' + b + ']')); }
// acceso tolerante: una mutación que rompe `ok` no debe crashear la batería entera
function dig(o, ruta) { return ruta.split('.').reduce(function (a, k) { return (a == null) ? undefined : a[k]; }, o); }

function resp(persona_id, posicion, F, P, V, peso) {
  var r = { persona_id: persona_id, posicion: posicion, F: F, P: P, V: V };
  if (peso !== undefined) r.peso = peso;
  return r;
}

// input con las 3 posiciones pobladas
function inputBase() {
  return {
    respuestas: [
      resp('c1', 'CONSUMIDOR', 5, 4, 3), resp('c2', 'CONSUMIDOR', 4, 4, 2), resp('c3', 'CONSUMIDOR', 5, 3, 'NE'),
      resp('i1', 'INVERSIONISTA', 3, 3, 3), resp('i2', 'INVERSIONISTA', 2, 4, 4),
      resp('p1', 'PROVEEDOR', 1, 1, 1)
    ]
  };
}

// ═══════════════════════════════════════════════════════════════════════
seccion('§11 — las 3 posiciones SIEMPRE, con etiqueta FPV-C/I/P');
// ═══════════════════════════════════════════════════════════════════════

var out = R.runFPV(inputBase());
ok(out.ok === true, 'input válido → ok:true');
eq(Object.keys(dig(out, 'output.posiciones') || {}).sort(), ['CONSUMIDOR', 'INVERSIONISTA', 'PROVEEDOR'], 'las 3 posiciones presentes');
eq([dig(out, 'output.posiciones.CONSUMIDOR.etiqueta'), dig(out, 'output.posiciones.INVERSIONISTA.etiqueta'), dig(out, 'output.posiciones.PROVEEDOR.etiqueta')],
  ['FPV-C', 'FPV-I', 'FPV-P'], 'etiquetas FPV-C / FPV-I / FPV-P (§11)');
eq(dig(out, 'output.meta.version'), 'v1.2', 'meta.version = v1.2');
ok(dig(out, 'output.posiciones.CONSUMIDOR.sensores.F') && dig(out, 'output.posiciones.CONSUMIDOR.sensores.P') && dig(out, 'output.posiciones.CONSUMIDOR.sensores.V'),
  'cada posición tiene los 3 sensores F/P/V');

// ═══════════════════════════════════════════════════════════════════════
seccion('Encadenado — los números coinciden con las fases individuales');
// ═══════════════════════════════════════════════════════════════════════

var persona = require('./persona');
var perfilesC = inputBase().respuestas.filter(function (r) { return r.posicion === 'CONSUMIDOR'; }).map(persona.perfilPersona);
var pobFdirecto = PB.poblacionalSensor(perfilesC, 'F');
var Fout = dig(out, 'output.posiciones.CONSUMIDOR.sensores.F') || {};
near(Fout.L, pobFdirecto.L, 'CONSUMIDOR.F.L = poblacionalSensor directo');
near(Fout.H, pobFdirecto.H, 'CONSUMIDOR.F.H idem');
eq(Fout.p, pobFdirecto.p, 'CONSUMIDOR.F.p idem');
// F de CONSUMIDOR: r = [5,4,5] (c3 tiene F=5), s=[100,75,100] → L = 275/3
near(Fout.L, 275 / 3, 'CONSUMIDOR.F: r=[5,4,5] → L = 275/3 ≈ 91.67');
// V de CONSUMIDOR: c3 tiene V=NE → nv=2 (r=[3,2]), nNE=1
eq([dig(out, 'output.posiciones.CONSUMIDOR.sensores.V.nv'), dig(out, 'output.posiciones.CONSUMIDOR.sensores.V.nNE')], [2, 1], 'CONSUMIDOR.V: nv=2, nNE=1 (c3 con V=NE)');

var cfgCdirecto = CF.configuracionFPV(perfilesC);
eq(dig(out, 'output.posiciones.CONSUMIDOR.configuracion.Ncfg'), cfgCdirecto.Ncfg, 'CONSUMIDOR.configuracion = configuracionFPV directo');
eq(dig(out, 'output.posiciones.CONSUMIDOR.configuracion.Ncfg'), 2, 'Ncfg = 2 (c1 y c2 completos; c3 tiene V=NE)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Decisión B — posición sin respuestas se emite igual, NO_CALCULABLE');
// ═══════════════════════════════════════════════════════════════════════

var soloConsumidor = R.runFPV({ respuestas: [resp('c1', 'CONSUMIDOR', 5, 5, 5)] });
ok(soloConsumidor.ok === true, 'input con solo 1 posición → ok:true (las otras 2 se emiten igual)');
eq(dig(soloConsumidor, 'output.posiciones.PROVEEDOR.sensores.F.estatus'), 'NO_CALCULABLE', 'PROVEEDOR (vacía) → F.estatus = NO_CALCULABLE');
eq(dig(soloConsumidor, 'output.posiciones.PROVEEDOR.sensores.F.L'), null, 'PROVEEDOR.F.L = null');
eq(dig(soloConsumidor, 'output.posiciones.PROVEEDOR.configuracion.calculable'), false, 'PROVEEDOR.configuracion.calculable = false');
eq(dig(soloConsumidor, 'output.posiciones.PROVEEDOR.n_respondientes'), 0, 'PROVEEDOR.n_respondientes = 0');
eq(dig(soloConsumidor, 'output.posiciones.INVERSIONISTA.participacion'), { nrespondentes: 0, PR: null }, 'INVERSIONISTA.participacion vacía');

// ═══════════════════════════════════════════════════════════════════════
seccion('Decisión A/D — ponderación opt-in por posición');
// ═══════════════════════════════════════════════════════════════════════

var conPeso = R.runFPV({
  respuestas: [
    resp('c1', 'CONSUMIDOR', 5, 3, 3, 3), resp('c2', 'CONSUMIDOR', 1, 3, 3, 1),
    resp('i1', 'INVERSIONISTA', 3, 3, 3)
  ],
  posiciones: { CONSUMIDOR: { ponderacion: { metodologia: 'inverso de probabilidad' } } }
});
ok(conPeso.ok === true, 'ponderación declarada + pesos presentes → ok:true');
near(dig(conPeso, 'output.posiciones.CONSUMIDOR.sensores.F.L'), (3 * 100 + 1 * 0) / 4, 'CONSUMIDOR.F.L ponderada = 75');
eq(dig(conPeso, 'output.posiciones.CONSUMIDOR.sensores.F.ponderado'), true, 'F.ponderado = true');
eq(dig(conPeso, 'output.posiciones.CONSUMIDOR.sensores.F.metodologia'), 'inverso de probabilidad', 'F.metodologia registrada');
eq(dig(conPeso, 'output.posiciones.CONSUMIDOR.sensores.F.n_no_ponderado'), 2, 'F.n_no_ponderado = 2 (§9 conservado)');
eq(dig(conPeso, 'output.meta.posiciones.CONSUMIDOR.ponderado'), true, 'meta.CONSUMIDOR.ponderado = true (derivado de la salida real del sensor, no de !!pond)');
eq(dig(conPeso, 'output.meta.posiciones.CONSUMIDOR.metodologia'), 'inverso de probabilidad', 'meta.CONSUMIDOR.metodologia registrada');
eq(dig(conPeso, 'output.meta.posiciones.INVERSIONISTA.ponderado'), false, 'meta.INVERSIONISTA.ponderado = false (posición sin ponderación)');
eq(dig(conPeso, 'output.posiciones.INVERSIONISTA.sensores.F.ponderado'), undefined, 'INVERSIONISTA (sin ponderación declarada) → F NO ponderado');

// ponderación declarada pero falta un peso → ok:false (no lanza hacia afuera)
var faltaPeso = R.runFPV({
  respuestas: [resp('c1', 'CONSUMIDOR', 5, 3, 3, 3), resp('c2', 'CONSUMIDOR', 1, 3, 3)],
  posiciones: { CONSUMIDOR: { ponderacion: { metodologia: 'x' } } }
});
ok(faltaPeso.ok === false, 'ponderación pedida + peso faltante → ok:false');
ok(/posici[oó]n CONSUMIDOR/.test((dig(faltaPeso, 'errores.0') || '')), 'el error nombra la posición CONSUMIDOR');

// ═══════════════════════════════════════════════════════════════════════
seccion('Cobertura — coberturaSensor y participacionPosicion encadenadas');
// ═══════════════════════════════════════════════════════════════════════

var conMarco = R.runFPV({
  respuestas: [resp('c1', 'CONSUMIDOR', 5, 5, 5), resp('c2', 'CONSUMIDOR', 4, 4, 4)],
  posiciones: { CONSUMIDOR: { N_elegibles: 4, diseno: { probabilistico: true, modelo_documentado: false } } }
});
near(dig(conMarco, 'output.posiciones.CONSUMIDOR.sensores.F.CV'), 50, 'F.CV = 100·2/4 = 50');
eq(dig(conMarco, 'output.posiciones.CONSUMIDOR.sensores.F.estatus'), 'INFERENCIAL', 'F.estatus = INFERENCIAL (diseño probabilístico)');
near(dig(conMarco, 'output.posiciones.CONSUMIDOR.participacion.PR'), 50, 'participacion.PR = 100·2/4 = 50');

// ═══════════════════════════════════════════════════════════════════════
seccion('§11 — NUNCA un índice global; la salida pasa validarFPVOutput');
// ═══════════════════════════════════════════════════════════════════════

var contratos = require('./contratos');
ok(contratos.validarFPVOutput(out.output || {}).valido, 'la salida de runFPV pasa validarFPVOutput (autovalidación real)');
contratos.CLAVES_INDICE_GLOBAL_PROHIBIDAS.forEach(function (c) {
  ok(!(c in (dig(out, 'output') || {})) && !(c in (dig(out, 'output.posiciones.CONSUMIDOR') || {})) && !(c in (dig(out, 'output.posiciones.CONSUMIDOR.sensores.F') || {})),
    'ninguna clave `' + c + '` en la salida (raíz / posición / sensor)');
});
// §19.8: ningún sensor con L y sin H/p
['CONSUMIDOR', 'INVERSIONISTA', 'PROVEEDOR'].forEach(function (pos) {
  ['F', 'P', 'V'].forEach(function (sen) {
    var s = dig(out, 'output.posiciones.' + pos + '.sensores.' + sen) || {};
    ok(s.L === null || s.L === undefined || (s.H !== null && s.p !== null && s.H !== undefined && s.p !== undefined), pos + '.' + sen + ': §19.8 — si hay L, hay H y p');
  });
});

// ═══════════════════════════════════════════════════════════════════════
seccion('Contrato de error — input inválido → ok:false, no lanza');
// ═══════════════════════════════════════════════════════════════════════

eq(R.runFPV({ respuestas: [] }).ok, false, 'respuestas vacías → ok:false');
eq(R.runFPV({}).ok, false, 'sin respuestas → ok:false');
eq(R.runFPV(null).ok, false, 'null → ok:false');
eq(R.runFPV({ respuestas: [resp('c1', 'CONSUMIDOR', 9, 3, 3)] }).ok, false, 'F=9 fuera de rango → ok:false');
eq(R.runFPV({ respuestas: [resp('c1', 'CONSUMIDOR', 5, 3, 3), resp('c1', 'CONSUMIDOR', 4, 3, 3)] }).ok, false,
  'persona_id repetido en la misma posición → ok:false');
ok(Array.isArray(R.runFPV({ respuestas: [] }).errores), 'ok:false trae `errores` array');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
// Sobre runFPV.js:
console.log('  1. runFPV emite solo las posiciones con datos (filtra las vacías) — el caso');
console.log('     "omite". → 17 rojos (todo escenario de input parcial: la salida queda');
console.log('     incompleta → validarFPVOutput falla → ok:false → los accesos caen).');
console.log('  3. runFPV ignora `pond` aunque la posición lo pida (siempre no ponderado).');
console.log('     Da 8 rojos en CUALQUIERA de sus dos formas — (a) `var pond = false && …`');
console.log('     o (b) mutar el sitio de uso `pond ? X : Y` → `Y` — porque `meta.ponderado`');
console.log('     y `meta.metodologia` se derivan de `sensores.F` (salida real), no de');
console.log('     `!!pond`. Lista: F.L / F.ponderado / F.metodologia / F.n_no_ponderado /');
console.log('     meta.ponderado / meta.metodologia + los 2 del escenario "peso faltante"');
console.log('     (sin la rama de ponderación nunca se llega a la función que lanza).');
console.log('  5. runFPV pone `salida.posiciones[pos] = {}` para la vacía (bypass del');
console.log('     pipeline) — el caso "no emitir NO_CALCULABLE". → 17 rojos (la');
console.log('     autovalidación §11.1 detecta el bloque vacío → ok:false → cascada).');
console.log('  7. runFPV fuerza `sensores[sen].H = null` tras calcular (bug de post-proceso');
console.log('     simulado). → 30 rojos — la autovalidación §19.8 lo atrapa en TODA salida');
console.log('     con datos → ok:false. Prueba que la autovalidación está conectada.');
console.log('  (No hay una mutación "crashea": el pipeline maneja la posición vacía sin');
console.log('   lanzar, y el try/catch convertiría cualquier excepción en ok:false igual.)');
console.log('');
console.log('  Sobre contratos.js / validarFPVOutput (batería contratos.test.js):');
console.log('  · MUT4 — CLAVES_INDICE_GLOBAL_PROHIBIDAS vaciada → 4 rojos (raíz + anidados).');
console.log('  · MUT5 — regla §19.8 (L sin H/p) quitada → 2 rojos.');
console.log('  · MUT6 — `_indiceGlobalEn` no se llama en sensores → 1 rojo.');
console.log('  · MUT7 — `CE` fuera de SENSOR_OBLIGATORIOS → 1 rojo.');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
