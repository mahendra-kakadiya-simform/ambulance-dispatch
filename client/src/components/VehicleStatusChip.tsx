import { Chip } from '@mui/material';
import { VehicleStatus } from '../types';

const STATUS_LABELS: Record<VehicleStatus, string> = {
  [VehicleStatus.AVAILABLE]: 'Available',
  [VehicleStatus.OUT_OF_SERVICE]: 'Out of service',
};

const STATUS_COLORS: Record<VehicleStatus, 'success' | 'default'> = {
  [VehicleStatus.AVAILABLE]: 'success',
  [VehicleStatus.OUT_OF_SERVICE]: 'default',
};

export function VehicleStatusChip({ status }: { status: VehicleStatus }) {
  return <Chip label={STATUS_LABELS[status]} color={STATUS_COLORS[status]} size="small" />;
}
