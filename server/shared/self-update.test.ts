import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveInstallMode } from '@/shared/self-update.js';

test('resolveInstallMode keys off the presence of a git checkout', () => {
  assert.equal(resolveInstallMode(true), 'git');
  assert.equal(resolveInstallMode(false), 'npm');
});
