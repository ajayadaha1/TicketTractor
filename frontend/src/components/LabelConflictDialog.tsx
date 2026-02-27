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
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { LabelCheckResult, TicketEntry } from '../types';

interface LabelConflictDialogProps {
  open: boolean;
  conflicts: LabelCheckResult[];
  tickets: TicketEntry[];
  onResolve: (ticketKey: string, action: 'add' | 'skip') => void;
  onResolveAll: (action: 'add' | 'skip') => void;
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
  const getAction = (ticketKey: string): 'add' | 'skip' => {
    const ticket = tickets.find((t) => t.ticket_key === ticketKey);
    return ticket?.label_action === 'skip' ? 'skip' : 'add';
  };

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <WarningAmberIcon color="warning" />
        Duplicate Label Detected
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The following tickets already have the exact same label applied.
          You can skip these tickets or continue anyway (e.g. to add a comment).
        </Typography>

        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <Button size="small" variant="outlined" onClick={() => onResolveAll('skip')}>
            Skip All
          </Button>
          <Button size="small" variant="outlined" onClick={() => onResolveAll('add')}>
            Continue All
          </Button>
        </Stack>

        <List dense>
          {conflicts.map((conflict) => (
            <ListItem key={conflict.ticket_key} sx={{ flexDirection: 'column', alignItems: 'flex-start', py: 1 }}>
              <ListItemText
                primary={conflict.ticket_key}
                secondary={
                  <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">Label already exists:</Typography>
                    <Chip label={conflict.new_label} size="small" color="warning" variant="outlined" />
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
                <ToggleButton value="skip">Skip</ToggleButton>
                <ToggleButton value="add">Continue Anyway</ToggleButton>
              </ToggleButtonGroup>
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" onClick={onConfirm}>
          Submit
        </Button>
      </DialogActions>
    </Dialog>
  );
}
