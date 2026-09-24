import { useMemo, useState } from "react";
import type { HubSnapshot } from "../../shared/types";
import styles from "../../app/shell.module.css";

interface Props {
  hub: HubSnapshot;
  onCreate: (title: string) => void;
  onOpen: (id: string) => void;
}

export function LibraryScreen({ hub, onCreate, onOpen }: Props) {
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const projects = useMemo(() => {
    return hub.library.projects
      .filter((project) => (showArchived ? project.archived : !project.archived))
      .filter((project) => project.title.toLowerCase().includes(query.trim().toLowerCase()))
      .sort((a, b) => (b.lastOpenedAt ?? b.updatedAt).localeCompare(a.lastOpenedAt ?? a.updatedAt));
  }, [hub.library.projects, query, showArchived]);

  return (
    <section className={styles.page}>
      <div className={styles.row}>
        <h1 className={styles.grow}>Library</h1>
        <label className="muted">
          <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Archived
        </label>
      </div>
      <form
        className={styles.row}
        onSubmit={(event) => {
          event.preventDefault();
          if (!title.trim()) return;
          onCreate(title.trim());
          setTitle("");
        }}
      >
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="New project title" />
        <button type="submit">Create project</button>
      </form>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" />
      <div className={styles.list}>
        {projects.length === 0 && <p className="muted">No projects yet. Create one to start a cut.</p>}
        {projects.map((project) => (
          <button key={project.id} className={styles.card} onClick={() => onOpen(project.id)}>
            <span>
              <strong>{project.title}</strong>
              <span className="muted"> {project.archived ? "Archived" : "Open"}</span>
            </span>
            <span className="muted">{new Date(project.updatedAt).toLocaleString()}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
