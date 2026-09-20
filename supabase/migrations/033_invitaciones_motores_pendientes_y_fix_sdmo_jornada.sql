-- ══════════════════════════════════════════════════════════════════
-- EFICIENCIA — Migración 033: tablas de invitación para ice-ieh/sdmo/fpv
-- + corrección de grano de sdmo_respuestas (period → jornada).
--
-- CC no ejecuta esto. Se muestra como diff, Luis lo aplica manualmente.
--
-- ── Contexto — dos decisiones tomadas por Luis, con análisis de
--    alternativas de por medio (ver DISENO_FUNCIONES_ESCRITURA_MOTORES_PENDIENTES.md §1/§2) ──
--
-- 1. Sin invitación en motores_eficiencia (hallazgo §1 de ese documento),
--    las 3 funciones anon de escritura no tienen forma segura de resolver
--    organization_id/persona_id/node_id — no se resuelve reusando
--    public.invitaciones_individuales (legacy), mismo límite ya aplicado
--    a comite_eficiencia (032, DISENO_INTEGRADO...§6.3).
-- 2. sdmo_respuestas.period (032) no encaja con la cadencia de 3×/semana
--    ya decidida (INVESTIGACION_CANAL_ENVIO_AUTOMATIZADO_SDMO.md) —
--    Luis decide: `period text` → `jornada date`, mismo nombre/tipo que
--    ya usó el sistema legacy para este instrumento exacto
--    (respuestas_sdmo.jornada, 001). Se corrige AHORA, no en una
--    migración de datos futura — sdmo_respuestas no tiene datos reales
--    todavía (aplicada en 032, cero filas insertadas en producción).
--
-- ── Por qué node_id/posicion se asignan en la invitación, no se
--    autorreportan como `area` en el sistema legacy ──
--
-- El sistema legacy deja que la persona autorreporte su departamento al
-- responder (`area` en respuestas_cuestionario, elegido de un selector
-- poblado por areas_por_codigo() — pero NUNCA revalidado server-side al
-- guardar, verificado contra enviar_respuesta_cuestionario: v_area solo
-- se normaliza trim+lower, no se compara contra areas_organizacion).
-- Para node_id, que motor-iao SÍ necesita agrupar con exactitud
-- (agregarOrganizacion, DISENO_INTEGRADO...§2.2), dejar que la persona
-- se autorreporte reintroduciría el mismo riesgo de deriva que
-- areas_organizacion (006) se construyó para evitar ("RRHH" vs
-- "Recursos Humanos"). Por eso node_id/posicion se fijan UNA vez, al
-- generar la invitación (consultor los asigna, conoce el organigrama),
-- no en cada respuesta — diferencia deliberada frente al patrón `area`
-- del legacy, no un descuido de no replicarlo.
-- ══════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════
-- 1. invitaciones_cuestionario — sirve ice-ieh Y sdmo (misma persona
-- responde ambos instrumentos; mismo criterio que el legacy comparte
-- invitaciones_individuales entre enviar_respuesta_cuestionario y
-- enviar_respuesta_sdmo, 001).
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE motores_eficiencia.invitaciones_cuestionario (
  organization_id  uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  persona_id       text NOT NULL,
  node_id          text NOT NULL,   -- SIN FK — mismo criterio que ice_ieh_respuestas.node_id (032)
  codigo           text NOT NULL UNIQUE
                     DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),  -- mismo generador que invitaciones_individuales (001)
  activa           boolean NOT NULL DEFAULT true,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, persona_id)
);
CREATE INDEX idx_invitaciones_cuestionario_codigo
  ON motores_eficiencia.invitaciones_cuestionario (codigo) WHERE activa;
COMMENT ON TABLE motores_eficiencia.invitaciones_cuestionario IS
  'Identidad/autorización para registrar_respuesta_ice_ieh() y '
  'registrar_respuesta_sdmo() (DISENO_FUNCIONES_ESCRITURA...§1/§4.1) — '
  'organization_id/persona_id/node_id se resuelven desde `codigo`, nunca '
  'se confía en lo que mande el cliente anónimo. Tabla nueva, sin '
  'dependencia hacia public.invitaciones_individuales (legacy).';


