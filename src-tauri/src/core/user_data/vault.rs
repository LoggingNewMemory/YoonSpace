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

use std::collections::HashMap;
use std::fs;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use serde::{Deserialize, Serialize};

use super::encryption::{decrypt_bytes, encrypt_bytes};
use super::website_data::{get_cookies_db_size, get_user_data_dir, get_vault_path};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedCredential {
    pub id: String,
    pub origin: String,
    pub username: String,
    pub password: String,
    pub title: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineerToken {
    pub id: String,
    pub service: String,
    pub label: String,
    pub token: String,
    pub notes: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct VaultPayload {
    pub version: u32,
    pub credentials: Vec<SavedCredential>,
    pub tokens: Vec<EngineerToken>,
    pub key_values: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultStats {
    pub is_encrypted: bool,
    pub encryption_algorithm: String,
    pub credentials_count: usize,
    pub tokens_count: usize,
    pub storage_dir: String,
    pub vault_file_bytes: u64,
    pub cookies_size_bytes: u64,
    pub cookies_formatted_size: String,
}

static VAULT_CACHE: Mutex<Option<VaultPayload>> = Mutex::new(None);

fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn format_bytes(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;

    if bytes >= GB {
        format!("{:.1} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

/// Loads and decrypts the vault from disk, or initializes an empty vault if not found.
pub fn load_vault() -> VaultPayload {
    let mut cache = VAULT_CACHE.lock().unwrap();
    if let Some(ref payload) = *cache {
        return payload.clone();
    }

    let vault_path = get_vault_path();
    if vault_path.exists() {
        if let Ok(encrypted_bytes) = fs::read(&vault_path) {
            if let Ok(decrypted_bytes) = decrypt_bytes(&encrypted_bytes) {
                if let Ok(payload) = serde_json::from_slice::<VaultPayload>(&decrypted_bytes) {
                    *cache = Some(payload.clone());
                    return payload;
                }
            } else {
                eprintln!("[YoonSpace Vault] Decryption error or key mismatch on {:?}", vault_path);
            }
        }
    }

    let empty = VaultPayload {
        version: 1,
        credentials: Vec::new(),
        tokens: Vec::new(),
        key_values: HashMap::new(),
    };
    *cache = Some(empty.clone());
    empty
}

/// Encrypts and atomically saves the vault to disk.
pub fn save_vault(payload: &VaultPayload) -> Result<(), String> {
    let json_bytes = serde_json::to_vec(payload).map_err(|e| format!("Serialization error: {}", e))?;
    let encrypted = encrypt_bytes(&json_bytes)?;

    let vault_path = get_vault_path();
    let tmp_path = vault_path.with_extension("tmp");

    fs::write(&tmp_path, encrypted).map_err(|e| format!("Failed to write temporary vault file: {}", e))?;
    fs::rename(&tmp_path, &vault_path).map_err(|e| format!("Failed to commit encrypted vault file: {}", e))?;

    let mut cache = VAULT_CACHE.lock().unwrap();
    *cache = Some(payload.clone());

    Ok(())
}

pub fn get_vault_stats() -> VaultStats {
    let vault = load_vault();
    let vault_path = get_vault_path();
    let vault_file_bytes = fs::metadata(&vault_path).map(|m| m.len()).unwrap_or(0);
    let cookies_bytes = get_cookies_db_size();

    VaultStats {
        is_encrypted: true,
        encryption_algorithm: "AES-256-GCM (256-bit AEAD)".to_string(),
        credentials_count: vault.credentials.len(),
        tokens_count: vault.tokens.len(),
        storage_dir: get_user_data_dir().to_string_lossy().to_string(),
        vault_file_bytes,
        cookies_size_bytes: cookies_bytes,
        cookies_formatted_size: format_bytes(cookies_bytes),
    }
}

pub fn list_saved_credentials() -> Vec<SavedCredential> {
    load_vault().credentials
}

pub fn save_credential(
    origin: String,
    username: String,
    password: String,
    title: Option<String>,
) -> Result<SavedCredential, String> {
    let mut vault = load_vault();
    let now = current_timestamp();

    // If credential for origin and username already exists, update it
    if let Some(existing) = vault.credentials.iter_mut().find(|c| c.origin == origin && c.username == username) {
        existing.password = password.clone();
        existing.title = title.clone().or_else(|| existing.title.clone());
        existing.updated_at = now;
        let cred = existing.clone();
        save_vault(&vault)?;
        return Ok(cred);
    }

    let id = format!("cred-{}", now * 1000 + (vault.credentials.len() as u64));
    let cred = SavedCredential {
        id,
        origin,
        username,
        password,
        title,
        created_at: now,
        updated_at: now,
    };

    vault.credentials.push(cred.clone());
    save_vault(&vault)?;
    Ok(cred)
}

pub fn delete_credential(id: &str) -> Result<(), String> {
    let mut vault = load_vault();
    vault.credentials.retain(|c| c.id != id);
    save_vault(&vault)
}

pub fn list_engineer_tokens() -> Vec<EngineerToken> {
    load_vault().tokens
}

pub fn save_engineer_token(
    service: String,
    label: String,
    token: String,
    notes: Option<String>,
) -> Result<EngineerToken, String> {
    let mut vault = load_vault();
    let now = current_timestamp();

    let id = format!("tok-{}", now * 1000 + (vault.tokens.len() as u64));
    let entry = EngineerToken {
        id,
        service,
        label,
        token,
        notes,
        created_at: now,
        updated_at: now,
    };

    vault.tokens.push(entry.clone());
    save_vault(&vault)?;
    Ok(entry)
}

pub fn delete_engineer_token(id: &str) -> Result<(), String> {
    let mut vault = load_vault();
    vault.tokens.retain(|t| t.id != id);
    save_vault(&vault)
}

pub fn clear_vault_data() -> Result<(), String> {
    let empty = VaultPayload {
        version: 1,
        credentials: Vec::new(),
        tokens: Vec::new(),
        key_values: HashMap::new(),
    };
    save_vault(&empty)?;
    let vault_path = get_vault_path();
    if vault_path.exists() {
        let _ = fs::remove_file(vault_path);
    }
    let mut cache = VAULT_CACHE.lock().unwrap();
    *cache = Some(empty);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vault_credentials_and_tokens() {
        let cred = save_credential(
            "https://github.com".to_string(),
            "octocat".to_string(),
            "super-secret-pass".to_string(),
            Some("GitHub".to_string()),
        ).expect("save credential");

        assert_eq!(cred.origin, "https://github.com");
        assert_eq!(cred.username, "octocat");

        let creds = list_saved_credentials();
        assert!(creds.iter().any(|c| c.id == cred.id));

        let token = save_engineer_token(
            "GitHub".to_string(),
            "CI Personal Access Token".to_string(),
            "ghp_test123456789".to_string(),
            Some("Repo read/write".to_string()),
        ).expect("save token");

        let tokens = list_engineer_tokens();
        assert!(tokens.iter().any(|t| t.id == token.id));

        // Clean up
        let _ = delete_credential(&cred.id);
        let _ = delete_engineer_token(&token.id);
    }
}
