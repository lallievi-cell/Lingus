import { describe, expect, it } from 'vitest';
import { createGame, parseGame, serializeGame } from './engine';
import { generateWorld } from './worldGeneration';

describe('regional culture save compatibility', () => {
  it('round-trips eight regional cultures without teaching the player or advancing randomness', () => {
    const state = createGame(42, 'guided', 'random', 1000);
    const before = JSON.stringify(state);
    const loaded = parseGame(serializeGame(state));
    expect(loaded?.factions).toHaveLength(8);
    expect(loaded?.mapGeneration).toMatchObject({ worldSize: 1000, regionalCultures: 1 });
    expect(loaded?.factions.map((faction) => faction.culture)).toEqual(
      state.factions.map((faction) => faction.culture),
    );
    expect(loaded?.words).toEqual(state.words);
    expect(loaded?.seed).toBe(42);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('loads a preceding four-culture region without adding societies or policy profiles', () => {
    // Reproduce the 0.5.0 geography using its retained four-culture generator.
    const old = createGame(42, 'classic', 'random');
    Object.assign(old, generateWorld(42, old.factions, 1000));
    old.mapGeneration!.worldSize = 1000;
    old.home = { x: 550, y: 550 };
    old.explored = [{ ...old.home }];
    old.units.forEach((unit) => {
      unit.x += 300;
      unit.y += 300;
    });
    old.revision = old.entities.length + 100;
    const loaded = parseGame(serializeGame(old));
    expect(loaded).not.toBeNull();
    expect(loaded?.factions).toHaveLength(4);
    expect(loaded?.factions.every((faction) => faction.culture === undefined)).toBe(true);
    expect(loaded?.mapGeneration?.regionalCultures).toBeUndefined();
    expect(loaded?.cities).toEqual(old.cities);
    expect(loaded?.entities).toEqual(old.entities);
  });

  it.each(['unknown', 'constructor', '__proto__', false, 1, {}])(
    'rejects an invalid culture profile %s',
    (culture) => {
      const state = createGame(42, 'classic', 'random', 1000);
      Object.assign(state.factions[0], { culture });
      expect(parseGame(JSON.stringify(state))).toBeNull();
    },
  );

  it('requires the culture-generation marker to match its regional geography', () => {
    const valley = createGame();
    Object.assign(valley.mapGeneration!, { regionalCultures: 1 });
    expect(parseGame(JSON.stringify(valley))).toBeNull();
    const region = createGame(42, 'classic', 'random', 1000);
    Object.assign(region.mapGeneration!, { regionalCultures: 2 });
    expect(parseGame(JSON.stringify(region))).toBeNull();
  });
});
