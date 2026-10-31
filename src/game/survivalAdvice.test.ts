import { describe, expect, it } from 'vitest';
import { HOME, emptyInventory } from './content';
import { createGame, createReadyBuilding } from './engine';
import { getSurvivalAdvice } from './survivalAdvice';
import type { GameState, MapEntity } from './types';

function fixture() {
  const state = createGame(6842, 'guided');
  // Prepared 90-second scenes preserve the legacy Guided save rules.
  delete state.openingBalanceVersion;
  delete state.openingCouncilsCompleted;
  Object.assign(state, {
    started: true,
    time: 330,
    tier: 0,
    units: state.units.slice(0, 2),
    entities: [],
    buildings: [],
    cities: [],
    factions: [],
    sparks: [],
    words: Object.fromEntries(
      Object.entries(state.words).filter(([id]) => ['S_01', 'V_01', 'V_02', 'V_03'].includes(id)),
    ),
    resources: emptyInventory(),
    cohesion: 100,
  });
  for (const unit of state.units)
    Object.assign(unit, { ...HOME, age: 6, hp: 100, temp: 100, hunger: 0 });
  return state;
}
function source(state: GameState, extra: Partial<MapEntity> = {}) {
  const entity: MapEntity = {
    id: 'food',
    kind: 'ground',
    resource: 'food',
    ...HOME,
    hp: 1,
    maxHp: 1,
    amount: 5,
    ...extra,
  };
  state.entities.push(entity);
  return entity;
}
function remember(state: GameState, id: string, custodian = state.units[0]) {
  state.words[id] = { retention: 100, custodians: [custodian.id], uses: 0 };
}

