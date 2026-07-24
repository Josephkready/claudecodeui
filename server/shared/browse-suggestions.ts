/**
 * Suggestion ordering for the `/api/browse-filesystem` folder picker.
 *
 * The folder picker (project-creation / new-conversation wizard) lists the
 * immediate child directories of the browsed path. Historically, when the
 * browsed path was the workspace root, a hardcoded list of "common" home-dir
 * names (Desktop, Documents, Projects, …) was reordered to the front as a
 * convenience. That reordering is pure noise once `WORKSPACES_ROOT` is scoped
 * to a narrow workspace (e.g. `~/repos`) where those names never appear — see
 * issue #227.
 *
 * This module extracts the ordering as a pure, unit-testable function and gates
 * the "common dirs" list behind the `BROWSE_COMMON_DIRS` env var so the
 * behavior is configurable (and disable-able) instead of hardcoded.
 */

/**
 * The historical hardcoded common-dir list used before `BROWSE_COMMON_DIRS`
 * existed. Used as the default when the env var is unset, so the endpoint's
 * observable ordering stays backward-compatible out of the box.
 */
export const DEFAULT_BROWSE_COMMON_DIRS: readonly string[] = [
  'Desktop',
  'Documents',
  'Projects',
  'Development',
  'Dev',
  'Code',
  'workspace',
];

/**
 * Parses the `BROWSE_COMMON_DIRS` env value into a list of common-dir names.
 *
 * Semantics:
 * - unset (`undefined`)        -> the default list (backward compatible)
 * - empty string (`''`)        -> `[]` (reordering disabled)
 * - comma-separated list       -> trimmed entries with blanks dropped
 *
 * Passing the raw env value in (rather than reading `process.env` here) keeps
 * this deterministic and testable, matching `getRouterBasename`'s pattern.
 */
export function parseBrowseCommonDirs(rawValue: string | undefined): string[] {
  if (rawValue === undefined) {
    return [...DEFAULT_BROWSE_COMMON_DIRS];
  }

  return rawValue
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Builds the ordered folder-picker suggestion list.
 *
 * When browsing the workspace root with a non-empty `commonDirs` list, the
 * directories whose names appear in that list are promoted to the front
 * (preserving their order within the already-sorted input); everything else
 * follows in its original order. In every other case — not at the workspace
 * root, or an empty/disabled `commonDirs` list — the input directories are
 * returned unchanged (a shallow copy, never mutated).
 *
 * The generic constraint keeps this decoupled from the endpoint's concrete
 * directory shape; it only needs a `name` to match against `commonDirs`.
 */
export function buildBrowseSuggestions<T extends { name: string }>(
  directories: readonly T[],
  commonDirs: readonly string[],
  isWorkspaceRoot: boolean,
): T[] {
  if (!isWorkspaceRoot || commonDirs.length === 0) {
    return [...directories];
  }

  const commonSet = new Set(commonDirs);
  const existingCommon = directories.filter((entry) => commonSet.has(entry.name));
  const otherDirs = directories.filter((entry) => !commonSet.has(entry.name));

  return [...existingCommon, ...otherDirs];
}
