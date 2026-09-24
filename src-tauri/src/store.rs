use std::fs;
use std::path::{Path, PathBuf};

use tauri::AppHandle;
use tauri::Manager;

use crate::ffmpeg::resolve_ffmpeg;
use crate::model::{
    CalendarFile, HubSnapshot, LibraryEntry, LibraryFile, ProjectBundle, ProjectDocument, now_iso,
};

pub fn app_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|err| err.to_string())?;
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    Ok(dir)
}

pub fn default_projects_root() -> PathBuf {
    let home = std::env::var("USERPROFILE")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir());
    home.join("Documents").join("Harbour")
}

fn library_path(dir: &Path) -> PathBuf {
    dir.join("library.json")
}

fn calendar_path(dir: &Path) -> PathBuf {
    dir.join("calendar.json")
}

fn read_json<T: serde::de::DeserializeOwned + Default>(path: &Path) -> Result<T, String> {
    if !path.exists() {
        return Ok(T::default());
    }
    let text = fs::read_to_string(path).map_err(|err| err.to_string())?;
    serde_json::from_str(&text).map_err(|err| err.to_string())
}

fn write_json<T: serde::Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let text = serde_json::to_string_pretty(value).map_err(|err| err.to_string())?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, text).map_err(|err| err.to_string())?;
    fs::rename(&tmp, path).map_err(|err| err.to_string())
}

pub fn load_library(dir: &Path) -> Result<LibraryFile, String> {
    read_json(&library_path(dir))
}

pub fn save_library(dir: &Path, library: &LibraryFile) -> Result<(), String> {
    write_json(&library_path(dir), library)
}

pub fn load_calendar(dir: &Path) -> Result<CalendarFile, String> {
    read_json(&calendar_path(dir))
}

pub fn save_calendar(dir: &Path, calendar: &CalendarFile) -> Result<(), String> {
    write_json(&calendar_path(dir), calendar)
}

pub fn snapshot(app: &AppHandle) -> Result<HubSnapshot, String> {
    let dir = app_dir(app)?;
    let library = load_library(&dir)?;
    let calendar = load_calendar(&dir)?;
    let ffmpeg_resolved = resolve_ffmpeg(library.ffmpeg_path.as_deref()).map(|path| path.display().to_string());
    Ok(HubSnapshot {
        library,
        calendar,
        ffmpeg_resolved,
    })
}

pub fn project_file(folder: &Path) -> PathBuf {
    folder.join("project.json")
}

pub fn read_project(folder: &Path) -> Result<ProjectDocument, String> {
    let path = project_file(folder);
    let text = fs::read_to_string(&path).map_err(|err| err.to_string())?;
    serde_json::from_str(&text).map_err(|err| err.to_string())
}

pub fn write_project(folder: &Path, project: &ProjectDocument) -> Result<(), String> {
    fs::create_dir_all(folder.join("media")).map_err(|err| err.to_string())?;
    fs::create_dir_all(folder.join("exports")).map_err(|err| err.to_string())?;
    write_json(&project_file(folder), project)
}

pub fn sanitize_title(title: &str) -> String {
    let mut out = String::new();
    for ch in title.chars() {
        if ch.is_ascii_alphanumeric() || ch == ' ' || ch == '-' || ch == '_' {
            out.push(ch);
        }
    }
    let collapsed = out.split_whitespace().collect::<Vec<_>>().join(" ");
    let trimmed = collapsed.trim().to_string();
    if trimmed.is_empty() {
        "Untitled".to_string()
    } else {
        trimmed.chars().take(60).collect()
    }
}

pub fn unique_folder(parent: &Path, title: &str) -> PathBuf {
    let base = sanitize_title(title);
    let mut candidate = parent.join(&base);
    let mut index = 2;
    while candidate.exists() {
        candidate = parent.join(format!("{base} {index}"));
        index += 1;
    }
    candidate
}

pub fn entry_for<'a>(library: &'a LibraryFile, id: &str) -> Result<&'a LibraryEntry, String> {
    library
        .projects
        .iter()
        .find(|entry| entry.id == id)
        .ok_or_else(|| "Project was not found in the library.".to_string())
}

pub fn entry_mut<'a>(library: &'a mut LibraryFile, id: &str) -> Result<&'a mut LibraryEntry, String> {
    library
        .projects
        .iter_mut()
        .find(|entry| entry.id == id)
        .ok_or_else(|| "Project was not found in the library.".to_string())
}

pub fn bundle_for(library: &LibraryFile, id: &str) -> Result<ProjectBundle, String> {
    let entry = entry_for(library, id)?;
    let folder = PathBuf::from(&entry.folder_path);
    let project = read_project(&folder)?;
    Ok(ProjectBundle {
        folder_path: folder.display().to_string(),
        project,
    })
}

pub fn touch_updated(entry: &mut LibraryEntry, project: &mut ProjectDocument) {
    let stamp = now_iso();
    project.updated_at = stamp.clone();
    entry.updated_at = stamp;
    entry.title = project.title.clone();
}

pub fn copy_dir(from: &Path, to: &Path) -> Result<(), String> {
    fs::create_dir_all(to).map_err(|err| err.to_string())?;
    for item in fs::read_dir(from).map_err(|err| err.to_string())? {
        let item = item.map_err(|err| err.to_string())?;
        let dest = to.join(item.file_name());
        if item.path().is_dir() {
            copy_dir(&item.path(), &dest)?;
        } else {
            fs::copy(item.path(), dest).map_err(|err| err.to_string())?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::sanitize_title;

    use crate::model::ProjectDocument;

    #[test]
    fn sanitises_titles() {
        assert_eq!(sanitize_title("  My: video!! "), "My video");
        assert_eq!(sanitize_title("///"), "Untitled");
    }

    #[test]
    fn writes_and_reads_a_project_folder() {
        let folder = std::env::temp_dir().join(format!("harbour-test-{}", crate::model::new_id()));
        let project = ProjectDocument::create("Demo cut".to_string());
        super::write_project(&folder, &project).unwrap();
        let loaded = super::read_project(&folder).unwrap();
        assert_eq!(loaded.title, "Demo cut");
        assert!(folder.join("media").is_dir());
        assert!(folder.join("exports").is_dir());
        let _ = std::fs::remove_dir_all(folder);
    }
}
