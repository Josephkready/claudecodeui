import { Terminal } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '../../../../lib/utils';

type CliOriginBadgeProps = {
  // `sm` matches the sidebar Conversations chip (9px); `md` is slightly more
  // prominent for the opened-session header, where the badge carries real weight.
  size?: 'sm' | 'md';
  className?: string;
};

/**
 * Marks a session cloudcli isn't driving (#71/#225): started from a terminal/CLI
 * (or created before session tracking), so its live status is unknown. Reuses the
 * hedged copy/tooltip + i18n keys from the sidebar Conversations list so every
 * surface that flags a CLI-origin session says exactly the same thing. Self-
 * contained (its own `useTranslation('sidebar')`) so any surface can drop it in.
 */
export default function CliOriginBadge({ size = 'sm', className }: CliOriginBadgeProps) {
  const { t } = useTranslation('sidebar');
  const isMd = size === 'md';

  return (
    <span
      className={cn(
        'flex flex-shrink-0 items-center gap-0.5 rounded-sm bg-muted px-1 font-medium uppercase leading-tight tracking-wide text-muted-foreground/80',
        isMd ? 'text-[10px]' : 'text-[9px]',
        className,
      )}
      title={t(
        'conversations.cliOriginTooltip',
        "Not driven by cloudcli — started from a terminal/CLI (or created before session tracking), so its live status is unknown",
      )}
      aria-label={t('conversations.cliOrigin', 'Session not driven by cloudcli')}
    >
      <Terminal className={cn('flex-shrink-0', isMd ? 'h-2.5 w-2.5' : 'h-2 w-2')} aria-hidden="true" />
      {t('conversations.cliOriginBadge', 'CLI')}
    </span>
  );
}
