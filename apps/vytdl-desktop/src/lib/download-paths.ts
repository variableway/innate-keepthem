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
