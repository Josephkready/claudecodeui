import { activeRunsDb } from '@/modules/database/index.js';

/**
 * Startup reconcile for the durable chat-run journal (issue #70).
 *
 * The in-memory run registry is wiped by any restart (crash, manual restart, or
 * a dante-sync/ansible-pull reconcile), which also kills the provider
 * subprocesses. Any `active_runs` row still marked `running` or `queued` at boot
 * therefore belongs to a lifecycle that ended abruptly: the run never reached
 * its terminal `complete` (which deletes the row) and was not drained. This
 * flags those rows as `interrupted` so the chat gateway can surface them as
 * resumable — the user's message is never silently lost.
 *
 * Runs that a graceful SIGTERM drain let finish, and any run that completed
 * before the crash, have already deleted their rows, so a clean restart flags
 * nothing (no spurious "interrupted" ghosts).
 *
 * Must run once at startup, after `initializeDatabase()` and before the server
 * accepts websocket traffic, so a resuming client sees the interrupted state.
 */
export function reconcileInterruptedRuns(): { interruptedSessions: number; interruptedMessages: number } {
  const { sessions, messages } = activeRunsDb.markAllInterrupted();

  if (messages > 0) {
    console.warn('[ChatRunReconcile] Surfaced interrupted chat runs from a previous server lifecycle', {
      sessions: sessions.length,
      messages,
    });
  }

  return { interruptedSessions: sessions.length, interruptedMessages: messages };
}
