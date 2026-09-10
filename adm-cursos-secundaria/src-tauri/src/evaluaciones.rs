//! Paso 5: evaluaciones (escrito, oral, TP, integrador, recuperatorio).
//! El calendario de exámenes se deriva de esta tabla, no de `eventos`.

use crate::db::{app_err, Db};
use crate::domain::{Evaluacion, EvaluacionWrite};
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

fn require_ponderacion(raw: &str) -> Result<String, String> {
    let t = raw.trim().replace(',', ".");
    if t.is_empty() {
        return Ok("1".into());
    }
    if t.contains('e') || t.contains('E') || t.contains('+') {
        return Err("La ponderación no es un decimal válido.".into());
    }
    let (entero, frac) = match t.split_once('.') {
        Some((a, b)) => (a, b),
        None => (t.as_str(), ""),
    };
    if entero.starts_with('-')
        || entero.is_empty() && frac.is_empty()
        || !entero.chars().all(|c| c.is_ascii_digit())
        || !frac.chars().all(|c| c.is_ascii_digit())
        || (entero.is_empty() && frac.is_empty())
    {
        return Err("La ponderación no es un decimal válido.".into());
    }
    if entero.is_empty() {
        return Err("La ponderación no es un decimal válido.".into());
    }
    let hay_valor = entero.chars().any(|c| c != '0') || frac.chars().any(|c| c != '0');
    if !hay_valor {
        return Err("La ponderación debe ser mayor que 0.".into());
    }
    Ok(t)
}

fn map_evaluacion(row: &rusqlite::Row<'_>) -> rusqlite::Result<Evaluacion> {
    Ok(Evaluacion {
        id: row.get(0)?,
        id_curso: row.get(1)?,
        id_tipo_evaluacion: row.get(2)?,
        id_evaluacion_origen: row.get(3)?,
        titulo: row.get(4)?,
        fecha: row.get(5)?,
        tema: row.get(6)?,
        ponderacion: row.get(7)?,
    })
}

const EVAL_COLS: &str = "id, id_curso, id_tipo_evaluacion, id_evaluacion_origen, titulo, fecha, tema, ponderacion";

fn changes_or_missing(n: usize) -> rusqlite::Result<()> {
    if n == 0 {
        Err(rusqlite::Error::QueryReturnedNoRows)
    } else {
        Ok(())
    }
}

fn get_evaluacion_sql(conn: &Connection, id: i64) -> rusqlite::Result<Evaluacion> {
    conn.query_row(
        &format!("SELECT {EVAL_COLS} FROM evaluaciones WHERE id = ?1"),
        [id],
        map_evaluacion,
    )
}

fn list_evaluaciones_sql(
    conn: &Connection,
    id_anio_lectivo: i64,
) -> rusqlite::Result<Vec<Evaluacion>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT e.id, e.id_curso, e.id_tipo_evaluacion, e.id_evaluacion_origen,
                e.titulo, e.fecha, e.tema, e.ponderacion
         FROM evaluaciones e
         JOIN cursos c ON c.id = e.id_curso
         WHERE c.id_anio_lectivo = ?1
         ORDER BY e.fecha DESC, e.titulo COLLATE NOCASE"
    ))?;
    let rows = stmt.query_map([id_anio_lectivo], map_evaluacion)?;
    rows.collect()
}

fn list_evaluaciones_de_curso_sql(
    conn: &Connection,
    id_curso: i64,
) -> rusqlite::Result<Vec<Evaluacion>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {EVAL_COLS}
         FROM evaluaciones
         WHERE id_curso = ?1
         ORDER BY fecha DESC, titulo COLLATE NOCASE"
    ))?;
    let rows = stmt.query_map([id_curso], map_evaluacion)?;
    rows.collect()
}

fn evaluacion_from_write(e: EvaluacionWrite) -> Result<EvaluacionWrite, String> {
    Ok(EvaluacionWrite {
        id_curso: e.id_curso,
        id_tipo_evaluacion: e.id_tipo_evaluacion,
        id_evaluacion_origen: e.id_evaluacion_origen.filter(|id| *id > 0),
        titulo: require_nombre(&e.titulo)?,
        fecha: require_fecha(&e.fecha)?,
        tema: opt_text(e.tema),
        ponderacion: require_ponderacion(&e.ponderacion)?,
    })
}

fn tipo_codigo_sql(conn: &Connection, id: i64) -> rusqlite::Result<String> {
    conn.query_row(
        "SELECT codigo FROM tipos_evaluacion WHERE id = ?1",
        [id],
        |row| row.get(0),
    )
}

