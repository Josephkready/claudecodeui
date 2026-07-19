import { useCallback, useRef, useState } from 'react';
import type { TFunction } from 'i18next';

import { api } from '../../../utils/api';
import { buildBulkArchivePrompt, type BulkArchivePrompt } from '../utils/bulkArchivePrompt';

type UseBulkArchiveByAgeArgs = {
  // Refresh the active project/session lists once an archive runs so the moved
  // rows disappear from the sidebar. Usually `usePaletteOps().refreshProjects`.
  refreshProjects: () => Promise<void> | void;
  t: TFunction;
};

/**
 * The bulk "archive conversations older than N days" flow, extracted from the
 * sidebar controller so it can be driven from the Settings → Data tab (issue
 * #187) instead of a sidebar header menu.
 *
 * Two steps: {@link bulkArchiveSessionsByAge} previews how many sessions qualify
 * and opens an in-app confirmation prompt (never a blocking `window.confirm`);
 * {@link confirmBulkArchiveByAge} runs the archive and refreshes. Archiving is
 * reversible from the archived view, so a single confirmation — naming the count
 * so the user knows whether they're about to archive 2 or 200 — is enough.
 */
export function useBulkArchiveByAge({ refreshProjects, t }: UseBulkArchiveByAgeArgs) {
  // The active dialog (the previewed prompt + the age it applies to), or null.
  const [bulkArchiveByAgePrompt, setBulkArchiveByAgePrompt] =
    useState<{ prompt: BulkArchivePrompt; olderThanDays: number } | null>(null);
  // Monotonic id for the async archivable-count preview. Bumped on every new
  // request and on dismissal, so a slow/superseded preview can't resurrect a
  // stale dialog after the user moved on.
  const bulkArchivePreviewIdRef = useRef(0);

  // Step 1 (request): preview how many conversations qualify, then open the
  // confirmation prompt.
  const bulkArchiveSessionsByAge = useCallback(async (olderThanDays: number) => {
    const requestId = bulkArchivePreviewIdRef.current + 1;
    bulkArchivePreviewIdRef.current = requestId;
    // Preview the affected count. Best-effort: on failure `archivableCount` stays
    // null and the prompt falls back to the generic (count-less) confirmation
    // rather than blocking the action.
    let archivableCount: number | null = null;
    try {
      const countResponse = await api.getArchivableSessionCountByAge(olderThanDays);
      if (countResponse.ok) {
        const payload = (await countResponse.json()) as { data?: { archivableCount?: number } };
        const count = payload.data?.archivableCount;
        if (typeof count === 'number' && Number.isFinite(count)) {
          archivableCount = count;
        }
      } else {
        console.error('[Settings] Failed to preview archivable session count:', countResponse.status);
      }
    } catch (error) {
      console.error('[Settings] Failed to preview archivable session count:', error);
    }

    // A newer request started (or the dialog was dismissed) while this preview
    // was in flight — drop this now-stale result instead of reopening the dialog.
    if (requestId !== bulkArchivePreviewIdRef.current) {
      return;
    }

    // Both kinds open the dialog: `confirm` asks before archiving, `inform`
    // (nothing qualifies) shows an OK-only notice instead of running a no-op.
    const prompt = buildBulkArchivePrompt(archivableCount, olderThanDays, t);
    setBulkArchiveByAgePrompt({ prompt, olderThanDays });
  }, [t]);

  // Dismiss the dialog without archiving (Cancel, or the OK on an `inform`).
  const cancelBulkArchiveByAge = useCallback(() => {
    bulkArchivePreviewIdRef.current += 1;
    setBulkArchiveByAgePrompt(null);
  }, []);

  // Step 2 (confirm): run the archive for the captured age, then refresh. Only a
  // `confirm` prompt archives; an `inform` dialog has nothing to run.
  const confirmBulkArchiveByAge = useCallback(async () => {
    bulkArchivePreviewIdRef.current += 1;
    const active = bulkArchiveByAgePrompt;
    setBulkArchiveByAgePrompt(null);
    if (!active || active.prompt.kind !== 'confirm') {
      return;
    }

    try {
      const response = await api.bulkArchiveSessionsByAge(active.olderThanDays);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Settings] Failed to bulk-archive sessions by age:', {
          status: response.status,
          error: errorText,
        });
        alert(t('messages.archiveSessionFailed', 'Failed to archive session. Please try again.'));
        return;
      }

      await refreshProjects();
    } catch (error) {
      console.error('[Settings] Error bulk-archiving sessions by age:', error);
      alert(t('messages.archiveSessionError', 'Error archiving session. Please try again.'));
    }
  }, [bulkArchiveByAgePrompt, refreshProjects, t]);

  return {
    bulkArchiveByAgePrompt,
    bulkArchiveSessionsByAge,
    cancelBulkArchiveByAge,
    confirmBulkArchiveByAge,
  };
}
