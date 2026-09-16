//! Candado del cuaderno (paso 14).
//!
//! SQLCipher bundled en Windows pide OpenSSL/Perl/NASM y suele no cerrar el build.
//! Fallback documentado: AES-256-GCM + Argon2id. El `.sqlite` en disco **no** es
//! un archivo SQLite legible; la conexión vive en memoria y se reescribe cifrada
//! después de cada operación.

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};
use rand::RngCore;
use std::fs;
use std::path::{Path, PathBuf};
use zeroize::Zeroize;

pub const MAGIC: &[u8; 8] = b"TMSTDB01";
pub const MIN_CLAVE: usize = 8;
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;
const HEADER_LEN: usize = 8 + SALT_LEN + NONCE_LEN;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TipoArchivo {
    Ausente,
    Cifrado,
    SqliteEnClaro,
    Desconocido,
}

pub fn sidecar(path: &Path, suffix: &str) -> PathBuf {
    let mut s = path.as_os_str().to_os_string();
    s.push(suffix);
    PathBuf::from(s)
}

pub fn tipo_archivo(path: &Path) -> TipoArchivo {
    if !path.exists() {
        return TipoArchivo::Ausente;
    }
    let Ok(mut f) = fs::File::open(path) else {
        return TipoArchivo::Desconocido;
    };
    use std::io::Read;
    let mut magic = [0u8; 16];
    let n = match f.read(&mut magic) {
        Ok(n) => n,
        Err(_) => return TipoArchivo::Desconocido,
    };
    if n >= 8 && magic[..8] == MAGIC[..] {
        return TipoArchivo::Cifrado;
    }
    if n >= 16 && magic.starts_with(b"SQLite format 3") {
        return TipoArchivo::SqliteEnClaro;
    }
    if n == 0 {
        return TipoArchivo::Ausente;
    }
    TipoArchivo::Desconocido
}

pub fn validar_clave(clave: &str, repetir: Option<&str>) -> Result<(), String> {
    if clave.chars().count() < MIN_CLAVE {
        return Err(format!("La clave tiene que tener al menos {MIN_CLAVE} caracteres."));
    }
    if clave.len() > 128 {
        return Err("La clave es demasiado larga.".into());
    }
    if let Some(r) = repetir {
        if clave != r {
            return Err("Las dos claves no coinciden.".into());
        }
    }
    Ok(())
}

pub fn derivar_clave(clave: &str, salt: &[u8; SALT_LEN]) -> Result<[u8; KEY_LEN], String> {
    let params = Params::new(19 * 1024, 2, 1, Some(KEY_LEN)).map_err(|e| e.to_string())?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut out = [0u8; KEY_LEN];
    argon
        .hash_password_into(clave.as_bytes(), salt, &mut out)
        .map_err(|_| "No se pudo derivar la clave.".to_string())?;
    Ok(out)
}

pub fn cifrar(plano: &[u8], key: &[u8; KEY_LEN], salt: &[u8; SALT_LEN]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| "Clave de cifrado inválida.")?;
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let mut cuerpo = cipher
        .encrypt(nonce, plano)
        .map_err(|_| "No se pudo cifrar el cuaderno.".to_string())?;
    let mut out = Vec::with_capacity(HEADER_LEN + cuerpo.len());
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(salt);
    out.extend_from_slice(&nonce_bytes);
    out.append(&mut cuerpo);
    Ok(out)
}

pub fn descifrar(blob: &[u8], clave: &str) -> Result<(Vec<u8>, [u8; KEY_LEN], [u8; SALT_LEN]), String> {
    if blob.len() < HEADER_LEN + 16 {
        return Err("El archivo cifrado está incompleto.".into());
    }
    if blob[..8] != MAGIC[..] {
        return Err("Ese archivo no es un cuaderno cifrado.".into());
    }
    let mut salt = [0u8; SALT_LEN];
    salt.copy_from_slice(&blob[8..8 + SALT_LEN]);
    let nonce = Nonce::from_slice(&blob[8 + SALT_LEN..HEADER_LEN]);
    let mut key = derivar_clave(clave, &salt)?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|_| "Clave de cifrado inválida.")?;
    match cipher.decrypt(nonce, &blob[HEADER_LEN..]) {
        Ok(plano) => Ok((plano, key, salt)),
        Err(_) => {
            key.zeroize();
            Err("Clave incorrecta.".into())
        }
    }
}

pub fn escribir_atomico(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let nuevo = sidecar(path, ".new");
    fs::write(&nuevo, bytes).map_err(|e| e.to_string())?;
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    fs::rename(&nuevo, path).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn recuperar_si_quedo_new(path: &Path) {
    let nuevo = sidecar(path, ".new");
    if !path.exists() && nuevo.exists() {
        let _ = fs::rename(&nuevo, path);
    }
}

pub fn borrar_sidecars_sqlite(path: &Path) {
    let _ = fs::remove_file(sidecar(path, "-wal"));
    let _ = fs::remove_file(sidecar(path, "-shm"));
    let _ = fs::remove_file(sidecar(path, "-journal"));
}

pub fn nuevo_salt() -> [u8; SALT_LEN] {
    let mut salt = [0u8; SALT_LEN];
    rand::thread_rng().fill_bytes(&mut salt);
    salt
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_cifra_y_no_parece_sqlite() {
        let salt = nuevo_salt();
        let key = derivar_clave("clave-de-prueba", &salt).unwrap();
        let plano = b"SQLite format 3\0payload-de-prueba";
        let blob = cifrar(plano, &key, &salt).unwrap();
        assert_eq!(&blob[..8], MAGIC);
        assert!(!blob.starts_with(b"SQLite format 3"));
        let (out, _, salt2) = descifrar(&blob, "clave-de-prueba").unwrap();
        assert_eq!(out, plano);
        assert_eq!(salt, salt2);
    }

    #[test]
    fn clave_incorrecta_falla() {
        let salt = nuevo_salt();
        let key = derivar_clave("clave-buena-ok", &salt).unwrap();
        let blob = cifrar(b"hola-cuaderno", &key, &salt).unwrap();
        let err = descifrar(&blob, "clave-mala-ok").unwrap_err();
        assert_eq!(err, "Clave incorrecta.");
    }

    #[test]
    fn validar_clave_minimo_y_repetir() {
        assert!(validar_clave("corta", Some("corta")).is_err());
        assert!(validar_clave("ochochar", Some("distinta")).is_err());
        assert!(validar_clave("ochochar", Some("ochochar")).is_ok());
    }

    #[test]
    fn tipo_detecta_cifrado_y_ausente() {
        let dir = std::env::temp_dir().join(format!("adm-cursos-candado-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("x.sqlite");
        let _ = fs::remove_file(&path);
        assert_eq!(tipo_archivo(&path), TipoArchivo::Ausente);
        let salt = nuevo_salt();
        let key = derivar_clave("clave-de-prueba", &salt).unwrap();
        fs::write(&path, cifrar(b"abcabcabcabcabcabc", &key, &salt).unwrap()).unwrap();
        assert_eq!(tipo_archivo(&path), TipoArchivo::Cifrado);
        let _ = fs::remove_file(&path);
    }
}
