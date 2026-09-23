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
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
} from '@mui/material';
import { type FormEvent, useEffect, useState } from 'react';
import { extractApiError } from '../../api/errorUtils';
import { useCreateRequestMutation } from '../../api/requestsApi';
import { UrgencyChip } from '../../components/RequestChips';
import { URGENCY_META } from '../../components/requestMeta';
import { Urgency } from '../../types';

interface FormValues {
  patientName: string;
  address: string;
  latitude: string;
  longitude: string;
  urgency: Urgency | ''; // '' = not chosen yet; there is deliberately no default
  description: string;
}

type FieldErrors = Partial<Record<keyof FormValues, string>>;

const EMPTY_FORM: FormValues = {
  patientName: '',
  address: '',
  latitude: '',
  longitude: '',
  urgency: '',
  description: '',
};

const URGENCY_ORDER: Urgency[] = [Urgency.CRITICAL, Urgency.URGENT, Urgency.ROUTINE];

interface NewRequestDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function NewRequestDialog({ open, onClose, onSuccess }: NewRequestDialogProps) {
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const [createRequest, { isLoading }] = useCreateRequestMutation();

  useEffect(() => {
    if (open) {
      setValues(EMPTY_FORM);
      setFieldErrors({});
      setFormError(null);
    }
  }, [open]);

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    // Clear a field's error as soon as it is edited, rather than leaving it stale until submit.
    setFieldErrors((errors) => ({ ...errors, [key]: undefined }));
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!values.patientName.trim()) {
      errors.patientName = 'Patient name is required';
    }
    if (!values.address.trim()) {
      errors.address = 'Address is required';
    }
    const lat = Number.parseFloat(values.latitude);
    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      errors.latitude = 'Enter a latitude between -90 and 90';
    }
    const lng = Number.parseFloat(values.longitude);
    if (Number.isNaN(lng) || lng < -180 || lng > 180) {
      errors.longitude = 'Enter a longitude between -180 and 180';
    }
    if (!values.urgency) {
      errors.urgency = 'Choose an urgency level';
    }
    return errors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || !values.urgency) {
      return;
    }

    try {
      const { request } = await createRequest({
        patientName: values.patientName.trim(),
        address: values.address.trim(),
        latitude: Number.parseFloat(values.latitude),
        longitude: Number.parseFloat(values.longitude),
        urgency: values.urgency,
        ...(values.description.trim() ? { description: values.description.trim() } : {}),
      }).unwrap();
      onSuccess(`Request for ${request.patientName} logged as ${URGENCY_META[request.urgency].label}`);
      onClose();
    } catch (err) {
      // Client-side checks are a convenience; the server's field errors are authoritative.
      const { message, fieldErrors: apiFieldErrors } = extractApiError(err);
      if (Object.keys(apiFieldErrors).length > 0) {
        setFieldErrors(apiFieldErrors);
      } else {
        setFormError(message);
      }
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>New request</DialogTitle>
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <DialogContent>
          <Stack spacing={2}>
            {formError && <Alert severity="error">{formError}</Alert>}

            <TextField
              label="Patient name"
              fullWidth
              value={values.patientName}
              onChange={(e) => set('patientName', e.target.value)}
              error={Boolean(fieldErrors.patientName)}
              helperText={fieldErrors.patientName}
              disabled={isLoading}
            />

            <TextField
              label="Address"
              fullWidth
              value={values.address}
              onChange={(e) => set('address', e.target.value)}
              error={Boolean(fieldErrors.address)}
              helperText={fieldErrors.address}
              disabled={isLoading}
            />

            <Stack direction="row" spacing={2}>
              <TextField
                label="Latitude"
                type="number"
                fullWidth
                value={values.latitude}
                onChange={(e) => set('latitude', e.target.value)}
                error={Boolean(fieldErrors.latitude)}
                helperText={fieldErrors.latitude}
                disabled={isLoading}
                slotProps={{ htmlInput: { step: 0.0001 } }}
              />
              <TextField
                label="Longitude"
                type="number"
                fullWidth
                value={values.longitude}
                onChange={(e) => set('longitude', e.target.value)}
                error={Boolean(fieldErrors.longitude)}
                helperText={fieldErrors.longitude}
                disabled={isLoading}
                slotProps={{ htmlInput: { step: 0.0001 } }}
              />
            </Stack>

            <FormControl fullWidth error={Boolean(fieldErrors.urgency)}>
              <InputLabel id="request-urgency-label">Urgency</InputLabel>
              <Select
                labelId="request-urgency-label"
                label="Urgency"
                value={values.urgency}
                onChange={(e) => set('urgency', e.target.value as Urgency)}
                disabled={isLoading}
                renderValue={(value) => (value ? <UrgencyChip urgency={value as Urgency} /> : '')}
              >
                {URGENCY_ORDER.map((urgency) => (
                  <MenuItem key={urgency} value={urgency} sx={{ gap: 1.5, alignItems: 'flex-start' }}>
                    <Box sx={{ pt: 0.5 }}>
                      <UrgencyChip urgency={urgency} />
                    </Box>
                    <ListItemText
                      secondary={URGENCY_META[urgency].description}
                      slotProps={{ secondary: { sx: { whiteSpace: 'normal' } } }}
                    />
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>{fieldErrors.urgency ?? 'Required — pick the level that fits the call.'}</FormHelperText>
            </FormControl>

            <TextField
              label="Description (optional)"
              fullWidth
              multiline
              minRows={2}
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
              error={Boolean(fieldErrors.description)}
              helperText={fieldErrors.description}
              disabled={isLoading}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" loading={isLoading}>
            Log request
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
