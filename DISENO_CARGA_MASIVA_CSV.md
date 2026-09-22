# Diseño — modo "Cargar CSV" del Paso 2 de `crear_organizacion.html`

**Estado: especificación, cero código todavía.** Cierra
`INVESTIGACION_CARGA_MASIVA_INVITACIONES_CSV.md`. El modo "Una persona"
queda exactamente como está hoy — este documento solo cubre el modo
nuevo.

---

## 1. Selector de modo

Dos botones tipo pestaña al inicio del Paso 2, antes de los campos
actuales:

```
[ Una persona ]  [ Cargar CSV ]
```

Uno activo a la vez (estilo visual: mismo patrón que los botones Likert
ya usados — fondo `--azul` cuando activo, borde `--rule` cuando no).
Cambiar de modo no pierde el `organization_id` en memoria (sigue siendo
el mismo Paso 2, mismo contexto). El sub-panel de "Una persona" (los 2
campos + botón actuales) se oculta/muestra según el modo, sin tocar su
lógica.

---

## 2. Parseo — al seleccionar el archivo

`<input type="file" accept=".csv,.txt">` — confirmado con Luis: solo
extensión de archivo, nada de tipos MIME. `accept` es únicamente una
guía para el selector del sistema operativo (qué archivos mostrar
resaltados); no es la validación real. La protección real sigue siendo
el encabezado exacto (`persona_id,node_id` en la primera línea, §2/§3
estado B) — un archivo `.txt` con el contenido correcto se procesa igual
que un `.csv`, y un `.csv` con el encabezado equivocado se rechaza igual
que cualquier otro archivo. Al disparar `change`, leer
con `FileReader.readAsText(archivo)` y parsear de inmediato (sin esperar
a un botón "Procesar" aparte) — feedback inmediato de qué se cargó.

```js
function parsearCSV(texto) {
  var lineas = texto.split(/\r\n|\n|\r/);
  var header = (lineas[0] || '').split(',').map(function(s){ return s.trim().toLowerCase(); });
  if (header.length !== 2 || header[0] !== 'persona_id' || header[1] !== 'node_id') {
    return { encabezadoValido: false };
  }
  var validas = [];       // {persona_id, node_id, linea}
  var errores = [];       // {linea, contenido, motivo}
  var vistos = {};        // persona_id -> primera línea donde apareció
  for (var i = 1; i < lineas.length; i++) {
    var cruda = lineas[i];
    if (cruda.trim() === '') continue; // fila vacía -- ignorada en silencio
    var partes = cruda.split(',');
    if (partes.length !== 2) {
      errores.push({ linea: i + 1, contenido: cruda, motivo: 'no tiene exactamente 2 columnas' });
      continue;
    }
    var persona_id = partes[0].trim();
    var node_id = partes[1].trim();
    if (!persona_id || !node_id) {
      errores.push({ linea: i + 1, contenido: cruda, motivo: 'persona_id o node_id vacío' });
      continue;
    }
    if (vistos.hasOwnProperty(persona_id)) {
      errores.push({ linea: i + 1, contenido: cruda, motivo: 'persona_id duplicado en este archivo (primera vez en la línea ' + vistos[persona_id] + ')' });
      continue;
    }
    vistos[persona_id] = i + 1;
    validas.push({ persona_id: persona_id, node_id: node_id, linea: i + 1 });
  }
  return { encabezadoValido: true, validas: validas, errores: errores };
}
```

`persona_id`/`node_id` se comparan tal cual (sensible a mayúsculas) --
mismo criterio que la base de datos, sin inventar una normalización que
no existe en ningún otro lugar del sistema.

---

## 3. Estados de la pantalla, en orden

**A — sin archivo todavía.** Solo el `<input type="file">` y un texto de
ayuda: *"Archivo CSV con encabezado `persona_id,node_id`, una fila por
persona."*

**B — encabezado inválido.** Caja de error (mismo `.err-box` ya usado en
el resto de la pantalla): *"La primera línea del archivo debe ser
exactamente `persona_id,node_id`. Revisa el archivo e inténtalo de
nuevo."* Nada más se muestra — no hay lista de filas válidas/inválidas
porque no se llegó a parsear el resto.

**C — encabezado válido, resultado del parseo.**
- Línea de resumen: **"N filas listas para generar."**
- Si `errores.length > 0`: caja separada (no mezclada con las válidas),
  título *"M filas con error — no se incluirán"*, lista con cada una:
  `Línea 23: "juan,," — persona_id o node_id vacío` (contenido crudo en
  fuente monoespaciada, mismo estilo que los enlaces del Paso 3).
- Botón **"Generar N invitaciones"** — deshabilitado si `N === 0`
  (ninguna fila válida).

**D — procesando.** Al hacer clic en el botón de C:
- Se deshabilitan el input de archivo, el selector de modo, y el botón.
- Barra de progreso + texto **"Lote X de Y"** (mismo componente visual
  de `.prog-bar`/`.prog-fill` de `cuestionario_ice_ieh.html`).
