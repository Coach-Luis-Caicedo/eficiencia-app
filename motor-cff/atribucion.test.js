/**
 * motor-cff/atribucion.test.js — Fase 2
 * node motor-cff/atribucion.test.js
 */

'use strict';

var A = require('./atribucion');

var _ok = 0, _fallos = 0;
function seccion(nombre) {
  console.log('\n── ' + nombre + ' ' + '─'.repeat(Math.max(0, 66 - nombre.length)));
}
function ok(cond, msg) {
  if (cond) { _ok++; console.log('  ✓ ' + msg); }
  else { _fallos++; console.log('  ✗ FALLA: ' + msg); }
}
function eq(a, b, msg) {
  var cond = JSON.stringify(a) === JSON.stringify(b);
  ok(cond, msg + (cond ? '' : '  [recibido=' + JSON.stringify(a) + ' esperado=' + JSON.stringify(b) + ']'));
}
function lanza(fn, msg) {
  var lanzo = false;
  try { fn(); } catch (e) { lanzo = true; }
  ok(lanzo, msg);
}

function dimBase(extra) {
  return Object.assign({
    operational_correspondence: 'YES', temporal_correspondence: 'COMPATIBLE',
    organizational_correspondence: 'MATCH', operational_evidence: 'DIRECT',
    system_convergence: 'CONVERGENT', alternative_explanation: 'NONE_DOMINANT'
  }, extra || {});
}

// ═══════════════════════════════════════════════════════════════════════
seccion('§11.1 CONFIRMED — texto literal, sin interpretación');
// ═══════════════════════════════════════════════════════════════════════

eq(A.clasificarAtribucion(dimBase()), 'CONFIRMED', 'las 5 dimensiones exactas + NONE_DOMINANT → CONFIRMED');

['CONVERGENT', 'MIXED', 'ABSENT', 'NOT_APPLICABLE'].forEach(function (sc) {
  eq(A.clasificarAtribucion(dimBase({ system_convergence: sc })), 'CONFIRMED',
    'system_convergence=' + sc + ' → sigue CONFIRMED (§11.1: no se exige ningún valor particular)');
});

eq(A.clasificarAtribucion(dimBase({ operational_correspondence: 'NO' })), 'UNRESOLVED',
  'operational_correspondence=NO → ya no CONFIRMED (y tampoco SUPPORTED: es el negativo explícito)');
eq(A.clasificarAtribucion(dimBase({ temporal_correspondence: 'INCOMPATIBLE' })), 'UNRESOLVED',
  'temporal_correspondence=INCOMPATIBLE → UNRESOLVED');
eq(A.clasificarAtribucion(dimBase({ organizational_correspondence: 'MISMATCH' })), 'UNRESOLVED',
  'organizational_correspondence=MISMATCH → UNRESOLVED');
eq(A.clasificarAtribucion(dimBase({ operational_evidence: 'NONE' })), 'UNRESOLVED',
  'operational_evidence=NONE → ni CONFIRMED ni SUPPORTED (evidencia insuficiente)');
eq(A.clasificarAtribucion(dimBase({ alternative_explanation: 'DOMINANT' })), 'UNRESOLVED',
  'alternative_explanation=DOMINANT → UNRESOLVED (bloquea ambas categorías)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§11.2 SUPPORTED — operacionalización 1 (sin negativo, UNCLEAR admitido)');
// ═══════════════════════════════════════════════════════════════════════

eq(A.clasificarAtribucion(dimBase({ operational_correspondence: 'UNCLEAR' })), 'SUPPORTED',
  'operational_correspondence=UNCLEAR (resto exacto, DIRECT) → SUPPORTED, no CONFIRMED');
eq(A.clasificarAtribucion(dimBase({ temporal_correspondence: 'UNCLEAR' })), 'SUPPORTED',
  'temporal_correspondence=UNCLEAR → SUPPORTED');
eq(A.clasificarAtribucion(dimBase({ organizational_correspondence: 'UNCLEAR' })), 'SUPPORTED',
  'organizational_correspondence=UNCLEAR → SUPPORTED (con system_convergence=CONVERGENT, ver op. 2 abajo)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§11.2 SUPPORTED — operacionalización 2: el caso límite exacto que planteó Luis');
// ═══════════════════════════════════════════════════════════════════════

