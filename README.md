# ai-room

**One terminal chat room for every AI CLI on your machine.**

Claude, Codex, Gemini (Antigravity), Ollama — all in one conversation. Talk to all of them at once, address one directly, or make them debate each other. Zero dependencies.

```
ai-room — one terminal, every AI on your machine

In the room: Claude, Codex, Gemini, Ollama

you › which database should I use for a small SaaS?
Claude: For a small SaaS, Postgres — boring, battle-tested, and you...
Codex: Postgres. SQLite if you're truly single-server and want zero ops...
Gemini: Postgres is the safe default; consider SQLite + Litestream if...
```

## Install & run

No install needed — run it straight from npm:

```bash
npx ai-room
```

Or install it as a permanent command:

```bash
npm install -g ai-room
ai-room
```

No setup. It detects which AI CLIs you already have installed and logged in — anything missing is simply not in the room.

## Update

```bash
npx ai-room@latest        # if you use npx
npm update -g ai-room     # if you installed globally
```

Supported out of the box:

| Agent  | CLI it drives              | Install                                |
| ------ | -------------------------- | -------------------------------------- |
| Claude | `claude` (Claude Code)     | https://claude.com/claude-code         |
| Codex  | `codex` (OpenAI Codex CLI) | `npm i -g @openai/codex`               |
| Gemini | `agy` (Google Antigravity) | https://antigravity.google             |
| Ollama | `ollama` (local models)    | https://ollama.com                     |

## Use it

| You type                          | What happens                                     |
| --------------------------------- | ------------------------------------------------ |
| `hello everyone`                  | every agent replies, in parallel                 |
| `@codex review this idea: ...`    | only Codex replies                               |
| `/debate tabs vs spaces 3`        | agents argue 3 rounds, then one gives a verdict  |
| `/agents`                         | who's in the room                                |
| `/mute ollama` / `/unmute ollama` | take an agent out of / back into the room        |
| `/doctor`                         | check every agent answers: installed, signed in  |
| `/export notes.md`                | save the transcript as markdown (won't overwrite)|
| `/help`, `/quit`                  | you can guess                                    |

Each agent sees the shared transcript, so they respond to *each other*, not just to you — ask a question, then ask another agent "do you agree with Codex?"

## Add your own agent

Any CLI that takes a prompt and prints a reply can join. Create `~/.config/ai-room/config.json`:

```json
{
  "agents": [
    {
      "name": "mistral",
      "label": "Mistral",
      "color": "34",
      "bin": "ollama",
      "cmd": ["ollama", "run", "mistral", "{prompt}"],
      "out": "stdout"
    }
  ]
}
```

- `cmd` is an argv array — `{prompt}` is replaced with the outgoing message (no shell, no quoting bugs)
- `out`: `"stdout"` reads the reply from stdout; `"file"` for CLIs with noisy stdout that support writing their final message to a file (`{outfile}` in `cmd`)
- `color` is an ANSI color code (31–37)
- Reusing a built-in `name` overrides that built-in — including its chat-only safety flags, so copy them if you override one

## Security

ai-room runs other AI CLIs **as you**, with your logins. It is built so a message in the room can't turn that into access to your machine.

- **Chat-only agents.** Built-in agents are started with their tools switched off, verified by asking each one to run `whoami`:

  | Agent | Flags ai-room adds |
  | --- | --- |
  | Claude | `--tools ""` `--strict-mcp-config` `--disable-slash-commands` `--no-session-persistence` |
  | Codex | `--ignore-user-config` `--ignore-rules` `--sandbox read-only` `--disable shell_tool,unified_exec,browser_use,in_app_browser,apps` `--ephemeral` |
  | Gemini (`agy`) | `--sandbox` `--disable-slash-commands` `--settings` denying `command(*)`, `mcp(*)`, `browser(*)` |

  Without these, a prompt-injected message could make an agent run commands, read files, or use MCP connectors (email, browser, computer control) you have set up for that CLI.
- **No shell.** Agents are run with `execFile` and an argv array; message text is never parsed by a shell.
- **Terminal-safe output.** Agent replies and errors are stripped of terminal control sequences (clipboard writes, title changes, hidden text) before they are shown or saved.
- **No secrets touched.** ai-room never reads tokens or auth files; each CLI loads its own login.
- **No network listener.** ai-room opens no port.
- **No leftover history.** Claude and Codex are told not to save room conversations as sessions.

What it can't protect against:

- **Everything you type is sent to every agent's provider** (Anthropic, OpenAI, Google). Don't paste secrets. Local Ollama models stay on your machine.
- **Agents read each other's replies**, so one agent can try to persuade another. Chat-only mode limits what that can achieve.
- **Custom agents in your config run exactly the command you give them.** Never put `{prompt}` into a command that goes through a shell — for example `ssh host cmd {prompt}`, where the remote shell would run the message as a command. Use an SSH tunnel and a local client instead.

Report vulnerabilities privately via GitHub's *Report a vulnerability* button on the Security tab.

## Notes

- Replies take as long as the underlying CLI takes — a cloud agent call can be 10–30 seconds. Several large local models answering at once can be slow on 16 GB of RAM.
- An agent that fails 3 times in a row is muted automatically; `/unmute name` brings it back.
- Each agent uses **your** existing login/subscription for that CLI. ai-room never sees a key or token; it just runs the same commands you could type yourself.
- Agents are called fresh per message with the recent transcript as context (last 30 messages).

## License

MIT © [Kirpajeet Singh Gill](https://github.com/kirpajeet12)