describe('one factual survival priority', () => {
  it('chooses imminent cold over a less urgent meal and does not mutate or execute anything', () => {
    const state = fixture();
    state.units[0].temp = 10;
    state.units[0].hp = 20;
    state.units[1].hunger = 85;
    createReadyBuilding(state, 'campfire').x += 30;
    const before = structuredClone(state);
    const advice = getSurvivalAdvice(state)!;
    expect(advice).toMatchObject({
      action: 'recall',
      priority: 'danger',
      focus: { id: state.units[0].id },
    });
    expect(advice.text).toContain('nucleo caldo');
    expect(state).toEqual(before);
  });
  it('prioritizes starvation when it will kill before the slowly cooling person', () => {
    const state = fixture();
    createReadyBuilding(state, 'campfire');
    state.units[0].x += 15;
    state.units[0].temp = 40;
    state.units[1].hunger = 100;
    state.units[1].hp = 5;
    source(state);
    expect(getSurvivalAdvice(state)).toMatchObject({
      action: 'eat',
      priority: 'danger',
      focus: { id: state.units[1].id },
      phrase: ['S_01', 'V_02'],
      destination: { id: 'food' },
    });
  });
  it('does not interrupt a cold person who is already warming in a real Guided core', () => {
    const state = fixture();
    createReadyBuilding(state, 'campfire');
    state.units[0].temp = 10;
    expect(getSurvivalAdvice(state)).toBeNull();
  });
  it('does not promise warmth from an incomplete or foreign fire', () => {
    const state = fixture();
    state.units[0].temp = 10;
    createReadyBuilding(state, 'campfire').completed = false;
    createReadyBuilding(state, 'campfire').cityId = 'foreign';
    expect(getSurvivalAdvice(state)?.text).toContain('Serve un riparo attivo');
  });
  it('does not expose unobserved food or treat live animals and winter berries as meals', () => {
    const state = fixture();
    state.units[0].hunger = 100;
    source(state, { id: 'hidden', x: 450, y: 450 });
    source(state, { id: 'living', kind: 'deer', resource: undefined, hp: 100 });
    source(state, { id: 'winter-berries', kind: 'berries', resource: undefined });
    const advice = getSurvivalAdvice(state)!;
    expect(advice.action).toBe('eat');
    expect(advice.phrase).toBeUndefined();
    expect(advice.destination).toBeUndefined();
    expect(advice.text).toContain('Non ci sono scorte');
  });
  it('points to a visible actual carcass only after death and requires no unknown food word', () => {
    const state = fixture();
    state.units[0].hunger = 95;
    source(state, { id: 'carcass', kind: 'deer', hp: 0, resource: undefined });
    expect(getSurvivalAdvice(state)).toMatchObject({
      phrase: ['S_01', 'V_02'],
      destination: { type: 'entity', id: 'carcass' },
    });
  });
  it('can use delivered stocks only through a known three-slot food sentence', () => {
    const state = fixture();
    state.units[0].hunger = 95;
    state.resources.food = 5;
    expect(getSurvivalAdvice(state)?.phrase).toBeUndefined();
    remember(state, 'O_04');
    remember(state, 'O_01');
    state.tier = 1;
    expect(getSurvivalAdvice(state)).toMatchObject({ phrase: ['S_01', 'V_02', 'O_04'] });
    expect(getSurvivalAdvice(state)?.destination).toBeUndefined();
  });
  it('does not suggest meat or cooked meat to a sacred vegetarian', () => {
    const state = fixture();
    state.units[0].hunger = 95;
    state.resources.meat = 10;
    state.resources.cooked = 10;
    state.dogmas.push({
      id: 'vegetarian',
      targetId: 'O_04',
      vectorId: 'M_01',
      name: 'Vegetariani',
      description: '',
      weight: 1,
      age: 0,
    });
    source(state, { kind: 'deer', hp: 0, resource: undefined });
    const advice = getSurvivalAdvice(state)!;
    expect(advice.phrase).toBeUndefined();
    expect(advice.destination).toBeUndefined();
    source(state, { id: 'vegetables', resource: 'food' });
    expect(getSurvivalAdvice(state)?.destination?.id).toBe('vegetables');
  });
  it('offers an early lesson for an ageing unique custodian only when a real fire exists', () => {
    const state = fixture();
    state.units[0].age = 14;
    remember(state, 'O_03');
    expect(getSurvivalAdvice(state)).toBeNull();
    createReadyBuilding(state, 'campfire');
    expect(getSurvivalAdvice(state)).toMatchObject({
      action: 'teach',
      focus: { id: state.units[0].id },
    });
    expect(state.attention).toBe(0);
    expect(state.words.O_03.custodians).toHaveLength(1);
  });
  it('does not invent a custody warning when another living person knows the word', () => {
    const state = fixture();
    state.units[0].age = 14;
    remember(state, 'O_03');
    state.words.O_03.custodians.push(state.units[1].id);
    createReadyBuilding(state, 'campfire');
    expect(getSurvivalAdvice(state)).toBeNull();
  });
  it('offers an actually composable funeral only for visible nearby remains and low cohesion', () => {
    const state = fixture();
    state.tier = 2;
    state.cohesion = 20;
    for (const id of ['V_08', 'O_02', 'O_06', 'O_01', 'S_03', 'S_04']) remember(state, id);
    source(state, { kind: 'corpse', resource: undefined, hp: 0, x: 450, y: 450 });
    expect(getSurvivalAdvice(state)).toBeNull();
    state.entities[0].x = HOME.x;
    state.entities[0].y = HOME.y;
    expect(getSurvivalAdvice(state)).toMatchObject({
      action: 'funeral',
      phrase: ['S_01', 'V_08', 'O_02', 'O_06'],
    });
  });
  it('stays quiet before play, after its end and in the abstract urban population view', () => {
    for (const extra of [
      { started: false },
      { gameOver: true },
      { victory: 'imperial' },
      { urbanized: true },
    ]) {
      const state = fixture();
      Object.assign(state, extra);
      state.units[0].temp = 0;
      expect(getSurvivalAdvice(state)).toBeNull();
    }
  });
});
