import { describe, expect, it } from 'vitest';
import { createGame, prepareBriefLesson, teachWord } from './engine';
import { getLessonPreview } from './teaching';
import { finishSeasonMemory, killUnit, seasonalCore } from './simulation';
import { getSeasonRate } from './calendar';
import { getCouncilAttention, learningDecayGamma, recordLivedFireUse } from './learningBalance';

/** Prepared ordinary hearth, not a claim of a complete opening replay. */
function hearth() {
  const state = createGame(6842, 'guided');
  state.openingBalanceVersion = 1;
  state.started = true;
  state.time = 110;
  state.entities = [];
  state.cities = [];
  state.factions = [];
  for (const unit of state.units)
    Object.assign(unit, { ...state.home, age: 6, hunger: 20, hp: 100, temp: 100 });
  state.units.find((unit) => unit.name === 'Ilo')!.age = 2;
  const teacher = state.units.find((unit) => unit.name === 'Uma')!;
  state.words.O_05 = { retention: 50, custodians: [teacher.id], uses: 0 };
  teacher.knows.push('O_05');
  state.buildings = [
    { id: 'fire', kind: 'campfire', ...state.home, hp: 100, active: true, completed: true },
  ];
  state.resources.wood = 20;
  state.resources.food = 20;
  state.attention = 10;
  state.burntWood = 0;
  return state;
}

