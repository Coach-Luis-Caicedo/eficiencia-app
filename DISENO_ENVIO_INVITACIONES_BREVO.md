# Diseño — envío automático de invitaciones ICE-IEH/SDMO vía Brevo

**Estado: §0 DECIDIDO (opción a) Y CONSTRUIDO; §1 y §2 CONSTRUIDOS Y
VERIFICADOS, sin desplegar.** Responde el encargo de esta sesión (3
puntos) después de descartar OTP/Supabase Auth. Verificado contra el
código real de `034`/`035`, `src/worker.js`, `src/lib/supabaseRpc.js`, y
`app-el-amor-existe/js/amar-shared.js` (repo hermano, mismo proveedor ya en
producción) — nada inventado desde cero.

**§0 (antes bloqueante) — decidido y construido**: `email` es la tercera
columna del CSV y el campo nuevo de "Una persona"
(`DISENO_CARGA_MASIVA_CSV.md`, `crear_organizacion.html`, commit
`3df288d`, verificado en producción). El lote que llegará al endpoint de
§2 ya trae `{persona_id, node_id, codigo, email}` por fila, tal como este
documento asumía.

**§1 (migración `046_notificado_en_invitaciones_cuestionario.sql`) y §2
(`enviarInvitacionesCuestionarioHandler`/`enviarCorreoInvitacion` en
`src/worker.js`, ruta `enviar-invitaciones-cuestionario`)** construidos
tal cual quedaron diseñados abajo. `046` verificada con pglite (9 asserts,
**sin aplicar** en Supabase — requiere el OK de Luis, mismo criterio que
`044`/`045`). `worker.test.mjs`: 18 asserts nuevos (69 en total),
mutación confirmada (revertir `src/worker.js` rompe la suite). Los dos
prerrequisitos de despliegue de abajo ya están resueltos por Luis
(`BREVO_API_KEY` como secreto del Worker; remitente
`invitaciones@eficiencia.com.co` verificado en Brevo, SPF/DKIM/DMARC en
verde) — `BREVO_SENDER_EMAIL` se agregó a `wrangler.jsonc` como `vars`
(pública por diseño, va en el `From:`).

**Una decisión de contenido que este documento dejó fuera de alcance
("pendiente de redactar")**: al construir, `htmlContent` necesitaba texto
real para poder probarse — se escribió un HTML mínimo funcional (enlace a
`cuestionario_ice_ieh.html?codigo=...`), no una redacción final. Revisar
antes de que salgan invitaciones reales a personas de verdad.

---

## 0. Pregunta abierta que precede a todo lo demás (para decidir, no aquí)

`p_asignaciones` (`{persona_id, node_id}`, `034:31`) y el CSV aprobado
(`persona_id,node_id`, `DISENO_CARGA_MASIVA_CSV.md §2`) no tienen ningún
campo de correo. Dos caminos, sin elegir:

