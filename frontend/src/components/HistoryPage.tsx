import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { apiService } from '../services/api';
import { AuditEntry } from '../types';

function ActionChip({ action }: { action: string }) {
  const colorMap: Record<string, 'success' | 'info' | 'error' | 'default'> = {
    label_update: 'success',
    comment_added: 'info',
    update_failed: 'error',
  };
  const labelMap: Record<string, string> = {
    label_update: 'Label Updated',
    comment_added: 'Comment Added',
    update_failed: 'Failed',
  };
  return (
    <Chip
      label={labelMap[action] || action}
      color={colorMap[action] || 'default'}
      size="small"
      variant="outlined"
    />
  );
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
      .catch(() => setError('Failed to load audit history'))
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          History
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {total} total entries
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 3 }}>
        <TextField
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by ticket key, user, or label..."
          size="small"
          fullWidth
        />
      </Paper>

      {filtered.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            {total === 0
              ? 'No audit history yet. Updates will appear here once tickets are modified.'
              : 'No entries match your filter.'}
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Time</TableCell>
                <TableCell>User</TableCell>
                <TableCell>Ticket</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Label</TableCell>
                <TableCell>Details</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((entry, idx) => (
                <TableRow key={idx} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                    {new Date(entry.timestamp).toLocaleString()}
                  </TableCell>
                  <TableCell>{entry.user_name}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {entry.ticket_key}
                  </TableCell>
                  <TableCell>
                    <ActionChip action={entry.action} />
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                    {entry.label || '—'}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem', maxWidth: 300 }}>
                    {entry.comment || entry.details || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
