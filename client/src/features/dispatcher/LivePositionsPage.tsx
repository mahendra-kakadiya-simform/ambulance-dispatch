import {
  Alert,
  Box,
  Chip,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { extractApiError } from '../../api/errorUtils';
import { useGetPositionsQuery } from '../../api/vehiclesApi';
import { VehicleStatusChip } from '../../components/VehicleStatusChip';
import { useNow } from '../../hooks/useNow';

const POLLING_INTERVAL_MS = 5000;
const STALE_AFTER_MS = 30_000;
const LOST_AFTER_MS = 120_000;

const SKELETON_ROWS = 3;
const COLUMNS = 6;

function formatAge(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.floor(hours / 24)}d ago`;
}

function ageColor(ms: number): string {
  if (ms > LOST_AFTER_MS) {
    return 'error.main';
  }
  if (ms > STALE_AFTER_MS) {
    return 'warning.main';
  }
  return 'text.primary';
}

export function LivePositionsPage() {
  // pollingInterval re-runs the query on a timer while this component is mounted.
  // isLoading is true only for the very first fetch; later polls just flip isFetching,
  // so the table stays on screen and swaps rows in place instead of flashing a spinner.
  const { data, isLoading, isFetching, error } = useGetPositionsQuery(undefined, {
    pollingInterval: POLLING_INTERVAL_MS,
  });
  const now = useNow();

  const rows = data?.data ?? [];

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: 'center' }}>
        <Typography variant="h5">Live positions</Typography>
        <Chip
          label={`Refreshing every ${POLLING_INTERVAL_MS / 1000}s`}
          size="small"
          color="primary"
          variant={isFetching ? 'filled' : 'outlined'}
        />
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
              <TableCell>Vehicle</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Driver</TableCell>
              <TableCell align="right">Latitude</TableCell>
              <TableCell align="right">Longitude</TableCell>
              <TableCell>Last updated</TableCell>
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
                    <Typography color="text.secondary">No vehicle has reported a position yet.</Typography>
                  </Box>
                </TableCell>
              </TableRow>
            )}

            {rows.map((row) => {
              const age = now - new Date(row.recordedAt).getTime();
              return (
                <TableRow key={row.vehicleId} hover>
                  <TableCell sx={{ fontWeight: 500 }}>{row.code}</TableCell>
                  <TableCell>
                    <VehicleStatusChip status={row.status} />
                  </TableCell>
                  <TableCell>{row.driverName ?? '—'}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {row.latitude.toFixed(5)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {row.longitude.toFixed(5)}
                  </TableCell>
                  <TableCell
                    sx={{ color: ageColor(age), fontWeight: age > STALE_AFTER_MS ? 500 : 400 }}
                    title={new Date(row.recordedAt).toLocaleString()}
                  >
                    {formatAge(age)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
