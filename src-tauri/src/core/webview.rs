use tauri::{AppHandle, Manager, WebviewBuilder, WebviewUrl, LogicalPosition, LogicalSize};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SplitViewRequest {
    pub left_url: String,
    pub right_url: String,
    pub bounds: SplitBounds,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SplitBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

pub fn spawn_split_views(app: &AppHandle, req: SplitViewRequest) -> Result<(), String> {
    let window = app.get_window("main").ok_or("Main window not found")?;

    close_split_views(app)?;

    let half_width = req.bounds.width / 2.0;
    let height = req.bounds.height;
    let top_y = req.bounds.y;
    let left_x = req.bounds.x;
    let right_x = req.bounds.x + half_width;

    let left_url: url::Url = req.left_url.parse().map_err(|e: url::ParseError| e.to_string())?;
    let right_url: url::Url = req.right_url.parse().map_err(|e: url::ParseError| e.to_string())?;

    let left_builder = WebviewBuilder::new("split_left", WebviewUrl::External(left_url));
    let right_builder = WebviewBuilder::new("split_right", WebviewUrl::External(right_url));

    window.add_child(
        left_builder,
        LogicalPosition::new(left_x, top_y),
        LogicalSize::new(half_width, height),
    ).map_err(|e| e.to_string())?;

    window.add_child(
        right_builder,
        LogicalPosition::new(right_x, top_y),
        LogicalSize::new(half_width, height),
    ).map_err(|e| e.to_string())?;

    Ok(())
}

pub fn update_split_bounds(app: &AppHandle, bounds: SplitBounds) -> Result<(), String> {
    let half_width = bounds.width / 2.0;
    let height = bounds.height;
    let top_y = bounds.y;
    let left_x = bounds.x;
    let right_x = bounds.x + half_width;

    if let Some(left) = app.get_webview("split_left") {
        let _ = left.set_position(LogicalPosition::new(left_x, top_y));
        let _ = left.set_size(LogicalSize::new(half_width, height));
    }
    if let Some(right) = app.get_webview("split_right") {
        let _ = right.set_position(LogicalPosition::new(right_x, top_y));
        let _ = right.set_size(LogicalSize::new(half_width, height));
    }
    Ok(())
}

pub fn navigate_split_view(app: &AppHandle, pane: &str, target_url: &str) -> Result<(), String> {
    let label = match pane {
        "left" => "split_left",
        "right" => "split_right",
        other => other,
    };

    if let Some(view) = app.get_webview(label) {
        let parsed: url::Url = target_url.parse().map_err(|e: url::ParseError| e.to_string())?;
        view.navigate(parsed).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err(format!("Webview '{}' not active", label))
    }
}

pub fn is_split_active(app: &AppHandle) -> bool {
    app.get_webview("split_left").is_some() || app.get_webview("split_right").is_some()
}

pub fn close_split_views(app: &AppHandle) -> Result<(), String> {
    if let Some(view) = app.get_webview("split_left") {
        let _ = view.close();
    }
    if let Some(view) = app.get_webview("split_right") {
        let _ = view.close();
    }
    Ok(())
}
