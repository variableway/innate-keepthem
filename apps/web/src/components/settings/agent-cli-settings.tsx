"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  CheckCircle2,
  FolderOpen,
  RefreshCw,
  Search,
  XCircle,
  AlertCircle,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@vytdl/ui";
import { apiInvoke } from "@/lib/api-client";
import { useTranslation } from "@/i18n";
import type { ApiResponse, DetectAgentCliResult, KimiConfigStatus, Settings } from "@/types";

type AgentCliSettingsProps = {
  settings: Settings;
  onChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
};

function statusVariant(
  found: boolean,
  source: string,
): "default" | "secondary" | "destructive" {
  if (found) return "default";
  if (source === "configured_missing") return "destructive";
  return "secondary";
}

function configStatusVariant(
  status: KimiConfigStatus["status"],
): "default" | "secondary" | "destructive" {
  if (status === "ready") return "default";
  if (status === "needs_login" || status === "token_expired") return "secondary";
  return "destructive";
}

function configStatusLabel(
  status: KimiConfigStatus["status"],
  t: (key: string) => string,
): string {
  const key = `settings.agentCliConfigStatus.${status}`;
  const translated = t(key);
  return translated === key ? status : translated;
}

export function AgentCliSettings({ settings, onChange }: AgentCliSettingsProps) {
  const { t } = useTranslation();
  const [detecting, setDetecting] = useState(false);
  const [detection, setDetection] = useState<DetectAgentCliResult | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);

  const handleDetect = useCallback(async () => {
    setDetecting(true);
    setDetectError(null);
    try {
      const response = await apiInvoke<ApiResponse<DetectAgentCliResult>>(
        "detect_agent_cli",
        {
          kimi_bin: settings.agent_cli_kimi_bin,
          other_bin: settings.agent_cli_other_bin,
        },
      );
      if (response.success && response.data) {
        setDetection(response.data);
        if (response.data.kimi.found && response.data.kimi.path) {
          onChange("agent_cli_kimi_bin", response.data.kimi.path);
        }
      } else {
        setDetectError(response.error || t("settings.agentCliDetectFailed"));
      }
    } catch (err) {
      setDetectError(String(err));
    } finally {
      setDetecting(false);
    }
  }, [settings.agent_cli_kimi_bin, settings.agent_cli_other_bin, onChange, t]);

  useEffect(() => {
    handleDetect();
  }, [handleDetect]);

  const kimiStatus = detection?.kimi;
  const kimiConfig = kimiStatus?.config;

  return (
    <Card id="section-agent-cli" className="scroll-mt-6">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              {t("settings.agentCliTitle")}
            </CardTitle>
            <CardDescription>{t("settings.agentCliDescription")}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleDetect} disabled={detecting}>
            {detecting ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            {t("settings.agentCliDetect")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="kimi-cli-bin">{t("settings.agentCliKimiLabel")}</Label>
            <div className="flex items-center gap-2">
              {kimiConfig && (
                <Badge variant={configStatusVariant(kimiConfig.status)}>
                  {configStatusLabel(kimiConfig.status, t)}
                </Badge>
              )}
              {kimiStatus && (
                <Badge variant={statusVariant(kimiStatus.found, kimiStatus.source)}>
                  {kimiStatus.found
                    ? t("settings.agentCliStatusFound")
                    : t("settings.agentCliStatusNotFound")}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Input
              id="kimi-cli-bin"
              value={settings.agent_cli_kimi_bin || ""}
              onChange={(e) => onChange("agent_cli_kimi_bin", e.target.value || null)}
              placeholder={t("settings.agentCliKimiPlaceholder")}
            />
            <Button variant="outline" size="icon" type="button" disabled>
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("settings.agentCliKimiHint")}</p>
          {kimiStatus?.version && (
            <p className="text-xs text-muted-foreground">
              {t("settings.agentCliVersion")}: {kimiStatus.version}
              {kimiStatus.source && (
                <span className="ml-2 opacity-70">({kimiStatus.source})</span>
              )}
            </p>
          )}
        </div>

        {kimiConfig && (
          <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{t("settings.agentCliConfigTitle")}</p>
              {kimiConfig.ready ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-500" />
              )}
            </div>

            {kimiConfig.default_model && (
              <p className="text-xs text-muted-foreground">
                {t("settings.agentCliDefaultModel")}:{" "}
                <code className="text-foreground">{kimiConfig.default_model}</code>
              </p>
            )}

            {kimiConfig.config_dir && (
              <p className="text-xs text-muted-foreground break-all">
                {t("settings.agentCliConfigDir")}: {kimiConfig.config_dir}
              </p>
            )}

            {kimiConfig.token_expires_at && (
              <p className="text-xs text-muted-foreground">
                {t("settings.agentCliTokenExpires")}: {kimiConfig.token_expires_at}
                {kimiConfig.token_expired && (
                  <span className="ml-1 text-amber-600">
                    ({t("settings.agentCliConfigStatus.token_expired")})
                  </span>
                )}
              </p>
            )}

            <ul className="space-y-1.5">
              {kimiConfig.checks.map((check) => (
                <li key={check.id} className="flex items-start gap-2 text-xs">
                  {check.ok ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
                  ) : (
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0">
                    <span className="font-medium">{check.label}</span>
                    {check.detail && (
                      <p className="text-muted-foreground break-all">{check.detail}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {kimiConfig.status === "needs_login" && (
              <p className="text-xs text-muted-foreground">
                {t("settings.agentCliNeedsLoginHint")}
              </p>
            )}
          </div>
        )}

        <div className="space-y-2 opacity-60">
          <Label htmlFor="other-cli-bin">{t("settings.agentCliOtherLabel")}</Label>
          <div className="flex gap-2">
            <Input
              id="other-cli-bin"
              value={settings.agent_cli_other_bin || ""}
              onChange={(e) => onChange("agent_cli_other_bin", e.target.value || null)}
              placeholder={t("settings.agentCliOtherPlaceholder")}
              disabled
            />
            <Button variant="outline" size="icon" type="button" disabled>
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("settings.agentCliOtherHint")}</p>
        </div>

        {detectError && <p className="text-sm text-destructive">{detectError}</p>}
      </CardContent>
    </Card>
  );
}
