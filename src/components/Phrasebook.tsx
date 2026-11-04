import { useEffect, useLayoutEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  BookOpen,
  Building2,
  ChevronDown,
  History,
  Maximize2,
  Minimize2,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from 'lucide-react';
import { BUILDING_SPECS, RESOURCE_SPECS, WORDS } from '../game/content';
import {
  getPhrasebook,
  togglePhraseFavorite,
  type PhrasebookItem,
  type PhraseCategory,
} from '../game/phrasebook';
import { hasWord } from '../game/runtime';
import { resolveConstruction } from '../game/grammar';
import type { GameState, Inventory, Resource } from '../game/types';
import { describeStockQuantity } from './campInventory';
import './Phrasebook.css';

export type PhrasebookTab = 'all' | 'construction' | 'favorites' | 'recent';

const tabs: { id: PhrasebookTab; label: string }[] = [
  { id: 'all', label: 'Tutte' },
  { id: 'construction', label: 'Costruzioni' },
  { id: 'favorites', label: 'Preferite' },
  { id: 'recent', label: 'Recenti' },
];
const categoryLabels: Record<PhraseCategory, string> = {
  construction: 'Costruzioni',
  work: 'Lavori',
  tradition: 'Tradizioni',
  law: 'Leggi',
  dogma: 'Dogmi',
  other: 'Altre frasi',
};

function resourceList(cost: Partial<Inventory>, numbered: boolean) {
  return Object.entries(cost)
    .filter(([, amount]) => amount > 0)
    .map(
      ([resource, amount]) =>
        `${RESOURCE_SPECS[resource as Resource].label}: ${describeStockQuantity(amount, numbered, true).toLocaleLowerCase('it')}`,
    )
    .join(' · ');
}

function BuildingDetails({ state, item }: { state: GameState; item: PhrasebookItem }) {
  if (!item.buildingKind) return null;
  const numbered = hasWord(state, 'O_08');
  const spec = BUILDING_SPECS[item.buildingKind];
  const construction = resolveConstruction(item.tokens);
  const quantity = construction?.quantity ?? 1;
  const cost = construction?.cost ?? spec.cost;
  // The fire phrase tends an existing fire; its catalogue cost describes only
  // the first ignition, rather than charging a new building on every recall.
  const fire = item.buildingKind === 'campfire';
  const upkeep = resourceList(
    Object.fromEntries(
      Object.entries(spec.upkeep).map(([resource, amount]) => [resource, amount * quantity]),
    ),
    numbered,
  );
  const season =
    spec.upkeepSeason === undefined
      ? null
      : ['primavera', 'estate', 'autunno', 'inverno'][spec.upkeepSeason];
  return (
    <section className="phrasebook-building-details" aria-label="Materiali e gestione">
      <h4>Materiali e gestione</h4>
      <dl>
        <div>
          <dt>
            {fire
              ? 'Primo Falò'
              : quantity > 1
                ? 'Materiali per il quartiere'
                : 'Materiali per costruirlo'}
          </dt>
          <dd>
            {resourceList(cost, numbered)}
            {spec.alternativeCost ? ` oppure ${resourceList(spec.alternativeCost, numbered)}` : ''}
          </dd>
        </div>
        <div>
          <dt>Manutenzione di base{season ? ` in ${season}` : ''}</dt>
          <dd>{upkeep || 'Nessun costo stagionale.'}</dd>
        </div>
        <div>
          <dt>Addetti al funzionamento</dt>
          <dd>
            {spec.workers === 0
              ? 'Non richiede addetti dopo la costruzione.'
              : `${numbered ? spec.workers : spec.workers < 5 ? 'Pochi' : 'Molti'} ${spec.workerKind === 'sage' ? 'saggi' : spec.workerKind === 'warrior' ? 'guerrieri' : 'compagni'} al lavoro.`}
          </dd>
        </div>
      </dl>
      {fire && (
        <p>Se il Falò è già presente, questa frase affida a un compagno la cura del fuoco.</p>
      )}
      <p>
        Controlla l’anteprima prima di Pronuncia: bersaglio e regole della tribù possono cambiare
        ciò che serve.
      </p>
    </section>
  );
}

export function Phrasebook({
  state,
  onChange,
  onUse,
  onClose,
  initialTab = 'all',
  draft,
}: {
  state: GameState;
  onChange: (next: GameState) => void;
  onUse: (tokens: string[]) => void;
  onClose: () => void;
  initialTab?: PhrasebookTab;
  draft?: string[];
}) {
  const [tab, setTab] = useState<PhrasebookTab>(initialTab);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<PhraseCategory | 'all'>('all');
  const [showTypes, setShowTypes] = useState(false);
  const [catalogExpanded, setCatalogExpanded] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [message, setMessage] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const resizeButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const resultsPanel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const tabRefs = useRef<Partial<Record<PhrasebookTab, HTMLButtonElement | null>>>({});
  const id = useId();
  useLayoutEffect(() => {
    // A new view starts with its first complete row. Retaining another tab's
    // scroll offset used to leave a clipped, unrelated card below the filters.
    if (resultsPanel.current) resultsPanel.current.scrollTop = 0;
    if (panel.current) panel.current.scrollTop = 0;
  }, [tab, query, category]);
  useLayoutEffect(() => {
    const workbench = document.querySelector<HTMLElement>('.language-workbench');
    const world = document.querySelector<HTMLElement>('.lingus-world');
    const measure = () => {
      const viewport = window.visualViewport;
      const viewTop = viewport?.offsetTop ?? 0;
      const viewBottom = Math.min(
        window.innerHeight,
        viewTop + (viewport?.height ?? window.innerHeight),
      );
      const viewHeight = viewBottom - viewTop;
      const mobile = window.matchMedia('(max-width: 860px)').matches;
      const wide = mobile && window.innerWidth >= 600 && window.innerWidth > viewHeight;
      const workbenchTop = workbench?.getBoundingClientRect().top ?? viewBottom * 0.7;
      const mapTop = world?.getBoundingClientRect().top ?? viewTop + 100;
      const compactTop = wide ? viewTop + 8 : Math.max(viewTop + 8, mapTop + 70);
      // Browsing on a phone temporarily covers the composer. Docking above it
      // would leave less room than the old catalogue when browser bars show.
      let bottom = mobile && !wide ? viewBottom - 8 : Math.min(viewBottom - 8, workbenchTop - 8);
      let room = bottom - compactTop;
      // On short phones the fixed controls alone would consume the whole
      // library. Cover the composer while choosing, then onUse/onClose returns
      // to it; keep a real strip of terrain above the compact catalogue.
      if (mobile && room < 260) {
        bottom = viewBottom - 8;
        room = bottom - compactTop;
      }
      const editing =
        panel.current?.contains(document.activeElement) &&
        document.activeElement?.matches('input, select');
      const reading = catalogExpanded || (mobile && !wide && viewHeight < 500 && editing);
      if (reading) {
        bottom = viewBottom - 8;
        room = bottom - viewTop - 8;
      }
      panel.current?.style.setProperty(
        '--phrasebook-dock-bottom',
        `${Math.max(8, window.innerHeight - bottom)}px`,
      );
      panel.current?.style.setProperty('--phrasebook-room', `${Math.max(100, room)}px`);
      panel.current?.toggleAttribute('data-keyboard-reading', !!reading && !catalogExpanded);
    };
    const observer = new ResizeObserver(measure);
    if (workbench) observer.observe(workbench);
    if (world) observer.observe(world);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);
    window.addEventListener('focusin', measure);
    window.addEventListener('focusout', measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
      window.removeEventListener('focusin', measure);
      window.removeEventListener('focusout', measure);
    };
  }, [catalogExpanded]);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const navigate = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (catalogExpanded) {
          setCatalogExpanded(false);
          resizeButton.current?.focus({ preventScroll: true });
        } else closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !catalogExpanded) return;
      const focusable = Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ) ?? [],
      ).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === heading.current)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (active === last || active === heading.current)) {
        event.preventDefault();
        first?.focus();
      } else if (!panel.current?.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    };
    document.addEventListener('keydown', navigate, true);
    return () => document.removeEventListener('keydown', navigate, true);
  }, [catalogExpanded]);
  const entries = useMemo(() => getPhrasebook(state), [state]);
  const draftFavorite = draft?.length
    ? state.phrasebook?.some(
        (entry) => entry.favorite && entry.tokens.join('|') === draft.join('|'),
      )
    : false;
  const tabEntries = entries.filter((item) =>
    tab === 'construction'
      ? item.category === 'construction'
      : tab === 'favorites'
        ? item.favorite
        : tab === 'recent'
          ? item.used
          : true,
  );
  const categories = [...new Set(tabEntries.map((item) => item.category))];
  const search = query.trim().toLocaleLowerCase('it');
  const results = tabEntries.filter(
    (item) =>
      (category === 'all' || item.category === category) &&
      `${item.title} ${item.description} ${categoryLabels[item.category]} ${item.tokens.map((token) => WORDS[token]?.label).join(' ')}`
        .toLocaleLowerCase('it')
        .includes(search),
  );
  if (tab === 'recent') {
    // Paused commands share the same simulation time. Stored journal order
    // preserves their actual sequence; a favorite must not jump ahead of it.
    const rank = new Map((state.phrasebook ?? []).map((item, index) => [item.id, index]));
    results.sort(
      (a, b) =>
        (b.lastUsedAt ?? -1) - (a.lastUsedAt ?? -1) ||
        (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
  }

  function chooseTab(next: PhrasebookTab, focus = false) {
    setTab(next);
    setCategory('all');
    setShowTypes(false);
    if (focus) tabRefs.current[next]?.focus();
  }
  function toggleFavorite(item: PhrasebookItem) {
    const next = togglePhraseFavorite(state, item.tokens);
    const changed =
      getPhrasebook(next).find((entry) => entry.id === item.id)?.favorite !== item.favorite;
    if (!changed) {
      setMessage(
        'Le preferite occupano tutto il frasario. Rimuovi una stella prima di aggiungere un’altra frase.',
      );
      return;
    }
    onChange(next);
    setMessage(
      `${item.title}: ${item.favorite ? 'rimossa dalle preferite' : 'aggiunta alle preferite'}.`,
    );
    if (tab === 'favorites' && item.favorite) tabRefs.current.favorites?.focus();
  }
  const content = (
    <section
      ref={panel}
      id="game-phrasebook"
      className="phrasebook"
      data-expanded={catalogExpanded}
      role={catalogExpanded ? 'dialog' : undefined}
      aria-modal={catalogExpanded ? true : undefined}
      aria-label="Frasario"
      aria-describedby={`${id}-hint`}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <header className="phrasebook-heading">
        <h2 ref={heading} tabIndex={-1}>
          <BookOpen size={19} aria-hidden="true" /> Frasario
        </h2>
        <div className="phrasebook-window-actions">
          <button
            ref={resizeButton}
            type="button"
            className="phrasebook-resize"
            aria-label={catalogExpanded ? 'Riduci frasario' : 'Espandi frasario'}
            aria-expanded={catalogExpanded}
            aria-controls={`${id}-results`}
            onClick={() => setCatalogExpanded((value) => !value)}
          >
            {catalogExpanded ? (
              <Minimize2 size={16} aria-hidden="true" />
            ) : (
              <Maximize2 size={16} aria-hidden="true" />
            )}
            <span>{catalogExpanded ? 'Riduci' : 'Espandi'}</span>
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Chiudi frasario"
          >
            <X size={19} />
          </button>
        </div>
      </header>
      <p id={`${id}-hint`} className="phrasebook-visually-hidden">
        Richiama una frase senza eseguirla. Poi scegli il bersaglio sulla mappa e premi Pronuncia.
        Le preferite e le frasi usate restano salvate con questa storia.
      </p>
      <div className="phrasebook-tabs" role="tablist" aria-label="Sezioni del frasario">
        {tabs.map((choice) => (
          <button
            key={choice.id}
            ref={(node) => {
              tabRefs.current[choice.id] = node;
            }}
            type="button"
            role="tab"
            id={`${id}-${choice.id}`}
            aria-controls={`${id}-results`}
            aria-selected={tab === choice.id}
            tabIndex={tab === choice.id ? 0 : -1}
            onClick={() => chooseTab(choice.id)}
            onKeyDown={(event) => {
              const index = tabs.findIndex((value) => value.id === tab);
              const next =
                event.key === 'ArrowRight'
                  ? (index + 1) % tabs.length
                  : event.key === 'ArrowLeft'
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? tabs.length - 1
                        : -1;
              if (next < 0) return;
              event.preventDefault();
              chooseTab(tabs[next].id, true);
            }}
          >
            {choice.label}
          </button>
        ))}
      </div>
      <div className="phrasebook-filters">
        <label className="phrasebook-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            aria-label="Cerca nel frasario"
            placeholder="Cerca una frase…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {tab !== 'construction' && categories.length > 1 && (
          <button
            type="button"
            className={`phrasebook-type-toggle ${category !== 'all' ? 'is-filtered' : ''}`}
            aria-label="Filtra per tipo di frase"
            aria-expanded={showTypes}
            aria-controls={`${id}-type-filter`}
            title="Filtra per tipo di frase"
            onClick={() => setShowTypes((value) => !value)}
          >
            <SlidersHorizontal size={17} aria-hidden="true" />
          </button>
        )}
      </div>
      {tab !== 'construction' && categories.length > 1 && (
        <label className="phrasebook-type-filter" id={`${id}-type-filter`} hidden={!showTypes}>
          <span>Tipo di frase</span>
          <select
            aria-label="Tipo di frase"
            value={category}
            onChange={(event) => setCategory(event.target.value as PhraseCategory | 'all')}
          >
            <option value="all">Tutti i tipi</option>
            {categories.map((value) => (
              <option key={value} value={value}>
                {categoryLabels[value]}
              </option>
            ))}
          </select>
        </label>
      )}
      {draft && !draftFavorite && (
        <button
          type="button"
          className="phrasebook-save-draft"
          onClick={() => {
            const next = togglePhraseFavorite(state, draft);
            if (next === state) {
              setMessage(
                'Le preferite occupano tutto il frasario. Rimuovi una stella per fare spazio.',
              );
              return;
            }
            onChange(next);
            setMessage('La frase composta è nelle preferite. Non è stata eseguita.');
          }}
        >
          <Star size={16} aria-hidden="true" /> Salva la frase composta
        </button>
      )}
      <div
        ref={resultsPanel}
        className="phrasebook-results"
        role="tabpanel"
        id={`${id}-results`}
        aria-labelledby={`${id}-${tab}`}
      >
        {results.map((item) => (
          <article
            key={item.id}
            className={`phrasebook-entry ${item.available ? '' : 'is-unavailable'}`}
            aria-label={item.title}
          >
            <div className="phrasebook-entry-heading">
              <h3>
                {item.category === 'construction' ? (
                  <Building2 size={17} aria-hidden="true" />
                ) : item.used ? (
                  <History size={17} aria-hidden="true" />
                ) : null}
                {item.title}
              </h3>
              <div className="phrasebook-entry-actions">
                <button
                  type="button"
                  className={`phrasebook-star ${item.favorite ? 'is-favorite' : ''}`}
                  aria-pressed={item.favorite}
                  aria-label={`${item.favorite ? 'Rimuovi' : 'Aggiungi'} ${item.title} ${item.favorite ? 'dalle' : 'alle'} preferite`}
                  onClick={() => toggleFavorite(item)}
                  title={item.favorite ? 'Rimuovi dalle preferite' : 'Aggiungi alle preferite'}
                >
                  <Star
                    size={17}
                    fill={item.favorite ? 'currentColor' : 'none'}
                    aria-hidden="true"
                  />
                </button>
                <button
                  type="button"
                  className="phrasebook-use"
                  disabled={!item.available}
                  aria-label={`Prepara la frase: ${item.title}`}
                  onClick={() => onUse([...item.tokens])}
                >
                  Prepara <ArrowRight size={15} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="phrasebook-entry-overview">
              <p className="phrasebook-description">{item.description}</p>
              <button
                type="button"
                className="phrasebook-details-toggle"
                aria-label={`Dettagli della frase: ${item.title}`}
                aria-expanded={expanded.has(item.id)}
                aria-controls={`${id}-detail-${item.id}`}
                onClick={() =>
                  setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    return next;
                  })
                }
              >
                <ChevronDown size={18} aria-hidden="true" />
              </button>
            </div>
            {!item.available && <p className="phrasebook-issue">{item.issue}</p>}
            <div
              className="phrasebook-entry-details"
              id={`${id}-detail-${item.id}`}
              hidden={!expanded.has(item.id)}
            >
              <p>{item.description}</p>
              <div className="phrasebook-tokens" aria-label="Parole della frase">
                {item.tokens.map((token, index) => (
                  <span
                    key={`${token}-${index}`}
                    className={hasWord(state, token) ? '' : 'is-lost'}
                  >
                    {index > 0 && <i aria-hidden="true">·</i>}
                    {WORDS[token]?.label}
                  </span>
                ))}
              </div>
              <BuildingDetails state={state} item={item} />
              <p className="phrasebook-preparation-note">
                Prepara la frase, poi scegli il bersaglio. La Voce si spende soltanto con Pronuncia.
              </p>
            </div>
          </article>
        ))}
        {!results.length && (
          <div className="phrasebook-empty">
            <BookOpen size={24} aria-hidden="true" />
            <p>
              {search || category !== 'all'
                ? 'Nessuna frase corrisponde alla ricerca.'
                : tab === 'favorites'
                  ? 'Aggiungi una stella alle frasi che vuoi ritrovare subito.'
                  : tab === 'recent'
                    ? 'Le frasi già pronunciate compariranno qui.'
                    : tab === 'construction'
                      ? 'Le prime costruzioni si riveleranno con nuove parole. Qui troverai le frasi per prepararle.'
                      : 'Le nuove parole e gli ordini della tribù arricchiranno questo frasario.'}
            </p>
            {(search || category !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setCategory('all');
                }}
              >
                Azzera la ricerca
              </button>
            )}
            {!search && category === 'all' && tab === 'construction' && (
              <button type="button" onClick={() => chooseTab('all')}>
                Mostra le frasi note
              </button>
            )}
          </div>
        )}
      </div>
      <p className="phrasebook-visually-hidden" role="status">
        {message}
      </p>
    </section>
  );
  // A separate layer avoids clipping by the composer or its material effects.
  // It remains under .app so era, text-size and contrast preferences apply.
  const layer = (
    <>
      {catalogExpanded && <div className="phrasebook-scrim" aria-hidden="true" />}
      {content}
    </>
  );
  return typeof document === 'undefined'
    ? layer
    : createPortal(layer, document.querySelector('.app') ?? document.body);
}
