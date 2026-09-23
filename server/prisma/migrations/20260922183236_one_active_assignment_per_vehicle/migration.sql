CREATE UNIQUE INDEX one_active_assignment_per_vehicle ON assignments ("vehicleId") WHERE status = 'ACTIVE';
