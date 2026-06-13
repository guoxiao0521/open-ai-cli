import test from 'node:test';
import assert from 'node:assert/strict';

import React from 'react';
import { render as renderInk } from 'ink-testing-library';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  buildMacTerminalArgs,
  buildMacTerminalScript,
  buildWtArgs,
  CliSelectionPrompt,
  confirmCliSelection,
  createCliSelectionState,
  filterTabsByEnabledCliIds,
  getAvailableTabsFromInspection,
  getConfigPath,
  getMissingRequirements,
  getMissingLabelsFromInspection,
  getWindowsShellCommand,
  inspectCliCommands,
  isEntrypoint,
  main,
  moveCliSelectionCursor,
  normalizeEnabledCliIds,
  parseArgs,
  readConfig,
  toggleCliSelectionAtCursor,
  writeConfig
} from '../bin/start-ai-cli.js';

test('parseArgs handles help and version flags', () => {
  assert.deepEqual(parseArgs(['--help']), { action: 'help' });
  assert.deepEqual(parseArgs(['-v']), { action: 'version' });
});

test('parseArgs uses interactive mode by default and supports non-interactive launch', () => {
  assert.deepEqual(parseArgs([]), { action: 'open', interactive: true });
  assert.deepEqual(parseArgs(['--all']), { action: 'open', interactive: false });
  assert.deepEqual(parseArgs(['--no-interactive']), { action: 'open', interactive: false });
});

test('parseArgs rejects unknown options', () => {
  assert.deepEqual(parseArgs(['--bad-option']), {
    action: 'error',
    message: 'Unknown option: --bad-option'
  });
});

test('getConfigPath resolves the global config file under the user home directory', () => {
  assert.equal(
    getConfigPath({ homeDirectory: 'tester' }).replaceAll('\\', '/').endsWith('tester/.start-ai-cli/config.json'),
    true
  );
});

test('normalizeEnabledCliIds defaults to all tools and filters invalid ids', () => {
  assert.deepEqual(normalizeEnabledCliIds(null), ['codex', 'claude', 'cursor']);
  assert.deepEqual(normalizeEnabledCliIds(['cursor', 'bad', 'codex', 'cursor']), ['cursor', 'codex']);
  assert.deepEqual(normalizeEnabledCliIds([]), []);
});

test('readConfig returns saved selections and falls back to defaults on bad config', () => {
  assert.deepEqual(
    readConfig({
      configPath: '/tmp/config.json',
      readFileFn: () => JSON.stringify({ enabledClis: ['cursor', 'bad'] })
    }),
    { enabledClis: ['cursor'] }
  );

  assert.deepEqual(
    readConfig({
      configPath: '/tmp/config.json',
      readFileFn: () => {
        throw new Error('missing');
      }
    }),
    { enabledClis: ['codex', 'claude', 'cursor'] }
  );
});

test('writeConfig persists normalized selections', () => {
  const calls = [];
  const config = writeConfig({
    configPath: '/tmp/start-ai-cli/config.json',
    enabledClis: ['claude', 'bad', 'claude'],
    mkdirFn: (...args) => calls.push(['mkdir', ...args]),
    writeFileFn: (...args) => calls.push(['write', ...args])
  });

  assert.deepEqual(config, { enabledClis: ['claude'] });
  assert.deepEqual(calls[0], ['mkdir', '/tmp/start-ai-cli', { recursive: true }]);
  assert.equal(calls[1][0], 'write');
  assert.equal(calls[1][1], '/tmp/start-ai-cli/config.json');
  assert.deepEqual(JSON.parse(calls[1][2]), { enabledClis: ['claude'] });
  assert.equal(calls[1][3], 'utf8');
});

test('inspectCliCommands records availability once for each supported tool', () => {
  const inspected = inspectCliCommands({
    platform: 'darwin',
    env: {},
    commandExistsFn: (command) => command !== 'agent'
  });

  assert.deepEqual(getAvailableTabsFromInspection(inspected).map(({ id }) => id), ['codex', 'claude']);
  assert.deepEqual(getMissingLabelsFromInspection(inspected), ['Cursor CLI (agent)']);
});

