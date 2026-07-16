import type { Project } from '../../../types/app';
import type { SessionActivityMap } from '../../../hooks/useSessionProtection';
import type { SessionWithProvider } from '../types/types';

import { getAllSessions, getSessionDate } from './utils';

/**
 * Attention-ranked status for a conversation row in the unified Conversations
 * view. Mirrors the herdr "what needs me now" ordering: a session waiting on the
 * user (`attention`) outranks one actively processing (`running`), which
 * outranks everything dormant (`idle`). See design doc item #1.
 */
export type ConversationStatus = 'attention' | 'running' | 'idle';

export type ConversationListItem = {
  project: Project;
  session: SessionWithProvider;
  status: ConversationStatus;
  /** Last-activity time in epoch ms; drives the within-status recency sort. */
  activityTime: number;
};

// Lower number sorts first. attention > running > idle.
const STATUS_RANK: Record<ConversationStatus, number> = {
  attention: 0,
  running: 1,
  idle: 2,
};

function resolveStatus(
  sessionId: string,
  activeSessions: SessionActivityMap,
  attentionSessionIds: ReadonlySet<string>,
): ConversationStatus {
  // Attention wins over running: a blocked/finished session the user hasn't
  // looked at yet is more urgent than one still churning.
  if (attentionSessionIds.has(sessionId)) {
    return 'attention';
  }
  if (activeSessions.has(sessionId)) {
    return 'running';
  }
  return 'idle';
}

/**
 * Flatten every project's loaded sessions into a single attention-ranked list.
 *
 * Only the sessions already loaded onto each project are considered (the first
 * page from `/api/projects`), which always includes the recent — i.e. attention
 * and running — sessions. The idle tail of very long projects may be truncated;
 * a dedicated cross-project endpoint would remove that limit (see design item #1
 * follow-up).
 */
export function buildConversationList(
  projects: Project[],
  activeSessions: SessionActivityMap,
  attentionSessionIds: ReadonlySet<string>,
): ConversationListItem[] {
  const items: ConversationListItem[] = [];

  for (const project of projects) {
    for (const session of getAllSessions(project)) {
      const status = resolveStatus(String(session.id), activeSessions, attentionSessionIds);
      items.push({
        project,
        session,
        status,
        activityTime: getSessionDate(session).getTime(),
      });
    }
  }

  return items.sort((a, b) => {
    const rankDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (rankDiff !== 0) {
      return rankDiff;
    }
    // Newest first within a status band. NaN timestamps (unparseable dates)
    // sink to the bottom of their band rather than scrambling the order.
    const aTime = Number.isNaN(a.activityTime) ? -Infinity : a.activityTime;
    const bTime = Number.isNaN(b.activityTime) ? -Infinity : b.activityTime;
    return bTime - aTime;
  });
}
