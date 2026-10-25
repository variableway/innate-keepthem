"use client";

// Plugin management (Sprint 4): built-in + third-party plugin states with
// enable/disable for daemon-installed plugins, plus the safe-mode hint.

import { useCallback, useEffect, useState } from "react";
import { Package, Puzzle, RefreshCw } from "lucide-react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Separator } from "@vytdl/ui";
import { usePluginStates, isSafeMode } from "@vytdl/plugin-runtime";
import { useTranslation } from "@vytdl/plugin-runtime/i18n";

interface InstalledPluginInfo {
  id: string;
  name: string;
  version: string;
  disabled: boolean;
  pending: boolean;
  error?: string;
}

export function PluginsCard() {
  const { t } = useTranslation();
  const states = usePluginStates();
  const [installed, setInstalled] = useState<InstalledPluginInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const safeMode = isSafeMode();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/plugins");
      const body = (await res.json()) as { success: boolean; data?: InstalledPluginInfo[] };
      setInstalled(body.data ?? []);
    } catch {
      setInstalled([]); // daemon without plugin support or remote API absent
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setDisabled = async (id: string, disable: boolean) => {
    setBusy(true);
    try {
      await fetch(`/api/plugins/${encodeURIComponent(id)}/${disable ? "disable" : "enable"}`, {
        method: "POST",
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Puzzle className="h-4 w-4" />
          {t("plugins.title")}
        </CardTitle>
        <CardDescription>{t("plugins.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {safeMode && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            {t("plugins.safeMode")}
          </div>
        )}

        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{t("plugins.builtinSection")}</p>
          {states.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <p className="text-sm font-medium">{s.name}</p>
                <p className="text-xs text-muted-foreground">
                  {s.id} · v{s.version}
                  {s.error ? ` · ${s.error}` : ""}
                </p>
              </div>
              <Badge variant={s.status === "active" ? "secondary" : "destructive"}>{s.status}</Badge>
            </div>
          ))}
        </div>

        <Separator />

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">{t("plugins.installedSection")}</p>
            <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={busy}>
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
          {installed.length === 0 && (
            <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
              {t("plugins.empty")}
            </p>
          )}
          {installed.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Package className="h-3 w-3" />
                  {p.name || p.id}
                  {p.pending && <Badge variant="outline">{t("plugins.pending")}</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.id} · v{p.version}
                  {p.error ? ` · ${p.error}` : ""}
                </p>
              </div>
              {p.pending ? (
                <Badge variant="destructive">{t("plugins.failed")}</Badge>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void setDisabled(p.id, !p.disabled)}
                >
                  {p.disabled ? t("plugins.enable") : t("plugins.disable")}
                </Button>
              )}
            </div>
          ))}
          <p className="pt-1 text-xs text-muted-foreground">{t("plugins.installHint")}</p>
        </div>
      </CardContent>
    </Card>
  );
}
