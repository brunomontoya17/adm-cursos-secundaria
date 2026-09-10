mod alumnos;
mod asistencias;
mod cursos;
mod db;
pub mod domain;
mod evaluaciones;
mod eventos;
mod horarios;
mod maestras;
mod notas;
mod observaciones;

use tauri::Manager;

#[tauri::command(rename_all = "snake_case")]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command(rename_all = "snake_case")]
fn db_status(db: tauri::State<'_, db::Db>) -> Result<domain::DbStatus, String> {
    db.status()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            match db::Db::open_for_app(app) {
                Ok(opened) => {
                    app.manage(opened);
                }
                Err(err) => {
                    let message = err.to_string();
                    eprintln!("sqlite: {message}");
                    app.manage(db::Db::unavailable(message));
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            db_status,
            maestras::list_niveles,
            maestras::list_ciclos,
            maestras::list_jurisdicciones,
            maestras::list_turnos,
            maestras::list_divisiones,
            maestras::list_tipos_evaluacion,
            maestras::list_tipos_evento,
            maestras::list_estados_asistencia,
            maestras::list_tipos_observacion,
            maestras::list_escuelas,
            maestras::create_escuela,
            maestras::update_escuela,
            maestras::delete_escuela,
            maestras::list_materias,
            maestras::create_materia,
            maestras::update_materia,
            maestras::delete_materia,
            maestras::list_anios_lectivos,
            maestras::create_anio_lectivo,
            maestras::activar_anio_lectivo,
            cursos::list_cursos,
            cursos::get_curso,
            cursos::create_curso,
            cursos::update_curso,
            cursos::delete_curso,
            alumnos::list_alumnos,
            alumnos::get_alumno,
            alumnos::create_alumno,
            alumnos::update_alumno,
            alumnos::delete_alumno,
            alumnos::list_alumnos_de_curso,
            alumnos::list_inscripciones,
            alumnos::inscribir_alumno,
            alumnos::desinscribir_alumno,
            horarios::list_horarios,
            horarios::list_horarios_de_curso,
            horarios::create_horario,
            horarios::update_horario,
            horarios::delete_horario,
            evaluaciones::list_evaluaciones,
            evaluaciones::list_evaluaciones_de_curso,
            evaluaciones::get_evaluacion,
            evaluaciones::create_evaluacion,
            evaluaciones::update_evaluacion,
            evaluaciones::delete_evaluacion,
            notas::list_notas_de_curso,
            notas::upsert_nota,
            notas::delete_nota,
            asistencias::list_asistencias,
            asistencias::upsert_asistencia,
            asistencias::marcar_asistencias_presentes,
            asistencias::delete_asistencia,
            eventos::list_eventos,
            eventos::list_eventos_de_curso,
            eventos::create_evento,
            eventos::update_evento,
            eventos::delete_evento,
            observaciones::list_observaciones,
            observaciones::list_observaciones_de_curso,
            observaciones::list_observaciones_de_alumno,
            observaciones::create_observacion,
            observaciones::update_observacion,
            observaciones::delete_observacion,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
