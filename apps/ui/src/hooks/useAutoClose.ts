import { useEffect, useState, useRef } from 'react';

interface UseAutoCloseOptions {
  active: boolean;
  autoCloseDelay: string; // '0' | '3' | 'off'
  onCountdownTick?: (remaining: number) => void;
  onCloseFailed?: () => void;
}

interface UseAutoCloseResult {
  phase: 'idle' | 'countdown' | 'closing' | 'closeFailed';
  countdown: number;
}

export function useAutoClose({
  active,
  autoCloseDelay,
  onCountdownTick,
  onCloseFailed,
}: UseAutoCloseOptions): UseAutoCloseResult {
  const [phase, setPhase] = useState<UseAutoCloseResult['phase']>('idle');
  const [countdown, setCountdown] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!active) {
      setPhase('idle');
      setCountdown(0);
      return;
    }

    if (autoCloseDelay === 'off') {
      setPhase('closeFailed');
      onCloseFailed?.();
      return;
    }

    const delay = parseInt(autoCloseDelay, 10);
    if (delay === 0) {
      // Immediately attempt close
      setPhase('closing');
      try {
        window.close();
      } catch {
        // ignore
      }
      // Check if window is still open after 300ms
      setTimeout(() => {
        setPhase('closeFailed');
        onCloseFailed?.();
      }, 300);
      return;
    }

    // Countdown mode
    setPhase('countdown');
    setCountdown(delay);

    intervalRef.current = setInterval(() => {
      setCountdown(prev => {
        const next = prev - 1;
        onCountdownTick?.(next);
        if (next <= 0) {
          clearInterval(intervalRef.current);
          setPhase('closing');
          try {
            window.close();
          } catch {
            // ignore
          }
          // Check if window is still open
          setTimeout(() => {
            setPhase('closeFailed');
            onCloseFailed?.();
          }, 300);
        }
        return next;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active, autoCloseDelay]); // eslint-disable-line react-hooks/exhaustive-deps

  return { phase, countdown };
}
