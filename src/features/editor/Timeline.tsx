import { useEffect, useRef, useState } from "react";
import type { Dispatch, MouseEvent, PointerEvent, ReactNode, SetStateAction } from "react";
import type { CaptionBlock, Clip, TextBlock } from "../../shared/types";
import { clipDuration, edgePoints, moveClipTo, shiftRange, snapTime, timelineSpan, trimClipEdge } from "./timelineMath";
import styles from "./editor.module.css";

interface Props {
  clips: Clip[];
  texts: TextBlock[];
  captions: CaptionBlock[];
  playheadMs: number;
  zoom: number;
  selectedId: string | null;
  mediaEnds: Record<string, number | null>;
  onSeek: (ms: number) => void;
  onSelect: (id: string) => void;
  onZoom: Dispatch<SetStateAction<number>>;
  onLive: (clips: Clip[], texts: TextBlock[], captions: CaptionBlock[]) => void;
  onCommit: (clips: Clip[], texts: TextBlock[], captions: CaptionBlock[]) => void;
  names: Record<string, string>;
}

type Drag = {
  track: "clip" | "text" | "caption";
  id: string;
  edge: "move" | "start" | "end";
  pointerStart: number;
  originStart: number;
  originEnd: number;
  changed: boolean;
};

export function Timeline(props: Props) {
  const { clips, texts, captions, playheadMs, zoom, selectedId, mediaEnds, onSeek, onSelect, onZoom, onLive, onCommit, names } = props;
  const span = timelineSpan(clips, texts, captions);
  const [pad, setPad] = useState(3000);
  const duration = span + pad;
  const width = Math.max(640, (duration / 1000) * zoom);
  const wrapRef = useRef<HTMLDivElement>(null);
  const lanesRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const pending = useRef<{ clips: Clip[]; texts: TextBlock[]; captions: CaptionBlock[] } | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      onZoom((value) => Math.min(400, Math.max(20, value + (event.deltaY > 0 ? -12 : 12))));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [onZoom]);

  function msAt(clientX: number) {
    const rect = lanesRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, ((clientX - rect.left) / width) * duration);
  }

  function seek(event: MouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget && !(event.target as HTMLElement).classList.contains(styles.lane)) return;
    const points = edgePoints(latest.current.clips);
    onSeek(event.altKey ? msAt(event.clientX) : snapTime(msAt(event.clientX), points, snapThreshold(zoom)));
  }

  function begin(event: PointerEvent, next: Drag) {
    event.stopPropagation();
    event.preventDefault();
    onSelect(next.id);
    drag.current = next;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent) {
    const current = drag.current;
    if (!current) return;
    const time = event.altKey ? msAt(event.clientX) : snapTime(msAt(event.clientX), snapTargets(current, latest.current), snapThreshold(zoom));
    if (time > span - 400) setPad((value) => value + 2000);
    const delta = time - current.pointerStart;
    if (current.track === "clip") {
      const source = latest.current.clips;
      const clip = source.find((item) => item.id === current.id);
      if (!clip) return;
      const resolved = current.edge === "move"
        ? moveClipTo(source, current.id, current.originStart + delta)
        : trimClipEdge(source, current.id, current.edge, time, mediaEnds[clip.assetId] ?? null);
      if (resolved !== source) current.changed = true;
      pending.current = { clips: resolved, texts: latest.current.texts, captions: latest.current.captions };
      onLive(resolved, latest.current.texts, latest.current.captions);
      return;
    }
    if (current.track === "text") {
      const updated = updateRange(latest.current.texts, current, time, delta);
      if (updated !== latest.current.texts) current.changed = true;
      pending.current = { clips: latest.current.clips, texts: updated, captions: latest.current.captions };
      onLive(latest.current.clips, updated, latest.current.captions);
      return;
    }
    const updated = updateRange(latest.current.captions, current, time, delta);
    if (updated !== latest.current.captions) current.changed = true;
    pending.current = { clips: latest.current.clips, texts: latest.current.texts, captions: updated };
    onLive(latest.current.clips, latest.current.texts, updated);
  }

  function finish() {
    const current = drag.current;
    const next = pending.current;
    drag.current = null;
    pending.current = null;
    if (!current?.changed || !next) return;
    onCommit(next.clips, next.texts, next.captions);
  }

  return (
    <div className={styles.timelineWrap} ref={wrapRef}>
      <div
        ref={lanesRef}
        className={styles.lanes}
        style={{ width }}
        onClick={seek}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
      >
        <div className={styles.playhead} style={{ left: `${(playheadMs / duration) * 100}%` }} />
        <Lane>
          {clips.map((clip) => (
            <EventBlock
              key={clip.id}
              label={names[clip.assetId] ?? "Clip"}
              start={clip.timelineStartMs}
              length={clipDuration(clip)}
              duration={duration}
              className={`${styles.video} ${selectedId === clip.id ? styles.active : ""}`}
              onPointerDown={(event, edge) => begin(event, { track: "clip", id: clip.id, edge, pointerStart: msAt(event.clientX), originStart: clip.timelineStartMs, originEnd: clip.timelineStartMs + clipDuration(clip), changed: false })}
            />
          ))}
        </Lane>
        <Lane>
          {texts.map((text) => (
            <EventBlock
              key={text.id}
              label={text.content || "Text"}
              start={text.startMs}
              length={Math.max(100, text.endMs - text.startMs)}
              duration={duration}
              className={`${styles.text} ${selectedId === text.id ? styles.active : ""}`}
              onPointerDown={(event, edge) => begin(event, { track: "text", id: text.id, edge, pointerStart: msAt(event.clientX), originStart: text.startMs, originEnd: text.endMs, changed: false })}
            />
          ))}
        </Lane>
        <Lane>
          {captions.map((caption) => (
            <EventBlock
              key={caption.id}
              label={caption.text || "Caption"}
              start={caption.startMs}
              length={Math.max(100, caption.endMs - caption.startMs)}
              duration={duration}
              className={`${styles.captionTrack} ${selectedId === caption.id ? styles.active : ""}`}
              onPointerDown={(event, edge) => begin(event, { track: "caption", id: caption.id, edge, pointerStart: msAt(event.clientX), originStart: caption.startMs, originEnd: caption.endMs, changed: false })}
            />
          ))}
        </Lane>
      </div>
    </div>
  );
}

