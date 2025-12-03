import { Box, Typography, Button, Stack, IconButton, Divider, Tooltip } from '@mui/material';
import {
  Refresh as RefreshIcon,
  Scanner as ScanIcon,
  Settings as SettingsIcon,
  Logout as LogoutIcon,
  Terminal as LogsIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMediaStore } from '../../stores/mediaStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAuthStore } from '../../stores/authStore';
import { countFiles } from '../../utils/mediaTree';
import MediaTreeControls from './MediaTreeControls';

interface MediaHeaderProps {
  onScanClick: () => void;
}

export default function MediaHeader({ onScanClick }: MediaHeaderProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mediaTree, loading, loadMediaTree } = useMediaStore();
  const { openSettings } = useSettingsStore();
  const { logout, isLoading: authLoading } = useAuthStore();
  const totalFiles = countFiles(mediaTree);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch {
      // 에러는 스토어에서 처리
    }
  };

  return (
    <Box sx={{ mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant='h4' component='h1' gutterBottom>
            {t('common.appName')}
          </Typography>
          {!loading && (
            <Typography variant='body2' color='text.secondary'>
              {t('media.count', { count: totalFiles })}
            </Typography>
          )}
        </Box>
        <Stack direction='row' spacing={1} alignItems='center'>
          <Button variant='outlined' startIcon={<RefreshIcon />} onClick={loadMediaTree} disabled={loading}>
            {t('media.refresh')}
          </Button>
          <Button variant='contained' startIcon={<ScanIcon />} onClick={onScanClick} disabled={loading}>
            {t('media.scan')}
          </Button>
          <Divider orientation='vertical' flexItem sx={{ mx: 1 }} />
          <Tooltip title={t('logs.title')}>
            <IconButton onClick={() => navigate('/logs')} aria-label={t('logs.title')} size='large'>
              <LogsIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('settings.title')}>
            <IconButton onClick={openSettings} aria-label={t('settings.title')} size='large'>
              <SettingsIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('auth.logout')}>
            <IconButton onClick={handleLogout} disabled={authLoading} aria-label={t('auth.logout')} size='large'>
              <LogoutIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      {/* 컨트롤 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <MediaTreeControls />
      </Box>
    </Box>
  );
}
