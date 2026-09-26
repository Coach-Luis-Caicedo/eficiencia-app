#!/usr/bin/env node
/**
 * scripts/simular_organizaciones.mjs
 *
 * Genera 5 organizaciones de prueba con datos variados y realistas
 * (sana, alerta, mejora sostenida, deterioro, pequeña) contra Supabase
 * real -- ICE-IEH + SDMO, 6 períodos, para ejercitar IAO/AIE de punta a
 * punta. Cierra DISENO_SCRIPT_SIMULACION_RESPUESTAS.md (alcance
 * aprobado por Luis) + INVESTIGACION_SCRIPT_SIMULACION_RESPUESTAS.md.
 *
 * Node 18+, `fetch` nativo, CERO dependencias -- mismo criterio que el
 * Worker, aunque aquí no sea obligatorio por ser herramienta interna
 * (INVESTIGACION...§3).
 *
 * Uso:
 *   EFICIENCIA_CONSULTOR_EMAIL=... EFICIENCIA_CONSULTOR_PASSWORD=... \
 *     node scripts/simular_organizaciones.mjs
 *
 * Las credenciales NUNCA van en este archivo (§5 del diseño) -- el
 * script falla con un mensaje claro si faltan.
 */

'use strict';

import { pathToFileURL } from 'node:url';
import * as E from './escenarios_4_motores.mjs';

// ── Config -- SUPA_URL/ANON_KEY son públicas por diseño, mismo
// criterio que cada .html de esta sesión (la protección real es RLS +
// las funciones SECURITY DEFINER). ─────────────────────────────────
const SUPA_URL = 'https://kapxcjehfaasttwfnnzq.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImthcHhjamVoZmFhc3R0d2ZubnpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMzQ1NjYsImV4cCI6MjEwMTcxMDU2Nn0.s0NC1ILswMQHPf-rsY1kvGSn0LpBSckNdlw2TvzMXws';

const PERIODOS = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
const JORNADAS_POR_PERIODO = PERIODOS.map((p) => [p + '-05', p + '-15', p + '-25']);

// Mejora: de alerta hacia sana. Deterioro: espejo exacto.
// DISENO_SCRIPT_SIMULACION_RESPUESTAS.md §3 -- recorrido verificado
// muy por encima del umbral de motor-aie (MDC=5, TRAJ_WINDOW=3).
const SALUD_MEJORA = [0.15, 0.30, 0.45, 0.60, 0.75, 0.90];
const SALUD_DETERIORO = [0.90, 0.75, 0.60, 0.45, 0.30, 0.15];

// ══════════════════════════════════════════════════════════════════
// Núcleo HTTP
// ══════════════════════════════════════════════════════════════════
async function rpc(nombre, params, jwtOrNull) {
  const res = await fetch(SUPA_URL + '/rest/v1/rpc/' + nombre, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: 'Bearer ' + (jwtOrNull || ANON_KEY),
      'Content-Type': 'application/json',
      'Content-Profile': 'motores_eficiencia',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(params || {})
  });
  const text = await res.text();
  if (!res.ok) return { error: { message: text, status: res.status } };
  return { data: text ? JSON.parse(text) : null };
}

// Un solo reintento automático -- llamadas idempotentes (ON CONFLICT DO
// UPDATE en las 2 tablas de respuesta), seguro reintentar. Si el
// segundo también falla, se reporta, NO se relanza.
async function rpcConReintento(nombre, params, jwtOrNull) {
  let res = await rpc(nombre, params, jwtOrNull);
  if (res.error) res = await rpc(nombre, params, jwtOrNull);
  return res;
}

