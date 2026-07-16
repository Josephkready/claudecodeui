import assert from 'node:assert/strict';
import test from 'node:test';

import { pickDiscoveredSessionName } from '@/modules/providers/list/claude/session-title.js';

test('a user rename (custom-title) wins over everything', () => {
  assert.equal(
    pickDiscoveredSessionName(
      { customTitle: 'My Renamed Session', aiTitle: 'AI Title', lastPrompt: 'last thing typed' },
      'the first prompt I typed',
    ),
    'My Renamed Session',
  );
});

test('the ai-title is preferred over the first-prompt display (the #5 fix)', () => {
  assert.equal(
    pickDiscoveredSessionName(
      { aiTitle: 'Refactor the auth flow' },
      'can you refactor the auth flow please and also handle the edge cases',
    ),
    'Refactor the auth flow',
  );
});

test('the ai-title also wins over a more recent last-prompt', () => {
  assert.equal(
    pickDiscoveredSessionName({ aiTitle: 'Design the deploy doc', lastPrompt: 'ok now do X' }, 'first prompt'),
    'Design the deploy doc',
  );
});

test('falls back to the first-prompt display when no ai/custom title exists', () => {
  assert.equal(
    pickDiscoveredSessionName({ lastPrompt: 'the last thing I typed' }, 'the first thing I typed'),
    'the first thing I typed',
  );
});

test('falls back to last-prompt when there is no title and no first-prompt display', () => {
  assert.equal(
    pickDiscoveredSessionName({ lastPrompt: 'the last thing I typed' }, undefined),
    'the last thing I typed',
  );
});

test('an empty/whitespace first-prompt display is treated as absent (falls through to last-prompt)', () => {
  assert.equal(pickDiscoveredSessionName({ lastPrompt: 'fallback' }, '   '), 'fallback');
  assert.equal(pickDiscoveredSessionName({ lastPrompt: 'fallback' }, ''), 'fallback');
});

test('an empty display with no other candidate yields undefined (caller normalizes)', () => {
  assert.equal(pickDiscoveredSessionName({}, ''), undefined);
});

test('returns undefined when nothing is available', () => {
  assert.equal(pickDiscoveredSessionName({}, undefined), undefined);
});
