import { describe, expect, it } from 'vitest';
import { emptyInventory } from './content';
import { createGame } from './engine';
import { dispatchForeignPolicy } from './foreignPolicy';

function settlementScene({
  agriculture = false,
  biomeRules = true,
  fertileSide = 'east',
}: {
  agriculture?: boolean;
  biomeRules?: boolean;
  fertileSide?: 'east' | 'west';
} = {}) {
  const state = createGame(42, 'classic', 'random', 1000);
  if (biomeRules) state.mapGeneration!.biomeRules = 1;
  else delete state.mapGeneration!.biomeRules;
  const faction = state.factions[0],
    city = state.cities[0];
  Object.assign(state, {
    started: true,
    paused: false,
    time: 720,
    tier: 4,
    urbanized: true,
    units: [],
    entities: [],
    buildings: [],
    home: { x: 850, y: 850 },
  });
  Object.assign(faction, { culture: 'forest', relation: 20, hostile: false });
  faction.words = ['V_08', 'O_10', ...(agriculture ? ['V_09'] : [])];
  Object.assign(city, {
    x: 450,
    y: 450,
    sectorX: 4,
    sectorY: 4,
    housing: 68,
    cohorts: { workers: 38, warriors: 2, sages: 2, slaves: 0 },
    resources: { ...emptyInventory(), food: 50, wood: 50, stone: 50 },
  });
  state.factions = [faction];
  state.cities = [city];
  // Neither candidate belongs to this culture's preferred forest/plain pair.
  // Equal resources leave physical travel and known farming as the decisions.
  state.sectors = state.sectors.map((sector) => ({
    ...sector,
    cityId: undefined,
    biome:
      sector.x === 9
        ? 'river'
        : sector.x === 4 && sector.y === 4
          ? 'plain'
          : sector.y === 4 && [3, 5].includes(sector.x)
            ? sector.x === (fertileSide === 'east' ? 5 : 3)
              ? 'wetland'
              : 'dryland'
            : 'mountain',
  }));
  return { state, city };
}

describe('regional settlement choices use functional biomes', () => {
  it('values fertile land only after agriculture is known and still pays real colonists and cargo', () => {
    const informed = settlementScene({ agriculture: true });
    const uninformed = settlementScene();
    const legacy = settlementScene({ agriculture: true, biomeRules: false });
    for (const scene of [informed, uninformed, legacy]) {
      const seed = scene.state.seed;
      dispatchForeignPolicy(scene.state);
      expect(scene.state.seed).toBe(seed);
      expect(scene.state.caravans).toHaveLength(1);
      expect(scene.state.caravans[0]).toMatchObject({
        kind: 'colonists',
        population: 30,
        resources: { food: 50, wood: 50, stone: 50 },
      });
      expect(scene.city.cohorts.workers).toBe(8);
      expect(scene.city.resources).toMatchObject({ food: 0, wood: 0, stone: 0 });
      expect(scene.state.cities).toHaveLength(1);
    }
    expect(informed.state.caravans[0].target).toMatchObject({ x: 550, y: 450 });
    expect(uninformed.state.caravans[0].target).toMatchObject({ x: 350, y: 450 });
    expect(legacy.state.caravans[0].target).toMatchObject({ x: 350, y: 450 });
  });

  it('prefers the easier equally distant journey while older worlds retain their previous choice', () => {
    const current = settlementScene({ fertileSide: 'west' });
    const legacy = settlementScene({ fertileSide: 'west', biomeRules: false });
    for (const { state } of [current, legacy]) dispatchForeignPolicy(state);
    expect(current.state.caravans[0].target).toMatchObject({ x: 550, y: 450 });
    expect(legacy.state.caravans[0].target).toMatchObject({ x: 350, y: 450 });
  });
});
