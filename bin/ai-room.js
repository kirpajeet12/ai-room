#!/usr/bin/env node
import readline from "node:readline";
import { loadConfig } from "../src/config.js";
import { Room } from "../src/room.js";

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const color = (code, text) => `\x1b[${code}m${text}${RESET}`;

const { available, missing, pathEnv } = loadConfig();

if (available.length === 0) {
  console.error("ai-room: no AI CLIs found on this machine.");
  console.error("Install at least one of: claude, codex, agy (Antigravity), ollama —");
  console.error("or add your own in ~/.config/ai-room/config.json");
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.setPrompt(`${BOLD}you ›${RESET} `);

// Reprint the prompt cleanly after async output lands mid-typing.
function println(text) {
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  console.log(text);
  rl.prompt(true);
}

const ui = {
  message: (who, text) => println(`${BOLD}${who}:${RESET} ${text}`),
  agentMessage: (agent, text) => println(`${color(agent.color, BOLD + agent.label + ":")} ${text}`),
  thinking: (agent) => println(`${DIM}· ${agent.label} is thinking…${RESET}`),
  info: (text) => println(`${DIM}${text}${RESET}`),
  error: (text) => println(`${color("31", "✗")} ${DIM}${text}${RESET}`),
  idle: () => rl.prompt(true),
};

const room = new Room(
  available.map((a) => ({ ...a, muted: false })),
  pathEnv,
  ui,
);

console.log(`${BOLD}ai-room${RESET} — one terminal, every AI on your machine\n`);
console.log(`In the room: ${room.agents.map((a) => color(a.color, a.label)).join(", ")}`);
if (missing.length) console.log(`${DIM}Not installed: ${missing.map((a) => a.label).join(", ")}${RESET}`);
console.log(`${DIM}Talk to everyone, or @name one agent. /help for commands.${RESET}\n`);

const HELP = `
  <message>            everyone in the room replies
  @name <message>      only that agent replies (e.g. @codex, @gemini)
  /agents              who is in the room
  /mute name, /unmute name
  /debate <topic> [rounds]   agents debate, then give a verdict (default 2 rounds)
  /export [file.md]    save the transcript
  /quit                leave
`;

async function handle(line) {
  const text = line.trim();
  if (!text) return;

  if (text.startsWith("/")) {
    const [cmd, ...rest] = text.split(/\s+/);
    switch (cmd) {
      case "/help":
        console.log(HELP);
        break;
      case "/agents":
        for (const a of room.agents) {
          console.log(`  ${color(a.color, a.label)}${a.muted ? " (muted)" : ""} — ${a.cmd[0]}`);
        }
        break;
      case "/mute":
      case "/unmute": {
        const agent = room.find(rest[0] || "");
        if (!agent) ui.error(`no agent called "${rest[0] || ""}"`);
        else {
          agent.muted = cmd === "/mute";
          ui.info(`${agent.label} ${agent.muted ? "muted" : "unmuted"}`);
        }
        break;
      }
      case "/debate": {
        const roundsMatch = rest.at(-1)?.match(/^\d+$/);
        const rounds = roundsMatch ? Math.min(parseInt(roundsMatch[0], 10), 5) : 2;
        const topic = (roundsMatch ? rest.slice(0, -1) : rest).join(" ");
        if (!topic) ui.error("usage: /debate <topic> [rounds]");
        else await room.debate(topic, rounds);
        break;
      }
      case "/export": {
        const path = rest[0] || `ai-room-${new Date().toISOString().slice(0, 10)}.md`;
        try {
          room.export(path);
          ui.info(`transcript saved to ${path}`);
        } catch (err) {
          ui.error(err.code === "EEXIST" ? `${path} already exists — pick another name: /export other.md` : err.message);
        }
        break;
      }
      case "/quit":
      case "/exit":
        rl.close();
        return;
      default:
        ui.error(`unknown command ${cmd} (try /help)`);
    }
    rl.prompt();
    return;
  }

  await room.say(text);
}

const inflight = new Set();
rl.on("line", (line) => {
  const task = handle(line).catch((err) => ui.error(err.message));
  inflight.add(task);
  task.finally(() => inflight.delete(task));
});
rl.on("close", async () => {
  // Let in-flight replies land before exiting (matters for piped input).
  while (inflight.size > 0) await Promise.allSettled([...inflight]);
  console.log("\nbye 👋");
  process.exit(0);
});
rl.prompt();