fn prepare_write(
    conn: &Connection,
    mut w: EvaluacionWrite,
    editing_id: Option<i64>,
) -> rusqlite::Result<EvaluacionWrite> {
    let codigo = tipo_codigo_sql(conn, w.id_tipo_evaluacion)?;
    if codigo == "recuperatorio" {
        let origen = w
            .id_evaluacion_origen
            .ok_or_else(|| app_err("Elegí la evaluación que se recupera."))?;
        if editing_id == Some(origen) {
            return Err(app_err("Un recuperatorio no puede apuntar a sí mismo."));
        }
        let orig = get_evaluacion_sql(conn, origen).optional()?.ok_or_else(|| {
            app_err("No se encontró la evaluación de origen.")
        })?;
        if orig.id_curso != w.id_curso {
            return Err(app_err(
                "El recuperatorio tiene que ser del mismo curso que la evaluación de origen.",
            ));
        }
        w.id_evaluacion_origen = Some(origen);
    } else {
        w.id_evaluacion_origen = None;
    }
    Ok(w)
}

fn insert_evaluacion_sql(conn: &Connection, raw: EvaluacionWrite) -> rusqlite::Result<Evaluacion> {
    let w = prepare_write(conn, raw, None)?;
    conn.execute(
        "INSERT INTO evaluaciones (
            id_curso, id_tipo_evaluacion, id_evaluacion_origen, titulo, fecha, tema, ponderacion
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            w.id_curso,
            w.id_tipo_evaluacion,
            w.id_evaluacion_origen,
            w.titulo,
            w.fecha,
            w.tema,
            w.ponderacion,
        ],
    )?;
    get_evaluacion_sql(conn, conn.last_insert_rowid())
}

fn update_evaluacion_sql(
    conn: &Connection,
    id: i64,
    raw: EvaluacionWrite,
) -> rusqlite::Result<Evaluacion> {
    let w = prepare_write(conn, raw, Some(id))?;
    let n = conn.execute(
        "UPDATE evaluaciones
         SET id_curso = ?1, id_tipo_evaluacion = ?2, id_evaluacion_origen = ?3,
             titulo = ?4, fecha = ?5, tema = ?6, ponderacion = ?7
         WHERE id = ?8",
        params![
            w.id_curso,
            w.id_tipo_evaluacion,
            w.id_evaluacion_origen,
            w.titulo,
            w.fecha,
            w.tema,
            w.ponderacion,
            id,
        ],
    )?;
    changes_or_missing(n)?;
    get_evaluacion_sql(conn, id)
}

