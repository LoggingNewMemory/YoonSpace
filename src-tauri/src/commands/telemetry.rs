use crate::core::telemetry::{get_process_memory, MemoryStats};

#[tauri::command]
pub fn get_telemetry() -> MemoryStats {
    get_process_memory()
}
