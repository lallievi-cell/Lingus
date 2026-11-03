import { describe, expect, it } from 'vitest';
import { createGame, teachWord } from './engine';
import { getLessonPreview, GUIDED_LESSON_PUPIL_LIMIT } from './teaching';
import { executeLessonPlan, previewLessonPlan } from './lessonPlan';

function council(mode: 'guided' | 'classic' = 'guided') {
  const state = createGame(6842, mode);
  delete state.openingBalanceVersion;
  delete state.openingCouncilsCompleted;
  state.started = true;
  state.attention = 40;
  state.buildings = [
    {
      id: 'shared-fire',
      kind: 'campfire',
      ...state.home,
      hp: 100,
      active: true,
      completed: true,
    },
  ];
  state.cities = [];
  state.words.O_05 = { retention: 20, custodians: [state.units[0].id], uses: 0 };
  state.units[0].knows.push('O_05');
  for (const unit of state.units) {
    unit.x = state.home.x;
    unit.y = state.home.y;
  }
  return state;
}
function addTeacher(state: ReturnType<typeof council>, index: number) {
  const unit = state.units[index];
  state.words.O_05.custodians.push(unit.id);
  if (!unit.knows.includes('O_05')) unit.knows.push('O_05');
}
const advanceSeed = (seed: number) => (Math.imul(seed, 1664525) + 1013904223) >>> 0;

