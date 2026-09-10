//! Paso 6: notas del dictado (una por evaluación × alumno inscripto).
//! `valor` TEXT decimal 1–10, o NULL si ausente / aún no cargada. El promedio no se persiste.

use crate::db::{app_err, Db};
use crate::domain::{Nota, NotaWrite};
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

fn parse_decimal(raw: &str) -> Result<String, String> {
    let t = raw.trim().replace(',', ".");
    if t.is_empty() {
        return Err("La nota no es un decimal válido.".into());
    }
    if t.contains('e') || t.contains('E') || t.contains('+') {
        return Err("La nota no es un decimal válido.".into());
    }
    let (entero, frac) = match t.split_once('.') {
        Some((a, b)) => (a, b),
        None => (t.as_str(), ""),
    };
    if entero.starts_with('-')
        || entero.is_empty()
        || !entero.chars().all(|c| c.is_ascii_digit())
        || !frac.chars().all(|c| c.is_ascii_digit())
    {
        return Err("La nota no es un decimal válido.".into());
    }
    Ok(t)
}

fn require_valor_1_10(raw: &str) -> Result<String, String> {
    let t = parse_decimal(raw)?;
    let (entero, frac) = match t.split_once('.') {
        Some((a, b)) => (a, b),
        None => (t.as_str(), ""),
    };
    let n: u32 = entero
        .parse()
        .map_err(|_| "La nota no es un decimal válido.")?;
    if n > 10 || (n == 10 && frac.chars().any(|c| c != '0')) || n < 1 {
        return Err("La nota tiene que estar entre 1 y 10.".into());
    }
    Ok(t)
}

fn nota_from_write(n: NotaWrite) -> Result<NotaWrite, String> {
    let comentario = opt_text(n.comentario);
    let ausente = if n.ausente != 0 { 1 } else { 0 };
    if ausente == 1 {
        if n
            .valor
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .is_some()
        {
            return Err("Si está ausente, la nota tiene que quedar vacía.".into());
        }
        return Ok(NotaWrite {
            id_evaluacion: n.id_evaluacion,
            id_alumno: n.id_alumno,
            valor: None,
            ausente: 1,
            comentario,
        });
    }
    let valor = match n.valor {
        None => None,
        Some(s) if s.trim().is_empty() => None,
        Some(s) => Some(require_valor_1_10(&s)?),
    };
    Ok(NotaWrite {
        id_evaluacion: n.id_evaluacion,
        id_alumno: n.id_alumno,
        valor,
        ausente: 0,
        comentario,
    })
}

fn map_nota(row: &rusqlite::Row<'_>) -> rusqlite::Result<Nota> {
    Ok(Nota {
        id: row.get(0)?,
        id_evaluacion: row.get(1)?,
        id_alumno: row.get(2)?,
        valor: row.get(3)?,
        ausente: row.get(4)?,
        comentario: row.get(5)?,
    })
}

const NOTA_COLS: &str = "id, id_evaluacion, id_alumno, valor, ausente, comentario";

fn changes_or_missing(n: usize) -> rusqlite::Result<()> {
    if n == 0 {
        Err(rusqlite::Error::QueryReturnedNoRows)
    } else {
        Ok(())
    }
}

fn get_nota_par_sql(
    conn: &Connection,
    id_evaluacion: i64,
    id_alumno: i64,
) -> rusqlite::Result<Option<Nota>> {
    conn.query_row(
        &format!(
            "SELECT {NOTA_COLS} FROM notas WHERE id_evaluacion = ?1 AND id_alumno = ?2"
        ),
        params![id_evaluacion, id_alumno],
        map_nota,
    )
    .optional()
}

fn list_notas_de_curso_sql(conn: &Connection, id_curso: i64) -> rusqlite::Result<Vec<Nota>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT n.id, n.id_evaluacion, n.id_alumno, n.valor, n.ausente, n.comentario
         FROM notas n
         JOIN evaluaciones e ON e.id = n.id_evaluacion
         WHERE e.id_curso = ?1
         ORDER BY n.id"
    ))?;
    let rows = stmt.query_map([id_curso], map_nota)?;
    rows.collect()
}

fn curso_de_evaluacion(conn: &Connection, id_evaluacion: i64) -> rusqlite::Result<i64> {
    conn.query_row(
        "SELECT id_curso FROM evaluaciones WHERE id = ?1",
        [id_evaluacion],
        |row| row.get(0),
    )
    .optional()?
    .ok_or_else(|| app_err("No se encontró la evaluación."))
}

