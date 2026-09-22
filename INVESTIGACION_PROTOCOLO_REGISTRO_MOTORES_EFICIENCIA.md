# Investigación — protocolo de registro para `motores_eficiencia`

**Estado: investigación. Cero DDL, cero función propuesta todavía.** Mismo
criterio que las investigaciones previas de esta sesión
(`INVESTIGACION_CANAL_ENVIO_AUTOMATIZADO_SDMO.md`,
`DISENO_SOBRE_CASO_CFF.md` antes de escribir `036`): entender primero qué
existe y con qué evidencia, decidir después.

Motivo: al probar el Worker contra Supabase real (ronda anterior), el único
camino para que un consultor de prueba quedara vinculado a una organización
fue un `INSERT` manual en `consultor_organizacion` — porque esa tabla no
tiene política de `INSERT` para `authenticated` (`001:211-213`, confirmado
por ejecución real: `42501` reproducido incluso después de dar `USAGE` de
esquema, hasta agregar `GRANT EXECUTE` explícito). Eso es aceptable para un
usuario desechable; no existe ningún flujo real para que una organización
nueva o un consultor nuevo entren al sistema.

---

## 1. Cómo lo resuelve el sistema legacy

### 1.1 `crear_organizacion()` — firma completa y evolución

Definida en `007_funciones_alta_organizacion.sql:329-410`, con la firma
cambiada una vez en `011_ficha_financiera_cff.sql:69-159` (agrega `p_pais`
como obligatorio, después de `p_sector`). **Firma vigente** (la de `011`,
`CREATE OR REPLACE` no permite insertar un parámetro obligatorio en medio —
`011` hace `DROP FUNCTION` primero, línea 69):

```sql
crear_organizacion(
  p_nombre               text,          -- obligatorio
  p_n_empleados          int,           -- obligatorio, > 0
  p_sector               text,          -- obligatorio, 1 de 5 valores fijos
  p_pais                 text,          -- obligatorio, hoy solo 'colombia'
  p_areas                text[],        -- obligatorio, ≥ 1 elemento
  p_salario_promedio     numeric DEFAULT NULL,
  p_tasa_rotacion_base   numeric DEFAULT NULL,
  p_dias_ausencia_base   numeric DEFAULT NULL,
  p_contactos            jsonb   DEFAULT NULL
) RETURNS uuid
SECURITY DEFINER SET search_path = public
```

**Qué hace, en orden exacto** (`011:90-156`):

1. `IF auth.uid() IS NULL THEN RAISE EXCEPTION 'no autenticado'` — exige un
   JWT válido, no anónimo.
2. `IF NOT EXISTS (SELECT 1 FROM consultores WHERE id = auth.uid())` →
   `RAISE EXCEPTION 'no autorizado — el usuario autenticado no está
   registrado como consultor'`. **Esto es la cita clave**: la función
   **no crea** la fila de `consultores` — la exige de antemano. Quien la
   llama ya tiene que ser un consultor registrado.
3. Valida `nombre`/`n_empleados`/`sector`/`pais`/`areas` con
   `RAISE EXCEPTION` uno por uno (mensajes legibles, no solo el `CHECK` de
   columna).
4. `INSERT INTO organizaciones (nombre, n_empleados, sector, pais,
   salario_promedio, tasa_rotacion_base, dias_ausencia_base) ...
   RETURNING id INTO v_org_id`.
5. `FOREACH v_area IN ARRAY p_areas` → `INSERT INTO areas_organizacion
   (organizacion_id, nombre) ... ON CONFLICT DO NOTHING`.
6. **`INSERT INTO consultor_organizacion (consultor_id, organizacion_id,
   rol) VALUES (auth.uid(), v_org_id, 'consultor')`** — sí, la función
   construye también el vínculo consultor↔organización, automáticamente,
   con el consultor que llamó. Esto funciona porque la función corre
   `SECURITY DEFINER`: el `INSERT` se ejecuta con los privilegios de quien
   creó la función, no con los del rol `authenticated` que no tiene
   política de `INSERT` en esa tabla (`001:211-213`) — la ausencia de esa
   política bloquea el `INSERT` *directo* del cliente, no el que hace la
   función por dentro.
7. Si `p_contactos` no es `NULL`, itera el array y hace `INSERT INTO
   contactos_organizacion` por cada uno con `nombre` no vacío (rol ∈
   `directivo_responsable`/`coordinador`/`comite_supervision`).

**Grant**: `GRANT EXECUTE ON FUNCTION crear_organizacion(text, int, text,
text, text[], numeric, numeric, numeric, jsonb) TO authenticated;`
(`011:159`) — cualquier `authenticated` puede invocarla; el gate real está
en el paso 2 (ya ser `consultores`), no en el `GRANT`.

