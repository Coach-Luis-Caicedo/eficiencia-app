/**
 * src/lib/supabaseRpc.js
 *
 * Helper mínimo para llamar RPCs de Supabase vía fetch() directo contra
 * PostgREST -- DISENO_WORKER_EJECUCION_MOTORES.md §3. No se usa
 * @supabase/supabase-js: el Worker solo llama RPCs (las 9 de escritura de
 * 034 + las 6 de lectura de 035), no necesita Auth/Realtime/Storage --
 * cargar el SDK completo sería peso muerto en el bundle sin ganar
 * funcionalidad real.
 *
 * Siempre reenvía el JWT del consultor (nunca `service_role`) -- así
 * `auth.uid()` dentro de cada función SECURITY DEFINER resuelve al
 * consultor real, y las funciones ya construidas (033/034/035) siguen
 * siendo la única fuente de autorización.
 */

'use strict';

/**
 * RpcError -- error tipado para que el handler HTTP pueda decidir el
 * status code sin parsear el mensaje.
 */
class RpcError extends Error {
  constructor(status, body) {
    super('RPC falló (status ' + status + '): ' + body);
    this.status = status;
    this.body = body;
  }
}

/**
 * rpc(env, jwt, nombre, params) -> Promise<any>
 *
 * `env` trae SUPABASE_URL y SUPABASE_ANON_KEY (vars del Worker, ver
 * DISENO_WORKER_EJECUCION_MOTORES.md §3 -- nunca service_role).
 *
 * `Content-Profile: motores_eficiencia` -- hallazgo real, encontrado al
 * probar wrangler dev contra Supabase real (no en pglite, que corre
 * Postgres crudo sin la capa PostgREST): sin este header, PostgREST
 * busca las funciones en `public` por defecto y devuelve PGRST202
 * ("could not find the function") para cualquier función de
 * motores_eficiencia, aunque el esquema ya esté expuesto y los GRANT
 * EXECUTE/USAGE existan. Todas las llamadas de este helper son POST
 * (incluidas las funciones de "lectura"), así que Content-Profile
 * basta -- no se necesita Accept-Profile (el de las peticiones GET/HEAD).
 */
async function rpc(env, jwt, nombre, params) {
  const res = await fetch(env.SUPABASE_URL + '/rest/v1/rpc/' + nombre, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + jwt,
      'Content-Type': 'application/json',
      'Content-Profile': 'motores_eficiencia',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(params || {})
  });
  const text = await res.text();
  if (!res.ok) {
    throw new RpcError(res.status, text);
  }
  return text ? JSON.parse(text) : null;
}

module.exports = { rpc: rpc, RpcError: RpcError };
