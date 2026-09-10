//! Paso 1: jurisdicciones, escuelas, materias y años lectivos.

use crate::db::Db;
use crate::domain::{
    AnioLectivo, Ciclo, Division, Escuela, EscuelaWrite, Jurisdiccion, Materia, MateriaWrite,
    Nivel, TipoEvaluacion, Turno,
};
use rusqlite::{params, Connection, OptionalExtension};
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

fn map_nivel(row: &rusqlite::Row<'_>) -> rusqlite::Result<Nivel> {
    Ok(Nivel {
        id: row.get(0)?,
        codigo: row.get(1)?,
        nombre: row.get(2)?,
    })
}

fn map_ciclo(row: &rusqlite::Row<'_>) -> rusqlite::Result<Ciclo> {
    Ok(Ciclo {
        id: row.get(0)?,
        id_nivel: row.get(1)?,
        nombre: row.get(2)?,
        orden: row.get(3)?,
    })
}

fn map_jurisdiccion(row: &rusqlite::Row<'_>) -> rusqlite::Result<Jurisdiccion> {
    Ok(Jurisdiccion {
        id: row.get(0)?,
        codigo: row.get(1)?,
        nombre: row.get(2)?,
    })
}

fn map_escuela(row: &rusqlite::Row<'_>) -> rusqlite::Result<Escuela> {
    Ok(Escuela {
        id: row.get(0)?,
        id_jurisdiccion: row.get(1)?,
        nombre: row.get(2)?,
        nombre_corto: row.get(3)?,
        direccion: row.get(4)?,
        telefono: row.get(5)?,
        email: row.get(6)?,
    })
}

fn map_materia(row: &rusqlite::Row<'_>) -> rusqlite::Result<Materia> {
    Ok(Materia {
        id: row.get(0)?,
        nombre: row.get(1)?,
    })
}

fn map_anio(row: &rusqlite::Row<'_>) -> rusqlite::Result<AnioLectivo> {
    Ok(AnioLectivo {
        id: row.get(0)?,
        anio: row.get(1)?,
        activo: row.get(2)?,
    })
}

fn changes_or_missing(n: usize) -> rusqlite::Result<()> {
    if n == 0 {
        Err(rusqlite::Error::QueryReturnedNoRows)
    } else {
        Ok(())
    }
}

fn list_niveles_sql(conn: &Connection) -> rusqlite::Result<Vec<Nivel>> {
    let mut stmt = conn.prepare("SELECT id, codigo, nombre FROM niveles ORDER BY id")?;
    let rows = stmt.query_map([], map_nivel)?;
    rows.collect()
}

fn list_ciclos_sql(conn: &Connection) -> rusqlite::Result<Vec<Ciclo>> {
    let mut stmt = conn.prepare(
        "SELECT c.id, c.id_nivel, c.nombre, c.orden
         FROM ciclos c
         JOIN niveles n ON n.id = c.id_nivel
         ORDER BY n.id, c.orden",
    )?;
    let rows = stmt.query_map([], map_ciclo)?;
    rows.collect()
}

fn list_jurisdicciones_sql(conn: &Connection) -> rusqlite::Result<Vec<Jurisdiccion>> {
    let mut stmt = conn.prepare("SELECT id, codigo, nombre FROM jurisdicciones ORDER BY id")?;
    let rows = stmt.query_map([], map_jurisdiccion)?;
    rows.collect()
}

fn list_turnos_sql(conn: &Connection) -> rusqlite::Result<Vec<Turno>> {
    let mut stmt = conn.prepare("SELECT id, nombre FROM turnos ORDER BY id")?;
    let rows = stmt.query_map([], |row| {
        Ok(Turno {
            id: row.get(0)?,
            nombre: row.get(1)?,
        })
    })?;
    rows.collect()
}

fn list_divisiones_sql(conn: &Connection) -> rusqlite::Result<Vec<Division>> {
    let mut stmt = conn.prepare("SELECT id, nombre FROM divisiones ORDER BY id")?;
    let rows = stmt.query_map([], |row| {
        Ok(Division {
            id: row.get(0)?,
            nombre: row.get(1)?,
        })
    })?;
    rows.collect()
}

