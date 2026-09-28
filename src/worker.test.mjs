/**
 * src/worker.test.mjs
 * node src/worker.test.mjs
 *
 * Simulación de punta a punta del Worker real (src/worker.js) --
 * DISENO_WORKER_EJECUCION_MOTORES.md, encargo de Luis: "si es posible
 * simular una llamada completa de punta a punta (leer datos de prueba →
 * correr un motor → devolver resultado) antes de que se despliegue,
 * hazlo". No se despliega ningún Worker real -- se mockea `fetch`
 * (intercepta las llamadas RPC que src/lib/supabaseRpc.js haría contra
 * Supabase) y `env.ASSETS` (el binding de archivos estáticos), y se
 * invoca el handler `fetch()` exportado por src/worker.js tal cual,
 * import ESM real -- no una reimplementación paralela.
 *
 * .mjs (no .js) porque src/worker.js usa `import`/`export default`
 * (formato ES Modules de Cloudflare Workers, obligatorio para que
 * Wrangler lo reconozca como entry point con `main`) -- Node solo
 * interpreta esa sintaxis en un archivo .mjs o con "type":"module".
 */

import worker from './worker.js';

let _ok = 0, _fail = 0;
function eqLista(real, esperado, label) {
  ok(JSON.stringify(real) === JSON.stringify(esperado), label + (JSON.stringify(real) === JSON.stringify(esperado) ? '' : '  [real=' + JSON.stringify(real) + ']'));
}
function ok(cond, label) {
  if (cond) { _ok++; console.log('  ✓ ' + label); }
  else { _fail++; console.log('  ✗ FALLA: ' + label); }
}

// ── mock de fetch -- intercepta las llamadas RPC, responde con datos de prueba ──
const RPC_RESPUESTAS = {}; // se llena por cada test antes de invocar el handler
const LLAMADAS_RPC = [];   // registro de qué se llamó, para verificar el flujo

// El mock valida las fechas como lo haría Postgres (columnas `date`): un
// 'YYYY-MM-DD' inexistente (p. ej. 2026-04-31) se rechaza con 22008. Sin
// esto el mock aceptaba cualquier cadena y un bug de construcción de
// fechas en un handler pasaba los tests (PENDIENTES_BRECHAS_WORKER_MOTORES.md
// §11: calcular-aie mandaba period + '-31'). Aplica a TODOS los handlers.
function fechaInexistente(valor) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!m) return false;
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const f = new Date(Date.UTC(a, mes - 1, d));
  return f.getUTCFullYear() !== a || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== d;
}

// ── mock de Brevo -- por defecto ok:true; los tests de §Brevo lo reemplazan
// por fila (BREVO_RESPUESTAS[email] -> {ok, status, texto}) para simular
// fallos individuales sin tocar el mock de RPC de arriba. ──
const BREVO_RESPUESTAS = {};
const LLAMADAS_BREVO = [];

globalThis.fetch = async (url, opts) => {
  if (String(url) === 'https://api.brevo.com/v3/smtp/email') {
    const body = JSON.parse(opts.body);
    LLAMADAS_BREVO.push({ body, apiKey: opts.headers['api-key'] });
    const destino = body.to[0].email;
    const r = BREVO_RESPUESTAS[destino] || { ok: true, status: 201, texto: '{"messageId":"fake"}' };
    return { ok: r.ok, status: r.status, text: async () => r.texto };
  }

  const nombreRpc = String(url).split('/rest/v1/rpc/')[1];
  const body = JSON.parse(opts.body);
  LLAMADAS_RPC.push({ nombreRpc, body, authorization: opts.headers.Authorization });

  for (const v of Object.values(body)) {
    if (typeof v === 'string' && fechaInexistente(v)) {
      return { ok: false, status: 400, text: async () => JSON.stringify({ code: '22008', message: 'date/time field value out of range: "' + v + '"' }) };
    }
  }

  if (!(nombreRpc in RPC_RESPUESTAS)) {
    return { ok: false, status: 500, text: async () => 'RPC no mockeada: ' + nombreRpc };
  }
  const datos = typeof RPC_RESPUESTAS[nombreRpc] === 'function' ? RPC_RESPUESTAS[nombreRpc](body) : RPC_RESPUESTAS[nombreRpc];
  return { ok: true, status: 200, text: async () => JSON.stringify(datos) };
};

const ENV = {
  SUPABASE_URL: 'https://fake.supabase.co',
  SUPABASE_ANON_KEY: 'fake-anon-key',
  BREVO_API_KEY: 'fake-brevo-key',
  BREVO_SENDER_EMAIL: 'invitaciones@eficiencia.com.co',
  ASSETS: { fetch: async (req) => new Response('static:' + new URL(req.url).pathname, { status: 200 }) }
};

function mockRequest(path, { method = 'GET', body, jwt = 'fake.jwt.token' } = {}) {
  const url = 'https://eficiencia-app.example/api/' + path;
  const headers = new Headers();
  if (jwt) headers.set('Authorization', 'Bearer ' + jwt);
  if (body) headers.set('Content-Type', 'application/json');
  return new Request(url, { method: body ? 'POST' : method, headers, body: body ? JSON.stringify(body) : undefined });
}

