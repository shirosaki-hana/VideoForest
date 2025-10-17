import { Box, Typography, Button, Stack } from '@mui/material';
import { Refresh as RefreshIcon, Scanner as ScanIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useMediaStore } from '../../stores/mediaStore';
import { countFiles } from '../../utils/mediaTree';
import MediaTreeControls from './MediaTreeControls';

interface MediaHeaderProps {
  onScanClick: () => void;
}

export default function MediaHeader({ onScanClick }: MediaHeaderProps) {
  const { t } = useTranslation();
  const { mediaTree, loading, loadMediaTree } = useMediaStore();
  const totalFiles = countFiles(mediaTree);

  return (
    <Box sx={{ mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant='h4' component='h1' gutterBottom>
            {t('media.title')}
          </Typography>
          {!loading && (
            <Typography variant='body2' color='text.secondary'>
              {t('media.count', { count: totalFiles })}
            </Typography>
          )}
        </Box>
        <Stack direction='row' spacing={2}>
          <Button variant='outlined' startIcon={<RefreshIcon />} onClick={loadMediaTree} disabled={loading}>
            {t('media.refresh')}
          </Button>
          <Button variant='contained' startIcon={<ScanIcon />} onClick={onScanClick} disabled={loading}>
            {t('media.scan')}
          </Button>
        </Stack>
      </Box>

      {/* 컨트롤 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <MediaTreeControls />
      </Box>
    </Box>
  );
}
