import {
  Drawer,
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  Switch,
  FormControlLabel,
  IconButton,
  useTheme,
  useMediaQuery,
  Tooltip,
} from '@mui/material';
import {
  Home as HomeIcon,
  LightMode,
  DarkMode,
  SettingsBrightness,
  Logout as LogoutIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Language as LanguageIcon,
  PlayCircleOutline as PlayCircleIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSidebarStore } from '../stores/sidebarStore';
import { useThemeStore, type ThemeMode } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';

const DRAWER_WIDTH = 280;
const MINI_DRAWER_WIDTH = 72;

export default function Sidebar() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const location = useLocation();

  const { isOpen, isMini, autoPlayNext, closeSidebar, toggleMini, setAutoPlayNext } = useSidebarStore();
  const { mode: themeMode, setMode: setThemeMode } = useThemeStore();
  const { logout, isLoading } = useAuthStore();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch {
      // 에러는 스토어에서 처리
    }
  };

  const handleThemeChange = (_event: React.MouseEvent<HTMLElement>, newMode: ThemeMode | null) => {
    if (newMode !== null) {
      setThemeMode(newMode);
    }
  };

  const handleLanguageChange = (_event: React.MouseEvent<HTMLElement>, newLang: string | null) => {
    if (newLang !== null) {
      i18n.changeLanguage(newLang);
      localStorage.setItem('language', newLang);
    }
  };

  const handleNavigateHome = () => {
    navigate('/');
    if (isMobile) closeSidebar();
  };

  // 데스크탑에서는 영구 사이드바 (접기/펼치기 가능)
  // 모바일에서는 임시 드로어
  const drawerWidth = isMini && !isMobile ? MINI_DRAWER_WIDTH : DRAWER_WIDTH;
  const variant = isMobile ? 'temporary' : 'permanent';

  const drawerContent = (
    <Box
      sx={{
        width: drawerWidth,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        transition: theme.transitions.create('width', {
          easing: theme.transitions.easing.sharp,
          duration: theme.transitions.duration.enteringScreen,
        }),
      }}
    >
      {/* 헤더 */}
      <Box
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 64,
        }}
      >
        {!isMini && (
          <Typography variant='h6' sx={{ fontWeight: 700, color: 'primary.main' }}>
            {t('common.appName')}
          </Typography>
        )}
        {!isMobile && (
          <IconButton onClick={toggleMini} size='small'>
            {isMini ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </IconButton>
        )}
      </Box>

      <Divider />

      {/* 네비게이션 */}
      <List sx={{ px: 1, pt: 1 }}>
        <Tooltip title={isMini ? t('media.title') : ''} placement='right'>
          <ListItem disablePadding>
            <ListItemButton
              selected={location.pathname === '/'}
              onClick={handleNavigateHome}
              sx={{
                borderRadius: 1,
                mb: 0.5,
                justifyContent: isMini ? 'center' : 'flex-start',
              }}
            >
              <ListItemIcon sx={{ minWidth: isMini ? 0 : 40 }}>
                <HomeIcon />
              </ListItemIcon>
              {!isMini && <ListItemText primary={t('media.title')} />}
            </ListItemButton>
          </ListItem>
        </Tooltip>
      </List>

      <Divider sx={{ my: 1 }} />

      {/* 설정 영역 */}
      <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 1 }}>
        {!isMini ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* 테마 설정 */}
            <Box>
              <Typography variant='subtitle2' sx={{ fontWeight: 600, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                <LightMode fontSize='small' />
                {t('settings.theme.title')}
              </Typography>
              <ToggleButtonGroup value={themeMode} exclusive onChange={handleThemeChange} fullWidth size='small'>
                <ToggleButton value='light'>
                  <LightMode fontSize='small' sx={{ mr: 0.5 }} />
                  {t('settings.theme.light')}
                </ToggleButton>
                <ToggleButton value='dark'>
                  <DarkMode fontSize='small' sx={{ mr: 0.5 }} />
                  {t('settings.theme.dark')}
                </ToggleButton>
                <ToggleButton value='system'>
                  <SettingsBrightness fontSize='small' sx={{ mr: 0.5 }} />
                  {t('settings.theme.system')}
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <Divider />

            {/* 언어 설정 */}
            <Box>
              <Typography variant='subtitle2' sx={{ fontWeight: 600, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                <LanguageIcon fontSize='small' />
                {t('settings.language.title')}
              </Typography>
              <ToggleButtonGroup value={i18n.language} exclusive onChange={handleLanguageChange} fullWidth size='small'>
                <ToggleButton value='ko'>{t('settings.language.ko')}</ToggleButton>
                <ToggleButton value='en'>{t('settings.language.en')}</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <Divider />

            {/* 재생 설정 */}
            <Box>
              <Typography variant='subtitle2' sx={{ fontWeight: 600, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                <PlayCircleIcon fontSize='small' />
                {t('settings.playback.title')}
              </Typography>
              <FormControlLabel
                control={<Switch checked={autoPlayNext} onChange={e => setAutoPlayNext(e.target.checked)} size='small' />}
                label={
                  <Box>
                    <Typography variant='body2'>{t('settings.playback.autoPlayNext')}</Typography>
                    <Typography variant='caption' color='text.secondary'>
                      {t('settings.playback.autoPlayNextDesc')}
                    </Typography>
                  </Box>
                }
                sx={{ alignItems: 'flex-start', m: 0 }}
              />
            </Box>
          </Box>
        ) : (
          // Mini 모드일 때는 아이콘만 표시
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
            <Tooltip title={t('settings.theme.title')} placement='right'>
              <IconButton size='small'>
                {themeMode === 'light' ? <LightMode /> : themeMode === 'dark' ? <DarkMode /> : <SettingsBrightness />}
              </IconButton>
            </Tooltip>
            <Tooltip title={t('settings.language.title')} placement='right'>
              <IconButton size='small'>
                <LanguageIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title={t('settings.playback.title')} placement='right'>
              <IconButton size='small'>
                <PlayCircleIcon />
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Box>

      <Divider />

      {/* 로그아웃 */}
      <List sx={{ px: 1, pb: 1 }}>
        <Tooltip title={isMini ? t('auth.logout') : ''} placement='right'>
          <ListItem disablePadding>
            <ListItemButton
              onClick={handleLogout}
              disabled={isLoading}
              sx={{
                borderRadius: 1,
                mt: 0.5,
                justifyContent: isMini ? 'center' : 'flex-start',
              }}
            >
              <ListItemIcon sx={{ minWidth: isMini ? 0 : 40 }}>
                <LogoutIcon />
              </ListItemIcon>
              {!isMini && <ListItemText primary={t('auth.logout')} />}
            </ListItemButton>
          </ListItem>
        </Tooltip>
      </List>
    </Box>
  );

  return (
    <Drawer
      variant={variant}
      open={isMobile ? isOpen : true}
      onClose={closeSidebar}
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          borderRight: '1px solid',
          borderColor: 'divider',
          transition: theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
        },
      }}
    >
      {drawerContent}
    </Drawer>
  );
}
