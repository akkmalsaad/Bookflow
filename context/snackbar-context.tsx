import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { Snackbar, type SnackbarAction, type SnackbarTone } from '@/components/Snackbar';

type ShowSnackbarInput = {
  message: string;
  tone?: SnackbarTone;
  action?: SnackbarAction;
  /** Longer for anything carrying an Undo, so the offer is not missed. */
  durationMs?: number;
};

type SnackbarContextValue = {
  showSnackbar: (input: ShowSnackbarInput) => void;
  hideSnackbar: () => void;
};

const SnackbarContext = createContext<SnackbarContextValue | undefined>(undefined);

const DEFAULT_DURATION_MS = 3200;
const ACTION_DURATION_MS = 6000;

type SnackbarState = ShowSnackbarInput & { id: number };

/**
 * One app-level snackbar host. It lives above the router so a message survives the navigation that
 * usually follows the action that raised it — moving an invoice to the dustbin pops back to the list, and
 * the "Undo" offer travels with it.
 */
export function SnackbarProvider({ children }: { children: React.ReactNode }) {
  const [snackbar, setSnackbar] = useState<SnackbarState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextIdRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const hideSnackbar = useCallback(() => {
    clearTimer();
    setSnackbar(null);
  }, [clearTimer]);

  const showSnackbar = useCallback(
    (input: ShowSnackbarInput) => {
      clearTimer();
      nextIdRef.current += 1;
      const id = nextIdRef.current;
      setSnackbar({ ...input, id });

      const duration = input.durationMs ?? (input.action ? ACTION_DURATION_MS : DEFAULT_DURATION_MS);
      timerRef.current = setTimeout(() => {
        // Only retire the message that scheduled this timer; a newer one keeps its own window.
        setSnackbar((current) => (current?.id === id ? null : current));
      }, duration);
    },
    [clearTimer],
  );

  const value = useMemo<SnackbarContextValue>(() => ({ showSnackbar, hideSnackbar }), [hideSnackbar, showSnackbar]);

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      {snackbar ? (
        <Snackbar
          // Remount per message so the entry animation replays instead of the text swapping in place.
          key={snackbar.id}
          message={snackbar.message}
          tone={snackbar.tone}
          action={
            snackbar.action
              ? {
                  label: snackbar.action.label,
                  onPress: () => {
                    hideSnackbar();
                    snackbar.action?.onPress();
                  },
                }
              : undefined
          }
          onDismiss={hideSnackbar}
        />
      ) : null}
    </SnackbarContext.Provider>
  );
}

export function useSnackbar() {
  const context = useContext(SnackbarContext);

  if (!context) {
    throw new Error('useSnackbar must be used within a SnackbarProvider');
  }

  return context;
}
