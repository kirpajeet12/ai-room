import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Built-in adapters, chat-only by default: no tools, no MCP servers, sandboxed,
// and no session files left behind in each CLI's history. `cmd` is an argv
// array (never a shell string, so prompts can't be injected into a shell).
// Tokens: {prompt} is replaced with the outgoing prompt, {outfile} with a temp
// file the CLI should write its final message to (for CLIs whose stdout is
// noisy).
const AGY_DENY_ALL = JSON.stringify({
  trustedWorkspaces: [],
  permissions: { deny: ["command(*)", "mcp(*)", "browser(*)"] },
});

export const DEFAULT_AGENTS = [
  {
    name: "claude",
    label: "Claude",
    color: "35", // magenta
    bin: "claude",
    cmd: [
      "claude", "-p", "{prompt}",
      "--tools", "",
      "--strict-mcp-config",
      "--disable-slash-commands",
      "--no-session-persistence",
    ],
    out: "stdout",
  },
  {
    name: "codex",
    label: "Codex",
    color: "36", // cyan
    bin: "codex",
    cmd: [
      "codex", "exec",
      "--ignore-user-config",
      "--ignore-rules",
      "--sandbox", "read-only",
      "--disable", "shell_tool",
      "--disable", "unified_exec",
      "--disable", "browser_use",
      "--disable", "in_app_browser",
      "--disable", "apps",
      "--ephemeral",
      "--skip-git-repo-check",
      "--output-last-message", "{outfile}",
      "{prompt}",
    ],
    out: "file",
  },
  {
    name: "gemini",
    label: "Gemini",
    color: "33", // yellow
    bin: "agy",
    cmd: [
      "agy",
      "--sandbox",
      "--disable-slash-commands",
      "--settings", AGY_DENY_ALL,
      "-p", "{prompt}",
    ],
    out: "stdout",
  },
  {
    name: "ollama",
    label: "Ollama",
    color: "32", // green
    bin: "ollama",
    cmd: ["ollama", "run", "llama3.2", "{prompt}"],
    out: "stdout",
  },
];

// Common install locations that are often missing from a non-login shell's
// PATH. Appending them makes `npx ai-room` find CLIs the user can run
// interactively.
export function augmentedPath() {
  const home = homedir();
  const extra = [
    join(home, ".local", "bin"),
    join(home, ".npm-global", "bin"),
    join(home, ".kimi-code", "bin"),
    join(home, ".grok", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ];
  const current = process.env.PATH || "";
  const parts = current.split(":");
  for (const dir of extra) if (!parts.includes(dir)) parts.push(dir);
  return parts.join(":");
}

function binaryExists(bin, pathEnv) {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [bin], {
      env: { ...process.env, PATH: pathEnv },
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

// User config at ~/.config/ai-room/config.json can add agents or override
// built-ins (matched by name). Shape: { "agents": [{ name, label, color,
// bin, cmd, out }] }
export function loadConfig() {
  const pathEnv = augmentedPath();
  const configPath = join(homedir(), ".config", "ai-room", "config.json");
  let userAgents = [];
  if (existsSync(configPath)) {
    try {
      const parsed = JSON.parse(readFileSync(configPath, "utf8"));
      if (Array.isArray(parsed.agents)) userAgents = parsed.agents;
    } catch (err) {
      console.error(`ai-room: ignoring invalid config at ${configPath}: ${err.message}`);
    }
  }

  const merged = new Map(DEFAULT_AGENTS.map((a) => [a.name, a]));
  for (const agent of userAgents) {
    if (!agent?.name || !Array.isArray(agent.cmd)) continue;
    merged.set(agent.name, { out: "stdout", color: "37", label: agent.name, bin: agent.cmd[0], ...agent });
  }

  const available = [];
  const missing = [];
  for (const agent of merged.values()) {
    (binaryExists(agent.bin, pathEnv) ? available : missing).push(agent);
  }
  return { available, missing, pathEnv, configPath };
}
