import test from 'node:test';
import assert from 'node:assert/strict';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { InterruptedRunBanner } from './InterruptedRunBanner';

// Coverage for #70: the interrupted-run banner offers a one-click Resume when
// (and only when) the session is interrupted and idle. Rendered in isolation so
// it exercises the real component without the chat/websocket/i18n stack.

test('renders the message and a Resume button when shown', () => {
  const html = renderToStaticMarkup(
    React.createElement(InterruptedRunBanner, { show: true, onResume: () => {} }),
  );
  assert.match(html, /<button\b/, 'a Resume control is offered');
  assert.ok(html.includes('Resume'), 'the resume label renders');
  assert.ok(html.includes('interrupted by a server restart'), 'explains why the run stopped');
  assert.match(html, /role="status"/, 'announced as a status region');
});

test('renders custom (i18n) labels when provided', () => {
  const html = renderToStaticMarkup(
    React.createElement(InterruptedRunBanner, {
      show: true,
      onResume: () => {},
      message: 'La ejecución se interrumpió al reiniciar el servidor.',
      resumeLabel: 'Reanudar',
    }),
  );
  assert.ok(html.includes('Reanudar'), 'uses the provided resume label');
  assert.ok(html.includes('se interrumpió'), 'uses the provided message');
});

test('renders nothing when not shown (no ghost banner on normal chat)', () => {
  const html = renderToStaticMarkup(
    React.createElement(InterruptedRunBanner, { show: false, onResume: () => {} }),
  );
  assert.equal(html, '', 'the banner is absent unless there is interrupted work to resume');
});
