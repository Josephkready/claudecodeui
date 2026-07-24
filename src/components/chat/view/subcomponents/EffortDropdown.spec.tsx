import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import EffortDropdown from './EffortDropdown';

afterEach(() => {
  cleanup();
});

function open() {
  fireEvent.click(screen.getByLabelText('Select reasoning effort'));
}

describe('EffortDropdown', () => {
  it('opens the menu and lists Default plus the provided options', () => {
    render(
      <EffortDropdown effort="default" availableEffortOptions={[{ value: 'low' }, { value: 'high' }]} onSelectEffort={vi.fn()} />,
    );

    open();

    const menu = screen.getByRole('menu');
    const labels = Array.from(menu.querySelectorAll('[role="menuitemradio"]')).map(
      (el) => el.textContent?.trim(),
    );
    expect(labels).toEqual(['Default', 'low', 'high']);
  });

  it('selects an option on click (mouse / keyboard path)', () => {
    const onSelectEffort = vi.fn();
    render(
      <EffortDropdown effort="default" availableEffortOptions={[{ value: 'low' }, { value: 'high' }]} onSelectEffort={onSelectEffort} />,
    );

    open();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'high' }));

    expect(onSelectEffort).toHaveBeenCalledWith('high');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  // Regression: on mobile the browser fires pointer events but synthesizes no
  // `click` on the portaled option, so a click-only handler never selects.
  // The option must also respond to a touch `pointerup`.
  it('selects an option on touch pointerup even when no click follows', () => {
    const onSelectEffort = vi.fn();
    render(
      <EffortDropdown effort="default" availableEffortOptions={[{ value: 'low' }, { value: 'high' }]} onSelectEffort={onSelectEffort} />,
    );

    open();
    const option = screen.getByRole('menuitemradio', { name: 'high' });
    fireEvent.pointerUp(option, { pointerType: 'touch' });

    expect(onSelectEffort).toHaveBeenCalledWith('high');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('ignores a mouse pointerup and selects only on the click that follows it', () => {
    const onSelectEffort = vi.fn();
    render(
      <EffortDropdown effort="default" availableEffortOptions={[{ value: 'low' }, { value: 'high' }]} onSelectEffort={onSelectEffort} />,
    );

    open();
    const option = screen.getByRole('menuitemradio', { name: 'high' });

    // A mouse pointerup must NOT select (mouse goes through onClick), so the
    // menu is still open and nothing has fired yet. This makes the
    // `pointerType !== 'mouse'` guard load-bearing: drop it and this fails.
    fireEvent.pointerUp(option, { pointerType: 'mouse' });
    expect(onSelectEffort).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeTruthy();

    // The real mouse click is what selects — exactly once.
    fireEvent.click(option);
    expect(onSelectEffort).toHaveBeenCalledTimes(1);
    expect(onSelectEffort).toHaveBeenCalledWith('high');
  });
});