describe('versioned Guided learning has useful, predictable decisions', () => {
  it('funds at least three ordinary early lessons without penalizing normal appetite', () => {
    const state = hearth();
    state.time = 150;
    const mildAppetite = getCouncilAttention(state, 2, 1, 20),
      readyForNextMeal = getCouncilAttention(state, 2, 1, 65);
    expect(mildAppetite.total).toBe(39);
    expect(Math.floor(mildAppetite.total / 10)).toBe(3);
    expect(readyForNextMeal.total).toBe(mildAppetite.total);
    expect(getCouncilAttention(state, 7, 1, 20).total).toBe(49);
    expect(getCouncilAttention(state, 2, 1, 95).total).toBe(0);
  });

  it('keeps a council useful after the first year and still respects its cap', () => {
    const state = hearth();
    state.time = 600;
    expect(getCouncilAttention(state, 2, 1, 20).base).toBe(30);
    state.time = 690;
    expect(getCouncilAttention(state, 2, 1, 20).total).toBe(29);
    state.time = 1500;
    expect(getCouncilAttention(state, 2, 1, 20).base).toBe(20);
    expect(getCouncilAttention(state, 100, 10, 0).total).toBe(100);
  });

  it('opens a real funded council without burning or charging hypothetical fuel', () => {
    const state = hearth();
    state.time = 150;
    state.units[0].action = 'guarding';
    state.buildings[0].workerIds = [state.units[0].id];
    seasonalCore(state);
    expect(state.campfirePending).toBe(true);
    expect(state.attention).toBe(34); // no elders: base30 + two real upkeep wood ×2
    expect(state.resources.wood).toBeLessThan(18);
    expect(state.burntWood).toBe(0);
  });

  it('does not count the fuel of an earlier paid story again in the seasonal budget', () => {
    let state = hearth();
    state.attention = 0;
    state = prepareBriefLesson(state);
    expect(state.resources.wood).toBe(18);
    expect(state.attention).toBe(10);
    expect(state.burntWood).toBe(0);
    state = teachWord(state, 'O_05');
    state.time = 150;
    state.units[0].action = 'guarding';
    state.buildings[0].workerIds = [state.units[0].id];
    seasonalCore(state);
    expect(state.attention).toBe(34);
    expect(state.burntWood).toBe(0);
    expect(state.stats.taught).toBe(1);
  });

  it('makes the first paid transmission survive both settlement and a later teacher loss', () => {
    const state = hearth(),
      preview = getLessonPreview(state, 'O_05');
    expect(preview.allowed).toBe(true);
    expect(preview.retentionGain).toBe(30);
    const taught = teachWord(state, 'O_05');
    expect(state.words.O_05.retention).toBe(50);
    expect(taught.attention).toBe(0);
    expect(taught.words.O_05.retention).toBe(80);
    expect(taught.words.O_05.custodians).toHaveLength(2);
    taught.time = 150;
    finishSeasonMemory(taught);
    expect(taught.words.O_05.retention).toBe(74);
    killUnit(taught, taught.units.find((unit) => unit.name === 'Uma')!, 'oldAge');
    expect(taught.words.O_05.retention).toBe(37);
    expect(taught.words.O_05.custodians).toHaveLength(1);
    expect(taught.words.O_05.custodians[0]).toBe(preview.pupil!.id);
  });

  it('does not repeatedly award the first-transmission floor or revive forgotten words', () => {
    let state = teachWord(hearth(), 'O_05');
    state.attention = 10;
    state.words.O_05.retention = 40;
    expect(getLessonPreview(state, 'O_05').retentionGain).toBe(20);
    state = teachWord(state, 'O_05');
    expect(state.words.O_05.retention).toBe(60);
    state.words.O_05.retention = 0;
    state.attention = 10;
    expect(teachWord(state, 'O_05')).toBe(state);
  });

  it('introduces the oral burden gradually at actual closed-season boundaries', () => {
    const state = hearth();
    for (const [time, expected] of [
      [150, 1],
      [600, 1],
      [690, 2],
      [960, 2],
      [1050, 3],
    ]) {
      state.time = time;
      expect(learningDecayGamma(state, 3)).toBe(expected);
      expect(learningDecayGamma(state, 0.5)).toBeCloseTo(expected / 6);
    }
    state.time = 600;
    expect(learningDecayGamma(state, 3, false)).toBe(2);
    state.time = 960;
    expect(learningDecayGamma(state, 3, false)).toBe(3);
  });

  it('counts useful warmth once globally and normalizes exposure in the longer opening', () => {
    const state = hearth();
    state.time = 450; // winter daytime; warmth has a real benefit
    state.words.O_05.custodians = state.units.map((unit) => unit.id);
    recordLivedFireUse(state, 2 / getSeasonRate(state));
    expect(state.words.O_05.uses).toBe(1);
    recordLivedFireUse(state, 2 / getSeasonRate(state));
    expect(state.words.O_05.uses).toBe(2);
    expect(state.words.O_05.retention).toBe(50);
    expect(state.words.O_05.custodians).toHaveLength(7);
  });

  it('does not credit distant, unoccupied, extinguished, unnecessary or forgotten heat', () => {
    const state = hearth(),
      teacher = state.units.find((unit) => unit.name === 'Uma')!;
    state.time = 450;
    teacher.x = 350;
    recordLivedFireUse(state, 30);
    expect(state.words.O_05.uses).toBe(0);
    teacher.x = state.home.x;
    state.buildings[0].active = false;
    recordLivedFireUse(state, 30);
    expect(state.words.O_05.uses).toBe(0);
    state.buildings[0].active = true;
    state.time = 200; // summer daytime, ambient75 throughout the interval
    recordLivedFireUse(state, 30);
    expect(state.words.O_05.uses).toBe(0);
    state.time = 450;
    state.words.O_05.retention = 0;
    recordLivedFireUse(state, 30);
    expect(state.words.O_05.uses).toBe(0);
  });

  it('credits the winter interval ending at600 at its old pace and temperature', () => {
    const state = hearth();
    state.time = 600;
    recordLivedFireUse(state, 2.5);
    expect(state.words.O_05.uses).toBe(0);
    expect(state.eventTimes['livedFireExposure:O_05']).toBeCloseTo(1.5);
    state.time = 662; // ordinary spring night: actual warmth is useful again
    recordLivedFireUse(state, 2);
    expect(state.words.O_05.uses).toBe(1);
    expect(state.eventTimes['livedFireExposure:O_05']).toBeCloseTo(1.5);
  });

  it('preserves Classic and older Guided learning, including temple credit after the old hunger clamp', () => {
    for (const mode of ['guided', 'classic'] as const) {
      const state = hearth();
      state.playMode = mode;
      delete state.openingBalanceVersion;
      state.time = 450;
      expect(getCouncilAttention(state, 2, 1, 20).total).toBe(0);
      expect(getCouncilAttention(state, 2, 1, 80, 100, 20).total).toBe(20);
      expect(learningDecayGamma(state, 3)).toBe(3);
      expect(getLessonPreview(state, 'O_05').retentionGain).toBe(mode === 'guided' ? 20 : 10);
      recordLivedFireUse(state, 30);
      expect(state.words.O_05.uses).toBe(0);
    }
  });
});
