import test from 'node:test';
import assert from 'node:assert/strict';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ActionMenuItem } from './ActionMenu';
import CursorContextMenu from './CursorContextMenu';

// Static-render smoke coverage. The open/close, outside-click, Escape, and
// keyboard-nav behavior needs a DOM (jsdom/RTL — tracked by #103) and isn't
// exercised here; these assertions lock in the closed-by-default render and that
// edge-case props (empty items, disabled) don't throw during render.

const noop = () => {};
const items: ActionMenuItem[] = [
  { key: 'a', label: 'Action A', onSelect: noop },
  { key: 'b', label: 'Action B', onSelect: noop, isDanger: true },
];

function render(props: Partial<React.ComponentProps<typeof CursorContextMenu>> = {}): string {
  return renderToStaticMarkup(
    <CursorContextMenu items={items} ariaLabel="Test menu" {...props}>
      <span>CHILD_MARKER</span>
    </CursorContextMenu>,
  );
}

test('renders its children', () => {
  assert.ok(render().includes('CHILD_MARKER'), 'children should always render');
});

test('keeps the menu closed until right-click (no menu in initial markup)', () => {
  const html = render();
  assert.ok(!html.includes('role="menu"'), 'no menu container before a contextmenu event');
  assert.ok(!html.includes('Action A'), 'menu items should not be in the closed-state markup');
});

test('does not throw with an empty item list', () => {
  const html = render({ items: [] });
  assert.ok(html.includes('CHILD_MARKER'), 'children still render with no items');
});

test('does not throw when disabled', () => {
  const html = render({ disabled: true });
  assert.ok(html.includes('CHILD_MARKER'), 'children still render when disabled');
});
