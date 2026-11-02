export interface AudioLevels {
  master: number;
  ambience: number;
  effects: number;
  music: number;
}

export interface AudioPreferences extends AudioLevels {
  enabled: boolean;
}

export const AUDIO_PREFERENCES_KEY = 'lingus.audio.v1';
export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = {
  enabled: false,
  master: 0.75,
  ambience: 0.55,
  effects: 0.8,
  music: 0.2,
};

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Bad or older partial preferences retain sensible defaults rather than NaN gains. */
export function normalizeAudioPreferences(value: unknown): AudioPreferences {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const result = { ...DEFAULT_AUDIO_PREFERENCES };
  if (typeof source.enabled === 'boolean') result.enabled = source.enabled;
  for (const key of ['master', 'ambience', 'effects', 'music'] as const) {
    if (typeof source[key] === 'number' && Number.isFinite(source[key]))
      result[key] = Math.max(0, Math.min(1, source[key]));
  }
  return result;
}

export function readAudioPreferences(storage?: PreferenceStorage): AudioPreferences {
  try {
    const source = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
    const raw = source?.getItem(AUDIO_PREFERENCES_KEY);
    return raw ? normalizeAudioPreferences(JSON.parse(raw)) : { ...DEFAULT_AUDIO_PREFERENCES };
  } catch {
    return { ...DEFAULT_AUDIO_PREFERENCES };
  }
}

export function writeAudioPreferences(value: AudioPreferences, storage?: PreferenceStorage) {
  try {
    const target = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
    if (!target) return false;
    target.setItem(AUDIO_PREFERENCES_KEY, JSON.stringify(normalizeAudioPreferences(value)));
    return true;
  } catch {
    return false;
  }
}
