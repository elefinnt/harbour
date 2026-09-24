import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import type { HubSnapshot } from "../../shared/types";
import styles from "../../app/shell.module.css";

interface Props {
  hub: HubSnapshot;
  onSave: (ffmpegPath: string | null, notificationsEnabled: boolean, projectsRoot: string | null) => void;
}

export function SettingsScreen({ hub, onSave }: Props) {
  const [ffmpegPath, setFfmpegPath] = useState(hub.library.ffmpegPath ?? "");
  const [projectsRoot, setProjectsRoot] = useState(hub.library.projectsRoot ?? "");
  const [notificationsEnabled, setNotificationsEnabled] = useState(hub.library.notificationsEnabled);

  useEffect(() => {
    setFfmpegPath(hub.library.ffmpegPath ?? "");
    setProjectsRoot(hub.library.projectsRoot ?? "");
    setNotificationsEnabled(hub.library.notificationsEnabled);
  }, [hub]);

  return (
    <section className={styles.page}>
      <h1>Settings</h1>
      <p className={hub.ffmpegResolved ? "ok" : "error"}>
        {hub.ffmpegResolved
          ? `FFmpeg is ready: ${hub.ffmpegResolved}`
          : "FFmpeg was not found. Thumbnails and export need it. Install FFmpeg, then browse to ffmpeg.exe or leave the field empty if it is on your PATH."}
      </p>
      <label className="stack">
        FFmpeg path
        <div className={styles.row}>
          <input value={ffmpegPath} onChange={(event) => setFfmpegPath(event.target.value)} placeholder="C:\\ffmpeg\\bin\\ffmpeg.exe" />
          <button
            onClick={() => {
              void open({ filters: [{ name: "FFmpeg", extensions: ["exe"] }] }).then((picked) => {
                if (typeof picked === "string") setFfmpegPath(picked);
              });
            }}
          >
            Browse
          </button>
        </div>
      </label>
      <label className="stack">
        Default projects folder
        <div className={styles.row}>
          <input value={projectsRoot} onChange={(event) => setProjectsRoot(event.target.value)} placeholder="Documents\\Harbour" />
          <button
            onClick={() => {
              void open({ directory: true }).then((picked) => {
                if (typeof picked === "string") setProjectsRoot(picked);
              });
            }}
          >
            Browse
          </button>
        </div>
      </label>
      <label className={styles.row}>
        <input type="checkbox" checked={notificationsEnabled} onChange={(event) => setNotificationsEnabled(event.target.checked)} />
        Remind me about posts while Harbour is open
      </label>
      <button onClick={() => onSave(ffmpegPath.trim() || null, notificationsEnabled, projectsRoot.trim() || null)}>Save settings</button>
    </section>
  );
}