describe('paid Guided rounds shared by actual custodians', () => {
  it('can share a word across seven voices in three paid rounds without multiplying memory credit', () => {
    let state = council();
    const initial = structuredClone(state);
    let expectedSeed = state.seed;
    for (const expectedPupils of [1, 2, 3]) {
      const before = structuredClone(state);
      const preview = getLessonPreview(state, 'O_05');
      expect(preview.allowed).toBe(true);
      expect(preview.pupils).toHaveLength(expectedPupils);
      expect(preview.teachers).toHaveLength(expectedPupils);
      expect(new Set(preview.teachers.map((teacher) => teacher.id)).size).toBe(expectedPupils);
      expect(
        preview.pupils.every((pupil) => !before.words.O_05.custodians.includes(pupil.id)),
      ).toBe(true);
      expect(
        preview.teachers.every((teacher) => before.words.O_05.custodians.includes(teacher.id)),
      ).toBe(true);
      expect(state).toEqual(before);
      state = teachWord(state, 'O_05');
      expect(state.attention).toBe(before.attention - preview.attentionCost);
      expect(state.words.O_05.retention).toBe(before.words.O_05.retention + preview.memoryGain);
      expect(state.words.O_05.investment).toBe((before.words.O_05.investment ?? 0) + 2);
      expect(state.stats.taught).toBe(before.stats.taught + expectedPupils);
      expect(state.words.O_05.custodians.slice(-expectedPupils)).toEqual(
        preview.pupils.map((pupil) => pupil.id),
      );
      for (const pupil of preview.pupils) {
        expectedSeed = advanceSeed(expectedSeed);
        const learned = state.units.find((unit) => unit.id === pupil.id)!;
        expect(learned.knows).toContain('O_05');
        expect(learned.intelligence).toBeCloseTo(pupil.intelligence + 0.2);
      }
      expect(state.seed).toBe(expectedSeed);
    }
    expect(state.words.O_05.custodians).toHaveLength(initial.units.length);
    expect(state.stats.taught).toBe(6);
    expect(state.attention).toBe(10);
    expect(state.knowledgeHistory?.filter((entry) => entry.kind === 'teaching')).toHaveLength(6);
    expect(getLessonPreview(state, 'O_05').issue).toBe('no-pupil');
  });

  it('limits a round to three distinct pre-existing teachers and prefers available children', () => {
    const state = council();
    for (const index of [1, 2, 3]) addTeacher(state, index);
    const preview = getLessonPreview(state, 'O_05');
    expect(preview.pupils).toHaveLength(GUIDED_LESSON_PUPIL_LIMIT);
    expect(preview.pupils[0].name).toBe('Ilo');
    expect(new Set(preview.pupils.map((pupil) => pupil.id)).size).toBe(3);
    const after = teachWord(state, 'O_05');
    expect(after.attention).toBe(state.attention - 10);
    expect(after.words.O_05.retention).toBe(40);
    expect(after.stats.taught).toBe(3);
  });

  it('does not use a remote teacher or remote extra pupils for simultaneous lessons', () => {
    const state = council();
    addTeacher(state, 1);
    state.units[1].x += 50;
    expect(getLessonPreview(state, 'O_05').pupils).toHaveLength(1);
    state.units[1].x = state.home.x;
    expect(getLessonPreview(state, 'O_05').pupils).toHaveLength(2);
    for (const unit of state.units)
      if (!state.words.O_05.custodians.includes(unit.id) && unit.name !== 'Ilo') unit.x += 50;
    const preview = getLessonPreview(state, 'O_05');
    expect(preview.pupils).toHaveLength(1);
    expect(preview.pupil?.name).toBe('Ilo');
  });

  it('requires each additional pair to share the same physical player fire', () => {
    const state = council();
    addTeacher(state, 1);
    state.units[1].x += 80;
    state.buildings.push({
      id: 'other-fire',
      kind: 'campfire',
      x: state.units[1].x,
      y: state.home.y,
      hp: 100,
      active: true,
      completed: true,
    });
    expect(getLessonPreview(state, 'O_05').pupils).toHaveLength(1);
    state.units[2].x = state.units[1].x;
    expect(getLessonPreview(state, 'O_05').pupils).toHaveLength(2);
    state.buildings[1].completed = false;
    expect(getLessonPreview(state, 'O_05').pupils).toHaveLength(1);
    state.buildings[1].completed = true;
    state.buildings[1].cityId = 'foreign-city';
    expect(getLessonPreview(state, 'O_05').pupils).toHaveLength(1);
  });

  it('never charges or advances a rejected round and preserves Classic one-pupil mathematics', () => {
    const state = council();
    addTeacher(state, 1);
    state.attention = 9;
    const before = structuredClone(state);
    expect(getLessonPreview(state, 'O_05').issue).toBe('no-attention');
    expect(teachWord(state, 'O_05')).toBe(state);
    expect(state).toEqual(before);
    const classic = council('classic');
    addTeacher(classic, 1);
    addTeacher(classic, 2);
    const preview = getLessonPreview(classic, 'O_05');
    expect(preview.pupils).toHaveLength(1);
    const after = teachWord(classic, 'O_05');
    expect(after.words.O_05.retention).toBe(30);
    expect(after.stats.taught).toBe(1);
    expect(after.attention).toBe(30);
    expect(after.seed).toBe(advanceSeed(classic.seed));
  });

  it('excludes dead, enslaved and foreign extra mentors and does not teach elders', () => {
    const state = council();
    for (const index of [1, 2, 3]) addTeacher(state, index);
    state.units[1].hp = 0;
    state.units[2].caste = 'slave';
    state.units[3].factionId = 'foreign';
    expect(getLessonPreview(state, 'O_05').pupils).toHaveLength(1);
    state.units[4].age = 14;
    state.units[5].age = 14;
    const after = teachWord(state, 'O_05');
    expect(after.units[4].knows).not.toContain('O_05');
    expect(after.units[5].knows).not.toContain('O_05');
  });

  it('rehearses the exact grouped pupils in a plan and never partly charges an impossible plan', () => {
    const state = council();
    addTeacher(state, 1);
    const preview = previewLessonPlan(state, ['O_05']);
    expect(preview.lessons[0].pupils).toHaveLength(2);
    expect(preview.cost).toBe(10);
    const actual = executeLessonPlan(state, ['O_05']);
    expect(actual).toEqual(teachWord(state, 'O_05'));
    expect(actual.stats.taught).toBe(2);
    state.attention = 9;
    expect(executeLessonPlan(state, ['O_05'])).toBe(state);
  });
});