- Contador en vivo: **"320 de 1.000 filas guardadas"** (se actualiza al
  cerrar cada lote, éxito o fallo).

**E — terminado.**
- Resumen: **"X de Y invitaciones generadas."**
- Si hubo lotes fallidos, caja de error listando cada uno (ver §4 para el
  contenido exacto).
- Botón **"Descargar CSV de resultados"** — solo si `X > 0` (si los 0
  lotes tuvieron éxito, no hay nada que descargar, solo el reporte de
  error).
- Botón **"Cargar otro archivo"** — vuelve al estado A, limpia todo
  (input, resultados, acumulador), sin perder el `organization_id`.

**Explícitamente fuera de esta ronda**: sin botón de cancelar a mitad de
proceso, sin reintento automático de un lote fallido. Si se necesita
alguno de los dos después, es una ronda aparte — no se construye ahora
por proporcionalidad con lo pedido.

---

## 4. Troceo en lotes de 50 y reporte de fallos

Procesamiento **secuencial**, no paralelo — un lote a la vez, se espera
la respuesta antes de mandar el siguiente. Con esto, "Lote X de Y" es
simplemente el índice del lote en curso, sin coordinación de
concurrencia.

```js
async function generarLotes(orgId, validas) {
  var TAM_LOTE = 50;
  var lotes = [];
  for (var i = 0; i < validas.length; i += TAM_LOTE) lotes.push(validas.slice(i, i + TAM_LOTE));

  var generadas = [];   // {persona_id, node_id, codigo} -- acumulador de éxito, para el CSV de salida
  var lotesFallidos = []; // {indice, filas, error}

  for (var l = 0; l < lotes.length; l++) {
    actualizarProgreso(l + 1, lotes.length, generadas.length, validas.length);
    var lote = lotes[l];
    var asignaciones = lote.map(function (f) { return { persona_id: f.persona_id, node_id: f.node_id }; });
    var res = await supa.schema('motores_eficiencia').rpc('generar_invitaciones_cuestionario', {
      p_organization_id: orgId,
      p_asignaciones: asignaciones
    });
    if (res.error) {
      // Todo el lote revirtió -- confirmado por ejecución real
      // (INVESTIGACION_CARGA_MASIVA_INVITACIONES_CSV.md §1). Ninguna de
      // estas filas se guardó -- se reportan como bloque, no se intenta
      // adivinar cuál causó el choque.
      lotesFallidos.push({ indice: l + 1, filas: lote, error: res.error.message });
    } else {
      generadas = generadas.concat(res.data); // {persona_id, node_id, codigo} x lote.length
    }
  }
  return { generadas: generadas, lotesFallidos: lotesFallidos };
}
```

**Reporte de un lote fallido** (estado E), un bloque por lote:

> **Lote 3 — 50 filas, ninguna se guardó.**
> `persona_id`: `p045, p046, p047, ... p094` (o la lista completa si son
> pocas)
> Error: `duplicate key value violates unique constraint
> "invitaciones_cuestionario_pkey"`
> *Revisa si alguno de estos identificadores ya tiene una invitación en
> esta organización, corrígelo, y vuelve a subir solo esas filas en un
> archivo nuevo.*

Se reportan los `persona_id` del lote (no el rango de líneas del CSV
original) porque es lo que el consultor puede buscar directamente en su
archivo — el número de línea del CSV ya no es contiguo dentro de un lote
una vez que se excluyeron las filas con error en el parseo.

---

## 5. CSV de salida

Construido directo del acumulador `generadas` — sin ninguna llamada
adicional, son las mismas filas que ya devolvió
`generar_invitaciones_cuestionario()` en cada lote exitoso (`034:36`,
`TABLE (persona_id, node_id, codigo)`).

```js
function construirCSVSalida(generadas) {
  var lineas = ['persona_id,node_id,codigo'];
  generadas.forEach(function (f) {
    lineas.push([f.persona_id, f.node_id, f.codigo].join(','));
  });
  return lineas.join('\n');
}

function descargarCSV(contenido, nombreArchivo) {
  var blob = new Blob([contenido], { type: 'text/csv;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}
```

Nombre de archivo sugerido: `invitaciones_<nombre_org_saneado>.csv`.

---

## Resumen de lo que falta construir (para la próxima ronda, ya con esto aprobado)

- El selector de modo y el sub-panel "Cargar CSV" dentro de
  `crear_organizacion.html`, con los 5 estados de §3.
- Las 3 funciones de §2/§4/§5 (`parsearCSV`, `generarLotes`,
  `construirCSVSalida`/`descargarCSV`).
- Verificación: `pglite` ya cubrió el comportamiento transaccional real
  (§1 de la investigación) — falta la verificación en vivo con clics
  reales contra Supabase, con un CSV de prueba real que incluya
  deliberadamente filas mal formadas, un duplicado interno, y (si es
  practicable) un lote que falle contra una invitación ya existente,
  para confirmar el reporte de §4 tal cual se ve, no solo que compile.
