import test from 'node:test';
import assert from 'node:assert/strict';

import React from 'react';
import { render as renderInk } from 'ink-testing-library';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  buildFlagItems,
  buildMacTerminalArgs,
  buildMacTerminalScript,
  buildWtArgs,
  CliSelectionPrompt,
  confirmCliSelection,
  createCliSelectionState,
  createFlagSelectionState,
  filterTabsByEnabledCliIds,
  FlagSelectionPrompt,
  getAvailableTabsFromInspection,
  getConfigPath,
  getMissingRequirements,
  getMissingLabelsFromInspection,
  getWindowsShellCommand,
  inspectCliCommands,
  isEntrypoint,
  main,
  moveCliSelectionCursor,
  normalizeCliArgs,
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
  assert.deepEqual(parseArgs([]), { action: 'open', interactive: true, useSavedSelection: false });
  assert.deepEqual(parseArgs(['--all']), { action: 'open', interactive: false, useSavedSelection: false });
  assert.deepEqual(parseArgs(['--no-interactive']), { action: 'open', interactive: false, useSavedSelection: false });
  assert.deepEqual(parseArgs(['--last']), { action: 'open', interactive: false, useSavedSelection: true });
});

test('parseArgs rejects unknown options', () => {
  assert.deepEqual(parseArgs(['--bad-option']), {
    action: 'error',
    message: 'Unknown option: --bad-option'
  });
});

test('parseArgs rejects conflicting non-interactive launch modes', () => {
  assert.deepEqual(parseArgs(['--all', '--last']), {
    action: 'error',
    message: 'Cannot combine --last with --all or --no-interactive.'
  });
});

test('parseArgs accepts a display with each launch mode', () => {
  assert.deepEqual(parseArgs(['--list-displays']), { action: 'list-displays' });
  assert.deepEqual(parseArgs(['--display', '2']), {
    action: 'open', interactive: true, useSavedSelection: false, displayNumber: 2
  });
  assert.deepEqual(parseArgs(['--last', '--display', '2']), {
    action: 'open', interactive: false, useSavedSelection: true, displayNumber: 2
  });
  assert.deepEqual(parseArgs(['--display', '2', '--all']), {
    action: 'open', interactive: false, useSavedSelection: false, displayNumber: 2
  });
});

