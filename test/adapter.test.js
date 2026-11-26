import { test } from "node:test";
import assert from "node:assert/strict";
import { askAgent, explainFailure } from "../src/adapter.js";
import { DEFAULT_AGENTS } from "../src/config.js";

const SECRET_PROMPT = "PROMPT-CONTENT-THAT-MUST-NOT-LEAK previous chat history";

function nodeAgent(script) {
  return { name: "fake", label: "Fake", bin: "codex", out: "stdout", cmd: [process.execPath, "-e", script, "{prompt}"] };
}

async function failureOf(agent) {
  try {
    await askAgent(agent, SECRET_PROMPT, process.env.PATH);
  } catch (err) {
    return err.message;
  }
  assert.fail("expected the agent to fail");
}

test("not signed in: shows the CLI's own reason plus a hint, never the prompt", async () => {
  const msg = await failureOf(
    nodeAgent("console.error('Loading...'); console.error('Error: Not logged in. Run `codex login`.'); process.exit(1)"),
  );
  assert.match(msg, /Not logged in/);
  assert.match(msg, /sign in by running `codex`/);
  assert.doesNotMatch(msg, /PROMPT-CONTENT/);
  assert.doesNotMatch(msg, /Command failed/);
});

test("missing program gives a plain explanation", async () => {
  const msg = await failureOf({ name: "gone", label: "Gone", out: "stdout", cmd: ["ai-room-not-installed-xyz", "{prompt}"] });
  assert.equal(msg, "ai-room-not-installed-xyz is not installed or not on your PATH");
});

test("failure with no stderr reports the exit code, not the prompt", async () => {
  const msg = await failureOf(nodeAgent("process.exit(7)"));
  assert.equal(msg, "exited with code 7");
});

test("ollama not running gets a start hint", () => {
  const msg = explainFailure({ code: 1 }, "Error: could not connect to ollama app, is it running?", "/opt/homebrew/bin/ollama");
  assert.match(msg, /start the Ollama app/);
});

test("failure reasons are stripped of control codes and length-capped", () => {
  const msg = explainFailure({ code: 1 }, `\x1b]52;c;AAAA\x07Error: ${"x".repeat(1000)}`, "claude");
  assert.doesNotMatch(msg, /\x1b/);
  assert.ok(msg.length <= 300);
});

test("a literal {outfile} typed in a message is not replaced with a temp path", async () => {
  const echo = { name: "echo", label: "Echo", out: "stdout", cmd: [process.execPath, "-e", "process.stdout.write(process.argv[1])", "{prompt}"] };
  assert.equal(await askAgent(echo, "see {outfile} here", process.env.PATH), "see {outfile} here");
});

test("built-in cloud agents run chat-only and leave no session files", () => {
  const cmd = (name) => DEFAULT_AGENTS.find((a) => a.name === name).cmd;

  const claude = cmd("claude");
  assert.equal(claude[claude.indexOf("--tools") + 1], "");
  for (const flag of ["--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence"]) {
    assert.ok(claude.includes(flag), `claude missing ${flag}`);
  }

  const codex = cmd("codex");
  for (const flag of ["--ignore-user-config", "--ignore-rules", "--ephemeral"]) {
    assert.ok(codex.includes(flag), `codex missing ${flag}`);
  }
  assert.equal(codex[codex.indexOf("--sandbox") + 1], "read-only");
  for (const feature of ["shell_tool", "unified_exec", "browser_use", "in_app_browser", "apps"]) {
    assert.ok(codex.some((part, i) => part === feature && codex[i - 1] === "--disable"), `codex must disable ${feature}`);
  }

  const agy = cmd("gemini");
  const settings = JSON.parse(agy[agy.indexOf("--settings") + 1]);
  assert.deepEqual(settings.trustedWorkspaces, []);
  assert.ok(settings.permissions.deny.includes("command(*)"));
  assert.ok(agy.includes("--sandbox"));

  for (const agent of DEFAULT_AGENTS) {
    assert.ok(!agent.cmd.some((p) => /dangerously|bypass|full-access|yolo/i.test(p)), `${agent.name} has an unsafe flag`);
  }
});
