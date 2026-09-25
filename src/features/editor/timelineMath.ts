import type { CaptionBlock, Clip } from "../../shared/types";
import { formatClock, newId } from "../../shared/format";

export function clipDuration(clip: Clip) {
  return Math.max(100, clip.outMs - clip.inMs);
}

export function timelineEnd(clips: Clip[]) {
  return clips.reduce((max, clip) => Math.max(max, clip.timelineStartMs + clipDuration(clip)), 0);
}

export function timelineSpan(clips: Clip[], texts: { endMs: number }[], captions: { endMs: number }[]) {
  const clipEnd = timelineEnd(clips);
  const textEnd = texts.reduce((max, item) => Math.max(max, item.endMs), 0);
  const captionEnd = captions.reduce((max, item) => Math.max(max, item.endMs), 0);
  return Math.max(1000, clipEnd, textEnd, captionEnd);
}

export function clipAt(clips: Clip[], playhead: number) {
  return clips.find((clip) => playhead >= clip.timelineStartMs && playhead < clip.timelineStartMs + clipDuration(clip)) ?? null;
}

export function snapTime(ms: number, points: number[], threshold: number) {
  let best = ms;
  let bestDist = threshold;
  for (const point of points) {
    const dist = Math.abs(point - ms);
    if (dist <= bestDist) {
      best = point;
      bestDist = dist;
    }
  }
  return Math.max(0, best);
}

export function edgePoints(clips: Clip[]) {
  const points = [0];
  for (const clip of clips) {
    points.push(clip.timelineStartMs, clip.timelineStartMs + clipDuration(clip));
  }
  return points;
}

export function splitClip(clips: Clip[], id: string, playhead: number) {
  const index = clips.findIndex((clip) => clip.id === id);
  if (index < 0) return clips;
  const clip = clips[index];
  const at = clip.inMs + (playhead - clip.timelineStartMs);
  if (at <= clip.inMs + 80 || at >= clip.outMs - 80) return clips;
  const left = { ...clip, outMs: at };
  const right = { ...clip, id: newId(), inMs: at, timelineStartMs: playhead };
  return [...clips.slice(0, index), left, right, ...clips.slice(index + 1)];
}

export function replaceClip(clips: Clip[], next: Clip) {
  return clips.map((clip) => (clip.id === next.id ? next : clip));
}

export function moveClipTo(clips: Clip[], id: string, startMs: number) {
  const clip = clips.find((item) => item.id === id);
  if (!clip) return clips;
  const start = placeWithoutOverlap(clips, id, Math.max(0, startMs));
  return replaceClip(clips, { ...clip, timelineStartMs: Math.round(start) });
}

export function trimClipEdge(
  clips: Clip[],
  id: string,
  edge: "start" | "end",
  timeMs: number,
  mediaEndMs: number | null,
) {
  const clip = clips.find((item) => item.id === id);
  if (!clip) return clips;
  const others = clips.filter((item) => item.id !== id);
  const fixedEnd = clip.timelineStartMs + clipDuration(clip);
  if (edge === "start") {
    const earliest = clip.timelineStartMs - clip.inMs;
    let start = clamp(timeMs, Math.max(0, earliest), fixedEnd - 100);
    start = clampAgainstStart(start, fixedEnd, others);
    const delta = start - clip.timelineStartMs;
    const inMs = Math.max(0, clip.inMs + delta);
    return replaceClip(clips, { ...clip, timelineStartMs: Math.round(start), inMs: Math.round(inMs), outMs: Math.round(inMs + (fixedEnd - start)) });
  }
  const maxEnd = clip.timelineStartMs + ((mediaEndMs ?? clip.inMs + 120_000) - clip.inMs);
  let end = clamp(timeMs, clip.timelineStartMs + 100, maxEnd);
  end = clampAgainstEnd(clip.timelineStartMs, end, others);
  return replaceClip(clips, { ...clip, outMs: Math.round(clip.inMs + (end - clip.timelineStartMs)) });
}

export function shiftRange(startMs: number, endMs: number, nextStart: number) {
  const length = Math.max(100, endMs - startMs);
  const start = Math.max(0, nextStart);
  return { startMs: Math.round(start), endMs: Math.round(start + length) };
}

function placeWithoutOverlap(clips: Clip[], id: string, desiredStart: number) {
  const clip = clips.find((item) => item.id === id);
  if (!clip) return desiredStart;
  const duration = clipDuration(clip);
  const others = clips.filter((item) => item.id !== id);
  let start = desiredStart;
  for (let pass = 0; pass < others.length + 1; pass += 1) {
    const hit = others.find((other) => overlaps(start, start + duration, other.timelineStartMs, other.timelineStartMs + clipDuration(other)));
    if (!hit) return start;
    const before = hit.timelineStartMs - duration;
    const after = hit.timelineStartMs + clipDuration(hit);
    start = desiredStart >= hit.timelineStartMs || before < 0 ? after : before;
  }
  return Math.max(0, start);
}

function clampAgainstStart(start: number, fixedEnd: number, others: Clip[]) {
  let next = start;
  for (const other of others) {
    const otherEnd = other.timelineStartMs + clipDuration(other);
    if (next < otherEnd && fixedEnd > other.timelineStartMs) next = otherEnd;
  }
  return Math.min(next, fixedEnd - 100);
}

function clampAgainstEnd(fixedStart: number, end: number, others: Clip[]) {
  let next = end;
  for (const other of others) {
    const otherEnd = other.timelineStartMs + clipDuration(other);
    if (fixedStart < otherEnd && next > other.timelineStartMs && other.timelineStartMs >= fixedStart) {
      next = Math.min(next, other.timelineStartMs);
    }
  }
  return Math.max(next, fixedStart + 100);
}

function overlaps(start: number, end: number, otherStart: number, otherEnd: number) {
  return start < otherEnd - 1 && end > otherStart + 1;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function parseSrt(source: string): CaptionBlock[] {
  const blocks = source.replace(/\r/g, "").trim().split(/\n\s*\n/);
  const captions: CaptionBlock[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((line) => line.trim().length > 0);
    const timing = lines.find((line) => line.includes("-->"));
    if (!timing) continue;
    const [start, end] = timing.split("-->").map((part) => parseStamp(part.trim()));
    const text = lines.slice(lines.indexOf(timing) + 1).join("\n").trim();
    if (start === null || end === null || !text) continue;
    captions.push({ id: newId(), startMs: start, endMs: Math.max(end, start + 100), text });
  }
  return captions;
}

export function formatSrt(captions: CaptionBlock[]) {
  return captions
    .map((caption, index) => `${index + 1}\n${formatClock(caption.startMs)} --> ${formatClock(caption.endMs)}\n${caption.text}\n`)
    .join("\n");
}

function parseStamp(value: string) {
  const match = value.match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number(match[4].padEnd(3, "0").slice(0, 3));
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
}
