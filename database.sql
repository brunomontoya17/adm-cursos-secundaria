-- Adm Cursos — esquema de dominio (fuente de verdad) v1.3
-- Dialecto: SQLite. Runtime: un archivo local vía Rust (PRAGMA foreign_keys = ON).
-- Fechas: TEXT ISO (YYYY-MM-DD). Horas: TEXT HH:MM (24h).
-- Notas y ponderaciones: TEXT decimal canónico (ej. '7.50'); aritmética en app con decimal.js, no REAL.
--
-- Actor: UN docente (profesor de materia o maestro de grado) en PBA y/o CABA.
-- Cubre primaria y secundaria: el caso testigo es un profesor de inglés con horas
-- en ambos niveles; también entra el maestro de grado (un grupo, materia «Grado»
-- o las áreas que separe). La app ordena LOS CURSOS DONDE DICTA, no una escuela.
-- No es software de director, preceptor ni secretaría. Un usuario = la app; no
-- hay tabla profesores. Fuera de alcance: inicial/jardín, a propósito.

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ---------------------------------------------------------------------------
-- Reset (archivo reejecutable en dev)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS asistencias;
DROP TABLE IF EXISTS observaciones;
DROP TABLE IF EXISTS notas;
DROP TABLE IF EXISTS evaluaciones;
DROP TABLE IF EXISTS eventos;
DROP TABLE IF EXISTS horarios;
DROP TABLE IF EXISTS alumnos_cursos;
DROP TABLE IF EXISTS alumnos;
DROP TABLE IF EXISTS cursos;
DROP TABLE IF EXISTS materias;
DROP TABLE IF EXISTS escuelas;
DROP TABLE IF EXISTS jurisdicciones;
DROP TABLE IF EXISTS estados_asistencia;
DROP TABLE IF EXISTS tipos_observacion;
DROP TABLE IF EXISTS tipos_evaluacion;
DROP TABLE IF EXISTS tipos_evento;
DROP TABLE IF EXISTS anios_lectivos;
DROP TABLE IF EXISTS ciclos;
DROP TABLE IF EXISTS niveles;
DROP TABLE IF EXISTS divisiones;
DROP TABLE IF EXISTS turnos;

-- ===========================================================================
-- CATÁLOGOS
-- ===========================================================================

CREATE TABLE turnos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE divisiones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE
);

-- Nivel del dictado (no de «toda la escuela»: un colegio puede tener ambos).
CREATE TABLE niveles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL UNIQUE
);

-- Grupo al que dicta, según el nivel. No es la oferta completa del colegio.
-- Primaria: grado. PBA típica 1–6; CABA típica 1–7.
-- Secundaria: año. CABA típica 1–5; PBA 1–6; técnico a veces 7.
-- orden se repite por nivel (3° grado ≠ 3° año): unique es (id_nivel, orden).
CREATE TABLE ciclos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_nivel INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    orden INTEGER NOT NULL,
    FOREIGN KEY (id_nivel) REFERENCES niveles (id) ON DELETE RESTRICT,
    UNIQUE (id_nivel, nombre),
    UNIQUE (id_nivel, orden)
);

-- Un solo año activo a la vez (índice parcial más abajo).
CREATE TABLE anios_lectivos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    anio INTEGER NOT NULL UNIQUE,
    activo INTEGER NOT NULL DEFAULT 0 CHECK (activo IN (0, 1))
);

-- PBA y CABA son de primer nivel: el mismo profesor suele dictar en ambas.
CREATE TABLE jurisdicciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE tipos_evento (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE tipos_evaluacion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE tipos_observacion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL UNIQUE
);

-- Asistencia de ESA hora de clase, no el registro oficial del establecimiento.
CREATE TABLE estados_asistencia (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL UNIQUE
);

-- ===========================================================================
-- MAESTRAS (solo lo que el profesor usa)
-- ===========================================================================

