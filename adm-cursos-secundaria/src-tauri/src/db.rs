//! SQLite local. `PRAGMA foreign_keys = ON` en cada conexión (SQLite no lo persiste).
//! El DDL sale de `database.sql` (raíz del repo); no se reaplican los DROP si ya hay tablas.
//! Paso 14: el archivo en disco está cifrado (AES-GCM); la conexión es in-memory.

use crate::candado::{
    borrar_sidecars_sqlite, cifrar, descifrar, derivar_clave, nuevo_salt, recuperar_si_quedo_new,
    tipo_archivo, validar_clave, escribir_atomico, TipoArchivo,
};
use crate::domain::{CandadoEstado, DbStatus};
use rusqlite::backup::Backup;
use rusqlite::Connection;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;
use rand::RngCore;
use zeroize::Zeroize;

const SCHEMA_SQL: &str = include_str!("../../../database.sql");
const MAX_INTENTOS: u8 = 3;
const CERRADO: &str = "El cuaderno está cerrado. Ingresá la clave.";

enum DbInner {
    Locked { intentos: u8 },
    Open { conn: Connection, key: [u8; 32], salt: [u8; 16] },
}

pub struct Db {
    path: PathBuf,
    inner: Mutex<DbInner>,
}

impl Db {
    pub fn for_app(app: &tauri::App) -> Result<Self, Box<dyn std::error::Error>> {
        let dir = app.path().app_data_dir()?;
        std::fs::create_dir_all(&dir)?;
        let path = dir.join("adm-cursos.sqlite");
        recuperar_si_quedo_new(&path);
        Ok(Self {
            path,
            inner: Mutex::new(DbInner::Locked { intentos: 0 }),
        })
    }

    pub fn locked_at(path: PathBuf) -> Self {
        recuperar_si_quedo_new(&path);
        Self {
            path,
            inner: Mutex::new(DbInner::Locked { intentos: 0 }),
        }
    }

    pub fn status(&self) -> Result<DbStatus, String> {
        self.with_conn(|conn| status_of(conn, Some(&self.path)))
    }

    pub fn candado_estado(&self) -> Result<CandadoEstado, String> {
        let inner = self.inner.lock().map_err(|e| e.to_string())?;
        match &*inner {
            DbInner::Open { .. } => Ok(CandadoEstado {
                fase: "abierto".into(),
                intentos_restantes: MAX_INTENTOS as i64,
                migra: 0,
            }),
            DbInner::Locked { intentos } => {
                let tipo = tipo_archivo(&self.path);
                let (fase, migra) = match tipo {
                    TipoArchivo::Cifrado => ("desbloquear", 0),
                    TipoArchivo::SqliteEnClaro => ("crear", 1),
                    TipoArchivo::Ausente => ("crear", 0),
                    TipoArchivo::Desconocido => {
                        return Err("El archivo del cuaderno no se reconoce.".into());
                    }
                };
                Ok(CandadoEstado {
                    fase: fase.into(),
                    intentos_restantes: (MAX_INTENTOS.saturating_sub(*intentos)) as i64,
                    migra,
                })
            }
        }
    }

    pub fn crear_clave(&self, clave: &str, repetir: &str) -> Result<CandadoEstado, String> {
        validar_clave(clave, Some(repetir))?;
        let mut inner = self.inner.lock().map_err(|e| e.to_string())?;
        if matches!(*inner, DbInner::Open { .. }) {
            return Err("El cuaderno ya está abierto.".into());
        }
        match tipo_archivo(&self.path) {
            TipoArchivo::Cifrado => {
                return Err("Ya hay una clave. Abrí el cuaderno.".into());
            }
            TipoArchivo::Desconocido => {
                return Err("El archivo del cuaderno no se reconoce.".into());
            }
            TipoArchivo::Ausente => {
                let salt = nuevo_salt();
                let key = derivar_clave(clave, &salt)?;
                let conn = Connection::open_in_memory().map_err(map_sql_error)?;
                prepare_connection(&conn).map_err(map_sql_error)?;
                persistir(&conn, &self.path, &key, &salt)?;
                *inner = DbInner::Open { conn, key, salt };
            }
            TipoArchivo::SqliteEnClaro => {
                let salt = nuevo_salt();
                let key = derivar_clave(clave, &salt)?;
                let plano = {
                    let conn = Connection::open(&self.path).map_err(map_sql_error)?;
                    prepare_connection(&conn).map_err(map_sql_error)?;
                    volcar_bytes(&conn)?
                };
                let blob = cifrar(&plano, &key, &salt)?;
                escribir_atomico(&self.path, &blob)?;
                borrar_sidecars_sqlite(&self.path);
                let conn = conn_desde_plano(&plano)?;
                *inner = DbInner::Open { conn, key, salt };
            }
        }
        Ok(CandadoEstado {
            fase: "abierto".into(),
            intentos_restantes: MAX_INTENTOS as i64,
            migra: 0,
        })
    }

