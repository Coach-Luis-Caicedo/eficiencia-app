/**
 * src/worker.js -- Worker de ejecución de motores
 * (DISENO_WORKER_EJECUCION_MOTORES.md, completo). Aditivo sobre el sitio
 * estático existente -- ver wrangler.jsonc (`main` agregado junto a
 * `assets`, sin tocar cómo se sirven workbook.html/cuestionario.html/etc.).
 *
 * Ninguna ruta usa `service_role` -- todas reenvían el JWT del consultor
 * (Authorization: Bearer <jwt>) a Supabase, para que auth.uid() dentro de
 * cada función SECURITY DEFINER (033/034/035) resuelva al consultor real.
 *
 * `import`/`export default` (formato "ES Modules" de Cloudflare Workers,
 * el único que reconoce Wrangler como entry point con `main` -- a
 * diferencia del formato viejo "Service Worker",
 * `addEventListener('fetch', ...)`). Los módulos internos
 * (src/lib/, src/motores/, los motor-*.js reales) siguen en CommonJS,
 * sin cambios -- Wrangler los empaqueta con esbuild, que resuelve la
 * interoperabilidad import/require automáticamente (mismo mecanismo que
 * ya permite correr motor-cff/motor-ifd/motor-piio con múltiples
 * archivos require() en un Worker, DISENO_EJECUCION_MOTORES...§1.4).
 */

import { rpc, RpcError } from './lib/supabaseRpc.js';
import { calcularIceIeh } from './motores/iceIeh.js';
import { calcularSdmo } from './motores/sdmo.js';
import { calcularIao } from './motores/iao.js';
import { calcularFpv } from './motores/fpv.js';
import { calcularCff } from './motores/cff.js';
import { calcularIfd } from './motores/ifd.js';
import { calcularPiio } from './motores/piio.js';
import { calcularAie } from './motores/aie.js';

class RespuestaError extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

// Último día REAL del mes de un período 'YYYY-MM' (28/29/30/31). Un '-31'
// fijo es una fecha inexistente en febrero/abril/junio/septiembre/noviembre
// y la base la rechaza (22008) -- PENDIENTES_BRECHAS_WORKER_MOTORES.md §11.
function ultimoDiaDelMes(period) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(period));
  if (!m) throw new RespuestaError(400, 'period debe tener la forma YYYY-MM, llegó "' + period + '"');
  const dia = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
  return period + '-' + String(dia).padStart(2, '0');
}

function extraerJWT(request) {
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) throw new RespuestaError(401, 'falta Authorization: Bearer <jwt>');
  return m[1];
}

async function leerParams(request) {
  if (request.method === 'GET') {
    const url = new URL(request.url);
    return Object.fromEntries(url.searchParams);
  }
  return request.json();
}

// ── handlers, uno por motor (DISEÑO §4) ──────────────────────────────

async function calcularIceIehHandler(request, env) {
  const jwt = extraerJWT(request);
  const { organization_id, period } = await leerParams(request);
  const filas = await rpc(env, jwt, 'leer_respuestas_ice_ieh', { p_organization_id: organization_id, p_period: period });
  return Response.json(calcularIceIeh(filas));
}

async function calcularSdmoHandler(request, env) {
  const jwt = extraerJWT(request);
  const { organization_id, desde, hasta, opts } = await leerParams(request);
  const filas = await rpc(env, jwt, 'leer_respuestas_sdmo', { p_organization_id: organization_id, p_desde: desde, p_hasta: hasta });
  return Response.json(calcularSdmo(filas, opts || {}));
}

async function calcularIaoHandler(request, env) {
  const jwt = extraerJWT(request);
  const { organization_id, period, opts } = await leerParams(request);
  // Reusa leer_respuestas_ice_ieh -- motor-iao no tiene lectura propia (DISEÑO §2).
  const filas = await rpc(env, jwt, 'leer_respuestas_ice_ieh', { p_organization_id: organization_id, p_period: period });
  return Response.json(calcularIao(filas, opts || {}));
}

async function calcularFpvHandler(request, env) {
  const jwt = extraerJWT(request);
  const { organization_id, period } = await leerParams(request);
  const filas = await rpc(env, jwt, 'leer_respuestas_fpv', { p_organization_id: organization_id, p_period: period });
  const filasConfig = await rpc(env, jwt, 'leer_config_posiciones_fpv', { p_organization_id: organization_id, p_period: period });
  return Response.json(calcularFpv(filas, filasConfig));
}

/**
 * calcularCffHandler -- ya no exige `sobreCaso` como parámetro externo
 * (DISENO_SOBRE_CASO_CFF.md, cerrado): `cff_case_id` identifica un caso
 * YA DECLARADO vía registrar_caso_cff() (036) -- se lee, no se manda de
 * nuevo. `calcularCff` arma el resto (genealogía JS + node_set default).
 */
