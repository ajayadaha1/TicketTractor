import {
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TableCell,
  TableRow,
  TextField,
  Tooltip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { TicketEntry, DropdownOption } from '../types';

interface TicketRowProps {
  ticket: TicketEntry;
  stages: DropdownOption[];
  flows: DropdownOption[];
  results: DropdownOption[];
  onChange: (id: string, field: keyof TicketEntry, value: string) => void;
  onRemove: (id: string) => void;
}

export default function TicketRow({
  ticket,
  stages,
  flows,
  results,
  onChange,
  onRemove,
}: TicketRowProps) {
  return (
    <TableRow>
      <TableCell>
        <TextField
          value={ticket.ticket_key}
          onChange={(e) => onChange(ticket.id, 'ticket_key', e.target.value)}
          placeholder="PROJ-123"
          size="small"
          fullWidth
          variant="outlined"
        />
      </TableCell>

      <TableCell>
        <FormControl size="small" fullWidth>
          <InputLabel>Stage</InputLabel>
          <Select
            value={ticket.stage}
            label="Stage"
            onChange={(e) => onChange(ticket.id, 'stage', e.target.value)}
          >
            {stages.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </TableCell>

      <TableCell>
        <FormControl size="small" fullWidth>
          <InputLabel>Flow</InputLabel>
          <Select
            value={ticket.flow}
            label="Flow"
            onChange={(e) => onChange(ticket.id, 'flow', e.target.value)}
          >
            {flows.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </TableCell>

      <TableCell>
        <FormControl size="small" fullWidth>
          <InputLabel>Result</InputLabel>
          <Select
            value={ticket.result}
            label="Result"
            onChange={(e) => onChange(ticket.id, 'result', e.target.value)}
          >
            {results.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </TableCell>

      <TableCell>
        <TextField
          value={ticket.failing_cmd}
          onChange={(e) => onChange(ticket.id, 'failing_cmd', e.target.value)}
          placeholder="Failing command..."
          size="small"
          fullWidth
          variant="outlined"
        />
      </TableCell>

      <TableCell>
        <TextField
          value={ticket.comment}
          onChange={(e) => onChange(ticket.id, 'comment', e.target.value)}
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
          <IconButton size="small" color="error" onClick={() => onRemove(ticket.id)}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </TableCell>
    </TableRow>
  );
}
