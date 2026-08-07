Vamos a auditar el motor de cálculo del Workbook contra el documento marco
completo, reconstruido en su totalidad en la sesión de hoy. Este prompt
reemplaza al `PROMPT_CC_AUDITORIA_MOTOR_CALCULO.md` original — ese partía de
un marco parcial (antes de la reconstrucción del acróstico, el IAO, el CFO,
etc.) y ya no aplica tal cual.

## Fuente de verdad — leer completo antes de tocar código

Los 4 documentos están en `docs/` dentro de este mismo repo
(`eficiencia-app/docs/`):

1. `docs/DOCUMENTO_MARCO_SISTEMA_EFICIENCIA.md` — el documento completo, 10
   secciones. Es la fuente de verdad para cualquier conflicto con el código
   actual del Workbook (confirmado explícitamente en la sección 10 del
   propio documento).
2. `docs/CUESTIONARIO_25_PREGUNTAS_EFICIENCIA.md` — las 25 preguntas reales.
3. `docs/SD_MO_4_PREGUNTAS_EFICIENCIA.md` — las 4 preguntas del sensor diario,
   versión bipolar final (reemplaza cualquier versión anterior en el código).
4. `docs/CATALOGO_INTERVENCION_EFICIENCIA.md` — las 10 fichas de intervención.

Si alguno de estos archivos no aparece en `docs/`, avísame antes de seguir
— puede que falte moverlo ahí todavía.

## Alcance del trabajo de hoy — es una auditoría de brecha, no de precisión matemática todavía

A diferencia del prompt original (que pedía verificar precisión numérica
fórmula por fórmula), hoy el objetivo es más básico y más urgente: **¿qué
tan lejos está el código actual del Workbook de esta arquitectura nueva?**
El modelo completo cambió de raíz (nuevo acróstico, IAO reconstruido, IIE
eliminado, CFO con 6 componentes, cuestionario de 25 preguntas nuevo,
SD-MO rediseñado) — antes de auditar precisión, hay que saber qué sobrevive
del código actual y qué no.

## 1. Inventario de brecha — código actual vs. marco nuevo

Para cada pieza del marco, confirma en el código actual del Workbook
(`workbook.html`, `cuestionario.html`, `sdmo.html`, `index.html`):

- **Dimensiones IEHS/ICE viejas** (Justicia Percibida, Valoración,
  Relevancia, Integración, Inteligencia Colectiva) — ¿siguen en el código?
  Deben eliminarse, reemplazadas por los 5 pares del acróstico (marco,
  sección 1, Capa 3).
- **IIE** — ¿sigue calculándose en algún lado (workbook.html, o el
  `calcImpacto`/`gIIE`/`hIIO` de `index.html` en eficiencia-site)? Debe
  eliminarse por completo (marco, sección 3) — no solo dejar de mostrarse,
  eliminarse del cálculo.
- **`EFI_API_URL` y el bug de sintaxis** — ya se corrigió en una fase
  anterior (verificar que sigue corregido, no debería haber regresión).
- **Preguntas del cuestionario** — el código actual (`cuestionario.html`)
  tiene la estructura vieja (v3 o alguna variante posterior). Reemplazar
  íntegramente por las 25 preguntas de `CUESTIONARIO_25_PREGUNTAS_EFICIENCIA.md`.
- **Preguntas del SD-MO** — mismo caso, reemplazar por
  `SD_MO_4_PREGUNTAS_EFICIENCIA.md` (versión bipolar).
- **IFT / `DE-EFICIENCIA — Proyección de Impacto Financiero`** — el código
  actual depende de `ΔIIE`. Confirma si sigue ahí, y si el bug de `CR`
  indefinida y `A` sin usar (ya documentados en el marco, sección 7.2)
  siguen presentes tal cual.
- **"<24 meses estimados de recuperación"** en `index.html` (hero de
  eficiencia-site) — confirma dónde exactamente aparece ese texto en el
  código, para que Luis decida si lo actualiza o lo deja mientras se valida
  (marco, sección 7.2 — pendiente de decisión de comunicación, no de
  código).

**No implementes nada todavía en este paso — solo el inventario.** Tráeme
la lista de qué existe, qué está obsoleto, y qué falta por completo.

## 2. Después del inventario — plan de reemplazo, no de parche

Una vez tengamos el inventario, el trabajo real probablemente sea más
parecido a un reemplazo estructurado que a arreglar fórmulas una por una —
dado que el acróstico, el IAO, el CFO y ambos cuestionarios cambiaron de
raíz. No asumas que se puede editar el código línea por línea sobre la
base actual; puede que sea más limpio reconstruir los módulos de cálculo
desde cero contra el marco, reutilizando solo la UI/estructura del HTML que
siga siendo válida.

Muéstrame el inventario primero. Con eso decidimos juntos si el siguiente
paso es edición incremental o reconstrucción de los módulos de cálculo.

## 3. Recordatorio de las reglas de trabajo ya establecidas

- CC nunca ejecuta SQL directo contra producción.
- Diffs se muestran y se aprueban antes de aplicarse.
- `node --check` en cualquier bloque `<script>` tocado, antes de dar por
  cerrado cualquier cambio (por el bug de sintaxis que ya encontramos una
  vez).
- Todos los parámetros marcados "sin validar" o "pendiente de piloto" en el
  marco (α, γ, w_neg, δ, umbral_piso, w_sup, λ, F_ext, umbrales de
  severidad, umbral rojo del IDA) deben quedar como **constantes
  fácilmente editables** en el código, no hardcodeadas sin comentario — se
  van a ajustar más adelante con datos reales, y tienen que ser fáciles de
  encontrar y cambiar cuando llegue ese momento.
