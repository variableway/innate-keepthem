// One-time migration from the legacy Tauri app (com.vytdl.desktop).
//
// The old desktop stored everything in its userData dir: vytdl.db (downloads
// + settings; roadmap Q3 decision: one-time import on first launch). The new
// shell copies that file into the daemon's home before the daemon first
// creates its own database. UI preferences lived in the old WebView's
// localStorage and are not portable (the new frontend keeps its own).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const LEGACY_APP_DIR_NAME = "com.vytdl.desktop";

/** Where the legacy Tauri app kept its data on this platform. */
export function legacyAppDataDir(homeDir: string, platform: NodeJS.Platform): string {
  switch (platform) {
    case "darwin":
      return path.join(homeDir, "Library", "Application Support", LEGACY_APP_DIR_NAME);
    case "win32":
      return path.join(
        process.env.APPDATA ?? path.join(homeDir, "AppData", "Roaming"),
        LEGACY_APP_DIR_NAME,
      );
    default:
      return path.join(homeDir, ".config", LEGACY_APP_DIR_NAME);
  }
}

export interface MigrationCandidate {
  legacyDbPath: string;
  targetDbPath: string;
}

/** A migration is offered when the legacy DB exists and the new home has no DB yet. */
export function findMigrationCandidate(
  homeDir: string,
  platform: NodeJS.Platform = process.platform,
  homeDirOverride?: string,
): MigrationCandidate | null {
  const home = homeDirOverride || safeHomedir();
  const legacyDbPath = path.join(legacyAppDataDir(home, platform), "vytdl.db");
  const targetDbPath = path.join(homeDir, "vytdl.db");
  try {
    if (!fs.existsSync(legacyDbPath)) return null;
    if (fs.existsSync(targetDbPath)) return null;
    return { legacyDbPath, targetDbPath };
  } catch {
    return null;
  }
}

export type MigrationDecision = "imported" | "skipped" | "unavailable";

function safeHomedir(): string {
  try {
    return os.homedir();
  } catch {
    return "";
  }
}

function markerPath(homeDir: string): string {
  return path.join(homeDir, ".tauri-import");
}

function alreadyHandled(homeDir: string): boolean {
  return fs.existsSync(markerPath(homeDir));
}

function markHandled(homeDir: string, decision: MigrationDecision): void {
  try {
    fs.writeFileSync(markerPath(homeDir), `${decision}\n`);
  } catch {
    // marker is best-effort
  }
}

/** The prompt + dialog plumbing lives in main; tests inject a fake. */
export type MigrationPrompt = (
  candidate: MigrationCandidate,
) => Promise<"import" | "skip">;
export type MigrationReporter = (title: string, detail: string) => void;

export interface MigrationDeps {
  prompt: MigrationPrompt;
  reportError: MigrationReporter;
}

/**
 * One-time import flow. Safe to call on every launch: no-ops when there is no
 * candidate or the user already decided (marker file in the daemon home).
 */
export async function maybeMigrateLegacyData(
  homeDir: string,
  deps: MigrationDeps,
  platform: NodeJS.Platform = process.platform,
  legacyHomeOverride?: string,
): Promise<MigrationDecision> {
  if (alreadyHandled(homeDir)) return "skipped";
  const candidate = findMigrationCandidate(homeDir, platform, legacyHomeOverride);
  if (!candidate) {
    // nothing to do — remember so we don't rescan every launch
    markHandled(homeDir, "unavailable");
    return "unavailable";
  }

  let decision: "import" | "skip";
  try {
    decision = await deps.prompt(candidate);
  } catch {
    decision = "skip";
  }
  if (decision === "skip") {
    markHandled(homeDir, "skipped");
    return "skipped";
  }

  try {
    // The daemon has not started yet: the target DB does not exist (guaranteed
    // by the candidate check), so a plain file copy is the whole migration.
    // The daemon home dir is created by the daemon later — create it here.
    fs.mkdirSync(path.dirname(candidate.targetDbPath), { recursive: true });
    fs.copyFileSync(candidate.legacyDbPath, candidate.targetDbPath);
    markHandled(homeDir, "imported");
    return "imported";
  } catch (err) {
    markHandled(homeDir, "skipped");
    deps.reportError(
      "vYtDL",
      `Import failed — continuing without migration.\n\n${err instanceof Error ? err.message : String(err)}`,
    );
    return "skipped";
  }
}
