import { open, save } from "@tauri-apps/plugin-dialog";
import { useState, type Dispatch, type SetStateAction } from "react";
import type { AspectPreset, HubSnapshot, Network, ProjectDocument, RolloutSlot } from "../../shared/types";
import { ASPECTS, NETWORKS } from "../../shared/networks";
import { fromLocalInput, toLocalInput } from "../../shared/format";
import styles from "../../app/shell.module.css";

interface Props {
  hub: HubSnapshot;
  project: ProjectDocument | null;
  busy: boolean;
  message: string;
  onPrepare: (name: string, projectId: string, slots: RolloutSlot[], burnCaptions: boolean, outputParent: string) => void;
  onExport: (aspect: AspectPreset, burnCaptions: boolean, outputPath: string) => void;
}

export function RolloutScreen({ hub, project, busy, message, onPrepare, onExport }: Props) {
  const [projectId, setProjectId] = useState(project?.id ?? "");
  const [name, setName] = useState(project ? `${project.title} rollout` : "Rollout");
  const [burnCaptions, setBurnCaptions] = useState(true);
  const [aspect, setAspect] = useState<AspectPreset>(project?.aspect ?? "vertical");
  const [slots, setSlots] = useState<RolloutSlot[]>(() => (project ? [prefill(project, "tiktok"), prefill(project, "youtube")] : []));

  function addSlot() {
    const selected = hub.library.projects.find((item) => item.id === projectId);
    const source = project && project.id === projectId ? project : null;
    setSlots((current) => [
      ...current,
      source
        ? prefill(source, "instagram")
        : { network: "instagram", aspect: "vertical", caption: selected?.title ?? "", scheduledFor: new Date().toISOString() },
    ]);
  }

  return (
    <section className={styles.page}>
      <h1>Rollouts and export</h1>
      <p className="muted">A rollout renders each aspect once, then writes a folder per network with the video, caption, and a schedule file.</p>
      {message && <p>{message}</p>}
      <div className={styles.row}>
        <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          <option value="">Project</option>
          {hub.library.projects.filter((item) => !item.archived).map((item) => (
            <option key={item.id} value={item.id}>{item.title}</option>
          ))}
        </select>
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      {slots.map((slot, index) => (
        <div className={styles.row} key={`${slot.network}-${index}`}>
          <select value={slot.network} onChange={(event) => updateSlot(setSlots, index, { network: event.target.value as Network })}>
            {NETWORKS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <select value={slot.aspect} onChange={(event) => updateSlot(setSlots, index, { aspect: event.target.value as AspectPreset })}>
            {ASPECTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <input type="datetime-local" value={toLocalInput(slot.scheduledFor)} onChange={(event) => updateSlot(setSlots, index, { scheduledFor: fromLocalInput(event.target.value) })} />
          <button onClick={() => setSlots((current) => current.filter((_, item) => item !== index))}>Remove</button>
          <textarea value={slot.caption} onChange={(event) => updateSlot(setSlots, index, { caption: event.target.value })} />
        </div>
      ))}
      <div className={styles.row}>
        <button onClick={addSlot}>Add slot</button>
        <label className={styles.row}>
          <input type="checkbox" checked={burnCaptions} onChange={(event) => setBurnCaptions(event.target.checked)} />
          Burn captions
        </label>
        <button
          disabled={busy || !projectId || slots.length === 0}
          onClick={() => {
            void open({ directory: true }).then((picked) => {
              if (typeof picked === "string") onPrepare(name, projectId, slots, burnCaptions, picked);
            });
          }}
        >
          Prepare pack
        </button>
      </div>
      <h2>Single export</h2>
      <div className={styles.row}>
        <select value={aspect} onChange={(event) => setAspect(event.target.value as AspectPreset)}>
          {ASPECTS.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.size}</option>)}
        </select>
        <button
          disabled={busy || !project}
          onClick={() => {
            void save({ defaultPath: `${project?.title ?? "export"}.mp4`, filters: [{ name: "Video", extensions: ["mp4"] }] }).then((picked) => {
              if (typeof picked === "string" && project) onExport(aspect, burnCaptions, picked);
            });
          }}
        >
          Export current project
        </button>
      </div>
    </section>
  );
}

function prefill(project: ProjectDocument, network: Network): RolloutSlot {
  const copy = project.copy.find((item) => item.network === network);
  const caption = [copy?.title, copy?.caption, copy?.hashtags].filter(Boolean).join("\n\n");
  return {
    network,
    aspect: network === "youtube" ? "widescreen" : "vertical",
    caption,
    scheduledFor: new Date().toISOString(),
  };
}

function updateSlot(setSlots: Dispatch<SetStateAction<RolloutSlot[]>>, index: number, patch: Partial<RolloutSlot>) {
  setSlots((current) => current.map((slot, item) => (item === index ? { ...slot, ...patch } : slot)));
}
