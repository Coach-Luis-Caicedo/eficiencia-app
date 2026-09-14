/**
 * ============================================================================
 *  BATERÍA DE VERIFICACIÓN — Motor SDMO / IDA
 * ============================================================================
 *
 *  Ejecutar:  node motor-sdmo/motor-sdmo.test.js
 *  Sin dependencias externas. Sale con código 1 si algún assert falla.
 *
 *  IMPORTANTE — todos los parámetros usados aquí son VALORES DE PRUEBA, no
 *  valores canónicos. Los reales están PENDIENTE_VALIDACION (§6.2). Cada caso
 *  documenta con qué valores corrió.
 *
 *  Casos:
 *   1. Neutro (4×3)                 → M_i = 0.5, IDA_i = 50 para cualquier δ.
 *   2. Concentración                → C_i suprime una sola dimensión extrema;
 *                                     IDA sensible a δ.
 *   3. Persistencia en el cruce     → la racha de trayectoria detecta el cambio
 *                                     EN el período del cruce F→D; la versión
 *                                     puramente categórica llega 1 período tarde.
 *   4. No-respuesta                 → IDA = null (nunca 0 ni deterioro);
 *                                     TasaRespuesta sí refleja la ausencia.
 *   5. Agregación colectiva         → el nivel (promedio) no oculta la
 *                                     concentración; la medida es proporcional
 *                                     al tamaño del grupo.
 *   6. Confidencialidad (§2.10)     → nodo con N < umbral no reporta solo; sus
 *                                     datos suben al nivel superior.
 *   7. Estructura / no colisión     → ACU/COM/INV/PEN, sin choque con ICE–IEH;
 *                                     parámetros pendientes exigidos explícitos.
 *   8. Validación de entradas.
 * ============================================================================
 */
'use strict';

var M = require('./motor-sdmo.js');

// ── Mini-harness ───────────────────────────────────────────────────────────
var _ok = 0, _fallos = 0, EPS = 1e-9;
function ok(cond, msg) {
  if (cond) { _ok++; console.log('  ✓ ' + msg); }
  else { _fallos++; console.log('  ✗ ' + msg); }
}
function eq(a, b, msg) {
  var pass = (typeof a === 'number' && typeof b === 'number') ? Math.abs(a - b) < EPS : a === b;
  if (!pass) console.log('      esperado ' + JSON.stringify(b) + ', obtenido ' + JSON.stringify(a));
  ok(pass, msg);
}
function seccion(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 64 - t.length))); }

// ── Parámetros DE PRUEBA (los reales están PENDIENTE_VALIDACION §6.2) ───────
var OPTS = {
  delta: 0.5,               // δ de PRUEBA — §2.6 lo deja pendiente
  trendWindow: 3,           // ventana móvil de trayectoria (períodos)
  cambioMinimo: 5,          // banda "estable", en escala IDA 0–100
  estimadorPendiente: M.pendienteLineal,  // método de pendiente de PRUEBA (mínimos cuadrados)
  persistMin: 3,            // persistencia categórica ≥ 3 ⇒ persistente
  persistRunMin: 4,         // racha de trayectoria ≥ 4 ⇒ persistente
  umbralFavorable: 40,      // IDA ≤ 40 ⇒ 'F'
  umbralDeteriorado: 60,    // IDA ≥ 60 ⇒ 'D'
  minReportableN: 8,        // §2.10 — "N ≥ 8–10" es hipótesis
  percentilConcentracion: 90,
  umbralConcentracion: 70
};