test('filterTabsByEnabledCliIds keeps selected available tabs in launcher order', () => {
  const tabs = [
    { id: 'codex', title: 'Codex' },
    { id: 'claude', title: 'Claude' },
    { id: 'cursor', title: 'Cursor' }
  ];

  assert.deepEqual(filterTabsByEnabledCliIds(tabs, ['cursor', 'codex']), [
    { id: 'codex', title: 'Codex' },
    { id: 'cursor', title: 'Cursor' }
  ]);
});

test('createCliSelectionState filters missing defaults and focuses first available CLI', () => {
  const state = createCliSelectionState({
    inspectedClis: [
      { id: 'codex', available: false },
      { id: 'claude', available: true },
      { id: 'cursor', available: true }
    ],
    defaultEnabledCliIds: ['codex', 'cursor']
  });

  assert.equal(state.cursorIndex, 1);
  assert.deepEqual(state.selectedIds, ['cursor']);
  assert.equal(state.errorMessage, null);
});

test('moveCliSelectionCursor skips disabled CLI entries', () => {
  const inspectedClis = [
    { id: 'codex', available: true },
    { id: 'claude', available: false },
    { id: 'cursor', available: true }
  ];
  const state = { cursorIndex: 0, selectedIds: ['codex'], errorMessage: 'old error' };

  assert.deepEqual(moveCliSelectionCursor({ state, inspectedClis, direction: 1 }), {
    cursorIndex: 2,
    selectedIds: ['codex'],
    errorMessage: null
  });
  assert.deepEqual(moveCliSelectionCursor({ state, inspectedClis, direction: -1 }), {
    cursorIndex: 2,
    selectedIds: ['codex'],
    errorMessage: null
  });
});

test('toggleCliSelectionAtCursor toggles available CLI entries in launcher order', () => {
  const inspectedClis = [
    { id: 'codex', available: true },
    { id: 'claude', available: true },
    { id: 'cursor', available: true }
  ];

  const selected = toggleCliSelectionAtCursor({
    state: { cursorIndex: 2, selectedIds: ['codex'], errorMessage: 'old error' },
    inspectedClis
  });
  assert.deepEqual(selected, {
    cursorIndex: 2,
    selectedIds: ['codex', 'cursor'],
    errorMessage: null
  });

  const unselected = toggleCliSelectionAtCursor({
    state: selected,
    inspectedClis
  });
  assert.deepEqual(unselected.selectedIds, ['codex']);
});

test('toggleCliSelectionAtCursor ignores disabled CLI entries', () => {
  const state = { cursorIndex: 0, selectedIds: ['cursor'], errorMessage: null };
  const inspectedClis = [
    { id: 'codex', available: false },
    { id: 'cursor', available: true }
  ];

  assert.equal(toggleCliSelectionAtCursor({ state, inspectedClis }), state);
});

test('confirmCliSelection requires at least one available selected CLI', () => {
  const inspectedClis = [
    { id: 'codex', available: true },
    { id: 'cursor', available: false }
  ];

  assert.deepEqual(confirmCliSelection({
    state: { cursorIndex: 0, selectedIds: ['cursor'], errorMessage: null },
    inspectedClis
  }), {
    confirmed: false,
    state: {
      cursorIndex: 0,
      selectedIds: [],
      errorMessage: 'Select at least one available CLI.'
    }
  });

  assert.deepEqual(confirmCliSelection({
    state: { cursorIndex: 0, selectedIds: ['codex'], errorMessage: null },
    inspectedClis
  }), {
    confirmed: true,
    selectedIds: ['codex']
  });
});

test('CliSelectionPrompt renders available and disabled CLI states', () => {
  const app = renderInk(React.createElement(CliSelectionPrompt, {
    inspectedClis: [
      { id: 'codex', label: 'Codex CLI (codex)', available: true },
      { id: 'claude', label: 'Claude Code CLI (claude)', available: false }
    ],
    defaultEnabledCliIds: ['codex', 'claude'],
    onSubmit: () => {},
    onCancel: () => {}
  }));

  const frame = app.lastFrame();
  assert.match(frame, /> \[x\] Codex CLI \(codex\) - available/);
  assert.match(frame, /  \[ \] Claude Code CLI \(claude\) - not found in PATH/);
  app.unmount();
});

