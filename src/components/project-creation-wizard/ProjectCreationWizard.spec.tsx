import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ProjectCreationWizard from './ProjectCreationWizard';

/*
 * #237: the wizard cleared `error` in handleNext/handleBack/handleCreate but
 * never on field change, so the red "Please provide a workspace path" banner
 * stayed on screen above a now-populated field — the message told the user to
 * do the thing they had just done.
 */

const PATH_ERROR = 'Please provide a workspace path';

function renderWizard() {
  const onClose = vi.fn();
  const result = render(<ProjectCreationWizard onClose={onClose} />);
  return { ...result, onClose };
}

async function triggerPathError(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /next/i }));
  expect(await screen.findByText(PATH_ERROR)).toBeInTheDocument();
}

describe('ProjectCreationWizard — validation banner lifecycle (#237)', () => {
  it('still raises the banner when Next is pressed with an empty path', async () => {
    const user = userEvent.setup();
    renderWizard();

    await triggerPathError(user);
  });

  it('clears the banner as soon as the user types a path', async () => {
    const user = userEvent.setup();
    renderWizard();

    await triggerPathError(user);

    await user.type(screen.getByPlaceholderText('/path/to/project/workspace'), '/tmp/demo-app');

    await waitFor(() => expect(screen.queryByText(PATH_ERROR)).toBeNull());
  });

  it('clears the banner when any other wizard field is edited', async () => {
    const user = userEvent.setup();
    renderWizard();

    await triggerPathError(user);

    // The GitHub URL field routes through the same updateField callback as the
    // folder-picker selection does, so covering it covers that path too.
    const githubUrl = screen.getByPlaceholderText(/github\.com/i);
    await user.type(githubUrl, 'https://github.com/acme/demo.git');

    await waitFor(() => expect(screen.queryByText(PATH_ERROR)).toBeNull());
  });
});

/*
 * #243: the wizard is a hand-rolled `fixed inset-0` overlay with no keydown
 * handler, so Esc and backdrop clicks did nothing — while /help, /status and
 * Token Usage all close on Esc.
 */
describe('ProjectCreationWizard — Esc and backdrop dismissal (#243)', () => {
  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const { onClose } = renderWizard();

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a click on the backdrop but not inside the dialog', async () => {
    const user = userEvent.setup();
    const { onClose } = renderWizard();

    const dialog = screen.getByRole('dialog', { name: /create new project/i });
    await user.click(dialog);
    expect(onClose).not.toHaveBeenCalled();

    await user.click(dialog.parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape closes only the folder picker while it is stacked on top', async () => {
    const user = userEvent.setup();
    const { onClose } = renderWizard();

    await user.click(screen.getByRole('button', { name: 'Browse folders' }));
    expect(await screen.findByRole('dialog', { name: 'Select Folder' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    // The picker is gone, the wizard survives.
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Select Folder' })).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: /create new project/i })).toBeInTheDocument();

    // A second Escape then closes the wizard.
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
