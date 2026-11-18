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

use tauri::AppHandle;
use crate::core::user_data::{
    clear_cookies_db, clear_vault_data as core_clear_vault_data,
    delete_credential as core_delete_credential,
    delete_engineer_token as core_delete_engineer_token,
    get_vault_stats as core_get_vault_stats,
    list_saved_credentials as core_list_saved_credentials,
    list_engineer_tokens as core_list_engineer_tokens,
    save_credential as core_save_credential,
    save_engineer_token as core_save_engineer_token,
    EngineerToken, SavedCredential, VaultStats,
};

#[tauri::command]
pub fn get_vault_stats() -> Result<VaultStats, String> {
    Ok(core_get_vault_stats())
}

#[tauri::command]
pub fn list_saved_credentials() -> Result<Vec<SavedCredential>, String> {
    Ok(core_list_saved_credentials())
}

#[tauri::command]
pub fn save_credential(
    origin: String,
    username: String,
    password: String,
    title: Option<String>,
) -> Result<SavedCredential, String> {
    core_save_credential(origin, username, password, title)
}

#[tauri::command]
pub fn delete_credential(id: String) -> Result<(), String> {
    core_delete_credential(&id)
}

#[tauri::command]
pub fn list_engineer_tokens() -> Result<Vec<EngineerToken>, String> {
    Ok(core_list_engineer_tokens())
}

#[tauri::command]
pub fn save_engineer_token(
    service: String,
    label: String,
    token: String,
    notes: Option<String>,
) -> Result<EngineerToken, String> {
    core_save_engineer_token(service, label, token, notes)
}

#[tauri::command]
pub fn delete_engineer_token(id: String) -> Result<(), String> {
    core_delete_engineer_token(&id)
}

#[tauri::command]
pub fn clear_vault_data() -> Result<(), String> {
    core_clear_vault_data()
}

#[tauri::command]
pub fn clear_persistent_cookies(_app: AppHandle) -> Result<(), String> {
    clear_cookies_db()
}
