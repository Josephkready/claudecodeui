import { useTranslation } from 'react-i18next';

import { Button } from '../../../../shared/view/ui';
import { usePaletteOps } from '../../../../contexts/PaletteOpsContext';
import { useBulkArchiveByAge } from '../../../sidebar/hooks/useBulkArchiveByAge';
import BulkArchiveConfirmation from '../../../sidebar/view/subcomponents/BulkArchiveConfirmation';
import SettingsCard from '../SettingsCard';
import SettingsRow from '../SettingsRow';
import SettingsSection from '../SettingsSection';

const BULK_ARCHIVE_AGE_PRESETS = [7, 30, 90];

/**
 * Data / maintenance settings. Currently hosts the bulk "archive older
 * conversations" declutter action, relocated here from the sidebar header
 * (issue #187) — a rare, mildly-destructive maintenance task belongs in
 * Settings, not the primary nav. The flow itself lives in
 * {@link useBulkArchiveByAge}; this tab only mounts its entry points.
 */
export default function DataSettingsTab() {
  // Load both namespaces: `settings` for this tab's own labels, `sidebar` for
  // the shared `archive.*` strings used by the archive flow + confirmation.
  const { t } = useTranslation(['settings', 'sidebar']);
  const { refreshProjects } = usePaletteOps();
  const {
    bulkArchiveByAgePrompt,
    bulkArchiveSessionsByAge,
    cancelBulkArchiveByAge,
    confirmBulkArchiveByAge,
  } = useBulkArchiveByAge({ refreshProjects, t });

  return (
    <div className="space-y-8">
      <SettingsSection title={t('dataSettings.maintenance.title', 'Maintenance')}>
        <SettingsCard>
          <SettingsRow
            label={t('dataSettings.bulkArchive.label', 'Archive old conversations')}
            description={t(
              'dataSettings.bulkArchive.description',
              'Move conversations older than a chosen age into the archive to declutter the list. This is reversible from the sidebar’s Archived view.',
            )}
          >
            <div className="flex flex-wrap gap-2">
              {BULK_ARCHIVE_AGE_PRESETS.map((days) => (
                <Button
                  key={days}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void bulkArchiveSessionsByAge(days);
                  }}
                >
                  {t('archive.bulkByAgeOption', { days, defaultValue: 'Older than {{days}} days' })}
                </Button>
              ))}
            </div>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <BulkArchiveConfirmation
        prompt={bulkArchiveByAgePrompt?.prompt ?? null}
        onConfirm={() => {
          void confirmBulkArchiveByAge();
        }}
        onCancel={cancelBulkArchiveByAge}
        t={t}
      />
    </div>
  );
}
