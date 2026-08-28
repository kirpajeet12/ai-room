# Contributing to ai-room

The most useful thing you can add is **your AI CLI**. If you use a coding agent that
isn't in the room yet, adding it is roughly eight lines and no new dependencies.

## Add an agent

Every agent is one object in `DEFAULT_AGENTS` in [`src/config.js`](src/config.js):

```js
{
  name: "mycli",              // internal id, used by /mute mycli
  label: "MyCLI",             // shown in the transcript
  color: "34",                // ANSI colour code
  bin: "mycli",               // the binary we probe for on PATH
  cmd: ["mycli", "-p", "{prompt}"],
  out: "stdout",              // or "file" — see below
}
```

Two tokens get substituted at call time:

| Token       | Becomes                                                             |
| ----------- | ------------------------------------------------------------------- |
| `{prompt}`  | the outgoing prompt                                                  |
| `{outfile}` | a temp file path the CLI should write its final message to           |

Set `out: "file"` when the CLI's stdout is noisy (progress bars, tool logs) and it
offers a flag to write just the final answer somewhere. Codex is the worked example.
Otherwise `out: "stdout"` and we take what it prints.

**`cmd` is an argv array, never a shell string.** That's deliberate — it means a prompt
can never be interpreted as shell. Please keep it that way; a PR that switches to a
shell string will be turned down on that basis alone.

### Test it before you open the PR

```bash
git clone https://github.com/kirpajeet12/ai-room && cd ai-room
node bin/ai-room.js
```

Check that:
- `/agents` lists your agent when the CLI is installed and logged in
- your agent is silently absent when the binary isn't on PATH — a missing CLI is
  never an error, it just isn't in the room
- `@youragent hello` addresses it directly
- `/debate <topic> 2` includes it in the rounds

If the binary lives somewhere unusual, add its directory to `augmentedPath()` in the
same file rather than telling users to edit their PATH.

### No account needed to try it

You don't have to be logged into all four CLIs to work on this. Ollama is free and
local — `ollama pull llama3.2` gives you a second agent to test multi-agent behaviour
against.

## Other things worth doing

- **Windows support.** `binaryExists()` shells out to `where` on win32 but the
  project is otherwise untested there. Reports welcome.
- **New room commands.** `/debate`, `/mute`, `/export`, `/agents` are in
  [`src/room.js`](src/room.js). Same pattern for a new one.
- **Streaming output.** Right now an agent's reply lands all at once when its process
  exits. Streaming partial output as it arrives would feel much better.

## Ground rules

- **Zero runtime dependencies.** This is a hard constraint, not a preference. If a
  change needs a package, it probably belongs in a fork.
- Node's standard library only, ESM, Node 18+.
- No telemetry, no analytics, no phoning home. ai-room runs the same commands you
  could type yourself and never sees a key or a token — keep it that way.
- Small PRs. One agent or one fix per PR is easier to say yes to.

## Reporting things

Open an issue. If it's an agent that misbehaves, include the CLI, its version, and
what it printed — most adapter bugs are a CLI changing its output format.
