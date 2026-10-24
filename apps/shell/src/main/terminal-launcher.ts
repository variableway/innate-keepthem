// AI agent terminal launcher — port of src-tauri/src/terminal_launcher.rs.
//
// Opens the user's local terminal emulator (Ghostty, iTerm2, Terminal.app, …)
// running an AI coding agent CLI (`claude`, `codex`, `kimi`) with the selected
// LLM provider/model injected as environment variables.
//
// Strategy: instead of passing env vars through the terminal launcher (which
// `open`/`osascript` cannot do reliably), we generate a small launch script
// that contains the exports, and tell the terminal to run that script.

import { execFileSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

// ───────────────────────────── Types ─────────────────────────────

export interface AgentTerminalInfo {
  id: string;
  label: string;
  platform: string;
  found: boolean;
  detail: string | null;
}

export interface AgentModelInfo {
  id: string;
  label: string;
}

export interface ProviderRegion {
  id: string;
  label: string;
  base_url: string;
}

export interface AgentProviderInfo {
  id: string;
  label: string;
  /** "kimi" | "claude-code" | "codex" */
  agent_cli: string;
  requires_api_key: boolean;
  /** settings key used to persist the API key for this provider */
  api_key_setting: string | null;
  /** model ids are injected verbatim; empty = use the CLI's own default */
  models: AgentModelInfo[];
  regions: ProviderRegion[];
  hint: string | null;
}

export interface AgentCliToolInfo {
  id: string;
  label: string;
  /** the command name the launch script should exec */
  command: string;
  found: boolean;
  path: string | null;
  source: string;
}

export interface LaunchAgentTerminalRequest {
  terminal_id: string;
  /** "kimi" | "claude-code" | "codex" */
  agent_cli: string;
  provider_id: string;
  region?: string | null;
  model?: string | null;
  api_key?: string | null;
  workdir?: string | null;
  /** explicit CLI binary resolved by the frontend (detection result) */
  cli_bin?: string | null;
}

export interface LaunchAgentTerminalResult {
  terminal_label: string;
  script_path: string;
  command_line: string;
  env_summary: string[];
}

// ───────────────────────────── Terminal detection ─────────────────────────────

const IS_MACOS = process.platform === "darwin";
const IS_WINDOWS = process.platform === "win32";
const PLATFORM = process.platform === "darwin" ? "macos" : IS_WINDOWS ? "windows" : "linux";

/** Extra dirs scanned beyond PATH (GUI apps launch with a minimal PATH). */
export function extraBinDirs(): string[] {
  const dirs: string[] = [];
  if (os.homedir()) {
    dirs.push(path.join(os.homedir(), ".local", "bin"));
    dirs.push(path.join(os.homedir(), ".npm-global", "bin"));
    dirs.push(path.join(os.homedir(), ".cargo", "bin"));
    dirs.push(path.join(os.homedir(), ".bun", "bin"));
  }
  dirs.push("/opt/homebrew/bin");
  dirs.push("/usr/local/bin");
  return dirs;
}

function windowsExecutableName(name: string): string | null {
  if (IS_WINDOWS && !name.endsWith(".exe")) return name + ".exe";
  return null;
}

export function findInPath(name: string, pathVar?: string): string | null {
  const search = (dir: string): string | null => {
    if (!dir) return null;
    const nameExt = windowsExecutableName(name);
    if (nameExt) {
      const alt = path.join(dir, nameExt);
      if (isFile(alt)) return alt;
    }
    const candidate = path.join(dir, name);
    return isFile(candidate) ? candidate : null;
  };

  for (const dir of (pathVar ?? process.env.PATH ?? "").split(path.delimiter)) {
    const hit = search(dir);
    if (hit) return hit;
  }
  for (const dir of extraBinDirs()) {
    const hit = search(dir);
    if (hit) return hit;
  }
  return null;
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function macosAppBundle(appName: string): string | null {
  if (!IS_MACOS) return null;
  for (const root of ["/Applications", path.join(os.homedir(), "Applications")]) {
    const app = path.join(root, `${appName}.app`);
    if (isDir(app)) return app;
  }
  return null;
}

function macosAppBinary(appName: string, binary: string): string | null {
  const bundle = macosAppBundle(appName);
  if (!bundle) return null;
  const bin = path.join(bundle, "Contents", "MacOS", binary);
  return isFile(bin) ? bin : null;
}

function terminalEntry(id: string, label: string, detail: string | null, found: boolean): AgentTerminalInfo {
  return { id, label, platform: PLATFORM, found, detail };
}

/** Detect terminals available on this machine, ordered by preference. */
export function detectTerminals(): AgentTerminalInfo[] {
  const out: AgentTerminalInfo[] = [];

  if (IS_MACOS) {
    const ghostty = macosAppBundle("Ghostty");
    out.push(terminalEntry("ghostty", "Ghostty", ghostty, ghostty !== null));
    const iterm = macosAppBundle("iTerm");
    out.push(terminalEntry("iterm", "iTerm 2", iterm, iterm !== null));
    out.push(terminalEntry("terminal", "Terminal.app", null, true));
    const alacritty = macosAppBinary("Alacritty", "alacritty") ?? findInPath("alacritty");
    out.push(terminalEntry("alacritty", "Alacritty", alacritty, alacritty !== null));
    const kitty = findInPath("kitty");
    out.push(terminalEntry("kitty", "kitty", kitty, kitty !== null));
    const wezterm = findInPath("wezterm");
    out.push(terminalEntry("wezterm", "WezTerm", wezterm, wezterm !== null));
  } else if (IS_WINDOWS) {
    const wt = findInPath("wt.exe") ?? findInPath("wt");
    out.push(terminalEntry("wt", "Windows Terminal", wt, true));
    out.push(terminalEntry("cmd", "Command Prompt", null, true));
  } else {
    const ghostty = findInPath("ghostty");
    out.push(terminalEntry("ghostty", "Ghostty", ghostty, ghostty !== null));
    const gnome = findInPath("gnome-terminal");
    out.push(terminalEntry("gnome-terminal", "GNOME Terminal", gnome, gnome !== null));
    const konsole = findInPath("konsole");
    out.push(terminalEntry("konsole", "Konsole", konsole, konsole !== null));
    const kitty = findInPath("kitty");
    out.push(terminalEntry("kitty", "kitty", kitty, kitty !== null));
    const alacritty = findInPath("alacritty");
    out.push(terminalEntry("alacritty", "Alacritty", alacritty, alacritty !== null));
    const wezterm = findInPath("wezterm");
    out.push(terminalEntry("wezterm", "WezTerm", wezterm, wezterm !== null));
  }

  return out;
}

// ───────────────────────────── Provider catalog ─────────────────────────────

function model(id: string, label: string): AgentModelInfo {
  return { id, label };
}

function region(id: string, label: string, base_url: string): ProviderRegion {
  return { id, label, base_url };
}

/** Catalog of launchable agent + LLM provider combinations. */
export function listAgentProviders(): AgentProviderInfo[] {
  const out: AgentProviderInfo[] = [];

  // ── Kimi: single fixed model, opens directly with its own login ──
  out.push({
    id: "moonshot-kimi",
    label: "Kimi (Moonshot 官方)",
    agent_cli: "kimi",
    requires_api_key: false,
    api_key_setting: null,
    models: [model("kimi-for-coding", "kimi-for-coding（固定）")],
    regions: [],
    hint: "Kimi CLI 使用自身登录态（kimi 登录后即可使用），无需注入 API Key。",
  });

  // ── Claude Code ──
  out.push({
    id: "anthropic",
    label: "Anthropic 官方",
    agent_cli: "claude-code",
    requires_api_key: false,
    api_key_setting: null,
    models: [],
    regions: [],
    hint: "使用 Anthropic 账号订阅；首次启动后在 CLI 内执行 /login 登录。",
  });
  out.push({
    id: "glm",
    label: "智谱 GLM",
    agent_cli: "claude-code",
    requires_api_key: true,
    api_key_setting: "agent_glm_api_key",
    models: [
      model("glm-5.3", "glm-5.3（旗舰）"),
      model("glm-5.3-flash", "glm-5.3-flash（快速）"),
      model("glm-5.3[1m]", "glm-5.3[1m]（1M 上下文）"),
      model("glm-4.6", "glm-4.6（兼容）"),
    ],
    regions: [region("default", "默认", "https://open.bigmodel.cn/api/anthropic")],
    hint: "API Key 来自 open.bigmodel.cn 的 GLM Coding Plan。",
  });
  out.push({
    id: "minimax",
    label: "MiniMax",
    agent_cli: "claude-code",
    requires_api_key: true,
    api_key_setting: "agent_minimax_api_key",
    models: [
      model("MiniMax-M3", "MiniMax-M3"),
      model("MiniMax-M3[1m]", "MiniMax-M3[1m]（1M 上下文）"),
      model("MiniMax-M2.1", "MiniMax-M2.1（兼容）"),
    ],
    regions: [
      region("china", "中国区", "https://api.minimax.cn/anthropic"),
      region("global", "国际区", "https://api.minimax.io/anthropic"),
    ],
    hint: "API Key 来自 MiniMax 开放平台 Token 管理页。",
  });

  // ── Codex ──
  out.push({
    id: "openai",
    label: "OpenAI 官方",
    agent_cli: "codex",
    requires_api_key: false,
    api_key_setting: null,
    models: [],
    regions: [],
    hint: "使用 ChatGPT 账号登录（codex 内 login），无需注入 API Key。",
  });
  out.push({
    id: "glm",
    label: "智谱 GLM",
    agent_cli: "codex",
    requires_api_key: true,
    api_key_setting: "agent_glm_api_key",
    models: [
      model("glm-5.3", "glm-5.3（旗舰）"),
      model("glm-5-turbo", "glm-5-turbo（Agent 优化）"),
      model("glm-4.6", "glm-4.6（兼容）"),
    ],
    regions: [region("default", "默认", "https://open.bigmodel.cn/api/v1")],
    hint: "使用 GLM Coding Plan 的 OpenAI Responses 协议端点。",
  });
  out.push({
    id: "minimax",
    label: "MiniMax",
    agent_cli: "codex",
    requires_api_key: true,
    api_key_setting: "agent_minimax_api_key",
    models: [
      model("MiniMax-M3", "MiniMax-M3"),
      model("MiniMax-M2.1", "MiniMax-M2.1（兼容）"),
    ],
    regions: [
      region("china", "中国区", "https://api.minimax.cn/v1"),
      region("global", "国际区", "https://api.minimax.io/v1"),
    ],
    hint: "使用 MiniMax M 系列模型的 Responses 协议端点。",
  });

  return out;
}

// ───────────────────────────── Agent CLI detection ─────────────────────────────

function detectCli(id: string, label: string, command: string, extraDirs: string[]): AgentCliToolInfo {
  for (const dir of extraDirs) {
    const name = windowsExecutableName(command) ?? command;
    const candidate = path.join(dir, name);
    if (isFile(candidate)) {
      return { id, label, command, found: true, path: candidate, source: "local_install" };
    }
  }
  const found = findInPath(command);
  if (found) {
    return { id, label, command, found: true, path: found, source: "path" };
  }
  return { id, label, command, found: false, path: null, source: "not_found" };
}

/** Detect agent CLIs (kimi / claude / codex) visible to the app. */
export function detectAgentClis(): AgentCliToolInfo[] {
  const out: AgentCliToolInfo[] = [];

  const kimiDirs: string[] = [];
  const kimiKnown = path.join(os.homedir(), ".kimi", "bin");
  if (isFile(path.join(kimiKnown, IS_WINDOWS ? "kimi.exe" : "kimi"))) kimiDirs.push(kimiKnown);
  out.push(detectCli("kimi", "Kimi CLI", "kimi", kimiDirs));

  const claudeDirs = [...extraBinDirs(), path.join(os.homedir(), ".claude", "local")];
  out.push(detectCli("claude-code", "Claude Code", "claude", claudeDirs));

  const codexDirs = [...extraBinDirs(), path.join(os.homedir(), ".codex", "bin")];
  out.push(detectCli("codex", "Codex CLI", "codex", codexDirs));

  return out;
}

// ───────────────────────────── Launch ─────────────────────────────

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function tomlEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function sessionsRoot(homeDir?: string): string {
  return path.join(homeDir ?? os.homedir(), ".vytdl", "agent-sessions");
}

/** env exports injected into the launch script for claude-code compatible providers. */
export function claudeCodeEnv(baseUrl: string, apiKey: string, modelId: string): [string, string][] {
  const env: [string, string][] = [
    ["ANTHROPIC_BASE_URL", baseUrl],
    ["ANTHROPIC_AUTH_TOKEN", apiKey],
    ["ANTHROPIC_MODEL", modelId],
    ["ANTHROPIC_DEFAULT_HAIKU_MODEL", modelId],
    ["ANTHROPIC_DEFAULT_SONNET_MODEL", modelId],
    ["ANTHROPIC_DEFAULT_OPUS_MODEL", modelId],
  ];
  if (modelId.includes("[1m]")) {
    env.push(["CLAUDE_CODE_AUTO_COMPACT_WINDOW", "1000000"]);
  }
  return env;
}

function agentCommand(agentCli: string): string {
  switch (agentCli) {
    case "kimi":
      return "kimi";
    case "codex":
      return "codex";
    default:
      return "claude";
  }
}

function agentLabel(agentCli: string): string {
  switch (agentCli) {
    case "kimi":
      return "Kimi CLI";
    case "codex":
      return "Codex CLI";
    default:
      return "Claude Code";
  }
}

/** Write the generated codex home (config.toml) for third-party providers and
 * return the CODEX_HOME path. */
export function writeCodexHome(
  sessionDir: string,
  provider: AgentProviderInfo,
  baseUrl: string,
  apiKey: string,
  modelId: string,
): string {
  const codexHome = path.join(sessionDir, "codex-home");
  fs.mkdirSync(codexHome, { recursive: true });
  const config = [
    "# Generated by vYtDL Desktop — agent terminal session",
    `model = "${tomlEscape(modelId)}"`,
    'model_provider = "vytdl"',
    "",
    "[model_providers.vytdl]",
    `name = "${tomlEscape(provider.label)}"`,
    `base_url = "${tomlEscape(baseUrl)}"`,
    `experimental_bearer_token = "${tomlEscape(apiKey)}"`,
    'wire_api = "responses"',
    "",
  ].join("\n");
  fs.writeFileSync(path.join(codexHome, "config.toml"), config);
  return codexHome;
}

export function buildUnixScript(
  req: LaunchAgentTerminalRequest,
  provider: AgentProviderInfo,
  baseUrl: string | null,
  codexHome: string | null,
): string {
  const env: [string, string][] = [];
  const modelId = req.model ?? "";

  if (req.agent_cli === "claude-code" && baseUrl !== null) {
    const key = req.api_key ?? "";
    if (key.trim() !== "" && modelId !== "") {
      env.push(...claudeCodeEnv(baseUrl, key, modelId));
    }
  }
  if (codexHome !== null) {
    env.push(["CODEX_HOME", codexHome]);
  }

  const command = agentCommand(req.agent_cli);
  const workdir = req.workdir?.trim() ? req.workdir : os.homedir();

  const lines: string[] = [];
  lines.push("#!/bin/sh");
  lines.push("# Generated by vYtDL Desktop — AI agent terminal launcher");
  lines.push(`# agent: ${req.agent_cli} | provider: ${provider.id} | model: ${modelId}`);
  // GUI-launched terminals often lack the user's shell PATH; bootstrap it so
  // claude/codex/kimi installed via npm/homebrew/cargo resolve correctly.
  lines.push(
    'export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$HOME/.cargo/bin:$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"',
  );
  for (const [key, value] of env) {
    lines.push(`export ${key}=${shellQuote(value)}`);
  }
  lines.push(`cd ${shellQuote(workdir)} 2>/dev/null || cd "$HOME"`);
  lines.push(`echo "vYtDL: launching ${agentLabel(req.agent_cli)} (${provider.label})"`);
  lines.push(`if command -v ${command} >/dev/null 2>&1; then\n  exec ${command}\nfi`);
  const bin = req.cli_bin?.trim();
  if (bin) {
    lines.push(`if [ -x ${shellQuote(bin)} ]; then\n  exec ${shellQuote(bin)}\nfi`);
  }
  lines.push(`echo "vYtDL: '${command}' not found in PATH. Install it or set the binary path in Settings."`);
  lines.push('exec "$SHELL" -l');
  return lines.join("\n") + "\n";
}

export function buildWindowsScript(
  req: LaunchAgentTerminalRequest,
  provider: AgentProviderInfo,
  baseUrl: string | null,
  codexHome: string | null,
): string {
  const modelId = req.model ?? "";
  const env: [string, string][] = [];

  if (req.agent_cli === "claude-code" && baseUrl !== null) {
    const key = req.api_key ?? "";
    if (key.trim() !== "" && modelId !== "") {
      env.push(...claudeCodeEnv(baseUrl, key, modelId));
    }
  }
  if (codexHome !== null) {
    env.push(["CODEX_HOME", codexHome]);
  }

  const command = agentCommand(req.agent_cli);
  const workdir = req.workdir?.trim() ? req.workdir : "%USERPROFILE%";

  const lines: string[] = [];
  lines.push("@echo off");
  lines.push("REM Generated by vYtDL Desktop — AI agent terminal launcher");
  for (const [key, value] of env) {
    lines.push(`set "${key}=${value.replace(/"/g, "")}"`);
  }
  lines.push(`cd /d "${workdir.replace(/"/g, "")}"`);
  lines.push(`echo vYtDL: launching ${agentLabel(req.agent_cli)} (${provider.label})`);
  lines.push(`where ${command} >nul 2>nul`);
  lines.push(
    `if %errorlevel%==0 (\r\n  ${command}\r\n) else (\r\n  echo vYtDL: '${command}' not found in PATH.\r\n)`,
  );
  lines.push("cmd /k");
  return lines.join("\r\n") + "\r\n";
}

function appleScriptEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Build the process argv that opens the chosen terminal running `script`. */
export function terminalLaunchCommand(
  terminal: AgentTerminalInfo,
  scriptPath: string,
): { file: string; args: string[]; line: string } {
  const withBin = (bin: string) => terminal.detail ?? bin;
  switch (terminal.id) {
    case "ghostty":
      if (IS_MACOS) {
        return { file: "/usr/bin/open", args: ["-na", "Ghostty", "--args", "-e", scriptPath], line: `open -na Ghostty --args -e ${scriptPath}` };
      }
      {
        const bin = withBin("ghostty");
        return { file: bin, args: ["-e", scriptPath], line: `${bin} -e ${scriptPath}` };
      }
    case "iterm": {
      const src = `tell application "iTerm" to activate\ntell application "iTerm" to create window with default profile command "${appleScriptEscape(scriptPath)}"`;
      return { file: "/usr/bin/osascript", args: ["-e", src], line: `osascript (iTerm: create window with command ${scriptPath})` };
    }
    case "terminal": {
      const src = `tell application "Terminal" to activate\ntell application "Terminal" to do script "${appleScriptEscape(scriptPath)}"`;
      return { file: "/usr/bin/osascript", args: ["-e", src], line: `osascript (Terminal: do script ${scriptPath})` };
    }
    case "alacritty": {
      const bin = withBin("alacritty");
      return { file: bin, args: ["-e", scriptPath], line: `${bin} -e ${scriptPath}` };
    }
    case "kitty": {
      const bin = withBin("kitty");
      return { file: bin, args: [scriptPath], line: `${bin} ${scriptPath}` };
    }
    case "wezterm": {
      const bin = withBin("wezterm");
      return { file: bin, args: ["start", "--", scriptPath], line: `${bin} start -- ${scriptPath}` };
    }
    case "gnome-terminal":
      return { file: "gnome-terminal", args: ["--", scriptPath], line: `gnome-terminal -- ${scriptPath}` };
    case "konsole":
      return { file: "konsole", args: ["-e", scriptPath], line: `konsole -e ${scriptPath}` };
    case "wt":
      return { file: "cmd", args: ["/c", "start", "", "wt.exe", "cmd", "/k", scriptPath], line: `wt.exe cmd /k ${scriptPath}` };
    case "cmd":
      return { file: "cmd", args: ["/c", "start", "", "cmd", "/k", scriptPath], line: `start cmd /k ${scriptPath}` };
    default:
      throw new Error(`Unknown terminal: ${terminal.id}`);
  }
}

export function spawnDetached(file: string, args: string[]): void {
  const child = spawn(file, args, { detached: true, stdio: "ignore", shell: IS_WINDOWS });
  child.unref();
}

/** Resolve a terminal binary path for non-app terminals without `which`. */
function versionOf(bin: string): string | null {
  try {
    return execFileSync(bin, ["--version"], { timeout: 3000, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim()
      .split("\n")[0];
  } catch {
    return null;
  }
}

export function launchAgentTerminal(req: LaunchAgentTerminalRequest): LaunchAgentTerminalResult {
  // Resolve terminal
  const terminal = detectTerminals().find((t) => t.id === req.terminal_id);
  if (!terminal) throw new Error(`Unknown terminal: ${req.terminal_id}`);
  if (!terminal.found) throw new Error(`Terminal '${terminal.label}' is not installed on this machine`);

  // Resolve provider
  const provider = listAgentProviders().find(
    (p) => p.agent_cli === req.agent_cli && p.id === req.provider_id,
  );
  if (!provider) throw new Error(`Unknown provider '${req.provider_id}' for agent '${req.agent_cli}'`);

  const apiKey = req.api_key ?? "";
  if (provider.requires_api_key && apiKey.trim() === "") {
    throw new Error(`Provider '${provider.label}' requires an API key`);
  }

  // Resolve region → base_url
  let baseUrl: string | null = null;
  if (provider.regions.length > 0) {
    const regionId = req.region ?? provider.regions[0].id;
    const picked = provider.regions.find((r) => r.id === regionId) ?? provider.regions[0];
    baseUrl = picked.base_url;
  }

  // Codex third-party providers run with a session-scoped CODEX_HOME so we
  // never touch the user's own ~/.codex.
  const sessionDir = path.join(sessionsRoot(), randomUUID());
  fs.mkdirSync(sessionDir, { recursive: true });

  const codexHome =
    req.agent_cli === "codex" && baseUrl !== null
      ? writeCodexHome(sessionDir, provider, baseUrl, apiKey, req.model ?? "")
      : null;

  // Write launch script
  let scriptPath: string;
  if (IS_WINDOWS) {
    scriptPath = path.join(sessionDir, "launch.cmd");
    fs.writeFileSync(scriptPath, buildWindowsScript(req, provider, baseUrl, codexHome));
  } else {
    scriptPath = path.join(sessionDir, "launch.sh");
    fs.writeFileSync(scriptPath, buildUnixScript(req, provider, baseUrl, codexHome));
    fs.chmodSync(scriptPath, 0o755);
  }

  // Open the terminal
  const { file, args, line } = terminalLaunchCommand(terminal, scriptPath);
  try {
    spawnDetached(file, args);
  } catch (err) {
    throw new Error(`Failed to open terminal '${terminal.label}': ${String(err)}`);
  }

  // Human-readable env summary (never include the raw API key)
  const envSummary: string[] = [];
  if (baseUrl !== null) envSummary.push(`BASE_URL = ${baseUrl}`);
  if (req.model) envSummary.push(`MODEL = ${req.model}`);
  if (codexHome !== null) envSummary.push("CODEX_HOME = <session dir>");
  if (envSummary.length === 0) envSummary.push("no injection (CLI own auth)");

  return {
    terminal_label: terminal.label,
    script_path: scriptPath,
    command_line: line,
    env_summary: envSummary,
  };
}

// exported for tests / diagnostics
export const _internals = { isFile, versionOf };
