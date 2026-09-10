//! DTOs del dominio en el borde Tauri.
//! Nombres = columnas de `database.sql` = esquemas Zod en `src/api.ts`.
//! No inventar campos: si falta algo, ampliar el SQL primero.

use serde::{Deserialize, Serialize};

pub const JURISDICCION_CODIGOS: [&str; 3] = ["pba", "caba", "otra"];
pub const NIVEL_CODIGOS: [&str; 2] = ["primaria", "secundaria"];
pub const TIPO_EVENTO_CODIGOS: [&str; 6] =
    ["tema", "entrega", "reunion", "junta", "acto", "otro"];
pub const TIPO_EVALUACION_CODIGOS: [&str; 5] =
    ["escrito", "oral", "tp", "integrador", "recuperatorio"];
pub const TIPO_OBSERVACION_CODIGOS: [&str; 4] =
    ["academica", "conducta", "seguimiento", "reunion_familia"];
pub const ESTADO_ASISTENCIA_CODIGOS: [&str; 4] =
    ["presente", "ausente", "tarde", "justificado"];

/// 0 | 1, como INTEGER en SQLite (activo, ausente, …).
pub type Flag01 = i64;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DbStatus {
    pub path: String,
    pub foreign_keys: Flag01,
    pub journal_mode: String,
    pub tables: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Turno {
    pub id: i64,
    pub nombre: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Division {
    pub id: i64,
    pub nombre: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Nivel {
    pub id: i64,
    pub codigo: String,
    pub nombre: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Ciclo {
    pub id: i64,
    pub id_nivel: i64,
    pub nombre: String,
    pub orden: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AnioLectivo {
    pub id: i64,
    pub anio: i64,
    pub activo: Flag01,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Jurisdiccion {
    pub id: i64,
    pub codigo: String,
    pub nombre: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TipoEvento {
    pub id: i64,
    pub codigo: String,
    pub nombre: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TipoEvaluacion {
    pub id: i64,
    pub codigo: String,
    pub nombre: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TipoObservacion {
    pub id: i64,
    pub codigo: String,
    pub nombre: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EstadoAsistencia {
    pub id: i64,
    pub codigo: String,
    pub nombre: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Escuela {
    pub id: i64,
    pub id_jurisdiccion: i64,
    pub nombre: String,
    pub nombre_corto: Option<String>,
    pub direccion: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EscuelaWrite {
    pub id_jurisdiccion: i64,
    pub nombre: String,
    pub nombre_corto: Option<String>,
    pub direccion: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Materia {
    pub id: i64,
    pub nombre: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MateriaWrite {
    pub nombre: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Curso {
    pub id: i64,
    pub nombre: String,
    pub id_escuela: i64,
    pub id_turno: i64,
    pub id_division: i64,
    pub id_ciclo: i64,
    pub id_materia: i64,
    pub id_anio_lectivo: i64,
    pub orientacion: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CursoWrite {
    pub nombre: String,
    pub id_escuela: i64,
    pub id_turno: i64,
    pub id_division: i64,
    pub id_ciclo: i64,
    pub id_materia: i64,
    pub id_anio_lectivo: i64,
    pub orientacion: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Alumno {
    pub id: i64,
    pub nombre: String,
    pub apellido: String,
    pub dni: Option<String>,
    pub email: Option<String>,
    pub telefono: Option<String>,
    pub fecha_nacimiento: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AlumnoWrite {
    pub nombre: String,
    pub apellido: String,
    pub dni: Option<String>,
    pub email: Option<String>,
    pub telefono: Option<String>,
    pub fecha_nacimiento: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AlumnoCurso {
    pub id: i64,
    pub id_alumno: i64,
    pub id_curso: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Horario {
    pub id: i64,
    pub id_curso: i64,
    pub dia_semana: i64,
    pub hora_inicio: String,
    pub hora_fin: String,
    pub aula: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HorarioWrite {
    pub id_curso: i64,
    pub dia_semana: i64,
    pub hora_inicio: String,
    pub hora_fin: String,
    pub aula: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Evento {
    pub id: i64,
    pub id_curso: Option<i64>,
    pub id_tipo_evento: i64,
    pub fecha: String,
    pub hora: Option<String>,
    pub titulo: String,
    pub descripcion: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EventoWrite {
    pub id_curso: Option<i64>,
    pub id_tipo_evento: i64,
    pub fecha: String,
    pub hora: Option<String>,
    pub titulo: String,
    pub descripcion: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Evaluacion {
    pub id: i64,
    pub id_curso: i64,
    pub id_tipo_evaluacion: i64,
    pub id_evaluacion_origen: Option<i64>,
    pub titulo: String,
    pub fecha: String,
    pub tema: Option<String>,
    pub ponderacion: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EvaluacionWrite {
    pub id_curso: i64,
    pub id_tipo_evaluacion: i64,
    pub id_evaluacion_origen: Option<i64>,
    pub titulo: String,
    pub fecha: String,
    pub tema: Option<String>,
    pub ponderacion: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Nota {
    pub id: i64,
    pub id_evaluacion: i64,
    pub id_alumno: i64,
    pub valor: Option<String>,
    pub ausente: Flag01,
    pub comentario: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NotaWrite {
    pub id_evaluacion: i64,
    pub id_alumno: i64,
    pub valor: Option<String>,
    pub ausente: Flag01,
    pub comentario: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Observacion {
    pub id: i64,
    pub id_alumno: i64,
    pub id_curso: i64,
    pub id_tipo_observacion: i64,
    pub fecha: String,
    pub texto: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ObservacionWrite {
    pub id_alumno: i64,
    pub id_curso: i64,
    pub id_tipo_observacion: i64,
    pub fecha: String,
    pub texto: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Asistencia {
    pub id: i64,
    pub id_curso: i64,
    pub id_alumno: i64,
    pub fecha: String,
    pub id_estado_asistencia: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AsistenciaWrite {
    pub id_curso: i64,
    pub id_alumno: i64,
    pub fecha: String,
    pub id_estado_asistencia: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn db_status_json_uses_sql_field_names() {
        let status = DbStatus {
            path: "/tmp/adm-cursos.sqlite".into(),
            foreign_keys: 1,
            journal_mode: "WAL".into(),
            tables: 20,
        };
        let v = serde_json::to_value(&status).unwrap();
        assert!(v.get("foreign_keys").is_some());
        assert!(v.get("journal_mode").is_some());
        assert!(v.get("foreignKeys").is_none());
    }

    #[test]
    fn escuela_none_serializes_as_null() {
        let e = Escuela {
            id: 1,
            id_jurisdiccion: 2,
            nombre: "Normal 2".into(),
            nombre_corto: None,
            direccion: None,
            telefono: None,
            email: None,
        };
        let v = serde_json::to_value(&e).unwrap();
        assert_eq!(v["nombre_corto"], serde_json::Value::Null);
        assert_eq!(v["id_jurisdiccion"], 2);
    }
}
