# Pruebas manuales -- envío de invitaciones por correo

CSV de prueba para `crear_organizacion.html` (pestaña "Cargar CSV"),
formato `persona_id,node_id,email` (`DISENO_CARGA_MASIVA_CSV.md §2`),
plan ajustado de la prueba integral de `enviar-invitaciones-cuestionario`
(`DISENO_ENVIO_INVITACIONES_BREVO.md`, `PENDIENTES_BRECHAS_WORKER_MOTORES.md
§19`). Correos con alias `+` sobre `coach.luiscaicedo@gmail.com` -- todos
llegan a la misma bandeja real, separables por el alias.

| Archivo | Filas | `persona_id` | Subrequests al enviar | Qué confirma |
|---|---|---|---|---|
| `prueba_peq.csv` | 3 | `test-peq-001`..`003` | 6 | Camino feliz, sin riesgo de límite |
| `prueba_med.csv` | 20 | `test-med-001`..`020` | 40 | Comportamiento normal, por debajo de 50 subrequests |
| `prueba_limite.csv` | 30 | `test-lim-001`..`030` | 60 | Por encima de 50 -- punto de corte: ¿falla limpio en `fallidos[]` o se cae confuso? |

Uso: una organización de prueba nueva por archivo, en `crear_organizacion.html`
-> "Cargar CSV" -> subir el archivo -> "Generar N invitaciones" -> "Enviar
invitaciones por correo".

**Son datos de prueba desechables**, no fixtures del código -- limpiar
igual que cualquier organización de prueba (identificadores inequívocos
`test-peq-*`/`test-med-*`/`test-lim-*`, mismo criterio de limpieza que
`PROCEDIMIENTO_USUARIO_PRUEBA_DESECHABLE.md`).