    pub fn desbloquear(&self, clave: &str) -> Result<CandadoEstado, String> {
        validar_clave(clave, None)?;
        let mut inner = self.inner.lock().map_err(|e| e.to_string())?;
        if matches!(*inner, DbInner::Open { .. }) {
            return Ok(CandadoEstado {
                fase: "abierto".into(),
                intentos_restantes: MAX_INTENTOS as i64,
                migra: 0,
            });
        }
        let intentos = match &*inner {
            DbInner::Locked { intentos } => *intentos,
            DbInner::Open { .. } => 0,
        };
        if intentos >= MAX_INTENTOS {
            return Err("Demasiados intentos. Cerrá la app y volvé a abrir.".into());
        }
        if tipo_archivo(&self.path) != TipoArchivo::Cifrado {
            return Err("No hay un cuaderno cifrado para abrir.".into());
        }
        let blob = fs::read(&self.path).map_err(|e| e.to_string())?;
        match descifrar(&blob, clave) {
            Ok((plano, key, salt)) => {
                let conn = conn_desde_plano(&plano)?;
                *inner = DbInner::Open { conn, key, salt };
                Ok(CandadoEstado {
                    fase: "abierto".into(),
                    intentos_restantes: MAX_INTENTOS as i64,
                    migra: 0,
                })
            }
            Err(err) => {
                *inner = DbInner::Locked {
                    intentos: intentos + 1,
                };
                if intentos + 1 >= MAX_INTENTOS {
                    Err("Demasiados intentos. Cerrá la app y volvé a abrir.".into())
                } else {
                    Err(err)
                }
            }
        }
    }

    pub fn with_conn<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> rusqlite::Result<T>,
    {
        let mut guard = self.inner.lock().map_err(|e| e.to_string())?;
        match &mut *guard {
            DbInner::Open { conn, key, salt } => {
                let result = f(conn).map_err(map_sql_error)?;
                persistir(conn, &self.path, key, salt)?;
                Ok(result)
            }
            DbInner::Locked { .. } => Err(CERRADO.into()),
        }
    }

    pub fn with_conn_mut<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&mut Connection) -> rusqlite::Result<T>,
    {
        let mut guard = self.inner.lock().map_err(|e| e.to_string())?;
        match &mut *guard {
            DbInner::Open { conn, key, salt } => {
                let result = f(conn).map_err(map_sql_error)?;
                persistir(conn, &self.path, key, salt)?;
                Ok(result)
            }
            DbInner::Locked { .. } => Err(CERRADO.into()),
        }
    }
}

fn tmp_unico(prefijo: &str) -> PathBuf {
    let mut n = [0u8; 8];
    rand::thread_rng().fill_bytes(&mut n);
    std::env::temp_dir().join(format!(
        "{}-{}-{:016x}",
        prefijo,
        std::process::id(),
        u64::from_le_bytes(n)
    ))
}

fn volcar_bytes(conn: &Connection) -> Result<Vec<u8>, String> {
    let tmp = tmp_unico("adm-cursos-volcado");
    let _ = fs::remove_file(&tmp);
    {
        let mut dst = Connection::open(&tmp).map_err(map_sql_error)?;
        dst.pragma_update(None, "journal_mode", "OFF")
            .map_err(map_sql_error)?;
        {
            let backup = Backup::new(conn, &mut dst).map_err(map_sql_error)?;
            backup
                .run_to_completion(64, Duration::from_millis(0), None)
                .map_err(map_sql_error)?;
        }
    }
    let bytes = fs::read(&tmp).map_err(|e| e.to_string())?;
    let _ = fs::remove_file(&tmp);
    Ok(bytes)
}

fn conn_desde_plano(plano: &[u8]) -> Result<Connection, String> {
    let tmp = tmp_unico("adm-cursos-load");
    let _ = fs::remove_file(&tmp);
    fs::write(&tmp, plano).map_err(|e| e.to_string())?;
    let src = Connection::open(&tmp).map_err(map_sql_error)?;
    let mut dst = Connection::open_in_memory().map_err(map_sql_error)?;
    {
        let backup = Backup::new(&src, &mut dst).map_err(map_sql_error)?;
        backup
            .run_to_completion(64, Duration::from_millis(0), None)
            .map_err(map_sql_error)?;
    }
    drop(src);
    let _ = fs::remove_file(&tmp);
    prepare_connection(&dst).map_err(map_sql_error)?;
    Ok(dst)
}

