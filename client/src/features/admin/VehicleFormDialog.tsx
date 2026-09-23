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
} from '@mui/material';
import { type FormEvent, useEffect, useState } from 'react';
import { extractApiError } from '../../api/errorUtils';
import { useListUsersQuery } from '../../api/usersApi';
import { useCreateVehicleMutation, useListVehiclesQuery, useUpdateVehicleMutation } from '../../api/vehiclesApi';
import { Role, type Vehicle, VehicleStatus } from '../../types';

interface FormValues {
  code: string;
  status: VehicleStatus;
  driverId: string; // '' = no driver linked
}

interface FieldErrors {
  code?: string;
  status?: string;
  driverId?: string;
}

const EMPTY_FORM: FormValues = { code: '', status: VehicleStatus.AVAILABLE, driverId: '' };

interface VehicleFormDialogProps {
  open: boolean;
  vehicle: Vehicle | null; // null = create mode, editing that vehicle otherwise
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function VehicleFormDialog({ open, vehicle, onClose, onSuccess }: VehicleFormDialogProps) {
  const isEditMode = vehicle !== null;

  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Only DRIVER-role users are offered; the server still rejects anyone else with a 400.
  const { data: driversData } = useListUsersQuery(
    { role: Role.DRIVER, isActive: true, pageSize: 100, sort: 'name', order: 'asc' },
    { skip: !open },
  );
  const { data: vehiclesData } = useListVehiclesQuery({ pageSize: 100 }, { skip: !open });

  const [createVehicle, { isLoading: isCreating }] = useCreateVehicleMutation();
  const [updateVehicle, { isLoading: isUpdating }] = useUpdateVehicleMutation();
  const isSubmitting = isCreating || isUpdating;

  useEffect(() => {
    if (open) {
      setValues(
        vehicle ? { code: vehicle.code, status: vehicle.status, driverId: vehicle.driverId ?? '' } : EMPTY_FORM,
      );
      setFieldErrors({});
      setFormError(null);
    }
  }, [open, vehicle]);

  // driverId -> code of the *other* vehicle they already drive, so those options can be
  // shown as unavailable instead of failing with a 409 after submit.
  const linkedElsewhere = new Map<string, string>();
  for (const v of vehiclesData?.data ?? []) {
    if (v.driverId && v.id !== vehicle?.id) {
      linkedElsewhere.set(v.driverId, v.code);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!values.code.trim()) {
      setFieldErrors({ code: 'Code is required' });
      return;
    }
    setFieldErrors({});

    const payload = { code: values.code.trim(), status: values.status, driverId: values.driverId || null };

    try {
      if (isEditMode) {
        await updateVehicle({ id: vehicle.id, ...payload }).unwrap();
        onSuccess('Vehicle updated successfully');
      } else {
        await createVehicle(payload).unwrap();
        onSuccess('Vehicle created successfully');
      }
      onClose();
    } catch (err) {
      const { message, fieldErrors: apiFieldErrors } = extractApiError(err);
      if (Object.keys(apiFieldErrors).length > 0) {
        setFieldErrors(apiFieldErrors);
      } else {
        setFormError(message);
      }
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{isEditMode ? 'Edit vehicle' : 'Add vehicle'}</DialogTitle>
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <DialogContent>
          <Stack spacing={2}>
            {formError && <Alert severity="error">{formError}</Alert>}

            <TextField
              label="Code"
              fullWidth
              placeholder="AMB-04"
              value={values.code}
              onChange={(e) => setValues((v) => ({ ...v, code: e.target.value }))}
              error={Boolean(fieldErrors.code)}
              helperText={fieldErrors.code}
              disabled={isSubmitting}
            />

            <FormControl fullWidth error={Boolean(fieldErrors.status)}>
              <InputLabel id="vehicle-status-label">Status</InputLabel>
              <Select
                labelId="vehicle-status-label"
                label="Status"
                value={values.status}
                onChange={(e) => setValues((v) => ({ ...v, status: e.target.value as VehicleStatus }))}
                disabled={isSubmitting}
              >
                <MenuItem value={VehicleStatus.AVAILABLE}>Available</MenuItem>
                <MenuItem value={VehicleStatus.OUT_OF_SERVICE}>Out of service</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth error={Boolean(fieldErrors.driverId)}>
              <InputLabel id="vehicle-driver-label">Driver</InputLabel>
              <Select
                labelId="vehicle-driver-label"
                label="Driver"
                value={values.driverId}
                onChange={(e) => setValues((v) => ({ ...v, driverId: e.target.value }))}
                disabled={isSubmitting}
              >
                <MenuItem value="">
                  <em>No driver</em>
                </MenuItem>
                {(driversData?.data ?? []).map((driver) => {
                  const otherCode = linkedElsewhere.get(driver.id);
                  return (
                    <MenuItem key={driver.id} value={driver.id} disabled={Boolean(otherCode)}>
                      {driver.name}
                      {otherCode ? ` (linked to ${otherCode})` : ''}
                    </MenuItem>
                  );
                })}
              </Select>
              {fieldErrors.driverId && <FormHelperText>{fieldErrors.driverId}</FormHelperText>}
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" loading={isSubmitting}>
            {isEditMode ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
