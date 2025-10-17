import { AppBar as MuiAppBar, Toolbar, Typography, IconButton, Box } from '@mui/material';
import { Settings as SettingsIcon, Logout as LogoutIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';

export default function AppBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { openSettings } = useSettingsStore();
  const { logout, isLoading } = useAuthStore();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch {
      // 에러는 스토어에서 처리
    }
  };

  return (
    <MuiAppBar
      position='sticky'
      sx={theme => ({
        top: 0,
        bgcolor: theme.palette.mode === 'light' ? 'rgba(255,255,255,0.6)' : 'rgba(2,6,23,0.55)',
        color: 'text.primary',
        borderBottom: '1px solid',
        borderColor: 'divider',
        backdropFilter: 'saturate(150%) blur(10px)',
        boxShadow: 'none',
      })}
    >
      <Toolbar>
        <Typography variant='h6' component='div' sx={{ flexGrow: 1, fontWeight: 600 }}>
          {t('common.appName')}
        </Typography>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton color='inherit' onClick={openSettings} aria-label={t('settings.title')}>
            <SettingsIcon />
          </IconButton>
          <IconButton color='inherit' onClick={handleLogout} disabled={isLoading} aria-label={t('auth.logout')}>
            <LogoutIcon />
          </IconButton>
        </Box>
      </Toolbar>
    </MuiAppBar>
  );
}
