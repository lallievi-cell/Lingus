import { describe, expect, it } from 'vitest';
import { createGame } from './engine';
import { emptyInventory, FAUNA_SPECS, WORD_ORDER } from './content';
import { resolveInteractionPosition } from './interactionPositions';
import { createBuilding, updateAnimals, updateUnits } from './simulation';
import { handleImperialCommand, updateImperial } from './imperial';
import { recordCaravanTravel } from './regionalHistory';
import { wanderDestination } from './wildlifeMovement';
import { getUnitWorkStatus } from './workDiagnostics';
import { isDryLandPoint } from './landNavigation';
import { sectorIndex } from './worldDimensions';
import type { Battalion, Caravan, MapEntity } from './types';

function region() {
  const state = createGame(42, 'classic', 'random', 1000);
  Object.assign(state, {
    started: true,
    paused: false,
    time: 20,
    tier: 2,
    entities: [],
    factions: [],
    buildings: [],
    sparks: [],
    resources: emptyInventory(),
  });
  state.units = state.units.slice(0, 1);
  Object.assign(state.units[0], {
    x: 700,
    y: 700,
    age: 6,
    hp: 100,
    temp: 100,
    hunger: 0,
  });
  return state;
}

describe('regional bounds preserve real places beyond the original valley', () => {
  it('keeps work slots and new structures near their actual anchors beyond500', () => {
    const state = region();
    const slot = resolveInteractionPosition(
      state,
      state.units[0],
      { x: 780, y: 760, id: 'far-tree' },
      { kind: 'tree' },
    );
    expect(slot.x).toBeGreaterThan(775);
    expect(slot.y).toBeGreaterThan(755);
    const border = resolveInteractionPosition(
      state,
      state.units[0],
      { x: 1000, y: 1000, id: 'edge' },
      { kind: 'return' },
    );
    expect(border.x).toBeLessThanOrEqual(1000);
    expect(border.y).toBeLessThanOrEqual(1000);
    expect(border.x).toBeGreaterThan(990);
    expect(border.y).toBeGreaterThan(990);
    expect(createBuilding(state, 'hut', 780, 760)).toMatchObject({ x: 780, y: 760 });
    expect(createBuilding(state, 'hut', 1200, 1200)).toMatchObject({ x: 1000, y: 1000 });

    const old = createGame();
    expect(createBuilding(old, 'hut', 780, 760)).toMatchObject({ x: 500, y: 500 });
    const oldSlot = resolveInteractionPosition(old, old.units[0], { x: 1000, y: 1000 });
    expect(oldSlot.x).toBeLessThanOrEqual(500);
    expect(oldSlot.y).toBeLessThanOrEqual(500);
  });

  it('moves a person into the correct newly explored sector and names a known remote resource', () => {
    const state = region();
    state.units[0].x = 699.5;
    Object.assign(state.units[0], {
      action: 'moving',
      command: ['S_02', 'V_01'],
      tx: 710,
      ty: 700,
    });
    state.sectors.forEach((sector) => {
      sector.explored = false;
    });
    updateUnits(state, 0.25);
    expect(state.units[0].x).toBeGreaterThan(700);
    expect(state.sectors.find((sector) => sector.x === 7 && sector.y === 7)?.explored).toBe(true);
    expect(state.sectors.find((sector) => sector.x === 4 && sector.y === 4)?.explored).toBe(false);
    state.entities = [
      { id: 'far-tree', kind: 'tree', x: 740, y: 740, amount: 10, hp: 100, maxHp: 100 },
    ];
    state.words.O_03 = { retention: 100, custodians: [state.units[0].id], uses: 0 };
    Object.assign(state.units[0], {
      action: 'gathering',
      command: ['S_02', 'V_04', 'O_03'],
      targetId: 'far-tree',
    });
    expect(getUnitWorkStatus(state, state.units[0]).title).toBe('Va a raccogliere legno');
  });

  it('lets distant wildlife wander and flee inside its real habitat instead of snapping to500', () => {
    const state = region();
    const animal: MapEntity = {
      id: 'regional-deer',
      kind: 'deer',
      x: 770,
      y: 750,
      originX: 770,
      originY: 750,
      amount: 2,
      hp: 30,
      maxHp: 30,
    };
    const goal = wanderDestination(animal, 20, state);
    expect(goal.x).toBeGreaterThan(767);
    expect(goal.y).toBeGreaterThan(747);
    expect(wanderDestination(animal, 20).x).toBe(500);
    state.entities = [animal];
    Object.assign(state.units[0], { x: 760, y: 750 });
    const previous = { x: animal.x, y: animal.y };
    updateAnimals(state, 0.25);
    expect(animal.x).toBeGreaterThan(previous.x);
    expect(animal.x).toBeLessThan(798);
    expect(animal.y).toBe(750);
    expect(Math.hypot(animal.x - previous.x, animal.y - previous.y)).toBeLessThanOrEqual(
      FAUNA_SPECS.deer.speed * 0.25 + 1e-8,
    );
  });

  it('records actual remote traffic with separate regional cells and conserves distance', () => {
    const state = region();
    const convoy: Caravan = {
      id: 'remote-traffic',
      kind: 'tax',
      x: 780,
      y: 750,
      fromCityId: 'source',
      factionId: 'player',
      hp: 100,
      resources: emptyInventory(),
      population: 0,
      target: { type: 'point', x: 800, y: 750 },
    };
    recordCaravanTravel(state, convoy, { x: 740, y: 750 });
    const roads = state.regionalRoutes!;
    expect(roads.length).toBeGreaterThan(0);
    expect(roads.reduce((sum, road) => sum + road.travelled, 0)).toBeCloseTo(40);
    expect(roads.every((road) => road.from.x >= 740 && road.to.x <= 780)).toBe(true);
    expect(roads.every((road) => Number(road.key.split(':')[2]) > 39)).toBe(true);
    expect(new Set(roads.map((road) => road.key.split(':')[2])).size).toBeGreaterThan(1);
  });

  it('moves armies and real tax cargo beyond500 without crediting the treasury early', () => {
    const state = region();
    state.units = [];
    state.urbanized = true;
    state.tier = 4;
    for (const id of WORD_ORDER) state.words[id] = { retention: 100, custodians: [], uses: 0 };
    delete state.words.O_13;
    const start = { x: 710, y: 710 },
      end = { x: 740, y: 730 };
    const destination = {
      ...state.cities[0],
      ...end,
      sectorX: 7,
      sectorY: 7,
      id: 'remote-capital',
      factionId: 'player',
      capital: true,
      resources: state.resources,
    };
    state.cities = [destination];
    const convoy: Caravan = {
      id: 'remote-tax',
      kind: 'tax',
      ...start,
      fromCityId: 'source',
      toCityId: destination.id,
      factionId: 'player',
      resources: { ...emptyInventory(), wood: 3 },
      population: 0,
      target: { type: 'city', id: destination.id, ...end },
      hp: 100,
    };
    const army: Battalion = {
      id: 'remote-army',
      name: 'Regional army',
      ...start,
      tx: end.x,
      ty: end.y,
      cityId: 'source',
      factionId: 'player',
      hp: 1000,
      maxHp: 1000,
      morale: 1,
      action: 'moving',
      catapult: false,
      occupation: 0,
    };
    state.caravans = [convoy];
    state.battalions = [army];
    for (let step = 0; step < 80 && !convoy.arrived; step++) {
      expect(state.resources.wood).toBe(0);
      const previous = { x: convoy.x, y: convoy.y };
      state.time += 0.25;
      updateImperial(state, 0.25);
      expect(convoy.x).toBeGreaterThan(500);
      expect(army.x).toBeGreaterThan(500);
      expect(Math.hypot(convoy.x - previous.x, convoy.y - previous.y)).toBeLessThanOrEqual(
        1 + 1e-8,
      );
    }
    expect(convoy.arrived).toBe(true);
    expect(army.action).toBe('idle');
    expect(army.x).toBe(end.x);
    expect(army.y).toBe(end.y);
    expect(state.resources.wood).toBe(3);
  });

  it('keeps edge colonies inside the last regional sector and refuses points outside the world', () => {
    const state = region();
    state.units = [];
    state.urbanized = true;
    state.tier = 4;
    for (const id of WORD_ORDER) state.words[id] = { retention: 100, custodians: [], uses: 0 };
    Object.assign(state.resources, { food: 200, wood: 200, stone: 200 });
    const capital = {
      ...state.cities[0],
      x: 700,
      y: 700,
      sectorX: 7,
      sectorY: 7,
      id: 'regional-capital',
      factionId: 'player',
      capital: true,
      cohorts: { workers: 50, warriors: 0, sages: 0, slaves: 0 },
      resources: state.resources,
    };
    state.cities = [capital];
    const tokens = ['S_09', 'V_08', 'O_01', 'O_10'];
    const budget = { ...state.resources };
    expect(handleImperialCommand(state, tokens, { type: 'point', x: 1001, y: 800 }).valid).toBe(
      false,
    );
    expect(state.resources).toEqual(budget);
    expect(capital.cohorts.workers).toBe(50);
    expect(state.caravans).toEqual([]);
    const point = [
      { x: 1000, y: 50 },
      { x: 1000, y: 950 },
      { x: 50, y: 1000 },
      { x: 950, y: 1000 },
    ].find((point) =>
      isDryLandPoint(state, {
        x: sectorIndex(state, point.x) * 100 + 50,
        y: sectorIndex(state, point.y) * 100 + 50,
      }),
    )!;
    expect(point).toBeDefined();
    expect(handleImperialCommand(state, tokens, { type: 'point', ...point }).valid).toBe(true);
    expect(state.caravans).toHaveLength(1);
    expect(state.caravans[0].target).toMatchObject({
      x: sectorIndex(state, point.x) * 100 + 50,
      y: sectorIndex(state, point.y) * 100 + 50,
    });
    expect(capital.cohorts.workers).toBe(20);
  });
});
