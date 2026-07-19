import test from 'node:test';
import assert from 'node:assert/strict';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import SidebarContent from './SidebarContent';
import type { SidebarProjectListProps } from './SidebarProjectList';

// i18next stand-in: return the English fallback string when given one, else the
// key — so the section labels ("Spaces" / "Conversations") render real text.
const t = ((key: string, fallback?: unknown) =>
  typeof fallback === 'string' ? fallback : key) as never;

const noop = () => {};

const projectListProps: SidebarProjectListProps = {
  projects: [],
  filteredProjects: [],
  selectedProject: null,
  selectedSession: null,
  isLoading: false,
  loadingProgress: null,
  expandedProjects: new Set(),
  editingProject: null,
  editingName: '',
  initialSessionsLoaded: new Set(),
  currentTime: new Date(),
  editingSession: null,
  editingSessionName: '',
  deletingProjects: new Set(),
  getProjectSessions: () => [],
  onLoadMoreSessions: noop,
  loadingMoreProjects: new Set(),
  activeSessions: new Map(),
  isProjectStarred: () => false,
  onEditingNameChange: noop,
  onToggleProject: noop,
  onProjectSelect: noop,
  onToggleStarProject: noop,
  onStartEditingProject: noop,
  onCancelEditingProject: noop,
  onSaveProjectName: noop,
  onDeleteProject: noop,
  onSessionSelect: noop,
  onDeleteSession: noop,
  onArchiveSession: noop,
  onNewSession: noop,
  onEditingSessionNameChange: noop,
  onStartEditingSession: noop,
  onCancelEditingSession: noop,
  onSaveEditingSession: noop,
  t,
};

function render(overrides: Partial<React.ComponentProps<typeof SidebarContent>> = {}): string {
  const props: React.ComponentProps<typeof SidebarContent> = {
    isPWA: false,
    isMobile: false,
    isLoading: false,
    projects: [],
    runningSessionsCount: 0,
    archivedProjects: [],
    archivedSessions: [],
    archivedSessionsCount: 0,
    isArchivedSessionsLoading: false,
    searchFilter: '',
    onSearchFilterChange: noop,
    onClearSearchFilter: noop,
    sidebarOverlay: 'none',
    onSetOverlay: noop,
    conversationResults: null,
    isSearching: false,
    searchProgress: null,
    onRestoreArchivedProject: noop,
    onArchivedSessionClick: noop,
    onRestoreArchivedSession: noop,
    onDeleteArchivedSession: noop,
    onConversationResultClick: noop,
    onRefresh: noop,
    isRefreshing: false,
    onCreateProject: noop,
    onCollapseSidebar: noop,
    restartRequired: false,
    currentVersion: '0.0.0',
    onShowSettings: noop,
    projectListProps,
    t,
    ...overrides,
  };

  return renderToStaticMarkup(<SidebarContent {...props} />);
}

test('the default (none) overlay shows Spaces and Conversations at the same time', () => {
  const markup = render({ sidebarOverlay: 'none' });

  assert.ok(markup.includes('Spaces'), 'expected the Spaces section header');
  assert.ok(markup.includes('Conversations'), 'expected the Conversations section header');
});

test('the archived overlay replaces the two sections', () => {
  const markup = render({ sidebarOverlay: 'archived' });

  // The section headers only exist in the default two-section view.
  assert.ok(!markup.includes('>Spaces<'), 'Spaces section header should be hidden in the archived overlay');
  assert.ok(markup.includes('No archived items'), 'expected the empty-archive state');
});

test('the search overlay prompts for input before running a full-text search', () => {
  const markup = render({ sidebarOverlay: 'search', searchFilter: '' });

  assert.ok(
    markup.includes('Type at least 2 characters to search message contents.'),
    'expected the full-text search prompt',
  );
});
