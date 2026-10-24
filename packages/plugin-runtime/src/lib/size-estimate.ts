// File-size estimation from duration. Flat-playlist enumeration is fast
// precisely because it skips per-video format extraction, so real sizes are
// unavailable at list time — estimate from typical per-quality bitrates
// instead and label it clearly as an estimate.

// Average total bitrates (video + ~150kbps audio), Mbps, YouTube-ish
const QUALITY_BITRATES_MBPS: Record<string, number> = {
  best: 4.6, // most channels cap around 1080p
  "2160": 18.2,
  "1440": 9.2,
  "1080": 4.5,
  "720": 2.65,
  "480": 1.35,
  "360": 0.95,
};

export function estimateFileSizeMb(durationSec: number | null | undefined, quality: string): number | null {
  if (durationSec == null || durationSec <= 0) return null;
  const bitrate = QUALITY_BITRATES_MBPS[quality] ?? QUALITY_BITRATES_MBPS.best;
  return (bitrate * durationSec) / 8; // MB
}

export function formatSizeMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `${Math.round(mb)} MB`;
  return `${Math.max(1, Math.round(mb * 1024))} KB`;
}
