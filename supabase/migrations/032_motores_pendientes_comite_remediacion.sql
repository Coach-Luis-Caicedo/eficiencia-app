-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 032: tablas de entrada de los 5 motores
-- pendientes (ice-ieh, sdmo, fpv, cff, ifd) + Comité EFICIENCIA +
-- registro de remedición autorizada fuera de calendario.
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- ── Contexto — DISEÑO YA APROBADO ──
--
-- Transcribe DISENO_INTEGRADO_TABLAS_ENTRADA_5_MOTORES.md, aprobado
-- completo por Luis, incluyendo su ronda de corrección (§6.3/§7: no se
-- reusa ninguna tabla legacy de `public`, `comite_eficiencia` y
-- `remediacion_autorizada` son tablas nuevas dentro de este schema).
-- No se reabre ninguna decisión de ese documento aquí — este archivo es
-- su transcripción a DDL, sección por sección.
--
-- ── Qué NO está en esta migración, a propósito (mismo criterio que 030) ──
--
-- 1. Formato de `period` — SIN CHECK de formato en `ice_ieh_respuestas`/
--    `sdmo_respuestas`/`fpv_respuestas`. Tensión real, no resuelta
--    (DISEÑO §2.4/§9): semestral legacy vs. mensual de motor-piio. Se
--    deja `text NOT NULL` sin `_es_periodo_valido()` — agregar ese CHECK
--    ahora sería fabricar una resolución que Luis no ha tomado.
-- 2. `node_id` vs. "departamento" para `ice-ieh` — SIN FK, tensión
--    reabierta explícitamente (DISEÑO §7.1/§9), no resuelta aquí.
-- 3. Ninguna función `SECURITY DEFINER` todavía — mismo motivo que `030`:
--    no hay caso de uso real de lectura/escritura verificado. Incluye la
--    función de escritura post-creación de `comite_eficiencia` (DISEÑO
--    §6.3, hueco 1) y la función que registra una `remediacion_autorizada`
--    (el consultor la registra, nunca el Comité directamente).
-- 4. `caso.relaciones[]` de `motor-cff` — sin `ESQUEMA_RELATIONSHIP`
--    formal en `contratos.js` que transcribir (DISEÑO §4, cierre).
-- 5. Reglas condicionales de validación que el propio validador JS del
--    motor NO impone como error duro (solo advierte/documenta "obligatorio
--    de hecho") — no se convierten en `CHECK` más estrictos que el motor
--    real. Se replican en SQL únicamente las reglas que el validador JS
--    SÍ hace cumplir como error — mismo criterio que `030` aplicó a
--    `metric_definitions.bridge_rule` (030:210-215).
-- ══════════════════════════════════════════════════════════════════


-- ── Helper de validación de respuestas ICE-IEH — reutilizado en el CHECK ──
-- Postgres no permite subconsultas dentro de un CHECK inline (verificado
-- por ejecución real contra PGlite: "cannot use subquery in check
-- constraint") — mismo motivo por el que 030 ya resolvía su validación de
-- período con una función (_es_periodo_valido), no con una expresión
-- inline. Se sigue ese mismo patrón aquí, no uno nuevo.
CREATE OR REPLACE FUNCTION motores_eficiencia._respuestas_ice_ieh_validas(respuestas jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE AS
$$
  SELECT respuestas ?& ARRAY['P1','P2','P3','P4','P5','P6','P7','P8','P9','P10',
                              'P11','P12','P13','P14','P15','P16','P17','P18','P19','P20',
                              'P21','P22','P23','P24','P25','P26','P27','P28','P29','P30','P31']
    AND (SELECT count(*) FROM jsonb_object_keys(respuestas)) = 31
    AND (SELECT bool_and(
           jsonb_typeof(kv.value) = 'number'
           AND (kv.value)::numeric BETWEEN 1 AND 5
           AND (kv.value)::numeric = trunc((kv.value)::numeric)
         ) FROM jsonb_each(respuestas) AS kv)
$$;

COMMENT ON FUNCTION motores_eficiencia._respuestas_ice_ieh_validas(jsonb) IS
  'Replica normalizarEntrada() (motor-ice-ieh.js:182-228): exactamente 31 '
  'claves P1..P31, cada valor un entero 1-5. Función en vez de CHECK inline '
  'porque Postgres no permite subconsultas dentro de un CHECK — verificado '
  'por ejecución real (PGlite), no asumido.';

-- ══════════════════════════════════════════════════════════════════
-- 1. motor-ice-ieh — ice_ieh_respuestas
--
-- Transcribe el contrato de `calcular(respuestas)`
-- (motor-ice-ieh/motor-ice-ieh.js:244-255) y la validación real de
-- `normalizarEntrada()` (motor-ice-ieh.js:182-228): 31 respuestas
-- P1..P31, enteras, 1-5, ninguna faltante.
--
-- Identidad (DISEÑO §2.1): el motor no carga organization_id/node_id/
-- period — son bookkeeping de esta tabla. `node_id` sin FK (§0/§2.1).
-- PK natural (organization_id, persona_id, period) — sin id sustituto:
-- persona_id ya identifica de forma única dentro de (org, período), no
-- hace falta inventar un id que ningún motor define (mismo razonamiento
-- que DISEÑO §6.3/§7.1 aplicó a comite_eficiencia/remediacion_autorizada).
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE motores_eficiencia.ice_ieh_respuestas (
  organization_id  uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  persona_id       text NOT NULL,
  period           text NOT NULL,   -- formato PENDIENTE DE DECISIÓN — ver nota superior, punto 1
  node_id          text NOT NULL,   -- SIN FK — ver nota superior, punto 2 / DISEÑO §2.1
  respuestas       jsonb NOT NULL,  -- {P1..P31: 1-5} — motor-ice-ieh.js:244-255, calcular(respuestas)
  creado_en        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, persona_id, period),

  -- Replica normalizarEntrada() (motor-ice-ieh.js:191-227): exactamente
  -- las 31 claves P1..P31, cada valor un entero 1-5. La validación de
  -- "recodificación" (COH-3 inversa, etc.) es de CÁLCULO, no de entrada
  -- — no se replica aquí, vive en motor-ice-ieh.js:266-268.
  CHECK (motores_eficiencia._respuestas_ice_ieh_validas(respuestas))
);
CREATE INDEX idx_ice_ieh_respuestas_nodo
  ON motores_eficiencia.ice_ieh_respuestas (organization_id, node_id, period);
COMMENT ON TABLE motores_eficiencia.ice_ieh_respuestas IS
  'Entrada cruda de motor-ice-ieh.calcular() (motor-ice-ieh.js:244-255). '
  'El CHECK replica normalizarEntrada() (motor-ice-ieh.js:182-228) exacto: '
  '31 claves P1..P31, enteras 1-5, ninguna faltante. `variables` (la salida '
  'derivada que consume motor-iao) NO se persiste aquí — se recalcula en '
  'caliente al agregar (DISEÑO §2.2, mismo principio que 030 aplicó a '
  'observations.value).';


-- ══════════════════════════════════════════════════════════════════
-- 2. motor-sdmo — sdmo_respuestas
--
-- Transcribe validarRespuestaIndividual() (motor-sdmo.js:288-320):
-- {ACU,COM,INV,PEN} 1-5 cada uno, CUALQUIERA puede faltar (§2.8: nunca
-- se imputa — no-respuesta parcial o total se trata igual, como null,
-- por el motor). Las 4 columnas nullable replican eso exactamente: un
-- valor PRESENTE pero fuera de 1-5 es el único caso que el motor
-- considera error (motor-sdmo.js:309, 314-316) — replicado por el CHECK.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE motores_eficiencia.sdmo_respuestas (
  organization_id  uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  persona_id       text NOT NULL,
  period           text NOT NULL,   -- formato PENDIENTE DE DECISIÓN — ver nota superior, punto 1
  node_id          text NOT NULL,   -- SIN FK — DISEÑO §2.1
  acu              smallint,        -- NULL = dimensión sin responder (§2.8) — motor-sdmo.js:306
  com              smallint,
  inv              smallint,
  pen              smallint,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, persona_id, period),
  CHECK (acu IS NULL OR acu BETWEEN 1 AND 5),
  CHECK (com IS NULL OR com BETWEEN 1 AND 5),
  CHECK (inv IS NULL OR inv BETWEEN 1 AND 5),
  CHECK (pen IS NULL OR pen BETWEEN 1 AND 5)
);
CREATE INDEX idx_sdmo_respuestas_nodo
  ON motores_eficiencia.sdmo_respuestas (organization_id, node_id, period);
COMMENT ON TABLE motores_eficiencia.sdmo_respuestas IS
  'Entrada cruda de motor-sdmo.calcularIDA() (motor-sdmo.js:337-348). Las 4 '
  'columnas nullable replican validarRespuestaIndividual() (motor-sdmo.js:288-320) '
  '— NULL = dimensión no respondida, nunca imputada; el motor trata <4 '
  'presentes como no-respuesta completa (§2.8). El paso de cálculo '
  '(calcularIDA por persona, ANTES de agrupar) es genuinamente distinto '
  'del de ice-ieh — ver DISEÑO §2.3, no una función genérica compartida.';


-- ══════════════════════════════════════════════════════════════════
-- 3. motor-fpv — fpv_respuestas
--
-- Transcribe ESQUEMA_RESPUESTA_PERSONA (motor-fpv/contratos.js:102-111)
-- y clasificarValorRespuesta (enums.js:41-42: valor de sensor = 1|2|3|4|5
-- | 'NE' | 'NR', NUNCA fusionados). SIN node_id — confirmado sin
-- contraparte en el contrato del motor (DISEÑO §3).
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE motores_eficiencia.fpv_respuestas (
  organization_id  uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  persona_id       text NOT NULL,
  posicion         text NOT NULL CHECK (posicion IN ('CONSUMIDOR','INVERSIONISTA','PROVEEDOR')), -- enums.js:30
  period           text NOT NULL,   -- formato PENDIENTE DE DECISIÓN — ver nota superior, punto 1
  f                text NOT NULL CHECK (f IN ('1','2','3','4','5','NE','NR')),  -- enums.js:41-42
  p                text NOT NULL CHECK (p IN ('1','2','3','4','5','NE','NR')),
  v                text NOT NULL CHECK (v IN ('1','2','3','4','5','NE','NR')),
  peso             numeric CHECK (peso IS NULL OR peso > 0),  -- contratos.js:110, opcional
  creado_en        timestamptz NOT NULL DEFAULT now(),
  -- persona_id único DENTRO de su posición (contratos.js:21-22, §7.3) —
  -- extendido con `period` porque el motor no tiene concepto de período
  -- propio (runFPV no lo recibe, DISEÑO §3) — es la extensión de la capa
  -- de persistencia para poder reconstruir un batch válido por período.
  PRIMARY KEY (organization_id, persona_id, posicion, period)
);
COMMENT ON TABLE motores_eficiencia.fpv_respuestas IS
  'Entrada cruda de motor-fpv.runFPV() (motor-fpv/runFPV.js:62-76), un '
  'registro por (persona_id, posicion). F/P/V son texto, no smallint — '
  'replican clasificarValorRespuesta() (enums.js:41-42): 1-5 numérico O '
  'los marcadores NE/NR, nunca fusionados (persona.js:59-64). SIN node_id '
  '— FPV no participa de la jerarquía de nodos (DISEÑO §3, verificado).';


-- ══════════════════════════════════════════════════════════════════
-- 4. motor-cff — cff_events + cff_event_components
--
-- Transcribe ESQUEMA_CFF_EVENT (motor-cff/contratos.js:173-192) y
-- ESQUEMA_ECONOMIC_COMPONENT (motor-cff/contratos.js:197-241). Único de
-- los 5 pendientes cuyo propio contrato trae organization_id/node_id/
-- period_start/period_end (DISEÑO §1/§4) — mismos nombres que
-- ESQUEMA_KPI_OBSERVATION de motor-piio. Relacional de raíz: 1 evento
-- → N componentes (DISEÑO §4) — dos tablas, no una fila con array.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE motores_eficiencia.cff_events (
  organization_id          uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  event_id                 text NOT NULL,
  source_type              text NOT NULL CHECK (source_type IN ('PIIO','EXTERNAL_OPERATIONAL_RECORD','VERIFIED_DIAGNOSTIC_FINDING')), -- enums.js:56
  source_ids               text[] NOT NULL DEFAULT '{}',
  phenomenon_id             text NOT NULL,
  domain_id                text NOT NULL,   -- SIN CHECK de enum — contratos.js:179 no lo declara (type:'string' sin `enum:`), a
                                             -- diferencia del domain_id de motor-piio (030:119-121) — no se inventa esa
                                             -- restricción aquí, el propio contrato de CFF no la exige.
  node_id                  text NOT NULL,   -- SIN FK — DISEÑO §0/§1
  period_start             text NOT NULL,
  period_end                text NOT NULL,
  event_type                text NOT NULL,
  event_description         text NOT NULL,
  operational_quantity      numeric,
  operational_unit          text,
  metric_definition_version text,
  exposure_definition       text,
  status                    text NOT NULL CHECK (status IN ('OPEN','COMPLETE','INVALID')), -- enums.js:57
  flags                     text[] NOT NULL DEFAULT '{}',
  creado_en                 timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, event_id)
);
CREATE INDEX idx_cff_events_nodo_periodo
  ON motores_eficiencia.cff_events (organization_id, node_id, period_start);
