import {
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { BulkUpdateResponse } from '../types';

interface SubmitResultsDialogProps {
  open: boolean;
  results: BulkUpdateResponse | null;
  onClose: () => void;
}

export default function SubmitResultsDialog({
  open,
  results,
  onClose,
}: SubmitResultsDialogProps) {
  if (!results) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Update Results - {results.successful}/{results.total} Successful
      </DialogTitle>
      <DialogContent>
        {results.failed > 0 && (
          <Typography variant="body2" color="error" sx={{ mb: 2 }}>
            {results.failed} ticket(s) failed to update. See details below.
          </Typography>
        )}

        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Ticket</TableCell>
              <TableCell>Label Applied</TableCell>
              <TableCell>Comment</TableCell>
              <TableCell align="center">Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {results.results.map((r) => (
              <TableRow key={r.ticket_key}>
                <TableCell>{r.ticket_key}</TableCell>
                <TableCell>
                  {r.label_applied ? (
                    <Chip label={r.label_applied} size="small" color="primary" />
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell>
                  {r.comment_added ? (
                    <Chip label="Added" size="small" color="success" variant="outlined" />
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell align="center">
                  {r.success ? (
                    <CheckCircleIcon color="success" fontSize="small" />
                  ) : (
                    <Typography variant="caption" color="error">
                      <ErrorIcon color="error" fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                      {r.error}
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
