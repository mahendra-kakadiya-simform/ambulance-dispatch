import { useEffect, useState } from 'react';

// Re-renders the caller every `intervalMs` with the current time, so relative
// timestamps ("12s ago") keep ageing between data refreshes.
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}