-- Lugar donde dicta. No es el padrón de un colegio: puede haber varias filas
-- (profesor que viaja entre escuelas). Dirección y contacto son opcionales.
CREATE TABLE escuelas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_jurisdiccion INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    nombre_corto TEXT,
    direccion TEXT,
    telefono TEXT,
    email TEXT,
    FOREIGN KEY (id_jurisdiccion) REFERENCES jurisdicciones (id) ON DELETE RESTRICT,
    UNIQUE (id_jurisdiccion, nombre)
);

-- Asignaturas que ESTE docente dicta (no el diseño curricular de la escuela).
-- Profesor de materia (inglés, artísticas, ed. física, …): el nombre de la asignatura.
-- Maestro de grado: suele ser «Grado» (un dictado por grupo) o las áreas que separe.
CREATE TABLE materias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE
);

-- Un dictado: materia + grupo (ciclo = grado o año, según nivel) + escuela + año lectivo.
-- El nivel entra por id_ciclo. Así 3° grado English y 3° año English conviven en la misma escuela.
-- orientacion es etiqueta libre (Bachiller, Ciencias, Economía, técnico, …); en primaria suele ir NULL.
CREATE TABLE cursos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    id_escuela INTEGER NOT NULL,
    id_turno INTEGER NOT NULL,
    id_division INTEGER NOT NULL,
    id_ciclo INTEGER NOT NULL,
    id_materia INTEGER NOT NULL,
    id_anio_lectivo INTEGER NOT NULL,
    orientacion TEXT,
    FOREIGN KEY (id_escuela) REFERENCES escuelas (id) ON DELETE RESTRICT,
    FOREIGN KEY (id_turno) REFERENCES turnos (id) ON DELETE RESTRICT,
    FOREIGN KEY (id_division) REFERENCES divisiones (id) ON DELETE RESTRICT,
    FOREIGN KEY (id_ciclo) REFERENCES ciclos (id) ON DELETE RESTRICT,
    FOREIGN KEY (id_materia) REFERENCES materias (id) ON DELETE RESTRICT,
    FOREIGN KEY (id_anio_lectivo) REFERENCES anios_lectivos (id) ON DELETE RESTRICT,
    UNIQUE (id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo)
);

-- Persona en los cursos del profesor. No es la matrícula de la escuela.
-- Ficha mínima (v1.3): apellido + nombre. Sin DNI, contacto ni nacimiento
-- (identificadores excesivos para el dictado; el id interno distingue homónimos).
-- La pertenencia a un dictado es alumnos_cursos (mismo alumno en dos materias, o que repite).
CREATE TABLE alumnos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    apellido TEXT NOT NULL
);

CREATE TABLE alumnos_cursos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_alumno INTEGER NOT NULL,
    id_curso INTEGER NOT NULL,
    FOREIGN KEY (id_alumno) REFERENCES alumnos (id) ON DELETE CASCADE,
    FOREIGN KEY (id_curso) REFERENCES cursos (id) ON DELETE CASCADE,
    UNIQUE (id_alumno, id_curso)
);

-- Grilla semanal del profesor (qué dictado toca cada día). No es el horario institucional.
CREATE TABLE horarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_curso INTEGER NOT NULL,
    dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
    hora_inicio TEXT NOT NULL,
    hora_fin TEXT NOT NULL,
    aula TEXT,
    FOREIGN KEY (id_curso) REFERENCES cursos (id) ON DELETE CASCADE,
    UNIQUE (id_curso, dia_semana, hora_inicio)
);

-- ===========================================================================
-- CALENDARIO, EVALUACIONES, NOTAS, OBSERVACIONES, ASISTENCIA
-- ===========================================================================

