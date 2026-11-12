import { describe, expect, it } from 'vitest';
import { emptyInventory } from './content';
import { createGame } from './engine';
import { updateImperial } from './imperial';
import { dispatchForeignPolicy, resolveForeignUltimatum } from './foreignPolicy';
import type { Faction, GameState, RegionalCultureId } from './types';

/** Prepared policy scenes isolate decisions and accounting, not ordinary growth. */
function expansionScene(culture: RegionalCultureId | 'legacy' = 'forest') {
  const state = createGame(42, 'classic', 'random', 1000);
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
  Object.assign(faction, {
    culture: culture === 'legacy' ? undefined : culture,
    relation: 20,
    hostile: false,
  });
  faction.words = [...new Set([...faction.words, 'V_08', 'O_10', 'O_07'])];
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
  for (const sector of state.sectors) {
    sector.biome = sector.x === 9 ? 'river' : 'plain';
    sector.explored = true;
    delete sector.cityId;
  }
  return { state, faction, city };
}

function addNode(
  state: GameState,
  kind: 'tree' | 'stone' | 'berries',
  x: number,
  y: number,
  amount: number,
) {
  state.entities.push({
    id: `node-${state.entities.length}`,
    kind,
    x,
    y,
    amount,
    hp: 100,
    maxHp: 100,
  });
}

function pressureScene() {
  const state = createGame(42, 'classic', 'random', 1000);
  Object.assign(state, { time: 720, tier: 3, started: true, paused: false });
  state.resources.food = 20;
  state.units = state.units.filter((unit) => unit.factionId === 'player');
  for (const faction of state.factions) Object.assign(faction, { relation: -70, hostile: true });
  for (const city of state.cities)
    Object.assign(city, {
      housing: 68,
      cohorts: { workers: 8, warriors: 3, sages: 2, slaves: 0 },
      resources: { ...emptyInventory(), food: 100 },
    });
  for (const sector of state.sectors) sector.explored = false;
  return state;
}

const revealCity = (state: GameState, faction: Faction) => {
  const city = state.cities.find((entry) => entry.id === faction.cityId)!;
  state.sectors.find((sector) => sector.x === city.sectorX && sector.y === city.sectorY)!.explored =
    true;
};

describe('regional culture choices preserve physical territory and supplies', () => {
  it('chooses a different viable province for woodland and stone cultures, then delivers real settlers', () => {
    const forest = expansionScene('forest'),
      stone = expansionScene('stone');
    for (const { state } of [forest, stone]) {
      state.sectors.find((sector) => sector.x === 3 && sector.y === 4)!.biome = 'forest';
      state.sectors.find((sector) => sector.x === 5 && sector.y === 4)!.biome = 'mountain';
      addNode(state, 'tree', 350, 450, 100);
      addNode(state, 'stone', 550, 450, 100);
      const seed = state.seed;
      dispatchForeignPolicy(state);
      expect(state.seed).toBe(seed);
      expect(state.caravans).toHaveLength(1);
      expect(state.caravans[0]).toMatchObject({
        kind: 'colonists',
        population: 30,
        resources: { food: 50, wood: 50, stone: 50 },
      });
      expect(state.cities[0].cohorts.workers).toBe(8);
      expect(state.cities[0].resources).toMatchObject({ food: 0, wood: 0, stone: 0 });
      expect(state.cities).toHaveLength(1);
    }
    expect(forest.state.caravans[0].target).toMatchObject({ x: 350, y: 450 });
    expect(stone.state.caravans[0].target).toMatchObject({ x: 550, y: 450 });
    const convoy = forest.state.caravans[0];
    for (let tick = 0; tick < 120 && !convoy.arrived; tick++) {
      forest.state.time += 0.25;
      updateImperial(forest.state, 0.25);
      expect(forest.city.resources.wood).toBe(0);
    }
    expect(convoy.arrived).toBe(true);
    expect(forest.state.cities).toHaveLength(2);
    expect(forest.state.cities[1]).toMatchObject({
      factionId: forest.faction.id,
      cohorts: { workers: 30 },
      resources: { food: 50, wood: 50, stone: 50 },
    });
    expect(convoy.population).toBe(0);
    expect(convoy.resources).toEqual(emptyInventory());
  });

  it('uses real local resources and avoids a hostile frontier when otherwise equivalent', () => {
    const { state, faction, city } = expansionScene();
    for (const x of [350, 550]) {
      addNode(state, 'tree', x, 450, 100);
      addNode(state, 'berries', x + 5, 450, 40);
    }
    const rival = {
      ...structuredClone(faction),
      id: 'faction-rival',
      cityId: 'rival-town',
      culture: 'highland' as const,
    };
    const rivalCity = {
      ...structuredClone(city),
      id: rival.cityId,
      factionId: rival.id,
      x: 250,
      y: 450,
      sectorX: 2,
      cohorts: { workers: 8, warriors: 0, sages: 0, slaves: 0 },
      resources: emptyInventory(),
    };
    state.factions.push(rival);
    state.cities.push(rivalCity);
    const [leftId, rightId] = [faction.id, rival.id].sort();
    state.foreignPolicy = {
      raids: [],
      ultimata: [],
      relations: [{ leftId, rightId, relation: -60, atWar: true }],
    };
    dispatchForeignPolicy(state);
    expect(state.caravans[0].target).toMatchObject({ x: 550, y: 450 });
    expect(state.entities.map((entity) => entity.amount)).toEqual([100, 40, 100, 40]);
  });

  it('does not withdraw people or supplies when the physical route cannot leave its origin', () => {
    const { state, city } = expansionScene();
    // A supplied imported town can stand in water; new planning must refuse to
    // dispatch a convoy from that physically invalid origin rather than strand it.
    for (const sector of state.sectors) sector.biome = sector.x === 4 ? 'river' : 'plain';
    const people = { ...city.cohorts },
      stock = { ...city.resources },
      seed = state.seed;
    dispatchForeignPolicy(state);
    expect(state.caravans).toEqual([]);
    expect(city.cohorts).toEqual(people);
    expect(city.resources).toEqual(stock);
    expect(state.seed).toBe(seed);
  });

  it('uses distinct expansion intervals while retaining the legacy interval without a profile', () => {
    const scenes = [expansionScene('trail'), expansionScene('dawn'), expansionScene('legacy')];
    for (const { state, faction } of scenes) {
      state.time = 1440;
      state.eventTimes[`expansion:${faction.id}`] = 720;
      dispatchForeignPolicy(state);
    }
    expect(scenes.map(({ state }) => state.caravans.length)).toEqual([1, 0, 1]);
  });
});

