mod db;
pub mod domain;

use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
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
        .invoke_handler(tauri::generate_handler![greet, db_status])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
