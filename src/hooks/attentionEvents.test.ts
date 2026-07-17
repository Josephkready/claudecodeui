import assert from 'node:assert/strict';
import test from 'node:test';

import { ATTENTION_EVENT_KINDS, isAttentionEventKind } from './attentionEvents';

// The core of #44: kinds that fire while the agent is actively running must not
// promote a background session to "needs attention".
test('streaming and progress kinds never mark attention', () => {
  for (const kind of [
    'stream_delta',
    'text',
    'thinking',
    'tool_use',
    'tool_result',
    'status',
    'stream_end',
    'session_upserted',
    'chat_subscribed',
    'permission_cancelled',
    'websocket_reconnected',
    'error', // non-terminal: providers emit it for mid-run stderr
  ]) {
    assert.equal(isAttentionEventKind(kind), false, `${kind} must not mark attention`);
  }
});

test('blocked and terminal kinds mark attention', () => {
  for (const kind of [
    'complete',
    'stop',
    'action_required',
    'permission_request',
    'protocol_error',
  ]) {
    assert.equal(isAttentionEventKind(kind), true, `${kind} should mark attention`);
    assert.ok(ATTENTION_EVENT_KINDS.has(kind));
  }
});

test('missing or non-string kinds are ignored', () => {
  assert.equal(isAttentionEventKind(null), false);
  assert.equal(isAttentionEventKind(undefined), false);
  assert.equal(isAttentionEventKind(''), false);
});
