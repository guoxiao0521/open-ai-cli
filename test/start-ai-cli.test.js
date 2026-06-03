import test from 'node:test';
import assert from 'node:assert/strict';

import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  buildMacTerminalArgs,
  buildMacTerminalScript,
  buildWtArgs,
  getMissingRequirements,
  isEntrypoint,
  parseArgs
} from '../bin/start-ai-cli.js';

test('parseArgs handles help and version flags', () => {
  assert.deepEqual(parseArgs(['--help']), { action: 'help' });
  assert.deepEqual(parseArgs(['-v']), { action: 'version' });
});

test('parseArgs rejects unknown options', () => {
  assert.deepEqual(parseArgs(['--bad-option']), {
    action: 'error',
    message: 'Unknown option: --bad-option'
  });
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
    'powershell.exe', '-NoExit', '-Command', 'codex-test',
    ';',
    'new-tab', '--title', 'Claude', '-d', 'D:\\repo\\start-ai',
    'powershell.exe', '-NoExit', '-Command', 'claude-test',
    ';',
    'new-tab', '--title', 'Cursor', '-d', 'D:\\repo\\start-ai',
    'powershell.exe', '-NoExit', '-Command', 'agent-test'
  ]);
});

test('buildWtArgs handles a single tab (skipped CLIs scenario)', () => {
  const args = buildWtArgs({
    cwd: 'D:\\repo\\start-ai',
    tabs: [{ command: 'claude-test', title: 'Claude' }]
  });

  assert.deepEqual(args, [
    'new-tab', '--title', 'Claude', '-d', 'D:\\repo\\start-ai',
    'powershell.exe', '-NoExit', '-Command', 'claude-test'
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

test('isEntrypoint accepts resolved script paths', () => {
  const scriptPath = fileURLToPath(new URL('../bin/start-ai-cli.js', import.meta.url));

  assert.equal(isEntrypoint(scriptPath, pathToFileURL(scriptPath).href), true);
});
