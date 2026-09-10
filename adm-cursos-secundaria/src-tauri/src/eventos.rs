//! Paso 8: eventos del quehacer (tema, entrega, reunión, junta, acto, otro).
//! El calendario de exámenes se deriva de `evaluaciones`, no de acá.
//! Tema y entrega siempre con curso; junta/acto/otro/reunión pueden ir sueltos.

use crate::db::{app_err, Db};
use crate::domain::{Evento, EventoWrite};
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
        Err("El título es obligatorio.".into())
    } else {
        Ok(t.to_string())
    }
}

fn require_fecha(value: &str) -> Result<String, String> {
    let t = value.trim();
    let bytes = t.as_bytes();
    if t.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return Err("La fecha debe ser YYYY-MM-DD.".into());
    }
    let y: i32 = t[0..4]
        .parse()
        .map_err(|_| "La fecha debe ser YYYY-MM-DD.")?;
    let m: u32 = t[5..7]
        .parse()
        .map_err(|_| "La fecha debe ser YYYY-MM-DD.")?;
    let d: u32 = t[8..10]
        .parse()
        .map_err(|_| "La fecha debe ser YYYY-MM-DD.")?;
    if !(2000..=2100).contains(&y) || !(1..=12).contains(&m) || d < 1 || d > 31 {
        return Err("La fecha no es válida.".into());
    }
    Ok(t.to_string())
}

fn opt_hora(value: Option<String>) -> Result<Option<String>, String> {
    let Some(raw) = opt_text(value) else {
        return Ok(None);
    };
    let t = if raw.len() >= 8 && raw.as_bytes().get(5) == Some(&b':') {
        raw[..5].to_string()
    } else {
        raw
    };
    let bytes = t.as_bytes();
    if t.len() != 5 || bytes[2] != b':' {
        return Err("La hora debe ser HH:MM.".into());
    }
    let h: u32 = t[0..2].parse().map_err(|_| "La hora debe ser HH:MM.")?;
    let m: u32 = t[3..5].parse().map_err(|_| "La hora debe ser HH:MM.")?;
    if h > 23 || m > 59 {
        return Err("La hora no es válida.".into());
    }
    Ok(Some(t))
}

fn evento_from_write(e: EventoWrite) -> Result<EventoWrite, String> {
    Ok(EventoWrite {
        id_curso: e.id_curso.filter(|id| *id > 0),
        id_tipo_evento: e.id_tipo_evento,
        fecha: require_fecha(&e.fecha)?,
        hora: opt_hora(e.hora)?,
        titulo: require_nombre(&e.titulo)?,
        descripcion: opt_text(e.descripcion),
    })
}

fn map_evento(row: &rusqlite::Row<'_>) -> rusqlite::Result<Evento> {
    Ok(Evento {
        id: row.get(0)?,
        id_curso: row.get(1)?,
        id_tipo_evento: row.get(2)?,
        fecha: row.get(3)?,
        hora: row.get(4)?,
        titulo: row.get(5)?,
        descripcion: row.get(6)?,
    })
}

const EVT_COLS: &str = "id, id_curso, id_tipo_evento, fecha, hora, titulo, descripcion";

fn changes_or_missing(n: usize) -> rusqlite::Result<()> {
    if n == 0 {
        Err(rusqlite::Error::QueryReturnedNoRows)
    } else {
        Ok(())
    }
}

fn get_evento_sql(conn: &Connection, id: i64) -> rusqlite::Result<Evento> {
    conn.query_row(
        &format!("SELECT {EVT_COLS} FROM eventos WHERE id = ?1"),
        [id],
        map_evento,
    )
}

fn tipo_codigo_sql(conn: &Connection, id: i64) -> rusqlite::Result<String> {
    conn.query_row(
        "SELECT codigo FROM tipos_evento WHERE id = ?1",
        [id],
        |row| row.get(0),
    )
}

fn curso_existe(conn: &Connection, id_curso: i64) -> rusqlite::Result<bool> {
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM cursos WHERE id = ?1",
        [id_curso],
        |row| row.get(0),
    )?;
    Ok(n > 0)
}

fn prepare_write(conn: &Connection, mut w: EventoWrite) -> rusqlite::Result<EventoWrite> {
    let codigo = tipo_codigo_sql(conn, w.id_tipo_evento)?;
    let pide_curso = codigo == "tema" || codigo == "entrega";
    if pide_curso {
        let id = w
            .id_curso
            .ok_or_else(|| app_err("Tema y entrega van siempre con un curso."))?;
        if !curso_existe(conn, id)? {
            return Err(app_err("No se encontró el curso."));
        }
        w.id_curso = Some(id);
    } else if let Some(id) = w.id_curso {
        if !curso_existe(conn, id)? {
            return Err(app_err("No se encontró el curso."));
        }
    }
    Ok(w)
}

