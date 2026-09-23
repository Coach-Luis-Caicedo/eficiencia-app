# Investigación — dónde vive `posiciones.<POS>` en FPV

**Estado: investigación, con recomendación. Cero DDL todavía.** Cierra
la pregunta arquitectónica que bloqueaba diseñar
`PENDIENTES_BRECHAS_WORKER_MOTORES.md` §1 (la que motivó investigar CFF
primero): ¿dónde vive `N_elegibles`/`diseno`/`ponderacion.metodologia`
— estático por organización/posición, declarado una vez, o por período?

---

## 1. Forma exacta del contrato — verificado, `motor-fpv/contratos.js` +
`motor-fpv/runFPV.js`

`contratos.js:113-121` (`ESQUEMA_DISENO`/`ESQUEMA_POSICION_META`):

```js
var ESQUEMA_DISENO = [
  { name: 'probabilistico', required: true, check: ... boolean },
  { name: 'modelo_documentado', required: true, check: ... boolean }
];
var ESQUEMA_POSICION_META = [
  { name: 'N_elegibles', required: false, check: ... entero > 0 },
  { name: 'diseno', required: false, check: ... validarObjeto(ESQUEMA_DISENO, v) }
];
```

**`ponderacion` NO está en `contratos.js`** — es un hallazgo real: el
validador de Fase 0 (`validarFPVInput`) no lo valida en absoluto, pero
`runFPV.js:71` (comentario del propio JSDoc del orquestador) y
`runFPV.js:98,107` (código real, no comentario) sí lo leen y lo usan:

```js
// runFPV.js:65-74, JSDoc de la firma real
* input = {
*   respuestas: [...],
*   posiciones?: {
*     <POSICION>: {
*       N_elegibles?: number,
*       diseno?: { probabilistico, modelo_documentado },
*       ponderacion?: { metodologia: string }
*     }
*   }
* }
```

```js
// runFPV.js:98,107 — código real
var pond = (m.ponderacion && typeof m.ponderacion === 'object') ? m.ponderacion : null;
...
var pob = pond
  ? ponderacion.poblacionalSensorPonderado(perfiles, sen, { metodologia: pond.metodologia })
  : poblacional.poblacionalSensor(perfiles, sen);
```

Confirmado también con `runFPV.test.js:96,111` (fixtures reales de test
que sí declaran `posiciones.CONSUMIDOR.ponderacion.metodologia`). Los 3
campos (`N_elegibles`, `diseno`, `ponderacion`) viven bajo la misma
clave `posiciones.<POS>` — el hueco de `contratos.js` (no valida
`ponderacion`) es un defecto del validador del motor, no algo a
corregir aquí (fuera de alcance — no se toca `motor-fpv`, solo se
persiste lo que el motor ya acepta).

---

## 2. La pregunta — resuelta con evidencia, no con conveniencia

**`fpv_respuestas` (`032:155-176`) ya tiene `period` en su PK** —
`organization_id, persona_id, posicion, period` — con esta nota, cita
exacta de la propia migración:

> *"persona_id único DENTRO de su posición... extendido con `period`
> porque el motor no tiene concepto de período propio (runFPV no lo
> recibe, DISEÑO §3) — es la extensión de la capa de persistencia para
> poder reconstruir un batch válido por período."*

Esto ya resuelve la pregunta por precedente directo: el motor mismo NO
tiene noción de período (confirmado — ni `ESQUEMA_RESPUESTA_PERSONA` ni
`ESQUEMA_POSICION_META` tienen un campo de período), pero la **capa de
persistencia** ya decidió, para `fpv_respuestas`, que cada llamada a
`runFPV` corresponde a una ronda de recolección de un período
específico — el Worker ya lee por período
(`leer_respuestas_fpv(p_organization_id, p_period)`,
`src/worker.js:78-83: calcularFpvHandler`, confirmado: `const {
organization_id, period } = await leerParams(request)`).

**`N_elegibles`/`diseno` son conceptualmente del mismo tipo de dato que
`period`**: describen la ronda de recolección de ESE período — cuántas
personas eran elegibles en ese momento (el universo puede crecer/
achicarse entre rondas), y si esa ronda en particular fue censal o
muestral (un año se puede encuestar a todos, el siguiente solo a una
muestra). No hay ninguna razón textual ni de código para que sean
"para siempre" mientras las respuestas sí son por período — tratarlos
como estáticos sería inconsistente con el propio precedente que
`fpv_respuestas` ya sentó.

