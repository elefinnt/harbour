import { open, save } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef, useState } from "react";
import type { CaptionBlock, Clip, ProjectBundle, TextBlock, Timeline as TimelineDoc } from "../../shared/types";
import { formatClock, newId } from "../../shared/format";
import { readTextFile, writeTextFile } from "../../shared/api";
import { clipAt, clipDuration, formatSrt, moveClipTo, parseSrt, splitClip, timelineEnd, timelineSpan, trimClipEdge } from "./timelineMath";
import { useHistory } from "./useHistory";
import { Preview } from "./Preview";
import { Timeline } from "./Timeline";
import { Inspector } from "./Inspector";
import styles from "./editor.module.css";

interface Props {
  bundle: ProjectBundle;
  onChange: (bundle: ProjectBundle) => void;
  onPublish: () => void;
  onMedia: () => void;
}

export function EditorScreen({ bundle, onChange, onPublish, onMedia }: Props) {
  const project = bundle.project;
  const history = useHistory(project.timeline, (timeline) => onChange({ ...bundle, project: { ...project, timeline } }));
  const [playheadMs, setPlayheadMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(80);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [live, setLive] = useState<TimelineDoc | null>(null);
  const timeline = live ?? project.timeline;
  const span = timelineSpan(timeline.clips, timeline.texts, timeline.captions);
  const clip = clipAt(timeline.clips, playheadMs);
  const asset = project.media.find((item) => item.id === clip?.assetId) ?? null;
  const actions = useRef({ splitAtPlayhead, removeSelected, nudge, trimToPlayhead, seekBy });
  actions.current = { splitAtPlayhead, removeSelected, nudge, trimToPlayhead, seekBy };

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;
      const key = event.key.toLowerCase();
      if (event.code === "Space") {
        event.preventDefault();
        setPlaying((value) => !value);
      } else if (key === "s" || (event.ctrlKey && key === "b")) {
        event.preventDefault();
        actions.current.splitAtPlayhead();
      } else if (key === "delete" || key === "backspace") {
        event.preventDefault();
        actions.current.removeSelected();
      } else if ((event.ctrlKey || event.metaKey) && key === "z") {
        event.preventDefault();
        if (event.shiftKey) history.redo();
        else history.undo();
      } else if ((event.ctrlKey || event.metaKey) && key === "y") {
        event.preventDefault();
        history.redo();
      } else if (key === "arrowleft" || key === "arrowright") {
        event.preventDefault();
        const step = (event.shiftKey ? 1000 : 100) * (key === "arrowleft" ? -1 : 1);
        if (event.altKey) actions.current.nudge(step);
        else actions.current.seekBy(step);
      } else if (key === "home") {
        setPlaying(false);
        setPlayheadMs(0);
      } else if (key === "end") {
        setPlaying(false);
        setPlayheadMs(span);
      } else if (key === "[" || key === "i") {
        actions.current.trimToPlayhead("start");
      } else if (key === "]" || key === "o") {
        actions.current.trimToPlayhead("end");
      } else if (key === "+" || key === "=") {
        setZoom((value) => Math.min(400, value + 12));
      } else if (key === "-" || key === "_") {
        setZoom((value) => Math.max(20, value - 12));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const drivingVideo = playing && asset?.kind === "video" && clip !== null;
  useEffect(() => {
    if (!playing || drivingVideo) return;
    let last = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      setPlayheadMs((value) => {
        const next = value + dt;
        if (next >= span) {
          setPlaying(false);
          return span;
        }
        return next;
      });
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing, drivingVideo, clip?.id, span]);

  function commitTimeline(next: TimelineDoc) {
    setLive(null);
    history.commit(next);
  }

  function splitAtPlayhead() {
    const source = timeline.clips;
    const target = clip ?? source.find((item) => item.id === selectedId);
    if (!target) return;
    const next = splitClip(source, target.id, playheadMs);
    if (next === source) return;
    const right = next.find((item) => item.timelineStartMs === playheadMs && item.id !== target.id);
    if (right) setSelectedId(right.id);
    commitTimeline({ ...timeline, clips: next });
  }

  function removeSelected() {
    if (!selectedId) return;
    commitTimeline({
      ...timeline,
      clips: timeline.clips.filter((item) => item.id !== selectedId),
      texts: timeline.texts.filter((item) => item.id !== selectedId),
      captions: timeline.captions.filter((item) => item.id !== selectedId),
    });
    setSelectedId(null);
  }

  function seekBy(delta: number) {
    setPlaying(false);
    setPlayheadMs((value) => Math.min(span, Math.max(0, value + delta)));
  }

  function nudge(delta: number) {
    const selected = timeline.clips.find((item) => item.id === selectedId);
    if (!selected) return;
    commitTimeline({ ...timeline, clips: moveClipTo(timeline.clips, selected.id, selected.timelineStartMs + delta) });
  }

  function trimToPlayhead(edge: "start" | "end") {
    const selected = timeline.clips.find((item) => item.id === selectedId) ?? clip;
    if (!selected) return;
    const limit = project.media.find((item) => item.id === selected.assetId)?.durationMs ?? null;
    commitTimeline({ ...timeline, clips: trimClipEdge(timeline.clips, selected.id, edge, playheadMs, limit) });
  }

  function addClip(assetId: string) {
    const media = project.media.find((item) => item.id === assetId);
    if (!media || media.kind === "audio") return;
    const outMs = media.kind === "image" ? 5000 : Math.max(500, media.durationMs ?? 5000);
    commitTimeline({
      ...timeline,
      clips: [...timeline.clips, { id: newId(), assetId, timelineStartMs: timelineEnd(timeline.clips), inMs: 0, outMs }],
    });
  }

  const view = { ...project, timeline };

  return (
    <section className={styles.editor}>
      <div className={styles.editorHeader}><div><span className="eyebrow">EDITING STUDIO</span><h2>{project.title}</h2></div><div className="row"><button onClick={onMedia}>Import / manage media</button><select aria-label="Project aspect ratio" style={{width:150}} value={project.aspect} onChange={e => onChange({...bundle, project:{...project, aspect:e.target.value as ProjectBundle['project']['aspect']}})}><option value="vertical">9:16 · Vertical</option><option value="square">1:1 · Square</option><option value="widescreen">16:9 · Landscape</option></select><button className="primary" onClick={onPublish}>Export & publish →</button></div></div>
      <div className={styles.toolbar}>
        <button onClick={() => setPlaying((value) => !value)}>{playing ? "Pause" : "Play"}</button>
        <button onClick={history.undo} disabled={!history.canUndo}>Undo</button>
        <button onClick={history.redo} disabled={!history.canRedo}>Redo</button>
        <button onClick={splitAtPlayhead} disabled={!clip}>Split · S</button>
        <button onClick={removeSelected} disabled={!selectedId}>Delete</button>
        <button onClick={() => setZoom((value) => Math.max(20, value - 20))}>Zoom out</button>
        <button onClick={() => setZoom((value) => Math.min(400, value + 20))}>Zoom in</button>
        <button onClick={() => commitTimeline({ ...timeline, texts: [...timeline.texts, { id: newId(), startMs: playheadMs, endMs: playheadMs + 2000, content: "Title", size: 42, colour: "#ffffff", x: 50, y: 20 }] })}>Add text</button>
        <button onClick={() => commitTimeline({ ...timeline, captions: [...timeline.captions, { id: newId(), startMs: playheadMs, endMs: playheadMs + 2000, text: "Caption" }] })}>Add caption</button>
        <span className={styles.timecode}>{formatClock(playheadMs).replace(',', '.')} / {formatClock(span).replace(',', '.')}</span>
      </div>
      <p className={`${styles.keys} muted`}>Drag edges to trim. Drag a clip to move it. Hold Alt to ignore snapping. Space play, S split, Del delete, arrows seek, Alt+arrows nudge, [ ] trim to the playhead.</p>
      <div className={styles.body}>
        <Preview
          folderPath={bundle.folderPath}
          aspect={project.aspect}
          clip={clip ?? null}
          asset={asset}
          playheadMs={playheadMs}
          playing={playing}
          texts={timeline.texts}
          captions={timeline.captions}
          onTick={setPlayheadMs}
          onClipEnded={() => {
            if (!clip) return;
            const end = clip.timelineStartMs + clipDuration(clip);
            if (end >= span - 30) {
              setPlayheadMs(span);
              setPlaying(false);
            } else setPlayheadMs(end);
          }}
        />
        <Inspector
          project={view}
          selectedId={selectedId}
          onTimeline={commitTimeline}
          onAddClip={addClip}
          onSplit={splitAtPlayhead}
          onDelete={removeSelected}
          onMove={(direction) => nudge(direction * 200)}
          onImportSrt={() => {
            void open({ filters: [{ name: "Subtitles", extensions: ["srt"] }] }).then(async (picked) => {
              if (typeof picked !== "string") return;
              const text = await readTextFile(picked);
              commitTimeline({ ...timeline, captions: parseSrt(text) });
            });
          }}
          onExportSrt={() => {
            void save({ defaultPath: `${project.title}.srt`, filters: [{ name: "Subtitles", extensions: ["srt"] }] }).then(async (picked) => {
              if (typeof picked !== "string") return;
              await writeTextFile(picked, formatSrt(timeline.captions));
            });
          }}
        />
      </div>
      <Timeline
        clips={timeline.clips}
        texts={timeline.texts}
        captions={timeline.captions}
        playheadMs={playheadMs}
        zoom={zoom}
        selectedId={selectedId}
        mediaEnds={Object.fromEntries(project.media.map((item) => [item.id, item.durationMs]))}
        onSeek={(ms) => {
          setPlaying(false);
          setPlayheadMs(Math.min(ms, span + 3000));
        }}
        onSelect={setSelectedId}
        onZoom={setZoom}
        onLive={(clips: Clip[], texts: TextBlock[], captions: CaptionBlock[]) => setLive({ ...timeline, clips, texts, captions })}
        onCommit={(clips, texts, captions) => commitTimeline({ ...timeline, clips, texts, captions })}
        names={Object.fromEntries(project.media.map((item) => [item.id, item.name]))}
      />
    </section>
  );
}
