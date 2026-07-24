import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CLAUDE_FALLBACK_MODELS,
  findClaudeModelOption,
} from '@/modules/providers/list/claude/claude-models.provider.js';

// Effort tiers the Claude Code CLI accepts. A catalog entry offering anything
// outside this set would surface a picker option the CLI rejects at run time.
const CLAUDE_EFFORT_TIERS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

test('every catalog entry has a unique value', () => {
  const values = CLAUDE_FALLBACK_MODELS.OPTIONS.map((option) => option.value);
  assert.equal(new Set(values).size, values.length, `duplicate model values: ${values.join(', ')}`);
});

test('the catalog DEFAULT resolves to a listed option', () => {
  assert.ok(
    findClaudeModelOption(CLAUDE_FALLBACK_MODELS.DEFAULT),
    `DEFAULT "${CLAUDE_FALLBACK_MODELS.DEFAULT}" is not present in OPTIONS`,
  );
});

test('every option offers only effort tiers the CLI accepts', () => {
  for (const option of CLAUDE_FALLBACK_MODELS.OPTIONS) {
    for (const { value } of option.effort?.values ?? []) {
      assert.ok(
        CLAUDE_EFFORT_TIERS.has(value),
        `model "${option.value}" offers unknown effort tier "${value}"`,
      );
    }
  }
});

test('every effort-capable option defaults to a tier it actually offers', () => {
  for (const option of CLAUDE_FALLBACK_MODELS.OPTIONS) {
    const defaultEffort = option.effort?.default;
    if (!defaultEffort) {
      continue;
    }

    const offered = option.effort?.values.map((entry) => entry.value) ?? [];
    assert.ok(
      offered.includes(defaultEffort),
      `model "${option.value}" defaults to effort "${defaultEffort}" but only offers ${offered.join(', ')}`,
    );
  }
});

test('the Opus and Sonnet entries expose the full Opus 5 / Sonnet 5 effort ladder', () => {
  // Both generations support xhigh. resolveClaudeEffort() gates on this list, so
  // omitting a tier here silently drops the user's effort selection.
  for (const model of ['default', 'sonnet', 'sonnet[1m]', 'opus', 'opus[1m]', 'fable']) {
    const offered = findClaudeModelOption(model)?.effort?.values.map((entry) => entry.value) ?? [];
    assert.deepEqual(
      offered,
      ['low', 'medium', 'high', 'xhigh', 'max'],
      `model "${model}" does not offer the full effort ladder`,
    );
  }
});

test('findClaudeModelOption trims input and rejects blank or unknown models', () => {
  assert.equal(findClaudeModelOption('  opus[1m]  ')?.value, 'opus[1m]');
  assert.equal(findClaudeModelOption('   '), null);
  assert.equal(findClaudeModelOption(undefined), null);
  assert.equal(findClaudeModelOption('not-a-real-model'), null);
});
