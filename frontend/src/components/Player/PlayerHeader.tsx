import { Box, Paper, Typography, IconButton, useMediaQuery, useTheme } from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';

interface PlayerHeaderProps {
  mediaName: string;
  onBack: () => void;
}

export default function PlayerHeader({ mediaName, onBack }: PlayerHeaderProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  return (
    <Paper elevation={0} sx={{ p: 2, mb: isMobile ? 0 : 2, borderRadius: isMobile ? 0 : 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <IconButton onClick={onBack} sx={{ mr: 1 }} size='small'>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant={isMobile ? 'h6' : 'h5'} component='h1' sx={{ fontWeight: 600, flex: 1 }}>
          {mediaName}
        </Typography>
      </Box>
    </Paper>
  );
}

