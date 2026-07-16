import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractTitleCandidatesFromLines,
  pickDiscoveredSessionName,
} from '@/modules/providers/list/claude/session-title.js';

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

// --- extractTitleCandidatesFromLines (the transcript scan) ---

const S = 'sess-123';
const line = (obj: object) => JSON.stringify(obj);

test('scan: keeps the most-recent value of each title type (newest-first)', () => {
  const lines = [
    line({ type: 'ai-title', aiTitle: 'Old Title', sessionId: S }),
    line({ type: 'user', text: 'a message', sessionId: S }),
    line({ type: 'ai-title', aiTitle: 'Newest Title', sessionId: S }),
    line({ type: 'last-prompt', lastPrompt: 'do the thing', sessionId: S }),
    line({ type: 'custom-title', customTitle: 'Renamed', sessionId: S }),
  ];
  const c = extractTitleCandidatesFromLines(lines, S);
  assert.equal(c.aiTitle, 'Newest Title'); // not the older 'Old Title'
  assert.equal(c.lastPrompt, 'do the thing');
  assert.equal(c.customTitle, 'Renamed');
});

test('scan: skips events belonging to a different session', () => {
  const lines = [
    line({ type: 'ai-title', aiTitle: 'Other Session', sessionId: 'other' }),
    line({ type: 'ai-title', aiTitle: 'Mine', sessionId: S }),
  ];
  assert.equal(extractTitleCandidatesFromLines(lines, S).aiTitle, 'Mine');
});

test('scan: skips blank and non-JSON lines', () => {
  const lines = ['', '   ', 'not json {', line({ type: 'ai-title', aiTitle: 'Good', sessionId: S })];
  assert.equal(extractTitleCandidatesFromLines(lines, S).aiTitle, 'Good');
});

test('scan: an empty/whitespace title value does not claim the slot', () => {
  const lines = [
    line({ type: 'ai-title', aiTitle: 'Real', sessionId: S }),     // older, real
    line({ type: 'ai-title', aiTitle: '   ', sessionId: S }),      // newer, blank → ignored
  ];
  assert.equal(extractTitleCandidatesFromLines(lines, S).aiTitle, 'Real');
});

test('scan: trims stored values', () => {
  const lines = [line({ type: 'ai-title', aiTitle: '  Padded Title  ', sessionId: S })];
  assert.equal(extractTitleCandidatesFromLines(lines, S).aiTitle, 'Padded Title');
});

test('scan: returns an empty object when there are no title events', () => {
  assert.deepEqual(extractTitleCandidatesFromLines([line({ type: 'user', text: 'hi', sessionId: S })], S), {});
});
