import { Box } from '@mui/material';
import { Outlet } from 'react-router-dom';
import AppBar from './AppBar';
import SettingsDialog from './SettingsDialog';

interface LayoutProps {
  showAppBar?: boolean;
}

export default function Layout({ showAppBar = false }: LayoutProps) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {showAppBar && <AppBar />}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </Box>
      <SettingsDialog />
    </Box>
  );
}
