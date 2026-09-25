export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    library: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    project: 'M3 7h7l2 2h9v11H3z M3 7V4h7l2 3',
    editor: 'M4 3v18 M20 3v18 M4 7h16 M4 17h16 M9 7v10 M15 7v10',
    copy: 'M5 3h14v18H5z M8 7h8 M8 11h8 M8 15h5',
    calendar: 'M3 5h18v16H3z M7 2v6 M17 2v6 M3 10h18 M7 14h2 M13 14h4',
    rollouts: 'm3 11 18-8-8 18-2-8-8-2z M11 13 21 3',
    settings: 'M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    plus: 'M12 5v14 M5 12h14',
    arrow: 'M4 12h16 M14 6l6 6-6 6',
    search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6',
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.editor} /></svg>;
}
