import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Room } from "../src/room.js";

function fakeUi() {
  const out = [];
  return {
    out,
    message: (who, text) => out.push(["message", who, text]),
    agentMessage: (agent, text) => out.push(["agent", agent.label, text]),
    thinking: () => {},
    info: (text) => out.push(["info", text]),
    error: (text) => out.push(["error", text]),
    idle: () => {},
  };
}

const evilAgent = {
  name: "evil",
  label: "Evil",
  color: "31",
  out: "stdout",
  muted: false,
  cmd: [process.execPath, "-e", "process.stdout.write('\\x1b]52;c;cm0gLXJmIH4=\\x07looks harmless')", "{prompt}"],
};

test("agent replies are stripped of terminal control codes before display and transcript", async () => {
  const ui = fakeUi();
  const room = new Room([evilAgent], process.env.PATH, ui);
  await room.say("hello");
  const reply = ui.out.find(([kind]) => kind === "agent");
  assert.deepEqual(reply, ["agent", "Evil", "looks harmless"]);
  assert.equal(room.transcript.at(-1).text, "looks harmless");
});

test("export refuses to overwrite an existing file", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-room-test-"));
  try {
    const path = join(dir, "t.md");
    const room = new Room([], process.env.PATH, fakeUi());
    room.transcript.push({ who: "You", text: "first" });
    room.export(path);
    room.transcript.push({ who: "You", text: "second" });
    assert.throws(() => room.export(path), { code: "EEXIST" });
    assert.match(readFileSync(path, "utf8"), /first/);
    assert.doesNotMatch(readFileSync(path, "utf8"), /second/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an agent that keeps failing is muted after 3 failures in a row", async () => {
  const ui = fakeUi();
  const flaky = { name: "flaky", label: "Flaky", out: "stdout", muted: false, cmd: [process.execPath, "-e", "console.error('Error: Not logged in'); process.exit(1)", "{prompt}"] };
  const room = new Room([flaky], process.env.PATH, ui);
  for (let i = 0; i < 3; i++) await room.dispatch(flaky);
  assert.equal(flaky.muted, true);
  assert.ok(ui.out.some(([kind, text]) => kind === "info" && /muted after 3 failures/.test(text)));
  assert.ok(ui.out.every(([kind, text]) => kind !== "error" || !/You are Flaky/.test(text)));
});

test("doctor reports who answers and why others fail, without touching the chat", async () => {
  const ui = fakeUi();
  const ok = { name: "ok", label: "Good", out: "stdout", muted: false, cmd: [process.execPath, "-e", "process.stdout.write('OK')", "{prompt}"] };
  const bad = { name: "bad", label: "Bad", out: "stdout", muted: false, cmd: [process.execPath, "-e", "console.error('Error: Not logged in'); process.exit(1)", "{prompt}"] };
  const room = new Room([ok, bad], process.env.PATH, ui);
  await room.doctor([{ label: "Missing", bin: "missing-bin" }]);
  assert.ok(ui.out.some(([kind, text]) => kind === "info" && /✓ Good — answered/.test(text)));
  assert.ok(ui.out.some(([kind, text]) => kind === "error" && /Bad: Error: Not logged in/.test(text)));
  assert.ok(ui.out.some(([kind, text]) => kind === "info" && /Missing — not installed/.test(text)));
  assert.equal(room.transcript.length, 0);
});
