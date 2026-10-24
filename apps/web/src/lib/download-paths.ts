// Completed downloads may have a null output_dir (it was never set on the
// record when the frontend didn't pass one), while filename holds the
// absolute file path — derive the containing folder from it in that case.
export function folderOfDownload(d: {
  output_dir?: string | null;
  filename?: string | null;
}): string | null {
  if (d.output_dir && d.output_dir.trim()) return d.output_dir;
  if (d.filename && d.filename.trim()) {
    const idx = Math.max(d.filename.lastIndexOf("/"), d.filename.lastIndexOf("\\"));
    return idx > 0 ? d.filename.slice(0, idx) : null;
  }
  return null;
}

// Filesystem-safe folder name for a collection title (matches what yt-dlp's
// --windows-filenames would keep, plus a little extra caution).
export function sanitizeFolderName(title: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/[\x00-\x1f]/g, "")
    .trim()
    .replace(/\.+$/, "")
    .slice(0, 100)
    .trim();
  return cleaned || "Collection";
}

// YouTube video id from a watch/shorts URL (handles watch?v=X&list=Y where
// the entry url and a previously-submitted url differ by the list param).
export function youtubeVideoIdOf(url: string): string | null {
  const m = url.match(/[?&]v=([a-zA-Z0-9_-]{6,})/) || url.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/);
  return m ? m[1] : null;
}

// True when this URL was already downloaded (completed) — used to skip
// duplicates when expanding a collection.
export function isAlreadyDownloaded(
  url: string,
  existing: { url: string; status: string; filename?: string | null }[]
): boolean {
  const vid = youtubeVideoIdOf(url);
  return existing.some((d) => {
    if (d.status !== "completed") return false;
    if (d.url === url) return true;
    const other = youtubeVideoIdOf(d.url);
    if (vid && other && vid === other) return true;
    // Fallback: the output filename embeds [VIDEOID] per the output template
    if (vid && d.filename && d.filename.includes(`[${vid}]`)) return true;
    return false;
  });
}
