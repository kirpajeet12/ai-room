import { writeFileSync } from "node:fs";
import { askAgent } from "./adapter.js";
import { stripControl } from "./sanitize.js";

const MAX_CONTEXT_MESSAGES = 30;
export const MAX_FAILURES_BEFORE_MUTE = 3;
const DOCTOR_PROMPT = "Health check from ai-room. Reply with exactly: OK";

export class Room {
  constructor(agents, pathEnv, ui) {
    this.agents = agents; // [{ name, label, color, cmd, out, muted }]
    this.pathEnv = pathEnv;
    this.ui = ui;
    this.transcript = []; // [{ who, text }]
    this.pending = 0;
  }

  activeAgents() {
    return this.agents.filter((a) => !a.muted);
  }

  find(name) {
    const n = name.toLowerCase().replace(/^@/, "");
    return this.agents.find((a) => a.name === n || a.label.toLowerCase() === n);
  }

  buildPrompt(agent) {
    const others = this.agents
      .filter((a) => a.name !== agent.name)
      .map((a) => a.label)
      .join(", ");
    const recent = this.transcript
      .slice(-MAX_CONTEXT_MESSAGES)
      .map((m) => `${m.who}: ${m.text}`)
      .join("\n");
    return (
      `You are ${agent.label} in a live terminal group chat with a human ("You") ` +
      `and other AI assistants (${others || "none right now"}). ` +
      `The recent transcript is below; the last line is the newest message. ` +
      `Reply with ONE short conversational message as yourself (a few sentences max). ` +
      `Output ONLY the message text - no name prefix, no markdown headings.\n\n` +
      `--- transcript ---\n${recent}`
    );
  }

  post(who, text) {
    this.transcript.push({ who, text });
    this.ui.message(who, text);
  }

  // Send the current conversation to one agent and post its reply.
  async dispatch(agent) {
    this.pending += 1;
    this.ui.thinking(agent);
    try {
      const reply = stripControl(await askAgent(agent, this.buildPrompt(agent), this.pathEnv));
      agent.failures = 0;
      this.transcript.push({ who: agent.label, text: reply });
      this.ui.agentMessage(agent, reply);
    } catch (err) {
      agent.failures = (agent.failures ?? 0) + 1;
      this.ui.error(`${agent.label}: ${stripControl(err.message)}`);
      if (agent.failures >= MAX_FAILURES_BEFORE_MUTE && !agent.muted) {
        agent.muted = true;
        this.ui.info(`${agent.label} muted after ${agent.failures} failures in a row — /unmute ${agent.name} to retry`);
      }
    } finally {
      this.pending -= 1;
      if (this.pending === 0) this.ui.idle();
    }
  }

  // A human message. "@name ..." goes to one agent; anything else goes to
  // every unmuted agent in parallel.
  async say(text) {
    const mention = text.match(/^@(\S+)\s*(.*)$/s);
    if (mention) {
      const agent = this.find(mention[1]);
      if (!agent) {
        this.ui.error(`no agent called "${mention[1]}" (try /agents)`);
        return;
      }
      this.post("You", mention[2] || text);
      await this.dispatch(agent);
      return;
    }
    this.post("You", text);
    await Promise.all(this.activeAgents().map((a) => this.dispatch(a)));
  }

  // Agents take turns on a topic for N rounds; the first agent then gives
  // a verdict. Sequential on purpose - each turn sees the previous ones.
  async debate(topic, rounds) {
    const panel = this.activeAgents();
    if (panel.length < 2) {
      this.ui.error("a debate needs at least 2 unmuted agents");
      return;
    }
    this.post("Moderator", `Debate topic: ${topic}. Take positions, challenge each other, be concrete.`);
    for (let round = 1; round <= rounds; round++) {
      this.ui.info(`— round ${round} of ${rounds} —`);
      for (const agent of panel) {
        await this.dispatch(agent);
      }
    }
    this.post("Moderator", "Debate over. Give a short final verdict: who made the strongest case and what should actually be done?");
    await this.dispatch(panel[0]);
  }

  // Ask every agent (muted ones too) a tiny question in parallel and report
  // who answers, how fast, and why the others failed. Not added to the chat.
  async doctor(missing = []) {
    this.ui.info(`checking ${this.agents.length} agent(s)…`);
    const results = await Promise.all(
      this.agents.map(async (agent) => {
        const started = Date.now();
        try {
          await askAgent(agent, DOCTOR_PROMPT, this.pathEnv);
          return { agent, ok: true, seconds: (Date.now() - started) / 1000 };
        } catch (err) {
          return { agent, ok: false, reason: stripControl(err.message) };
        }
      }),
    );
    for (const r of results) {
      if (r.ok) this.ui.info(`✓ ${r.agent.label} — answered in ${r.seconds.toFixed(1)}s${r.agent.muted ? " (muted)" : ""}`);
      else this.ui.error(`${r.agent.label}: ${r.reason}`);
    }
    for (const m of missing) this.ui.info(`· ${m.label} — not installed (${m.bin})`);
    return results;
  }

  export(path) {
    const lines = ["# ai-room transcript", ""];
    for (const m of this.transcript) lines.push(`**${m.who}:** ${m.text}`, "");
    writeFileSync(path, lines.join("\n"), { flag: "wx" });
  }
}
