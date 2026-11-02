import { describe, expect, it } from 'vitest';
import {
  AUDIO_PREFERENCES_KEY,
  DEFAULT_AUDIO_PREFERENCES,
  normalizeAudioPreferences,
  readAudioPreferences,
  writeAudioPreferences,
} from './audioPreferences';

describe('persistent audio preferences', () => {
  it('starts quietly and retains a complete independent mix after a round trip', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, raw: string) => {
        values.set(key, raw);
      },
    };
    expect(readAudioPreferences(storage)).toEqual(DEFAULT_AUDIO_PREFERENCES);
    const mix = { enabled: true, master: 0.65, ambience: 0.3, effects: 0.9, music: 0 };
    expect(writeAudioPreferences(mix, storage)).toBe(true);
    expect(values.has(AUDIO_PREFERENCES_KEY)).toBe(true);
    expect(readAudioPreferences(storage)).toEqual(mix);
  });

  it('rejects malformed values, clamps gains and keeps defaults for missing channels', () => {
    expect(
      normalizeAudioPreferences({ enabled: 'yes', master: 12, ambience: -8, effects: NaN }),
    ).toEqual({
      ...DEFAULT_AUDIO_PREFERENCES,
      master: 1,
      ambience: 0,
    });
    expect(normalizeAudioPreferences({ enabled: true, music: 0 })).toEqual({
      ...DEFAULT_AUDIO_PREFERENCES,
      enabled: true,
      music: 0,
    });
    expect(normalizeAudioPreferences(null)).toEqual(DEFAULT_AUDIO_PREFERENCES);
    expect(normalizeAudioPreferences([1, 2])).toEqual(DEFAULT_AUDIO_PREFERENCES);
  });

  it('storage denial or broken JSON cannot prevent starting or muting a game', () => {
    const denied = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(readAudioPreferences(denied)).toEqual(DEFAULT_AUDIO_PREFERENCES);
    expect(writeAudioPreferences(DEFAULT_AUDIO_PREFERENCES, denied)).toBe(false);
    expect(readAudioPreferences({ ...denied, getItem: () => '{broken' })).toEqual(
      DEFAULT_AUDIO_PREFERENCES,
    );
  });
});
