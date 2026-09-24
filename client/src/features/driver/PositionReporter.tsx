import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import { extractApiError } from '../../api/errorUtils';
import { useGetMyPositionQuery, useReportPositionMutation } from '../../api/vehiclesApi';

const REPORT_INTERVAL_MS = 10_000;

type Source = 'gps' | 'manual';

interface Coords {
  latitude: number;
  longitude: number;
}

const GPS_TIMEOUT_MS = 8000;

function readGps(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation is not supported by this browser'));
      return;
    }
    // The browser's own `timeout` option only starts once permission is granted, so an
    // unanswered permission prompt would otherwise hang this promise (and every later tick).
    const timer = window.setTimeout(
      () => reject(new Error('Timed out waiting for location — is the permission prompt still open?')),
      GPS_TIMEOUT_MS,
    );
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timer);
        resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      },
      (err) => {
        window.clearTimeout(timer);
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? 'Location access is blocked in this browser'
              : 'Could not read your location',
          ),
        );
      },
      { enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS, maximumAge: 5000 },
    );
  });
}

function parseManual(latitude: string, longitude: string): Coords | null {
  const lat = Number.parseFloat(latitude);
  const lng = Number.parseFloat(longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }
  return { latitude: lat, longitude: lng };
}

export function PositionReporter() {
  const [sharing, setSharing] = useState(false);
  const [source, setSource] = useState<Source>('gps');
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [error, setError] = useState<{ message: string; gpsFailed: boolean } | null>(null);

  // The last position saved on the server — whether it came from device location or manual
  // entry — so it is shown after a refresh or a new login, not just after sending in this tab.
  // reportPosition invalidates this query, so it also updates after every send.
  const { data: myPosition, isLoading: positionLoading } = useGetMyPositionQuery();
  const lastSaved = myPosition?.position ?? null;
  const noVehicle = myPosition !== undefined && myPosition.vehicle === null;

  // Pre-fill the manual fields from the saved position once, when it first arrives, so the
  // driver starts from where they last were. Done during render (not in an effect), and
  // only once, so later refetches never overwrite what the driver is typing.
  const [prefilled, setPrefilled] = useState(false);
  if (!prefilled && myPosition) {
    setPrefilled(true);
    if (myPosition.position) {
      setManualLat(String(myPosition.position.latitude));
      setManualLng(String(myPosition.position.longitude));
    }
  }

  const [reportPosition] = useReportPositionMutation();

  // The interval reads the latest inputs through a ref, so editing the manual
  // coordinates takes effect on the next tick without restarting the timer.
  const inputsRef = useRef({ source, manualLat, manualLng });
  useEffect(() => {
    inputsRef.current = { source, manualLat, manualLng };
  }, [source, manualLat, manualLng]);
  const inFlightRef = useRef(false);

  const sendOnce = useCallback(async () => {
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    const { source: currentSource, manualLat: lat, manualLng: lng } = inputsRef.current;

    try {
      let coords: Coords;
      if (currentSource === 'gps') {
        try {
          coords = await readGps();
        } catch (err) {
          setError({ message: (err as Error).message, gpsFailed: true });
          return;
        }
      } else {
        const parsed = parseManual(lat, lng);
        if (!parsed) {
          setError({ message: 'Enter a latitude between -90 and 90 and a longitude between -180 and 180', gpsFailed: false });
          return;
        }
        coords = parsed;
      }

      await reportPosition(coords).unwrap();
      setError(null);
    } catch (err) {
      setError({ message: extractApiError(err).message, gpsFailed: false });
    } finally {
      inFlightRef.current = false;
    }
  }, [reportPosition]);

  useEffect(() => {
    if (!sharing) {
      return;
    }
    void sendOnce();
    const id = window.setInterval(() => void sendOnce(), REPORT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [sharing, sendOnce]);

  return (
    <Card sx={{ maxWidth: 480 }}>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="h6">Location sharing</Typography>
              {myPosition?.vehicle && (
                <Typography variant="caption" color="text.secondary">
                  Vehicle {myPosition.vehicle.code}
                </Typography>
              )}
            </Box>
            <FormControlLabel
              control={
                <Switch checked={sharing} disabled={noVehicle} onChange={(e) => setSharing(e.target.checked)} />
              }
              label="Share my location"
            />
          </Stack>

          <ToggleButtonGroup
            size="small"
            exclusive
            value={source}
            onChange={(_e, value: Source | null) => value && setSource(value)}
          >
            <ToggleButton value="gps">Device location</ToggleButton>
            <ToggleButton value="manual">Manual coordinates</ToggleButton>
          </ToggleButtonGroup>

          {source === 'manual' && (
            <Stack direction="row" spacing={2}>
              <TextField
                label="Latitude"
                size="small"
                type="number"
                value={manualLat}
                onChange={(e) => setManualLat(e.target.value)}
                slotProps={{ htmlInput: { step: 0.0001, min: -90, max: 90 } }}
              />
              <TextField
                label="Longitude"
                size="small"
                type="number"
                value={manualLng}
                onChange={(e) => setManualLng(e.target.value)}
                slotProps={{ htmlInput: { step: 0.0001, min: -180, max: 180 } }}
              />
            </Stack>
          )}

          {noVehicle && (
            <Alert severity="info">No vehicle is linked to your account yet. Ask an admin to link one.</Alert>
          )}

          {error && (
            <Alert
              severity="warning"
              action={
                error.gpsFailed ? (
                  <Button color="inherit" size="small" onClick={() => setSource('manual')}>
                    Use manual
                  </Button>
                ) : undefined
              }
            >
              {error.message}
            </Alert>
          )}

          <Typography variant="body2" color="text.secondary">
            {sharing ? `Sending every ${REPORT_INTERVAL_MS / 1000}s. ` : 'Not sharing. '}
            {positionLoading
              ? 'Loading last saved location…'
              : lastSaved
                ? `Last saved ${new Date(lastSaved.recordedAt).toLocaleString()} (${lastSaved.latitude.toFixed(5)}, ${lastSaved.longitude.toFixed(5)})`
                : 'No location saved yet.'}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
