import { invoke } from "@tauri-apps/api/core";
import type {
  AspectPreset,
  CalendarItem,
  HubSnapshot,
  ProjectBundle,
  ProjectDocument,
  RolloutSlot,
} from "./types";

export function loadHub() {
  return invoke<HubSnapshot>("hub_load");
}

export function createProject(title: string) {
  return invoke<ProjectBundle>("project_create", { title });
}

export function openProject(id: string) {
  return invoke<ProjectBundle>("project_open", { id });
}

export function saveProject(project: ProjectDocument) {
  return invoke<ProjectBundle>("project_save", { project });
}

export function renameProject(id: string, title: string) {
  return invoke<ProjectBundle>("project_rename", { id, title });
}

export function duplicateProject(id: string) {
  return invoke<ProjectBundle>("project_duplicate", { id });
}

export function setArchived(id: string, archived: boolean) {
  return invoke<HubSnapshot>("project_set_archived", { id, archived });
}

export function importMedia(projectId: string, paths: string[]) {
  return invoke<ProjectBundle>("media_import", { projectId, paths });
}

export function saveSettings(
  ffmpegPath: string | null,
  notificationsEnabled: boolean,
  projectsRoot: string | null,
) {
  return invoke<HubSnapshot>("settings_save", {
    ffmpegPath,
    notificationsEnabled,
    projectsRoot,
  });
}

export function saveCalendar(items: CalendarItem[]) {
  return invoke<HubSnapshot>("calendar_save", { items });
}

export function readTextFile(path: string) {
  return invoke<string>("read_text_file", { path });
}

export function writeTextFile(path: string, contents: string) {
  return invoke<void>("write_text_file", { path, contents });
}

export function notify(title: string, body: string) {
  return invoke<void>("notify", { title, body });
}

export function exportRender(
  projectId: string,
  aspect: AspectPreset,
  burnCaptions: boolean,
  outputPath: string,
) {
  return invoke<string>("export_render", {
    projectId,
    aspect,
    burnCaptions,
    outputPath,
  });
}

export function prepareRollout(
  name: string,
  projectId: string,
  slots: RolloutSlot[],
  burnCaptions: boolean,
  outputParent: string,
) {
  return invoke<{ folder: string; hub: HubSnapshot }>("rollout_prepare", {
    name,
    projectId,
    slots,
    burnCaptions,
    outputParent,
  });
}
