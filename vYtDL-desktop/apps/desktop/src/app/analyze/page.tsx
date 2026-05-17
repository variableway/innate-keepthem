"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Play, Clock, Trash2, Copy, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@vytdl/ui";
import { Button } from "@vytdl/ui";
import { Input } from "@vytdl/ui";
import { Badge } from "@vytdl/ui";
import { Spinner } from "@vytdl/ui";
import {
  startVttAnalysis,
  listVttReports,
  deleteVttReport,
  VttReport,
} from "@/lib/api-client";
import { useTranslation } from "@/i18n";

function formatDuration(sec: number | null): string {
  if (!sec) return "--:--";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AnalyzePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [reports, setReports] = useState<VttReport[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadReports() {
    try {
      const data = await listVttReports(1, 20);
      setReports(data.reports);
    } catch (e) {
      console.error("Failed to load reports:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReports();
  }, []);

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setAnalyzing(true);
    setError("");
    try {
      const { reportId } = await startVttAnalysis(url.trim());
      router.push(`/analyze/${reportId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      setAnalyzing(false);
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await deleteVttReport(id);
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error("Delete failed:", err);
    }
  }

  return (
    <div className="p-6 w-full min-w-[640px] max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <FileText className="h-8 w-8" />
          {t("analyze.title", "VTT Subtitle Analyzer")}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t("analyze.subtitle", "Generate shareable transcript reports from any YouTube video.")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("analyze.inputTitle", "Analyze a Video")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleAnalyze} className="flex gap-2">
            <Input
              placeholder="https://youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1"
              disabled={analyzing}
            />
            <Button type="submit" disabled={analyzing || !url.trim()}>
              {analyzing ? (
                <>
                  <Spinner className="h-4 w-4" />
                  <span className="ml-2">{t("analyze.analyzing", "Analyzing...")}</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  <span className="ml-2">{t("analyze.analyze", "Analyze")}</span>
                </>
              )}
            </Button>
          </form>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{t("analyze.recent", "Recent Analyses")}</h2>
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner className="h-6 w-6" />
          </div>
        ) : reports.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4">{t("analyze.empty", "No analyses yet. Paste a YouTube URL above to get started.")}</p>
        ) : (
          <div className="space-y-2">
            {reports.map((report) => (
              <Card
                key={report.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => router.push(`/analyze/${report.id}`)}
              >
                <CardContent className="flex items-center gap-3 py-3 px-4">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {report.title || report.youtube_url}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      {report.language && (
                        <Badge variant="secondary">{report.language}</Badge>
                      )}
                      {report.cue_count > 0 && (
                        <span>{report.cue_count} cues</span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDuration(report.duration_sec)}
                      </span>
                      <span>{formatDate(report.created_at)}</span>
                      {report.status === "pending" && (
                        <Badge variant="outline">pending</Badge>
                      )}
                      {report.status === "processing" && (
                        <Badge variant="default">processing</Badge>
                      )}
                      {report.status === "failed" && (
                        <Badge variant="destructive">failed</Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => handleDelete(report.id, e)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
