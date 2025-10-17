import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Button, Alert } from '@mui/material';
import { Lock } from '@mui/icons-material';
import { useAuthStore } from '../stores/authStore';
import { PasswordSchema } from '@videoforest/types';
import AuthPageLayout from '../components/common/AuthPageLayout';
import PasswordField from '../components/common/PasswordField';

export default function SetupPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setup, isLoading, error, clearError } = useAuthStore();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
    } catch (err) {
      const zodError = err as { errors?: Array<{ message: string }> };
      setValidationError(zodError.errors?.[0]?.message || t('auth.setup.invalidFormat'));
      return;
    }

    try {
      await setup({ password });
      navigate('/');
    } catch {
      // 에러는 스토어에서 처리
    }
  };

  return (
    <AuthPageLayout icon={<Lock sx={{ fontSize: 32, color: 'white' }} />} title={t('common.appName')} subtitle={t('auth.setup.subtitle')}>
      {(error || validationError) && (
        <Alert severity='error' sx={{ width: '100%' }}>
          {validationError || error}
        </Alert>
      )}

      <Box component='form' onSubmit={handleSubmit} sx={{ width: '100%' }}>
        <PasswordField
          margin='normal'
          required
          fullWidth
          name='password'
          label={t('auth.setup.password')}
          id='password'
          autoComplete='new-password'
          value={password}
          onChange={e => setPassword(e.target.value)}
          helperText={t('auth.setup.passwordHelper')}
        />

        <PasswordField
          margin='normal'
          required
          fullWidth
          name='confirmPassword'
          label={t('auth.setup.confirmPassword')}
          id='confirmPassword'
          autoComplete='new-password'
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
        />

        <Button type='submit' fullWidth size='large' variant='contained' sx={{ mt: 2 }} disabled={isLoading}>
          {isLoading ? t('auth.setup.submitting') : t('auth.setup.submit')}
        </Button>
      </Box>
    </AuthPageLayout>
  );
}
