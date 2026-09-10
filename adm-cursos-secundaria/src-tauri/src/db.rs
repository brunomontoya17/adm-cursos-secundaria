//! SQLite local. `PRAGMA foreign_keys = ON` en cada conexión (SQLite no lo persiste).
//! El DDL sale de `database.sql` (raíz del repo); no se reaplican los DROP si ya hay tablas.

use crate::domain::DbStatus;
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;

const SCHEMA_SQL: &str = include_str!("../../../database.sql");

pub struct Db {
    path: PathBuf,
    conn: Mutex<Result<Connection, String>>,
}

impl Db {
    pub fn open_for_app(app: &tauri::App) -> Result<Self, Box<dyn std::error::Error>> {
        let dir = app.path().app_data_dir()?;
        std::fs::create_dir_all(&dir)?;
        let path = dir.join("adm-cursos.sqlite");
        Self::open_file(&path).map_err(Into::into)
    }

    pub fn unavailable(message: String) -> Self {
        Self {
            path: PathBuf::new(),
            conn: Mutex::new(Err(message)),
        }
    }

    pub fn open_file(path: &Path) -> rusqlite::Result<Self> {
        let conn = Connection::open(path)?;
        prepare_connection(&conn)?;
        Ok(Self {
            path: path.to_path_buf(),
            conn: Mutex::new(Ok(conn)),
        })
    }

    pub fn status(&self) -> Result<DbStatus, String> {
        self.with_conn(|conn| status_of(conn, Some(&self.path)))
    }

    pub fn with_conn<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> rusqlite::Result<T>,
    {
        let guard = self.conn.lock().map_err(|e| e.to_string())?;
        match &*guard {
            Ok(conn) => f(conn).map_err(map_sql_error),
            Err(message) => Err(message.clone()),
        }
    }

    pub fn with_conn_mut<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&mut Connection) -> rusqlite::Result<T>,
    {
        let mut guard = self.conn.lock().map_err(|e| e.to_string())?;
        match &mut *guard {
            Ok(conn) => f(conn).map_err(map_sql_error),
            Err(message) => Err(message.clone()),
        }
    }
}

/// Error de invariante de app (no de SQLite). `map_sql_error` devuelve el texto tal cual.
pub fn app_err(msg: impl Into<String>) -> rusqlite::Error {
    rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
        std::io::ErrorKind::InvalidInput,
        msg.into(),
    )))
}

pub fn map_sql_error(err: rusqlite::Error) -> String {
    if matches!(err, rusqlite::Error::QueryReturnedNoRows) {
        return "No se encontró el registro.".into();
    }
    if let rusqlite::Error::ToSqlConversionFailure(inner) = &err {
        let s = inner.to_string();
        if !s.is_empty() {
            return s;
        }
    }
    let msg = err.to_string();
    if msg.contains("escuelas.id_jurisdiccion") && msg.contains("escuelas.nombre") {
        return "Ya existe una escuela con ese nombre en esa jurisdicción.".into();
    }
    if msg.contains("materias.nombre") {
        return "Ya existe una materia con ese nombre.".into();
    }
    if msg.contains("cursos.id_escuela") && msg.contains("cursos.id_materia") {
        return "Ya existe un dictado con esa escuela, grupo, materia y año.".into();
    }
    if msg.contains("anios_lectivos.anio") {
        return "Ese año lectivo ya está cargado.".into();
    }
    if msg.contains("ux_anios_lectivos_activo") || msg.contains("anios_lectivos.activo") {
        return "Solo puede haber un año lectivo activo.".into();
    }
    if msg.contains("alumnos.dni") {
        return "Ya existe un alumno con ese DNI.".into();
    }
    if msg.contains("alumnos_cursos.id_alumno") && msg.contains("alumnos_cursos.id_curso") {
        return "Ese alumno ya está inscripto en este curso.".into();
    }
    if msg.contains("horarios.id_curso") && msg.contains("horarios.dia_semana") {
        return "Ya hay un bloque de ese curso ese día a esa hora.".into();
    }
    if msg.contains("notas.id_evaluacion") && msg.contains("notas.id_alumno") {
        return "Ya hay una nota de ese alumno en esa evaluación.".into();
    }
    if msg.contains("asistencias.id_curso") && msg.contains("asistencias.id_alumno") {
        return "Ya hay asistencia de ese alumno en esa fecha.".into();
    }
    if msg.contains("CHECK constraint failed")
        && msg.to_ascii_lowercase().contains("ausente")
    {
        return "Si está ausente, la nota tiene que quedar vacía.".into();
    }
    if msg.contains("FOREIGN KEY constraint failed") {
        return "No se puede completar: falta un dato vinculado o hay registros que lo usan.".into();
    }
    msg
}