describe('eight societies do not turn into eight simultaneous player threats', () => {
  it('keeps grace and discovery gates, then spaces actual requests and caps paid outbound pressure', () => {
    let state = pressureScene();
    const seed = state.seed;
    state.time = 719;
    dispatchForeignPolicy(state);
    expect(state.foreignPolicy).toBeUndefined();
    state.time = 720;
    dispatchForeignPolicy(state);
    expect(state.foreignPolicy).toBeUndefined();
    expect(state.units.some((unit) => unit.action === 'raiding')).toBe(false);
    revealCity(state, state.factions[0]);
    state.time = 810;
    dispatchForeignPolicy(state);
    expect(state.foreignPolicy!.ultimata).toHaveLength(1);
    expect(state.foreignPolicy!.raids).toHaveLength(0);
    state = resolveForeignUltimatum(state, state.foreignPolicy!.ultimata[0].id, 'pay');
    for (const faction of state.factions) revealCity(state, faction);
    state.time = 900;
    dispatchForeignPolicy(state);
    expect(state.foreignPolicy!.ultimata).toHaveLength(2);
    expect(state.foreignPolicy!.raids).toHaveLength(0);
    state = resolveForeignUltimatum(state, state.foreignPolicy!.ultimata[1].id, 'pay');
    state.time = 990;
    dispatchForeignPolicy(state);
    expect(state.foreignPolicy!.ultimata).toHaveLength(2);
    expect(state.foreignPolicy!.raids).toHaveLength(0);
    expect(state.caravans).toHaveLength(2);
    expect(state.resources.food).toBe(4);
    expect(state.caravans.reduce((sum, caravan) => sum + caravan.resources.food, 0)).toBe(16);
    expect(state.cities.every((city) => city.cohorts.warriors === 3)).toBe(true);
    expect(state.seed).toBe(seed);
    expect(state.eventTimes.regionalPressureDeparture).toBe(900);
  });

  it('waits for the response, then mobilizes a real raid after refusal', () => {
    let state = pressureScene();
    state.factions = state.factions.slice(0, 1);
    state.cities = state.cities.slice(0, 1);
    revealCity(state, state.factions[0]);
    dispatchForeignPolicy(state);
    expect(state.foreignPolicy!.raids).toEqual([]);
    state = resolveForeignUltimatum(state, state.foreignPolicy!.ultimata[0].id, 'refuse');
    state.time = 810;
    dispatchForeignPolicy(state);
    const raid = state.foreignPolicy!.raids[0];
    expect(raid.memberIds).toHaveLength(3);
    expect(state.cities[0].cohorts.warriors).toBe(0);
    expect(state.cities[0].resources.food).toBe(97);
    expect(
      state.units
        .filter((unit) => raid.memberIds.includes(unit.id))
        .reduce((sum, unit) => sum + unit.hp, 0),
    ).toBe(200); // The three departing warriors retain the actual wounded garrison health.
  });

  it('reflects both cultures at a shared frontier without predetermining war', () => {
    const relations: number[] = [];
    for (const profiled of [true, false]) {
      const { state, faction, city } = expansionScene(profiled ? 'trail' : 'legacy');
      city.cohorts.workers = 8;
      city.resources = emptyInventory();
      faction.relation = 0;
      const rival = {
        ...structuredClone(faction),
        id: 'faction-neighbor',
        cityId: 'neighbor-town',
        culture: profiled ? ('highland' as const) : undefined,
      };
      state.factions.push(rival);
      state.cities.push({
        ...structuredClone(city),
        id: rival.cityId,
        factionId: rival.id,
        x: 550,
        sectorX: 5,
      });
      dispatchForeignPolicy(state);
      expect(state.foreignPolicy!.relations[0].atWar).toBe(false);
      expect(state.battalions).toEqual([]);
      relations.push(state.foreignPolicy!.relations[0].relation);
    }
    expect(relations).toEqual([-3.5, -5]);
  });
});