test('buildWtArgs opens all tabs in the requested directory', () => {
  const args = buildWtArgs({
    cwd: 'D:\\repo\\start-ai',
    tabs: [
      { command: 'codex-test', title: 'Codex' },
      { command: 'claude-test', title: 'Claude' },
      { command: 'agent-test', title: 'Cursor' }
    ]
  });

  assert.deepEqual(args, [
    'new-tab', '--title', 'Codex', '-d', 'D:\\repo\\start-ai',
    'pwsh.exe', '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', 'codex-test',
    ';',
    'new-tab', '--title', 'Claude', '-d', 'D:\\repo\\start-ai',
    'pwsh.exe', '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', 'claude-test',
    ';',
    'new-tab', '--title', 'Cursor', '-d', 'D:\\repo\\start-ai',
    'pwsh.exe', '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', 'agent-test'
  ]);
});

test('buildWtArgs handles a single tab (skipped CLIs scenario)', () => {
  const args = buildWtArgs({
    cwd: 'D:\\repo\\start-ai',
    tabs: [{ command: 'claude-test', title: 'Claude' }]
  });

  assert.deepEqual(args, [
    'new-tab', '--title', 'Claude', '-d', 'D:\\repo\\start-ai',
    'pwsh.exe', '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', 'claude-test'
  ]);
});

test('buildWtArgs uses the requested Windows shell command', () => {
  const args = buildWtArgs({
    cwd: 'D:\\repo\\start-ai',
    shellCommand: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    tabs: [{ command: 'codex-test', title: 'Codex' }]
  });

  assert.deepEqual(args, [
    'new-tab', '--title', 'Codex', '-d', 'D:\\repo\\start-ai',
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    '-NoExit',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    'codex-test'
  ]);
});

test('buildMacTerminalScript opens commands in the requested directory', () => {
  const script = buildMacTerminalScript({
    cwd: "/Users/test/my project",
    tabs: [
      { command: 'codex-test', title: 'Codex' },
      { command: 'claude-test', title: 'Claude' }
    ]
  });

  assert.equal(script, [
    'tell application "Terminal"',
    '  activate',
    '  do script "cd \'/Users/test/my project\' && codex-test"',
    '  do script "cd \'/Users/test/my project\' && claude-test"',
    'end tell'
  ].join('\n'));
});

test('buildMacTerminalArgs passes the AppleScript to osascript', () => {
  const args = buildMacTerminalArgs({
    cwd: "/Users/test/project",
    tabs: [{ command: 'agent-test', title: 'Cursor' }]
  });

  assert.deepEqual(args, [
    '-e',
    [
      'tell application "Terminal"',
      '  activate',
      '  do script "cd \'/Users/test/project\' && agent-test"',
      'end tell'
    ].join('\n')
  ]);
});

test('getMissingRequirements rejects unsupported platforms before PATH checks', () => {
  assert.deepEqual(getMissingRequirements({ platform: 'linux' }), ['Windows or macOS is required.']);
});

test('getMissingRequirements checks macOS hard requirements', () => {
  assert.deepEqual(getMissingRequirements({ platform: 'darwin', env: { PATH: '' } }), [
    'AppleScript runner (osascript) was not found in PATH.'
  ]);
});

test('getMissingRequirements checks Windows terminal and shell requirements', () => {
  assert.deepEqual(getMissingRequirements({ platform: 'win32', env: { PATH: '' } }), [
    'Windows Terminal (wt.exe) was not found in PATH.',
    'PowerShell (pwsh.exe or powershell.exe) was not found.'
  ]);
});

test('getWindowsShellCommand prefers PowerShell 7 when available', () => {
  const shell = getWindowsShellCommand({
    platform: 'win32',
    env: {},
    commandExistsFn: (command) => command === 'pwsh.exe',
    fileExistsFn: () => false
  });

  assert.equal(shell, 'pwsh.exe');
});

