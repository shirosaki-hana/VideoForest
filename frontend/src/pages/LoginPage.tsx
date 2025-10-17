import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Container,
  TextField,
  Button,
  Typography,
  Paper,
  Alert,
  InputAdornment,
  IconButton,
  Stack,
} from '@mui/material';
import { Visibility, VisibilityOff, Login as LoginIcon } from '@mui/icons-material';
import { useAuthStore } from '../stores/authStore';

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, isLoading, error, clearError } = useAuthStore();

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (!password.trim()) {
      return;
    }

    try {
      await login({ password });
      navigate('/welcome');
    } catch (err) {
      // 에러는 스토어에서 처리
    }
  };

  return (
    <Container component="main" maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          py: 6,
        }}
      >
        <Paper
          elevation={0}
          sx={theme => ({
            px: { xs: 3, sm: 6 },
            py: { xs: 4, sm: 6 },
            width: '100%',
            border: '1px solid',
            borderColor: 'divider',
            bgcolor:
              theme.palette.mode === 'light'
                ? 'rgba(255,255,255,0.7)'
                : 'rgba(2,6,23,0.55)',
          })}
        >
          <Stack spacing={3} alignItems="center">
            <Box
              sx={{
                width: 72,
                height: 72,
                borderRadius: '16px',
                background:
                  'linear-gradient(135deg, rgba(59,130,246,0.9), rgba(124,58,237,0.9))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <LoginIcon sx={{ fontSize: 32, color: 'white' }} />
            </Box>

            <Box sx={{ textAlign: 'center' }}>
              <Typography
                component="h1"
                variant="h4"
                sx={{
                  fontWeight: 800,
                  background:
                    'linear-gradient(135deg, #2563eb 0%, #7c3aed 60%, #10b981 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
                gutterBottom
              >
                {t('common.appName')}
              </Typography>
              <Typography variant="body1" color="text.secondary">
                {t('auth.login.subtitle')}
              </Typography>
            </Box>

            {error && (
              <Alert severity="error" sx={{ width: '100%' }}>
                {error}
              </Alert>
            )}

            <Box component="form" onSubmit={handleSubmit} sx={{ width: '100%' }}>
              <TextField
                margin="normal"
                required
                fullWidth
                name="password"
                label={t('auth.login.password')}
                type={showPassword ? 'text' : 'password'}
                id="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label="toggle password visibility"
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <Button
                type="submit"
                fullWidth
                size="large"
                variant="contained"
                sx={{ mt: 2 }}
                disabled={isLoading}
              >
                {isLoading ? t('auth.login.submitting') : t('auth.login.submit')}
              </Button>
            </Box>
          </Stack>
        </Paper>
      </Box>
    </Container>
  );
}
