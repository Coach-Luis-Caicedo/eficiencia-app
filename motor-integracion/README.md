# Arnés de integración — `motor-ice-ieh` → `motor-iao`

Primer arnés de integración **real** entre dos módulos de EFICIENCIA. Hasta
ahora cada uno se probó aislado, con datos sintéticos en el punto de entrada
del otro (`motor-iao` siempre recibió `{EST:.., FOR:..}` tecleado a mano;
`motor-iao.js` nunca fue importado por nada). Este arnés conecta la salida
real de `motor-ice-ieh.calcular()` con la entrada real de `motor-iao.calcular()`
— es la relación **"con otros instrumentos"** de la regla de las tres
relaciones (consigo mismo / con otros instrumentos / con evidencia externa).

Rama `feat/motor-integracion`, desde `main`. NO modifica ninguno de los dos
motores — `vendor/` contiene copias **byte-idénticas** a sus ramas fuente
(confirmado con `diff` antes de escribir una sola línea de arnés), traídas
así porque ninguna de las dos ramas está mergeada a `main` todavía y no se
podían importar directamente sin crear una dependencia de rama a rama.

## Pipeline

```
31 respuestas (P1-P31) → motor-ice-ieh.calcular() → 10 variables (0-100)
    → [adaptador de claves] → motor-iao.calcular() → IAO, perfil, brechas
```

`pipeline.js` expone `ejecutarPipeline(respuestas)` → `{ iceIeh, variablesParaIao, iao }`.

## Hallazgo #1 — los nombres de clave NO coinciden (real, resuelto con un adaptador)

`motor-ice-ieh.calcular().variables` usa las 10 claves **completas en
español** (`estructura`, `fortaleza`, `coherencia`...). `motor-iao` exige las
claves **cortas** (`EST`, `FOR`, `COH`...). El propio comentario de
`motor-iao.js` (línea 94) dice *"Mismos códigos que ICE–IEH: es un contrato
COMPARTIDO, no una colisión"* — pero el objeto que `motor-ice-ieh` realmente
expone no usa esos códigos como clave de nivel superior; los códigos cortos
solo viven en `prefijo`, metadata **por pregunta** (`PREGUNTAS[i].prefijo`),
no en el objeto `variables` agregado que consumiría otro módulo.

**Por qué ningún test aislado lo detectó:** `motor-iao` siempre se probó con
sintéticos ya en formato `EST/INE/...`; `motor-ice-ieh` nunca necesitó
producir esa forma para sus propias pruebas. El "contrato compartido" del
comentario era una intención de diseño correcta en el nivel conceptual (las
10 variables son las mismas), pero no una realidad mecánica al nivel de las
claves de un objeto JS — hacía falta un adaptador que nadie había escrito ni
probado hasta este arnés.

**Resuelto**, no fabricado a mano: `construirMapaVariableAPrefijo()` deriva
el mapeo `{estructura: 'EST', ...}` directamente de `MotorICEIEH.PREGUNTAS`
(cada pregunta ya declara su `variable` y su `prefijo`) — si `motor-ice-ieh`
cambiara un nombre de variable, el mapeo lo sigue automáticamente en vez de
quedar desincronizado en silencio. Lo mismo para el mapeo de pares
(`estructura_fortaleza → EF`, derivado cruzando `MotorICEIEH.PARES` con
`MotorIAO.PARES`).

**Recomendación, no aplicada aquí** (toca los motores, fuera del alcance de
este arnés): corregir el comentario de `motor-iao.js` línea 94 para que diga
"mismas 10 variables, no las mismas claves de objeto" — el comentario actual
es engañoso si alguien lo lee esperando poder conectar los dos módulos sin
adaptador.

## Hallazgo #2 — drift de punto flotante real en el caso neutro (medido, dentro de tolerancia)

El caso neutro (31 respuestas = 3) da `IAO = 49.999999999999986` end-to-end,
no `50` exacto. Diferencia medida: `1.42e-14` — cinco órdenes de magnitud por
debajo de la tolerancia `1e-9` que **ambos módulos ya usan en sus propias
baterías** (`motor-iao.test.js` usa `near(..., 1e-9, ...)` en varios casos).
No es un defecto: es aritmética IEEE-754 real (suma de pesos decimales como
`.18`, `.20`, `.12` que no son exactamente representables en binario),
visible aquí porque el arnés usa la salida real de `motor-ice-ieh` en vez de
un literal `50` tecleado a mano, que habría sido exacto por construcción.
Todos los asserts de este arnés usan `near(..., 1e-9)`, no `===`, por esta
razón exacta.

