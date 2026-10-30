import { describe, expect, it } from 'vitest';
import { createGame, prepareBriefLesson, prepareCampfireCouncil, teachWord } from './engine';
import { getLessonPreview, briefLessonIssue, lessonIssueText } from './teaching';
import { killUnit, seasonalCore } from './simulation';

/** Isolated teaching fixtures, not a full opening replay. */
function lesson(mode: 'guided' | 'classic' = 'guided') {
  const state = createGame(6842, mode);
  state.started = true;
  state.time = 110;
  state.cities = [];
  state.factions = [];
  state.entities = [];
  state.buildings = [
    { id: 'fire', kind: 'campfire', ...state.home, hp: 100, active: true, completed: true },
  ];
  state.resources.wood = 2;
  state.attention = 0;
  state.burntWood = 0;
  const teacher = state.units.find((unit) => unit.name === 'Uma')!;
  state.words.O_05 = { retention: 50, custodians: [teacher.id], uses: 0 };
  teacher.knows.push('O_05');
  return state;
}

describe('a paid Guided lesson can precede the seasonal death roll', () => {
  it('pays real delivered wood and Attention, creates a real pupil and leaves the season untouched', () => {
    const state = lesson(),
      before = structuredClone(state);
    const prepared = prepareBriefLesson(state);
    expect(prepared.resources.wood).toBe(0);
    expect(prepared.attention).toBe(10);
    expect(prepared.burntWood).toBe(0);
    expect(prepared.time).toBe(state.time);
    expect(prepared.campfirePending).toBe(false);
    expect(prepared.pendingSeason).toBe(state.pendingSeason);
    expect(state).toEqual(before);
    const taught = teachWord(prepared, 'O_05'),
      pupil = taught.units.find((u) => u.name === 'Ilo')!;
    expect(taught.attention).toBe(0);
    expect(taught.words.O_05.retention).toBe(70);
    expect(taught.words.O_05.custodians).toContain(pupil.id);
    expect(pupil.knows).toContain('O_05');
    expect(taught.stats.taught).toBe(1);
    killUnit(taught, taught.units.find((u) => u.name === 'Uma')!, 'oldAge');
    expect(taught.words.O_05.retention).toBe(35);
    expect(taught.words.O_05.custodians).toEqual([pupil.id]);
  });

  it('does not award the same fuel again when the next council opens', () => {
    let state = lesson();
    state.resources.wood = 8;
    state.units = state.units.filter((u) => ['Uma', 'Ilo'].includes(u.name));
    for (const unit of state.units) Object.assign(unit, { age: 6, hunger: 0 });
    const teacher = state.units[0];
    teacher.action = 'guarding';
    state.buildings[0].workerIds = [teacher.id];
    state = teachWord(prepareBriefLesson(state), 'O_05');
    expect(state.resources.wood).toBe(6);
    state.time = 180;
    seasonalCore(state);
    expect(state.buildings[0].active).toBe(true);
    expect(state.resources.wood).toBeCloseTo(3.8); // ordinary seasonal wood loss still applies
    expect(state.attention).toBe(10); // only this boundary's two-wood fire upkeep
    expect(state.burntWood).toBe(0);
  });

  it('keeps the ordinary pupil selection preview pure and exact', () => {
    const state = lesson();
    state.attention = 10;
    const before = structuredClone(state),
      preview = getLessonPreview(state, 'O_05');
    expect(preview.allowed).toBe(true);
    expect(preview.teacher?.name).toBe('Uma');
    expect(preview.pupil?.name).toBe('Ilo');
    expect(state).toEqual(before);
    const next = teachWord(state, 'O_05');
    expect(next.words.O_05.custodians.at(-1)).toBe(preview.pupil?.id);
    expect(next.seed).toBe((Math.imul(state.seed, 1664525) + 1013904223) >>> 0);
  });

  it('shows and enforces the absence of a living free teacher', () => {
    const state = lesson();
    state.attention = 10;
    const teacher = state.units.find((u) => u.name === 'Uma')!;
    teacher.hp = 0;
    expect(getLessonPreview(state, 'O_05').issue).toBe('no-teacher');
    expect(teachWord(state, 'O_05')).toBe(state);
    expect(prepareBriefLesson(state)).toBe(state);
    teacher.hp = 80;
    teacher.caste = 'slave';
    expect(getLessonPreview(state, 'O_05').issue).toBe('no-teacher');
    expect(teachWord(state, 'O_05')).toBe(state);
  });

  it('does not revive a forgotten word or teach an innate concept', () => {
    const state = lesson();
    state.attention = 10;
    state.words.O_05.retention = 0;
    expect(getLessonPreview(state, 'O_05').issue).toBe('forgotten');
    expect(teachWord(state, 'O_05')).toBe(state);
    expect(getLessonPreview(state, 'S_01').issue).toBe('innate');
    expect(getLessonPreview(state, 'missing').issue).toBe('unknown');
  });

  it('distinguishes no Attention from an already shared full memory', () => {
    const state = lesson();
    expect(getLessonPreview(state, 'O_05').issue).toBe('no-attention');
    state.words.O_05.custodians = state.units.map((u) => u.id);
    state.words.O_05.retention = 100;
    expect(getLessonPreview(state, 'O_05').issue).toBe('no-pupil');
    expect(prepareBriefLesson(state)).toBe(state);
  });

  it('still teaches a fully retained word when another person can become a custodian', () => {
    const state = lesson();
    state.words.O_05.retention = 100;
    state.attention = 10;
    expect(getLessonPreview(state, 'O_05')).toMatchObject({ allowed: true, retentionGain: 0 });
    expect(teachWord(state, 'O_05').words.O_05.custodians).toHaveLength(2);
  });

  it('never spends ground piles, absent fuel or an unfinished/foreign fire', () => {
    const state = lesson();
    state.resources.wood = 0;
    state.entities = [
      { id: 'wood', kind: 'ground', resource: 'wood', ...state.home, amount: 20, hp: 1, maxHp: 1 },
    ];
    expect(prepareBriefLesson(state)).toBe(state);
    expect(briefLessonIssue(state)).toContain('legno nelle scorte');
    state.resources.wood = 2;
    state.buildings[0].completed = false;
    expect(prepareBriefLesson(state)).toBe(state);
    state.buildings[0].completed = true;
    state.buildings[0].cityId = 'foreign';
    expect(prepareBriefLesson(state)).toBe(state);
    state.buildings[0].cityId = undefined;
    state.buildings[0].active = false;
    expect(prepareBriefLesson(state)).toBe(state);
  });

  it('keeps Classic fuel preparation and ordinary lesson efficacy unchanged', () => {
    const state = lesson('classic');
    expect(prepareBriefLesson(state)).toBe(state);
    state.attention = 10;
    const next = teachWord(state, 'O_05');
    expect(next.resources.wood).toBe(2);
    expect(next.attention).toBe(0);
    expect(next.words.O_05.retention).toBe(60);
  });

  it('separates the pending council from an early story and prevents either after the ending', () => {
    const state = lesson();
    state.campfirePending = true;
    expect(prepareBriefLesson(state)).toBe(state);
    expect(prepareCampfireCouncil(state).attention).toBe(10);
    state.campfirePending = false;
    state.gameOver = 'La tribù si è dispersa.';
    expect(prepareBriefLesson(state)).toBe(state);
    expect(teachWord({ ...state, attention: 10 }, 'O_05').stats.taught).toBe(0);
    expect(lessonIssueText(getLessonPreview(state, 'O_05').issue)).toContain('conclusa');
  });
});