COMMENT ON TABLE motores_eficiencia.cff_events IS
  'CFF_EVENT (§22.1) — transcrita de motor-cff/contratos.js:173-192, '
  'ESQUEMA_CFF_EVENT. `components` (array en el contrato JS) se modela como '
  'la tabla hija cff_event_components — 1 evento → N componentes '
  '(DISEÑO §4, cardinalidad real, no un array de campos adicionales).';

CREATE TABLE motores_eficiencia.cff_event_components (
  organization_id           uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  component_id               text NOT NULL,
  event_id                   text NOT NULL,
  phenomenon_id               text NOT NULL,
  node_id                     text NOT NULL,   -- SIN FK — mismo criterio que cff_events.node_id
  consequence_id               text NOT NULL,
  primary_mechanism            text NOT NULL CHECK (primary_mechanism IN
                                   ('ADDITIONAL_CONSUMPTION','LOST_CAPACITY','REPLACEMENT','UNCAPTURED_VALUE')), -- enums.js:43
  financial_nature              text NOT NULL CHECK (financial_nature IN
                                   ('INCREMENTAL_COST','CAPACITY_VALUE','UNCAPTURED_MARGIN')), -- enums.js:44
  resource_type                 text NOT NULL,  -- vocabulario abierto, no enumerado — contratos.js:206
  quantity                      numeric NOT NULL,
  unit                          text NOT NULL,
  temporal_nature                text NOT NULL CHECK (temporal_nature IN ('PERIOD_FLOW','STOCK','RATE')), -- enums.js:47
  source_frequency                text NOT NULL,
  calculation_frequency            text NOT NULL,
  aggregation_frequency             text NOT NULL,
  calculation_mode                  text NOT NULL CHECK (calculation_mode IN ('UNIT_RATE','DIRECT_VALUE','DERIVED_FORMULA')), -- enums.js:58
  formula_id                        text,
  formula_version                    text,
  input_variables                    text[] NOT NULL DEFAULT '{}',
  monetary_basis_id                   text NOT NULL,
  original_value                       numeric,
  original_value_min                    numeric,
  original_value_max                     numeric,
  original_currency                       text NOT NULL,
  normalized_value                         numeric,
  reporting_currency                        text,
  valuation_basis                            text NOT NULL CHECK (valuation_basis IN ('NOMINAL','REAL')), -- enums.js:48
  monetization_status                         text NOT NULL CHECK (monetization_status IN ('OBSERVED','ESTIMATED','EXPOSURE','N_A')), -- enums.js:35
  attribution_status                           text NOT NULL CHECK (attribution_status IN ('CONFIRMED','SUPPORTED','UNRESOLVED','N_A')), -- enums.js:36
  valuation_role                                text NOT NULL CHECK (valuation_role IN ('PRIMARY','INCLUDED','ALTERNATIVE','EXCLUDED')), -- enums.js:59
  economic_scope                                 text NOT NULL CHECK (economic_scope IN ('NODE','BUSINESS_UNIT','ORGANIZATION')), -- enums.js:60
  counterparty_scope                              text NOT NULL CHECK (counterparty_scope IN ('INTERNAL','EXTERNAL','NONE')), -- enums.js:61
  shared_cost_id                                   text,
  deduplication_group_id                            text,
  dependency_refs                                   text[] NOT NULL DEFAULT '{}',
  include_in_cff                                    boolean NOT NULL,
  exclusion_reason                                   text,
  flags                                              text[] NOT NULL DEFAULT '{}',
  recovery_realization_type                           text CHECK (recovery_realization_type IS NULL OR recovery_realization_type IN
                                   ('CASH_COST_AVOIDANCE','CAPTURED_MARGIN','CAPACITY_RELEASE','OTHER_VALIDATED')), -- enums.js:78
  salary_derived                                       boolean,
  salary_basis_kind                                     text CHECK (salary_basis_kind IS NULL OR salary_basis_kind IN ('SALARY_BASE','FULLY_LOADED_COST')), -- enums.js:87
  creado_en                                              timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (organization_id, component_id),
  FOREIGN KEY (organization_id, event_id) REFERENCES motores_eficiencia.cff_events (organization_id, event_id),

  -- Reglas condicionales que SÍ son errores duros documentados en
  -- contratos.js (no solo comentarios "obligatorio de hecho") — mismo
  -- criterio de replicación selectiva que 030 aplicó a kpi_specs
  -- (030:292-293, DERIVED-only) y metric_definitions (030:208):

  -- Regla 7 (contratos.js:261-275): original_value XOR
  -- (original_value_min AND original_value_max) — exactamente una
  -- representación de valor, nunca ambas, nunca ninguna.
  CHECK (
    (original_value IS NOT NULL AND original_value_min IS NULL AND original_value_max IS NULL)
    OR (original_value IS NULL AND original_value_min IS NOT NULL AND original_value_max IS NOT NULL)
  ),

  -- contratos.js:253-258: normalized_value y reporting_currency se
  -- declaran juntos o ninguno de los dos.
  CHECK ((normalized_value IS NULL) = (reporting_currency IS NULL)),

  -- contratos.js:246-251: calculation_mode='DERIVED_FORMULA' exige
  -- formula_id + formula_version + input_variables no vacío.
  CHECK (
    calculation_mode <> 'DERIVED_FORMULA'
    OR (formula_id IS NOT NULL AND formula_version IS NOT NULL
        AND input_variables IS NOT NULL AND array_length(input_variables, 1) > 0)
  ),

  -- contratos.js:237-241 (Fase 5, README "compuertas interinas"):
  -- salary_derived=true exige salary_basis_kind.
  CHECK (salary_derived IS NOT TRUE OR salary_basis_kind IS NOT NULL)
);
CREATE INDEX idx_cff_event_components_event
  ON motores_eficiencia.cff_event_components (organization_id, event_id);
