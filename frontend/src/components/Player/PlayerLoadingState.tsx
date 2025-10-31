import { Box, Container, Typography, CircularProgress, Alert, IconButton } from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

interface PlayerLoadingStateProps {
  loading: boolean;
  preparingStream: boolean;
  error: string | null;
  mediaName?: string;
  onBack: () => void;
}

export default function PlayerLoadingState({ loading, preparingStream, error, mediaName, onBack }: PlayerLoadingStateProps) {
  const { t } = useTranslation();

  if (!loading && !preparingStream && !error) {
    return null;
  }

  return (
    <Container maxWidth='lg' sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={onBack} sx={{ mr: 2 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant='h6' component='h1'>
          {mediaName || 'Loading...'}
        </Typography>
      </Box>

      {loading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8, gap: 2 }}>
          <CircularProgress size={60} />
          <Typography variant='body1' color='text.secondary'>
            {t('player.loadingMedia')}
          </Typography>
        </Box>
      )}

      {!loading && preparingStream && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8, gap: 2 }}>
          <CircularProgress size={60} />
          <Typography variant='body1' color='text.secondary'>
            {t('player.preparingStream')}
          </Typography>
          <Typography variant='caption' color='text.secondary'>
            {t('player.preparingStreamDesc')}
          </Typography>
        </Box>
      )}

      {!loading && error && <Alert severity='error'>{error}</Alert>}
    </Container>
  );
}

