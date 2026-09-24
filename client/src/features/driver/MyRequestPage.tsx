import LocalHospitalOutlinedIcon from '@mui/icons-material/LocalHospitalOutlined';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Skeleton,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { extractApiError } from '../../api/errorUtils';
import { useGetMyRequestQuery, useTransitionRequestMutation } from '../../api/requestsApi';
import { RequestStateChip, UrgencyChip } from '../../components/RequestChips';
import { REQUEST_STATE_META } from '../../components/requestMeta';
import { DRIVER_TRANSITIONS, LIFECYCLE_STEPS, type TransitionOption } from '../../components/requestTransitions';
import type { Request } from '../../types';
import { PositionReporter } from './PositionReporter';

const POLLING_INTERVAL_MS = 15_000;

type ActionError = { kind: 'stale' } | { kind: 'reassigned' } | { kind: 'other'; message: string };

export function MyRequestPage() {
  // Polls so a newly assigned job shows up without a reload.
  const { data, isLoading, refetch, isFetching } = useGetMyRequestQuery(undefined, {
    pollingInterval: POLLING_INTERVAL_MS,
  });
  const [transition, { isLoading: isTransitioning }] = useTransitionRequestMutation();

  const [actionError, setActionError] = useState<ActionError | null>(null);
  const [reasonFor, setReasonFor] = useState<TransitionOption | null>(null);
  const [reason, setReason] = useState('');

  const request = data?.request ?? null;

  async function runTransition(req: Request, option: TransitionOption, withReason?: string) {
    setActionError(null);
    try {
      // The version we are looking at goes with every transition; if dispatch (or another
      // tab) changed the request since, the server answers 409 instead of overwriting.
      await transition({
        id: req.id,
        toState: option.to,
        version: req.version,
        ...(withReason ? { reason: withReason } : {}),
      }).unwrap();
      setReasonFor(null);
      setReason('');
    } catch (err) {
      const { code, message } = extractApiError(err);
      if (code === 'CONFLICT') {
        // Version mismatch: dispatch (or another tab) changed the request since we loaded it.
        setActionError({ kind: 'stale' });
        setReasonFor(null);
      } else if (code === 'FORBIDDEN') {
        // Ownership check failed: the job was overridden to another vehicle.
        setActionError({ kind: 'reassigned' });
        setReasonFor(null);
      } else {
        setActionError({ kind: 'other', message });
      }
    }
  }

  function handleRefresh() {
    setActionError(null);
    void refetch();
  }

  if (isLoading) {
    return (
      <Stack spacing={2} sx={{ maxWidth: 640 }}>
        <Typography variant="h5">My Route</Typography>
        <Skeleton variant="rounded" height={220} />
      </Stack>
    );
  }

  return (
    <Stack spacing={2} sx={{ maxWidth: 640 }}>
      <Typography variant="h5">My Route</Typography>

      {(actionError?.kind === 'stale' || actionError?.kind === 'reassigned') && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" onClick={handleRefresh} loading={isFetching}>
              Refresh
            </Button>
          }
        >
          {actionError.kind === 'stale'
            ? 'This request was changed by dispatch. Refresh to see the latest before acting.'
            : 'This job is no longer assigned to you.'}
        </Alert>
      )}

      {!request ? (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={1} sx={{ alignItems: 'center', py: 4, textAlign: 'center' }}>
              <LocalHospitalOutlinedIcon color="disabled" sx={{ fontSize: 48 }} />
              <Typography variant="h6">No active job</Typography>
              <Typography color="text.secondary">
                You're all clear. A new job will appear here as soon as dispatch assigns one to your vehicle.
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography variant="h6" sx={{ mr: 1 }}>
                  {request.patientName}
                </Typography>
                <UrgencyChip urgency={request.urgency} />
                <RequestStateChip state={request.state} />
              </Stack>

              <Box>
                <Typography>{request.address}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {request.latitude.toFixed(5)}, {request.longitude.toFixed(5)}
                  {request.currentAssignment && ` · Vehicle ${request.currentAssignment.vehicle.code}`}
                </Typography>
                {request.description && (
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    {request.description}
                  </Typography>
                )}
              </Box>

              <Stepper activeStep={LIFECYCLE_STEPS.indexOf(request.state)} alternativeLabel>
                {LIFECYCLE_STEPS.map((state) => (
                  <Step key={state} completed={LIFECYCLE_STEPS.indexOf(state) < LIFECYCLE_STEPS.indexOf(request.state)}>
                    <StepLabel>{REQUEST_STATE_META[state].label}</StepLabel>
                  </Step>
                ))}
              </Stepper>

              {actionError?.kind === 'other' && <Alert severity="error">{actionError.message}</Alert>}

              {/*
                Only the valid next transitions are rendered. This is a convenience, not
                enforcement: the server validates every transition (state machine, ownership
                and version) and rejects anything else regardless of what the UI shows.
              */}
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                {DRIVER_TRANSITIONS[request.state].map((option) => (
                  <Button
                    key={option.to}
                    variant={option.needsReason ? 'outlined' : 'contained'}
                    color={option.needsReason ? 'inherit' : 'primary'}
                    disabled={isTransitioning}
                    onClick={() => (option.needsReason ? setReasonFor(option) : void runTransition(request, option))}
                  >
                    {option.label}
                  </Button>
                ))}
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}

      <PositionReporter />

      <Dialog open={reasonFor !== null} onClose={() => setReasonFor(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{reasonFor?.label}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Moving a job backwards is recorded in its history. Say why.
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={2}
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReasonFor(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!reason.trim() || isTransitioning}
            loading={isTransitioning}
            onClick={() => request && reasonFor && void runTransition(request, reasonFor, reason.trim())}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
