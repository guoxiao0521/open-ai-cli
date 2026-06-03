# open-ai-cli

Open Codex CLI, Claude Code, and Cursor CLI from the current directory in one Windows Terminal window.

## Requirements

- Windows
- Node.js 18 or newer
- Windows Terminal available as `wt.exe`
- Codex CLI available as `codex`
- Claude Code CLI available as `claude`
- Cursor CLI available as `agent`

## Install

```bash
npm install -g open-ai-cli
```

For local development from this directory:

```bash
npm link
```

## Usage

Run the command from the project directory you want both tools to use:

```bash
open-ai-cli
```

It opens Windows Terminal with three tabs:

- `Codex`, running `codex`
- `Claude`, running `claude`
- `Cursor`, running `agent`

## Options

```bash
open-ai-cli --help
open-ai-cli --version
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
