import assert from 'node:assert/strict';
import test from 'node:test';

import type { ServerEvent } from '../../../contexts/WebSocketContext';
import { nextInterruptedState, shouldOfferResume } from './interruptedResume';

test('shouldOfferResume only when interrupted and not processing', () => {
  assert.equal(shouldOfferResume({ interrupted: true, isProcessing: false }), true);
  assert.equal(shouldOfferResume({ interrupted: true, isProcessing: true }), false, 'a live run is not resumable');
  assert.equal(shouldOfferResume({ interrupted: false, isProcessing: false }), false);
  assert.equal(shouldOfferResume({ interrupted: false, isProcessing: true }), false);
});

const SID = 'session-1';

test('chat_subscribed drives the interrupted flag from the server signal', () => {
  assert.equal(
    nextInterruptedState(false, { kind: 'chat_subscribed', sessionId: SID, interrupted: true, isProcessing: false } as ServerEvent, SID),
    true,
    'interrupted + idle → true',
  );
  assert.equal(
    nextInterruptedState(true, { kind: 'chat_subscribed', sessionId: SID, interrupted: true, isProcessing: true } as ServerEvent, SID),
    false,
    'a live run overrides the interrupted flag',
  );
  assert.equal(
    nextInterruptedState(true, { kind: 'chat_subscribed', sessionId: SID, interrupted: false, isProcessing: false } as ServerEvent, SID),
    false,
    'server says not interrupted → clear',
  );
});

test('resume, completion, and live frames all clear the flag', () => {
  assert.equal(nextInterruptedState(true, { kind: 'chat_resumed', sessionId: SID } as ServerEvent, SID), false);
  assert.equal(nextInterruptedState(true, { kind: 'complete', sessionId: SID } as ServerEvent, SID), false);
  assert.equal(
    nextInterruptedState(true, { kind: 'stream_delta', sessionId: SID, seq: 5 } as ServerEvent, SID),
    false,
    'a sequenced live frame means work is flowing again',
  );
});

test('frames for a different session (or no seq) leave the flag unchanged', () => {
  assert.equal(
    nextInterruptedState(true, { kind: 'chat_subscribed', sessionId: 'other', interrupted: false, isProcessing: false } as ServerEvent, SID),
    true,
    'a different session must not clear this session\'s flag',
  );
  assert.equal(
    nextInterruptedState(true, { kind: 'session_upserted', sessionId: SID } as ServerEvent, SID),
    true,
    'a non-sequenced, non-terminal gateway frame is irrelevant',
  );
});