fn alumno_inscripto(conn: &Connection, id_alumno: i64, id_curso: i64) -> rusqlite::Result<bool> {
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM alumnos_cursos WHERE id_alumno = ?1 AND id_curso = ?2",
        params![id_alumno, id_curso],
        |row| row.get(0),
    )?;
    Ok(n > 0)
}

fn prepare_write(conn: &Connection, w: NotaWrite) -> rusqlite::Result<NotaWrite> {
    let id_curso = curso_de_evaluacion(conn, w.id_evaluacion)?;
    if !alumno_inscripto(conn, w.id_alumno, id_curso)? {
        return Err(app_err(
            "El alumno tiene que estar inscripto en el curso de la evaluación.",
        ));
    }
    Ok(w)
}

fn es_vacia(w: &NotaWrite) -> bool {
    w.ausente == 0 && w.valor.is_none() && w.comentario.is_none()
}

fn upsert_nota_sql(conn: &Connection, raw: NotaWrite) -> rusqlite::Result<Option<Nota>> {
    let w = prepare_write(conn, raw)?;
    if es_vacia(&w) {
        conn.execute(
            "DELETE FROM notas WHERE id_evaluacion = ?1 AND id_alumno = ?2",
            params![w.id_evaluacion, w.id_alumno],
        )?;
        return Ok(None);
    }
    conn.execute(
        "INSERT INTO notas (id_evaluacion, id_alumno, valor, ausente, comentario)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id_evaluacion, id_alumno) DO UPDATE SET
           valor = excluded.valor,
           ausente = excluded.ausente,
           comentario = excluded.comentario",
        params![
            w.id_evaluacion,
            w.id_alumno,
            w.valor,
            w.ausente,
            w.comentario,
        ],
    )?;
    get_nota_par_sql(conn, w.id_evaluacion, w.id_alumno)
}

