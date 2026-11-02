import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BUILD_INFO } from '../buildInfo';
import { BuildDetails } from './BuildDetails';
import { readBuildManifest, sameBuild } from './buildManifest';

const valid = {
  version: '0.3.0',
  commit: 'a'.repeat(40),
  builtAt: '2026-10-31T12:30:00.000Z',
};

describe('published build identity', () => {
  it('accepts a complete published release and returns only its identity fields', () => {
    expect(
      readBuildManifest({ ...valid, entryFile: 'assets/index-abc.js', unexpected: '<script>' }),
    ).toEqual(valid);
    expect(readBuildManifest({ ...valid, commit: valid.commit.toUpperCase() })).toEqual(valid);
    expect(readBuildManifest({ ...valid, version: '0.3.0-preview.1+build.2' })?.version).toBe(
      '0.3.0-preview.1+build.2',
    );
  });

  it('rejects incomplete or malformed responses instead of reporting a false update', () => {
    for (const response of [
      null,
      '<html>404</html>',
      {},
      { ...valid, commit: 'latest' },
      { ...valid, commit: `${valid.commit}f` },
      { ...valid, version: '<b>0.3.0</b>' },
      { ...valid, builtAt: '' },
      { ...valid, builtAt: 'not a date' },
      { ...valid, builtAt: '2026-99-99T99:00:00Z' },
      { ...valid, builtAt: 123 },
    ]) {
      expect(readBuildManifest(response)).toBeNull();
    }
  });

  it('does not call a restarted dev server a new release when only its build time changed', () => {
    expect(sameBuild(valid, { ...valid, builtAt: '2026-11-01T12:30:00Z' })).toBe(true);
    expect(sameBuild(valid, { ...valid, commit: 'b'.repeat(40) })).toBe(false);
    expect(sameBuild(valid, { ...valid, version: '0.3.1' })).toBe(false);
    expect(
      readBuildManifest({ version: 'development', commit: 'development', builtAt: valid.builtAt }),
    ).not.toBeNull();
  });

  it('identifies the running code without starting a network check or reloading the game', () => {
    let reloadAsked = false;
    const markup = renderToStaticMarkup(
      createElement(BuildDetails, {
        onBeforeReload: () => {
          reloadAsked = true;
          return true;
        },
      }),
    );
    expect(markup).toContain('Versione del gioco');
    expect(markup).toContain(BUILD_INFO.version);
    expect(markup).toContain(
      BUILD_INFO.commit === 'development' ? 'sviluppo' : BUILD_INFO.commit.slice(0, 7),
    );
    expect(markup).toContain('Controlla aggiornamenti');
    expect(markup).not.toContain('Salva e aggiorna');
    expect(reloadAsked).toBe(false);
  });
});
