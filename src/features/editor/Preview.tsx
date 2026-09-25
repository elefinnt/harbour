import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import type { AspectPreset, CaptionBlock, Clip, MediaAsset, TextBlock } from "../../shared/types";
import { joinPath } from "../../shared/format";
import styles from "./editor.module.css";

interface Props {
  folderPath: string;
  aspect: AspectPreset;
  clip: Clip | null;
  asset: MediaAsset | null;
  playheadMs: number;
  playing: boolean;
  texts: TextBlock[];
  captions: CaptionBlock[];
  onTick: (ms: number) => void;
  onClipEnded: () => void;
}

export function Preview({ folderPath, aspect, clip, asset, playheadMs, playing, texts, captions, onTick, onClipEnded }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const src = asset && asset.kind !== "image" ? convertFileSrc(joinPath(folderPath, asset.relativePath)) : "";
  const image = asset?.kind === "image" ? convertFileSrc(joinPath(folderPath, asset.relativePath)) : "";

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !clip) return;
    const target = (clip.inMs + Math.max(0, playheadMs - clip.timelineStartMs)) / 1000;
    if (Math.abs(video.currentTime - target) > 0.2) video.currentTime = target;
    if (playing) void video.play().catch(() => undefined);
    else video.pause();
  }, [clip, playheadMs, playing, src]);

  const activeTexts = texts.filter((text) => playheadMs >= text.startMs && playheadMs <= text.endMs);
  const activeCaption = captions.find((caption) => playheadMs >= caption.startMs && playheadMs <= caption.endMs);

  return (
    <div className={styles.stage}>
      <div className={`${styles.frame} ${styles[aspect]}`}>
        {!asset && <div className={styles.previewEmpty}><span>YOUR STORY STARTS HERE</span><p>Add a video or image from Media to your timeline.</p></div>}
        {src && (
          <video
            ref={videoRef}
            src={src}
            onEnded={onClipEnded}
            onTimeUpdate={(event) => {
              if (!clip || !playing) return;
              const local = event.currentTarget.currentTime * 1000;
              if (local >= clip.outMs - 40) onClipEnded();
              else onTick(clip.timelineStartMs + (local - clip.inMs));
            }}
          />
        )}
        {image && <img src={image} alt="" />}
        {activeTexts.map((text) => (
          <div key={text.id} className={styles.overlay} style={{ left: `${text.x}%`, top: `${text.y}%`, fontSize: text.size, color: text.colour }}>
            {text.content}
          </div>
        ))}
        {activeCaption && <div className={styles.caption}>{activeCaption.text}</div>}
      </div>
    </div>
  );
}
