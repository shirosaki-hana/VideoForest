import { Box, Typography } from '@mui/material';
import { Movie as MovieIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

export default function EmptyMediaState() {
  const { t } = useTranslation();

  return (
    <Box sx={{ textAlign: 'center', py: 8 }}>
      <MovieIcon sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
      <Typography variant='h6' color='text.secondary' gutterBottom>
        {t('media.empty')}
      </Typography>
      <Typography variant='body2' color='text.secondary'>
        {t('media.emptyHint')}
      </Typography>
    </Box>
  );
}
