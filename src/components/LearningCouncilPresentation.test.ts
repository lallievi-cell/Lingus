import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createGame, teachWord } from '../game/engine';
import type { GameState } from '../game/types';
import { GuidedCouncil } from './GuidedCouncil';
import { TeachingPanel } from './TeachingPanel';

function lessonScene() {
  const state = createGame(6842, 'guided');
  state.started = true;
  state.paused = true;
  state.attention = 35;
  state.words.O_05 = { retention: 50, custodians: ['unit-5'], uses: 0 };
  state.units[5].knows.push('O_05');
  state.buildings.push({
    id: 'fire',
    kind: 'campfire',
    ...state.home,
    completed: true,
    active: true,
    hp: 100,
  });
  return state;
}

function words(state: GameState, ...ids: string[]) {
  for (const id of ids) {
    state.words[id] = { retention: 100, custodians: [state.units[0].id], uses: 0 };
    state.units[0].knows.push(id);
  }
}

const visibleText = (html: string) => html.replace(/<[^>]*>/g, '');
const panel = (state: GameState) =>
  renderToStaticMarkup(createElement(TeachingPanel, { state, onChange: () => {} }));
const council = (state: GameState) =>
  renderToStaticMarkup(
    createElement(GuidedCouncil, {
      state,
      onPrepare: () => {},
      onPrepareBrief: () => {},
    }),
  );

describe('the new council explains choices without exposing hidden knowledge', () => {
  it('keeps the lesson budget consistent with an actual paid transmission', () => {
    const state = lessonScene();
    words(state, 'O_08');
    expect(visibleText(panel(state))).toContain('Attenzione per 3 lezioni.');
    const after = teachWord(state, 'O_05');
    expect(after.stats.taught).toBe(state.stats.taught + 1);
    expect(after.attention).toBe(25);
    expect(visibleText(panel(after))).toContain('Attenzione per 2 lezioni.');
    after.attention = 9;
    expect(visibleText(panel(after))).toContain('Serve altra Attenzione per una lezione.');
  });

  it('shows a practical consequence while keeping identities and quantities unknown', () => {
    const state = lessonScene();
    const html = panel(state);
    const text = visibleText(html);
    expect(text).toContain('Attenzione per più lezioni.');
    expect(text).toContain('Scaldare la comunità e condividere il sapere.');
    expect(text).not.toMatch(/Uma|Ilo|Korg|\d|%/);
    expect(text).not.toContain('Rifornire il campo con cibo e materiali.');
    state.attention = 10;
    expect(visibleText(panel(state))).toContain('Attenzione per una lezione.');
  });

  it('keeps the previous council presentation for legacy Guided saves', () => {
    const state = lessonScene();
    delete state.openingBalanceVersion;
    delete state.openingCouncilsCompleted;
    words(state, 'O_08');
    const text = visibleText(panel(state));
    expect(text).not.toContain('Attenzione per 3 lezioni.');
    expect(text).not.toContain('Scaldare la comunità e condividere il sapere.');
    expect(visibleText(council(state))).not.toContain('Il consiglio stagionale parte da');
  });

  it('describes the budget of the season that just ended at the year boundary', () => {
    const state = lessonScene();
    words(state, 'O_08');
    state.campfirePending = true;
    state.time = 600;
    expect(visibleText(council(state))).toContain('parte da 30 punti Attenzione');
    state.time = 690;
    expect(visibleText(council(state))).toContain('parte da 20 punti Attenzione');
  });

  it('explains serious hunger without leaking numeric thresholds before Numero', () => {
    const state = lessonScene();
    state.campfirePending = true;
    const text = visibleText(council(state));
    expect(text).toContain('solo la fame grave la riduce');
    expect(text).not.toMatch(/\d/);
  });
});