// ══════════════════════════════════════════════════════════════════════════
seccion('CASO 1 — Neutro: las 4 respuestas = 3');
// ══════════════════════════════════════════════════════════════════════════
(function () {
  var r = M.calcularIDA({ ACU: 3, COM: 3, INV: 3, PEN: 3 }, OPTS);
  eq(r.M, 0.5, 'M_i = 0.5');
  eq(r.C, 0.5, 'C_i = 0.5 (todas las z iguales ⇒ el segundo mayor también es 0.5)');
  eq(r.IDA, 50, 'IDA_i = 50');

  // Independiente de δ: δ·0.5 + (1−δ)·0.5 = 0.5 para cualquier δ.
  eq(M.calcularIDA({ ACU: 3, COM: 3, INV: 3, PEN: 3 }, { delta: 0.1 }).IDA, 50, 'IDA_i = 50 con δ = 0.1');
  eq(M.calcularIDA({ ACU: 3, COM: 3, INV: 3, PEN: 3 }, { delta: 0.9 }).IDA, 50, 'IDA_i = 50 con δ = 0.9');
})();

// ══════════════════════════════════════════════════════════════════════════
seccion('CASO 2 — Concentración: 3 dimensiones en 1, una en 5  (δ de prueba = 0.5)');
// ══════════════════════════════════════════════════════════════════════════
(function () {
  // z = {0, 0, 0, 1}.  ordenadas [0,0,0,1] ⇒ M = 0.25 ; C = z_(3) = 0.
  var r = M.calcularIDA({ ACU: 1, COM: 1, INV: 1, PEN: 5 }, OPTS);
  eq(r.z.PEN, 1, 'z_PEN = 1');
  eq(r.z.ACU, 0, 'z_ACU = 0');
  eq(r.M, 0.25, 'M_i = 0.25  (promedio de las 4)');
  eq(r.C, 0, 'C_i = 0  (una sola dimensión elevada ⇒ el 2º mayor sigue en 0)');
  eq(r.IDA, 12.5, 'IDA_i = 12.5 con δ = 0.5  → 100·(0.5·0.25 + 0.5·0)');

  // Sensible a δ (el valor real está pendiente):
  eq(M.calcularIDA({ ACU: 1, COM: 1, INV: 1, PEN: 5 }, { delta: 0.3 }).IDA, 7.5, 'IDA_i = 7.5 con δ = 0.3');
  eq(M.calcularIDA({ ACU: 1, COM: 1, INV: 1, PEN: 5 }, { delta: 0.7 }).IDA, 17.5, 'IDA_i = 17.5 con δ = 0.7');
  ok(7.5 !== 17.5, 'IDA_i cambia con δ  (12.5 con 0.5, 7.5 con 0.3, 17.5 con 0.7)');

  // Contraste: cuando DOS dimensiones están elevadas, C_i salta.
  var r2 = M.calcularIDA({ ACU: 5, COM: 5, INV: 1, PEN: 1 }, OPTS);
  eq(r2.M, 0.5, '2 dims en 5: M_i = 0.5');
  eq(r2.C, 1, '2 dims en 5: C_i = 1  (concentración multidimensional detectada)');
  eq(r2.IDA, 75, '2 dims en 5: IDA_i = 75 con δ = 0.5');
  ok(r2.IDA > r.IDA, 'IDA con 2 dims elevadas (75) > IDA con 1 dim extrema (12.5) — C_i hace su trabajo');
})();

