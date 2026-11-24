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

use std::fs::{self, OpenOptions};
use std::io::Write;
#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;
use std::sync::Mutex;
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key, Nonce,
};
use rand::RngCore;
use sha2::{Digest, Sha256};

use super::website_data::get_vault_key_path;

pub const VAULT_MAGIC: &[u8; 10] = b"YOONVAULT\x01";
pub const NONCE_SIZE: usize = 12; // 96-bit AES-GCM nonce

static ROOT_KEY_CACHE: Mutex<Option<[u8; 32]>> = Mutex::new(None);

/// Reads or generates the 32-byte cryptographically secure root key.
/// On Unix systems, this file is created strictly with mode 0600 (owner-only access).
fn get_or_create_root_key() -> Result<[u8; 32], String> {
    let mut cache = ROOT_KEY_CACHE.lock().unwrap();
    if let Some(key) = *cache {
        return Ok(key);
    }

    let key_path = get_vault_key_path();

    if key_path.exists() {
        if let Ok(bytes) = fs::read(&key_path) {
            if bytes.len() == 32 {
                let mut key = [0u8; 32];
                key.copy_from_slice(&bytes);
                *cache = Some(key);
                return Ok(key);
            }
        }
    }

    // Generate fresh 32 random bytes from OS CSPRNG
    let mut new_key = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut new_key);

    let mut open_opts = OpenOptions::new();
    open_opts.write(true).create(true).truncate(true);

    #[cfg(unix)]
    open_opts.mode(0o600); // Read/write only by owner

    let mut file = open_opts
        .open(&key_path)
        .map_err(|e| format!("Failed to create secure root vault key file: {}", e))?;

    file.write_all(&new_key)
        .map_err(|e| format!("Failed to write secure root vault key: {}", e))?;
    file.flush()
        .map_err(|e| format!("Failed to flush secure root vault key: {}", e))?;

    *cache = Some(new_key);
    Ok(new_key)
}

/// Retrieves the host machine identifier (e.g. /etc/machine-id) or fallback.
fn get_machine_identifier() -> String {
    if let Ok(id) = fs::read_to_string("/etc/machine-id") {
        let trimmed = id.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    if let Ok(id) = fs::read_to_string("/var/lib/dbus/machine-id") {
        let trimmed = id.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    // Fallback: hostname
    let mut buf = [0u8; 256];
    let res = unsafe { libc::gethostname(buf.as_mut_ptr() as *mut libc::c_char, buf.len()) };
    if res == 0 {
        if let Ok(s) = std::str::from_utf8(&buf) {
            return s.trim_matches('\0').to_string();
        }
    }
    "yoonspace-default-machine-seed".to_string()
}

/// Derives the 256-bit AES-GCM encryption key using SHA-256 over root secret + machine seed + user UID.
pub fn derive_vault_key() -> Result<[u8; 32], String> {
    let root_key = get_or_create_root_key()?;
    let machine_id = get_machine_identifier();
    let uid = unsafe { libc::getuid() };

    let mut hasher = Sha256::new();
    hasher.update(b"YOONSPACE_SECURE_VAULT_AES256GCM_V1_DERIVATION");
    hasher.update(&root_key);
    hasher.update(machine_id.as_bytes());
    hasher.update(&uid.to_le_bytes());

    let result = hasher.finalize();
    let mut derived = [0u8; 32];
    derived.copy_from_slice(&result);
    Ok(derived)
}

/// Encrypts plaintext bytes using AES-256-GCM authenticated encryption.
/// Output format: [10 bytes Magic "YOONVAULT\x01"] + [12 bytes Nonce] + [Ciphertext + 16 bytes GCM Auth Tag]
pub fn encrypt_bytes(plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let key_bytes = derive_vault_key()?;
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);

    let mut nonce_bytes = [0u8; NONCE_SIZE];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| format!("AES-256-GCM encryption error: {}", e))?;

    let mut payload = Vec::with_capacity(VAULT_MAGIC.len() + NONCE_SIZE + ciphertext.len());
    payload.extend_from_slice(VAULT_MAGIC);
    payload.extend_from_slice(&nonce_bytes);
    payload.extend_from_slice(&ciphertext);

    Ok(payload)
}

/// Decrypts ciphertext bytes using AES-256-GCM authenticated encryption.
/// Verifies the 10-byte magic header, extracts the 96-bit nonce, and validates the 128-bit authentication tag.
pub fn decrypt_bytes(encrypted: &[u8]) -> Result<Vec<u8>, String> {
    let min_len = VAULT_MAGIC.len() + NONCE_SIZE + 16; // 16 bytes minimum auth tag
    if encrypted.len() < min_len {
        return Err("Encrypted vault payload too short or corrupted".to_string());
    }

    if &encrypted[..VAULT_MAGIC.len()] != VAULT_MAGIC {
        return Err("Invalid vault magic header or corrupted format".to_string());
    }

    let nonce_start = VAULT_MAGIC.len();
    let nonce_end = nonce_start + NONCE_SIZE;
    let nonce_bytes = &encrypted[nonce_start..nonce_end];
    let ciphertext = &encrypted[nonce_end..];

    let key_bytes = derive_vault_key()?;
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);
    let nonce = Nonce::from_slice(nonce_bytes);

    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "Decryption failed: data corrupted or authentication tag mismatch (tampering detected)".to_string())
}

