mod draw;
mod ffmpeg;
mod model;
mod store;

use std::fs;
use std::path::PathBuf;

use model::{
    AspectPreset, CalendarItem, HubSnapshot, PostStatus, ProjectBundle, ProjectDocument, RolloutResult,
    RolloutSlotInput, now_iso,
};
use store::{
    app_dir, bundle_for, copy_dir, default_projects_root, entry_mut, load_calendar, load_library,
    save_calendar, save_library, snapshot, touch_updated, unique_folder, write_project,
};
use tauri::AppHandle;

fn require_ffmpeg(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app_dir(app)?;
    let library = load_library(&dir)?;
    ffmpeg::resolve_ffmpeg(library.ffmpeg_path.as_deref())
        .ok_or_else(|| "FFmpeg was not found. Set the path in Settings.".to_string())
}

fn save_bundle(app: &AppHandle, mut project: ProjectDocument) -> Result<ProjectBundle, String> {
    let dir = app_dir(app)?;
    let mut library = load_library(&dir)?;
    let entry = entry_mut(&mut library, &project.id)?;
    let folder = PathBuf::from(&entry.folder_path);
    touch_updated(entry, &mut project);
    write_project(&folder, &project)?;
    let folder_path = folder.display().to_string();
    save_library(&dir, &library)?;
    Ok(ProjectBundle { folder_path, project })
}

#[tauri::command]
fn hub_load(app: AppHandle) -> Result<HubSnapshot, String> {
    snapshot(&app)
}

#[tauri::command]
fn project_create(app: AppHandle, title: String) -> Result<ProjectBundle, String> {
    let dir = app_dir(&app)?;
    let mut library = load_library(&dir)?;
    let root = library
        .projects_root
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(default_projects_root);
    fs::create_dir_all(&root).map_err(|err| err.to_string())?;
    let folder = unique_folder(&root, &title);
    let project = ProjectDocument::create(store::sanitize_title(&title));
    write_project(&folder, &project)?;
    library.projects.push(model::LibraryEntry {
        id: project.id.clone(),
        title: project.title.clone(),
        folder_path: folder.display().to_string(),
        created_at: project.created_at.clone(),
        updated_at: project.updated_at.clone(),
        archived: false,
        last_opened_at: Some(now_iso()),
    });
    save_library(&dir, &library)?;
    Ok(ProjectBundle {
        folder_path: folder.display().to_string(),
        project,
    })
}

#[tauri::command]
fn project_open(app: AppHandle, id: String) -> Result<ProjectBundle, String> {
    let dir = app_dir(&app)?;
    let mut library = load_library(&dir)?;
    let entry = entry_mut(&mut library, &id)?;
    entry.last_opened_at = Some(now_iso());
    let folder = PathBuf::from(&entry.folder_path);
    save_library(&dir, &library)?;
    let project = store::read_project(&folder)?;
    Ok(ProjectBundle {
        folder_path: folder.display().to_string(),
        project,
    })
}

#[tauri::command]
fn project_save(app: AppHandle, project: ProjectDocument) -> Result<ProjectBundle, String> {
    save_bundle(&app, project)
}

#[tauri::command]
fn project_rename(app: AppHandle, id: String, title: String) -> Result<ProjectBundle, String> {
    let dir = app_dir(&app)?;
    let mut library = load_library(&dir)?;
    let entry = entry_mut(&mut library, &id)?;
    let folder = PathBuf::from(&entry.folder_path);
    let mut project = store::read_project(&folder)?;
    project.title = store::sanitize_title(&title);
    let parent = folder.parent().map(PathBuf::from).unwrap_or_else(|| folder.clone());
    let desired = parent.join(&project.title);
    let folder = if desired == folder {
        folder
    } else if !desired.exists() {
        fs::rename(&folder, &desired).map_err(|err| err.to_string())?;
        entry.folder_path = desired.display().to_string();
        desired
    } else {
        folder
    };
    touch_updated(entry, &mut project);
    write_project(&folder, &project)?;
    save_library(&dir, &library)?;
    Ok(ProjectBundle {
        folder_path: folder.display().to_string(),
        project,
    })
}

