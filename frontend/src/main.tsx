import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { useThemeStore } from './stores/themeStore';
import './i18n'; // i18n 초기화
import App from './App.tsx';
import { createAppTheme } from './theme/createAppTheme';

// 테마 래퍼 컴포넌트
function ThemedApp() {
  const { effectiveMode } = useThemeStore();
  const theme = createAppTheme(effectiveMode);

  // 테마 변경 시 body 배경색도 업데이트
  useEffect(() => {
    document.body.style.backgroundColor = theme.palette.background.default;
  }, [theme.palette.background.default]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemedApp />
  </StrictMode>
);
