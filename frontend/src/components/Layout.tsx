import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Tab,
  Tabs,
  Toolbar,
  Typography,
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuthStore } from '../services/auth';
import { apiService } from '../services/api';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, clearAuth } = useAuthStore();

  // Determine active tab from current path
  const currentTab = location.pathname === '/analytics' ? 1 : 0;

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    if (newValue === 0) navigate('/');
    if (newValue === 1) navigate('/analytics');
  };

  const handleLogout = async () => {
    await apiService.logout();
    clearAuth();
    navigate('/login', { replace: true });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar>
          <Typography variant="h6" sx={{ fontWeight: 700, mr: 4 }}>
            TicketTractor
          </Typography>

          <Tabs
            value={currentTab}
            onChange={handleTabChange}
            sx={{ flexGrow: 1 }}
          >
            <Tab label="Ticket Updater" />
            <Tab label="Analytics" />
          </Tabs>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {user && (
              <>
                <Avatar
                  src={user.avatar_url}
                  alt={user.display_name}
                  sx={{ width: 32, height: 32 }}
                />
                <Typography variant="body2" color="text.secondary">
                  {user.display_name}
                </Typography>
              </>
            )}
            <Button
              size="small"
              color="inherit"
              startIcon={<LogoutIcon />}
              onClick={handleLogout}
            >
              Logout
            </Button>
          </Box>
        </Toolbar>
      </AppBar>

      <Box sx={{ flexGrow: 1, p: 3 }}>
        <Outlet />
      </Box>
    </Box>
  );
}
