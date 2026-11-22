import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createGame } from '../game/engine';
import { generateWorldRegion } from '../game/worldRegions';
import { regionProjection } from '../game/worldRuntime';
import { targetPresentation } from './targetPresentation';
import { getVisibleWorldTargets } from './visibleWorldTargets';
import { WorldAtlas } from './WorldAtlas';

const world = () => createGame(518, 'guided', 'random', 1000, true);

describe('world information without invented settlements or unexplored geography', () => {
  it('explains a prepared boundary without revealing the destination or spending Voice', () => {
    const state = world();
    for (const sector of state.sectors) sector.explored = false;
    const before = structuredClone(state);
    const presentation = targetPresentation(state, {
      type: 'point',
      regionId: '1:0',
      x: 1000,
      y: 510,
    });
    expect(presentation?.stage).toBe('Viaggio fra regioni');
    expect(presentation?.description).toContain('carichi');
    expect(presentation?.hint).toContain('non consuma Voce');
    expect(presentation?.description).not.toMatch(/isola|continente|foresta|mare|fertil/i);
    expect(state).toEqual(before);
  });

  it('does not list a bed or describe objects as at camp in an empty remote region', () => {
    const state = world();
    generateWorldRegion(state, 1, 0);
    const remote = regionProjection(state, '1:0')!;
    for (const sector of remote.sectors) sector.explored = true;
    const view = { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
    const targets = getVisibleWorldTargets(remote, view);
    expect(targets.some((entry) => entry.label === 'Giaciglio della tribù')).toBe(false);
    expect(targets.some((entry) => entry.detail.includes('Al campo'))).toBe(false);
    expect(remote.resources).toEqual(
      Object.fromEntries(Object.keys(remote.resources).map((key) => [key, 0])),
    );
    expect(
      getVisibleWorldTargets(state, view).some((entry) => entry.label === 'Giaciglio della tribù'),
    ).toBe(true);
  });

  it('keeps generated but unvisited terrain hidden in the atlas', () => {
    const state = world();
    generateWorldRegion(state, 1, 0);
    const before = structuredClone(state);
    const html = renderToStaticMarkup(
      createElement(WorldAtlas, {
        state,
        selectedTarget: null,
        groupAnchor: { type: 'point', ...state.home },
        onClose: () => {},
        onFocus: () => {},
        onPrepare: () => {},
      }),
    );
    expect(html.match(/class="world-atlas-terrain"/g)).toHaveLength(1);
    expect(html.match(/is-unknown/g)).toHaveLength(15);
    expect(html).toContain('inesplorata');
    expect(state).toEqual(before);
  });
});
