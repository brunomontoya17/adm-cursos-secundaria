//! Paso 9: anotaciones del profesor sobre un alumno en ese dictado.
//! El alumno tiene que estar en `alumnos_cursos`.

use crate::db::{app_err, Db};
use crate::domain::{Observacion, ObservacionWrite};
use rusqlite::{params, Connection};
use tauri::State;

fn require_texto(value: &str) -> Result<String, String> {
    let t = value.trim();
    if t.is_empty() {
        Err("El texto es obligatorio.".into())
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

fn observacion_from_write(o: ObservacionWrite) -> Result<ObservacionWrite, String> {
    Ok(ObservacionWrite {
        id_alumno: o.id_alumno,
        id_curso: o.id_curso,
        id_tipo_observacion: o.id_tipo_observacion,
        fecha: require_fecha(&o.fecha)?,
        texto: require_texto(&o.texto)?,
    })
}

fn map_observacion(row: &rusqlite::Row<'_>) -> rusqlite::Result<Observacion> {
    Ok(Observacion {
        id: row.get(0)?,
        id_alumno: row.get(1)?,
        id_curso: row.get(2)?,
        id_tipo_observacion: row.get(3)?,
        fecha: row.get(4)?,
        texto: row.get(5)?,
    })
}

const OBS_COLS: &str = "id, id_alumno, id_curso, id_tipo_observacion, fecha, texto";

fn changes_or_missing(n: usize) -> rusqlite::Result<()> {
    if n == 0 {
        Err(rusqlite::Error::QueryReturnedNoRows)
    } else {
        Ok(())
    }
}

fn get_observacion_sql(conn: &Connection, id: i64) -> rusqlite::Result<Observacion> {
    conn.query_row(
        &format!("SELECT {OBS_COLS} FROM observaciones WHERE id = ?1"),
        [id],
        map_observacion,
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

fn tipo_existe(conn: &Connection, id: i64) -> rusqlite::Result<bool> {
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM tipos_observacion WHERE id = ?1",
        [id],
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

fn prepare_write(conn: &Connection, w: ObservacionWrite) -> rusqlite::Result<ObservacionWrite> {
    if !curso_existe(conn, w.id_curso)? {
        return Err(app_err("No se encontró el curso."));
    }
    if !tipo_existe(conn, w.id_tipo_observacion)? {
        return Err(app_err("El tipo de observación no es válido."));
    }
    if !alumno_inscripto(conn, w.id_alumno, w.id_curso)? {
        return Err(app_err(
            "El alumno tiene que estar inscripto en el curso para anotar una observación.",
        ));
    }
    Ok(w)
}

fn list_observaciones_sql(
    conn: &Connection,
    id_anio_lectivo: i64,
) -> rusqlite::Result<Vec<Observacion>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT o.id, o.id_alumno, o.id_curso, o.id_tipo_observacion, o.fecha, o.texto
         FROM observaciones o
         JOIN cursos c ON c.id = o.id_curso
         WHERE c.id_anio_lectivo = ?1
         ORDER BY o.fecha DESC, o.id DESC"
    ))?;
    let rows = stmt.query_map([id_anio_lectivo], map_observacion)?;
    rows.collect()
}

fn list_observaciones_de_curso_sql(
    conn: &Connection,
    id_curso: i64,
) -> rusqlite::Result<Vec<Observacion>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {OBS_COLS}
         FROM observaciones
         WHERE id_curso = ?1
         ORDER BY fecha DESC, id DESC"
    ))?;
    let rows = stmt.query_map([id_curso], map_observacion)?;
    rows.collect()
}

fn list_observaciones_de_alumno_sql(
    conn: &Connection,
    id_alumno: i64,
    id_anio_lectivo: i64,
) -> rusqlite::Result<Vec<Observacion>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT o.id, o.id_alumno, o.id_curso, o.id_tipo_observacion, o.fecha, o.texto
         FROM observaciones o
         JOIN cursos c ON c.id = o.id_curso
         WHERE o.id_alumno = ?1 AND c.id_anio_lectivo = ?2
         ORDER BY o.fecha DESC, o.id DESC"
    ))?;
    let rows = stmt.query_map(params![id_alumno, id_anio_lectivo], map_observacion)?;
    rows.collect()
}

