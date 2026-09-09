//! Paso 2: dictados (cursos) del año lectivo activo.

use crate::db::Db;
use crate::domain::{Curso, CursoWrite};
use rusqlite::{params, Connection};
use tauri::State;

fn opt_text(value: Option<String>) -> Option<String> {
    value.and_then(|s| {
        let t = s.trim();
        if t.is_empty() {
            None
        } else {
            Some(t.to_string())
        }
    })
}

fn require_nombre(nombre: &str) -> Result<String, String> {
    let t = nombre.trim();
    if t.is_empty() {
        Err("El nombre es obligatorio.".into())
    } else {
        Ok(t.to_string())
    }
}

fn map_curso(row: &rusqlite::Row<'_>) -> rusqlite::Result<Curso> {
    Ok(Curso {
        id: row.get(0)?,
        nombre: row.get(1)?,
        id_escuela: row.get(2)?,
        id_turno: row.get(3)?,
        id_division: row.get(4)?,
        id_ciclo: row.get(5)?,
        id_materia: row.get(6)?,
        id_anio_lectivo: row.get(7)?,
        orientacion: row.get(8)?,
    })
}

const CURSO_COLS: &str = "id, nombre, id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo, orientacion";

fn get_curso_sql(conn: &Connection, id: i64) -> rusqlite::Result<Curso> {
    conn.query_row(
        &format!("SELECT {CURSO_COLS} FROM cursos WHERE id = ?1"),
        [id],
        map_curso,
    )
}

fn list_cursos_sql(conn: &Connection, id_anio_lectivo: i64) -> rusqlite::Result<Vec<Curso>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {CURSO_COLS}
         FROM cursos
         WHERE id_anio_lectivo = ?1
         ORDER BY nombre COLLATE NOCASE"
    ))?;
    let rows = stmt.query_map([id_anio_lectivo], map_curso)?;
    rows.collect()
}

fn curso_from_write(curso: CursoWrite) -> Result<CursoWrite, String> {
    Ok(CursoWrite {
        nombre: require_nombre(&curso.nombre)?,
        id_escuela: curso.id_escuela,
        id_turno: curso.id_turno,
        id_division: curso.id_division,
        id_ciclo: curso.id_ciclo,
        id_materia: curso.id_materia,
        id_anio_lectivo: curso.id_anio_lectivo,
        orientacion: opt_text(curso.orientacion),
    })
}

fn insert_curso_sql(conn: &Connection, w: &CursoWrite) -> rusqlite::Result<Curso> {
    conn.execute(
        "INSERT INTO cursos (
            nombre, id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo, orientacion
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            w.nombre,
            w.id_escuela,
            w.id_turno,
            w.id_division,
            w.id_ciclo,
            w.id_materia,
            w.id_anio_lectivo,
            w.orientacion,
        ],
    )?;
    get_curso_sql(conn, conn.last_insert_rowid())
}

fn update_curso_sql(conn: &Connection, id: i64, w: &CursoWrite) -> rusqlite::Result<Curso> {
    let n = conn.execute(
        "UPDATE cursos
         SET nombre = ?1, id_escuela = ?2, id_turno = ?3, id_division = ?4,
             id_ciclo = ?5, id_materia = ?6, id_anio_lectivo = ?7, orientacion = ?8
         WHERE id = ?9",
        params![
            w.nombre,
            w.id_escuela,
            w.id_turno,
            w.id_division,
            w.id_ciclo,
            w.id_materia,
            w.id_anio_lectivo,
            w.orientacion,
            id,
        ],
    )?;
    if n == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    get_curso_sql(conn, id)
}

