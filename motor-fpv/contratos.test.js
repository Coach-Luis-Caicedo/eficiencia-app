/**
 * motor-fpv/contratos.test.js — Fase 0
 * node motor-fpv/contratos.test.js
 */

'use strict';

var C = require('./contratos');
var E = require('./enums');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }
function lanza(fn, m) { var l = false; try { fn(); } catch (e) { l = true; } ok(l, m); }

function persona(over) {
  return Object.assign({ persona_id: 'p1', posicion: 'CONSUMIDOR', F: 4, P: 3, V: 5 }, over || {});
}
function inp(over) {
  return Object.assign({ respuestas: [persona()] }, over || {});
}

// ═══════════════════════════════════════════════════════════════════════
seccion('enums.js — vocabulario canónico del documento v1.2');
// ═══════════════════════════════════════════════════════════════════════

eq(E.ENUMS.POSICION, ['CONSUMIDOR', 'INVERSIONISTA', 'PROVEEDOR'], 'POSICION (§4) — palabras completas, no C/I/P (P colisiona con el sensor)');
eq(E.ENUMS.SENSOR, ['F', 'P', 'V'], 'SENSOR (§3) — Fiabilidad, Proporcionalidad, Vínculo');
eq(E.ENUMS.RESPUESTA_ESPECIAL, ['NE', 'NR'], 'RESPUESTA_ESPECIAL (§6) — NE y NR, nunca fusionadas');
eq(E.ENUMS.ESTATUS_SENSOR, ['NO_CALCULABLE', 'DESCRIPTIVO', 'CENSAL', 'INFERENCIAL'], 'ESTATUS_SENSOR (§8) — la escalera de suficiencia');
eq(E.ENUMS.ESCALA_ORDINAL, [1, 2, 3, 4, 5], 'ESCALA_ORDINAL (§5/§6)');
eq(E.PARAMS.UMBRAL_CENSAL_CV_ESTADO, 'PENDIENTE_CALIBRACION', '§8: el umbral de "Censal" es calibrable, el documento no da número');

// ═══════════════════════════════════════════════════════════════════════
seccion('§6 — s(r): normalización lineal 25·(r−1), solo enteros 1–5');
// ═══════════════════════════════════════════════════════════════════════

