# Adm Cursos Secundaria — mapa de dominio

| | |
|--|--|
| **Producto** | Cuaderno de dictados de un docente (primaria y secundaria, PBA y/o CABA) |
| **Fecha** | 2026-09-09 (schema dominio v1.2 — primaria + secundaria; no director) |
| **Fuente de esquema** | [`database.sql`](../database.sql) — **fuente de verdad** (SQLite) |
| **App** | `adm-cursos-secundaria/` (Tauri 2 + React 19 + Rust) |
| **Persistencia runtime** | SQLite local (Rust). El archivo de esquema **es** el dialecto de runtime. |
| **CBM (trabajo)** | Path `C:/Users/Usuario/Desktop/Bruno/Proy. TMST` → id `C-Users-Usuario-Desktop-Bruno-Proy.-TMST` |

## 1. Qué es el producto

App de escritorio **local** para **un docente** que quiere tener en orden **los cursos donde dicta clases**:

- **Profesor de materia** (inglés, artísticas, ed. física, …) en primaria, secundaria o ambas. Caso testigo: profesor de inglés con horas en los dos niveles.
- **Maestro de grado**: el grupo es el dictado; materia típica «Grado», o las áreas si quiere separar notas.

No es software de **director**, preceptor ni secretaría. No modela “la escuela”: modela **mis dictados**. Un mismo docente suele tener horas en más de un colegio (PBA, CABA o ambos) y en más de un nivel. Inicial/jardín queda fuera.

No hay multi-usuario, **login** ni API remota: cada copia es el cuaderno de un docente, sin cuentas que recuperar. El frontend React corre en Tauri; Rust es el único que toca SQLite. No hay tabla `profesores`: quien abre la app es el docente.

## 2. Modelo persistido (`database.sql`)

```text
jurisdicciones 1──* escuelas 1──* cursos *──1 anios_lectivos
                                      *──1 turnos
                                      *──1 divisiones
                                      *──1 ciclos *──1 niveles
                                      *──1 materias
cursos 1──* alumnos_cursos *──1 alumnos
       1──* horarios
       1──* eventos *──1 tipos_evento
       1──* evaluaciones *──1 tipos_evaluacion
                         └──* evaluaciones (recuperatorio → origen)
       1──* observaciones *──1 tipos_observacion
       1──* asistencias *──1 estados_asistencia
evaluaciones 1──* notas *──1 alumnos
alumnos 1──* observaciones
        1──* asistencias
```

### Catálogos (con seed)

| Tabla | Seed | Notas |
|-------|------|--------|
| `jurisdicciones` | pba, caba, otra | Una escuela pertenece a una. El profesor puede dictar en varias. |
| `turnos` | Mañana, Tarde, Vespertino, Noche | |
| `divisiones` | A–D | Catálogo de etiquetas; se puede ampliar. No implica “todas las divisiones del colegio”. |
| `niveles` | primaria, secundaria | El dictado es de un nivel. Una escuela puede tener cursos de ambos. |
| `ciclos` | 1°–7° grado y 1°–7° año (`orden` por nivel) | **Grupo** al que dicta. Primaria = grado (PBA 1–6, CABA 1–7). Secundaria = año (CABA 1–5, PBA 1–6, técnico 7). Unique `(id_nivel, orden)`: 3° grado ≠ 3° año. |
| `anios_lectivos` | 2026 activo | Un solo `activo=1` (índice único parcial) |
| `tipos_evento` | tema, entrega, reunion, junta, acto, otro | Calendario del profesor, no del establecimiento |
| `tipos_evaluacion` | escrito, oral, tp, integrador, recuperatorio | |
| `tipos_observacion` | academica, conducta, seguimiento, reunion_familia | Del dictado, no el legajo escolar |
| `estados_asistencia` | presente, ausente, tarde, justificado | Asistencia de **esa hora de clase** |

### Maestras (solo lo cargado por el profesor)

| Tabla | Rol |
|-------|-----|
| `escuelas` | Lugares donde **dicta**. `id_jurisdiccion` obligatorio; `nombre_corto`, dirección y contacto opcionales. Unique `(jurisdicción, nombre)`. |
| `materias` | Lo que **este** docente dicta. Profesor de espacio: English, Plástica, … Maestro de grado: «Grado» o áreas. No es el diseño curricular de la escuela. |
| `cursos` | Un dictado: escuela + turno + división + ciclo (implica nivel) + materia + año lectivo. `nombre` es etiqueta de UI. `orientacion` opcional (en primaria suele NULL). Unique en esa tupla. |
| `alumnos` | Persona en *sus* cursos (`dni` unique nullable). No es la matrícula institucional. |
| `alumnos_cursos` | Inscripción alumno↔dictado (mismo alumno en dos materias del profesor). |
| `horarios` | Grilla semanal del profesor (ISO 1–7 + hora inicio/fin + aula opcional). No es el horario institucional. |

