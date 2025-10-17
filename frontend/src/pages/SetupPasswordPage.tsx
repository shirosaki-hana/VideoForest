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
import { Visibility, VisibilityOff, Lock } from '@mui/icons-material';
import { useAuthStore } from '../stores/authStore';
import { PasswordSchema } from '@videoforest/types';

export default function SetupPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setup, isLoading, error, clearError } = useAuthStore();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    clearError();

    // 비밀번호 확인 검증
    if (password !== confirmPassword) {
      setValidationError(t('auth.setup.passwordMismatch'));
      return;
    }

    // Zod 스키마로 비밀번호 검증
    try {
      PasswordSchema.parse(password);
    } catch (err: any) {
      setValidationError(err.errors?.[0]?.message || t('auth.setup.invalidFormat'));
      return;
    }

    try {
      await setup({ password });
      navigate('/');
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
                  'linear-gradient(135deg, rgba(59,130,246,0.9), rgba(16,185,129,0.9))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Lock sx={{ fontSize: 32, color: 'white' }} />
            </Box>

            <Box sx={{ textAlign: 'center' }}>
              <Typography
                component="h1"
                variant="h4"
                sx={{
                  fontWeight: 800,
                  background:
                    'linear-gradient(135deg, #2563eb 0%, #10b981 60%, #7c3aed 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
                gutterBottom
              >
                {t('common.appName')}
              </Typography>
              <Typography variant="body1" color="text.secondary">
                {t('auth.setup.subtitle')}
              </Typography>
            </Box>

            {(error || validationError) && (
              <Alert severity="error" sx={{ width: '100%' }}>
                {validationError || error}
              </Alert>
            )}

            <Box component="form" onSubmit={handleSubmit} sx={{ width: '100%' }}>
              <TextField
                margin="normal"
                required
                fullWidth
                name="password"
                label={t('auth.setup.password')}
                type={showPassword ? 'text' : 'password'}
                id="password"
                autoComplete="new-password"
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
                helperText={t('auth.setup.passwordHelper')}
              />

              <TextField
                margin="normal"
                required
                fullWidth
                name="confirmPassword"
                label={t('auth.setup.confirmPassword')}
                type={showConfirmPassword ? 'text' : 'password'}
                id="confirmPassword"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label="toggle confirm password visibility"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        edge="end"
                      >
                        {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
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
                {isLoading ? t('auth.setup.submitting') : t('auth.setup.submit')}
              </Button>
            </Box>
          </Stack>
        </Paper>
      </Box>
    </Container>
  );
}
