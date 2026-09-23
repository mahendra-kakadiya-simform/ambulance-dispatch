import EditIcon from '@mui/icons-material/Edit';
import {
  Box,
  Button,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  type SelectChangeEvent,
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
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useListVehiclesQuery } from '../../api/vehiclesApi';
import { VehicleStatusChip } from '../../components/VehicleStatusChip';
import { type Vehicle, VehicleStatus } from '../../types';
import { VehicleFormDialog } from './VehicleFormDialog';

const SKELETON_ROWS = 5;
const COLUMNS = 4;

export function VehiclesPage() {
  const [statusFilter, setStatusFilter] = useState<VehicleStatus | 'ALL'>('ALL');
  const [page, setPage] = useState(0); // MUI TablePagination is 0-indexed, the API is 1-indexed
  const [pageSize, setPageSize] = useState(20);

  const { data, isLoading } = useListVehiclesQuery({
    page: page + 1,
    pageSize,
    status: statusFilter === 'ALL' ? undefined : statusFilter,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  function openCreate() {
    setEditingVehicle(null);
    setFormOpen(true);
  }

  function openEdit(vehicle: Vehicle) {
    setEditingVehicle(vehicle);
    setFormOpen(true);
  }

  function handleStatusFilterChange(event: SelectChangeEvent) {
    setStatusFilter(event.target.value as VehicleStatus | 'ALL');
    setPage(0);
  }

  const rows = data?.data ?? [];
  const total = data?.meta.total ?? 0;

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Vehicles
      </Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="status-filter-label">Status</InputLabel>
          <Select labelId="status-filter-label" label="Status" value={statusFilter} onChange={handleStatusFilterChange}>
            <MenuItem value="ALL">All statuses</MenuItem>
            <MenuItem value={VehicleStatus.AVAILABLE}>Available</MenuItem>
            <MenuItem value={VehicleStatus.OUT_OF_SERVICE}>Out of service</MenuItem>
          </Select>
        </FormControl>
        <Box sx={{ flexGrow: 1 }} />
        <Button variant="contained" onClick={openCreate}>
          Add vehicle
        </Button>
      </Stack>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Code</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Driver</TableCell>
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
                    <Typography color="text.secondary">No vehicles found.</Typography>
                  </Box>
                </TableCell>
              </TableRow>
            )}

            {!isLoading &&
              rows.map((vehicle) => (
                <TableRow key={vehicle.id} hover>
                  <TableCell sx={{ fontWeight: 500 }}>{vehicle.code}</TableCell>
                  <TableCell>
                    <VehicleStatusChip status={vehicle.status} />
                  </TableCell>
                  <TableCell>
                    {vehicle.driver ? (
                      vehicle.driver.name
                    ) : (
                      <Chip label="Unassigned" size="small" variant="outlined" />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" aria-label={`Edit ${vehicle.code}`} onClick={() => openEdit(vehicle)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
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

      <VehicleFormDialog
        open={formOpen}
        vehicle={editingVehicle}
        onClose={() => setFormOpen(false)}
        onSuccess={setSnackbarMessage}
      />

      <Snackbar
        open={snackbarMessage !== null}
        autoHideDuration={4000}
        onClose={() => setSnackbarMessage(null)}
        message={snackbarMessage}
      />
    </Box>
  );
}
