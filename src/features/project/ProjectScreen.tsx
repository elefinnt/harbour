import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import type { ProjectBundle } from "../../shared/types";
import { formatMs, joinPath } from "../../shared/format";
import styles from "../../app/shell.module.css";

interface Props {
  bundle: ProjectBundle;
  onRename: (title: string) => void;
  onImport: (paths: string[]) => void;
  onDuplicate: () => void;
  onArchive: () => void;
}

export function ProjectScreen({ bundle, onRename, onImport, onDuplicate, onArchive }: Props) {
  const [title, setTitle] = useState(bundle.project.title);
  const project = bundle.project;

  async function chooseFiles() {
    const picked = await open({
      multiple: true,
      filters: [{ name: "Media", extensions: ["mp4", "mov", "mkv", "webm", "m4v", "avi", "mp3", "wav", "m4a", "aac", "flac", "png", "jpg", "jpeg", "webp", "gif"] }],
    });
    if (!picked) return;
    onImport(Array.isArray(picked) ? picked : [picked]);
  }

  return (
    <section className={styles.page}>
      <div className={styles.row}>
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
        <button onClick={() => onRename(title)}>Rename</button>
        <button onClick={onDuplicate}>Duplicate</button>
        <button onClick={onArchive}>Archive</button>
      </div>
      <p className="muted">{bundle.folderPath}</p>
      <div className={styles.row}>
        <button onClick={() => void chooseFiles()}>Import media</button>
      </div>
      <div className={styles.list}>
        {project.media.length === 0 && <p className="muted">Import video, audio, or images. Video and images can go on the timeline.</p>}
        {project.media.map((asset) => {
          const thumb = asset.thumbnailPath ? convertFileSrc(joinPath(bundle.folderPath, asset.thumbnailPath)) : "";
          return (
            <article key={asset.id} className={`${styles.card} ${styles.media}`}>
              {thumb ? <img className={styles.thumb} src={thumb} alt="" /> : <div className={styles.thumb} />}
              <div>
                <strong>{asset.name}</strong>
                <p className="muted">
                  {asset.kind}
                  {asset.durationMs ? ` · ${formatMs(asset.durationMs)}` : ""}
                  {asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ""}
                </p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
