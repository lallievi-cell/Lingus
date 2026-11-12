import { describe, expect, it } from 'vitest';
import { BUILDING_SPECS, emptyInventory, INNATE_WORDS } from './content';
import { createGame, parseGame, serializeGame } from './engine';
import { cityPopulation, seasonalImperial } from './imperial';
import type { GameState, RegionalCultureId } from './types';

/** Prepared cohorts isolate finite worker time and inventories; they are not
 * a claim about an ordinary player's progression. */
function town(culture: RegionalCultureId, workers = 2) {
  const state = createGame();
  state.units = [];
  state.entities = [];
  state.cities = state.cities.slice(0, 1);
  state.factions = state.factions.slice(0, 1);
  const faction = state.factions[0],
    city = state.cities[0];
  faction.culture = culture;
  faction.words = [...INNATE_WORDS, 'O_01', 'O_02', 'O_03', 'V_04', 'V_05'];
  city.words = [...faction.words];
  city.cohorts = { workers, warriors: 0, sages: 0, slaves: 0 };
  city.resources = { ...emptyInventory(), cooked: 30 };
  city.housing = workers;
  return { state, faction, city };
}
function season(state: GameState) {
  state.time += 90;
  state.seasonIndex++;
  seasonalImperial(state);
}
function depot(state: GameState) {
  const city = state.cities[0];
  const building = {
    id: 'prepared-depot',
    kind: 'depot' as const,
    x: city.x,
    y: city.y,
    cityId: city.id,
    hp: BUILDING_SPECS.depot.maxHp,
    active: true,
    completed: true,
  };
  state.buildings.push(building);
  city.buildingIds.push(building.id);
}
function sources(state: GameState) {
  for (const kind of ['tree', 'stone'] as const)
    state.entities.push({
      id: `actual-${kind}`,
      kind,
      x: 45,
      y: 45,
      hp: 100,
      maxHp: 100,
      amount: 100,
      maxAmount: 100,
    });
}

describe('regional societies choose paid, finite work', () => {
  it('does not multiply a finite physical node through a productive workshop', () => {
    const { state, city } = town('forest', 8);
    depot(state);
    city.resources.coin = 100;
    city.resources.stone = 4;
    state.buildings.push({
      id: 'productive-workshop',
      kind: 'workshop',
      cityId: city.id,
      x: city.x,
      y: city.y,
      hp: BUILDING_SPECS.workshop.maxHp,
      active: true,
      completed: true,
    });
    city.buildingIds.push('productive-workshop');
    state.entities.push({
      id: 'last-log',
      kind: 'tree',
      x: 45,
      y: 45,
      hp: 100,
      maxHp: 100,
      amount: 1,
    });
    season(state);
    expect(
      state.buildings.find((building) => building.id === 'productive-workshop')?.lastEfficiency,
    ).toBe(1);
    expect(city.resources.wood).toBe(1);
    expect(state.entities[0].amount).toBe(0);
    expect(state.resources.wood).toBe(0);
  });
  it('allocates the same scarce wood to different infrastructure without granting resources', () => {
    const forest = town('forest'),
      clay = town('clay');
    for (const scene of [forest, clay]) {
      scene.faction.words.push('O_04', 'M_02', 'O_05');
      scene.city.words = [...scene.faction.words];
      scene.city.resources.wood = 11;
      season(scene.state);
      expect(scene.city.resources.wood).toBeCloseTo(0.45); // The ordinary 5% wood loss is paid too.
      expect(scene.state.resources.wood).toBe(0);
      const paid = scene.state.buildings.reduce(
        (sum, building) => sum + (BUILDING_SPECS[building.kind].cost.wood ?? 0),
        0,
      );
      expect(paid).toBe(10);
      expect(cityPopulation(scene.city)).toBe(2);
    }
    expect(forest.state.buildings.map((building) => building.kind)).toEqual(['storage']);
    expect(clay.state.buildings.map((building) => building.kind)).toEqual(['depot', 'campfire']);
  });

  it('changes material priority within the same worker budget and conserves physical nodes', () => {
    const forest = town('forest'),
      stone = town('stone');
    for (const scene of [forest, stone]) {
      depot(scene.state);
      sources(scene.state);
      Object.assign(scene.city.resources, { wood: 20, stone: 4 });
      season(scene.state);
      const remaining = scene.state.entities.reduce((sum, entity) => sum + entity.amount, 0);
      expect(remaining + scene.city.resources.wood + scene.city.resources.stone).toBe(223);
      expect(scene.city.resources.wood + scene.city.resources.stone).toBe(113);
    }
    expect(forest.city.resources.wood).toBeGreaterThan(stone.city.resources.wood);
    expect(stone.city.resources.stone).toBeGreaterThan(forest.city.resources.stone);
    expect(stone.state.seed).toBe(forest.state.seed);
  });

  it('requires an actual paid tool and depot before learning stewardship and worked territory', () => {
    const scene = town('highland', 8);
    scene.faction.words.push('S_05', 'M_01');
    scene.city.words = [...scene.faction.words];
    Object.assign(scene.city.resources, { wood: 20, stone: 10 });
    sources(scene.state);
    season(scene.state);
    expect(scene.city.resources.tool).toBe(0);
    expect(scene.faction.words).not.toContain('S_02');
    expect(scene.faction.words).not.toContain('M_04');
    expect(scene.faction.words).not.toContain('O_10');
    expect(scene.state.buildings.some((building) => building.kind === 'depot')).toBe(true);
    season(scene.state);
    expect(scene.city.resources.tool).toBeGreaterThan(0);
    expect(scene.faction.words).toContain('S_02');
    expect(scene.faction.words).toContain('M_04');
    expect(scene.faction.words).toContain('O_10');
    expect(scene.state.resources.tool).toBe(0);
    expect(parseGame(serializeGame(scene.state))).not.toBeNull();
  });
});
