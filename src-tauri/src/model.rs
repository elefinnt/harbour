use serde::{Deserialize, Serialize};

pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AspectPreset {
    Vertical,
    Square,
    Widescreen,
}

impl AspectPreset {
    pub fn size(&self) -> (u32, u32) {
        match self {
            Self::Vertical => (1080, 1920),
            Self::Square => (1080, 1080),
            Self::Widescreen => (1920, 1080),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Network {
    Youtube,
    Tiktok,
    Instagram,
    Facebook,
    Linkedin,
    X,
}

impl Network {
    pub fn folder_name(&self) -> &'static str {
        match self {
            Self::Youtube => "youtube",
            Self::Tiktok => "tiktok",
            Self::Instagram => "instagram",
            Self::Facebook => "facebook",
            Self::Linkedin => "linkedin",
            Self::X => "x",
        }
    }

    pub fn all() -> [Network; 6] {
        [
            Self::Youtube,
            Self::Tiktok,
            Self::Instagram,
            Self::Facebook,
            Self::Linkedin,
            Self::X,
        ]
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MediaKind {
    Video,
    Audio,
    Image,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaAsset {
    pub id: String,
    pub name: String,
    pub kind: MediaKind,
    pub relative_path: String,
    pub duration_ms: Option<u64>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub has_audio: bool,
    pub thumbnail_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Clip {
    pub id: String,
    pub asset_id: String,
    pub timeline_start_ms: u64,
    pub in_ms: u64,
    pub out_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextBlock {
    pub id: String,
    pub start_ms: u64,
    pub end_ms: u64,
    pub content: String,
    pub size: u32,
    pub colour: String,
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptionBlock {
    pub id: String,
    pub start_ms: u64,
    pub end_ms: u64,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Timeline {
    pub clips: Vec<Clip>,
    pub texts: Vec<TextBlock>,
    pub captions: Vec<CaptionBlock>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformCopy {
    pub network: Network,
    pub title: String,
    pub caption: String,
    pub hashtags: String,
    pub first_comment: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDocument {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub aspect: AspectPreset,
    pub script: String,
    pub timeline: Timeline,
    pub copy: Vec<PlatformCopy>,
    pub media: Vec<MediaAsset>,
    pub calendar_item_ids: Vec<String>,
}

impl ProjectDocument {
    pub fn create(title: String) -> Self {
        let stamp = now_iso();
        Self {
            id: new_id(),
            title,
            created_at: stamp.clone(),
            updated_at: stamp,
            aspect: AspectPreset::Vertical,
            script: String::new(),
            timeline: Timeline::default(),
            copy: Network::all()
                .into_iter()
                .map(|network| PlatformCopy {
                    network,
                    title: String::new(),
                    caption: String::new(),
                    hashtags: String::new(),
                    first_comment: String::new(),
                })
                .collect(),
            media: Vec::new(),
            calendar_item_ids: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryEntry {
    pub id: String,
    pub title: String,
    pub folder_path: String,
    pub created_at: String,
    pub updated_at: String,
    pub archived: bool,
    pub last_opened_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryFile {
    pub projects: Vec<LibraryEntry>,
    pub ffmpeg_path: Option<String>,
    pub notifications_enabled: bool,
    pub projects_root: Option<String>,
}

impl Default for LibraryFile {
    fn default() -> Self {
        Self {
            projects: Vec::new(),
            ffmpeg_path: None,
            notifications_enabled: true,
            projects_root: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PostStatus {
    Draft,
    PackReady,
    Posted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarItem {
    pub id: String,
    pub project_id: String,
    pub network: Network,
    pub caption: String,
    pub scheduled_for: String,
    pub status: PostStatus,
    pub aspect: AspectPreset,
    pub rollout_id: Option<String>,
    pub reminded: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CalendarFile {
    pub items: Vec<CalendarItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HubSnapshot {
    pub library: LibraryFile,
    pub calendar: CalendarFile,
    pub ffmpeg_resolved: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectBundle {
    pub folder_path: String,
    pub project: ProjectDocument,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RolloutSlotInput {
    pub network: Network,
    pub aspect: AspectPreset,
    pub caption: String,
    pub scheduled_for: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportProgress {
    pub percent: f64,
    pub message: String,
    pub done: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RolloutResult {
    pub folder: String,
    pub hub: HubSnapshot,
}