COMMENT ON TABLE motores_eficiencia.cff_event_components IS
  'ECONOMIC_COMPONENT (§22.2) — transcrita de motor-cff/contratos.js:197-241, '
  'ESQUEMA_ECONOMIC_COMPONENT. Los 4 CHECK replican reglas que '
  'reglasCondicionalesEconomicComponent() (contratos.js:244-...) SÍ hace '
  'cumplir como error. El resto de esa función (regla 8 sobre '
  'monetization_status=OBSERVED en rango, y otras no verificadas letra por '
  'letra en esta migración) queda sin replicar — se valida en '
  'motor-cff/contratos.js antes del INSERT, mismo criterio de no duplicar '
  'lógica del motor en SQL sin necesidad verificada (030:210-215). '
  'caso.relaciones[] (RELATIONSHIP) queda fuera — sin ESQUEMA_* formal que '
  'transcribir (DISEÑO §4, cierre).';


-- ══════════════════════════════════════════════════════════════════
-- 5. motor-ifd — ifd_epd
--
-- Transcribe ESQUEMA_EPD_INPUT (motor-ifd/contratos.js:104-174). Único
-- de los 5 sin ningún campo de identidad en su propio contrato (DISEÑO
-- §5) — organization_id/period son wrapper puro; SIN node_id (sin
-- evidencia de que un EPD se agrupe por nodo, DISEÑO §5).
--
-- Solo se replican como CHECK las reglas que validarEPDInput()
-- (contratos.js:176-195) hace cumplir en código — la mayoría de los
-- "obligatorio de hecho si X" de los comentarios NO están en el cuerpo
-- de esa función (son notas de intención, no validación real); no se
-- inventan aquí CHECK más estrictos que el propio motor (mismo criterio
-- que la nota superior, punto 5).
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE motores_eficiencia.ifd_epd (
  organization_id            uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  epd_id                     text NOT NULL,
  period                     text,    -- wrapper puro — EPD_INPUT no lo exige (DISEÑO §5); sin CHECK de formato, mismo motivo que ice-ieh/sdmo/fpv
  engine_version              text NOT NULL,
  deterioration_sustained      boolean NOT NULL,
  evidence_present               boolean NOT NULL,
  mechanism_traceable             boolean NOT NULL,
  horizon_defined                  boolean NOT NULL,
  assumptions_declared              boolean NOT NULL,
  q                                  smallint NOT NULL CHECK (q BETWEEN 0 AND 3),
  c                                  smallint NOT NULL CHECK (c BETWEEN 0 AND 3),
  t                                  smallint NOT NULL CHECK (t BETWEEN 0 AND 3),
  r                                  smallint NOT NULL CHECK (r BETWEEN 0 AND 3),
  variable_type                      text NOT NULL CHECK (variable_type IN ('V1','V2','V3','V4','V5')), -- ifd/enums.js:23
  evolution_type                      text NOT NULL CHECK (evolution_type IN ('EV-A','EV-M','EV-ACUM','EV-CUAL')), -- ifd/enums.js:43
  series_sufficiency                   numeric NOT NULL,  -- contratos.js:121: número 0-3, "chequeo especial" no detallado — sin CHECK inventado
  horizon                               numeric NOT NULL,
  hms                                    numeric,          -- nullable = no declarado (contratos.js:123)
  baseline                                numeric,
  frequency                                numeric,
  exposure_obs                              numeric,
  events_obs                                 numeric,
  exposure_future                             numeric,
  trend_a                                      numeric,
  trend_b                                       numeric,
  growth_rate                                    numeric,
  delta                                           numeric,
  lower_bound                                      numeric,
  upper_bound                                       numeric,
  impact_type                                        text CHECK (impact_type IS NULL OR impact_type IN ('ICAP','IOF','IEP','IEF')), -- ifd/enums.js:72
  unit                                                text,
  unit_value                                           numeric,
  economic_traceability                                 boolean NOT NULL,
  attribution_category                                   text NOT NULL CHECK (attribution_category IN ('CONFIRMED','SUPPORTED','UNRESOLVED','N_A')), -- ifd/enums.js:49
  containment_factor                                      numeric,
  containment_evidence_level                               smallint CHECK (containment_evidence_level IS NULL OR containment_evidence_level BETWEEN 0 AND 3),
  intervention_cost                                         numeric,
  double_count_ids                                           jsonb NOT NULL DEFAULT '[]',  -- {event,resource,cost_component,period} por elemento — contratos.js:156
  volume_change_material                                      boolean,
  serie_historica                                              numeric[],  -- contratos.js:188-193: array de números finitos si está presente
  growth_rate_intensificacion                                   numeric,
  delta_intensificacion                                          numeric,
  creado_en                                                       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, epd_id)
);
COMMENT ON TABLE motores_eficiencia.ifd_epd IS
  'EPD_INPUT (§28) — transcrita de motor-ifd/contratos.js:104-174, '
  'ESQUEMA_EPD_INPUT. Único de los 5 motores pendientes sin identidad '
  'organizacional en su propio contrato (DISEÑO §5) — organization_id y '
  'period son wrapper de esta tabla, no exigidos por runEPD(). Solo se '
  'replican como CHECK las reglas que validarEPDInput() (contratos.js:176-195) '
  'hace cumplir en código, no los comentarios "obligatorio de hecho" sin '
  'aplicación real (nota superior, punto 5).';


