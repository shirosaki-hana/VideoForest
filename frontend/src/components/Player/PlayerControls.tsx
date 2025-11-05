import { Box, IconButton, Typography, Switch, FormControlLabel } from '@mui/material';
import { SkipNext as SkipNextIcon, SkipPrevious as SkipPreviousIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import type { MediaTreeNode } from '@videoforest/types';

interface PlayerControlsProps {
  prevFile: MediaTreeNode | null;
  nextFile: MediaTreeNode | null;
  currentIndex: number;
  playlistLength: number;
  autoPlayNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onAutoPlayChange: (checked: boolean) => void;
}

export default function PlayerControls({
  prevFile,
  nextFile,
  currentIndex,
  playlistLength,
  autoPlayNext,
  onPrevious,
  onNext,
  onAutoPlayChange,
}: PlayerControlsProps) {
  const { t } = useTranslation();

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, pt: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <IconButton onClick={onPrevious} disabled={!prevFile} color='primary' size='large'>
          <SkipPreviousIcon />
        </IconButton>
        <IconButton onClick={onNext} disabled={!nextFile} color='primary' size='large'>
          <SkipNextIcon />
        </IconButton>
        {playlistLength > 0 && (
          <Typography variant='body2' color='text.secondary' sx={{ ml: 1 }}>
            {currentIndex + 1} / {playlistLength}
          </Typography>
        )}
      </Box>
      <FormControlLabel
        control={<Switch checked={autoPlayNext} onChange={e => onAutoPlayChange(e.target.checked)} />}
        label={t('settings.playback.autoPlayNext')}
      />
    </Box>
  );
}
