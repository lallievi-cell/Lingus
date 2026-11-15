import { describe, expect, it } from 'vitest';
import { createInitialState } from './state';
import { createCoastGeometry, coastInlandDistance, isSeaPoint } from './coastGeometry';
import { isDryLandPoint, isLandSegment, planLandRoute } from './landNavigation';
import { riverSegments } from './worldGeneration';
import { farmYieldMultiplier, terrainBiomeAt, terrainTravelCost } from './biomes';

describe('seeded physical coasts', () => {
  it('leaves a complete world-bounded gathering catchment for the eight starting societies', () => {
    for (const seed of [1, 42, 6842]) {
      const state = createInitialState(seed, 'guided', 'random', 1000);
      for (const city of state.cities) {
        // Their physical food search has a 180 m limit. A town squeezed
        // against the outer edge must not lose half that finite catchment.
        expect(Math.min(city.x, city.y, 1000 - city.x, 1000 - city.y)).toBeGreaterThanOrEqual(180);
        expect(city.resources.food).toBe(20);
        expect(city.resources.wood).toBe(20);
        expect(city.resources.stone).toBe(10);
        expect(city.resources.fish).toBe(0);
      }
    }
  });

  it('opts in only new full regions and keeps the original seed independent of simulation draws', () => {
    for (const [mode, size] of [
      ['seed-zero', 500],
      ['random', 500],
      ['seed-zero', 1000],
    ] as const)
      expect(
        createInitialState(42, 'guided', mode, size).mapGeneration?.coastalRules,
      ).toBeUndefined();
    const state = createInitialState(42, 'guided', 'random', 1000);
    expect(state.mapGeneration?.coastalRules).toBe(1);
    const geometry = createCoastGeometry(state);
    state.seed = 999;
    expect(createCoastGeometry(state)).toBe(geometry);
    expect(state.sectors).toEqual(createInitialState(42, 'classic', 'random', 1000).sectors);
  });

  it('keeps cities, physical nodes and finite fishing workstations on dry accessible ground', () => {
    const seeds = [
      0,
      1,
      42,
      6842,
      4294967295,
      ...Array.from({ length: 95 }, (_, i) => Math.imul(i + 1, 2654435761) >>> 0),
    ];
    for (const seed of seeds) {
      const state = createInitialState(seed, 'guided', 'random', 1000);
      const coast = createCoastGeometry(state)!;
      expect(state.cities).toHaveLength(8);
      expect(riverSegments(state.sectors).length).toBeGreaterThanOrEqual(11);
      expect(state.sectors.some((sector) => sector.biome === 'sea')).toBe(true);
      expect(state.sectors.some((sector) => sector.biome === 'coast')).toBe(true);
      expect(isSeaPoint(state, state.home)).toBe(false);
      expect(state.entities.every((entity) => isDryLandPoint(state, entity))).toBe(true);
      const fisheries = state.entities.filter((entity) => entity.kind === 'fishery');
      expect(fisheries.length).toBeGreaterThanOrEqual(6);
      for (const fishery of fisheries) {
        expect(fishery.amount).toBeGreaterThanOrEqual(40);
        expect(fishery.amount).toBeLessThanOrEqual(60);
        expect(fishery.maxAmount).toBe(fishery.amount);
        expect(coastInlandDistance(coast, fishery)).toBeGreaterThanOrEqual(8);
        expect(coastInlandDistance(coast, fishery)).toBeLessThanOrEqual(14);
        const shoreDistance = Math.min(
          ...coast.points.slice(1).map((b, index) => {
            const a = coast.points[index],
              dx = b.x - a.x,
              dy = b.y - a.y;
            const t = Math.max(
              0,
              Math.min(1, ((fishery.x - a.x) * dx + (fishery.y - a.y) * dy) / (dx * dx + dy * dy)),
            );
            return Math.hypot(fishery.x - a.x - dx * t, fishery.y - a.y - dy * t);
          }),
        );
        expect(shoreDistance).toBeGreaterThanOrEqual(8);
        expect(shoreDistance).toBeLessThanOrEqual(12);
        expect(terrainBiomeAt(state, fishery)).toBe('coast');
        expect(farmYieldMultiplier(state, fishery)).toBe(0.75);
        expect(terrainTravelCost(state, fishery)).toBe(1.1);
      }
      for (const city of state.cities) {
        expect(isDryLandPoint(state, city)).toBe(true);
        expect(
          state.cities.every(
            (other) => other === city || Math.hypot(city.x - other.x, city.y - other.y) >= 180,
          ),
        ).toBe(true);
      }
      if (seed === 0 || seed === 1 || seed === 42)
        for (const destination of [...state.cities, ...fisheries]) {
          const route = planLandRoute(state, state.home, destination);
          expect(route, `seed ${seed} destination ${destination.id}`).not.toBeNull();
          let previous = state.home;
          for (const point of route!) {
            expect(isLandSegment(state, previous, point)).toBe(true);
            previous = point;
          }
        }
    }
  }, 30_000);
});
