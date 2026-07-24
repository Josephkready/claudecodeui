import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FILE_TREE_DETAILED_GRID_CLASS } from '../constants/constants';
import type { FileTreeNode as FileTreeNodeType, FileTreeViewMode } from '../types/types';

import FileTreeDetailedColumns from './FileTreeDetailedColumns';
import FileTreeNode from './FileTreeNode';

/*
 * Truncated names need a tooltip (#245). The name span carries CSS `truncate`,
 * so a long filename renders as "a-really-extremely-long-file-name-that…" with
 * no hover, no context-menu entry and no status bar to recover the rest. Two
 * files that differ only past the cut are then indistinguishable. Sibling
 * components (SidebarProjectItem, AgentConnectionCard) already attach `title`
 * for exactly this reason.
 */

const LONG_NAME = 'a-really-extremely-long-file-name-that-should-be-truncated-somewhere-in-the-ui.tsx';

const file: FileTreeNodeType = {
  name: LONG_NAME,
  type: 'file',
  path: `/repo/src/${LONG_NAME}`,
  size: 2048,
  modified: '2026-07-24T12:00:00Z',
  permissionsRwx: 'rw-r--r--',
};

const directory: FileTreeNodeType = {
  name: 'a-directory-with-an-inconveniently-long-name-as-well',
  type: 'directory',
  path: '/repo/src/a-directory-with-an-inconveniently-long-name-as-well',
  children: [],
};

function renderNode(item: FileTreeNodeType, viewMode: FileTreeViewMode) {
  render(
    <FileTreeNode
      item={item}
      level={0}
      viewMode={viewMode}
      expandedDirs={new Set<string>()}
      onItemClick={vi.fn()}
      renderFileIcon={() => <span data-testid="icon" />}
      formatFileSize={() => '2 KB'}
      formatRelativeTime={() => '9 min ago'}
    />,
  );
}

describe('FileTreeNode — truncated name tooltip (#245)', () => {
  it.each<FileTreeViewMode>(['simple', 'compact', 'detailed'])(
    'exposes the full file name via title in %s view',
    (viewMode) => {
      renderNode(file, viewMode);

      expect(screen.getByText(LONG_NAME)).toHaveAttribute('title', LONG_NAME);
    },
  );

  it('exposes the full directory name via title', () => {
    renderNode(directory, 'simple');

    expect(screen.getByText(directory.name)).toHaveAttribute('title', directory.name);
  });
});

describe('FileTreeNode — detailed column widths (#245)', () => {
  it('lets the name column absorb the leftover width instead of capping it at 5/12', () => {
    const { container } = render(
      <FileTreeNode
        item={file}
        level={0}
        viewMode="detailed"
        expandedDirs={new Set<string>()}
        onItemClick={vi.fn()}
        renderFileIcon={() => <span data-testid="icon" />}
        formatFileSize={() => '2 KB'}
        formatRelativeTime={() => '9 min ago'}
      />,
    );

    const row = container.querySelector('.grid') as HTMLElement;
    expect(row.className).toContain(FILE_TREE_DETAILED_GRID_CLASS);
    // The old fixed split is what capped NAME well before the pane ran out.
    expect(row.className).not.toContain('grid-cols-12');
    expect(row.querySelector('.col-span-5')).toBeNull();
  });

  it('keeps the header on the same template as the rows so the columns line up', () => {
    const { container: headerContainer } = render(<FileTreeDetailedColumns />);
    const header = headerContainer.querySelector('.grid') as HTMLElement;

    expect(header.className).toContain(FILE_TREE_DETAILED_GRID_CLASS);
    expect(header.children).toHaveLength(4);
  });
});
