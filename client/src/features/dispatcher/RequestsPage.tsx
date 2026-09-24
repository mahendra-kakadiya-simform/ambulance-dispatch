import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Paper,
  Select,
  Skeleton,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  Typography,
} from '@mui/material';
import { useRef, useState } from 'react';
import { extractApiError } from '../../api/errorUtils';
import { type RequestSortField, useAssignRequestMutation, useListRequestsQuery } from '../../api/requestsApi';
import { RequestStateChip, UrgencyChip } from '../../components/RequestChips';
import { REQUEST_STATE_META, URGENCY_META } from '../../components/requestMeta';
import { type AssignResult, type Request, RequestState, Urgency } from '../../types';
import { AssignmentExplanationDialog } from './AssignmentExplanationDialog';
import { HistoryDialog } from './HistoryDialog';
import { NewRequestDialog } from './NewRequestDialog';
import { OverrideDialog } from './OverrideDialog';

const POLLING_INTERVAL_MS = 10_000;
const SKELETON_ROWS = 5;
const COLUMNS = 8;

const ALL_STATES = Object.values(RequestState);
const ALL_URGENCIES = Object.values(Urgency);

export function RequestsPage() {
  const [stateFilter, setStateFilter] = useState<RequestState[]>([]);
  const [urgencyFilter, setUrgencyFilter] = useState<Urgency[]>([]);
  const [sort, setSort] = useState<RequestSortField>('createdAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0); // MUI TablePagination is 0-indexed, the API is 1-indexed
  const [pageSize, setPageSize] = useState(20);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  const [assignRequest] = useAssignRequestMutation();
  // Per-row in-flight tracking: a row's button is disabled from the first click until the
  // server answers, so a double-click can never send two assign calls for one request.
  const [assigningIds, setAssigningIds] = useState<ReadonlySet<string>>(new Set());
  // Synchronous twin of assigningIds: state updates only land on the next render, so two
  // clicks dispatched in the same tick would both see the old state without this.
  const inFlightRef = useRef(new Set<string>());
  const [lastAssignment, setLastAssignment] = useState<AssignResult | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<AssignResult | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<Request | null>(null);
  const [historyTarget, setHistoryTarget] = useState<Request | null>(null);

  // Filtering, sorting and paging all happen server-side; this page only sends parameters.
  const { data, isLoading, error, refetch } = useListRequestsQuery(
    { page: page + 1, pageSize, state: stateFilter, urgency: urgencyFilter, sort, order },
    { pollingInterval: POLLING_INTERVAL_MS },
  );

  async function handleAssign(request: Request) {
    if (inFlightRef.current.has(request.id)) {
      return;
    }
    inFlightRef.current.add(request.id);
    setAssigningIds((ids) => new Set(ids).add(request.id));
    setAssignError(null);
    try {
      const result = await assignRequest(request.id).unwrap();
      setLastAssignment(result);
    } catch (err) {
      // A 409 means what we are showing is stale (vehicle just taken, request already
      // assigned) — show the server's reason and refetch now rather than on the next poll.
      setAssignError(extractApiError(err).message);
      void refetch();
    } finally {
      inFlightRef.current.delete(request.id);
      setAssigningIds((ids) => {
        const next = new Set(ids);
        next.delete(request.id);
        return next;
      });
    }
  }

  function handleSort(field: RequestSortField) {
    if (sort === field) {
      setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(field);
      // desc = newest first for time, most urgent first for urgency.
      setOrder(field === 'state' ? 'asc' : 'desc');
    }
    setPage(0);
  }

  function sortLabel(field: RequestSortField, label: string) {
    return (
      <TableSortLabel active={sort === field} direction={sort === field ? order : 'desc'} onClick={() => handleSort(field)}>
        {label}
      </TableSortLabel>
    );
  }

  const rows = data?.data ?? [];
  const total = data?.meta.total ?? 0;

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Requests
      </Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel id="state-filter-label">State</InputLabel>
          <Select<RequestState[]>
            labelId="state-filter-label"
            multiple
            value={stateFilter}
            onChange={(e) => {
              setStateFilter(e.target.value as RequestState[]);
              setPage(0);
            }}
            input={<OutlinedInput label="State" />}
            renderValue={(selected) =>
              selected.length === 0 ? 'All' : selected.map((s) => REQUEST_STATE_META[s].label).join(', ')
            }
          >
            {ALL_STATES.map((state) => (
              <MenuItem key={state} value={state}>
                <Checkbox size="small" checked={stateFilter.includes(state)} />
                <ListItemText primary={REQUEST_STATE_META[state].label} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel id="urgency-filter-label">Urgency</InputLabel>
          <Select<Urgency[]>
            labelId="urgency-filter-label"
            multiple
            value={urgencyFilter}
            onChange={(e) => {
              setUrgencyFilter(e.target.value as Urgency[]);
              setPage(0);
            }}
            input={<OutlinedInput label="Urgency" />}
            renderValue={(selected) =>
              selected.length === 0 ? 'All' : selected.map((u) => URGENCY_META[u].label).join(', ')
            }
          >
            {ALL_URGENCIES.map((urgency) => (
              <MenuItem key={urgency} value={urgency}>
                <Checkbox size="small" checked={urgencyFilter.includes(urgency)} />
                <UrgencyChip urgency={urgency} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {(stateFilter.length > 0 || urgencyFilter.length > 0) && (
          <Button
            size="small"
            onClick={() => {
              setStateFilter([]);
              setUrgencyFilter([]);
              setPage(0);
            }}
          >
            Clear filters
          </Button>
        )}

        <Box sx={{ flexGrow: 1 }} />
        <Chip label={`Refreshing every ${POLLING_INTERVAL_MS / 1000}s`} size="small" variant="outlined" />
        <Button variant="contained" onClick={() => setDialogOpen(true)}>
          New request
        </Button>
      </Stack>

      {error && !data && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {extractApiError(error).message}
        </Alert>
      )}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Patient</TableCell>
              <TableCell>Address</TableCell>
              <TableCell>{sortLabel('urgency', 'Urgency')}</TableCell>
              <TableCell>{sortLabel('state', 'State')}</TableCell>
              <TableCell>Vehicle</TableCell>
              <TableCell>Driver</TableCell>
              <TableCell>{sortLabel('createdAt', 'Created')}</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading &&
              Array.from({ length: SKELETON_ROWS }).map((_, rowIndex) => (
                <TableRow key={rowIndex}>
                  {Array.from({ length: COLUMNS }).map((_col, colIndex) => (
                    <TableCell key={colIndex}>
                      <Skeleton />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={COLUMNS}>
                  <Box sx={{ py: 4, textAlign: 'center' }}>
                    <Typography color="text.secondary">No requests match these filters.</Typography>
                  </Box>
                </TableCell>
              </TableRow>
            )}

            {rows.map((request) => (
              <TableRow key={request.id} hover>
                <TableCell sx={{ fontWeight: 500 }}>{request.patientName}</TableCell>
                <TableCell>{request.address}</TableCell>
                <TableCell>
                  <UrgencyChip urgency={request.urgency} />
                </TableCell>
                <TableCell>
                  <RequestStateChip state={request.state} />
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{request.currentAssignment?.vehicle.code ?? '—'}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {request.currentAssignment
                    ? (request.currentAssignment.vehicle.driver?.name ?? 'No driver linked')
                    : '—'}
                </TableCell>
                <TableCell title={new Date(request.createdAt).toLocaleString()}>
                  {new Date(request.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    {new Date(request.createdAt).toLocaleDateString()}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  {request.state === RequestState.REQUESTED && (
                    <Button
                      size="small"
                      variant="outlined"
                      loading={assigningIds.has(request.id)}
                      disabled={assigningIds.has(request.id)}
                      onClick={() => void handleAssign(request)}
                    >
                      Assign
                    </Button>
                  )}
                  {request.state === RequestState.ASSIGNED && (
                    <Button size="small" color="inherit" variant="outlined" onClick={() => setOverrideTarget(request)}>
                      Override
                    </Button>
                  )}
                  <Button size="small" onClick={() => setHistoryTarget(request)} sx={{ ml: 1 }}>
                    History
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_e, newPage) => setPage(newPage)}
          rowsPerPage={pageSize}
          onRowsPerPageChange={(e) => {
            setPageSize(Number.parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 20, 50, 100]}
        />
      </TableContainer>

      <NewRequestDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSuccess={setSnackbarMessage} />

      <Snackbar
        open={snackbarMessage !== null}
        autoHideDuration={4000}
        onClose={() => setSnackbarMessage(null)}
        message={snackbarMessage}
      />

      <Snackbar
        open={lastAssignment !== null}
        autoHideDuration={10_000}
        onClose={(_e, reason) => reason !== 'clickaway' && setLastAssignment(null)}
      >
        <Alert
          severity="success"
          variant="filled"
          onClose={() => setLastAssignment(null)}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                setExplanation(lastAssignment);
                setLastAssignment(null);
              }}
            >
              Why this vehicle?
            </Button>
          }
        >
          {lastAssignment &&
            `${lastAssignment.assignment.vehicle.code} assigned to ${lastAssignment.request.patientName} — ${lastAssignment.assignment.distanceKm.toFixed(2)} km away`}
        </Alert>
      </Snackbar>

      <Snackbar open={assignError !== null} autoHideDuration={8000} onClose={() => setAssignError(null)}>
        <Alert severity="error" variant="filled" onClose={() => setAssignError(null)}>
          {assignError}
        </Alert>
      </Snackbar>

      <AssignmentExplanationDialog result={explanation} onClose={() => setExplanation(null)} />

      <OverrideDialog request={overrideTarget} onClose={() => setOverrideTarget(null)} onSuccess={setSnackbarMessage} />

      <HistoryDialog request={historyTarget} onClose={() => setHistoryTarget(null)} />
    </Box>
  );
}
