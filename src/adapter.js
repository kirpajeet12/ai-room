import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TIMEOUT_MS = 180_000;

// Run one agent's CLI with a prompt and return its reply text.
// execFile (no shell) + argv arrays mean prompt content is passed as a
// plain argument — no quoting or injection issues.
export function askAgent(agent, prompt, pathEnv) {
  return new Promise((resolve, reject) => {
    let outdir = null;
    let outfile = null;
    if (agent.out === "file") {
      outdir = mkdtempSync(join(tmpdir(), "ai-room-"));
      outfile = join(outdir, "last-message.txt");
    }

    const argv = agent.cmd.map((part) =>
      part.replaceAll("{prompt}", prompt).replaceAll("{outfile}", outfile ?? ""),
    );

    const child = execFile(
      argv[0],
      argv.slice(1),
      {
        env: { ...process.env, PATH: pathEnv },
        timeout: TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout) => {
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

        if (reply) return resolve(reply);
        if (error) {
          const reason = error.killed ? `timed out after ${TIMEOUT_MS / 1000}s` : error.message.split("\n")[0];
          return reject(new Error(reason));
        }
        reject(new Error("returned an empty reply"));
      },
    );

    // Some CLIs (codex) block waiting on stdin if the pipe is left open.
    child.stdin?.end();
    child.on("error", (err) => reject(err));
  });
}
