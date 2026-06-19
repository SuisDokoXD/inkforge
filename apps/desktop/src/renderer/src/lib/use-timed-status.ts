import { useCallback, useEffect, useRef, useState } from "react";

export function useTimedStatus<T = string>(initialStatus: T | null = null): {
  status: T | null;
  showStatus: (message: T | null, hideAfterMs?: number) => void;
  clearStatusTimer: () => void;
} {
  const [status, setStatus] = useState<T | null>(initialStatus);
  const timerRef = useRef<number | null>(null);

  const clearStatusTimer = useCallback((): void => {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const showStatus = useCallback(
    (message: T | null, hideAfterMs?: number): void => {
      clearStatusTimer();
      setStatus(message);
      if (message && hideAfterMs) {
        timerRef.current = window.setTimeout(() => {
          setStatus(null);
          timerRef.current = null;
        }, hideAfterMs);
      }
    },
    [clearStatusTimer],
  );

  useEffect(() => () => clearStatusTimer(), [clearStatusTimer]);

  return { status, showStatus, clearStatusTimer };
}
