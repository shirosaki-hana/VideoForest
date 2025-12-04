import { Box, Typography, Chip, Stack, Tooltip } from '@mui/material';
import { VideoFile as VideoFileIcon, CheckCircle as CheckCircleIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatFileSize, formatDuration } from '../../utils/format';
import { useWatchHistoryStore } from '../../stores/watchHistoryStore';
import type { MediaTreeNode } from '@videoforest/types';

interface MediaFileItemProps {
  node: MediaTreeNode;
  depth: number;
}

export default function MediaFileItem({ node, depth }: MediaFileItemProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isWatched = useWatchHistoryStore(state => state.watchedMediaIds.has(node.id));

  const handleClick = () => {
    navigate(`/player/${node.id}`);
  };

  return (
    <Box
      onClick={handleClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        py: 1.5,
        px: 2,
        pl: 2 + (depth + 1) * 3,
        cursor: 'pointer',
        '&:hover': {
          bgcolor: 'action.hover',
        },
        borderRadius: 1,
        opacity: isWatched ? 0.7 : 1,
      }}
    >
      <Tooltip title={isWatched ? t('media.watched') : ''} placement='top'>
        <Box sx={{ position: 'relative', mr: 2 }}>
          <VideoFileIcon sx={{ color: isWatched ? 'success.main' : 'text.secondary' }} />
          {isWatched && (
            <CheckCircleIcon
              sx={{
                position: 'absolute',
                bottom: -4,
                right: -4,
                fontSize: 14,
                color: 'success.main',
                bgcolor: 'background.paper',
                borderRadius: '50%',
              }}
            />
          )}
        </Box>
      </Tooltip>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Tooltip title={node.name}>
          <Typography
            variant='body2'
            sx={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {node.name}
          </Typography>
        </Tooltip>
        <Stack direction='row' spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
          {node.width && node.height && (
            <Chip label={`${node.width}x${node.height}`} size='small' variant='outlined' sx={{ height: 20, fontSize: '0.7rem' }} />
          )}
          {node.duration && (
            <Chip label={formatDuration(node.duration)} size='small' variant='outlined' sx={{ height: 20, fontSize: '0.7rem' }} />
          )}
          {node.fileSize && (
            <Chip label={formatFileSize(node.fileSize)} size='small' variant='outlined' sx={{ height: 20, fontSize: '0.7rem' }} />
          )}
          {node.codec && <Chip label={node.codec.toUpperCase()} size='small' variant='outlined' sx={{ height: 20, fontSize: '0.7rem' }} />}
          {node.fps && (
            <Chip label={`${Math.round(node.fps)} FPS`} size='small' variant='outlined' sx={{ height: 20, fontSize: '0.7rem' }} />
          )}
        </Stack>
      </Box>
    </Box>
  );
}
