import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import MainContentStateView from './MainContentStateView';

/*
 * Empty-state onboarding copy (#241). The desktop tip used to tell people to
 * click "the folder icon in the sidebar" — the desktop sidebar header only has
 * Refresh / Plus / Hide, so that affordance never existed. The copy has to name
 * a control the user can actually find.
 */

describe('MainContentStateView — empty-state tip (#241)', () => {
  it('points desktop users at the + create control, not a non-existent folder icon', () => {
    render(<MainContentStateView mode="empty" isMobile={false} onMenuClick={vi.fn()} />);

    // `Tip:` lives in a nested <strong>; the advice is on the surrounding <p>.
    const tip = screen.getByText(/Tip:/).parentElement?.textContent ?? '';

    expect(tip).not.toMatch(/folder icon/i);
    // The desktop sidebar header renders a Plus button titled "Create new project".
    expect(tip).toMatch(/\+/);
    expect(tip).toMatch(/sidebar/i);
  });

  it('keeps the mobile tip pointing at the menu button', () => {
    render(<MainContentStateView mode="empty" isMobile onMenuClick={vi.fn()} />);

    // `Tip:` lives in a nested <strong>; the advice is on the surrounding <p>.
    const tip = screen.getByText(/Tip:/).parentElement?.textContent ?? '';

    expect(tip).not.toMatch(/folder icon/i);
    expect(tip).toMatch(/menu button/i);
  });
});
