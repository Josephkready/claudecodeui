import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '../../../types/app';

import { buildNewConversationItems } from './newConversation';

const t = ((key: string, fallback?: string) => fallback ?? key) as never;

function project(
  projectId: string,
  displayName: string,
  options: { isStarred?: boolean; fullPath?: string } = {},
): Project {
  return {
    projectId,
    displayName,
    fullPath: options.fullPath ?? `/repos/${projectId}`,
    isStarred: options.isStarred,
  } as unknown as Project;
}

test('lists each project then a trailing "New project…" escape hatch', () => {
  const items = buildNewConversationItems({
    projects: [project('a', 'Alpha'), project('b', 'Bravo')],
    onPickProject: () => {},
    onCreateProject: () => {},
    t,
  });

  assert.equal(items.length, 3);
  assert.deepEqual(
    items.map((item) => item.label),
    ['Alpha', 'Bravo', 'New project…'],
  );
  assert.equal(items[2].key, 'new-project');
  // Divider separates the create action from the project list above it.
  assert.equal(items[2].showDividerBefore, true);
});

test('orders projects starred-first, then by name (matches the Projects tab default)', () => {
  const items = buildNewConversationItems({
    projects: [project('z', 'Zulu'), project('a', 'Alpha'), project('m', 'Mike', { isStarred: true })],
    onPickProject: () => {},
    onCreateProject: () => {},
    t,
  });

  assert.deepEqual(
    items.map((item) => item.label),
    ['Mike', 'Alpha', 'Zulu', 'New project…'],
  );
});

test('picking a project item invokes onPickProject with that exact project', () => {
  const picked: string[] = [];
  const projects = [project('a', 'Alpha'), project('b', 'Bravo')];
  const items = buildNewConversationItems({
    projects,
    onPickProject: (project) => picked.push(project.projectId),
    onCreateProject: () => {},
    t,
  });

  items.find((item) => item.key === 'project:b')?.onSelect();
  assert.deepEqual(picked, ['b']);
});

test('the create item invokes onCreateProject, not onPickProject', () => {
  let created = 0;
  let picks = 0;
  const items = buildNewConversationItems({
    projects: [project('a', 'Alpha')],
    onPickProject: () => {
      picks += 1;
    },
    onCreateProject: () => {
      created += 1;
    },
    t,
  });

  items.find((item) => item.key === 'new-project')?.onSelect();
  assert.equal(created, 1);
  assert.equal(picks, 0);
});

test('with no projects, the menu is just the create escape hatch (no divider)', () => {
  const items = buildNewConversationItems({
    projects: [],
    onPickProject: () => {},
    onCreateProject: () => {},
    t,
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].key, 'new-project');
  assert.equal(items[0].showDividerBefore, false);
});
