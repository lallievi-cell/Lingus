import { useCallback, useEffect, useRef, useState } from 'react';
import { GameAudioEvents, GameAudioSynth } from '../audio/gameAudio';
import type { GameState } from '../game/types';
import { getCalendar } from '../game/calendar';
import type { AudioLevels } from '../audio/audioPreferences';
import { GameWorldAudioEvents, soundscapeFrame, type AudioListener } from '../audio/worldAudio';

type AudioOptions = {
  ambience?: boolean;
  sessionKey?: string | number;
  levels?: AudioLevels;
  listener?: AudioListener;
};

export function useGameAudio(state: GameState, enabled: boolean, options: AudioOptions = {}) {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  const synth = useRef<GameAudioSynth | null>(null);
  const events = useRef(new GameAudioEvents());
  const worldEvents = useRef(new GameWorldAudioEvents());
  const currentEnabled = useRef(enabled);
  currentEnabled.current = enabled;
  const latest = useRef({ state, session: options.sessionKey, levels: options.levels });
  latest.current = { state, session: options.sessionKey, levels: options.levels };
  const instance = useCallback(() => (synth.current ??= new GameAudioSynth()), []);
  const unlockFromGesture = useCallback(() => {
    const audio = instance();
    if (latest.current.levels) audio.setLevels(latest.current.levels);
    audio.setAudible(currentEnabled.current, document.visibilityState !== 'hidden');
    return audio.unlockFromGesture();
  }, [instance]);

  // A replaced/imported game cannot inherit the last scene's still-ringing voices.
  // Clear them before scheduling the new scene's ambience.
  useEffect(() => {
    synth.current?.silence();
  }, [options.sessionKey]);

  useEffect(() => {
    const onVisibility = () => {
      const next = document.visibilityState !== 'hidden';
      // Rebase at both edges, even if React batches a quick hide/show pair.
      events.current.observe(latest.current.state, false, latest.current.session);
      worldEvents.current.observe(latest.current.state, false, latest.current.session);
      if (!next) synth.current?.setAudible(currentEnabled.current, false);
      setVisible(next);
    };
    // Foreground effects never resume audio: a new trusted interaction can do so.
    const onGesture = (event: Event) => {
      if (!event.isTrusted) return;
      if (
        currentEnabled.current &&
        document.visibilityState !== 'hidden' &&
        latest.current.state.started
      ) {
        const audio = instance();
        if (latest.current.levels) audio.setLevels(latest.current.levels);
        audio.setAudible(true, true);
        audio.unlockFromGesture();
      }
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
  }, [instance]);

  useEffect(() => {
    const audible = enabled && visible && state.started;
    if (options.levels) synth.current?.setLevels(options.levels);
    synth.current?.setAudible(audible, visible);
    const cues = events.current.observe(state, audible, options.sessionKey);
    const world = worldEvents.current.observe(
      state,
      audible && !state.paused && options.ambience !== false,
      options.sessionKey,
      options.listener,
    );
    for (const cue of cues) synth.current?.playCue(cue);
    if (!cues.some((cue) => cue === 'loss' || cue === 'disaster'))
      for (const cue of world) synth.current?.playWorldCue(cue);
  }, [
    state,
    enabled,
    visible,
    options.sessionKey,
    options.levels,
    options.listener,
    options.ambience,
  ]);

  const night = getCalendar(state).isNight;
  const frame = soundscapeFrame(state, options.listener);
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
    synth.current?.playSoundscape(frame);
    synth.current?.playMusic(frame);
    const interval = window.setInterval(() => {
      synth.current?.playSoundscape(frame);
      synth.current?.playMusic(frame);
    }, 4600);
    return () => {
      window.clearInterval(interval);
      synth.current?.silence();
    };
  }, [
    enabled,
    visible,
    state.started,
    state.paused,
    state.gameOver,
    options.ambience,
    options.sessionKey,
    options.levels,
    night,
    frame.season,
    frame.weather,
    frame.fire,
    frame.tense,
  ]);

  return { unlockFromGesture };
}