eq([E.s(1), E.s(2), E.s(3), E.s(4), E.s(5)], [0, 25, 50, 75, 100], 's(1..5) = 0, 25, 50, 75, 100 (§6)');
lanza(function () { E.s(0); }, 's(0) → lanza (fuera de 1–5)');
lanza(function () { E.s(6); }, 's(6) → lanza');
lanza(function () { E.s(3.5); }, 's(3.5) → lanza (no entero)');
lanza(function () { E.s('NE'); }, 's("NE") → lanza — NE no tiene valor numérico, no se imputa (§6)');
lanza(function () { E.s('NR'); }, 's("NR") → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('§6 — clasificarValorRespuesta: NE ≠ NR, nunca fusionadas ni imputadas');
// ═══════════════════════════════════════════════════════════════════════

eq([C.clasificarValorRespuesta(1), C.clasificarValorRespuesta(3), C.clasificarValorRespuesta(5)],
  ['ORDINAL', 'ORDINAL', 'ORDINAL'], '1, 3, 5 → ORDINAL');
eq(C.clasificarValorRespuesta('NE'), 'NE', '"NE" → NE');
eq(C.clasificarValorRespuesta('NR'), 'NR', '"NR" → NR');
ok(C.clasificarValorRespuesta('NE') !== C.clasificarValorRespuesta('NR'), '§6: NE y NR se clasifican DISTINTO — nunca se fusionan');
eq(C.clasificarValorRespuesta(undefined), 'INVALIDO', 'undefined → INVALIDO (campo ausente NO es NR silencioso — decisión C)');
eq(C.clasificarValorRespuesta(null), 'INVALIDO', 'null → INVALIDO');
eq(C.clasificarValorRespuesta(0), 'INVALIDO', '0 → INVALIDO (fuera de 1–5)');
eq(C.clasificarValorRespuesta(6), 'INVALIDO', '6 → INVALIDO');
eq(C.clasificarValorRespuesta(3.5), 'INVALIDO', '3.5 → INVALIDO (no entero)');
eq(C.clasificarValorRespuesta('3'), 'INVALIDO', '"3" (cadena) → INVALIDO — el ordinal es número, no cadena');
eq(C.clasificarValorRespuesta('ne'), 'INVALIDO', '"ne" minúscula → INVALIDO (igualdad estricta)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§14 — validarFPVInput: estructura por Persona');
// ═══════════════════════════════════════════════════════════════════════

ok(C.validarFPVInput(inp()).valido, 'input mínimo correcto (1 persona, F/P/V ordinales) → válido');
ok(C.validarFPVInput(inp({ respuestas: [persona({ V: 'NE' }), persona({ persona_id: 'p2', F: 'NR' })] })).valido,
  'F/P/V pueden ser "NE" o "NR" → válido');
ok(C.validarFPVInput(inp({ respuestas: [persona({ peso: 1.5 })] })).valido, 'peso > 0 → válido');

var rSinResp = C.validarFPVInput({ posiciones: {} });
ok(!rSinResp.valido && rSinResp.faltantes.some(function (f) { return f.indexOf('respuestas') !== -1; }), 'sin `respuestas` → inválido');
ok(!C.validarFPVInput({ respuestas: [] }).valido, '`respuestas` vacío → inválido');

var rPid = C.validarFPVInput(inp({ respuestas: [persona({ persona_id: '' })] }));
ok(!rPid.valido && rPid.invalidos.some(function (f) { return f.indexOf('persona_id') !== -1; }), 'persona_id "" (presente pero vacío) → inválido');
var rPidF = C.validarFPVInput(inp({ respuestas: [persona({ persona_id: undefined })] }));
ok(!rPidF.valido && rPidF.faltantes.some(function (f) { return f.indexOf('persona_id') !== -1; }), 'persona_id ausente → en faltantes');

var rPos = C.validarFPVInput(inp({ respuestas: [persona({ posicion: 'CLIENTE' })] }));
ok(!rPos.valido && rPos.invalidos.some(function (m) { return m.indexOf('posicion') !== -1; }), 'posicion "CLIENTE" (fuera de §4) → inválido');

var rF = C.validarFPVInput(inp({ respuestas: [persona({ F: 0 })] }));
ok(!rF.valido && rF.invalidos.some(function (m) { return m.indexOf('F') !== -1; }), 'F=0 → inválido (1–5 | NE | NR)');
var rF6 = C.validarFPVInput(inp({ respuestas: [persona({ P: 6 })] }));
ok(!rF6.valido, 'P=6 → inválido');
var rFstr = C.validarFPVInput(inp({ respuestas: [persona({ V: '4' })] }));
ok(!rFstr.valido, 'V="4" (cadena) → inválido');

var rPeso = C.validarFPVInput(inp({ respuestas: [persona({ peso: 0 })] }));
ok(!rPeso.valido, 'peso = 0 → inválido (§9: > 0)');
ok(!C.validarFPVInput(inp({ respuestas: [persona({ peso: -1 })] })).valido, 'peso negativo → inválido');

// ═══════════════════════════════════════════════════════════════════════
seccion('§7.3 / decisión E — persona_id único por posición');
// ═══════════════════════════════════════════════════════════════════════

var rDup = C.validarFPVInput(inp({ respuestas: [persona(), persona({ F: 2 })] })); // mismo persona_id + posicion
ok(!rDup.valido && rDup.invalidos.some(function (m) { return m.indexOf('repetido') !== -1; }),
  'mismo persona_id DOS veces en la misma posición → inválido');

var rDosPos = C.validarFPVInput(inp({ respuestas: [
  persona({ persona_id: 'x', posicion: 'CONSUMIDOR' }),
  persona({ persona_id: 'x', posicion: 'PROVEEDOR' })
] }));
ok(rDosPos.valido,
  'mismo persona_id en DOS posiciones distintas → VÁLIDO (decisión E: dos respondientes independientes, el motor nunca los une)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§8 / §7.2.D — posiciones.<POS>: N_elegibles + diseno declarado');
// ═══════════════════════════════════════════════════════════════════════

ok(C.validarFPVInput(inp({ posiciones: { CONSUMIDOR: { N_elegibles: 500 } } })).valido, 'N_elegibles entero > 0 → válido');
ok(C.validarFPVInput(inp({ posiciones: { INVERSIONISTA: { diseno: { probabilistico: true, modelo_documentado: true } } } })).valido,
  'diseno con 2 booleanos → válido (el motor registra la afirmación, no la verifica — §8)');
ok(!C.validarFPVInput(inp({ posiciones: { CONSUMIDOR: { N_elegibles: 0 } } })).valido, 'N_elegibles = 0 → inválido');
ok(!C.validarFPVInput(inp({ posiciones: { CONSUMIDOR: { N_elegibles: 12.5 } } })).valido, 'N_elegibles no entero → inválido');
ok(!C.validarFPVInput(inp({ posiciones: { CONSUMIDOR: { diseno: { probabilistico: 'si', modelo_documentado: true } } } })).valido,
  'diseno.probabilistico = "si" (no boolean) → inválido');
ok(!C.validarFPVInput(inp({ posiciones: { ACCIONISTA: {} } })).valido, 'posiciones con clave que no es §4 → inválido');

// ═══════════════════════════════════════════════════════════════════════
seccion('§11 / §19.8 — validarFPVOutput COMPLETO (reapertura Fase 6)');
// ═══════════════════════════════════════════════════════════════════════

function sensorOK(over) {
  return Object.assign({
    sensor: 'F', estatus: 'DESCRIPTIVO', nv: 3, nNE: 0, nNR: 0,
    L: 50, mediana: 3, p: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 0 }, H: 0, C: 100, CE: 100
  }, over || {});
}
function configOK(over) {
  return Object.assign({
    Ncfg: 3, calculable: true, Lstar: { F: 50, P: 50, V: 50 }, G: 0,
    limitante: ['F', 'P', 'V'], fortalecida: ['F', 'P', 'V']
  }, over || {});
}
function posOK(over) {
  return Object.assign({
    etiqueta: 'FPV-C', n_respondientes: 3, participacion: { nrespondentes: 3, PR: null },
    sensores: { F: sensorOK(), P: sensorOK({ sensor: 'P' }), V: sensorOK({ sensor: 'V' }) },
    configuracion: configOK()
  }, over || {});
}
function salidaOK(over) {
  return Object.assign({
    posiciones: { CONSUMIDOR: posOK(), INVERSIONISTA: posOK({ etiqueta: 'FPV-I' }), PROVEEDOR: posOK({ etiqueta: 'FPV-P' }) },
    meta: { version: 'v1.2' }
  }, over || {});
}
// pasar un override a UNA posición manteniendo la salida por lo demás válida
function salidaConSensor(sensorOver) {
  var s = salidaOK();
  s.posiciones.CONSUMIDOR.sensores.F = sensorOver;
  return s;
}
function salidaConConfig(cfgOver) {
  var s = salidaOK();
  s.posiciones.CONSUMIDOR.configuracion = cfgOver;
  return s;
}

