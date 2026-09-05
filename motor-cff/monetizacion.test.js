/**
 * motor-cff/monetizacion.test.js — Fase 1
 * node motor-cff/monetizacion.test.js
 */

'use strict';

var M = require('./monetizacion');

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

// ═══════════════════════════════════════════════════════════════════════
seccion('resolverValorComponente — DIRECT_VALUE / DERIVED_FORMULA (transporte, sin cálculo)');
// ═══════════════════════════════════════════════════════════════════════

eq(M.resolverValorComponente({ calculation_mode: 'DIRECT_VALUE', original_value: 500 }), { valor: 500 },
  'DIRECT_VALUE con original_value → se transporta tal cual');
eq(M.resolverValorComponente({ calculation_mode: 'DIRECT_VALUE', original_value_min: 400, original_value_max: 600 }),
  { valorMin: 400, valorMax: 600 }, 'DIRECT_VALUE con rango ya dado → se transporta el rango');
lanza(function () { M.resolverValorComponente({ calculation_mode: 'DIRECT_VALUE' }); },
  'DIRECT_VALUE sin valor ni rango → lanza (este modo no calcula, solo transporta)');
eq(M.resolverValorComponente({ calculation_mode: 'DERIVED_FORMULA', original_value: 777 }), { valor: 777 },
  'DERIVED_FORMULA con original_value → se transporta igual que DIRECT_VALUE (no se evalúa la fórmula)');
