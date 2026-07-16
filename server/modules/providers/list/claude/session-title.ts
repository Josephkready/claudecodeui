// Pure session-title selection logic, kept DB-free so it unit-tests without the
// database/native-module import chain. The Claude session synchronizer scans a
// transcript for these candidates and defers the choice to `pickDiscoveredSessionName`.

export type SessionTitleCandidates = {
  /** Model-generated title Claude Code writes as an `ai-title` event. */
  aiTitle?: string;
  /** Title from a user rename in Claude Code (`custom-title` event). */
  customTitle?: string;
  /** The most recent prompt text (`last-prompt` event). */
  lastPrompt?: string;
};

/**
 * Choose a session's display name from the title-bearing transcript events plus the
 * first-prompt `display` (from history.jsonl). Precedence, strongest first:
 *   1. a user rename in Claude Code (`custom-title`) — explicit intent
 *   2. the model-written `ai-title` — the readable summary we want by default
 *   3. the first prompt typed (`firstPromptDisplay`) — the historical fallback
 *   4. the most recent prompt (`last-prompt`) — weakest
 * Returns undefined when nothing is available (the caller normalizes to a placeholder).
 */
export function pickDiscoveredSessionName(
  candidates: SessionTitleCandidates,
  firstPromptDisplay: string | undefined,
): string | undefined {
  // Treat an empty/whitespace display as absent so it doesn't shadow last-prompt
  // (the candidates are already trimmed-non-empty by the extractor).
  const firstPrompt = firstPromptDisplay?.trim() ? firstPromptDisplay : undefined;
  return candidates.customTitle ?? candidates.aiTitle ?? firstPrompt ?? candidates.lastPrompt;
}
