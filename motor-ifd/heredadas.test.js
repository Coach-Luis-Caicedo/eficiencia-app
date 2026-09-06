/**
 * motor-ifd/heredadas.test.js — Fase 6
 * node motor-ifd/heredadas.test.js
 */

'use strict';

var H = require('./heredadas');
var C = require('./contratos');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }
function eq(a, b, m) { var c = JSON.stringify(a) === JSON.stringify(b); ok(c, m + (c ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']')); }

function k(over) {
  return Object.assign({ event_id: 'E1', resource_id: 'R1', cost_component_id: 'CC1', period_id: '2026-Q1' }, over || {});
}

// ═══════════════════════════════════════════════════════════════════════
seccion('§24 — construirSalidasHeredadas: marcador congelado, nunca cifra');
// ═══════════════════════════════════════════════════════════════════════

var sh = H.construirSalidasHeredadas();
eq(Object.keys(sh).sort(), ['CFD', 'CFR', 'ROI_P', 'TRE', 'VER'], 'las 5 claves de §24');
eq(sh.VER, { estado: 'PENDIENTE_AUDITORIA' }, 'VER = { estado: "PENDIENTE_AUDITORIA" }, no un número');
ok(Object.keys(sh).every(function (key) { return sh[key].estado === 'PENDIENTE_AUDITORIA' && Object.keys(sh[key]).length === 1; }),
  'las 5 son exactamente el marcador (una sola clave `estado`)');

// §24: "No presentar CFR = VER" — ni siquiera el mismo objeto
ok(sh.CFR !== sh.VER, 'CFR y VER son objetos SEPARADOS (no comparten referencia — §24)');
sh.VER.estado = 'MUTADO_EN_EL_TEST';
ok(sh.CFR.estado === 'PENDIENTE_AUDITORIA', 'mutar sh.VER no toca sh.CFR (confirmación de que no es el mismo objeto)');

// cross-check con el validador de forma (contratos.js, reapertura #5)
ok(C.validarSalidasHeredadas(H.construirSalidasHeredadas()).valido,
  'construirSalidasHeredadas() pasa validarSalidasHeredadas por construcción');

// ═══════════════════════════════════════════════════════════════════════
seccion('§25 — claveSolapamiento: 4-tupla evento×recurso×componente×período');
// ═══════════════════════════════════════════════════════════════════════

ok(H.claveSolapamiento(k()).valido, 'clave completa (4 identificadores) → válida');
ok(H.claveSolapamiento(k({ event_id: 42 })).valido, 'identificador numérico finito → válido');
ok(!H.claveSolapamiento(k({ period_id: undefined })).valido, 'falta period_id → inválida');
ok(!H.claveSolapamiento(k({ resource_id: '  ' })).valido, 'resource_id vacío → inválido');
ok(!H.claveSolapamiento(k({ cost_component_id: null })).valido, 'cost_component_id null → inválido');
ok(!H.claveSolapamiento('E1|R1|CC1|Q1').valido, 'string plano (no objeto) → inválida');

// ═══════════════════════════════════════════════════════════════════════
seccion('§25 — overlapMaterial: material ⟺ los 4 identificadores iguales');
// ═══════════════════════════════════════════════════════════════════════

ok(H.overlapMaterial(k(), k()), 'claves idénticas → solapamiento MATERIAL (el mismo costo)');
ok(!H.overlapMaterial(k(), k({ period_id: '2026-Q2' })), 'mismo evento+recurso+componente, distinto PERÍODO → NO material (costos distintos)');
ok(!H.overlapMaterial(k(), k({ cost_component_id: 'CC2' })), 'distinto COMPONENTE DE COSTO → NO material');
ok(!H.overlapMaterial(k(), k({ event_id: 'E2' })), 'distinto EVENTO → NO material');
ok(!H.overlapMaterial(k({ period_id: 3 }), k({ period_id: '3' })), 'período 3 (número) vs "3" (cadena) → NO material (igualdad estricta)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§25 / §35 — detectarDobleConteo: alerta A14 + bloquea la suma');
// ═══════════════════════════════════════════════════════════════════════

