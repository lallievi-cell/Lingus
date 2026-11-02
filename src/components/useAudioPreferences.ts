import { useCallback, useEffect, useState, type SetStateAction } from 'react';
import {
  normalizeAudioPreferences,
  readAudioPreferences,
  writeAudioPreferences,
  type AudioPreferences,
} from '../audio/audioPreferences';

export function useAudioPreferences() {
  const [audioPreferences, update] = useState<AudioPreferences>(() => readAudioPreferences());
  const setAudioPreferences = useCallback((next: SetStateAction<AudioPreferences>) => {
    update((previous) =>
      normalizeAudioPreferences(typeof next === 'function' ? next(previous) : next),
    );
  }, []);
  const setSound = useCallback((next: SetStateAction<boolean>) => {
    update((previous) => ({
      ...previous,
      enabled: typeof next === 'function' ? next(previous.enabled) : next,
    }));
  }, []);
  useEffect(() => {
    writeAudioPreferences(audioPreferences);
  }, [audioPreferences]);
  return { audioPreferences, setAudioPreferences, sound: audioPreferences.enabled, setSound };
}