ok(C.validarFPVOutput(salidaOK()).valido, 'salida completa bien formada → válida');
ok(!C.validarFPVOutput({ posiciones: { CONSUMIDOR: posOK(), INVERSIONISTA: posOK() } }).valido, 'falta PROVEEDOR → inválida (§11.1: las 3)');
ok(!C.validarFPVOutput(salidaOK({ posiciones: Object.assign(salidaOK().posiciones, { EMPLEADO: posOK() }) })).valido, 'posición de más → inválida');
ok(!C.validarFPVOutput(salidaOK({ meta: {} })).valido, 'sin `meta.version` → inválida (trazabilidad §14)');

// §11 — índice global en la raíz Y anidado
ok(!C.validarFPVOutput(salidaOK({ fpv_global: 62 })).valido, '§11: `fpv_global` en la raíz → RECHAZADA');
ok(!C.validarFPVOutput(salidaOK({ indice_fpv: 1 })).valido, '`indice_fpv` en la raíz → RECHAZADA');
ok(!C.validarFPVOutput(salidaConSensor(sensorOK({ fpv_total: 40 }))).valido, '§11: `fpv_total` DENTRO de un sensor → RECHAZADA (chequeo anidado)');
{
  var sPos = salidaOK(); sPos.posiciones.CONSUMIDOR.fpv_compuesto = 55;
  ok(!C.validarFPVOutput(sPos).valido, '§11: `fpv_compuesto` en un bloque de posición → RECHAZADA');
}