async function calcularCffHandler(request, env) {
  const jwt = extraerJWT(request);
  const { organization_id, cff_case_id, opts } = await leerParams(request);

  const casoDeclarado = await rpc(env, jwt, 'leer_caso_cff', { p_organization_id: organization_id, p_cff_case_id: cff_case_id });
  if (!casoDeclarado || casoDeclarado.length === 0) {
    return new Response('cff_case_id "' + cff_case_id + '" no existe -- declararlo primero vía registrar_caso_cff()', { status: 404 });
  }
  const caso = casoDeclarado[0];

  const nodeHierarchy = await rpc(env, jwt, 'leer_node_hierarchy_cff', { p_organization_id: organization_id });
  const eventos = await rpc(env, jwt, 'leer_eventos_cff', { p_organization_id: organization_id, p_period_start: caso.period_start, p_period_end: caso.period_end });
  const relaciones = await rpc(env, jwt, 'leer_relaciones_cff', { p_organization_id: organization_id, p_period_start: caso.period_start, p_period_end: caso.period_end });

  return Response.json(calcularCff(eventos, caso, nodeHierarchy, relaciones, organization_id, [caso.period_start], opts || {}));
}

async function calcularIfdHandler(request, env) {
  const jwt = extraerJWT(request);
  const { organization_id } = await leerParams(request);
  const filas = await rpc(env, jwt, 'leer_epd_ifd', { p_organization_id: organization_id });
  return Response.json(calcularIfd(filas));
}

async function calcularPiioHandler(request, env) {
  const jwt = extraerJWT(request);
  const { organization_id, periods, opciones } = await leerParams(request);
  const datos = await rpc(env, jwt, 'leer_datos_piio', { p_organization_id: organization_id, p_periods: periods });
  return Response.json(calcularPiio(datos, opciones || {}));
}

/**
 * calcularAieHandler -- orquesta motor-iao/motor-sdmo/motor-piio por cada
 * período de la serie pedida, ANTES de correr runCase() (DISEÑO §4.8).
 * `ops` (el campo de motor-piio que alimenta AIE) sigue sin identificarse
 * -- DISEÑO §7, señalado, no resuelto -- se manda `null` por período
 * hasta que se cierre esa pregunta; runCase() ya maneja ops ausente
 * (rama 'N/A'/'POINT'/0, ver motor-aie/runCase.js).
 */
async function calcularAieHandler(request, env) {
  const jwt = extraerJWT(request);
  const { organization_id, periods, opts } = await leerParams(request);

  const cfg = [];
  const dyn = [];
  const ops = [];
  for (const period of periods) {
    const filasIceIeh = await rpc(env, jwt, 'leer_respuestas_ice_ieh', { p_organization_id: organization_id, p_period: period });
    cfg.push(calcularIao(filasIceIeh, opts || {}).organizacion.iaoOrg);

    const filasSdmo = await rpc(env, jwt, 'leer_respuestas_sdmo', { p_organization_id: organization_id, p_desde: period + '-01', p_hasta: ultimoDiaDelMes(period) });
    dyn.push(calcularSdmo(filasSdmo, opts || {}).organizacion.nivelColectivo);

    ops.push(null); // pendiente real -- DISEÑO §7
  }

  return Response.json(calcularAie(cfg, dyn, ops));
}

/**
 * enviarInvitacionesCuestionarioHandler -- DISENO_ENVIO_INVITACIONES_BREVO.md
 * §2. NO genera invitaciones (eso lo hace el cliente, vía
 * generar_invitaciones_cuestionario, supabase-js directo -- mismo patrón
 * que DISENO_CARGA_MASIVA_CSV.md §4): solo notifica las ya creadas. El
 * cliente ya reunió {persona_id, node_id, codigo, email} por fila (§0 --
 * generar_invitaciones_cuestionario no acepta ni devuelve email).
 *
 * Secuencial, no paralelo -- mismo criterio que generarLotes() en
 * DISENO_CARGA_MASIVA_CSV.md §4 (evita saturar el rate limit de Brevo).
 * Un fallo individual (Brevo o el RPC de marcado) NO aborta el resto --
 * se reporta en `fallidos[]`, mismo shape que lotesFallidos del CSV.
 */
async function enviarInvitacionesCuestionarioHandler(request, env) {
  const jwt = extraerJWT(request);
  const { invitaciones, nombre_organizacion } = await leerParams(request);

  if (!Array.isArray(invitaciones) || invitaciones.length === 0) {
    throw new RespuestaError(400, 'invitaciones debe ser un array no vacío');
  }
  if (!nombre_organizacion || typeof nombre_organizacion !== 'string') {
    throw new RespuestaError(400, 'nombre_organizacion es obligatorio (a nivel del cuerpo, no por fila)');
  }

  const enviados = [];
  const fallidos = [];

  for (const fila of invitaciones) {
    try {
      const res = await enviarCorreoInvitacion(env, fila, nombre_organizacion);
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
    fallidos: fallidos
  });
}