-- ══════════════════════════════════════════════════════════════════
-- 2. invitaciones_fpv — posicion fija por invitación (igual que
-- invitaciones_fpv.tipo_actor en el legacy, 008) — NO autorreportada.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE motores_eficiencia.invitaciones_fpv (
  organization_id  uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  persona_id       text NOT NULL,
  posicion         text NOT NULL CHECK (posicion IN ('CONSUMIDOR','INVERSIONISTA','PROVEEDOR')), -- motor-fpv/enums.js:30
  codigo           text NOT NULL UNIQUE
                     DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  activa           boolean NOT NULL DEFAULT true,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  -- persona_id único DENTRO de su posición — mismo criterio que
  -- fpv_respuestas (032) y ESQUEMA_RESPUESTA_PERSONA (contratos.js:21-22)
  PRIMARY KEY (organization_id, persona_id, posicion)
);
CREATE INDEX idx_invitaciones_fpv_codigo
  ON motores_eficiencia.invitaciones_fpv (codigo) WHERE activa;
COMMENT ON TABLE motores_eficiencia.invitaciones_fpv IS
  'Identidad/autorización para registrar_respuesta_fpv() — misma lógica '
  'que invitaciones_cuestionario, con `posicion` en vez de `node_id` como '
  'el eje real de FPV (DISENO_INTEGRADO...§3). Tabla nueva, sin '
  'dependencia hacia public.invitaciones_fpv (legacy, 008 — solo 2 de 3 '
  'posiciones, forma distinta).';


-- ══════════════════════════════════════════════════════════════════
-- 3. Corrección de sdmo_respuestas — period (text) → jornada (date)
--
-- sdmo_respuestas no tiene datos reales en producción (aplicada en 032,
-- cero filas) — corrección de DDL limpia, no migración de datos.
-- Se dropea la PK antes que la columna para no depender de un CASCADE
-- implícito — verificado por ejecución (PGlite) antes de traer esto a
-- revisión, no asumido.
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE motores_eficiencia.sdmo_respuestas DROP CONSTRAINT sdmo_respuestas_pkey;
DROP INDEX IF EXISTS motores_eficiencia.idx_sdmo_respuestas_nodo;
ALTER TABLE motores_eficiencia.sdmo_respuestas DROP COLUMN period;
ALTER TABLE motores_eficiencia.sdmo_respuestas ADD COLUMN jornada date NOT NULL;
ALTER TABLE motores_eficiencia.sdmo_respuestas ADD PRIMARY KEY (organization_id, persona_id, jornada);
CREATE INDEX idx_sdmo_respuestas_nodo
  ON motores_eficiencia.sdmo_respuestas (organization_id, node_id, jornada);
COMMENT ON TABLE motores_eficiencia.sdmo_respuestas IS
  'Entrada cruda de motor-sdmo.calcularIDA() (motor-sdmo.js:337-348). '
  '`jornada date` (no `period text`) — corregido en 033: SDMO nunca '
  'encajó en el concepto de período que sí aplica a ice-ieh/fpv, mismo '
  'nombre/tipo que ya usó el sistema legacy para este instrumento exacto '
  '(respuestas_sdmo.jornada, 001) — decisión de Luis, motivada por la '
  'cadencia de 3×/semana de INVESTIGACION_CANAL_ENVIO_AUTOMATIZADO_SDMO.md. '
  'Las 4 columnas nullable siguen replicando validarRespuestaIndividual() '
  '(motor-sdmo.js:288-320) sin cambios — NULL = dimensión no respondida.';


-- ══════════════════════════════════════════════════════════════════
-- Acceso — mismo patrón cerrado que 030/031/032
-- ══════════════════════════════════════════════════════════════════
REVOKE ALL ON motores_eficiencia.invitaciones_cuestionario FROM PUBLIC;
REVOKE ALL ON motores_eficiencia.invitaciones_fpv FROM PUBLIC;


-- ══════════════════════════════════════════════════════════════════
-- Verificación sugerida tras aplicar
-- ══════════════════════════════════════════════════════════════════
-- 1. SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'motores_eficiencia' ORDER BY 1;
--    → 18 tablas: las 16 ya existentes (030+031+032) + invitaciones_cuestionario
--      + invitaciones_fpv.
-- 2. SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_schema='motores_eficiencia' AND table_name='sdmo_respuestas'
--    AND column_name IN ('period','jornada');
--    → 1 fila (jornada, date) — period ya no existe.
-- 3. Confirmar anon/authenticated sin acceso a las 2 tablas nuevas —
--    mismo query de verificación que 030/032.
