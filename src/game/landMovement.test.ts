import { describe, expect, it } from 'vitest';
import { emptyInventory, FAUNA_SPECS, WORD_ORDER } from './content';
import { createGame } from './engine';
import { handleImperialCommand, updateImperial } from './imperial';
import { getRiverFords, isInRiverFord, isLandPoint, planLandRoute } from './landNavigation';
import { resolveInteractionPosition } from './interactionPositions';
import { updateAnimals, updateUnits } from './simulation';
import type { Battalion, Caravan, GameState, MapEntity } from './types';

type Point = { x: number; y: number };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Prepared crossing on the real generated-world rules; only the river course
 * is simplified so every actor must make an observable detour to a ford. */
function fixture() {
  const state = createGame(6842, 'classic', 'random');
  state.mapGeneration!.landNavigation = 1;
  Object.assign(state, {
    started: true,
    paused: false,
    time: 10,
    tier: 3,
    factions: [],
    entities: [],
    buildings: [],
    sparks: [],
    resources: emptyInventory(),
  });
  state.sectors.forEach((sector) => {
    sector.biome = sector.x === 2 ? 'river' : 'plain';
    sector.explored = true;
  });
  for (const id of WORD_ORDER) state.words[id] = { retention: 100, custodians: [], uses: 0 };
  const fords = getRiverFords(state);
  const y = [280, 220, 330, 170, 380, 120].find((candidate) =>
    fords.every((ford) => Math.abs(ford.y - candidate) > 15),
  )!;
  expect(Number.isFinite(y)).toBe(true);
  const start = { x: 224, y };
  const end = { x: 276, y };
  state.home = { ...start };
  state.units = state.units.slice(0, 1);
  Object.assign(state.units[0], {
    ...end,
    hp: 100,
    age: 6,
    hunger: 0,
    temp: 100,
    knows: [...WORD_ORDER],
    action: 'idle',
  });
  return { state, start, end };
}

function assertLandStep(state: GameState, previous: Point, next: Point, budget: number) {
  const travelled = distance(previous, next);
  expect(travelled).toBeLessThanOrEqual(budget + 1e-8);
  // Check between observations too, so even a short frame cannot cut water.
  const intervals = Math.max(1, Math.ceil(travelled / 0.25));
  for (let index = 0; index <= intervals; index++) {
    const point = {
      x: previous.x + ((next.x - previous.x) * index) / intervals,
      y: previous.y + ((next.y - previous.y) * index) / intervals,
    };
    expect(
      isLandPoint(state, point),
      JSON.stringify({ previous, next: { x: next.x, y: next.y }, point }),
    ).toBe(true);
    if (Math.abs(point.x - 250) < 5.9)
      expect(getRiverFords(state).some((ford) => isInRiverFord(point, ford))).toBe(true);
  }
}

