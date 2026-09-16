//! Paso 3: personas (alumnos) e inscripción a dictados (`alumnos_cursos`).

use crate::db::Db;
use crate::domain::{Alumno, AlumnoCurso, AlumnoWrite};
use rusqlite::{params, Connection};
use tauri::State;

fn require_nombre(nombre: &str, campo: &str) -> Result<String, String> {
    let t = nombre.trim();
    if t.is_empty() {
        Err(format!("El {campo} es obligatorio."))
    } else {
        Ok(t.to_string())
    }
}

fn map_alumno(row: &rusqlite::Row<'_>) -> rusqlite::Result<Alumno> {
    Ok(Alumno {
        id: row.get(0)?,
        nombre: row.get(1)?,
        apellido: row.get(2)?,
    })
}

fn map_inscripcion(row: &rusqlite::Row<'_>) -> rusqlite::Result<AlumnoCurso> {
    Ok(AlumnoCurso {
        id: row.get(0)?,
        id_alumno: row.get(1)?,
        id_curso: row.get(2)?,
    })
}

const ALUMNO_COLS: &str = "id, nombre, apellido";

fn changes_or_missing(n: usize) -> rusqlite::Result<()> {
    if n == 0 {
        Err(rusqlite::Error::QueryReturnedNoRows)
    } else {
        Ok(())
    }
}

fn get_alumno_sql(conn: &Connection, id: i64) -> rusqlite::Result<Alumno> {
    conn.query_row(
        &format!("SELECT {ALUMNO_COLS} FROM alumnos WHERE id = ?1"),
        [id],
        map_alumno,
    )
}

fn list_alumnos_sql(conn: &Connection) -> rusqlite::Result<Vec<Alumno>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {ALUMNO_COLS}
         FROM alumnos
         ORDER BY apellido COLLATE NOCASE, nombre COLLATE NOCASE"
    ))?;
    let rows = stmt.query_map([], map_alumno)?;
    rows.collect()
}

fn list_alumnos_de_curso_sql(conn: &Connection, id_curso: i64) -> rusqlite::Result<Vec<Alumno>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT a.id, a.nombre, a.apellido
         FROM alumnos a
         JOIN alumnos_cursos ac ON ac.id_alumno = a.id
         WHERE ac.id_curso = ?1
         ORDER BY a.apellido COLLATE NOCASE, a.nombre COLLATE NOCASE"
    ))?;
    let rows = stmt.query_map([id_curso], map_alumno)?;
    rows.collect()
}

fn list_inscripciones_sql(
    conn: &Connection,
    id_anio_lectivo: i64,
) -> rusqlite::Result<Vec<AlumnoCurso>> {
    let mut stmt = conn.prepare(
        "SELECT ac.id, ac.id_alumno, ac.id_curso
         FROM alumnos_cursos ac
         JOIN cursos c ON c.id = ac.id_curso
         WHERE c.id_anio_lectivo = ?1
         ORDER BY ac.id",
    )?;
    let rows = stmt.query_map([id_anio_lectivo], map_inscripcion)?;
    rows.collect()
}

fn get_inscripcion_sql(conn: &Connection, id: i64) -> rusqlite::Result<AlumnoCurso> {
    conn.query_row(
        "SELECT id, id_alumno, id_curso FROM alumnos_cursos WHERE id = ?1",
        [id],
        map_inscripcion,
    )
}

fn alumno_from_write(alumno: AlumnoWrite) -> Result<AlumnoWrite, String> {
    Ok(AlumnoWrite {
        nombre: require_nombre(&alumno.nombre, "nombre")?,
        apellido: require_nombre(&alumno.apellido, "apellido")?,
    })
}

fn insert_alumno_sql(conn: &Connection, w: &AlumnoWrite) -> rusqlite::Result<Alumno> {
    conn.execute(
        "INSERT INTO alumnos (nombre, apellido) VALUES (?1, ?2)",
        params![w.nombre, w.apellido],
    )?;
    get_alumno_sql(conn, conn.last_insert_rowid())
}

fn update_alumno_sql(conn: &Connection, id: i64, w: &AlumnoWrite) -> rusqlite::Result<Alumno> {
    let n = conn.execute(
        "UPDATE alumnos SET nombre = ?1, apellido = ?2 WHERE id = ?3",
        params![w.nombre, w.apellido, id],
    )?;
    changes_or_missing(n)?;
    get_alumno_sql(conn, id)
}

fn delete_alumno_sql(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    let n = conn.execute("DELETE FROM alumnos WHERE id = ?1", [id])?;
    changes_or_missing(n)
}

