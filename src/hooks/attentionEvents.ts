/**
 * Which websocket event kinds mean a background (non-viewed) session now *needs
 * the user*: it either finished its run (and awaits the next instruction) or is
 * blocked waiting on the user (a permission prompt / an agent notification).
 * These are the only kinds that should promote a conversation into the
 * "needs attention" band.
 *
 * The set is deliberately narrow. It EXCLUDES the streaming/progress kinds
 * (`stream_delta`, `text`, `thinking`, `tool_use`, `tool_result`) that fire
 * continuously while the agent is actively working — treating those as
 * attention flagged still-running sessions, which is the misfire this fixes:
 * you click "needs attention" and the agent is mid-run. `error` is excluded for
 * the same reason: providers emit it for mid-run stderr, so it is not a terminal
 * signal (run teardown always arrives as a single `complete`).
 */
export const ATTENTION_EVENT_KINDS: ReadonlySet<string> = new Set([
  'complete', // unified terminal event — run finished, awaits the user
  'stop', // run stopped (run.stopped)
  'action_required', // agent blocked: notification or permission needed
  'permission_request', // blocked awaiting tool approval
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
