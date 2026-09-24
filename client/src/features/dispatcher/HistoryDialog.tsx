import NoteAddOutlinedIcon from '@mui/icons-material/NoteAddOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import TimelineIcon from '@mui/icons-material/Timeline';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Skeleton,
  Stack,
  Typography,
  alpha,
} from '@mui/material';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { extractApiError } from '../../api/errorUtils';
import { useGetRequestHistoryQuery } from '../../api/requestsApi';
import { REQUEST_STATE_META } from '../../components/requestMeta';
import { type HistoryEntry, type Request, RequestState, Role } from '../../types';

const PAGE_SIZE = 20;

const ROLE_LABELS: Record<Role, string> = {
  [Role.SUPER_ADMIN]: 'Super Admin',
  [Role.DISPATCHER]: 'Dispatcher',
  [Role.DRIVER]: 'Driver',
};

function stateLabel(value: string | null): string {
  return value && value in REQUEST_STATE_META ? REQUEST_STATE_META[value as RequestState].label : (value ?? '?');
}

interface Described {
  icon: ReactNode;
  sentence: string;
  // Label for the free-text column: a human reason, or the system's explanation of a decision.
  reasonLabel: string;
  highlight: boolean;
}

// Turns an audit row into a sentence a person can read aloud in a walkthrough.
function describe(entry: HistoryEntry): Described {
  switch (entry.action) {
    case 'REQUEST_CREATED':
      return { icon: <NoteAddOutlinedIcon color="action" />, sentence: 'logged the request', reasonLabel: 'Reason', highlight: false };
    case 'VEHICLE_ASSIGNED':
      return {
        icon: <LocalShippingOutlinedIcon color="info" />,
        sentence: 'assigned a vehicle',
        reasonLabel: 'Decision',
        highlight: false,
      };
    case 'ASSIGNMENT_OVERRIDDEN':
      return {
        icon: <SwapHorizIcon color="warning" />,
        sentence: `overrode the assignment: ${entry.fromValue ?? '?'} → ${entry.toValue ?? '?'}`,
        reasonLabel: 'Reason',
        highlight: true,
      };
    case 'STATE_CHANGED':
      return {
        icon: <TimelineIcon color="primary" />,
        sentence: `moved the request from ${stateLabel(entry.fromValue)} to ${stateLabel(entry.toValue)}`,
        reasonLabel: 'Reason',
        highlight: false,
      };
    default:
      return {
        icon: <TimelineIcon color="disabled" />,
        sentence: `${entry.action.toLowerCase().replace(/_/g, ' ')}${entry.fromValue || entry.toValue ? `: ${entry.fromValue ?? '—'} → ${entry.toValue ?? '—'}` : ''}`,
        reasonLabel: 'Reason',
        highlight: false,
      };
  }
}

function HistoryItem({ entry }: { entry: HistoryEntry }) {
  const { icon, sentence, reasonLabel, highlight } = describe(entry);
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{
        py: 1.5,
        px: highlight ? 1.5 : 0,
        borderBottom: 1,
        borderColor: 'divider',
        ...(highlight && {
          bgcolor: (theme) => alpha(theme.palette.warning.main, 0.08),
          borderLeft: 4,
          borderLeftColor: 'warning.main',
          borderRadius: 1,
        }),
      }}
    >
      <Box sx={{ pt: 0.25 }}>{icon}</Box>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography sx={{ fontWeight: 500 }}>{entry.actor.name}</Typography>
          <Chip label={ROLE_LABELS[entry.actor.role]} size="small" variant="outlined" />
          {highlight && <Chip label="Override" size="small" color="warning" />}
        </Stack>
        <Typography>{sentence.charAt(0).toUpperCase() + sentence.slice(1)}</Typography>
        {entry.reason && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            <strong>{reasonLabel}:</strong> {entry.reason}
          </Typography>
        )}
      </Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ whiteSpace: 'nowrap', pt: 0.25 }}
        title={new Date(entry.createdAt).toISOString()}
      >
        {new Date(entry.createdAt).toLocaleString()}
      </Typography>
    </Stack>
  );
}

// One page of the trail. "Load more" renders another of these, so each page is its own
// cached query and earlier pages stay on screen.
function HistoryPage({ requestId, page }: { requestId: string; page: number }) {
  const { data, isLoading, error } = useGetRequestHistoryQuery({ id: requestId, page, pageSize: PAGE_SIZE });

  if (isLoading) {
    return (
      <Stack spacing={1} sx={{ py: 1 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} variant="rounded" height={56} />
        ))}
      </Stack>
    );
  }
  if (error) {
    return <Alert severity="error">{extractApiError(error).message}</Alert>;
  }
  return (
    <>
      {data?.data.map((entry) => (
        <HistoryItem key={entry.id} entry={entry} />
      ))}
    </>
  );
}

interface HistoryDialogProps {
  request: Request | null; // null = closed
  onClose: () => void;
}

export function HistoryDialog({ request, onClose }: HistoryDialogProps) {
  const [pages, setPages] = useState(1);
  // Same arguments as the first HistoryPage, so this reads the same cache entry (no extra
  // request) and gives the totals for the header and the "Load more" button.
  const { data: firstPage } = useGetRequestHistoryQuery(
    { id: request?.id ?? '', page: 1, pageSize: PAGE_SIZE },
    { skip: request === null },
  );
  const meta = firstPage?.meta ?? null;

  function handleClose() {
    setPages(1);
    onClose();
  }

  return (
    <Dialog open={request !== null} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        History — {request?.patientName}
        {meta && (
          <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
            {meta.total} {meta.total === 1 ? 'event' : 'events'}, oldest first
          </Typography>
        )}
      </DialogTitle>
      <DialogContent dividers>
        {request &&
          Array.from({ length: pages }, (_, i) => i + 1).map((page) => (
            <HistoryPage key={page} requestId={request.id} page={page} />
          ))}
        {meta?.total === 0 && (
          <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
            No history has been recorded for this request.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        {meta && pages < meta.totalPages && <Button onClick={() => setPages((p) => p + 1)}>Load more</Button>}
        <Box sx={{ flexGrow: 1 }} />
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
