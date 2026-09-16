# Roadmap — minimización y resguardo (camino B)

| | |
|--|--|
| **Producto** | Cuaderno de dictados de un docente (primaria y secundaria, PBA y/o CABA) |
| **Qué cubre** | Datos de alumnos alineados a Ley 25.326 (calidad, finalidad, seguridad, caducidad). No es el Word de “cero alumnos”. |
| **Fuente de verdad** | [`database.sql`](../database.sql) |
| **Mapa de dominio** | [`domain-map.md`](./domain-map.md) |
| **Roadmap funcional** | [`roadmap.md`](./roadmap.md) (pasos 0–10, ya hechos) |
| **Fecha** | 2026-09-16 |
| **Schema al cerrar** | v1.3 |

Sigue la convención del [roadmap funcional](./roadmap.md): cada paso es usable (pantalla + comandos Rust + persistencia). **No se salta el orden.** El cifrado va último: primero se achica qué hay en el archivo.

**Camino B (cerrado):** el docente sigue teniendo nómina, notas y asistencia. Se deja de guardar identificadores y contactos de menores que el dictado no necesita. Todo queda en el equipo. No hay nube, IA ni envío a la escuela. Observaciones siguen siendo del alumno en *ese* dictado, con aviso de no anotar salud ni intimidad familiar. Al cerrar un año se puede borrar lo operativo. El archivo no vive en claro.

**Fuera (a propósito):** consentimiento parental en la app, alias en vez de nombre, portal de habeas data para familias, inscripción AAIP automatizada, sync/nube, IA sobre textos de alumnos, login multi-usuario.

Esto no es asesoramiento legal. Es el recorte de producto que hace defendible el cuaderno digital.

---

## Convención extra de esta tira

- Ampliar `database.sql` **antes** de migrar DBs existentes. Schema **v1.3**.
- DBs v1.2: Rust migra sin borrar dictados, notas ni asistencia. Solo se tiran columnas de alumno que B deja de usar.
- Homónimos: sin DNI, dos “García, Juan” pueden coexistir. El `id` interno identifica; no inventar unique de nombre.
- `escuelas.telefono` / `escuelas.email` **se quedan**: son del colegio, no de menores.
- IPC y UI: mismas reglas que el roadmap funcional (Zod ↔ serde, snake_case, toast / Swal).
- Cualquier envío de datos de alumnos a red o a un modelo **reabre** este documento.

---

## Orden

| Paso | Qué se gana | Depende de |
|------|-------------|------------|
| **11** Minimizar ficha de alumno **(hecho)** | Deja de pedirse y persistirse DNI, email, teléfono, fecha de nacimiento | Schema v1.2 |
| **12** Aviso de alcance **(hecho)** | El docente ve para qué es el cuaderno y qué no anotar | 11 |
| **13** Baja y caducidad **(hecho)** | Borrar persona del todo; limpiar un año lectivo inactivo | 11 |
| **14** Candado y cifrado | Nadie abre el archivo sin clave; el `.sqlite` no queda en claro | 11–13 (cifrar *después* de achicar el contenido) |

Listo cuando: un docente carga “García, Lucía” **sin DNI**, pasa lista y carga notas; al primer uso leyó que es su cuaderno y no se comparte; puede borrar a Lucía o limpiar 2025; al reabrir pide clave.

---

## Paso 11 — Ficha mínima del alumno **(hecho)**

**Para qué.** Art. 4 de la 25.326: datos adecuados, pertinentes y **no excesivos**. Para dictar alcanzan apellido y nombre. DNI, email, teléfono y fecha de nacimiento son identificadores de más (el teléfono suele ser de un adulto).

**Schema (`database.sql` → v1.3)**

`alumnos` queda:

```text
id, nombre, apellido
```

Se sacan `dni`, `email`, `telefono`, `fecha_nacimiento`. El unique de `dni` desaparece. Índice `ix_alumnos_apellido_nombre` se queda.

**Migración (DBs v1.2 ya abiertas)**

En `db.rs`, junto a `migrate_niveles_y_ciclos`:

1. Si `alumnos` todavía tiene `dni` (o las otras), reconstruir la tabla **conservando `id`**.
2. Usar el mismo `SchemaRebuildGuard` (FK off + `legacy_alter_table`) que la v1.1 → v1.2.
3. No copiar los cuatro campos. Quedan tirados; no hay pantalla de “exportar DNI antes”.
4. DBs nuevas: `database.sql` v1.3 tal cual, sin esas columnas.

**Contrato IPC**

