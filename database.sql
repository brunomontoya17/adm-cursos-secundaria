-- Adm Cursos Secundaria — esquema de dominio (fuente de verdad)
-- Dialecto: SQLite. Runtime: un archivo local vía Rust (PRAGMA foreign_keys = ON).
-- Fechas: TEXT ISO (YYYY-MM-DD). Horas: TEXT HH:MM (24h).
-- Notas y ponderaciones: TEXT decimal canónico (ej. '7.50'); aritmética en app con decimal.js, no REAL.
--
-- Actor: UN profesor de cualquier materia de secundaria (PBA y/o CABA).
-- La app ordena LOS CURSOS DONDE DICTA, no una escuela. No es software de director,
-- preceptor ni secretaría: no hay matrícula institucional, plantel, ni todas las
-- divisiones del establecimiento. Solo existe lo que el profesor carga porque dicta ahí.
-- Un profesor = un usuario de la app; no hay tabla profesores.

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

-- Año del grupo al que el profesor dicta (no la oferta completa de un colegio).
-- PBA secundaria típica: 1–6. CABA secundaria típica: 1–5. Técnico puede usar 6–7.
CREATE TABLE ciclos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    orden INTEGER NOT NULL UNIQUE
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

-- Asignaturas que ESTE profesor dicta (no el diseño curricular de la escuela).
CREATE TABLE materias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE
);

-- Un dictado del profesor: materia + grupo + escuela + año.
-- orientacion es etiqueta libre (Bachiller, Ciencias, Economía, técnico, …);
-- en ciclo básico suele ir NULL.
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
-- La pertenencia a un dictado es alumnos_cursos (mismo alumno en dos materias, o que repite).
CREATE TABLE alumnos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    apellido TEXT NOT NULL,
    dni TEXT UNIQUE,
    email TEXT,
    telefono TEXT,
    fecha_nacimiento TEXT
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

INSERT INTO ciclos (nombre, orden) VALUES
    ('Primer Año', 1),
    ('Segundo Año', 2),
    ('Tercer Año', 3),
    ('Cuarto Año', 4),
    ('Quinto Año', 5),
    ('Sexto Año', 6),
    ('Séptimo Año', 7);

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
