"use client";

import { useCallback, useReducer, type SetStateAction } from "react";

export type DraftHistory<T> = { past: T[]; value: T; future: T[]; baseline: T };
type Action<T> = { type: "change"; value: SetStateAction<T> } | { type: "reset"; value: T } | { type: "undo" } | { type: "redo" };

export function draftHistoryReducer<T>(state: DraftHistory<T>, action: Action<T>): DraftHistory<T> {
  if (action.type === "reset") return { past: [], value: action.value, future: [], baseline: action.value };
  if (action.type === "undo") {
    if (!state.past.length) return state;
    return { ...state, past: state.past.slice(0, -1), value: state.past[state.past.length - 1], future: [state.value, ...state.future] };
  }
  if (action.type === "redo") {
    if (!state.future.length) return state;
    return { ...state, past: [...state.past, state.value], value: state.future[0], future: state.future.slice(1) };
  }
  const value = typeof action.value === "function" ? (action.value as (prev: T) => T)(state.value) : action.value;
  if (JSON.stringify(value) === JSON.stringify(state.value)) return state;
  return { ...state, past: [...state.past, state.value].slice(-100), value, future: [] };
}


export function useDraftHistory<T>(initial: T) {
  const [state, dispatch] = useReducer(draftHistoryReducer<T>, { past: [], value: initial, future: [], baseline: initial });
  const set = useCallback((value: SetStateAction<T>) => dispatch({ type: "change", value }), []);
  const reset = useCallback((value: T) => dispatch({ type: "reset", value }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  return [state.value, set, { reset, undo, redo, canUndo: state.past.length > 0, canRedo: state.future.length > 0, dirty: JSON.stringify(state.value) !== JSON.stringify(state.baseline) }] as const;
}
