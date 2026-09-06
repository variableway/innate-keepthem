"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Code2,
  KeyRound,
  MonitorX,
  RefreshCw,
  Rocket,
  Sparkles,
  SquareTerminal,
  XCircle,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
} from "@vytdl/ui";
import { apiInvoke } from "@/lib/api-client";
import { useTranslation } from "@/i18n";
import { useSettingsStore } from "@/store/settingsStore";
import type {
  AgentCliToolId,
  AgentCliToolInfo,
  AgentProviderInfo,
  AgentTerminalInfo,
  ApiResponse,
  LaunchAgentTerminalResult,
  Settings,
} from "@/types";

const AGENT_ICONS: Record<AgentCliToolId, typeof Bot> = {
  kimi: Bot,
  "claude-code": Sparkles,
  codex: Code2,
};

const AGENT_ORDER: AgentCliToolId[] = ["kimi", "claude-code", "codex"];

function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return (
    (window as Window & { __TAURI__?: unknown }).__TAURI__ !== undefined ||
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== undefined
  );
}

export function TerminalLauncher() {
  const { t } = useTranslation();
  const settings = useSettingsStore((s) => s.settings);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const [desktop] = useState(isTauriRuntime);
  const [terminals, setTerminals] = useState<AgentTerminalInfo[]>([]);
  const [providers, setProviders] = useState<AgentProviderInfo[]>([]);
  const [clis, setClis] = useState<AgentCliToolInfo[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);

  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [agentCli, setAgentCli] = useState<AgentCliToolId>("kimi");
  const [providerId, setProviderId] = useState<string | null>(null);
  const [regionId, setRegionId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [workdir, setWorkdir] = useState("");

  const [launching, setLaunching] = useState(false);
  const [launchResult, setLaunchResult] = useState<LaunchAgentTerminalResult | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);

  // Latest settings without re-running dependent effects.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // User-edited fields must not be overwritten by late-arriving prefills.
  const keyTouchedRef = useRef(false);
  const workdirTouchedRef = useRef(false);

  const prefillApiKey = useCallback(
    (agent: AgentCliToolId, pid: string | null) => {
      const p =
        providers.find((x) => x.agent_cli === agent && x.id === pid) ??
        providers.find((x) => x.agent_cli === agent);
      const keySetting = p?.api_key_setting as keyof Settings | null | undefined;
      const current = settingsRef.current;
      setApiKey(
        keySetting && current
          ? ((current[keySetting] as string | null | undefined) ?? "")
          : "",
      );
    },
    [providers],
  );

  const detectAll = useCallback(async () => {
    setDetecting(true);
    setDetectError(null);
    try {
      const [terminalsRes, providersRes, clisRes] = await Promise.all([
        apiInvoke<ApiResponse<AgentTerminalInfo[]>>("detect_agent_terminals"),
        apiInvoke<ApiResponse<AgentProviderInfo[]>>("list_agent_providers"),
        apiInvoke<ApiResponse<AgentCliToolInfo[]>>("detect_agent_clis"),
      ]);
      if (terminalsRes.success && terminalsRes.data) setTerminals(terminalsRes.data);
      if (providersRes.success && providersRes.data) setProviders(providersRes.data);
      if (clisRes.success && clisRes.data) setClis(clisRes.data);
      const firstError = [terminalsRes, providersRes, clisRes].find((r) => !r.success);
      if (firstError) setDetectError(firstError.error || "detection failed");
    } catch (err) {
      setDetectError(String(err));
    } finally {
      setDetecting(false);
    }
  }, []);

  useEffect(() => {
    if (!desktop) return;
    fetchSettings();
    detectAll();
  }, [desktop, fetchSettings, detectAll]);

  // Prefill terminal & workdir once detection + settings arrive (whichever is later).
  useEffect(() => {
    if (terminals.length === 0) return;
    const found = terminals.filter((term) => term.found);
    if (found.length === 0) return;
    const saved = settings?.agent_terminal;
    setTerminalId((current) => current ?? found.find((term) => term.id === saved)?.id ?? found[0].id);
  }, [terminals, settings]);

  useEffect(() => {
    if (workdirTouchedRef.current || workdir) return;
    if (settings?.agent_terminal_workdir) setWorkdir(settings.agent_terminal_workdir);
  }, [settings, workdir]);

  // Late-arriving settings: prefill the API key of the selected provider.
  useEffect(() => {
    if (keyTouchedRef.current || !settings) return;
    prefillApiKey(agentCli, providerId);
  }, [settings, agentCli, providerId, prefillApiKey]);

  // Reset provider-dependent state when the agent (or catalog) changes.
  useEffect(() => {
    const list = providers.filter((p) => p.agent_cli === agentCli);
    const current = list.find((p) => p.id === providerId);
    const next = current ?? list[0];
    setProviderId(next?.id ?? null);
    setRegionId(next?.regions?.[0]?.id ?? null);
    setModelId(next?.models?.[0]?.id ?? null);
    keyTouchedRef.current = false;
    prefillApiKey(agentCli, next?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentCli, providers]);

  const agentProviders = useMemo(
    () => providers.filter((p) => p.agent_cli === agentCli),
    [providers, agentCli],
  );
  const provider = agentProviders.find((p) => p.id === providerId) ?? agentProviders[0];
  const cliInfo = clis.find((c) => c.id === agentCli);
  const foundTerminals = terminals.filter((term) => term.found);
  const missingTerminals = terminals.filter((term) => !term.found);
  const selectedTerminal = foundTerminals.find((term) => term.id === terminalId);

  const needsKey = provider?.requires_api_key ?? false;
  const modelCount = provider?.models.length ?? 0;
  const regionCount = provider?.regions.length ?? 0;

  const canLaunch =
    desktop &&
    Boolean(selectedTerminal) &&
    Boolean(cliInfo?.found) &&
    Boolean(provider) &&
    (!needsKey || apiKey.trim().length > 0);

  const handleProviderChange = (id: string) => {
    const next = agentProviders.find((p) => p.id === id);
    setProviderId(id);
    setRegionId(next?.regions?.[0]?.id ?? null);
    setModelId(next?.models?.[0]?.id ?? null);
    keyTouchedRef.current = false;
    prefillApiKey(agentCli, id);
  };

  const handleLaunch = async () => {
    if (!provider || !terminalId) return;
    setLaunching(true);
    setLaunchError(null);
    setLaunchResult(null);
    try {
      const response = await apiInvoke<ApiResponse<LaunchAgentTerminalResult>>(
        "launch_agent_terminal",
        {
          request: {
            terminal_id: terminalId,
            agent_cli: agentCli,
            provider_id: provider.id,
            region: regionId,
            model: modelId,
            api_key: needsKey ? apiKey.trim() : null,
            workdir: workdir.trim() || null,
            cli_bin: cliInfo?.path ?? null,
          },
        },
      );
      if (response.success && response.data) {
        setLaunchResult(response.data);
        // Persist preferences for next launch.
        if (settings) {
          const patch: Record<string, string | null> = {
            agent_terminal: terminalId,
            agent_terminal_workdir: workdir.trim() || null,
          };
          if (provider.api_key_setting) {
            patch[provider.api_key_setting as string] = apiKey.trim() || null;
          }
          await updateSettings({ ...settings, ...patch } as Settings);
        }
      } else {
        setLaunchError(response.error || t("workspace.terminal.launching"));
      }
    } catch (err) {
      setLaunchError(String(err));
    } finally {
      setLaunching(false);
    }
  };

  if (!desktop) {
    return (
      <Card className="mx-auto max-w-3xl">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <MonitorX className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("workspace.terminal.desktopOnly")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <SquareTerminal className="h-5 w-5 text-primary" />
            {t("workspace.terminal.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("workspace.terminal.subtitle")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={detectAll} disabled={detecting}>
          {detecting ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {t("workspace.terminal.refresh")}
        </Button>
      </div>

      {/* ── Terminal ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("workspace.terminal.sectionTerminal")}</CardTitle>
          <CardDescription>{t("workspace.terminal.terminalHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {foundTerminals.length === 0 && !detecting ? (
            <p className="text-sm text-destructive">
              {t("workspace.terminal.terminalNoneFound")}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {foundTerminals.map((term) => (
                <button
                  key={term.id}
                  type="button"
                  onClick={() => setTerminalId(term.id)}
                  className={`flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors ${
                    terminalId === term.id
                      ? "border-primary bg-primary/10"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <SquareTerminal className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate font-medium">{term.label}</span>
                  {terminalId === term.id && <CheckCircle2 className="h-4 w-4 text-primary" />}
                </button>
              ))}
            </div>
          )}
          {missingTerminals.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("workspace.terminal.agentNotFound")}:{" "}
              {missingTerminals.map((term) => term.label).join(", ")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Agent CLI ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("workspace.terminal.sectionAgent")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {AGENT_ORDER.map((id) => {
              const Icon = AGENT_ICONS[id];
              const info = clis.find((c) => c.id === id);
              const active = agentCli === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setAgentCli(id)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    active ? "border-primary bg-primary/10" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate text-sm font-medium">
                      {t(`workspace.terminal.agentName.${id}`)}
                    </span>
                    {info?.found ? (
                      <Badge variant="default" className="text-[10px]">
                        {t("workspace.terminal.agentFound")}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        {t("workspace.terminal.agentNotFound")}
                      </Badge>
                    )}
                  </div>
                  {info?.path && (
                    <p className="mt-1 truncate text-[11px] text-muted-foreground" title={info.path}>
                      {info.path}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
          {cliInfo && !cliInfo.found && (
            <p className="mt-2 text-sm text-amber-600">
              {t("workspace.terminal.cliMissing", { command: cliInfo.command })}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Provider / Model / Key ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("workspace.terminal.sectionProvider")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("workspace.terminal.providerLabel")}</Label>
            <Select
              value={provider?.id ?? ""}
              onValueChange={(v) => handleProviderChange(String(v))}
              disabled={agentProviders.length <= 1}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {agentProviders.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {provider?.hint && (
              <p className="text-xs text-muted-foreground">{provider.hint}</p>
            )}
            {!provider?.requires_api_key && provider?.models.length <= 1 && (
              <Badge variant="secondary" className="text-[10px]">
                {t("workspace.terminal.agentDirect")}
              </Badge>
            )}
          </div>

          {regionCount > 1 && (
            <div className="space-y-1.5">
              <Label>{t("workspace.terminal.regionLabel")}</Label>
              <Select value={regionId ?? ""} onValueChange={(v) => setRegionId(String(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {provider?.regions.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {modelCount > 1 ? (
            <div className="space-y-1.5">
              <Label>{t("workspace.terminal.modelLabel")}</Label>
              <Select value={modelId ?? ""} onValueChange={(v) => setModelId(String(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {provider?.models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : modelCount === 1 ? (
            <div className="flex items-center gap-2">
              <Label>{t("workspace.terminal.modelLabel")}</Label>
              <Badge variant="secondary">{t("workspace.terminal.modelFixed")}</Badge>
              <code className="text-xs text-muted-foreground">{provider?.models[0].id}</code>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("workspace.terminal.modelCliDefault")}
            </p>
          )}

          {needsKey && (
            <div className="space-y-1.5">
              <Label htmlFor="agent-api-key" className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5" />
                {t("workspace.terminal.apiKeyLabel")}
              </Label>
              <Input
                id="agent-api-key"
                type="password"
                value={apiKey}
                onChange={(e) => {
                  keyTouchedRef.current = true;
                  setApiKey(e.target.value);
                }}
                placeholder={t("workspace.terminal.apiKeyPlaceholder")}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                {t("workspace.terminal.apiKeyHint")}
              </p>
            </div>
          )}

          <Separator />

          <div className="space-y-1.5">
            <Label htmlFor="agent-workdir">{t("workspace.terminal.workdirLabel")}</Label>
            <Input
              id="agent-workdir"
              value={workdir}
              onChange={(e) => {
                workdirTouchedRef.current = true;
                setWorkdir(e.target.value);
              }}
              placeholder={t("workspace.terminal.workdirPlaceholder")}
              spellCheck={false}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Launch ── */}
      <div className="space-y-3">
        <Button size="lg" className="w-full" onClick={handleLaunch} disabled={!canLaunch || launching}>
          {launching ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Rocket className="mr-2 h-4 w-4" />
          )}
          {launching ? t("workspace.terminal.launching") : t("workspace.terminal.launch")}
        </Button>

        {launchError && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="break-all">{launchError}</span>
          </div>
        )}

        {launchResult && (
          <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              {t("workspace.terminal.successTitle", { terminal: launchResult.terminal_label })}
            </div>
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {launchResult.env_summary.map((line) => (
                <li key={line} className="font-mono">
                  {line}
                </li>
              ))}
            </ul>
            <p className="break-all text-[11px] text-muted-foreground">
              {launchResult.script_path}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("workspace.terminal.successHint")}
            </p>
          </div>
        )}

        {detectError && <p className="text-sm text-destructive">{detectError}</p>}
      </div>
    </div>
  );
}
