import { describe, expect, it } from 'vitest';
import { createCoastGeometry, isSeaPoint } from './coastGeometry';
import { isDryLandPoint } from './landNavigation';
import { emptyInventory } from './content';
import { createGame, issueCommand, parseGame, serializeGame } from './engine';
import { chooseCookingInput, refundPaidCooking } from './fishing';
import { resolveInteractionPosition } from './interactionPositions';
import { consume, createBuilding, killUnit, processWork, updateUnits } from './simulation';
import type { GameState, MapEntity, Unit } from './types';

const FISH = ['S_01', 'V_04', 'O_04'];
const COOK = ['S_01', 'V_07', 'O_04', 'O_05'];

/** Prepared coastal stock/work scenes; these are conservation checks, not a
 * claim that a campaign has reached the coast and learned all these words. */
function village(mode: 'classic' | 'guided' = 'classic', count = 1) {
  const state = createGame(123, mode, 'random', 1000);
  state.started = true;
  state.paused = false;
  state.tier = 2;
  state.resources = emptyInventory();
  state.entities = [];
  state.buildings = [];
  state.units = state.units.slice(0, count);
  delete state.openingBalanceVersion;
  delete state.openingCouncilsCompleted;
  for (const unit of state.units)
    Object.assign(unit, { ...state.home, age: 8, hunger: 0, temp: 100, hp: 100, action: 'idle' });
  for (const id of [
    'S_02',
    'V_01',
    'V_02',
    'V_03',
    'V_04',
    'V_05',
    'V_07',
    'V_10',
    'O_04',
    'O_05',
    'O_01',
    'C_02',
  ]) {
    state.words[id] = { retention: 100, uses: 0, custodians: state.units.map((unit) => unit.id) };
    for (const unit of state.units) if (!unit.knows.includes(id)) unit.knows.push(id);
  }
  return state;
}
function node(state: GameState, amount = 45): MapEntity {
  const source: MapEntity = {
    id: 'shore-fishery',
    kind: 'fishery',
    ...state.home,
    amount,
    maxAmount: amount,
    hp: 0,
    maxHp: 1,
  };
  state.entities.push(source);
  return source;
}
function target(entity: MapEntity) {
  return { type: 'entity' as const, id: entity.id, x: entity.x, y: entity.y };
}
function ground(state: GameState, resource: 'fish' | 'meat', amount = 2, x = state.home.x) {
  const entity: MapEntity = {
    id: `pile-${resource}`,
    kind: 'ground',
    x,
    y: state.home.y,
    resource,
    amount,
    maxAmount: amount,
    hp: 0,
    maxHp: 1,
  };
  state.entities.push(entity);
  return entity;
}
function work(state: GameState, unit: Unit, seconds: number) {
  for (let remaining = seconds; remaining > 1e-8; remaining -= 0.25) {
    state.time += 0.25;
    processWork(state, unit, 0.25);
  }
}
function preparedCook(mode: 'classic' | 'guided' = 'classic') {
  let state = village(mode);
  createBuilding(state, 'campfire', state.home.x, state.home.y);
  state.resources.fish = 3;
  state = issueCommand(state, COOK);
  return state;
}
function rawPiles(state: GameState) {
  return state.entities
    .filter((entity) => entity.kind === 'ground' && entity.resource === 'fish')
    .reduce((sum, entity) => sum + entity.amount, 0);
}

