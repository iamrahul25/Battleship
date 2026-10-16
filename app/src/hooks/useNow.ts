import { useEffect, useState } from 'react';

/** Current time, re-rendering every `intervalMs` while `enabled`. */
export function useNow(enabled: boolean, intervalMs = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs]);
  return now;
}
