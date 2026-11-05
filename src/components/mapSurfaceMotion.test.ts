import { describe, expect, it } from 'vitest';
import { createGame } from '../game/engine';
import { createRiverArtGeometry } from './mapRiverGeometry';
import { getRiverHighlights } from './mapSurfaceMotion';

describe('river surface motion', () => {
  it('freezes on pause, stops with reduced motion and never changes the simulation', () => {
    const state = createGame(6842);
    state.tier = 4;
    state.paused = false;
    const geometry = createRiverArtGeometry(state);
    const before = structuredClone(state);
    const first = getRiverHighlights(geometry, state, 10);
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThanOrEqual(48);
    expect(getRiverHighlights(geometry, state, 11)).not.toEqual(first);
    expect(state).toEqual(before);
    state.paused = true;
    expect(getRiverHighlights(geometry, state, 100)).toEqual(
      getRiverHighlights(geometry, state, 200),
    );
    expect(getRiverHighlights(geometry, state, 10, undefined, true)).toEqual([]);
  });

  it('does not draw current beyond the explored area or camera', () => {
    const state = createGame(6842);
    state.sectors.forEach((sector) => {
      sector.explored = false;
    });
    const geometry = createRiverArtGeometry(state);
    expect(getRiverHighlights(geometry, state, 10)).toEqual([]);
    state.tier = 4;
    expect(
      getRiverHighlights(geometry, state, 10, { minX: 0, minY: 0, maxX: 20, maxY: 20 }),
    ).toEqual([]);
  });
});
