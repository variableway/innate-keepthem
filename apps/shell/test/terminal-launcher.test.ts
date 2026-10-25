import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import {
  buildUnixScript,
  claudeCodeEnv,
  listAgentProviders,
  sessionsRoot,
  shellQuote,
  terminalLaunchCommand,
  writeCodexHome,
  type AgentProviderInfo,
  type AgentTerminalInfo,
  type LaunchAgentTerminalRequest,
} from "../src/main/terminal-launcher";
import { parseListenAddr } from "../src/main/daemon";

const glmClaude: AgentProviderInfo = {
  id: "glm",
  label: "智谱 GLM",
  agent_cli: "claude-code",
  requires_api_key: true,
  api_key_setting: "agent_glm_api_key",
  models: [{ id: "glm-5.3", label: "glm-5.3" }],
  regions: [{ id: "default", label: "默认", base_url: "https://open.bigmodel.cn/api/anthropic" }],
  hint: null,
};

describe("provider catalog", () => {
  const providers = listAgentProviders();

  it("covers kimi, claude-code and codex agents", () => {
    expect(providers.some((p) => p.agent_cli === "kimi")).toBe(true);
    expect(providers.some((p) => p.agent_cli === "claude-code" && p.id === "glm")).toBe(true);
    expect(providers.some((p) => p.agent_cli === "codex" && p.id === "minimax")).toBe(true);
  });

  it("kimi is direct-open (no key, single fixed model)", () => {
    const kimi = providers.find((p) => p.agent_cli === "kimi")!;
    expect(kimi.requires_api_key).toBe(false);
    expect(kimi.models).toHaveLength(1);
  });

  it("third-party providers carry an api key setting", () => {
    for (const p of providers.filter((p) => p.requires_api_key)) {
      expect(p.api_key_setting).toMatch(/^agent_/);
    }
  });
});

describe("shellQuote", () => {
  it("escapes single quotes the POSIX way", () => {
    expect(shellQuote("sk-test'123")).toBe("'sk-test'\\''123'");
  });
});

describe("claudeCodeEnv", () => {
  it("injects base url, token and all model slots", () => {
    const env = Object.fromEntries(claudeCodeEnv("https://x.example", "sk-1", "glm-5.3"));
    expect(env["ANTHROPIC_BASE_URL"]).toBe("https://x.example");
    expect(env["ANTHROPIC_AUTH_TOKEN"]).toBe("sk-1");
    expect(env["ANTHROPIC_MODEL"]).toBe("glm-5.3");
    expect(env["ANTHROPIC_DEFAULT_OPUS_MODEL"]).toBe("glm-5.3");
  });

  it("adds the 1M compact window for [1m] models", () => {
    const env = Object.fromEntries(claudeCodeEnv("u", "k", "MiniMax-M3[1m]"));
    expect(env["CLAUDE_CODE_AUTO_COMPACT_WINDOW"]).toBe("1000000");
  });
});

describe("buildUnixScript", () => {
  const req: LaunchAgentTerminalRequest = {
    terminal_id: "ghostty",
    agent_cli: "claude-code",
    provider_id: "glm",
    region: null,
    model: "glm-5.3",
    api_key: "sk-test'123",
    workdir: "/tmp/dir with space",
    cli_bin: null,
  };

  it("quotes env values and falls back to an interactive shell", () => {
    const script = buildUnixScript(req, glmClaude, glmClaude.regions[0].base_url, null);
    expect(script).toContain("export ANTHROPIC_BASE_URL='https://open.bigmodel.cn/api/anthropic'");
    expect(script).toContain("'\\''"); // single quote escaped
    expect(script).toContain("exec claude");
    expect(script).toContain('exec "$SHELL" -l');
  });

  it("bootstraps PATH for GUI terminals", () => {
    const script = buildUnixScript(req, glmClaude, null, null);
    expect(script).toContain("/opt/homebrew/bin");
  });

  it("runs the explicit cli_bin when PATH lookup fails", () => {
    const script = buildUnixScript({ ...req, cli_bin: "/opt/bin/claude" }, glmClaude, null, null);
    expect(script).toContain("exec '/opt/bin/claude'");
  });

  it("injects CODEX_HOME for codex sessions", () => {
    const script = buildUnixScript(
      { ...req, agent_cli: "codex", provider_id: "glm", cli_bin: null },
      glmClaude,
      null,
      "/sessions/abc/codex-home",
    );
    expect(script).toContain("export CODEX_HOME='/sessions/abc/codex-home'");
    expect(script).toContain("exec codex");
  });
});

describe("writeCodexHome", () => {
  it("writes a session-scoped config.toml with the responses wire api", () => {
    const dir = path.join(os.tmpdir(), `vytdl-test-${randomUUID()}`);
    const home = writeCodexHome(dir, glmClaude, "https://open.bigmodel.cn/api/v1", "sk-key", "glm-5.3");
    const config = fs.readFileSync(path.join(home, "config.toml"), "utf-8");
    expect(config).toContain('model = "glm-5.3"');
    expect(config).toContain('wire_api = "responses"');
    expect(config).toContain('experimental_bearer_token = "sk-key"');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("terminalLaunchCommand", () => {
  const term = (id: string, detail: string | null): AgentTerminalInfo => ({
    id,
    label: id,
    platform: "macos",
    found: true,
    detail,
  });

  it.runIf(process.platform === "darwin")("opens Ghostty via open -na on macOS", () => {
    const { file, args } = terminalLaunchCommand(term("ghostty", "/Applications/Ghostty.app"), "/s/l.sh");
    expect(file).toBe("/usr/bin/open");
    expect(args).toEqual(["-na", "Ghostty", "--args", "-e", "/s/l.sh"]);
  });

  it.runIf(process.platform !== "darwin")("opens Ghostty directly elsewhere", () => {
    const { file, args } = terminalLaunchCommand(term("ghostty", "/usr/bin/ghostty"), "/s/l.sh");
    expect(file).toBe("/usr/bin/ghostty");
    expect(args).toEqual(["-e", "/s/l.sh"]);
  });

  it.runIf(process.platform === "darwin")("uses osascript for Terminal.app with escaped script path", () => {
    const { file, args } = terminalLaunchCommand(term("terminal", null), "/tmp/a\"b.sh");
    expect(file).toBe("/usr/bin/osascript");
    expect(args[1]).toContain('\\"');
  });

  it("rejects unknown terminals", () => {
    expect(() => terminalLaunchCommand(term("hyper", null), "/s.sh")).toThrow(/Unknown terminal/);
  });
});

describe("daemon helpers", () => {
  it("parses the listen banner", () => {
    expect(parseListenAddr("vYtDL daemon 1.0.0 listening on http://127.0.0.1:54321")).toBe(
      "http://127.0.0.1:54321",
    );
    expect(parseListenAddr("nothing here")).toBeNull();
  });

  it("sessions root lives under ~/.vytdl/agent-sessions", () => {
    expect(sessionsRoot("/home/x").replace(/\\/g, "/")).toBe("/home/x/.vytdl/agent-sessions");
  });
});
