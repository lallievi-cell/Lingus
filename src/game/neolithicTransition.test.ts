import { describe, expect, it } from 'vitest';
import {
  preparedNeolithicSettlement,
  replayNeolithicTransition,
} from '../../tests/scenarios/neolithicTransition';
import { hasWord } from './engine';
import { validSave } from './saveValidation';
import { RESOURCE_SPECS } from './content';

describe('continuous legacy growth from an explicitly prepared Neolithic settlement', () => {
  it('declares a finite, reloadable 35-person starting position without Writing or Cities', () => {
    const state = preparedNeolithicSettlement();
    expect(validSave(state)).toBe(true);
    expect(state.units).toHaveLength(35);
    expect(state.units.every((unit) => unit.age >= 4 && unit.age <= 10)).toBe(true);
    expect(state.units.filter((unit) => unit.sex === 'F')).toHaveLength(17);
    expect(Object.keys(state.words)).toHaveLength(27);
    expect(hasWord(state, 'O_09')).toBe(false);
    expect(hasWord(state, 'S_09')).toBe(false);
    expect(state.urbanized).toBe(false);
    expect(state.cities).toHaveLength(0);
    const total = (category: 'food' | 'material') =>
      Object.entries(state.resources)
        .filter(
          ([id]) =>
            id !== 'coin' &&
            RESOURCE_SPECS[id as keyof typeof RESOURCE_SPECS].category === category,
        )
        .reduce((n, [, amount]) => n + amount, 0);
    expect(total('food')).toBeLessThanOrEqual(1000);
    expect(total('material')).toBeLessThanOrEqual(2000);
    expect(Object.values(state.resources).every(Number.isFinite)).toBe(true);
  });

  it('produces real oral overload, pays for an archive and grows through eight actual seasons', () => {
    const result = replayNeolithicTransition(6842, 720),
      state = result.state;
    expect(state.time).toBe(720);
    expect(state.stats.seasonsSurvived).toBe(8);
    expect(state.gameOver).toBeNull();
    expect(validSave(state)).toBe(true);
    expect(state.stats.births).toBeGreaterThanOrEqual(20);
    expect(state.units.filter((unit) => unit.hp > 0).length).toBeGreaterThanOrEqual(60);
    expect(result.discoveries.find((entry) => entry.id === 'O_09')).toMatchObject({
      event: 'La memoria orale non basta più',
      recipe: ['O_08', 'O_02', 'M_02'],
    });
    const archive = state.buildings.find((building) => building.kind === 'archive');
    expect(archive?.completed).toBe(true);
    expect(
      Object.values(archive?.seasonWork ?? {}).some((work) => work.efficiencySeconds > 0),
    ).toBe(true);
    expect(
      result.actions.some(
        (action) => action.accepted && action.tokens.join('|') === 'S_02|V_08|O_02|O_09',
      ),
    ).toBe(true);
    expect(result.actions.every((action) => action.accepted)).toBe(true);
    expect(state.stats.taught).toBeGreaterThan(0);
    expect(state.units.some((unit) => (unit.bornAt ?? 0) > 0 && unit.parentIds?.length === 2)).toBe(
      true,
    );
    expect(hasWord(state, 'S_09')).toBe(false);
    expect(state.urbanized).toBe(false);
  }, 60000);
});
