import type { ReactNode } from 'react';
import { ArrowUpRight, BookOpen, Search } from 'lucide-react';
import { WORD_ORDER, WORDS } from '../game/content';
import { hasWord } from '../game/runtime';
import { getSyntaxSuggestions } from '../game/syntaxAssistant';
import type { GameState, WordKind } from '../game/types';
import './SyntaxAssistant.css';
import './ContextualWordShelf.css';

export type ContextualWordFilter = 'compatible' | 'all' | WordKind;
const kindNames: Record<WordKind, string> = {
  S: 'Soggetto',
  V: 'Azione',
  O: 'Materia',
  M: 'Concetto',
  C: 'Condizione',
};

export function ContextualWordShelf({
  state,
  sentence,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  renderWord,
  onOpenLexicon,
}: {
  state: GameState;
  sentence: string[];
  filter: ContextualWordFilter;
  onFilterChange: (filter: ContextualWordFilter) => void;
  search: string;
  onSearchChange: (search: string) => void;
  renderWord: (id: string) => ReactNode;
  onOpenLexicon: () => void;
}) {
  const syntax = getSyntaxSuggestions(state, sentence);
  const compatible = new Set(syntax.tokenIds);
  const discovered = WORD_ORDER.filter((id) => !!state.words[id]);
  const query = search.trim().toLocaleLowerCase('it');
  const shown = discovered.filter(
    (id) =>
      (filter === 'compatible'
        ? compatible.has(id)
        : filter === 'all' || WORDS[id].kind === filter) &&
      WORDS[id].label.toLocaleLowerCase('it').includes(query),
  );
  const showAll = () => {
    onFilterChange('all');
    onSearchChange('');
  };
  return (
    <div className="contextual-word-shelf">
      <div
        className={`syntax-assistant ${syntax.isComplete ? 'contextual-complete' : ''}`}
        aria-label="Assistente sintattico"
      >
        <span className="syntax-next" title={syntax.explanation}>
          <span className="syntax-cue" aria-hidden="true" />
          <strong>{syntax.nextLabel}</strong>
          {syntax.isComplete && (
            <span className="contextual-ready-hint">Verifica il bersaglio, poi Pronuncia.</span>
          )}
        </span>
        <button
          className="syntax-toggle"
          aria-pressed={filter === 'compatible'}
          onClick={() => onFilterChange(filter === 'compatible' ? 'all' : 'compatible')}
          title="Mostra soltanto parole che possono completare la frase conosciuta. Costi e bersagli restano da verificare."
        >
          Solo compatibili
        </button>
        <label className="word-search">
          <Search size={12} aria-hidden="true" />
          <input
            type="search"
            aria-label="Cerca parole nella barra"
            placeholder="Trova una parola…"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
      </div>
      <div className="lexicon-bar contextual-word-options">
        <div className="lexicon-label">
          <BookOpen size={16} />
          <span>LE PAROLE DELLA TRIBÙ</span>
          <b title="Parole vive. Le parole perdute restano consultabili in Tutte.">
            {discovered.filter((id) => hasWord(state, id)).length}
          </b>
        </div>
        <div className="word-filters" role="group" aria-label="Filtra le parole">
          {(['all', 'S', 'V', 'O', 'M', 'C'] as const)
            .filter((kind) => kind === 'all' || discovered.some((id) => WORDS[id].kind === kind))
            .map((kind) => (
              <button
                key={kind}
                className={filter === kind ? 'active' : ''}
                aria-pressed={filter === kind}
                onClick={() => onFilterChange(kind)}
              >
                {kind === 'all' ? 'Tutte' : kindNames[kind]}
              </button>
            ))}
        </div>
        <button className="text-button" onClick={onOpenLexicon}>
          Esplora il lessico <ArrowUpRight size={13} />
        </button>
      </div>
      <div className="word-shelf">
        {shown.map((id) => renderWord(id))}
        {shown.length === 0 && (
          <p className="contextual-empty">
            {query
              ? 'Nessuna parola corrisponde alla ricerca.'
              : filter === 'compatible' && syntax.isComplete
                ? 'La frase è pronta: non serve riempire gli altri spazi.'
                : filter === 'compatible'
                  ? syntax.explanation
                  : 'Nessuna parola in questa categoria.'}
          </p>
        )}
        {(query || filter === 'compatible') && (
          <button className="word-bank-reset" onClick={showAll}>
            Mostra tutte le parole
          </button>
        )}
      </div>
      {filter === 'compatible' && syntax.lawOnlyTokenIds.length > 0 && (
        <p className="contextual-law-hint">
          Alcune continuazioni preparano una legge a sei parole. L’anteprima distingue l’ordine
          diretto dalla legge.
        </p>
      )}
    </div>
  );
}