fn persistir(
    conn: &Connection,
    path: &Path,
    key: &[u8; 32],
    salt: &[u8; 16],
) -> Result<(), String> {
    let plano = volcar_bytes(conn)?;
    let blob = cifrar(&plano, key, salt)?;
    escribir_atomico(path, &blob)?;
    borrar_sidecars_sqlite(path);
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn candado_estado(db: tauri::State<'_, Db>) -> Result<CandadoEstado, String> {
    db.candado_estado()
}

#[tauri::command(rename_all = "snake_case")]
pub fn crear_clave(
    db: tauri::State<'_, Db>,
    clave: String,
    repetir: String,
) -> Result<CandadoEstado, String> {
    let mut clave = clave;
    let mut repetir = repetir;
    let r = db.crear_clave(&clave, &repetir);
    clave.zeroize();
    repetir.zeroize();
    r
}

#[tauri::command(rename_all = "snake_case")]
pub fn desbloquear(db: tauri::State<'_, Db>, clave: String) -> Result<CandadoEstado, String> {
    let mut clave = clave;
    let r = db.desbloquear(&clave);
    clave.zeroize();
    r
}

/// Error de invariante de app (no de SQLite). `map_sql_error` devuelve el texto tal cual.
pub fn app_err(msg: impl Into<String>) -> rusqlite::Error {
    rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
        std::io::ErrorKind::InvalidInput,
        msg.into(),
    )))
}

pub fn map_sql_error(err: rusqlite::Error) -> String {
    if matches!(err, rusqlite::Error::QueryReturnedNoRows) {
        return "No se encontró el registro.".into();
    }
    if let rusqlite::Error::ToSqlConversionFailure(inner) = &err {
        let s = inner.to_string();
        if !s.is_empty() {
            return s;
        }
    }
    let msg = err.to_string();
    if msg.contains("escuelas.id_jurisdiccion") && msg.contains("escuelas.nombre") {
        return "Ya existe una escuela con ese nombre en esa jurisdicción.".into();
    }
    if msg.contains("materias.nombre") {
        return "Ya existe una materia con ese nombre.".into();
    }
    if msg.contains("cursos.id_escuela") && msg.contains("cursos.id_materia") {
        return "Ya existe un dictado con esa escuela, grupo, materia y año.".into();
    }
    if msg.contains("anios_lectivos.anio") {
        return "Ese año lectivo ya está cargado.".into();
    }
    if msg.contains("ux_anios_lectivos_activo") || msg.contains("anios_lectivos.activo") {
        return "Solo puede haber un año lectivo activo.".into();
    }
    if msg.contains("alumnos_cursos.id_alumno") && msg.contains("alumnos_cursos.id_curso") {
        return "Ese alumno ya está inscripto en este curso.".into();
    }
    if msg.contains("horarios.id_curso") && msg.contains("horarios.dia_semana") {
        return "Ya hay un bloque de ese curso ese día a esa hora.".into();
    }
    if msg.contains("notas.id_evaluacion") && msg.contains("notas.id_alumno") {
        return "Ya hay una nota de ese alumno en esa evaluación.".into();
    }
    if msg.contains("asistencias.id_curso") && msg.contains("asistencias.id_alumno") {
        return "Ya hay asistencia de ese alumno en esa fecha.".into();
    }
    if msg.contains("CHECK constraint failed")
        && msg.to_ascii_lowercase().contains("ausente")
    {
        return "Si está ausente, la nota tiene que quedar vacía.".into();
    }
    if msg.contains("FOREIGN KEY constraint failed") {
        return "No se puede completar: falta un dato vinculado o hay registros que lo usan.".into();
    }
    msg
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
        return Ok(());
    }
    heal_ciclos_rename_leftovers(conn)?;
    migrate_niveles_y_ciclos(conn)?;
    repair_cursos_fk_ciclos_old(conn)?;
    migrate_alumnos_ficha_minima(conn)?;
    Ok(())
}

fn table_exists(conn: &Connection, name: &str) -> rusqlite::Result<bool> {
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
        [name],
        |row| row.get(0),
    )?;
    Ok(n > 0)
}

fn column_exists(conn: &Connection, table: &str, column: &str) -> rusqlite::Result<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let name: String = row.get(1)?;
        if name.eq_ignore_ascii_case(column) {
            return Ok(true);
        }
    }
    Ok(false)
}

/// SQLite 3.26+ reescribe FKs de otras tablas en un RENAME aunque `foreign_keys` esté OFF.
/// Eso deja `cursos` apuntando a `ciclos_old` y el INSERT falla con "no such table: main.ciclos_old".
/// `legacy_alter_table=ON` restaura el comportamiento viejo; el Drop vuelve a encender FKs.
struct SchemaRebuildGuard<'a> {
    conn: &'a Connection,
}

