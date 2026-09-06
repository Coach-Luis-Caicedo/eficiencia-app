/**
 * motor-ifd/contratos.js — Fase 0
 *
 * Contratos de datos del IFD como VALIDADORES, no como lógica de negocio
 * (mismo criterio que motor-cff/contratos.js). Verifican forma: campos
 * obligatorios, tipos, pertenencia a enum, y la semántica nula §26. NO
 * calculan admisibilidad (§6, Fase 1), NO proyectan (Fase 3), NO monetizan
 * (Fase 5).
 *
 * ── EPD (§5) y la estructura de entrada ─────────────────────────────────
 *
 * §5: EPDᵢ = (Dᵢ, Eᵢ, Mᵢ, Hᵢ, Sᵢ, Yᵢ) — denominación conceptual. La
 * estructura OPERATIVA de entrada (la que consume el motor) es la del
 * motor de referencia (`EPDInput`) más los campos de §31 que faltaban. Se
 * modela `EPD_INPUT` sobre el engine porque es la referencia ya verificada
 * y el punto de contraste del oráculo.
 *
 * ── series_sufficiency: NUMÉRICO 0-3, no cadena ─────────────────────────
 *
 * §17 habla de "SS0 a SS3", pero el engine de referencia lo trata como
 * número (`if x.series_sufficiency < 2`). Para que el contraste con el
 * oráculo funcione, aquí también es número 0-3; SS0..SS3 (enums.js) son
 * solo las etiquetas.
 *
 * ── Campo de unidad física (§23.1) — AGREGADO EN FASE 5 ────────────────
 *
 * §23.1: `AEᵢ = Unidadᵢ ∧ ValorUnitarioᵢ ∧ TrazabilidadEconómicaᵢ` — TRES
 * condiciones. `unit` (unidad de MEDIDA física: "horas", "eventos", …) es
 * la "Unidadᵢ" — §31 la lista aparte ("variable, unidad, dominio y
 * evolución"); §12 la distingue del valor unitario monetario ("3.000
 * horas... 25 unidades monetarias por hora"). Se agregó como campo
 * OPCIONAL/nullable (reapertura de fbd78ea, 4ª): la monetización es "una
 * rama posible" (§20), no todo EPD monetiza — `unit` ausente es fallo de
 * PUERTA (economia.js, alerta A09), no error de esquema. El engine Python
 * de referencia NO tiene este campo (modela solo 2 condiciones);
 * divergencia deliberada de §23.1, ver README ("Alcance del oráculo").
 *
 * El GATE (unit ∧ unit_value ∧ economic_traceability) vive en economia.js
 * (Fase 5), no aquí — el contrato solo valida forma.
 */

'use strict';

var mod = require('./enums');
var ENUMS = mod.ENUMS;
var ALERTAS = mod.ALERTAS;
var ALERTAS_RESERVADAS = mod.ALERTAS_RESERVADAS;

// ── validador genérico ─────────────────────────────────────────────────

function tipoValido(tipo, val) {
  if (tipo === 'string') return typeof val === 'string';
  if (tipo === 'number') return typeof val === 'number' && isFinite(val);
  if (tipo === 'boolean') return typeof val === 'boolean';
  if (tipo === 'array') return Array.isArray(val);
  if (tipo === 'object') return val !== null && typeof val === 'object' && !Array.isArray(val);
  if (tipo === 'int0a3') return typeof val === 'number' && val === Math.trunc(val) && val >= 0 && val <= 3;
  return false;
}

/**
 * validarObjeto(schema, obj) → { valido, faltantes:[], invalidos:[] }
 *
 * `null` en un campo obligatorio cuenta como AUSENTE — pero §26 distingue
 * `null` (NO DETERMINADO) de ausencia; los campos donde `null` es un valor
 * semántico legítimo se marcan `nullable:true` y no disparan "faltante".
 */
