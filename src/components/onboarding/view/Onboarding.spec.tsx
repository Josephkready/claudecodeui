import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authenticatedFetch = vi.fn();

vi.mock('@/utils/api', () => ({
  authenticatedFetch: (...args: unknown[]) => authenticatedFetch(...args),
  api: {},
  isValidRefreshedToken: () => false,
}));

// Imported after the mock so the component picks up the stubbed fetch.
const { default: Onboarding } = await import('./Onboarding');

/*
 * #236: a malformed git email left "Next" disabled with no explanation. Because
 * the button was disabled by the same predicate that guards handleNextStep, the
 * validation copy in that handler could never render — it was dead code. Next
 * now stays enabled (matching the project-creation wizard) so the message shows.
 */

const jsonResponse = (payload: unknown) => ({
  ok: true,
  json: async () => payload,
}) as unknown as Response;

beforeEach(() => {
  authenticatedFetch.mockReset();
  authenticatedFetch.mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/api/user/git-config')) {
      return Promise.resolve(jsonResponse({}));
    }
    return Promise.resolve(jsonResponse({ success: true, data: { authenticated: false } }));
  });
});

const gitConfigWrites = () => authenticatedFetch.mock.calls.filter(
  ([url, options]) => String(url).includes('/api/user/git-config')
    && (options as { method?: string } | undefined)?.method === 'POST',
);

describe('Onboarding — git email validation (#236)', () => {
  it('keeps Next enabled and explains why an invalid email is rejected', async () => {
    const user = userEvent.setup();
    render(<Onboarding />);

    await user.type(await screen.findByLabelText(/Git Name/i), 'Audit Bot');
    await user.type(screen.getByLabelText(/Git Email/i), 'not-an-email');

    const next = screen.getByRole('button', { name: /Next/i });
    expect(next).toBeEnabled();

    await user.click(next);

    expect(await screen.findByRole('alert')).toHaveTextContent('Please enter a valid email address.');
    // The invalid value must never reach the server.
    expect(gitConfigWrites()).toHaveLength(0);
  });

  it('explains an empty form instead of silently disabling Next', async () => {
    const user = userEvent.setup();
    render(<Onboarding />);

    const next = await screen.findByRole('button', { name: /Next/i });
    expect(next).toBeEnabled();

    await user.click(next);

    expect(await screen.findByRole('alert')).toHaveTextContent('Both git name and email are required.');
    expect(gitConfigWrites()).toHaveLength(0);
  });

  it('clears the message as soon as the user corrects the field', async () => {
    const user = userEvent.setup();
    render(<Onboarding />);

    await user.type(await screen.findByLabelText(/Git Name/i), 'Audit Bot');
    const email = screen.getByLabelText(/Git Email/i);
    await user.type(email, 'not-an-email');
    await user.click(screen.getByRole('button', { name: /Next/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await user.type(email, '@example.com');

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