fn list_tipos_evaluacion_sql(conn: &Connection) -> rusqlite::Result<Vec<TipoEvaluacion>> {
    let mut stmt =
        conn.prepare("SELECT id, codigo, nombre FROM tipos_evaluacion ORDER BY id")?;
    let rows = stmt.query_map([], |row| {
        Ok(TipoEvaluacion {
            id: row.get(0)?,
            codigo: row.get(1)?,
            nombre: row.get(2)?,
        })
    })?;
    rows.collect()
}

fn get_escuela(conn: &Connection, id: i64) -> rusqlite::Result<Escuela> {
    conn.query_row(
        "SELECT id, id_jurisdiccion, nombre, nombre_corto, direccion, telefono, email
         FROM escuelas WHERE id = ?1",
        [id],
        map_escuela,
    )
}

fn list_escuelas_sql(conn: &Connection) -> rusqlite::Result<Vec<Escuela>> {
    let mut stmt = conn.prepare(
        "SELECT id, id_jurisdiccion, nombre, nombre_corto, direccion, telefono, email
         FROM escuelas ORDER BY nombre COLLATE NOCASE",
    )?;
    let rows = stmt.query_map([], map_escuela)?;
    rows.collect()
}

fn insert_escuela_sql(conn: &Connection, w: &EscuelaWrite) -> rusqlite::Result<Escuela> {
    conn.execute(
        "INSERT INTO escuelas (id_jurisdiccion, nombre, nombre_corto, direccion, telefono, email)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            w.id_jurisdiccion,
            w.nombre,
            w.nombre_corto,
            w.direccion,
            w.telefono,
            w.email,
        ],
    )?;
    get_escuela(conn, conn.last_insert_rowid())
}

fn update_escuela_sql(conn: &Connection, id: i64, w: &EscuelaWrite) -> rusqlite::Result<Escuela> {
    let n = conn.execute(
        "UPDATE escuelas
         SET id_jurisdiccion = ?1, nombre = ?2, nombre_corto = ?3,
             direccion = ?4, telefono = ?5, email = ?6
         WHERE id = ?7",
        params![
            w.id_jurisdiccion,
            w.nombre,
            w.nombre_corto,
            w.direccion,
            w.telefono,
            w.email,
            id,
        ],
    )?;
    changes_or_missing(n)?;
    get_escuela(conn, id)
}

fn delete_escuela_sql(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    let n = conn.execute("DELETE FROM escuelas WHERE id = ?1", [id])?;
    changes_or_missing(n)
}

fn get_materia(conn: &Connection, id: i64) -> rusqlite::Result<Materia> {
    conn.query_row(
        "SELECT id, nombre FROM materias WHERE id = ?1",
        [id],
        map_materia,
    )
}

fn list_materias_sql(conn: &Connection) -> rusqlite::Result<Vec<Materia>> {
    let mut stmt =
        conn.prepare("SELECT id, nombre FROM materias ORDER BY nombre COLLATE NOCASE")?;
    let rows = stmt.query_map([], map_materia)?;
    rows.collect()
}

fn insert_materia_sql(conn: &Connection, nombre: &str) -> rusqlite::Result<Materia> {
    conn.execute("INSERT INTO materias (nombre) VALUES (?1)", [nombre])?;
    get_materia(conn, conn.last_insert_rowid())
}

fn update_materia_sql(conn: &Connection, id: i64, nombre: &str) -> rusqlite::Result<Materia> {
    let n = conn.execute(
        "UPDATE materias SET nombre = ?1 WHERE id = ?2",
        params![nombre, id],
    )?;
    changes_or_missing(n)?;
    get_materia(conn, id)
}

fn delete_materia_sql(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    let n = conn.execute("DELETE FROM materias WHERE id = ?1", [id])?;
    changes_or_missing(n)
}

