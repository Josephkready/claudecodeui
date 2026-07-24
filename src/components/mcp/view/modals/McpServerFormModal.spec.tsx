import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import McpServerFormModal from './McpServerFormModal';

/*
 * #243: the MCP form modal is a hand-rolled `fixed inset-0` overlay with no
 * keydown handler, so Esc and backdrop clicks did nothing — unlike /help,
 * /status and Token Usage, which all close on Esc.
 */

function renderModal(overrides: Record<string, unknown> = {}) {
  const onClose = vi.fn();
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const result = render(
    <McpServerFormModal
      provider="claude"
      isOpen
      editingServer={null}
      currentProjects={[]}
      onClose={onClose}
      onSubmit={onSubmit}
      {...overrides}
    />,
  );
  return { ...result, onClose, onSubmit };
}

describe('McpServerFormModal — Esc and backdrop dismissal (#243)', () => {
  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a click on the backdrop but not inside the dialog', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    const dialog = screen.getByRole('dialog');
    await user.click(dialog);
    expect(onClose).not.toHaveBeenCalled();

    await user.click(dialog.parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays inert while closed', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal({ isOpen: false });

    await user.keyboard('{Escape}');

    expect(onClose).not.toHaveBeenCalled();
  });
});