function validarObjeto(schema, obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valido: false, faltantes: ['(objeto completo — llegó ' + (obj === null ? 'null' : typeof obj) + ')'], invalidos: [] };
  }
  var faltantes = [], invalidos = [];
  schema.forEach(function (campo) {
    var val = obj[campo.name];
    var ausente = val === undefined || (val === null && !campo.nullable);
    if (ausente) {
      if (campo.required) faltantes.push(campo.name);
      return;
    }
    if (val === null && campo.nullable) return; // null legítimo (§26)
    if (campo.name === 'series_sufficiency' && !tipoValido('int0a3', val)) {
      invalidos.push('series_sufficiency: entero 0-3 (SS0..SS3), llegó ' + JSON.stringify(val));
      return;
    }
    if (!campo.type) return; // campo sin `type`: solo se valida presencia (delegado a un chequeo dedicado)
    if (!tipoValido(campo.type, val)) {
      invalidos.push(campo.name + ': se esperaba ' + campo.type + ', llegó ' + (Array.isArray(val) ? 'array' : typeof val));
      return;
    }
    if (campo.enum) {
      var valores = ENUMS[campo.enum];
      // IGUALDAD ESTRICTA — nunca includes()/substring (§ambigüedad 2:
      // "EV-MX" es inválido, no un match parcial de "EV-M").
      if (valores && valores.indexOf(val) === -1) {
        invalidos.push(campo.name + ': "' + val + '" no pertenece a ' + campo.enum + ' (' + valores.join(' | ') + ')');
      }
    }
  });
  return { valido: faltantes.length === 0 && invalidos.length === 0, faltantes: faltantes, invalidos: invalidos };
}

// ── §5 / §31 — EPD_INPUT ───────────────────────────────────────────────

var ESQUEMA_EPD_INPUT = [
  { name: 'epd_id', required: true, type: 'string' },
  { name: 'engine_version', required: true, type: 'string' }, // §31 "identificación y versión", §38
  // §6 — las 5 puertas de admisibilidad (Dᵢ ∧ Eᵢ ∧ Mᵢ ∧ Hᵢ ∧ Sᵢ)
  { name: 'deterioration_sustained', required: true, type: 'boolean' },
  { name: 'evidence_present', required: true, type: 'boolean' },
  { name: 'mechanism_traceable', required: true, type: 'boolean' },
  { name: 'horizon_defined', required: true, type: 'boolean' },
  { name: 'assumptions_declared', required: true, type: 'boolean' },
  // §7 — fuerza de evidencia prospectiva, 4 dimensiones 0-3
  { name: 'Q', required: true, type: 'int0a3' },
  { name: 'C', required: true, type: 'int0a3' },
  { name: 'T', required: true, type: 'int0a3' },
  { name: 'R', required: true, type: 'int0a3' },
  // §14-17 — variable, evolución, serie, horizonte
  { name: 'variable_type', required: true, type: 'string', enum: 'VARIABLE_TYPE' },
  { name: 'evolution_type', required: true, type: 'string', enum: 'EVOLUTION_TYPE' },
  { name: 'series_sufficiency', required: true, type: 'number' }, // int 0-3, chequeo especial
  { name: 'horizon', required: true, type: 'number' },
  { name: 'hms', required: true, type: 'number', nullable: true }, // §18; null = no declarado
  // §20 — parámetros de proyección (opcionales, según el método aplicable)
  { name: 'baseline', required: false, type: 'number', nullable: true },
  { name: 'frequency', required: false, type: 'number', nullable: true }, // §31 "baseline y frecuencia"
  { name: 'exposure_obs', required: false, type: 'number', nullable: true },
  { name: 'events_obs', required: false, type: 'number', nullable: true },
  { name: 'exposure_future', required: false, type: 'number', nullable: true },
  { name: 'trend_a', required: false, type: 'number', nullable: true },
  { name: 'trend_b', required: false, type: 'number', nullable: true },
  { name: 'growth_rate', required: false, type: 'number', nullable: true },
  { name: 'delta', required: false, type: 'number', nullable: true },
  { name: 'lower_bound', required: false, type: 'number', nullable: true }, // §15 dominio natural
  { name: 'upper_bound', required: false, type: 'number', nullable: true },
  // §4 — tipología de impacto
  { name: 'impact_type', required: false, type: 'string', enum: 'IMPACT_TYPE' },
  // §23 — módulo económico. La puerta §23.1 (unit ∧ unit_value ∧
  // economic_traceability) se evalúa en economia.js (Fase 5); aquí solo
  // forma. `unit` = unidad de medida FÍSICA (§23.1 "Unidadᵢ", §31); campo
  // opcional — un EPD no-económico no lo trae (reapertura fbd78ea, 4ª).
  { name: 'unit', required: false, type: 'string', nullable: true },
  { name: 'unit_value', required: false, type: 'number', nullable: true },
  { name: 'economic_traceability', required: true, type: 'boolean' },
  // §23.3 — atribución categórica. OBLIGATORIA. SIN `type`/`enum` a
  // propósito: TODA su validación (incluido "no es un coeficiente") pasa
  // por validarAtribucionCategoria, única fuente de esa regla.
  { name: 'attribution_category', required: true },
  // §21.3 / §24 — contención. El engine calcula ver/roi de aquí; v1.2.2 §24
  // dejó ver/roi PENDIENTE DE AUDITORÍA — se reciben pero NO se usan para
  // producir ver/roi (ver README y Fase 5-6).
  { name: 'containment_factor', required: false, type: 'number', nullable: true },
  { name: 'containment_evidence_level', required: false, type: 'int0a3' },
  { name: 'intervention_cost', required: false, type: 'number', nullable: true },
  // §25 — control de doble conteo
  { name: 'double_count_ids', required: false, type: 'array' }, // {event, resource, cost_component, period}
  // §20.1 — declaración explícita de "el volumen cambia materialmente",
  // usada SOLO como último recurso cuando exposure_obs/exposure_future no
  // permiten calcularlo (Fase 3). Si ambos están presentes, el motor
  // calcula y manda (registra discrepancia en auditoría si el declarado
  // contradice). Reapertura de Fase 0 (fbd78ea) — decisión híbrida de Luis.
  { name: 'volume_change_material', required: false, type: 'boolean', nullable: true },
  // §21.2 — serie histórica cronológica (más antigua → más reciente). El
  // documento la PRESUPONE ("puede utilizar variabilidad histórica
  // adversa") pero no existía en EPD_INPUT hasta Fase 4. El motor deriva
  // g_int/delta_int de sus cambios período a período (Q75 de los adversos).
  // Reapertura de Fase 0 (fbd78ea) — 3ª (tras f900b10 y 015a3bd).
  { name: 'serie_historica', required: false, type: 'array', nullable: true },
  // §21.2 — parámetros de intensificación declarados explícitos, usados
  // solo cuando serie_historica no alcanza INTENSIFICACION_MIN_PUNTOS.
  // Paralelos a growth_rate/delta.
  { name: 'growth_rate_intensificacion', required: false, type: 'number', nullable: true },
  { name: 'delta_intensificacion', required: false, type: 'number', nullable: true }
];

