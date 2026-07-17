/**
 * Which websocket event kinds mean a background (non-viewed) session now *needs
 * the user*: it either finished its run (and awaits the next instruction) or is
 * blocked waiting on the user (a permission prompt / an interactive question).
 * These are the only kinds that should promote a conversation into the
 * "needs attention" band.
 *
 * Every entry is a real `ServerEventKind` (see server/shared/types.ts) — a kind
 * the sidebar's websocket handler can actually receive. The set is deliberately
 * narrow:
 *
 * - EXCLUDES the streaming/progress kinds (`stream_delta`, `text`, `thinking`,
 *   `tool_use`, `tool_result`, `status`) that fire continuously while the agent
 *   is actively working — treating those as attention flagged still-running
 *   sessions, which is the misfire this fixes (#44): you click "needs attention"
 *   and the agent is mid-run.
 * - EXCLUDES `error`: providers emit it for mid-run stderr, so it is not a
 *   terminal signal (run teardown always arrives as a single `complete`).
 * - EXCLUDES `session_created`: that marks a run *starting*, not finishing or
 *   blocking — the opposite of needing the user.
 * - EXCLUDES `task_notification`: no provider emits it yet, and whether it should
 *   count as attention depends on semantics that don't exist. Left inert on
 *   purpose (asserted in the tests) so adding it later is a deliberate change.
 *
 * Note: `stop` (run.stopped) and `action_required` (agent notification /
 * permission) are NOT in this set because they are notification-channel kinds
 * (web-push / desktop), never websocket frames — see notification-orchestrator.
 * Their sidebar-visible equivalents ARE covered here: a finished run reaches the
 * sidebar as `complete`, a permission block as `permission_request`.
 */
export const ATTENTION_EVENT_KINDS: ReadonlySet<string> = new Set([
  'complete', // unified terminal event — run finished, awaits the user
  'permission_request', // blocked awaiting tool approval
  'interactive_prompt', // agent is interactively asking the user for input
  'protocol_error', // run failed to start; no `complete` follows
]);

/**
 * True when an event from a non-viewed session should mark it as needing the
 * user's attention. Anything that is not an explicit blocked/terminal signal —
 * notably per-token streaming — leaves the session's status alone so an actively
 * running background session keeps reading as "running", not "attention".
 */
export function isAttentionEventKind(kind: string | null | undefined): boolean {
  return typeof kind === 'string' && ATTENTION_EVENT_KINDS.has(kind);
}

/**
 * True when a `session_upserted` (transcript-file-write) delta should flag its
 * session for attention.
 *
 * A transcript write is a weak signal: a running background session flushes its
 * transcript constantly, so flagging every write is the same still-running
 * misfire as marking streaming events (#44). We therefore only mark a session
 * whose run is NOT active — an out-of-band change (another client, or a session
 * driven directly by the CLI) — and never the session the user is looking at.
 *
 * `activeSessions` mirrors the server's running registry (refreshed every 5s),
 * so a live run is excluded as soon as it is known.
 */
export function shouldMarkAttentionForUpsert(
  sessionId: string | null | undefined,
  activeSessions: ReadonlyMap<string, unknown>,
  viewedSessionId: string | null | undefined,
): boolean {
  if (!sessionId) {
    return false;
  }
  if (sessionId === viewedSessionId) {
    return false;
  }
  return !activeSessions.has(sessionId);
}
