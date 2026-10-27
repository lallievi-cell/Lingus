import { describe, expect, it } from 'vitest';
import { HOME, WORD_ORDER, emptyInventory } from './content';
import {
  createGame,
  createReadyBuilding,
  issueCommand,
  parseGame,
  serializeGame,
  tick,
} from './engine';
import {
  campfireHeatAt,
  FIRE_HEAT,
  fireHeatAtDistance,
  thermalConditionsAt,
  unitPelts,
} from './thermal';
import { warmShelterDestination } from './shelterSeeking';
import type { GameState } from './types';

/** Local, explicitly prepared weather scenes; no resources/heat are credited by
 * the rescue itself. The actual simulation performs all movement and recovery. */
function winter(mode: 'guided' | 'classic' = 'guided', fire = true) {
  const state = createGame(6842, mode);
  Object.assign(state, {
    started: true,
    paused: false,
    tier: 3,
    time: 330,
    entities: [],
    cities: [],
    factions: [],
    buildings: [],
    units: state.units.slice(0, 2),
    resources: { ...emptyInventory(), cooked: 10, wood: 10 },
    sparks: [],
  });
  for (const unit of state.units)
    Object.assign(unit, {
      ...HOME,
      age: 6,
      hp: 100,
      hunger: 0,
      temp: 35,
      action: 'idle',
      progress: 0,
    });
  state.words = Object.fromEntries(
    WORD_ORDER.map((id) => [
      id,
      { retention: 100, custodians: state.units.map((unit) => unit.id), uses: 0 },
    ]),
  );
  if (fire) createReadyBuilding(state, 'campfire');
  return state;
}
function advance(state: GameState, seconds: number) {
  for (let step = 0; step < seconds * 4; step++) state = tick(state, 0.25);
  return state;
}

describe('shared physical heat model', () => {
  it('has a genuine Guided warm core, partial outer band and bounded range; Classic stays uniform', () => {
    const s = winter();
    expect(fireHeatAtDistance(s, 0)).toBe(FIRE_HEAT.guidedCoreHeat);
    expect(fireHeatAtDistance(s, 6)).toBe(5.5);
    expect(fireHeatAtDistance(s, 10.5)).toBe(4.25);
    expect(fireHeatAtDistance(s, 15)).toBe(3);
    expect(fireHeatAtDistance(s, 15.001)).toBe(0);
    s.playMode = 'classic';
    expect(fireHeatAtDistance(s, 0)).toBe(3);
    expect(fireHeatAtDistance(s, 15)).toBe(3);
    expect(fireHeatAtDistance(s, 16)).toBe(0);
  });
  it('uses only actual completed living active own fires, taking the best rather than stacking them', () => {
    const s = winter();
    createReadyBuilding(s, 'campfire');
    expect(campfireHeatAt(s, HOME)).toBe(5.5);
    s.buildings[0].active = false;
    s.buildings[1].completed = false;
    expect(campfireHeatAt(s, HOME)).toBe(0);
    s.buildings[1].completed = true;
    s.buildings[1].cityId = 'foreign';
    expect(campfireHeatAt(s, HOME)).toBe(0);
    s.buildings[1].cityId = undefined;
    s.buildings[1].hp = 0;
    expect(campfireHeatAt(s, HOME)).toBe(0);
  });
  it('predicts the same delta used by an actual simulation tick', () => {
    const s = winter();
    s.units[0].temp = 10;
    const expected = thermalConditionsAt(s, s.units[0]);
    expect(expected.delta).toBe(1);
    const after = tick(s, 0.25);
    expect(after.units[0].temp).toBeCloseTo(10 + expected.delta * 0.25);
    expect(after.buildings[0].active).toBe(true);
  });
  it('allocates existing pelts once per real person and respects vegetarian clothing rules', () => {
    const s = winter();
    s.resources.pelt = 1;
    expect(unitPelts(s, s.units[0])).toBe(1);
    expect(unitPelts(s, s.units[1])).toBe(0);
    s.dogmas.push({
      id: 'vegetarian',
      targetId: 'O_04',
      vectorId: 'M_01',
      name: 'Vegetariani',
      description: '',
      weight: 1,
      age: 0,
    });
    expect(unitPelts(s, s.units[0])).toBe(0);
  });
});