### 1.2 Lo que NO resuelve — verificado, no asumido

Busqué `INSERT INTO consultores` (o `public.consultores`) en las 38
migraciones completas: **cero resultados**. Ninguna función, en ningún
punto del sistema legacy ni del nuevo, crea una fila de `consultores`.
Tampoco existe ningún flujo de auto-registro en el frontend: `workbook.html`
solo llama `supa.auth.signInWithPassword(...)` (`workbook.html:758`) — nunca
`supa.auth.signUp(...)`. Es decir: **convertirse en consultor por primera
vez no tiene ningún mecanismo construido, en ningún lado** — hoy se hace a
mano en el dashboard de Supabase Auth, exactamente como se hizo con el
usuario de prueba de la ronda anterior.

---

## 2. Qué de esto aplica al sistema nuevo, y qué no

**Se reutiliza tal cual** — no son "tablas legacy", son la columna vertebral
de identidad/autorización de la que `motores_eficiencia` YA depende por
completo: las 9 funciones de escritura (`034`) y las 6+ de lectura
(`035`/`036`) verifican `auth.uid()` contra `consultor_organizacion` en
**cada una** (patrón `SELECT 1 FROM consultor_organizacion WHERE
consultor_id = auth.uid() AND organizacion_id = p_organization_id`,
idéntico en las 15 funciones). Si el protocolo nuevo no produce filas
correctas en estas tres tablas, ninguna función de `motores_eficiencia`
puede autorizar a nadie:

- `public.organizaciones` — pero **solo** `id`/`nombre`/`activa`/
  `creado_en` (`001:53-58`), la identidad mínima. `motores_eficiencia.*`
  reference esta tabla por FK (`organization_id uuid NOT NULL REFERENCES
  public.organizaciones(id)`, verificado en `032`).
- `public.consultores`
- `public.consultor_organizacion`

**NO se reutiliza** — específico del sistema legacy, semánticamente
distinto de lo que `motores_eficiencia` necesita (mismo criterio que ya se
aplicó a `contactos_organizacion` → `comite_eficiencia`,
`DISENO_INTEGRADO_TABLAS_ENTRADA_5_MOTORES.md` §6.3):

- **La ficha técnica CFF** (`n_empleados`, `sector`, `pais`,
  `salario_promedio`, `tasa_rotacion_base`, `dias_ausencia_base` de `005`;
  `costo_operativo_total`, `costo_intervencion`, `ebitda` de `011`) —
  insumos del `calcular_cff()` **viejo** (`015`). El input real de
  `motor-cff` nuevo es el sobre de caso de `motores_eficiencia.cff_casos`
  (`036`: `period_start`, `scope`, `economicScope`, `valuation_basis`,
  `nodeRaiz`, etc.) — **cero solapamiento de campos**. Ningún motor de los
  8 lee estas columnas de `organizaciones`.
- **`areas_organizacion`** — lista plana de departamentos, eje distinto de
  `node_id`/`motores_eficiencia.node_hierarchy` (`031`). Esta tensión ya
  quedó señalada, sin resolver, en
  `DISENO_INTEGRADO_TABLAS_ENTRADA_5_MOTORES.md` §2.5 — el protocolo de
  registro no puede simplemente reusar `p_areas` de `crear_organizacion()`
  como si fuera lo mismo que poblar `node_hierarchy`.
- **`contactos_organizacion`** — ya resuelto en rondas anteriores:
  `comite_eficiencia` es el equivalente nuevo, con su propia función de
  escritura (`agregar_miembro_comite`, `034`), sin relación con
  `crear_organizacion()`.

**Hallazgo adicional, relacionado pero no idéntico**: tampoco existe hoy
ninguna función que escriba en `motores_eficiencia.node_hierarchy` (`031`)
— solo la tabla, dos vistas (`node_hierarchy_vigente`,
`node_hierarchy_cff_view`) y la función de *lectura*
(`leer_node_hierarchy_cff`, `036`), las tres con `REVOKE ALL ... FROM
PUBLIC` (`031:167-169`). La *forma* de esa jerarquía ya se investigó por
separado y a fondo (`DISENO_EJERCICIO_NODE_HIERARCHY.md`); lo que falta,
y que ese documento no cubre, es **quién y cómo la escribe la primera vez**
para una organización nueva. Lo señalo como relacionado, no lo resuelvo
aquí — no estaba en el encargo de esta ronda.

---

## 3. El rol de "custodio" — confirmado fuera de alcance

Dos apariciones, ambas verificadas, ninguna con código real detrás:

1. **`log_acceso_confidencial`** (`001:158-169`) — tabla creada
   "lista para el rol de custodio (marco, sección 9.2)", con el comentario
   explícito: *"El flujo de consulta que escribe aquí (función SECURITY
   DEFINER dedicada, con más acceso que resumen_par_organizacion) no se
   construye en esta migración — pendiente hasta que se active el rol."*
   Confirmé que ninguna migración posterior (hasta `038`) agrega esa
   función — la tabla sigue vacía de escritores, sin `GRANT` siquiera
   (`003:44-49`: *"sin cambios, a propósito... todo pasa por funciones
   SECURITY DEFINER"*, y esa función nunca se escribió).
2. **Comentario en `006:90-97`** — al diseñar `contactos_organizacion`
   como tabla separada (no columnas sueltas en `organizaciones`), el
   razonamiento fue: *"para que, cuando se decida darle login real a
   alguno de estos contactos... la transición sea limpia: el camino
   natural es que se convierta en un registro de consultores... y se
   vincule con rol='custodio' en consultor_organizacion... No se construye
   ese camino ahora, solo queda preparado."*

`consultor_organizacion.rol` (`001:72`) sí tiene el `CHECK (rol IN
('consultor','custodio'))` desde el origen, pero busqué `'custodio'` como
valor insertado en cualquier función y no aparece en ninguna — el `CHECK`
permite el valor, nadie lo produce nunca.

**Conclusión, sin ambigüedad**: el rol de custodio es scaffolding
deliberado, dos veces diferido explícitamente por quien lo diseñó, sin que
ninguna ronda posterior lo haya activado. El protocolo de registro nuevo
**no necesita resolverlo** — sería construir una feature que el propio
sistema legacy decidió, dos veces, no construir todavía. Si se necesita en
el futuro, es un problema propio, no un prerequisito de este protocolo.

---

## 4. Quién puede crear una organización nueva

La pregunta tiene una respuesta más matizada que "sí" o "no" — hay **tres
acciones distintas**, con tres niveles de control distintos, y confundirlas
sería el error:

| Acción | Mecanismo hoy | Quién puede |
|---|---|---|
| (a) Convertirse en `consultores` por primera vez | **Ninguno** — manual, dashboard de Supabase Auth | Solo Luis, siempre, en ambos sistemas |
| (b) Crear una organización nueva y auto-vincularse | `crear_organizacion()`, self-service | Cualquiera que YA sea `consultores` |
| (c) Vincular a un consultor EXISTENTE a una organización EXISTENTE creada por otro | `service_role` directo, sin función | Solo Luis (`001:211-213`) |

La cita que ya habíamos verificado ("Luis es el único que asigna accesos")
es exacta para (a) y (c) — pero **no** para (b): el sistema legacy ya
permite que cualquier consultor autenticado cree una organización cliente
nueva por su cuenta, sin que Luis intervenga en ese paso puntual. El
verdadero cuello de botella, el que de verdad concentra todo en Luis, es
(a) — y ese es idéntico en ambos sistemas, no es algo que "el sistema nuevo
todavía no resolvió": **nunca se resolvió, ni en el legacy.**

Esto reencuadra la pregunta original: el protocolo de registro nuevo no
tiene que decidir "¿quién crea organizaciones?" copiando una política que
ya existe y ya funciona (b) — tiene que decidir si **quiere cambiar** el
status quo de (a), que ha sido manual desde el inicio del proyecto.

---

## 5. Preguntas abiertas — sin resolver por conveniencia

1. **¿(a) sigue siendo 100% manual, o el protocolo nuevo debe abrir un
   camino de auto-registro** (con o sin aprobación) **para nuevos
   consultores?** Sin evidencia en el código o en conversación previa de
   que Luis quiera cambiar esto — lo señalo como decisión de negocio, no
   técnica.
2. **¿La organización creada por el protocolo nuevo debe llenar también la
   ficha técnica legacy** (`n_empleados`/`sector`/`pais`/etc.)**, o son
   dos sistemas que solo comparten `organizaciones.id`/`nombre`?** Depende
   de si una organización puede/debe usar el Tablero viejo y el Workbook
   nuevo a la vez, algo que no vi decidido en ningún lado.
3. **¿Poblar `node_hierarchy` (031) es parte de este protocolo de
   registro, o un flujo aparte** (posiblemente posterior, ya con la
   organización creada)? Lo encontré como una función de escritura que
   falta, pero no estaba en el encargo original de esta ronda.
4. **¿La función nueva reemplaza a `crear_organizacion()` o coexiste con
   ella** (dos funciones separadas escribiendo sobre la misma fila de
   `organizaciones`, cada una alimentando su propio conjunto de tablas)?
5. **`sector` — resuelto, con reapertura documentada** (histórico: decidido
   "no ahora" en la ronda de la pantalla de crear organización; reabierto
   y agregado en `040`, ronda del script de simulación).

   Decisión original (`039`): `sector` fue descartado de
   `motores_eficiencia.crear_organizacion()` junto con el resto de la
   ficha financiera CFF legacy (§2) — a diferencia de esos campos
   (`n_empleados`/`salario_promedio`/`tasa_rotacion_base`/
   `dias_ausencia_base`/`pais`/`costo_operativo_total`/
   `costo_intervencion`/`ebitda`, todos descartados sin ambigüedad),
   `sector` quedó marcado como "probablemente sí se necesite más
   adelante" (uso real previsto en los KPIs de `motor-piio` vía
   `reference_specs`, y en las proyecciones de `motor-ifd`), pero sin
   forma resuelta — la decisión fue esperar a diseñar esa pieza antes de
   capturarlo, para no hacerlo con la forma equivocada.

   **Por qué se reabrió antes de eso**: el script de simulación del
   sistema completo necesita generar organizaciones de prueba que varíen
   por sector *ahora*, para que la prueba sea representativa — esperar a
   `reference_specs` real habría bloqueado esa prueba. Luis decidió
   explícitamente adelantar la captura con la forma más barata posible
   (la lista del legacy, ya existente, cero diseño nuevo) en vez de
   inventar una forma nueva sin evidencia, y documentar el motivo del
   cambio aquí en vez de dejar dos versiones contradictorias en el
   repositorio.

   **Forma agregada** (`040`): campo **opcional** (`nullable`, sin
   `NOT NULL`) en `crear_organizacion(p_nombre, p_sector)`, lista fija de
   los mismos 5 valores del legacy (`007`/`011`:
   `servicios_prof`/`manufactura`/`finanzas_tech`/`retail_logistica`/
   `salud_educacion`) — reusada tal cual, no rediseñada. `organizaciones.
   sector` ya existía como columna desde `005` (legacy); `040` no agrega
   DDL de columna, solo actualiza la función.

   **Sigue siendo provisional, ahora explícito en el propio código**
   (comentario en `040` y en `COMMENT ON FUNCTION`): esta lista y esta
   forma de captura son un punto de partida para desbloquear el script de
   simulación, no la decisión final de `reference_specs`/`motor-ifd` —
   cuando se diseñe esa pieza, `sector` (los 5 valores, o incluso el
   concepto de "lista fija" en sí) puede cambiar por completo. La
   pregunta de "¿qué forma necesita `reference_specs`?" sigue sin
   responderse — solo se adelantó la captura mínima para no bloquear la
   prueba de hoy.