describe('real actors use terrestrial routes', () => {
  it('rejects an impassable snapped colony site before removing workers or supplies', () => {
    const { state, start } = fixture();
    state.urbanized = true;
    state.resources = { ...emptyInventory(), food: 100, wood: 100, stone: 100 };
    const source = {
      ...state.cities[0],
      x: 150,
      y: start.y,
      sectorX: 1,
      sectorY: Math.floor(start.y / 100),
      id: 'capital',
      factionId: 'player',
      capital: true,
      resources: state.resources,
      cohorts: { workers: 50, warriors: 0, sages: 0, slaves: 0 },
    };
    state.cities = [source];
    const target = [150, 250, 350]
      .map((y) => ({ type: 'point' as const, x: 224, y }))
      .find((point) => !isLandPoint(state, { x: 250, y: point.y }))!;
    expect(isLandPoint(state, target)).toBe(true);
    const inventory = structuredClone(state.resources);
    const result = handleImperialCommand(state, ['S_01', 'V_08', 'O_01', 'O_10'], target);
    expect(result).toMatchObject({ handled: true, valid: false });
    expect(result.message).toContain('raggiungibile via terra');
    expect(source.cohorts.workers).toBe(50);
    expect(state.resources).toEqual(inventory);
    expect(state.caravans).toHaveLength(0);
  });

  it('delivers a carried load only after the person physically returns through a ford', () => {
    const { state } = fixture();
    const unit = state.units[0];
    Object.assign(unit, {
      action: 'returning',
      carry: { resource: 'wood', amount: 3 },
      command: ['S_02', 'V_04', 'O_03'],
    });
    state.cities = [];
    let crossed = false;
    for (let tick = 0; tick < 240 && unit.carry; tick++) {
      expect(state.resources.wood).toBe(0);
      const previous = { x: unit.x, y: unit.y };
      state.time += 0.25;
      updateUnits(state, 0.25);
      assertLandStep(state, previous, unit, 1);
      crossed ||= Math.abs(unit.x - 250) < 5.9;
    }
    expect(crossed).toBe(true);
    expect(unit.carry).toBeUndefined();
    expect(state.resources.wood).toBe(3);
    expect(distance(unit, state.home)).toBeLessThan(7);
  });

  it('routes an army and a fiscal convoy while keeping the cargo uncredited until arrival', () => {
    const { state, start, end } = fixture();
    state.units = [];
    delete state.words.O_13;
    const destination = {
      ...state.cities[0],
      ...end,
      id: 'destination',
      factionId: 'player',
      capital: true,
      resources: state.resources,
    };
    state.cities = [destination];
    const convoy: Caravan = {
      id: 'ford-tax',
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
      id: 'ford-army',
      name: 'Travelling army',
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
    let crossed = false;
    for (let tick = 0; tick < 240 && !convoy.arrived; tick++) {
      expect(state.resources.wood).toBe(0);
      const beforeConvoy = { x: convoy.x, y: convoy.y };
      const beforeArmy = { x: army.x, y: army.y };
      state.time += 0.25;
      updateImperial(state, 0.25);
      assertLandStep(state, beforeConvoy, convoy, 1);
      assertLandStep(state, beforeArmy, army, 1);
      crossed ||= Math.abs(convoy.x - 250) < 5.9;
    }
    expect(crossed).toBe(true);
    expect(convoy.arrived).toBe(true);
    expect(army.action).toBe('idle');
    expect(distance(army, end)).toBeLessThan(0.001);
    expect(state.resources.wood).toBe(3);
  });

  it('records each real convoy leg rather than a chord across water during a large update', () => {
    const { state, start, end } = fixture();
    state.units = [];
    state.cities = [];
    state.caravans = [
      {
        id: 'ford-history',
        kind: 'tax',
        ...start,
        fromCityId: 'source',
        factionId: 'player',
        resources: emptyInventory(),
        population: 0,
        target: { type: 'point', ...end },
        hp: 100,
      },
    ];
    const route = planLandRoute(state, start, end)!;
    let expectedTravel = 0;
    let previous = start;
    for (const point of route) {
      expectedTravel += distance(previous, point);
      previous = point;
    }
    expect(expectedTravel).toBeGreaterThan(distance(start, end) + 10);
    updateImperial(state, 100);
    expect(state.caravans[0].arrived).toBe(true);
    const history = state.regionalRoutes ?? [];
    expect(history.reduce((sum, segment) => sum + segment.travelled, 0)).toBeCloseTo(
      expectedTravel,
      5,
    );
    for (const segment of history) assertLandStep(state, segment.from, segment.to, 1000);
  });

  it('finishes a valid shore order when the usual group slot falls in water', () => {
    const { state, start } = fixture();
    state.cities = [];
    const unit = state.units[0];
    const destination = Array.from({ length: 40 }, (_, index) => ({
      x: 243.7,
      y: start.y + index * 0.1,
    })).find((anchor) => {
      const place = resolveInteractionPosition(state, unit, anchor, {
        kind: 'move',
        key: `move:${anchor.x.toFixed(3)}:${anchor.y.toFixed(3)}`,
      });
      return isLandPoint(state, anchor) && !isLandPoint(state, place);
    })!;
    expect(destination).toBeDefined();
    Object.assign(unit, {
      x: destination.x - 10,
      y: destination.y,
      tx: destination.x,
      ty: destination.y,
      action: 'moving',
      command: ['S_01', 'V_01'],
    });
    for (let tick = 0; tick < 80 && unit.action === 'moving'; tick++) {
      const previous = { x: unit.x, y: unit.y };
      state.time += 0.25;
      updateUnits(state, 0.25);
      assertLandStep(state, previous, unit, 1);
    }
    expect(unit.action).toBe('idle');
    expect(distance(unit, destination)).toBeLessThan(0.001);
  });

  it.each(['alpha', 'deer'] as const)(
    'keeps %s behaviour local when a nearby human is across deep water',
    (kind) => {
      const { state, start } = fixture();
      const human = state.units[0];
      Object.assign(human, { x: 257, y: start.y });
      const animal: MapEntity = {
        id: 'river-animal',
        kind,
        x: 243,
        y: start.y,
        originX: 243,
        originY: start.y,
        amount: 3,
        hp: 100,
        maxHp: 100,
      };
      state.entities = [animal];
      for (let tick = 0; tick < 80; tick++) {
        const previous = { x: animal.x, y: animal.y };
        state.time += 0.25;
        updateAnimals(state, 0.25);
        assertLandStep(state, previous, animal, FAUNA_SPECS[kind].speed * 0.25);
        expect(distance(animal, { x: 243, y: start.y })).toBeLessThanOrEqual(3);
      }
      expect(human.hp).toBe(100);
    },
  );

  it('lets a predator pursue through a nearby ford at its real speed and only wound in range', () => {
    const { state } = fixture();
    const ford = getRiverFords(state).find((entry) => entry.y > 100 && entry.y < 400)!;
    const human = state.units[0];
    Object.assign(human, { x: 258, y: ford.y });
    const animal: MapEntity = {
      id: 'ford-alpha',
      kind: 'alpha',
      x: 242,
      y: ford.y,
      originX: 242,
      originY: ford.y,
      amount: 3,
      hp: 100,
      maxHp: 100,
    };
    state.entities = [animal];
    let crossed = false;
    for (let tick = 0; tick < 80 && human.hp === 100; tick++) {
      const previous = { x: animal.x, y: animal.y };
      state.time += 0.25;
      updateAnimals(state, 0.25);
      assertLandStep(state, previous, animal, FAUNA_SPECS.alpha.speed * 0.25);
      if (human.hp < 100) expect(distance(animal, human)).toBeLessThanOrEqual(1.5);
      crossed ||= Math.abs(animal.x - 250) < 5.9;
    }
    expect(crossed).toBe(true);
    expect(human.hp).toBeLessThan(100);
  });
});
