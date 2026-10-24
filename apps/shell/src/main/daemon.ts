// Daemon lifecycle: resolve the bundled `vytdl` binary, spawn it on a random
// loopback port serving the packaged web frontend, and poll /api/health.

import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as net from "node:net";
import * as path from "node:path";

export interface DaemonOptions {
  /** bundled binary; resolved automatically when omitted */
  binPath?: string;
  /** static frontend dir served by the daemon */
  staticDir?: string;
  /** daemon data root (vytdl.db lives here) */
  homeDir: string;
  devDaemonUrl?: string;
}

export interface DaemonHandle {
  url: string;
  child: ChildProcess | null;
}

function platformTriple(): string {
  const arch = process.arch === "arm64" ? "arm64" : "amd64";
  switch (process.platform) {
    case "darwin":
      return `darwin-${arch}`;
    case "win32":
      return `windows-${arch}`;
    default:
      return `linux-${arch}`;
  }
}

/** Locate the daemon binary: packaged resource → dev override → PATH. */
export function resolveDaemonBin(resourcesPath?: string): string | null {
  const name = process.platform === "win32" ? "vytdl.exe" : "vytdl";
  const candidates: string[] = [];
  if (resourcesPath) {
    candidates.push(path.join(resourcesPath, "daemon", `vytdl-${platformTriple()}`, name));
    candidates.push(path.join(resourcesPath, "daemon", name));
  }
  candidates.push(path.join(process.cwd(), "resources", "daemon", name));
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isFile()) return c;
    } catch {
      // keep looking
    }
  }
  return null;
}

/** Poll GET /api/health until the daemon answers (or timeout). */
export function waitForHealth(baseUrl: string, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (Date.now() > deadline) {
        reject(new Error(`daemon health check timed out (${baseUrl})`));
        return;
      }
      const req = http.get(`${baseUrl}/api/health`, { timeout: 2000 }, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve();
        } else {
          setTimeout(attempt, 300);
        }
      });
      req.on("error", () => setTimeout(attempt, 300));
      req.on("timeout", () => {
        req.destroy();
        setTimeout(attempt, 300);
      });
    };
    attempt();
  });
}

/** Parse "vYtDL daemon 1.0.0 listening on http://127.0.0.1:PORT" from stdout. */
export function parseListenAddr(line: string): string | null {
  const m = line.match(/listening on (https?:\/\/\S+)/);
  return m ? m[1] : null;
}

/** Ensure a free random port is available (informational; the daemon binds it). */
export function randomFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const { port } = addr;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("no port")));
      }
    });
  });
}

export async function startDaemon(opts: DaemonOptions): Promise<DaemonHandle> {
  // Dev shortcut: reuse an already-running daemon (task daemon:dev).
  if (opts.devDaemonUrl) {
    await waitForHealth(opts.devDaemonUrl, 5000);
    return { url: opts.devDaemonUrl.replace(/\/+$/, ""), child: null };
  }

  const bin = opts.binPath ?? resolveDaemonBin() ?? "vytdl";
  const args = ["serve", "--port", "0", "--host", "127.0.0.1", "--home", opts.homeDir];
  if (opts.staticDir) {
    args.push("--static", opts.staticDir);
  }

  const child = spawn(bin, args, {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  const url = await new Promise<string>((resolve, reject) => {
    let buffer = "";
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      for (const line of buffer.split("\n")) {
        const addr = parseListenAddr(line);
        if (addr) {
          resolve(addr);
          return;
        }
      }
      buffer = buffer.slice(buffer.lastIndexOf("\n") + 1);
    };
    child.stdout?.on("data", onData);
    const timer = setTimeout(() => reject(new Error("daemon did not announce its port in time")), 15000);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`daemon exited immediately (code ${code})`));
    });
    child.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  await waitForHealth(url);
  return { url, child };
}

export function stopDaemon(handle: DaemonHandle | null): void {
  if (handle?.child && handle.child.exitCode === null) {
    handle.child.kill(process.platform === "win32" ? "SIGTERM" : "SIGTERM");
    // Force-kill after a grace period if it ignores SIGTERM.
    const child = handle.child;
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }, 5000);
    timer.unref();
  }
}
