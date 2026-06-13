#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve, win32 as pathWin32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import React, { useState } from 'react';
import { Box, Text, render, useApp, useInput } from 'ink';

const COMMAND = 'start-ai-cli';

const HARD_REQUIREMENTS_BY_PLATFORM = {
  win32: [{ command: 'wt.exe', label: 'Windows Terminal (wt.exe)' }],
  darwin: [{ command: 'osascript', label: 'AppleScript runner (osascript)' }]
};

const CLI_COMMANDS = [
  { id: 'codex', command: 'codex', label: 'Codex CLI (codex)', title: 'Codex' },
  { id: 'claude', command: 'claude', label: 'Claude Code CLI (claude)', title: 'Claude' },
  { id: 'cursor', command: 'agent', label: 'Cursor CLI (agent)', title: 'Cursor' }
];

const DEFAULT_WINDOWS_SHELL_COMMAND = 'pwsh.exe';
const DEFAULT_ENABLED_CLI_IDS = CLI_COMMANDS.map(({ id }) => id);
const EMPTY_SELECTION_MESSAGE = 'Select at least one available CLI.';

const HELP_TEXT = `Usage:
  ${COMMAND}
  ${COMMAND} --all
  ${COMMAND} --help
  ${COMMAND} --version

Interactively choose which CLI tools to open in the current directory:
  - Codex: runs "codex"
  - Claude: runs "claude"
  - Cursor: runs "agent"

Options:
  --all, --no-interactive  Open every available CLI without prompting
  --help, -h              Show this help
  --version, -v           Show the package version

Requirements:
  - Windows with Windows Terminal (wt.exe) and PowerShell, or macOS with Terminal.app
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

  const nonInteractive = args.includes('--all') || args.includes('--no-interactive');
  const known = new Set(['--all', '--no-interactive']);
  const unknown = args.filter((arg) => arg.startsWith('-') && !known.has(arg));
  if (unknown.length > 0) {
    return { action: 'error', message: `Unknown option: ${unknown.join(', ')}` };
  }

  return { action: 'open', interactive: !nonInteractive };
}

export function getPackageVersion() {
  const packageJsonPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  return packageJson.version;
}

export function getConfigPath({ homeDirectory = homedir() } = {}) {
  return resolve(homeDirectory, '.start-ai-cli', 'config.json');
}

export function normalizeEnabledCliIds(enabledCliIds, cliCommands = CLI_COMMANDS) {
  const validIds = new Set(cliCommands.map(({ id }) => id));
  if (!Array.isArray(enabledCliIds)) {
    return cliCommands.map(({ id }) => id);
  }

  const normalized = [];
  for (const id of enabledCliIds) {
    if (typeof id === 'string' && validIds.has(id) && !normalized.includes(id)) {
      normalized.push(id);
    }
  }

  return normalized;
}

export function readConfig({
  configPath = getConfigPath(),
  readFileFn = readFileSync
} = {}) {
  try {
    const config = JSON.parse(readFileFn(configPath, 'utf8'));
    return {
      enabledClis: normalizeEnabledCliIds(config.enabledClis)
    };
  } catch {
    return {
      enabledClis: [...DEFAULT_ENABLED_CLI_IDS]
    };
  }
}

export function writeConfig({
  configPath = getConfigPath(),
  enabledClis,
  mkdirFn = mkdirSync,
  writeFileFn = writeFileSync
} = {}) {
  const config = {
    enabledClis: normalizeEnabledCliIds(enabledClis)
  };
  mkdirFn(dirname(configPath), { recursive: true });
  writeFileFn(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return config;
}

export function inspectCliCommands({
  env = process.env,
  platform = process.platform,
  commandExistsFn = commandExists,
  cliCommands = CLI_COMMANDS
} = {}) {
  return cliCommands.map((cli) => ({
    ...cli,
    available: commandExistsFn(cli.command, { env, platform })
  }));
}

export function getAvailableTabsFromInspection(inspectedClis) {
  return inspectedClis.filter(({ available }) => available);
}

export function getMissingLabelsFromInspection(inspectedClis) {
  return inspectedClis
    .filter(({ available }) => !available)
    .map(({ label }) => label);
}

export function filterTabsByEnabledCliIds(tabs, enabledCliIds) {
  const enabled = new Set(normalizeEnabledCliIds(enabledCliIds));
  return tabs.filter(({ id }) => enabled.has(id));
}

export function isInteractiveTerminal({
  input = process.stdin,
  output = process.stdout
} = {}) {
  return Boolean(input.isTTY && output.isTTY);
}

export class CliSelectionCancelledError extends Error {
  constructor() {
    super('CLI selection cancelled.');
    this.name = 'CliSelectionCancelledError';
  }
}

function getFirstAvailableCliIndex(inspectedClis) {
  const index = inspectedClis.findIndex(({ available }) => available);
  return index === -1 ? 0 : index;
}

function getAvailableCliIds(inspectedClis) {
  return new Set(inspectedClis.filter(({ available }) => available).map(({ id }) => id));
}

function orderSelectedIds(selectedIds, inspectedClis) {
  const selected = new Set(selectedIds);
  return inspectedClis.filter(({ id }) => selected.has(id)).map(({ id }) => id);
}

export function createCliSelectionState({
  inspectedClis,
  defaultEnabledCliIds
}) {
  const availableIds = getAvailableCliIds(inspectedClis);
  return {
    cursorIndex: getFirstAvailableCliIndex(inspectedClis),
    selectedIds: normalizeEnabledCliIds(defaultEnabledCliIds, inspectedClis)
      .filter((id) => availableIds.has(id)),
    errorMessage: null
  };
}

export function moveCliSelectionCursor({
  state,
  inspectedClis,
  direction
}) {
  if (inspectedClis.every(({ available }) => !available)) {
    return state;
  }

  let cursorIndex = state.cursorIndex;
  for (let i = 0; i < inspectedClis.length; i++) {
    cursorIndex = (cursorIndex + direction + inspectedClis.length) % inspectedClis.length;
    if (inspectedClis[cursorIndex].available) {
      return {
        ...state,
        cursorIndex,
        errorMessage: null
      };
    }
  }

  return state;
}

export function toggleCliSelectionAtCursor({
  state,
  inspectedClis
}) {
  const cli = inspectedClis[state.cursorIndex];
  if (!cli?.available) {
    return state;
  }

  const selected = new Set(state.selectedIds);
  if (selected.has(cli.id)) {
    selected.delete(cli.id);
  } else {
    selected.add(cli.id);
  }

  return {
    ...state,
    selectedIds: orderSelectedIds(selected, inspectedClis),
    errorMessage: null
  };
}

export function confirmCliSelection({
  state,
  inspectedClis
}) {
  const availableIds = getAvailableCliIds(inspectedClis);
  const selectedIds = orderSelectedIds(
    state.selectedIds.filter((id) => availableIds.has(id)),
    inspectedClis
  );

  if (selectedIds.length === 0) {
    return {
      confirmed: false,
      state: {
        ...state,
        selectedIds,
        errorMessage: EMPTY_SELECTION_MESSAGE
      }
    };
  }

  return {
    confirmed: true,
    selectedIds
  };
}

export function CliSelectionPrompt({
  inspectedClis,
  defaultEnabledCliIds,
  onSubmit,
  onCancel
}) {
  const { exit } = useApp();
  const [state, setState] = useState(() => createCliSelectionState({
    inspectedClis,
    defaultEnabledCliIds
  }));

  useInput((input, key) => {
    if (key.upArrow) {
      setState((current) => moveCliSelectionCursor({
        state: current,
        inspectedClis,
        direction: -1
      }));
      return;
    }

    if (key.downArrow) {
      setState((current) => moveCliSelectionCursor({
        state: current,
        inspectedClis,
        direction: 1
      }));
      return;
    }

    if (input === ' ') {
      setState((current) => toggleCliSelectionAtCursor({
        state: current,
        inspectedClis
      }));
      return;
    }

    if (key.return) {
      const result = confirmCliSelection({
        state,
        inspectedClis
      });

      if (result.confirmed) {
        onSubmit(result.selectedIds);
        exit();
        return;
      }

      setState(result.state);
      return;
    }

    if (input === 'q' || key.escape) {
      onCancel();
      exit();
    }
  });

  const selected = new Set(state.selectedIds);
  return React.createElement(
    Box,
    { flexDirection: 'column' },
    React.createElement(Text, { bold: true }, 'Select CLI tools to launch'),
    ...inspectedClis.map((cli, index) => {
      const focused = index === state.cursorIndex;
      const marker = focused ? '>' : ' ';
      const checked = selected.has(cli.id) ? '[x]' : '[ ]';
      const availability = cli.available ? 'available' : 'not found in PATH';
      const color = cli.available && focused ? 'cyan' : undefined;

      return React.createElement(
        Text,
        {
          key: cli.id,
          color,
          dimColor: !cli.available
        },
        `${marker} ${checked} ${cli.label} - ${availability}`
      );
    }),
    state.errorMessage
      ? React.createElement(Text, { color: 'red' }, state.errorMessage)
      : null,
    React.createElement(
      Text,
      { dimColor: true },
      'Use Up/Down to move, Space to toggle, Enter to open, q/Esc to cancel.'
    )
  );
}

export async function promptForEnabledCliIds({
  input = process.stdin,
  output = process.stdout,
  inspectedClis,
  defaultEnabledCliIds,
  renderFn = render
}) {
  return new Promise((resolve, reject) => {
    let app;
    let settled = false;
    const settle = (callback, value) => {
      if (settled) {
        return;
      }

      settled = true;
      callback(value);
      app?.unmount();
    };

    app = renderFn(
      React.createElement(CliSelectionPrompt, {
        inspectedClis,
        defaultEnabledCliIds,
        onSubmit: (selectedIds) => settle(resolve, selectedIds),
        onCancel: () => settle(reject, new CliSelectionCancelledError())
      }),
      {
        stdin: input,
        stdout: output,
        stderr: output,
        exitOnCtrlC: false
      }
    );
  });
}

export function buildWtArgs({ cwd, tabs, shellCommand = DEFAULT_WINDOWS_SHELL_COMMAND }) {
  const result = [];
  for (let i = 0; i < tabs.length; i++) {
    if (i > 0) result.push(';');
    result.push(
      'new-tab',
      '--title',
      tabs[i].title,
      '-d',
      cwd,
      shellCommand,
      '-NoExit',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      tabs[i].command
    );
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

function getSystemWindowsPowerShellPath(env = process.env) {
  const systemRoot = env.SystemRoot ?? env.SYSTEMROOT ?? env.windir ?? env.WINDIR;
  if (!systemRoot) {
    return null;
  }

  return pathWin32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

export function getWindowsShellCommand({
  env = process.env,
  platform = process.platform,
  commandExistsFn = commandExists,
  fileExistsFn = existsSync
} = {}) {
  if (platform !== 'win32') {
    return null;
  }

  if (commandExistsFn('pwsh.exe', { env, platform })) {
    return 'pwsh.exe';
  }

  if (commandExistsFn('powershell.exe', { env, platform })) {
    return 'powershell.exe';
  }

  const systemPowerShellPath = getSystemWindowsPowerShellPath(env);
  if (systemPowerShellPath && fileExistsFn(systemPowerShellPath)) {
    return systemPowerShellPath;
  }

  return null;
}

export function getMissingRequirements({
  platform = process.platform,
  env = process.env,
  commandExistsFn = commandExists
} = {}) {
  const requirements = HARD_REQUIREMENTS_BY_PLATFORM[platform];
  if (!requirements) {
    return ['Windows or macOS is required.'];
  }

  const missing = requirements
    .filter(({ command }) => !commandExistsFn(command, { env, platform }))
    .map(({ label }) => `${label} was not found in PATH.`);

  if (platform === 'win32' && !getWindowsShellCommand({ env, platform, commandExistsFn })) {
    missing.push('PowerShell (pwsh.exe or powershell.exe) was not found.');
  }

  return missing;
}

export function getAvailableCliTabs({
  env = process.env,
  platform = process.platform,
  commandExistsFn = commandExists
} = {}) {
  return CLI_COMMANDS.filter(({ command }) => commandExistsFn(command, { env, platform }));
}

export function getMissingCliLabels({
  env = process.env,
  platform = process.platform,
  commandExistsFn = commandExists
} = {}) {
  return CLI_COMMANDS
    .filter(({ command }) => !commandExistsFn(command, { env, platform }))
    .map(({ label }) => label);
}

export function launchTerminals({ cwd = process.cwd(), env = process.env, platform = process.platform, tabs = CLI_COMMANDS } = {}) {
  const executable = platform === 'win32' ? 'wt.exe' : 'osascript';
  const shellCommand = platform === 'win32' ? getWindowsShellCommand({ env, platform }) : undefined;
  if (platform === 'win32' && !shellCommand) {
    throw new Error('PowerShell (pwsh.exe or powershell.exe) was not found.');
  }

  const args = platform === 'win32'
    ? buildWtArgs({ cwd, tabs, shellCommand })
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

export async function main(args = process.argv.slice(2), options = {}) {
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

  const inspectedClis = inspectCliCommands(options);
  const missingClis = getMissingLabelsFromInspection(inspectedClis);
  for (const label of missingClis) {
    console.warn(`Warning: ${label} was not found in PATH, skipping.`);
  }

  const availableTabs = getAvailableTabsFromInspection(inspectedClis);
  if (availableTabs.length === 0) {
    console.error(`${COMMAND} cannot start: no CLI tools found in PATH.`);
    return 1;
  }

  let tabsToLaunch = availableTabs;
  if (parsed.interactive) {
    const input = options.input ?? process.stdin;
    const output = options.output ?? process.stdout;
    if (!isInteractiveTerminal({ input, output })) {
      console.error(`${COMMAND} cannot prompt in a non-interactive terminal.`);
      console.error(`Run "${COMMAND} --all" to open every available CLI without prompting.`);
      return 1;
    }

    const config = readConfig(options);
    let enabledClis;
    try {
      enabledClis = await promptForEnabledCliIds({
        input,
        output,
        inspectedClis,
        defaultEnabledCliIds: config.enabledClis,
        renderFn: options.renderFn
      });
    } catch (error) {
      if (error instanceof CliSelectionCancelledError) {
        console.error(`${COMMAND} cancelled.`);
        return 1;
      }

      throw error;
    }

    try {
      writeConfig({ ...options, enabledClis });
    } catch (error) {
      console.warn(`Warning: could not save CLI selection: ${error.message}`);
    }

    tabsToLaunch = filterTabsByEnabledCliIds(availableTabs, enabledClis);
    if (tabsToLaunch.length === 0) {
      console.error(`${COMMAND} cannot start: no selected CLI tools are available.`);
      return 1;
    }
  }

  const launchTerminalsFn = options.launchTerminalsFn ?? launchTerminals;
  launchTerminalsFn({ ...options, tabs: tabsToLaunch });
  const launched = tabsToLaunch.map(({ title }) => title).join(', ');
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
  main()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
