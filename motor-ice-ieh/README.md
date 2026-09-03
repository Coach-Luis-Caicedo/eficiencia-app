# Motor de cálculo — Instrumento ICE–IEH v2 (31 preguntas)

Módulo **aislado**. No toca el motor de 25 preguntas que hoy calcula el
cuestionario en `workbook.html`. No se integra a producción hasta aprobación
explícita tras revisar esta verificación.

- **Fuente de verdad:** [`../DOCUMENTO_TECNICO_ICE_IEH_v2.md`](../DOCUMENTO_TECNICO_ICE_IEH_v2.md)
  (secciones 2.3, 2.4, 3.7, 4.7, 5.8, 6.7, 7.8, 8.2–8.7).
- **NO** usa `CUESTIONARIO_25_PREGUNTAS_EFICIENCIA.md` ni el acróstico plano viejo.

## Archivos

| Archivo | Qué es |
|---|---|
| `motor-ice-ieh.js` | Motor puro (sin DOM). UMD: `require()` en Node / `window.MotorICEIEH` en browser. |
| `motor-ice-ieh.test.js` | Batería de verificación. `node motor-ice-ieh/motor-ice-ieh.test.js` |

## Uso

```js
const M = require('./motor-ice-ieh/motor-ice-ieh.js');

const r = M.calcular({ P1: 4, P2: 3, /* … */ P31: 5 });   // o un array de 31
r.ice;        // 0–100
r.ieh;        // 0–100
r.variables;  // { estructura, fortaleza, intencion, coherencia, impacto,
              //   equilibrio, nexo, confianza, integracion, actitud }  — 0–100
r.brechas;    // { estructura_fortaleza, intencion_coherencia, impacto_equilibrio,
              //   nexo_confianza, integracion_actitud }  — ICE − IEH
r.senales;    // { correspondencia: {crudo, valor∈[−1,+1]},  veracidad: {crudo, valor∈[0,100]} }
r.detalle;    // por pregunta: crudo, recodificado, normalizado, valor, entraPromedio, …
r.meta;       // itemsPorVariable, variablesICE/IEH, excluidasDePromedio

// Capa de presentación (redondeo — nunca sobre intermedios):
M.formatearParaPresentacion(r);      // copia con ice/ieh/variables/brechas/senales a 1 decimal
M.formatearParaPresentacion(r, 2);   // a 2 decimales
M.redondear(58.3333, 1);             // 58.3  (primitivo escalar)
```

Entrada: array de 31 (índice 0 = P1) **o** objeto `{P1..P31}` **o** `{1..31}`.
Cada respuesta debe ser entero 1–5; cualquier otra cosa lanza `Error` con el
detalle de las preguntas problemáticas.

## Reglas implementadas (todas cerradas en v2, ninguna depende del piloto)

### Normalización por tipo de ítem (§8.4)

| Tipo | Ítems | Fórmula | Rango |
|---|---|---|---|
| Normal | 26 ítems de sensor | `s = 25 × (x − 1)` | [0, 100] |
| Inversa | `COH-3` (P13), `EQU-3` (P21) | recodifica `x' = 6 − x` **antes de agregar**, luego `25 × (x' − 1)` = `25 × (5 − x)` | [0, 100] |
| Ampliación | `IMP-4` (P18) | igual que normal | [0, 100] |
| Bipolar independiente | `IND-EF` (P7) | `d = (x − 3) / 2` | [−1, +1] |
| Síntesis independiente | `IND-IC` (P14) | `s = 25 × (x − 1)` | [0, 100] |

### Agregación (§8.3, §8.5)

Una pregunta entra al promedio de su variable **si y solo si observa esa
variable** (aunque amplíe su alcance); se excluye si observa la relación entre
las dos variables del par.

```
Estructura  = prom(EST-1, EST-2, EST-3)                 Fortaleza  = prom(FOR-1..3)
Intención   = prom(INE-1, INE-2, INE-3)                 Coherencia = prom(COH-1, COH-2, COH-3ʳ)
Impacto     = prom(IMP-1, IMP-2, IMP-3, IMP-4)  ← 4     Equilibrio = prom(EQU-1, EQU-2, EQU-3ʳ)
Nexo        = prom(NEX-1, NEX-2, NEX-3)                 Confianza  = prom(CNF-1..3)
Integración = prom(ITG-1, ITG-2)               ← 2      Actitud    = prom(ACT-1, ACT-2)  ← 2
```

- `IMP-4` (P18, "Vida") **entra** al promedio de Impacto → Impacto tiene 4 ítems.
- `IND-EF` (P7) e `IND-IC` (P14) **no entran** a ningún promedio; se reportan
  como señales independientes.
- Bloque V: 2 ítems por variable, no 3. Arquitectura confirmada (§7.3, §7.9), no
  un vacío. El motor no fabrica un tercer ítem ni un tercer sensor.

### ICE, IEH, brechas (§8.6)

```
ICE = prom(Estructura, Intención, Impacto, Nexo, Integración)
IEH = prom(Fortaleza, Coherencia, Equilibrio, Confianza, Actitud)
Brecha_par = variable_ICE − variable_IEH        (positivo = el sistema puntúa por encima de la experiencia)
```

Cada variable pesa **igual** en su índice, sin importar cuántos ítems tenga
(promedio no ponderado de 5 scores de variable).

## Verificación

`node motor-ice-ieh/motor-ice-ieh.test.js` → **154 asserts OK, 0 fallos**.

