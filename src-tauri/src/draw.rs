use std::path::Path;

use crate::ffmpeg::{escape_filter_path, ms_seconds};
use crate::model::{CaptionBlock, TextBlock};

pub fn text_filters(texts: &[TextBlock]) -> String {
    let font = escape_filter_path(Path::new(r"C:\Windows\Fonts\arial.ttf"));
    let mut chain = String::new();
    for (index, text) in texts.iter().enumerate() {
        if index > 0 {
            chain.push(',');
        }
        let start = ms_seconds(text.start_ms);
        let end = ms_seconds(text.end_ms.max(text.start_ms + 100));
        let x = (text.x.clamp(0.0, 100.0) / 100.0).to_string();
        let y = (text.y.clamp(0.0, 100.0) / 100.0).to_string();
        chain.push_str(&format!(
            "drawtext=fontfile='{font}':text='{}':fontsize={}:fontcolor={}:x=w*{x}-text_w/2:y=h*{y}-text_h/2:enable='between(t,{start},{end})'",
            escape_drawtext(&text.content),
            text.size.max(12),
            css_to_ffmpeg_colour(&text.colour),
        ));
    }
    chain
}

pub fn captions_to_ass(captions: &[CaptionBlock], width: u32, height: u32) -> String {
    let mut body = format!(
        "[Script Info]\nScriptType: v4.00+\nPlayResX: {width}\nPlayResY: {height}\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,54,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0,2,40,40,80,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    );
    for caption in captions {
        let text = caption.text.replace('\n', "\\N").replace(',', "，");
        body.push_str(&format!(
            "Dialogue: 0,{},{},Default,,0,0,0,,{}\n",
            ass_time(caption.start_ms),
            ass_time(caption.end_ms.max(caption.start_ms + 100)),
            text
        ));
    }
    body
}

fn ass_time(ms: u64) -> String {
    let total = ms / 10;
    let cs = total % 100;
    let total_s = total / 100;
    let s = total_s % 60;
    let total_m = total_s / 60;
    let m = total_m % 60;
    let h = total_m / 60;
    format!("{h}:{m:02}:{s:02}.{cs:02}")
}

fn css_to_ffmpeg_colour(colour: &str) -> String {
    let hex = colour.trim().trim_start_matches('#');
    if hex.len() == 6 {
        format!("0x{hex}")
    } else {
        "white".to_string()
    }
}

fn escape_drawtext(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace(':', "\\:")
        .replace('\'', "\\'")
        .replace('%', "\\%")
        .replace('\n', " ")
}
