import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project, ProjectSession } from '../../../types/app';
import type { SessionActivity, SessionActivityMap } from '../../../hooks/useSessionProtection';

import { buildConversationList } from './conversationList';

function session(id: string, lastActivity: string): ProjectSession {
  return { id, summary: id, lastActivity };
}

function project(projectId: string, sessions: ProjectSession[]): Project {
  return { projectId, displayName: projectId, fullPath: `/repos/${projectId}`, sessions };
}

function activeSessions(...ids: string[]): SessionActivityMap {
  const map = new Map<string, SessionActivity>();
  for (const id of ids) {
    map.set(id, { statusText: null, canInterrupt: true, startedAt: 0 });
  }
  return map;
}

test('ranks attention over running over idle regardless of recency', () => {
  // The idle session is the *most recent*, yet its status sinks it below the
  // older attention/running rows — status must dominate recency.
  const p = project('p1', [
    session('s-idle', '2026-07-16T03:00:00Z'),
    session('s-run', '2026-07-16T02:00:00Z'),
    session('s-att', '2026-07-16T01:00:00Z'),
  ]);

  const list = buildConversationList([p], activeSessions('s-run'), new Set(['s-att']));

  assert.deepEqual(list.map((item) => item.session.id), ['s-att', 's-run', 's-idle']);
  assert.deepEqual(list.map((item) => item.status), ['attention', 'running', 'idle']);
});

test('sorts newest first within a status band', () => {
  const p = project('p1', [
    session('older', '2026-07-15T00:00:00Z'),
    session('newer', '2026-07-16T00:00:00Z'),
  ]);

  const list = buildConversationList([p], new Map(), new Set());

  assert.deepEqual(list.map((item) => item.session.id), ['newer', 'older']);
});

test('attention wins when a session is both active and flagged for attention', () => {
  const p = project('p1', [session('s', '2026-07-16T00:00:00Z')]);

  const list = buildConversationList([p], activeSessions('s'), new Set(['s']));

  assert.equal(list[0].status, 'attention');
});

test('flattens across projects and ranks globally', () => {
  const projectA = project('A', [session('a-idle', '2026-07-16T05:00:00Z')]);
  const projectB = project('B', [
    session('b-att', '2026-07-10T00:00:00Z'),
    session('b-run', '2026-07-11T00:00:00Z'),
  ]);

  const list = buildConversationList([projectA, projectB], activeSessions('b-run'), new Set(['b-att']));

  assert.deepEqual(list.map((item) => item.session.id), ['b-att', 'b-run', 'a-idle']);
  // Each row keeps a handle on its owning project for navigation.
  assert.equal(list[0].project.projectId, 'B');
  assert.equal(list[2].project.projectId, 'A');
});

test('returns an empty list when there are no sessions', () => {
  assert.deepEqual(buildConversationList([], new Map(), new Set()), []);
  assert.deepEqual(buildConversationList([project('p', [])], new Map(), new Set()), []);
});