/// Cada conexión nueva: FKs, WAL y timeout. Obligatorio — `foreign_keys` no se guarda en el archivo.
pub fn prepare_connection(conn: &Connection) -> rusqlite::Result<()> {
    apply_pragmas(conn)?;
    ensure_schema(conn)?;
    // Por si execute_batch del SQL reordenara pragmas: volver a afirmar FKs.
    apply_pragmas(conn)?;
    Ok(())
}

pub fn apply_pragmas(conn: &Connection) -> rusqlite::Result<()> {
    conn.busy_timeout(Duration::from_millis(5_000))?;
    conn.pragma_update(None, "foreign_keys", true)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    Ok(())
}

fn ensure_schema(conn: &Connection) -> rusqlite::Result<()> {
    let tables = user_table_count(conn)?;
    if tables == 0 {
        conn.execute_batch(&schema_without_pragmas())?;
        return Ok(());
    }
    heal_ciclos_rename_leftovers(conn)?;
    migrate_niveles_y_ciclos(conn)?;
    repair_cursos_fk_ciclos_old(conn)?;
    Ok(())
}

fn table_exists(conn: &Connection, name: &str) -> rusqlite::Result<bool> {
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
        [name],
        |row| row.get(0),
    )?;
    Ok(n > 0)
}

fn column_exists(conn: &Connection, table: &str, column: &str) -> rusqlite::Result<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let name: String = row.get(1)?;
        if name.eq_ignore_ascii_case(column) {
            return Ok(true);
        }
    }
    Ok(false)
}

/// SQLite 3.26+ reescribe FKs de otras tablas en un RENAME aunque `foreign_keys` esté OFF.
/// Eso deja `cursos` apuntando a `ciclos_old` y el INSERT falla con "no such table: main.ciclos_old".
/// `legacy_alter_table=ON` restaura el comportamiento viejo; el Drop vuelve a encender FKs.
struct SchemaRebuildGuard<'a> {
    conn: &'a Connection,
}

impl<'a> SchemaRebuildGuard<'a> {
    fn enter(conn: &'a Connection) -> rusqlite::Result<Self> {
        conn.pragma_update(None, "foreign_keys", false)?;
        conn.pragma_update(None, "legacy_alter_table", true)?;
        Ok(Self { conn })
    }
}

impl Drop for SchemaRebuildGuard<'_> {
    fn drop(&mut self) {
        let _ = self.conn.pragma_update(None, "legacy_alter_table", false);
        let _ = self.conn.pragma_update(None, "foreign_keys", true);
    }
}

fn table_sql_contains(conn: &Connection, table: &str, needle: &str) -> rusqlite::Result<bool> {
    use rusqlite::OptionalExtension;
    let sql: Option<String> = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?1",
            [table],
            |row| row.get(0),
        )
        .optional()?;
    Ok(sql
        .map(|s| s.to_ascii_lowercase().contains(&needle.to_ascii_lowercase()))
        .unwrap_or(false))
}

fn reset_sqlite_sequence(conn: &Connection, table: &str) -> rusqlite::Result<()> {
    if !table_exists(conn, "sqlite_sequence")? {
        return Ok(());
    }
    conn.execute("DELETE FROM sqlite_sequence WHERE name = ?1", [table])?;
    conn.execute(
        &format!(
            "INSERT INTO sqlite_sequence (name, seq)
             SELECT ?1, COALESCE(MAX(id), 0) FROM {table}"
        ),
        [table],
    )?;
    Ok(())
}