// ══════════════════════════════════════════════════════════════════════════
seccion('CASO 3 — Persistencia en el cruce de categoría F→D');
// ══════════════════════════════════════════════════════════════════════════
(function () {
  // Serie de IDA que sube de forma sostenida y cruza a 'D' en t = 4.
  //   t:        0   1   2   3   4   5
  //   IDA:     20  30  42  55  68  75
  //   categoría F   F   I   I   D   D      (F≤40, D≥60)   ← cruce a D en t=4
  var serie = [20, 30, 42, 55, 68, 75];

  eq(M.categoria(serie[3], OPTS), 'I', 't=3 categoría = I');
  eq(M.categoria(serie[4], OPTS), 'D', 't=4 categoría = D  (período del cruce)');

  eq(M.trayectoria(serie, 4, OPTS).direccion, 'ascendente', 't=4 trayectoria ascendente');
  eq(M.trayectoria(serie, 4, OPTS).movimiento, 'deterioro', 't=4 movimiento = deterioro');

  // Persistencia categórica pura: en el cruce vale 1 (acaba de cambiar de categoría).
  eq(M.persistenciaCategorica(serie, 4, OPTS), 1, 't=4 persistenciaCategorica = 1  (se resetea en el cruce)');
  eq(M.persistenciaCategorica(serie, 5, OPTS), 2, 't=5 persistenciaCategorica = 2');

  // Racha de trayectoria sostenida: NO se resetea en el cruce.
  eq(M.rachaTrayectoria(serie, 4, OPTS).racha, 4, 't=4 rachaTrayectoria = 4  (asc. desde t=1)');

  // Clasificación CORREGIDA en el período del cruce:
  var c4 = M.clasificarSenal(serie, 4, OPTS);
  eq(c4.clase, 'persistente', 't=4 clase = persistente  (detectado EN el cruce)');
  eq(c4.porCategorica, false, 't=4 NO fue por la vía categórica (catRun 1 < persistMin 3)');
  eq(c4.porRacha, true, 't=4 SÍ fue por la racha de trayectoria (4 ≥ persistRunMin 4)');

  // La versión PURAMENTE CATEGÓRICA (el bug) — reconstruida desde persistenciaCategorica:
  function claseSoloCategorica(catRun) {
    return catRun >= OPTS.persistMin ? 'persistente' : catRun >= 2 ? 'repetida' : 'puntual';
  }
  eq(claseSoloCategorica(M.persistenciaCategorica(serie, 4, OPTS)), 'puntual',
    't=4 versión puramente categórica = "puntual"  → NO detecta nada en el cruce');
  eq(claseSoloCategorica(M.persistenciaCategorica(serie, 5, OPTS)), 'repetida',
    't=5 versión puramente categórica = "repetida"  → primera señal, un período tarde');

  // Retraso explícito: corregida detecta en t=4; puramente categórica, en t=5.
  ok(c4.clase === 'persistente' &&
     claseSoloCategorica(M.persistenciaCategorica(serie, 4, OPTS)) === 'puntual',
    'La corrección elimina el retraso de 1 período: señal en t=4 (cruce), no en t=5');

  // t=3 (antes del cruce): la corregida ya marca "repetida" por movimiento sostenido,
  // sin llegar aún a "persistente" con estos umbrales de prueba.
  eq(M.clasificarSenal(serie, 3, OPTS).clase, 'repetida', 't=3 clase = repetida');
})();

// ══════════════════════════════════════════════════════════════════════════
seccion('CASO 4 — No-respuesta (§2.8)');
// ══════════════════════════════════════════════════════════════════════════
(function () {
  var nr = M.calcularIDA(null, OPTS);
  eq(nr.respondio, false, 'calcularIDA(null): respondio = false');
  eq(nr.IDA, null, 'calcularIDA(null): IDA = null  (NO 0, NO valor de deterioro)');
  eq(nr.M, null, 'calcularIDA(null): M = null');
  eq(M.calcularIDA(undefined, OPTS).IDA, null, 'calcularIDA(undefined): IDA = null');
  eq(M.calcularIDA({}, OPTS).IDA, null, 'calcularIDA({}) (no-respuesta total): IDA = null');

  // Serie individual con un período sin respuesta.
  var serie = M.calcularSerieIDA(
    [{ ACU: 2, COM: 2, INV: 2, PEN: 2 }, { ACU: 3, COM: 3, INV: 3, PEN: 3 }, null,
     { ACU: 3, COM: 3, INV: 3, PEN: 3 }, { ACU: 4, COM: 4, INV: 4, PEN: 4 }], OPTS);
  eq(serie[2], null, 'serie de IDA: el período sin respuesta queda en null, no imputado');
  eq(M.trayectoria(serie, 3, OPTS).puntos, 2, 'trayectoria en t=3: el null se salta (2 puntos, no 3, y no cuenta como 0)');

  // Nodo con respondientes y no-respondientes.
  var nodo = M.agregarNodo([45, 50, 55, null, null],
    Object.assign({}, OPTS, { minReportableN: 3, personasConvocadas: 5 }));
  eq(nodo.n, 3, 'nodo: n = 3 (solo respondientes)');
  eq(nodo.nivelColectivo, 50, 'nodo: nivelColectivo = 50  (los 2 null NO cuentan como 0 → no es 30)');
  eq(nodo.tasaRespuesta, 0.6, 'nodo: TasaRespuesta = 3/5 = 0.6');

  // TasaRespuesta es una serie independiente, con su propia trayectoria.
  var tasa = M.calcularSerieTasaRespuesta([
    { validas: 5, convocadas: 5 }, { validas: 5, convocadas: 5 }, { validas: 2, convocadas: 5 },
    { validas: 3, convocadas: 5 }, { validas: 4, convocadas: 5 }]);
  eq(tasa.join(','), '1,1,0.4,0.6,0.8', 'serie TasaRespuesta = [1, 1, 0.4, 0.6, 0.8]');
  var trayTasa = M.trayectoria(tasa, 2, { trendWindow: 3, cambioMinimo: 0.15, estimadorPendiente: M.pendienteLineal });
  eq(trayTasa.direccion, 'descendente', 'trayectoria de TasaRespuesta en t=2: descendente (cae la participación)');
})();