test('parseArgs rejects missing, invalid or conflicting display options', () => {
  for (const value of [undefined, '--all', '0', '-2', '2.5', '2e1', '9007199254740992']) {
    const args = value === undefined ? ['--display'] : ['--display', value];
    assert.match(parseArgs(args).message, /requires a positive display number/);
  }
  assert.match(parseArgs(['--display', '1', '--display', '2']).message, /only once/);
  assert.match(parseArgs(['--list-displays', '--last']).message, /on its own/);
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

test('normalizeCliArgs defaults to empty arrays and ignores unknown keys', () => {
  assert.deepEqual(normalizeCliArgs(null), { codex: [], claude: [], cursor: [] });
  assert.deepEqual(normalizeCliArgs({ codex: ['--yolo'], unknown: ['x'] }), {
    codex: ['--yolo'],
    claude: [],
    cursor: []
  });
  assert.deepEqual(normalizeCliArgs({ claude: ['--dangerously-skip-permissions'] }), {
    codex: [],
    claude: ['--dangerously-skip-permissions'],
    cursor: []
  });
});

test('readConfig returns saved selections and falls back to defaults on bad config', () => {
  const emptyCLiArgs = { codex: [], claude: [], cursor: [] };

  assert.deepEqual(
    readConfig({
      configPath: '/tmp/config.json',
      readFileFn: () => JSON.stringify({ enabledClis: ['cursor', 'bad'] })
    }),
    { enabledClis: ['cursor'], cliArgs: emptyCLiArgs }
  );

  assert.deepEqual(
    readConfig({
      configPath: '/tmp/config.json',
      readFileFn: () => JSON.stringify({
        enabledClis: ['codex'],
        cliArgs: { codex: ['--yolo'] }
      })
    }),
    { enabledClis: ['codex'], cliArgs: { codex: ['--yolo'], claude: [], cursor: [] } }
  );

  assert.deepEqual(
    readConfig({
      configPath: '/tmp/config.json',
      readFileFn: () => {
        throw new Error('missing');
      }
    }),
    { enabledClis: ['codex', 'claude', 'cursor'], cliArgs: emptyCLiArgs }
  );
});

test('writeConfig persists normalized selections and cliArgs', () => {
  const calls = [];
  const config = writeConfig({
    configPath: '/tmp/start-ai-cli/config.json',
    enabledClis: ['claude', 'bad', 'claude'],
    cliArgs: { claude: ['--dangerously-skip-permissions'], unknown: ['x'] },
    mkdirFn: (...args) => calls.push(['mkdir', ...args]),
    writeFileFn: (...args) => calls.push(['write', ...args])
  });

  assert.deepEqual(config, {
    enabledClis: ['claude'],
    cliArgs: { codex: [], claude: ['--dangerously-skip-permissions'], cursor: [] }
  });
  assert.deepEqual(calls[0], ['mkdir', '/tmp/start-ai-cli', { recursive: true }]);
  assert.equal(calls[1][0], 'write');
  assert.equal(calls[1][1], '/tmp/start-ai-cli/config.json');
  assert.deepEqual(JSON.parse(calls[1][2]), {
    enabledClis: ['claude'],
    cliArgs: { codex: [], claude: ['--dangerously-skip-permissions'], cursor: [] }
  });
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

test('buildFlagItems returns preset flags only for CLIs that have them', () => {
  assert.deepEqual(buildFlagItems(['codex', 'cursor']), [
    { cliId: 'codex', flag: '--yolo', description: 'Full auto mode, skip all confirmations' }
  ]);
  assert.deepEqual(buildFlagItems(['claude']), [
    { cliId: 'claude', flag: '--dangerously-skip-permissions', description: 'Full access, skip permission checks' }
  ]);
  assert.deepEqual(buildFlagItems(['cursor']), []);
});

test('createFlagSelectionState defaults from saved cliArgs', () => {
  const flagItems = [
    { cliId: 'codex', flag: '--yolo', description: 'Full auto mode' },
    { cliId: 'claude', flag: '--dangerously-skip-permissions', description: 'Full access' }
  ];

  const state = createFlagSelectionState({
    flagItems,
    defaultCliArgs: { codex: ['--yolo'], claude: [], cursor: [] }
  });

  assert.equal(state.cursorIndex, 0);
  assert.equal(state.selected.codex.has('--yolo'), true);
  assert.equal(state.selected.claude?.has('--dangerously-skip-permissions') ?? false, false);
});

test('FlagSelectionPrompt renders flag items with check state', () => {
  const flagItems = [
    { cliId: 'codex', flag: '--yolo', description: 'Full auto mode, skip all confirmations' }
  ];

  const app = renderInk(React.createElement(FlagSelectionPrompt, {
    flagItems,
    defaultCliArgs: { codex: ['--yolo'], claude: [], cursor: [] },
    onSubmit: () => {},
    onCancel: () => {}
  }));

  const frame = app.lastFrame();
  assert.match(frame, /Configure launch flags/);
  assert.match(frame, /\[x\] codex: --yolo/);
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

test('buildWtArgs sends all tabs to a new window at the requested coordinates', () => {
  const launch = {
    cwd: 'C:\\project',
    tabs: [{ title: 'Codex', command: 'codex' }, { title: 'Claude', command: 'claude' }]
  };

  assert.deepEqual(buildWtArgs({ ...launch, display: { x: -1280, y: -400 } }), [
    '--window', 'new', '--pos', '-1280,-400',
    ...buildWtArgs(launch)
  ]);
});

test('buildWtArgs appends extraArgs to the command', () => {
  const args = buildWtArgs({
    cwd: 'D:\\repo\\start-ai',
    tabs: [
      { command: 'codex', title: 'Codex', extraArgs: ['--yolo'] },
      { command: 'claude', title: 'Claude', extraArgs: ['--dangerously-skip-permissions'] }
    ]
  });

  assert.deepEqual(args, [
    'new-tab', '--title', 'Codex', '-d', 'D:\\repo\\start-ai',
    'pwsh.exe', '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', 'codex --yolo',
    ';',
    'new-tab', '--title', 'Claude', '-d', 'D:\\repo\\start-ai',
    'pwsh.exe', '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', 'claude --dangerously-skip-permissions'
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

test('buildMacTerminalScript appends extraArgs to commands', () => {
  const script = buildMacTerminalScript({
    cwd: "/Users/test/project",
    tabs: [
      { command: 'codex', extraArgs: ['--yolo'] }
    ]
  });

  assert.match(script, /cd '\/Users\/test\/project' && codex --yolo/);
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

const primaryDisplay = { primary: true, width: 1920, height: 1080, x: 16, y: 16 };
const secondaryDisplay = { primary: false, width: 1440, height: 900, x: -1424, y: 16 };

test('main lists displays without checking for terminal or CLI commands', async (t) => {
  const log = t.mock.method(console, 'log', () => {});

  assert.equal(await main(['--list-displays'], {
    platform: 'win32',
    getWindowsDisplaysFn: () => [primaryDisplay, secondaryDisplay],
    commandExistsFn: () => assert.fail('Unexpected command lookup')
  }), 0);
  assert.equal(log.mock.calls[0].arguments[0], 'Available displays:\n  1  1920x1080 (primary)\n  2  1440x900');
});

test('main opens saved CLIs on the requested Windows display', async (t) => {
  const log = t.mock.method(console, 'log', () => {});
  const launch = t.mock.fn();

  assert.equal(await main(['--last', '--display', '2'], {
    platform: 'win32',
    commandExistsFn: () => true,
    readFileFn: () => JSON.stringify({
      enabledClis: ['claude', 'cursor'],
      cliArgs: { claude: ['--some-flag'] }
    }),
    getWindowsDisplaysFn: () => [primaryDisplay, secondaryDisplay],
    launchTerminalsFn: launch
  }), 0);
  const { tabs, display } = launch.mock.calls[0].arguments[0];
  assert.deepEqual(tabs.map(({ id, extraArgs }) => [id, extraArgs]), [
    ['claude', ['--some-flag']], ['cursor', []]
  ]);
  assert.equal(display, secondaryDisplay);
  assert.match(log.mock.calls[0].arguments[0], /on display 2/);
});

test('main refuses to launch when the selected display is unavailable', async (t) => {
  const error = t.mock.method(console, 'error', () => {});
  const launch = t.mock.fn();

  assert.equal(await main(['--all', '--display', '2'], {
    platform: 'win32',
    commandExistsFn: () => true,
    readFileFn: () => '{}',
    getWindowsDisplaysFn: () => [primaryDisplay],
    launchTerminalsFn: launch
  }), 1);
  assert.equal(launch.mock.callCount(), 0);
  assert.match(error.mock.calls[0].arguments[0], /Display 2 is unavailable.*\n  1  1920x1080 \(primary\)/);
});

test('main reports that display options require Windows', async (t) => {
  const error = t.mock.method(console, 'error', () => {});
  const options = {
    platform: 'darwin',
    commandExistsFn: () => assert.fail('Unexpected command lookup')
  };

  assert.equal(await main(['--list-displays'], options), 1);
  assert.equal(await main(['--last', '--display', '2'], options), 1);
  assert.match(error.mock.calls[0].arguments[0], /only supported on Windows/);
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
  let launchedTabs = [];
  console.log = (message) => logs.push(message);

  try {
    const exitCode = await main(['--all'], {
      platform: 'darwin',
      env: {},
      commandExistsFn: () => true,
      readFileFn: () => { throw new Error('no config'); },
      launchTerminalsFn: ({ tabs }) => {
        launchedTabs = tabs;
      }
    });

    assert.equal(exitCode, 0);
    assert.deepEqual(launchedTabs.map(({ id }) => id), ['codex', 'claude', 'cursor']);
    assert.deepEqual(launchedTabs.map(({ extraArgs }) => extraArgs), [[], [], []]);
    assert.equal(logs.at(-1), 'Opened Codex, Claude, Cursor in Terminal.app.');
  } finally {
    console.log = originalLog;
  }
});

test('main launches --all with saved cliArgs from config', async () => {
  const originalLog = console.log;
  console.log = () => {};
  let launchedTabs = [];

  try {
    const exitCode = await main(['--all'], {
      platform: 'darwin',
      env: {},
      commandExistsFn: () => true,
      readFileFn: () => JSON.stringify({
        enabledClis: ['codex'],
        cliArgs: { codex: ['--yolo'], claude: [], cursor: [] }
      }),
      launchTerminalsFn: ({ tabs }) => {
        launchedTabs = tabs;
      }
    });

    assert.equal(exitCode, 0);
    const codexTab = launchedTabs.find(({ id }) => id === 'codex');
    assert.deepEqual(codexTab.extraArgs, ['--yolo']);
  } finally {
    console.log = originalLog;
  }
});

test('main launches saved CLI selection when --last is used', async () => {
  const originalLog = console.log;
  const logs = [];
  let launchedTabs = [];
  console.log = (message) => logs.push(message);

  try {
    const exitCode = await main(['--last'], {
      platform: 'darwin',
      env: {},
      commandExistsFn: () => true,
      readFileFn: () => JSON.stringify({
        enabledClis: ['codex', 'cursor'],
        cliArgs: { codex: ['--yolo'], claude: ['--dangerously-skip-permissions'], cursor: [] }
      }),
      launchTerminalsFn: ({ tabs }) => {
        launchedTabs = tabs;
      }
    });

    assert.equal(exitCode, 0);
    assert.deepEqual(launchedTabs.map(({ id }) => id), ['codex', 'cursor']);
    assert.deepEqual(launchedTabs.map(({ extraArgs }) => extraArgs), [['--yolo'], []]);
    assert.equal(logs.at(-1), 'Opened Codex, Cursor in Terminal.app.');
  } finally {
    console.log = originalLog;
  }
});

test('main refuses --last when no saved CLI tools are available', async () => {
  const originalError = console.error;
  const originalWarn = console.warn;
  const errors = [];
  let launched = false;
  console.error = (message) => errors.push(message);
  console.warn = () => {};

  try {
    const exitCode = await main(['--last'], {
      platform: 'darwin',
      env: {},
      commandExistsFn: (command) => command === 'codex' || command === 'osascript',
      readFileFn: () => JSON.stringify({ enabledClis: ['claude'], cliArgs: {} }),
      launchTerminalsFn: () => {
        launched = true;
      }
    });

    assert.equal(exitCode, 1);
    assert.equal(launched, false);
    assert.match(errors.join('\n'), /no saved CLI tools are available/);
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }
});

test('main prompts for CLIs then flags, saves both, and launches with args', async () => {
  const originalLog = console.log;
  const logs = [];
  const writes = [];
  let launchedTabs = [];
  let unmounted = false;
  let renderedDefaultEnabledCliIds = [];
  let renderCallCount = 0;
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
        renderCallCount++;
        if (renderCallCount === 1) {
          // CLI selection step
          renderedDefaultEnabledCliIds = element.props.defaultEnabledCliIds;
          queueMicrotask(() => element.props.onSubmit(['codex', 'cursor']));
        } else {
          // Flag selection step — select --yolo for codex
          queueMicrotask(() => element.props.onSubmit({ codex: ['--yolo'] }));
          unmounted = true;
        }
        return { unmount: () => {} };
      },
      launchTerminalsFn: ({ tabs }) => {
        launchedTabs = tabs;
      }
    });

    assert.equal(exitCode, 0);
    assert.equal(unmounted, true);
    assert.deepEqual(renderedDefaultEnabledCliIds, ['claude']);

    const writtenConfig = JSON.parse(writes[0][1]);
    assert.deepEqual(writtenConfig.enabledClis, ['codex', 'cursor']);
    assert.deepEqual(writtenConfig.cliArgs.codex, ['--yolo']);

    assert.deepEqual(launchedTabs.map(({ id }) => id), ['codex', 'cursor']);
    const codexTab = launchedTabs.find(({ id }) => id === 'codex');
    assert.deepEqual(codexTab.extraArgs, ['--yolo']);
    assert.equal(logs.at(-1), 'Opened Codex, Cursor in Terminal.app.');
  } finally {
    console.log = originalLog;
  }
});

test('main cancels at CLI selection without saving or opening terminals', async () => {
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

test('main cancels at flag selection without saving or opening terminals', async () => {
  const originalError = console.error;
  const errors = [];
  const writes = [];
  let launched = false;
  let renderCallCount = 0;
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
        renderCallCount++;
        if (renderCallCount === 1) {
          // CLI selection — submit with codex (which has flag presets)
          queueMicrotask(() => element.props.onSubmit(['codex']));
        } else {
          // Flag selection — cancel
          queueMicrotask(() => element.props.onCancel());
        }
        return { unmount: () => {} };
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
