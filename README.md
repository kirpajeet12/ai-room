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
| `/export notes.md`                | save the whole transcript as markdown            |
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
- Reusing a built-in `name` overrides that built-in

## Notes

- Replies take as long as the underlying CLI takes — a cloud agent call can be 10–30 seconds. Local Ollama models are usually faster.
- Each agent uses **your** existing login/subscription for that CLI. ai-room never sees a key or token; it just runs the same commands you could type yourself.
- Agents are called fresh per message with the recent transcript as context (last 30 messages).

## License

MIT © [Kirpajeet Singh Gill](https://github.com/kirpajeet12)
