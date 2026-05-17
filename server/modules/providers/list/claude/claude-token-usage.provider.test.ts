import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { getClaudeSessionTokenUsage } from '@/modules/providers/list/claude/claude-token-usage.provider.js';

async function createSandboxJsonl(sessionId: string, lines: string[]): Promise<{
  filePath: string;
  cleanup: () => Promise<void>;
}> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'claude-token-usage-test-'));
  const projectDir = path.join(root, '.claude', 'projects', '-home-jkready');
  await fsp.mkdir(projectDir, { recursive: true });
  const filePath = path.join(projectDir, `${sessionId}.jsonl`);
  await fsp.writeFile(filePath, lines.join('\n') + (lines.length > 0 ? '\n' : ''));
  return {
    filePath,
    cleanup: () => fsp.rm(root, { recursive: true, force: true }),
  };
}

test('getClaudeSessionTokenUsage returns the latest assistant usage record from the JSONL file', async () => {
  const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const { filePath, cleanup } = await createSandboxJsonl(sessionId, [
    JSON.stringify({
      type: 'assistant',
      message: {
        usage: {
          input_tokens: 10,
          cache_creation_input_tokens: 20,
          cache_read_input_tokens: 30,
        },
      },
    }),
    JSON.stringify({
      type: 'assistant',
      message: {
        usage: {
          input_tokens: 100,
          cache_creation_input_tokens: 200,
          cache_read_input_tokens: 300,
        },
      },
    }),
  ]);

  try {
    const result = await getClaudeSessionTokenUsage(sessionId, {
      getSessionById: () => ({ jsonl_path: filePath, project_path: '/home/jkready' }),
      resolveJsonlPath: async () => filePath,
      readContextWindowOverride: () => null,
    });

    assert.deepEqual(result, {
      used: 600,
      total: 160000,
      breakdown: { input: 100, cacheCreation: 200, cacheRead: 300 },
    });
  } finally {
    await cleanup();
  }
});

test('getClaudeSessionTokenUsage returns an empty token-usage shape when the JSONL has no assistant usage records', async () => {
  // Empty case: a Claude session that has been opened but never received an
  // assistant reply with usage metadata. The frontend should still render a
  // valid (zero) token budget so we return the canonical shape instead of
  // surfacing the legacy 404.
  const sessionId = '11111111-2222-3333-4444-555555555555';
  const { filePath, cleanup } = await createSandboxJsonl(sessionId, [
    JSON.stringify({ type: 'user', message: { content: 'hello' } }),
  ]);

  try {
    const result = await getClaudeSessionTokenUsage(sessionId, {
      getSessionById: () => ({ jsonl_path: filePath, project_path: '/home/jkready' }),
      resolveJsonlPath: async () => filePath,
      readContextWindowOverride: () => null,
    });

    assert.deepEqual(result, {
      used: 0,
      total: 160000,
      breakdown: { input: 0, cacheCreation: 0, cacheRead: 0 },
    });
  } finally {
    await cleanup();
  }
});

test('getClaudeSessionTokenUsage returns an empty token-usage shape when the session has no JSONL file on disk', async () => {
  const sessionId = '22222222-3333-4444-5555-666666666666';
  const result = await getClaudeSessionTokenUsage(sessionId, {
    getSessionById: () => null,
    resolveJsonlPath: async () => null,
    readContextWindowOverride: () => null,
  });

  assert.deepEqual(result, {
    used: 0,
    total: 160000,
    breakdown: { input: 0, cacheCreation: 0, cacheRead: 0 },
  });
});

test('getClaudeSessionTokenUsage honors the CONTEXT_WINDOW override', async () => {
  const sessionId = '33333333-4444-5555-6666-777777777777';
  const result = await getClaudeSessionTokenUsage(sessionId, {
    getSessionById: () => null,
    resolveJsonlPath: async () => null,
    readContextWindowOverride: () => 256000,
  });

  assert.equal(result.total, 256000);
  assert.equal(result.used, 0);
});

test('getClaudeSessionTokenUsage skips malformed JSONL lines and still returns the latest valid usage', async () => {
  const sessionId = '44444444-5555-6666-7777-888888888888';
  const { filePath, cleanup } = await createSandboxJsonl(sessionId, [
    JSON.stringify({
      type: 'assistant',
      message: { usage: { input_tokens: 1, cache_creation_input_tokens: 2, cache_read_input_tokens: 3 } },
    }),
    '{this is not valid json',
    JSON.stringify({
      type: 'assistant',
      message: { usage: { input_tokens: 5, cache_creation_input_tokens: 7, cache_read_input_tokens: 11 } },
    }),
  ]);

  try {
    const result = await getClaudeSessionTokenUsage(sessionId, {
      getSessionById: () => ({ jsonl_path: filePath, project_path: '/home/jkready' }),
      resolveJsonlPath: async () => filePath,
      readContextWindowOverride: () => null,
    });

    assert.deepEqual(result.breakdown, { input: 5, cacheCreation: 7, cacheRead: 11 });
    assert.equal(result.used, 23);
  } finally {
    await cleanup();
  }
});
