#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMAND = 'start-ai-cli';

const HARD_REQUIREMENTS = [
  { command: 'wt.exe', label: 'Windows Terminal (wt.exe)' }
];

const CLI_COMMANDS = [
  { command: 'codex', label: 'Codex CLI (codex)', title: 'Codex' },
  { command: 'claude', label: 'Claude Code CLI (claude)', title: 'Claude' },
  { command: 'agent', label: 'Cursor CLI (agent)', title: 'Cursor' }
];

const HELP_TEXT = `Usage:
  ${COMMAND}
  ${COMMAND} --help
  ${COMMAND} --version

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

export function buildWtArgs({ cwd, tabs }) {
  const result = [];
  for (let i = 0; i < tabs.length; i++) {
    if (i > 0) result.push(';');
    result.push('new-tab', '--title', tabs[i].title, '-d', cwd, 'powershell.exe', '-NoExit', '-Command', tabs[i].command);
  }
  return result;
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

  return HARD_REQUIREMENTS
    .filter(({ command }) => !commandExists(command, { env }))
    .map(({ label }) => `${label} was not found in PATH.`);
}

export function getAvailableCliTabs({ env = process.env } = {}) {
  return CLI_COMMANDS.filter(({ command }) => commandExists(command, { env }));
}

export function getMissingCliLabels({ env = process.env } = {}) {
  return CLI_COMMANDS
    .filter(({ command }) => !commandExists(command, { env }))
    .map(({ label }) => label);
}

export function launchTerminals({ cwd = process.cwd(), env = process.env, tabs = CLI_COMMANDS } = {}) {
  const child = spawn('wt.exe', buildWtArgs({ cwd, tabs }), {
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
  console.log(`Opened ${launched} in Windows Terminal.`);
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
