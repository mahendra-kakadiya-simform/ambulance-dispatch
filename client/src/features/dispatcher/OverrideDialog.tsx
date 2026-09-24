import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { extractApiError } from '../../api/errorUtils';
import { useOverrideAssignmentMutation } from '../../api/requestsApi';
import { useListVehiclesQuery } from '../../api/vehiclesApi';
import { UrgencyChip } from '../../components/RequestChips';
import { type Request, VehicleStatus } from '../../types';

interface OverrideDialogProps {
  request: Request | null; // null = closed
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function OverrideDialog({ request, onClose, onSuccess }: OverrideDialogProps) {
  const open = request !== null;
  const currentVehicle = request?.currentAssignment?.vehicle ?? null;

  const [vehicleId, setVehicleId] = useState('');
  const [reason, setReason] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ vehicleId?: string; reason?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);

  const { data: vehiclesData, isLoading: vehiclesLoading, refetch: refetchVehicles } = useListVehiclesQuery(
    { status: VehicleStatus.AVAILABLE, pageSize: 100 },
    { skip: !open },
  );
  const [overrideAssignment, { isLoading }] = useOverrideAssignmentMutation();

  useEffect(() => {
    if (open) {
      setVehicleId('');
      setReason('');
      setFieldErrors({});
      setFormError(null);
    }
  }, [open]);

  const options = (vehiclesData?.data ?? []).filter((v) => v.id !== currentVehicle?.id);
  const canSubmit = Boolean(vehicleId) && reason.trim().length > 0 && !isLoading;

  async function handleSubmit() {
    if (!request || !canSubmit) {
      return;
    }
    setFormError(null);
    setFieldErrors({});
    try {
      const { request: updated } = await overrideAssignment({ id: request.id, vehicleId, reason: reason.trim() }).unwrap();
      onSuccess(
        `${request.patientName} reassigned from ${currentVehicle?.code ?? '?'} to ${updated.currentAssignment?.vehicle.code ?? '?'}`,
      );
      onClose();
    } catch (err) {
      const { code, message, fieldErrors: apiFieldErrors } = extractApiError(err);
      if (code === 'CONFLICT') {
        // The chosen vehicle was taken (or went out of service) since the list loaded:
        // say so on the field and reload the list so it no longer looks free.
        setFieldErrors({ vehicleId: apiFieldErrors['vehicleId'] ?? message });
        setVehicleId('');
        void refetchVehicles();
      } else if (Object.keys(apiFieldErrors).length > 0) {
        setFieldErrors(apiFieldErrors);
      } else {
        setFormError(message);
      }
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Override assignment</DialogTitle>
      {request && (
        <DialogContent>
          <Stack spacing={2}>
            {formError && <Alert severity="error">{formError}</Alert>}

            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography sx={{ fontWeight: 500 }}>{request.patientName}</Typography>
              <UrgencyChip urgency={request.urgency} />
            </Stack>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Currently assigned
              </Typography>
              <Typography variant="h6">{currentVehicle?.code ?? '—'}</Typography>
            </Box>

            <FormControl fullWidth error={Boolean(fieldErrors.vehicleId)}>
              <InputLabel id="override-vehicle-label">New vehicle</InputLabel>
              <Select
                labelId="override-vehicle-label"
                label="New vehicle"
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                disabled={isLoading}
              >
                {vehiclesLoading && (
                  <MenuItem value="" disabled>
                    Loading vehicles…
                  </MenuItem>
                )}
                {!vehiclesLoading && options.length === 0 && (
                  <MenuItem value="" disabled>
                    No other available vehicles
                  </MenuItem>
                )}
                {options.map((vehicle) => (
                  <MenuItem key={vehicle.id} value={vehicle.id} disabled={vehicle.onAssignment}>
                    {vehicle.code}
                    {vehicle.driver ? ` · ${vehicle.driver.name}` : ''}
                    {vehicle.onAssignment ? ' (on another job)' : ''}
                  </MenuItem>
                ))}
              </Select>
              {fieldErrors.vehicleId && <FormHelperText>{fieldErrors.vehicleId}</FormHelperText>}
            </FormControl>

            <TextField
              label="Reason for override"
              required
              fullWidth
              multiline
              minRows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              error={Boolean(fieldErrors.reason)}
              helperText={fieldErrors.reason ?? 'Recorded in the request history with your name and the time.'}
              disabled={isLoading}
            />
          </Stack>
        </DialogContent>
      )}
      <DialogActions>
        <Button onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => void handleSubmit()} disabled={!canSubmit} loading={isLoading}>
          Override
        </Button>
      </DialogActions>
    </Dialog>
  );
}
