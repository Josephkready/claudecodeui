import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { activeRunsDb, closeConnection, initializeDatabase, sessionsDb } from '../index.js';

async function withIsolatedDatabase(runTest: () => Promise<void>): Promise<void> {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'active-runs-db-'));
  const databasePath = path.join(tempDirectory, 'auth.db');

  closeConnection();
  process.env.DATABASE_PATH = databasePath;
  await initializeDatabase();

  try {
    await runTest();
  } finally {
    closeConnection();
    if (previousDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

const PROJECT = '/workspace/active-runs';

function makeInput(sessionId: string, content: string, overrides: Record<string, unknown> = {}) {
  return {
    sessionId,
    provider: 'claude',
    providerSessionId: null,
    content,
    options: { model: 'sonnet' },
    userId: 'user-1',
    enqueuedAt: Date.now(),
    ...overrides,
  };
}

test('recordRunning persists a running row with serialized options and user id', async () => {
  await withIsolatedDatabase(async () => {
    sessionsDb.createAppSession('s1', 'claude', PROJECT);
    const id = activeRunsDb.recordRunning(makeInput('s1', 'hello'));

    const rows = activeRunsDb.getBySession('s1');
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.id, id);
    assert.equal(rows[0]?.status, 'running');
    assert.equal(rows[0]?.content, 'hello');
    assert.equal(rows[0]?.user_id, 'user-1');
    assert.deepEqual(JSON.parse(rows[0]?.options_json ?? '{}'), { model: 'sonnet' });
  });
});

test('setProviderSessionId and promoteToRunning update the row in place', async () => {
  await withIsolatedDatabase(async () => {
    sessionsDb.createAppSession('s2', 'claude', PROJECT);
    const runningId = activeRunsDb.recordRunning(makeInput('s2', 'head'));
    activeRunsDb.setProviderSessionId(runningId, 'provider-abc');
    assert.equal(activeRunsDb.getBySession('s2')[0]?.provider_session_id, 'provider-abc');

    const queuedId = activeRunsDb.recordQueued(makeInput('s2', 'next'));
    let queued = activeRunsDb.getBySession('s2').find((row) => row.id === queuedId);
    assert.equal(queued?.status, 'queued');

    // Promotion carries forward the provider id resolved by the previous run.
    activeRunsDb.promoteToRunning(queuedId, 'provider-abc');
    queued = activeRunsDb.getBySession('s2').find((row) => row.id === queuedId);
    assert.equal(queued?.status, 'running');
    assert.equal(queued?.provider_session_id, 'provider-abc');
  });
});

test('remove and removeBySession delete journal rows', async () => {
  await withIsolatedDatabase(async () => {
    sessionsDb.createAppSession('s3', 'claude', PROJECT);
    const a = activeRunsDb.recordRunning(makeInput('s3', 'a'));
    activeRunsDb.recordQueued(makeInput('s3', 'b'));
    activeRunsDb.recordQueued(makeInput('s3', 'c'));

    activeRunsDb.remove(a);
    assert.equal(activeRunsDb.getBySession('s3').length, 2, 'only the removed row is gone');

    const discarded = activeRunsDb.removeBySession('s3');
    assert.equal(discarded, 2);
    assert.equal(activeRunsDb.getBySession('s3').length, 0);
  });
});

test('markAllInterrupted flags running and queued rows, idempotently, and reports the sessions', async () => {
  await withIsolatedDatabase(async () => {
    sessionsDb.createAppSession('s4', 'claude', PROJECT);
    sessionsDb.createAppSession('s5', 'claude', PROJECT);
    activeRunsDb.recordRunning(makeInput('s4', 'r'));
    activeRunsDb.recordQueued(makeInput('s4', 'q'));
    activeRunsDb.recordRunning(makeInput('s5', 'r2'));

    const first = activeRunsDb.markAllInterrupted();
    assert.equal(first.messages, 3, 'all three rows flagged');
    assert.deepEqual([...first.sessions].sort(), ['s4', 's5']);
    assert.equal(activeRunsDb.hasInterrupted('s4'), true);
    assert.equal(activeRunsDb.hasInterrupted('s5'), true);
    assert.equal(activeRunsDb.getInterrupted('s4').length, 2);

    // Re-running the reconcile flags nothing new (already interrupted rows are
    // left alone) so a second boot doesn't duplicate work.
    const second = activeRunsDb.markAllInterrupted();
    assert.equal(second.messages, 0);
    assert.equal(second.sessions.length, 0);
  });
});

test('getInterrupted returns rows in original arrival (enqueued_at) order', async () => {
  await withIsolatedDatabase(async () => {
    sessionsDb.createAppSession('s6', 'claude', PROJECT);
    activeRunsDb.recordRunning(makeInput('s6', 'first', { enqueuedAt: 1000 }));
    activeRunsDb.recordQueued(makeInput('s6', 'third', { enqueuedAt: 3000 }));
    activeRunsDb.recordQueued(makeInput('s6', 'second', { enqueuedAt: 2000 }));
    activeRunsDb.markAllInterrupted();

    const ordered = activeRunsDb.getInterrupted('s6').map((row) => row.content);
    assert.deepEqual(ordered, ['first', 'second', 'third']);
  });
});

test('deleting a session cascades its active_runs rows away (no orphans)', async () => {
  await withIsolatedDatabase(async () => {
    sessionsDb.createAppSession('s7', 'claude', PROJECT);
    activeRunsDb.recordRunning(makeInput('s7', 'r'));
    activeRunsDb.recordQueued(makeInput('s7', 'q'));
    assert.equal(activeRunsDb.getBySession('s7').length, 2);

    sessionsDb.deleteSessionById('s7');
    assert.equal(activeRunsDb.getBySession('s7').length, 0, 'FK cascade removed the journal rows');
  });
});

test('a null options object still serializes to a valid empty-options row', async () => {
  await withIsolatedDatabase(async () => {
    sessionsDb.createAppSession('s8', 'claude', PROJECT);
    activeRunsDb.recordRunning(makeInput('s8', 'x', { options: undefined, userId: null }));
    const row = activeRunsDb.getBySession('s8')[0];
    assert.equal(row?.user_id, null);
    assert.deepEqual(JSON.parse(row?.options_json ?? 'null'), {});
  });
});