-- Fechas del quehacer del profesor que no son evaluación (tema, entrega, reunión,
-- junta, acto/sin clase, otro). id_curso NULL = afecta a todos sus dictados
-- (paro, feriado, acto, junta general). Tema/entrega siempre van con curso (app).
CREATE TABLE eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_curso INTEGER,
    id_tipo_evento INTEGER NOT NULL,
    fecha TEXT NOT NULL,
    hora TEXT,
    titulo TEXT NOT NULL,
    descripcion TEXT,
    FOREIGN KEY (id_curso) REFERENCES cursos (id) ON DELETE CASCADE,
    FOREIGN KEY (id_tipo_evento) REFERENCES tipos_evento (id) ON DELETE RESTRICT
);

CREATE TABLE evaluaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_curso INTEGER NOT NULL,
    id_tipo_evaluacion INTEGER NOT NULL,
    id_evaluacion_origen INTEGER,
    titulo TEXT NOT NULL,
    fecha TEXT NOT NULL,
    tema TEXT,
    ponderacion TEXT NOT NULL DEFAULT '1',
    FOREIGN KEY (id_curso) REFERENCES cursos (id) ON DELETE CASCADE,
    FOREIGN KEY (id_tipo_evaluacion) REFERENCES tipos_evaluacion (id) ON DELETE RESTRICT,
    FOREIGN KEY (id_evaluacion_origen) REFERENCES evaluaciones (id) ON DELETE SET NULL
);

-- Una nota por alumno y evaluación. valor NULL si ausente o aún no cargada.
CREATE TABLE notas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_evaluacion INTEGER NOT NULL,
    id_alumno INTEGER NOT NULL,
    valor TEXT,
    ausente INTEGER NOT NULL DEFAULT 0 CHECK (ausente IN (0, 1)),
    comentario TEXT,
    FOREIGN KEY (id_evaluacion) REFERENCES evaluaciones (id) ON DELETE CASCADE,
    FOREIGN KEY (id_alumno) REFERENCES alumnos (id) ON DELETE CASCADE,
    UNIQUE (id_evaluacion, id_alumno),
    CHECK (ausente = 0 OR valor IS NULL)
);

-- Notas del profesor sobre un alumno EN ESE dictado (no el legajo de la escuela).
CREATE TABLE observaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_alumno INTEGER NOT NULL,
    id_curso INTEGER NOT NULL,
    id_tipo_observacion INTEGER NOT NULL,
    fecha TEXT NOT NULL,
    texto TEXT NOT NULL,
    FOREIGN KEY (id_alumno) REFERENCES alumnos (id) ON DELETE CASCADE,
    FOREIGN KEY (id_curso) REFERENCES cursos (id) ON DELETE CASCADE,
    FOREIGN KEY (id_tipo_observacion) REFERENCES tipos_observacion (id) ON DELETE RESTRICT
);

CREATE TABLE asistencias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_curso INTEGER NOT NULL,
    id_alumno INTEGER NOT NULL,
    fecha TEXT NOT NULL,
    id_estado_asistencia INTEGER NOT NULL,
    FOREIGN KEY (id_curso) REFERENCES cursos (id) ON DELETE CASCADE,
    FOREIGN KEY (id_alumno) REFERENCES alumnos (id) ON DELETE CASCADE,
    FOREIGN KEY (id_estado_asistencia) REFERENCES estados_asistencia (id) ON DELETE RESTRICT,
    UNIQUE (id_curso, id_alumno, fecha)
);

-- ===========================================================================
-- ÍNDICES
-- ===========================================================================

CREATE UNIQUE INDEX ux_anios_lectivos_activo ON anios_lectivos (activo) WHERE activo = 1;

