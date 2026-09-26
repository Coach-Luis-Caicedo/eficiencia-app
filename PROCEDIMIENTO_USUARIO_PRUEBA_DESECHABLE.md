# Procedimiento — usuario de prueba desechable (verificación en vivo)

Documento de referencia, no de hallazgos. Recoge los pasos exactos que se
repitieron varias veces durante la verificación en vivo del Worker y de
las pantallas del workbook nuevo (`motores_eficiencia`), para no
reconstruir el razonamiento cada vez.

## Cuándo se necesita

Cualquier verificación que requiera un JWT real de consultor contra
Supabase de producción — probar un endpoint del Worker, una función
`SECURITY DEFINER` de `motores_eficiencia`, o una pantalla nueva del
workbook con clics reales en el navegador.

## Pasos

**1. Crear el usuario — Supabase Auth**

Dashboard → Authentication → Users → Add user (email + contraseña).
También se puede crear vía `POST /auth/v1/signup` con la `anon key` desde
`curl` (sin pasar por el dashboard) — funciona igual, pero el usuario
queda **sin confirmar** de cualquiera de las dos formas.

**2. Confirmar el email — SQL, no el dashboard**

```sql
UPDATE auth.users
SET email_confirmed_at = now()
WHERE id = '<uuid del usuario>';
```

**No hay un botón directo en el dashboard para esto** — confirmado dos
veces en esta sesión (buscamos un botón de "confirmar email" y no
existe; el `UPDATE` es el único camino). Sin este paso,
`grant_type=password` devuelve `400 email_not_confirmed` sin importar que
la contraseña sea correcta.

**3. Vincular como consultor — según qué se quiera probar**

- **Caso normal** (el usuario debe poder operar como consultor):
  ```sql
  INSERT INTO consultores (id, nombre)
  VALUES ('<uuid>', 'Consultor de prueba (desechable)')
  ON CONFLICT (id) DO NOTHING;
  ```
  `consultor_organizacion` **no** hace falta insertarlo a mano si ya existe
  `motores_eficiencia.crear_organizacion()` (`039`) — esa función
  autovincula al consultor con la organización que crea.

- **Caso "autenticado pero no consultor"** (para probar ese estado a
  propósito, como en `crear_organizacion.html`): saltar este paso por
  completo. El login funciona igual (Supabase Auth no consulta
  `consultores`); solo las funciones de `motores_eficiencia` lo rechazan,
  cada una con su propio mensaje.

**4. Obtener el JWT**

```bash
curl -X POST "https://<proyecto>.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: <anon key>" \
  -H "Content-Type: application/json" \
  -d '{"email":"...", "password":"..."}'
```

`access_token` del cuerpo de la respuesta — se manda como
`Authorization: Bearer <token>` en cada llamada real (`curl` o
`supa.auth.signInWithPassword(...)` desde el navegador).

**5. Limpieza al terminar**

Orden inverso, de lo más dependiente a lo menos:

```sql
-- Cualquier fila de datos creada durante la prueba (respuestas,
-- invitaciones, organizaciones) -- las FK con ON DELETE CASCADE
-- (organizaciones -> consultor_organizacion/invitaciones_cuestionario,
-- 001/033) suelen limpiar la mayoría de esto solas al borrar la
-- organización de prueba.
DELETE FROM organizaciones WHERE id = '<uuid de la org de prueba>';

-- El vínculo, si no quedó cubierto por la cascada de arriba
DELETE FROM consultor_organizacion WHERE consultor_id = '<uuid>';

-- La fila de consultores
DELETE FROM consultores WHERE id = '<uuid>';
```

Y por último, borrar el usuario del dashboard (Authentication → Users →
el usuario → Delete user) — esto también se puede pedir a CC para que
arme las sentencias exactas de limpieza de datos, pero el `DELETE` de
`auth.users` y las sentencias contra tablas reales las corre Luis
siempre — CC no tiene conexión directa a la base de datos.

## Por qué CC no lo hace de punta a punta, por defecto

**Actualizado 2026-09-23**: desde que se empezó a usar el Supabase CLI
para aplicar migraciones (`AUDITORIA_SUPABASE_MOTORES.md` §6), CC **sí
tiene** una vía de conexión directa a Postgres (`supabase db query
--linked`, autenticado con la sesión del CLI) — la limitación de
`service_role` ya no es técnica, es de **autorización**. El límite real,
confirmado por Luis: CC no toca `auth.users`/`consultores`/
`consultor_organizacion` directo por iniciativa propia — necesita
autorización explícita, caso por caso, **salvo** cuando la acción es
mantenimiento de una pieza de acceso ya decidida (ejemplo real: revincular
al consultor de simulación persistente cuando pierde su fila en
`consultores`, ver nota abajo — no es una decisión de acceso nueva, es
reparar la misma). Los pasos 1-3 de este procedimiento (crear usuario en
Auth, confirmar email, vincular como consultor) siguen siendo, por
defecto, cosas que Luis corre él mismo — no porque CC no pueda
técnicamente, sino porque cada usuario/vínculo nuevo es una decisión de
acceso que Luis prefiere aprobar antes de que exista, no después. CC sí
hace todo lo demás por su cuenta: login, llamadas RPC reales, clics
reales en el navegador, y ahora también consultas/`INSERT` puntuales
autorizados explícitamente.

## Nota — el consultor de simulación persistente puede perder su vínculo sin aviso

El consultor de simulación persistente (`simulacion@eficiencia.internal`,
`b8da8181-d685-4a3d-9b36-f748ba654956`, creado para
`scripts/simular_organizaciones.mjs` — no es un usuario desechable, no se
borra al terminar una corrida) **puede quedar sin su fila en
`consultores`** sin que quede registrado por qué (encontrado 2026-09-23,
al correr la prueba mínima de `FPV`/`CFF`/`IFD` contra producción real:
el login funcionaba, `auth.users` tenía la cuenta confirmada, pero
`crear_organizacion()` rechazaba con "no autorizado — el usuario
autenticado no está registrado como consultor"). Causa no determinada
(¿limpieza accidental de datos de prueba que alcanzó esta fila por error,
una reversión, algo más? — no hay evidencia de cuál). **Diagnóstico
rápido**: si el login del consultor de simulación funciona pero cualquier
función de `motores_eficiencia` lo rechaza como "no consultor",
verificar primero `SELECT * FROM consultores WHERE id =
'b8da8181-d685-4a3d-9b36-f748ba654956'` — si viene vacío, es esto.
**Arreglo** (mantenimiento de una pieza de acceso ya decidida, no una
autorización nueva cada vez — confirmado por Luis):

```sql
INSERT INTO consultores (id, nombre)
VALUES ('b8da8181-d685-4a3d-9b36-f748ba654956', 'Consultor de simulación (EFICIENCIA)')
ON CONFLICT (id) DO NOTHING;
```
