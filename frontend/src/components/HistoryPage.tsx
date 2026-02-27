import { useEffect, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Chip,
  CircularProgress,
  Divider,
  InputAdornment,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import LabelIcon from '@mui/icons-material/Label';
import CommentIcon from '@mui/icons-material/Comment';
import ErrorIcon from '@mui/icons-material/Error';
import PersonIcon from '@mui/icons-material/Person';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import SearchIcon from '@mui/icons-material/Search';
import { apiService } from '../services/api';
import { AuditEntry } from '../types';

const actionColors: Record<string, string> = {
  label_update: '#4caf50',
  comment_added: '#1976d2',
  update_failed: '#f44336',
  assignee_update: '#ff9800',
  assignee_failed: '#f44336',
  user_added: '#66bb6a',
  user_removed: '#ef5350',
};

const actionLabels: Record<string, string> = {
  label_update: 'label updated',
  comment_added: 'comment added',
  update_failed: 'update failed',
  assignee_update: 'assignee updated',
  assignee_failed: 'update failed',
  user_added: 'user added',
  user_removed: 'user removed',
};

const formatTimeAgo = (isoString: string) => {
  const d = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return d.toLocaleDateString();
};

function ActionIcon({ action }: { action: string }) {
  const sx = { fontSize: 16 };
  switch (action) {
    case 'label_update':
      return <LabelIcon sx={sx} />;
    case 'comment_added':
      return <CommentIcon sx={sx} />;
    case 'update_failed':
      return <ErrorIcon sx={sx} />;
    case 'assignee_update':
      return <PersonIcon sx={sx} />;
    case 'assignee_failed':
      return <ErrorIcon sx={sx} />;
    case 'user_added':
      return <PersonAddIcon sx={sx} />;
    case 'user_removed':
      return <PersonRemoveIcon sx={sx} />;
    default:
      return <HistoryIcon sx={sx} />;
  }
}

export default function HistoryPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    apiService
      .getHistory(500)
      .then((data) => {
        setEntries(data.entries);
        setTotal(data.total);
      })
      .catch(() => setError('Failed to load activity log'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter.trim()
    ? entries.filter(
        (e) =>
          e.ticket_key.toLowerCase().includes(filter.toLowerCase()) ||
          e.user_name.toLowerCase().includes(filter.toLowerCase()) ||
          e.label.toLowerCase().includes(filter.toLowerCase())
      )
    : entries;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          mb: 3,
          gap: 1,
        }}
      >
        <HistoryIcon sx={{ fontSize: 28 }} />
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Activity Log
        </Typography>
        <Chip
          label={`${total} entries`}
          size="small"
          sx={{ ml: 1, fontSize: '0.75rem', height: 22 }}
        />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper sx={{ mb: 2 }}>
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <TextField
            fullWidth
            size="small"
            placeholder="Search by ticket, user, or label..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                </InputAdornment>
              ),
            }}
            sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.85rem' } }}
          />
        </Box>

        {filtered.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
            {total === 0
              ? 'No activity recorded yet. Updates will appear here once tickets are modified.'
              : 'No entries match your search.'}
          </Box>
        ) : (
          <List sx={{ py: 0 }}>
            {filtered.map((entry, idx) => (
              <Box key={idx}>
                <ListItem sx={{ alignItems: 'flex-start', py: 1.5 }}>
                  <ListItemAvatar>
                    <Avatar
                      sx={{
                        width: 32,
                        height: 32,
                        bgcolor: actionColors[entry.action] || '#666',
                        fontSize: '0.7rem',
                      }}
                    >
                      <ActionIcon action={entry.action} />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                          flexWrap: 'wrap',
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {entry.user_name}
                        </Typography>
                        <Chip
                          label={actionLabels[entry.action] || entry.action}
                          size="small"
                          sx={{
                            fontSize: '0.6rem',
                            height: 18,
                            bgcolor: `${actionColors[entry.action] || '#666'}22`,
                            color: actionColors[entry.action] || '#666',
                          }}
                        />
                        {entry.details?.includes('bulk=true') && (
                          <Chip
                            label="BULK"
                            size="small"
                            sx={{
                              fontSize: '0.55rem',
                              height: 16,
                              fontWeight: 700,
                              bgcolor: '#ff980022',
                              color: '#ff9800',
                              border: '1px solid #ff980044',
                            }}
                          />
                        )}
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: 'monospace',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                          }}
                        >
                          {entry.ticket_key}
                        </Typography>
                      </Box>
                    }
                    secondary={
                      <Box>
                        {entry.label && (
                          <Typography
                            variant="caption"
                            sx={{
                              display: 'block',
                              color: 'text.secondary',
                              fontFamily: 'monospace',
                            }}
                          >
                            {entry.label}
                          </Typography>
                        )}
                        {(entry.comment || entry.details) && (
                          <Typography
                            variant="caption"
                            sx={{ display: 'block', color: 'text.secondary' }}
                          >
                            {entry.comment || entry.details}
                          </Typography>
                        )}
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.disabled', fontSize: '0.65rem' }}
                        >
                          {formatTimeAgo(entry.timestamp)}
                        </Typography>
                      </Box>
                    }
                  />
                </ListItem>
                {idx < filtered.length - 1 && (
                  <Divider variant="inset" component="li" />
                )}
              </Box>
            ))}
          </List>
        )}
      </Paper>
    </Box>
  );
}