**`ponderacion.metodologia`** — mismo razonamiaento: una organización
puede adoptar una metodología de ponderación nueva en una ronda
posterior sin que eso deba alterar cómo se calcularon las rondas
anteriores (append/reemplazo por período, no un valor único
"para siempre").

**Conclusión, con evidencia, no supuesta**: los 3 campos de
`posiciones.<POS>` deben persistirse con la misma llave que ya
gobierna `fpv_respuestas` menos `persona_id`: `(organization_id,
posicion, period)`. Se declaran (o redeclaran) por el consultor una vez
por ronda de recolección — no una vez para siempre, no por respuesta
individual.

---

## 3. Forma de columnas — jsonb vs. tipado, con recomendación

`diseno` tiene exactamente 2 sub-campos, ambos booleanos, ambos
obligatorios-si-`diseno`-está-presente (`ESQUEMA_DISENO`, `contratos.js:
113-116`) — sin variantes condicionales (a diferencia de
`independence_basis` en `evidence_groups` de PIIO, que sí tiene una
forma variante por `kind`). Recomiendo **aplanar** a 2 columnas
`diseno_probabilistico boolean`/`diseno_modelo_documentado boolean`,
ambas nulas juntas o no-nulas juntas (`CHECK` de coherencia) — más
simple de consultar/validar que un `jsonb` para una forma fija de 2
booleanos.

`ponderacion.metodologia` es un único string de vocabulario abierto
(sin enum, igual que `resolution_method` en `cff_relaciones`) —
recomiendo aplanar a `ponderacion_metodologia text`, nula si no se
declara ponderación.

`N_elegibles` ya es un escalar (`entero > 0`) — columna directa,
`n_elegibles integer`, `CHECK (n_elegibles IS NULL OR n_elegibles > 0)`.

Los 3 (grupo `diseno`, `ponderacion_metodologia`, `n_elegibles`) son
**independientes entre sí** (`ESQUEMA_POSICION_META` los declara cada
uno `required: false` por separado) — ninguno obliga a los otros dos.

---

## 4. Precedente de escritura a copiar

Mismo patrón que `registrar_evento_cff`/`registrar_relaciones_cff`:
`SECURITY DEFINER`, autenticación + `consultor_organizacion`, upsert
por la PK completa (una redeclaración de la misma `(organization_id,
posicion, period)` reemplaza los valores, no crea una segunda fila —
mismo criterio que la actualización de `resolution_status` en
`cff_relaciones`). No hace falta lote — es, a lo sumo, 3 filas por
período (una por posición), un volumen muy por debajo del umbral que
justificó lote en `observations`/`registrar_evento_cff`.

---

## 5. Qué cambia en `src/motores/fpv.js` / `src/worker.js`

- Nueva función SQL `leer_config_posiciones_fpv(p_organization_id,
  p_period)` — plana, `RETURNS SETOF <tabla>`, filtrada por
  `organization_id` + `period` exacto (no rango — a diferencia de CFF,
  aquí no hay concepto de vigencia amplia; cada período tiene su propia
  fila o ninguna).
- `calcularFpv(filas, configPosiciones)` gana un segundo parámetro —
  transforma las filas planas de `configPosiciones` (una por posición)
  de vuelta a la forma anidada `{ <POSICION>: { N_elegibles?, diseno?,
  ponderacion? } }` que `runFPV` exige (mismo tipo de "armar de vuelta
  la forma anidada que el motor pide", igual que `leer_eventos_cff` ya
  hace el join evento→componentes en SQL, aquí el join inverso —
  fila plana a objeto anidado — se hace en JS, más simple con solo 3
  posibles filas).
- `calcularFpvHandler` gana la llamada RPC nueva, mismo `period` que ya
  usa para `leer_respuestas_fpv`.

---

## Recomendación

1. Tabla nueva `motores_eficiencia.fpv_config_posicion` — PK
   `(organization_id, posicion, period)`, columnas aplanadas
   (`n_elegibles`, `diseno_probabilistico`, `diseno_modelo_documentado`,
   `ponderacion_metodologia`), todas nulas independientemente, 1 `CHECK`
   de coherencia (`diseno_probabilistico`/`diseno_modelo_documentado`
   nulas juntas o no-nulas juntas).
2. `registrar_config_posicion_fpv` — upsert, mismo patrón de
   autenticación que el resto.
3. `leer_config_posiciones_fpv` — plana, filtro exacto por período.
4. Extender `calcularFpv`/`calcularFpvHandler` para ensamblar
   `posiciones` real en vez de omitirlo.

¿Apruebas esta recomendación (el período como llave, y aplanar en vez
de `jsonb`) antes de que diseñe el DDL completo?