## Punto 4 — duplicación de brechas: CONFIRMADO coincidencia exacta, no una duda abierta

Se comparó, bit a bit (`===`, no tolerancia), la brecha de `motor-ice-ieh`
(§8.6) contra la recomputada de forma independiente en `motor-iao` (mismo
par, misma resta `Sistema − Experiencia`) en **5 casos reales** (neutro,
inversos, IMP-4, todos-1, todos-5) — más de los 3 pedidos. **Los 25 pares
comparados (5 casos × 5 pares) coinciden exactos, sin una sola excepción.**
Tabla completa impresa por `pipeline.test.js` al correr.

Con esto, que `motor-iao` siga recomputando la brecha en vez de recibirla de
`motor-ice-ieh` queda confirmado como **decisión consciente de redundancia
tolerada** (autocontención de cada módulo — ninguno importa al otro) — no una
duda abierta. La razón de que coincidan exacto y no solo "cerca" es
estructural: ambas son la misma resta de punto flotante (`a − b`) sobre los
mismos dos números de entrada, sin pasos intermedios que puedan introducir
un redondeo distinto entre las dos implementaciones.

## Punto 5 — validación de frontera en `motor-iao`: YA EXISTE, no hace falta agregarla

`motor-iao.validarVariables()` **ya rechaza** explícitamente: valores fuera
de `[0,100]` (probado con `100.0001` y `-0.0001`), `NaN`, y variables
faltantes — confirmado con 5 casos fabricados a propósito. No es una regla
nueva que faltara construir.

**Además**, se confirmó por qué el pipeline real nunca puede disparar esa
validación en absoluto (no solo "no lo hizo en los casos que probé"): cada
ítem normalizado de `motor-ice-ieh` es `25 × (entero 1-5 − 1) ∈ {0,25,50,75,100}`
exacto, y el promedio de valores dentro de `[0,100]` no puede salir de ese
rango ni ser `NaN` (cada variable tiene siempre ≥ 2 ítems fijos según
`PREGUNTAS`, nunca 0 ítems). Confirmado empíricamente, no solo argumentado:
**20 000 conjuntos de 31 respuestas aleatorias** (enteros 1-5) a través del
pipeline completo → **0 rechazos**. La validación de `motor-iao` es una
buena defensa (correcta, ya probada), pero defiende contra un input que la
integración real con `motor-ice-ieh` no puede producir — sería relevante si
algún día otro origen de datos (import manual, otra fuente) alimentara
`motor-iao` directamente sin pasar por `motor-ice-ieh`.

## Casos end-to-end verificados

| Caso | Qué confirma |
|---|---|
| Neutro (todas=3) | Las 10 variables en 50, ICE=IEH=50, IAO≈50 (drift medido), las 5 brechas en 0 — la cadena completa reproduce lo que cada mitad ya daba por separado. |
| Inversos (COH-3=1, EQU-3=5) | La recodificación de ítems inversos (§8.4 de ICE–IEH) llega correcta a `motor-iao` sin que este módulo sepa nada de inversión de ítems — esa lógica es responsabilidad exclusiva de `motor-ice-ieh`, confirmado por firma de datos, no solo por diseño. |
| IMP-4 (P18=5) | El 4º ítem de Impacto (una "ampliación", no un sensor nuevo) entra al promedio de `impacto` y se propaga correctamente a `D_IMP` y al perfil `A_IE`. |
| Extremos (todos=1, todos=5) | Las 10 variables permanecen dentro de `[0,100]` en los casos más adversos posibles; el IAO end-to-end también. |

## Qué NO se hizo (por instrucción explícita)

- No se modificó `motor-ice-ieh.js` ni `motor-iao.js` — los hallazgos se
  reportan, la corrección (si se decide) es un paso aparte.
- No se implementó SDMO, PIIO, CFF, FPV ni AIE en este arnés.
- No se hizo merge de ninguna rama a `main`.

## Verificación

`node motor-integracion/pipeline.test.js` → **100 asserts OK, 0 fallos**.
`node --check` limpio en `pipeline.js` y `pipeline.test.js`.
