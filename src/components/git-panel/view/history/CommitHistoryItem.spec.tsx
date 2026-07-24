import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { GitCommitSummary } from '../../types/types';
import { formatCommitDate, formatCommitTimestamp } from '../../utils/gitPanelUtils';

import CommitHistoryItem from './CommitHistoryItem';

/*
 * Commit list timestamps (#235). Source Control → Commits rendered git's raw
 * ISO-8601 string in the collapsed row — the one everybody actually reads —
 * while the expanded detail body ran the same value through formatDate. Every
 * other timestamp in the app is humanised (file tree "9 min ago", sidebar "4m",
 * chat "12:58:18 PM"); the commit list was the only place a machine string
 * leaked through.
 */

const ISO_DATE = '2026-07-24T12:51:06-07:00';

const ISO_8601 = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

const commit: GitCommitSummary = {
  hash: 'c0fc63f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7',
  author: 'Audit Bot',
  date: ISO_DATE,
  message: 'feat: add demo app files',
};

function renderCollapsed() {
  return render(
    <CommitHistoryItem
      commit={commit}
      isExpanded={false}
      isMobile={false}
      wrapText={false}
      onToggle={vi.fn()}
    />,
  );
}

describe('CommitHistoryItem — collapsed row date (#235)', () => {
  it('never renders the raw ISO-8601 timestamp', () => {
    const { container } = renderCollapsed();

    expect(container.textContent ?? '').not.toMatch(ISO_8601);
  });

  it('shows the humanised date next to the author', () => {
    renderCollapsed();

    // The exact wording of the humanised form is pinned (TZ and all) by the
    // gitPanelUtils unit tests; here the point is that the row goes through the
    // shared formatter rather than printing commit.date.
    const byline = screen.getByText(/Audit Bot/).textContent ?? '';
    expect(byline).toContain('Audit Bot');
    expect(byline).toContain(formatCommitDate(ISO_DATE));
    expect(byline).toMatch(/[A-Z][a-z]{2} \d{1,2}, \d{4}/);
  });

  it('keeps the exact timestamp reachable via title', () => {
    renderCollapsed();

    const title = screen.getByText(/Audit Bot/).getAttribute('title') ?? '';
    expect(title).toBe(formatCommitTimestamp(ISO_DATE));
    // The tooltip is the place the time of day survives.
    expect(title).toMatch(/\d{1,2}:\d{2}/);
  });

  it('renders the same date in the collapsed row and the expanded detail', () => {
    const { container } = render(
      <CommitHistoryItem
        commit={commit}
        isExpanded
        diff={'diff --git a/app.js b/app.js\n--- a/app.js\n+++ b/app.js\n+one\n'}
        isMobile={false}
        wrapText={false}
        onToggle={vi.fn()}
      />,
    );

    expect(container.textContent ?? '').not.toMatch(ISO_8601);
    // The humanised date appears once in the byline and once in the Date field.
    const humanised = formatCommitDate(ISO_DATE);
    expect(container.textContent?.split(humanised)).toHaveLength(3);
  });
});