impl<'a> SchemaRebuildGuard<'a> {
    fn enter(conn: &'a Connection) -> rusqlite::Result<Self> {
        conn.pragma_update(None, "foreign_keys", false)?;
        conn.pragma_update(None, "legacy_alter_table", true)?;
        Ok(Self { conn })
    }
}

impl Drop for SchemaRebuildGuard<'_> {
    fn drop(&mut self) {
        let _ = self.conn.pragma_update(None, "legacy_alter_table", false);
        let _ = self.conn.pragma_update(None, "foreign_keys", true);
    }
}

fn table_sql_contains(conn: &Connection, table: &str, needle: &str) -> rusqlite::Result<bool> {
    use rusqlite::OptionalExtension;
    let sql: Option<String> = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?1",
            [table],
            |row| row.get(0),
        )
        .optional()?;
    Ok(sql
        .map(|s| s.to_ascii_lowercase().contains(&needle.to_ascii_lowercase()))
        .unwrap_or(false))
}

fn reset_sqlite_sequence(conn: &Connection, table: &str) -> rusqlite::Result<()> {
    if !table_exists(conn, "sqlite_sequence")? {
        return Ok(());
    }
    conn.execute("DELETE FROM sqlite_sequence WHERE name = ?1", [table])?;
    conn.execute(
        &format!(
            "INSERT INTO sqlite_sequence (name, seq)
             SELECT ?1, COALESCE(MAX(id), 0) FROM {table}"
        ),
        [table],
    )?;
    Ok(())
}

/// Si una migración anterior quedó a medias (`ciclos` renombrada y no restaurada).
fn heal_ciclos_rename_leftovers(conn: &Connection) -> rusqlite::Result<()> {
    let has_ciclos = table_exists(conn, "ciclos")?;
    let has_old = table_exists(conn, "ciclos_old")?;
    if has_old && !has_ciclos {
        let _guard = SchemaRebuildGuard::enter(conn)?;
        conn.execute("ALTER TABLE ciclos_old RENAME TO ciclos", [])?;
        return Ok(());
    }
    if has_old && has_ciclos {
        let _guard = SchemaRebuildGuard::enter(conn)?;
        if column_exists(conn, "ciclos", "id_nivel")? {
            conn.execute("DROP TABLE ciclos_old", [])?;
        }
    }
    Ok(())
}

/// v1.1 → v1.2: niveles (primaria/secundaria) y ciclos por nivel (grado ≠ año).
/// Conserva los id de ciclos existentes (eran años de secundaria) para no romper cursos.
fn migrate_niveles_y_ciclos(conn: &Connection) -> rusqlite::Result<()> {
    if !table_exists(conn, "ciclos")? {
        return Ok(());
    }

    if !table_exists(conn, "niveles")? {
        conn.execute_batch(
            "CREATE TABLE niveles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                codigo TEXT NOT NULL UNIQUE,
                nombre TEXT NOT NULL UNIQUE
            );",
        )?;
    }
    conn.execute(
        "INSERT OR IGNORE INTO niveles (codigo, nombre) VALUES ('primaria', 'Primaria')",
        [],
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO niveles (codigo, nombre) VALUES ('secundaria', 'Secundaria')",
        [],
    )?;

    if !column_exists(conn, "ciclos", "id_nivel")? {
        rebuild_ciclos_con_nivel(conn)?;
    }

    seed_ciclos_por_nivel(conn)?;
    Ok(())
}

fn rebuild_ciclos_con_nivel(conn: &Connection) -> rusqlite::Result<()> {
    let secundaria_id: i64 = conn.query_row(
        "SELECT id FROM niveles WHERE codigo = 'secundaria'",
        [],
        |row| row.get(0),
    )?;
    let _guard = SchemaRebuildGuard::enter(conn)?;
    // 12 pasos de SQLite: tabla nueva → copiar → DROP → RENAME. No usar
    // `ALTER TABLE ciclos RENAME TO ciclos_old` (reescribe la FK de cursos).
    conn.execute_batch(
        "
        CREATE TABLE ciclos_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            id_nivel INTEGER NOT NULL,
            nombre TEXT NOT NULL,
            orden INTEGER NOT NULL,
            FOREIGN KEY (id_nivel) REFERENCES niveles (id) ON DELETE RESTRICT,
            UNIQUE (id_nivel, nombre),
            UNIQUE (id_nivel, orden)
        );
        ",
    )?;
    conn.execute(
        "INSERT INTO ciclos_new (id, id_nivel, nombre, orden)
         SELECT id, ?1, nombre, orden FROM ciclos",
        [secundaria_id],
    )?;
    conn.execute_batch(
        "
        DROP TABLE ciclos;
        ALTER TABLE ciclos_new RENAME TO ciclos;
        CREATE INDEX IF NOT EXISTS ix_ciclos_nivel ON ciclos (id_nivel);
        ",
    )?;
    reset_sqlite_sequence(conn, "ciclos")?;
    Ok(())
}