/// Si una migración anterior quedó a medias (`ciclos` renombrada y no restaurada).
fn heal_ciclos_rename_leftovers(conn: &Connection) -> rusqlite::Result<()> {
    let has_ciclos = table_exists(conn, "ciclos")?;
    let has_old = table_exists(conn, "ciclos_old")?;
    if has_old && !has_ciclos {
        let _guard = SchemaRebuildGuard::enter(conn)?;
        conn.execute("ALTER TABLE ciclos_old RENAME TO ciclos", [])?;
        return Ok(());
    }
    if has_old && has_ciclos {
        let _guard = SchemaRebuildGuard::enter(conn)?;
        if column_exists(conn, "ciclos", "id_nivel")? {
            conn.execute("DROP TABLE ciclos_old", [])?;
        }
    }
    Ok(())
}

/// v1.1 → v1.2: niveles (primaria/secundaria) y ciclos por nivel (grado ≠ año).
/// Conserva los id de ciclos existentes (eran años de secundaria) para no romper cursos.
fn migrate_niveles_y_ciclos(conn: &Connection) -> rusqlite::Result<()> {
    if !table_exists(conn, "ciclos")? {
        return Ok(());
    }

    if !table_exists(conn, "niveles")? {
        conn.execute_batch(
            "CREATE TABLE niveles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                codigo TEXT NOT NULL UNIQUE,
                nombre TEXT NOT NULL UNIQUE
            );",
        )?;
    }
    conn.execute(
        "INSERT OR IGNORE INTO niveles (codigo, nombre) VALUES ('primaria', 'Primaria')",
        [],
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO niveles (codigo, nombre) VALUES ('secundaria', 'Secundaria')",
        [],
    )?;

    if !column_exists(conn, "ciclos", "id_nivel")? {
        rebuild_ciclos_con_nivel(conn)?;
    }

    seed_ciclos_por_nivel(conn)?;
    Ok(())
}

fn rebuild_ciclos_con_nivel(conn: &Connection) -> rusqlite::Result<()> {
    let secundaria_id: i64 = conn.query_row(
        "SELECT id FROM niveles WHERE codigo = 'secundaria'",
        [],
        |row| row.get(0),
    )?;
    let _guard = SchemaRebuildGuard::enter(conn)?;
    // 12 pasos de SQLite: tabla nueva → copiar → DROP → RENAME. No usar
    // `ALTER TABLE ciclos RENAME TO ciclos_old` (reescribe la FK de cursos).
    conn.execute_batch(
        "
        CREATE TABLE ciclos_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            id_nivel INTEGER NOT NULL,
            nombre TEXT NOT NULL,
            orden INTEGER NOT NULL,
            FOREIGN KEY (id_nivel) REFERENCES niveles (id) ON DELETE RESTRICT,
            UNIQUE (id_nivel, nombre),
            UNIQUE (id_nivel, orden)
        );
        ",
    )?;
    conn.execute(
        "INSERT INTO ciclos_new (id, id_nivel, nombre, orden)
         SELECT id, ?1, nombre, orden FROM ciclos",
        [secundaria_id],
    )?;
    conn.execute_batch(
        "
        DROP TABLE ciclos;
        ALTER TABLE ciclos_new RENAME TO ciclos;
        CREATE INDEX IF NOT EXISTS ix_ciclos_nivel ON ciclos (id_nivel);
        ",
    )?;
    reset_sqlite_sequence(conn, "ciclos")?;
    Ok(())
}

/// Bases ya migradas con el RENAME viejo: `cursos` sigue referenciando `ciclos_old`.
fn repair_cursos_fk_ciclos_old(conn: &Connection) -> rusqlite::Result<()> {
    if !table_exists(conn, "cursos")? {
        return Ok(());
    }
    if !table_sql_contains(conn, "cursos", "ciclos_old")? {
        return Ok(());
    }
    rebuild_cursos_fk_a_ciclos(conn)
}

