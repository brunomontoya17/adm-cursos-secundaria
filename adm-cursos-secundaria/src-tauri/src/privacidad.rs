//! Aviso de alcance (paso 12). Archivo junto a la DB, no una tabla SQLite:
//! tiene que poder leerse antes de abrir el cuaderno (paso 14: clave al arrancar).

use crate::domain::AvisoPrivacidad;
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const ARCHIVO: &str = "privacidad.json";

#[derive(Debug, Deserialize)]
struct AvisoArchivo {
    aceptado: Option<i64>,
}

pub fn path_aviso(dir: &Path) -> PathBuf {
    dir.join(ARCHIVO)
}

pub fn leer_aviso(path: &Path) -> AvisoPrivacidad {
    let Ok(raw) = fs::read_to_string(path) else {
        return AvisoPrivacidad { aceptado: 0 };
    };
    match serde_json::from_str::<AvisoArchivo>(&raw) {
        Ok(parsed) if parsed.aceptado == Some(1) => AvisoPrivacidad { aceptado: 1 },
        _ => AvisoPrivacidad { aceptado: 0 },
    }
}

pub fn escribir_aceptado(path: &Path) -> Result<AvisoPrivacidad, String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let estado = AvisoPrivacidad { aceptado: 1 };
    let json = serde_json::to_string_pretty(&estado).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())?;
    Ok(estado)
}

fn path_en_app(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(path_aviso(&dir))
}

#[tauri::command(rename_all = "snake_case")]
pub fn aviso_privacidad_estado(app: AppHandle) -> Result<AvisoPrivacidad, String> {
    Ok(leer_aviso(&path_en_app(&app)?))
}

#[tauri::command(rename_all = "snake_case")]
pub fn aceptar_aviso_privacidad(app: AppHandle) -> Result<AvisoPrivacidad, String> {
    escribir_aceptado(&path_en_app(&app)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "adm-cursos-aviso-{}-{}",
            std::process::id(),
            name
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        path_aviso(&dir)
    }

    #[test]
    fn sin_archivo_no_esta_aceptado() {
        let path = tmp("falta");
        assert_eq!(leer_aviso(&path).aceptado, 0);
    }

    #[test]
    fn aceptar_persiste_y_se_lee() {
        let path = tmp("ok");
        let saved = escribir_aceptado(&path).unwrap();
        assert_eq!(saved.aceptado, 1);
        assert_eq!(leer_aviso(&path).aceptado, 1);
        let raw = fs::read_to_string(&path).unwrap();
        assert!(raw.contains("\"aceptado\""));
    }

    #[test]
    fn json_roto_o_cero_no_cuenta() {
        let path = tmp("roto");
        fs::write(&path, "{no json").unwrap();
        assert_eq!(leer_aviso(&path).aceptado, 0);
        fs::write(&path, "{\"aceptado\":0}").unwrap();
        assert_eq!(leer_aviso(&path).aceptado, 0);
    }
}
