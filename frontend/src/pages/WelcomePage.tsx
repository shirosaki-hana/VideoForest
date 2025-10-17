import { useTranslation } from 'react-i18next';
import { Box, Container, Typography, Paper, Stack, Button } from '@mui/material';
import { Celebration } from '@mui/icons-material';

export default function WelcomePage() {
  const { t } = useTranslation();

  return (
    <Container component="main" maxWidth="lg">
      <Box
        sx={{
          minHeight: 'calc(100vh - 64px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          py: 8,
        }}
      >
        <Paper
          elevation={0}
          sx={theme => ({
            p: { xs: 4, sm: 8 },
            width: '100%',
            border: '1px solid',
            borderColor: 'divider',
            bgcolor:
              theme.palette.mode === 'light'
                ? 'rgba(255,255,255,0.7)'
                : 'rgba(2,6,23,0.55)',
          })}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Box
              sx={{
                width: 96,
                height: 96,
                borderRadius: '24px',
                background:
                  'linear-gradient(135deg, rgba(59,130,246,0.9), rgba(124,58,237,0.9))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 3,
              }}
            >
              <Celebration sx={{ fontSize: 48, color: 'white' }} />
            </Box>

            <Typography
              component="h1"
              variant="h3"
              sx={{
                fontWeight: 800,
                textAlign: 'center',
                background:
                  'linear-gradient(135deg, #2563eb 0%, #7c3aed 60%, #10b981 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
              gutterBottom
            >
              {t('welcome.title')}
            </Typography>

            <Typography variant="h6" color="text.secondary" sx={{ mb: 5, textAlign: 'center', maxWidth: 900 }}>
              {t('welcome.subtitle')}
            </Typography>

            <Stack spacing={2} direction={{ xs: 'column', sm: 'row' }} sx={{ width: '100%' }}>
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  flex: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {t('welcome.features.personal')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('welcome.features.personal_desc')}
                </Typography>
              </Paper>

              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  flex: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {t('welcome.features.secure')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('welcome.features.secure_desc')}
                </Typography>
              </Paper>

              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  flex: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {t('welcome.features.accessible')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('welcome.features.accessible_desc')}
                </Typography>
              </Paper>
            </Stack>

            <Button size="large" variant="contained" sx={{ mt: 5 }}>
              {t('welcome.get_started')}
            </Button>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
}