fn inscribir_sql(conn: &Connection, id_alumno: i64, id_curso: i64) -> rusqlite::Result<AlumnoCurso> {
    conn.execute(
        "INSERT INTO alumnos_cursos (id_alumno, id_curso) VALUES (?1, ?2)",
        params![id_alumno, id_curso],
    )?;
    get_inscripcion_sql(conn, conn.last_insert_rowid())
}

/// Baja de la nómina: borra inscripción y datos operativos de ese dictado (notas, asistencia, observaciones).
fn desinscribir_sql(conn: &mut Connection, id_alumno: i64, id_curso: i64) -> rusqlite::Result<()> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM alumnos_cursos WHERE id_alumno = ?1 AND id_curso = ?2",
        params![id_alumno, id_curso],
        |row| row.get(0),
    )?;
    if exists == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    let tx = conn.transaction()?;
    tx.execute(
        "DELETE FROM notas
         WHERE id_alumno = ?1
           AND id_evaluacion IN (SELECT id FROM evaluaciones WHERE id_curso = ?2)",
        params![id_alumno, id_curso],
    )?;
    tx.execute(
        "DELETE FROM observaciones WHERE id_alumno = ?1 AND id_curso = ?2",
        params![id_alumno, id_curso],
    )?;
    tx.execute(
        "DELETE FROM asistencias WHERE id_alumno = ?1 AND id_curso = ?2",
        params![id_alumno, id_curso],
    )?;
    tx.execute(
        "DELETE FROM alumnos_cursos WHERE id_alumno = ?1 AND id_curso = ?2",
        params![id_alumno, id_curso],
    )?;
    tx.commit()?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_alumnos(db: State<'_, Db>) -> Result<Vec<Alumno>, String> {
    db.with_conn(list_alumnos_sql)
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_alumno(db: State<'_, Db>, id: i64) -> Result<Alumno, String> {
    db.with_conn(|conn| get_alumno_sql(conn, id))
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_alumno(db: State<'_, Db>, alumno: AlumnoWrite) -> Result<Alumno, String> {
    let w = alumno_from_write(alumno)?;
    db.with_conn(|conn| insert_alumno_sql(conn, &w))
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_alumno(db: State<'_, Db>, id: i64, alumno: AlumnoWrite) -> Result<Alumno, String> {
    let w = alumno_from_write(alumno)?;
    db.with_conn(|conn| update_alumno_sql(conn, id, &w))
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_alumno(db: State<'_, Db>, id: i64) -> Result<(), String> {
    db.with_conn(|conn| delete_alumno_sql(conn, id))
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_alumnos_de_curso(db: State<'_, Db>, id_curso: i64) -> Result<Vec<Alumno>, String> {
    db.with_conn(|conn| list_alumnos_de_curso_sql(conn, id_curso))
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_inscripciones(
    db: State<'_, Db>,
    id_anio_lectivo: i64,
) -> Result<Vec<AlumnoCurso>, String> {
    db.with_conn(|conn| list_inscripciones_sql(conn, id_anio_lectivo))
}

#[tauri::command(rename_all = "snake_case")]
pub fn inscribir_alumno(
    db: State<'_, Db>,
    id_alumno: i64,
    id_curso: i64,
) -> Result<AlumnoCurso, String> {
    db.with_conn(|conn| inscribir_sql(conn, id_alumno, id_curso))
}

#[tauri::command(rename_all = "snake_case")]
pub fn desinscribir_alumno(
    db: State<'_, Db>,
    id_alumno: i64,
    id_curso: i64,
) -> Result<(), String> {
    db.with_conn_mut(|conn| desinscribir_sql(conn, id_alumno, id_curso))
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

    fn write(nombre: &str, apellido: &str) -> AlumnoWrite {
        AlumnoWrite {
            nombre: nombre.into(),
            apellido: apellido.into(),
        }
    }

    fn seed_dos_cursos(conn: &Connection) -> (i64, i64) {
        conn.execute(
            "INSERT INTO escuelas (id_jurisdiccion, nombre) VALUES (1, 'ENET Nº 1')",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO materias (nombre) VALUES ('English')", [])
            .unwrap();
        conn.execute("INSERT INTO materias (nombre) VALUES ('Plástica')", [])
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
             VALUES ('3° A English', 1, 1, 1, ?1, 1, 1)",
            [grado],
        )
        .unwrap();
        let c1 = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO cursos (nombre, id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo)
             VALUES ('3° A Plástica', 1, 1, 1, ?1, 2, 1)",
            [grado],
        )
        .unwrap();
        let c2 = conn.last_insert_rowid();
        (c1, c2)
    }

    #[test]
    fn alta_y_listado_por_apellido() {
        let conn = memory();
        insert_alumno_sql(&conn, &write("Ana", "Zamora")).unwrap();
        insert_alumno_sql(&conn, &write("Juan", "Pérez")).unwrap();
        let rows = list_alumnos_sql(&conn).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].apellido, "Pérez");
        assert_eq!(rows[1].apellido, "Zamora");
    }

    #[test]
    fn homonimos_permitidos() {
        let conn = memory();
        insert_alumno_sql(&conn, &write("Juan", "Pérez")).unwrap();
        insert_alumno_sql(&conn, &write("Juan", "Pérez")).unwrap();
        let rows = list_alumnos_sql(&conn).unwrap();
        assert_eq!(rows.len(), 2);
        assert_ne!(rows[0].id, rows[1].id);
    }

    #[test]
    fn mismo_alumno_en_dos_dictados() {
        let conn = memory();
        let (c1, c2) = seed_dos_cursos(&conn);
        let a = insert_alumno_sql(&conn, &write("Juan", "Pérez")).unwrap();
        inscribir_sql(&conn, a.id, c1).unwrap();
        inscribir_sql(&conn, a.id, c2).unwrap();
        assert_eq!(list_alumnos_de_curso_sql(&conn, c1).unwrap().len(), 1);
        assert_eq!(list_alumnos_de_curso_sql(&conn, c2).unwrap().len(), 1);
        let insc = list_inscripciones_sql(&conn, 1).unwrap();
        assert_eq!(insc.len(), 2);
    }

    #[test]
    fn inscripcion_unica() {
        let conn = memory();
        let (c1, _) = seed_dos_cursos(&conn);
        let a = insert_alumno_sql(&conn, &write("Juan", "Pérez")).unwrap();
        inscribir_sql(&conn, a.id, c1).unwrap();
        let err = inscribir_sql(&conn, a.id, c1).unwrap_err();
        assert_eq!(
            map_sql_error(err),
            "Ese alumno ya está inscripto en este curso."
        );
    }

    #[test]
    fn baja_no_borra_persona() {
        let mut conn = memory();
        let (c1, _) = seed_dos_cursos(&conn);
        let a = insert_alumno_sql(&conn, &write("Juan", "Pérez")).unwrap();
        inscribir_sql(&conn, a.id, c1).unwrap();
        desinscribir_sql(&mut conn, a.id, c1).unwrap();
        assert!(list_alumnos_de_curso_sql(&conn, c1).unwrap().is_empty());
        assert_eq!(get_alumno_sql(&conn, a.id).unwrap().apellido, "Pérez");
    }

    #[test]
    fn baja_borra_notas_de_ese_dictado() {
        let mut conn = memory();
        let (c1, c2) = seed_dos_cursos(&conn);
        let a = insert_alumno_sql(&conn, &write("Juan", "Pérez")).unwrap();
        inscribir_sql(&conn, a.id, c1).unwrap();
        inscribir_sql(&conn, a.id, c2).unwrap();
        conn.execute(
            "INSERT INTO evaluaciones (id_curso, id_tipo_evaluacion, titulo, fecha)
             VALUES (?1, 1, 'Escrito 1', '2026-05-12')",
            [c1],
        )
        .unwrap();
        let ev1 = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO evaluaciones (id_curso, id_tipo_evaluacion, titulo, fecha)
             VALUES (?1, 1, 'Escrito 1', '2026-05-12')",
            [c2],
        )
        .unwrap();
        let ev2 = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO notas (id_evaluacion, id_alumno, valor, ausente) VALUES (?1, ?2, '8', 0)",
            rusqlite::params![ev1, a.id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO notas (id_evaluacion, id_alumno, valor, ausente) VALUES (?1, ?2, '7', 0)",
            rusqlite::params![ev2, a.id],
        )
        .unwrap();
        desinscribir_sql(&mut conn, a.id, c1).unwrap();
        let n1: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM notas WHERE id_evaluacion = ?1",
                [ev1],
                |row| row.get(0),
            )
            .unwrap();
        let n2: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM notas WHERE id_evaluacion = ?1",
                [ev2],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(n1, 0);
        assert_eq!(n2, 1);
    }

    #[test]
    fn recorta_espacios_de_nombre_y_apellido() {
        let conn = memory();
        let w = alumno_from_write(AlumnoWrite {
            nombre: "  Ana  ".into(),
            apellido: "  Gómez  ".into(),
        })
        .unwrap();
        assert_eq!(w.nombre, "Ana");
        assert_eq!(w.apellido, "Gómez");
        let saved = insert_alumno_sql(&conn, &w).unwrap();
        assert_eq!(saved.nombre, "Ana");
        assert_eq!(saved.apellido, "Gómez");
    }
}
