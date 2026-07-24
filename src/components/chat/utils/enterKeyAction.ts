/**
 * Decides what a keydown in the composer textarea should do.
 *
 * Extracted as a pure function so the Enter-vs-newline policy is unit-testable
 * without a DOM. The composer's keydown handler maps the result onto the event:
 *   - 'submit'  -> preventDefault() + send the message
 *   - 'newline' -> do nothing, let the textarea insert a line break
 *   - 'ignore'  -> not an Enter we act on (e.g. mid-IME-composition)
 */
export type EnterKeyAction = 'submit' | 'newline' | 'ignore';

export interface EnterKeyContext {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  /** True while an IME composition is in progress (Enter confirms, never sends). */
  isComposing: boolean;
  /** User preference: require Ctrl/Cmd+Enter to send instead of plain Enter. */
  sendByCtrlEnter: boolean;
  /** True on mobile/touch layouts, where plain Enter must insert a newline. */
  isMobile: boolean;
}

export function resolveEnterKeyAction(context: EnterKeyContext): EnterKeyAction {
  if (context.key !== 'Enter') {
    return 'ignore';
  }

  // Never hijack Enter while an IME candidate is being composed.
  if (context.isComposing) {
    return 'ignore';
  }

  // Ctrl/Cmd+Enter always sends — including on mobile hardware keyboards.
  if ((context.ctrlKey || context.metaKey) && !context.shiftKey) {
    return 'submit';
  }

  // On mobile the on-screen keyboard's Enter/Return inserts a newline; the send
  // button is the only way to send, so plain Enter must never submit.
  if (context.isMobile) {
    return 'newline';
  }

  // Desktop: plain Enter sends unless the user opted into Ctrl/Cmd+Enter, or is
  // holding a modifier (Shift+Enter, etc.), in which case insert a newline.
  if (!context.shiftKey && !context.ctrlKey && !context.metaKey && !context.sendByCtrlEnter) {
    return 'submit';
  }

  return 'newline';
}
