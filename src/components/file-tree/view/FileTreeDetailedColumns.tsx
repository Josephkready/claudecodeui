import { useTranslation } from 'react-i18next';

import { FILE_TREE_DETAILED_GRID_CLASS } from '../constants/constants';
import { cn } from '../../../lib/utils';

export default function FileTreeDetailedColumns() {
  const { t } = useTranslation();

  return (
    <div className="border-b border-border px-3 pb-1 pt-1.5">
      <div
        className={cn(
          FILE_TREE_DETAILED_GRID_CLASS,
          'px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70',
        )}
      >
        <div>{t('fileTree.name')}</div>
        <div>{t('fileTree.size')}</div>
        <div>{t('fileTree.modified')}</div>
        <div>{t('fileTree.permissions')}</div>
      </div>
    </div>
  );
}