function validarEPDInput(obj) {
  var base = validarObjeto(ESQUEMA_EPD_INPUT, obj);
  // La regla "atribución NUNCA es un coeficiente" tiene UNA sola
  // implementación: validarAtribucionCategoria. validarEPDInput la llama en
  // vez de repetir la lógica — así una mutación de esa función rompe ambos
  // caminos a la vez (mismo patrón que rangoIncompatibleConObserved en CFF).
  if (obj && typeof obj === 'object' && obj.attribution_category !== undefined) {
    var vc = validarAtribucionCategoria(obj.attribution_category);
    if (!vc.valido) {
      return { valido: false, faltantes: base.faltantes, invalidos: base.invalidos.concat(['attribution_category: ' + vc.motivo]) };
    }
  }
  // §21.2 — serie_historica: array de números, si está presente
  if (obj && Array.isArray(obj.serie_historica) &&
      !obj.serie_historica.every(function (x) { return typeof x === 'number' && isFinite(x); })) {
    return { valido: false, faltantes: base.faltantes,
      invalidos: base.invalidos.concat(['serie_historica: todos los elementos deben ser números finitos']) };
  }
  return base;
}

// ── §31 — EPD_OUTPUT ──────────────────────────────────────────────────

var ESQUEMA_EPD_OUTPUT = [
  { name: 'epd_id', required: true, type: 'string' },
  { name: 'engine_version', required: true, type: 'string' },
  { name: 'admissible', required: true, type: 'boolean' },
  { name: 'FEP', required: true, type: 'int0a3' },
  { name: 'output_level', required: true, type: 'string', enum: 'OUTPUT_LEVEL' },
  { name: 'status', required: true, type: 'string', enum: 'STATUS' },
  { name: 'projection_base', required: true, type: 'number', nullable: true },
  { name: 'projection_lower', required: true, type: 'number', nullable: true },
  { name: 'projection_upper', required: true, type: 'number', nullable: true },
  { name: 'economic_base', required: true, type: 'number', nullable: true },
  { name: 'economic_lower', required: true, type: 'number', nullable: true },
  { name: 'economic_upper', required: true, type: 'number', nullable: true },
  { name: 'attribution_category', required: true, type: 'string', enum: 'ATTRIBUTION_CATEGORY' },
  { name: 'scenarios', required: false, type: 'array' },
  { name: 'method', required: true, type: 'string', nullable: true },
  { name: 'impact_type', required: false, type: 'string', enum: 'IMPACT_TYPE' },
  // salidas heredadas — SIEMPRE marcador PENDIENTE_AUDITORIA, nunca número
  // (§24). La FORMA se hace cumplir en validarSalidasHeredadas (abajo),
  // llamada por validarEPDOutput. Reapertura de Fase 0 (fbd78ea) — 5ª.
  { name: 'heritage_outputs', required: true, type: 'object' }, // {CFD,CFR,VER,ROI_P,TRE} → cada uno {estado:'PENDIENTE_AUDITORIA'}
  { name: 'alerts', required: true, type: 'array' },
  { name: 'notes', required: true, type: 'array' },
  { name: 'assumptions', required: false, type: 'array' }
];

