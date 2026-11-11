import { describe, expect, it } from 'vitest';
import { createInitialState } from './state';
import {
  getInitialWorldHome,
  getWorldSectorCount,
  getWorldSize,
  isWorldPoint,
  isWorldPointRevealed,
  sectorIndex,
} from './worldDimensions';

describe('persisted world dimensions', () => {
  it('keeps missing metadata and the original API on the five-sector valley', () => {
    expect(getWorldSize({})).toBe(500);
    expect(getWorldSectorCount({})).toBe(5);
    expect(getInitialWorldHome(500)).toEqual({ x: 250, y: 250 });
    expect(isWorldPoint({}, { x: 501, y: 250 })).toBe(false);
    expect(sectorIndex({}, 500)).toBe(4);
    expect(sectorIndex({}, -1)).toBe(0);
  });

  it('uses the complete regional extent including its far edge', () => {
    const region = { mapGeneration: { worldSize: 1000 as const } };
    expect(getWorldSize(region)).toBe(1000);
    expect(getWorldSectorCount(region)).toBe(10);
    expect(getInitialWorldHome(1000)).toEqual({ x: 550, y: 550 });
    expect(isWorldPoint(region, { x: 1000, y: 1000 })).toBe(true);
    expect(isWorldPoint(region, { x: 1000.01, y: 250 })).toBe(false);
    expect(isWorldPoint(region, { x: Number.NaN, y: 250 })).toBe(false);
    expect(sectorIndex(region, 850)).toBe(8);
    expect(sectorIndex(region, 1000)).toBe(9);
  });

  it('does not reveal far provinces before exploration or expose invalid points after urbanization', () => {
    const state = createInitialState(42, 'guided', 'random', 1000);
    expect(isWorldPointRevealed(state, 550, 550)).toBe(true);
    expect(isWorldPointRevealed(state, 950, 950)).toBe(false);
    state.sectors.find((sector) => sector.x === 9 && sector.y === 9)!.explored = true;
    expect(isWorldPointRevealed(state, 1000, 1000)).toBe(true);
    state.tier = 4;
    expect(isWorldPointRevealed(state, 50, 950)).toBe(true);
    expect(isWorldPointRevealed(state, -1, 950)).toBe(false);
    expect(isWorldPointRevealed(state, 1001, 950)).toBe(false);
  });
});
