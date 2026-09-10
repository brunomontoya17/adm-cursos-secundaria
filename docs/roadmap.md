# Roadmap — Adm Cursos Secundaria

| | |
|--|--|
| **Producto** | Cuaderno de dictados de un docente (primaria y secundaria, PBA y/o CABA) |
| **Fuente de verdad** | [`database.sql`](../database.sql) |
| **Mapa de dominio** | [`domain-map.md`](./domain-map.md) |
| **Fecha** | 2026-09-09 |

Cada paso es una **funcionalidad usable** (pantalla + comandos Rust + persistencia). No se salta el orden: lo de abajo cuelga de `cursos` y `alumnos_cursos`.

Fuera de este roadmap (a propósito): login, multi-profesor, matrícula institucional, boletines, SIEE, adjuntos.

---

## Convención de cada paso

- Ampliar `database.sql` **solo** si falta una columna o invariante; si no, no tocar el esquema.
- IPC: tipos Zod en `src/api.ts` ↔ serde en `src-tauri/src/domain.rs` (mismos nombres que el SQL). Argumentos de comando Tauri en **snake_case** (`#[tauri::command(rename_all = "snake_case")]`); Tauri 2 camelCasea por defecto.
- Listados con `@tanstack/react-table`. Fechas con Temporal. Notas/ponderaciones con `decimal.js`.
- Éxito: toast (esquina inferior derecha). Error de BD: Swal, sin rebote.
- Filtro implícito: año lectivo **activo**, salvo que la pantalla permita cambiarlo.

---

## Ya está (pasos 0–3)

- **0 Shell.** Tauri 1280×720, paleta y logo, menú izquierdo, HashRouter, SQLite con `PRAGMA foreign_keys=ON`, `db_status`, contrato Zod/serde. Schema **v1.2**: catálogo `niveles`, ciclos por nivel (grado ≠ año), migración desde DBs v1.1.
- **1 Escuelas, materias y año lectivo.** `/escuelas` (CRUD escuelas + panel materias). Año activo en cabecera: ver, crear el siguiente, activar uno solo.
- **2 Cursos.** `/cursos` listado del año activo (filtro por nivel), alta con nivel → ciclo, etiqueta sugerida, edición y baja. Ficha `/cursos/:id` con resumen.
- **3 Alumnos.** `/alumnos` persona + inscripción a dictados del año activo. Nómina en la ficha del curso (alta rápida o existente). Horario/fechas en la ficha aún placeholders.

Siguiente: paso 4 (horarios). El resto del menú sigue vacío.

---

## Paso 1 — Año lectivo, escuelas y materias **(hecho)**

**Para qué.** El profesor arma el contexto mínimo: dónde dicta y qué asignaturas da. Sin esto no hay cursos.

**Pantallas**

- **Escuelas** (`/escuelas`): alta/edición/baja. Jurisdicción (PBA / CABA / Otra), nombre, nombre corto opcional, contacto opcional. Una escuela puede tener dictados de primaria y de secundaria.
- Materias: alta/edición/baja (English, Plástica, «Grado», …). Panel en Escuelas; no hace falta un ítem extra en el menú.
- Año lectivo: ver el activo (seed 2026), crear el siguiente, **activar uno solo**. Cabecera o Inicio; no es un menú propio.

**Listo cuando** se puede cargar “ENET Nº 1 — PBA” y “English”, y el año activo es visible.

---

## Paso 2 — Cursos (el dictado) **(hecho)**

**Para qué.** Un curso = escuela + turno + división + ciclo (grado o año, según nivel) + materia + año lectivo. Es el hub de toda la app.

**Pantalla** `/cursos`

- Listado del año activo, con nivel visible (Primaria / Secundaria).
- Alta: nivel → ciclo (grado o año) + resto de combos. `nombre` es etiqueta de UI (ej. “3° B English — primaria” o “1° A English — ENET”).
- Mismo colegio: 3° grado English y 3° año English son dos cursos (ciclos distintos).
- Maestro de grado: un curso por grupo, materia «Grado» (o un área).
- Edición y baja (RESTRICT si hay datos operativos; CASCADE donde el SQL ya lo define).
- Ficha del curso: resumen vacío hasta los pasos siguientes (alumnos, horario, próximas fechas).

**Listo cuando** el profesor ve “sus cursos de 2026” y puede abrir uno.

---

## Paso 3 — Alumnos e inscripción **(hecho)**

**Para qué.** El alumno es una persona; la pertenencia al dictado es `alumnos_cursos`. El mismo chico puede estar en dos materias del profesor.

**Pantalla** `/alumnos`

- Listado (apellido, nombre, DNI opcional, cursos en los que está).
- Alta/edición de persona.
- Inscribir / dar de baja de un curso del año activo (sin borrar a la persona).
- Desde la ficha de un **curso**: “alumnos de este dictado” (alta rápida + elegir existente).

**Listo cuando** un curso tiene nómina y un alumno figura en más de un dictado si corresponde.

---

## Paso 4 — Horarios

