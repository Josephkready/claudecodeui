import assert from 'node:assert/strict';
import test from 'node:test';

import { parseApplyPatch } from './apply-patch.js';

test('single-file update yields one file with separated old/new blocks', () => {
  const patch = [
    '*** Begin Patch',
    '*** Update File: src/a.ts',
    '@@ function foo',
    '-const x = 1;',
    '+const x = 2;',
    '*** End Patch',
  ].join('\n');

  const files = parseApplyPatch(patch);

  assert.equal(files.length, 1);
  assert.deepEqual(files[0], {
    filePath: 'src/a.ts',
    operation: 'update',
    oldString: 'const x = 1;',
    newString: 'const x = 2;',
  });
});

test('multi-file update yields one entry per file, not a merged blob (#99)', () => {
  const patch = [
    '*** Begin Patch',
    '*** Update File: src/a.ts',
    '@@ function foo',
    '-const x = 1;',
    '+const x = 2;',
    '*** Update File: src/b.ts',
    '@@ function bar',
    '-return old;',
    '+return next;',
    '*** End Patch',
  ].join('\n');

  const files = parseApplyPatch(patch);

  // The bug: both files collapsed into one Edit against src/a.ts with all
  // hunks merged. Each file must now be its own entry with only its own lines.
  assert.equal(files.length, 2);
  assert.equal(files[0].filePath, 'src/a.ts');
  assert.equal(files[0].oldString, 'const x = 1;');
  assert.equal(files[0].newString, 'const x = 2;');
  assert.equal(files[1].filePath, 'src/b.ts');
  assert.equal(files[1].oldString, 'return old;');
  assert.equal(files[1].newString, 'return next;');
  // src/b.ts lines must NOT leak into src/a.ts.
  assert.doesNotMatch(files[0].oldString, /return old;/);
  assert.doesNotMatch(files[0].newString, /return next;/);
});

test('Add File produces an add with an empty old block', () => {
  const patch = [
    '*** Begin Patch',
    '*** Add File: src/new.ts',
    '+export const answer = 42;',
    '+export const other = 1;',
    '*** End Patch',
  ].join('\n');

  const files = parseApplyPatch(patch);

  assert.equal(files.length, 1);
  assert.equal(files[0].operation, 'add');
  assert.equal(files[0].filePath, 'src/new.ts');
  assert.equal(files[0].oldString, '');
  assert.equal(files[0].newString, 'export const answer = 42;\nexport const other = 1;');
});

test('Delete File produces a delete entry', () => {
  const patch = [
    '*** Begin Patch',
    '*** Delete File: src/gone.ts',
    '*** End Patch',
  ].join('\n');

  const files = parseApplyPatch(patch);

  assert.equal(files.length, 1);
  assert.equal(files[0].operation, 'delete');
  assert.equal(files[0].filePath, 'src/gone.ts');
  assert.equal(files[0].oldString, '');
  assert.equal(files[0].newString, '');
});

test('mixed update + add + delete in one patch splits cleanly', () => {
  const patch = [
    '*** Begin Patch',
    '*** Update File: a.ts',
    '-old a',
    '+new a',
    '*** Add File: b.ts',
    '+added b',
    '*** Delete File: c.ts',
    '*** End Patch',
  ].join('\n');

  const files = parseApplyPatch(patch);

  assert.deepEqual(
    files.map((f) => [f.filePath, f.operation]),
    [
      ['a.ts', 'update'],
      ['b.ts', 'add'],
      ['c.ts', 'delete'],
    ],
  );
  assert.equal(files[0].oldString, 'old a');
  assert.equal(files[0].newString, 'new a');
  assert.equal(files[1].newString, 'added b');
});

test("headerless +/- content is bucketed under 'unknown' (legacy fallback)", () => {
  const patch = ['-old line', '+new line'].join('\n');

  const files = parseApplyPatch(patch);

  assert.equal(files.length, 1);
  assert.equal(files[0].filePath, 'unknown');
  assert.equal(files[0].oldString, 'old line');
  assert.equal(files[0].newString, 'new line');
});

test('@@ hunk headers and context lines are ignored; extra dash/plus content is kept', () => {
  const patch = [
    '*** Update File: src/a.ts',
    '@@ -1,4 +1,4 @@',
    ' unchanged context',
    '--count;', // removed line whose real content is "-count;"
    '+++value;', // added line whose real content is "++value;"
    '*** End Patch',
  ].join('\n');

  const files = parseApplyPatch(patch);

  assert.equal(files.length, 1);
  // apply_patch has no unified-diff ---/+++ headers, so a line starting with
  // extra markers is content: exactly one leading char is stripped, not the run.
  assert.equal(files[0].oldString, '-count;');
  assert.equal(files[0].newString, '++value;');
});

test('CRLF line endings are handled (header still matches, no stray \\r)', () => {
  const patch = [
    '*** Update File: src/a.ts',
    '-const x = 1;',
    '+const x = 2;',
    '*** End Patch',
  ].join('\r\n');

  const files = parseApplyPatch(patch);

  assert.equal(files.length, 1);
  assert.equal(files[0].filePath, 'src/a.ts'); // not bucketed as 'unknown'
  assert.equal(files[0].oldString, 'const x = 1;'); // no trailing \r
  assert.equal(files[0].newString, 'const x = 2;');
});

test("'*** Move to:' records the rename destination", () => {
  const patch = [
    '*** Begin Patch',
    '*** Update File: old/name.ts',
    '*** Move to: new/name.ts',
    '-const a = 1;',
    '+const a = 2;',
    '*** End Patch',
  ].join('\n');

  const files = parseApplyPatch(patch);

  assert.equal(files.length, 1);
  assert.equal(files[0].filePath, 'old/name.ts');
  assert.equal(files[0].movedTo, 'new/name.ts');
  assert.equal(files[0].oldString, 'const a = 1;');
  assert.equal(files[0].newString, 'const a = 2;');
});

test('empty / no-op input yields no files', () => {
  assert.deepEqual(parseApplyPatch(''), []);
  assert.deepEqual(parseApplyPatch('*** Begin Patch\n*** End Patch'), []);
});
