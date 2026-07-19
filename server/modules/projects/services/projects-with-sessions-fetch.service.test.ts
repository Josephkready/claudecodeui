import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, initializeDatabase, projectsDb, sessionsDb } from '@/modules/database/index.js';

import { getProjectsWithSessions } from './projects-with-sessions-fetch.service.js';

async function withIsolatedDatabase(runTest: () => void | Promise<void>): Promise<void> {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'projects-fetch-'));
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

// The sidebar renders Done from these fields on the /api/projects payload, so the
// mapper must carry them through — assert against the actual service output.
test('getProjectsWithSessions surfaces last_completed_at / last_viewed_at', async () => {
  await withIsolatedDatabase(async () => {
    projectsDb.createProjectPath('/workspace/done-proj', null);
    sessionsDb.createAppSession('done-sess', 'claude', '/workspace/done-proj');
    sessionsDb.setLastCompletedAt('done-sess');

    const projects = await getProjectsWithSessions({ skipSynchronization: true });
    const session = projects
      .flatMap((project) => project.sessions)
      .find((candidate) => candidate.id === 'done-sess');

    assert.ok(session, 'the seeded session should appear in the projects payload');
    assert.ok(session?.last_completed_at, 'last_completed_at should be surfaced (session is Done)');
    assert.equal(session?.last_viewed_at, null, 'unviewed session keeps last_viewed_at null');
  });
});

// The sidebar badges externally-driven sessions (#71). Origin is derived from
// whether the row's provider id matches its app id, so assert it against the
// three real ways a session row is created.
test('getProjectsWithSessions derives origin: cli for disk-discovered, cloudcli for app-created', async () => {
  await withIsolatedDatabase(async () => {
    projectsDb.createProjectPath('/workspace/origin-proj', null);

    // Disk-discovered (terminal/CLI): session_id === provider_session_id.
    sessionsDb.createSession('cli-sess', 'claude', '/workspace/origin-proj');

    // cloudcli-created, provider id not yet assigned: provider_session_id null.
    sessionsDb.createAppSession('app-pending', 'claude', '/workspace/origin-proj');

    // cloudcli-created, provider id later mapped on: the two ids now differ.
    sessionsDb.createAppSession('app-mapped', 'claude', '/workspace/origin-proj');
    sessionsDb.assignProviderSessionId('app-mapped', 'claude-provider-xyz');

    const byId = new Map(
      (await getProjectsWithSessions({ skipSynchronization: true }))
        .flatMap((project) => project.sessions)
        .map((s) => [s.id, s]),
    );

    assert.equal(byId.get('cli-sess')?.origin, 'cli', 'disk-discovered session is cli-driven');
    assert.equal(byId.get('app-pending')?.origin, 'cloudcli', 'app session with no provider id is cloudcli-driven');
    assert.equal(byId.get('app-mapped')?.origin, 'cloudcli', 'app session with a mapped provider id stays cloudcli-driven');
  });
});

// The sidebar ranks terminal sessions from the server-derived liveStatus (#21),
// so the wiring row -> resolveSessionLiveStatus -> summary.liveStatus must be
// exercised end-to-end: a field-name typo or arg-order swap would slip past the
// pure-classifier unit tests otherwise.
test('getProjectsWithSessions derives liveStatus from the session transcript on disk', async () => {
  await withIsolatedDatabase(async () => {
    const transcriptDir = await mkdtemp(path.join(tmpdir(), 'live-status-wire-'));
    const jsonlPath = path.join(transcriptDir, 'term.jsonl');
    // Last event is an unanswered tool_use -> awaiting input -> blocked (fresh mtime).
    const transcript = `${JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }] },
    })}\n`;
    await writeFile(jsonlPath, transcript, 'utf8');

    projectsDb.createProjectPath('/workspace/live-proj', null);
    // Disk-discovered session with a stored jsonl_path (7th arg).
    sessionsDb.createSession('term-sess', 'claude', '/workspace/live-proj', undefined, undefined, undefined, jsonlPath);

    try {
      const session = (await getProjectsWithSessions({ skipSynchronization: true }))
        .flatMap((project) => project.sessions)
        .find((candidate) => candidate.id === 'term-sess');

      assert.ok(session, 'the seeded session should appear in the projects payload');
      assert.equal(session?.liveStatus, 'blocked', 'liveStatus is derived from the transcript tail (pending tool_use)');
    } finally {
      await rm(transcriptDir, { recursive: true, force: true });
    }
  });
});
