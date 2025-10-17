import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Button, Alert } from '@mui/material';
import { Login as LoginIcon } from '@mui/icons-material';
import { useAuthStore } from '../stores/authStore';
import AuthPageLayout from '../components/common/AuthPageLayout';
import PasswordField from '../components/common/PasswordField';

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, isLoading, error, clearError } = useAuthStore();
  const [password, setPassword] = useState('');

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
    <AuthPageLayout
      icon={<LoginIcon sx={{ fontSize: 32, color: 'white' }} />}
      title={t('common.appName')}
      subtitle={t('auth.login.subtitle')}
    >
      {error && (
        <Alert severity='error' sx={{ width: '100%' }}>
          {error}
        </Alert>
      )}

      <Box component='form' onSubmit={handleSubmit} sx={{ width: '100%' }}>
        <PasswordField
          margin='normal'
          required
          fullWidth
          name='password'
          label={t('auth.login.password')}
          id='password'
          autoComplete='current-password'
          value={password}
          onChange={e => setPassword(e.target.value)}
        />

        <Button type='submit' fullWidth size='large' variant='contained' sx={{ mt: 2 }} disabled={isLoading}>
          {isLoading ? t('auth.login.submitting') : t('auth.login.submit')}
        </Button>
      </Box>
    </AuthPageLayout>
  );
}
