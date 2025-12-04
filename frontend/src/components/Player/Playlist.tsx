import { Box, Paper, Typography, Stack, useMediaQuery, useTheme } from '@mui/material';
import { CheckCircle as CheckCircleIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { formatDuration } from '../../utils/format';
import { useWatchHistoryStore } from '../../stores/watchHistoryStore';
import type { MediaTreeNode } from '@videoforest/types';

interface PlaylistProps {
  playlist: MediaTreeNode[];
  currentMediaId: string;
  onSelectMedia: (mediaId: string) => void;
}

export default function Playlist({ playlist, currentMediaId, onSelectMedia }: PlaylistProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const watchedMediaIds = useWatchHistoryStore(state => state.watchedMediaIds);

  if (playlist.length <= 1) {
    return null;
  }

  return (
    <Box sx={{ flex: isMobile ? '1 1 auto' : '1 1 33.33%', minWidth: 0 }}>
      <Paper
        elevation={isMobile ? 0 : 1}
        sx={{
          borderRadius: isMobile ? 0 : 1,
          maxHeight: isMobile ? 'auto' : 'calc(100vh - 400px)',
          overflow: 'auto',
        }}
      >
        <Box
          sx={{
            p: 2,
            position: 'sticky',
            top: 0,
            bgcolor: 'background.paper',
            zIndex: 1,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Typography variant='subtitle1' sx={{ fontWeight: 600 }}>
            {t('player.playlist', { count: playlist.length })}
          </Typography>
        </Box>
        <Stack spacing={0} sx={{ p: 1 }}>
          {playlist.map((file, index) => {
            const isCurrent = file.id === currentMediaId;
            const isWatched = watchedMediaIds.has(file.id);

            return (
              <Box
                key={file.id}
                onClick={() => onSelectMedia(file.id)}
                sx={{
                  p: 1.5,
                  borderRadius: 1,
                  cursor: 'pointer',
                  bgcolor: isCurrent ? 'primary.main' : 'transparent',
                  color: isCurrent ? 'primary.contrastText' : 'text.primary',
                  opacity: !isCurrent && isWatched ? 0.7 : 1,
                  '&:hover': {
                    bgcolor: isCurrent ? 'primary.dark' : 'action.hover',
                  },
                  transition: 'background-color 0.2s',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                  <Box sx={{ minWidth: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', mt: 0.2 }}>
                    {isWatched ? (
                      <CheckCircleIcon
                        sx={{
                          fontSize: 16,
                          color: isCurrent ? 'inherit' : 'success.main',
                        }}
                      />
                    ) : (
                      <Typography
                        variant='body2'
                        color={isCurrent ? 'inherit' : 'text.secondary'}
                        sx={{ fontWeight: isCurrent ? 'bold' : 'normal' }}
                      >
                        {index + 1}
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant='body2'
                      sx={{
                        fontWeight: isCurrent ? 600 : 400,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        lineHeight: 1.4,
                      }}
                    >
                      {file.name}
                    </Typography>
                    {file.duration && (
                      <Typography variant='caption' sx={{ opacity: 0.8, display: 'block', mt: 0.5 }}>
                        {formatDuration(file.duration)}
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Box>
            );
          })}
        </Stack>
      </Paper>
    </Box>
  );
}
