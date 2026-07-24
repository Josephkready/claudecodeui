import assert from 'node:assert/strict';
import test from 'node:test';

import { TERMINAL_BACKGROUND_COLOR, TERMINAL_OPTIONS, TERMINAL_SURFACE_STYLE } from './constants';

/*
 * #246: the Shell wrapper and the xterm canvas used to carry two independent
 * hardcoded greys (#111827 vs #1e1e1e), which framed the terminal in a band of
 * the wrong colour. These lock the two together so re-inlining a hex on either
 * side fails here rather than in a screenshot.
 */

test('the xterm theme background is driven by the shared terminal colour', () => {
  assert.equal(TERMINAL_OPTIONS.theme?.background, TERMINAL_BACKGROUND_COLOR);
});

test('the cursor accent matches the background so the cursor stays legible', () => {
  assert.equal(TERMINAL_OPTIONS.theme?.cursorAccent, TERMINAL_BACKGROUND_COLOR);
});

test('the wrapper surface style paints the same colour as the terminal', () => {
  assert.equal(TERMINAL_SURFACE_STYLE.backgroundColor, TERMINAL_OPTIONS.theme?.background);
});
