import type { AspectPreset, Network } from "./types";

export const NETWORKS: { id: Network; label: string; titleLimit: number; captionLimit: number }[] = [
  { id: "youtube", label: "YouTube", titleLimit: 100, captionLimit: 5000 },
  { id: "tiktok", label: "TikTok", titleLimit: 100, captionLimit: 2200 },
  { id: "instagram", label: "Instagram", titleLimit: 100, captionLimit: 2200 },
  { id: "facebook", label: "Facebook", titleLimit: 100, captionLimit: 5000 },
  { id: "linkedin", label: "LinkedIn", titleLimit: 100, captionLimit: 3000 },
  { id: "x", label: "X", titleLimit: 100, captionLimit: 280 },
];

export const ASPECTS: { id: AspectPreset; label: string; size: string }[] = [
  { id: "vertical", label: "Vertical", size: "1080 × 1920" },
  { id: "square", label: "Square", size: "1080 × 1080" },
  { id: "widescreen", label: "Widescreen", size: "1920 × 1080" },
];

export function networkLabel(id: Network) {
  return NETWORKS.find((item) => item.id === id)?.label ?? id;
}

export function aspectLabel(id: AspectPreset) {
  return ASPECTS.find((item) => item.id === id)?.label ?? id;
}