// §24 — las 5 salidas heredadas, congeladas: cada una es exactamente el
// marcador { estado: 'PENDIENTE_AUDITORIA' }, NUNCA un número.
var SALIDAS_HEREDADAS = ['CFD', 'CFR', 'VER', 'ROI_P', 'TRE'];
var MARCADOR_HEREDADO_ESTADO = 'PENDIENTE_AUDITORIA';

/**
 * validarSalidasHeredadas(ho) → { valido, invalidos: [] }
 *
 * §24: "En v1.2.2 no se fija fórmula normativa para ninguna de estas cinco
 * salidas." Se exige la FORMA congelada:
 *   - exactamente las 5 claves CFD, CFR, VER, ROI_P, TRE (ni más ni menos)
 *   - cada valor: objeto con EXACTAMENTE { estado: 'PENDIENTE_AUDITORIA' }
 *   - un número (o string, o cualquier otra forma) en cualquiera de las 5
 *     → RECHAZADO. Ahí es donde entraría una fórmula fabricada.
 * §24: "No presentar CFR = VER" — son 5 entradas independientes; este
 * validador no las colapsa ni las compara entre sí.
 */
function validarSalidasHeredadas(ho) {
  if (ho === null || typeof ho !== 'object' || Array.isArray(ho)) {
    return { valido: false, invalidos: ['heritage_outputs: se esperaba objeto {CFD,CFR,VER,ROI_P,TRE}, llegó ' +
      (ho === null ? 'null' : Array.isArray(ho) ? 'array' : typeof ho)] };
  }
  var invalidos = [];
  var claves = Object.keys(ho);
  claves.forEach(function (k) {
    if (SALIDAS_HEREDADAS.indexOf(k) === -1) invalidos.push('heritage_outputs: clave inesperada "' + k + '" (solo ' + SALIDAS_HEREDADAS.join(', ') + ')');
  });
  SALIDAS_HEREDADAS.forEach(function (k) {
    if (claves.indexOf(k) === -1) { invalidos.push('heritage_outputs: falta la clave "' + k + '"'); return; }
    var v = ho[k];
    if (v === null || typeof v !== 'object' || Array.isArray(v)) {
      invalidos.push('heritage_outputs.' + k + ': se esperaba el marcador { estado: "' + MARCADOR_HEREDADO_ESTADO +
        '" }, llegó ' + (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v) +
        ' — §24 NO fija fórmula para ' + k + ', nunca es un número/cifra');
      return;
    }
    var vk = Object.keys(v);
    if (vk.length !== 1 || vk[0] !== 'estado' || v.estado !== MARCADOR_HEREDADO_ESTADO) {
      invalidos.push('heritage_outputs.' + k + ': el marcador debe ser EXACTAMENTE { estado: "' +
        MARCADOR_HEREDADO_ESTADO + '" }, llegó ' + JSON.stringify(v));
    }
  });
  return { valido: invalidos.length === 0, invalidos: invalidos };
}

