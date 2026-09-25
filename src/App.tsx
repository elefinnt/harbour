import { useEffect, useRef, useState } from "react";
import { Icon } from "./shared/Icon";
import { listen } from "@tauri-apps/api/event";
import type { AspectPreset, ExportProgress, HubSnapshot, ProjectBundle, ProjectDocument, RolloutSlot, Screen } from "./shared/types";
import * as api from "./shared/api";
import { LibraryScreen } from "./features/library/LibraryScreen";
import { ProjectScreen } from "./features/project/ProjectScreen";
import { EditorScreen } from "./features/editor/EditorScreen";
import { CopyScreen } from "./features/copy/CopyScreen";
import { CalendarScreen } from "./features/calendar/CalendarScreen";
import { RolloutScreen } from "./features/rollouts/RolloutScreen";
import { SettingsScreen } from "./features/settings/SettingsScreen";
import styles from "./app/shell.module.css";
import "./app/tokens.css";

const NAV: { id: Screen; label: string; needsProject?: boolean }[] = [
  { id: "library", label: "Overview" },
  { id: "project", label: "Media library", needsProject: true },
  { id: "editor", label: "Video editor", needsProject: true },
  { id: "copy", label: "Writing studio", needsProject: true },
  { id: "calendar", label: "Content calendar" },
  { id: "rollouts", label: "Publish studio" },
  { id: "settings", label: "Settings" },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>("library");
  const [hub, setHub] = useState<HubSnapshot | null>(null);
  const [bundle, setBundle] = useState<ProjectBundle | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    void refresh();
    const unlisten = listen<ExportProgress>("export-progress", (event) => {
      setMessage(`${event.payload.message} ${Math.round(event.payload.percent)}%`);
      if (event.payload.done) setBusy(false);
    });
    return () => {
      void unlisten.then((stop) => stop()).catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (!hub?.library.notificationsEnabled) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      const due = hub.calendar.items.filter((item) => {
        const at = new Date(item.scheduledFor).getTime();
        return !item.reminded && item.status !== "posted" && at <= now && now - at < 60_000;
      });
      if (due.length === 0) return;
      for (const item of due) {
        void api.notify("Time to post", item.caption.slice(0, 140) || "A scheduled post is due.");
      }
      const ids = new Set(due.map((item) => item.id));
      void api.saveCalendar(hub.calendar.items.map((item) => (ids.has(item.id) ? { ...item, reminded: true } : item))).then(setHub).catch(showError);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [hub]);

  async function refresh() {
    try {
      setHub(await api.loadHub());
    } catch (err) {
      showError(err);
    }
  }

  function showError(err: unknown) {
    setBusy(false);
    setError(err instanceof Error ? err.message : String(err));
  }

  async function openProject(id: string) {
    try {
      await saveQueue.current;
      const next = await api.openProject(id);
      setBundle(next);
      setHub(await api.loadHub());
      setScreen("project");
      setError("");
    } catch (err) {
      showError(err);
    }
  }

  async function persist(project: ProjectDocument) {
    const pending = saveQueue.current.catch(() => undefined).then(() => api.saveProject(project));
    saveQueue.current = pending;
    const saved = await pending;
    setHub(await api.loadHub());
    return saved;
  }

  if (!hub) return <div className={styles.loading}><h1>Harbour<span className="accent">.</span></h1><p className="muted">{error || "Opening your creative workspace…"}</p>{error && <button onClick={() => void refresh()}>Try again</button>}</div>;

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}><span className={styles.brandMark}>H</span> harbour<span className="accent">.</span></div>
        <div className={styles.workspace}><span className={styles.avatar}>Y</span><div>Your workspace<small>Personal studio</small></div></div>
        <p className={styles.navLabel}>WORKSPACE</p>
        <nav className={styles.nav}>
          {NAV.map((item) => (
            <button key={item.id} disabled={item.needsProject && !bundle} title={item.needsProject && !bundle ? "Open a project to get started" : item.label} data-active={screen === item.id} onClick={() => setScreen(item.id)}><Icon name={item.id} />{item.label}</button>
          ))}
        </nav>
        <div className={styles.sidebarBottom}><span className={styles.statusDot} /> Local workspace<p>Your ideas. Your files. Your studio.</p></div>
      </aside>
      <div className={styles.content}>
      <header className={styles.header}><div className="row"><span className="muted">Workspace</span><span className="muted">/</span><strong>{NAV.find(item => item.id === screen)?.label}</strong></div><div className="row">{bundle && <span className={styles.projectPill}>{bundle.project.title}</span>}<span className={styles.avatar}>Y</span></div></header>
      {error && <div className={styles.errorBanner} role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError("")}>×</button></div>}
      <main className={styles.main}>
        {screen === "library" && (
          <LibraryScreen
            hub={hub}
            onNavigate={setScreen}
            onCreate={(title) => {
              void api.createProject(title).then((next) => {
                setBundle(next);
                return api.loadHub();
              }).then((next) => {
                setHub(next);
                setScreen("project");
              }).catch(showError);
            }}
            onOpen={(id) => void openProject(id)}
          />
        )}
        {screen === "project" && bundle && (
          <ProjectScreen key={bundle.project.id}
            bundle={bundle}
            onRename={(title) => void api.renameProject(bundle.project.id, title).then(setBundle).then(refresh).catch(showError)}
            onImport={(paths) => void api.importMedia(bundle.project.id, paths).then(setBundle).catch(showError)}
            onDuplicate={() => void api.duplicateProject(bundle.project.id).then(setBundle).then(refresh).catch(showError)}
            onArchive={() => void api.setArchived(bundle.project.id, true).then((next) => {
              setHub(next);
              setBundle(null);
              setScreen("library");
            }).catch(showError)}
          />
        )}
        {screen === "editor" && bundle && (
          <EditorScreen key={bundle.project.id} bundle={bundle} onPublish={() => setScreen("rollouts")} onMedia={() => setScreen("project")} onChange={(next) => {
            setBundle(next);
            void persist(next.project).catch(showError);
          }} />
        )}
        {screen === "copy" && bundle && (
          <CopyScreen project={bundle.project} onChange={(project) => {
            setBundle({ ...bundle, project });
            void persist(project).catch(showError);
          }} />
        )}
        {screen === "calendar" && <CalendarScreen hub={hub} onSave={(items) => void api.saveCalendar(items).then(setHub).catch(showError)} />}
        {screen === "rollouts" && (
          <RolloutScreen
            hub={hub}
            project={bundle?.project ?? null}
            busy={busy}
            message={message}
            onPrepare={(name, projectId, slots, burnCaptions, outputParent) => void runRollout(name, projectId, slots, burnCaptions, outputParent)}
            onExport={(aspect, burnCaptions, outputPath) => void runExport(aspect, burnCaptions, outputPath)}
            onSchedule={async (items) => { setHub(await api.saveCalendar(items)); }}
          />
        )}
        {screen === "settings" && (
          <SettingsScreen hub={hub} onSave={(ffmpegPath, notificationsEnabled, projectsRoot) => {
            void api.saveSettings(ffmpegPath, notificationsEnabled, projectsRoot).then(setHub).catch(showError);
          }} />
        )}
      </main>
      </div>
    </div>
  );

  async function runExport(aspect: AspectPreset, burnCaptions: boolean, outputPath: string) {
    if (!bundle) return;
    setBusy(true);
    setError("");
    try {
      await persist(bundle.project);
      const path = await api.exportRender(bundle.project.id, aspect, burnCaptions, outputPath);
      setMessage(`Exported ${path}`);
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  async function runRollout(name: string, projectId: string, slots: RolloutSlot[], burnCaptions: boolean, outputParent: string) {
    setBusy(true);
    setError("");
    try {
      if (bundle && bundle.project.id === projectId) await persist(bundle.project);
      const result = await api.prepareRollout(name, projectId, slots, burnCaptions, outputParent);
      setHub(result.hub);
      setMessage(`Pack ready in ${result.folder}`);
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }
}