fn rebuild_cursos_fk_a_ciclos(conn: &Connection) -> rusqlite::Result<()> {
    let has_orientacion = column_exists(conn, "cursos", "orientacion")?;
    let _guard = SchemaRebuildGuard::enter(conn)?;
    conn.execute_batch(
        "
        CREATE TABLE cursos_new (
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
        ",
    )?;
    if has_orientacion {
        conn.execute(
            "INSERT INTO cursos_new (
                id, nombre, id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo, orientacion
             )
             SELECT id, nombre, id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo, orientacion
             FROM cursos",
            [],
        )?;
    } else {
        conn.execute(
            "INSERT INTO cursos_new (
                id, nombre, id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo, orientacion
             )
             SELECT id, nombre, id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo, NULL
             FROM cursos",
            [],
        )?;
    }
    conn.execute_batch(
        "
        DROP TABLE cursos;
        ALTER TABLE cursos_new RENAME TO cursos;
        CREATE INDEX IF NOT EXISTS ix_cursos_anio ON cursos (id_anio_lectivo);
        CREATE INDEX IF NOT EXISTS ix_cursos_escuela ON cursos (id_escuela);
        ",
    )?;
    reset_sqlite_sequence(conn, "cursos")?;
    Ok(())
}

fn seed_ciclos_por_nivel(conn: &Connection) -> rusqlite::Result<()> {
    const GRADOS: [(&str, i64); 7] = [
        ("Primer Grado", 1),
        ("Segundo Grado", 2),
        ("Tercer Grado", 3),
        ("Cuarto Grado", 4),
        ("Quinto Grado", 5),
        ("Sexto Grado", 6),
        ("Séptimo Grado", 7),
    ];
    const ANIOS: [(&str, i64); 7] = [
        ("Primer Año", 1),
        ("Segundo Año", 2),
        ("Tercer Año", 3),
        ("Cuarto Año", 4),
        ("Quinto Año", 5),
        ("Sexto Año", 6),
        ("Séptimo Año", 7),
    ];
    let primaria_id: i64 = conn.query_row(
        "SELECT id FROM niveles WHERE codigo = 'primaria'",
        [],
        |row| row.get(0),
    )?;
    let secundaria_id: i64 = conn.query_row(
        "SELECT id FROM niveles WHERE codigo = 'secundaria'",
        [],
        |row| row.get(0),
    )?;
    for (nombre, orden) in GRADOS {
        conn.execute(
            "INSERT OR IGNORE INTO ciclos (id_nivel, nombre, orden) VALUES (?1, ?2, ?3)",
            rusqlite::params![primaria_id, nombre, orden],
        )?;
    }
    for (nombre, orden) in ANIOS {
        conn.execute(
            "INSERT OR IGNORE INTO ciclos (id_nivel, nombre, orden) VALUES (?1, ?2, ?3)",
            rusqlite::params![secundaria_id, nombre, orden],
        )?;
    }
    Ok(())
}

fn user_table_count(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
        [],
        |row| row.get(0),
    )
}

/// Rust es dueño de los PRAGMA. El archivo los documenta para uso standalone; no se reejecutan acá
/// (`journal_mode` devuelve fila y `execute_batch` puede fallar).
fn schema_without_pragmas() -> String {
    SCHEMA_SQL
        .lines()
        .filter(|line| !line.trim_start().to_ascii_uppercase().starts_with("PRAGMA "))
        .collect::<Vec<_>>()
        .join("\n")
}

