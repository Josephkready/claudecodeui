import type { ServerEvent } from '../../../contexts/WebSocketContext';

/**
 * Pure logic for the "run interrupted by a server restart" affordance (issue
 * #70), extracted from the hook/component so the (easy-to-get-wrong) gating is
 * unit-testable without React or a live websocket.
 */

/**
 * Whether to show the one-click resume banner: only when the session is
 * interrupted AND nothing is currently processing (a live run means the work is
 * already back in flight, so there is nothing to resume).
 */
export function shouldOfferResume(params: { interrupted: boolean; isProcessing: boolean }): boolean {
  return params.interrupted && !params.isProcessing;
}

/**
 * Reduces the per-session "interrupted" flag from one incoming websocket frame.
 * Returns the next flag value (unchanged when the frame is irrelevant to this
 * session), so the hook can drive its state with a functional setter.
 *
 * - `chat_subscribed` is authoritative: the server reports whether the session
 *   has interrupted work and whether a run is live.
 * - `chat_resumed`, the terminal `complete`, or any sequenced live provider
 *   frame all mean work is flowing again → clear the flag.
 */
export function nextInterruptedState(
  current: boolean,
  event: ServerEvent,
  sessionId: string,
): boolean {
  if (!event || event.sessionId !== sessionId) {
    return current;
  }

  if (event.kind === 'chat_subscribed') {
    return Boolean(event.interrupted) && !event.isProcessing;
  }

  if (event.kind === 'chat_resumed' || event.kind === 'complete') {
    return false;
  }

  // A sequenced live provider frame (stream_delta, text, tool_use, …) means the
  // run is actively streaming, so the session is no longer stranded.
  if (typeof event.seq === 'number') {
    return false;
  }

  return current;
}