#[tauri::command]
fn project_duplicate(app: AppHandle, id: String) -> Result<ProjectBundle, String> {
    let dir = app_dir(&app)?;
    let mut library = load_library(&dir)?;
    let source = bundle_for(&library, &id)?;
    let parent = PathBuf::from(&source.folder_path)
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(default_projects_root);
    let folder = unique_folder(&parent, &format!("{} copy", source.project.title));
    copy_dir(PathBuf::from(&source.folder_path).as_path(), &folder)?;
    let mut project = store::read_project(&folder)?;
    let stamp = now_iso();
    project.id = model::new_id();
    project.title = store::sanitize_title(&format!("{} copy", source.project.title));
    project.created_at = stamp.clone();
    project.updated_at = stamp.clone();
    project.calendar_item_ids.clear();
    write_project(&folder, &project)?;
    library.projects.push(model::LibraryEntry {
        id: project.id.clone(),
        title: project.title.clone(),
        folder_path: folder.display().to_string(),
        created_at: stamp.clone(),
        updated_at: stamp,
        archived: false,
        last_opened_at: Some(now_iso()),
    });
    save_library(&dir, &library)?;
    Ok(ProjectBundle {
        folder_path: folder.display().to_string(),
        project,
    })
}

#[tauri::command]
fn project_set_archived(app: AppHandle, id: String, archived: bool) -> Result<HubSnapshot, String> {
    let dir = app_dir(&app)?;
    let mut library = load_library(&dir)?;
    let entry = entry_mut(&mut library, &id)?;
    entry.archived = archived;
    save_library(&dir, &library)?;
    snapshot(&app)
}

#[tauri::command]
fn media_import(app: AppHandle, project_id: String, paths: Vec<String>) -> Result<ProjectBundle, String> {
    let dir = app_dir(&app)?;
    let library = load_library(&dir)?;
    let ffmpeg = ffmpeg::resolve_ffmpeg(library.ffmpeg_path.as_deref());
    let mut bundle = bundle_for(&library, &project_id)?;
    let folder = PathBuf::from(&bundle.folder_path);
    for path in paths {
        let asset = ffmpeg::import_asset(ffmpeg.as_deref(), &folder, PathBuf::from(path).as_path())?;
        bundle.project.media.push(asset);
    }
    save_bundle(&app, bundle.project)
}

#[tauri::command]
fn settings_save(
    app: AppHandle,
    ffmpeg_path: Option<String>,
    notifications_enabled: bool,
    projects_root: Option<String>,
) -> Result<HubSnapshot, String> {
    let dir = app_dir(&app)?;
    let mut library = load_library(&dir)?;
    library.ffmpeg_path = ffmpeg_path.filter(|path| !path.trim().is_empty());
    library.notifications_enabled = notifications_enabled;
    library.projects_root = projects_root.filter(|path| !path.trim().is_empty());
    save_library(&dir, &library)?;
    snapshot(&app)
}

#[tauri::command]
fn calendar_save(app: AppHandle, items: Vec<CalendarItem>) -> Result<HubSnapshot, String> {
    let dir = app_dir(&app)?;
    save_calendar(&dir, &model::CalendarFile { items: items.clone() })?;
    sync_project_links(&dir, &items)?;
    snapshot(&app)
}

fn sync_project_links(dir: &std::path::Path, items: &[CalendarItem]) -> Result<(), String> {
    let library = load_library(dir)?;
    for entry in &library.projects {
        let folder = PathBuf::from(&entry.folder_path);
        if !store::project_file(&folder).exists() {
            continue;
        }
        let mut project = store::read_project(&folder)?;
        project.calendar_item_ids = items
            .iter()
            .filter(|item| item.project_id == project.id)
            .map(|item| item.id.clone())
            .collect();
        write_project(&folder, &project)?;
    }
    Ok(())
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|err| err.to_string())
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    if let Some(parent) = PathBuf::from(&path).parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    fs::write(path, contents).map_err(|err| err.to_string())
}

#[tauri::command]
fn notify(app: AppHandle, title: String, body: String) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn export_render(
    app: AppHandle,
    project_id: String,
    aspect: AspectPreset,
    burn_captions: bool,
    output_path: String,
) -> Result<String, String> {
    let ffmpeg = require_ffmpeg(&app)?;
    let dir = app_dir(&app)?;
    let library = load_library(&dir)?;
    let bundle = bundle_for(&library, &project_id)?;
    let folder = PathBuf::from(bundle.folder_path);
    let output = PathBuf::from(&output_path);
    let project = bundle.project;
    tauri::async_runtime::spawn_blocking(move || {
        ffmpeg::render_project(&app, &ffmpeg, &folder, &project, &aspect, burn_captions, &output)
    })
    .await
    .map_err(|err| err.to_string())??;
    Ok(output_path)
}

