import { Chip } from '@mui/material';
import type { RequestState, Urgency } from '../types';
import { REQUEST_STATE_META, URGENCY_META } from './requestMeta';

export function UrgencyChip({ urgency }: { urgency: Urgency }) {
  const meta = URGENCY_META[urgency];
  return <Chip label={meta.label} color={meta.color} size="small" />;
}

export function RequestStateChip({ state }: { state: RequestState }) {
  const meta = REQUEST_STATE_META[state];
  return <Chip label={meta.label} color={meta.color} size="small" variant="outlined" />;
}
