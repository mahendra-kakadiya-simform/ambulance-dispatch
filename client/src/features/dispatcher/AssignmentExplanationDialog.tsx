import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { UrgencyChip } from '../../components/RequestChips';
import type { AssignResult } from '../../types';

interface AssignmentExplanationDialogProps {
  result: AssignResult | null;
  onClose: () => void;
}

// Read-only view of the ranked candidates returned by the assign call — the evidence
// that urgency beat proximity when a nearer vehicle was not chosen.
export function AssignmentExplanationDialog({ result, onClose }: AssignmentExplanationDialogProps) {
  return (
    <Dialog open={result !== null} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Why this vehicle?</DialogTitle>
      {result && (
        <DialogContent>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography>
                <strong>{result.assignment.vehicle.code}</strong> was assigned to {result.request.patientName}
              </Typography>
              <UrgencyChip urgency={result.request.urgency} />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Rule: urgency before proximity. The request gets the nearest available vehicle, unless a more urgent
              waiting request has first claim on it.
            </Typography>

            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Vehicle</TableCell>
                  <TableCell align="right">Distance</TableCell>
                  <TableCell>Chosen</TableCell>
                  <TableCell>Why not</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.candidates.map((candidate) => (
                  <TableRow key={candidate.vehicleId} selected={candidate.chosen}>
                    <TableCell sx={{ fontWeight: candidate.chosen ? 600 : 400 }}>{candidate.code}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {candidate.distanceKm.toFixed(2)} km
                    </TableCell>
                    <TableCell>
                      {candidate.chosen ? <CheckCircleIcon color="success" fontSize="small" /> : 'No'}
                    </TableCell>
                    <TableCell>
                      {candidate.heldFor ? (
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                          <span>Held for</span>
                          <UrgencyChip urgency={candidate.heldFor.urgency} />
                          <span>{candidate.heldFor.patientName}</span>
                        </Stack>
                      ) : candidate.chosen ? (
                        ''
                      ) : (
                        'Further away'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Stack>
        </DialogContent>
      )}
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
