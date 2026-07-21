import { describe, expect, it } from 'vitest';

import i18n from '@/i18n/config.js';

// Guards the harness itself. Every other spec relies on `setup.ts` silently, so
// a regression there (a stub that stops being installed, a storage reset that
// quietly no-ops) would otherwise only surface as a confusing failure somewhere
// far away.

describe('component-test setup', () => {
  it('supplies the browser APIs jsdom omits', () => {
    expect(typeof window.matchMedia).toBe('function');
    expect(window.matchMedia('(prefers-color-scheme: dark)').matches).toBe(false);
    expect(typeof globalThis.ResizeObserver).toBe('function');
    expect(typeof globalThis.IntersectionObserver).toBe('function');
    expect(typeof Element.prototype.scrollIntoView).toBe('function');
    expect(typeof navigator.clipboard?.writeText).toBe('function');
  });

  it('makes scrolling a callable no-op', () => {
    // jsdom has no layout engine: `scrollIntoView` is absent entirely, so this
    // throws a TypeError without the setup's stub. (`scrollTo` does exist, but
    // only as a stub that logs "Not implemented" - the setup shadows it, which
    // is noise suppression rather than something an assertion can observe.)
    expect(() => document.createElement('div').scrollIntoView()).not.toThrow();
    expect(() => window.scrollTo(0, 100)).not.toThrow();
  });

  it('initialises i18next so components render real strings instead of keys', () => {
    expect(i18n.isInitialized).toBe(true);
    expect(i18n.t('codeBlock.copy', { ns: 'chat' })).toBe('Copy');
  });

  // The next two cases are a pair, in order: the first writes, the second proves
  // the `beforeEach` reset wiped it.
  it('starts each test with empty storage', () => {
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);

    window.localStorage.setItem('leak-probe', 'written by the previous test');
    window.sessionStorage.setItem('leak-probe', 'written by the previous test');
  });

  it('does not leak storage written by an earlier test', () => {
    expect(window.localStorage.getItem('leak-probe')).toBeNull();
    expect(window.sessionStorage.getItem('leak-probe')).toBeNull();
  });
});
