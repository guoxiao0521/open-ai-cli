import test from 'node:test';
import assert from 'node:assert/strict';

import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildWtArgs, getMissingRequirements, isEntrypoint, parseArgs } from '../bin/start-ai-cli.js';

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

test('getMissingRequirements rejects non-Windows platforms before PATH checks', () => {
  assert.deepEqual(getMissingRequirements({ platform: 'linux' }), ['Windows is required.']);
});

test('isEntrypoint accepts resolved script paths', () => {
  const scriptPath = fileURLToPath(new URL('../bin/start-ai-cli.js', import.meta.url));

  assert.equal(isEntrypoint(scriptPath, pathToFileURL(scriptPath).href), true);
});
