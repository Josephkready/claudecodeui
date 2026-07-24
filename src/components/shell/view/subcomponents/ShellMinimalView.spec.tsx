import { createRef } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TERMINAL_OPTIONS } from '../../constants/constants';

import ShellMinimalView from './ShellMinimalView';

/*
 * Terminal surface colour (#246). The Shell wrapper painted Tailwind
 * `bg-gray-900` (#111827) while xterm painted its own `#1e1e1e`, so the
 * leftover space around the canvas — xterm quantises its height to whole rows,
 * so there is always some — showed as a visible band of the wrong grey.
 *
 * Sizing can never hide that mismatch, so the invariant under test is that the
 * wrapper paints exactly the colour xterm paints.
 */

function hexToRgb(hex: string): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

describe('ShellMinimalView — terminal background (#246)', () => {
  it('paints the wrapper with the same colour as the xterm theme', () => {
    const { container } = render(<ShellMinimalView terminalContainerRef={createRef<HTMLDivElement>()} />);

    const wrapper = container.firstElementChild as HTMLElement;
    const themeBackground = TERMINAL_OPTIONS.theme?.background as string;

    expect(themeBackground).toBeTruthy();
    expect(getComputedStyle(wrapper).backgroundColor).toBe(hexToRgb(themeBackground));
  });

  it('no longer hardcodes a second, different grey', () => {
    const { container } = render(<ShellMinimalView terminalContainerRef={createRef<HTMLDivElement>()} />);

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).not.toContain('bg-gray-900');
  });
});
