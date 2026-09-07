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
seccion('§11 — validarFPVOutput: esqueleto + prohibición de índice global');
// ═══════════════════════════════════════════════════════════════════════

var salidaOK = { posiciones: { CONSUMIDOR: {}, INVERSIONISTA: {}, PROVEEDOR: {} } };
ok(C.validarFPVOutput(salidaOK).valido, 'salida con las 3 posiciones → válida (forma interna: hueco conocido para Fase 6)');
ok(!C.validarFPVOutput({ posiciones: { CONSUMIDOR: {}, INVERSIONISTA: {} } }).valido, 'falta PROVEEDOR → inválida (§11.1: las 3)');
ok(!C.validarFPVOutput({ posiciones: { CONSUMIDOR: {}, INVERSIONISTA: {}, PROVEEDOR: {}, EMPLEADO: {} } }).valido, 'posición de más → inválida');

var conIndice = { posiciones: { CONSUMIDOR: {}, INVERSIONISTA: {}, PROVEEDOR: {} }, fpv_global: 62 };
ok(!C.validarFPVOutput(conIndice).valido,
  '§11: una clave `fpv_global` en la salida → RECHAZADA (nunca se promedia F+P+V ni se combinan posiciones)');
ok(!C.validarFPVOutput(Object.assign({ indice_fpv: 1 }, salidaOK)).valido, '`indice_fpv` → RECHAZADA');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. clasificarValorRespuesta: "NR" → "NE" (fusionar) → "NE y NR se clasifican DISTINTO" falla.');
console.log('  2. s(r): quitar la cota superior (r>5) → "s(6) lanza" falla.');
console.log('  3. validarFPVInput sin el chequeo de unicidad → "mismo persona_id dos veces → inválido" falla.');
console.log('  4. validarFPVOutput sin la lista de claves prohibidas → "fpv_global → RECHAZADA" falla.');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
