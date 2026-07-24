import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const browseFilesystemFolders = vi.fn();
const createFolderInFilesystem = vi.fn();

vi.mock('../data/workspaceApi', () => ({
  browseFilesystemFolders: (...args: unknown[]) => browseFilesystemFolders(...args),
  createFolderInFilesystem: (...args: unknown[]) => createFolderInFilesystem(...args),
}));

const { default: FolderBrowserModal } = await import('./FolderBrowserModal');

/*
 * #238: the picker derived the parent purely by string manipulation, so it
 * always rendered a ".." row — including at WORKSPACES_ROOT, where the only
 * possible outcome of clicking it is a 403 from /api/browse-filesystem. The
 * browse response now reports isAtRoot and the row is hidden there.
 */

const ROOT = '/var/tmp/cloudcli-audit';
const CHILD = `${ROOT}/demo-app`;

function renderPicker() {
  const onClose = vi.fn();
  const onFolderSelected = vi.fn();
  const result = render(
    <FolderBrowserModal
      isOpen
      autoAdvanceOnSelect={false}
      onClose={onClose}
      onFolderSelected={onFolderSelected}
    />,
  );
  return { ...result, onClose, onFolderSelected };
}

beforeEach(() => {
  browseFilesystemFolders.mockReset();
  browseFilesystemFolders.mockImplementation(async (pathToBrowse: string) => {
    if (pathToBrowse === CHILD) {
      return { path: CHILD, suggestions: [], isAtRoot: false };
    }
    return {
      path: ROOT,
      suggestions: [{ name: 'demo-app', path: CHILD, type: 'directory' }],
      isAtRoot: true,
    };
  });
});

const parentRow = () => screen.queryByRole('button', { name: '..' });

describe('FolderBrowserModal — parent row at the workspace root (#238)', () => {
  it('hides the ".." row when the picker opens at the workspace root', async () => {
    renderPicker();

    // Wait for the initial browse to land before asserting on the list.
    expect(await screen.findByRole('button', { name: /demo-app/ })).toBeInTheDocument();
    expect(parentRow()).toBeNull();
  });

  it('offers ".." once the user has navigated below the root, and it navigates back', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(await screen.findByRole('button', { name: /demo-app/ }));

    const parent = await screen.findByRole('button', { name: '..' });
    await user.click(parent);

    // Back at the root: the row disappears again rather than offering a click
    // that could only 403.
    await waitFor(() => expect(parentRow()).toBeNull());
    expect(browseFilesystemFolders).toHaveBeenLastCalledWith(ROOT);
  });

  it('does not offer ".." when the response omits isAtRoot but the path is a bare root', async () => {
    browseFilesystemFolders.mockResolvedValue({ path: '/', suggestions: [], isAtRoot: false });
    renderPicker();

    await waitFor(() => expect(browseFilesystemFolders).toHaveBeenCalled());
    await waitFor(() => expect(parentRow()).toBeNull());
  });
});