lanza(function () { M.resolverValorComponente({ calculation_mode: 'DERIVED_FORMULA' }); },
  'DERIVED_FORMULA sin valor ni rango → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('resolverValorComponente — UNIT_RATE (el único modo que calcula)');
// ═══════════════════════════════════════════════════════════════════════

eq(M.resolverValorComponente({ calculation_mode: 'UNIT_RATE', quantity: 10 }, { basis_value: 15000 }),
  { valor: 150000 }, 'UNIT_RATE con base puntual → quantity × basis_value');
eq(M.resolverValorComponente({ calculation_mode: 'UNIT_RATE', quantity: 10 }, { basis_value_min: 14000, basis_value_max: 16000 }),
  { valorMin: 140000, valorMax: 160000 }, 'UNIT_RATE con base en rango → propagación matemática (quantity × min, quantity × max)');
lanza(function () { M.resolverValorComponente({ calculation_mode: 'UNIT_RATE', quantity: 10 }, null); },
  'UNIT_RATE sin base → lanza');
lanza(function () { M.resolverValorComponente({ calculation_mode: 'UNIT_RATE', quantity: 'diez' }, { basis_value: 1 }); },
  'UNIT_RATE con quantity no numérico → lanza');
lanza(function () { M.resolverValorComponente({ calculation_mode: 'UNIT_RATE', quantity: 10 }, {}); },
  'UNIT_RATE con base sin basis_value ni rango → lanza');
lanza(function () { M.resolverValorComponente({ calculation_mode: 'ALGO_RARO' }, {}); },
  'calculation_mode desconocido → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('aplicarResultadoAComponente — coherencia rango ⇒ nunca OBSERVED');
// ═══════════════════════════════════════════════════════════════════════

var compPunto = M.aplicarResultadoAComponente(
  { monetization_status: 'OBSERVED', original_value: 999 }, { valor: 150000 }
);
eq(compPunto.original_value, 150000, 'resultado punto → original_value fijado');
ok(compPunto.original_value_min === undefined && compPunto.original_value_max === undefined, 'resultado punto → sin campos de rango');

var compRango = M.aplicarResultadoAComponente(
  { monetization_status: 'ESTIMATED' }, { valorMin: 140000, valorMax: 160000 }
);
eq([compRango.original_value_min, compRango.original_value_max], [140000, 160000], 'resultado rango con ESTIMATED → campos de rango fijados');
ok(compRango.original_value === undefined, 'resultado rango → sin original_value puntual');

lanza(function () {
  M.aplicarResultadoAComponente({ monetization_status: 'OBSERVED' }, { valorMin: 1, valorMax: 2 });
}, 'resultado rango con monetization_status=OBSERVED → lanza (defensa en profundidad de la regla 8 de contratos.js)');

// ═══════════════════════════════════════════════════════════════════════
seccion('calcularLostCapacity — §8.2 (INV-CFF-46): reconstrucción obligatoria');
// ═══════════════════════════════════════════════════════════════════════

// Receta exacta pedida por Luis: LOST_CAPACITY, resource_type=AUSENTISMO,
// cantidad en días, MONETARY_BASIS de tipo tarifa/salario, SIN reconstrucción.
var componenteAusentismo = {
  primary_mechanism: 'LOST_CAPACITY', resource_type: 'AUSENTISMO',
  calculation_mode: 'UNIT_RATE', quantity: 3 // 3 días
};
var baseSalario = { basis_type: 'ACCOUNTING_ACTUAL', basis_value: 80000 }; // tarifa/salario diario

var rSinReconstruccion = M.calcularLostCapacity(componenteAusentismo, baseSalario, {});
ok(rSinReconstruccion.rechazado === true, 'AUSENTISMO en días, tarifa/salario, SIN reconstrucción → RECHAZADO (no solo "sin atajo")');
eq(rSinReconstruccion.monetization_status, 'N_A', 'el rechazo se declara monetization_status=N_A, no se produce ninguna cifra');
ok(rSinReconstruccion.motivo.indexOf('INV-CFF-46') !== -1, 'el motivo cita el invariante que protege');

var rSinOpts = M.calcularLostCapacity(componenteAusentismo, baseSalario);
ok(rSinOpts.rechazado === true, 'mismo caso sin pasar opts en absoluto → también rechazado (no lanza por opts undefined)');

var rConReconstruccionInvalida = M.calcularLostCapacity(componenteAusentismo, baseSalario, { reconstruccion: { tipo: 'CUALQUIER_COSA' } });
ok(rConReconstruccionInvalida.rechazado === true, 'reconstrucción con tipo fuera de TIPOS_RECONSTRUCCION → sigue rechazado, no basta con declarar "algo"');

var rConReconstruccion = M.calcularLostCapacity(componenteAusentismo, baseSalario, { reconstruccion: { tipo: 'COBERTURA', descripcion: 'cobertura con personal adicional' } });
ok(rConReconstruccion.rechazado === false, 'con reconstrucción válida (tipo=COBERTURA) → SÍ calcula');
eq(rConReconstruccion.valor, 240000, 'con reconstrucción válida → 3 días × 80000 = 240000, mismo cálculo de UNIT_RATE');
eq(rConReconstruccion.reconstruccion.tipo, 'COBERTURA', 'la reconstrucción declarada queda registrada en el resultado (trazabilidad)');

var componenteAveria = Object.assign({}, componenteAusentismo, { resource_type: 'AVERIA_TECNICA' });
var rRecursoNoExigido = M.calcularLostCapacity(componenteAveria, baseSalario, {});
ok(rRecursoNoExigido.rechazado === false, 'resource_type fuera de la lista que exige reconstrucción (AVERIA_TECNICA) → calcula directo, sin exigir reconstrucción');

lanza(function () { M.calcularLostCapacity({ primary_mechanism: 'ADDITIONAL_CONSUMPTION' }, baseSalario, {}); },
  'primary_mechanism distinto de LOST_CAPACITY → lanza (función específica de ese mecanismo)');

// ═══════════════════════════════════════════════════════════════════════
seccion('calcularLostCapacity — verificación por MUTACIÓN (no solo el assert de arriba)');
// ═══════════════════════════════════════════════════════════════════════
// Nota de proceso: la mutación real (degradar RECURSOS_QUE_EXIGEN_RECONSTRUCCION
// en monetizacion.js, confirmar que rSinReconstruccion.rechazado empieza a dar
// false, y revertir) se ejecuta como paso de Bash aparte, fuera de este archivo
// — mismo patrón que la mutación de include_in_cff en contratos.test.js. Este
// bloque solo dokumenta en el propio test qué exactamente se espera que falle:
ok(RECURSOS_QUE_EXIGEN_RECONSTRUCCION_INCLUYE_AUSENTISMO(),
  'precondición de la mutación: AUSENTISMO está en RECURSOS_QUE_EXIGEN_RECONSTRUCCION (si esto es false, la regla ya no aplicaría a este caso)');

function RECURSOS_QUE_EXIGEN_RECONSTRUCCION_INCLUYE_AUSENTISMO() {
  return M.RECURSOS_QUE_EXIGEN_RECONSTRUCCION.indexOf('AUSENTISMO') !== -1;
}

// ═══════════════════════════════════════════════════════════════════════
seccion('agregarPorMecanismo — §35 (CA/VCP/CR/VNC)');
// ═══════════════════════════════════════════════════════════════════════

var vacio = M.agregarPorMecanismo([]);
['ADDITIONAL_CONSUMPTION', 'LOST_CAPACITY', 'REPLACEMENT', 'UNCAPTURED_VALUE'].forEach(function (mec) {
  ok(vacio[mec].nComponentes === 0 && vacio[mec].suma === null, 'array vacío → ' + mec + ' en 0 componentes, suma null (no 0 fabricado)');
});

var componentesPunto = [
  { primary_mechanism: 'ADDITIONAL_CONSUMPTION', original_currency: 'COP', valor: 100 },
  { primary_mechanism: 'ADDITIONAL_CONSUMPTION', original_currency: 'COP', valor: 50 },
  { primary_mechanism: 'REPLACEMENT', original_currency: 'COP', valor: 1000 }
];
var rAgregadoPunto = M.agregarPorMecanismo(componentesPunto);
eq(rAgregadoPunto.ADDITIONAL_CONSUMPTION.suma, 150, 'CA = 100+50 = 150 (dos componentes de ADDITIONAL_CONSUMPTION)');
eq(rAgregadoPunto.ADDITIONAL_CONSUMPTION.nComponentes, 2, 'CA cuenta 2 componentes');
eq(rAgregadoPunto.REPLACEMENT.suma, 1000, 'CR = 1000 (un solo componente)');
eq(rAgregadoPunto.LOST_CAPACITY.nComponentes, 0, 'VCP sin componentes → 0, no se inventa un cero de suma');
ok(!rAgregadoPunto.ADDITIONAL_CONSUMPTION.esRango, 'todo punto → esRango=false');

var componentesMixtos = [
  { primary_mechanism: 'LOST_CAPACITY', original_currency: 'COP', valor: 200 },
  { primary_mechanism: 'LOST_CAPACITY', original_currency: 'COP', valorMin: 100, valorMax: 300 }
];
var rAgregadoMixto = M.agregarPorMecanismo(componentesMixtos);
ok(rAgregadoMixto.LOST_CAPACITY.esRango, 'un solo componente en rango entre varios → todo el agregado se vuelve rango');
eq(rAgregadoMixto.LOST_CAPACITY.sumaMin, 300, 'VCP sumaMin = 200 (punto tratado como min=max) + 100 = 300');
eq(rAgregadoMixto.LOST_CAPACITY.sumaMax, 500, 'VCP sumaMax = 200 + 300 = 500');
ok(rAgregadoMixto.LOST_CAPACITY.suma === null, 'con esRango=true, "suma" puntual queda null — no se colapsa el rango a un número');

lanza(function () { M.agregarPorMecanismo([{ primary_mechanism: 'NO_EXISTE', original_currency: 'COP', valor: 1 }]); },
  'primary_mechanism desconocido → lanza');
lanza(function () { M.agregarPorMecanismo([{ primary_mechanism: 'REPLACEMENT', original_currency: 'COP' }]); },
  'componente sin valor resuelto (ni valor ni rango) → lanza');
lanza(function () {
  M.agregarPorMecanismo([
    { primary_mechanism: 'REPLACEMENT', original_currency: 'COP', valor: 1 },
    { primary_mechanism: 'REPLACEMENT', original_currency: 'USD', valor: 1 }
  ]);
}, 'componentes con monedas distintas → lanza (INV-CFF-28, no se suma sin normalizar — eso es Fase 4a)');

// ═══════════════════════════════════════════════════════════════════════
seccion('preferirBaseMonetaria — §8.5 (COMPONENT_BASED antes que benchmark)');
// ═══════════════════════════════════════════════════════════════════════

var candidatasConInterna = [
  { monetary_basis_id: 'MB-BENCH', basis_type: 'EXTERNAL_BENCHMARK' },
  { monetary_basis_id: 'MB-INTERNA', basis_type: 'ACCOUNTING_ACTUAL' }
];
var rPreferencia = M.preferirBaseMonetaria(candidatasConInterna);
eq(rPreferencia.seleccionada.monetary_basis_id, 'MB-INTERNA', 'con una base interna disponible, se prefiere sobre el benchmark aunque venga primero en la lista');
eq(rPreferencia.flags, [], 'sin limitación cuando hay base no-benchmark disponible');

var soloBenchmark = [
  { monetary_basis_id: 'MB-B1', basis_type: 'EXTERNAL_BENCHMARK' },
  { monetary_basis_id: 'MB-B2', basis_type: 'EXTERNAL_BENCHMARK' }
];
var rSoloBenchmark = M.preferirBaseMonetaria(soloBenchmark);
eq(rSoloBenchmark.seleccionada.monetary_basis_id, 'MB-B1', 'si todas son benchmark, se usa la primera mecánicamente');
eq(rSoloBenchmark.flags, ['SOLO_BENCHMARK_DISPONIBLE'], 'se marca explícitamente la limitación (§8.5: nunca sustituto automático silencioso)');

lanza(function () { M.preferirBaseMonetaria([]); }, 'lista vacía de candidatas → lanza');
lanza(function () { M.preferirBaseMonetaria(null); }, 'candidatas no-array → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('calcularReposicion — §8.3 (INV-CFF-45 / AC33): no múltiplos de salario');
// ═══════════════════════════════════════════════════════════════════════

var compRepo = { primary_mechanism: 'REPLACEMENT', calculation_mode: 'UNIT_RATE', quantity: 1 };
var baseRepo = { basis_type: 'CALCULATED_INTERNAL', basis_value: 4200000 };

var rMultiplo = M.calcularReposicion(compRepo, baseRepo, { esMultiploUniversalSalario: true });
ok(rMultiplo.rechazado && rMultiplo.monetization_status === 'N_A', 'múltiplo universal de salario → RECHAZADO, monetization_status=N_A (§8.3)');
ok(rMultiplo.motivo.indexOf('INV-CFF-45') !== -1, 'el motivo cita el invariante');

var rSinComponentes = M.calcularReposicion(compRepo, baseRepo, {});
ok(rSinComponentes.rechazado, 'sin componentes reales de reposición declarados → RECHAZADO (no se calcula CR sin evidencia)');

var rComponenteInvalido = M.calcularReposicion(compRepo, baseRepo, { componentesReposicion: [{ tipo: 'INVENTADO', valor: 100 }] });
ok(rComponenteInvalido.rechazado, 'componente de reposición con tipo fuera de la lista de §8.3 → sigue rechazado');

var rRepoOk = M.calcularReposicion(compRepo, baseRepo, {
  componentesReposicion: [{ tipo: 'BUSQUEDA', valor: 500000 }, { tipo: 'SELECCION', valor: 800000 }, { tipo: 'FORMACION', valor: 2900000 }]
});
ok(!rRepoOk.rechazado, 'con componentes reales (BUSQUEDA/SELECCION/FORMACION) → SÍ calcula');
eq(rRepoOk.valor, 4200000, 'valor = 1 × 4200000 (quantity × base), la evidencia real queda registrada');
eq(rRepoOk.componentesReposicion.length, 3, 'los 3 componentes de evidencia quedan en el resultado (trazabilidad)');
lanza(function () { M.calcularReposicion({ primary_mechanism: 'LOST_CAPACITY' }, baseRepo, {}); }, 'mecanismo distinto de REPLACEMENT → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('calcularValorNoCapturado — §8.4 (INV-CFF-43/44 / AC34-35): capacidad ≠ venta perdida');
// ═══════════════════════════════════════════════════════════════════════

var compVNC = { primary_mechanism: 'UNCAPTURED_VALUE', calculation_mode: 'UNIT_RATE', quantity: 10 };
var baseVNC = { basis_type: 'CALCULATED_INTERNAL', basis_value: 3000 }; // MC_u por unidad

var condTodas = { capacidadReal: true, demandaDemostrable: true, vinculoOperacional: true, sinRecuperacionPosteriorEquivalente: true };

M.CONDICIONES_VNC.forEach(function (k) {
  var opts = Object.assign({}, condTodas); opts[k] = false;
  var r = M.calcularValorNoCapturado(compVNC, baseVNC, opts);
  ok(r.rechazado && r.monetization_status === 'N_A', 'falta "' + k + '" → RECHAZADO (§8.4: capacidad no utilizada ≠ venta perdida)');
});

var rSinDemanda = M.calcularValorNoCapturado(compVNC, baseVNC, Object.assign({}, condTodas, { demandaDemostrable: false }));
ok(rSinDemanda.motivo.indexOf('demandaDemostrable') !== -1, 'el motivo nombra la condición faltante (AC34: sin demanda, no convertir a margen)');

var rDemora = M.calcularValorNoCapturado(compVNC, baseVNC, Object.assign({}, condTodas, { demoraDesplazaVenta: true }));
ok(rDemora.rechazado && rDemora.motivo.indexOf('AC35') !== -1, 'demora que desplaza la venta → RECHAZADO (AC35: no reconocer el margen completo si se recupera)');

var rVNCok = M.calcularValorNoCapturado(compVNC, baseVNC, condTodas);
ok(!rVNCok.rechazado, 'las 4 condiciones satisfechas, sin demora → SÍ calcula');
eq(rVNCok.valor, 30000, 'VNC = 10 unidades × 3000 (MC_u) = 30000');
lanza(function () { M.calcularValorNoCapturado({ primary_mechanism: 'REPLACEMENT' }, baseVNC, condTodas); }, 'mecanismo distinto de UNCAPTURED_VALUE → lanza');

// ═══════════════════════════════════════════════════════════════════════
seccion('AC36 — benchmark incompatible: el motor marca la limitación, NO juzga compatibilidad');
// ═══════════════════════════════════════════════════════════════════════

// Decisión (aprobada): el motor no puede juzgar si un benchmark es "compatible"
// (¿con qué sector, qué tamaño, qué momento?) — ese juicio necesita contexto
// externo. Lo que sí constata: que SOLO hay benchmark disponible. Mismo
// principio que rechazar coeficientes subjetivos de atribución.
var rSoloBench = M.preferirBaseMonetaria([
  { basis_type: 'EXTERNAL_BENCHMARK', source: 'sectorial-X' }
]);
eq(rSoloBench.flags, ['SOLO_BENCHMARK_DISPONIBLE'],
  'AC36 — con solo benchmark, se marca SOLO_BENCHMARK_DISPONIBLE (limitación constatable), no un veredicto NOT_ADMISSIBLE que el motor no puede emitir');
ok(!('NOT_ADMISSIBLE' in rSoloBench) && rSoloBench.seleccionada != null,
  'AC36 — el motor no fabrica un estado de admisibilidad para MONETARY_BASIS (§9 no lo define); ver README');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutaciones §8.3/§8.4 — ejecutadas como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  1. §8.3: quitar el chequeo esMultiploUniversalSalario → un múltiplo genérico de salario pasa a');
console.log('     calcularse en vez de rechazarse (INV-CFF-45).');
console.log('  2. §8.4: cambiar `opts[k] !== true` por `opts[k] === false` → un opts sin declarar la condición');
console.log('     (undefined) deja de rechazarse — la ausencia de evidencia se trataría como evidencia.');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