// ══════════════════════════════════════════════════════════════════════════
seccion('CASO 5 — Agregación colectiva (§2.9): el nivel no oculta la concentración');
// ══════════════════════════════════════════════════════════════════════════
(function () {
  // Grupo: 1 Persona en valor extremo, 9 estables y bajas.
  var g = [95, 25, 25, 25, 25, 25, 25, 25, 25, 25];
  var res = M.agregarNodo(g, OPTS);

  eq(res.nivelColectivo, 32, 'nivelColectivo (promedio) = 32');
  eq(M.categoria(res.nivelColectivo, OPTS), 'F', 'el promedio, solo, se clasificaría "F" — oculta el extremo');

  ok(res.concentracion.proporcionExcedente.valor > 0,
    'concentración: proporción por encima de 70 = ' + res.concentracion.proporcionExcedente.valor + ' > 0 (no se oculta)');
  eq(res.concentracion.proporcionExcedente.valor, 0.1, 'concentración: proporcionExcedente = 1/10 = 0.1');
  eq(res.dispersion.max, 95, 'dispersión: max = 95 (el extremo queda visible)');
  ok(res.dispersion.desviacionEstandar > 15,
    'dispersión: desviación estándar = ' + res.dispersion.desviacionEstandar.toFixed(1) + ' (alta → heterogeneidad)');

  // Proporcionalidad al tamaño del grupo (lo que el "segundo mayor entre Personas" NO garantiza).
  //   A: n=10, 10% extremo.   B: n=100, 10% extremo.
  var A = [95].concat(Array(9).fill(25));
  var B = Array(10).fill(95).concat(Array(90).fill(25));
  var cA = M.agregarNodo(A, OPTS).concentracion.proporcionExcedente.valor;
  var cB = M.agregarNodo(B, OPTS).concentracion.proporcionExcedente.valor;
  eq(cA, 0.1, 'A (n=10, 10% extremo): proporcionExcedente = 0.1');
  eq(cB, 0.1, 'B (n=100, 10% extremo): proporcionExcedente = 0.1');
  eq(cA, cB, 'misma concentración proporcional ⇒ misma medida, sin importar n  (el 2º-mayor daría 25 vs 95)');

  // El módulo no expone ningún "segundo mayor entre Personas".
  ok(Object.keys(M).every(function (k) { return !/segundo|secondHighest|2mayor/i.test(k); }),
    'la API no contiene ninguna función de "segundo mayor entre Personas"');
})();