#[tauri::command]
async fn rollout_prepare(
    app: AppHandle,
    name: String,
    project_id: String,
    slots: Vec<RolloutSlotInput>,
    burn_captions: bool,
    output_parent: String,
) -> Result<RolloutResult, String> {
    if slots.is_empty() {
        return Err("Add at least one slot.".to_string());
    }
    let ffmpeg = require_ffmpeg(&app)?;
    let dir = app_dir(&app)?;
    let library = load_library(&dir)?;
    let bundle = bundle_for(&library, &project_id)?;
    let safe_name = store::sanitize_title(&name);
    let root = unique_folder(&PathBuf::from(&output_parent), &safe_name);
    fs::create_dir_all(&root).map_err(|err| err.to_string())?;
    let folder = PathBuf::from(&bundle.folder_path);
    let project = bundle.project.clone();
    let app_render = app.clone();
    let render_root = root.clone();
    let render_slots = slots.clone();
    let rendered = tauri::async_runtime::spawn_blocking(move || {
        render_unique_aspects(&app_render, &ffmpeg, &folder, &project, &render_slots, burn_captions, &render_root)
    })
    .await
    .map_err(|err| err.to_string())??;
    let mut calendar = load_calendar(&dir)?;
    let rollout_id = model::new_id();
    let mut csv = String::from("scheduled_for,network,aspect,video,caption\n");
    for (index, slot) in slots.iter().enumerate() {
        let network = slot.network.folder_name();
        let slot_dir = unique_slot_dir(&root, network);
        fs::create_dir_all(&slot_dir).map_err(|err| err.to_string())?;
        let video_src = rendered
            .iter()
            .find(|(aspect, _)| aspect == &slot.aspect)
            .map(|(_, path)| path.clone())
            .ok_or_else(|| "A rendered preset is missing.".to_string())?;
        let video_dest = slot_dir.join("video.mp4");
        fs::copy(&video_src, &video_dest).map_err(|err| err.to_string())?;
        let caption_path = slot_dir.join("caption.txt");
        fs::write(&caption_path, &slot.caption).map_err(|err| err.to_string())?;
        csv.push_str(&format!(
            "{},{},{},{},{}\n",
            csv_cell(&slot.scheduled_for),
            csv_cell(network),
            csv_cell(&format!("{:?}", slot.aspect).to_lowercase()),
            csv_cell(&video_dest.display().to_string()),
            csv_cell(&caption_path.display().to_string()),
        ));
        let item = CalendarItem {
            id: model::new_id(),
            project_id: project_id.clone(),
            network: slot.network.clone(),
            caption: slot.caption.clone(),
            scheduled_for: slot.scheduled_for.clone(),
            status: PostStatus::PackReady,
            aspect: slot.aspect.clone(),
            rollout_id: Some(rollout_id.clone()),
            reminded: false,
        };
        calendar.items.push(item);
        let _ = index;
    }
    fs::write(root.join("schedule.csv"), csv).map_err(|err| err.to_string())?;
    save_calendar(&dir, &calendar)?;
    sync_project_links(&dir, &calendar.items)?;
    Ok(RolloutResult {
        folder: root.display().to_string(),
        hub: snapshot(&app)?,
    })
}

fn render_unique_aspects(
    app: &AppHandle,
    ffmpeg: &PathBuf,
    folder: &PathBuf,
    project: &ProjectDocument,
    slots: &[RolloutSlotInput],
    burn_captions: bool,
    root: &PathBuf,
) -> Result<Vec<(AspectPreset, PathBuf)>, String> {
    let mut rendered = Vec::new();
    for slot in slots {
        if rendered.iter().any(|(aspect, _)| aspect == &slot.aspect) {
            continue;
        }
        let output = root.join(format!("preset-{}.mp4", preset_name(&slot.aspect)));
        ffmpeg::render_project(app, ffmpeg, folder, project, &slot.aspect, burn_captions, &output)?;
        rendered.push((slot.aspect.clone(), output));
    }
    Ok(rendered)
}

fn preset_name(aspect: &AspectPreset) -> &'static str {
    match aspect {
        AspectPreset::Vertical => "vertical",
        AspectPreset::Square => "square",
        AspectPreset::Widescreen => "widescreen",
    }
}

fn unique_slot_dir(root: &PathBuf, name: &str) -> PathBuf {
    let mut candidate = root.join(name);
    let mut index = 2;
    while candidate.exists() {
        candidate = root.join(format!("{name}-{index}"));
        index += 1;
    }
    candidate
}

fn csv_cell(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            hub_load,
            project_create,
            project_open,
            project_save,
            project_rename,
            project_duplicate,
            project_set_archived,
            media_import,
            settings_save,
            calendar_save,
            read_text_file,
            write_text_file,
            notify,
            export_render,
            rollout_prepare
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
