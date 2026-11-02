import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InterfaceSettings } from './InterfaceSettings';
import {
  DEFAULT_INTERFACE_PREFERENCES,
  INTERFACE_PREFERENCES_KEY,
  normalizeInterfacePreferences,
  readInterfacePreferences,
  writeInterfacePreferences,
} from './useInterfacePreferences';

describe('readability preferences', () => {
  it('loads only supported settings and ignores unrecognised values', () => {
    expect(normalizeInterfacePreferences({ textSize: 'large', contrast: 'high' })).toEqual({
      textSize: 'large',
      contrast: 'high',
    });
    expect(
      normalizeInterfacePreferences({
        textSize: 'gigantic',
        contrast: 'all-black',
        anything: true,
      }),
    ).toEqual(DEFAULT_INTERFACE_PREFERENCES);
    expect(normalizeInterfacePreferences(null)).toEqual(DEFAULT_INTERFACE_PREFERENCES);
  });

  it('reads existing preferences without touching a saved game or writing defaults', () => {
    const data = new Map([
      ['lingus.save.v2', 'original game'],
      [INTERFACE_PREFERENCES_KEY, '{"textSize":"large","contrast":"high"}'],
    ]);
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    };
    expect(readInterfacePreferences(() => storage)).toEqual({
      textSize: 'large',
      contrast: 'high',
    });
    expect(
      writeInterfacePreferences({ textSize: 'standard', contrast: 'high' }, () => storage),
    ).toBe(true);
    expect(data.get('lingus.save.v2')).toBe('original game');
    expect(JSON.parse(data.get(INTERFACE_PREFERENCES_KEY)!)).toEqual({
      textSize: 'standard',
      contrast: 'high',
    });
  });

  it('falls back safely when preferences are corrupt or the browser denies storage', () => {
    expect(readInterfacePreferences(() => ({ getItem: () => '{broken' }))).toEqual(
      DEFAULT_INTERFACE_PREFERENCES,
    );
    expect(
      readInterfacePreferences(() => {
        throw new Error('blocked');
      }),
    ).toEqual(DEFAULT_INTERFACE_PREFERENCES);
    expect(
      writeInterfacePreferences({ textSize: 'large', contrast: 'high' }, () => {
        throw new Error('quota');
      }),
    ).toBe(false);
  });

  it('offers labelled native controls and explains that map colours remain unchanged', () => {
    const markup = renderToStaticMarkup(
      createElement(InterfaceSettings, {
        value: { textSize: 'large', contrast: 'high' },
        onChange: () => {},
      }),
    );
    expect(markup).toContain('aria-label="Dimensione del testo"');
    expect(markup).toContain('aria-label="Contrasto dei pannelli"');
    expect(markup).toContain('value="large" selected=""');
    expect(markup).toContain('value="high" selected=""');
    expect(markup).toContain('La mappa conserva i propri colori');
  });
});