// ══════════════════════════════════════════════════════════════════════════
seccion('CASO 6 — Confidencialidad (§2.10): N < umbral no reporta, sube al nivel superior');
// ══════════════════════════════════════════════════════════════════════════
(function () {
  var chico = M.agregarNodo([50, 50, 50, 50, 50], OPTS);   // n=5 < 8
  eq(chico.n, 5, 'nodo chico: n = 5');
  eq(chico.reportable, false, 'nodo chico: reportable = false (n < minReportableN 8)');
  ok(!!chico.motivo, 'nodo chico: incluye motivo de no-reporte');
  eq(chico.idasParaAgregar.length, 5, 'nodo chico: expone sus 5 IDA para agregación superior');

  var grande = M.agregarNodo(Array(10).fill(50), OPTS);    // n=10 ≥ 8
  eq(grande.reportable, true, 'nodo grande: reportable = true (n ≥ 8)');
  eq(grande.idasParaAgregar, undefined, 'nodo grande: no expone idasParaAgregar');

  // Roll-up jerárquico.
  var nivel = M.agregarNivelSuperior([
    { id: 'a', idas: [50, 50, 50, 50, 50] },       // n=5  → absorbido
    { id: 'b', idas: Array(10).fill(40) },         // n=10 → reporta solo
    { id: 'c', idas: [60, 60, 60] }                // n=3  → absorbido
  ], OPTS);
  eq(nivel.hijosAbsorbidos.join(','), 'a,c', 'absorbidos al nivel superior: a, c');
  eq(nivel.hijosReportables.map(function (h) { return h.id; }).join(','), 'b', 'reporta solo: b');
  eq(nivel.nPoolAbsorbido, 8, 'pool absorbido = 5 + 3 = 8 IDA (ningún dato se pierde)');
  eq(nivel.padre.n, 8, 'nodo padre: n = 8 (5 de "a" + 3 de "c")');
  eq(nivel.padre.reportable, true, 'nodo padre: reportable = true (8 ≥ 8) — el foco pequeño ahora sí se lee, agregado');
  eq(nivel.padre.nivelColectivo, (50 * 5 + 60 * 3) / 8, 'nodo padre: nivelColectivo = 53.75');
})();