-- ══════════════════════════════════════════════════════════════════
-- 6. Comité EFICIENCIA — comite_eficiencia
--
-- Tabla nueva (DISEÑO §6.3, tras la corrección) — forma tomada como
-- referencia de public.contactos_organizacion (006:100-109), SIN
-- dependencia hacia esa tabla legacy. Diferencias deliberadas frente al
-- modelo de referencia documentadas en DISEÑO §6.3: rol restringido a
-- ('coordinador','miembro') — no incluye 'directivo_responsable'
-- (concepto distinto, atado al Responsable primario fijo del catálogo de
-- intervención) ni el valor legacy 'comite_supervision' (equivalencia
-- sin confirmar); sin email/telefono (fuera del encargo — "identidad +
-- rol, nada más"; el Comité no necesita contacto automatizado, a
-- diferencia de los empleados de SDMO).
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE motores_eficiencia.comite_eficiencia (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  rol              text NOT NULL CHECK (rol IN ('coordinador', 'miembro')),
  nombre           text NOT NULL,
  cargo            text,    -- libre, sin catálogo fijo — mismo criterio que contactos_organizacion.cargo (006:105)
  creado_en        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id)
  -- Sin UNIQUE forzando un solo 'coordinador' por organización — mismo
  -- motivo real que ya documentó 006:84-88: alguien puede cambiar de
  -- cargo y hace falta reemplazar el registro; se resuelve en la capa de
  -- aplicación, no aquí.
);
COMMENT ON TABLE motores_eficiencia.comite_eficiencia IS
  'Comité EFICIENCIA por organización — identidad + rol, nada más '
  '(DISEÑO §6, encargo explícito). Forma de referencia: '
  'public.contactos_organizacion (006:100-109) — SIN dependencia hacia '
  'ella (DISEÑO §6.3: reusarla habría cruzado el límite schema-separado '
  'de 030:10-12). Sin camino de escritura post-creación todavía — función '
  '`SECURITY DEFINER` pendiente, no diseñada en esta migración (nota '
  'superior, punto 3).';