var sinSolape = H.detectarDobleConteo([k(), k({ period_id: '2026-Q2' }), k({ event_id: 'E2' })]);
eq(sinSolape.pares_solapados, [], '3 claves distintas → sin pares solapados');
eq(sinSolape.alerta, null, 'sin solapamiento → sin A14');
eq(sinSolape.bloquear_agregacion, false, 'sin solapamiento → agregación NO bloqueada');

var conSolape = H.detectarDobleConteo([k(), k({ resource_id: 'R9' }), k()]);
eq(conSolape.pares_solapados, [[0, 2]], 'claves 0 y 2 idénticas → par [0,2] material');
eq(conSolape.alerta, 'A14', 'solapamiento material → A14 DOBLE_CONTEO_POTENCIAL');
eq(conSolape.bloquear_agregacion, true, '§25/§35: "impedir suma automática" → bloquear_agregacion = true');

var conBasura = H.detectarDobleConteo([k(), { event_id: 'E1' }]);
ok(conBasura.invalidos.length === 1 && conBasura.invalidos[0].indexOf('clave[1]') !== -1, 'clave mal formada → reportada en invalidos, no rompe el resto');

var noArray = H.detectarDobleConteo('no soy un array');
ok(!noArray.bloquear_agregacion && noArray.invalidos.length === 1, 'entrada no-array → invalidos, sin bloqueo espurio');

// una sola clave → no puede solaparse consigo misma
eq(H.detectarDobleConteo([k()]).alerta, null, 'una sola clave → no hay par, sin A14');

// ═══════════════════════════════════════════════════════════════════════
seccion('§38 — construirRegistroCalibracion: los 6 datos + el parámetro');
// ═══════════════════════════════════════════════════════════════════════

var reg = H.construirRegistroCalibracion({
  parametro: 'ENVELOPE_POR_FEP[3]', anterior: 0.07, nuevo: 0.05,
  evidencia: 'piloto 2026', muestra: 'n=48 EPDs', efecto: 'amplitud -2pp', version: 'ifd-1.3.0'
});
ok(reg.valido, 'registro completo (7 campos) → válido');
eq(reg.registro.parametro, 'ENVELOPE_POR_FEP[3]', 'el registro conserva el parámetro');

var regIncompleto = H.construirRegistroCalibracion({ parametro: 'X', anterior: 1, nuevo: 2 });
ok(!regIncompleto.valido && regIncompleto.faltantes.indexOf('evidencia') !== -1 && regIncompleto.faltantes.indexOf('version') !== -1,
  'faltan evidencia/muestra/efecto/version → inválido, nombrados en faltantes (§38 los exige todos)');

var regVacio = H.construirRegistroCalibracion({ parametro: '  ', anterior: 1, nuevo: 2, evidencia: 'x', muestra: 'x', efecto: 'x', version: 'x' });
ok(!regVacio.valido, 'parámetro en blanco → inválido');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. validarSalidasHeredadas (contratos.js) sin el chequeo de forma del marcador →');
console.log('     "VER = 21772.8 (número) → RECHAZADO" pasa a aceptarse (una cifra fabricada se cuela).');
console.log('  2. overlapMaterial con OR en vez de AND → "distinto período → NO material" falla');
console.log('     (un costo de otro período se marcaría como el mismo y se bloquearía de más).');
console.log('  3. detectarDobleConteo no setea bloquear_agregacion → "impedir suma automática" falla');
console.log('     (se emite A14 pero la agregación seguiría sumando).');
console.log('  4. construirSalidasHeredadas: sh.CFR = sh.VER (misma referencia) → "CFR y VER son');
console.log('     objetos separados" falla — ancla §24 "no presentar CFR = VER".');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