fn delete_nota_sql(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    let n = conn.execute("DELETE FROM notas WHERE id = ?1", [id])?;
    changes_or_missing(n)
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_notas_de_curso(db: State<'_, Db>, id_curso: i64) -> Result<Vec<Nota>, String> {
    db.with_conn(|conn| list_notas_de_curso_sql(conn, id_curso))
}

#[tauri::command(rename_all = "snake_case")]
pub fn upsert_nota(db: State<'_, Db>, nota: NotaWrite) -> Result<Option<Nota>, String> {
    let w = nota_from_write(nota)?;
    db.with_conn(|conn| upsert_nota_sql(conn, w))
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_nota(db: State<'_, Db>, id: i64) -> Result<(), String> {
    db.with_conn(|conn| delete_nota_sql(conn, id))
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
        let escrito: i64 = conn
            .query_row(
                "SELECT id FROM tipos_evaluacion WHERE codigo = 'escrito'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        conn.execute(
            "INSERT INTO evaluaciones (id_curso, id_tipo_evaluacion, titulo, fecha, ponderacion)
             VALUES (?1, ?2, 'Escrito 1', '2026-05-12', '2')",
            params![curso, escrito],
        )
        .unwrap();
        let eval_id = conn.last_insert_rowid();
        (curso, otro, juan, ana, eval_id)
    }

    fn write(
        id_evaluacion: i64,
        id_alumno: i64,
        valor: Option<&str>,
        ausente: i64,
        comentario: Option<&str>,
    ) -> NotaWrite {
        NotaWrite {
            id_evaluacion,
            id_alumno,
            valor: valor.map(str::to_string),
            ausente,
            comentario: comentario.map(str::to_string),
        }
    }

    #[test]
    fn alta_nota_inscrito() {
        let conn = memory();
        let (_, _, juan, _, eval_id) = seed(&conn);
        let saved = upsert_nota_sql(
            &conn,
            nota_from_write(write(eval_id, juan, Some("8,5"), 0, Some("bien"))).unwrap(),
        )
        .unwrap()
        .unwrap();
        assert_eq!(saved.valor.as_deref(), Some("8.5"));
        assert_eq!(saved.ausente, 0);
        assert_eq!(saved.comentario.as_deref(), Some("bien"));
    }

    #[test]
    fn ausente_sin_valor() {
        let conn = memory();
        let (_, _, juan, _, eval_id) = seed(&conn);
        let saved = upsert_nota_sql(
            &conn,
            nota_from_write(write(eval_id, juan, None, 1, None)).unwrap(),
        )
        .unwrap()
        .unwrap();
        assert_eq!(saved.valor, None);
        assert_eq!(saved.ausente, 1);
    }

    #[test]
    fn ausente_con_valor_falla() {
        assert_eq!(
            nota_from_write(write(1, 1, Some("7"), 1, None)).unwrap_err(),
            "Si está ausente, la nota tiene que quedar vacía."
        );
    }

    #[test]
    fn no_inscrito_falla() {
        let conn = memory();
        let (_, _, _, ana, eval_id) = seed(&conn);
        let err = upsert_nota_sql(
            &conn,
            nota_from_write(write(eval_id, ana, Some("7"), 0, None)).unwrap(),
        )
        .unwrap_err();
        assert_eq!(
            map_sql_error(err),
            "El alumno tiene que estar inscripto en el curso de la evaluación."
        );
    }

    #[test]
    fn alumno_de_otro_curso_falla() {
        let conn = memory();
        let (_, otro, juan, _, eval_id) = seed(&conn);
        conn.execute(
            "INSERT INTO alumnos_cursos (id_alumno, id_curso) VALUES (?1, ?2)",
            params![juan, otro],
        )
        .unwrap();
        // Juan está en el curso de la eval; este caso es Ana no inscripta ya cubierto.
        // Un alumno solo en `otro` no puede tener nota en eval del primero.
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
        let err = upsert_nota_sql(
            &conn,
            nota_from_write(write(eval_id, luis, Some("6"), 0, None)).unwrap(),
        )
        .unwrap_err();
        assert_eq!(
            map_sql_error(err),
            "El alumno tiene que estar inscripto en el curso de la evaluación."
        );
    }

    #[test]
    fn escala_1_a_10() {
        assert_eq!(
            require_valor_1_10("0").unwrap_err(),
            "La nota tiene que estar entre 1 y 10."
        );
        assert_eq!(
            require_valor_1_10("10.01").unwrap_err(),
            "La nota tiene que estar entre 1 y 10."
        );
        assert_eq!(
            require_valor_1_10("11").unwrap_err(),
            "La nota tiene que estar entre 1 y 10."
        );
        assert_eq!(require_valor_1_10("1").unwrap(), "1");
        assert_eq!(require_valor_1_10("10").unwrap(), "10");
        assert_eq!(require_valor_1_10("10.00").unwrap(), "10.00");
        assert_eq!(require_valor_1_10("8,5").unwrap(), "8.5");
    }

    #[test]
    fn upsert_actualiza_y_vacio_borra() {
        let conn = memory();
        let (curso, _, juan, _, eval_id) = seed(&conn);
        upsert_nota_sql(
            &conn,
            nota_from_write(write(eval_id, juan, Some("7"), 0, None)).unwrap(),
        )
        .unwrap();
        let updated = upsert_nota_sql(
            &conn,
            nota_from_write(write(eval_id, juan, Some("9"), 0, None)).unwrap(),
        )
        .unwrap()
        .unwrap();
        assert_eq!(updated.valor.as_deref(), Some("9"));
        assert_eq!(list_notas_de_curso_sql(&conn, curso).unwrap().len(), 1);

        let cleared = upsert_nota_sql(
            &conn,
            nota_from_write(write(eval_id, juan, None, 0, None)).unwrap(),
        )
        .unwrap();
        assert!(cleared.is_none());
        assert_eq!(list_notas_de_curso_sql(&conn, curso).unwrap().len(), 0);
    }

    #[test]
    fn list_solo_del_curso() {
        let conn = memory();
        let (curso, otro, juan, _, eval_id) = seed(&conn);
        conn.execute(
            "INSERT INTO alumnos_cursos (id_alumno, id_curso) VALUES (?1, ?2)",
            params![juan, otro],
        )
        .unwrap();
        let escrito: i64 = conn
            .query_row(
                "SELECT id FROM tipos_evaluacion WHERE codigo = 'escrito'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        conn.execute(
            "INSERT INTO evaluaciones (id_curso, id_tipo_evaluacion, titulo, fecha, ponderacion)
             VALUES (?1, ?2, 'Escrito otro', '2026-06-01', '1')",
            params![otro, escrito],
        )
        .unwrap();
        let eval_otro = conn.last_insert_rowid();
        upsert_nota_sql(
            &conn,
            nota_from_write(write(eval_id, juan, Some("8"), 0, None)).unwrap(),
        )
        .unwrap();
        upsert_nota_sql(
            &conn,
            nota_from_write(write(eval_otro, juan, Some("5"), 0, None)).unwrap(),
        )
        .unwrap();
        assert_eq!(list_notas_de_curso_sql(&conn, curso).unwrap().len(), 1);
        assert_eq!(list_notas_de_curso_sql(&conn, otro).unwrap().len(), 1);
    }
}