fn delete_curso_sql(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    let n = conn.execute("DELETE FROM cursos WHERE id = ?1", [id])?;
    if n == 0 {
        Err(rusqlite::Error::QueryReturnedNoRows)
    } else {
        Ok(())
    }
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_cursos(db: State<'_, Db>, id_anio_lectivo: i64) -> Result<Vec<Curso>, String> {
    db.with_conn(|conn| list_cursos_sql(conn, id_anio_lectivo))
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_curso(db: State<'_, Db>, id: i64) -> Result<Curso, String> {
    db.with_conn(|conn| get_curso_sql(conn, id))
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_curso(db: State<'_, Db>, curso: CursoWrite) -> Result<Curso, String> {
    let w = curso_from_write(curso)?;
    db.with_conn(|conn| insert_curso_sql(conn, &w))
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_curso(db: State<'_, Db>, id: i64, curso: CursoWrite) -> Result<Curso, String> {
    let w = curso_from_write(curso)?;
    db.with_conn(|conn| update_curso_sql(conn, id, &w))
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_curso(db: State<'_, Db>, id: i64) -> Result<(), String> {
    db.with_conn(|conn| delete_curso_sql(conn, id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{map_sql_error, prepare_connection};

    fn memory() -> Connection {
        let conn = Connection::open_in_memory().expect("memory sqlite");
        prepare_connection(&conn).expect("prepare");
        conn
    }

    fn seed_escuela_materia(conn: &Connection) {
        conn.execute(
            "INSERT INTO escuelas (id_jurisdiccion, nombre, nombre_corto) VALUES (1, 'ENET Nº 1', 'ENET')",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO materias (nombre) VALUES ('English')", [])
            .unwrap();
    }

    fn ciclo(conn: &Connection, nivel: &str, orden: i64) -> i64 {
        conn.query_row(
            "SELECT c.id FROM ciclos c JOIN niveles n ON n.id = c.id_nivel
             WHERE n.codigo = ?1 AND c.orden = ?2",
            rusqlite::params![nivel, orden],
            |row| row.get(0),
        )
        .unwrap()
    }

    fn write(nombre: &str, id_ciclo: i64, id_anio: i64) -> CursoWrite {
        CursoWrite {
            nombre: nombre.into(),
            id_escuela: 1,
            id_turno: 1,
            id_division: 1,
            id_ciclo,
            id_materia: 1,
            id_anio_lectivo: id_anio,
            orientacion: None,
        }
    }

    #[test]
    fn grado_y_anio_mismo_grupo_conviven() {
        let conn = memory();
        seed_escuela_materia(&conn);
        let grado = ciclo(&conn, "primaria", 3);
        let anio = ciclo(&conn, "secundaria", 3);
        insert_curso_sql(&conn, &write("3° A English — primaria", grado, 1)).unwrap();
        insert_curso_sql(&conn, &write("3° A English — ENET", anio, 1)).unwrap();
        let n = list_cursos_sql(&conn, 1).unwrap();
        assert_eq!(n.len(), 2);
    }

    #[test]
    fn unique_dictado_mismo_anio() {
        let conn = memory();
        seed_escuela_materia(&conn);
        let grado = ciclo(&conn, "primaria", 3);
        insert_curso_sql(&conn, &write("3° A English", grado, 1)).unwrap();
        let err = insert_curso_sql(&conn, &write("otro nombre", grado, 1)).unwrap_err();
        assert_eq!(
            map_sql_error(err),
            "Ya existe un dictado con esa escuela, grupo, materia y año."
        );
    }

    #[test]
    fn list_filtra_anio_lectivo() {
        let conn = memory();
        seed_escuela_materia(&conn);
        conn.execute(
            "INSERT INTO anios_lectivos (anio, activo) VALUES (2027, 0)",
            [],
        )
        .unwrap();
        let anio_2027: i64 = conn
            .query_row(
                "SELECT id FROM anios_lectivos WHERE anio = 2027",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let grado = ciclo(&conn, "primaria", 1);
        insert_curso_sql(&conn, &write("1° A 2026", grado, 1)).unwrap();
        insert_curso_sql(&conn, &write("1° A 2027", grado, anio_2027)).unwrap();
        assert_eq!(list_cursos_sql(&conn, 1).unwrap().len(), 1);
        assert_eq!(list_cursos_sql(&conn, anio_2027).unwrap().len(), 1);
    }
}
