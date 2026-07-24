import type { RefObject } from 'react';

import { TERMINAL_SURFACE_STYLE } from '../../constants/constants';

type ShellMinimalViewProps = {
  terminalContainerRef: RefObject<HTMLDivElement>;
};

export default function ShellMinimalView({
  terminalContainerRef,
}: ShellMinimalViewProps) {
  return (
    // Painted from the xterm theme rather than a Tailwind grey so the frame
    // around the canvas matches the terminal exactly (#246).
    <div className="relative h-full w-full" style={TERMINAL_SURFACE_STYLE}>
      <div
        ref={terminalContainerRef}
        className="h-full w-full focus:outline-none"
        style={{ outline: 'none' }}
      />
    </div>
  );
}
