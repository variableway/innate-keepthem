"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Copy,
  Download,
  Clock,
  Hash,
  ExternalLink,
  CheckCircle,
  XCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@vytdl/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@vytdl/ui";
import { Badge } from "@vytdl/ui";
import { Spinner } from "@vytdl/ui";
import {
  getVttReport,
  apiListen,
  VttReport,
} from "@/lib/api-client";

function formatDuration(sec: number | null): string {
  if (!sec) return "--:--";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function AnalyzeReportClient({ id }: { id: string }) {
  const router = useRouter();
  const [report, setReport] = useState<VttReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function loadReport() {
    try {
      const data = await getVttReport(id);
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReport();

    const unsub = apiListen("vtt-report:status", (payload: any) => {
      if (payload.reportId === id) {
        setReport((prev) => prev ? { ...prev, status: payload.status } : prev);
      }
    });

    const unsubComplete = apiListen("vtt-report:complete", (payload: any) => {
      if (payload.reportId === id) {
        loadReport();
      }
    });

    return () => {
      unsub.then((fn) => fn());
      unsubComplete.then((fn) => fn());
    };
  }, [id]);

  function handleCopy() {
    if (!report?.content) return;
    navigator.clipboard.writeText(report.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    if (!report?.content) return;
    const blob = new Blob([report.content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.title || report.video_id || "transcript"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleShare() {
    const shareUrl = window.location.href;
    navigator.clipboard.writeText(shareUrl);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <Spinner className="h-8 w-8 mx-auto" />
          <p className="text-muted-foreground text-sm">Loading report...</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <Button variant="ghost" onClick={() => router.push("/analyze")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Analyzer
        </Button>
        <Card>
          <CardContent className="py-8 text-center">
            <XCircle className="h-8 w-8 mx-auto mb-3 text-destructive" />
            <p className="text-destructive">{error || "Report not found"}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (report.status === "pending" || report.status === "processing") {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <Button variant="ghost" onClick={() => router.push("/analyze")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Analyzer
        </Button>
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary" />
            <div>
              <p className="font-medium text-lg">
                {report.status === "pending" ? "Queued..." : "Analyzing..."}
              </p>
              <p className="text-muted-foreground text-sm mt-1">
                Fetching subtitles and converting to Markdown. This may take a few moments.
              </p>
            </div>
            <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <ExternalLink className="h-3 w-3" />
                {report.youtube_url}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (report.status === "failed") {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <Button variant="ghost" onClick={() => router.push("/analyze")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Analyzer
        </Button>
        <Card>
          <CardContent className="py-8 text-center">
            <XCircle className="h-8 w-8 mx-auto mb-3 text-destructive" />
            <p className="text-destructive font-medium">Analysis Failed</p>
            <p className="text-muted-foreground text-sm mt-1">
              {report.error || "Something went wrong. The video may not have subtitles available."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.push("/analyze")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleShare}>
            Share
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? <CheckCircle className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
            {copied ? "Copied!" : "Copy Markdown"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-1" />
            Download
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <CardTitle className="text-xl leading-tight">
                {report.title || "Transcript Report"}
              </CardTitle>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                {report.language && (
                  <Badge variant="secondary">{report.language}</Badge>
                )}
                {report.cue_count > 0 && (
                  <span className="flex items-center gap-1">
                    <Hash className="h-3 w-3" />
                    {report.cue_count} cues
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDuration(report.duration_sec)}
                </span>
              </div>
              {report.youtube_url && (
                <a
                  href={report.youtube_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  {report.youtube_url}
                </a>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <CheckCircle className="h-4 w-4 text-green-500" />
            Report generated successfully
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transcript</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{
              __html: report.content
                .replace(/^## /gm, '<h2 class="text-base font-semibold mt-6 mb-2">')
                .replace(/^(\d{2}:\d{2}:\d{2})\s+(.*)$/gm, (_, time, text) => {
                  const cleanText = text
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;");
                  return `<p class="my-1 pl-6 text-sm"><span class="text-muted-foreground font-mono text-xs mr-2">${time}</span>${cleanText}</p>`;
                })
                .replace(/(<\/h2>)/g, "$1\n"),
            }}
          />
        </CardContent>
      </Card>

      <div className="text-center text-xs text-muted-foreground py-4">
        Generated by vYtDL VTT Analyzer
      </div>
    </div>
  );
}
