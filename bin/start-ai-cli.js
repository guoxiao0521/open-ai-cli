#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMAND = 'start-ai-cli';

const HARD_REQUIREMENTS_BY_PLATFORM = {
  win32: [{ command: 'wt.exe', label: 'Windows Terminal (wt.exe)' }],
  darwin: [{ command: 'osascript', label: 'AppleScript runner (osascript)' }]
};

const CLI_COMMANDS = [
  { command: 'codex', label: 'Codex CLI (codex)', title: 'Codex' },
  { command: 'claude', label: 'Claude Code CLI (claude)', title: 'Claude' },
  { command: 'agent', label: 'Cursor CLI (agent)', title: 'Cursor' }
];

const HELP_TEXT = `Usage:
  ${COMMAND}
  ${COMMAND} --help
  ${COMMAND} --version

Opens terminal tabs/windows in the current directory:
  - Codex: runs "codex"
  - Claude: runs "claude"
  - Cursor: runs "agent"

Requirements:
  - Windows with Windows Terminal (wt.exe), or macOS with Terminal.app
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

export function buildWtArgs({ cwd, tabs }) {
  const result = [];
  for (let i = 0; i < tabs.length; i++) {
    if (i > 0) result.push(';');
    result.push('new-tab', '--title', tabs[i].title, '-d', cwd, 'powershell.exe', '-NoExit', '-Command', tabs[i].command);
  }
  return result;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function appleScriptQuote(value) {
  return JSON.stringify(String(value));
}

export function buildMacTerminalScript({ cwd, tabs }) {
  const commands = tabs.map(({ command }) => `cd ${shellQuote(cwd)} && ${command}`);
  const lines = [
    'tell application "Terminal"',
    '  activate'
  ];

  for (const command of commands) {
    lines.push(`  do script ${appleScriptQuote(command)}`);
  }

  lines.push('end tell');
  return lines.join('\n');
}

export function buildMacTerminalArgs({ cwd, tabs }) {
  return ['-e', buildMacTerminalScript({ cwd, tabs })];
}

export function commandExists(command, { env = process.env, platform = process.platform } = {}) {
  const executable = platform === 'win32' ? 'where.exe' : 'sh';
  const args = platform === 'win32'
    ? [command]
    : ['-lc', `command -v ${shellQuote(command)}`];

  const result = spawnSync(executable, args, {
    env,
    stdio: 'ignore',
    windowsHide: true
  });

  return result.status === 0;
}

export function getMissingRequirements({ platform = process.platform, env = process.env } = {}) {
  const requirements = HARD_REQUIREMENTS_BY_PLATFORM[platform];
  if (!requirements) {
    return ['Windows or macOS is required.'];
  }

  return requirements
    .filter(({ command }) => !commandExists(command, { env, platform }))
    .map(({ label }) => `${label} was not found in PATH.`);
}

export function getAvailableCliTabs({ env = process.env, platform = process.platform } = {}) {
  return CLI_COMMANDS.filter(({ command }) => commandExists(command, { env, platform }));
}

export function getMissingCliLabels({ env = process.env, platform = process.platform } = {}) {
  return CLI_COMMANDS
    .filter(({ command }) => !commandExists(command, { env, platform }))
    .map(({ label }) => label);
}

export function launchTerminals({ cwd = process.cwd(), env = process.env, platform = process.platform, tabs = CLI_COMMANDS } = {}) {
  const executable = platform === 'win32' ? 'wt.exe' : 'osascript';
  const args = platform === 'win32'
    ? buildWtArgs({ cwd, tabs })
    : buildMacTerminalArgs({ cwd, tabs });

  const child = spawn(executable, args, {
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
    console.error(`Run "${COMMAND} --help" for usage.`);
    return 1;
  }

  const missing = getMissingRequirements(options);
  if (missing.length > 0) {
    console.error(`${COMMAND} cannot start:`);
    for (const message of missing) {
      console.error(`- ${message}`);
    }
    return 1;
  }

  const missingClis = getMissingCliLabels(options);
  for (const label of missingClis) {
    console.warn(`Warning: ${label} was not found in PATH, skipping.`);
  }

  const availableTabs = getAvailableCliTabs(options);
  if (availableTabs.length === 0) {
    console.error(`${COMMAND} cannot start: no CLI tools found in PATH.`);
    return 1;
  }

  launchTerminals({ ...options, tabs: availableTabs });
  const launched = availableTabs.map(({ title }) => title).join(', ');
  const terminalName = (options.platform ?? process.platform) === 'win32' ? 'Windows Terminal' : 'Terminal.app';
  console.log(`Opened ${launched} in ${terminalName}.`);
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
