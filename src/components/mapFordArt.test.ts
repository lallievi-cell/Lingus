import { describe, expect, it } from 'vitest';
import { createGame } from '../game/engine';
import { getRiverFords } from '../game/landNavigation';
import { getVisibleRiverFords } from './mapFordArt';

describe('visible river fords', () => {
  it('keeps unexplored and distant crossings out of the art without changing geography', () => {
    const state = createGame(42, 'classic', 'random');
    state.mapGeneration!.landNavigation = 1;
    state.tier = 2;
    state.sectors.forEach((sector) => {
      sector.explored = false;
    });
    const ford = getRiverFords(state)[0];
    expect(ford).toBeDefined();
    expect(getVisibleRiverFords(state)).toEqual([]);
    const sector = state.sectors.find(
      (entry) => entry.x === Math.floor(ford.x / 100) && entry.y === Math.floor(ford.y / 100),
    )!;
    sector.explored = true;
    const before = structuredClone(state);
    expect(getVisibleRiverFords(state).some((entry) => entry.id === ford.id)).toBe(true);
    const distant = { minX: ford.x + 50, minY: ford.y + 50, maxX: ford.x + 60, maxY: ford.y + 60 };
    expect(getVisibleRiverFords(state, distant).some((entry) => entry.id === ford.id)).toBe(false);
    expect(state).toEqual(before);
  });

  it('adds no crossing artwork to older maps that retain free traversal', () => {
    const state = createGame(42, 'classic', 'random');
    delete state.mapGeneration!.landNavigation;
    state.tier = 4;
    expect(getVisibleRiverFords(state)).toEqual([]);
  });
});
