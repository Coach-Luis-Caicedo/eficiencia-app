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
function ok(cond, label) {
  if (cond) { _ok++; console.log('  ✓ ' + label); }
  else { _fail++; console.log('  ✗ FALLA: ' + label); }
}

// ── mock de fetch -- intercepta las llamadas RPC, responde con datos de prueba ──
const RPC_RESPUESTAS = {}; // se llena por cada test antes de invocar el handler
const LLAMADAS_RPC = [];   // registro de qué se llamó, para verificar el flujo

globalThis.fetch = async (url, opts) => {
  const nombreRpc = String(url).split('/rest/v1/rpc/')[1];
  const body = JSON.parse(opts.body);
  LLAMADAS_RPC.push({ nombreRpc, body, authorization: opts.headers.Authorization });

  if (!(nombreRpc in RPC_RESPUESTAS)) {
    return { ok: false, status: 500, text: async () => 'RPC no mockeada: ' + nombreRpc };
  }
  const datos = typeof RPC_RESPUESTAS[nombreRpc] === 'function' ? RPC_RESPUESTAS[nombreRpc](body) : RPC_RESPUESTAS[nombreRpc];
  return { ok: true, status: 200, text: async () => JSON.stringify(datos) };
};

const ENV = {
  SUPABASE_URL: 'https://fake.supabase.co',
  SUPABASE_ANON_KEY: 'fake-anon-key',
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
    { organization_id: 'org-1', persona_id: 'p1', posicion: 'CONSUMIDOR', period: '2026-01', f: '3', p: 'NE', v: 'NR', peso: null }
  ];
  res = await worker.fetch(mockRequest('calcular-fpv?organization_id=org-1&period=2026-01'), ENV, {});
  const cuerpoFpv = await res.json();
  ok(res.status === 200 && cuerpoFpv.ok === true, 'calcular-fpv responde 200, runFPV ok:true');

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
  res = await worker.fetch(mockRequest('calcular-cff', { body: { organization_id: 'org-1', cff_case_id: 'CASO-2026-01' } }), ENV, {});
  const cuerpoCff = await res.json();
  ok(res.status === 200, 'calcular-cff con caso ya declarado -> 200 -- ya NO exige sobreCaso externo');
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

  // ═══════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(74));
  console.log('  RESULTADO:  ' + _ok + ' asserts OK, ' + _fail + ' fallos');
  console.log('═'.repeat(74));
  process.exit(_fail ? 1 : 0);
};

run().catch((e) => { console.error('\n❌ FALLO INESPERADO:', e); process.exit(1); });
