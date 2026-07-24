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