// El caso que rompía la lectura angosta: DIRECT + una correspondencia UNCLEAR
// + SIN convergencia. Bajo la lectura ANGOSTA (convergencia solo si evidencia
// INDIRECT) esto calificaba SUPPORTED sin corroboración. Bajo la AMPLIADA
// (aprobada), debe caer a UNRESOLVED.
var casoLimiteSinConvergencia = dimBase({ organizational_correspondence: 'UNCLEAR', system_convergence: 'ABSENT' });
eq(A.clasificarAtribucion(casoLimiteSinConvergencia), 'UNRESOLVED',
  'DIRECT + organizational_correspondence=UNCLEAR + system_convergence=ABSENT → UNRESOLVED ' +
  '(la lectura angosta habría dado SUPPORTED aquí — este es exactamente el caso que la descartó)');

var casoLimiteConConvergencia = dimBase({ organizational_correspondence: 'UNCLEAR', system_convergence: 'CONVERGENT' });
eq(A.clasificarAtribucion(casoLimiteConConvergencia), 'SUPPORTED',
  'mismo caso, pero con system_convergence=CONVERGENT → SUPPORTED (la corroboración exigida sí está presente)');

// Extensión (segunda revisión): alternative_explanation=UNKNOWN es el mismo
// estado de "no lo sabemos" que UNCLEAR en las correspondencias — mismo
// tratamiento, por el mismo principio de §25.
var casoUnknownSinConvergencia = dimBase({ alternative_explanation: 'UNKNOWN', system_convergence: 'ABSENT' });
eq(A.clasificarAtribucion(casoUnknownSinConvergencia), 'UNRESOLVED',
  'DIRECT + alternative_explanation=UNKNOWN + system_convergence=ABSENT → UNRESOLVED (mismo patrón que UNCLEAR; ' +
  'sin esta extensión, UNKNOWN pasaba libre a SUPPORTED sin corroboración)');
var casoUnknownConConvergencia = dimBase({ alternative_explanation: 'UNKNOWN', system_convergence: 'CONVERGENT' });
eq(A.clasificarAtribucion(casoUnknownConConvergencia), 'SUPPORTED',
  'mismo caso con system_convergence=CONVERGENT → SUPPORTED (corroboración presente)');

// Evidencia INDIRECT sigue exigiendo convergencia (la mitad de la regla que ya existía)
eq(A.clasificarAtribucion(dimBase({ operational_evidence: 'INDIRECT', system_convergence: 'ABSENT' })), 'UNRESOLVED',
  'INDIRECT sin convergencia → UNRESOLVED');
eq(A.clasificarAtribucion(dimBase({ operational_evidence: 'INDIRECT', system_convergence: 'CONVERGENT' })), 'SUPPORTED',
  'INDIRECT con convergencia → SUPPORTED');

// Con las 3 correspondencias exactas y evidencia DIRECT, NO hace falta convergencia
// (ninguna es UNCLEAR, evidencia no es INDIRECT) — coherente con CONFIRMED tampoco exigiéndola.
eq(A.clasificarAtribucion(dimBase({ system_convergence: 'ABSENT' })), 'CONFIRMED',
  'correspondencias exactas + DIRECT + sin convergencia → sigue CONFIRMED (nada incierto que compensar)');

// ═══════════════════════════════════════════════════════════════════════
seccion('§11.2 SUPPORTED — operacionalización 3: competidoras explícitas');
// ═══════════════════════════════════════════════════════════════════════

eq(A.clasificarAtribucion(dimBase({ alternative_explanation: 'COMPETING', conflicting_evidence: [] })), 'UNRESOLVED',
  'COMPETING con conflicting_evidence vacío → UNRESOLVED (la explicación competidora no quedó explícita)');
eq(A.clasificarAtribucion(dimBase({ alternative_explanation: 'COMPETING', conflicting_evidence: undefined })), 'UNRESOLVED',
  'COMPETING sin conflicting_evidence en absoluto → UNRESOLVED');
eq(A.clasificarAtribucion(dimBase({ alternative_explanation: 'COMPETING', conflicting_evidence: ['ref-hallazgo-x'] })), 'SUPPORTED',
  'COMPETING con conflicting_evidence no vacío → SUPPORTED (queda explícita)');

