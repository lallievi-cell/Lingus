import { describe, expect, it } from 'vitest';
import { createGame, teachWord } from './engine';
import { previewLessonPlan, executeLessonPlan } from './lessonPlan';

function council() {
  const state = createGame(6842, 'guided');
  state.started = true;
  state.attention = 20;
  state.buildings.push({
    id: 'lesson-fire',
    kind: 'campfire',
    x: 250,
    y: 250,
    hp: 100,
    active: true,
    completed: true,
  });
  for (const id of ['O_03', 'V_04']) {
    state.words[id] = { retention: 50, custodians: [state.units[0].id], uses: 0 };
    state.units[0].knows.push(id);
  }
  state.words.V_04.custodians.push(state.units[6].id);
  state.units[6].knows.push('V_04');
  return state;
}

describe('chosen lesson plans', () => {
  it('previews real pupils without charging or changing the original seed', () => {
    const state = council();
    const before = JSON.stringify(state);
    const preview = previewLessonPlan(state, ['O_03', 'V_04']);
    expect(preview.allowed).toBe(true);
    expect(preview.cost).toBe(20);
    expect(preview.lessons[0].pupil?.id).toBe(state.units[6].id);
    expect(preview.lessons[1].pupil?.id).not.toBe(state.units[6].id);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('executes exactly the individual public lessons with real costs and random ordering', () => {
    const state = council();
    const expected = teachWord(teachWord(state, 'O_03'), 'V_04');
    const actual = executeLessonPlan(state, ['O_03', 'V_04']);
    expect(actual).toEqual(expected);
    expect(actual.attention).toBe(0);
    expect(actual.stats.taught).toBe(state.stats.taught + 2);
    expect(actual.resources).toEqual(state.resources);
  });

  it('does not charge a partial plan when its total Attention is unavailable', () => {
    const state = council();
    state.attention = 10;
    expect(previewLessonPlan(state, ['O_03', 'V_04']).allowed).toBe(false);
    expect(executeLessonPlan(state, ['O_03', 'V_04'])).toBe(state);
    expect(state.attention).toBe(10);
    expect(state.stats.taught).toBe(0);
  });

  it('revalidates a lost teacher and a forgotten word before the whole plan', () => {
    const state = council();
    expect(previewLessonPlan(state, ['O_03', 'V_04']).allowed).toBe(true);
    state.units[0].hp = 0;
    expect(executeLessonPlan(state, ['O_03', 'V_04'])).toBe(state);
    state.units[0].hp = 100;
    state.words.O_03.retention = 0;
    expect(previewLessonPlan(state, ['O_03', 'V_04']).lessons[0].issue).toBe('forgotten');
    expect(executeLessonPlan(state, ['O_03', 'V_04'])).toBe(state);
  });

  it('treats the chosen words as a set and never executes an empty plan', () => {
    const state = council();
    expect(previewLessonPlan(state, ['O_03', 'O_03']).cost).toBe(10);
    expect(executeLessonPlan(state, ['O_03', 'O_03']).stats.taught).toBe(1);
    expect(executeLessonPlan(state, [])).toBe(state);
  });
});
