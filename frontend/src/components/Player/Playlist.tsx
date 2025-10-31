import { Box, Paper, Typography, Stack, useMediaQuery, useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { formatDuration } from '../../utils/format';
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
          {playlist.map((file, index) => (
            <Box
              key={file.id}
              onClick={() => onSelectMedia(file.id)}
              sx={{
                p: 1.5,
                borderRadius: 1,
                cursor: 'pointer',
                bgcolor: file.id === currentMediaId ? 'primary.main' : 'transparent',
                color: file.id === currentMediaId ? 'primary.contrastText' : 'text.primary',
                '&:hover': {
                  bgcolor: file.id === currentMediaId ? 'primary.dark' : 'action.hover',
                },
                transition: 'background-color 0.2s',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                <Typography
                  variant='body2'
                  color={file.id === currentMediaId ? 'inherit' : 'text.secondary'}
                  sx={{ minWidth: 24, fontWeight: file.id === currentMediaId ? 'bold' : 'normal', mt: 0.2 }}
                >
                  {index + 1}
                </Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant='body2'
                    sx={{
                      fontWeight: file.id === currentMediaId ? 600 : 400,
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
          ))}
        </Stack>
      </Paper>
    </Box>
  );
}

