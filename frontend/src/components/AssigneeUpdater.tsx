import { useCallback, useEffect, useState, useRef, ChangeEvent, KeyboardEvent } from 'react';
import {
  Alert,
  Autocomplete,
  AutocompleteRenderInputParams,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  createFilterOptions,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemAvatar,
  ListItemSecondaryAction,
  ListItemText,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SendIcon from '@mui/icons-material/Send';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import HistoryIcon from '@mui/icons-material/History';
import PersonIcon from '@mui/icons-material/Person';
import CommentIcon from '@mui/icons-material/Comment';
import SearchIcon from '@mui/icons-material/Search';
import { apiService } from '../services/api';
import { AssigneeUser, AssigneeTicketEntry, AssigneeUpdateResult, BulkAssigneeUpdateResponse, CurrentAssigneeInfo, AuditEntry, JiraSearchUser } from '../types';

let nextAssigneeId = 0;
const createEmptyAssigneeTicket = (): AssigneeTicketEntry => ({
  id: String(++nextAssigneeId),
  ticket_key: '',
  assignee_username: '',
  assignee_account_id: '',
  comment: '',
});

/* Debounce helper */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useDebouncedCallback<T extends (...args: any[]) => void>(fn: T, delay: number) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  return useCallback((...args: Parameters<T>) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn, delay]);
}

/* Helper to get initials from display name */
const getInitials = (name: string) => {
  const parts = name.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

/* Deterministic avatar colour from name */
const avatarColors = ['#1976d2', '#388e3c', '#f57c00', '#7b1fa2', '#c62828', '#00838f', '#4e342e', '#546e7a'];
const nameToColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
};

/* Show all users on open; filter by display name, username, or email */
const userFilterOptions = createFilterOptions<AssigneeUser>({
  stringify: (option) => `${option.display_name} ${option.username} ${option.email}`,
});

const ASSIGNEE_ACTIONS = ['assignee_update', 'assignee_failed'];
const HISTORY_PAGE_SIZE = 10;

const assigneeActionColors: Record<string, string> = {
  assignee_update: '#ff9800',
  assignee_failed: '#f44336',
  comment_added: '#1976d2',
};