function updateRange<T extends { id: string; startMs: number; endMs: number }>(list: T[], drag: Drag, time: number, delta: number) {
  return list.map((item) => {
    if (item.id !== drag.id) return item;
    if (drag.edge === "move") {
      const shifted = shiftRange(drag.originStart, drag.originEnd, drag.originStart + delta);
      return { ...item, startMs: shifted.startMs, endMs: shifted.endMs };
    }
    if (drag.edge === "start") {
      const start = Math.min(time, item.endMs - 100);
      return { ...item, startMs: Math.max(0, Math.round(start)) };
    }
    return { ...item, endMs: Math.max(item.startMs + 100, Math.round(time)) };
  });
}

function snapTargets(drag: Drag, props: Props) {
  const points = edgePoints(props.clips.filter((clip) => clip.id !== drag.id));
  points.push(props.playheadMs);
  for (const text of props.texts) {
    if (text.id !== drag.id) points.push(text.startMs, text.endMs);
  }
  for (const caption of props.captions) {
    if (caption.id !== drag.id) points.push(caption.startMs, caption.endMs);
  }
  return points;
}

function snapThreshold(zoom: number) {
  return Math.max(40, (10 * 1000) / zoom);
}

function Lane({ children }: { children: ReactNode }) {
  return <div className={styles.lane}>{children}</div>;
}

function EventBlock({ label, start, length, duration, className, onPointerDown }: {
  label: string;
  start: number;
  length: number;
  duration: number;
  className: string;
  onPointerDown: (event: PointerEvent, edge: "move" | "start" | "end") => void;
}) {
  return (
    <div
      className={`${styles.block} ${className}`}
      style={{ left: `${(start / duration) * 100}%`, width: `${(length / duration) * 100}%` }}
      onPointerDown={(event) => onPointerDown(event, "move")}
      onClick={(event) => event.stopPropagation()}
    >
      <span className={`${styles.handle} ${styles.handleLeft}`} onPointerDown={(event) => onPointerDown(event, "start")} />
      <span className={styles.eventLabel}>{label}</span>
      <span className={`${styles.handle} ${styles.handleRight}`} onPointerDown={(event) => onPointerDown(event, "end")} />
    </div>
  );
}
