/**
 * motor-ifd/reglas_inviolables.test.js — Fase 7c
 * node motor-ifd/reglas_inviolables.test.js
 *
 * §32 — las 15 reglas inviolables del motor. Cada una: o bien una ASERCIÓN
 * concreta a través de runEPD / agregarEPDs, o bien FRAMING — una
 * restricción sobre cómo se INTERPRETA la salida fuera del motor, sin
 * contraparte en ningún campo de EPD_INPUT/OUTPUT. Para las FRAMING la
 * justificación dice ESPECÍFICAMENTE por qué no hay código que testear
 * (decisión E de Luis: no un genérico "es conceptual").
 *
 * Mismo patrón que motor-cff/invariantes_arquitectonicos.test.js.
 */

'use strict';

var R = require('./runIFD');
var C = require('./contratos');

var _ok = 0, _fallos = 0;
function seccion(n) { console.log('\n── ' + n + ' ' + '─'.repeat(Math.max(0, 66 - n.length))); }
function ok(c, m) { if (c) { _ok++; console.log('  ✓ ' + m); } else { _fallos++; console.log('  ✗ FALLA: ' + m); } }

function inp(o) {
  return Object.assign({
    epd_id: 'EPD-1', engine_version: 'ifd-js-0.1',
    deterioration_sustained: true, evidence_present: true, mechanism_traceable: true,
    horizon_defined: true, assumptions_declared: true,
    Q: 3, C: 3, T: 3, R: 3, variable_type: 'V3', evolution_type: 'EV-A',
    series_sufficiency: 3, horizon: 6, hms: 12,
    economic_traceability: false, attribution_category: 'CONFIRMED'
  }, o || {});
}
function econ(o) {
  return inp(Object.assign({ baseline: 3000, delta: 400, lower_bound: 0, unit: 'horas', unit_value: 25, economic_traceability: true }, o || {}));
}
function outFields(o) { return Object.keys(o).join(' '); }

// ── el campo `test` devuelve true si la regla se respeta ──────────────

