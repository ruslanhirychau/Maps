import { useState } from "react";

// Local undo/redo for a single editing session (a text or marker draft). The
// history lives only while the draft is open and tracks the steps made to THAT
// item; opening/closing resets it. There's no global document history.
export function useDraftHistory<T extends object>() {
  const [value, setValue] = useState<T | null>(null);
  const [past, setPast] = useState<T[]>([]);
  const [future, setFuture] = useState<T[]>([]);

  // Start a fresh editing session.
  const open = (initial: T) => {
    setValue(initial);
    setPast([]);
    setFuture([]);
  };
  // End the session (commit/cancel) — history is discarded.
  const close = () => {
    setValue(null);
    setPast([]);
    setFuture([]);
  };
  // Apply a change and record the previous state as an undo step.
  const change = (patch: Partial<T>) => {
    if (value === null) return;
    setPast((p) => [...p, value]);
    setFuture([]);
    setValue({ ...value, ...patch });
  };
  const undo = () => {
    if (value === null || past.length === 0) return;
    setFuture((f) => [...f, value]);
    setValue(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
  };
  const redo = () => {
    if (value === null || future.length === 0) return;
    setPast((p) => [...p, value]);
    setValue(future[future.length - 1]);
    setFuture((f) => f.slice(0, -1));
  };

  return {
    value,
    open,
    close,
    change,
    undo,
    redo,
    canUndo: value !== null && past.length > 0,
    canRedo: value !== null && future.length > 0,
  };
}
