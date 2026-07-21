/**
 * Shared setup for the vitest component suite (`*.spec.ts`/`*.spec.tsx`).
 *
 * Everything here exists so individual tests stop hand-rolling the same stubs:
 * jsdom ships a DOM but omits a handful of browser APIs this app relies on
 * (`matchMedia`, `ResizeObserver`, `IntersectionObserver`, scrolling, the async
 * clipboard). Storage is real jsdom storage — it is only reset between tests so
 * one spec's `localStorage` writes can't leak into the next.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// Initialises i18next once for the whole run so components calling `t()` render
// the real English strings instead of raw keys.
import '@/i18n/config.js';

if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

class StubObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = StubObserver as unknown as typeof ResizeObserver;
}

if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = StubObserver as unknown as typeof IntersectionObserver;
}

// jsdom leaves these unimplemented and logs a noisy "Not implemented" error when
// a component calls them during a scroll-into-view or auto-scroll effect.
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
window.scrollTo = window.scrollTo ?? (() => {});
window.HTMLElement.prototype.hasPointerCapture ??= () => false;
window.HTMLElement.prototype.releasePointerCapture ??= () => {};

if (!navigator.clipboard) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async () => {},
      readText: async () => '',
    },
  });
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.documentElement.className = '';
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
