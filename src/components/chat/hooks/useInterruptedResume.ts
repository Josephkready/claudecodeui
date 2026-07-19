import { useCallback, useEffect, useState } from 'react';

import { useWebSocket } from '../../../contexts/WebSocketContext';
import { nextInterruptedState } from '../utils/interruptedResume';

/**
 * Tracks whether the active session has work stranded by a server restart, and
 * exposes a one-click `resume` that asks the server to re-dispatch it (issue
 * #70).
 *
 * Deliberately self-contained: it taps the raw websocket fan-out (`subscribe`)
 * and keeps its own local flag instead of threading new callbacks through the
 * core chat realtime/session hooks. That keeps the interrupted affordance fully
 * decoupled from the normal chat processing path — it can never perturb run
 * state, only read the `chat_subscribed.interrupted` signal the server already
 * emits.
 */
export function useInterruptedResume(sessionId: string | null): {
  interrupted: boolean;
  resume: () => void;
} {
  const { subscribe, sendMessage } = useWebSocket();
  const [interrupted, setInterrupted] = useState(false);

  useEffect(() => {
    // Reset when the viewed session changes; the flag belongs to one session.
    setInterrupted(false);
    if (!sessionId) {
      return;
    }

    const unsubscribe = subscribe((event) => {
      setInterrupted((current) => nextInterruptedState(current, event, sessionId));
    });

    return unsubscribe;
  }, [sessionId, subscribe]);

  const resume = useCallback(() => {
    if (!sessionId) {
      return;
    }
    sendMessage({ type: 'chat.resume', sessionId });
    // Optimistically clear so the banner hides immediately; the resumed run's
    // live frames keep it cleared.
    setInterrupted(false);
  }, [sessionId, sendMessage]);

  return { interrupted, resume };
}