test('getWindowsShellCommand falls back to the system Windows PowerShell path', () => {
  const shell = getWindowsShellCommand({
    platform: 'win32',
    env: { SystemRoot: 'C:\\Windows' },
    commandExistsFn: () => false,
    fileExistsFn: (path) => path === 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
  });

  assert.equal(shell, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
});

test('main refuses default interactive mode in non-interactive terminals', async () => {
  const originalError = console.error;
  let launched = false;
  const errors = [];
  console.error = (message) => errors.push(message);

  try {
    const exitCode = await main([], {
      platform: 'darwin',
      env: {},
      commandExistsFn: () => true,
      input: { isTTY: false },
      output: { isTTY: false },
      launchTerminalsFn: () => {
        launched = true;
      }
    });

    assert.equal(exitCode, 1);
    assert.equal(launched, false);
    assert.match(errors.join('\n'), /cannot prompt in a non-interactive terminal/);
  } finally {
    console.error = originalError;
  }
});

test('main launches all available CLIs without prompting when --all is used', async () => {
  const originalLog = console.log;
  const logs = [];
  let launchedIds = [];
  console.log = (message) => logs.push(message);

  try {
    const exitCode = await main(['--all'], {
      platform: 'darwin',
      env: {},
      commandExistsFn: () => true,
      launchTerminalsFn: ({ tabs }) => {
        launchedIds = tabs.map(({ id }) => id);
      }
    });

    assert.equal(exitCode, 0);
    assert.deepEqual(launchedIds, ['codex', 'claude', 'cursor']);
    assert.equal(logs.at(-1), 'Opened Codex, Claude, Cursor in Terminal.app.');
  } finally {
    console.log = originalLog;
  }
});

test('main prompts, saves the selection, and launches selected available CLIs', async () => {
  const originalLog = console.log;
  const logs = [];
  const writes = [];
  let launchedIds = [];
  let unmounted = false;
  let renderedDefaultEnabledCliIds = [];
  console.log = (message) => logs.push(message);

  try {
    const exitCode = await main([], {
      platform: 'darwin',
      env: {},
      commandExistsFn: () => true,
      input: { isTTY: true },
      output: { isTTY: true, write: () => {} },
      configPath: '/tmp/start-ai-cli/config.json',
      readFileFn: () => JSON.stringify({ enabledClis: ['claude'] }),
      mkdirFn: () => {},
      writeFileFn: (...args) => writes.push(args),
      renderFn: (element) => {
        renderedDefaultEnabledCliIds = element.props.defaultEnabledCliIds;
        queueMicrotask(() => element.props.onSubmit(['codex', 'cursor']));
        return {
          unmount: () => {
            unmounted = true;
          }
        };
      },
      launchTerminalsFn: ({ tabs }) => {
        launchedIds = tabs.map(({ id }) => id);
      }
    });

    assert.equal(exitCode, 0);
    assert.equal(unmounted, true);
    assert.deepEqual(renderedDefaultEnabledCliIds, ['claude']);
    assert.deepEqual(JSON.parse(writes[0][1]), { enabledClis: ['codex', 'cursor'] });
    assert.deepEqual(launchedIds, ['codex', 'cursor']);
    assert.equal(logs.at(-1), 'Opened Codex, Cursor in Terminal.app.');
  } finally {
    console.log = originalLog;
  }
});

test('main cancels interactive launch without saving or opening terminals', async () => {
  const originalError = console.error;
  const errors = [];
  const writes = [];
  let launched = false;
  console.error = (message) => errors.push(message);

  try {
    const exitCode = await main([], {
      platform: 'darwin',
      env: {},
      commandExistsFn: () => true,
      input: { isTTY: true },
      output: { isTTY: true, write: () => {} },
      readFileFn: () => JSON.stringify({ enabledClis: ['codex'] }),
      writeFileFn: (...args) => writes.push(args),
      renderFn: (element) => {
        queueMicrotask(() => element.props.onCancel());
        return {
          unmount: () => {}
        };
      },
      launchTerminalsFn: () => {
        launched = true;
      }
    });

    assert.equal(exitCode, 1);
    assert.equal(launched, false);
    assert.deepEqual(writes, []);
    assert.match(errors.join('\n'), /start-ai-cli cancelled/);
  } finally {
    console.error = originalError;
  }
});

test('isEntrypoint accepts resolved script paths', () => {
  const scriptPath = fileURLToPath(new URL('../bin/start-ai-cli.js', import.meta.url));

  assert.equal(isEntrypoint(scriptPath, pathToFileURL(scriptPath).href), true);
});
