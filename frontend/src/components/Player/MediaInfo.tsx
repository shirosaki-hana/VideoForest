import { Paper, Typography, Stack, Chip, useMediaQuery, useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { formatDuration, formatFileSize } from '../../utils/format';
import type { MediaInfoResponse } from '@videoforest/types';

interface MediaInfoProps {
  mediaInfo: MediaInfoResponse['media'];
}

export default function MediaInfo({ mediaInfo }: MediaInfoProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  return (
    <Paper elevation={0} sx={{ p: 2, borderRadius: isMobile ? 0 : 1 }}>
      <Typography variant='subtitle1' gutterBottom sx={{ fontWeight: 600 }}>
        {t('player.mediaInfo')}
      </Typography>
      <Stack direction='row' spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mt: 2 }}>
        {mediaInfo.width && mediaInfo.height && (
          <Chip label={`${mediaInfo.width}×${mediaInfo.height}`} size='small' variant='outlined' />
        )}
        {mediaInfo.duration && <Chip label={formatDuration(mediaInfo.duration)} size='small' variant='outlined' />}
        {mediaInfo.fileSize && <Chip label={formatFileSize(mediaInfo.fileSize)} size='small' variant='outlined' />}
        {mediaInfo.codec && <Chip label={mediaInfo.codec.toUpperCase()} size='small' variant='outlined' />}
        {mediaInfo.audioCodec && <Chip label={mediaInfo.audioCodec.toUpperCase()} size='small' variant='outlined' />}
        {mediaInfo.fps && <Chip label={`${Math.round(mediaInfo.fps)} FPS`} size='small' variant='outlined' />}
        {mediaInfo.bitrate && <Chip label={`${Math.round(mediaInfo.bitrate / 1000)} kbps`} size='small' variant='outlined' />}
      </Stack>
    </Paper>
  );
}

