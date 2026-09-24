import { useMemo, useState, type FormEvent } from "react";
import type { CalendarItem, HubSnapshot, PostStatus } from "../../shared/types";
import { ASPECTS, NETWORKS, aspectLabel, networkLabel } from "../../shared/networks";
import { fromLocalInput, newId, toLocalInput } from "../../shared/format";
import styles from "./calendar.module.css";
import page from "../../app/shell.module.css";

interface Props {
  hub: HubSnapshot;
  onSave: (items: CalendarItem[]) => void;
}

export function CalendarScreen({ hub, onSave }: Props) {
  const [mode, setMode] = useState<"week" | "month">("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [draft, setDraft] = useState(() => blankDraft(hub));

  const days = useMemo(() => (mode === "month" ? monthDays(cursor) : weekDays(cursor)), [mode, cursor]);
  const items = hub.calendar.items;

  function saveItem(event: FormEvent) {
    event.preventDefault();
    if (!draft.projectId) return;
    const next: CalendarItem = {
      id: draft.id || newId(),
      projectId: draft.projectId,
      network: draft.network,
      caption: draft.caption,
      scheduledFor: fromLocalInput(draft.when),
      status: draft.status,
      aspect: draft.aspect,
      rolloutId: draft.rolloutId,
      reminded: false,
    };
    const exists = items.some((item) => item.id === next.id);
    onSave(exists ? items.map((item) => (item.id === next.id ? next : item)) : [...items, next]);
    setDraft(blankDraft(hub));
  }

  return (
    <section className={page.page}>
      <div className={page.row}>
        <h1 className={page.grow}>Calendar</h1>
        <button onClick={() => setCursor(shift(cursor, mode, -1))}>Previous</button>
        <button onClick={() => setMode(mode === "month" ? "week" : "month")}>{mode === "month" ? "Week" : "Month"}</button>
        <button onClick={() => setCursor(shift(cursor, mode, 1))}>Next</button>
      </div>
      <div className={styles.grid}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
          <strong key={label} className="muted">{label}</strong>
        ))}
        {days.map((day) => {
          const dayItems = items.filter((item) => sameDay(new Date(item.scheduledFor), day));
          return (
            <div key={day.toISOString()} className={`${styles.day} ${day.getMonth() === cursor.getMonth() || mode === "week" ? "" : styles.outside}`}>
              <strong>{day.getDate()}</strong>
              {dayItems.map((item) => (
                <button key={item.id} className={styles.item} onClick={() => setDraft(toDraft(item))}>
                  {networkLabel(item.network)} · {labelStatus(item.status)}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <form className={styles.form} onSubmit={saveItem}>
        <select value={draft.projectId} onChange={(event) => setDraft({ ...draft, projectId: event.target.value })}>
          <option value="">Project</option>
          {hub.library.projects.filter((project) => !project.archived).map((project) => (
            <option key={project.id} value={project.id}>{project.title}</option>
          ))}
        </select>
        <select value={draft.network} onChange={(event) => setDraft({ ...draft, network: event.target.value as CalendarItem["network"] })}>
          {NETWORKS.map((network) => <option key={network.id} value={network.id}>{network.label}</option>)}
        </select>
        <select value={draft.aspect} onChange={(event) => setDraft({ ...draft, aspect: event.target.value as CalendarItem["aspect"] })}>
          {ASPECTS.map((aspect) => <option key={aspect.id} value={aspect.id}>{aspect.label}</option>)}
        </select>
        <input type="datetime-local" value={draft.when} onChange={(event) => setDraft({ ...draft, when: event.target.value })} />
        <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as PostStatus })}>
          <option value="draft">Draft</option>
          <option value="pack_ready">Pack ready</option>
          <option value="posted">Posted</option>
        </select>
        <textarea value={draft.caption} onChange={(event) => setDraft({ ...draft, caption: event.target.value })} placeholder="Caption" />
        <div className={page.row}>
          <button type="submit">{draft.id ? "Update slot" : "Add slot"}</button>
          {draft.id && (
            <button
              type="button"
              onClick={() => {
                onSave(items.filter((item) => item.id !== draft.id));
                setDraft(blankDraft(hub));
              }}
            >
              Remove
            </button>
          )}
        </div>
      </form>
      <p className="muted">Posted is a manual tick. Pack ready is set when a rollout pack is prepared. {aspectLabel(draft.aspect)}</p>
    </section>
  );
}

interface Draft {
  id: string;
  projectId: string;
  network: CalendarItem["network"];
  aspect: CalendarItem["aspect"];
  caption: string;
  when: string;
  status: PostStatus;
  rolloutId: string | null;
}

function blankDraft(hub: HubSnapshot): Draft {
  return {
    id: "",
    projectId: hub.library.projects.find((project) => !project.archived)?.id ?? "",
    network: "tiktok",
    aspect: "vertical",
    caption: "",
    when: toLocalInput(new Date().toISOString()),
    status: "draft",
    rolloutId: null,
  };
}

function toDraft(item: CalendarItem): Draft {
  return {
    id: item.id,
    projectId: item.projectId,
    network: item.network,
    aspect: item.aspect,
    caption: item.caption,
    when: toLocalInput(item.scheduledFor),
    status: item.status,
    rolloutId: item.rolloutId,
  };
}

function labelStatus(status: PostStatus) {
  if (status === "pack_ready") return "Pack ready";
  if (status === "posted") return "Posted";
  return "Draft";
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function weekDays(cursor: Date) {
  const start = startOfWeek(cursor);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function monthDays(cursor: Date) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function shift(date: Date, mode: "week" | "month", direction: number) {
  const copy = new Date(date);
  if (mode === "week") copy.setDate(copy.getDate() + direction * 7);
  else copy.setMonth(copy.getMonth() + direction);
  return copy;
}