async function obtenerJWT(email, password) {
  const res = await fetch(SUPA_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const cuerpo = await res.json();
  if (!res.ok) throw new Error('login falló: ' + JSON.stringify(cuerpo));
  return cuerpo.access_token;
}

// ── Concurrencia limitada, sin librería -- pool de N workers ────────
async function conLimite(items, limite, tarea) {
  let indice = 0;
  async function trabajador() {
    while (indice < items.length) {
      const mi = indice++;
      await tarea(items[mi], mi);
    }
  }
  const trabajadores = Array.from({ length: Math.min(limite, items.length) }, () => trabajador());
  await Promise.all(trabajadores);
}

function clamp(x, min, max) { return Math.max(min, Math.min(max, x)); }
function slug(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function elegirConPeso(opciones) {
  const r = Math.random();
  let acumulado = 0;
  for (const [valor, peso] of opciones) {
    acumulado += peso;
    if (r <= acumulado) return valor;
  }
  return opciones[opciones.length - 1][0];
}

// ══════════════════════════════════════════════════════════════════
// Pasos del flujo -- motores_eficiencia.crear_organizacion (040),
// .generar_invitaciones_cuestionario (034), .registrar_respuesta_
// ice_ieh/sdmo (034) -- INVESTIGACION_SCRIPT_SIMULACION_RESPUESTAS.md §1
// ══════════════════════════════════════════════════════════════════
async function crearOrganizacion(jwt, nombre, sector) {
  const res = await rpc('crear_organizacion', { p_nombre: nombre, p_sector: sector }, jwt);
  if (res.error) throw new Error('crear_organizacion: ' + res.error.message);
  return res.data;
}

async function generarInvitacionesEnLote(jwt, orgId, asignaciones) {
  const TAM_LOTE = 50;
  const todas = [];
  for (let i = 0; i < asignaciones.length; i += TAM_LOTE) {
    const lote = asignaciones.slice(i, i + TAM_LOTE);
    const res = await rpc('generar_invitaciones_cuestionario', { p_organization_id: orgId, p_asignaciones: lote }, jwt);
    if (res.error) throw new Error('generar_invitaciones_cuestionario (lote ' + (i / TAM_LOTE + 1) + '): ' + res.error.message);
    todas.push(...res.data);
  }
  return todas; // [{persona_id, node_id, codigo}]
}

// ── ICE-IEH -- 31 preguntas reales, docs/DOCUMENTO_TECNICO_ICE_IEH_v2.md,
// cruzadas contra motor-ice-ieh.js:57-99 (mismas usadas en
// cuestionario_ice_ieh.html). tipo determina cómo `x` se traduce a
// score normalizado -- DISENO_SCRIPT_SIMULACION_RESPUESTAS.md §1/§3.
const ITEMS_ICE_IEH = [
  { p: 1, tipo: 'normal', par: 1, lado: 'ICE' }, { p: 2, tipo: 'normal', par: 1, lado: 'ICE' }, { p: 3, tipo: 'normal', par: 1, lado: 'ICE' },
  { p: 4, tipo: 'normal', par: 1, lado: 'IEH' }, { p: 5, tipo: 'normal', par: 1, lado: 'IEH' }, { p: 6, tipo: 'normal', par: 1, lado: 'IEH' },
  { p: 7, tipo: 'bipolar', par: 1, lado: null },
  { p: 8, tipo: 'normal', par: 2, lado: 'ICE' }, { p: 9, tipo: 'normal', par: 2, lado: 'ICE' }, { p: 10, tipo: 'normal', par: 2, lado: 'ICE' },
  { p: 11, tipo: 'normal', par: 2, lado: 'IEH' }, { p: 12, tipo: 'normal', par: 2, lado: 'IEH' }, { p: 13, tipo: 'inversa', par: 2, lado: 'IEH' },
  { p: 14, tipo: 'sintesis', par: 2, lado: null },
  { p: 15, tipo: 'normal', par: 3, lado: 'ICE' }, { p: 16, tipo: 'normal', par: 3, lado: 'ICE' }, { p: 17, tipo: 'normal', par: 3, lado: 'ICE' }, { p: 18, tipo: 'normal', par: 3, lado: 'ICE' },
  { p: 19, tipo: 'normal', par: 3, lado: 'IEH' }, { p: 20, tipo: 'normal', par: 3, lado: 'IEH' }, { p: 21, tipo: 'inversa', par: 3, lado: 'IEH' },
  { p: 22, tipo: 'normal', par: 4, lado: 'ICE' }, { p: 23, tipo: 'normal', par: 4, lado: 'ICE' }, { p: 24, tipo: 'normal', par: 4, lado: 'ICE' },
  { p: 25, tipo: 'normal', par: 4, lado: 'IEH' }, { p: 26, tipo: 'normal', par: 4, lado: 'IEH' }, { p: 27, tipo: 'normal', par: 4, lado: 'IEH' },
  { p: 28, tipo: 'normal', par: 5, lado: 'ICE' }, { p: 29, tipo: 'normal', par: 5, lado: 'ICE' },
  { p: 30, tipo: 'normal', par: 5, lado: 'IEH' }, { p: 31, tipo: 'normal', par: 5, lado: 'IEH' }
];

// Alerta -- una dirección de brecha distinta por par, alternando signo,
// para ejercitar las dos direcciones del catálogo de intervención en
// los 5 pares (DISENO_SCRIPT_SIMULACION_RESPUESTAS.md §1).
const ALERTA_NIVEL_POR_PAR = {
  1: { ICE: 'ALTO', IEH: 'BAJO' },
  2: { ICE: 'BAJO', IEH: 'ALTO' },
  3: { ICE: 'ALTO', IEH: 'BAJO' },
  4: { ICE: 'BAJO', IEH: 'ALTO' },
  5: { ICE: 'ALTO', IEH: 'BAJO' }
};

function xParaNivel(tipo, nivel) {
  if (tipo === 'inversa') return nivel === 'ALTO' ? 1 : 5;
  return nivel === 'ALTO' ? 5 : 1;
}

function valorICEIEH_sana(item) {
  if (item.p === 7 || item.p === 14) return 5;
  if (item.tipo === 'inversa') return elegirConPeso([[1, 0.70], [2, 0.25], [3, 0.05]]);
  return elegirConPeso([[5, 0.70], [4, 0.25], [3, 0.05]]);
}
function valorICEIEH_alerta(item) {
  if (item.p === 7 || item.p === 14) return 1;
  const nivel = ALERTA_NIVEL_POR_PAR[item.par][item.lado];
  const base = xParaNivel(item.tipo, nivel);
  return elegirConPeso([[base, 0.85], [base > 3 ? base - 1 : base + 1, 0.15]]);
}
function valorICEIEH_pequena(item) {
  if (item.p === 7 || item.p === 14) return 4;
  if (item.tipo === 'inversa') return elegirConPeso([[2, 0.60], [1, 0.20], [3, 0.20]]);
  return elegirConPeso([[4, 0.60], [5, 0.20], [3, 0.20]]);
}
function xNormalSalud(salud) { return clamp(Math.round(1 + salud * 4), 1, 5); }
function xInversaSalud(salud) { return clamp(Math.round(5 - salud * 4), 1, 5); }
function valorICEIEH_trayectoria(item, salud) {
  return item.tipo === 'inversa' ? xInversaSalud(salud) : xNormalSalud(salud);
}

function saludDelPeriodo(perfil, periodoIndex) {
  if (perfil.trayectoria === 'mejora') return SALUD_MEJORA[periodoIndex];
  if (perfil.trayectoria === 'deterioro') return SALUD_DETERIORO[periodoIndex];
  return null;
}

function respuestasICEIEH(perfil, periodoIndex) {
  const salud = saludDelPeriodo(perfil, periodoIndex);
  const respuestas = {};
  for (const item of ITEMS_ICE_IEH) {
    let x;
    if (salud !== null) x = valorICEIEH_trayectoria(item, salud);
    else if (perfil.tipo === 'sana') x = valorICEIEH_sana(item);
    else if (perfil.tipo === 'alerta') x = valorICEIEH_alerta(item);
    else x = valorICEIEH_pequena(item);
    respuestas['P' + item.p] = x;
  }
  return respuestas;
}

async function generarRespuestasICEIEH(personas, perfil) {
  const resultados = { ok: 0, fallidas: [] };
  for (let pIdx = 0; pIdx < PERIODOS.length; pIdx++) {
    const periodo = PERIODOS[pIdx];
    await conLimite(personas, 10, async (persona) => {
      const respuestas = respuestasICEIEH(perfil, pIdx);
      const res = await rpcConReintento('registrar_respuesta_ice_ieh',
        { p_codigo: persona.codigo, p_respuestas: respuestas, p_period: periodo }, null);
      if (res.error) resultados.fallidas.push({ persona_id: persona.persona_id, periodo, error: res.error.message });
      else resultados.ok++;
    });
  }
  return resultados;
}

// ── SDMO -- ACU/COM/INV/PEN vigentes (docs/DOCUMENTO_TECNICO_SDMO_
// IAO_v1.md §2.3-2.4), NO la nomenclatura legacy -- mismas usadas en
// sdmo_nuevo.html.
function valorSDMO_sana() { return elegirConPeso([[1, 0.65], [2, 0.30], [3, 0.05]]); }
function valorSDMO_alerta() { return elegirConPeso([[5, 0.65], [4, 0.30], [3, 0.05]]); }
function valorSDMO_pequena() { return elegirConPeso([[2, 0.55], [3, 0.25], [1, 0.20]]); }
function valorSDMO_trayectoria(salud) { return clamp(Math.round(5 - salud * 4), 1, 5); }

function valorSDMOSegunPerfil(perfil, salud) {
  if (salud !== null) return valorSDMO_trayectoria(salud);
  if (perfil.tipo === 'sana') return valorSDMO_sana();
  if (perfil.tipo === 'alerta') return valorSDMO_alerta();
  return valorSDMO_pequena();
}

async function generarRespuestasSDMO(personas, perfil) {
  const resultados = { ok: 0, fallidas: [] };
  for (let pIdx = 0; pIdx < PERIODOS.length; pIdx++) {
    const salud = saludDelPeriodo(perfil, pIdx);
    for (const jornada of JORNADAS_POR_PERIODO[pIdx]) {
      await conLimite(personas, 10, async (persona) => {
        const res = await rpcConReintento('registrar_respuesta_sdmo', {
          p_codigo: persona.codigo,
          p_acu: valorSDMOSegunPerfil(perfil, salud),
          p_com: valorSDMOSegunPerfil(perfil, salud),
          p_inv: valorSDMOSegunPerfil(perfil, salud),
          p_pen: valorSDMOSegunPerfil(perfil, salud),
          p_jornada: jornada
        }, null);
        if (res.error) resultados.fallidas.push({ persona_id: persona.persona_id, jornada, error: res.error.message });
        else resultados.ok++;
      });
    }
  }
  return resultados;
}

// ══════════════════════════════════════════════════════════════════
// Orquestación
// ══════════════════════════════════════════════════════════════════
// `motores` (DISENO_EXTENSION_SIMULACION_4_MOTORES.md §2): qué de FPV/CFF/IFD/
// PIIO lleva cada organización. node_hierarchy solo donde CFF/PIIO la necesitan
// (Mejora no lleva ni CFF ni PIIO). `piio` es una función porque el catálogo
// necesita el organization_id real (applicability_by_context).
const PERFILES = [
  { nombre: 'Organización sana (simulación)', sector: 'servicios_prof', tipo: 'sana', trayectoria: null,
    nodos: [{ nombre: 'Operaciones', n: 15 }, { nombre: 'Administración', n: 10 }],
    motores: { nodeHierarchy: true, cff: E.cffSana, ifd: E.epdsIfd, fpv: E.fpvSana,
      piio: (orgId) => E.catalogoPiio(orgId, 'sana', 'Operaciones') } },
  { nombre: 'Organización con señales de alerta (simulación)', sector: 'manufactura', tipo: 'alerta', trayectoria: null,
    nodos: [{ nombre: 'Ventas', n: 12 }, { nombre: 'Producción', n: 13 }],
    motores: { nodeHierarchy: true, cff: E.cffAlerta, fpv: E.fpvAlerta } },
  { nombre: 'Organización en mejora sostenida (simulación)', sector: 'finanzas_tech', tipo: 'trayectoria', trayectoria: 'mejora',
    nodos: [{ nombre: 'Equipo Piloto', n: 20 }],
    motores: { fpv: E.fpvMejora } },
  { nombre: 'Organización en deterioro (simulación)', sector: 'retail_logistica', tipo: 'trayectoria', trayectoria: 'deterioro',
    nodos: [{ nombre: 'Equipo Piloto', n: 20 }],
    motores: { nodeHierarchy: true, piio: (orgId) => E.catalogoPiio(orgId, 'deterioro', 'Equipo Piloto') } },
  { nombre: 'Organización pequeña (simulación)', sector: 'salud_educacion', tipo: 'pequena', trayectoria: null,
    nodos: [{ nombre: 'Equipo A', n: 3 }, { nombre: 'Equipo B', n: 10 }],
    motores: { nodeHierarchy: true, cff: E.cffPequena, fpv: E.fpvPequena } }
];

// Un motor que falla NO tumba los demás ni borra lo ya generado de la misma
// organización (ICE-IEH/SDMO ya están escritos): se reporta y se sigue.
async function conAislamiento(nombre, tarea) {
  try { return { ok: true, detalle: await tarea() }; }
  catch (e) { return { ok: false, error: nombre + ': ' + e.message }; }
}

async function generarMotoresNuevos(jwt, orgId, perfil) {
  const m = perfil.motores || {};
  const ctx = { rpc, conLimite };
  const r = {};
  if (m.nodeHierarchy) {
    r.nodeHierarchy = await conAislamiento('node_hierarchy', () =>
      E.registrarNodeHierarchy(ctx, jwt, orgId, E.nodosOrganizacion(perfil.nodos.map((n) => n.nombre))));
  }
  if (m.cff) r.cff = await conAislamiento('CFF', () => E.registrarCff(ctx, jwt, orgId, m.cff()));
  if (m.ifd) r.ifd = await conAislamiento('IFD', () => E.registrarIfd(ctx, jwt, orgId, m.ifd()));
  if (m.fpv) {
    r.fpv = await conAislamiento('FPV', async () => {
      const res = await E.registrarFpv(ctx, jwt, orgId, m.fpv());
      if (res.fallidas.length) throw new Error(res.fallidas.length + ' respuestas fallidas, ej. ' + JSON.stringify(res.fallidas[0]));
      return res.llamadas;
    });
  }
  if (m.piio) r.piio = await conAislamiento('PIIO', () => E.registrarPiio(ctx, jwt, orgId, m.piio(orgId)));
  return r;
}

async function generarOrganizacionCompleta(jwt, perfil) {
  const orgId = await crearOrganizacion(jwt, perfil.nombre, perfil.sector);

  const asignaciones = [];
  for (const nodo of perfil.nodos) {
    for (let i = 1; i <= nodo.n; i++) {
      asignaciones.push({ persona_id: slug(perfil.nombre) + '-' + slug(nodo.nombre) + '-' + i, node_id: nodo.nombre });
    }
  }
  const invitaciones = await generarInvitacionesEnLote(jwt, orgId, asignaciones);

  const iceIeh = await generarRespuestasICEIEH(invitaciones, perfil);
  const sdmo = await generarRespuestasSDMO(invitaciones, perfil);
  const motores = await generarMotoresNuevos(jwt, orgId, perfil);

  return { organizacion: perfil.nombre, organizationId: orgId, personas: invitaciones.length, iceIeh, sdmo, motores };
}

function imprimirResumenFinal(resumenes) {
  console.log('\n' + '='.repeat(70));
  console.log('RESUMEN FINAL');
  console.log('='.repeat(70));
  for (const r of resumenes) {
    if (r.error) {
      console.log('✗ ' + r.organizacion + ' -- FALLÓ POR COMPLETO: ' + r.error);
      continue;
    }
    console.log('✓ ' + r.organizacion + ' (' + r.organizationId + ') -- ' + r.personas + ' personas');
    console.log('  ICE-IEH: ' + r.iceIeh.ok + ' ok, ' + r.iceIeh.fallidas.length + ' fallidas');
    console.log('  SDMO:    ' + r.sdmo.ok + ' ok, ' + r.sdmo.fallidas.length + ' fallidas');
    if (r.iceIeh.fallidas.length) console.log('  Fallidas ICE-IEH:', JSON.stringify(r.iceIeh.fallidas.slice(0, 5)));
    if (r.sdmo.fallidas.length) console.log('  Fallidas SDMO:', JSON.stringify(r.sdmo.fallidas.slice(0, 5)));
    for (const [motor, res] of Object.entries(r.motores || {})) {
      console.log('  ' + motor + ': ' + (res.ok ? 'OK (' + res.detalle + ' llamadas/filas)' : 'FALLÓ -- ' + res.error));
    }
  }
}

async function main() {
  const email = process.env.EFICIENCIA_CONSULTOR_EMAIL;
  const password = process.env.EFICIENCIA_CONSULTOR_PASSWORD;
  if (!email || !password) {
    console.error('Faltan EFICIENCIA_CONSULTOR_EMAIL / EFICIENCIA_CONSULTOR_PASSWORD en el entorno.');
    process.exit(1);
  }

  console.log('Iniciando sesión...');
  const jwt = await obtenerJWT(email, password);

  const resumenes = [];
  for (const perfil of PERFILES) {
    console.log('\n=== ' + perfil.nombre + ' ===');
    try {
      const resumen = await generarOrganizacionCompleta(jwt, perfil);
      resumenes.push(resumen);
      console.log('OK -- ' + resumen.personas + ' personas, ICE-IEH ' + resumen.iceIeh.ok + ' ok/' +
        resumen.iceIeh.fallidas.length + ' fallidas, SDMO ' + resumen.sdmo.ok + ' ok/' + resumen.sdmo.fallidas.length + ' fallidas');
    } catch (e) {
      console.error('FALLÓ POR COMPLETO: ' + e.message);
      resumenes.push({ organizacion: perfil.nombre, error: e.message });
    }
  }

  imprimirResumenFinal(resumenes);
}

export { rpc, rpcConReintento, obtenerJWT, conLimite, slug, crearOrganizacion };

// Solo corre main() si el archivo se ejecuta directo (node scripts/...),
// no cuando otro módulo (la mini-prueba de los 4 motores) lo importa.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('FALLO INESPERADO:', e); process.exit(1); });
}
