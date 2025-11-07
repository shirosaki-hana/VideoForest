import { AppBar as MuiAppBar, Toolbar, Typography, IconButton, useMediaQuery, useTheme } from '@mui/material';
import { Menu as MenuIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useSidebarStore } from '../stores/sidebarStore';

export default function AppBar() {
  const { t } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { toggleSidebar } = useSidebarStore();

  return (
    <MuiAppBar
      position='sticky'
      sx={theme => ({
        top: 0,
        bgcolor: theme.palette.mode === 'light' ? 'rgba(255,255,255,0.7)' : 'rgba(2,6,23,0.7)',
        color: 'text.primary',
        borderBottom: '1px solid',
        borderColor: 'divider',
        backdropFilter: 'saturate(150%) blur(12px)',
        boxShadow: 'none',
        zIndex: theme.zIndex.drawer + 1,
      })}
    >
      <Toolbar variant='dense' sx={{ minHeight: 48 }}>
        {isMobile && (
          <IconButton color='inherit' edge='start' onClick={toggleSidebar} sx={{ mr: 2 }} aria-label='menu'>
            <MenuIcon />
          </IconButton>
        )}

        <Typography variant='h6' component='div' sx={{ fontWeight: 600, fontSize: '1.1rem' }}>
          {t('common.appName')}
        </Typography>
      </Toolbar>
    </MuiAppBar>
  );
}
