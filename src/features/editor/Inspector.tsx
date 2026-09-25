import type { CaptionBlock, Clip, ProjectDocument, TextBlock } from "../../shared/types";
import { formatMs } from "../../shared/format";
import styles from "./editor.module.css";

interface Props {
  project: ProjectDocument;
  selectedId: string | null;
  onTimeline: (timeline: ProjectDocument["timeline"]) => void;
  onAddClip: (assetId: string) => void;
  onSplit: () => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  onImportSrt: () => void;
  onExportSrt: () => void;
}

export function Inspector(props: Props) {
  const { project, selectedId } = props;
  const clip = project.timeline.clips.find((item) => item.id === selectedId);
  const text = project.timeline.texts.find((item) => item.id === selectedId);
  const caption = project.timeline.captions.find((item) => item.id === selectedId);

  return (
    <aside className={styles.inspector}>
      <div className="stack">
        <h2>Media</h2>
        {project.media.filter((asset) => asset.kind !== "audio").map((asset) => (
          <button key={asset.id} onClick={() => props.onAddClip(asset.id)}>{asset.name}</button>
        ))}
        {clip && (
          <ClipFields
            clip={clip}
            max={project.media.find((asset) => asset.id === clip.assetId)?.durationMs ?? null}
            onChange={(next) => props.onTimeline({ ...project.timeline, clips: project.timeline.clips.map((item) => (item.id === next.id ? next : item)) })}
            onSplit={props.onSplit}
            onDelete={props.onDelete}
            onMove={props.onMove}
          />
        )}
        {text && (
          <TextFields
            text={text}
            onChange={(next) => props.onTimeline({ ...project.timeline, texts: project.timeline.texts.map((item) => (item.id === next.id ? next : item)) })}
            onDelete={props.onDelete}
          />
        )}
        {caption && (
          <CaptionFields
            caption={caption}
            onChange={(next) => props.onTimeline({ ...project.timeline, captions: project.timeline.captions.map((item) => (item.id === next.id ? next : item)) })}
            onDelete={props.onDelete}
          />
        )}
        <button onClick={props.onImportSrt}>Import SRT</button>
        <button onClick={props.onExportSrt}>Export SRT</button>
        <p className="muted">Audio files stay in the library. The timeline takes video and images.</p>
      </div>
    </aside>
  );
}

function ClipFields({ clip, max, onChange, onSplit, onDelete, onMove }: {
  clip: Clip;
  max: number | null;
  onChange: (clip: Clip) => void;
  onSplit: () => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <div className="stack">
      <h2>Clip</h2>
      <label>In ({formatMs(clip.inMs)})
        <input type="number" min={0} max={clip.outMs - 100} value={clip.inMs} onChange={(event) => onChange({ ...clip, inMs: clamp(Number(event.target.value), 0, clip.outMs - 100) })} />
      </label>
      <label>Out ({formatMs(clip.outMs)})
        <input type="number" min={clip.inMs + 100} max={max ?? undefined} value={clip.outMs} onChange={(event) => onChange({ ...clip, outMs: clamp(Number(event.target.value), clip.inMs + 100, max ?? Number(event.target.value)) })} />
      </label>
      <div className="row">
        <button onClick={() => onMove(-1)}>Nudge left</button>
        <button onClick={() => onMove(1)}>Nudge right</button>
        <button onClick={onSplit}>Split</button>
        <button onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}

function TextFields({ text, onChange, onDelete }: { text: TextBlock; onChange: (text: TextBlock) => void; onDelete: () => void }) {
  return (
    <div className="stack">
      <h2>Text</h2>
      <textarea value={text.content} onChange={(event) => onChange({ ...text, content: event.target.value })} />
      <label>Start <input type="number" value={text.startMs} onChange={(event) => onChange({ ...text, startMs: Number(event.target.value) })} /></label>
      <label>End <input type="number" value={text.endMs} onChange={(event) => onChange({ ...text, endMs: Number(event.target.value) })} /></label>
      <label>Size <input type="number" value={text.size} onChange={(event) => onChange({ ...text, size: Number(event.target.value) })} /></label>
      <label>Colour <input value={text.colour} onChange={(event) => onChange({ ...text, colour: event.target.value })} /></label>
      <label>X <input type="number" value={text.x} onChange={(event) => onChange({ ...text, x: Number(event.target.value) })} /></label>
      <label>Y <input type="number" value={text.y} onChange={(event) => onChange({ ...text, y: Number(event.target.value) })} /></label>
      <button onClick={onDelete}>Delete</button>
    </div>
  );
}

function CaptionFields({ caption, onChange, onDelete }: { caption: CaptionBlock; onChange: (caption: CaptionBlock) => void; onDelete: () => void }) {
  return (
    <div className="stack">
      <h2>Caption</h2>
      <textarea value={caption.text} onChange={(event) => onChange({ ...caption, text: event.target.value })} />
      <label>Start <input type="number" value={caption.startMs} onChange={(event) => onChange({ ...caption, startMs: Number(event.target.value) })} /></label>
      <label>End <input type="number" value={caption.endMs} onChange={(event) => onChange({ ...caption, endMs: Number(event.target.value) })} /></label>
      <button onClick={onDelete}>Delete</button>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}