| Caso | Qué prueba |
|---|---|
| 1 | Todas las respuestas = 3 → cada variable = 50, ICE = IEH = 50, todas las brechas = 0. |
| 2 | `COH-3` / `EQU-3` con valores asimétricos: recodificación **antes** de agregar (descarta el bug "sin recodificar" y el bug "recodificar después de agregar"). |
| 3 | `IMP-4`: Impacto = promedio de 4 ítems; el resultado cambia con P18 (75 → 56.25); control de que sin IMP-4 ambos serían 75. |
| 4 | `IND-EF` / `IND-IC` en extremos opuestos no mueven Estructura/Fortaleza/Intención/Coherencia ni ICE/IEH; se reportan aparte con su fórmula. |
| 5 | 31 preguntas, numeración global P1–P31 contigua, 7/7/7/6/4 por bloque, 10 prefijos sin colisión, clasificación 26+2+1+1+1. |
| 6 | Caso mixto con aritmética verificada a mano (ICE = 65, IEH = 45, brechas 50/25/0/−50/75). |
| 7 | Entradas inválidas (null, longitud ≠ 31, fuera de rango, no entero, faltantes) lanzan `Error`; array y objeto son equivalentes. |
| 8 | `redondear()` / `formatearParaPresentacion()`: redondean solo la salida final a 1 decimal, no mutan el original, y `calcular()` conserva precisión completa (Estructura = 200/3, ICE desde variables sin redondear). |

## Notas de implementación (ambigüedades resueltas y decisiones cerradas)

Las cinco cuestiones que surgieron al traducir el documento a código quedaron
**resueltas** (revisión de Luis, 2026-09-03). Ninguna depende de datos del piloto.

### 1. Semántica del signo de `IND-EF` (P7) — **RESUELTO**

El documento se contradecía entre la fórmula `d = (x − 3) / 2` + las anclas de
escala del §3.6 (respuesta `5` = "problemas de organización pero me siento
seguro" → `d = +1`, describe **Fortaleza/IEH por encima de Estructura**) y la
nota de signo del §8.4 ("positivo = domina ICE").

**Resolución:** se mantienen la fórmula literal y las anclas de escala; se
corrige **la nota del §8.4** en el documento técnico. Convención vigente:

```
d > 0  →  predomina Fortaleza (IEH)
d < 0  →  predomina Estructura (ICE)
d = 0  →  sin predominancia
```

El motor aplica `d = (x − 3) / 2` y **no fija la etiqueta "domina X"** — devuelve
solo el valor numérico. La etiqueta se aplica en la **capa de presentación** con
esta convención corregida. No afecta ICE, IEH ni ninguna brecha (`IND-EF` es
señal independiente, §8.7). No hubo cambio de lógica en el motor.

### 2. Redondeo / precisión — **DECISIÓN CERRADA (decisión de ingeniería, no del piloto)**

- Calcular y almacenar **siempre con precisión completa** (`float`).
- **Nunca** redondear un valor intermedio antes de agregarlo. El Caso 2 de la
  batería es la razón exacta: recodificar/normalizar y luego promediar da un
  resultado distinto a promediar y luego "arreglar". Redondear antes de agregar
  introduce el mismo tipo de error.
- Redondear **solo en la capa de presentación, a 1 decimal**.

**Estado en el motor:** `calcular()` cumple — devuelve flotantes sin redondear
(p. ej. `56.25`, o `200/3` cuando el divisor es 3). El módulo expone la **única
definición canónica de redondeo** para que ningún consumidor la reinvente:

- `redondear(valor, decimales = 1)` — primitivo escalar.
- `formatearParaPresentacion(resultado, decimales = 1)` — copia redondeada de la
  vista resumida (`ice`, `ieh`, `variables`, `brechas`, `senales`), sin mutar el
  original.

Ambas operan solo sobre la salida final; `calcular()` nunca redondea nada
internamente. Verificado en el Caso 8.

### 3. Respuestas incompletas — **DECISIÓN CERRADA (mismo principio epistemológico que el SDMO)**

"No respuesta ≠ deterioro; nunca se imputa." Aplicado aquí: el motor **exige las
31 respuestas y lanza `Error` si falta alguna**. No se calcula con imputación ni
con promedio parcial de la variable — eso contaminaría la medición. El
comportamiento actual del motor es el definitivo, no algo a redefinir en el corte.

### 4. Peso de variables con distinto número de ítems dentro de ICE/IEH — **CONFIRMADO intencional**

`IMP` aporta 4 ítems, `ITG`/`ACT` aportan 2, el resto 3 — pero en §8.6 las cinco
variables de cada plano pesan **igual** en el promedio de ICE/IEH. Asimetría
aceptada por diseño (§8.5). Una variable de 2 ítems mueve ICE/IEH lo mismo que
una de 4. El motor lo implementa así, a propósito.

### 5. Ubicación del documento fuente — **sin cambio por ahora**

`DOCUMENTO_TECNICO_ICE_IEH_v2.md` está en la **raíz** del repo, no en `docs/`
(que no existe). Se deja en la raíz por ahora; `git mv` a `docs/` en un commit
aparte más adelante, sin prisa.

## Qué NO hace este módulo (fuera de alcance, §10.2)

- No calcula dispersión ni precisión (fórmulas pendientes de piloto).
- No aplica ponderación poblacional (método pendiente de piloto).
- No aplica umbrales verde/ámbar/rojo ni severidad (pendientes de piloto).
- No aplica pesos diferenciales entre sensores (pendientes de piloto).
- No implementa SDMO, IAO ni el AIE.
- No toca `workbook.html` ni ningún código de producción.
