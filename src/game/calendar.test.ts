import { describe, expect, it } from 'vitest';
import { createGame, dismissCampfire, tick } from './engine';
import { effectiveElapsed, getCalendar, secondsForEffectiveDuration } from './calendar';
import { evaluateDiscoveries, processWork, updateUnits } from './simulation';
import { simulationStep } from './simulation';
import { WORD_ORDER } from './content';

describe('the versioned opening calendar and its real costs', () => {
  it.each([
    [0, 0, false],
    [99.99, 0, false],
    [100, 0, true],
    [149.99, 0, true],
    [150, 1, false],
    [450, 3, false],
    [550, 3, true],
    [599.99, 3, true],
    [600, 4, false],
    [659.99, 4, false],
    [660, 4, true],
    [690, 5, false],
  ])('places time %s in season %s with night=%s', (time, ordinal, night) => {
    const state = createGame(6842, 'guided');
    expect(getCalendar(state, time).seasonIndex).toBe(ordinal);
    expect(getCalendar(state, time).isNight).toBe(night);
    expect(getCalendar(state, time).seasonLength).toBe(ordinal < 4 ? 150 : 90);
  });

  it('keeps both Classic and existing Guided saves on ninety-second seasons', () => {
    const classic = createGame(6842, 'classic');
    const legacy = createGame(6842, 'guided');
    delete legacy.openingBalanceVersion;
    delete legacy.openingCouncilsCompleted;
    for (const state of [classic, legacy]) {
      expect(getCalendar(state, 90).seasonIndex).toBe(1);
      expect(getCalendar(state, 270).season).toBe(3);
      expect(getCalendar(state, 330).isNight).toBe(true);
      expect(effectiveElapsed(state, 0, 360)).toBe(360);
    }
  });

  it('integrates food and production budgets through the change of pace and inverts them', () => {
    const state = createGame(6842, 'guided');
    expect(effectiveElapsed(state, 0, 600)).toBe(360);
    expect(effectiveElapsed(state, 500, 690)).toBe(150);
    expect(secondsForEffectiveDuration(state, 500, 150)).toBe(190);
    expect(effectiveElapsed(state, 599.75, 600.25)).toBeCloseTo(0.4);
    expect(secondsForEffectiveDuration(state, 599.75, 0.4)).toBeCloseTo(0.5);
  });

  it.each([150, 600])('settles and pauses a real council at exactly %ss once', (boundary) => {
    let state = createGame(6842, 'guided');
    Object.assign(state, { started: true, paused: false, time: boundary - 0.1 });
    state.stats.seasonsSurvived = boundary === 150 ? 0 : 3;
    state.resources.wood = 20;
    state.buildings = [
      { id: 'fire', kind: 'campfire', ...state.home, hp: 100, active: true, completed: true },
    ];
    state = tick(state, 0.2);
    expect(state.time).toBe(boundary);
    expect(state.campfirePending).toBe(true);
    // One upkeep payment, followed by ordinary five-percent wood deterioration.
    expect(state.resources.wood).toBeCloseTo(18 * 0.95);
    expect(state.openingCouncilsCompleted).toBe(0);
    state = dismissCampfire(state);
    expect(state.openingCouncilsCompleted).toBe(1);
    expect(dismissCampfire(state).openingCouncilsCompleted).toBe(1);
  });

  it('slows hunger and temperature, while physical movement stays responsive', () => {
    const state = createGame(6842, 'guided');
    state.time = 20;
    state.units = [state.units[0]];
    state.entities = [];
    const unit = state.units[0];
    Object.assign(unit, {
      x: 250,
      y: 250,
      hunger: 20,
      temp: 50,
      action: 'moving',
      tx: 270,
      ty: 250,
      command: ['S_01', 'V_01'],
    });
    updateUnits(state, 1);
    expect(unit.hunger).toBeCloseTo(20.48);
    expect(unit.temp).toBeCloseTo(50.3);
    expect(unit.x - 250).toBeGreaterThan(3);
  });

  it('counts the last winter interval before six hundred, not the following warm day', () => {
    const state = createGame(6842, 'guided');
    state.time = 600;
    state.units = [state.units[0]];
    state.entities = [];
    Object.assign(state.units[0], { hunger: 20, temp: 90 });
    updateUnits(state, 0.25);
    expect(state.units[0].hunger).toBeCloseTo(20.12);
    expect(state.units[0].temp).toBeCloseTo(89.325);
  });
});

describe('anticipation can grow from successful provisioning', () => {
  it.each([true, false])('requires a real food delivery, with new balance=%s', (balanced) => {
    const state = createGame(6842, 'guided');
    if (!balanced) {
      delete state.openingBalanceVersion;
      delete state.openingCouncilsCompleted;
    }
    state.time = 200;
    state.units = [state.units[0]];
    const unit = state.units[0];
    Object.assign(unit, {
      ...state.home,
      intelligence: 8,
      hunger: 20,
      hp: 100,
      action: 'returning',
      command: ['S_01', 'V_04'],
      carry: { resource: 'food', amount: 1 },
    });
    for (const id of ['C_01', 'V_04']) {
      state.words[id] = { retention: 80, custodians: [unit.id], uses: 0 };
      unit.knows.push(id);
    }
    evaluateDiscoveries(state, unit);
    expect(state.sparks.some((spark) => spark.wordId === 'M_02')).toBe(false);
    processWork(state, unit, 5);
    evaluateDiscoveries(state, unit);
    expect(state.resources.food).toBe(1);
    expect(state.sparks.some((spark) => spark.wordId === 'M_02')).toBe(balanced);
    expect(unit.hunger).toBe(20);
    expect(unit.hp).toBe(100);
  });
});

describe('oral pressure follows the same new memory burden as forgetting', () => {
  it.each([true, false])('respects the sacred elders, new balance=%s', (balanced) => {
    const state = createGame(6842, 'guided');
    if (!balanced) {
      delete state.openingBalanceVersion;
      delete state.openingCouncilsCompleted;
    }
    state.time = 1000;
    state.tier = 4;
    state.units = [state.units[0]];
    state.entities = [];
    const unit = state.units[0];
    Object.assign(unit, { hunger: 20, intelligence: 9 });
    const known = [...new Set([...WORD_ORDER.slice(0, 20), 'O_08', 'O_02', 'M_02'])].filter(
      (id) => id !== 'O_09',
    );
    for (const id of known) state.words[id] = { retention: 100, custodians: [unit.id], uses: 0 };
    unit.knows = known;
    state.dogmas = [
      {
        id: 'elders',
        targetId: 'S_04',
        vectorId: 'M_04',
        name: 'Custodia degli anziani',
        description: '',
        age: 1,
        weight: 10,
      },
    ];
    simulationStep(state, 0.25);
    expect(unit.eventMemory?.some((event) => event.tag === 'ENV_ORAL_OVERFLOW')).toBe(!balanced);
  });
});
