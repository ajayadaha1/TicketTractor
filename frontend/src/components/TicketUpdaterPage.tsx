import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
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
import AddIcon from '@mui/icons-material/Add';
import SendIcon from '@mui/icons-material/Send';
import { apiService } from '../services/api';
import { TicketEntry, DropdownConfig, LabelCheckResult, BulkUpdateResponse } from '../types';
import TicketRow from './TicketRow';
import LabelConflictDialog from './LabelConflictDialog';
import SubmitResultsDialog from './SubmitResultsDialog';

let nextId = 0;
const createEmptyTicket = (): TicketEntry => ({
  id: String(++nextId),
  ticket_key: '',
  stage: '',
  flow: '',
  result: '',
  failing_cmd: '',
  comment: '',
  label_action: 'replace',
});

export default function TicketUpdaterPage() {
  const [tickets, setTickets] = useState<TicketEntry[]>([]);
  const [bulkInput, setBulkInput] = useState('');
  const [config, setConfig] = useState<DropdownConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Conflict dialog state
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [conflicts, setConflicts] = useState<LabelCheckResult[]>([]);

  // Results dialog state
  const [resultsDialogOpen, setResultsDialogOpen] = useState(false);
  const [updateResults, setUpdateResults] = useState<BulkUpdateResponse | null>(null);

  // Load dropdown config on mount
  useEffect(() => {
    setLoading(true);
    apiService
      .getDropdownConfig()
      .then(setConfig)
      .catch(() => setError('Failed to load dropdown configuration'))
      .finally(() => setLoading(false));
  }, []);

  const handleAddBulkTickets = () => {
    if (!bulkInput.trim()) return;
    const keys = bulkInput
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
    const newTickets = keys.map((key) => ({
      ...createEmptyTicket(),
      ticket_key: key,
    }));
    setTickets((prev) => [...prev, ...newTickets]);
    setBulkInput('');
  };

  const handleAddSingleTicket = () => {
    setTickets((prev) => [...prev, createEmptyTicket()]);
  };

  const handleTicketChange = useCallback(
    (id: string, field: keyof TicketEntry, value: string) => {
      setTickets((prev) =>
        prev.map((t) => (t.id === id ? { ...t, [field]: value } : t))
      );
    },
    []
  );

  const handleRemoveTicket = useCallback((id: string) => {
    setTickets((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleSubmit = async () => {
    setError(null);

    // Validate: all tickets must have ticket_key, stage, flow, result
    const incomplete = tickets.filter(
      (t) => !t.ticket_key || !t.stage || !t.flow || !t.result
    );
    if (incomplete.length > 0) {
      setError('All tickets must have Ticket Key, Stage, Flow, and Result filled in.');
      return;
    }

    setSubmitting(true);
    try {
      // Check for existing labels
      const ticketKeys = tickets.map((t) => t.ticket_key);
      const checkResponse = await apiService.checkLabels(ticketKeys);
      const ticketsWithConflicts = checkResponse.results.filter((r) => r.has_conflict);

      if (ticketsWithConflicts.length > 0) {
        // Show conflict dialog
        setConflicts(ticketsWithConflicts);
        setConflictDialogOpen(true);
        setSubmitting(false);
        return;
      }

      // No conflicts - submit directly
      await doSubmit();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to check labels';
      setError(msg);
      setSubmitting(false);
    }
  };

  const doSubmit = async () => {
    setSubmitting(true);
    try {
      const response = await apiService.bulkUpdateTickets(tickets);
      setUpdateResults(response);
      setResultsDialogOpen(true);

      // Clear successfully updated tickets
      const successKeys = new Set(
        response.results.filter((r) => r.success).map((r) => r.ticket_key)
      );
      setTickets((prev) => prev.filter((t) => !successKeys.has(t.ticket_key)));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to update tickets';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConflictResolve = (ticketKey: string, action: 'replace' | 'add') => {
    setTickets((prev) =>
      prev.map((t) =>
        t.ticket_key === ticketKey ? { ...t, label_action: action } : t
      )
    );
  };

  const handleConflictResolveAll = (action: 'replace' | 'add') => {
    const conflictKeys = new Set(conflicts.map((c) => c.ticket_key));
    setTickets((prev) =>
      prev.map((t) =>
        conflictKeys.has(t.ticket_key) ? { ...t, label_action: action } : t
      )
    );
  };

  const handleConflictConfirm = () => {
    setConflictDialogOpen(false);
    doSubmit();
  };

  if (loading || !config) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3, fontWeight: 600 }}>
        Ticket Updater
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Bulk add section */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Add Tickets
        </Typography>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <TextField
            value={bulkInput}
            onChange={(e) => setBulkInput(e.target.value)}
            placeholder="Enter ticket numbers separated by commas (e.g. PROJ-123, PROJ-456)"
            size="small"
            fullWidth
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddBulkTickets();
            }}
          />
          <Button
            variant="contained"
            onClick={handleAddBulkTickets}
            disabled={!bulkInput.trim()}
          >
            Add Tickets
          </Button>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={handleAddSingleTicket}
            sx={{ whiteSpace: 'nowrap' }}
          >
            Add Ticket
          </Button>
        </Box>
      </Paper>

      {/* Ticket table */}
      {tickets.length > 0 && (
        <>
          <TableContainer component={Paper} sx={{ mb: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ minWidth: 140 }}>Ticket Key</TableCell>
                  <TableCell sx={{ minWidth: 160 }}>Stage</TableCell>
                  <TableCell sx={{ minWidth: 160 }}>Flow</TableCell>
                  <TableCell sx={{ minWidth: 160 }}>Result</TableCell>
                  <TableCell sx={{ minWidth: 180 }}>Failing CMD</TableCell>
                  <TableCell sx={{ minWidth: 200 }}>Comments</TableCell>
                  <TableCell align="center" sx={{ width: 60 }}></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tickets.map((ticket) => (
                  <TicketRow
                    key={ticket.id}
                    ticket={ticket}
                    stages={config.stages}
                    flows={config.flows}
                    results={config.results}
                    onChange={handleTicketChange}
                    onRemove={handleRemoveTicket}
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              color="primary"
              size="large"
              startIcon={submitting ? <CircularProgress size={20} /> : <SendIcon />}
              onClick={handleSubmit}
              disabled={submitting || tickets.length === 0}
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </Button>
          </Box>
        </>
      )}

      {tickets.length === 0 && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            No tickets added yet. Use the input above to add tickets.
          </Typography>
        </Paper>
      )}

      {/* Dialogs */}
      <LabelConflictDialog
        open={conflictDialogOpen}
        conflicts={conflicts}
        tickets={tickets}
        onResolve={handleConflictResolve}
        onResolveAll={handleConflictResolveAll}
        onConfirm={handleConflictConfirm}
        onCancel={() => {
          setConflictDialogOpen(false);
          setSubmitting(false);
        }}
      />

      <SubmitResultsDialog
        open={resultsDialogOpen}
        results={updateResults}
        onClose={() => setResultsDialogOpen(false)}
      />
    </Box>
  );
}
