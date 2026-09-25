use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use tauri::{AppHandle, Emitter};

use crate::model::{AspectPreset, Clip, ExportProgress, MediaAsset, MediaKind, ProjectDocument};

pub fn resolve_ffmpeg(configured: Option<&str>) -> Option<PathBuf> {
    if let Some(path) = configured {
        let candidate = PathBuf::from(path);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    if let Ok(path) = which_on_path("ffmpeg") {
        return Some(path);
    }
    let extras = [
        r"C:\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
    ];
    extras.into_iter().map(PathBuf::from).find(|path| path.is_file())
}

fn which_on_path(name: &str) -> Result<PathBuf, String> {
    let output = Command::new("where")
        .arg(name)
        .output()
        .map_err(|err| err.to_string())?;
    if !output.status.success() {
        return Err("not found".to_string());
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let first = text.lines().next().unwrap_or("").trim();
    if first.is_empty() {
        Err("not found".to_string())
    } else {
        Ok(PathBuf::from(first))
    }
}

fn ffprobe_near(ffmpeg: &Path) -> Option<PathBuf> {
    let probe = ffmpeg.with_file_name("ffprobe.exe");
    if probe.is_file() {
        Some(probe)
    } else {
        which_on_path("ffprobe").ok()
    }
}

pub struct ProbeInfo {
    pub duration_ms: Option<u64>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub has_audio: bool,
}

pub fn probe_file(ffmpeg: &Path, file: &Path) -> ProbeInfo {
    if let Some(ffprobe) = ffprobe_near(ffmpeg) {
        if let Some(info) = probe_with_ffprobe(&ffprobe, file) {
            return info;
        }
    }
    probe_with_ffmpeg(ffmpeg, file)
}

fn probe_with_ffprobe(ffprobe: &Path, file: &Path) -> Option<ProbeInfo> {
    let output = Command::new(ffprobe)
        .args([
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
        ])
        .arg(file)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value: serde_json::Value = serde_json::from_slice(&output.stdout).ok()?;
    let streams = value.get("streams")?.as_array()?;
    let mut width = None;
    let mut height = None;
    let mut has_audio = false;
    let mut duration_ms = None;
    for stream in streams {
        let kind = stream.get("codec_type").and_then(|item| item.as_str());
        if kind == Some("video") {
            width = stream.get("width").and_then(|item| item.as_u64()).map(|n| n as u32);
            height = stream.get("height").and_then(|item| item.as_u64()).map(|n| n as u32);
            if duration_ms.is_none() {
                duration_ms = stream
                    .get("duration")
                    .and_then(|item| item.as_str())
                    .and_then(parse_seconds);
            }
        }
        if kind == Some("audio") {
            has_audio = true;
        }
    }
    if duration_ms.is_none() {
        duration_ms = value
            .get("format")
            .and_then(|format| format.get("duration"))
            .and_then(|item| item.as_str())
            .and_then(parse_seconds);
    }
    Some(ProbeInfo {
        duration_ms,
        width,
        height,
        has_audio,
    })
}

fn probe_with_ffmpeg(ffmpeg: &Path, file: &Path) -> ProbeInfo {
    let output = Command::new(ffmpeg).arg("-i").arg(file).output();
    let text = output
        .map(|result| String::from_utf8_lossy(&result.stderr).to_string())
        .unwrap_or_default();
    let mut info = ProbeInfo {
        duration_ms: None,
        width: None,
        height: None,
        has_audio: text.contains("Audio:"),
    };
    for line in text.lines() {
        if let Some(rest) = line.trim().strip_prefix("Duration:") {
            let stamp = rest.split(',').next().unwrap_or("").trim();
            info.duration_ms = parse_clock(stamp);
        }
        if line.contains("Video:") {
            if let Some((w, h)) = find_dimensions(line) {
                info.width = Some(w);
                info.height = Some(h);
            }
        }
    }
    info
}

fn parse_seconds(value: &str) -> Option<u64> {
    let seconds: f64 = value.parse().ok()?;
    Some((seconds * 1000.0).round() as u64)
}

fn parse_clock(value: &str) -> Option<u64> {
    let parts: Vec<&str> = value.split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    let hours: f64 = parts[0].parse().ok()?;
    let minutes: f64 = parts[1].parse().ok()?;
    let seconds: f64 = parts[2].parse().ok()?;
    Some(((hours * 3600.0 + minutes * 60.0 + seconds) * 1000.0).round() as u64)
}

fn find_dimensions(line: &str) -> Option<(u32, u32)> {
    for token in line.split(|ch: char| ch.is_whitespace() || ch == ',') {
        let mut bits = token.split('x');
        let width = bits.next()?.parse().ok()?;
        let height = bits.next()?.trim_end_matches(|ch: char| !ch.is_ascii_digit()).parse().ok()?;
        if width > 0 && height > 0 && width < 20000 && height < 20000 {
            return Some((width, height));
        }
    }
    None
}

pub fn write_thumbnail(ffmpeg: &Path, source: &Path, dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let status = Command::new(ffmpeg)
        .args(["-y", "-ss", "0.2", "-i"])
        .arg(source)
        .args(["-frames:v", "1"])
        .arg(dest)
        .status()
        .map_err(|err| err.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("Thumbnail failed.".to_string())
    }
}

pub fn kind_for(path: &Path) -> Option<MediaKind> {
    let ext = path.extension()?.to_string_lossy().to_ascii_lowercase();
    match ext.as_str() {
        "mp4" | "mov" | "mkv" | "webm" | "m4v" | "avi" => Some(MediaKind::Video),
        "mp3" | "wav" | "m4a" | "aac" | "flac" => Some(MediaKind::Audio),
        "png" | "jpg" | "jpeg" | "webp" | "gif" => Some(MediaKind::Image),
        _ => None,
    }
}

pub fn import_asset(ffmpeg: Option<&Path>, project_folder: &Path, source: &Path) -> Result<MediaAsset, String> {
    let kind = kind_for(source).ok_or_else(|| "That file type is not supported.".to_string())?;
    let id = crate::model::new_id();
    let ext = source
        .extension()
        .map(|ext| ext.to_string_lossy().to_string())
        .unwrap_or_else(|| "bin".to_string());
    let file_name = format!("{id}.{ext}");
    let relative = format!("media/{file_name}");
    let dest = project_folder.join("media").join(&file_name);
    fs::create_dir_all(project_folder.join("media")).map_err(|err| err.to_string())?;
    fs::copy(source, &dest).map_err(|err| err.to_string())?;
    let mut asset = MediaAsset {
        id,
        name: source
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| file_name.clone()),
        kind: kind.clone(),
        relative_path: relative.replace('\\', "/"),
        duration_ms: None,
        width: None,
        height: None,
        has_audio: matches!(kind, MediaKind::Video | MediaKind::Audio),
        thumbnail_path: None,
    };
    if let Some(ffmpeg) = ffmpeg {
        if !matches!(kind, MediaKind::Audio) {
            let info = probe_file(ffmpeg, &dest);
            asset.duration_ms = info.duration_ms;
            asset.width = info.width;
            asset.height = info.height;
            asset.has_audio = info.has_audio;
            let thumb_rel = format!("media/thumbs/{}.jpg", asset.id);
            let thumb = project_folder.join("media").join("thumbs").join(format!("{}.jpg", asset.id));
            if write_thumbnail(ffmpeg, &dest, &thumb).is_ok() {
                asset.thumbnail_path = Some(thumb_rel);
            }
        } else {
            let info = probe_file(ffmpeg, &dest);
            asset.duration_ms = info.duration_ms;
            asset.has_audio = true;
        }
    }
    Ok(asset)
}

struct InputPlan {
    video_index: usize,
    audio_index: usize,
}

pub fn render_project(
    app: &AppHandle,
    ffmpeg: &Path,
    folder: &Path,
    project: &ProjectDocument,
    aspect: &AspectPreset,
    burn_captions: bool,
    output: &Path,
) -> Result<(), String> {
    if project.timeline.clips.is_empty() {
        return Err("Add a clip before exporting.".to_string());
    }
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let (width, height) = aspect.size();
    let mut cmd_args: Vec<String> = vec!["-y".into(), "-progress".into(), "pipe:1".into(), "-nostats".into()];
    let mut next_index = 0usize;
    let mut duration_ms = 0u64;
    let mut ordered: Vec<&Clip> = project.timeline.clips.iter().collect();
    ordered.sort_by_key(|clip| clip.timeline_start_ms);
    let mut cursor = 0u64;
    let mut pieces: Vec<(u64, u64, InputPlan)> = Vec::new();
    for clip in ordered {
        let clip_ms = clip.out_ms.saturating_sub(clip.in_ms).max(100);
        if clip.timeline_start_ms > cursor.saturating_add(40) {
            let gap = clip.timeline_start_ms - cursor;
            let plan = push_gap(&mut cmd_args, &mut next_index, gap, width, height);
            pieces.push((0, gap, plan));
            duration_ms += gap;
            cursor = clip.timeline_start_ms;
        }
        let asset = project
            .media
            .iter()
            .find(|item| item.id == clip.asset_id)
            .ok_or_else(|| "A timeline clip points at missing media.".to_string())?;
        let source = folder.join(asset.relative_path.replace('/', "\\"));
        if !source.exists() {
            return Err(format!("Missing media file {}.", asset.name));
        }
        let plan = push_clip_inputs(&mut cmd_args, &mut next_index, &source, asset, clip);
        pieces.push((clip.in_ms, clip.out_ms.max(clip.in_ms + 100), plan));
        duration_ms += clip_ms;
        cursor = cursor.max(clip.timeline_start_ms + clip_ms);
    }
    let mut filter = String::new();
    for (index, (in_ms, out_ms, plan)) in pieces.iter().enumerate() {
        let start = ms_seconds(*in_ms);
        let end = ms_seconds(*out_ms);
        filter.push_str(&format!(
            "[{v}:v]trim=start={start}:end={end},setpts=PTS-STARTPTS,scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p[v{index}];",
            v = plan.video_index
        ));
        filter.push_str(&format!(
            "[{a}:a]atrim=start={start}:end={end},asetpts=PTS-STARTPTS,aresample=48000[a{index}];",
            a = plan.audio_index
        ));
    }
    for index in 0..pieces.len() {
        filter.push_str(&format!("[v{index}][a{index}]"));
    }
    filter.push_str(&format!("concat=n={}:v=1:a=1[vcat][aout];", pieces.len()));
    let mut video_label = "vcat".to_string();
    if burn_captions && !project.timeline.captions.is_empty() {
        let ass = output.with_extension("ass");
        fs::write(&ass, crate::draw::captions_to_ass(&project.timeline.captions, width, height)).map_err(|err| err.to_string())?;
        let escaped = escape_filter_path(&ass);
        filter.push_str(&format!("[{video_label}]subtitles='{escaped}'[vsub];"));
        video_label = "vsub".to_string();
    }
    if !project.timeline.texts.is_empty() {
        filter.push_str(&format!("[{video_label}]"));
        filter.push_str(&crate::draw::text_filters(&project.timeline.texts));
        filter.push_str("[vout]");
        video_label = "vout".to_string();
    }
    cmd_args.push("-filter_complex".into());
    cmd_args.push(filter.trim_end_matches(';').to_string());
    cmd_args.push("-map".into());
    cmd_args.push(format!("[{video_label}]"));
    cmd_args.push("-map".into());
    cmd_args.push("[aout]".into());
    cmd_args.extend([
        "-c:v".into(),
        "libx264".into(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-preset".into(),
        "veryfast".into(),
        "-crf".into(),
        "20".into(),
        "-c:a".into(),
        "aac".into(),
        "-b:a".into(),
        "192k".into(),
        "-movflags".into(),
        "+faststart".into(),
    ]);
    cmd_args.push(output.display().to_string());
    emit(app, 1.0, "Rendering", false);
    run_ffmpeg(app, ffmpeg, &cmd_args, duration_ms)?;
    emit(app, 100.0, "Export finished", true);
    Ok(())
}

fn push_gap(args: &mut Vec<String>, next_index: &mut usize, gap_ms: u64, width: u32, height: u32) -> InputPlan {
    let duration = ms_seconds(gap_ms.max(40));
    args.extend([
        "-f".into(),
        "lavfi".into(),
        "-t".into(),
        duration.clone(),
        "-i".into(),
        format!("color=c=black:s={width}x{height}:r=30"),
    ]);
    let video_index = *next_index;
    *next_index += 1;
    args.extend([
        "-f".into(),
        "lavfi".into(),
        "-t".into(),
        duration,
        "-i".into(),
        "anullsrc=channel_layout=stereo:sample_rate=48000".into(),
    ]);
    let audio_index = *next_index;
    *next_index += 1;
    InputPlan { video_index, audio_index }
}

fn push_clip_inputs(
    args: &mut Vec<String>,
    next_index: &mut usize,
    source: &Path,
    asset: &MediaAsset,
    clip: &Clip,
) -> InputPlan {
    let duration = ms_seconds(clip.out_ms.saturating_sub(clip.in_ms).max(100));
    if matches!(asset.kind, MediaKind::Image) {
        args.extend(["-loop".into(), "1".into(), "-t".into(), duration.clone(), "-i".into(), source.display().to_string()]);
    } else {
        args.extend(["-i".into(), source.display().to_string()]);
    }
    let video_index = *next_index;
    *next_index += 1;
    let audio_index = if asset.has_audio && !matches!(asset.kind, MediaKind::Image) {
        video_index
    } else {
        args.extend([
            "-f".into(),
            "lavfi".into(),
            "-t".into(),
            duration,
            "-i".into(),
            "anullsrc=channel_layout=stereo:sample_rate=48000".into(),
        ]);
        let index = *next_index;
        *next_index += 1;
        index
    };
    InputPlan {
        video_index,
        audio_index,
    }
}

pub fn escape_filter_path(path: &Path) -> String {
    path.display()
        .to_string()
        .replace('\\', "/")
        .replace(':', "\\:")
        .replace('\'', "\\'")
}

pub fn ms_seconds(ms: u64) -> String {
    format!("{:.3}", ms as f64 / 1000.0)
}

fn emit(app: &AppHandle, percent: f64, message: &str, done: bool) {
    let _ = app.emit(
        "export-progress",
        ExportProgress {
            percent,
            message: message.to_string(),
            done,
        },
    );
}

fn run_ffmpeg(app: &AppHandle, ffmpeg: &Path, args: &[String], duration_ms: u64) -> Result<(), String> {
    let mut child = Command::new(ffmpeg)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| format!("Could not start FFmpeg: {err}"))?;
    let stdout = child.stdout.take();
    let mut last = 0.0;
    if let Some(stdout) = stdout {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Some(value) = line.strip_prefix("out_time_ms=") {
                if let Ok(raw) = value.trim().parse::<u64>() {
                    let ms = raw / 1000;
                    if duration_ms > 0 {
                        let percent = ((ms as f64 / duration_ms as f64) * 100.0).clamp(0.0, 99.0);
                        if percent - last >= 1.0 {
                            last = percent;
                            emit(app, percent, "Rendering", false);
                        }
                    }
                }
            }
        }
    }
    let output = child.wait_with_output().map_err(|err| err.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        let err = String::from_utf8_lossy(&output.stderr);
        let tail: String = err.chars().rev().take(500).collect::<String>().chars().rev().collect();
        Err(format!("FFmpeg failed. {tail}"))
    }
}
