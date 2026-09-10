//! Paso 7: pase de lista de esa hora de clase.
//! Unique (curso, alumno, fecha). El alumno tiene que estar en `alumnos_cursos`.

use crate::db::{app_err, Db};
use crate::domain::{Asistencia, AsistenciaWrite};
use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;

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

fn asistencia_from_write(a: AsistenciaWrite) -> Result<AsistenciaWrite, String> {
    Ok(AsistenciaWrite {
        id_curso: a.id_curso,
        id_alumno: a.id_alumno,
        fecha: require_fecha(&a.fecha)?,
        id_estado_asistencia: a.id_estado_asistencia,
    })
}

fn map_asistencia(row: &rusqlite::Row<'_>) -> rusqlite::Result<Asistencia> {
    Ok(Asistencia {
        id: row.get(0)?,
        id_curso: row.get(1)?,
        id_alumno: row.get(2)?,
        fecha: row.get(3)?,
        id_estado_asistencia: row.get(4)?,
    })
}

const ASI_COLS: &str = "id, id_curso, id_alumno, fecha, id_estado_asistencia";

fn changes_or_missing(n: usize) -> rusqlite::Result<()> {
    if n == 0 {
        Err(rusqlite::Error::QueryReturnedNoRows)
    } else {
        Ok(())
    }
}

fn get_asistencia_par_sql(
    conn: &Connection,
    id_curso: i64,
    id_alumno: i64,
    fecha: &str,
) -> rusqlite::Result<Option<Asistencia>> {
    conn.query_row(
        &format!(
            "SELECT {ASI_COLS} FROM asistencias
             WHERE id_curso = ?1 AND id_alumno = ?2 AND fecha = ?3"
        ),
        params![id_curso, id_alumno, fecha],
        map_asistencia,
    )
    .optional()
}

fn list_asistencias_sql(
    conn: &Connection,
    id_curso: i64,
    fecha: &str,
) -> rusqlite::Result<Vec<Asistencia>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {ASI_COLS}
         FROM asistencias
         WHERE id_curso = ?1 AND fecha = ?2
         ORDER BY id"
    ))?;
    let rows = stmt.query_map(params![id_curso, fecha], map_asistencia)?;
    rows.collect()
}

fn curso_existe(conn: &Connection, id_curso: i64) -> rusqlite::Result<bool> {
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM cursos WHERE id = ?1",
        [id_curso],
        |row| row.get(0),
    )?;
    Ok(n > 0)
}

fn alumno_inscripto(conn: &Connection, id_alumno: i64, id_curso: i64) -> rusqlite::Result<bool> {
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM alumnos_cursos WHERE id_alumno = ?1 AND id_curso = ?2",
        params![id_alumno, id_curso],
        |row| row.get(0),
    )?;
    Ok(n > 0)
}

fn estado_existe(conn: &Connection, id: i64) -> rusqlite::Result<bool> {
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM estados_asistencia WHERE id = ?1",
        [id],
        |row| row.get(0),
    )?;
    Ok(n > 0)
}

fn ids_nomina(conn: &Connection, id_curso: i64) -> rusqlite::Result<Vec<i64>> {
    let mut stmt = conn.prepare(
        "SELECT a.id
         FROM alumnos a
         JOIN alumnos_cursos ac ON ac.id_alumno = a.id
         WHERE ac.id_curso = ?1
         ORDER BY a.apellido COLLATE NOCASE, a.nombre COLLATE NOCASE",
    )?;
    let rows = stmt.query_map([id_curso], |row| row.get(0))?;
    rows.collect()
}

fn id_estado_presente(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row(
        "SELECT id FROM estados_asistencia WHERE codigo = 'presente'",
        [],
        |row| row.get(0),
    )
    .optional()?
    .ok_or_else(|| app_err("No se encontró el estado presente."))
}

fn prepare_write(conn: &Connection, w: AsistenciaWrite) -> rusqlite::Result<AsistenciaWrite> {
    if !curso_existe(conn, w.id_curso)? {
        return Err(app_err("No se encontró el curso."));
    }
    if !estado_existe(conn, w.id_estado_asistencia)? {
        return Err(app_err("El estado de asistencia no es válido."));
    }
    if !alumno_inscripto(conn, w.id_alumno, w.id_curso)? {
        return Err(app_err(
            "El alumno tiene que estar inscripto en el curso para pasar lista.",
        ));
    }
    Ok(w)
}