fn list_anios_sql(conn: &Connection) -> rusqlite::Result<Vec<AnioLectivo>> {
    let mut stmt =
        conn.prepare("SELECT id, anio, activo FROM anios_lectivos ORDER BY anio DESC")?;
    let rows = stmt.query_map([], map_anio)?;
    rows.collect()
}

fn get_anio(conn: &Connection, id: i64) -> rusqlite::Result<AnioLectivo> {
    conn.query_row(
        "SELECT id, anio, activo FROM anios_lectivos WHERE id = ?1",
        [id],
        map_anio,
    )
}

fn insert_anio_sql(conn: &Connection, anio: i64) -> rusqlite::Result<AnioLectivo> {
    conn.execute(
        "INSERT INTO anios_lectivos (anio, activo) VALUES (?1, 0)",
        [anio],
    )?;
    get_anio(conn, conn.last_insert_rowid())
}

fn activar_anio_sql(conn: &mut Connection, id: i64) -> rusqlite::Result<AnioLectivo> {
    let exists: Option<i64> = conn
        .query_row(
            "SELECT id FROM anios_lectivos WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .optional()?;
    if exists.is_none() {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    let tx = conn.transaction()?;
    tx.execute("UPDATE anios_lectivos SET activo = 0 WHERE activo = 1", [])?;
    tx.execute("UPDATE anios_lectivos SET activo = 1 WHERE id = ?1", [id])?;
    tx.commit()?;
    get_anio(conn, id)
}

fn escuela_from_write(escuela: EscuelaWrite) -> Result<EscuelaWrite, String> {
    Ok(EscuelaWrite {
        id_jurisdiccion: escuela.id_jurisdiccion,
        nombre: require_nombre(&escuela.nombre)?,
        nombre_corto: opt_text(escuela.nombre_corto),
        direccion: opt_text(escuela.direccion),
        telefono: opt_text(escuela.telefono),
        email: opt_text(escuela.email),
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_niveles(db: State<'_, Db>) -> Result<Vec<Nivel>, String> {
    db.with_conn(list_niveles_sql)
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_ciclos(db: State<'_, Db>) -> Result<Vec<Ciclo>, String> {
    db.with_conn(list_ciclos_sql)
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_jurisdicciones(db: State<'_, Db>) -> Result<Vec<Jurisdiccion>, String> {
    db.with_conn(list_jurisdicciones_sql)
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_turnos(db: State<'_, Db>) -> Result<Vec<Turno>, String> {
    db.with_conn(list_turnos_sql)
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_divisiones(db: State<'_, Db>) -> Result<Vec<Division>, String> {
    db.with_conn(list_divisiones_sql)
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_tipos_evaluacion(db: State<'_, Db>) -> Result<Vec<TipoEvaluacion>, String> {
    db.with_conn(list_tipos_evaluacion_sql)
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_escuelas(db: State<'_, Db>) -> Result<Vec<Escuela>, String> {
    db.with_conn(list_escuelas_sql)
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_escuela(db: State<'_, Db>, escuela: EscuelaWrite) -> Result<Escuela, String> {
    let w = escuela_from_write(escuela)?;
    db.with_conn(|conn| insert_escuela_sql(conn, &w))
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_escuela(
    db: State<'_, Db>,
    id: i64,
    escuela: EscuelaWrite,
) -> Result<Escuela, String> {
    let w = escuela_from_write(escuela)?;
    db.with_conn(|conn| update_escuela_sql(conn, id, &w))
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_escuela(db: State<'_, Db>, id: i64) -> Result<(), String> {
    db.with_conn(|conn| delete_escuela_sql(conn, id))
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_materias(db: State<'_, Db>) -> Result<Vec<Materia>, String> {
    db.with_conn(list_materias_sql)
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_materia(db: State<'_, Db>, materia: MateriaWrite) -> Result<Materia, String> {
    let nombre = require_nombre(&materia.nombre)?;
    db.with_conn(|conn| insert_materia_sql(conn, &nombre))
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_materia(
    db: State<'_, Db>,
    id: i64,
    materia: MateriaWrite,
) -> Result<Materia, String> {
    let nombre = require_nombre(&materia.nombre)?;
    db.with_conn(|conn| update_materia_sql(conn, id, &nombre))
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_materia(db: State<'_, Db>, id: i64) -> Result<(), String> {
    db.with_conn(|conn| delete_materia_sql(conn, id))
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_anios_lectivos(db: State<'_, Db>) -> Result<Vec<AnioLectivo>, String> {
    db.with_conn(list_anios_sql)
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_anio_lectivo(db: State<'_, Db>, anio: i64) -> Result<AnioLectivo, String> {
    if !(2000..=2100).contains(&anio) {
        return Err("El año lectivo debe estar entre 2000 y 2100.".into());
    }
    db.with_conn(|conn| insert_anio_sql(conn, anio))
}

#[tauri::command(rename_all = "snake_case")]
pub fn activar_anio_lectivo(db: State<'_, Db>, id: i64) -> Result<AnioLectivo, String> {
    db.with_conn_mut(|conn| activar_anio_sql(conn, id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::prepare_connection;

    fn memory() -> Connection {
        let conn = Connection::open_in_memory().expect("memory sqlite");
        prepare_connection(&conn).expect("prepare");
        conn
    }

    fn write_escuela(id_jurisdiccion: i64, nombre: &str) -> EscuelaWrite {
        EscuelaWrite {
            id_jurisdiccion,
            nombre: nombre.into(),
            nombre_corto: Some("ENET".into()),
            direccion: None,
            telefono: None,
            email: None,
        }
    }

    #[test]
    fn escuelas_unique_per_jurisdiccion() {
        let conn = memory();
        let a = insert_escuela_sql(&conn, &write_escuela(1, "ENET Nº 1")).unwrap();
        assert_eq!(a.nombre_corto.as_deref(), Some("ENET"));
        let dup = insert_escuela_sql(&conn, &write_escuela(1, "ENET Nº 1")).unwrap_err();
        assert_eq!(
            crate::db::map_sql_error(dup),
            "Ya existe una escuela con ese nombre en esa jurisdicción."
        );
        let other = insert_escuela_sql(&conn, &write_escuela(2, "ENET Nº 1")).unwrap();
        assert_eq!(other.id_jurisdiccion, 2);
    }

    #[test]
    fn materia_unique_name() {
        let conn = memory();
        insert_materia_sql(&conn, "English").unwrap();
        assert!(insert_materia_sql(&conn, "English").is_err());
        let renamed = update_materia_sql(&conn, 1, "Inglés").unwrap();
        assert_eq!(renamed.nombre, "Inglés");
    }

    #[test]
    fn activar_anio_leaves_only_one_active() {
        let mut conn = memory();
        let nuevo = insert_anio_sql(&conn, 2027).unwrap();
        assert_eq!(nuevo.activo, 0);
        let activo = activar_anio_sql(&mut conn, nuevo.id).unwrap();
        assert_eq!(activo.activo, 1);
        let years = list_anios_sql(&conn).unwrap();
        let activos: Vec<_> = years.iter().filter(|y| y.activo == 1).collect();
        assert_eq!(activos.len(), 1);
        assert_eq!(activos[0].anio, 2027);
    }

    #[test]
    fn empty_optional_fields_store_null() {
        let conn = memory();
        let w = EscuelaWrite {
            id_jurisdiccion: 1,
            nombre: "  Normal 2  ".into(),
            nombre_corto: Some("  ".into()),
            direccion: Some("".into()),
            telefono: None,
            email: Some("  ".into()),
        };
        let normalized = escuela_from_write(w).unwrap();
        assert_eq!(normalized.nombre, "Normal 2");
        assert_eq!(normalized.nombre_corto, None);
        let saved = insert_escuela_sql(&conn, &normalized).unwrap();
        assert_eq!(saved.nombre, "Normal 2");
        assert_eq!(saved.nombre_corto, None);
        assert_eq!(saved.email, None);
    }
}
