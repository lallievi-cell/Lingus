import { useCallback, useEffect, useRef, useState } from 'react';
import { BUILD_INFO } from '../buildInfo';
import type { GameState } from '../game/types';
import {
  createPlaytestRecord,
  exportPlaytestReport,
  observePlaytest,
  recordPlaytestAction,
  stopPlaytestRecord,
  type PlaytestAction,
  type PlaytestRecord,
} from '../session/playtestRecord';

export function usePlaytestRecord(
  game: GameState,
  sessionKey: string | number,
  options: { paused: boolean },
) {
  const paused =
    options.paused || game.paused || !game.started || !!game.gameOver || !!game.victory;
  const current = useRef({ game, paused });
  current.current = { game, paused };
  const [record, setRecord] = useState<PlaytestRecord | null>(null);
  const sample = useCallback(() => {
    setRecord((value) =>
      value
        ? observePlaytest(
            value,
            current.current.game,
            performance.now(),
            current.current.paused,
            document.visibilityState !== 'hidden',
          )
        : null,
    );
  }, []);
  useEffect(() => {
    setRecord(null);
  }, [sessionKey]);
  useEffect(() => {
    if (!record?.summary.recording) return;
    const timer = window.setInterval(sample, 1000);
    document.addEventListener('visibilitychange', sample);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', sample);
    };
  }, [record?.summary.recording, sample]);
  // Attribute the elapsed interval to its actual pause state before sampling the new one.
  useEffect(sample, [paused, sample]);
  const startRecording = useCallback(
    () =>
      setRecord(
        createPlaytestRecord(
          current.current.game,
          performance.now(),
          current.current.paused,
          document.visibilityState !== 'hidden',
        ),
      ),
    [],
  );
  const stopRecording = useCallback(
    () =>
      setRecord((value) =>
        value
          ? stopPlaytestRecord(
              observePlaytest(
                value,
                current.current.game,
                performance.now(),
                current.current.paused,
                document.visibilityState !== 'hidden',
              ),
            )
          : null,
      ),
    [],
  );
  const recordAction = useCallback(
    (kind: PlaytestAction) =>
      setRecord((value) =>
        value ? recordPlaytestAction(value, kind, current.current.game.time) : null,
      ),
    [],
  );
  const exportReport = useCallback(
    () =>
      record
        ? exportPlaytestReport(
            observePlaytest(
              record,
              current.current.game,
              performance.now(),
              current.current.paused,
              document.visibilityState !== 'hidden',
            ),
            BUILD_INFO,
          )
        : '',
    [record],
  );
  return {
    summary: record?.summary ?? null,
    recordAction,
    exportReport,
    startRecording,
    stopRecording,
  };
}
