import type { PlatformCopy, ProjectDocument } from "../../shared/types";
import { NETWORKS } from "../../shared/networks";
import styles from "../../app/shell.module.css";

interface Props {
  project: ProjectDocument;
  onChange: (project: ProjectDocument) => void;
}

export function CopyScreen({ project, onChange }: Props) {
  function updateCopy(network: PlatformCopy["network"], patch: Partial<PlatformCopy>) {
    onChange({
      ...project,
      copy: project.copy.map((item) => (item.network === network ? { ...item, ...patch } : item)),
    });
  }

  return (
    <section className={styles.page}>
      <h1>Copy desk</h1>
      <label className="stack">
        Master script
        <textarea value={project.script} onChange={(event) => onChange({ ...project, script: event.target.value })} />
      </label>
      {NETWORKS.map((network) => {
        const copy = project.copy.find((item) => item.network === network.id);
        if (!copy) return null;
        const captionCount = `${copy.caption} ${copy.hashtags}`.trim().length;
        return (
          <article key={network.id} className={styles.panel}>
            <h2>{network.label}</h2>
            <label className="stack">
              Title <span className="muted">{copy.title.length}/{network.titleLimit}</span>
              <input value={copy.title} onChange={(event) => updateCopy(network.id, { title: event.target.value })} />
            </label>
            <label className="stack">
              Caption <span className="muted">{captionCount}/{network.captionLimit}</span>
              <textarea value={copy.caption} onChange={(event) => updateCopy(network.id, { caption: event.target.value })} />
            </label>
            <label className="stack">
              Hashtags
              <input value={copy.hashtags} onChange={(event) => updateCopy(network.id, { hashtags: event.target.value })} />
            </label>
            <label className="stack">
              First comment
              <textarea value={copy.firstComment} onChange={(event) => updateCopy(network.id, { firstComment: event.target.value })} />
            </label>
          </article>
        );
      })}
    </section>
  );
}
