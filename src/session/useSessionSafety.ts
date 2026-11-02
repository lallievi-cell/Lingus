import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { GameState } from '../game/types';
import { serializeGame, tick } from '../game/engine';
import {
  createSaveRepository,
  SAVE_CONFLICT_MESSAGE,
  SAVE_KEY,
  type SaveLoadResult,
  type SaveWriteOptions,
  type SaveWriteResult,
} from './saveRepository';

export const browserSaves = createSaveRepository();

/** Session safety is independent from simulation rules and the current panel. */
export function useSessionSafety(
  game: GameState,
  setGame: Dispatch<SetStateAction<GameState>>,
  initial: SaveLoadResult,
  modalOpen: boolean,
) {
  const current = useRef(game);
  current.current = game;
  const expectedRaw = useRef(initial.raw);
  const conflict = useRef(false);
  const [saveStatus, setSaveStatus] = useState<SaveWriteResult>({
    ok: !!initial.game || !initial.issue,
    issue: initial.game ? null : initial.issue,
    warning: initial.game ? initial.issue?.message : undefined,
    lastSavedAt: initial.lastSavedAt,
  });
  const [backgroundPause, setBackgroundPause] = useState(false);
  const pauseForConflict = useCallback(() => {
    conflict.current = true;
    const paused = { ...current.current, paused: true };
    current.current = paused;
    setGame(paused);
  }, [setGame]);
  const recordSaveResult = useCallback(
    (result: SaveWriteResult) => {
      if (result.ok) {
        conflict.current = false;
      } else if (result.issue?.kind === 'conflict') pauseForConflict();
      setSaveStatus((previous) => ({
        ...result,
        lastSavedAt: result.lastSavedAt ?? previous.lastSavedAt,
      }));
      return result;
    },
    [pauseForConflict],
  );
  const saveNow = useCallback(
    (state = current.current, options: SaveWriteOptions = {}) => {
      let baseline = expectedRaw.current;
      if (options.resolveConflict && options.reason === 'restore') {
        try {
          baseline = localStorage.getItem(SAVE_KEY);
        } catch {
          // The repository returns the actionable storage failure.
        }
      } else if (conflict.current) {
        return recordSaveResult({
          ok: false,
          issue: { kind: 'conflict', message: SAVE_CONFLICT_MESSAGE },
          lastSavedAt: null,
        });
      }
      const result = browserSaves.save(state, { ...options, expectedRaw: baseline });
      // Keep the exact snapshot we wrote. Reading the slot here could accidentally
      // adopt a different tab's intervening write as our own baseline.
      if (result.ok) expectedRaw.current = serializeGame(state);
      return recordSaveResult(result);
    },
    [recordSaveResult],
  );

  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key !== SAVE_KEY && event.key !== null) return;
      try {
        // Read the current slot: an older queued event may already have been superseded.
        if (localStorage.getItem(SAVE_KEY) === expectedRaw.current) return;
      } catch {
        return;
      }
      recordSaveResult({
        ok: false,
        issue: { kind: 'conflict', message: SAVE_CONFLICT_MESSAGE },
        lastSavedAt: null,
      });
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [recordSaveResult]);

  useEffect(() => {
    const persist = () => {
      if (current.current.started && document.visibilityState !== 'hidden')
        saveNow(current.current, { reason: 'auto' });
    };
    const background = () => {
      if (!current.current.started) return;
      const paused = { ...current.current, paused: true };
      if (!current.current.paused) setBackgroundPause(true);
      current.current = paused;
      setGame(paused);
      saveNow(paused, { reason: 'auto' });
    };
    const leave = () => {
      if (current.current.started)
        saveNow({ ...current.current, paused: true }, { reason: 'auto' });
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') background();
    };
    const timer = window.setInterval(persist, 5000);
    window.addEventListener('beforeunload', leave);
    window.addEventListener('pagehide', background);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('beforeunload', leave);
      window.removeEventListener('pagehide', background);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [saveNow, setGame]);

  useEffect(() => {
    if (!game.paused) setBackgroundPause(false);
  }, [game.paused]);

  useEffect(() => {
    if (modalOpen) return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = Math.min(2, (now - previous) / 1000);
      previous = now;
      // Browser timers can be throttled. Hidden time never becomes catch-up damage.
      if (document.visibilityState === 'hidden') return;
      setGame((state) => tick(state, elapsed));
    }, 250);
    return () => window.clearInterval(timer);
  }, [modalOpen, setGame]);

  return {
    saveStatus,
    saveNow,
    recordSaveResult,
    backgroundPause,
    dismissBackgroundPause: () => setBackgroundPause(false),
  };
}
