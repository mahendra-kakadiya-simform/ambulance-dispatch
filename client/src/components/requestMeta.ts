import { RequestState, Urgency } from '../types';

// Display metadata for request enums, shared by chips, filters and forms.

export const URGENCY_META: Record<Urgency, { label: string; color: 'error' | 'warning' | 'default'; description: string }> = {
  [Urgency.CRITICAL]: {
    label: 'Critical',
    color: 'error',
    description: 'Life-threatening — dispatch the nearest available vehicle immediately.',
  },
  [Urgency.URGENT]: {
    label: 'Urgent',
    color: 'warning',
    description: 'Serious but stable — needs a vehicle soon, after any critical calls.',
  },
  [Urgency.ROUTINE]: {
    label: 'Routine',
    color: 'default',
    description: 'Non-emergency transport — can wait for a free vehicle.',
  },
};

export const REQUEST_STATE_META: Record<
  RequestState,
  { label: string; color: 'default' | 'info' | 'primary' | 'success' | 'secondary' }
> = {
  [RequestState.REQUESTED]: { label: 'Requested', color: 'default' },
  [RequestState.ASSIGNED]: { label: 'Assigned', color: 'info' },
  [RequestState.EN_ROUTE]: { label: 'En route', color: 'primary' },
  [RequestState.ARRIVED]: { label: 'Arrived', color: 'success' },
  [RequestState.CANCELLED]: { label: 'Cancelled', color: 'secondary' },
};
