import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createGame } from '../game/engine';
import { rememberPhrase, togglePhraseFavorite } from '../game/phrasebook';
import { Phrasebook, type PhrasebookTab } from './Phrasebook';
import type { GameState } from '../game/types';

function learn(state: GameState, ...words: string[]) {
  for (const word of words) {
    state.words[word] = { retention: 100, custodians: state.units.map((unit) => unit.id), uses: 0 };
    for (const unit of state.units) if (!unit.knows.includes(word)) unit.knows.push(word);
  }
}
function render(state: GameState, initialTab: PhrasebookTab = 'all') {
  return renderToStaticMarkup(
    createElement(Phrasebook, {
      state,
      initialTab,
      onChange: () => {},
      onUse: () => {},
      onClose: () => {},
    }),
  );
}
const visibleText = (markup: string) => markup.replace(/<[^>]+>/g, ' ');

describe('readable phrasebook interface', () => {
  it('explains a known depot before Numero without leaking future buildings or their counts', () => {
    const state = createGame(6842, 'guided');
    learn(state, 'V_05', 'O_02');
    state.tier = 1;
    const markup = render(state, 'construction');
    expect(markup).toContain('Deposito materiali');
    expect(markup).toContain('Dà più spazio a legna, pietra, pelli');
    expect(markup).toContain('Materiali per costruirlo');
    expect(markup).not.toContain('Palazzo reale');
    expect(markup).not.toContain('Fonderia');
    expect(visibleText(markup)).not.toMatch(/\d/);
    expect(markup).toContain('Prepara la frase: Deposito materiali');
    expect(markup).not.toContain('role="dialog"');
  });

  it('keeps a forgotten favorite readable and explains why its use is disabled', () => {
    let state = createGame(6842, 'guided');
    learn(state, 'V_04', 'O_03');
    state.tier = 1;
    state = togglePhraseFavorite(state, ['S_01', 'V_04', 'O_03']);
    state.words.O_03.retention = 0;
    const before = JSON.stringify(state);
    const markup = render(state, 'favorites');
    expect(markup).toContain('Raccogli e porta legna');
    expect(markup).toContain('Da riscoprire: Legno');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('Rimuovi Raccogli e porta legna dalle preferite');
    expect(JSON.stringify(state)).toBe(before);
  });

  it('distinguishes an empty history from recipes that the player has never used', () => {
    const state = createGame(6842, 'guided');
    learn(state, 'V_05', 'O_02');
    const markup = render(state, 'recent');
    expect(markup).toContain('Le frasi già pronunciate compariranno qui.');
    expect(markup).not.toContain('Deposito materiali');
    expect(render(state, 'favorites')).toContain('Aggiungi una stella');
    expect(state.phrasebook).toBeUndefined();
  });

  it('shows the resolved material and maintenance costs of an urban housing quarter', () => {
    let state = createGame(6842, 'guided');
    learn(state, 'S_09', 'V_08', 'O_02', 'O_01', 'O_08');
    state.tier = 4;
    state = togglePhraseFavorite(state, ['S_09', 'V_08', 'O_02', 'O_01']);
    const text = visibleText(render(state, 'favorites'));
    expect(text).toContain('Materiali per il quartiere');
    expect(text).toContain('Pietra: 80');
    expect(text).toContain('Legno: 40');
    expect(text).toContain('Pietra: 4');
    expect(text).toContain('Non richiede addetti dopo la costruzione.');
  });

  it('orders paused recent commands by their real sequence even when the older phrase is a favorite', () => {
    let state = createGame(6842, 'guided');
    state.paused = true;
    state = rememberPhrase(state, ['S_01', 'V_01']);
    state = rememberPhrase(state, ['S_01', 'V_02']);
    state = togglePhraseFavorite(state, ['S_01', 'V_01']);
    expect(state.phrasebook!.map((item) => item.lastUsedAt)).toEqual([0, 0]);
    const all = render(state);
    expect(all.indexOf('Raggiungi un luogo')).toBeLessThan(all.indexOf('Mangia fino alla sazietà'));
    const recent = render(state, 'recent');
    expect(recent.indexOf('Mangia fino alla sazietà')).toBeLessThan(
      recent.indexOf('Raggiungi un luogo'),
    );
  });
});
