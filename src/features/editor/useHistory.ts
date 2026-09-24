import { useRef, useState } from "react";

export function useHistory<T>(value: T, commitValue: (next: T) => void) {
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const [version, setVersion] = useState(0);

  function commit(next: T) {
    past.current.push(structuredClone(value));
    if (past.current.length > 50) past.current.shift();
    future.current = [];
    commitValue(next);
    setVersion((item) => item + 1);
  }

  function undo() {
    const previous = past.current.pop();
    if (!previous) return;
    future.current.push(structuredClone(value));
    commitValue(previous);
    setVersion((item) => item + 1);
  }

  function redo() {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(structuredClone(value));
    commitValue(next);
    setVersion((item) => item + 1);
  }

  return {
    commit,
    undo,
    redo,
    canUndo: past.current.length > 0 && version >= 0,
    canRedo: future.current.length > 0,
  };
}
