//! Paso 4: grilla semanal del profesor (`horarios`). No es el horario del colegio.

use crate::db::Db;
use crate::domain::{Horario, HorarioWrite};
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

fn parse_hhmm(value: &str) -> Result<(u8, u8), String> {
    let t = value.trim();
    let mut parts = t.split(':');
    let hh = parts.next().unwrap_or("");
    let mm = parts.next().unwrap_or("");
    if parts.next().is_some() || hh.len() != 2 || mm.len() != 2 {
        return Err("La hora debe ser HH:MM.".into());
    }
    let h: u8 = hh.parse().map_err(|_| "La hora debe ser HH:MM.")?;
    let m: u8 = mm.parse().map_err(|_| "La hora debe ser HH:MM.")?;
    if h > 23 || m > 59 {
        return Err("La hora debe ser HH:MM.".into());
    }
    Ok((h, m))
}

fn require_dia(dia: i64) -> Result<i64, String> {
    if (1..=7).contains(&dia) {
        Ok(dia)
    } else {
        Err("El día debe ser entre 1 (lunes) y 7 (domingo).".into())
    }
}

fn require_rango(inicio: &str, fin: &str) -> Result<(String, String), String> {
    let (ih, im) = parse_hhmm(inicio)?;
    let (fh, fm) = parse_hhmm(fin)?;
    let start = u16::from(ih) * 60 + u16::from(im);
    let end = u16::from(fh) * 60 + u16::from(fm);
    if end <= start {
        return Err("La hora de fin debe ser posterior a la de inicio.".into());
    }
    Ok((format!("{ih:02}:{im:02}"), format!("{fh:02}:{fm:02}")))
}

fn map_horario(row: &rusqlite::Row<'_>) -> rusqlite::Result<Horario> {
    Ok(Horario {
        id: row.get(0)?,
        id_curso: row.get(1)?,
        dia_semana: row.get(2)?,
        hora_inicio: row.get(3)?,
        hora_fin: row.get(4)?,
        aula: row.get(5)?,
    })
}

const HORARIO_COLS: &str = "id, id_curso, dia_semana, hora_inicio, hora_fin, aula";

fn changes_or_missing(n: usize) -> rusqlite::Result<()> {
    if n == 0 {
        Err(rusqlite::Error::QueryReturnedNoRows)
    } else {
        Ok(())
    }
}

fn get_horario_sql(conn: &Connection, id: i64) -> rusqlite::Result<Horario> {
    conn.query_row(
        &format!("SELECT {HORARIO_COLS} FROM horarios WHERE id = ?1"),
        [id],
        map_horario,
    )
}

fn list_horarios_sql(conn: &Connection, id_anio_lectivo: i64) -> rusqlite::Result<Vec<Horario>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT h.id, h.id_curso, h.dia_semana, h.hora_inicio, h.hora_fin, h.aula
         FROM horarios h
         JOIN cursos c ON c.id = h.id_curso
         WHERE c.id_anio_lectivo = ?1
         ORDER BY h.dia_semana, h.hora_inicio, c.nombre COLLATE NOCASE"
    ))?;
    let rows = stmt.query_map([id_anio_lectivo], map_horario)?;
    rows.collect()
}

fn list_horarios_de_curso_sql(conn: &Connection, id_curso: i64) -> rusqlite::Result<Vec<Horario>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {HORARIO_COLS}
         FROM horarios
         WHERE id_curso = ?1
         ORDER BY dia_semana, hora_inicio"
    ))?;
    let rows = stmt.query_map([id_curso], map_horario)?;
    rows.collect()
}

fn horario_from_write(horario: HorarioWrite) -> Result<HorarioWrite, String> {
    let (hora_inicio, hora_fin) = require_rango(&horario.hora_inicio, &horario.hora_fin)?;
    Ok(HorarioWrite {
        id_curso: horario.id_curso,
        dia_semana: require_dia(horario.dia_semana)?,
        hora_inicio,
        hora_fin,
        aula: opt_text(horario.aula),
    })
}

fn insert_horario_sql(conn: &Connection, w: &HorarioWrite) -> rusqlite::Result<Horario> {
    conn.execute(
        "INSERT INTO horarios (id_curso, dia_semana, hora_inicio, hora_fin, aula)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![w.id_curso, w.dia_semana, w.hora_inicio, w.hora_fin, w.aula],
    )?;
    get_horario_sql(conn, conn.last_insert_rowid())
}

