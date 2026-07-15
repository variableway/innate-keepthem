import { apiInvoke, listVttReports } from "@/lib/api-client";
import type { ApiResponse, Download, MediaAsset } from "@/types";

const TRANSCRIPT_EXCERPT_LEN = 2000;

function excerpt(text: string | null | undefined, max = TRANSCRIPT_EXCERPT_LEN): string | null {
  if (!text?.trim()) return null;
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n… [truncated]`;
}

export async function loadMediaAssets(): Promise<MediaAsset[]> {
  const assets: MediaAsset[] = [];

  try {
    const response = await apiInvoke<ApiResponse<Download[]>>("get_downloads");
    if (response.success && response.data) {
      for (const download of response.data) {
        if (download.status !== "completed") continue;

        assets.push({
          id: `video:${download.id}`,
          type: "video",
          title: download.title || download.url,
          source_url: download.url,
          file_path: download.filename,
          transcript: null,
          metadata: {
            download_id: download.id,
            language: null,
            duration_sec: null,
          },
        });

        for (const subPath of download.subtitles) {
          const subName = subPath.split("/").pop() || subPath;
          assets.push({
            id: `subtitle:${download.id}:${subName}`,
            type: "subtitle",
            title: `${download.title || "Video"} — ${subName}`,
            source_url: download.url,
            file_path: subPath,
            transcript: null,
            metadata: {
              download_id: download.id,
            },
          });
        }
      }
    }
  } catch {
    // downloads unavailable in web-only preview
  }

  try {
    const { reports } = await listVttReports(1, 100);
    for (const report of reports) {
      if (report.status !== "done" && report.status !== "failed") continue;
      assets.push({
        id: `vtt_report:${report.id}`,
        type: "vtt_report",
        title: report.title || report.youtube_url,
        source_url: report.youtube_url,
        file_path: null,
        transcript: report.content || null,
        metadata: {
          report_id: report.id,
          language: report.language,
          duration_sec: report.duration_sec,
          cue_count: report.cue_count,
          status: report.status,
        },
      });
    }
  } catch {
    // vtt reports unavailable
  }

  return assets;
}

export function buildAssetContext(assets: MediaAsset[], selectedIds: string[]) {
  return assets
    .filter((a) => selectedIds.includes(a.id))
    .map((a) => ({
      id: a.id,
      title: a.title,
      type: a.type,
      source_url: a.source_url,
      transcript_excerpt: excerpt(a.transcript),
      language: a.metadata.language,
      duration_sec: a.metadata.duration_sec,
    }));
}
