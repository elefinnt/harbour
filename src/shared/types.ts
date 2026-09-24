export type AspectPreset = "vertical" | "square" | "widescreen";

export type Network =
  | "youtube"
  | "tiktok"
  | "instagram"
  | "facebook"
  | "linkedin"
  | "x";

export type MediaKind = "video" | "audio" | "image";

export type PostStatus = "draft" | "pack_ready" | "posted";

export type Screen =
  | "library"
  | "project"
  | "editor"
  | "copy"
  | "calendar"
  | "rollouts"
  | "settings";

export interface MediaAsset {
  id: string;
  name: string;
  kind: MediaKind;
  relativePath: string;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
  thumbnailPath: string | null;
}

export interface Clip {
  id: string;
  assetId: string;
  timelineStartMs: number;
  inMs: number;
  outMs: number;
}

export interface TextBlock {
  id: string;
  startMs: number;
  endMs: number;
  content: string;
  size: number;
  colour: string;
  x: number;
  y: number;
}

export interface CaptionBlock {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
}

export interface Timeline {
  clips: Clip[];
  texts: TextBlock[];
  captions: CaptionBlock[];
}

export interface PlatformCopy {
  network: Network;
  title: string;
  caption: string;
  hashtags: string;
  firstComment: string;
}

export interface ProjectDocument {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  aspect: AspectPreset;
  script: string;
  timeline: Timeline;
  copy: PlatformCopy[];
  media: MediaAsset[];
  calendarItemIds: string[];
}

export interface LibraryEntry {
  id: string;
  title: string;
  folderPath: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  lastOpenedAt: string | null;
}

export interface LibraryFile {
  projects: LibraryEntry[];
  ffmpegPath: string | null;
  notificationsEnabled: boolean;
  projectsRoot: string | null;
}

export interface CalendarItem {
  id: string;
  projectId: string;
  network: Network;
  caption: string;
  scheduledFor: string;
  status: PostStatus;
  aspect: AspectPreset;
  rolloutId: string | null;
  reminded: boolean;
}

export interface HubSnapshot {
  library: LibraryFile;
  calendar: { items: CalendarItem[] };
  ffmpegResolved: string | null;
}

export interface ProjectBundle {
  folderPath: string;
  project: ProjectDocument;
}

export interface RolloutSlot {
  network: Network;
  aspect: AspectPreset;
  caption: string;
  scheduledFor: string;
}

export interface ExportProgress {
  percent: number;
  message: string;
  done: boolean;
}
