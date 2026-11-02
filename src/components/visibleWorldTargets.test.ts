import { describe, expect, it } from 'vitest';
import { createInitialState } from '../game/state';
import type { GameState, MapEntity } from '../game/types';
import { getVisibleWorldTargets } from './visibleWorldTargets';

const camera = { minX: 220, minY: 220, maxX: 280, maxY: 280 };
const entity = (
  id: string,
  kind: MapEntity['kind'],
  x: number,
  y: number,
  extra: Partial<MapEntity> = {},
): MapEntity => ({ id, kind, x, y, hp: 100, maxHp: 100, amount: 20, maxAmount: 20, ...extra });
function unlock(state: GameState, id: string) {
  state.words[id] = { retention: 100, custodians: [state.units[0].id], uses: 0 };
}

describe('keyboard access to the actual visible world', () => {
  it('limits targets to both revealed geography and the current camera', () => {
    const state = createInitialState();
    state.entities = [
      entity('near', 'tree', 240, 230),
      entity('outside-camera', 'tree', 290, 290),
      entity('unexplored', 'stone', 310, 250),
    ];
    const targets = getVisibleWorldTargets(state, camera);
    expect(targets.some((entry) => entry.target.id === 'near')).toBe(true);
    expect(targets.some((entry) => entry.target.id === 'outside-camera')).toBe(false);
    expect(
      getVisibleWorldTargets(state, { minX: 300, maxX: 350, minY: 220, maxY: 280 }).some(
        (entry) => entry.target.id === 'unexplored',
      ),
    ).toBe(false);
    expect(
      targets.some(
        (entry) =>
          entry.target.type === 'point' && entry.target.x === 250 && entry.target.y === 250,
      ),
    ).toBe(true);
  });

  it('preserves unknown material names, hidden personal names and qualitative quantities', () => {
    const state = createInitialState();
    state.entities = [entity('tree', 'tree', 230, 230), entity('ore', 'ore', 240, 240)];
    const before = getVisibleWorldTargets(state, camera);
    expect(before.find((entry) => entry.target.id === 'tree')?.label).toBe(
      'Un ostacolo senza nome',
    );
    expect(before.some((entry) => entry.target.id === 'ore')).toBe(false);
    expect(before.find((entry) => entry.target.id === 'unit-0')?.label).toBe('Un compagno');
    expect(before.every((entry) => !/\d/.test(`${entry.label} ${entry.detail}`))).toBe(true);
    unlock(state, 'S_02');
    unlock(state, 'O_03');
    unlock(state, 'O_07');
    const after = getVisibleWorldTargets(state, camera);
    expect(after.find((entry) => entry.target.id === 'unit-0')?.label).toBe('Korg');
    expect(after.find((entry) => entry.target.id === 'tree')?.label).toContain('Albero');
    expect(after.some((entry) => entry.target.id === 'ore')).toBe(true);
  });

  it('groups extraction piles once and returns their real coordinates, not the drawn offset', () => {
    const state = createInitialState();
    state.entities = [
      entity('tree', 'tree', 230, 230),
      entity('pile-a', 'ground', 230, 230, { resource: 'wood', amount: 2 }),
      entity('pile-b', 'ground', 230, 230, { resource: 'wood', amount: 3 }),
    ];
    const entries = getVisibleWorldTargets(state, { minX: 234, minY: 233, maxX: 240, maxY: 240 });
    expect(entries).toHaveLength(1);
    expect(entries[0].detail).toBe('A terra · da portare');
    expect(['pile-a', 'pile-b']).toContain(entries[0].target.id);
    expect(entries[0].target).toMatchObject({ type: 'entity', x: 230, y: 230 });
    expect(state.resources.wood).toBe(0);
  });

  it('keeps depleted sources but removes depleted loose goods and living actors that died', () => {
    const state = createInitialState();
    state.units[0].hp = 0;
    state.entities = [
      entity('stump', 'tree', 230, 230, { amount: 0 }),
      entity('empty-rock', 'stone', 235, 230, { amount: 0 }),
      entity('empty-pile', 'ground', 240, 230, { resource: 'stone', amount: 0 }),
      entity('carcass', 'deer', 245, 230, { hp: 0, amount: 4 }),
    ];
    const entries = getVisibleWorldTargets(state, camera);
    expect(entries.some((entry) => entry.target.id === 'unit-0')).toBe(false);
    expect(entries.some((entry) => entry.target.id === 'stump')).toBe(true);
    expect(entries.some((entry) => entry.target.id === 'empty-rock')).toBe(true);
    expect(entries.some((entry) => entry.target.id === 'empty-pile')).toBe(false);
    expect(entries.find((entry) => entry.target.id === 'carcass')?.label).toBe('Animale abbattuto');
  });

  it('obeys the same daytime wolf concealment as the painting', () => {
    const state = createInitialState();
    state.units.forEach((unit) => {
      unit.x = 250;
      unit.y = 250;
    });
    state.entities = [entity('far-wolf', 'wolf', 225, 225), entity('near-wolf', 'wolf', 255, 255)];
    const day = getVisibleWorldTargets(state, camera);
    expect(day.some((entry) => entry.target.id === 'far-wolf')).toBe(false);
    expect(day.some((entry) => entry.target.id === 'near-wolf')).toBe(true);
    state.time = 70;
    expect(
      getVisibleWorldTargets(state, camera).some((entry) => entry.target.id === 'far-wolf'),
    ).toBe(true);
  });

  it('respects the urban view while retaining visible foreign people and special actors', () => {
    const state = createInitialState();
    state.tier = 4;
    state.urbanized = true;
    state.units[0].factionId = 'foreign';
    state.units[1].isKing = true;
    state.buildings = [
      { id: 'capital-house', kind: 'house', x: 250, y: 250, hp: 100, active: true },
    ];
    state.cities[0].x = 255;
    state.cities[0].y = 255;
    const before = JSON.stringify(state);
    const targets = getVisibleWorldTargets(state, camera);
    expect(
      targets
        .filter((entry) => entry.category === 'people')
        .map((entry) => entry.target.id)
        .sort(),
    ).toEqual(['unit-0', 'unit-1']);
    expect(targets.find((entry) => entry.target.id === 'unit-0')?.label).toBe('Uno straniero');
    expect(targets.some((entry) => entry.target.id === 'capital-house')).toBe(false);
    expect(targets.some((entry) => entry.target.id === state.cities[0].id)).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('keeps a displaced siege symbol selectable at its real army and excludes ended caravans', () => {
    const state = createInitialState();
    state.tier = 4;
    state.urbanized = true;
    state.cities = [
      { ...state.cities[0], id: 'target-city', x: 250, y: 250, factionId: 'foreign' },
      { ...state.cities[1], id: 'origin-city', x: 200, y: 250, factionId: 'player' },
    ];
    state.battalions = [
      {
        id: 'siege',
        name: 'Le Lance',
        x: 251,
        y: 250,
        cityId: 'origin-city',
        factionId: 'player',
        hp: 100,
        maxHp: 100,
        morale: 1,
        action: 'attacking',
        catapult: false,
        occupation: 0,
        targetId: 'target-city',
      },
    ];
    const caravan = {
      id: 'live-caravan',
      kind: 'trade' as const,
      x: 220,
      y: 250,
      fromCityId: 'origin-city',
      factionId: 'player',
      resources: { ...state.resources },
      population: 0,
      hp: 100,
      target: { type: 'point' as const, x: 250, y: 250 },
    };
    state.caravans = [
      caravan,
      { ...caravan, id: 'arrived', arrived: true },
      { ...caravan, id: 'destroyed', hp: 0 },
    ];
    const entries = getVisibleWorldTargets(state, { minX: 216, maxX: 226, minY: 245, maxY: 255 });
    expect(entries.find((entry) => entry.target.id === 'siege')?.target).toMatchObject({
      type: 'battalion',
      x: 251,
      y: 250,
    });
    expect(entries.some((entry) => entry.target.id === 'live-caravan')).toBe(true);
    expect(
      entries.some((entry) => entry.target.id === 'arrived' || entry.target.id === 'destroyed'),
    ).toBe(false);
    expect(state.battalions[0].x).toBe(251);
  });
});
