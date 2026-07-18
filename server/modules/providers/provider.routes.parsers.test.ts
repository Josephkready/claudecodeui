import assert from 'node:assert/strict';
import test from 'node:test';

import { AppError } from '@/shared/utils.js';

import {
  parseOptionalBooleanQuery,
  parseSessionSearchLimit,
  parseSessionSearchQuery,
  readOptionalQueryString,
} from './provider.routes.parsers.js';

/** Assert that `fn` throws an `AppError` carrying the given `code` and 400 status. */
function assertRejects(fn: () => unknown, code: string): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof AppError, `expected an AppError, got ${String(error)}`);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, 400);
    return true;
  });
}

test('readOptionalQueryString: trims non-empty strings', () => {
  assert.equal(readOptionalQueryString('claude'), 'claude');
  assert.equal(readOptionalQueryString('  padded  '), 'padded');
});

test('readOptionalQueryString: returns undefined for empty/whitespace strings', () => {
  assert.equal(readOptionalQueryString(''), undefined);
  assert.equal(readOptionalQueryString('   '), undefined);
});

test('readOptionalQueryString: returns undefined for non-string inputs', () => {
  // Express surfaces repeated params (`?x=1&x=2`) as an array — not a string.
  assert.equal(readOptionalQueryString(['1', '2']), undefined);
  assert.equal(readOptionalQueryString(undefined), undefined);
  assert.equal(readOptionalQueryString(7), undefined);
  assert.equal(readOptionalQueryString(null), undefined);
  assert.equal(readOptionalQueryString({ toString: () => 'x' }), undefined);
});

test('parseOptionalBooleanQuery: parses the two literal strings (trimmed)', () => {
  assert.equal(parseOptionalBooleanQuery('true', 'force'), true);
  assert.equal(parseOptionalBooleanQuery('false', 'force'), false);
  assert.equal(parseOptionalBooleanQuery('  true  ', 'force'), true);
});

test('parseOptionalBooleanQuery: absent/empty/array values are undefined', () => {
  assert.equal(parseOptionalBooleanQuery(undefined, 'force'), undefined);
  assert.equal(parseOptionalBooleanQuery('', 'force'), undefined);
  assert.equal(parseOptionalBooleanQuery('   ', 'force'), undefined);
  // A repeated param arrives as a non-string array, which reads as "absent".
  assert.equal(parseOptionalBooleanQuery(['true', 'false'], 'force'), undefined);
});

test('parseOptionalBooleanQuery: rejects any other value (case-sensitive)', () => {
  assertRejects(() => parseOptionalBooleanQuery('True', 'force'), 'INVALID_QUERY_PARAMETER');
  assertRejects(() => parseOptionalBooleanQuery('1', 'force'), 'INVALID_QUERY_PARAMETER');
  assertRejects(() => parseOptionalBooleanQuery('yes', 'force'), 'INVALID_QUERY_PARAMETER');
});

test('parseSessionSearchQuery: accepts trimmed queries of length >= 2', () => {
  assert.equal(parseSessionSearchQuery('ab'), 'ab');
  assert.equal(parseSessionSearchQuery('  hello  '), 'hello');
});

test('parseSessionSearchQuery: rejects queries shorter than 2 chars after trimming', () => {
  assertRejects(() => parseSessionSearchQuery('a'), 'INVALID_SEARCH_QUERY');
  assertRejects(() => parseSessionSearchQuery(' a '), 'INVALID_SEARCH_QUERY');
  assertRejects(() => parseSessionSearchQuery(''), 'INVALID_SEARCH_QUERY');
  assertRejects(() => parseSessionSearchQuery(undefined), 'INVALID_SEARCH_QUERY');
  assertRejects(() => parseSessionSearchQuery(['ab', 'cd']), 'INVALID_SEARCH_QUERY');
});

test('parseSessionSearchLimit: defaults to 50 when absent', () => {
  assert.equal(parseSessionSearchLimit(undefined), 50);
  assert.equal(parseSessionSearchLimit(''), 50);
  assert.equal(parseSessionSearchLimit('   '), 50);
  assert.equal(parseSessionSearchLimit(['1', '2']), 50);
});

test('parseSessionSearchLimit: clamps into [1, 100]', () => {
  assert.equal(parseSessionSearchLimit('10'), 10);
  assert.equal(parseSessionSearchLimit('0'), 1);
  assert.equal(parseSessionSearchLimit('-5'), 1);
  assert.equal(parseSessionSearchLimit('999'), 100);
  assert.equal(parseSessionSearchLimit('100'), 100);
  // parseInt truncates trailing garbage.
  assert.equal(parseSessionSearchLimit('10.9'), 10);
});

test('parseSessionSearchLimit: rejects non-numeric limits', () => {
  assertRejects(() => parseSessionSearchLimit('abc'), 'INVALID_QUERY_PARAMETER');
});
