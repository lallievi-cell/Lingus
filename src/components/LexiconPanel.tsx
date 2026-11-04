import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  Flame,
  LockKeyhole,
  MapPin,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import { cognitiveSlots } from '../game/grammar';
import { WORD_ORDER, WORDS } from '../game/content';
import { getKnowledgeLineage } from '../game/knowledgeLineage';
import { hasWord } from '../game/runtime';
import type { GameState, WordKind } from '../game/types';
import { Glyph } from './Glyph';
import { forgottenWordHint } from './TribeEvents';
import { getLexiconEntries, LEXICON_KIND_NAMES, type LexiconView } from './lexiconPresentation';
import './LexiconPanel.css';

export function LexiconPanel({
  state,
  onPrepareStele,
  onOpenCampfire,
  onFocusUnit,
  initialSearch = '',
}: {
  state: GameState;
  onPrepareStele?: (wordId: string) => void;
  onOpenCampfire?: (wordId: string) => void;
  onFocusUnit?: (unitId: string) => void;
  initialSearch?: string;
}) {
  const [search, setSearch] = useState(initialSearch);
  const [view, setView] = useState<LexiconView>('known');
  const [kind, setKind] = useState<WordKind | 'all'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => {
    setSearch(initialSearch);
    setView('known');
    setExpanded(
      WORD_ORDER.find(
        (id) => WORDS[id].label.toLocaleLowerCase('it') === initialSearch.toLocaleLowerCase('it'),
      ) ?? null,
    );
  }, [initialSearch]);
  const numbered = hasWord(state, 'O_08');
  const all = useMemo(() => getLexiconEntries(state, { view: 'all' }), [state]);
  const entries = useMemo(
    () => getLexiconEntries(state, { view, kind, search }),
    [state, view, kind, search],
  );
  const lineage = useMemo(
    () => new Map(getKnowledgeLineage(state).map((entry) => [entry.wordId, entry])),
    [state],
  );
  const riskCount = all.filter((entry) => entry.atRisk).length;
  const knownCount = WORD_ORDER.filter((id) => hasWord(state, id)).length;
  return (
    <section className="lexicon-panel" aria-label="Consulta le parole della tribù">
      <div className="lexicon-panel-overview">
        <p>{numbered ? `${knownCount} parole vive` : 'Il sapere vive nelle persone.'}</p>
        <span>{cognitiveSlots(state)} spazi di pensiero</span>
      </div>
      <div className="lexicon-panel-search">
        <label>
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            aria-label="Cerca nel lessico"
            placeholder="Trova una parola"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <select
          aria-label="Tipo di parola"
          value={kind}
          onChange={(event) => setKind(event.target.value as WordKind | 'all')}
        >
          <option value="all">Tutti i tipi</option>
          <option value="S">Soggetti</option>
          <option value="V">Azioni</option>
          <option value="O">Materie</option>
          <option value="M">Concetti</option>
          <option value="C">Condizioni</option>
        </select>
      </div>
      <div className="lexicon-panel-filters" role="group" aria-label="Stato delle parole">
        {(
          [
            ['known', 'Note'],
            ['risk', 'A rischio'],
            ['lost', 'Perdute'],
            ['all', 'Tutte'],
          ] as const
        ).map(([value, label]) => (
          <button key={value} aria-pressed={view === value} onClick={() => setView(value)}>
            {label}
          </button>
        ))}
      </div>
      {riskCount > 0 && view !== 'risk' && (
        <button
          className="lexicon-panel-risk"
          onClick={() => {
            setView('risk');
            setSearch('');
            setKind('all');
          }}
        >
          <ShieldAlert size={17} aria-hidden="true" />
          <span>
            {numbered
              ? `${riskCount} ${riskCount === 1 ? 'parola da proteggere' : 'parole da proteggere'}`
              : 'Ci sono parole da proteggere'}
          </span>
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      )}
      <div className="lexicon-panel-list" aria-label="Parole del lessico">
        {entries.map((entry) => {
          const word = WORDS[entry.id],
            opened = expanded === entry.id,
            history = lineage.get(entry.id);
          const retention = Math.max(0, Math.min(100, entry.memory?.retention ?? 0));
          return (
            <article key={entry.id} className={`lexicon-panel-entry condition-${entry.condition}`}>
              <button
                className="lexicon-panel-word"
                aria-expanded={opened}
                aria-controls={`lexicon-detail-${entry.id}`}
                onClick={() => setExpanded(opened ? null : entry.id)}
              >
                <span className={`lexicon-panel-glyph kind-${entry.kind}`}>
                  {entry.known || entry.lost ? (
                    <Glyph id={entry.id} size={21} />
                  ) : (
                    <LockKeyhole size={19} aria-hidden="true" />
                  )}
                </span>
                <span className="lexicon-panel-name">
                  <strong>{entry.label}</strong>
                  <small>
                    {entry.condition === 'unknown' ? word.event : LEXICON_KIND_NAMES[entry.kind]}
                  </small>
                </span>
                <span className="lexicon-panel-state">{entry.status}</span>
                <ChevronDown size={16} aria-hidden="true" />
              </button>
              {opened && (
                <div className="lexicon-panel-detail" id={`lexicon-detail-${entry.id}`}>
                  <p className="lexicon-panel-description">
                    {entry.known || entry.lost ? word.description : word.event}
                  </p>
                  {entry.innate ? (
                    <p className="lexicon-panel-note">La tribù conosce questa parola da sempre.</p>
                  ) : entry.lost ? (
                    <div className="lexicon-panel-recovery">
                      <BookOpen size={17} aria-hidden="true" />
                      <p>{forgottenWordHint(state, entry.id)}</p>
                    </div>
                  ) : !entry.known ? (
                    <p className="lexicon-panel-note">{word.hint}</p>
                  ) : (
                    <>
                      {entry.atRisk && (
                        <p className="lexicon-panel-care">
                          {history?.soleCustodian
                            ? history.risk === 'critical'
                              ? 'L’unica voce che custodisce questa parola è in pericolo. Proteggila e prepara un nuovo custode.'
                              : history.risk === 'ageing'
                                ? 'Questa parola è affidata a una sola persona anziana. Tramandala prima che la sua voce si spenga.'
                                : 'Questa parola vive in una sola voce. Condividerla la protegge dalla perdita del suo custode.'
                            : entry.custodianIds.length === 0
                              ? 'Non risultano custodi viventi: controlla il sostegno della scrittura e la memoria della parola.'
                              : 'La memoria di questa parola si sta indebolendo. Tramandarla può rafforzarla.'}
                        </p>
                      )}
                      <div className="lexicon-panel-retention">
                        <div>
                          <span>Memoria</span>
                          <strong>
                            {numbered
                              ? `${Math.round(retention)}%`
                              : retention > 70
                                ? 'Salda'
                                : retention >= 30
                                  ? 'Fragile'
                                  : 'In pericolo'}
                          </strong>
                        </div>
                        <span className="lexicon-panel-meter" aria-hidden="true">
                          <span style={{ width: `${retention}%` }} />
                        </span>
                      </div>
                      <div className="lexicon-panel-custodians">
                        <strong>
                          {entry.custodianIds.length === 1
                            ? 'Chi custodisce la parola'
                            : 'Chi la custodisce'}
                        </strong>
                        {history?.custodians.length ? (
                          <div className="lexicon-panel-people">
                            {history.custodians.map((person) =>
                              onFocusUnit ? (
                                <button key={person.id} onClick={() => onFocusUnit(person.id)}>
                                  <MapPin size={14} aria-hidden="true" />
                                  {person.label}
                                </button>
                              ) : (
                                <span key={person.id}>{person.label}</span>
                              ),
                            )}
                          </div>
                        ) : (
                          <p>Non risultano custodi viventi.</p>
                        )}
                      </div>
                      {onOpenCampfire && (
                        <button
                          className="lexicon-panel-teach"
                          onClick={() => onOpenCampfire(entry.id)}
                        >
                          <Flame size={17} aria-hidden="true" />
                          Tramanda al Falò
                          <ArrowRight size={16} aria-hidden="true" />
                        </button>
                      )}
                      {history &&
                        (history.firstCustodian ||
                          history.transmissions.length > 0 ||
                          history.history.length > 0) && (
                          <details className="lexicon-panel-history">
                            <summary>Origine e trasmissioni</summary>
                            <div>
                              {history.firstCustodian && (
                                <p>
                                  La prima voce: <strong>{history.firstCustodian.label}</strong>.
                                </p>
                              )}
                              {history.transmissions.map((lesson) => (
                                <p key={lesson.id}>{lesson.text}</p>
                              ))}
                              {history.history.map((event) => (
                                <p key={event.id}>{event.text}</p>
                              ))}
                            </div>
                          </details>
                        )}
                      {onPrepareStele && hasWord(state, 'O_09') && hasWord(state, 'V_06') && (
                        <button
                          className="lexicon-panel-stele"
                          onClick={() => onPrepareStele(entry.id)}
                        >
                          <BookOpen size={16} aria-hidden="true" />
                          Prepara una stele
                          <ArrowRight size={16} aria-hidden="true" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {entries.length === 0 && (
        <div className="lexicon-panel-empty">
          <BookOpen size={28} aria-hidden="true" />
          <strong>
            {view === 'risk' && !search && kind === 'all'
              ? 'Il sapere è al sicuro'
              : view === 'lost' && !search && kind === 'all'
                ? 'Nessuna parola perduta'
                : 'Nessuna parola corrispondente'}
          </strong>
          <p>
            {view === 'risk' && !search && kind === 'all'
              ? 'Continua a condividere le parole con nuove voci.'
              : 'Cambia ricerca o filtri per esplorare il lessico.'}
          </p>
          <button
            onClick={() => {
              setSearch('');
              setKind('all');
              setView('known');
            }}
          >
            <X size={15} aria-hidden="true" />
            Azzera i filtri
          </button>
        </div>
      )}
    </section>
  );
}