const assigneeActionLabels: Record<string, string> = {
  assignee_update: 'assignee updated',
  assignee_failed: 'update failed',
  comment_added: 'comment added',
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

function AssigneeActionIcon({ action }: { action: string }) {
  const sx = { fontSize: 16 };
  switch (action) {
    case 'assignee_update':
      return <PersonIcon sx={sx} />;
    case 'comment_added':
      return <CommentIcon sx={sx} />;
    case 'assignee_failed':
      return <ErrorIcon sx={sx} />;
    default:
      return <HistoryIcon sx={sx} />;
  }
}

export default function AssigneeUpdater() {
  const [tickets, setTickets] = useState<AssigneeTicketEntry[]>([]);
  const [bulkInput, setBulkInput] = useState('');
  const [users, setUsers] = useState<AssigneeUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Global assignee for "apply to all"
  const [globalAssignee, setGlobalAssignee] = useState<string>('');

  // Jira search state (used only in Manage Users dialog)
  const [jiraSearchResults, setJiraSearchResults] = useState<JiraSearchUser[]>([]);
  const [jiraSearchLoading, setJiraSearchLoading] = useState(false);

  // Manage users dialog
  const [manageOpen, setManageOpen] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [addingUser, setAddingUser] = useState(false);

  // Results dialog state
  const [resultsDialogOpen, setResultsDialogOpen] = useState(false);
  const [updateResults, setUpdateResults] = useState<BulkAssigneeUpdateResponse | null>(null);

  // Current assignee lookup
  const [currentAssignees, setCurrentAssignees] = useState<Record<string, CurrentAssigneeInfo>>({});
  const [fetchingAssignees, setFetchingAssignees] = useState(false);

  // Recent history state
  const [recentHistory, setRecentHistory] = useState<AuditEntry[]>([]);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyTotal, setHistoryTotal] = useState(0);

  const loadUsers = useCallback(() => {
    setLoading(true);
    apiService
      .getAssigneeUsers()
      .then(setUsers)
      .catch(() => setError('Failed to load assignee users'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // ── Load assignee history ────────────────────────────────────────────────

  const loadAssigneeHistory = useCallback((page: number) => {
    apiService
      .getHistory(HISTORY_PAGE_SIZE, page * HISTORY_PAGE_SIZE, ASSIGNEE_ACTIONS)
      .then((data: { entries: AuditEntry[]; total: number }) => {
        setRecentHistory(data.entries);
        setHistoryTotal(data.total);
        setHistoryPage(page);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadAssigneeHistory(0);
  }, [loadAssigneeHistory]);

  // ── Fetch current assignees for ticket keys ──────────────────────────────

  const fetchCurrentAssignees = useCallback(async (ticketKeys: string[]) => {
    const keysToFetch = ticketKeys.filter((k: string) => k && !currentAssignees[k]);
    if (keysToFetch.length === 0) return;
    setFetchingAssignees(true);
    try {
      const data = await apiService.getCurrentAssignees(keysToFetch);
      const newMap: Record<string, CurrentAssigneeInfo> = {};
      data.results.forEach((item: CurrentAssigneeInfo) => {
        newMap[item.ticket_key] = item;
      });
      setCurrentAssignees((prev: Record<string, CurrentAssigneeInfo>) => ({ ...prev, ...newMap }));
    } catch {
      // silent — the column will just stay empty
    } finally {
      setFetchingAssignees(false);
    }
  }, [currentAssignees]);

  // ── Assignee selection helper ──────────────────────────────────────────────

  // ── Jira search for Manage Users dialog ──────────────────────────────────

  const searchJiraForManageUsers = useCallback(async (query: string) => {
    if (query.length < 2) {
      setJiraSearchResults([]);
      return;
    }
    setJiraSearchLoading(true);
    try {
      const results = await apiService.searchJiraUsers(query);
      setJiraSearchResults(results);
    } catch {
      setJiraSearchResults([]);
    } finally {
      setJiraSearchLoading(false);
    }
  }, []);

  const debouncedJiraSearch = useDebouncedCallback(searchJiraForManageUsers, 350);

  // ── Ticket management ─────────────────────────────────────────────────────

  const handleAddBulkTickets = () => {
    if (!bulkInput.trim()) return;
    const keys = bulkInput
      .split(',')
      .map((k: string) => k.trim())
      .filter((k: string) => k.length > 0);
    const newTickets = keys.map((key: string) => ({
      ...createEmptyAssigneeTicket(),
      ticket_key: key,
    }));
    setTickets((prev: AssigneeTicketEntry[]) => [...prev, ...newTickets]);
    setBulkInput('');
    // Fetch current assignees for the new ticket keys
    fetchCurrentAssignees(keys);
  };

  const handleAddSingleTicket = () => {
    setTickets((prev: AssigneeTicketEntry[]) => [...prev, createEmptyAssigneeTicket()]);
  };

  const handleTicketChange = useCallback(
    (id: string, field: keyof AssigneeTicketEntry, value: string) => {
      setTickets((prev: AssigneeTicketEntry[]) =>
        prev.map((t: AssigneeTicketEntry) => (t.id === id ? { ...t, [field]: value } : t))
      );
    },
    []
  );

  const handleRemoveTicket = useCallback((id: string) => {
    setTickets((prev: AssigneeTicketEntry[]) => prev.filter((t: AssigneeTicketEntry) => t.id !== id));
  }, []);

  const handleApplyGlobalAssignee = () => {
    if (!globalAssignee) return;
    setTickets((prev: AssigneeTicketEntry[]) =>
      prev.map((t: AssigneeTicketEntry) => ({ ...t, assignee_username: globalAssignee }))
    );
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setError(null);
    const incomplete = tickets.filter(
      (t: AssigneeTicketEntry) => !t.ticket_key || !t.assignee_username
    );
    if (incomplete.length > 0) {
      setError('All tickets must have a Ticket Key and an Assignee selected.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await apiService.bulkUpdateAssignees(tickets);
      setUpdateResults(response);
      setResultsDialogOpen(true);

      // Clear successfully updated tickets
      const successKeys = new Set(
        response.results.filter((r) => r.success).map((r) => r.ticket_key)
      );
      setTickets((prev: AssigneeTicketEntry[]) => prev.filter((t: AssigneeTicketEntry) => !successKeys.has(t.ticket_key)));
      loadAssigneeHistory(0);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to update assignees';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ── User management ────────────────────────────────────────────────────────

  const handleAddUser = async () => {
    if (!newDisplayName.trim() || !newUsername.trim() || !newEmail.trim()) return;
    setAddingUser(true);
    try {
      await apiService.addAssigneeUser(newDisplayName.trim(), newUsername.trim(), newEmail.trim());
      setNewDisplayName('');
      setNewUsername('');
      setNewEmail('');
      loadUsers();
    } catch (e: unknown) {
      const detail =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to add user';
      setError(detail);
    } finally {
      setAddingUser(false);
    }
  };

  const handleRemoveUser = async (userId: number) => {
    try {
      await apiService.removeAssigneeUser(userId);
      loadUsers();
    } catch {
      setError('Failed to remove user');
    }
  };

  if (loading && users.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Manage Users button */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={<ManageAccountsIcon />}
          onClick={() => setManageOpen(true)}
        >
          Manage Users ({users.length})
        </Button>
      </Box>

      {/* Bulk add section */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Add Tickets
        </Typography>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <TextField
            value={bulkInput}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setBulkInput(e.target.value)}
            placeholder="Enter ticket numbers separated by commas (e.g. PROJ-123, PROJ-456)"
            size="small"
            fullWidth
            onKeyDown={(e: KeyboardEvent) => {
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

      {/* Global assignee selector */}
      {tickets.length > 0 && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Apply Assignee to All Tickets
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
            <Autocomplete<AssigneeUser>
              options={users}
              getOptionLabel={(u: AssigneeUser) => `${u.display_name} (${u.username})`}
              filterOptions={userFilterOptions}
              value={users.find((u: AssigneeUser) => u.username === globalAssignee) || null}
              onChange={(_: unknown, v: AssigneeUser | null) => setGlobalAssignee(v?.username || '')}
              size="small"
              sx={{ minWidth: 300 }}
              renderOption={(props, option) => (
                <li {...props} key={option.id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.3 }}>
                    <Avatar sx={{ width: 30, height: 30, fontSize: '0.75rem', bgcolor: nameToColor(option.display_name) }}>
                      {getInitials(option.display_name)}
                    </Avatar>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                        {option.display_name}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.2 }}>
                        {option.email}
                      </Typography>
                    </Box>
                  </Box>
                </li>
              )}
              renderInput={(params: AutocompleteRenderInputParams) => (
                <TextField {...params} placeholder="Select assignee..." />
              )}
            />
            <Button
              variant="outlined"
              onClick={handleApplyGlobalAssignee}
              disabled={!globalAssignee}
            >
              Apply to All
            </Button>
          </Box>
        </Paper>
      )}

      {/* Ticket table */}
      {tickets.length > 0 && (
        <>
          <TableContainer component={Paper} sx={{ mb: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ minWidth: 160 }}>Ticket Key</TableCell>
                  <TableCell sx={{ minWidth: 160 }}>Current Assignee</TableCell>
                  <TableCell sx={{ minWidth: 260 }}>New Assignee</TableCell>
                  <TableCell sx={{ minWidth: 200 }}>Comment (optional)</TableCell>
                  <TableCell align="center" sx={{ width: 60 }}></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tickets.map((ticket: AssigneeTicketEntry) => (
                  <TableRow key={ticket.id}>
                    <TableCell>
                      <TextField
                        value={ticket.ticket_key}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          handleTicketChange(ticket.id, 'ticket_key', e.target.value)
                        }
                        placeholder="PROJ-123"
                        size="small"
                        fullWidth
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const info = currentAssignees[ticket.ticket_key];
                        if (!ticket.ticket_key) return <Typography variant="body2" color="text.disabled">—</Typography>;
                        if (fetchingAssignees && !info) return <CircularProgress size={16} />;
                        if (info?.error) return <Typography variant="body2" color="error.main" sx={{ fontSize: '0.8rem' }}>Error</Typography>;
                        if (info) return (
                          <Chip
                            label={info.display_name}
                            size="small"
                            variant="outlined"
                            color={info.display_name === 'Unassigned' ? 'default' : 'info'}
                            sx={{ fontSize: '0.75rem' }}
                          />
                        );
                        return <Typography variant="body2" color="text.disabled" sx={{ fontSize: '0.8rem' }}>—</Typography>;
                      })()}
                    </TableCell>
                    <TableCell>
                      <Autocomplete<AssigneeUser>
                        options={users}
                        getOptionLabel={(u: AssigneeUser) => `${u.display_name} (${u.username})`}
                        filterOptions={userFilterOptions}
                        value={
                          users.find((u: AssigneeUser) => u.username === ticket.assignee_username) ||
                          null
                        }
                        onChange={(_: unknown, v: AssigneeUser | null) =>
                          handleTicketChange(
                            ticket.id,
                            'assignee_username',
                            v?.username || ''
                          )
                        }
                        size="small"
                        renderOption={(props, option) => (
                          <li {...props} key={option.id}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.3 }}>
                              <Avatar sx={{ width: 28, height: 28, fontSize: '0.7rem', bgcolor: nameToColor(option.display_name) }}>
                                {getInitials(option.display_name)}
                              </Avatar>
                              <Box>
                                <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3, fontSize: '0.85rem' }}>
                                  {option.display_name}
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.2, fontSize: '0.7rem' }}>
                                  {option.email}
                                </Typography>
                              </Box>
                            </Box>
                          </li>
                        )}
                        renderInput={(params: AutocompleteRenderInputParams) => (
                          <TextField {...params} placeholder="Select assignee..." />
                        )}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        value={ticket.comment}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          handleTicketChange(ticket.id, 'comment', e.target.value)
                        }
                        placeholder="Comment..."
                        size="small"
                        fullWidth
                        multiline
                        minRows={1}
                        maxRows={3}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Remove ticket">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleRemoveTicket(ticket.id)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              color="primary"
              size="large"
              startIcon={
                submitting ? <CircularProgress size={20} /> : <SendIcon />
              }
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
            No tickets added yet. Use the input above to add tickets for assignee
            updates.
          </Typography>
        </Paper>
      )}

      {/* ── Manage Users Dialog ──────────────────────────────────────────────── */}
      <Dialog
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ManageAccountsIcon />
            Manage Assignee Users
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {/* Search Jira to auto-fill */}
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
            Search Jira directory to auto-fill user details:
          </Typography>
          <Autocomplete<JiraSearchUser>
            options={jiraSearchResults}
            getOptionLabel={(u: JiraSearchUser) => u.display_name}
            filterOptions={(x: JiraSearchUser[]) => x}
            loading={jiraSearchLoading}
            onInputChange={(_: unknown, val: string, reason: string) => {
              if (reason === 'input') debouncedJiraSearch(val);
            }}
            onChange={(_: unknown, v: JiraSearchUser | null) => {
              if (v) {
                setNewDisplayName(v.display_name);
                if (v.email_address) {
                  setNewEmail(v.email_address);
                  // Derive netid from email (before @)
                  const localPart = v.email_address.split('@')[0] || '';
                  setNewUsername(localPart.replace('.', ''));
                } else {
                  // Jira may hide email — derive a best-guess from display name
                  const nameParts = v.display_name.trim().toLowerCase().split(/\s+/);
                  const guessedEmail = nameParts.length >= 2
                    ? `${nameParts[0]}.${nameParts[nameParts.length - 1]}@amd.com`
                    : '';
                  const guessedUsername = nameParts.length >= 2
                    ? `${nameParts[0]}${nameParts[nameParts.length - 1]}`.slice(0, 8)
                    : '';
                  setNewEmail(guessedEmail);
                  setNewUsername(guessedUsername);
                }
              }
            }}
            size="small"
            sx={{ mb: 2 }}
            renderOption={(props, option) => (
              <li {...props} key={option.account_id}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.3 }}>
                  {option.avatar_url ? (
                    <Avatar src={option.avatar_url} sx={{ width: 28, height: 28 }} />
                  ) : (
                    <Avatar sx={{ width: 28, height: 28, fontSize: '0.7rem', bgcolor: nameToColor(option.display_name) }}>
                      {getInitials(option.display_name)}
                    </Avatar>
                  )}
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                      {option.display_name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.2 }}>
                      {option.email_address}
                    </Typography>
                  </Box>
                </Box>
              </li>
            )}
            renderInput={(params: AutocompleteRenderInputParams) => (
              <TextField
                {...params}
                placeholder="Search Jira by name or email..."
                InputProps={{
                  ...params.InputProps,
                  startAdornment: <SearchIcon sx={{ color: 'text.secondary', mr: 0.5, fontSize: 20 }} />,
                  endAdornment: (
                    <>
                      {jiraSearchLoading ? <CircularProgress size={16} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
            noOptionsText="Type at least 2 characters to search Jira"
          />

          <Divider sx={{ mb: 2 }} />

          {/* Add user form — fields auto-filled from Jira search above */}
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
            Verify / edit and add:
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
            <TextField
              label="Display Name"
              value={newDisplayName}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewDisplayName(e.target.value)}
              size="small"
              sx={{ flex: 1, minWidth: 140 }}
            />
            <TextField
              label="Username (netid)"
              value={newUsername}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewUsername(e.target.value)}
              size="small"
              sx={{ flex: 1, minWidth: 120 }}
            />
            <TextField
              label="Email (firstname.lastname@amd.com)"
              value={newEmail}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewEmail(e.target.value)}
              size="small"
              sx={{ flex: 1.5, minWidth: 220 }}
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === 'Enter') handleAddUser();
              }}
            />
            <Button
              variant="contained"
              startIcon={
                addingUser ? <CircularProgress size={16} /> : <PersonAddIcon />
              }
              onClick={handleAddUser}
              disabled={!newDisplayName.trim() || !newUsername.trim() || !newEmail.trim() || addingUser}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Add
            </Button>
          </Box>

          <Divider sx={{ mb: 1 }} />

          {/* User list */}
          {users.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              No users configured.
            </Typography>
          ) : (
            <List dense>
              {users.map((u: AssigneeUser) => (
                <ListItem key={u.id}>
                  <ListItemText
                    primary={u.display_name}
                    secondary={`${u.username} — ${u.email}`}
                  />
                  <ListItemSecondaryAction>
                    <Tooltip title="Remove user">
                      <IconButton
                        edge="end"
                        size="small"
                        color="error"
                        onClick={() => handleRemoveUser(u.id)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setManageOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ── Results Dialog ───────────────────────────────────────────────────── */}
      <Dialog
        open={resultsDialogOpen}
        onClose={() => setResultsDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Assignee Update Results</DialogTitle>
        <DialogContent dividers>
          {updateResults && (
            <>
              <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <Chip
                  label={`${updateResults.successful} Successful`}
                  color="success"
                  variant="outlined"
                />
                {updateResults.failed > 0 && (
                  <Chip
                    label={`${updateResults.failed} Failed`}
                    color="error"
                    variant="outlined"
                  />
                )}
              </Box>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Ticket</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Assignee</TableCell>
                    <TableCell>Details</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {updateResults.results.map((r: AssigneeUpdateResult, idx: number) => (
                    <TableRow key={idx}>
                      <TableCell sx={{ fontFamily: 'monospace' }}>
                        {r.ticket_key}
                      </TableCell>
                      <TableCell>
                        {r.success ? (
                          <CheckCircleIcon
                            color="success"
                            sx={{ fontSize: 18 }}
                          />
                        ) : (
                          <ErrorIcon color="error" sx={{ fontSize: 18 }} />
                        )}
                      </TableCell>
                      <TableCell>{r.assignee_set || '—'}</TableCell>
                      <TableCell sx={{ fontSize: '0.75rem' }}>
                        {r.error || (r.comment_added ? 'Comment added' : '')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResultsDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ── Recent Assignee Activity ─────────────────────────────────────────── */}
      <Divider sx={{ my: 4 }} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <HistoryIcon sx={{ fontSize: 22 }} />
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Recent Activity
        </Typography>
        {historyTotal > 0 && (
          <Chip
            label={`${historyTotal} total`}
            size="small"
            sx={{ fontSize: '0.7rem', height: 20 }}
          />
        )}
      </Box>
      {recentHistory.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">No recent assignee activity yet.</Typography>
        </Paper>
      ) : (
        <>
          <Paper sx={{ mb: 2 }}>
            <List sx={{ py: 0 }}>
              {recentHistory.map((entry: AuditEntry, idx: number) => (
                <Box key={idx}>
                  <ListItem sx={{ alignItems: 'flex-start', py: 1.5 }}>
                    <ListItemAvatar>
                      <Avatar
                        sx={{
                          width: 32,
                          height: 32,
                          bgcolor: assigneeActionColors[entry.action] || '#666',
                          fontSize: '0.7rem',
                        }}
                      >
                        <AssigneeActionIcon action={entry.action} />
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {entry.user_name}
                          </Typography>
                          <Chip
                            label={assigneeActionLabels[entry.action] || entry.action}
                            size="small"
                            sx={{
                              fontSize: '0.6rem',
                              height: 18,
                              bgcolor: `${assigneeActionColors[entry.action] || '#666'}22`,
                              color: assigneeActionColors[entry.action] || '#666',
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
                            sx={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 600 }}
                          >
                            {entry.ticket_key}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <Box>
                          {entry.details && (
                            <Typography
                              variant="caption"
                              sx={{ display: 'block', color: 'text.secondary' }}
                            >
                              {entry.details}
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
                  {idx < recentHistory.length - 1 && (
                    <Divider variant="inset" component="li" />
                  )}
                </Box>
              ))}
            </List>
          </Paper>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Showing {historyPage * HISTORY_PAGE_SIZE + 1}–
              {Math.min((historyPage + 1) * HISTORY_PAGE_SIZE, historyTotal)} of {historyTotal}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                disabled={historyPage === 0}
                onClick={() => loadAssigneeHistory(historyPage - 1)}
              >
                Previous
              </Button>
              <Button
                size="small"
                disabled={(historyPage + 1) * HISTORY_PAGE_SIZE >= historyTotal}
                onClick={() => loadAssigneeHistory(historyPage + 1)}
              >
                Next
              </Button>
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
}
