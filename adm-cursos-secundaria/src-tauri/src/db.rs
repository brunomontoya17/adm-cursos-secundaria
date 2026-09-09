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
        let guard = self.conn.lock().map_err(|e| e.to_string())?;
        match &*guard {
            Ok(conn) => status_of(conn, Some(&self.path)).map_err(|e| e.to_string()),
            Err(message) => Err(message.clone()),
        }
    }
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
        assert!(user_table_count(&conn).unwrap() >= 19);
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