fn upsert_asistencia_sql(conn: &Connection, raw: AsistenciaWrite) -> rusqlite::Result<Asistencia> {
    let w = prepare_write(conn, raw)?;
    conn.execute(
        "INSERT INTO asistencias (id_curso, id_alumno, fecha, id_estado_asistencia)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(id_curso, id_alumno, fecha) DO UPDATE SET
           id_estado_asistencia = excluded.id_estado_asistencia",
        params![w.id_curso, w.id_alumno, w.fecha, w.id_estado_asistencia],
    )?;
    get_asistencia_par_sql(conn, w.id_curso, w.id_alumno, &w.fecha)?
        .ok_or_else(|| app_err("No se pudo guardar la asistencia."))
}

fn delete_asistencia_sql(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    let n = conn.execute("DELETE FROM asistencias WHERE id = ?1", [id])?;
    changes_or_missing(n)
}

fn marcar_presentes_sql(
    conn: &Connection,
    id_curso: i64,
    fecha: &str,
) -> rusqlite::Result<Vec<Asistencia>> {
    if !curso_existe(conn, id_curso)? {
        return Err(app_err("No se encontró el curso."));
    }
    let presente = id_estado_presente(conn)?;
    let nomina = ids_nomina(conn, id_curso)?;
    for id_alumno in nomina {
        upsert_asistencia_sql(
            conn,
            AsistenciaWrite {
                id_curso,
                id_alumno,
                fecha: fecha.to_string(),
                id_estado_asistencia: presente,
            },
        )?;
    }
    list_asistencias_sql(conn, id_curso, fecha)
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_asistencias(
    db: State<'_, Db>,
    id_curso: i64,
    fecha: String,
) -> Result<Vec<Asistencia>, String> {
    let fecha = require_fecha(&fecha)?;
    db.with_conn(|conn| list_asistencias_sql(conn, id_curso, &fecha))
}

#[tauri::command(rename_all = "snake_case")]
pub fn upsert_asistencia(
    db: State<'_, Db>,
    asistencia: AsistenciaWrite,
) -> Result<Asistencia, String> {
    let w = asistencia_from_write(asistencia)?;
    db.with_conn(|conn| upsert_asistencia_sql(conn, w))
}

#[tauri::command(rename_all = "snake_case")]
pub fn marcar_asistencias_presentes(
    db: State<'_, Db>,
    id_curso: i64,
    fecha: String,
) -> Result<Vec<Asistencia>, String> {
    let fecha = require_fecha(&fecha)?;
    db.with_conn(|conn| marcar_presentes_sql(conn, id_curso, &fecha))
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_asistencia(db: State<'_, Db>, id: i64) -> Result<(), String> {
    db.with_conn(|conn| delete_asistencia_sql(conn, id))
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

    fn seed(conn: &Connection) -> (i64, i64, i64, i64, i64) {
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
        let curso = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO cursos (nombre, id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo)
             VALUES ('3° A English', 1, 1, 2, ?1, 1, 1)",
            [grado],
        )
        .unwrap();
        let otro = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO alumnos (nombre, apellido) VALUES ('Juan', 'Pérez')",
            [],
        )
        .unwrap();
        let juan = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO alumnos (nombre, apellido) VALUES ('Ana', 'García')",
            [],
        )
        .unwrap();
        let ana = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO alumnos_cursos (id_alumno, id_curso) VALUES (?1, ?2)",
            params![juan, curso],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO alumnos_cursos (id_alumno, id_curso) VALUES (?1, ?2)",
            params![ana, curso],
        )
        .unwrap();
        (curso, otro, juan, ana, id_estado_presente(conn).unwrap())
    }

    fn estado(conn: &Connection, codigo: &str) -> i64 {
        conn.query_row(
            "SELECT id FROM estados_asistencia WHERE codigo = ?1",
            [codigo],
            |row| row.get(0),
        )
        .unwrap()
    }

    fn write(id_curso: i64, id_alumno: i64, fecha: &str, id_estado: i64) -> AsistenciaWrite {
        AsistenciaWrite {
            id_curso,
            id_alumno,
            fecha: fecha.into(),
            id_estado_asistencia: id_estado,
        }
    }

    #[test]
    fn alta_presente_inscrito() {
        let conn = memory();
        let (curso, _, juan, _, presente) = seed(&conn);
        let saved = upsert_asistencia_sql(
            &conn,
            asistencia_from_write(write(curso, juan, "2026-09-10", presente)).unwrap(),
        )
        .unwrap();
        assert_eq!(saved.id_alumno, juan);
        assert_eq!(saved.fecha, "2026-09-10");
        assert_eq!(saved.id_estado_asistencia, presente);
        assert_eq!(
            list_asistencias_sql(&conn, curso, "2026-09-10")
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn no_inscrito_falla() {
        let conn = memory();
        let (curso, _, _, _, presente) = seed(&conn);
        conn.execute(
            "INSERT INTO alumnos (nombre, apellido) VALUES ('Luis', 'Sosa')",
            [],
        )
        .unwrap();
        let luis = conn.last_insert_rowid();
        let err = upsert_asistencia_sql(
            &conn,
            asistencia_from_write(write(curso, luis, "2026-09-10", presente)).unwrap(),
        )
        .unwrap_err();
        assert_eq!(
            map_sql_error(err),
            "El alumno tiene que estar inscripto en el curso para pasar lista."
        );
    }

    #[test]
    fn alumno_de_otro_curso_falla() {
        let conn = memory();
        let (curso, otro, _, _, presente) = seed(&conn);
        conn.execute(
            "INSERT INTO alumnos (nombre, apellido) VALUES ('Luis', 'Sosa')",
            [],
        )
        .unwrap();
        let luis = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO alumnos_cursos (id_alumno, id_curso) VALUES (?1, ?2)",
            params![luis, otro],
        )
        .unwrap();
        let err = upsert_asistencia_sql(
            &conn,
            asistencia_from_write(write(curso, luis, "2026-09-10", presente)).unwrap(),
        )
        .unwrap_err();
        assert_eq!(
            map_sql_error(err),
            "El alumno tiene que estar inscripto en el curso para pasar lista."
        );
    }

    #[test]
    fn upsert_cambia_estado_misma_fecha() {
        let conn = memory();
        let (curso, _, juan, _, presente) = seed(&conn);
        let ausente = estado(&conn, "ausente");
        upsert_asistencia_sql(
            &conn,
            asistencia_from_write(write(curso, juan, "2026-09-10", presente)).unwrap(),
        )
        .unwrap();
        let updated = upsert_asistencia_sql(
            &conn,
            asistencia_from_write(write(curso, juan, "2026-09-10", ausente)).unwrap(),
        )
        .unwrap();
        assert_eq!(updated.id_estado_asistencia, ausente);
        assert_eq!(
            list_asistencias_sql(&conn, curso, "2026-09-10")
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn list_filtra_fecha() {
        let conn = memory();
        let (curso, _, juan, _, presente) = seed(&conn);
        upsert_asistencia_sql(
            &conn,
            asistencia_from_write(write(curso, juan, "2026-09-10", presente)).unwrap(),
        )
        .unwrap();
        upsert_asistencia_sql(
            &conn,
            asistencia_from_write(write(curso, juan, "2026-09-11", presente)).unwrap(),
        )
        .unwrap();
        assert_eq!(
            list_asistencias_sql(&conn, curso, "2026-09-10")
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            list_asistencias_sql(&conn, curso, "2026-09-12")
                .unwrap()
                .len(),
            0
        );
    }

    #[test]
    fn marcar_todos_presentes() {
        let conn = memory();
        let (curso, _, _, _, presente) = seed(&conn);
        let rows = marcar_presentes_sql(&conn, curso, "2026-09-10").unwrap();
        assert_eq!(rows.len(), 2);
        assert!(rows.iter().all(|a| a.id_estado_asistencia == presente));
    }

    #[test]
    fn fecha_invalida() {
        assert_eq!(
            require_fecha("10/09/2026").unwrap_err(),
            "La fecha debe ser YYYY-MM-DD."
        );
        assert!(require_fecha("2026-09-10").is_ok());
    }
}