/// Bases ya migradas con el RENAME viejo: `cursos` sigue referenciando `ciclos_old`.
fn repair_cursos_fk_ciclos_old(conn: &Connection) -> rusqlite::Result<()> {
    if !table_exists(conn, "cursos")? {
        return Ok(());
    }
    if !table_sql_contains(conn, "cursos", "ciclos_old")? {
        return Ok(());
    }
    rebuild_cursos_fk_a_ciclos(conn)
}

fn rebuild_cursos_fk_a_ciclos(conn: &Connection) -> rusqlite::Result<()> {
    let has_orientacion = column_exists(conn, "cursos", "orientacion")?;
    let _guard = SchemaRebuildGuard::enter(conn)?;
    conn.execute_batch(
        "
        CREATE TABLE cursos_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            id_escuela INTEGER NOT NULL,
            id_turno INTEGER NOT NULL,
            id_division INTEGER NOT NULL,
            id_ciclo INTEGER NOT NULL,
            id_materia INTEGER NOT NULL,
            id_anio_lectivo INTEGER NOT NULL,
            orientacion TEXT,
            FOREIGN KEY (id_escuela) REFERENCES escuelas (id) ON DELETE RESTRICT,
            FOREIGN KEY (id_turno) REFERENCES turnos (id) ON DELETE RESTRICT,
            FOREIGN KEY (id_division) REFERENCES divisiones (id) ON DELETE RESTRICT,
            FOREIGN KEY (id_ciclo) REFERENCES ciclos (id) ON DELETE RESTRICT,
            FOREIGN KEY (id_materia) REFERENCES materias (id) ON DELETE RESTRICT,
            FOREIGN KEY (id_anio_lectivo) REFERENCES anios_lectivos (id) ON DELETE RESTRICT,
            UNIQUE (id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo)
        );
        ",
    )?;
    if has_orientacion {
        conn.execute(
            "INSERT INTO cursos_new (
                id, nombre, id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo, orientacion
             )
             SELECT id, nombre, id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo, orientacion
             FROM cursos",
            [],
        )?;
    } else {
        conn.execute(
            "INSERT INTO cursos_new (
                id, nombre, id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo, orientacion
             )
             SELECT id, nombre, id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo, NULL
             FROM cursos",
            [],
        )?;
    }
    conn.execute_batch(
        "
        DROP TABLE cursos;
        ALTER TABLE cursos_new RENAME TO cursos;
        CREATE INDEX IF NOT EXISTS ix_cursos_anio ON cursos (id_anio_lectivo);
        CREATE INDEX IF NOT EXISTS ix_cursos_escuela ON cursos (id_escuela);
        ",
    )?;
    reset_sqlite_sequence(conn, "cursos")?;
    Ok(())
}

/// v1.2 → v1.3: ficha de alumno = nombre + apellido. Tira DNI, email, teléfono y nacimiento.
/// Conserva `id` para no huérfanas notas, asistencia ni observaciones.
fn migrate_alumnos_ficha_minima(conn: &Connection) -> rusqlite::Result<()> {
    if !table_exists(conn, "alumnos")? {
        return Ok(());
    }
    const EXTRA: [&str; 4] = ["dni", "email", "telefono", "fecha_nacimiento"];
    let mut ancha = false;
    for col in EXTRA {
        if column_exists(conn, "alumnos", col)? {
            ancha = true;
            break;
        }
    }
    if !ancha {
        return Ok(());
    }
    rebuild_alumnos_ficha_minima(conn)
}

fn rebuild_alumnos_ficha_minima(conn: &Connection) -> rusqlite::Result<()> {
    let _guard = SchemaRebuildGuard::enter(conn)?;
    conn.execute_batch(
        "
        CREATE TABLE alumnos_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            apellido TEXT NOT NULL
        );
        INSERT INTO alumnos_new (id, nombre, apellido)
        SELECT id, nombre, apellido FROM alumnos;
        DROP TABLE alumnos;
        ALTER TABLE alumnos_new RENAME TO alumnos;
        CREATE INDEX IF NOT EXISTS ix_alumnos_apellido_nombre ON alumnos (apellido, nombre);
        ",
    )?;
    reset_sqlite_sequence(conn, "alumnos")?;
    Ok(())
}