### Operativa diaria

| Tabla | Rol |
|-------|-----|
| `eventos` | Fechas del quehacer **que no son evaluación**. `id_curso` NULL = afecta a todos sus dictados (paro, feriado, acto, junta general). Tema/entrega van siempre con curso (invariante de app). |
| `evaluaciones` | Examen/TP/oral/integrador/recuperatorio con `fecha`, `tema`, `ponderacion` (TEXT decimal, default `'1'`). `id_evaluacion_origen` para recuperatorio. El calendario de exámenes **se deriva de esta tabla**. |
| `notas` | Una por (evaluación, alumno). `valor` TEXT decimal o NULL; `ausente=1` implica `valor` NULL. |
| `observaciones` | Texto del profesor por alumno + **ese** dictado + tipo + fecha |
| `asistencias` | Un estado por (curso, alumno, fecha) — pases de lista del dictado, no el libro de la escuela |

## 3. Invariantes

1. Ampliar `database.sql` **antes** de nuevas entidades, comandos o pantallas.
2. Fechas `YYYY-MM-DD`, horas `HH:MM`, texto ISO; en FE usar Temporal.
3. Notas y ponderaciones: **TEXT**, no `REAL`/`FLOAT`. Aritmética con `decimal.js` (FE) y el equivalente exacto en Rust.
4. Escala típica argentina 1–10: la valida la app, no el SQL.
5. Un alumno en un curso para notas/asistencia/observaciones debe existir en `alumnos_cursos` (invariante de aplicación).
6. `PRAGMA foreign_keys = ON` en cada conexión Rust.
7. Un solo año lectivo activo.
8. No inventar pantallas ni tablas de “la escuela completa”: el universo es lo que el docente dicta.
9. Tema/entrega: `eventos.id_curso` obligatorio (app). Junta/acto/otro pueden ir sueltos.
10. El nivel del dictado sale de `ciclos.id_nivel`. No poner `nivel` en `escuelas`.

## 4. Fuera de este schema (a propósito)

Queda **fuera** todo lo que es de director / establecimiento / sistema oficial:

- Login, contraseñas, multi-profesor, usuarios, roles (director, preceptor, preceptora)
- Matrícula institucional, plantel docente, cargos, designaciones, horas cátedra oficiales
- Todas las divisiones o materias de un colegio (solo las del dictado)
- Boletines, libretas, planillas oficiales, SIEE / sistemas del ministerio
- Contenidos curriculares oficiales (NAP, diseños PBA/CABA) más allá del `tema` libre
- Adjuntos (enunciados PDF, fotos)

## 5. Arquitectura objetivo

```text
React (src/)  --invoke-->  Rust commands (src-tauri)
                                |
                                v
                           SQLite local  ←  database.sql
```

- Validación: `zod`. Tablas: `@tanstack/react-table`. Rutas: `react-router-dom`.
- Feedback: react-toastify + sweetalert2. Iconos: `lucide-react`. Gráficos: `recharts`.
- Estilos: `tailwindcss`. Fechas: Temporal. Catálogo: [`libraries-npm.md`](../libraries-npm.md).

Estado 2026-09-10: schema dominio v1.2 (primaria + secundaria). Rust abre SQLite con `PRAGMA foreign_keys = ON`, aplica `database.sql` si la DB está vacía, y migra v1.1 → v1.2 (niveles + grados) si ya había tablas. IPC: `src/api.ts` (Zod) ↔ `src-tauri/src/domain.rs`; argumentos de comando en snake_case (`rename_all` en Rust). Pasos 0–3 del [roadmap](./roadmap.md) listos (shell, escuelas/materias/año, cursos, alumnos e inscripción). Siguiente: horarios.

## 6. Reglas para agentes

1. `database.sql` manda. Si el código y el SQL divergen, se corrige el código (o se discute un cambio de SQL primero).
2. No hablar SQL desde el frontend.
3. Un proxy Headroom y un índice CBM por esta raíz; no usar el de FactuStock.
4. Ante una feature nueva: ¿la usaría un docente en *su* hora de clase (primaria o secundaria), o un director para *el colegio*? Si es lo segundo, no entra.
