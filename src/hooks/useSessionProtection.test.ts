import assert from 'node:assert/strict';
import test from 'node:test';

import { sessionActivityMapsMatch, type SessionActivity } from './useSessionProtection';

function activity(overrides: Partial<SessionActivity> = {}): SessionActivity {
  return { statusText: null, canInterrupt: true, startedAt: 0, blocked: false, ...overrides };
}

// The equality check gates whether `setProcessingSessions` returns a new map
// reference. If it ignores `blocked`, a server blocked->unblocked transition
// would not re-render the sidebar — a silent regression. These pin that the
// `blocked` field participates in the comparison.

test('a blocked-flag difference alone counts as a mismatch', () => {
  const left = new Map([['s', activity({ blocked: false })]]);
  const right = new Map([['s', activity({ blocked: true })]]);

  assert.equal(sessionActivityMapsMatch(left, right), false);
});

test('identical maps (including blocked) match', () => {
  const left = new Map([['s', activity({ blocked: true, statusText: 'Working' })]]);
  const right = new Map([['s', activity({ blocked: true, statusText: 'Working' })]]);

  assert.equal(sessionActivityMapsMatch(left, right), true);
});

test('differing sizes are a mismatch', () => {
  const left = new Map([['s', activity()]]);
  const right = new Map<string, SessionActivity>();

  assert.equal(sessionActivityMapsMatch(left, right), false);
});

test('a key present on the left but missing on the right is a mismatch', () => {
  const left = new Map([['s', activity()]]);
  const right = new Map([['other', activity()]]);

  assert.equal(sessionActivityMapsMatch(left, right), false);
});
