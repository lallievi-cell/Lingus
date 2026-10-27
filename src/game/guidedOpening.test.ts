import { describe, expect, it } from 'vitest';
import { replayGuidedOpening } from '../../tests/scenarios/guidedOpening';
import { HOME } from './content';
import { hasWord, parseGame, serializeGame } from './engine';

describe('ordinary Guided opening', () => {
  it('lights a real central fire with a full minute to spare using coarse group orders', () => {
    const result = replayGuidedOpening();
    const { state, orders, discoveries } = result;
    expect(state.gameOver).toBeNull();
    expect(result.firstFireAt).not.toBeNull();
    expect(result.firstFireAt!).toBeLessThanOrEqual(210);
    expect(
      state.buildings.find((building) => !building.cityId && building.kind === 'campfire'),
    ).toMatchObject({ ...HOME, active: true, hp: 100 });
    expect(
      state.units.filter((unit) => unit.hp > 0 && unit.factionId === 'player').length,
    ).toBeGreaterThanOrEqual(6);
    expect(hasWord(state, 'O_05')).toBe(true);
    expect(discoveries.find((discovery) => discovery.wordId === 'O_05')!.recipe).toContain('V_06');
    expect(hasWord(state, 'S_02')).toBe(true);
    const personalDiscovery = discoveries.find((discovery) => discovery.wordId === 'S_02');
    expect(personalDiscovery).toBeDefined();
    expect(personalDiscovery!.at).toBeLessThan(90);
    expect(personalDiscovery!.recipe).toEqual(['S_01']);
    expect(discoveries.find((discovery) => discovery.wordId === 'O_01')!.at).toBeLessThan(100);
    expect(orders.length).toBeLessThanOrEqual(10);
    expect(orders.every((order) => order.at % 5 === 0)).toBe(true);
    expect(orders.every((order) => order.tokens[0] === 'S_01')).toBe(true);
    expect(orders.filter((order) => order.tokens.join('|') === 'S_01|V_04|O_03')).toHaveLength(1);
    expect(state.stats.commands).toBe(orders.length);
    // The fire consumes real fuel, and one repeated transport task leaves
    // enough delivered wood to pay the next upkeep rather than only ignite.
    expect(state.burntWood).toBeGreaterThanOrEqual(5);
    expect(state.resources.wood).toBeGreaterThanOrEqual(2);
    expect(state.resources.wood + state.burntWood).toBeGreaterThanOrEqual(10);
    expect(state.resources.tool).toBeGreaterThan(0);
    expect(parseGame(serializeGame(state))).not.toBeNull();
  }, 35_000);
});