**Para qué.** Saber qué dictado toca cada día. No es el horario del colegio.

**Pantalla** `/horarios`

- Grilla semanal (ISO 1–7) del año activo: curso, hora inicio/fin, aula opcional.
- Alta/edición/baja por curso. Unique `(curso, día, hora_inicio)`.

**Listo cuando** el profesor ve su semana y puede cargar “lunes 14:00–15:20, 3° B”.

---

## Paso 5 — Evaluaciones

**Para qué.** Fechas de escrito / oral / TP / integrador / recuperatorio. El calendario de exámenes **se deriva de esta tabla**, no de `eventos`.

**Pantalla** `/evaluaciones`

- Por curso (y listado general del año): título, tipo, fecha, tema, ponderación (TEXT decimal, default `1`).
- Recuperatorio: apunta a `id_evaluacion_origen`.
- Baja con confirmación (cascada a notas).

**Listo cuando** hay “Escrito 1 — 3° B — 12/05” con ponderación.

---

## Paso 6 — Notas

**Para qué.** El cuaderno de calificaciones. Es el corazón operativo después de tener nómina y evaluaciones.

**Pantalla** `/notas`

- Planilla: filas = alumnos inscriptos; columnas = evaluaciones del curso.
- Carga: valor 1–10 (decimal) **o** ausente (`valor` NULL). Comentario opcional.
- Promedio ponderado en pantalla (`decimal.js`); no se persiste.
- Solo alumnos de `alumnos_cursos` de ese curso.

**Listo cuando** se carga una nota, un ausente, y el promedio del curso se ve bien.

---

## Paso 7 — Asistencia

**Para qué.** Pase de lista de **esa hora de clase**.

**Pantalla** `/asistencia`

- Elegir curso + fecha (default: hoy).
- Nómina con presente / ausente / tarde / justificado. Unique `(curso, alumno, fecha)`.
- Atajo: marcar todos presentes y corregir.

**Listo cuando** un dictado del día queda pasado en lista en un par de clics.

---

## Paso 8 — Calendario (eventos, no exámenes)

**Para qué.** Temas nuevos, entregas, reuniones, juntas, actos/sin clase. No duplicar evaluaciones.

**Pantalla** `/calendario`

- Vista mes (y lista) del año activo: eventos + evaluaciones (estas últimas de solo lectura, link a Evaluaciones).
- Alta de evento: tipo, fecha, hora opcional, título, descripción, curso opcional.
- Invariante: tema y entrega **siempre** con curso; junta/acto/otro pueden ir sueltos (paro, feriado).

**Listo cuando** el mes muestra “Tema: present perfect” en un curso y “Acto 25 de mayo” sin curso.

---

## Paso 9 — Observaciones

**Para qué.** Anotaciones del profesor sobre un alumno **en ese dictado** (académica, conducta, seguimiento, reunión con familia).

**Pantalla** `/observaciones`

- Listado filtrable por curso / alumno / tipo / fecha.
- Alta desde acá o desde la ficha del alumno.
- El alumno debe estar inscripto en el curso.

**Listo cuando** queda “seguimiento — Juan Pérez — 3° B — 09/09”.

---

## Paso 10 — Inicio (resumen del día)

**Para qué.** Abrir la app y ver qué toca hoy, no el logo solo.

**Pantalla** `/`

- Hoy: bloques de `horarios` + eventos/evaluaciones de la fecha.
- Próximas evaluaciones (7–14 días).
- Año lectivo activo (y cambio de año).
- Logo más chico o en cabecera; el centro es el día.

Opcional en el mismo paso o justo después: un gráfico simple (Recharts) de promedio por curso. No bloquear el resumen por el gráfico.

**Listo cuando** un martes a la mañana se ve “hoy 3° B 14:00” y “escrito el jueves”.

---

## Orden y por qué

```text
0 Shell/DB          (hecho)
1 Escuelas + materias + año  (hecho)
2 Cursos                     (hecho)
3 Alumnos ↔ cursos           (hecho)
4 Horarios
5 Evaluaciones
6 Notas
7 Asistencia
8 Calendario (eventos)
9 Observaciones
10 Inicio (hoy)
```

1→3 es el **alta inicial** (sin nómina no hay notas ni lista). 4 da contexto de “qué toca hoy”. 5→6 es el ciclo de evaluación. 7 es el otro gesto diario. 8 y 9 completan el quehacer. 10 se hace al final para no inventar un dashboard vacío.

Asistencia (7) y calendario (8) se pueden invertir si el profesor prioriza temas/fechas antes que el pase de lista; no se puede hacer 6 sin 3 y 5.

---

## Criterio para cortar un paso

Un paso cierra cuando:

1. CRUD (o planilla) funciona en la ventana Tauri, no solo en Vite.
2. Los errores de SQLite salen por Swal; el alta ok, por toast.
3. No se puede guardar un estado que el SQL o las invariantes de app prohíben (nota + ausente, tema sin curso, alumno de otro dictado).
4. El menú de esa sección deja de ser un título vacío.
