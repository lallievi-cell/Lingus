import { useEffect, useState, type ReactNode } from 'react';
import { ArrowUpRight, BookOpen, Search, SlidersHorizontal } from 'lucide-react';
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
  mobileCatalog = false,
}: {
  state: GameState;
  sentence: string[];
  filter: ContextualWordFilter;
  onFilterChange: (filter: ContextualWordFilter) => void;
  search: string;
  onSearchChange: (search: string) => void;
  renderWord: (id: string) => ReactNode;
  onOpenLexicon: () => void;
  /** Explicit expanded phone catalog; the default phone palette lives separately. */
  mobileCatalog?: boolean;
}) {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 860px)').matches : false,
  );
  const [toolsOpen, setToolsOpen] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 860px)');
    const changed = () => setMobile(media.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
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
  const syntaxCue = (
    <span className="syntax-next" title={syntax.explanation}>
      <span className="syntax-cue" aria-hidden="true" />
      <strong>{syntax.nextLabel}</strong>
      {syntax.isComplete && (
        <span className="contextual-ready-hint">Verifica il bersaglio, poi Pronuncia.</span>
      )}
    </span>
  );
  const compatibilityToggle = (
    <button
      className="syntax-toggle"
      aria-pressed={filter === 'compatible'}
      onClick={() => onFilterChange(filter === 'compatible' ? 'all' : 'compatible')}
      title="Mostra soltanto parole che possono completare la frase. Costi e bersaglio restano nell’anteprima."
    >
      Solo compatibili
    </button>
  );
  const searchBox = (
    <label className="word-search">
      <Search size={14} aria-hidden="true" />
      <input
        type="search"
        aria-label="Cerca parole nella barra"
        placeholder="Cerca una parola…"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
      />
    </label>
  );
  const filters = (allOnly = false) => (
    <div
      className="word-filters"
      role="group"
      aria-label={allOnly ? 'Filtra le parole' : mobile ? 'Filtra per tipo' : 'Filtra le parole'}
    >
      {(['all', 'S', 'V', 'O', 'M', 'C'] as const)
        .filter(
          (kind) =>
            (allOnly ? kind === 'all' : !mobile || mobileCatalog || kind !== 'all') &&
            (kind === 'all' || discovered.some((id) => WORDS[id].kind === kind)),
        )
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
  );
  const openLexicon = (
    <button className="text-button word-bank-lexicon" onClick={onOpenLexicon}>
      Esplora il lessico <ArrowUpRight size={13} />
    </button>
  );
  return (
    <div
      className={`contextual-word-shelf ${toolsOpen ? 'tools-expanded' : ''} ${mobile && mobileCatalog ? 'catalog-view' : ''} ${shown.length ? '' : 'has-no-results'}`}
    >
      {mobile && mobileCatalog ? (
        <>
          <div className="mobile-catalog-search">{searchBox}</div>
          <div className="mobile-catalog-options" aria-label="Opzioni del catalogo">
            {compatibilityToggle}
            {filters()}
          </div>
          <div
            className={`syntax-assistant catalog-status ${syntax.isComplete ? 'contextual-complete' : ''}`}
            aria-label="Assistente sintattico"
          >
            {syntaxCue}
          </div>
        </>
      ) : mobile ? (
        <>
          <div className="mobile-bank-toolbar" aria-label="Opzioni delle parole">
            {compatibilityToggle}
            {filters(true)}
            <button
              className="word-bank-tools-toggle"
              aria-expanded={toolsOpen}
              aria-label="Cerca e filtra parole"
              onClick={() => {
                setToolsOpen((value) => !value);
              }}
            >
              <SlidersHorizontal size={16} />
              <span>Cerca e filtra</span>
            </button>
          </div>
          {toolsOpen && (
            <div className="mobile-bank-tools">
              {searchBox}
              {filters()}
              {openLexicon}
            </div>
          )}
          <div
            className={`syntax-assistant ${syntax.isComplete ? 'contextual-complete' : ''}`}
            aria-label="Assistente sintattico"
          >
            {syntaxCue}
          </div>
          {!toolsOpen && (query || !['compatible', 'all'].includes(filter)) && (
            <button className="word-bank-active-filter" onClick={() => setToolsOpen(true)}>
              {query ? `Ricerca: ${search}` : `Tipo: ${kindNames[filter as WordKind]}`} · Modifica
            </button>
          )}
        </>
      ) : (
        <>
          <div
            className={`syntax-assistant ${syntax.isComplete ? 'contextual-complete' : ''}`}
            aria-label="Assistente sintattico"
          >
            {syntaxCue}
            {compatibilityToggle}
            {searchBox}
          </div>
          <div className="lexicon-bar contextual-word-options">
            <div className="lexicon-label">
              <BookOpen size={16} />
              <span>LE PAROLE DELLA TRIBÙ</span>
              <b title="Parole vive. Le parole perdute restano consultabili in Tutte.">
                {discovered.filter((id) => hasWord(state, id)).length}
              </b>
            </div>
            {filters()}
            {openLexicon}
          </div>
        </>
      )}
      <div
        className="word-shelf"
        onClick={(event) => {
          if (
            mobile &&
            event.target instanceof Element &&
            event.target.closest('.word-tile:not(:disabled)')
          )
            setToolsOpen(false);
        }}
      >
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
        {(query || ((!mobile || mobileCatalog) && filter === 'compatible')) && (
          <button className="word-bank-reset" onClick={showAll}>
            Mostra tutte le parole
          </button>
        )}
        {mobile && mobileCatalog && openLexicon}
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
