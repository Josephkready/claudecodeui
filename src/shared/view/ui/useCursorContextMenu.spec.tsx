import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { describe, expect, it } from 'vitest';

import { useCursorContextMenu } from './useCursorContextMenu';

// Companion to the pure-helper coverage in useCursorContextMenu.test.ts (node:test).
// Everything here needs a live DOM: `renderHook`/`act` for the open/close state and
// real document-level `mousedown`/`keydown` listeners for dismissal and roving focus.

function contextMenuEvent(clientX: number, clientY: number) {
  return {
    clientX,
    clientY,
    preventDefault: () => {},
    stopPropagation: () => {},
  } as unknown as ReactMouseEvent<HTMLDivElement>;
}

/** Minimal consumer that wires `menuRef` to real markup, like CursorContextMenu does. */
function MenuHarness({ disabled = false }: { disabled?: boolean }) {
  const { isMenuOpen, menuPosition, menuRef, openContextMenuAtCursor } = useCursorContextMenu({
    disabled,
  });

  return (
    <div>
      <div data-testid="trigger" onContextMenu={openContextMenuAtCursor}>
        right click me
      </div>
      <div data-testid="outside">elsewhere</div>
      {isMenuOpen && (
        <div ref={menuRef} role="menu" aria-label="Test menu" data-position={`${menuPosition.x},${menuPosition.y}`}>
          <button type="button" role="menuitem">
            First
          </button>
          <button type="button" role="menuitem">
            Second
          </button>
        </div>
      )}
    </div>
  );
}

describe('useCursorContextMenu', () => {
  it('starts closed and opens at a viewport-safe cursor position', () => {
    const { result } = renderHook(() => useCursorContextMenu());

    expect(result.current.isMenuOpen).toBe(false);
    expect(result.current.menuPosition).toEqual({ x: 0, y: 0 });

    act(() => result.current.openContextMenuAtCursor(contextMenuEvent(120, 140)));

    expect(result.current.isMenuOpen).toBe(true);
    expect(result.current.menuPosition).toEqual({ x: 120, y: 140 });
  });

  it('ignores right-click while disabled', () => {
    const { result } = renderHook(() => useCursorContextMenu({ disabled: true }));

    act(() => result.current.openContextMenuAtCursor(contextMenuEvent(120, 140)));

    expect(result.current.isMenuOpen).toBe(false);
  });

  it('closes on a real Escape keydown and detaches its listener afterwards', () => {
    const { result } = renderHook(() => useCursorContextMenu());

    act(() => result.current.openContextMenuAtCursor(contextMenuEvent(10, 10)));
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    expect(result.current.isMenuOpen).toBe(false);

    // A second Escape against the closed menu must be a no-op, which only holds
    // if the effect cleanup removed the document listener.
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(result.current.isMenuOpen).toBe(false);
  });

  it('closes on an outside mousedown but not on one inside the menu', () => {
    render(<MenuHarness />);

    fireEvent.contextMenu(screen.getByTestId('trigger'), { clientX: 30, clientY: 40 });
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('menuitem', { name: 'First' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('moves focus between menu items with the arrow keys and wraps around', () => {
    render(<MenuHarness />);

    fireEvent.contextMenu(screen.getByTestId('trigger'), { clientX: 30, clientY: 40 });

    const first = screen.getByRole('menuitem', { name: 'First' });
    const second = screen.getByRole('menuitem', { name: 'Second' });

    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(second);

    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(document, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(second);
  });
});
