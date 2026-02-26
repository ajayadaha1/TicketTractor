import {
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { LabelCheckResult, TicketEntry } from '../types';

interface LabelConflictDialogProps {
  open: boolean;
  conflicts: LabelCheckResult[];
  tickets: TicketEntry[];
  onResolve: (ticketKey: string, action: 'replace' | 'add') => void;
  onResolveAll: (action: 'replace' | 'add') => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function LabelConflictDialog({
  open,
  conflicts,
  tickets,
  onResolve,
  onResolveAll,
  onConfirm,
  onCancel,
}: LabelConflictDialogProps) {
  // Build new label preview for each conflicting ticket
  const getNewLabel = (ticketKey: string): string => {
    const ticket = tickets.find((t) => t.ticket_key === ticketKey);
    if (!ticket) return '';
    const base = `results_${ticket.stage}${ticket.flow}${ticket.result}`;
    return !ticket.failing_cmd || !ticket.failing_cmd.trim() ? `${base}X` : base;
  };

  const getAction = (ticketKey: string): 'replace' | 'add' => {
    const ticket = tickets.find((t) => t.ticket_key === ticketKey);
    return ticket?.label_action || 'replace';
  };

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Label Conflicts Detected</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The following tickets already have results labels. Choose how to handle each:
        </Typography>

        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <Button size="small" variant="outlined" onClick={() => onResolveAll('replace')}>
            Replace All
          </Button>
          <Button size="small" variant="outlined" onClick={() => onResolveAll('add')}>
            Add All
          </Button>
        </Stack>

        <List dense>
          {conflicts.map((conflict) => (
            <ListItem key={conflict.ticket_key} sx={{ flexDirection: 'column', alignItems: 'flex-start', py: 1 }}>
              <ListItemText
                primary={conflict.ticket_key}
                secondary={
                  <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">Existing:</Typography>
                    {conflict.existing_results_labels.map((label) => (
                      <Chip key={label} label={label} size="small" color="warning" variant="outlined" />
                    ))}
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>New:</Typography>
                    <Chip label={getNewLabel(conflict.ticket_key)} size="small" color="primary" variant="outlined" />
                  </Stack>
                }
              />
              <ToggleButtonGroup
                size="small"
                exclusive
                value={getAction(conflict.ticket_key)}
                onChange={(_, val) => val && onResolve(conflict.ticket_key, val)}
                sx={{ mt: 1 }}
              >
                <ToggleButton value="replace">Replace Existing</ToggleButton>
                <ToggleButton value="add">Add New Label</ToggleButton>
              </ToggleButtonGroup>
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" onClick={onConfirm}>
          Continue with Submit
        </Button>
      </DialogActions>
    </Dialog>
  );
}
