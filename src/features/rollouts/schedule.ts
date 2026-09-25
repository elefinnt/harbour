import type { CalendarItem, RolloutSlot } from "../../shared/types";

export function buildCalendarBatch(projectId: string, slots: RolloutSlot[]): CalendarItem[] {
  if (!projectId || slots.length === 0) throw new Error("Choose a project and at least one channel.");
  return slots.map(slot => {
    if (!Number.isFinite(new Date(slot.scheduledFor).getTime())) throw new Error("Choose a valid release date.");
    return { ...slot, scheduledFor: new Date(slot.scheduledFor).toISOString(), id: crypto.randomUUID(), projectId, status: "draft", rolloutId: null, reminded: false };
  });
}
