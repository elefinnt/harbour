import { useMemo, useRef, useState } from "react";
import type { HubSnapshot, Screen } from "../../shared/types";
import { Icon } from "../../shared/Icon";
import styles from "../../app/shell.module.css";

interface Props { hub: HubSnapshot; onCreate: (title: string) => void; onOpen: (id: string) => void; onNavigate: (screen: Screen) => void; }
export function LibraryScreen({ hub, onCreate, onOpen, onNavigate }: Props) {
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const titleInput = useRef<HTMLInputElement>(null);
  const projects = useMemo(() => hub.library.projects.filter(p => p.archived === showArchived && p.title.toLowerCase().includes(query.trim().toLowerCase())).sort((a,b) => (b.lastOpenedAt ?? b.updatedAt).localeCompare(a.lastOpenedAt ?? a.updatedAt)), [hub, query, showArchived]);
  const active = hub.library.projects.filter(p => !p.archived).length;
  const pending = hub.calendar.items.filter(p => p.status !== 'posted').length;
  return <section className={styles.page}>
    <div className="row"><div className="grow"><p className="eyebrow">YOUR CREATIVE HOME</p><h1>Make something worth sharing.</h1><p className="muted">From the first cut to the final post. All in one place.</p></div><button className="primary row" onClick={() => titleInput.current?.focus()}><Icon name="plus" size={17}/> New project</button></div>
    <div className={styles.hero}><div><span className="eyebrow">CREATE. EDIT. SHARE.</span><h2>Big ideas. A little less busywork.</h2><p>Turn your footage into your next great story, then get every channel ready from one workspace.</p><button className="row" style={{marginTop:20}} onClick={() => titleInput.current?.focus()}>Start creating <Icon name="arrow" size={16}/></button></div><div className={styles.heroArt} aria-hidden="true"><span className="eyebrow">YOUR NEXT GREAT CUT</span><div/><div/><div/></div></div>
    <div className={styles.stats}><div className={styles.stat}><span>Active projects</span><strong>{active.toString().padStart(2,'0')}</strong><span>Ideas in the making</span></div><div className={styles.stat}><span>Planned posts</span><strong>{pending.toString().padStart(2,'0')}</strong><span>Across your content calendar</span></div><div className={styles.stat}><span>Posts marked complete</span><strong>{hub.calendar.items.filter(p => p.status === 'posted').length.toString().padStart(2,'0')}</strong><span>Your stories out in the world</span></div></div>
    <div className="row"><h2 className="grow">Your projects</h2><label className="row muted"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)}/>Archived</label><div className="row" style={{width:230}}><Icon name="search" size={17}/><input aria-label="Search projects" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search projects…"/></div></div>
    <form className="row" onSubmit={e => { e.preventDefault(); if(title.trim()) { onCreate(title.trim()); setTitle(''); } }}><input ref={titleInput} aria-label="New project title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Give your next idea a name…" required maxLength={120}/><button type="submit" className="primary">Create project</button></form>
    {projects.length === 0 ? <div className={styles.empty}><h2>{query ? 'No matching projects' : showArchived ? 'No archived projects' : 'Your next story starts here'}</h2><p>{query ? 'Try a different search.' : 'Create a project, import your footage, and make your first cut.'}</p></div> : <div className={styles.projectGrid}>{projects.map(p => <button key={p.id} className={styles.projectCard} onClick={() => onOpen(p.id)}><div className={styles.projectArt}><Icon name="editor" size={42}/></div><div className={styles.projectInfo}><strong>{p.title}</strong><span className="muted">Edited {new Date(p.updatedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span></div></button>)}</div>}
    <div className={`${styles.panel} row`}><Icon name="rollouts"/><div className="grow"><h3>One story. Every channel.</h3><p className="muted">Prepare captions, choose your formats, and plan your release.</p></div><button onClick={() => onNavigate('rollouts')}>Open publish studio →</button></div>
  </section>;
}
