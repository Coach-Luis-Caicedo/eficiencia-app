# Investigación — carga masiva de invitaciones por CSV

**Estado: investigación. Cero pantalla todavía.** Confirma las 4
preguntas con evidencia real antes de diseñar — mismo estándar que
`INVESTIGACION_PANTALLA_CREAR_ORGANIZACION.md`.

---

## 1. Comportamiento real de `generar_invitaciones_cuestionario()` con un lote — verificado por ejecución, no por lectura

**Confirmado con `pglite` contra el archivo real de `034`, no inferido
del código:** la llamada es **todo o nada**. Preparé una invitación
previa con `persona_id='p_existente'`, y mandé un lote de 5 asignaciones
donde la posición 3 repetía ese `persona_id` — las otras 4 eran nuevas.
Resultado real:

```
ERROR: duplicate key value violates unique constraint "invitaciones_cuestionario_pkey"
```

y, al consultar después, **las 4 asignaciones nuevas (posiciones 1, 2, 4,
5) NO quedaron guardadas** — cero filas nuevas, no 4 de 5.

**Por qué**: `generar_invitaciones_cuestionario()` (`034:55-59`) hace
**un solo `INSERT ... SELECT FROM jsonb_array_elements(...)`** — una
única sentencia SQL, no un bucle con un `INSERT` por fila. Una sola
sentencia SQL en Postgres es atómica: si cualquier fila del `VALUES`
implícito viola una restricción, la sentencia completa revierte. No hay
manera de que la función guarde "las que puede" — necesitaría reescribirse
con un bucle + manejo de excepción por fila para lograr eso, y no está
escrita así hoy.

**Implicación real para el diseño, no menor**: con un lote de 1.000
filas, una sola colisión en la fila 847 (contra una invitación ya
existente, o contra otra fila del mismo CSV) hace que **ninguna de las
1.000 se guarde**. Esto descarta mandar el CSV completo en una sola
llamada como estrategia razonable — hace falta trocear el lote en
llamadas más pequeñas, para que una colisión aislada no eche abajo todo
el archivo. Detalle en §5.

---

## 2. Forma del CSV

**Sin librería externa — confirmado que no hace falta.** Dos columnas
(`persona_id`, `node_id`), valores que son identificadores simples (no
texto libre con comas ni saltos de línea esperados) — un `split(',')`
por línea alcanza, mismo criterio que ya aplicamos con el Worker (evitar
peso muerto). Decisiones concretas, sin precedente real que copiar —
busqué `csv`/`CSV` en `workbook.html` y no hay ningún parser existente
en el legacy, esto se diseña de cero:

- **Delimitador**: coma. Es el estándar de facto para un CSV de 2
  columnas de identificadores simples — no hay razón para otro.
- **Con encabezado, obligatorio**: la primera línea debe ser
  `persona_id,node_id` (comparación insensible a mayúsculas/espacios) —
  si no coincide, se rechaza el archivo completo con un mensaje claro
  ("La primera línea debe ser persona_id,node_id") en vez de adivinar el
  orden de las columnas. Un encabezado explícito es más seguro que
  inferir posición, y le da al consultor una forma de auto-verificar que
  exportó el archivo correcto antes de subirlo.
- **Filas vacías**: se ignoran en silencio (una línea en blanco al final
  del archivo es casi universal en exports de Excel/Sheets).
- **Filas mal formadas** (no exactamente 2 columnas después de partir
  por coma, o `persona_id`/`node_id` vacíos tras `trim()`): **no se
  descartan en silencio** — se listan aparte, con su número de línea,
  para que el consultor las corrija o decida ignorarlas conscientemente.
  No entran al lote que se manda a la función.
- **Duplicados dentro del mismo archivo**: se detectan client-side antes
  de mandar nada — dos filas con el mismo `persona_id` en el mismo CSV
  chocarían igual que un duplicado contra la base (mismo mecanismo de
  §1, un solo `INSERT` con dos filas de la misma llave), así que
  conviene atraparlo antes, sin gastar una llamada de red para
  descubrirlo.

---

## 3. Qué ve el consultor al terminar