describe('early cold rescue and safe orders', () => {
  it('rescues from the outer band before damage, warms people physically and gives distinct core places', () => {
    let s = winter();
    for (const unit of s.units) unit.x = 264.5;
    s = advance(s, 12);
    for (const unit of s.units) {
      expect(Math.hypot(unit.x - 250, unit.y - 250)).toBeLessThanOrEqual(
        FIRE_HEAT.guidedCoreRadius,
      );
      expect(unit.hp).toBe(100);
      expect(unit.temp).toBeGreaterThan(35);
    }
    expect(Math.hypot(s.units[0].x - s.units[1].x, s.units[0].y - s.units[1].y)).toBeGreaterThan(
      0.5,
    );
    expect(s.stats.commands).toBe(0);
  });
  it('seeks the best partial core during a blizzard instead of rejecting all shelter', () => {
    let s = winter();
    s.disasters.blizzard = true;
    s.units[0].x = 264.5;
    const destination = warmShelterDestination(s, s.units[0], -10, 0)!;
    expect(destination).toBeDefined();
    expect(destination.delta).toBe(-0.5);
    expect(Math.hypot(destination.x - 250, destination.y - 250)).toBeLessThanOrEqual(6);
    s = advance(s, 10);
    expect(s.units[0].temp).toBeGreaterThan(20);
    expect(s.units[0].hp).toBe(100);
  });
  it.each(['guided', 'classic'] as const)(
    'honours an explicit safer retreat at critical temperature in %s',
    (mode) => {
      let s = winter(mode);
      s.units = s.units.slice(0, 1);
      s.units[0].x = 270;
      s.units[0].temp = 10;
      s = issueCommand(s, ['S_01', 'V_01'], { type: 'point', ...HOME }, undefined, {
        type: 'point',
        x: 270,
        y: 250,
      });
      expect(s.units[0].command).toEqual(['S_01', 'V_01']);
      const x = s.units[0].x;
      s = tick(s, 0.25);
      expect(s.units[0].x).toBeLessThan(x);
      expect(s.units[0].command).toEqual(['S_01', 'V_01']);
      s = advance(s, 10);
      expect(Math.hypot(s.units[0].x - 250, s.units[0].y - 250)).toBeLessThanOrEqual(6);
      expect(s.units[0].hp).toBeGreaterThan(70);
    },
  );
  it('does not exempt cooking from rescue merely because its command mentions Fuoco', () => {
    let s = winter();
    s.units = s.units.slice(0, 1);
    s.units[0].x = 264.5;
    s.resources.meat = 1;
    s = issueCommand(s, ['S_01', 'V_07', 'O_04', 'O_05']);
    expect(s.units[0].action).toBe('cooking');
    s = tick(s, 0.25);
    expect(s.units[0].action).toBe('resting');
    expect(s.units[0].command).toBeUndefined();
  });
  it('does not exempt a home watch from finding warmth while actual fire caretakers can work in the core', () => {
    let s = winter();
    s.units = s.units.slice(0, 1);
    s.units[0].x = 263;
    s = issueCommand(s, ['S_01', 'V_05', 'O_01']);
    s = tick(s, 0.25);
    expect(s.units[0].action).toBe('resting');
    let core = winter();
    core.units = core.units.slice(0, 1);
    core = issueCommand(core, ['S_01', 'V_05', 'O_05']);
    core = tick(core, 0.25);
    expect(core.units[0].action).toBe('guarding');
  });
  it('drops an interrupted real carried load only once and retains a suspended job', () => {
    let s = winter();
    const unit = s.units[0];
    unit.x = 264.5;
    unit.action = 'returning';
    unit.carry = { resource: 'wood', amount: 3 };
    unit.command = ['S_01', 'V_04', 'O_03'];
    const farm = createReadyBuilding(s, 'farm');
    farm.x = 280;
    unit.suspendedJob = { buildingId: farm.id, command: ['S_01', 'V_09', 'O_04', 'O_01'] };
    s = advance(s, 4);
    expect(s.units[0].carry).toBeUndefined();
    expect(
      s.entities
        .filter((entity) => entity.kind === 'ground' && entity.resource === 'wood')
        .reduce((n, entity) => n + entity.amount, 0),
    ).toBe(3);
    expect(s.units[0].suspendedJob?.buildingId).toBe(farm.id);
    expect(s.resources.wood).toBe(10);
    expect(parseGame(serializeGame(s))).not.toBeNull();
  });
  it('can return a hungry cold person to actual delivered food instead of blocking shelter seeking', () => {
    let s = winter();
    s.units[0].x = 264.5;
    s.units[0].hunger = 85;
    s = advance(s, 8);
    expect(s.units[0].hp).toBe(100);
    expect(s.units[0].hunger).toBeLessThan(60);
    expect(s.resources.cooked).toBeLessThan(10);
    expect(s.units[0].temp).toBeGreaterThan(30);
  });
  it('does not invent protection when every real source is absent or incomplete', () => {
    let s = winter('guided', false);
    s.disasters.blizzard = true;
    const fire = createReadyBuilding(s, 'campfire');
    fire.completed = false;
    expect(warmShelterDestination(s, s.units[0], -10, 0)).toBeUndefined();
    s = advance(s, 8);
    expect(s.units[0].temp).toBe(0);
    expect(s.units[0].hp).toBeLessThan(100);
  });
});
