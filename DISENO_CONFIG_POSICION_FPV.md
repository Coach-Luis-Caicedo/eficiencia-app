# Diseño — migración `043`, configuración por posición de FPV

**Estado: diseño + DDL construido, para verificación.** Cierra
`PENDIENTES_BRECHAS_WORKER_MOTORES.md` §1, sobre la base de
`INVESTIGACION_POSICIONES_FPV.md` (aprobada sin reservas: llave por
período, columnas aplanadas). Con esto se cierran las 3 brechas
Worker↔motor encontradas en la ronda de simulación.

---

## 0. Tabla `motores_eficiencia.fpv_config_posicion`

Aplanada (no `jsonb`) — `diseno` y `ponderacion` son formas fijas sin
variantes condicionales (`ESQUEMA_DISENO`, `contratos.js:113-116`).
Llave `(organization_id, posicion, period)` — mismo precedente que
`fpv_respuestas` (`032`) ya sentó para el mismo motor.

```sql
CREATE TABLE motores_eficiencia.fpv_config_posicion (
  organization_id            uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  posicion                    text NOT NULL CHECK (posicion IN ('CONSUMIDOR','INVERSIONISTA','PROVEEDOR')),
  period                       text NOT NULL,
  n_elegibles                   integer CHECK (n_elegibles IS NULL OR n_elegibles > 0),
  diseno_probabilistico          boolean,
  diseno_modelo_documentado       boolean,
  ponderacion_metodologia          text,
  creado_en                        timestamptz NOT NULL DEFAULT now(),
  actualizado_en                    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, posicion, period),
  CHECK ((diseno_probabilistico IS NULL) = (diseno_modelo_documentado IS NULL))
);
REVOKE ALL ON motores_eficiencia.fpv_config_posicion FROM PUBLIC;
```

## 1. `registrar_config_posicion_fpv` — upsert, fila única

`p_config` jsonb plano, mismas claves que las columnas de la tabla
(`posicion`, `period`, `n_elegibles?`, `diseno_probabilistico?`,
`diseno_modelo_documentado?`, `ponderacion_metodologia?`) —
`jsonb_populate_record` + defaults (`creado_en`/`actualizado_en`),
`ON CONFLICT (organization_id, posicion, period) DO UPDATE`.

## 2. `leer_config_posiciones_fpv` — plana, período exacto

`SELECT * FROM fpv_config_posicion WHERE organization_id = ... AND
period = ...` — sin rango/solapamiento (a diferencia de
`leer_relaciones_cff`), porque aquí cada período es una ronda
independiente, no una vigencia declarada.

## 3. Cambios en código

**`src/motores/fpv.js`** — nueva función `ensamblarPosiciones(filas)`
que reconstruye la forma anidada `{ <POS>: { N_elegibles?, diseno?,
ponderacion? } }` desde las filas planas; `calcularFpv` gana un segundo
parámetro `configPosiciones` y ya no manda solo `{ respuestas }`.

**`src/worker.js`** — `calcularFpvHandler` gana la llamada RPC nueva,
mismo `period` que ya usa para `leer_respuestas_fpv`.

## 4. Verificación planeada

`pglite` bajo `SET ROLE authenticated` real: upsert (misma llave,
segunda llamada actualiza), el `CHECK` de coherencia
`diseno_probabilistico`/`diseno_modelo_documentado`, lectura filtrada
por período exacto (una fila de otro período NO debe aparecer),
privilegios, autenticación/autorización. Más la suite completa de
`worker.test.mjs` (mock de la RPC nueva, para no repetir la regresión
ya encontrada en la ronda de CFF).
