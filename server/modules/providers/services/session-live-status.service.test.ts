import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  classifyClaudeLiveStatus,
  resolveSessionLiveStatus,
} from './session-live-status.service.js';

const NOW = Date.parse('2026-07-19T12:00:00.000Z');
const SECONDS = 1_000;
const MINUTES = 60 * SECONDS;

// --- Transcript line builders (Claude on-disk JSONL shape) ---

function assistantToolUse(id: string): string {
  return JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: { command: 'ls' } }] },
    timestamp: '2026-07-19T11:59:58.000Z',
  });
}

function userToolResult(toolUseId: string): string {
  return JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content: 'ok', is_error: false }] },
    timestamp: '2026-07-19T11:59:59.000Z',
  });
}

function assistantText(text: string): string {
  return JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text }] },
    timestamp: '2026-07-19T11:59:59.000Z',
  });
}

// An assistant turn parked on an unanswered tool_use is the on-disk proxy for
// "awaiting the user" (permission / plan approval / a slow tool).
const AWAITING_TAIL = [assistantText('working on it'), assistantToolUse('tool-1')].join('\n');
// Same tool, then its result: the turn advanced, nothing is waiting on me.
const ACTIVE_TAIL = [assistantToolUse('tool-1'), userToolResult('tool-1')].join('\n');

test('recent transcript + pending tool_use (awaiting input) => blocked', () => {
  assert.equal(classifyClaudeLiveStatus(AWAITING_TAIL, NOW - 2 * SECONDS, NOW), 'blocked');
});

test('recent transcript + resolved/active last event => working', () => {
  assert.equal(classifyClaudeLiveStatus(ACTIVE_TAIL, NOW - 2 * SECONDS, NOW), 'working');
});

test('old transcript => idle regardless of last event', () => {
  assert.equal(classifyClaudeLiveStatus(AWAITING_TAIL, NOW - 30 * MINUTES, NOW), 'idle');
  assert.equal(classifyClaudeLiveStatus(ACTIVE_TAIL, NOW - 30 * MINUTES, NOW), 'idle');
});

test('a pending turn past the awaiting-input window (but stale) is idle, not blocked', () => {
  // 6 min old: beyond the 5-min awaiting-input window and the 15s working window.
  assert.equal(classifyClaudeLiveStatus(AWAITING_TAIL, NOW - 6 * MINUTES, NOW), 'idle');
});

test('an unanswered tool_use up to ~5 min old still ranks blocked (parked prompt)', () => {
  assert.equal(classifyClaudeLiveStatus(AWAITING_TAIL, NOW - 4 * MINUTES, NOW), 'blocked');
});

test('a resolved turn older than the working window is idle', () => {
  // 20s old: past the 15s working window, not awaiting input.
  assert.equal(classifyClaudeLiveStatus(ACTIVE_TAIL, NOW - 20 * SECONDS, NOW), 'idle');
});

test('empty / whitespace tail with a fresh mtime is working (nothing pending)', () => {
  assert.equal(classifyClaudeLiveStatus('', NOW - 1 * SECONDS, NOW), 'working');
  assert.equal(classifyClaudeLiveStatus('  \n\n', NOW - 1 * SECONDS, NOW), 'working');
});

test('a truncated leading line is tolerated; the last complete record decides', () => {
  const tail = ['{"type":"assist', assistantToolUse('tool-9')].join('\n');
  assert.equal(classifyClaudeLiveStatus(tail, NOW - 2 * SECONDS, NOW), 'blocked');
});

test('multiple tool_use in the last turn: any unresolved one is blocked', () => {
  const line = JSON.stringify({
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [
        { type: 'tool_use', id: 'a', name: 'Read', input: {} },
        { type: 'tool_use', id: 'b', name: 'Bash', input: {} },
      ],
    },
  });
  const tail = [line, userToolResult('a')].join('\n');
  assert.equal(classifyClaudeLiveStatus(tail, NOW - 2 * SECONDS, NOW), 'blocked');
});

async function withTempTranscript(
  contents: string,
  run: (jsonlPath: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'live-status-'));
  const jsonlPath = path.join(dir, 'session.jsonl');
  try {
    await writeFile(jsonlPath, contents, 'utf8');
    await run(jsonlPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('resolveSessionLiveStatus reads a fresh claude transcript and reports blocked', async () => {
  await withTempTranscript(AWAITING_TAIL, async (jsonlPath) => {
    const status = await resolveSessionLiveStatus({
      provider: 'claude',
      sessionId: 'sess-1',
      jsonlPath,
      projectPath: null,
    });
    assert.equal(status, 'blocked');
  });
});

test('resolveSessionLiveStatus reports working for a fresh, non-waiting transcript', async () => {
  await withTempTranscript(ACTIVE_TAIL, async (jsonlPath) => {
    const status = await resolveSessionLiveStatus({
      provider: 'claude',
      sessionId: 'sess-2',
      jsonlPath,
      projectPath: null,
    });
    assert.equal(status, 'working');
  });
});

test('resolveSessionLiveStatus is idle for non-claude providers (no misparse risk)', async () => {
  await withTempTranscript(AWAITING_TAIL, async (jsonlPath) => {
    const status = await resolveSessionLiveStatus({
      provider: 'codex',
      sessionId: 'sess-3',
      jsonlPath,
      projectPath: null,
    });
    assert.equal(status, 'idle');
  });
});

test('resolveSessionLiveStatus is idle when the transcript cannot be located', async () => {
  const status = await resolveSessionLiveStatus({
    provider: 'claude',
    sessionId: 'missing',
    jsonlPath: '/nonexistent/path/session.jsonl',
    projectPath: null,
  });
  assert.equal(status, 'idle');
});