// ══════════════════════════════════════════════════════════════════════════
seccion('CASO 7 — Estructura, no colisión y parámetros pendientes exigidos');
// ══════════════════════════════════════════════════════════════════════════
(function () {
  eq(M.CODIGOS.join(','), 'ACU,COM,INV,PEN', 'los 4 códigos son ACU, COM, INV, PEN');
  eq(M.DIMENSIONES.length, 4, 'hay 4 dimensiones');
  eq(M.DIMENSIONES.map(function (d) { return d.nombre; }).join(','),
    'ACTUAR,COMUNICAR,INVOLUCRARSE,PENSAR', 'nomenclatura vigente ACTUAR/COMUNICAR/INVOLUCRARSE/PENSAR');
  ok(M.DIMENSIONES.every(function (d) { return d.polo1 && d.polo5; }), 'cada dimensión tiene polo 1 y polo 5');

  var choque = M.CODIGOS.filter(function (c) { return M.CODIGOS_RESERVADOS_ICE_IEH.indexOf(c) !== -1; });
  eq(choque.length, 0, 'sin colisión con los prefijos reservados de ICE–IEH (ACU ≠ ACT)');

  eq(M.normalizar(1), 0, 'normalizar(1) = 0');
  eq(M.normalizar(3), 0.5, 'normalizar(3) = 0.5');
  eq(M.normalizar(5), 1, 'normalizar(5) = 1');

  // Todos los parámetros pendientes valen null en el módulo.
  Object.keys(M.PENDIENTE_VALIDACION).forEach(function (k) {
    eq(M.PENDIENTE_VALIDACION[k], null, 'PENDIENTE_VALIDACION.' + k + ' = null (no se fija en esta versión)');
  });

  // Las funciones que necesitan un pendiente lo EXIGEN explícito.
  function lanza(fn, frag, msg) {
    try { fn(); ok(false, msg + ' (no lanzó)'); }
    catch (e) { ok(String(e.message).indexOf(frag) !== -1, msg + '  [' + e.message.slice(0, 70) + '…]'); }
  }
  lanza(function () { M.calcularIDA({ ACU: 3, COM: 3, INV: 3, PEN: 3 }, {}); }, 'delta', 'calcularIDA sin δ → error');
  lanza(function () { M.trayectoria([1, 2, 3], 2, { cambioMinimo: 5, estimadorPendiente: M.pendienteLineal }); }, 'trendWindow', 'trayectoria sin trendWindow → error');
  lanza(function () { M.trayectoria([1, 2, 3], 2, { trendWindow: 3, cambioMinimo: 5 }); }, 'estimadorPendiente', 'trayectoria sin estimadorPendiente → error (método de pendiente PENDIENTE_VALIDACION)');
  lanza(function () { M.clasificarSenal([1, 2, 3], 2, { trendWindow: 3, cambioMinimo: 5, estimadorPendiente: M.pendienteLineal, umbralFavorable: 40, umbralDeteriorado: 60, persistRunMin: 4 }); }, 'persistMin', 'clasificarSenal sin persistMin → error');
  // REAPERTURA (DISENO_CALIBRACION_SDMO_IAO.md): umbralFavorable/umbralDeteriorado
  // YA NO lanzan sin calibrar — caen a GENERICO (tercil 0-100: F=33, D=67).
  // Los demás PENDIENTE_VALIDACION (delta, trendWindow, persistMin,
  // minReportableN, percentilConcentracion, etc.) siguen exigiendo el valor
  // explícito, sin cambio (ver lanza(...) de línea 273-279).
  eq(M.GENERICO.umbralFavorable, 33, 'GENERICO.umbralFavorable formalizado (tercil 0-100)');
  eq(M.GENERICO.umbralDeteriorado, 67, 'GENERICO.umbralDeteriorado formalizado (tercil 0-100)');
  eq(M.categoria(50, {}), 'I', 'categoria(50, {}) sin calibrar → I (50 entre GENERICO F=33 y D=67, ya no error)');
  eq(M.categoria(33, {}), 'F', 'categoria(33, {}) → F (33 = GENERICO.umbralFavorable, límite inclusive)');
  eq(M.categoria(67, {}), 'D', 'categoria(67, {}) → D (67 = GENERICO.umbralDeteriorado, límite inclusive)');
  eq(M.categoria(50, { umbralFavorable: 10, umbralDeteriorado: 20 }), 'D', 'opts explícito (CALIBRACION_PROPIA) gana sobre GENERICO — 50 ≥ 20');
  // CALIBRACION_GLOBAL (PENDIENTE_VALIDACION) gana sobre CALIBRACION_GENERICA
  M.PENDIENTE_VALIDACION.umbralFavorable = 10; M.PENDIENTE_VALIDACION.umbralDeteriorado = 20; // mutación de PRUEBA — restaurado abajo
  eq(M.categoria(50, {}), 'D', 'PENDIENTE_VALIDACION.umbralDeteriorado=20 (CALIBRACION_GLOBAL) gana sobre GENERICO=67 — 50 ≥ 20');
  M.PENDIENTE_VALIDACION.umbralFavorable = null; M.PENDIENTE_VALIDACION.umbralDeteriorado = null; // restaurado — sigue sin calibrar
  lanza(function () { M.agregarNodo([1, 2], {}); }, 'minReportableN', 'agregarNodo sin minReportableN → error (minReportableN de motor-sdmo, fuera de alcance de esta reapertura)');
  lanza(function () { M.concentracionColectiva([1, 2, 3], {}); }, 'percentilConcentracion', 'concentracionColectiva sin percentil → error');
})();

