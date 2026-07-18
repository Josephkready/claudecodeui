import assert from 'node:assert/strict';
import test from 'node:test';

import { createNormalizedMessage } from '@/shared/utils.js';
import type { NormalizedMessage } from '@/shared/types.js';

import { attachCodexToolResults } from './codex-sessions.provider.js';

const toolUse = (toolId: string, filePath: string): NormalizedMessage =>
  createNormalizedMessage({
    provider: 'codex',
    kind: 'tool_use',
    toolName: 'Edit',
    toolInput: { file_path: filePath },
    toolId,
  });

const toolResult = (toolId: string, content: string, isError = false): NormalizedMessage =>
  createNormalizedMessage({
    provider: 'codex',
    kind: 'tool_result',
    toolId,
    content,
    isError,
  });

test('multi-file apply_patch attaches the shared result to only the last Edit (#119)', () => {
  // One apply_patch touching three files is expanded into three Edits that all
  // reuse the same call_id, followed by a single shared output.
  const a = toolUse('call-1', 'src/a.ts');
  const b = toolUse('call-1', 'src/b.ts');
  const c = toolUse('call-1', 'src/c.ts');
  const normalized: NormalizedMessage[] = [a, b, c, toolResult('call-1', 'Success. Updated 3 files')];

  attachCodexToolResults(normalized);

  // Earlier Edits stay output-less; the result renders once under the last file.
  assert.equal(a.toolResult, undefined);
  assert.equal(b.toolResult, undefined);
  assert.deepEqual(c.toolResult, { content: 'Success. Updated 3 files', isError: false });
});

test('single-file tool_use still receives its result (common path unbroken)', () => {
  const use = toolUse('call-1', 'src/only.ts');
  const normalized: NormalizedMessage[] = [use, toolResult('call-1', 'Success. Updated 1 file')];

  attachCodexToolResults(normalized);

  assert.deepEqual(use.toolResult, { content: 'Success. Updated 1 file', isError: false });
});

test('an error result is preserved and attached to the last Edit only', () => {
  const a = toolUse('call-1', 'src/a.ts');
  const b = toolUse('call-1', 'src/b.ts');
  const normalized: NormalizedMessage[] = [a, b, toolResult('call-1', 'patch failed', true)];

  attachCodexToolResults(normalized);

  assert.equal(a.toolResult, undefined);
  assert.deepEqual(b.toolResult, { content: 'patch failed', isError: true });
});

test('independent call_ids each keep their own result', () => {
  const first = toolUse('call-1', 'src/a.ts');
  const second = toolUse('call-2', 'src/b.ts');
  const normalized: NormalizedMessage[] = [
    first,
    toolResult('call-1', 'first output'),
    second,
    toolResult('call-2', 'second output'),
  ];

  attachCodexToolResults(normalized);

  assert.deepEqual(first.toolResult, { content: 'first output', isError: false });
  assert.deepEqual(second.toolResult, { content: 'second output', isError: false });
});

test('a tool_use with no matching result is left untouched', () => {
  const orphan = toolUse('call-lonely', 'src/a.ts');
  const normalized: NormalizedMessage[] = [orphan];

  attachCodexToolResults(normalized);

  assert.equal(orphan.toolResult, undefined);
});
