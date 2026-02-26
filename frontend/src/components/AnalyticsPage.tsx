import { Box, Paper, Typography } from '@mui/material';
import BarChartIcon from '@mui/icons-material/BarChart';

export default function AnalyticsPage() {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh',
      }}
    >
      <Paper sx={{ p: 5, textAlign: 'center', maxWidth: 500 }}>
        <BarChartIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h5" gutterBottom>
          Analytics
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Analytics dashboard coming soon. This will provide insights into ticket
          update patterns, label distribution, and team activity.
        </Typography>
      </Paper>
    </Box>
  );
}
