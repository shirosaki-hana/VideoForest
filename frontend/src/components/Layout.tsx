import { Box, useMediaQuery, useTheme } from '@mui/material';
import { Outlet } from 'react-router-dom';
import AppBar from './AppBar';
import Sidebar from './Sidebar';
import { useSidebarStore } from '../stores/sidebarStore';

interface LayoutProps {
  showAppBar?: boolean;
  hideSidebar?: boolean;
}

const DRAWER_WIDTH = 280;
const MINI_DRAWER_WIDTH = 72;

export default function Layout({ showAppBar = false, hideSidebar = false }: LayoutProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { isMini } = useSidebarStore();

  // 데스크탑에서 사이드바가 있을 때 컨텐츠의 왼쪽 마진 계산
  const drawerWidth = isMini ? MINI_DRAWER_WIDTH : DRAWER_WIDTH;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* 사이드바 */}
      {!hideSidebar && <Sidebar />}

      {/* 메인 컨텐츠 */}
      <Box
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          width: hideSidebar || isMobile ? '100%' : `calc(100% - ${drawerWidth}px)`,
          transition: theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
        }}
      >
        {showAppBar && <AppBar />}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
