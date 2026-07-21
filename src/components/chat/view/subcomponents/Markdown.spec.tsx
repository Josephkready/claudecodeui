import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PaletteOpsProvider, usePaletteOpsRegister } from '../../../../contexts/PaletteOpsContext';
import { ThemeProvider } from '../../../../contexts/ThemeContext';

import { Markdown } from './Markdown';

// First test to render the chat Markdown chain in a real DOM. It is deliberately
// the harness's canary: `Markdown` imports `react-syntax-highlighter/dist/esm/styles/prism`,
// which the bare `tsx --test` runner cannot load ("does not provide an export named
// 'oneDark'"). Vitest transforms through Vite, so a green run here proves the
// CJS/ESM interop wall that blocked component testing is gone.

function RegisterPaletteOps({ openFileInEditor }: { openFileInEditor: (path: string) => void }) {
  usePaletteOpsRegister({ openFileInEditor });
  return null;
}

function renderMarkdown(markdown: string, openFileInEditor = vi.fn()) {
  const view = render(
    <ThemeProvider>
      <PaletteOpsProvider>
        <RegisterPaletteOps openFileInEditor={openFileInEditor} />
        <Markdown className="markdown-root">{markdown}</Markdown>
      </PaletteOpsProvider>
    </ThemeProvider>,
  );
  return { ...view, openFileInEditor };
}

const FENCED_CODE = ['```ts', 'const answer = 42;', 'const doubled = answer * 2;', '```'].join('\n');

describe('Markdown', () => {
  it('renders a fenced block through react-syntax-highlighter', () => {
    const { container } = renderMarkdown(FENCED_CODE);

    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre?.textContent).toContain('const answer = 42;');
    // Prism tokenises the source into spans - proof the highlighter really ran
    // rather than the raw text falling through to a plain <pre>.
    expect(pre?.querySelectorAll('span').length).toBeGreaterThan(1);
    // The language badge and the copy affordance come from the CodeBlock wrapper.
    expect(screen.getByText('ts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument();
  });

  it('renders single-line code spans inline instead of as a highlighted block', () => {
    const { container } = renderMarkdown('Call `normalizeInlineCodeFences` before rendering.');

    expect(container.querySelector('pre')).toBeNull();
    const code = container.querySelector('code');
    expect(code?.textContent).toBe('normalizeInlineCodeFences');
  });

  it('opens workspace file links in the editor instead of navigating', async () => {
    const user = userEvent.setup();
    const { openFileInEditor } = renderMarkdown('See [src/foo.ts:12](src/foo.ts:12) for details.');

    await user.click(screen.getByRole('link', { name: 'src/foo.ts:12' }));

    // The `:line` suffix is stripped before the path reaches the editor.
    expect(openFileInEditor).toHaveBeenCalledWith('src/foo.ts');
  });

  it('leaves external links to normal browser navigation', async () => {
    const user = userEvent.setup();
    const { openFileInEditor } = renderMarkdown('Read the [docs](https://example.com/guide.html).');

    const link = screen.getByRole('link', { name: 'docs' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');

    await user.click(link);
    expect(openFileInEditor).not.toHaveBeenCalled();
  });
});
