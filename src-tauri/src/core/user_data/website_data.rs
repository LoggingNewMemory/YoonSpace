// YoonSpace - A lightweight browser for Engineers
// Copyright (C) 2026 Kana Wesley Yamada
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

use std::fs;
use std::path::PathBuf;

/// Returns the root persistent user data directory (~/.local/share/yoonspace).
pub fn get_user_data_dir() -> PathBuf {
    if let Some(data_dir) = dirs::data_dir() {
        let app_data = data_dir.join("yoonspace");
        let _ = fs::create_dir_all(&app_data);
        app_data
    } else if let Some(home) = dirs::home_dir() {
        let app_data = home.join(".local").join("share").join("yoonspace");
        let _ = fs::create_dir_all(&app_data);
        app_data
    } else {
        let app_data = PathBuf::from(".yoonspace_data");
        let _ = fs::create_dir_all(&app_data);
        app_data
    }
}

/// Returns the path to the persistent SQLite cookies database (~/.local/share/yoonspace/cookies.db).
pub fn get_cookies_db_path() -> PathBuf {
    get_user_data_dir().join("cookies.db")
}

/// Returns the path to the strongly encrypted User Data Vault (~/.local/share/yoonspace/vault.enc).
pub fn get_vault_path() -> PathBuf {
    get_user_data_dir().join("vault.enc")
}

/// Returns the path to the machine/user master key file (~/.local/share/yoonspace/.vault_key).
pub fn get_vault_key_path() -> PathBuf {
    get_user_data_dir().join(".vault_key")
}

/// Calculates the size of the persistent cookies database in bytes.
pub fn get_cookies_db_size() -> u64 {
    let path = get_cookies_db_path();
    if let Ok(meta) = fs::metadata(&path) {
        meta.len()
    } else {
        0
    }
}

/// Clears the persistent cookies database file.
pub fn clear_cookies_db() -> Result<(), String> {
    let path = get_cookies_db_path();
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("Failed to delete cookies database: {}", e))?;
    }
    // Also remove WAL / SHM files if present
    let wal = path.with_extension("db-wal");
    if wal.exists() {
        let _ = fs::remove_file(wal);
    }
    let shm = path.with_extension("db-shm");
    if shm.exists() {
        let _ = fs::remove_file(shm);
    }
    Ok(())
}