// §11.1 — contenido obligatorio por sensor
ok(!C.validarFPVOutput(salidaConSensor(sensorOK({ CE: undefined }))).valido, 'sensor sin `CE` → inválida (§11.1)');
ok(!C.validarFPVOutput(salidaConSensor((function () { var s = sensorOK(); delete s.mediana; return s; })())).valido, 'sensor sin `mediana` → inválida (§11.1)');

// §19.8 regla 1 — L nunca sin H y distribución
ok(!C.validarFPVOutput(salidaConSensor(sensorOK({ L: 50, H: null }))).valido, '§19.8: `L` con `H` nulo → RECHAZADA');
ok(!C.validarFPVOutput(salidaConSensor(sensorOK({ L: 50, p: null }))).valido, '§19.8: `L` con `p` (distribución) nula → RECHAZADA');
ok(C.validarFPVOutput(salidaConSensor(sensorOK({ L: null, mediana: null, p: null, H: null, C: null }))).valido,
  'sensor NO_CALCULABLE (todo null) → VÁLIDA — §19.8 solo aplica cuando HAY L');

// §8 — CENSAL debe mostrar CV
ok(!C.validarFPVOutput(salidaConSensor(sensorOK({ estatus: 'CENSAL', CV: null }))).valido, '§8: estatus CENSAL sin `CV` → RECHAZADA');
ok(C.validarFPVOutput(salidaConSensor(sensorOK({ estatus: 'CENSAL', CV: 92 }))).valido, 'CENSAL con `CV` → válida');

// §11.2 — salida configuracional
ok(!C.validarFPVOutput(salidaConConfig(configOK({ G: undefined }))).valido, 'config sin `G` → inválida (§11.2)');
ok(!C.validarFPVOutput(salidaConConfig(configOK({ estatus: 'DESCRIPTIVO' }))).valido, 'config CON `estatus` → inválida (decisión C de Fase 4: §11.2 no lo lista)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. clasificarValorRespuesta: "NR" → "NE" (fusionar) → 2 rojos.');
console.log('  2. s(r): quitar la cota superior (r>5) → 1 rojo ("s(6) lanza").');
console.log('  3. validarFPVInput sin el chequeo de unicidad → 1 rojo.');
console.log('  4. CLAVES_INDICE_GLOBAL_PROHIBIDAS vaciada → 4 rojos (raíz ×2 + sensor + posición;');
console.log('     en Fase 0 eran 2 — la reapertura de Fase 6 añadió los chequeos anidados).');
console.log('  5. validarFPVOutput: quitar la regla §19.8 (L sin H/p) → 2 rojos.');
console.log('  6. validarFPVOutput: `_indiceGlobalEn` NO se llama en sensores → 1 rojo');
console.log('     (el chequeo anidado en el nivel de sensor desaparece).');
console.log('  7. `CE` fuera de SENSOR_OBLIGATORIOS → 1 rojo ("sensor sin `CE` → inválida").');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