// ══════════════════════════════════════════════════════════════════════════
seccion('CASO 8 — Validación de respuestas individuales');
// ══════════════════════════════════════════════════════════════════════════
(function () {
  eq(M.validarRespuestaIndividual(null), null, 'null → no-respuesta (null)');
  eq(M.validarRespuestaIndividual({}), null, 'objeto vacío → no-respuesta (null)');

  // DECISIÓN CERRADA: respuesta parcial (faltan 1–3 dims) → no-respuesta completa,
  // NO error, NO imputación. Entra a TasaRespuesta como ausencia.
  eq(M.validarRespuestaIndividual({ ACU: 3, COM: 3, INV: 3 }), null, 'respuesta parcial (3 de 4) → no-respuesta (null), NO error');
  eq(M.validarRespuestaIndividual({ ACU: 3 }), null, 'respuesta parcial (1 de 4) → no-respuesta (null)');
  eq(M.calcularIDA({ ACU: 3, COM: 3, INV: 3 }, OPTS).respondio, false, 'calcularIDA(parcial): respondio = false');
  eq(M.calcularIDA({ ACU: 3, COM: 3, INV: 3 }, OPTS).IDA, null, 'calcularIDA(parcial): IDA = null (no imputado, no parcial)');

  function lanza(fn, frag, msg) {
    try { fn(); ok(false, msg + ' (no lanzó)'); }
    catch (e) { ok(String(e.message).indexOf(frag) !== -1, msg + '  [' + e.message.slice(0, 70) + '…]'); }
  }
  lanza(function () { M.validarRespuestaIndividual({ ACU: 0, COM: 3, INV: 3, PEN: 3 }); }, 'fuera de rango', 'valor 0 (presente pero malformado) → error');
  lanza(function () { M.validarRespuestaIndividual({ ACU: 6, COM: 3, INV: 3, PEN: 3 }); }, 'fuera de rango', 'valor 6 → error');
  lanza(function () { M.validarRespuestaIndividual({ ACU: 2.5, COM: 3, INV: 3, PEN: 3 }); }, 'fuera de rango', 'valor 2.5 (no entero) → error');
  lanza(function () { M.validarRespuestaIndividual([1, 2, 3]); }, '4 valores', 'array de 3 → error');

  // array y objeto equivalentes
  var a = M.calcularIDA([3, 4, 2, 5], { delta: 0.5 });
  var b = M.calcularIDA({ ACU: 3, COM: 4, INV: 2, PEN: 5 }, { delta: 0.5 });
  eq(a.IDA, b.IDA, 'array [3,4,2,5] y objeto {ACU:3,COM:4,INV:2,PEN:5} dan el mismo IDA');
})();

