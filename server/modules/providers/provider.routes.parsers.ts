// Shared, pure request-parsing helpers for the provider routes.
//
// These validate query-string and JSON-body values at the HTTP boundary and
// throw `AppError` (HTTP 400) on bad input. They live here — away from
// `provider.routes.ts`, which pulls in the whole service graph on import — so
// they can be unit-tested directly against their edge cases without booting the
// server. See `provider.routes.parsers.test.ts`.
//
// Feature-specific parsers extracted for the same reason live in sibling
// modules (e.g. `archive-by-age.parsers.ts`); this module holds the
// cross-cutting query/search helpers used across many provider routes.

import { AppError } from '@/shared/utils.js';

/**
 * Normalize an optional query-string value: return the trimmed string, or
 * `undefined` for non-strings and empty/whitespace-only values. Express hands
 * repeated params (`?x=1&x=2`) through as an array, which is not a string and
 * therefore normalizes to `undefined`.
 */
export const readOptionalQueryString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

/**
 * Parse an optional `true`/`false` query flag. Returns `undefined` when the
 * param is absent or empty, and throws for any value other than the two literal
 * strings.
 */
export const parseOptionalBooleanQuery = (
  value: unknown,
  name: string,
): boolean | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const normalized = readOptionalQueryString(value);
  if (!normalized) {
    return undefined;
  }

  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }

  throw new AppError(`${name} must be "true" or "false".`, {
    code: 'INVALID_QUERY_PARAMETER',
    statusCode: 400,
  });
};

/**
 * Parse the full-text conversation search query (`?q=`); requires at least two
 * characters after trimming.
 */
export const parseSessionSearchQuery = (value: unknown): string => {
  const query = readOptionalQueryString(value) ?? '';
  if (query.length < 2) {
    throw new AppError('Query must be at least 2 characters', {
      code: 'INVALID_SEARCH_QUERY',
      statusCode: 400,
    });
  }

  return query;
};

/**
 * Parse the search result `?limit=`; defaults to 50 when absent and clamps the
 * parsed integer into the inclusive range [1, 100].
 */
export const parseSessionSearchLimit = (value: unknown): number => {
  const raw = readOptionalQueryString(value);
  if (!raw) {
    return 50;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new AppError('limit must be a valid integer.', {
      code: 'INVALID_QUERY_PARAMETER',
      statusCode: 400,
    });
  }

  return Math.max(1, Math.min(parsed, 100));
};
