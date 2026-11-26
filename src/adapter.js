import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { stripControl } from "./sanitize.js";

export const TIMEOUT_MS = 180_000;
const MAX_REASON_LENGTH = 300;

const HINTS = [
  {
    match: /not (logged|signed) in|log ?in required|please (log|sign) ?in|unauthori[sz]ed|\b401\b|authenticat|credential|api key|expired token|session expired/i,
    hint: (bin) => `sign in by running \`${bin}\` once in a terminal`,
  },
  {
    match: /could not connect to (a running )?ollama|ollama.*(not running|connection refused)|connect: connection refused/i,
    hint: () => "start the Ollama app or run `ollama serve`",
  },
  {
    match: /model ['"]?[\w.:/-]+['"]? not found|pull model|try pulling/i,
    hint: () => "download the model first, e.g. `ollama pull llama3.2`",
  },
  {
    match: /rate.?limit|\b429\b|quota|usage limit|too many requests/i,
    hint: () => "the provider is rate-limiting you; /mute it for a while",
  },
];

function lastMeaningfulLine(text) {
  const lines = stripControl(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const preferred = [...lines].reverse().find((l) => /error|fail|denied|not |unable|cannot|can't|invalid/i.test(l));
  return preferred ?? lines.at(-1) ?? "";
}

function truncate(text) {
  return text.length > MAX_REASON_LENGTH ? `${text.slice(0, MAX_REASON_LENGTH - 1)}…` : text;
}

// Turn a failed run into one short line a person can act on. Never uses
// error.message: Node puts the full argv (and so the whole prompt) in it.
export function explainFailure(error, stderr, bin) {
  const name = basename(bin);
  if (error?.code === "ENOENT") return `${name} is not installed or not on your PATH`;
  if (error?.code === "EACCES") return `${name} is not executable (permission denied)`;
  if (error?.killed || error?.signal === "SIGTERM") return `timed out after ${TIMEOUT_MS / 1000}s`;

  const said = lastMeaningfulLine(stderr);
  const base = said ? truncate(said) : `exited with code ${error?.code ?? "unknown"}`;
  const found = HINTS.find(({ match }) => match.test(stderr || ""));
  return found ? `${base} — ${found.hint(name)}` : base;
}

function fillTemplate(part, prompt, outfile) {
  return part.replace(/\{prompt\}|\{outfile\}/g, (token) => (token === "{prompt}" ? prompt : (outfile ?? "")));
}

// Run one agent's CLI with a prompt and return its reply text.
// execFile (no shell) + argv arrays mean prompt content is passed as a
// plain argument — no quoting or injection issues.
export function askAgent(agent, prompt, pathEnv) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (!settled) {
        settled = true;
        fn(value);
      }
    };

    let outdir = null;
    let outfile = null;
    if (agent.out === "file") {
      outdir = mkdtempSync(join(tmpdir(), "ai-room-"));
      outfile = join(outdir, "last-message.txt");
    }

    const argv = agent.cmd.map((part) => fillTemplate(part, prompt, outfile));

    const child = execFile(
      argv[0],
      argv.slice(1),
      {
        env: { ...process.env, PATH: pathEnv },
        timeout: TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        let reply = "";
        try {
          if (agent.out === "file") {
            try {
              reply = readFileSync(outfile, "utf8").trim();
            } catch {
              reply = "";
            }
          } else {
            reply = (stdout || "").trim();
          }
        } finally {
          if (outdir) rmSync(outdir, { recursive: true, force: true });
        }

        if (reply) return finish(resolve, reply);
        if (error) return finish(reject, new Error(explainFailure(error, stderr, agent.bin ?? argv[0])));
        const said = lastMeaningfulLine(stderr);
        finish(reject, new Error(said ? truncate(said) : "returned an empty reply"));
      },
    );

    // Some CLIs (codex) block waiting on stdin if the pipe is left open.
    child.stdin?.end();
    child.on("error", (err) => finish(reject, new Error(explainFailure(err, "", agent.bin ?? argv[0]))));
  });
}