const run = async () => {
  // ═══════════════════════════════════════════════════════════════
  console.log('\n── 1. Rutas que no son /api/ caen a env.ASSETS.fetch (estático sin tocar) ──');
  // ═══════════════════════════════════════════════════════════════
  let res = await worker.fetch(new Request('https://eficiencia-app.example/workbook.html'), ENV, {});
  const texto = await res.text();
  ok(texto === 'static:/workbook.html', 'GET /workbook.html se sirve vía env.ASSETS.fetch, el Worker no interfiere');

  // ═══════════════════════════════════════════════════════════════
  console.log('\n── 2. Ruta /api/ desconocida -> 404 ──');
  // ═══════════════════════════════════════════════════════════════
  res = await worker.fetch(mockRequest('calcular-motor-que-no-existe'), ENV, {});
  ok(res.status === 404, '/api/calcular-motor-que-no-existe -> 404');

  // ═══════════════════════════════════════════════════════════════
  console.log('\n── 3. Sin Authorization -> 401 ──');
  // ═══════════════════════════════════════════════════════════════
  res = await worker.fetch(mockRequest('calcular-ice-ieh', { jwt: null }), ENV, {});
  ok(res.status === 401, 'sin Authorization: Bearer -> 401');

  // ═══════════════════════════════════════════════════════════════
  console.log('\n── 4. calcular-ice-ieh -- de punta a punta ──');
  // ═══════════════════════════════════════════════════════════════
  LLAMADAS_RPC.length = 0;
  const p31 = Object.fromEntries(Array.from({ length: 31 }, (_, i) => ['P' + (i + 1), (i % 5) + 1]));
  RPC_RESPUESTAS.leer_respuestas_ice_ieh = [
    { organization_id: 'org-1', persona_id: 'p1', node_id: 'NODO1', period: '2026-01', respuestas: p31 }
  ];
  res = await worker.fetch(mockRequest('calcular-ice-ieh?organization_id=org-1&period=2026-01', { jwt: 'jwt-consultor-a' }), ENV, {});
  const cuerpoIceIeh = await res.json();
  ok(res.status === 200, 'calcular-ice-ieh responde 200');
  ok(LLAMADAS_RPC.length === 1 && LLAMADAS_RPC[0].nombreRpc === 'leer_respuestas_ice_ieh', 'llamó exactamente a leer_respuestas_ice_ieh');
  ok(LLAMADAS_RPC[0].authorization === 'Bearer jwt-consultor-a', 'reenvía el JWT del consultor, no una clave de servicio');
  ok(Array.isArray(cuerpoIceIeh) && cuerpoIceIeh.length === 1 && cuerpoIceIeh[0].persona_id === 'p1', 'devuelve el resultado calculado, una fila');
  ok(typeof cuerpoIceIeh[0].ice === 'number' && typeof cuerpoIceIeh[0].ieh === 'number', 'la fila trae ice/ieh calculados, no solo el eco de la entrada');

  // ═══════════════════════════════════════════════════════════════
  console.log('\n── 5. calcular-iao -- reusa leer_respuestas_ice_ieh, aplica el adaptador ──');
  // ═══════════════════════════════════════════════════════════════
  LLAMADAS_RPC.length = 0;
  res = await worker.fetch(mockRequest('calcular-iao?organization_id=org-1&period=2026-01'), ENV, {});
  const cuerpoIao = await res.json();
  ok(res.status === 200, 'calcular-iao responde 200');
  ok(LLAMADAS_RPC.length === 1 && LLAMADAS_RPC[0].nombreRpc === 'leer_respuestas_ice_ieh',
    'calcular-iao NO tiene su propia función de lectura -- reusa leer_respuestas_ice_ieh (DISEÑO §2)');
  ok(cuerpoIao.organizacion && typeof cuerpoIao.organizacion.iaoOrg === 'number', 'devuelve organizacion.iaoOrg calculado');

  // ═══════════════════════════════════════════════════════════════
  console.log('\n── 6. calcular-sdmo -- nulls parciales, rango de jornada ──');
  // ═══════════════════════════════════════════════════════════════
  RPC_RESPUESTAS.leer_respuestas_sdmo = [
    { organization_id: 'org-1', persona_id: 'p1', node_id: 'NODO1', jornada: '2026-01-05', acu: 3, com: null, inv: null, pen: 4 }
  ];
  res = await worker.fetch(mockRequest('calcular-sdmo?organization_id=org-1&desde=2026-01-01&hasta=2026-01-31&opts={"delta":0.5,"minReportableN":1}', { }), ENV, {});
  ok(res.status === 500, 'calcular-sdmo con `opts` mandado como string por querystring GET -> 500 (JSON.parse falla) -- ver nota abajo');
  // La ruta real de producción usa POST con body JSON (leerParams lo parsea con request.json()) --
  // se prueba esa forma real a continuación, no la de querystring (que nunca fue el camino soportado para objetos anidados).
  RPC_RESPUESTAS.leer_respuestas_sdmo = [
    { organization_id: 'org-1', persona_id: 'p1', node_id: 'NODO1', jornada: '2026-01-05', acu: 3, com: 2, inv: 4, pen: 1 },
    // 2ª persona con 2 dimensiones NULL -- motor-sdmo trata <4 presentes
    // como no-respuesta completa (§2.8), NO se imputa -- su IDA es null y
    // queda fuera del promedio, sin romper el cálculo del resto.
    { organization_id: 'org-1', persona_id: 'p2', node_id: 'NODO1', jornada: '2026-01-05', acu: 3, com: null, inv: null, pen: 4 }
  ];
  // opts trae los 3 parámetros PENDIENTE_VALIDACION que motor-sdmo exige
  // explícitos (delta, minReportableN, percentilConcentracion) -- valores
  // de PRUEBA, no una calibración real (DISEÑO §7, ya señalado como
  // pendiente; percentilConcentracion se sumó tras un 2º hallazgo real
  // de esta misma verificación -- motor-sdmo.js:155/561, "el piloto
  // fijará su valor, este módulo no inventa uno").
  res = await worker.fetch(mockRequest('calcular-sdmo', { body: { organization_id: 'org-1', desde: '2026-01-01', hasta: '2026-01-31', opts: { delta: 0.5, minReportableN: 1, percentilConcentracion: 0.75 } } }), ENV, {});
  const cuerpoSdmo = await res.json();
  ok(res.status === 200, 'calcular-sdmo (POST, body JSON real) responde 200');
  ok(cuerpoSdmo.porPersona.length === 2, 'calcula ambas personas, incluida la de no-respuesta parcial');
  ok(cuerpoSdmo.porPersona[1].ida === null, 'la persona con 2 dimensiones NULL da ida:null (no se imputa, §2.8)');
  ok(cuerpoSdmo.organizacion && typeof cuerpoSdmo.organizacion.nivelColectivo === 'number',
    'organizacion.nivelColectivo se calcula igual, sobre la persona con IDA válido');

  // ═══════════════════════════════════════════════════════════════
  console.log('\n── 7. calcular-fpv ──');
  // ═══════════════════════════════════════════════════════════════
  RPC_RESPUESTAS.leer_respuestas_fpv = [
    { organization_id: 'org-1', persona_id: 'p1', posicion: 'CONSUMIDOR', period: '2026-01', f: '3', p: 'NE', v: 'NR', peso: 2 }
  ];
  // Config real de posición -- confirma que posiciones.<POS> SÍ llega a
  // runFPV (043, cierra PENDIENTES_BRECHAS_WORKER_MOTORES.md §1), no que
  // se sigue mandando vacío en silencio.
  RPC_RESPUESTAS.leer_config_posiciones_fpv = [
    { organization_id: 'org-1', posicion: 'CONSUMIDOR', period: '2026-01', n_elegibles: 50,
      diseno_probabilistico: true, diseno_modelo_documentado: false, ponderacion_metodologia: 'inverso de probabilidad' }
  ];
  LLAMADAS_RPC.length = 0;
  res = await worker.fetch(mockRequest('calcular-fpv?organization_id=org-1&period=2026-01'), ENV, {});
  const cuerpoFpv = await res.json();
  ok(res.status === 200 && cuerpoFpv.ok === true, 'calcular-fpv responde 200, runFPV ok:true');
  const llamadaConfigFpv = LLAMADAS_RPC.find(function (l) { return l.nombreRpc === 'leer_config_posiciones_fpv'; });
  ok(!!llamadaConfigFpv && llamadaConfigFpv.body.p_period === '2026-01',
    'leer_config_posiciones_fpv SÍ se invoca, con el mismo período que leer_respuestas_fpv');
  ok(cuerpoFpv.output.posiciones.CONSUMIDOR.sensores.F.CV !== undefined,
    'CONSUMIDOR con N_elegibles/diseno declarados -- coberturaSensor() corrió con la cobertura real, no con diseno/N_elegibles ausentes');
  ok(cuerpoFpv.output.meta.posiciones.CONSUMIDOR.ponderado === true,
    'meta.posiciones.CONSUMIDOR.ponderado === true -- la ponderación (043) SÍ se activó, runFPV.js:98 encontró `pond` no-null');

  // ═══════════════════════════════════════════════════════════════
  console.log('\n── 8. calcular-cff -- anidado (evento+componentes) de punta a punta ──');
  // ═══════════════════════════════════════════════════════════════
  // status: 'COMPLETE' (no 'OPEN') -- para que el componente sea
  // genuinamente admisible y se pueda verificar el resultado numérico
  // real, no solo que el pipeline no explote.
  //
  // 2 componentes: C1 en NODO1 (dentro del node_set resuelto), C2 en
  // NODO_FUERA (fuera de la jerarquía declarada) -- prueba que
  // scope_valid (DISENO_SENALES_ADMISIBILIDAD_CFF.md §1.5) distingue de
  // verdad, no defaultea a true siempre. Ninguno de los dos trae ya las
  // señales de admisibilidad (monetary_basis_valid/temporal_basis_valid/
  // scope_valid/relationship_resolution_permite_inclusion) -- las
  // resuelve calcularCff() (src/motores/cff.js), no se fabrican aquí.
  // Solo esTransferenciaInternaPura (es_transferencia_interna_pura, la
  // columna nueva de 037) viaja desde la "tabla" -- juicio real, no derivable.
  RPC_RESPUESTAS.leer_eventos_cff = [{
    organization_id: 'org-1', event_id: 'EV1', source_type: 'PIIO', source_ids: [], phenomenon_id: 'FEN1',
    domain_id: 'QUALITY', node_id: 'NODO1', period_start: '2026-01', period_end: '2026-01',
    event_type: 'tipo', event_description: 'desc', status: 'COMPLETE', flags: [],
    components: [
      {
        organization_id: 'org-1', component_id: 'C1', event_id: 'EV1', phenomenon_id: 'FEN1', node_id: 'NODO1',
        consequence_id: 'CONS1', primary_mechanism: 'LOST_CAPACITY', financial_nature: 'INCREMENTAL_COST',
        resource_type: 'horas', quantity: 10, unit: 'horas', temporal_nature: 'PERIOD_FLOW',
        source_frequency: 'mensual', calculation_frequency: 'mensual', aggregation_frequency: 'mensual',
        calculation_mode: 'DIRECT_VALUE', monetary_basis_id: 'MB1', original_value: 100, original_currency: 'COP',
        valuation_basis: 'NOMINAL', monetization_status: 'OBSERVED', attribution_status: 'CONFIRMED',
        valuation_role: 'PRIMARY', economic_scope: 'NODE', counterparty_scope: 'INTERNAL',
        include_in_cff: true, dependency_refs: [], flags: [], input_variables: [],
        es_transferencia_interna_pura: false
      },
      {
        organization_id: 'org-1', component_id: 'C2', event_id: 'EV1', phenomenon_id: 'FEN1', node_id: 'NODO_FUERA',
        consequence_id: 'CONS2', primary_mechanism: 'LOST_CAPACITY', financial_nature: 'INCREMENTAL_COST',
        resource_type: 'horas', quantity: 10, unit: 'horas', temporal_nature: 'PERIOD_FLOW',
        source_frequency: 'mensual', calculation_frequency: 'mensual', aggregation_frequency: 'mensual',
        calculation_mode: 'DIRECT_VALUE', monetary_basis_id: 'MB1', original_value: 999, original_currency: 'COP',
        valuation_basis: 'NOMINAL', monetization_status: 'OBSERVED', attribution_status: 'CONFIRMED',
        valuation_role: 'PRIMARY', economic_scope: 'NODE', counterparty_scope: 'INTERNAL',
        include_in_cff: true, dependency_refs: [], flags: [], input_variables: [],
        es_transferencia_interna_pura: false
      },
      {
        // "sin cifra" explícito (PENDIENTES §7 Q4, migración 045): N_A, los 3 valores null tal cual llegan de la BD
        organization_id: 'org-1', component_id: 'C3', event_id: 'EV1', phenomenon_id: 'FEN1', node_id: 'NODO1',
        consequence_id: 'CONS3', primary_mechanism: 'LOST_CAPACITY', financial_nature: 'INCREMENTAL_COST',
        resource_type: 'horas', quantity: 10, unit: 'horas', temporal_nature: 'PERIOD_FLOW',
        source_frequency: 'mensual', calculation_frequency: 'mensual', aggregation_frequency: 'mensual',
        calculation_mode: 'DIRECT_VALUE', monetary_basis_id: 'MB1',
        original_value: null, original_value_min: null, original_value_max: null, original_currency: 'COP',
        valuation_basis: 'NOMINAL', monetization_status: 'N_A', attribution_status: 'CONFIRMED',
        valuation_role: 'PRIMARY', economic_scope: 'NODE', counterparty_scope: 'INTERNAL',
        include_in_cff: true, dependency_refs: [], flags: [], input_variables: [],
        es_transferencia_interna_pura: false
      }
    ]
  }];
  // Sin que el caso exista todavía (leer_caso_cff devuelve []) -> 404, no inventa nada.
  RPC_RESPUESTAS.leer_caso_cff = [];
  res = await worker.fetch(mockRequest('calcular-cff?organization_id=org-1&cff_case_id=CASO-QUE-NO-EXISTE'), ENV, {});
  ok(res.status === 404, 'calcular-cff con un cff_case_id no declarado -> 404, no fabrica un sobreCaso');

  // Caso YA declarado (simula lo que registrar_caso_cff + leer_caso_cff
  // devolverían de verdad, DISENO_SOBRE_CASO_CFF.md/036) + jerarquía de
  // nodos real -- node_set queda NULL a propósito, para probar el default
  // mecánico (hojasBajo) confirmado por Luis -- hojasBajo(ORG) = [NODO1]
  // únicamente, así que NODO_FUERA (de C2) queda fuera del alcance.
  RPC_RESPUESTAS.leer_caso_cff = [{
    organization_id: 'org-1', cff_case_id: 'CASO-2026-01', period_start: '2026-01', period_end: '2026-01',
    scope: 'CFF trimestral Q1-2026', economic_scope: 'ORGANIZATION', reporting_currency: 'COP',
    valuation_basis: 'NOMINAL', node_raiz: 'ORG', node_set: null,
    cobertura_tratamiento_suficiente: true, cobertura_depende_estimaciones_debiles: false,
    cobertura_asignaciones_limitadas: false, cobertura_base_defendible: true, run_status: 'COMPLETED'
  }];
  RPC_RESPUESTAS.leer_node_hierarchy_cff = [
    { organization_id: 'org-1', node_id: 'ORG', parent_id: null },
    { organization_id: 'org-1', node_id: 'NODO1', parent_id: 'ORG' }
    // NODO_FUERA deliberadamente NO está en la jerarquía -- C2 (en NODO_FUERA) debe quedar excluido.
  ];
  // Sin relaciones declaradas para este caso -- escenario real legítimo
  // (leer_relaciones_cff, 042). LLAMADAS_RPC se limpia y se revisa abajo
  // para confirmar que el handler sí la invoca con el mismo rango de
  // período que leer_eventos_cff, no que el pipeline la omite en
  // silencio.
  RPC_RESPUESTAS.leer_relaciones_cff = [];
  LLAMADAS_RPC.length = 0;
  res = await worker.fetch(mockRequest('calcular-cff', { body: { organization_id: 'org-1', cff_case_id: 'CASO-2026-01' } }), ENV, {});
  const cuerpoCff = await res.json();
  ok(res.status === 200, 'calcular-cff con caso ya declarado -> 200 -- ya NO exige sobreCaso externo');
  const llamadaRelaciones = LLAMADAS_RPC.find(function (l) { return l.nombreRpc === 'leer_relaciones_cff'; });
  ok(!!llamadaRelaciones && llamadaRelaciones.body.p_period_start === '2026-01' && llamadaRelaciones.body.p_period_end === '2026-01',
    'leer_relaciones_cff SÍ se invoca, con el mismo rango de período que leer_eventos_cff -- no se omite en silencio');
  // runCFF() devuelve { result, run, trace, _meta } -- no un objeto plano.
  ok(cuerpoCff && cuerpoCff.result && typeof cuerpoCff.result.calculation_status === 'string',
    'devuelve CFF_RESULT con calculation_status -- runCFF corrió de verdad, no un eco');
  ok(cuerpoCff.result.node_set && cuerpoCff.result.node_set.length === 1 && cuerpoCff.result.node_set[0] === 'NODO1',
    'node_set se resolvió con el default mecánico (hojasBajo(ORG) = [NODO1], la única hoja) -- nadie lo declaró');
  ok(cuerpoCff.run.run_id === 'org-1|2026-01|rs=CFF-v1.1', 'run_id ensamblado por construirCFFRun(), determinista, sin declararlo');
  ok(cuerpoCff.run.run_status === 'COMPLETED', 'run_status viajó desde cff_casos (declarado por el analista) hasta CFF_RUN');
  // La exclusión de C2 (scope_valid=false) degrada calculation_status a
  // VALID_WITH_LIMITATIONS (overall_coverage_status pasa a PARTIAL) --
  // verificado por ejecución real, NO 'VALID' plano como se asumió al
  // escribir la aserción original: excluir un componente por la
  // compuerta §18 SÍ debe notarse en el resultado, no quedar silencioso.
  ok(cuerpoCff.result.calculation_status === 'VALID_WITH_LIMITATIONS',
    'calculation_status = VALID_WITH_LIMITATIONS -- la exclusión de C2 (scope_valid=false) degrada el resultado, no lo esconde');
  ok(cuerpoCff.result.coverage.overall_coverage_status === 'PARTIAL',
    'overall_coverage_status = PARTIAL -- consolidacion.js sí contó a C2 como una exclusión de cobertura, no lo ignoró');
  ok(cuerpoCff.result.cff_total === 100, 'cff_total = 100 -- SOLO el valor de C1; C2 (999, fuera de alcance) NO entró a la suma');
  // trace/dependency_refs son trazabilidad de TODO lo considerado
  // (construirTrace() recorre caso.eventos sin filtrar por admisibilidad,
  // motor-cff/runCFF.js:272-297) -- C2 SIGUE apareciendo ahí a propósito,
  // para poder auditar por qué se excluyó; lo que no debe aparecer es en
  // la suma (cff_total, ya verificado arriba).
  ok(cuerpoCff.trace.component_ids.indexOf('C2') !== -1,
    'C2 sigue en trace.component_ids -- trazabilidad no oculta lo excluido, solo lo saca de la suma');
  ok(cuerpoCff.result.warnings.some(function (w) { return w.code === 'COMPONENTE_SIN_CIFRA_DECLARADA' && w.ref === 'C3'; }) &&
    JSON.stringify(cuerpoCff.result.coverage.limitations).indexOf('C3: MONETIZACION_NO_OBSERVADA_NI_ESTIMADA (SIN_CIFRA_DECLARADA)') !== -1 &&
    !cuerpoCff.result.errors.some(function (e) { return e.ref === 'C3'; }),
    'C3 (N_A, valores null desde la BD) -> "sin cifra" declarado: warning + limitations, SIN error de datos, sin sumar (Q4, 045)');
  const rec = cuerpoCff.result.cost_reconciliation;
  ok(rec && rec.verificacion.cuadra && rec.verificacion.componentes_considerados === 3 &&
    rec.categorias.costo_atribuido.monto === 100 && rec.categorias.costo_atribuido.n === 1 &&
    rec.fuera_de_alcance.n === 1 && rec.categorias.efectos_sin_valoracion.n === 1 &&
    rec.categorias.efectos_sin_valoracion.componentes[0].component_id === 'C3' &&
    rec.categorias.otras_causas.monto === null && rec.categorias.otras_causas.derivable === false,
    'cost_reconciliation llega por el Worker: C1 costo (100), C2 fuera de alcance, C3 efectos sin valoración, otras_causas no derivable, partición cuadra');
  ok(JSON.stringify(cuerpoCff.result.coverage.limitations).indexOf('C2') !== -1,
    'la exclusión de C2 queda visible con motivo en coverage.limitations -- scope_valid=false lo excluyó, no lo escondió');

  // ═══════════════════════════════════════════════════════════════
  console.log('\n── 9. calcular-ifd ──');
  // ═══════════════════════════════════════════════════════════════
  RPC_RESPUESTAS.leer_epd_ifd = [{
    epd_id: 'EPD1', engine_version: 'v1.2.2', deterioration_sustained: true, evidence_present: true,
    mechanism_traceable: true, horizon_defined: true, assumptions_declared: true,
    q: 2, c: 1, t: 3, r: 0, variable_type: 'V1', evolution_type: 'EV-A', series_sufficiency: 2,
    horizon: 6, hms: null, economic_traceability: false, attribution_category: 'CONFIRMED'
  }];
  res = await worker.fetch(mockRequest('calcular-ifd?organization_id=org-1'), ENV, {});
  const cuerpoIfd = await res.json();
  ok(res.status === 200 && cuerpoIfd.porEpd.length === 1 && cuerpoIfd.porEpd[0].ok === true, 'calcular-ifd responde 200, runEPD ok:true');

  // ═══════════════════════════════════════════════════════════════
  console.log('\n── 10. calcular-piio -- forma PIIO_INPUT completa ──');
  // ═══════════════════════════════════════════════════════════════
  RPC_RESPUESTAS.leer_datos_piio = {
    organization_id: 'org-1', periods: ['2026-01'], node_hierarchy: [], observations: [],
    domain_catalog: [], phenomenon_catalog: [], metric_definitions: [], references: [],
    kpi_specs: [], evidence_groups: []
  };
  res = await worker.fetch(mockRequest('calcular-piio', { body: { organization_id: 'org-1', periods: ['2026-01'] } }), ENV, {});
  const cuerpoPiio = await res.json();
  ok(res.status === 200 && cuerpoPiio.piio_run, 'calcular-piio responde 200, runPIIOCompleto produjo piio_run');
  // PENDIENTES_BRECHAS_WORKER_MOTORES.md §6: esta aserción antes solo
  // comprobaba que piio_run existiera -- un run_status BLOCKED también
  // lo cumple, y así estuvo pasando en silencio con datos reales (falta
  // ruleset_version). Se exige explícitamente que NO quede BLOCKED, y
  // que ruleset_version haya viajado de punta a punta (inyectado por
  // src/motores/piio.js, no por el mock -- este mock sigue sin traerlo).
  ok(cuerpoPiio.piio_run.run_status !== 'BLOCKED', 'calcular-piio: run_status no queda BLOCKED (antes se aceptaba en silencio)');
  ok(cuerpoPiio.piio_run.ruleset_version === 'PIIO-v1.1', 'calcular-piio: ruleset_version viajó hasta PIIO_RUN aunque el mock no lo provee');

  // ═══════════════════════════════════════════════════════════════
  console.log('\n── 11. calcular-aie -- orquesta motor-iao + motor-sdmo por período, runCase() sin Python ──');
  // ═══════════════════════════════════════════════════════════════
  LLAMADAS_RPC.length = 0;
  RPC_RESPUESTAS.leer_respuestas_ice_ieh = (body) => {
    // Serie de 2 períodos, valores distintos para poder confirmar orden.
    const val = body.p_period === '2026-01' ? 1 : 5;
    const p31b = Object.fromEntries(Array.from({ length: 31 }, (_, i) => ['P' + (i + 1), val]));
    return [{ organization_id: 'org-1', persona_id: 'p1', node_id: 'NODO1', period: body.p_period, respuestas: p31b }];
  };
  RPC_RESPUESTAS.leer_respuestas_sdmo = [
    { organization_id: 'org-1', persona_id: 'p1', node_id: 'NODO1', jornada: '2026-01-05', acu: 1, com: 1, inv: 1, pen: 1 }
  ];
  const optsDePrueba = { delta: 0.5, minReportableN: 1, percentilConcentracion: 0.75 };
  res = await worker.fetch(mockRequest('calcular-aie', { body: { organization_id: 'org-1', periods: ['2026-01', '2026-02'], opts: optsDePrueba } }), ENV, {});
  const cuerpoAie = await res.json();
  ok(res.status === 200, 'calcular-aie responde 200');
  ok(LLAMADAS_RPC.filter((l) => l.nombreRpc === 'leer_respuestas_ice_ieh').length === 2, 'llamó leer_respuestas_ice_ieh 2 veces, una por período');
  ok(LLAMADAS_RPC.filter((l) => l.nombreRpc === 'leer_respuestas_sdmo').length === 2, 'llamó leer_respuestas_sdmo 2 veces, una por período');
  ok(Array.isArray(cuerpoAie) && cuerpoAie.length === 2, 'runCase() devolvió 2 filas, una por período de la serie');
  ok(cuerpoAie[0].t === 0 && cuerpoAie[1].t === 1, 'las filas de runCase() vienen en orden (t=0, t=1)');
  ok(typeof cuerpoAie[1].AIE_2F === 'string', 'la segunda fila (con historia suficiente) trae una clasificación AIE_2F real');

  // PENDIENTES_BRECHAS_WORKER_MOTORES.md §11: p_hasta debe ser el ÚLTIMO DÍA
  // REAL del mes, no period + '-31' (fecha inexistente en 5 meses).
  const hastasSdmo = () => LLAMADAS_RPC.filter((l) => l.nombreRpc === 'leer_respuestas_sdmo').map((l) => l.body.p_hasta);
  eqLista(hastasSdmo(), ['2026-01-31', '2026-02-28'], 'calcular-aie: p_hasta = 2026-01-31 y 2026-02-28 (febrero no bisiesto)');

  LLAMADAS_RPC.length = 0;
  res = await worker.fetch(mockRequest('calcular-aie', { body: { organization_id: 'org-1', periods: ['2026-04', '2028-02', '2026-11'], opts: optsDePrueba } }), ENV, {});
  ok(res.status === 200, 'calcular-aie con meses de 30 días y febrero bisiesto responde 200 (antes: 22008 "2026-04-31")');
  eqLista(hastasSdmo(), ['2026-04-30', '2028-02-29', '2026-11-30'], 'calcular-aie: p_hasta = 2026-04-30, 2028-02-29 (bisiesto), 2026-11-30');
  eqLista(LLAMADAS_RPC.filter((l) => l.nombreRpc === 'leer_respuestas_sdmo').map((l) => l.body.p_desde), ['2026-04-01', '2028-02-01', '2026-11-01'], 'calcular-aie: p_desde = día 1 de cada mes');

  LLAMADAS_RPC.length = 0;
  res = await worker.fetch(mockRequest('calcular-aie', { body: { organization_id: 'org-1', periods: ['2026-13'], opts: optsDePrueba } }), ENV, {});
  ok(res.status === 400, 'calcular-aie con period mal formado (2026-13) -> 400, no llega a la base');
  ok(LLAMADAS_RPC.filter((l) => l.nombreRpc === 'leer_respuestas_sdmo').length === 0, 'calcular-aie con period inválido no llama a leer_respuestas_sdmo');

  // El propio mock ahora rechaza fechas inexistentes como Postgres -- así una
  // regresión de este tipo en CUALQUIER handler falla aquí, no en producción.
  res = await worker.fetch(mockRequest('calcular-sdmo', { body: { organization_id: 'org-1', desde: '2026-04-01', hasta: '2026-04-31', opts: optsDePrueba } }), ENV, {});
  ok(res.status !== 200, 'el mock rechaza una fecha inexistente (2026-04-31) también en calcular-sdmo, como la base real');

  // ═══════════════════════════════════════════════════════════════
  console.log('\n── 10b. enviar-invitaciones-cuestionario (DISENO_ENVIO_INVITACIONES_BREVO.md §2) ──');
  // ═══════════════════════════════════════════════════════════════
  res = await worker.fetch(mockRequest('enviar-invitaciones-cuestionario', { body: { invitaciones: [] } }), ENV, {});
  ok(res.status === 400, 'array de invitaciones vacío -> 400');
  res = await worker.fetch(mockRequest('enviar-invitaciones-cuestionario', { body: {} }), ENV, {});
  ok(res.status === 400, 'sin "invitaciones" en el body -> 400 (no revienta con TypeError)');
  res = await worker.fetch(mockRequest('enviar-invitaciones-cuestionario', {
    body: { invitaciones: [{ persona_id: 'P1', node_id: 'N1', codigo: 'COD1', email: 'p1@empresa.com' }] }
  }), ENV, {});
  ok(res.status === 400, 'sin nombre_organizacion en el body -> 400');

  RPC_RESPUESTAS.marcar_invitacion_notificada = null; // void -- PostgREST con Prefer:return=representation
  LLAMADAS_BREVO.length = 0; LLAMADAS_RPC.length = 0;
  res = await worker.fetch(mockRequest('enviar-invitaciones-cuestionario', {
    body: {
      organization_id: 'org-1',
      nombre_organizacion: 'Acme & Sons <Ltda>',
      invitaciones: [
        { persona_id: 'P1', node_id: 'N1', codigo: 'COD1', email: 'p1@empresa.com' },
        { persona_id: 'P2', node_id: 'N1', codigo: 'COD2', email: 'p2@empresa.com' }
      ]
    }
  }), ENV, {});
  let cuerpoBrevo = await res.json();
  ok(res.status === 200, '2 filas, ambas exitosas -> 200');
  eqLista(cuerpoBrevo, { total: 2, enviados: 2, fallidos: [] }, 'total/enviados/fallidos correctos con las 2 exitosas');
  ok(LLAMADAS_BREVO.length === 2, 'se llamó a Brevo exactamente 2 veces, una por fila (secuencial, no en lote)');
  ok(LLAMADAS_BREVO.every((l) => l.apiKey === 'fake-brevo-key'), 'el header api-key es env.BREVO_API_KEY en las 2 llamadas');
  ok(LLAMADAS_BREVO[0].body.sender.email === 'invitaciones@eficiencia.com.co' && LLAMADAS_BREVO[0].body.sender.name === 'EFICIENCIA', 'sender = {name, email} = env.BREVO_SENDER_EMAIL');
  ok(LLAMADAS_BREVO[0].body.to[0].email === 'p1@empresa.com' && LLAMADAS_BREVO[1].body.to[0].email === 'p2@empresa.com', 'to[0].email = el email de cada fila, en el orden del array (P1 antes que P2)');
  ok(LLAMADAS_BREVO.every((l) => l.body.htmlContent.indexOf('COD1') !== -1 || l.body.htmlContent.indexOf('COD2') !== -1), 'htmlContent trae el código de esa fila (enlace de invitación), no un texto genérico');
  ok(LLAMADAS_BREVO.every((l) => l.body.subject === 'Tu invitación — EFICIENCIA'), 'asunto exacto en las 2 llamadas');
  ok(LLAMADAS_BREVO.every((l) => l.body.htmlContent.indexOf('cuestionario_ice_ieh.html?codigo=') !== -1), 'htmlContent trae el enlace de ICE-IEH');
  ok(LLAMADAS_BREVO.every((l) => l.body.htmlContent.indexOf('sdmo_nuevo.html') === -1), 'htmlContent NO trae enlace de SDMO -- decisión de Luis, PENDIENTES §18: solo ICE-IEH en esta ronda');
  ok(LLAMADAS_BREVO.every((l) => l.body.htmlContent.indexOf('un instrumento breve') !== -1 && l.body.htmlContent.indexOf('dos instrumentos') === -1), 'texto ajustado a un solo instrumento, no "dos instrumentos breves"');
  ok(LLAMADAS_BREVO.every((l) => l.body.htmlContent.indexOf('Acme &amp; Sons &lt;Ltda&gt;') !== -1), 'nombre_organizacion reemplaza "(nombre de empresa)", ESCAPADO (& < > -- nombre con caracteres especiales a propósito)');
  ok(LLAMADAS_BREVO.every((l) => l.body.htmlContent.indexOf('(nombre de empresa)') === -1), 'el placeholder literal "(nombre de empresa)" no sobrevive en el correo real');
  ok(LLAMADAS_RPC.filter((l) => l.nombreRpc === 'marcar_invitacion_notificada').length === 2, 'marcar_invitacion_notificada se llamó 2 veces, una por envío exitoso');
  ok(LLAMADAS_RPC.every((l) => l.nombreRpc !== 'marcar_invitacion_notificada' || l.authorization === 'Bearer fake.jwt.token'), 'marcar_invitacion_notificada reenvía el JWT del consultor, no service_role');

  // fallo de Brevo en una fila: la otra se guarda igual, y NO se marca notificada la que falló
  BREVO_RESPUESTAS['p1@empresa.com'] = { ok: false, status: 400, texto: '{"code":"invalid_parameter","message":"correo inválido"}' };
  LLAMADAS_BREVO.length = 0; LLAMADAS_RPC.length = 0;
  res = await worker.fetch(mockRequest('enviar-invitaciones-cuestionario', {
    body: {
      organization_id: 'org-1',
      nombre_organizacion: 'Acme S.A.S.',
      invitaciones: [
        { persona_id: 'P1', node_id: 'N1', codigo: 'COD1', email: 'p1@empresa.com' },
        { persona_id: 'P2', node_id: 'N1', codigo: 'COD2', email: 'p2@empresa.com' }
      ]
    }
  }), ENV, {});
  cuerpoBrevo = await res.json();
  ok(res.status === 200, 'un fallo individual NO tumba la respuesta -> sigue 200 (best-effort, mismo estándar que amar-shared.js)');
  ok(cuerpoBrevo.total === 2 && cuerpoBrevo.enviados === 1 && cuerpoBrevo.fallidos.length === 1, '1 de 2 enviada; la otra en fallidos');
  eqLista(cuerpoBrevo.fallidos[0], { persona_id: 'P1', codigo: 'COD1', motivo: 'Brevo 400: {"code":"invalid_parameter","message":"correo inválido"}' }, 'fallidos[0] trae persona_id/codigo/motivo, mismo shape que lotesFallidos del CSV');
  ok(LLAMADAS_RPC.filter((l) => l.nombreRpc === 'marcar_invitacion_notificada').length === 1, 'marcar_invitacion_notificada NO se llamó para la fila que falló en Brevo -- solo para la exitosa (P2)');
  ok(LLAMADAS_RPC.some((l) => l.nombreRpc === 'marcar_invitacion_notificada' && l.body.p_codigo === 'COD2'), 'la única llamada a marcar_invitacion_notificada es con el código de P2, no P1');
  delete BREVO_RESPUESTAS['p1@empresa.com'];

  // fallo del RPC de marcado (Brevo sí envió) -- también va a fallidos, no se pierde en silencio
  const fetchOriginalParaEsteTest = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (String(url).indexOf('/rest/v1/rpc/marcar_invitacion_notificada') !== -1) {
      return { ok: false, status: 500, text: async () => 'RPC no encontrada (simulado)' };
    }
    return fetchOriginalParaEsteTest(url, opts);
  };
  LLAMADAS_BREVO.length = 0;
  res = await worker.fetch(mockRequest('enviar-invitaciones-cuestionario', {
    body: { organization_id: 'org-1', nombre_organizacion: 'Acme S.A.S.', invitaciones: [{ persona_id: 'P3', node_id: 'N1', codigo: 'COD3', email: 'p3@empresa.com' }] }
  }), ENV, {});
  cuerpoBrevo = await res.json();
  ok(cuerpoBrevo.enviados === 0 && cuerpoBrevo.fallidos.length === 1 && cuerpoBrevo.fallidos[0].persona_id === 'P3', 'Brevo OK pero el RPC de marcado falla -> igual va a fallidos (no se asume "enviado" solo porque Brevo respondió)');
  ok(LLAMADAS_BREVO.length === 1, 'el correo SÍ se llegó a intentar (Brevo se llamó) antes de que fallara el marcado');
  globalThis.fetch = fetchOriginalParaEsteTest;

  // ═══════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(74));
  console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fail + ' fallos');
  console.log('═'.repeat(74));
  process.exit(_fail ? 1 : 0);
};

run().catch((e) => { console.error('\n❌ FALLO INESPERADO:', e); process.exit(1); });
