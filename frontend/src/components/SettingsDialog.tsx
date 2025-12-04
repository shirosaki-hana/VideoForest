import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
  Box,
  ToggleButtonGroup,
  ToggleButton,
  Divider,
  Stack,
  Switch,
  FormControlLabel,
} from '@mui/material';
import { Close as CloseIcon, LightMode, DarkMode, SettingsBrightness, HighQuality, Sd, Hd } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useSettingsStore, type QualityPreference } from '../stores/settingsStore';
import { useThemeStore, type ThemeMode } from '../stores/themeStore';

export default function SettingsDialog() {
  const { t, i18n } = useTranslation();
  const { isOpen, closeSettings, autoPlayNext, setAutoPlayNext, preferredQuality, setPreferredQuality } = useSettingsStore();
  const { mode: themeMode, setMode: setThemeMode } = useThemeStore();

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

  const handleQualityChange = (_event: React.MouseEvent<HTMLElement>, newQuality: QualityPreference | null) => {
    if (newQuality !== null) {
      setPreferredQuality(newQuality);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={closeSettings}
      maxWidth='sm'
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pb: 1,
        }}
      >
        <Typography variant='h6' component='div'>
          {t('settings.title')}
        </Typography>
        <IconButton edge='end' color='inherit' onClick={closeSettings} aria-label='close' size='small'>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={3} sx={{ py: 1 }}>
          {/* 테마 설정 */}
          <Box>
            <Typography variant='subtitle2' gutterBottom sx={{ fontWeight: 600 }}>
              {t('settings.theme.title')}
            </Typography>
            <ToggleButtonGroup value={themeMode} exclusive onChange={handleThemeChange} fullWidth size='medium' sx={{ mt: 1.5 }}>
              <ToggleButton value='light' aria-label='light mode'>
                <LightMode sx={{ mr: 1 }} />
                {t('settings.theme.light')}
              </ToggleButton>
              <ToggleButton value='dark' aria-label='dark mode'>
                <DarkMode sx={{ mr: 1 }} />
                {t('settings.theme.dark')}
              </ToggleButton>
              <ToggleButton value='system' aria-label='system mode'>
                <SettingsBrightness sx={{ mr: 1 }} />
                {t('settings.theme.system')}
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Divider />

          {/* 언어 설정 */}
          <Box>
            <Typography variant='subtitle2' gutterBottom sx={{ fontWeight: 600 }}>
              {t('settings.language.title')}
            </Typography>
            <ToggleButtonGroup value={i18n.language} exclusive onChange={handleLanguageChange} fullWidth size='medium' sx={{ mt: 1.5 }}>
              <ToggleButton value='ko' aria-label='korean'>
                {t('settings.language.ko')}
              </ToggleButton>
              <ToggleButton value='en' aria-label='english'>
                {t('settings.language.en')}
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Divider />

          {/* 재생 설정 */}
          <Box>
            <Typography variant='subtitle2' gutterBottom sx={{ fontWeight: 600 }}>
              {t('settings.playback.title')}
            </Typography>
            <FormControlLabel
              control={<Switch checked={autoPlayNext} onChange={e => setAutoPlayNext(e.target.checked)} />}
              label={t('settings.playback.autoPlayNext')}
              sx={{ mt: 1 }}
            />
            <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 0.5, ml: 4 }}>
              {t('settings.playback.autoPlayNextDesc')}
            </Typography>
          </Box>

          <Divider />

          {/* 화질 설정 */}
          <Box>
            <Typography variant='subtitle2' gutterBottom sx={{ fontWeight: 600 }}>
              {t('settings.quality.title')}
            </Typography>
            <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mb: 1.5 }}>
              {t('settings.quality.description')}
            </Typography>
            <ToggleButtonGroup value={preferredQuality} exclusive onChange={handleQualityChange} fullWidth size='medium'>
              <ToggleButton value='high' aria-label='high quality'>
                <HighQuality sx={{ mr: 1 }} />
                {t('settings.quality.high')}
              </ToggleButton>
              <ToggleButton value='medium' aria-label='medium quality'>
                <Hd sx={{ mr: 1 }} />
                {t('settings.quality.medium')}
              </ToggleButton>
              <ToggleButton value='low' aria-label='low quality'>
                <Sd sx={{ mr: 1 }} />
                {t('settings.quality.low')}
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
