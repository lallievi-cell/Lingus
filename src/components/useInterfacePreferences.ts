import { useCallback, useState } from 'react';

export interface InterfacePreferences {
  textSize: 'standard' | 'large';
  contrast: 'standard' | 'high';
}
export const INTERFACE_PREFERENCES_KEY = 'lingus.interface.v1';
export const DEFAULT_INTERFACE_PREFERENCES: InterfacePreferences = {
  textSize: 'standard',
  contrast: 'standard',
};

export function normalizeInterfacePreferences(value: unknown): InterfacePreferences {
  const preferences = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    textSize: preferences.textSize === 'large' ? 'large' : 'standard',
    contrast: preferences.contrast === 'high' ? 'high' : 'standard',
  };
}

export function readInterfacePreferences(
  storageProvider: () => Pick<Storage, 'getItem'> = () => localStorage,
): InterfacePreferences {
  try {
    return normalizeInterfacePreferences(
      JSON.parse(storageProvider().getItem(INTERFACE_PREFERENCES_KEY) ?? 'null'),
    );
  } catch {
    return { ...DEFAULT_INTERFACE_PREFERENCES };
  }
}

export function writeInterfacePreferences(
  value: InterfacePreferences,
  storageProvider: () => Pick<Storage, 'setItem'> = () => localStorage,
) {
  try {
    storageProvider().setItem(
      INTERFACE_PREFERENCES_KEY,
      JSON.stringify(normalizeInterfacePreferences(value)),
    );
    return true;
  } catch {
    return false;
  }
}

export function useInterfacePreferences() {
  const [interfacePreferences, setValue] = useState(readInterfacePreferences);
  const setInterfacePreferences = useCallback((value: InterfacePreferences) => {
    const preferences = normalizeInterfacePreferences(value);
    setValue(preferences);
    writeInterfacePreferences(preferences);
  }, []);
  return { interfacePreferences, setInterfacePreferences };
}