- `Alumno` / `AlumnoWrite` en `domain.rs` y `api.ts`: solo `id`, `nombre`, `apellido`.
- Tests de `alumnos.rs` (`dni_unique`, blanks de DNI/email): reescribir o borrar.
- `map_sql_error`: sacar el mensaje de `alumnos.dni`.

**Pantallas**

- `/alumnos`: formulario y tabla sin DNI / email / teléfono / fecha. Alta = apellido + nombre (+ curso del año activo, como ahora).
- Ficha del curso: alta rápida igual de corta.
- Homónimos: dos filas con el mismo nombre son válidas; el listado ya las distingue por `id` e inscripciones.

**Listo cuando** no hay input ni columna de DNI, una DB v1.2 abre y los alumnos siguen con el mismo `id` (notas y asistencia no se huérfanan), y `cargo test` en `alumnos` pasa.

---

## Paso 12 — Aviso de alcance (primer uso y textos libres) **(hecho)**

**Para qué.** Transparencia de finalidad (art. 4.3, 6 y 11) y Ley 26.061 art. 22: no difundir datos de NNyA. No es consentimiento parental. Es que el docente sepa qué es este archivo.

**No va en `database.sql`.** El aviso tiene que poder mostrarse **antes** de pelear con la DB (el paso 14 pide clave al abrir). Guardar en `{app_data_dir}/privacidad.json` (o equivalente), no en SQLite ni en `localStorage` del webview.

**Primer uso**

Al arrancar, si el archivo de aviso no existe:

- Título corto: esto es el **cuaderno privado del docente**, no la planilla oficial, el boletín ni el SIEE.
- Qué se guarda: nombre y apellido de *sus* alumnos, notas, asistencia y observaciones de *ese* dictado. Todo en este equipo.
- Qué **no** se hace: no se envía a la escuela, al ministerio, a internet ni a un modelo de IA.
- Qué **no** anotar: diagnósticos, certificados, DNI, domicilio, relatos de familia.
- Cómo borrar: persona o año lectivo (paso 13).
- Botón único: “Entendido”. Recién ahí entra al shell.

No hay checkbox de marketing ni “acepto términos” eterno. Releer: enlace discreto (p. ej. pie de Inicio o menú) que reabre el mismo texto.

**Textos libres (sin cambiar el catálogo)**

Se **mantienen** los tipos `academica`, `conducta`, `seguimiento`, `reunion_familia`. El maestro de grado los usa. Cambia la copia:

- `/observaciones` y paneles en ficha/alumno: una línea permanente — anotar solo lo pedagógico de **ese** dictado; no salud, no DNI, no lo que se habló en la reunión más allá de que ocurrió.
- Tipo “Reunión con familia”: placeholder del estilo “Se reunió el YYYY-MM-DD” / “Pendiente de reprogramar”.
- `/notas`, campo `comentario`: el mismo límite (no es el lugar del certificado médico). “Justificado” en asistencia sigue siendo **solo el estado**.

**Listo cuando** la primera corrida muestra el aviso, un “Entendido” no lo vuelve a pedirle, observaciones y comentarios de nota muestran el límite, y no se creó tabla nueva.

---

## Paso 13 — Baja total y caducidad de año **(hecho)**

**Para qué.** No conservar de más (art. 4) y poder cumplir un pedido de supresión sin un módulo legal.

**Baja de persona (casi está)**

`DELETE FROM alumnos` ya cascada a `alumnos_cursos`, `notas`, `observaciones`, `asistencias`. Completar:

- El Swal tiene que listar **qué se borra** (inscripciones, notas, asistencia, observaciones de todos los años).
- Si la persona está en más de un dictado del año activo, el texto lo dice. No hay “borrar solo de este curso” disfrazado de baja de persona (eso sigue siendo desinscribir).
- Confirmación peligrosa como ahora (`danger: true`).

**Limpiar año lectivo inactivo (nuevo)**

Comando Tauri, p. ej. `limpiar_anio_lectivo(id_anio_lectivo)`, **solo si `activo = 0`**.

Borra, de los cursos de ese año:

- `notas` (vía evaluaciones de esos cursos)
- `asistencias`
- `observaciones`
- `evaluaciones` (cascada de notas ya hecha)
- `eventos` de esos cursos (y los sueltos de esa fecha **no**: no hay `id_anio` en `eventos` sueltos — no inventar; o no tocar eventos con `id_curso` NULL)

**No borra:** `alumnos`, `escuelas`, `materias`, el año lectivo en sí, ni los `cursos` (el dictado “3° B English 2025” puede quedar vacío). Horarios de ese año: se pueden borrar con los cursos o dejarlos; preferible **borrar `horarios` de esos cursos** (no son datos de menores, pero cierran el año). Desinscribir de esos cursos (`alumnos_cursos` de esos `id_curso`).