CREATE INDEX ix_cursos_anio ON cursos (id_anio_lectivo);
CREATE INDEX ix_cursos_escuela ON cursos (id_escuela);
CREATE INDEX ix_ciclos_nivel ON ciclos (id_nivel);
CREATE INDEX ix_escuelas_jurisdiccion ON escuelas (id_jurisdiccion);
CREATE INDEX ix_alumnos_apellido_nombre ON alumnos (apellido, nombre);
CREATE INDEX ix_alumnos_cursos_curso ON alumnos_cursos (id_curso);
CREATE INDEX ix_horarios_curso ON horarios (id_curso);
CREATE INDEX ix_eventos_fecha ON eventos (fecha);
CREATE INDEX ix_eventos_curso ON eventos (id_curso);
CREATE INDEX ix_evaluaciones_curso_fecha ON evaluaciones (id_curso, fecha);
CREATE INDEX ix_notas_alumno ON notas (id_alumno);
CREATE INDEX ix_observaciones_alumno ON observaciones (id_alumno);
CREATE INDEX ix_asistencias_curso_fecha ON asistencias (id_curso, fecha);

-- ===========================================================================
-- SEEDS
-- ===========================================================================

INSERT INTO turnos (nombre) VALUES ('Mañana'), ('Tarde'), ('Vespertino'), ('Noche');

INSERT INTO divisiones (nombre) VALUES ('A'), ('B'), ('C'), ('D');

INSERT INTO niveles (codigo, nombre) VALUES
    ('primaria', 'Primaria'),
    ('secundaria', 'Secundaria');

INSERT INTO ciclos (id_nivel, nombre, orden)
SELECT n.id, v.nombre, v.orden
FROM niveles AS n
JOIN (
    SELECT 'primaria' AS codigo, 'Primer Grado' AS nombre, 1 AS orden UNION ALL
    SELECT 'primaria', 'Segundo Grado', 2 UNION ALL
    SELECT 'primaria', 'Tercer Grado', 3 UNION ALL
    SELECT 'primaria', 'Cuarto Grado', 4 UNION ALL
    SELECT 'primaria', 'Quinto Grado', 5 UNION ALL
    SELECT 'primaria', 'Sexto Grado', 6 UNION ALL
    SELECT 'primaria', 'Séptimo Grado', 7 UNION ALL
    SELECT 'secundaria', 'Primer Año', 1 UNION ALL
    SELECT 'secundaria', 'Segundo Año', 2 UNION ALL
    SELECT 'secundaria', 'Tercer Año', 3 UNION ALL
    SELECT 'secundaria', 'Cuarto Año', 4 UNION ALL
    SELECT 'secundaria', 'Quinto Año', 5 UNION ALL
    SELECT 'secundaria', 'Sexto Año', 6 UNION ALL
    SELECT 'secundaria', 'Séptimo Año', 7
) AS v ON v.codigo = n.codigo;

INSERT INTO anios_lectivos (anio, activo) VALUES (2026, 1);

INSERT INTO jurisdicciones (codigo, nombre) VALUES
    ('pba', 'Provincia de Buenos Aires'),
    ('caba', 'CABA'),
    ('otra', 'Otra');

INSERT INTO tipos_evento (codigo, nombre) VALUES
    ('tema', 'Tema nuevo'),
    ('entrega', 'Entrega'),
    ('reunion', 'Reunión'),
    ('junta', 'Junta de evaluación'),
    ('acto', 'Acto / sin clase'),
    ('otro', 'Otro');

INSERT INTO tipos_evaluacion (codigo, nombre) VALUES
    ('escrito', 'Escrito'),
    ('oral', 'Oral'),
    ('tp', 'Trabajo práctico'),
    ('integrador', 'Integrador'),
    ('recuperatorio', 'Recuperatorio');

INSERT INTO tipos_observacion (codigo, nombre) VALUES
    ('academica', 'Académica'),
    ('conducta', 'Conducta'),
    ('seguimiento', 'Seguimiento'),
    ('reunion_familia', 'Reunión con familia');

INSERT INTO estados_asistencia (codigo, nombre) VALUES
    ('presente', 'Presente'),
    ('ausente', 'Ausente'),
    ('tarde', 'Tarde'),
    ('justificado', 'Ausente justificado');