-- ══════════════════════════════════════════════════════════════════
-- 7. Remedición fuera de calendario — remediacion_autorizada
--
-- Una tabla, discriminador `motor` — no dos tablas paralelas (DISEÑO
-- §7.1). Registra SOLO quién autorizó/cuándo/motivo — NO el disparo
-- automático de "+6 meses" (no reconstruido, DISEÑO §7 apertura) ni el
-- seguimiento completo de objetivos/decisiones/fichas del catálogo de
-- intervención (fuera de alcance explícito, DISEÑO §7.4). `notas` es la
-- única puerta abierta permitida — texto libre, sin estructura.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE motores_eficiencia.remediacion_autorizada (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  motor             text NOT NULL CHECK (motor IN ('ICE_IEH', 'FPV')),
  decidido_por      uuid NOT NULL,
  decidido_en       timestamptz NOT NULL DEFAULT now(),
  node_id           text,     -- SIN FK (mismo criterio que ice_ieh_respuestas.node_id) — NOT NULL solo si motor='ICE_IEH' (DISEÑO §7.1, reabre §2.5)
  motivo_fpv        text CHECK (motivo_fpv IS NULL OR motivo_fpv IN ('ronda_inversion','renovacion_contrato','otro')),
  notas             text,     -- puerta abierta explícita (encargo de Luis) — NO es el sistema de seguimiento completo
  creado_en         timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (organization_id, id),
  FOREIGN KEY (organization_id, decidido_por) REFERENCES motores_eficiencia.comite_eficiencia (organization_id, id),

  CHECK (
    (motor = 'ICE_IEH' AND node_id IS NOT NULL AND motivo_fpv IS NULL) OR
    (motor = 'FPV'     AND motivo_fpv IS NOT NULL AND node_id IS NULL)
  )
);
CREATE INDEX idx_remediacion_autorizada_org_motor
  ON motores_eficiencia.remediacion_autorizada (organization_id, motor, decidido_en);
