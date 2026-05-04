"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, FileText, Sparkles } from "lucide-react";
import { Button } from "@vytdl/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@vytdl/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@vytdl/ui";
import { useDownloadStore } from "@/store/downloadStore";
import { useTranslation } from "@/i18n";
import type { Download, ApiResponse } from "@/types";

interface SummaryResult {
  markdown: string;
  key_points: string[];
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(command, args);
}

export default function VideoPlayerClient() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const videoRef = useRef<HTMLVideoElement>(null);

  const { downloads } = useDownloadStore();
  const [download, setDownload] = useState<Download | null>(null);
  const [activeTab, setActiveTab] = useState("video");
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (id) {
      const found = downloads.find((d) => d.id === id);
      if (found) {
        setDownload(found);
      } else {
        invoke<ApiResponse<Download>>("get_download_by_id", { id }).then((response) => {
          if (response.success && response.data) {
            setDownload(response.data);
          }
        });
      }
    }
  }, [id, downloads]);

  const handleSummarize = async () => {
    if (!id) return;
    setIsSummarizing(true);
    try {
      const response = await invoke<ApiResponse<SummaryResult>>("summarize_video", {
        request: { video_id: id },
      });
      if (response.success && response.data) {
        setSummary(response.data);
        setActiveTab("summary");
      }
    } catch (err) {
      console.error("Failed to summarize:", err);
    } finally {
      setIsSummarizing(false);
    }
  };

  if (!download) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <Button variant="ghost" onClick={() => window.history.back()} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" />
        {t("common.back")}
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-0">
              <div className="aspect-video bg-black rounded-t-lg overflow-hidden">
                {download.filename ? (
                  <video
                    ref={videoRef}
                    className="w-full h-full"
                    controls
                    crossOrigin="anonymous"
                  >
                    <source src={`file://${download.filename}`} />
                    {download.subtitles.map((sub) => (
                      <track
                        key={sub}
                        kind="subtitles"
                        src={`file://${sub}`}
                        srcLang={sub.match(/\.([a-z]{2})\.vtt$/)?.[1] || "en"}
                        label={sub.match(/\.([a-z]{2})\.vtt$/)?.[1]?.toUpperCase() || "English"}
                      />
                    ))}
                  </video>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white">
                    {t("player.videoNotAvailable")}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle>{download.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {download.subtitles.length > 0 && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    {download.subtitles.length} {t("player.subtitlesAvailable")}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full">
              <TabsTrigger value="video" className="flex-1">{t("player.infoTab")}</TabsTrigger>
              <TabsTrigger value="summary" className="flex-1">{t("player.summaryTab")}</TabsTrigger>
            </TabsList>

            <TabsContent value="video">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("player.videoDetails")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">{t("player.url")}</p>
                    <p className="text-sm break-all">{download.url}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("player.downloaded")}</p>
                    <p className="text-sm">{new Date(download.created_at).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("player.file")}</p>
                    <p className="text-sm break-all">{download.filename}</p>
                  </div>

                  <Button
                    className="w-full"
                    onClick={handleSummarize}
                    disabled={isSummarizing}
                  >
                    {isSummarizing ? (
                      <>
                        <Sparkles className="mr-2 h-4 w-4 animate-spin" />
                        {t("player.summarizing")}
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        {t("player.aiSummarize")}
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="summary">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("player.aiSummary")}</CardTitle>
                </CardHeader>
                <CardContent>
                  {summary ? (
                    <div className="prose prose-sm max-w-none">
                      {summary.key_points.length > 0 && (
                        <div className="mb-4">
                          <p className="font-medium mb-2">{t("player.keyPoints")}</p>
                          <ul className="list-disc pl-4 space-y-1">
                            {summary.key_points.map((point, i) => (
                              <li key={i}>{point}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div dangerouslySetInnerHTML={{ __html: summary.markdown }} />
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>{t("player.noSummary")}</p>
                      <p className="text-sm">{t("player.noSummaryHint")}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
