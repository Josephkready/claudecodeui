import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SidebarProjectsState from './SidebarProjectsState';

import i18n from '@/i18n/config.js';

/*
 * Zero-projects sidebar copy (#241). This hint predates in-app project
 * creation and sent brand-new users off to the CLI while a "Create new
 * project" (+) button sat ~40px above it. It should lead with the in-app
 * action and keep the CLI route as a secondary note.
 */

function renderEmpty() {
  render(
    <SidebarProjectsState
      isLoading={false}
      loadingProgress={null}
      projectsCount={0}
      filteredProjectsCount={0}
      t={i18n.getFixedT('en', 'sidebar')}
    />,
  );
}

describe('SidebarProjectsState — no projects (#241)', () => {
  it('points at the in-app create action before the CLI', () => {
    renderEmpty();

    expect(screen.getByText('No projects found')).toBeInTheDocument();

    const hint = screen.getByText(/Claude CLI/i).textContent ?? '';
    expect(hint).toMatch(/\+/);
    expect(hint.indexOf('+')).toBeLessThan(hint.indexOf('Claude CLI'));
  });
});
