import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Paper,
  Button,
  Stack,
} from '@mui/material';
import { Celebration, Logout as LogoutIcon } from '@mui/icons-material';
import { useAuthStore } from '../stores/authStore';

export default function WelcomePage() {
  const navigate = useNavigate();
  const { logout, isLoading } = useAuthStore();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (err) {
      // 에러는 스토어에서 처리
    }
  };

  return (
    <Container component="main" maxWidth="md">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Paper
          elevation={3}
          sx={{
            p: 6,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
          }}
        >
          <Box
            sx={{
              width: 96,
              height: 96,
              borderRadius: '50%',
              bgcolor: 'success.light',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mb: 3,
            }}
          >
            <Celebration sx={{ fontSize: 48, color: 'success.dark' }} />
          </Box>

          <Typography component="h1" variant="h3" gutterBottom>
            환영합니다!
          </Typography>
          
          <Typography variant="h6" color="text.secondary" sx={{ mb: 4, textAlign: 'center' }}>
            VideoForest에 성공적으로 로그인했습니다
          </Typography>

          <Stack spacing={2} direction="column" sx={{ width: '100%', maxWidth: 400 }}>
            <Paper
              elevation={0}
              sx={{
                p: 3,
                bgcolor: 'primary.50',
                border: '1px solid',
                borderColor: 'primary.200',
              }}
            >
              <Typography variant="body1" color="text.primary">
                🎬 NAS에서 실행되는 개인 미디어 서버
              </Typography>
            </Paper>

            <Paper
              elevation={0}
              sx={{
                p: 3,
                bgcolor: 'secondary.50',
                border: '1px solid',
                borderColor: 'secondary.200',
              }}
            >
              <Typography variant="body1" color="text.primary">
                🔒 안전하게 보호된 콘텐츠
              </Typography>
            </Paper>

            <Paper
              elevation={0}
              sx={{
                p: 3,
                bgcolor: 'success.50',
                border: '1px solid',
                borderColor: 'success.200',
              }}
            >
              <Typography variant="body1" color="text.primary">
                ✨ 언제 어디서나 접근 가능
              </Typography>
            </Paper>

            <Button
              variant="outlined"
              color="error"
              startIcon={<LogoutIcon />}
              onClick={handleLogout}
              disabled={isLoading}
              sx={{ mt: 2 }}
            >
              로그아웃
            </Button>
          </Stack>
        </Paper>
      </Box>
    </Container>
  );
}