describe('finite shore fishing', () => {
  it.each([1, 3, 5])(
    'spends six real work seconds for a capacity-%i load and credits only delivery',
    (capacity) => {
      let state = village();
      if (capacity === 1) delete state.words.V_05;
      if (capacity === 5)
        state.words.O_13 = { retention: 100, uses: 0, custodians: [state.units[0].id] };
      const source = node(state);
      state = issueCommand(state, FISH, target(source));
      const unit = state.units[0];
      const realSource = state.entities[0];
      Object.assign(
        unit,
        resolveInteractionPosition(state, unit, realSource, {
          kind: 'forage',
          key: `forage:${realSource.id}`,
          maxRadius: 2,
        }),
      );
      work(state, unit, 5.75);
      expect(realSource.amount).toBe(45);
      expect(unit.carry).toBeUndefined();
      work(state, unit, 0.25);
      expect(realSource.amount).toBe(45 - capacity);
      expect(unit.carry).toEqual({ resource: 'fish', amount: capacity });
      expect(state.resources.fish).toBe(0);
      expect(state.resources.pelt).toBe(0);
      expect(state.resources.seed).toBe(0);
      work(state, unit, 6);
      expect(state.resources.fish).toBe(capacity);
      expect(unit.carry).toBeUndefined();
    },
  );

  it('caps a final load at its real reserve and does not work while travelling', () => {
    let state = village();
    const source = node(state, 2);
    source.x += 25;
    state = issueCommand(state, FISH, target(source));
    work(state, state.units[0], 2);
    expect(state.entities[0].amount).toBe(2);
    expect(state.units[0].progress).toBe(0);
    for (let steps = 0; steps < 120 && !state.units[0].carry; steps++)
      work(state, state.units[0], 0.25);
    expect(state.entities[0].amount).toBe(0);
    expect(state.units[0].carry).toEqual({ resource: 'fish', amount: 2 });
    expect(state.resources.fish).toBe(0);
    for (let steps = 0; steps < 120 && state.units[0].carry; steps++)
      work(state, state.units[0], 0.25);
    expect(state.resources.fish).toBe(2);
  });

  it.each([
    ['V_02', 'Mangiare'],
    ['V_03', 'Colpire'],
    ['V_10', 'Allevare'],
  ])('rejects %s on a live fishing bank even with Preda', (verb) => {
    const state = village();
    const source = node(state);
    const after = issueCommand(state, ['S_01', verb, 'O_04'], target(source));
    expect(after.stats.commands).toBe(0);
    expect(after.voice).toBe(state.voice);
    expect(after.entities[0].amount).toBe(45);
    state.units[0].hunger = 80;
    expect(consume(state, state.units[0], source)).toBe(false);
    expect(source.amount).toBe(45);
  });

  it.each([
    ['fish', 40],
    ['cookedFish', 60],
  ] as const)('eats captured %s using its own nutrition', (resource, nutrition) => {
    const state = village();
    state.seed = 0;
    state.resources[resource] = 1;
    state.units[0].hunger = 80;
    expect(consume(state, state.units[0])).toBe(true);
    expect(state.units[0].hunger).toBe(80 - nutrition);
    expect(state.resources[resource]).toBe(0);
  });

  it('does not activate fishing or fish cooking in older worlds', () => {
    const state = village();
    delete state.mapGeneration!.coastalRules;
    const source = node(state);
    expect(issueCommand(state, FISH, target(source)).stats.commands).toBe(0);
    createBuilding(state, 'campfire', state.home.x, state.home.y);
    state.resources.fish = 5;
    expect(issueCommand(state, COOK).stats.commands).toBe(0);
  });
});