fn list_eventos_sql(conn: &Connection, id_anio_lectivo: i64) -> rusqlite::Result<Vec<Evento>> {
    let anio: i64 = conn.query_row(
        "SELECT anio FROM anios_lectivos WHERE id = ?1",
        [id_anio_lectivo],
        |row| row.get(0),
    )?;
    let desde = format!("{anio:04}-01-01");
    let hasta = format!("{anio:04}-12-31");
    let mut stmt = conn.prepare(&format!(
        "SELECT e.id, e.id_curso, e.id_tipo_evento, e.fecha, e.hora, e.titulo, e.descripcion
         FROM eventos e
         LEFT JOIN cursos c ON c.id = e.id_curso
         WHERE c.id_anio_lectivo = ?1
            OR (e.id_curso IS NULL AND e.fecha >= ?2 AND e.fecha <= ?3)
         ORDER BY e.fecha, e.hora IS NULL, e.hora, e.titulo COLLATE NOCASE"
    ))?;
    let rows = stmt.query_map(params![id_anio_lectivo, desde, hasta], map_evento)?;
    rows.collect()
}

fn list_eventos_de_curso_sql(conn: &Connection, id_curso: i64) -> rusqlite::Result<Vec<Evento>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {EVT_COLS}
         FROM eventos
         WHERE id_curso = ?1
         ORDER BY fecha, hora IS NULL, hora, titulo COLLATE NOCASE"
    ))?;
    let rows = stmt.query_map([id_curso], map_evento)?;
    rows.collect()
}

fn insert_evento_sql(conn: &Connection, raw: EventoWrite) -> rusqlite::Result<Evento> {
    let w = prepare_write(conn, raw)?;
    conn.execute(
        "INSERT INTO eventos (id_curso, id_tipo_evento, fecha, hora, titulo, descripcion)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            w.id_curso,
            w.id_tipo_evento,
            w.fecha,
            w.hora,
            w.titulo,
            w.descripcion,
        ],
    )?;
    get_evento_sql(conn, conn.last_insert_rowid())
}

fn update_evento_sql(conn: &Connection, id: i64, raw: EventoWrite) -> rusqlite::Result<Evento> {
    let w = prepare_write(conn, raw)?;
    let n = conn.execute(
        "UPDATE eventos
         SET id_curso = ?1, id_tipo_evento = ?2, fecha = ?3, hora = ?4, titulo = ?5, descripcion = ?6
         WHERE id = ?7",
        params![
            w.id_curso,
            w.id_tipo_evento,
            w.fecha,
            w.hora,
            w.titulo,
            w.descripcion,
            id,
        ],
    )?;
    changes_or_missing(n)?;
    get_evento_sql(conn, id)
}