UI: junto al control de año lectivo (cabecera) o en Escuelas/año — acción sobre un año **que no está activo**, Swal de doble lectura (“se borran notas, asistencia y observaciones de 2025; las personas siguen si están en 2026”).

**Listo cuando** borrar a un alumno deja cero filas suyas en notas/asistencia/observaciones; limpiar 2025 (inactivo) vacía lo operativo de ese año y no toca el año activo.

---

## Paso 14 — Candado y cifrado

**Para qué.** Art. 9: el `.sqlite` en el perfil de Windows no puede leerse copiando el archivo. El candado no es login ni multi-usuario: es **una clave del docente** que abre *su* cuaderno.

**Comportamiento**

1. Instalación nueva o DB v1.3 sin cifrar: después del aviso (paso 12), **obligar a crear una clave** (dos campos, mínimo razonable). Se cifra el archivo. No hay “ahora no, después”.
2. Arranques siguientes: pantalla de clave **antes** de cargar el shell. Tres fallos: no adivinar; el archivo sigue cifrado.
3. Clave olvidada: no hay recuperación. Texto claro al crearla: “si la olvidás, no se puede abrir este cuaderno”. (Un reset sería borrar la DB: no lo ofrecemos en UI en este paso.)
4. Backup: **no** en este paso. Si más adelante hay export, tiene que salir cifrado o ser una copia que sigue pidiendo la misma clave. Nada de CSV de alumnos por mail.

**Técnica (objetivo)**

- Cifrar el archivo SQLite (SQLCipher o el binding que `rusqlite` permita **bundled** en Windows).
- La clave no se loguea ni se manda al frontend más que el input de desbloqueo.
- WAL + FK se mantienen **después** de abrir con la clave.
- Migración de DBs v1.3 en claro: una sola pasada (crear DB cifrada, copiar, reemplazar). Si falla, no dejar dos archivos divergentes.

**Riesgo de este paso:** SQLCipher en Windows (OpenSSL vendored, `rusqlite` features). Si el bundle no cierra en un tiempo acotado, **fallback documentado en el mismo PR**: candado de arranque + cifrado del archivo con DPAPI/AES y clave derivada (Argon2), abriendo SQLite solo en memoria o sobre un archivo temporal que no sobreviva al cierre. El fallback no es “dejar el sqlite en claro con un PIN de mentira”.

**Listo cuando** `adm-cursos.sqlite` no se lee con un visor SQLite sin clave; un arranque pide la clave; una DB anterior en claro se cifra una vez y después ya no existe la copia abierta.

---

## Qué no entra en 11–14

| Tentación | Por qué no |
|-----------|------------|
| Consentimiento de padres en un formulario | Suma datos de la familia; el cuaderno se apoya en la relación de dictado (art. 5.2.d / función docente), no en un click |
| Alias / nro. de lista en vez de nombre | En el aula no sirve; el alias sigue siendo dato personal si el docente reidentifica |
| Sacar tipos Conducta / Reunión con familia | El maestro de grado los usa; el paso 12 acota el *contenido*, no el catálogo |
| Cifrar antes de minimizar | El archivo cifrado seguiría teniendo DNI; se achica primero |
| Telemetría, crash report con nombres, IA | Reabre cesión y (si el modelo es afuera) transferencia |

---

## Docs a tocar cuando se implemente

Cada paso actualiza lo que le corresponde; no hace falta un mega-PR de documentación al inicio.

| Archivo | Cuándo |
|---------|--------|
| `database.sql` (cabecera v1.3 + `alumnos`) | 11 |
| `docs/domain-map.md` (ficha alumno; fuera: DNI/contacto) | 11 |
| `AGENTS.md` / `Agents.md` (schema v1.3, sin DNI) | 11 |
| `docs/roadmap.md` (tildar 11–14 cuando existan) | al cerrar cada paso |
| Este archivo | al cerrar cada paso (marcar **hecho**) |

---

## Criterio de cierre de B

- Persona = nombre + apellido. Cero DNI/contacto/nacimiento en schema, IPC y UI.
- Aviso de primer uso y límite en observaciones / comentario de nota.
- Baja de persona en cascada, visible; limpieza de año inactivo.
- Archivo local cifrado; sin red para datos de alumnos.
- Tests de `alumnos` y de migración v1.2 → v1.3. Verificación Tauri: alta sin DNI, aviso, borrar persona, limpiar año, reabrir con clave.
