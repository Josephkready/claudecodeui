import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveTitleCommit } from './titleRename';

test('resolveTitleCommit returns the trimmed draft when it changed', () => {
  assert.equal(resolveTitleCommit('New name', 'Old name'), 'New name');
  assert.equal(resolveTitleCommit('  Padded name  ', 'Old name'), 'Padded name');
});

test('resolveTitleCommit returns null when the draft is blank or whitespace-only', () => {
  assert.equal(resolveTitleCommit('', 'Old name'), null);
  assert.equal(resolveTitleCommit('   ', 'Old name'), null);
});

test('resolveTitleCommit returns null when the trimmed draft equals the current title', () => {
  assert.equal(resolveTitleCommit('Same name', 'Same name'), null);
  // Whitespace around an otherwise-unchanged title is still a no-op.
  assert.equal(resolveTitleCommit('  Same name  ', 'Same name'), null);
});

test('resolveTitleCommit treats a change to only surrounding whitespace as no rename', () => {
  // Trimming both sides means "Same name" vs " Same name " compare equal.
  assert.equal(resolveTitleCommit(' Same name ', 'Same name'), null);
});
