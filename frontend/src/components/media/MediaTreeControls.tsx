import { Button, Stack } from '@mui/material';
import { UnfoldMore as UnfoldMoreIcon, UnfoldLess as UnfoldLessIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useMediaStore } from '../../stores/mediaStore';

export default function MediaTreeControls() {
  const { t } = useTranslation();
  const { expandAll, collapseAll, loading, mediaTree } = useMediaStore();

  return (
    <Stack direction='row' spacing={1}>
      <Button size='small' startIcon={<UnfoldMoreIcon />} onClick={expandAll} disabled={loading || mediaTree.length === 0}>
        {t('media.expandAll')}
      </Button>
      <Button size='small' startIcon={<UnfoldLessIcon />} onClick={collapseAll} disabled={loading || mediaTree.length === 0}>
        {t('media.collapseAll')}
      </Button>
    </Stack>
  );
}