// ═══════════════════════════════════════════════════════════════════════
seccion('Precedencia CONFIRMED antes que SUPPORTED — caso de solapamiento a propósito');
// ═══════════════════════════════════════════════════════════════════════

var casoQueSolapa = dimBase(); // exacto: satisface CONFIRMED Y, por separado, la fórmula de SUPPORTED también
ok(A.esConfirmed(casoQueSolapa), 'precondición: el caso exacto satisface esConfirmed()');
ok(A.esSupported(casoQueSolapa), 'precondición: el MISMO caso también satisface esSupported() — el solapamiento es real, no hipotético');
eq(A.clasificarAtribucion(casoQueSolapa), 'CONFIRMED', 'con solapamiento real, clasificarAtribucion resuelve a CONFIRMED (la categoría más fuerte), no a SUPPORTED');

// ═══════════════════════════════════════════════════════════════════════
seccion('§11.4 no circularidad — diagnostic_context no puede mover el veredicto');
// ═══════════════════════════════════════════════════════════════════════

eq(A.clasificarAtribucion.length, 1, 'clasificarAtribucion tiene aridad 1 (un solo objeto de dimensiones)');
var conContextoFavorable = dimBase({ diagnostic_context: { aie_ref: 'AIE-MUY-DETERIORADO', cfg_ref: 'CFG-1' } });
var conContextoDesfavorable = dimBase({ diagnostic_context: { aie_ref: 'AIE-EXCELENTE' } });
var sinContexto = dimBase();
eq(A.clasificarAtribucion(conContextoFavorable), A.clasificarAtribucion(sinContexto),
  'diagnostic_context "favorable" no cambia el veredicto frente al caso sin contexto (la función no lo usa)');
eq(A.clasificarAtribucion(conContextoDesfavorable), A.clasificarAtribucion(sinContexto),
  'diagnostic_context "desfavorable" tampoco lo cambia — mismo resultado en los 3 casos');

// ═══════════════════════════════════════════════════════════════════════
seccion('§11.3 UNRESOLVED — catch-all');
// ═══════════════════════════════════════════════════════════════════════

eq(A.clasificarAtribucion(dimBase({ operational_evidence: 'NONE', alternative_explanation: 'UNKNOWN' })), 'UNRESOLVED',
  'evidencia NONE + alternativa desconocida → UNRESOLVED');
lanza(function () { A.clasificarAtribucion(null); }, 'clasificarAtribucion(null) → lanza, no clasifica a ciegas');
lanza(function () { A.clasificarAtribucion('no-es-objeto'); }, 'clasificarAtribucion(no-objeto) → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('§12 profundizar — nueva versión, inmutabilidad de la anterior');
// ═══════════════════════════════════════════════════════════════════════

var v1 = { assessment_id: 'AA-1', assessment_version: 'v1', status: 'UNRESOLVED', rationale: 'evidencia insuficiente' };
var v2 = A.profundizar(v1, { status: 'SUPPORTED', rationale: 'nueva evidencia indirecta convergente', operational_evidence: 'INDIRECT' });

eq(v2.assessment_version, 'v2', 'profundizar incrementa v1 → v2');
eq(v2.version_anterior, 'v1', 'la nueva evaluación registra de qué versión viene');
eq(v2.status, 'SUPPORTED', 'los cambios de la profundización se aplican');
ok(v2 !== v1, 'profundizar devuelve un objeto NUEVO, no el mismo por referencia');
ok(Object.isFrozen(v1), 'la evaluación previa queda congelada tras profundizar (Object.freeze)');
lanza(function () { v1.status = 'CONFIRMED'; }, 'mutar la evaluación previa después de profundizar → lanza (modo estricto + freeze), no se corrompe en silencio');
eq(v1.status, 'UNRESOLVED', 'y su contenido original permanece intacto pase lo que pase con el intento de mutación');

var sinPatronVN = { assessment_id: 'AA-2', assessment_version: 'inicial', status: 'UNRESOLVED' };
var siguiente = A.profundizar(sinPatronVN, { status: 'SUPPORTED' });
eq(siguiente.assessment_version, 'inicial-profundizada', 'versión que no matchea "vN" → se anexa sufijo en vez de fallar silenciosamente');

lanza(function () { A.profundizar(null, {}); }, 'profundizar(null, ...) → lanza');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
