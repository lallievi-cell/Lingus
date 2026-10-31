import { useCallback, useEffect, useRef, useState } from 'react';
import { GameAudioEvents, GameAudioSynth } from '../audio/gameAudio';
import type { GameState } from '../game/types';
import { getCalendar } from '../game/calendar';

type AudioOptions = { ambience?: boolean; sessionKey?: string | number };

export function useGameAudio(state: GameState, enabled: boolean, options: AudioOptions = {}) {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  const synth = useRef<GameAudioSynth | null>(null);
  const events = useRef(new GameAudioEvents());
  const currentEnabled = useRef(enabled);
  currentEnabled.current = enabled;
  const latest = useRef({ state, session: options.sessionKey });
  latest.current = { state, session: options.sessionKey };
  const instance = useCallback(() => (synth.current ??= new GameAudioSynth()), []);
  const unlockFromGesture = useCallback(() => instance().unlockFromGesture(), [instance]);

  useEffect(() => {
    const onVisibility = () => {
      const next = document.visibilityState !== 'hidden';
      // Rebase at both edges, even if React batches a quick hide/show pair.
      events.current.observe(latest.current.state, false, latest.current.session);
      if (!next) synth.current?.setAudible(currentEnabled.current, false);
      setVisible(next);
    };
    // Foreground effects never resume audio: a new trusted interaction can do so.
    const onGesture = () => {
      if (currentEnabled.current && document.visibilityState !== 'hidden')
        synth.current?.unlockFromGesture();
    };
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('pointerdown', onGesture);
    document.addEventListener('keydown', onGesture);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('pointerdown', onGesture);
      document.removeEventListener('keydown', onGesture);
      synth.current?.dispose();
      synth.current = null;
    };
  }, []);

  useEffect(() => {
    const audible = enabled && visible && state.started;
    synth.current?.setAudible(audible, visible);
    const cues = events.current.observe(state, audible, options.sessionKey);
    for (const cue of cues) synth.current?.playCue(cue);
  }, [state, enabled, visible, options.sessionKey]);

  const night = getCalendar(state).isNight;
  useEffect(() => {
    if (
      !enabled ||
      !visible ||
      !state.started ||
      state.paused ||
      state.gameOver ||
      options.ambience === false
    )
      return;
    synth.current?.playAmbience(night);
    const interval = window.setInterval(
      () => synth.current?.playAmbience(night),
      night ? 4200 : 6300,
    );
    return () => window.clearInterval(interval);
  }, [enabled, visible, state.started, state.paused, state.gameOver, options.ambience, night]);

  // A replaced/imported game cannot inherit the last scene's still-ringing voices.
  useEffect(() => {
    synth.current?.silence();
  }, [options.sessionKey]);

  return { unlockFromGesture };
}