fn status_of(conn: &Connection, path: Option<&Path>) -> rusqlite::Result<DbStatus> {
    let foreign_keys: i64 = conn.pragma_query_value(None, "foreign_keys", |row| row.get(0))?;
    let journal_mode: String = conn
        .pragma_query_value(None, "journal_mode", |row| row.get::<_, String>(0))?
        .to_ascii_uppercase();
    Ok(DbStatus {
        path: path.map(|p| p.display().to_string()).unwrap_or_else(|| ":memory:".into()),
        foreign_keys,
        journal_mode,
        tables: user_table_count(conn)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::OptionalExtension;

    fn memory() -> Connection {
        let conn = Connection::open_in_memory().expect("memory sqlite");
        prepare_connection(&conn).expect("prepare");
        conn
    }

    #[test]
    fn foreign_keys_pragma_is_on() {
        let conn = memory();
        let on: i64 = conn
            .pragma_query_value(None, "foreign_keys", |row| row.get(0))
            .unwrap();
        assert_eq!(on, 1, "PRAGMA foreign_keys debe ser 1 en cada conexión");
    }

    #[test]
    fn schema_creates_domain_tables() {
        let conn = memory();
        let has_jurisdiccion: Option<String> = conn
            .query_row(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'jurisdicciones'",
                [],
                |row| row.get(0),
            )
            .optional()
            .unwrap();
        assert_eq!(has_jurisdiccion.as_deref(), Some("jurisdicciones"));
        assert!(user_table_count(&conn).unwrap() >= 20);
        let niveles: i64 = conn
            .query_row("SELECT COUNT(*) FROM niveles", [], |row| row.get(0))
            .unwrap();
        assert_eq!(niveles, 2);
        let ciclos: i64 = conn
            .query_row("SELECT COUNT(*) FROM ciclos", [], |row| row.get(0))
            .unwrap();
        assert_eq!(ciclos, 14);
    }

    #[test]
    fn tercer_grado_y_tercer_anio_son_ciclos_distintos() {
        let conn = memory();
        conn.execute(
            "INSERT INTO escuelas (id_jurisdiccion, nombre) VALUES (1, 'Normal 1')",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO materias (nombre) VALUES ('English')", [])
            .unwrap();
        let grado: i64 = conn
            .query_row(
                "SELECT c.id FROM ciclos c JOIN niveles n ON n.id = c.id_nivel
                 WHERE n.codigo = 'primaria' AND c.orden = 3",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let anio: i64 = conn
            .query_row(
                "SELECT c.id FROM ciclos c JOIN niveles n ON n.id = c.id_nivel
                 WHERE n.codigo = 'secundaria' AND c.orden = 3",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_ne!(grado, anio);
        conn.execute(
            "INSERT INTO cursos (nombre, id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo)
             VALUES ('3° A English primaria', 1, 1, 1, ?1, 1, 1)",
            [grado],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO cursos (nombre, id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo)
             VALUES ('3° A English secundaria', 1, 1, 1, ?1, 1, 1)",
            [anio],
        )
        .unwrap();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM cursos", [], |row| row.get(0))
            .unwrap();
        assert_eq!(n, 2);
    }

    #[test]
    fn migrate_old_ciclos_keeps_secundaria_ids() {
        let conn = Connection::open_in_memory().unwrap();
        apply_pragmas(&conn).unwrap();
        conn.execute_batch(
            "
            CREATE TABLE ciclos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL UNIQUE,
                orden INTEGER NOT NULL UNIQUE
            );
            INSERT INTO ciclos (nombre, orden) VALUES
                ('Primer Año', 1),
                ('Segundo Año', 2),
                ('Tercer Año', 3),
                ('Cuarto Año', 4),
                ('Quinto Año', 5),
                ('Sexto Año', 6),
                ('Séptimo Año', 7);
            CREATE TABLE cursos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                id_ciclo INTEGER NOT NULL,
                FOREIGN KEY (id_ciclo) REFERENCES ciclos (id)
            );
            INSERT INTO cursos (nombre, id_ciclo) VALUES ('3° A', 3);
            ",
        )
        .unwrap();
        let old_tercer: i64 = conn
            .query_row(
                "SELECT id FROM ciclos WHERE nombre = 'Tercer Año'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        prepare_connection(&conn).unwrap();
        let new_tercer: i64 = conn
            .query_row(
                "SELECT c.id FROM ciclos c JOIN niveles n ON n.id = c.id_nivel
                 WHERE c.nombre = 'Tercer Año' AND n.codigo = 'secundaria'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(old_tercer, new_tercer);
        let curso_ciclo: i64 = conn
            .query_row("SELECT id_ciclo FROM cursos WHERE nombre = '3° A'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(curso_ciclo, new_tercer);
        let grados: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM ciclos c JOIN niveles n ON n.id = c.id_nivel
                 WHERE n.codigo = 'primaria'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(grados, 7);
        let cursos_sql: String = conn
            .query_row(
                "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'cursos'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(
            !cursos_sql.to_ascii_lowercase().contains("ciclos_old"),
            "la FK de cursos no debe quedar apuntando a ciclos_old: {cursos_sql}"
        );
        conn.execute(
            "INSERT INTO cursos (nombre, id_ciclo) VALUES ('4° A', 4)",
            [],
        )
        .expect("insertar curso después de migrar ciclos");
        prepare_connection(&conn).unwrap();
        let ciclos: i64 = conn
            .query_row("SELECT COUNT(*) FROM ciclos", [], |row| row.get(0))
            .unwrap();
        assert_eq!(ciclos, 14);
    }

    #[test]
    fn repara_cursos_con_fk_a_ciclos_old() {
        let conn = Connection::open_in_memory().unwrap();
        apply_pragmas(&conn).unwrap();
        conn.execute_batch(&schema_without_pragmas()).unwrap();
        conn.execute(
            "INSERT INTO escuelas (id_jurisdiccion, nombre) VALUES (1, 'Normal 1')",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO materias (nombre) VALUES ('Inglés')", [])
            .unwrap();
        conn.execute(
            "INSERT INTO cursos (nombre, id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo)
             VALUES ('3° A Inglés', 1, 1, 1, 1, 1, 1)",
            [],
        )
        .unwrap();

        conn.pragma_update(None, "foreign_keys", false).unwrap();
        conn.pragma_update(None, "legacy_alter_table", true).unwrap();
        conn.execute_batch(
            "
            CREATE TABLE cursos_broken (
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
                FOREIGN KEY (id_ciclo) REFERENCES ciclos_old (id) ON DELETE RESTRICT,
                FOREIGN KEY (id_materia) REFERENCES materias (id) ON DELETE RESTRICT,
                FOREIGN KEY (id_anio_lectivo) REFERENCES anios_lectivos (id) ON DELETE RESTRICT,
                UNIQUE (id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo)
            );
            INSERT INTO cursos_broken
                (id, nombre, id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo, orientacion)
            SELECT id, nombre, id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo, orientacion
            FROM cursos;
            DROP TABLE cursos;
            ALTER TABLE cursos_broken RENAME TO cursos;
            ",
        )
        .unwrap();
        conn.pragma_update(None, "legacy_alter_table", false).unwrap();
        conn.pragma_update(None, "foreign_keys", true).unwrap();

        let before = conn.execute(
            "INSERT INTO cursos (nombre, id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo)
             VALUES ('1° B Inglés', 1, 1, 2, 1, 1, 1)",
            [],
        );
        let err = before.expect_err("el INSERT debe fallar mientras la FK apunte a ciclos_old");
        assert!(
            err.to_string().contains("ciclos_old"),
            "error inesperado: {err}"
        );

        prepare_connection(&conn).unwrap();

        conn.execute(
            "INSERT INTO cursos (nombre, id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo)
             VALUES ('1° B Inglés', 1, 1, 2, 1, 1, 1)",
            [],
        )
        .expect("guardar curso después de reparar FK");
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM cursos", [], |row| row.get(0))
            .unwrap();
        assert_eq!(n, 2);
        let cursos_sql: String = conn
            .query_row(
                "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'cursos'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(!cursos_sql.to_ascii_lowercase().contains("ciclos_old"));
    }

    #[test]
    fn unique_active_year_is_enforced() {
        let conn = memory();
        let err = conn.execute("INSERT INTO anios_lectivos (anio, activo) VALUES (2027, 1)", []);
        assert!(err.is_err(), "un solo año lectivo activo");
    }

    #[test]
    fn foreign_keys_block_orphan_curso() {
        let conn = memory();
        let err = conn.execute(
            "INSERT INTO cursos (nombre, id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo)
             VALUES ('x', 999, 1, 1, 1, 1, 1)",
            [],
        );
        assert!(err.is_err(), "FK escuela debe fallar con foreign_keys=ON");
    }

    #[test]
    fn prepare_does_not_drop_existing_data() {
        let conn = memory();
        conn.execute(
            "INSERT INTO materias (nombre) VALUES ('Matemática')",
            [],
        )
        .unwrap();
        prepare_connection(&conn).unwrap();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM materias", [], |row| row.get(0))
            .unwrap();
        assert_eq!(n, 1);
    }
}
