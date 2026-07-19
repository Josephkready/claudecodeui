/**
 * Decide what to persist when committing an inline session-title edit.
 *
 * Returns the trimmed draft when it is non-empty AND differs from the current
 * title, otherwise `null` — meaning no rename should be issued (the edit was
 * blank, whitespace-only, or unchanged). Keeping this pure makes the commit
 * guard testable independent of the React component that renders the editor.
 */
export function resolveTitleCommit(draft: string, currentTitle: string): string | null {
  const trimmed = draft.trim();
  if (!trimmed || trimmed === currentTitle) {
    return null;
  }
  return trimmed;
}
