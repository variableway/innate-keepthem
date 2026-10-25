import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import {
  findMigrationCandidate,
  legacyAppDataDir,
  maybeMigrateLegacyData,
} from "../src/main/migration";

function tmpHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `vytdl-mig-${randomUUID().slice(0, 8)}`));
}

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("legacyAppDataDir", () => {
  it("maps per-platform legacy userData paths", () => {
    expect(legacyAppDataDir("/home/u", "darwin").replace(/\\/g, "/")).toBe(
      "/home/u/Library/Application Support/com.vytdl.desktop",
    );
    expect(legacyAppDataDir("/home/u", "linux").replace(/\\/g, "/")).toBe(
      "/home/u/.config/com.vytdl.desktop",
    );
  });
});

describe("findMigrationCandidate", () => {
  it("detects a legacy db when the new home is empty", () => {
    const home = tmpHome(); dirs.push(home);
    const legacyRoot = path.join(home, "legacy");
    const legacyData = path.join(legacyRoot, "Library", "Application Support", "com.vytdl.desktop");
    fs.mkdirSync(legacyData, { recursive: true });
    fs.writeFileSync(path.join(legacyData, "vytdl.db"), "sqlite");

    const target = path.join(home, "vytdl-home");
    fs.mkdirSync(target, { recursive: true });
    const c = findMigrationCandidate(target, "darwin", legacyRoot);
    expect(c?.legacyDbPath).toContain("com.vytdl.desktop");
    expect(c?.targetDbPath).toBe(path.join(target, "vytdl.db"));
  });

  it("returns null when the new home already has a database", () => {
    const home = tmpHome(); dirs.push(home);
    const legacyData = path.join(home, "legacy", "com.vytdl.desktop");
    fs.mkdirSync(legacyData, { recursive: true });
    fs.writeFileSync(path.join(legacyData, "vytdl.db"), "sqlite");
    const target = path.join(home, "vytdl-home");
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "vytdl.db"), "existing");
    expect(findMigrationCandidate(target, "darwin", home)).toBeNull();
  });

  it("returns null without any legacy data", () => {
    const home = tmpHome(); dirs.push(home);
    const target = path.join(home, "vytdl-home");
    fs.mkdirSync(target, { recursive: true });
    expect(findMigrationCandidate(target, "darwin", home)).toBeNull();
  });
});

describe("maybeMigrateLegacyData", () => {
  function setupLegacy(home: string): void {
    const legacyData = legacyAppDataDir(home, "darwin");
    fs.mkdirSync(legacyData, { recursive: true });
    fs.writeFileSync(path.join(legacyData, "vytdl.db"), "legacy-db-bytes");
  }

  it("imports the db on accept and records the marker", async () => {
    const home = tmpHome(); dirs.push(home);
    setupLegacy(home);
    const target = path.join(home, "vytdl-home");
    fs.mkdirSync(target, { recursive: true });

    const decision = await maybeMigrateLegacyData(
      target,
      { prompt: async () => "import", reportError: () => {} },
      "darwin",
      home,
    );
    expect(decision).toBe("imported");
    expect(fs.readFileSync(path.join(target, "vytdl.db"), "utf-8")).toBe("legacy-db-bytes");
    expect(fs.existsSync(path.join(target, ".tauri-import"))).toBe(true);

    // second launch: no-op
    const again = await maybeMigrateLegacyData(
      target,
      { prompt: async () => { throw new Error("should not prompt"); }, reportError: () => {} },
      "darwin",
    );
    expect(again).toBe("skipped");
  });

  it("records the skip decision without copying", async () => {
    const home = tmpHome(); dirs.push(home);
    setupLegacy(home);
    const target = path.join(home, "vytdl-home");
    fs.mkdirSync(target, { recursive: true });

    const decision = await maybeMigrateLegacyData(
      target,
      { prompt: async () => "skip", reportError: () => {} },
      "darwin",
      home,
    );
    expect(decision).toBe("skipped");
    expect(fs.existsSync(path.join(target, "vytdl.db"))).toBe(false);
  });

  it("reports copy failures and never blocks startup", async () => {
    const home = tmpHome(); dirs.push(home);
    setupLegacy(home);
    const target = path.join(home, "vytdl-home");
    fs.mkdirSync(target, { recursive: true });
    // target dir read-only → copyFileSync fails after the candidate check
    fs.chmodSync(target, 0o555);

    const decision = await maybeMigrateLegacyData(
      target,
      { prompt: async () => "import", reportError: () => {} },
      "darwin",
      home,
    );
    fs.chmodSync(target, 0o755);
    expect(decision).toBe("skipped");
    expect(fs.existsSync(path.join(target, "vytdl.db"))).toBe(false);
  });
});
