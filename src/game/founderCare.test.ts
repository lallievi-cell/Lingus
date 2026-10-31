import { describe, expect, it } from 'vitest';
import { createGame, parseGame, serializeGame } from './engine';
import { getCalendar, seasonStart } from './calendar';
import { getOldAgeProbability } from './founderCare';
import { senileDeathProbability } from './math';
import { validSave } from './saveValidation';

describe('a versioned opening survives reload without rebalancing an older world', () => {
  it('opts only new Guided worlds into the new balance', () => {
    const guided = createGame(6842, 'guided');
    expect(guided.openingBalanceVersion).toBe(1);
    expect(guided.openingCouncilsCompleted).toBe(0);
    expect(parseGame(serializeGame(guided))).toEqual({ ...guided, paused: true });
    const classic = createGame(6842, 'classic');
    expect(classic.openingBalanceVersion).toBeUndefined();
    expect(classic.openingCouncilsCompleted).toBeUndefined();
    expect(getCalendar({ ...classic, time: 90 }).seasonIndex).toBe(1);
  });

  it('keeps the old calendar and death risks when loading an older Guided save', () => {
    const legacy = createGame(6842, 'guided');
    delete legacy.openingBalanceVersion;
    delete legacy.openingCouncilsCompleted;
    legacy.time = 270;
    legacy.seasonIndex = 3;
    legacy.stats.seasonsSurvived = 3;
    legacy.units[5].age = 17;
    const loaded = parseGame(serializeGame(legacy))!;
    expect(loaded).toEqual({ ...legacy, paused: true });
    expect(getCalendar(loaded).season).toBe(3);
    expect(getOldAgeProbability(loaded, loaded.units[5])).toBeCloseTo(0.36);
  });

  it('preserves completed councils and rejects unsupported or contradictory profile data', () => {
    const state = createGame(6842, 'guided');
    state.time = 300;
    state.seasonIndex = 2;
    state.stats.seasonsSurvived = 2;
    state.openingCouncilsCompleted = 2;
    expect(parseGame(serializeGame(state))?.openingCouncilsCompleted).toBe(2);
    for (const patch of [
      { openingBalanceVersion: 2 },
      { openingBalanceVersion: 0 },
      { openingBalanceVersion: null },
      { playMode: 'classic' },
      { playMode: undefined },
      { openingCouncilsCompleted: undefined },
      { openingCouncilsCompleted: -1 },
      { openingCouncilsCompleted: 1.5 },
      { openingCouncilsCompleted: 3 },
      { openingCouncilsCompleted: '2' },
      { openingCouncilsCompleted: Infinity },
      { openingBalanceVersion: undefined },
    ]) {
      const corrupted = { ...state, ...patch };
      expect(validSave(corrupted), JSON.stringify(patch)).toBe(false);
      expect(parseGame(JSON.stringify(corrupted)), JSON.stringify(patch)).toBeNull();
    }
  });

  it('validates physical work against the actual duration of each saved season', () => {
    const state = createGame(6842, 'guided');
    state.buildings.push({
      id: 'fire',
      kind: 'campfire',
      x: 250,
      y: 250,
      hp: 100,
      active: true,
      completed: true,
    });
    const work = (seconds: number) => ({
      efficiencySeconds: seconds,
      workerSeconds: { 'unit-0': seconds },
      commandSeconds: { 'unit-0': { 'S_01|V_05|O_05': seconds } },
    });
    state.buildings[0].seasonWork = { 0: work(150), 3: work(150), 4: work(90) };
    expect(parseGame(serializeGame(state))).not.toBeNull();
    for (const field of ['efficiency', 'worker', 'command'] as const) {
      const corrupted = structuredClone(state);
      const bucket = corrupted.buildings[0].seasonWork![4];
      if (field === 'efficiency') bucket.efficiencySeconds = 90.01;
      if (field === 'worker') bucket.workerSeconds['unit-0'] = 90.01;
      if (field === 'command') bucket.commandSeconds!['unit-0']['S_01|V_05|O_05'] = 90.01;
      expect(validSave(corrupted), field).toBe(false);
    }
    state.buildings[0].seasonWork = { 0: work(150.01) };
    expect(validSave(state)).toBe(false);
    state.buildings[0].seasonWork = { 0: work(100) };
    delete state.openingBalanceVersion;
    delete state.openingCouncilsCompleted;
    expect(validSave(state)).toBe(false);
    state.buildings[0].seasonWork = { 0: work(90) };
    expect(validSave(state)).toBe(true);
  });
});

describe('elders have time to pass on their knowledge without immortal founders', () => {
  const worldAt = (ordinal: number, councils: number) => {
    const state = createGame(6842, 'guided');
    state.time = seasonStart(state, ordinal);
    state.seasonIndex = ordinal;
    state.stats.seasonsSurvived = ordinal;
    state.openingCouncilsCompleted = councils;
    return state;
  };

  it('adds two elder seasons to everyone while preserving the Classic death curve', () => {
    const state = worldAt(4, 2);
    for (const id of ['unit-0', 'child-12', 'envoy-foreign']) {
      expect(getOldAgeProbability(state, { id, age: 14 })).toBe(0);
      expect(getOldAgeProbability(state, { id, age: 16 })).toBe(0);
      expect(getOldAgeProbability(state, { id, age: 17 })).toBeCloseTo(0.12);
      expect(getOldAgeProbability(state, { id, age: 20 })).toBeCloseTo(0.48);
      expect(getOldAgeProbability(state, { id, age: 25 })).toBe(1);
    }
    const classic = createGame(6842, 'classic');
    for (const age of [14, 15, 16, 17, 20, 25])
      expect(getOldAgeProbability(classic, { id: 'unit-0', age })).toBe(
        senileDeathProbability(age),
      );
  });

  it('protects the seven founders until two real councils have finished', () => {
    const state = worldAt(7, 1);
    for (let index = 0; index < 7; index++)
      expect(getOldAgeProbability(state, { id: `unit-${index}`, age: 20 })).toBe(0);
    expect(getOldAgeProbability(state, { id: 'unit-7', age: 20 })).toBeCloseTo(0.48);
    expect(getOldAgeProbability(state, { id: 'unit-0-copy', age: 20 })).toBeCloseTo(0.48);
    state.openingCouncilsCompleted = 2;
    expect(getOldAgeProbability(state, { id: 'unit-5', age: 20 })).toBeCloseTo(0.48);
  });

  it('ends founder protection at the eighth seasonal boundary even without a fire', () => {
    const state = worldAt(8, 0);
    state.time -= 0.001;
    expect(getOldAgeProbability(state, { id: 'unit-5', age: 25 })).toBe(0);
    state.time += 0.001;
    expect(getOldAgeProbability(state, { id: 'unit-5', age: 25 })).toBe(1);
    expect(state.buildings).toHaveLength(0);
  });
});
