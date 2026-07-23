import test from 'node:test';
import assert from 'node:assert/strict';

import type { ChatMessage } from '../types/types';

import { stabilizeMessageIdentities } from './messageIdentity';

// `stabilizeMessageIdentities(previous, next)` returns an array whose VALUES are
// exactly `next`, but whose element object references are reused from
// `previous` wherever a message is unchanged. This is what lets
// `React.memo(MessageComponent)` skip re-rendering settled messages when the
// store rebuilds fresh ChatMessage objects on every streaming delta — only the
// message that actually changed gets a new identity and re-renders.

const msg = (o: Record<string, unknown>): ChatMessage =>
  ({ type: 'assistant', timestamp: '2026-01-01T00:00:00.000Z', ...o } as unknown as ChatMessage);

// Build a value-equal but reference-distinct copy, mirroring how
// normalizedToChatMessages mints brand-new objects for the same logical
// message on every store update. structuredClone preserves Date instances.
const rebuild = (messages: ChatMessage[]): ChatMessage[] =>
  messages.map((m) => structuredClone(m));

const sameValues = (result: ChatMessage[], next: ChatMessage[]) => {
  assert.equal(result.length, next.length);
  result.forEach((r, i) => assert.deepEqual(r, next[i]));
};

test('reuses previous references when every message is unchanged', () => {
  const previous = [msg({ id: 'a', content: 'one' }), msg({ id: 'b', content: 'two' })];
  const next = rebuild(previous);

  const result = stabilizeMessageIdentities(previous, next);

  sameValues(result, next);
  // Identity preserved: the returned elements are the PREVIOUS objects, not the
  // freshly-rebuilt `next` ones.
  assert.equal(result[0], previous[0]);
  assert.equal(result[1], previous[1]);
  assert.notEqual(result[0], next[0]);
  assert.notEqual(result[1], next[1]);
});

test('only the changed (streaming) message gets a fresh identity', () => {
  const previous = [
    msg({ id: 'a', content: 'settled one' }),
    msg({ id: 'b', content: 'settled two' }),
    msg({ id: 'stream', content: 'Hel', isStreaming: true }),
  ];
  const next = [
    structuredClone(previous[0]),
    structuredClone(previous[1]),
    msg({ id: 'stream', content: 'Hello wor', isStreaming: true }), // grew
  ];

  const result = stabilizeMessageIdentities(previous, next);

  sameValues(result, next);
  assert.equal(result[0], previous[0]); // reused
  assert.equal(result[1], previous[1]); // reused
  assert.equal(result[2], next[2]); // changed -> fresh
  assert.notEqual(result[2], previous[2]);
});

test('appended message reuses existing refs and keeps the new one fresh', () => {
  const previous = [msg({ id: 'a', content: 'one' }), msg({ id: 'b', content: 'two' })];
  const next = [
    structuredClone(previous[0]),
    structuredClone(previous[1]),
    msg({ id: 'c', content: 'three' }),
  ];

  const result = stabilizeMessageIdentities(previous, next);

  sameValues(result, next);
  assert.equal(result[0], previous[0]);
  assert.equal(result[1], previous[1]);
  assert.equal(result[2], next[2]);
});

test('prepended (paginated) messages keep the existing tail stable by key, not index', () => {
  const previous = [msg({ id: 'b', content: 'two' }), msg({ id: 'c', content: 'three' })];
  const next = [
    msg({ id: 'a0', content: 'older-a' }),
    msg({ id: 'a1', content: 'older-b' }),
    structuredClone(previous[0]),
    structuredClone(previous[1]),
  ];

  const result = stabilizeMessageIdentities(previous, next);

  sameValues(result, next);
  assert.equal(result[0], next[0]); // new older messages -> fresh
  assert.equal(result[1], next[1]);
  assert.equal(result[2], previous[0]); // tail reused despite index shift
  assert.equal(result[3], previous[1]);
});

test('disambiguates value-equal collisions by occurrence order', () => {
  // Two identical messages sharing the same intrinsic key (no id -> fallback
  // key from timestamp+content). Both should be matched and reused.
  const previous = [msg({ content: 'ok' }), msg({ content: 'ok' })];
  const next = rebuild(previous);

  const result = stabilizeMessageIdentities(previous, next);

  sameValues(result, next);
  assert.equal(result[0], previous[0]);
  assert.equal(result[1], previous[1]);
});

test('a nested field change (tool result arriving) yields a fresh identity', () => {
  const previous = [
    msg({ id: 't1', type: 'assistant', isToolUse: true, toolName: 'Bash', toolResult: null }),
  ];
  const next = [
    msg({
      id: 't1',
      type: 'assistant',
      isToolUse: true,
      toolName: 'Bash',
      toolResult: { content: 'done' } as unknown,
    }),
  ];

  const result = stabilizeMessageIdentities(previous, next);

  sameValues(result, next);
  assert.equal(result[0], next[0]); // changed -> fresh
});

test('compares Date-valued timestamps by value', () => {
  const previous = [msg({ id: 'a', timestamp: new Date('2026-01-01T00:00:00.000Z') })];
  const next = [msg({ id: 'a', timestamp: new Date('2026-01-01T00:00:00.000Z') })];

  const result = stabilizeMessageIdentities(previous, next);
  assert.equal(result[0], previous[0]); // equal Dates -> reuse

  const changed = [msg({ id: 'a', timestamp: new Date('2026-01-02T00:00:00.000Z') })];
  const result2 = stabilizeMessageIdentities(previous, changed);
  assert.equal(result2[0], changed[0]); // different Date -> fresh
});

test('empty previous returns next untouched (all fresh)', () => {
  const next = [msg({ id: 'a', content: 'one' })];
  const result = stabilizeMessageIdentities([], next);
  sameValues(result, next);
  assert.equal(result[0], next[0]);
});

test('empty next returns an empty array', () => {
  const previous = [msg({ id: 'a', content: 'one' })];
  assert.deepEqual(stabilizeMessageIdentities(previous, []), []);
});

test('does not reuse a previous ref more times than it appears', () => {
  // One previous "ok", two next "ok": first reuses, second must be fresh.
  const previous = [msg({ content: 'ok' })];
  const next = [msg({ content: 'ok' }), msg({ content: 'ok' })];

  const result = stabilizeMessageIdentities(previous, next);

  sameValues(result, next);
  assert.equal(result[0], previous[0]);
  assert.equal(result[1], next[1]); // no previous left to reuse -> fresh
});
