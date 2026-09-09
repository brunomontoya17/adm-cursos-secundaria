mod cursos;
mod db;
pub mod domain;
mod maestras;

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