function validarEPDOutput(obj) {
  var base = validarObjeto(ESQUEMA_EPD_OUTPUT, obj);
  if (base.valido && obj && typeof obj === 'object') {
    var extra = [];
    // alerts: cada entrada debe ser un código conocido y NUNCA A08/A11.
    (obj.alerts || []).forEach(function (a) {
      var code = (a && a.code) || a;
      if (ALERTAS_RESERVADAS.indexOf(code) !== -1) {
        extra.push('alerts: "' + code + '" está RESERVADO Y VACÍO — no se emite (§ catálogo de alertas)');
      } else if (!ALERTAS[code]) {
        extra.push('alerts: código de alerta desconocido "' + code + '"');
      }
    });
    // §24 — forma congelada de heritage_outputs (reapertura de Fase 0, 5ª)
    var vh = validarSalidasHeredadas(obj.heritage_outputs);
    if (!vh.valido) extra = extra.concat(vh.invalidos);
    if (extra.length) return { valido: false, faltantes: base.faltantes, invalidos: base.invalidos.concat(extra) };
  }
  return base;
}

// ── §23.3 / §28 / §35 — atribución categórica: nunca coeficiente ────────

/**
 * validarAtribucionCategoria(valor)
 *
 * Equivalente JS del `ValueError` del engine de referencia (§28: "validate
 * attribution_category ∈ {...}; otherwise reject input"). Un coeficiente
 * continuo (p.ej. 0.70, "0.70", 0) NO es una categoría — se rechaza.
 * §35: "Entrada de atribución continua (p. ej., 0.70) → rechazar".
 *
 * @returns {{ valido: boolean, motivo: string|null }}
 */
function validarAtribucionCategoria(valor) {
  if (ENUMS.ATTRIBUTION_CATEGORY.indexOf(valor) !== -1) {
    return { valido: true, motivo: null };
  }
  return {
    valido: false,
    motivo: 'attribution_category="' + JSON.stringify(valor) + '" no es una de las 4 categorías discretas (' +
      ENUMS.ATTRIBUTION_CATEGORY.join(' | ') + '). §23.3/§28/§35: la atribución NUNCA es un coeficiente continuo — ' +
      'ni número, ni cadena numérica, ni porcentaje.'
  };
}

// ── §26 — NULL / 0 / NA ────────────────────────────────────────────────

/**
 * clasificarValorNulo(v)
 *
 * §26: 0 = ausencia demostrada · NULL = no determinado · 'NA' = no
 * aplicable. "NO DETERMINADO ≠ AUSENCIA DE IMPACTO". Un campo económico o
 * de proyección solo puede ser: número finito, `null`, o 'NA'.
 *
 * @returns 'CERO_AUSENCIA_DEMOSTRADA' | 'NULL_NO_DETERMINADO' | 'NA_NO_APLICABLE' | 'VALOR' | 'INVALIDO'
 */
function clasificarValorNulo(v) {
  if (v === 0) return 'CERO_AUSENCIA_DEMOSTRADA';
  if (v === null) return 'NULL_NO_DETERMINADO';
  if (v === 'NA') return 'NA_NO_APLICABLE';
  if (typeof v === 'number' && isFinite(v)) return 'VALOR';
  return 'INVALIDO';
}

module.exports = {
  validarObjeto: validarObjeto,
  validarEPDInput: validarEPDInput,
  validarEPDOutput: validarEPDOutput,
  validarSalidasHeredadas: validarSalidasHeredadas,
  validarAtribucionCategoria: validarAtribucionCategoria,
  clasificarValorNulo: clasificarValorNulo,
  SALIDAS_HEREDADAS: SALIDAS_HEREDADAS,
  MARCADOR_HEREDADO_ESTADO: MARCADOR_HEREDADO_ESTADO,
  ESQUEMA_EPD_INPUT: ESQUEMA_EPD_INPUT,
  ESQUEMA_EPD_OUTPUT: ESQUEMA_EPD_OUTPUT
};
