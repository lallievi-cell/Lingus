import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { INNATE_WORDS, emptyInventory } from './content';
import { isDryLandPoint, isLandSegment, planLandRoute } from './landNavigation';
import { REGIONAL_CULTURES } from './regionalCultures';
import { createInitialState } from './state';
import { generateWorld, riverSegments, type RiverSegment } from './worldGeneration';

const referenceSeeds = [0, 1, 42, 6842, 4294967295];
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const riverDistance = (point: { x: number; y: number }, river: RiverSegment[]) =>
  Math.min(
    ...river.map(([a, b]) => {
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const t = Math.max(
        0,
        Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)),
      );
      return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
    }),
  );

describe('eight societies in newly generated regions', () => {
  it('preserves the preceding four-culture regional generator and the original valley API', () => {
    // Captured directly from the committed 0.5.0 generator before profile assignment.
    const footprints = [
      '9d389694dd9ad94eb05c1519c7ef7cc944942054c667aa45ee5594c88da0b0bd',
      'ca67cc1c0699eb26ed34bf28f065e339ffe556e8ecab1593cba9d88d02302f14',
      '3e3d0f23f2040af7436466d300a80b6e86def584f1e96e7d88bf42486d662a96',
      '8df77145971265c1799e90c7297d4eb4b0c22d99c6cfa15576d7496eed5d8f7e',
      '0d6dbb270f18ca1dfad69262c60da329295fc58f529b6c36aae0cbaf6b33dc0e',
    ];
    for (const [index, seed] of referenceSeeds.entries()) {
      const valley = createInitialState(seed, 'guided', 'random');
      expect(valley.factions).toHaveLength(4);
      expect(valley.factions.every((faction) => faction.culture === undefined)).toBe(true);
      expect(valley.mapGeneration?.regionalCultures).toBeUndefined();
      const previousRegion = generateWorld(seed, valley.factions, 1000);
      expect(previousRegion.cities).toHaveLength(4);
      expect(
        createHash('sha256')
          .update(
            JSON.stringify(previousRegion, (key, value) =>
              ['fish', 'cookedFish'].includes(key) && value === 0 ? undefined : value,
            ),
          )
          .digest('hex'),
      ).toBe(footprints[index]);
    }
    expect(createInitialState(42, 'guided', 'seed-zero', 1000)).toEqual(
      createInitialState(42, 'guided', 'seed-zero'),
    );
  });

  it('keeps eight distinct identities without granting the player people, words or supplies', () => {
    const legacy = createInitialState(42, 'guided', 'random');
    const state = createInitialState(42, 'guided', 'random', 1000);
    expect(state.mapGeneration).toMatchObject({ worldSize: 1000, regionalCultures: 1 });
    expect(state.seed).toBe(42);
    expect(state.factions.map((faction) => faction.culture).sort()).toEqual(
      Object.keys(REGIONAL_CULTURES).sort(),
    );
    expect(new Set(state.factions.map((faction) => faction.id)).size).toBe(8);
    expect(new Set(state.factions.map((faction) => faction.name)).size).toBe(8);
    expect(state.factions.slice(0, 4).map((faction) => faction.name)).toEqual(
      legacy.factions.map((faction) => faction.name),
    );
    expect(state.factions.slice(0, 4).map((faction) => faction.words)).toEqual(
      legacy.factions.map((faction) => faction.words),
    );
    expect(state.units).toHaveLength(7);
    expect(state.units.every((unit) => unit.knows.join('|') === INNATE_WORDS.join('|'))).toBe(true);
    expect(Object.keys(state.words).sort()).toEqual([...INNATE_WORDS].sort());
    expect(state.resources).toEqual(emptyInventory());
    for (const city of state.cities) {
      expect(city.cohorts).toEqual({ workers: 8, warriors: 2, sages: 2, slaves: 0 });
      expect(city.resources).toEqual({ ...emptyInventory(), food: 20, wood: 20, stone: 10 });
      expect(city.dogmas).toEqual([]);
      expect(state.factions.find((faction) => faction.id === city.factionId)?.cityId).toBe(city.id);
    }
    const other = createInitialState(1, 'guided', 'random', 1000);
    expect(other.cities.map((city) => [city.x, city.y])).not.toEqual(
      state.cities.map((city) => [city.x, city.y]),
    );
  });

  it('places safe, repeatable societies and ordinary starting resources on one hundred seeds', () => {
    const seeds = [
      ...referenceSeeds,
      ...Array.from({ length: 95 }, (_, index) => Math.imul(index + 1, 2654435761) >>> 0),
    ];
    for (const seed of seeds) {
      const state = createInitialState(seed, 'guided', 'random', 1000);
      const { home, entities, cities, sectors } = state;
      expect(state).toEqual(createInitialState(seed, 'guided', 'random', 1000));
      expect(cities).toHaveLength(8);
      expect(new Set(cities.map((city) => `${city.sectorX}:${city.sectorY}`)).size).toBe(8);
      expect(sectors.filter((sector) => sector.cityId)).toHaveLength(8);
      for (const [index, city] of cities.entries()) {
        expect(isDryLandPoint(state, city)).toBe(true);
        expect(distance(city, home)).toBeGreaterThanOrEqual(160);
        expect(
          sectors.find((sector) => sector.id === `sector-${city.sectorX}-${city.sectorY}`),
        ).toMatchObject({ cityId: city.id });
        for (const other of cities.slice(index + 1))
          expect(distance(city, other)).toBeGreaterThanOrEqual(180);
      }
      const nearby = (kind: string, radius: number) =>
        entities.filter((entity) => entity.kind === kind && distance(entity, home) <= radius);
      expect(
        nearby('berries', 25).reduce((sum, node) => sum + node.amount, 0),
      ).toBeGreaterThanOrEqual(80);
      expect(nearby('tree', 60).reduce((sum, node) => sum + node.amount, 0)).toBeGreaterThanOrEqual(
        240,
      );
      expect(
        nearby('stone', 50).filter((node) => node.amount >= 100).length,
      ).toBeGreaterThanOrEqual(2);
      expect(nearby('ore', 65).some((node) => node.amount === 500)).toBe(true);
      expect(nearby('deer', 65).length).toBeGreaterThanOrEqual(6);
      expect(
        entities
          .filter((entity) => ['wolf', 'alpha', 'mammoth'].includes(entity.kind))
          .every((animal) => distance(animal, home) >= 109.99),
      ).toBe(true);
      expect(state.seed).toBe(seed);
    }
  }, 20_000);

  it('connects each actual settlement and places distinctive societies near suitable landscapes', () => {
    for (const seed of referenceSeeds.slice(0, 4)) {
      const state = createInitialState(seed, 'guided', 'random', 1000);
      // This checks the established terrestrial culture-placement policy;
      // physical coastal settlement coverage lives in coastGeneration.test.
      delete state.mapGeneration!.coastalRules;
      Object.assign(state, generateWorld(seed, state.factions, 1000, true));
      const before = JSON.stringify(state);
      for (const city of state.cities) {
        const route = planLandRoute(state, state.home, city);
        expect(route, `${city.name} must be reachable in seed ${seed}`).not.toBeNull();
        let previous = state.home;
        for (const point of route!) {
          expect(isLandSegment(state, previous, point)).toBe(true);
          previous = point;
        }
        expect(previous).toMatchObject({ x: city.x, y: city.y });
      }
      const forest = state.cities.find((city) => city.factionId === 'faction-forest')!;
      const stone = state.cities.find((city) => city.factionId === 'faction-stone')!;
      expect(state.sectors.find((sector) => sector.cityId === forest.id)?.biome).toBe('forest');
      expect(state.sectors.find((sector) => sector.cityId === stone.id)?.biome).toBe('mountain');
      const river = riverSegments(state.sectors);
      const distances = state.cities
        .map((city) => riverDistance(city, river))
        .sort((a, b) => a - b);
      const riverside = state.cities.find((city) => city.factionId === 'faction-river')!;
      expect(riverDistance(riverside, river)).toBeLessThanOrEqual(distances[4]);
      expect(JSON.stringify(state)).toBe(before);
    }
  }, 20_000);
});