describe('paid fish cooking', () => {
  it.each(['new-order', 'fire-out'] as const)(
    'preserves the previous meat inventory transition in a legacy world on %s',
    (cause) => {
      let state = village();
      delete state.mapGeneration!.coastalRules;
      createBuilding(state, 'campfire', state.home.x, state.home.y);
      state.resources.meat = 2;
      state = issueCommand(state, COOK);
      expect(state.resources.meat).toBe(1);
      work(state, state.units[0], 2);
      if (cause === 'new-order') state = issueCommand(state, ['S_01', 'V_01', 'O_01']);
      else {
        state.buildings[0].active = false;
        work(state, state.units[0], 0.25);
      }
      expect(state.resources.meat).toBe(1);
      expect(state.resources.cooked).toBe(0);
      expect(
        state.entities
          .filter((entity) => entity.kind === 'ground' && entity.resource === 'meat')
          .reduce((sum, entity) => sum + entity.amount, 0),
      ).toBe(cause === 'fire-out' ? 1 : 0);
    },
  );

  it.each(['cooking', 'returning'] as const)(
    "preserves a visitor's physical fish on a fatal raw meal while %s",
    (activity) => {
      let state = village();
      const visitorId = state.units[0].id;
      state.units[0].factionId = state.factions[0].id;
      state.words.S_05 = { retention: 100, custodians: [visitorId], uses: 0 };
      state.units[0].knows.push('S_05');
      if (activity === 'cooking') {
        createBuilding(state, 'campfire', state.home.x, state.home.y);
        state.resources.fish = 2;
        state = issueCommand(state, ['S_05', ...COOK.slice(1)]);
        expect(state.units[0].cookInput).toBe('fish');
        expect(state.resources.fish).toBe(1);
      } else {
        const source = node(state, 3);
        state.resources.fish = 1;
        state = issueCommand(state, ['S_05', ...FISH.slice(1)], target(source));
        const actualSource = state.entities.find((entity) => entity.id === source.id)!;
        Object.assign(
          state.units[0],
          resolveInteractionPosition(state, state.units[0], actualSource, {
            kind: 'forage',
            key: `forage:${source.id}`,
            maxRadius: 2,
          }),
        );
        work(state, state.units[0], 6);
        expect(actualSource.amount).toBe(0);
        expect(state.units[0].carry).toEqual({ resource: 'fish', amount: 3 });
      }
      expect(state.stats.commands).toBe(1);
      const visitor = state.units[0];
      Object.assign(visitor, { ...state.home, hp: 10, hunger: 70 });
      // Its next genuine draw triggers the ordinary ten-percent raw-food risk.
      state.seed = 1972;
      expect(consume(state, visitor)).toBe(true);
      expect(visitor).toMatchObject({ hp: 0, action: 'dead' });
      expect(visitor.carry).toBeUndefined();
      expect(visitor.cookInput).toBeUndefined();
      expect(state.resources.fish).toBe(0);
      expect(rawPiles(state)).toBe(activity === 'cooking' ? 1 : 3);
      expect(state.resources.cooked).toBe(0);
      expect(state.resources.cookedFish).toBe(0);
      expect(refundPaidCooking(state, visitor)).toBe(false);
      expect(rawPiles(state)).toBe(activity === 'cooking' ? 1 : 3);
    },
  );

  it('prefers ordinary meat, falls back to fish, and keeps both outputs separate', () => {
    let state = village();
    createBuilding(state, 'campfire', state.home.x, state.home.y);
    state.resources.meat = 1;
    state.resources.fish = 1;
    state = issueCommand(state, COOK);
    expect(state.units[0].cookInput).toBeUndefined();
    work(state, state.units[0], 5);
    expect(state.resources.cooked).toBe(1);
    expect(state.resources.fish).toBe(1);
    state = issueCommand(state, COOK);
    expect(state.units[0].cookInput).toBe('fish');
    work(state, state.units[0], 5);
    expect(state.resources.cooked).toBe(1);
    expect(state.resources.cookedFish).toBe(1);
    expect(rawPiles(state)).toBe(0);
  });

  it('selects the worker together with an explicitly selected reachable fish pile', () => {
    let state = village('classic', 2);
    createBuilding(state, 'campfire', state.home.x, state.home.y);
    state.resources.meat = 2;
    state.units[0].x -= 14;
    state.units[1].x += 14;
    const pile = ground(state, 'fish', 2, state.home.x + 27);
    const choice = chooseCookingInput(state, state.units, target(pile));
    expect(choice?.worker.id).toBe(state.units[1].id);
    state = issueCommand(state, COOK, target(pile));
    expect(state.units[0].action).toBe('idle');
    expect(state.units[1].cookInput).toBe('fish');
    expect(state.entities[0].amount).toBe(1);
    expect(state.resources.meat).toBe(2);
    work(state, state.units[1], 5);
    expect(state.resources.cookedFish).toBe(1);
  });

  it('does not invent a storage slot when an explicit ground input leaves full stocks unchanged', () => {
    let state = village('guided');
    createBuilding(state, 'campfire', state.home.x, state.home.y);
    state.resources.fish = 30;
    const pile = ground(state, 'fish');
    state = issueCommand(state, COOK, target(pile));
    expect(state.stats.commands).toBe(0);
    expect(state.resources.fish).toBe(30);
    expect(state.entities[0].amount).toBe(2);
  });

  it('does not select a fish pile behind an unwalkable sea even within local distance', () => {
    const state = village();
    const coast = createCoastGeometry(state)!;
    const inland = coast.side === 'north' || coast.side === 'west' ? 1 : -1;
    const axis = coast.side === 'north' || coast.side === 'south' ? 'y' : 'x';
    const shore = coast.points.find((point) =>
      isDryLandPoint(state, { ...point, [axis]: point[axis] + 10 * inland }),
    )!;
    const sea = { ...shore, [axis]: shore[axis] - 2 * inland };
    expect(isSeaPoint(state, sea)).toBe(true);
    const pile = ground(state, 'fish');
    Object.assign(pile, sea);
    Object.assign(state.units[0], { ...shore, [axis]: shore[axis] + 10 * inland });
    expect(chooseCookingInput(state, state.units, target(pile))).toBeUndefined();
    const rejected = issueCommand(state, ['S_01', 'V_01'], { type: 'point', x: pile.x, y: pile.y });
    expect(rejected.stats.commands).toBe(0);
    expect(rejected.voice).toBe(state.voice);
    expect(rejected.logs[0].text).toContain('mare aperto');
    expect(rejected.logs[0].text).not.toContain('guado');
  });

  it.each(['new-order', 'fire', 'hunger', 'cold', 'death', 'shift'] as const)(
    'returns a paid portion once on %s',
    (cause) => {
      let state = preparedCook();
      const unit = state.units[0];
      work(state, unit, 2);
      expect(state.resources.fish).toBe(2);
      if (cause === 'new-order') state = issueCommand(state, ['S_01', 'V_01', 'O_01']);
      if (cause === 'fire') {
        state.buildings[0].active = false;
        work(state, unit, 0.25);
      }
      if (cause === 'hunger') {
        unit.hunger = 100;
        state.time += 0.25;
        updateUnits(state, 0.25);
      }
      if (cause === 'cold') {
        unit.temp = 0;
        state.time += 0.25;
        updateUnits(state, 0.25);
      }
      if (cause === 'death') killUnit(state, unit, 'trauma');
      if (cause === 'shift') {
        unit.command!.unshift('C_02');
        state.time = 60;
        updateUnits(state, 0.25);
      }
      expect(rawPiles(state)).toBe(1);
      expect(state.resources.cookedFish).toBe(0);
      expect(state.resources.cooked).toBe(0);
      expect(
        state.entities.filter((entity) => entity.kind === 'ground' && entity.resource === 'meat'),
      ).toHaveLength(0);
      refundPaidCooking(state, state.units[0]);
      expect(rawPiles(state)).toBe(1);
    },
  );

  it('preserves a paid fish cycle through save/reload and never refunds completed food', () => {
    let state = preparedCook();
    work(state, state.units[0], 2);
    const loaded = parseGame(serializeGame(state));
    expect(loaded).not.toBeNull();
    state = loaded!;
    expect(state.units[0].cookInput).toBe('fish');
    work(state, state.units[0], 3);
    expect(state.resources.cookedFish).toBe(1);
    expect(state.resources.cooked).toBe(0);
    expect(refundPaidCooking(state, state.units[0])).toBe(false);
    expect(rawPiles(state)).toBe(0);
  });

  it('pays every Guided cycle and safely changes from meat to fish', () => {
    let state = village('guided');
    createBuilding(state, 'campfire', state.home.x, state.home.y);
    state.resources.meat = 1;
    state.resources.fish = 2;
    state = issueCommand(state, COOK);
    work(state, state.units[0], 15);
    expect(state.resources).toMatchObject({ meat: 0, fish: 0, cooked: 1, cookedFish: 2 });
    work(state, state.units[0], 5);
    expect(state.resources.cookedFish).toBe(2);
    expect(rawPiles(state)).toBe(0);
  });

  it('pays each artisan tradition cycle instead of creating fish for free', () => {
    const state = village();
    state.tier = 3;
    createBuilding(state, 'campfire', state.home.x, state.home.y);
    state.resources.fish = 2;
    state.traditions.push({ id: 'fish-cooks', createdAt: 0, tokens: ['C_02', ...COOK] });
    for (let index = 0; index < 60; index++) {
      state.time += 0.25;
      updateUnits(state, 0.25);
    }
    expect(state.resources.fish).toBe(0);
    expect(state.resources.cookedFish).toBe(2);
    expect(state.resources.cooked).toBe(0);
    expect(rawPiles(state)).toBe(0);
  });
});