fn delete_evento_sql(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    let n = conn.execute("DELETE FROM eventos WHERE id = ?1", [id])?;
    changes_or_missing(n)
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_eventos(db: State<'_, Db>, id_anio_lectivo: i64) -> Result<Vec<Evento>, String> {
    db.with_conn(|conn| list_eventos_sql(conn, id_anio_lectivo))
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_eventos_de_curso(db: State<'_, Db>, id_curso: i64) -> Result<Vec<Evento>, String> {
    db.with_conn(|conn| list_eventos_de_curso_sql(conn, id_curso))
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_evento(db: State<'_, Db>, evento: EventoWrite) -> Result<Evento, String> {
    let w = evento_from_write(evento)?;
    db.with_conn(|conn| insert_evento_sql(conn, w))
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_evento(db: State<'_, Db>, id: i64, evento: EventoWrite) -> Result<Evento, String> {
    let w = evento_from_write(evento)?;
    db.with_conn(|conn| update_evento_sql(conn, id, w))
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_evento(db: State<'_, Db>, id: i64) -> Result<(), String> {
    db.with_conn(|conn| delete_evento_sql(conn, id))
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

    fn seed(conn: &Connection) -> (i64, i64) {
        conn.execute(
            "INSERT INTO escuelas (id_jurisdiccion, nombre) VALUES (1, 'ENET Nº 1')",
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
        conn.execute(
            "INSERT INTO cursos (nombre, id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo)
             VALUES ('3° B English', 1, 1, 1, ?1, 1, 1)",
            [grado],
        )
        .unwrap();
        let c1 = conn.last_insert_rowid();
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
        conn.execute(
            "INSERT INTO cursos (nombre, id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo)
             VALUES ('3° B 2027', 1, 1, 1, ?1, 1, ?2)",
            rusqlite::params![grado, anio_2027],
        )
        .unwrap();
        (c1, conn.last_insert_rowid())
    }

    fn tipo(conn: &Connection, codigo: &str) -> i64 {
        conn.query_row(
            "SELECT id FROM tipos_evento WHERE codigo = ?1",
            [codigo],
            |row| row.get(0),
        )
        .unwrap()
    }

    fn write(
        id_curso: Option<i64>,
        id_tipo: i64,
        titulo: &str,
        fecha: &str,
        hora: Option<&str>,
    ) -> EventoWrite {
        EventoWrite {
            id_curso,
            id_tipo_evento: id_tipo,
            fecha: fecha.into(),
            hora: hora.map(str::to_string),
            titulo: titulo.into(),
            descripcion: None,
        }
    }

    #[test]
    fn tema_pide_curso() {
        let conn = memory();
        let (c1, _) = seed(&conn);
        let tema = tipo(&conn, "tema");
        let err = insert_evento_sql(
            &conn,
            evento_from_write(write(None, tema, "present perfect", "2026-05-12", None)).unwrap(),
        )
        .unwrap_err();
        assert_eq!(
            map_sql_error(err),
            "Tema y entrega van siempre con un curso."
        );
        let ok = insert_evento_sql(
            &conn,
            evento_from_write(write(
                Some(c1),
                tema,
                "present perfect",
                "2026-05-12",
                Some("14:00"),
            ))
            .unwrap(),
        )
        .unwrap();
        assert_eq!(ok.id_curso, Some(c1));
        assert_eq!(ok.hora.as_deref(), Some("14:00"));
        assert_eq!(ok.titulo, "present perfect");
    }

    #[test]
    fn acto_sin_curso() {
        let conn = memory();
        let _ = seed(&conn);
        let acto = tipo(&conn, "acto");
        let saved = insert_evento_sql(
            &conn,
            evento_from_write(write(None, acto, "Acto 25 de mayo", "2026-05-25", None)).unwrap(),
        )
        .unwrap();
        assert_eq!(saved.id_curso, None);
        assert_eq!(saved.hora, None);
    }

    #[test]
    fn entrega_sin_curso_falla() {
        let conn = memory();
        let _ = seed(&conn);
        let entrega = tipo(&conn, "entrega");
        let err = insert_evento_sql(
            &conn,
            evento_from_write(write(None, entrega, "TP 1", "2026-06-01", None)).unwrap(),
        )
        .unwrap_err();
        assert_eq!(
            map_sql_error(err),
            "Tema y entrega van siempre con un curso."
        );
    }

    #[test]
    fn list_filtra_anio() {
        let conn = memory();
        let (c1, c2) = seed(&conn);
        let tema = tipo(&conn, "tema");
        let acto = tipo(&conn, "acto");
        insert_evento_sql(
            &conn,
            evento_from_write(write(Some(c1), tema, "present perfect", "2026-05-12", None)).unwrap(),
        )
        .unwrap();
        insert_evento_sql(
            &conn,
            evento_from_write(write(Some(c2), tema, "2027 tema", "2027-05-12", None)).unwrap(),
        )
        .unwrap();
        insert_evento_sql(
            &conn,
            evento_from_write(write(None, acto, "Acto 25 de mayo", "2026-05-25", None)).unwrap(),
        )
        .unwrap();
        insert_evento_sql(
            &conn,
            evento_from_write(write(None, acto, "Acto 2027", "2027-05-25", None)).unwrap(),
        )
        .unwrap();
        let y2026 = list_eventos_sql(&conn, 1).unwrap();
        assert_eq!(y2026.len(), 2);
        assert!(y2026.iter().any(|e| e.titulo == "present perfect"));
        assert!(y2026.iter().any(|e| e.titulo == "Acto 25 de mayo"));
    }

    #[test]
    fn hora_invalida() {
        assert_eq!(
            opt_hora(Some("25:00".into())).unwrap_err(),
            "La hora no es válida."
        );
        assert_eq!(opt_hora(Some("14:00:00".into())).unwrap(), Some("14:00".into()));
        assert_eq!(opt_hora(Some("  ".into())).unwrap(), None);
    }
}