**La recomendación de Luis es correcta, y coincide exactamente con la
forma real que ya devuelve la función — no hace falta transformar nada.**
`generar_invitaciones_cuestionario()` devuelve
`TABLE (persona_id text, node_id text, codigo text)` (`034:36`) — ya es,
fila por fila, exactamente las columnas de un CSV de salida
(`persona_id,node_id,codigo`). Un CSV de descarga con esas 3 columnas es
el formato natural, generado directo de la respuesta de la función, sin
ninguna transformación adicional. El consultor lo abre en Excel/Sheets y
arma sus propios mensajes de WhatsApp/email por fuera del sistema — igual
de manual que ya está confirmado para la distribución de un solo enlace.

Mostrar las 1.000 filas en pantalla, como bien dice el encargo, no sirve
de nada — ni siquiera es necesario mostrar una tabla de éxito en la
pantalla misma; el CSV de descarga es el resultado, y un resumen corto
("847 invitaciones generadas, ver el archivo descargado") es suficiente
feedback visual.

---

## 4. Límite razonable por carga

**No encontré una restricción real documentada de este proyecto de
Supabase específico que confirmar** — no tengo forma de leer la
configuración de `statement_timeout`/límite de tamaño de payload del
gateway sin acceso directo, y no es algo que valga la pena adivinar. Lo
que sí es cierto, y ya resuelve la pregunta en la práctica: **el hallazgo
de §1 ya obliga a trocear el lote en llamadas pequeñas por razones de
aislamiento de errores**, sin importar cuál sea el límite real de
payload/tiempo — un lote pequeño (recomendado: **50 filas por
llamada**, número redondo, ajustable) es simultáneamente la mitigación
correcta para "una colisión no debe tumbar 1.000 filas" y para
cualquier límite de tamaño/tiempo que exista pero no se haya medido. No
hace falta conocer el número exacto del límite real para tomar una
decisión de diseño segura — trocear ya es la respuesta correcta por la
otra razón.

Si en algún momento se quiere confirmar el límite real (tamaño de
payload de PostgREST/Kong, `statement_timeout` de este proyecto), se
puede probar empíricamente con un lote sintético grande contra Supabase
real — no until esta ronda, no es necesario para diseñar con el troceo ya
decidido.

---

## 5. Alcance de la pantalla — recomendación, con la razón

**Recomiendo: extensión del Paso 2 de `crear_organizacion.html`, con un
selector de modo ("Una persona" / "Cargar CSV"), no una pantalla nueva.**

Razones:
- El contexto (`organization_id` ya creado, consultor ya autenticado) es
  idéntico — una pantalla nueva tendría que resolver el mismo login y el
  mismo "¿para qué organización?" que Paso 1/2 ya resuelven, duplicando
  lógica sin necesidad.
- El flujo lineal de 3 pasos que ya aprobaste se mantiene intacto —
  "Una persona" sigue siendo el camino simple para el caso común (invitar
  a 1-2 personas), y "Cargar CSV" es una rama del mismo paso para el caso
  de volumen, no un producto aparte.
- Paso 3 sí necesita una variante según el modo usado: para "una persona"
  sigue mostrando los 2 enlaces (como hoy); para "Cargar CSV" muestra el
  resumen corto + el botón de descarga del CSV de salida (§3), no 1.000
  pares de enlaces en pantalla.

La complejidad real (parseo, validación por fila, troceo en lotes,
progreso, CSV de salida) vive en dentro del modo "Cargar CSV" del Paso 2
— no se derrama al resto de la pantalla ni afecta al camino de "Una
persona", que queda exactamente como está hoy.

---

## Resumen para la ronda de diseño

- Troceo en lotes de ~50 por llamada — obligatorio por §1, no opcional.
- Parser propio sin librería — coma, encabezado obligatorio, filas mal
  formadas separadas y visibles, duplicados internos detectados antes de
  mandar nada.
- Salida: CSV de descarga (`persona_id,node_id,codigo`), no una tabla en
  pantalla.
- Mismo Paso 2, con selector de modo — no una pantalla nueva.
