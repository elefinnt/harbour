import { open, save } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import type { ProjectBundle } from "../../shared/types";
import { newId } from "../../shared/format";
import { readTextFile, writeTextFile } from "../../shared/api";
import { clipAt, formatSrt, moveClip, parseSrt, reflow, splitClip, timelineDuration } from "./timelineMath";
import { useHistory } from "./useHistory";
import { Preview } from "./Preview";
import { Timeline } from "./Timeline";
import { Inspector } from "./Inspector";
import styles from "./editor.module.css";

interface Props {
  bundle: ProjectBundle;
  onChange: (bundle: ProjectBundle) => void;
}

export function EditorScreen({ bundle, onChange }: Props) {
  const project = bundle.project;
  const history = useHistory(project.timeline, (timeline) => onChange({ ...bundle, project: { ...project, timeline: reflowTimeline(timeline) } }));
  const [playheadMs, setPlayheadMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(80);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const duration = timelineDuration(project.timeline.clips);
  const clip = clipAt(project.timeline.clips, playheadMs) ?? project.timeline.clips[0] ?? null;
  const asset = project.media.find((item) => item.id === clip?.assetId) ?? null;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (event.code === "Space") {
        event.preventDefault();
        setPlaying((value) => !value);
      }
      if (event.key.toLowerCase() === "s") splitAtPlayhead();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) history.redo();
        else history.undo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function splitAtPlayhead() {
    if (!clip) return;
    history.commit(splitClip(project.timeline.clips, clip.id, playheadMs).length === project.timeline.clips.length
      ? project.timeline
      : { ...project.timeline, clips: splitClip(project.timeline.clips, clip.id, playheadMs) });
  }

  function addClip(assetId: string) {
    const media = project.media.find((item) => item.id === assetId);
    if (!media || media.kind === "audio") return;
    const outMs = media.kind === "image" ? 5000 : Math.max(500, media.durationMs ?? 5000);
    history.commit({
      ...project.timeline,
      clips: reflow([...project.timeline.clips, { id: newId(), assetId, timelineStartMs: 0, inMs: 0, outMs }]),
    });
  }

  return (
    <section className={styles.editor}>
      <div className={styles.toolbar}>
        <button onClick={() => setPlaying((value) => !value)}>{playing ? "Pause" : "Play"}</button>
        <button onClick={history.undo} disabled={!history.canUndo}>Undo</button>
        <button onClick={history.redo} disabled={!history.canRedo}>Redo</button>
        <button onClick={() => setZoom((value) => Math.max(30, value - 20))}>Zoom out</button>
        <button onClick={() => setZoom((value) => Math.min(240, value + 20))}>Zoom in</button>
        <button onClick={() => history.commit({ ...project.timeline, texts: [...project.timeline.texts, { id: newId(), startMs: playheadMs, endMs: playheadMs + 2000, content: "Title", size: 42, colour: "#ffffff", x: 50, y: 20 }] })}>Add text</button>
        <button onClick={() => history.commit({ ...project.timeline, captions: [...project.timeline.captions, { id: newId(), startMs: playheadMs, endMs: playheadMs + 2000, text: "Caption" }] })}>Add caption</button>
        <span className="muted">{Math.round(playheadMs)} ms / {Math.round(duration)} ms</span>
      </div>
      <div className={styles.body}>
        <Preview
          folderPath={bundle.folderPath}
          aspect={project.aspect}
          clip={clip}
          asset={asset}
          playheadMs={playheadMs}
          playing={playing}
          texts={project.timeline.texts}
          captions={project.timeline.captions}
          onTick={setPlayheadMs}
          onClipEnded={() => {
            const index = project.timeline.clips.findIndex((item) => item.id === clip?.id);
            const next = project.timeline.clips[index + 1];
            if (next) setPlayheadMs(next.timelineStartMs);
            else setPlaying(false);
          }}
        />
        <Inspector
          project={project}
          selectedId={selectedId}
          onTimeline={(timeline) => history.commit(timeline)}
          onAddClip={addClip}
          onSplit={splitAtPlayhead}
          onDelete={() => {
            history.commit({
              ...project.timeline,
              clips: project.timeline.clips.filter((item) => item.id !== selectedId),
              texts: project.timeline.texts.filter((item) => item.id !== selectedId),
              captions: project.timeline.captions.filter((item) => item.id !== selectedId),
            });
            setSelectedId(null);
          }}
          onMove={(direction) => {
            if (!selectedId) return;
            history.commit({ ...project.timeline, clips: moveClip(project.timeline.clips, selectedId, direction) });
          }}
          onImportSrt={() => {
            void open({ filters: [{ name: "Subtitles", extensions: ["srt"] }] }).then(async (picked) => {
              if (typeof picked !== "string") return;
              const text = await readTextFile(picked);
              history.commit({ ...project.timeline, captions: parseSrt(text) });
            });
          }}
          onExportSrt={() => {
            void save({ defaultPath: `${project.title}.srt`, filters: [{ name: "Subtitles", extensions: ["srt"] }] }).then(async (picked) => {
              if (typeof picked !== "string") return;
              await writeTextFile(picked, formatSrt(project.timeline.captions));
            });
          }}
        />
      </div>
      <div className={styles.timelineWrap}>
        <Timeline
          clips={project.timeline.clips}
          texts={project.timeline.texts}
          captions={project.timeline.captions}
          playheadMs={playheadMs}
          zoom={zoom}
          selectedId={selectedId}
          onSeek={(ms) => {
            setPlaying(false);
            setPlayheadMs(Math.min(ms, duration));
          }}
          onSelect={setSelectedId}
          names={Object.fromEntries(project.media.map((item) => [item.id, item.name]))}
        />
      </div>
    </section>
  );
}

function reflowTimeline(timeline: ProjectBundle["project"]["timeline"]) {
  return { ...timeline, clips: reflow(timeline.clips) };
}
