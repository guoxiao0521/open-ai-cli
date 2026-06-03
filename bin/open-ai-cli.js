#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_COMMANDS = [
  { command: 'wt.exe', label: 'Windows Terminal (wt.exe)' },
  { command: 'codex', label: 'Codex CLI (codex)' },
  { command: 'claude', label: 'Claude Code CLI (claude)' },
  { command: 'agent', label: 'Cursor CLI (agent)' }
];

const HELP_TEXT = `Usage:
  open-ai-cli
  open-ai-cli --help
  open-ai-cli --version

Opens Windows Terminal with three tabs in the current directory:
  - Codex: runs "codex"
  - Claude: runs "claude"
  - Cursor: runs "agent"

Requirements:
  - Windows
  - Windows Terminal (wt.exe)
  - Codex CLI available as "codex"
  - Claude Code CLI available as "claude"
  - Cursor CLI available as "agent"
`;

export function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) {
    return { action: 'help' };
  }

  if (args.includes('--version') || args.includes('-v')) {
    return { action: 'version' };
  }

  const unknown = args.filter((arg) => arg.startsWith('-'));
  if (unknown.length > 0) {
    return { action: 'error', message: `Unknown option: ${unknown.join(', ')}` };
  }

  return { action: 'open' };
}

export function getPackageVersion() {
  const packageJsonPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  return packageJson.version;
}

export function buildWtArgs({ cwd, codexCommand = 'codex', claudeCommand = 'claude', cursorCommand = 'agent' }) {
  return [
    'new-tab',
    '--title',
    'Codex',
    '-d',
    cwd,
    'powershell.exe',
    '-NoExit',
    '-Command',
    codexCommand,
    ';',
    'new-tab',
    '--title',
    'Claude',
    '-d',
    cwd,
    'powershell.exe',
    '-NoExit',
    '-Command',
    claudeCommand,
    ';',
    'new-tab',
    '--title',
    'Cursor',
    '-d',
    cwd,
    'powershell.exe',
    '-NoExit',
    '-Command',
    cursorCommand
  ];
}

export function commandExists(command, { env = process.env } = {}) {
  const result = spawnSync('where.exe', [command], {
    env,
    stdio: 'ignore',
    windowsHide: true
  });

  return result.status === 0;
}

export function getMissingRequirements({ platform = process.platform, env = process.env } = {}) {
  if (platform !== 'win32') {
    return ['Windows is required.'];
  }

  return REQUIRED_COMMANDS
    .filter(({ command }) => !commandExists(command, { env }))
    .map(({ label }) => `${label} was not found in PATH.`);
}

export function launchTerminals({ cwd = process.cwd(), env = process.env } = {}) {
  const child = spawn('wt.exe', buildWtArgs({ cwd }), {
    cwd,
    env,
    detached: true,
    stdio: 'ignore',
    windowsHide: false
  });

  child.unref();
}

export function main(args = process.argv.slice(2), options = {}) {
  const parsed = parseArgs(args);

  if (parsed.action === 'help') {
    console.log(HELP_TEXT.trimEnd());
    return 0;
  }

  if (parsed.action === 'version') {
    console.log(getPackageVersion());
    return 0;
  }

  if (parsed.action === 'error') {
    console.error(parsed.message);
    console.error('Run "open-ai-cli --help" for usage.');
    return 1;
  }

  const missing = getMissingRequirements(options);
  if (missing.length > 0) {
    console.error('open-ai-cli cannot start:');
    for (const message of missing) {
      console.error(`- ${message}`);
    }
    return 1;
  }

  launchTerminals(options);
  console.log('Opened Codex CLI, Claude Code, and Cursor CLI in Windows Terminal.');
  return 0;
}

export function isEntrypoint(argvPath = process.argv[1], moduleUrl = import.meta.url) {
  if (!argvPath) {
    return false;
  }

  const argvRealPath = realpathSync(resolve(argvPath));
  const moduleRealPath = realpathSync(fileURLToPath(moduleUrl));

  return argvRealPath === moduleRealPath;
}

if (isEntrypoint()) {
  process.exitCode = main();
}