fn delete_evaluacion_sql(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    let n = conn.execute("DELETE FROM evaluaciones WHERE id = ?1", [id])?;
    changes_or_missing(n)
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_evaluaciones(
    db: State<'_, Db>,
    id_anio_lectivo: i64,
) -> Result<Vec<Evaluacion>, String> {
    db.with_conn(|conn| list_evaluaciones_sql(conn, id_anio_lectivo))
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_evaluaciones_de_curso(
    db: State<'_, Db>,
    id_curso: i64,
) -> Result<Vec<Evaluacion>, String> {
    db.with_conn(|conn| list_evaluaciones_de_curso_sql(conn, id_curso))
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_evaluacion(db: State<'_, Db>, id: i64) -> Result<Evaluacion, String> {
    db.with_conn(|conn| get_evaluacion_sql(conn, id))
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_evaluacion(
    db: State<'_, Db>,
    evaluacion: EvaluacionWrite,
) -> Result<Evaluacion, String> {
    let w = evaluacion_from_write(evaluacion)?;
    db.with_conn(|conn| insert_evaluacion_sql(conn, w))
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_evaluacion(
    db: State<'_, Db>,
    id: i64,
    evaluacion: EvaluacionWrite,
) -> Result<Evaluacion, String> {
    let w = evaluacion_from_write(evaluacion)?;
    db.with_conn(|conn| update_evaluacion_sql(conn, id, w))
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_evaluacion(db: State<'_, Db>, id: i64) -> Result<(), String> {
    db.with_conn(|conn| delete_evaluacion_sql(conn, id))
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
             VALUES ('3° B 2027', 1, 1, 1, ?1, 1, ?2)",
            rusqlite::params![grado, anio_2027],
        )
        .unwrap();
        (c1, conn.last_insert_rowid())
    }

    fn tipo(conn: &Connection, codigo: &str) -> i64 {
        conn.query_row(
            "SELECT id FROM tipos_evaluacion WHERE codigo = ?1",
            [codigo],
            |row| row.get(0),
        )
        .unwrap()
    }

    fn write(
        id_curso: i64,
        id_tipo: i64,
        titulo: &str,
        fecha: &str,
        origen: Option<i64>,
        ponderacion: &str,
    ) -> EvaluacionWrite {
        EvaluacionWrite {
            id_curso,
            id_tipo_evaluacion: id_tipo,
            id_evaluacion_origen: origen,
            titulo: titulo.into(),
            fecha: fecha.into(),
            tema: Some("present perfect".into()),
            ponderacion: ponderacion.into(),
        }
    }

    #[test]
    fn alta_escrito_ponderacion_default() {
        let conn = memory();
        let (c1, _) = seed_cursos(&conn);
        let w = evaluacion_from_write(write(c1, tipo(&conn, "escrito"), "Escrito 1", "2026-05-12", None, ""))
            .unwrap();
        assert_eq!(w.ponderacion, "1");
        let saved = insert_evaluacion_sql(&conn, w).unwrap();
        assert_eq!(saved.titulo, "Escrito 1");
        assert_eq!(saved.fecha, "2026-05-12");
        assert_eq!(saved.ponderacion, "1");
        assert_eq!(saved.id_evaluacion_origen, None);
    }

    #[test]
    fn recuperatorio_pide_origen_del_mismo_curso() {
        let conn = memory();
        let (c1, c2) = seed_cursos(&conn);
        let escrito = tipo(&conn, "escrito");
        let recu = tipo(&conn, "recuperatorio");
        let origen = insert_evaluacion_sql(
            &conn,
            evaluacion_from_write(write(c1, escrito, "Escrito 1", "2026-05-12", None, "1")).unwrap(),
        )
        .unwrap();
        let sin = insert_evaluacion_sql(
            &conn,
            evaluacion_from_write(write(c1, recu, "Recu 1", "2026-06-01", None, "1")).unwrap(),
        )
        .unwrap_err();
        assert_eq!(map_sql_error(sin), "Elegí la evaluación que se recupera.");

        let otro_curso = insert_evaluacion_sql(
            &conn,
            evaluacion_from_write(write(
                c2,
                recu,
                "Recu otro",
                "2026-06-01",
                Some(origen.id),
                "1",
            ))
            .unwrap(),
        )
        .unwrap_err();
        assert_eq!(
            map_sql_error(otro_curso),
            "El recuperatorio tiene que ser del mismo curso que la evaluación de origen."
        );

        let ok = insert_evaluacion_sql(
            &conn,
            evaluacion_from_write(write(
                c1,
                recu,
                "Recuperatorio 1",
                "2026-06-01",
                Some(origen.id),
                "1",
            ))
            .unwrap(),
        )
        .unwrap();
        assert_eq!(ok.id_evaluacion_origen, Some(origen.id));
    }

    #[test]
    fn no_recuperatorio_limpia_origen() {
        let conn = memory();
        let (c1, _) = seed_cursos(&conn);
        let escrito = tipo(&conn, "escrito");
        let origen = insert_evaluacion_sql(
            &conn,
            evaluacion_from_write(write(c1, escrito, "Escrito 1", "2026-05-12", None, "1")).unwrap(),
        )
        .unwrap();
        let saved = insert_evaluacion_sql(
            &conn,
            evaluacion_from_write(write(
                c1,
                escrito,
                "Escrito 2",
                "2026-05-20",
                Some(origen.id),
                "2",
            ))
            .unwrap(),
        )
        .unwrap();
        assert_eq!(saved.id_evaluacion_origen, None);
        assert_eq!(saved.ponderacion, "2");
    }

    #[test]
    fn ponderacion_cero_o_invalida() {
        assert_eq!(
            require_ponderacion("0").unwrap_err(),
            "La ponderación debe ser mayor que 0."
        );
        assert_eq!(
            require_ponderacion("0.00").unwrap_err(),
            "La ponderación debe ser mayor que 0."
        );
        assert!(require_ponderacion("1,5").unwrap() == "1.5");
        assert!(require_ponderacion("2.5").is_ok());
    }

    #[test]
    fn list_filtra_anio_y_baja_cascada_notas() {
        let conn = memory();
        let (c1, c2) = seed_cursos(&conn);
        let escrito = tipo(&conn, "escrito");
        let a = insert_evaluacion_sql(
            &conn,
            evaluacion_from_write(write(c1, escrito, "Escrito 1", "2026-05-12", None, "1")).unwrap(),
        )
        .unwrap();
        insert_evaluacion_sql(
            &conn,
            evaluacion_from_write(write(c2, escrito, "Escrito 2027", "2027-05-12", None, "1")).unwrap(),
        )
        .unwrap();
        assert_eq!(list_evaluaciones_sql(&conn, 1).unwrap().len(), 1);

        conn.execute(
            "INSERT INTO alumnos (nombre, apellido) VALUES ('Juan', 'Pérez')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO notas (id_evaluacion, id_alumno, valor, ausente) VALUES (?1, 1, '8', 0)",
            [a.id],
        )
        .unwrap();
        delete_evaluacion_sql(&conn, a.id).unwrap();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM notas", [], |row| row.get(0))
            .unwrap();
        assert_eq!(n, 0);
    }
}
