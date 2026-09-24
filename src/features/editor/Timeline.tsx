import type { MouseEvent, ReactNode } from "react";
import type { CaptionBlock, Clip, TextBlock } from "../../shared/types";
import { clipDuration, snapTime, edgePoints } from "./timelineMath";
import styles from "./editor.module.css";

interface Props {
  clips: Clip[];
  texts: TextBlock[];
  captions: CaptionBlock[];
  playheadMs: number;
  zoom: number;
  selectedId: string | null;
  onSeek: (ms: number) => void;
  onSelect: (id: string) => void;
  names: Record<string, string>;
}

export function Timeline({ clips, texts, captions, playheadMs, zoom, selectedId, onSeek, onSelect, names }: Props) {
  const duration = Math.max(clips.reduce((sum, clip) => sum + clipDuration(clip), 0), 1000);
  const width = Math.max(640, (duration / 1000) * zoom);

  function seek(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ms = ((event.clientX - rect.left) / width) * duration;
    onSeek(snapTime(ms, edgePoints(clips), 120));
  }

  return (
    <div className={styles.lanes} style={{ width }} onClick={seek}>
      <div className={styles.playhead} style={{ left: `${(playheadMs / duration) * 100}%` }} />
      <Lane>
        {clips.map((clip) => (
          <button
            key={clip.id}
            className={`${styles.block} ${styles.video} ${selectedId === clip.id ? styles.active : ""}`}
            style={box(clip.timelineStartMs, clipDuration(clip), duration)}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(clip.id);
            }}
          >
            {names[clip.assetId] ?? "Clip"}
          </button>
        ))}
      </Lane>
      <Lane>
        {texts.map((text) => (
          <button
            key={text.id}
            className={`${styles.block} ${styles.text} ${selectedId === text.id ? styles.active : ""}`}
            style={box(text.startMs, Math.max(100, text.endMs - text.startMs), duration)}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(text.id);
            }}
          >
            {text.content || "Text"}
          </button>
        ))}
      </Lane>
      <Lane>
        {captions.map((caption) => (
          <button
            key={caption.id}
            className={`${styles.block} ${styles.captionTrack} ${selectedId === caption.id ? styles.active : ""}`}
            style={box(caption.startMs, Math.max(100, caption.endMs - caption.startMs), duration)}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(caption.id);
            }}
          >
            {caption.text || "Caption"}
          </button>
        ))}
      </Lane>
    </div>
  );
}

function Lane({ children }: { children: ReactNode }) {
  return <div className={styles.lane}>{children}</div>;
}

function box(start: number, length: number, duration: number) {
  return { left: `${(start / duration) * 100}%`, width: `${(length / duration) * 100}%` };
}