fn seed_ciclos_por_nivel(conn: &Connection) -> rusqlite::Result<()> {
    const GRADOS: [(&str, i64); 7] = [
        ("Primer Grado", 1),
        ("Segundo Grado", 2),
        ("Tercer Grado", 3),
        ("Cuarto Grado", 4),
        ("Quinto Grado", 5),
        ("Sexto Grado", 6),
        ("Séptimo Grado", 7),
    ];
    const ANIOS: [(&str, i64); 7] = [
        ("Primer Año", 1),
        ("Segundo Año", 2),
        ("Tercer Año", 3),
        ("Cuarto Año", 4),
        ("Quinto Año", 5),
        ("Sexto Año", 6),
        ("Séptimo Año", 7),
    ];
    let primaria_id: i64 = conn.query_row(
        "SELECT id FROM niveles WHERE codigo = 'primaria'",
        [],
        |row| row.get(0),
    )?;
    let secundaria_id: i64 = conn.query_row(
        "SELECT id FROM niveles WHERE codigo = 'secundaria'",
        [],
        |row| row.get(0),
    )?;
    for (nombre, orden) in GRADOS {
        conn.execute(
            "INSERT OR IGNORE INTO ciclos (id_nivel, nombre, orden) VALUES (?1, ?2, ?3)",
            rusqlite::params![primaria_id, nombre, orden],
        )?;
    }
    for (nombre, orden) in ANIOS {
        conn.execute(
            "INSERT OR IGNORE INTO ciclos (id_nivel, nombre, orden) VALUES (?1, ?2, ?3)",
            rusqlite::params![secundaria_id, nombre, orden],
        )?;
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
        assert!(user_table_count(&conn).unwrap() >= 20);
        let niveles: i64 = conn
            .query_row("SELECT COUNT(*) FROM niveles", [], |row| row.get(0))
            .unwrap();
        assert_eq!(niveles, 2);
        let ciclos: i64 = conn
            .query_row("SELECT COUNT(*) FROM ciclos", [], |row| row.get(0))
            .unwrap();
        assert_eq!(ciclos, 14);
    }

    #[test]
    fn tercer_grado_y_tercer_anio_son_ciclos_distintos() {
        let conn = memory();
        conn.execute(
            "INSERT INTO escuelas (id_jurisdiccion, nombre) VALUES (1, 'Normal 1')",
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
        let anio: i64 = conn
            .query_row(
                "SELECT c.id FROM ciclos c JOIN niveles n ON n.id = c.id_nivel
                 WHERE n.codigo = 'secundaria' AND c.orden = 3",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_ne!(grado, anio);
        conn.execute(
            "INSERT INTO cursos (nombre, id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo)
             VALUES ('3° A English primaria', 1, 1, 1, ?1, 1, 1)",
            [grado],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO cursos (nombre, id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo)
             VALUES ('3° A English secundaria', 1, 1, 1, ?1, 1, 1)",
            [anio],
        )
        .unwrap();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM cursos", [], |row| row.get(0))
            .unwrap();
        assert_eq!(n, 2);
    }

    #[test]
    fn migrate_old_ciclos_keeps_secundaria_ids() {
        let conn = Connection::open_in_memory().unwrap();
        apply_pragmas(&conn).unwrap();
        conn.execute_batch(
            "
            CREATE TABLE ciclos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL UNIQUE,
                orden INTEGER NOT NULL UNIQUE
            );
            INSERT INTO ciclos (nombre, orden) VALUES
                ('Primer Año', 1),
                ('Segundo Año', 2),
                ('Tercer Año', 3),
                ('Cuarto Año', 4),
                ('Quinto Año', 5),
                ('Sexto Año', 6),
                ('Séptimo Año', 7);
            CREATE TABLE cursos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                id_ciclo INTEGER NOT NULL,
                FOREIGN KEY (id_ciclo) REFERENCES ciclos (id)
            );
            INSERT INTO cursos (nombre, id_ciclo) VALUES ('3° A', 3);
            ",
        )
        .unwrap();
        let old_tercer: i64 = conn
            .query_row(
                "SELECT id FROM ciclos WHERE nombre = 'Tercer Año'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        prepare_connection(&conn).unwrap();
        let new_tercer: i64 = conn
            .query_row(
                "SELECT c.id FROM ciclos c JOIN niveles n ON n.id = c.id_nivel
                 WHERE c.nombre = 'Tercer Año' AND n.codigo = 'secundaria'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(old_tercer, new_tercer);
        let curso_ciclo: i64 = conn
            .query_row("SELECT id_ciclo FROM cursos WHERE nombre = '3° A'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(curso_ciclo, new_tercer);
        let grados: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM ciclos c JOIN niveles n ON n.id = c.id_nivel
                 WHERE n.codigo = 'primaria'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(grados, 7);
        let cursos_sql: String = conn
            .query_row(
                "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'cursos'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(
            !cursos_sql.to_ascii_lowercase().contains("ciclos_old"),
            "la FK de cursos no debe quedar apuntando a ciclos_old: {cursos_sql}"
        );
        conn.execute(
            "INSERT INTO cursos (nombre, id_ciclo) VALUES ('4° A', 4)",
            [],
        )
        .expect("insertar curso después de migrar ciclos");
        prepare_connection(&conn).unwrap();
        let ciclos: i64 = conn
            .query_row("SELECT COUNT(*) FROM ciclos", [], |row| row.get(0))
            .unwrap();
        assert_eq!(ciclos, 14);
    }

    #[test]
    fn repara_cursos_con_fk_a_ciclos_old() {
        let conn = Connection::open_in_memory().unwrap();
        apply_pragmas(&conn).unwrap();
        conn.execute_batch(&schema_without_pragmas()).unwrap();
        conn.execute(
            "INSERT INTO escuelas (id_jurisdiccion, nombre) VALUES (1, 'Normal 1')",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO materias (nombre) VALUES ('Inglés')", [])
            .unwrap();
        conn.execute(
            "INSERT INTO cursos (nombre, id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo)
             VALUES ('3° A Inglés', 1, 1, 1, 1, 1, 1)",
            [],
        )
        .unwrap();

        conn.pragma_update(None, "foreign_keys", false).unwrap();
        conn.pragma_update(None, "legacy_alter_table", true).unwrap();
        conn.execute_batch(
            "
            CREATE TABLE cursos_broken (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                id_escuela INTEGER NOT NULL,
                id_turno INTEGER NOT NULL,
                id_division INTEGER NOT NULL,
                id_ciclo INTEGER NOT NULL,
                id_materia INTEGER NOT NULL,
                id_anio_lectivo INTEGER NOT NULL,
                orientacion TEXT,
                FOREIGN KEY (id_escuela) REFERENCES escuelas (id) ON DELETE RESTRICT,
                FOREIGN KEY (id_turno) REFERENCES turnos (id) ON DELETE RESTRICT,
                FOREIGN KEY (id_division) REFERENCES divisiones (id) ON DELETE RESTRICT,
                FOREIGN KEY (id_ciclo) REFERENCES ciclos_old (id) ON DELETE RESTRICT,
                FOREIGN KEY (id_materia) REFERENCES materias (id) ON DELETE RESTRICT,
                FOREIGN KEY (id_anio_lectivo) REFERENCES anios_lectivos (id) ON DELETE RESTRICT,
                UNIQUE (id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo)
            );
            INSERT INTO cursos_broken
                (id, nombre, id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo, orientacion)
            SELECT id, nombre, id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo, orientacion
            FROM cursos;
            DROP TABLE cursos;
            ALTER TABLE cursos_broken RENAME TO cursos;
            ",
        )
        .unwrap();
        conn.pragma_update(None, "legacy_alter_table", false).unwrap();
        conn.pragma_update(None, "foreign_keys", true).unwrap();

        let before = conn.execute(
            "INSERT INTO cursos (nombre, id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo)
             VALUES ('1° B Inglés', 1, 1, 2, 1, 1, 1)",
            [],
        );
        let err = before.expect_err("el INSERT debe fallar mientras la FK apunte a ciclos_old");
        assert!(
            err.to_string().contains("ciclos_old"),
            "error inesperado: {err}"
        );

        prepare_connection(&conn).unwrap();

        conn.execute(
            "INSERT INTO cursos (nombre, id_escuela, id_turno, id_division, id_ciclo, id_materia, id_anio_lectivo)
             VALUES ('1° B Inglés', 1, 1, 2, 1, 1, 1)",
            [],
        )
        .expect("guardar curso después de reparar FK");
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM cursos", [], |row| row.get(0))
            .unwrap();
        assert_eq!(n, 2);
        let cursos_sql: String = conn
            .query_row(
                "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'cursos'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(!cursos_sql.to_ascii_lowercase().contains("ciclos_old"));
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

    #[test]
    fn migrate_alumnos_v12_tira_dni_y_conserva_id() {
        let conn = Connection::open_in_memory().unwrap();
        apply_pragmas(&conn).unwrap();
        conn.execute_batch(
            "
            CREATE TABLE alumnos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                apellido TEXT NOT NULL,
                dni TEXT UNIQUE,
                email TEXT,
                telefono TEXT,
                fecha_nacimiento TEXT
            );
            INSERT INTO alumnos (id, nombre, apellido, dni, email, telefono, fecha_nacimiento)
            VALUES (7, 'Lucía', 'García', '30111222', 'a@b.com', '111', '2012-03-01');
            CREATE TABLE notas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                id_alumno INTEGER NOT NULL,
                valor TEXT,
                FOREIGN KEY (id_alumno) REFERENCES alumnos (id) ON DELETE CASCADE
            );
            INSERT INTO notas (id_alumno, valor) VALUES (7, '8');
            ",
        )
        .unwrap();
        prepare_connection(&conn).unwrap();
        assert!(!column_exists(&conn, "alumnos", "dni").unwrap());
        assert!(!column_exists(&conn, "alumnos", "email").unwrap());
        assert!(!column_exists(&conn, "alumnos", "telefono").unwrap());
        assert!(!column_exists(&conn, "alumnos", "fecha_nacimiento").unwrap());
        let (id, nombre, apellido): (i64, String, String) = conn
            .query_row(
                "SELECT id, nombre, apellido FROM alumnos WHERE id = 7",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(id, 7);
        assert_eq!(nombre, "Lucía");
        assert_eq!(apellido, "García");
        let n_notas: i64 = conn
            .query_row("SELECT COUNT(*) FROM notas WHERE id_alumno = 7", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(n_notas, 1);
        conn.execute(
            "INSERT INTO alumnos (nombre, apellido) VALUES ('Lucía', 'García')",
            [],
        )
        .expect("homónimos permitidos tras sacar unique de DNI");
        prepare_connection(&conn).unwrap();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM alumnos", [], |row| row.get(0))
            .unwrap();
        assert_eq!(n, 2);
    }

    fn candado_path(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "adm-cursos-db-{}-{}",
            std::process::id(),
            tag
        ));
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("adm-cursos.sqlite");
        let _ = fs::remove_file(&path);
        let _ = fs::remove_file(crate::candado::sidecar(&path, ".new"));
        path
    }

    #[test]
    fn candado_crea_cifra_abre_y_persiste() {
        let path = candado_path("crea");
        let db = Db::locked_at(path.clone());
        let e = db.candado_estado().unwrap();
        assert_eq!(e.fase, "crear");
        assert_eq!(e.migra, 0);
        db.crear_clave("clave-test-ok", "clave-test-ok").unwrap();
        assert_eq!(tipo_archivo(&path), TipoArchivo::Cifrado);
        db.with_conn(|conn| {
            conn.execute("INSERT INTO materias (nombre) VALUES ('English')", [])
        })
        .unwrap();
        let db2 = Db::locked_at(path.clone());
        assert_eq!(db2.candado_estado().unwrap().fase, "desbloquear");
        db2.desbloquear("clave-test-ok").unwrap();
        let n: i64 = db2
            .with_conn(|conn| {
                conn.query_row("SELECT COUNT(*) FROM materias WHERE nombre = 'English'", [], |row| {
                    row.get(0)
                })
            })
            .unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn candado_migra_sqlite_en_claro() {
        let path = candado_path("migra");
        {
            let conn = Connection::open(&path).unwrap();
            prepare_connection(&conn).unwrap();
            conn.execute("INSERT INTO materias (nombre) VALUES ('Plástica')", [])
                .unwrap();
        }
        assert_eq!(tipo_archivo(&path), TipoArchivo::SqliteEnClaro);
        let db = Db::locked_at(path.clone());
        assert_eq!(db.candado_estado().unwrap().migra, 1);
        db.crear_clave("clave-test-ok", "clave-test-ok").unwrap();
        assert_eq!(tipo_archivo(&path), TipoArchivo::Cifrado);
        let n: i64 = db
            .with_conn(|conn| {
                conn.query_row(
                    "SELECT COUNT(*) FROM materias WHERE nombre = 'Plástica'",
                    [],
                    |row| row.get(0),
                )
            })
            .unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn candado_tres_intentos_y_activo_no_se_limpia() {
        let path = candado_path("intentos");
        let db = Db::locked_at(path.clone());
        db.crear_clave("clave-test-ok", "clave-test-ok").unwrap();
        let db2 = Db::locked_at(path);
        for _ in 0..2 {
            let err = db2.desbloquear("clave-mala-ok").unwrap_err();
            assert_eq!(err, "Clave incorrecta.");
        }
        let err = db2.desbloquear("clave-mala-ok").unwrap_err();
        assert!(err.contains("Demasiados intentos"));
        let err = db2.desbloquear("clave-test-ok").unwrap_err();
        assert!(err.contains("Demasiados intentos"));
    }
}