COMMENT ON TABLE motores_eficiencia.remediacion_autorizada IS
  'Registro de autorización de remedición fuera de calendario — DISEÑO §7. '
  'Discriminador `motor` en vez de 2 tablas paralelas: la autorización '
  '(quién/cuándo/comité) es idéntica en forma para ice-ieh y fpv, solo '
  'difiere el objetivo (node_id vs. motivo_fpv, CHECK de exclusividad). '
  'decidido_por FK compuesta hacia comite_eficiencia, mismo schema — ya no '
  'cruza a public tras la corrección de §6.3/§7.2. El objetivo de '
  'ice-ieh usa node_id, no una tabla de "área" — reabre la tensión de '
  'DISEÑO §2.5/§9 (node_id vs. departamento) en vez de resolverla con un '
  'atajo hacia areas_organizacion (legacy).';


-- ══════════════════════════════════════════════════════════════════
-- Acceso — mismo patrón cerrado que 030/031
-- ══════════════════════════════════════════════════════════════════
-- Ningún rol de Supabase (`anon`, `authenticated`) recibe acceso — igual
-- que 030/031, sin excepción para las 8 tablas de esta migración. La
-- función SECURITY DEFINER que el consultor use para registrar cada una
-- (respuestas, eventos CFF/IFD, miembros del Comité, remediaciones) se
-- escribe el día que exista el caso de uso real de la UI, no antes —
-- mismo criterio que 030:39-45/393-406.
REVOKE ALL ON motores_eficiencia.ice_ieh_respuestas FROM PUBLIC;
REVOKE ALL ON motores_eficiencia.sdmo_respuestas FROM PUBLIC;
REVOKE ALL ON motores_eficiencia.fpv_respuestas FROM PUBLIC;
REVOKE ALL ON motores_eficiencia.cff_events FROM PUBLIC;
REVOKE ALL ON motores_eficiencia.cff_event_components FROM PUBLIC;
REVOKE ALL ON motores_eficiencia.ifd_epd FROM PUBLIC;
REVOKE ALL ON motores_eficiencia.comite_eficiencia FROM PUBLIC;
REVOKE ALL ON motores_eficiencia.remediacion_autorizada FROM PUBLIC;


-- ══════════════════════════════════════════════════════════════════
-- Verificación sugerida tras aplicar (mismo criterio que 030/031)
-- ══════════════════════════════════════════════════════════════════
-- 1. SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'motores_eficiencia' ORDER BY 1;
--    → 16 tablas: las 8 de 030 + node_hierarchy (031) + las 8 de esta
--      migración (ice_ieh_respuestas, sdmo_respuestas, fpv_respuestas,
--      cff_events, cff_event_components, ifd_epd, comite_eficiencia,
--      remediacion_autorizada).
-- 2. Confirmar `anon`/`authenticated` sin acceso a las 8 tablas nuevas —
--    mismo query que 030, punto 3.
-- 3. Insertar una fila de prueba en comite_eficiencia, luego una en
--    remediacion_autorizada citando ese id — debe funcionar. Cambiar el
--    id por uno de otra organización — debe fallar por la FK compuesta.
-- 4. Insertar en cff_event_components con calculation_mode='DERIVED_FORMULA'
--    y formula_id NULL — debe fallar por el CHECK correspondiente.
-- 5. Insertar en ice_ieh_respuestas con solo 30 de las 31 claves P1..P31
--    — debe fallar por el CHECK de jsonb.
