/**
 * Deterministic in-process agent provider, used only for tests.
 *
 * Gated behind `AGENT_MOCK_PROVIDER=true` in the `POST /api/agent` handler (see
 * agent.js), this stands in for a real CLI/SDK provider so the route can be
 * integration-tested end-to-end — the non-streaming JSON assembly AND the
 * streaming SSE path — without a provider binary, network, or real auth. It
 * drives the exact writer contract every real provider uses: `setSessionId()`
 * followed by a series of normalized `kind`-frames.
 *
 * Frames are always handed to the writer as objects — the same as every real
 * provider today (see `sendMessage()` in codex-send-message.js, which since #134
 * calls `ws.send(data)` unconditionally rather than JSON-encoding for
 * "unflagged" writers, the allow-list that was a root cause of #96). The
 * `ResponseCollector`'s tolerance of stringified frames is a separate
 * backward-compat shim, covered directly in agent-response-collector.test.js.
 */

/** Assistant prose, split across frames the way real adapters chunk a reply. */
const ASSISTANT_TEXT_PARTS = ['Hello from ', 'the mock provider.'];

/** The full assistant reply the collector should reconstruct. */
export const MOCK_ASSISTANT_TEXT = ASSISTANT_TEXT_PARTS.join('');

/** How many `kind:'text'` assistant frames a run emits. */
export const MOCK_ASSISTANT_FRAME_COUNT = ASSISTANT_TEXT_PARTS.length;

/** Cumulative token snapshot the run reports via a `token_budget` status frame. */
export const MOCK_TOKEN_BUDGET = {
  inputTokens: 100,
  outputTokens: 20,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
};

/**
 * Run the mock provider against a writer.
 *
 * @param {string} message - The user's task message (echoed only via logs).
 * @param {{ sessionId?: string|null }} [options] - Run options; `sessionId`
 *        seeds the emitted session id when provided.
 * @param {{ send: Function, setSessionId: Function }} writer - The SSE writer or
 *        the non-streaming ResponseCollector.
 */
export async function runMockAgentProvider(message, options = {}, writer) {
  const sessionId = options.sessionId || 'mock-session';

  writer.setSessionId(sessionId);

  // A non-assistant frame that must NOT appear in getAssistantMessages().
  writer.send({ kind: 'status', text: 'thinking', sessionId });

  for (const content of ASSISTANT_TEXT_PARTS) {
    writer.send({ kind: 'text', role: 'assistant', content, sessionId });
  }

  // Cumulative token-budget snapshot the collector reads for the token summary.
  writer.send({ kind: 'status', text: 'token_budget', tokenBudget: { ...MOCK_TOKEN_BUDGET }, sessionId });

  return { sessionId };
}
