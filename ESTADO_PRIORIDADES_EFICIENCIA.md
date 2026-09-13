# Estado y prioridades del proyecto EFICIENCIA

Fecha de esta versión: 2026-09-12. Reemplaza, como artefacto escrito, el
inventario completo que se entregó verbalmente en una sesión anterior (nunca
se había guardado como archivo — esta es la primera vez que existe como tal).
Se actualiza cuando cambie el estado real de alguna pieza, no en cada sesión.

## Motores (estado real, verificado con ejecución, no de memoria)

| Motor | Estado | Rama | Merged a main | Push a origin |
|---|---|---|---|---|
| motor-ice-ieh | Completo, 154 asserts | feat/motor-ice-ieh | Sí (2026-09-05) | No |
| motor-sdmo | Completo, 120 asserts | feat/motor-sdmo | Sí (2026-09-05) | No |
| motor-iao | Completo, 146 asserts | feat/motor-iao | Sí (2026-09-05) | No |
| motor-cff | Completo, 569 asserts, gate 10/10 | feat/motor-cff (o main tras merge) | Sí (2026-09-05) | No |
| motor-ifd | Completo, 576 asserts | feat/motor-ifd | Sí (2026-09-06, `5c8483b`) | No |
| motor-fpv | Completo, 330 asserts | feat/motor-fpv | Sí (2026-09-07, `365348c`) | No |
| motor-piio | Completo, 861 asserts, gate §35 10/10 | feat/motor-piio | **No** | No |
| motor-aie | No existe como motor de producción — solo `aie_validation_kit/` (Python de prueba de estrés) | — | No aplica | No aplica |

`main` local está ~60 commits adelante de `origin` (ningún push hecho desde
que arrancó este ciclo de motores). `motor-piio` es el único de los 7
instrumentos completos que todavía no se mergeó a `main`.

## motor-aie — cambio de estado explícito

**Antes:** tratado como "prioridad 1, bloqueante" para el resto del trabajo
de validación.

**Ahora: en espera, no bloqueante.** La decisión arquitectónica 2F vs. 3F
(`DOCUMENTO_TECNICO_AIE_v1.md` §12) depende de datos reales del piloto, no
de más trabajo de ingeniería disponible hoy — ya se agotó lo que la prueba
de estrés sintética puede aportar. Ningún otro motor, ninguna integración,
ni el push/merge a `origin`, depende de que esto se resuelva. Ver
[`CHECKLIST_ACTIVACION_PILOTO_AIE.md`](CHECKLIST_ACTIVACION_PILOTO_AIE.md)
para el criterio verificable de cuándo esto deja de estar en espera.

## Lo que sí puede avanzar ya, sin depender de AIE

1. ~~**motor-cff/README.md** — 3ª inconsistencia de conteo (tabla de fases
   marcaba 4b/5 como "Pendiente" estando ambas completas desde hace semanas)~~
   — **corregido en esta sesión** (tabla de fases ahora dice ✅ en las 6 filas).
2. **Push/merge a `origin`** de los 7 motores completos (`motor-piio`
   incluido, si Luis decide mergearlo a `main` primero) — trabajo de
   integración de repositorio, cero dependencia de la decisión AIE.
   **No ejecutado todavía** — sigue siendo una decisión de timing de Luis,
   no una tarea que se dispare sola por quedar "primera en la lista".
3. Arnés de integración real de `motor-ifd`/`motor-piio` + calibración del
   piloto — pendiente de que exista un piloto con datos, igual que AIE, pero
   no depende de la pregunta 2F/3F específicamente.

## Lo que sigue genuinamente bloqueado / en espera

- La decisión 2F vs. 3F (AIE) — pendiente de datos del piloto, criterio de
  activación en `CHECKLIST_ACTIVACION_PILOTO_AIE.md`.
- Migración de `areas_organizacion` a FK real (`area_id`) — documentada como
  pendiente, no se implementa sin pedirlo explícitamente.
- Cálculo automático de costo laboral por país — pendiente del campo país en
  Supabase.
