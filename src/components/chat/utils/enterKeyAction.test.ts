import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveEnterKeyAction } from './enterKeyAction';
import type { EnterKeyContext } from './enterKeyAction';

function ctx(overrides: Partial<EnterKeyContext> = {}): EnterKeyContext {
  return {
    key: 'Enter',
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    isComposing: false,
    sendByCtrlEnter: false,
    isMobile: false,
    ...overrides,
  };
}

test('non-Enter keys are ignored', () => {
  assert.equal(resolveEnterKeyAction(ctx({ key: 'a' })), 'ignore');
  assert.equal(resolveEnterKeyAction(ctx({ key: 'Tab' })), 'ignore');
});

test('Enter mid-IME-composition is ignored', () => {
  assert.equal(resolveEnterKeyAction(ctx({ isComposing: true })), 'ignore');
  // even on desktop where Enter would otherwise submit
  assert.equal(resolveEnterKeyAction(ctx({ isComposing: true, isMobile: false })), 'ignore');
});

test('desktop: plain Enter submits', () => {
  assert.equal(resolveEnterKeyAction(ctx()), 'submit');
});

test('desktop: Shift+Enter inserts a newline', () => {
  assert.equal(resolveEnterKeyAction(ctx({ shiftKey: true })), 'newline');
});

test('desktop: Ctrl/Cmd+Enter submits', () => {
  assert.equal(resolveEnterKeyAction(ctx({ ctrlKey: true })), 'submit');
  assert.equal(resolveEnterKeyAction(ctx({ metaKey: true })), 'submit');
});

test('desktop with sendByCtrlEnter: plain Enter inserts a newline', () => {
  assert.equal(resolveEnterKeyAction(ctx({ sendByCtrlEnter: true })), 'newline');
});

test('desktop with sendByCtrlEnter: Ctrl+Enter still submits', () => {
  assert.equal(resolveEnterKeyAction(ctx({ sendByCtrlEnter: true, ctrlKey: true })), 'submit');
});

test('mobile: plain Enter inserts a newline (does not submit)', () => {
  assert.equal(resolveEnterKeyAction(ctx({ isMobile: true })), 'newline');
});

test('mobile: Ctrl/Cmd+Enter still submits (hardware keyboard)', () => {
  assert.equal(resolveEnterKeyAction(ctx({ isMobile: true, ctrlKey: true })), 'submit');
  assert.equal(resolveEnterKeyAction(ctx({ isMobile: true, metaKey: true })), 'submit');
});

test('mobile: Shift+Enter inserts a newline', () => {
  assert.equal(resolveEnterKeyAction(ctx({ isMobile: true, shiftKey: true })), 'newline');
});