var REGLAS = [
  {
    n: 1, regla: 'PROYECCIÓN ≠ PREDICCIÓN', tipo: 'ASERCION',
    justificacion: 'El EPD_OUTPUT no tiene ningún campo de probabilidad / confianza / likelihood. Los escenarios (§21) son proyecciones condicionadas por evidencia, no pronósticos probabilísticos.',
    test: function () {
      var o = R.runEPD(econ()).output;
      return !/probabilit|confian|likelihood|certeza|pronost/i.test(outFields(o) + ' ' + JSON.stringify(Object.keys(o)));
    }
  },
  {
    n: 2, regla: 'FUERZA DE EVIDENCIA ≠ PROBABILIDAD', tipo: 'ASERCION',
    justificacion: 'FEP = min(Q,C,T,R) es un índice de fuerza 0-3, entero; nunca se convierte a porcentaje ni se usa como peso. A16 PROBABILIDAD_NO_CALIBRADA existe precisamente para marcar cualquier intento.',
    test: function () {
      var o = R.runEPD(econ()).output;
      return typeof o.FEP === 'number' && o.FEP === Math.trunc(o.FEP) && o.FEP >= 0 && o.FEP <= 3;
    }
  },
  {
    n: 3, regla: 'DIAGNÓSTICO ≠ CONSECUENCIA', tipo: 'ASERCION',
    justificacion: 'La entrada de diagnóstico (deterioration_sustained, las 5 puertas de §6) es una PUERTA de admisibilidad; la consecuencia (projection_base) se calcula de los parámetros prospectivos (§20). Un cambio en los parámetros de proyección cambia la consecuencia; las puertas de §6 solo abren o cierran.',
    test: function () {
      var a = R.runEPD(econ({ delta: 400 })).output.projection_base;
      var b = R.runEPD(econ({ delta: 800 })).output.projection_base;
      return a === 5400 && b === 7800; // la consecuencia sigue a los parámetros, no al diagnóstico
    }
  },
  {
    n: 4, regla: 'CONSECUENCIA ≠ COSTO AUTOMÁTICO', tipo: 'ASERCION',
    justificacion: 'Una proyección CUANTIFICADA sin valor unitario NO produce cifra económica.',
    test: function () {
      var o = R.runEPD(inp({ baseline: 3000, delta: 400, lower_bound: 0 })).output; // proyecta, sin economía
      return o.status === 'CUANTIFICADO' && o.projection_base === 5400 && o.economic_base === null;
    }
  },
  {
    n: 5, regla: 'CUANTIFICABLE ≠ MONETIZABLE', tipo: 'ASERCION',
    justificacion: 'La proyección física puede tener éxito (CUANTIFICADO) y la puerta económica §23.1 quedar cerrada — el nivel físico no se degrada por ello (§20: la monetización es "una rama posible").',
    test: function () {
      var o = R.runEPD(econ({ unit: undefined })).output; // sin `unit` → puerta cerrada
      return o.status === 'CUANTIFICADO' && o.output_level === 'S3' && o.economic_base === null && o.alerts.indexOf('A09') !== -1;
    }
  },
  {
    n: 6, regla: 'EXPOSICIÓN ECONÓMICA ≠ ATRIBUCIÓN', tipo: 'ASERCION',
    justificacion: 'economic_base (EEB §23.2) se calcula de projection × unit_value; attribution_category no entra en esa aritmética (§28 CRITICAL INVARIANT).',
    test: function () {
      var o = R.runEPD(econ({ attribution_category: 'UNRESOLVED' })).output;
      return o.economic_base === 135000 && o.alerts.indexOf('A10') !== -1; // la cifra existe, la afirmación se restringe
    }
  },
  {
    n: 7, regla: 'ATRIBUIR ≠ PONDERAR', tipo: 'ASERCION',
    justificacion: 'Las 4 categorías de atribución con la misma consecuencia + VU + trazabilidad → la MISMA valoración económica (§34/§35).',
    test: function () {
      var v = ['CONFIRMED', 'SUPPORTED', 'UNRESOLVED', 'N_A'].map(function (cat) {
        return R.runEPD(econ({ attribution_category: cat })).output.economic_base;
      });
      return v.every(function (x) { return x === 135000; });
    }
  },
  {
    n: 8, regla: 'ATRIBUCIÓN ≠ COEFICIENTE DE DESCUENTO DEL COSTO', tipo: 'ASERCION',
    justificacion: 'Un coeficiente continuo como attribution_category (0.70) se rechaza en la entrada; y las 4 categorías discretas no descuentan la cifra.',
    test: function () {
      var rechazado = R.runEPD(inp({ attribution_category: 0.7 })).ok === false;
      var sinDescuento = R.runEPD(econ({ attribution_category: 'UNRESOLVED' })).output.economic_base === 135000;
      return rechazado && sinDescuento;
    }
  },
  {
    n: 9, regla: 'CORRELACIÓN ≠ CAUSALIDAD', tipo: 'ASERCION_PARCIAL',
    justificacion: 'No hay campo de "correlación" en EPD_INPUT. Lo más cercano que el motor puede exigir es mechanism_traceable (§6): un mecanismo prospectivo razonable, no una asociación estadística. Sin mecanismo → no admisible. El resto de la regla (que quien lee la salida no confunda la proyección con causalidad probada) es interpretación fuera del motor.',
    test: function () {
      var o = R.runEPD(inp({ mechanism_traceable: false, baseline: 3000, delta: 400 })).output;
      return o.output_level === 'S0' && o.alerts.indexOf('A01') !== -1;
    }
  },
  {
    n: 10, regla: 'RESULTADO HISTÓRICO ≠ FUTURO GARANTIZADO', tipo: 'ASERCION_PARCIAL',
    justificacion: 'CFF (el costo histórico) NO es un campo de EPD_INPUT ni una variable de la fórmula de IFD (CFF × H ≠ IFD, §9). La proyección se calcula solo de parámetros prospectivos. Que la salida no se lea como una garantía es interpretación fuera del motor (por eso el output_level nunca es "seguro/garantizado", solo S0-S3 acotado por evidencia).',
    test: function () {
      var campos = C.ESQUEMA_EPD_INPUT.map(function (f) { return f.name; });
      return campos.indexOf('cff') === -1 && campos.indexOf('CFF') === -1 && campos.indexOf('cff_realizado') === -1;
    }
  },
  {
    n: 11, regla: 'INTERVENCIÓN ≠ RECUPERACIÓN GARANTIZADA', tipo: 'ASERCION',
    justificacion: 'El escenario de contención (§21.3) solo se cuantifica con containment_evidence_level ≥ 2; sin evidencia → cualitativo + A12, y NUNCA se produce ver/roi de recuperación (§24: marcador).',
    test: function () {
      var o = R.runEPD(econ({ containment_factor: 0.30, containment_evidence_level: 1 })).output;
      var conten = o.scenarios.filter(function (s) { return s.escenario === 'CONTENCION'; })[0];
      return conten.cualitativo === true && o.alerts.indexOf('A12') !== -1 &&
        o.heritage_outputs.VER.estado === 'PENDIENTE_AUDITORIA' && o.heritage_outputs.ROI_P.estado === 'PENDIENTE_AUDITORIA';
    }
  },
  {
    n: 12, regla: 'RELEVANCIA ESTRATÉGICA ≠ VENTAJA COMPETITIVA DEMOSTRADA', tipo: 'FRAMING',
    justificacion: 'No hay salida de "score competitivo" ni "ventaja" en EPD_OUTPUT. impact_type=IEP ("relevancia estratégica potencial", §4) es un rótulo descriptivo interno; el §4 lo limita explícitamente ("No demostrar competitividad ni ventaja"). El motor no tiene un mecanismo que pudiera violar esto — no hay número que producir. Es una restricción sobre la lectura del reporte, no sobre el cálculo.',
    test: function () {
      var o = R.runEPD(inp({ impact_type: 'IEP', baseline: 3000, delta: 400, lower_bound: 0 })).output;
      return !/competit|ventaja|ranking|score|posicion/i.test(JSON.stringify(Object.keys(o))) && ['S0', 'S1', 'S2', 'S3'].indexOf(o.output_level) !== -1;
    }
  },
  {
    n: 13, regla: 'NULL ≠ CERO', tipo: 'ASERCION',
    justificacion: 'clasificarValorNulo (§26): 0 = ausencia demostrada, null = no determinado. Una salida terminal (S0/S1) deja projection_base/economic_base en null, NUNCA en 0.',
    test: function () {
      var s0 = R.runEPD(inp({ deterioration_sustained: false })).output;
      var s1 = R.runEPD(inp({ variable_type: 'V5' })).output;
      return s0.projection_base === null && s0.economic_base === null &&
        s1.projection_base === null && s1.economic_base === null;
    }
  },
  {
    n: 14, regla: 'CALCULABLE ≠ SUSTENTABLE', tipo: 'ASERCION',
    justificacion: 'Una proyección se puede calcular pero si la evidencia es débil el nivel se degrada (effective_FEP → output_level, §8/§30) o se corta a cualitativo. Y §20.1 (A13): un conteo bruto es calculable pero NO sustentable si el volumen cambió materialmente.',
    test: function () {
      var degradado = R.runEPD(inp({ Q: 2, C: 2, T: 2, R: 2, baseline: 3000, delta: 400, lower_bound: 0 })).output; // FEP 2 → S2, no S3
      var bruto = R.runEPD(inp({ variable_type: 'V1', evolution_type: 'EV-A', delta: 10, baseline: 100, exposure_obs: 12000, exposure_future: 72000, lower_bound: 0 })).output;
      return degradado.output_level === 'S2' && bruto.alerts.indexOf('A13') !== -1;
    }
  },
  {
    n: 15, regla: 'IMPACTOS HETEROGÉNEOS NO SE SUMAN ARBITRARIAMENTE', tipo: 'ASERCION',
    justificacion: 'agregarEPDs con impact_type distinto entre los EPD a sumar → A17 + aggregation_blocked, totales en null.',
    test: function () {
      var a = R.runEPD(econ({ epd_id: 'A', impact_type: 'IOF' })).output;
      var b = R.runEPD(econ({ epd_id: 'B', impact_type: 'ICAP' })).output;
      var agg = R.agregarEPDs([a, b]);
      return agg.alerts.indexOf('A17') !== -1 && agg.aggregation_blocked === true && agg.economic_total === null;
    }
  }
];

