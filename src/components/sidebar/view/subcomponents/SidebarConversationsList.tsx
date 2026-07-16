import { useMemo, type ReactNode } from 'react';
import { Activity, AlertCircle, Clock, Loader2, MessageSquare } from 'lucide-react';
import type { TFunction } from 'i18next';

import { cn } from '../../../../lib/utils';
import type { Project, ProjectSession } from '../../../../types/app';
import type { SessionActivityMap } from '../../../../hooks/useSessionProtection';
import type { SessionWithProvider } from '../../types/types';
import { buildConversationList, type ConversationListItem, type ConversationStatus } from '../../utils/conversationList';
import { getSessionName } from '../../utils/utils';
import SessionProviderLogo from '../../../llm-logo-provider/SessionProviderLogo';

type SidebarConversationsListProps = {
  projects: Project[];
  activeSessions: SessionActivityMap;
  attentionSessionIds: ReadonlySet<string>;
  selectedSession: ProjectSession | null;
  currentTime: Date;
  onSelect: (session: SessionWithProvider, project: Project) => void;
  t: TFunction;
};

/**
 * Compact relative age (<1m, Xm, Xhr, Xd) for a conversation row. Shares the
 * format used by the per-project session rows so the two views read the same.
 */
function formatCompactAge(activityTime: number, currentTime: Date): string {
  if (!Number.isFinite(activityTime) || activityTime <= 0) {
    return '';
  }

  const diffInMinutes = Math.floor(Math.max(0, currentTime.getTime() - activityTime) / (1000 * 60));
  if (diffInMinutes < 1) {
    return '<1m';
  }
  if (diffInMinutes < 60) {
    return `${diffInMinutes}m`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours}hr`;
  }

  return `${Math.floor(diffInHours / 24)}d`;
}

type SectionMeta = {
  status: ConversationStatus;
  icon: typeof Activity;
  label: string;
  iconClassName: string;
};

const STATUS_ORDER: ConversationStatus[] = ['attention', 'running', 'idle'];

function ConversationRow({
  item,
  isSelected,
  currentTime,
  onSelect,
  t,
}: {
  item: ConversationListItem;
  isSelected: boolean;
  currentTime: Date;
  onSelect: (session: SessionWithProvider, project: Project) => void;
  t: TFunction;
}) {
  const { project, session, status } = item;
  const title = getSessionName(session, t);
  const projectName = project.displayName || project.projectId;
  const compactAge = formatCompactAge(item.activityTime, currentTime);

  let statusIndicator: ReactNode = null;
  if (status === 'attention') {
    statusIndicator = (
      <span
        role="status"
        aria-label={t('conversations.attentionStatus', 'Needs attention')}
        title={t('conversations.attentionStatus', 'Needs attention')}
        className="h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-amber-500"
      />
    );
  } else if (status === 'running') {
    statusIndicator = (
      <Loader2
        aria-label={t('conversations.runningStatus', 'Working')}
        className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-emerald-500"
      />
    );
  } else if (compactAge) {
    statusIndicator = <span className="flex-shrink-0 text-[11px] text-muted-foreground">{compactAge}</span>;
  }

  return (
    <a
      href={`/session/${session.id}`}
      className={cn(
        'flex w-full min-w-0 items-center gap-2 rounded-md border p-2 text-left transition-all duration-150',
        isSelected
          ? 'border-primary/20 bg-primary/5'
          : status === 'attention'
            ? 'border-amber-500/30 bg-amber-50/10 hover:bg-amber-50/20 dark:bg-amber-900/5 dark:hover:bg-amber-900/10'
            : status === 'running'
              ? 'border-emerald-500/30 bg-emerald-50/10 hover:bg-emerald-50/20 dark:bg-emerald-900/5 dark:hover:bg-emerald-900/10'
              : 'border-border/30 bg-card hover:bg-accent/50',
      )}
      // Left-click keeps in-app navigation; Ctrl/Cmd/middle-click and the native
      // context menu use the href to open the session in a new tab.
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return;
        }
        event.preventDefault();
        onSelect(session, project);
      }}
    >
      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-muted/50">
        <SessionProviderLogo provider={session.__provider} className="h-3 w-3" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-normal text-foreground">{title}</span>
        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <MessageSquare className="h-2.5 w-2.5 flex-shrink-0 opacity-70" />
          <span className="truncate">{projectName}</span>
        </span>
      </span>
      {statusIndicator}
    </a>
  );
}

export default function SidebarConversationsList({
  projects,
  activeSessions,
  attentionSessionIds,
  selectedSession,
  currentTime,
  onSelect,
  t,
}: SidebarConversationsListProps) {
  const items = useMemo(
    () => buildConversationList(projects, activeSessions, attentionSessionIds),
    [projects, activeSessions, attentionSessionIds],
  );

  const sections: SectionMeta[] = [
    {
      status: 'attention',
      icon: AlertCircle,
      label: t('conversations.attentionHeader', 'Needs attention'),
      iconClassName: 'text-amber-500',
    },
    {
      status: 'running',
      icon: Activity,
      label: t('conversations.runningHeader', 'Running'),
      iconClassName: 'text-emerald-500',
    },
    {
      status: 'idle',
      icon: Clock,
      label: t('conversations.idleHeader', 'Recent'),
      iconClassName: 'text-muted-foreground',
    },
  ];

  if (items.length === 0) {
    return (
      <div className="px-4 py-12 text-center md:py-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted md:mb-3">
          <MessageSquare className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="mb-2 text-base font-medium text-foreground md:mb-1">
          {t('conversations.emptyTitle', 'No conversations yet')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t('conversations.emptyDescription', 'Start a session from a project and it will appear here.')}
        </p>
      </div>
    );
  }

  const itemsByStatus = new Map<ConversationStatus, ConversationListItem[]>();
  for (const status of STATUS_ORDER) {
    itemsByStatus.set(status, []);
  }
  for (const item of items) {
    itemsByStatus.get(item.status)?.push(item);
  }

  return (
    <div className="space-y-3 px-2 pb-safe-area-inset-bottom">
      {sections.map((section) => {
        const sectionItems = itemsByStatus.get(section.status) ?? [];
        if (sectionItems.length === 0) {
          return null;
        }
        const SectionIcon = section.icon;

        return (
          <div key={section.status} className="space-y-1">
            <div className="flex items-center gap-1.5 px-1 py-1">
              <SectionIcon className={cn('h-3 w-3 flex-shrink-0', section.iconClassName)} />
              <span className="text-xs font-medium text-foreground">{section.label}</span>
              <span className="text-[11px] text-muted-foreground">{sectionItems.length}</span>
            </div>
            <div className="space-y-1">
              {sectionItems.map((item) => (
                <ConversationRow
                  key={`${item.project.projectId}-${item.session.id}`}
                  item={item}
                  isSelected={selectedSession?.id === item.session.id}
                  currentTime={currentTime}
                  onSelect={onSelect}
                  t={t}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