/**
 * escaparHtml -- nombre_organizacion viaja del cliente al HTML del correo sin
 * pasar por ninguna otra capa; se escapa antes de insertarlo (mismo criterio
 * que escaparHtml() de crear_organizacion.html, reimplementado aquí porque el
 * Worker no comparte módulo de DOM con el cliente).
 */
function escaparHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * enviarCorreoInvitacion -- mismo fetch() que
 * app-el-amor-existe/js/amar-shared.js:150-163, mismo timeout (10s),
 * payload confirmado contra ese código real (DISENO_ENVIO_INVITACIONES_
 * BREVO.md §3): endpoint /v3/smtp/email estándar, sin templateId ni
 * envío en lote, un destinatario por llamada.
 *
 * SOLO ICE-IEH (decisión de Luis, PENDIENTES_BRECHAS_WORKER_MOTORES.md
 * §18): SDMO es un instrumento recurrente (3x/semana) -- un enlace de
 * invitación único no lo cubre bien y genera la impresión falsa de que
 * el sistema ya lo resuelve. Queda señalado como pendiente, no enterrado
 * -- mismo criterio que invitaciones_fpv en 046.
 */
async function enviarCorreoInvitacion(env, fila, nombreOrganizacion) {
  const enlace = (env.SITE_URL || 'https://eficiencia.com.co') + '/cuestionario_ice_ieh.html?codigo=' + encodeURIComponent(fila.codigo);
  const nombre = escaparHtml(nombreOrganizacion);
  const htmlContent = '<!DOCTYPE html><html><body>' +
    '<p>' + nombre + ' está implementando el modelo de inteligencia relacional EFICIENCIA. ' +
    'El propósito es mejorar las condiciones de tu participación en el sistema organizacional, ' +
    'para impulsar el bienestar y las relaciones de trabajo. Te invitamos a ser parte de este proceso.</p>' +
    '<p>Solo tienes que responder un instrumento breve. Tus respuestas son estrictamente confidenciales. ' +
    'Responde de manera honesta — eso nos ayudará a descubrir lo que necesitamos mejorar para que tu experiencia sea la mejor:</p>' +
    '<p><a href="' + enlace + '">Cuestionario general</a></p>' +
    '</body></html>';
  const cuerpo = JSON.stringify({
    sender: { name: 'EFICIENCIA', email: env.BREVO_SENDER_EMAIL },
    to: [{ email: fila.email }],
    subject: 'Tu invitación — EFICIENCIA',
    htmlContent: htmlContent
  });
  // LOG TEMPORAL -- diagnóstico Brevo (PENDIENTES §12, patrón), quitar en
  // commit aparte apenas se diagnostique. Nunca imprime el valor real de
  // BREVO_API_KEY, solo si existe.
  console.log('[DIAG-BREVO] tiene BREVO_API_KEY:', !!env.BREVO_API_KEY);
  console.log('[DIAG-BREVO] body enviado a Brevo:', cuerpo);
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      // fetch() de Cloudflare Workers no manda User-Agent por defecto (a
      // diferencia de curl/Invoke-RestMethod/navegadores) -- hipótesis en
      // diagnóstico: el borde de Brevo rechaza en silencio (400 vacío,
      // connection:close) sin este header. PENDIENTES §12-bis (Brevo).
      'User-Agent': 'eficiencia-app',
      Accept: 'application/json'
    },
    body: cuerpo,
    signal: AbortSignal.timeout(10000)
  });
  console.log('[DIAG-BREVO] res.status:', res.status);
  console.log('[DIAG-BREVO] res.headers:', res.headers ? JSON.stringify([...res.headers.entries()]) : '(sin headers -- mock de test)');
  return res;
}

const RUTAS = {
  'calcular-ice-ieh': calcularIceIehHandler,
  'calcular-sdmo': calcularSdmoHandler,
  'calcular-iao': calcularIaoHandler,
  'calcular-fpv': calcularFpvHandler,
  'calcular-cff': calcularCffHandler,
  'calcular-ifd': calcularIfdHandler,
  'calcular-piio': calcularPiioHandler,
  'calcular-aie': calcularAieHandler,
  'enviar-invitaciones-cuestionario': enviarInvitacionesCuestionarioHandler
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    const ruta = url.pathname.slice('/api/'.length);
    const handler = RUTAS[ruta];
    if (!handler) return new Response('no encontrado', { status: 404 });

    try {
      return await handler(request, env);
    } catch (e) {
      if (e instanceof RespuestaError) return new Response(e.message, { status: e.status });
      if (e instanceof RpcError) return new Response(e.body, { status: e.status });
      return new Response('error interno: ' + e.message, { status: 500 });
    }
  }
};