- **(a)** Agregar `email` como tercera columna al CSV (y al modo "Una
  persona" del Paso 2, para no dejar los dos modos asimétricos). Cambio
  chico sobre un diseño ya aprobado, no sobre código ya construido (la
  ronda de `DISENO_CARGA_MASIVA_CSV.md` no se ha implementado todavía,
  por lo que verifiqué en el repo).
- **(b)** Tabla/fuente de resolución `persona_id → email` aparte, cargada
  en otro momento (p.ej. desde el directorio de RRHH). No diseñada aquí —
  es una pieza más grande, con sus propias preguntas (¿quién la carga?
  ¿cuándo? ¿qué pasa si no hay fila para un `persona_id`?).

Todo lo que sigue asume que, decidido esto, el cliente que llama al
endpoint de §2 ya tiene `{persona_id, node_id, codigo, email}` por fila —
el Worker no resuelve el correo, solo lo recibe.

---

## 1. Columna `notificado_en` en `invitaciones_cuestionario`

Mismo criterio de nombres que el resto de la tabla (`creado_en`,
`activa`) — `timestamptz`, nullable, `NULL` = pendiente de envío:

```sql
-- Migración nueva (número siguiente al último aplicado)
ALTER TABLE motores_eficiencia.invitaciones_cuestionario
  ADD COLUMN notificado_en timestamptz;

COMMENT ON COLUMN motores_eficiencia.invitaciones_cuestionario.notificado_en IS
  'NULL = invitación creada pero el correo de aviso no se ha enviado (o el '
  'envío falló). Se llena con now() cuando el Worker confirma un envío '
  'exitoso a Brevo, vía marcar_invitacion_notificada(). No indica que la '
  'persona ya respondió -- solo que fue notificada; para eso se consulta '
  'ice_ieh_respuestas/sdmo_respuestas por separado, igual que hoy.';

-- Opcional, barato, habilita "reenviar pendientes" (WHERE notificado_en IS NULL)
-- a escala sin escanear toda la tabla -- mismo criterio de índice parcial
-- que ya usa 033 (idx_invitaciones_cuestionario_codigo ... WHERE activa).
CREATE INDEX idx_invitaciones_cuestionario_pendientes
  ON motores_eficiencia.invitaciones_cuestionario (organization_id)
  WHERE notificado_en IS NULL;
```

No toca `invitaciones_fpv` — mismo hueco estructural (sin `notificado_en`,
sin `email`), pero **fuera de esta ronda**: el encargo fue explícito sobre
ICE-IEH/SDMO, y FPV no se ha discutido para envío automático en ningún
punto de esta sesión. Señalado para no perderlo, no resuelto aquí.

**Función de escritura nueva** — el Worker nunca toca tablas de
`motores_eficiencia` directo (schema cerrado, `REVOKE ALL FROM PUBLIC`,
`030:39-45`); todo pasa por `SECURITY DEFINER`, mismo patrón que las 9
funciones de `034`. Patrón B (`authenticated` + `consultor_organizacion`),
idéntico al resto:

```sql
CREATE OR REPLACE FUNCTION motores_eficiencia.marcar_invitacion_notificada(
  p_codigo text
) RETURNS void
SECURITY DEFINER SET search_path = public, motores_eficiencia
LANGUAGE plpgsql AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'no autenticado';
  END IF;

  UPDATE motores_eficiencia.invitaciones_cuestionario ic
  SET notificado_en = now()
  WHERE ic.codigo = p_codigo
    AND EXISTS (
      SELECT 1 FROM consultor_organizacion co
      WHERE co.organizacion_id = ic.organization_id
        AND co.consultor_id = auth.uid()
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'código no encontrado o consultor no autorizado';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION motores_eficiencia.marcar_invitacion_notificada(text) TO authenticated;
```

Identifica por `codigo` (único, `033:52`) en vez de `(organization_id,
persona_id)` — es lo que ya trae cada fila del lote devuelto por
`generar_invitaciones_cuestionario` (`034:59`), sin necesidad de que el
Worker arme la llave compuesta. Una llamada por fila exitosa, no en lote —
coherente con "por cada envío exitoso, actualiza esa columna" del encargo,
y con el reporte de progreso incremental que ya usa el patrón de
`DISENO_CARGA_MASIVA_CSV.md §3` (estado D, contador en vivo).

---

## 2. Endpoint del Worker — `enviar-invitaciones-cuestionario`

**Prerrequisitos de despliegue, no de diseño** (para que Luis los tenga
antes de construir, no descubrirlos a mitad de camino):
- `BREVO_API_KEY` no existe hoy como variable en `eficiencia-app` — está
  configurada para el Worker de `app-el-amor-existe`, que es un proyecto
  Cloudflare distinto (aunque misma cuenta). Hay que agregarla como
  secreto propio de este Worker (`wrangler secret put BREVO_API_KEY`),
  mismo criterio de "secretos, no `vars`" que ya se decidió para
  `SUPABASE_URL`/`SUPABASE_ANON_KEY` (`PENDIENTES_BRECHAS_WORKER_MOTORES.md §12`
  las declaró como `vars` por ser públicas por diseño — `BREVO_API_KEY`
  **no** es pública, va como `secret`).
- El remitente (`sender: {name, email}`) de `app-el-amor-existe` es
  `elamorexiste.app@gmail.com`, verificado en Brevo para ese proyecto.
  EFICIENCIA necesita su propio remitente verificado en la misma cuenta
  Brevo (o el envío lo rechaza/marca como spam) — no asumido que ya exista.

**Ruta nueva**, mismo patrón que las 8 existentes (`src/worker.js:164-169`,
objeto `RUTAS`):

```js
const RUTAS = {
  // ... las 8 ya existentes ...
  'enviar-invitaciones-cuestionario': enviarInvitacionesCuestionarioHandler
};
```

**Contrato de entrada** — el cliente (consultor, ya autenticado) ya llamó
`generar_invitaciones_cuestionario` por su cuenta (vía supabase-js directo,
como hace hoy `DISENO_CARGA_MASIVA_CSV.md §4`, no a través del Worker — el
Worker no genera invitaciones, solo notifica las ya creadas) y le agregó el
`email` de cada fila (§0):

```
POST /api/enviar-invitaciones-cuestionario
Authorization: Bearer <jwt del consultor>
Content-Type: application/json

{
  "organization_id": "...",
  "invitaciones": [
    { "persona_id": "p001", "node_id": "ventas", "codigo": "abc123...", "email": "persona@empresa.com" },
    ...
  ]
}
```

**Handler**, mismo estilo que los 8 ya existentes (`extraerJWT` +
`RespuestaError` para validación, `rpc()` para todo lo que toca la base):

```js
async function enviarInvitacionesCuestionarioHandler(request, env) {
  const jwt = extraerJWT(request);
  const { invitaciones } = await leerParams(request);

  if (!Array.isArray(invitaciones) || invitaciones.length === 0) {
    throw new RespuestaError(400, 'invitaciones debe ser un array no vacío');
  }

  const enviados = [];
  const fallidos = [];

  // Secuencial, no paralelo -- mismo criterio que generarLotes() en
  // DISENO_CARGA_MASIVA_CSV.md §4 (evita saturar el rate limit de Brevo,
  // y "N de M" como contador en vivo solo tiene sentido secuencial).
  for (const fila of invitaciones) {
    try {
      const res = await enviarCorreoInvitacion(env, fila); // ver más abajo
      if (!res.ok) {
        const err = await res.text();
        fallidos.push({ persona_id: fila.persona_id, codigo: fila.codigo, motivo: 'Brevo ' + res.status + ': ' + err });
        continue; // no lanzar -- mismo estándar que amar-shared.js:168
      }
      await rpc(env, jwt, 'marcar_invitacion_notificada', { p_codigo: fila.codigo });
      enviados.push(fila.codigo);
    } catch (e) {
      // fetch/timeout, o el RPC de marcado falló -- el correo pudo haber
      // salido igual; se reporta como fallido para que el consultor lo
      // vea, no se asume ningún estado.
      fallidos.push({ persona_id: fila.persona_id, codigo: fila.codigo, motivo: e.message });
    }
  }

  return Response.json({
    total: invitaciones.length,
    enviados: enviados.length,
    fallidos: fallidos // [{persona_id, codigo, motivo}] -- mismo shape que lotesFallidos de la carga CSV
  });
}
```

**`enviarCorreoInvitacion`** — mismo `fetch()` que `amar-shared.js:150-163`,
mismo timeout (10s), payload confirmado en §3:

```js
async function enviarCorreoInvitacion(env, fila) {
  const enlace = `${env.SITE_URL || 'https://eficiencia.com.co'}/cuestionario_ice_ieh.html?codigo=${encodeURIComponent(fila.codigo)}`;
  return fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sender: { name: 'EFICIENCIA', email: env.BREVO_SENDER_EMAIL /* pendiente de verificar en Brevo */ },
      to: [{ email: fila.email }],
      subject: 'Tu invitación para responder el cuestionario EFICIENCIA',
      htmlContent: `<!DOCTYPE html><html><body>...</body></html>` // pendiente de redactar, fuera de este diseño
    }),
    signal: AbortSignal.timeout(10000)
  });
}
```

**Explícitamente no diseñado aquí, por proporcionalidad**:
- El HTML exacto del correo (texto/estilo) — contenido, no arquitectura.
- Reintentos automáticos de un fallido — igual que
  `DISENO_CARGA_MASIVA_CSV.md §3` decidió no tenerlo para los lotes de
  creación, "reenviar pendientes" queda como una llamada nueva a este
  mismo endpoint filtrando por `notificado_en IS NULL` (habilitado por el
  índice de §1), no como lógica automática dentro de él.
- Cómo se le pasa `SITE_URL`/`BREVO_SENDER_EMAIL` al Worker (`vars` vs
  `secret`) — mismo tipo de decisión que ya se tomó para
  `SUPABASE_URL`/`BREVO_API_KEY`, no repetida aquí.

---

## 3. Forma exacta del payload de Brevo — confirmada contra `app-el-amor-existe`

Verificado línea por línea, `app-el-amor-existe/js/amar-shared.js:150-163`
(única llamada a Brevo que existe en el ecosistema, en producción):

```js
fetch('https://api.brevo.com/v3/smtp/email', {
  method: 'POST',
  headers: {
    'api-key':      env.BREVO_API_KEY,   // header, no Bearer -- API key propia de Brevo
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    sender:      { name: '...', email: '...' },   // remitente verificado en Brevo
    to:          [{ email: '...' }],               // un destinatario por llamada -- no hay envío en lote en este uso
    subject:     '...',
    htmlContent: '...',                             // HTML completo, no texto plano ni template ID de Brevo
  }),
  signal: AbortSignal.timeout(10000),                // 10s, mismo valor que se replica en §2
});
```

Sin sorpresas frente a la documentación pública de Brevo — es el endpoint
`/v3/smtp/email` estándar, sin ningún parámetro adicional propio del
proyecto. **No usa** `templateId` (Brevo soporta templates propios de su
plataforma) ni envío en lote (`messageVersions`) — cada correo es una
llamada HTTP independiente, que es exactamente el modelo secuencial que §2
ya adopta por consistencia con `DISENO_CARGA_MASIVA_CSV.md`.

**Manejo de errores, confirmado como el estándar a replicar**
(`amar-shared.js:165-169`): si `!res.ok`, se loguea (`console.error`) y
**no se lanza** — el comentario propio del código lo justifica ahí como
"el pago ya fue procesado; el email es best-effort". En §2 se adapta esa
misma filosofía (no abortar el lote completo por un fallo individual) pero
**sí se reporta** el fallo al consultor en la respuesta (`fallidos[]`) en
vez de solo loguearlo — porque aquí, a diferencia de una compra ya cobrada,
no hay otro lugar donde el usuario final se entere de que no le llegó nada.
