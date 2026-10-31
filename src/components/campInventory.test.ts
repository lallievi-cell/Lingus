import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RESOURCE_ORDER, emptyInventory } from '../game/content';
import { freeCapacity } from '../game/runtime';
import { createInitialState } from '../game/state';
import type { Building, GameState, Resource } from '../game/types';
import { CampInventoryPanel } from './CampInventoryPanel';
import {
  describeStockQuantity,
  getCampStockCapacity,
  getCampStockSlots,
  getInventoryEntries,
} from './campInventory';

function unlock(state: GameState, word: string) {
  state.words[word] = { retention: 100, custodians: [], uses: 0 };
}

function building(kind: Building['kind'], extras: Partial<Building> = {}): Building {
  return { id: kind, kind, hp: 100, active: true, x: 250, y: 250, ...extras };
}

describe('readable delivered camp stocks', () => {
  it('exposes all fourteen owned resources without requiring their words or Domani', () => {
    const state = createInitialState();
    RESOURCE_ORDER.forEach((resource) => (state.resources[resource] = 2));
    const entries = getInventoryEntries(state);
    expect(state.words.M_02).toBeUndefined();
    expect(entries.map((entry) => entry.resource)).toEqual(RESOURCE_ORDER);
    expect(entries).toHaveLength(14);
    expect(entries.find((entry) => entry.resource === 'pelt')).toMatchObject({
      label: 'Pelli',
      amount: 2,
      quantity: 'Poco',
      level: 1,
    });
    expect(entries.every((entry) => !/\d/.test(entry.quantity))).toBe(true);
  });

  it('shows the absence of visible early materials, food and pelts from the first frame', () => {
    const state = createInitialState();
    const entries = getInventoryEntries(state);
    expect(entries.map((entry) => entry.resource)).toEqual([
      'food',
      'meat',
      'stone',
      'wood',
      'pelt',
    ]);
    expect(entries.every((entry) => entry.quantity === 'Nessuna scorta')).toBe(true);
    expect(entries.every((entry) => entry.level === 0)).toBe(true);
  });

  it('retains known exhausted goods after use or loss of their word', () => {
    const state = createInitialState();
    unlock(state, 'V_06');
    state.resources.pelt = 4;
    state.resources.tool = 1;
    expect(getInventoryEntries(state).find((entry) => entry.resource === 'tool')?.amount).toBe(1);
    state.resources.pelt = 0;
    state.resources.tool = 0;
    state.words.V_06.retention = 0;
    for (const resource of ['pelt', 'tool'] as Resource[]) {
      expect(getInventoryEntries(state).find((entry) => entry.resource === resource)).toMatchObject(
        {
          amount: 0,
          quantity: 'Nessuna scorta',
          level: 0,
        },
      );
    }
  });

  it('uses neutral qualitative bands and never rounds a positive remainder to zero', () => {
    expect(describeStockQuantity(0, false)).toBe('Nessuna scorta');
    expect(describeStockQuantity(0.001, false)).toBe('Poco');
    expect(describeStockQuantity(5, false)).toBe('Una discreta scorta');
    expect(describeStockQuantity(20, false)).toBe('Molto');
    expect(describeStockQuantity(0, true)).toBe('0');
    expect(describeStockQuantity(0.001, true)).toBe('<0,1');
    expect(describeStockQuantity(0.1, true)).toBe('0,1');
    expect(describeStockQuantity(12.5, true)).toBe('12,5');
    expect(describeStockQuantity(12.5, false, true)).toBe('Discreta');
    expect(describeStockQuantity(0, false, true)).toBe('Assente');
  });

  it('separates incoming loads and ignores dead, foreign or non-returning carriers', () => {
    const state = createInitialState();
    state.resources.wood = 3;
    const [own, legacy, foreign, dead, interrupted] = state.units;
    own.action = 'returning';
    own.carry = { resource: 'wood', amount: 2 };
    legacy.factionId = undefined;
    legacy.action = 'returning';
    legacy.carry = { resource: 'wood', amount: 1 };
    foreign.factionId = 'faction-forest';
    foreign.action = 'returning';
    foreign.carry = { resource: 'wood', amount: 10 };
    dead.hp = 0;
    dead.action = 'returning';
    dead.carry = { resource: 'wood', amount: 10 };
    interrupted.action = 'fleeing';
    interrupted.carry = { resource: 'wood', amount: 10 };
    expect(getInventoryEntries(state).find((entry) => entry.resource === 'wood')).toMatchObject({
      amount: 3,
      incoming: 3,
      quantity: 'Poco',
    });
    expect(state.resources.wood).toBe(3);
  });

  it('includes unknown goods actually coming home, without projecting them as stored', () => {
    const state = createInitialState();
    state.units[0].action = 'returning';
    state.units[0].carry = { resource: 'ingot', amount: 0.25 };
    expect(getInventoryEntries(state).find((entry) => entry.resource === 'ingot')).toMatchObject({
      amount: 0,
      incoming: 0.25,
      level: 0,
    });
    expect(getCampStockSlots(state)).toEqual([]);
  });

  it('keeps provincial stocks separate from the capital and its incoming loads', () => {
    const state = createInitialState();
    state.resources.pelt = 7;
    state.units[0].action = 'returning';
    state.units[0].carry = { resource: 'pelt', amount: 2 };
    const provincial = emptyInventory();
    provincial.pelt = 1;
    expect(
      getInventoryEntries(state, provincial).find((entry) => entry.resource === 'pelt'),
    ).toMatchObject({
      amount: 1,
      incoming: 0,
    });
    expect(getInventoryEntries(state).find((entry) => entry.resource === 'pelt')).toMatchObject({
      amount: 7,
      incoming: 2,
    });
  });

  it('shows shared initial capacity with reservations and excludes unlimited coin', () => {
    const state = createInitialState();
    state.resources.food = 8;
    state.resources.pelt = 3;
    state.resources.coin = 500;
    state.units[0].carry = { resource: 'stone', amount: 2 };
    const [pool] = getCampStockCapacity(state);
    expect(pool).toMatchObject({
      id: 'shared',
      capacity: 30,
      stored: 11,
      reserved: 2,
      available: 17,
      dedicated: false,
    });
    expect(pool.available).toBe(freeCapacity(state, 'pelt'));
  });

  it('matches dedicated food/material capacities and ignores unfinished or provincial stores', () => {
    const state = createInitialState();
    state.resources.food = 12;
    state.resources.pelt = 6;
    state.units[0].carry = { resource: 'seed', amount: 2 };
    const provincial = state.cities[0];
    provincial.factionId = 'player';
    provincial.capital = false;
    state.buildings = [
      building('storage'),
      building('depot'),
      building('storage', { id: 'unfinished', completed: false }),
      building('depot', { id: 'destroyed', hp: 0 }),
      building('storage', { id: 'province', cityId: provincial.id }),
    ];
    const [food, material] = getCampStockCapacity(state);
    expect(food).toMatchObject({
      id: 'food',
      capacity: 200,
      stored: 12,
      reserved: 2,
      available: 186,
    });
    expect(material).toMatchObject({
      id: 'material',
      capacity: 500,
      stored: 6,
      reserved: 0,
      available: 494,
    });
    expect(food.available).toBe(freeCapacity(state, 'food'));
    expect(material.available).toBe(freeCapacity(state, 'wood'));
  });

  it('retains the ground allowance for a category without a dedicated building', () => {
    const state = createInitialState();
    state.buildings = [building('storage')];
    state.resources.wood = 30;
    expect(getCampStockCapacity(state)).toMatchObject([
      { id: 'food', capacity: 200, available: 200 },
      { id: 'material', capacity: 30, available: 0, dedicated: false },
    ]);
  });

  it('projects every stored resource once, without creating or changing entities', () => {
    const state = createInitialState();
    RESOURCE_ORDER.forEach((resource) => (state.resources[resource] = 3));
    const before = JSON.stringify(state);
    const slots = getCampStockSlots(state);
    expect(slots).toHaveLength(5);
    expect(slots.flatMap((slot) => slot.resources).sort()).toEqual([...RESOURCE_ORDER].sort());
    expect(slots.every((slot) => slot.level > 0)).toBe(true);
    expect(
      slots.every((slot) => {
        const radius = Math.hypot(slot.x - state.home.x, slot.y - state.home.y);
        return radius >= 8 && radius <= 14.001;
      }),
    ).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('keeps pile positions stable across arrival and consumption, and removes depleted piles', () => {
    const state = createInitialState();
    state.resources.wood = 4;
    const wood = getCampStockSlots(state).find((slot) => slot.group === 'wood')!;
    state.resources.food = 8;
    state.resources.wood = 24;
    expect(getCampStockSlots(state).find((slot) => slot.group === 'wood')).toMatchObject({
      x: wood.x,
      y: wood.y,
      level: 3,
    });
    state.resources.wood = 0;
    expect(getCampStockSlots(state).some((slot) => slot.group === 'wood')).toBe(false);
  });

  it('moves decorative piles aside for buildings and hides them after urbanization', () => {
    const state = createInitialState();
    state.resources.pelt = 1;
    const previous = getCampStockSlots(state)[0];
    state.buildings = [building('hut', { x: previous.x, y: previous.y })];
    const slot = getCampStockSlots(state)[0];
    expect(Math.hypot(slot.x - previous.x, slot.y - previous.y)).toBeGreaterThanOrEqual(7);
    state.urbanized = true;
    expect(getCampStockSlots(state)).toEqual([]);
  });

  it('renders accessible pelts, delivered and incoming quantities without early numbers', () => {
    const state = createInitialState();
    state.resources.pelt = 2;
    state.units[0].action = 'returning';
    state.units[0].carry = { resource: 'wood', amount: 1 };
    const render = () =>
      renderToStaticMarkup(createElement(CampInventoryPanel, { state, onFocusCamp: () => {} }));
    const early = render();
    expect(early).toContain('data-resource="pelt"');
    expect(early).toContain('aria-label="Scorte disponibili"');
    expect(early).toContain('camp-inventory-incoming');
    expect(early.replace(/<[^>]*>/g, '')).not.toMatch(/\d/);
    unlock(state, 'O_08');
    expect(render()).toContain('camp-inventory-quantity">2<');
  });
});