// ═══════════════════════════════════════════════════════════════════════
seccion('§32 — 15 reglas inviolables: aserción concreta o framing justificado');
// ═══════════════════════════════════════════════════════════════════════

ok(REGLAS.length === 15, 'las 15 reglas de §32 están todas');
ok(REGLAS.every(function (r, i) { return r.n === i + 1; }), 'numeradas 1-15 en el orden del documento');

REGLAS.forEach(function (r) {
  var etiqueta = '§32.' + r.n + ' ' + r.regla + '  [' + r.tipo + ']';
  if (r.tipo === 'FRAMING') {
    // FRAMING: la justificación debe ser específica (no genérica) — decisión E
    var generica = /^(es conceptual|es una restricción conceptual|no aplica)\.?$/i.test(r.justificacion.trim());
    var mencionaEspecifico = /EPD_(INPUT|OUTPUT)|campo|§\d|impact_type|salida|reporte|lectura/i.test(r.justificacion);
    ok(!generica && mencionaEspecifico && r.justificacion.length > 80,
      etiqueta + ' — justificación específica (menciona por qué NO hay código: ' +
      r.justificacion.slice(0, 70) + '…)');
    // aun así, si trae un `test` de sanidad, se corre
    if (r.test) ok(r.test(), etiqueta + ' — chequeo de sanidad (no hay campo que la viole)');
  } else {
    ok(r.test(), etiqueta + (r.tipo === 'ASERCION_PARCIAL' ? ' — parte testeable respetada (' + r.justificacion.slice(0, 60) + '…)' : ''));
  }
});

// ── conteo de tipos ──
var nFraming = REGLAS.filter(function (r) { return r.tipo === 'FRAMING'; }).length;
var nAsercion = REGLAS.filter(function (r) { return r.tipo.indexOf('ASERCION') === 0; }).length;
console.log('\n  ' + nAsercion + ' con aserción (12 plenas + 2 parciales) · ' + nFraming + ' framing (solo §32.12).');

// ═══════════════════════════════════════════════════════════════════════
seccion('Mutación — ejecutada como paso de Bash aparte (ver cierre)');
// ═══════════════════════════════════════════════════════════════════════
console.log('  consolidarEPDOutput: projection_base terminal → 0 en vez de null → la regla §32.13');
console.log('  (NULL ≠ CERO) falla por su nombre (s0.projection_base === null pasa a ser 0).');
console.log('  (Cross-check: §26 clasificarValorNulo ya tiene su propia mutación en contratos.test.js;');
console.log('  esta prueba que el orquestador NO colapsa null a 0 al consolidar.)');

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(74));
console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fallos + ' fallos');
console.log('═'.repeat(74));
process.exit(_fallos ? 1 : 0);
