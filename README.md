# start-ai-cli

Open Codex CLI, Claude Code, and Cursor CLI from the current directory in terminal tabs/windows.

## Requirements

- Windows or macOS
- Node.js 18 or newer
- Windows Terminal available as `wt.exe` on Windows
- PowerShell 7 available as `pwsh.exe`, or Windows PowerShell, on Windows
- Terminal.app and `osascript` available on macOS
- Codex CLI available as `codex`
- Claude Code CLI available as `claude`
- Cursor CLI available as `agent`

## Install

```bash
npm install -g start-ai-cli
```

For local development from this directory:

```bash
npm link
```

## Usage

Run the command from the project directory you want both tools to use:

```bash
start-ai-cli
```

It opens your platform terminal with one session per available tool:

- `Codex`, running `codex`
- `Claude`, running `claude`
- `Cursor`, running `agent`

On Windows it uses Windows Terminal. On macOS it uses Terminal.app.

## Options

```bash
start-ai-cli --help
start-ai-cli --version
```

## Development

```bash
npm test
npm run pack:dry-run
npm run publish:dry-run
```

## Publish

```bash
npm login --registry=https://registry.npmjs.org/
npm publish
```
