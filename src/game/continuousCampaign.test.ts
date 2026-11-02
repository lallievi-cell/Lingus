import { describe, expect, it } from 'vitest';
import { setImmediate as yieldToRunner } from 'node:timers/promises';
import { replayContinuousCampaign } from '../../tests/scenarios/continuousCampaign';
import { validSave } from './saveValidation';

describe('bounded legacy public campaign from seven founders', () => {
  it('supports several generations through 30 actual seasons without resource or knowledge grants', () => {
    const replay = replayContinuousCampaign(6842, 2700);
    const final = replay.snapshots.at(-1)!;
    expect(replay.state.time).toBe(2700);
    expect(replay.state.gameOver).toBeNull();
    expect(replay.opening.firstFireAt).toBeLessThan(270);
    expect(replay.maxPopulation).toBeGreaterThanOrEqual(10);
    expect(final.population).toBeGreaterThanOrEqual(7);
    expect(final.births).toBeGreaterThanOrEqual(10);
    expect(final.otherDeaths).toBe(0);
    expect(final.housing).toBeGreaterThan(final.population);
    expect(final.food).toBeGreaterThan(0);
    expect(final.buildings).toEqual(
      expect.arrayContaining(['campfire', 'depot', 'house', 'storage', 'grave', 'pen']),
    );
    const born = replay.state.units.filter((unit) => unit.parentIds);
    const bornIds = new Set(born.map((unit) => unit.id));
    expect(born.length).toBe(final.births);
    expect(born.some((unit) => unit.parentIds!.some((id) => bornIds.has(id)))).toBe(true);
    expect(replay.snapshots[0].housing).toBeGreaterThanOrEqual(22);
    expect(
      replay.actions.some(
        (action) =>
          action.tokens.includes('V_10') && action.target?.type === 'building' && action.accepted,
      ),
    ).toBe(true);
    expect(replay.fertilityReports.some((report) => report.readiness.readyPairs >= 2)).toBe(true);
    expect(replay.state.stats.taught).toBeGreaterThan(0);
  }, 60_000);
});

describe('bounded new Guided public campaign', () => {
  it('carries real descendants past the founders without granting people, meals or buildings', async () => {
    await yieldToRunner();
    const replay = replayContinuousCampaign(6842, 2040, 'patient');
    await yieldToRunner();
    const final = replay.snapshots.at(-1)!;
    expect(replay.state.time).toBe(2040);
    expect(replay.state.gameOver).toBeNull();
    expect(validSave(replay.state)).toBe(true);
    expect(final.population).toBeGreaterThanOrEqual(15);
    expect(final.births).toBeGreaterThanOrEqual(15);
    expect(final.naturalDeaths).toBeGreaterThan(0);
    expect(final.otherDeaths).toBe(0);
    expect(final.housing).toBeGreaterThan(final.population);
    expect(final.food).toBeGreaterThan(0);
    expect(final.cohesion).toBeGreaterThanOrEqual(60);
    expect(replay.state.stats.taught).toBeGreaterThan(0);
    const descendants = replay.state.units.filter((unit) => unit.parentIds?.length === 2);
    const bornIds = new Set(descendants.map((unit) => unit.id));
    expect(descendants.some((unit) => unit.parentIds!.some((id) => bornIds.has(id)))).toBe(true);
    expect(replay.actions.every((action) => action.accepted)).toBe(true);
    expect(final.buildings).toEqual(expect.arrayContaining(['house', 'grave', 'pen', 'storage']));
  }, 90_000);
});