---

## 6. Recomendación de alcance — mínimo viable vs. completo

**Mínimo viable, lo que de verdad desbloquea el Worker sin inventar de
más:**

- Una función nueva, `motores_eficiencia.crear_organizacion(p_nombre
  text) RETURNS uuid` (o el nombre que se prefiera para no chocar con la
  legacy) — mismo patrón exacto que la legacy en sus pasos 1/2/4/6 (exige
  `auth.uid()`, exige `consultores` preexistente, inserta en
  `organizaciones` con solo `nombre`, se auto-vincula en
  `consultor_organizacion` con `rol='consultor'`) — **sin** `p_areas`
  (eje equivocado), **sin** `p_contactos` (ese es `comite_eficiencia`,
  función aparte ya construida), **sin** ninguno de los 9 campos de
  ficha financiera CFF (ningún motor nuevo los usa).
- (a) — convertirse en `consultores` — **queda exactamente como está**:
  manual, Luis, dashboard de Supabase Auth. No hay evidencia de que
  cambiar esto sea parte de lo que se pidió, y es la pregunta abierta #1
  de arriba.
- `node_hierarchy` queda fuera de esta ronda (pregunta abierta #3) — una
  organización recién creada por este protocolo simplemente no tiene
  jerarquía todavía, ningún motor-cff puede correr para ella hasta que se
  resuelva por separado.
- El rol de custodio queda fuera, confirmado en §3.

**Completo (no recomendado para esta ronda, solo para que quede
registrado como alternativa)**: todo lo anterior, más un mecanismo de
auto-registro de consultores (pregunta abierta #1 resuelta a favor del
cambio) y la función de escritura de `node_hierarchy` en la misma entrega —
implicaría abrir dos decisiones de producto que hoy no tienen evidencia de
estar decididas, solo por conveniencia de "hacerlo todo de una vez".

Mi recomendación es el mínimo viable: resuelve exactamente el vacío que la
prueba de esta semana expuso (crear una organización nueva sin recurrir a
`service_role` a mano), sin fabricar una respuesta a las 4 preguntas
abiertas que nadie ha decidido todavía.
