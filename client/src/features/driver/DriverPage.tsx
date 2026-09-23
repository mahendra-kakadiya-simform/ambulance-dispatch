import { Stack, Typography } from '@mui/material';
import { PositionReporter } from './PositionReporter';

export function DriverPage() {
  return (
    <Stack spacing={2}>
      <Typography variant="h5">My Route</Typography>
      <PositionReporter />
    </Stack>
  );
}