fn update_horario_sql(conn: &Connection, id: i64, w: &HorarioWrite) -> rusqlite::Result<Horario> {
    let n = conn.execute(
        "UPDATE horarios
         SET id_curso = ?1, dia_semana = ?2, hora_inicio = ?3, hora_fin = ?4, aula = ?5
         WHERE id = ?6",
        params![w.id_curso, w.dia_semana, w.hora_inicio, w.hora_fin, w.aula, id],
    )?;
    changes_or_missing(n)?;
    get_horario_sql(conn, id)
}

fn delete_horario_sql(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    let n = conn.execute("DELETE FROM horarios WHERE id = ?1", [id])?;
    changes_or_missing(n)
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_horarios(db: State<'_, Db>, id_anio_lectivo: i64) -> Result<Vec<Horario>, String> {
    db.with_conn(|conn| list_horarios_sql(conn, id_anio_lectivo))
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_horarios_de_curso(db: State<'_, Db>, id_curso: i64) -> Result<Vec<Horario>, String> {
    db.with_conn(|conn| list_horarios_de_curso_sql(conn, id_curso))
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_horario(db: State<'_, Db>, horario: HorarioWrite) -> Result<Horario, String> {
    let w = horario_from_write(horario)?;
    db.with_conn(|conn| insert_horario_sql(conn, &w))
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_horario(
    db: State<'_, Db>,
    id: i64,
    horario: HorarioWrite,
) -> Result<Horario, String> {
    let w = horario_from_write(horario)?;
    db.with_conn(|conn| update_horario_sql(conn, id, &w))
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_horario(db: State<'_, Db>, id: i64) -> Result<(), String> {
    db.with_conn(|conn| delete_horario_sql(conn, id))
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

    fn seed_cursos(conn: &Connection) -> (i64, i64) {
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
             VALUES ('3° B English 2027', 1, 1, 1, ?1, 1, ?2)",
            rusqlite::params![grado, anio_2027],
        )
        .unwrap();
        (c1, conn.last_insert_rowid())
    }

    fn write(id_curso: i64, dia: i64, inicio: &str, fin: &str) -> HorarioWrite {
        HorarioWrite {
            id_curso,
            dia_semana: dia,
            hora_inicio: inicio.into(),
            hora_fin: fin.into(),
            aula: Some("12".into()),
        }
    }

    #[test]
    fn alta_lunes_tarde() {
        let conn = memory();
        let (c1, _) = seed_cursos(&conn);
        let h = insert_horario_sql(&conn, &write(c1, 1, "14:00", "15:20")).unwrap();
        assert_eq!(h.dia_semana, 1);
        assert_eq!(h.hora_inicio, "14:00");
        assert_eq!(h.aula.as_deref(), Some("12"));
    }

    #[test]
    fn unique_curso_dia_hora() {
        let conn = memory();
        let (c1, _) = seed_cursos(&conn);
        insert_horario_sql(&conn, &write(c1, 1, "14:00", "15:20")).unwrap();
        let err = insert_horario_sql(&conn, &write(c1, 1, "14:00", "16:00")).unwrap_err();
        assert_eq!(
            map_sql_error(err),
            "Ya hay un bloque de ese curso ese día a esa hora."
        );
        insert_horario_sql(&conn, &write(c1, 1, "15:20", "16:40")).unwrap();
        insert_horario_sql(&conn, &write(c1, 2, "14:00", "15:20")).unwrap();
    }

    #[test]
    fn fin_debe_ser_posterior() {
        let err = horario_from_write(write(1, 1, "15:20", "14:00")).unwrap_err();
        assert_eq!(err, "La hora de fin debe ser posterior a la de inicio.");
        let eq = horario_from_write(write(1, 1, "14:00", "14:00")).unwrap_err();
        assert_eq!(eq, "La hora de fin debe ser posterior a la de inicio.");
    }

    #[test]
    fn list_filtra_anio() {
        let conn = memory();
        let (c1, c2) = seed_cursos(&conn);
        insert_horario_sql(&conn, &write(c1, 1, "14:00", "15:20")).unwrap();
        insert_horario_sql(&conn, &write(c2, 1, "08:00", "09:20")).unwrap();
        assert_eq!(list_horarios_sql(&conn, 1).unwrap().len(), 1);
        assert_eq!(list_horarios_de_curso_sql(&conn, c1).unwrap().len(), 1);
    }

    #[test]
    fn aula_vacia_queda_null() {
        let w = horario_from_write(HorarioWrite {
            id_curso: 1,
            dia_semana: 3,
            hora_inicio: " 08:00 ".into(),
            hora_fin: "09:20".into(),
            aula: Some("  ".into()),
        })
        .unwrap();
        assert_eq!(w.hora_inicio, "08:00");
        assert_eq!(w.aula, None);
    }
}
