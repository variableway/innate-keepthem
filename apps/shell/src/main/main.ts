// vYtDL Desktop shell — Electron main process.
//
// The shell hosts the product but implements no business logic: it spawns the
// Go daemon (`vytdl serve`), waits for health, and opens a sandboxed window
// loading the daemon-served web UI. Native capabilities live in the preload
// bridge (terminal launcher, dialogs, clipboard).

import { app, BrowserWindow, dialog, ipcMain, clipboard, shell } from "electron";
import { autoUpdater } from "electron-updater";
import * as path from "node:path";
import * as fs from "node:fs";
import {
  startDaemon,
  stopDaemon,
  resolveDaemonBin,
  type DaemonHandle,
} from "./daemon";
import { maybeMigrateLegacyData } from "./migration";
import {
  detectAgentClis,
  detectTerminals,
  launchAgentTerminal,
  listAgentProviders,
  type LaunchAgentTerminalRequest,
} from "./terminal-launcher";

let mainWindow: BrowserWindow | null = null;
let daemon: DaemonHandle | null = null;

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

function staticDir(): string | null {
  const candidates = [
    path.join(process.resourcesPath ?? "", "web"),
    path.join(app.getAppPath(), "resources", "web"),
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, "index.html"))) return dir;
    } catch {
      // keep looking
    }
  }
  return null;
}

function daemonHome(): string {
  // Data root survives app updates (sprint-0 doc 01 §2.4).
  return path.join(app.getPath("userData"), "vytdl-home");
}

async function createWindow(): Promise<void> {
  const staticDirResolved = staticDir();
  const devDaemonUrl = process.env.VYTDL_DEV_DAEMON_URL;

  // One-time legacy (Tauri) data import — must run before the daemon creates
  // its own database in the same home.
  const homeDir = daemonHome();
  await maybeMigrateLegacyData(homeDir, {
    prompt: async (candidate) => {
      const { response } = await dialog.showMessageBox({
        type: "question",
        title: "vYtDL",
        message: "Detected data from the legacy vYtDL Desktop app",
        detail:
          "Downloads history and settings can be imported once into the new version.\n" +
          `Legacy data: ${candidate.legacyDbPath}\n\n` +
          "Interface preferences are not portable and will start fresh.",
        buttons: ["Import", "Skip"],
        defaultId: 0,
        cancelId: 1,
      });
      return response === 0 ? "import" : "skip";
    },
    reportError: (title, detail) => dialog.showErrorBox(title, detail),
  });

  daemon = await startDaemon({
    staticDir: staticDirResolved ?? undefined,
    homeDir,
    devDaemonUrl: devDaemonUrl || undefined,
    binPath: process.env.VYTDL_DAEMON_BIN || undefined,
  });

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    title: "vYtDL",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // External links open in the user's browser, never in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  await mainWindow.loadURL(daemon.url);
}

function quitDaemon(): void {
  stopDaemon(daemon);
  daemon = null;
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function setupAutoUpdater(): void {
  // Auto-update only in packaged builds; updates publish via GitHub Releases
  // (see docs/release-runbook.md). Development builds skip this entirely.
  if (!app.isPackaged) return;
  try {
    autoUpdater.autoDownload = true;
    autoUpdater.on("update-downloaded", () => {
      void dialog
        .showMessageBox({
          type: "info",
          title: "vYtDL",
          message: "Update ready to install",
          detail: "Restart the app to apply the update.",
          buttons: ["Restart", "Later"],
          defaultId: 0,
        })
        .then(({ response }) => {
          if (response === 0) autoUpdater.quitAndInstall();
        });
    });
    autoUpdater.on("error", (err) => {
      console.warn("[updater]", err.message);
    });
    void autoUpdater.checkForUpdatesAndNotify();
  } catch (err) {
    console.warn("[updater] setup failed:", err);
  }
}

app.whenReady().then(() => {
  setupAutoUpdater();
  createWindow().catch((err) => {
    dialog.showErrorBox(
      "vYtDL failed to start",
      `The background service could not start.\n\n${err instanceof Error ? err.message : String(err)}\n\nDaemon binary expected at: ${resolveDaemonBin() ?? "<bundled resource>"} `,
    );
    app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  quitDaemon();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", quitDaemon);

// ── Preload bridge handlers ──────────────────────────────────────────────────
// Each handler returns the same {success, data, error} envelope the web API
// uses so the frontend can treat bridge and HTTP uniformly.

type Envelope<T> = { success: true; data: T } | { success: false; error: string };

function envelope<T>(fn: () => T): Envelope<T> {
  try {
    return { success: true, data: fn() };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

ipcMain.handle("vytdl:get-platform", () => {
  return process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux";
});

ipcMain.handle("vytdl:get-versions", () => ({
  app: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
}));

ipcMain.handle("vytdl:reveal-folder", (_e, p: string) =>
  envelope(() => {
    shell.showItemInFolder(p);
    return null;
  }),
);

ipcMain.handle("vytdl:open-folder", async (_e, p: string) => {
  try {
    const err = await shell.openPath(p);
    if (err) throw new Error(err);
    return { success: true, data: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("vytdl:pick-folder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return { success: true, data: null };
  return { success: true, data: result.filePaths[0] };
});

ipcMain.handle("vytdl:clipboard-write", (_e, text: string) =>
  envelope(() => {
    clipboard.writeText(text);
    return null;
  }),
);

ipcMain.handle("vytdl:detect-terminals", () => envelope(() => detectTerminals()));
ipcMain.handle("vytdl:list-agent-providers", () => envelope(() => listAgentProviders()));
ipcMain.handle("vytdl:detect-agent-clis", () => envelope(() => detectAgentClis()));
ipcMain.handle("vytdl:launch-agent-terminal", (_e, req: { request: LaunchAgentTerminalRequest }) =>
  envelope(() => launchAgentTerminal(req.request)),
);
