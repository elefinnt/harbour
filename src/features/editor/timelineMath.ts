import type { CaptionBlock, Clip } from "../../shared/types";
import { formatClock, newId } from "../../shared/format";

export function clipDuration(clip: Clip) {
  return Math.max(100, clip.outMs - clip.inMs);
}

export function reflow(clips: Clip[]): Clip[] {
  let cursor = 0;
  return clips.map((clip) => {
    const duration = clipDuration(clip);
    const next = { ...clip, timelineStartMs: cursor, outMs: clip.inMs + duration };
    cursor += duration;
    return next;
  });
}

export function timelineDuration(clips: Clip[]) {
  return clips.reduce((sum, clip) => sum + clipDuration(clip), 0);
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
  const right = { ...clip, id: newId(), inMs: at };
  const next = [...clips.slice(0, index), left, right, ...clips.slice(index + 1)];
  return reflow(next);
}

export function moveClip(clips: Clip[], id: string, direction: -1 | 1) {
  const index = clips.findIndex((clip) => clip.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= clips.length) return clips;
  const next = [...clips];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return reflow(next);
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
