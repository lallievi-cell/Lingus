import { describe, expect, it } from 'vitest';
import { createGame } from '../game/engine';
import type { Battalion } from '../game/types';
import { getBattalionDisplayPoint } from './regionalLayout';

describe('regional siege symbol positions', () => {
  it('separates nearby formations from the city while preserving combat coordinates and state', () => {
    const state = createGame(6842);
    state.tier = 4;
    state.urbanized = true;
    const city = state.cities[0];
    const army: Battalion = {
      id: 'siege-a',
      name: 'Assedianti',
      x: city.x,
      y: city.y,
      cityId: state.cities[1].id,
      factionId: 'player',
      hp: 1000,
      maxHp: 1000,
      morale: 100,
      action: 'conquering',
      catapult: true,
      occupation: 0,
      targetId: city.id,
    };
    state.battalions = [army, { ...army, id: 'siege-b' }];
    const before = structuredClone(state);
    const first = getBattalionDisplayPoint(state, army);
    const second = getBattalionDisplayPoint(state, state.battalions[1]);
    expect(Math.hypot((first.x - city.x) * 2.4, (first.y - city.y) * 1.6)).toBeCloseTo(70);
    expect(Math.hypot((first.x - second.x) * 2.4, (first.y - second.y) * 1.6)).toBeGreaterThan(45);
    expect(first.x).toBeGreaterThanOrEqual(12);
    expect(first.y).toBeGreaterThanOrEqual(20);
    expect(state).toEqual(before);
    army.action = 'moving';
    expect(getBattalionDisplayPoint(state, army)).toEqual({ x: army.x, y: army.y });
  });

  it('keeps ordinary movement, old tiers and inactive armies at their real position', () => {
    const state = createGame(6842);
    const city = state.cities[0];
    const army: Battalion = {
      id: 'march',
      name: 'Battaglione',
      x: city.x,
      y: city.y,
      cityId: city.id,
      factionId: 'player',
      hp: 1000,
      maxHp: 1000,
      morale: 100,
      action: 'attacking',
      catapult: true,
      occupation: 0,
      targetId: city.id,
    };
    expect(getBattalionDisplayPoint(state, army)).toEqual({ x: army.x, y: army.y });
    state.tier = 5;
    state.urbanized = true;
    army.x += 4;
    expect(getBattalionDisplayPoint(state, army)).toEqual({ x: army.x, y: army.y });
    army.x = city.x;
    army.hp = 0;
    expect(getBattalionDisplayPoint(state, army)).toEqual({ x: army.x, y: army.y });
  });
});