// ══════════════════════════════════════════════════════════════════════════
seccion('CASO 9 — Agregación a nivel ORGANIZACIÓN (§2.9 + §2.10)');
// ══════════════════════════════════════════════════════════════════════════
(function () {
  // 3 nodos de tamaños y distribuciones distintos:
  //   A: n=10  → nueve 30 + un 90        M_A = 360/10 = 36
  //   B: n=4   (< minReportableN 8)      M_B = (70+70+72+68)/4 = 70
  //   C: n=20  → diez 45 + diez 55       M_C = 1000/20 = 50
  var nodos = [
    { id: 'A', idas: [30, 30, 30, 30, 30, 30, 30, 30, 30, 90] },
    { id: 'B', idas: [70, 70, 72, 68] },
    { id: 'C', idas: [45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 55, 55, 55, 55, 55, 55, 55, 55, 55, 55] }
  ];
  var org = M.agregarOrganizacion(nodos, OPTS);

  // Pool = 34 individuos (incluye los 4 de B, sub-umbral). Suma = 360+280+1000 = 1640.
  eq(org.organizacion.n, 34, 'pool organizacional = 34 respondientes (incluye los 4 de B)');
  eq(org.organizacion.nivelColectivo, 1640 / 34, 'nivelColectivo = 1640/34 ≈ 48.24  (pooling de individuos)');

  // NO coincide con un promedio simple de los resúmenes de nodo:
  ok(Math.abs(org.organizacion.nivelColectivo - (36 + 70 + 50) / 3) > 1,
    'nivelColectivo ≠ promedio simple de las medias de nodo (52) — blindaje contra roll-up "por analogía"');
  ok(Math.abs(org.organizacion.nivelColectivo - (36 + 50) / 2) > 1,
    'nivelColectivo ≠ promedio de las medias de los nodos reportables (43)');
  // SÍ coincide con la ponderación por respondientes = Σ(n_g·M_g)/Σn_g:
  eq(org.organizacion.nivelColectivo, (10 * 36 + 4 * 70 + 20 * 50) / 34,
    'nivelColectivo = Σ(n_g·M_g)/Σn_g  (ponderación por respondientes, no por convocados)');

  // La concentración (percentil) TAMPOCO se promedia entre nodos.
  // P90 nodo A = 36 ; P90 nodo B = 71.4 ; P90 nodo C = 55.
  var p90A = M.percentil([30, 30, 30, 30, 30, 30, 30, 30, 30, 90], 90);
  var p90B = M.percentil([68, 70, 70, 72], 90);
  var p90C = M.percentil([45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 55, 55, 55, 55, 55, 55, 55, 55, 55, 55], 90);
  ok(Math.abs(org.organizacion.concentracion.valor - (p90A + p90B + p90C) / 3) > 1,
    'concentración P90 organizacional ≠ promedio de los P90 de cada nodo (percentiles no se promedian)');

  // Perfil por nodo — estructura separada, CON id.
  var pA = org.perfilPorNodo.find(function (x) { return x.id === 'A'; });
  var pB = org.perfilPorNodo.find(function (x) { return x.id === 'B'; });
  eq(pA.reportable, true, 'perfilPorNodo[A]: reportable = true');
  eq(pA.nivelColectivo, 36, 'perfilPorNodo[A]: nivelColectivo = 36');
  eq(pB.reportable, false, 'perfilPorNodo[B]: reportable = false (n=4 < 8)');
  eq(pB.nivelColectivo, undefined, 'perfilPorNodo[B]: SIN nivelColectivo (§2.10 — nodo sub-umbral no expone estadísticas)');
  eq(pB.nAportadoAlPool, 4, 'perfilPorNodo[B]: solo registra que aportó 4 respondientes al pool');

  // Anonimización: el pool no viaja con nodo_origen; los individuos no se devuelven.
  ok(org.organizacion.pool === undefined && org.organizacion.idas === undefined,
    'organizacion: no expone el pool ni los IDA individuales (individuos nunca reportados)');
  ok(org.perfilPorNodo.every(function (x) { return x.idas === undefined && x.idasParaAgregar === undefined; }),
    'perfilPorNodo: ninguna entrada expone IDA individuales');

  // Exclusión posterior de un nodo → se re-ejecuta con excluirNodos, no se opera sobre el pool.
  var sinC = M.agregarOrganizacion(nodos, Object.assign({}, OPTS, { excluirNodos: ['C'] }));
  eq(sinC.organizacion.n, 14, 'excluirNodos:["C"] → pool = 14 (A:10 + B:4)');
  eq(sinC.organizacion.nivelColectivo, (360 + 280) / 14, 'excluir C → nivelColectivo = 640/14 ≈ 45.71 (distinto)');
  eq(sinC.nodosExcluidos.join(','), 'C', 'nodosExcluidos = [C]');
  ok(!sinC.perfilPorNodo.some(function (x) { return x.id === 'C'; }), 'C ya no aparece en perfilPorNodo');

  // Sin percentil → error (mismo gate que el resto).
  try { M.agregarOrganizacion(nodos, { minReportableN: 8 }); ok(false, 'agregarOrganizacion sin percentil → error (no lanzó)'); }
  catch (e) { ok(e.message.indexOf('percentilConcentracion') !== -1, 'agregarOrganizacion sin percentil → error'); }
})();

// ── Resumen ────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(70));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(70));
process.exit(_fallos ? 1 : 0);
