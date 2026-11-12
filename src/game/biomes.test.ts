import { describe, expect, it } from 'vitest';
import {
  farmYieldMultiplier,
  terrainBiomeAt,
  terrainPointAtEffort,
  terrainSegmentEffort,
} from './biomes';
import { createGame, parseGame, serializeGame } from './engine';
import { validSave } from './saveValidation';
import { generateWorld } from './worldGeneration';

describe('versioned terrestrial biome rules', () => {
  it('round-trips the explicit rules and rejects unsupported or inconsistent metadata', () => {
    const state = createGame(42, 'guided', 'random', 1000);
    expect(state.mapGeneration?.biomeRules).toBe(1);
    expect(validSave(state)).toBe(true);
    const restored = parseGame(serializeGame(state))!;
    expect(restored.mapGeneration).toEqual(state.mapGeneration);
    expect(restored.sectors).toEqual(state.sectors);
    for (const overrides of [
      { biomeRules: 2 },
      { landNavigation: undefined },
      { regionalCultures: undefined },
      { worldSize: undefined },
      { mode: 'seed-zero' },
    ]) {
      const invalid = structuredClone(state);
      Object.assign(invalid.mapGeneration!, overrides);
      expect(validSave(invalid)).toBe(false);
    }
  });

  it('leaves old regional geography and yields untouched when imported without the rule', () => {
    const state = createGame(42, 'guided', 'random', 1000);
    delete state.mapGeneration!.biomeRules;
    Object.assign(state, generateWorld(42, state.factions, 1000));
    expect(validSave(state)).toBe(true);
    const restored = parseGame(serializeGame(state))!;
    expect(restored.mapGeneration?.biomeRules).toBeUndefined();
    expect(restored.sectors).toEqual(state.sectors);
    for (const sector of restored.sectors)
      expect(
        farmYieldMultiplier(restored, { x: sector.x * 100 + 50, y: sector.y * 100 + 50 }),
      ).toBe(1);
    restored.sectors[0].biome = 'wetland';
    expect(validSave(restored)).toBe(false);
    const original = createGame(42, 'guided', 'seed-zero');
    expect(original.mapGeneration?.biomeRules).toBeUndefined();
    expect(validSave(original)).toBe(true);
  });

  it('integrates effort exactly across sector edges and reverses it without a timestep advantage', () => {
    const state = createGame(42, 'guided', 'random', 1000);
    for (const sector of state.sectors) sector.biome = sector.x < 2 ? 'plain' : 'mountain';
    const a = { x: 150, y: 250 },
      b = { x: 250, y: 250 };
    expect(terrainSegmentEffort(state, a, b)).toBeCloseTo(50 + 50 * 1.3);
    expect(terrainSegmentEffort(state, b, a)).toBeCloseTo(115);
    expect(terrainPointAtEffort(state, a, b, 63)).toEqual({ x: 210, y: 250 });
    let point = a;
    for (let step = 0; step < 63; step++) point = terrainPointAtEffort(state, point, b, 1);
    expect(point.x).toBeCloseTo(210, 9);
    expect(point.y).toBe(250);
    delete state.mapGeneration!.biomeRules;
    expect(terrainSegmentEffort(state, a, b)).toBe(100);
    expect(terrainPointAtEffort(state, a, b, 63)).toEqual({ x: 213, y: 250 });
  });

  it('handles region boundaries and never clamps outside points onto visible terrain', () => {
    const state = createGame(42, 'guided', 'random', 1000);
    state.sectors.find((sector) => sector.x === 9 && sector.y === 9)!.biome = 'dryland';
    expect(terrainBiomeAt(state, { x: 1000, y: 1000 })).toBe('dryland');
    for (const point of [
      { x: -1, y: 0 },
      { x: 1001, y: 0 },
      { x: NaN, y: 5 },
    ])
      expect(terrainBiomeAt(state, point)).toBeUndefined();
  });
});
