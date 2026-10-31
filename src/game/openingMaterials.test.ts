import { describe, expect, it } from 'vitest';
import { createGame } from './engine';
import { canPayLocally, payLocally } from './craftMaterials';

describe('using real materials around the patient Guided camp', () => {
  it('lets a camp artisan spend extracted chips without positioning at a geometric intersection', () => {
    const state = createGame(6842, 'guided');
    const artisan = state.units[0];
    Object.assign(artisan, state.home);
    const pile = {
      id: 'chips',
      kind: 'ground' as const,
      resource: 'stone' as const,
      x: state.home.x,
      y: state.home.y - 30,
      amount: 5,
      hp: 0,
      maxHp: 1,
    };
    state.entities = [pile];
    expect(canPayLocally(state, { stone: 1 }, artisan)).toBe(true);
    payLocally(state, { stone: 1 }, artisan);
    expect(pile.amount).toBe(4);
    expect(state.resources.stone).toBe(0);
    expect(canPayLocally(state, { stone: 5 }, artisan)).toBe(false);
  });

  it('keeps the original reach for existing Guided saves and Classic', () => {
    for (const mode of ['guided', 'classic'] as const) {
      const state = createGame(6842, mode);
      delete state.openingBalanceVersion;
      delete state.openingCouncilsCompleted;
      Object.assign(state.units[0], state.home);
      state.entities = [
        {
          id: 'chips',
          kind: 'ground',
          resource: 'stone',
          x: state.home.x,
          y: state.home.y - 30,
          amount: 5,
          hp: 0,
          maxHp: 1,
        },
      ];
      expect(canPayLocally(state, { stone: 1 }, state.units[0])).toBe(false);
    }
  });

  it('does not extend camp reach to a travelling artisan or distant deposits', () => {
    const state = createGame(6842, 'guided');
    const artisan = state.units[0];
    Object.assign(artisan, { x: state.home.x, y: state.home.y + 16 });
    const pile = {
      id: 'chips',
      kind: 'ground' as const,
      resource: 'stone' as const,
      x: state.home.x,
      y: state.home.y - 30,
      amount: 5,
      hp: 0,
      maxHp: 1,
    };
    state.entities = [pile];
    expect(canPayLocally(state, { stone: 1 }, artisan)).toBe(false);
    Object.assign(artisan, state.home);
    pile.y = state.home.y - 36;
    expect(canPayLocally(state, { stone: 1 }, artisan)).toBe(false);
  });
});