fn insert_observacion_sql(conn: &Connection, raw: ObservacionWrite) -> rusqlite::Result<Observacion> {
    let w = prepare_write(conn, raw)?;
    conn.execute(
        "INSERT INTO observaciones (id_alumno, id_curso, id_tipo_observacion, fecha, texto)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            w.id_alumno,
            w.id_curso,
            w.id_tipo_observacion,
            w.fecha,
            w.texto,
        ],
    )?;
    get_observacion_sql(conn, conn.last_insert_rowid())
}

fn update_observacion_sql(
    conn: &Connection,
    id: i64,
    raw: ObservacionWrite,
) -> rusqlite::Result<Observacion> {
    let w = prepare_write(conn, raw)?;
    let n = conn.execute(
        "UPDATE observaciones
         SET id_alumno = ?1, id_curso = ?2, id_tipo_observacion = ?3, fecha = ?4, texto = ?5
         WHERE id = ?6",
        params![
            w.id_alumno,
            w.id_curso,
            w.id_tipo_observacion,
            w.fecha,
            w.texto,
            id,
        ],
    )?;
    changes_or_missing(n)?;
    get_observacion_sql(conn, id)
}

fn delete_observacion_sql(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    let n = conn.execute("DELETE FROM observaciones WHERE id = ?1", [id])?;
    changes_or_missing(n)
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_observaciones(
    db: State<'_, Db>,
    id_anio_lectivo: i64,
) -> Result<Vec<Observacion>, String> {
    db.with_conn(|conn| list_observaciones_sql(conn, id_anio_lectivo))
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_observaciones_de_curso(
    db: State<'_, Db>,
    id_curso: i64,
) -> Result<Vec<Observacion>, String> {
    db.with_conn(|conn| list_observaciones_de_curso_sql(conn, id_curso))
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_observaciones_de_alumno(
    db: State<'_, Db>,
    id_alumno: i64,
    id_anio_lectivo: i64,
) -> Result<Vec<Observacion>, String> {
    db.with_conn(|conn| list_observaciones_de_alumno_sql(conn, id_alumno, id_anio_lectivo))
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_observacion(
    db: State<'_, Db>,
    observacion: ObservacionWrite,
) -> Result<Observacion, String> {
    let w = observacion_from_write(observacion)?;
    db.with_conn(|conn| insert_observacion_sql(conn, w))
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_observacion(
    db: State<'_, Db>,
    id: i64,
    observacion: ObservacionWrite,
) -> Result<Observacion, String> {
    let w = observacion_from_write(observacion)?;
    db.with_conn(|conn| update_observacion_sql(conn, id, w))
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_observacion(db: State<'_, Db>, id: i64) -> Result<(), String> {
    db.with_conn(|conn| delete_observacion_sql(conn, id))
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
            "INSERT INTO alumnos_cursos (id_alumno, id_curso) VALUES (?1, ?2)",
            params![juan, curso],
        )
        .unwrap();
        (curso, otro, juan, tipo(conn, "seguimiento"), tipo(conn, "academica"))
    }

    fn tipo(conn: &Connection, codigo: &str) -> i64 {
        conn.query_row(
            "SELECT id FROM tipos_observacion WHERE codigo = ?1",
            [codigo],
            |row| row.get(0),
        )
        .unwrap()
    }

    fn write(
        id_alumno: i64,
        id_curso: i64,
        id_tipo: i64,
        fecha: &str,
        texto: &str,
    ) -> ObservacionWrite {
        ObservacionWrite {
            id_alumno,
            id_curso,
            id_tipo_observacion: id_tipo,
            fecha: fecha.into(),
            texto: texto.into(),
        }
    }

    #[test]
    fn alta_inscrito() {
        let conn = memory();
        let (curso, _, juan, seguimiento, _) = seed(&conn);
        let saved = insert_observacion_sql(
            &conn,
            observacion_from_write(write(
                juan,
                curso,
                seguimiento,
                "2026-09-09",
                "seguimiento — Juan Pérez — 3° B",
            ))
            .unwrap(),
        )
        .unwrap();
        assert_eq!(saved.id_alumno, juan);
        assert_eq!(saved.fecha, "2026-09-09");
        assert_eq!(saved.id_tipo_observacion, seguimiento);
        assert_eq!(list_observaciones_sql(&conn, 1).unwrap().len(), 1);
        assert_eq!(
            list_observaciones_de_curso_sql(&conn, curso)
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            list_observaciones_de_alumno_sql(&conn, juan, 1)
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn no_inscrito_falla() {
        let conn = memory();
        let (curso, _, _, seguimiento, _) = seed(&conn);
        conn.execute(
            "INSERT INTO alumnos (nombre, apellido) VALUES ('Luis', 'Sosa')",
            [],
        )
        .unwrap();
        let luis = conn.last_insert_rowid();
        let err = insert_observacion_sql(
            &conn,
            observacion_from_write(write(luis, curso, seguimiento, "2026-09-09", "nota")).unwrap(),
        )
        .unwrap_err();
        assert_eq!(
            map_sql_error(err),
            "El alumno tiene que estar inscripto en el curso para anotar una observación."
        );
    }

    #[test]
    fn alumno_de_otro_curso_falla() {
        let conn = memory();
        let (curso, otro, _, seguimiento, _) = seed(&conn);
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
        let err = insert_observacion_sql(
            &conn,
            observacion_from_write(write(luis, curso, seguimiento, "2026-09-09", "nota")).unwrap(),
        )
        .unwrap_err();
        assert_eq!(
            map_sql_error(err),
            "El alumno tiene que estar inscripto en el curso para anotar una observación."
        );
    }

    #[test]
    fn update_y_delete() {
        let conn = memory();
        let (curso, _, juan, seguimiento, academica) = seed(&conn);
        let saved = insert_observacion_sql(
            &conn,
            observacion_from_write(write(juan, curso, seguimiento, "2026-09-09", "inicial"))
                .unwrap(),
        )
        .unwrap();
        let updated = update_observacion_sql(
            &conn,
            saved.id,
            observacion_from_write(write(juan, curso, academica, "2026-09-10", "cambió")).unwrap(),
        )
        .unwrap();
        assert_eq!(updated.texto, "cambió");
        assert_eq!(updated.id_tipo_observacion, academica);
        assert_eq!(updated.fecha, "2026-09-10");
        delete_observacion_sql(&conn, saved.id).unwrap();
        assert_eq!(list_observaciones_sql(&conn, 1).unwrap().len(), 0);
    }

    #[test]
    fn list_filtra_anio() {
        let conn = memory();
        let (curso, _, juan, seguimiento, _) = seed(&conn);
        insert_observacion_sql(
            &conn,
            observacion_from_write(write(juan, curso, seguimiento, "2026-09-09", "este año"))
                .unwrap(),
        )
        .unwrap();
        conn.execute(
            "INSERT INTO anios_lectivos (anio, activo) VALUES (2025, 0)",
            [],
        )
        .unwrap();
        let anio_viejo = conn.last_insert_rowid();
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
             VALUES ('3° B 2025', 1, 1, 1, ?1, 1, ?2)",
            params![grado, anio_viejo],
        )
        .unwrap();
        let curso_viejo = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO alumnos_cursos (id_alumno, id_curso) VALUES (?1, ?2)",
            params![juan, curso_viejo],
        )
        .unwrap();
        insert_observacion_sql(
            &conn,
            observacion_from_write(write(
                juan,
                curso_viejo,
                seguimiento,
                "2025-04-01",
                "año anterior",
            ))
            .unwrap(),
        )
        .unwrap();
        assert_eq!(list_observaciones_sql(&conn, 1).unwrap().len(), 1);
        assert_eq!(
            list_observaciones_de_alumno_sql(&conn, juan, 1)
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            list_observaciones_de_alumno_sql(&conn, juan, anio_viejo)
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn texto_vacio() {
        assert_eq!(
            require_texto("   ").unwrap_err(),
            "El texto es obligatorio."
        );
    }

    #[test]
    fn fecha_invalida() {
        assert_eq!(
            require_fecha("09/09/2026").unwrap_err(),
            "La fecha debe ser YYYY-MM-DD."
        );
        assert!(require_fecha("2026-09-09").is_ok());
    }
}
