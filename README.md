# start-ai-cli - AI coding CLI launcher

[![npm version](https://img.shields.io/npm/v/start-ai-cli.svg)](https://www.npmjs.com/package/start-ai-cli)
[![npm downloads](https://img.shields.io/npm/dm/start-ai-cli.svg)](https://www.npmjs.com/package/start-ai-cli)
[![license: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

`start-ai-cli` is an npm package and command line tool for launching multiple AI coding CLIs from the same project directory. It opens Codex CLI, Claude Code, and Cursor CLI in separate terminal tabs or windows so every assistant starts in the current workspace.

Use it when you want one command to start your AI coding agents:

```bash
npx start-ai-cli
```

## Features

- Launches Codex CLI, Claude Code CLI, and Cursor CLI from the current directory.
- Opens each available tool in its own Windows Terminal tab or macOS Terminal window.
- Skips missing CLIs instead of failing when at least one supported tool is available.
- Works as a global npm command or one-off `npx` command.
- Has no runtime dependencies.

## Install

Run without installing:

```bash
npx start-ai-cli
```

Install globally:

```bash
npm install -g start-ai-cli
```

Then run it from the project directory you want the AI tools to use:

```bash
start-ai-cli
```

## Supported Tools

| Tool | Required command | Terminal title |
| --- | --- | --- |
| Codex CLI | `codex` | `Codex` |
| Claude Code | `claude` | `Claude` |
| Cursor CLI | `agent` | `Cursor` |

On Windows, `start-ai-cli` uses Windows Terminal (`wt.exe`) with PowerShell. On macOS, it uses Terminal.app through `osascript`.

## Requirements

- Windows or macOS
- Node.js 18 or newer
- Windows Terminal available as `wt.exe` on Windows
- PowerShell 7 available as `pwsh.exe`, or Windows PowerShell, on Windows
- Terminal.app and `osascript` available on macOS
- At least one supported AI coding CLI available in `PATH`

## Options

```bash
start-ai-cli --help
start-ai-cli --version
```

## Troubleshooting

### `start-ai-cli cannot start: no CLI tools found in PATH`

Install or expose at least one supported command in your shell:

- `codex` for Codex CLI
- `claude` for Claude Code
- `agent` for Cursor CLI

### Windows Terminal was not found

Install Windows Terminal and make sure `wt.exe` is available in `PATH`.

### PowerShell was not found

Install PowerShell 7 (`pwsh.exe`) or make sure Windows PowerShell (`powershell.exe`) is available.

## Package Links

- npm package: https://www.npmjs.com/package/start-ai-cli
- GitHub repository: https://github.com/guoxiao0521/open-ai-cli
- Issues: https://github.com/guoxiao0521/open-ai-cli/issues

## Development

```bash
npm test
npm run pack:dry-run
npm run publish:dry-run
```

## Publish

`README.md` and npm metadata changes appear on npm after publishing a new package version.

```bash
npm login --registry=https://registry.npmjs.org/
npm publish
```
