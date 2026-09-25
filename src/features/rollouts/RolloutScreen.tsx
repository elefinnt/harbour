import { open, save } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import type { AspectPreset, CalendarItem, HubSnapshot, Network, ProjectDocument, RolloutSlot } from "../../shared/types";
import { ASPECTS, NETWORKS } from "../../shared/networks";
import { toLocalInput } from "../../shared/format";
import { buildCalendarBatch } from "./schedule";
import { openProject } from "../../shared/api";
import { Icon } from "../../shared/Icon";
import styles from "../../app/shell.module.css";
interface Props {
  hub: HubSnapshot; project: ProjectDocument | null; busy: boolean; message: string;
  onPrepare: (name: string, projectId: string, slots: RolloutSlot[], burnCaptions: boolean, outputParent: string) => void;
  onExport: (aspect: AspectPreset, burnCaptions: boolean, outputPath: string) => void;
  onSchedule: (items: CalendarItem[]) => Promise<void>;
}
export function RolloutScreen({ hub, project, busy, message, onPrepare, onExport, onSchedule }: Props) {
  const [projectId, setProjectId] = useState(project?.id ?? '');
  const [source, setSource] = useState<ProjectDocument | null>(project);
  const [selected, setSelected] = useState<Network[]>(['instagram','tiktok']);
  const [active, setActive] = useState<Network>('instagram');
  const [captions, setCaptions] = useState<Partial<Record<Network,string>>>({});
  const [aspects, setAspects] = useState<Partial<Record<Network,AspectPreset>>>({});
  const [when, setWhen] = useState(() => toLocalInput(new Date(Date.now()+3600000).toISOString()));
  const [burnCaptions, setBurnCaptions] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setSource(null); setCaptions({}); setAspects({}); setError(''); setFeedback('');
    if (!projectId) return;
    const pending = projectId === project?.id ? Promise.resolve(project) : openProject(projectId).then(b => b.project);
    void pending.then(p => {
      if(cancelled) return;
      setSource(p);
      setCaptions(Object.fromEntries(p.copy.map(c => [c.network,[c.title,c.caption,c.hashtags].filter(Boolean).join('\n\n')])));
    }).catch(e => { if(!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [projectId, project]);
  const config = NETWORKS.find(n => n.id === active)!;
  const caption = captions[active] ?? '';
  const aspectFor = (n: Network): AspectPreset => aspects[n] ?? (n === 'youtube' ? 'widescreen' : 'vertical');
  const validTime = Number.isFinite(new Date(when).getTime());
  const overLimit = selected.some(n => (captions[n]?.length ?? 0) > NETWORKS.find(v => v.id === n)!.captionLimit);
  const ready = !!source && selected.length > 0 && validTime && !overLimit && !busy && !saving;
  const slots = (): RolloutSlot[] => selected.map(network => ({network,aspect:aspectFor(network),caption:captions[network] ?? '',scheduledFor:new Date(when).toISOString()}));
  async function schedule() {
    if(!ready) return;
    setSaving(true); setError(''); setFeedback('');
    try {
      await onSchedule([...hub.calendar.items,...buildCalendarBatch(projectId, slots())]);
      setFeedback(`${selected.length} draft posts added to your calendar. Publish manually when ready.`);
    } catch(e) { setError(String(e)); } finally { setSaving(false); }
  }
  async function prepare() {
    if(!ready || !source) return;
    try { const picked = await open({directory:true}); if(typeof picked === 'string') onPrepare(`${source.title} rollout`,projectId,slots(),burnCaptions,picked); } catch(e) { setError(String(e)); }
  }
  return <section className={styles.page}>
    <div><p className="eyebrow">ONE STORY. EVERY CHANNEL.</p><h1>Publish studio</h1><p className="muted">Make every post feel at home, wherever you share it.</p></div>
    <div className={styles.composer}><div className="stack">
      <div className={`${styles.panel} stack`}><h2>01 <span className="muted">/</span> Choose your project</h2><select aria-label="Project to publish" value={projectId} onChange={e => setProjectId(e.target.value)}><option value="">Select a project</option>{hub.library.projects.filter(p => !p.archived).map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
      <div className={`${styles.panel} stack`}><h2>02 <span className="muted">/</span> Pick your channels</h2><p className="muted">Choose the destinations for your export pack and calendar.</p><div className={styles.networks}>{NETWORKS.map(n => <button key={n.id} className={styles.network} data-active={selected.includes(n.id)} aria-pressed={selected.includes(n.id)} onClick={() => { setSelected(current => current.includes(n.id) ? current.filter(id => id !== n.id) : [...current,n.id]); setActive(n.id); }}><span>{selected.includes(n.id) ? '✓' : '+'}</span>{n.label}</button>)}</div></div>
      <div className={`${styles.panel} stack`}><div className="row"><h2 className="grow">03 <span className="muted">/</span> Make it yours</h2><select style={{width:145}} aria-label="Channel caption to edit" value={active} onChange={e => setActive(e.target.value as Network)}>{NETWORKS.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}</select></div><label className="stack">{config.label} caption<textarea rows={5} value={caption} placeholder="Tell the story behind your post…" onChange={e => setCaptions({...captions,[active]:e.target.value})}/></label><div className="row"><button disabled={!selected.length} onClick={() => setCaptions(current => ({...current,...Object.fromEntries(selected.map(n => [n,caption]))}))}>Apply to selected channels</button><span className={`grow ${caption.length > config.captionLimit ? 'error' : 'muted'}`} style={{textAlign:'right'}}>{caption.length} / {config.captionLimit}</span></div><label className="stack">Export format<select value={aspectFor(active)} onChange={e => setAspects({...aspects,[active]:e.target.value as AspectPreset})}>{ASPECTS.map(a => <option value={a.id} key={a.id}>{a.label} · {a.size}</option>)}</select></label></div>
      <div className={`${styles.panel} stack`}><h2>04 <span className="muted">/</span> Plan the release</h2><label className="stack">Date and time · {Intl.DateTimeFormat().resolvedOptions().timeZone}<input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)}/></label><label className="row"><input type="checkbox" checked={burnCaptions} onChange={e => setBurnCaptions(e.target.checked)}/>Burn subtitles into exported videos</label><div className="row"><button className="primary" disabled={!ready} onClick={() => void schedule()}>{saving ? 'Saving…' : 'Add to calendar'}</button><button disabled={!ready || !hub.ffmpegResolved || !source?.timeline.clips.length} onClick={() => void prepare()}>{busy ? 'Preparing…' : 'Prepare export pack'}</button></div>{!hub.ffmpegResolved && <p className="muted">Set up FFmpeg in Settings to render export packs.</p>}{overLimit && <p className="error">A selected channel’s caption is too long. Shorten it before continuing.</p>}</div>
    </div><aside className="stack"><div className={`${styles.panel} stack`}><div className="row"><h3 className="grow">Post preview</h3><span className={styles.badge}>{config.label}</span></div><div className={styles.postPreview}><div className="row"><span className={styles.avatar}>Y</span><strong>Your channel</strong></div><div className={styles.previewArt}><div><Icon name="editor" size={32}/><p>{source?.title || 'Choose your project'}</p><small>{ASPECTS.find(a => a.id === aspectFor(active))?.label} export</small></div></div><div style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{caption || 'Your caption will appear here.'}</div></div><p className="muted">Layout preview. Final video is rendered in your export pack.</p></div><div className={`${styles.panel} stack`}><Icon name="rollouts"/><h3>Ready for your release</h3><p className="muted">{selected.length} channels selected. Each pack includes formatted video, captions, and your schedule.</p><p className="muted">Publishing is manual in this version. Calendar entries are reminders; social accounts are not connected.</p></div>{project && <button disabled={busy || !hub.ffmpegResolved || !project.timeline.clips.length} onClick={() => { void save({defaultPath:`${project.title}.mp4`,filters:[{name:'Video',extensions:['mp4']}]}).then(path => { if(path) onExport(project.aspect,burnCaptions,path); }).catch(e => setError(String(e))); }}>Export open project as MP4</button>}</aside></div>
    {(feedback || message) && <p className="ok" role="status">{feedback || message}</p>}{error && <p className="error" role="alert">{error}</p>}
  </section>;
}
