import { useState } from 'react';
import { BookOpen, MapPin, MessageCircle, Search } from 'lucide-react';
import { INNATE_WORDS, WORD_ORDER, WORDS } from '../game/content';
import { canRehearseWord } from '../game/guidedProgression';
import { hasLearningBalance } from '../game/learningBalance';
import { getCustodianStatuses } from '../game/custodianStatus';
import { rehearseWord, teachWord } from '../game/engine';
import { getLessonPreview, lessonIssueText } from '../game/teaching';
import { hasWord } from '../game/runtime';
import type { GameState, Target, Unit } from '../game/types';
import { Glyph } from './Glyph';
import { lastCustodianLabel, lifeStageLabel, visibleUnitName } from './unitReadability';
import './TeachingPanel.css';

const PRACTICAL_KNOWLEDGE: Record<string, string> = {
  S_02: 'Scegliere una persona e seguirne la storia.',
  O_01: 'Ritrovare il luogo a cui tornare e consegnare le risorse.',
  V_04: 'Rifornire il campo con cibo e materiali.',
  O_02: 'Riconoscere e distinguere le pietre utilizzabili.',
  O_03: 'Riconoscere il materiale raccolto dagli alberi.',
  M_01: 'Riconoscere una minaccia e sapere quando fuggire.',
  C_01: 'Riconoscere il buio e organizzare le attività.',
  O_04: 'Riconoscere ciò che può nutrire la tribù.',
  M_02: 'Prevedere i bisogni e preparare scorte.',
  V_05: 'Custodire le risorse e proteggere ciò che conta.',
  V_06: 'Fabbricare utensili e armi.',
  O_05: 'Scaldare la comunità e condividere il sapere.',
  V_07: 'Preparare pasti più sicuri e duraturi.',
  V_08: 'Preparare edifici e ripari per la comunità.',
  O_06: 'Riconoscere la perdita di una vita e prendersi cura dei resti.',
  M_03: 'Dare una regola condivisa ai timori della comunità.',
};

/** Explains the exact ordinary lesson; no lesson is auto-selected or prepaid. */
export function TeachingPanel({
  state,
  onChange,
  onFocus,
}: {
  state: GameState;
  onChange: (next: GameState) => void;
  onFocus?: (target: Target) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'risk' | 'pupils'>('all');
  const [search, setSearch] = useState('');
  const [outcome, setOutcome] = useState<{
    wordId: string;
    pupilId?: string;
    rehearsal?: boolean;
  } | null>(null);
  const numbered = hasWord(state, 'O_08');
  const balanced = hasLearningBalance(state);
  const fundedLessons = Math.floor(state.attention / 10);
  const custodians = new Map(
    getCustodianStatuses(state).flatMap((status) =>
      status.wordIds.map((id) => [id, status] as const),
    ),
  );
  const known = WORD_ORDER.filter((id) => hasWord(state, id) && !INNATE_WORDS.includes(id)).sort(
    (a, b) => {
      const rank = (id: string) =>
        custodians.get(id)?.risk === 'critical'
          ? 0
          : custodians.get(id)?.risk === 'ageing'
            ? 1
            : custodians.has(id)
              ? 2
              : 3;
      return rank(a) - rank(b) || state.words[a].retention - state.words[b].retention;
    },
  );
  const person = (unit: Unit | undefined) =>
    unit
      ? `${visibleUnitName(state, unit)} · ${lifeStageLabel(unit).toLocaleLowerCase('it')}`
      : 'Nessuno disponibile';
  const personTarget = (unit: Unit): Target => ({
    type: 'unit',
    id: unit.id,
    x: unit.x,
    y: unit.y,
  });
  const completedPupil = outcome?.pupilId
    ? state.units.find((u) => u.id === outcome.pupilId)
    : undefined;
  const shown = known.filter((id) => {
    if (!WORDS[id].label.toLocaleLowerCase('it').includes(search.trim().toLocaleLowerCase('it')))
      return false;
    if (filter === 'risk') return custodians.has(id) || state.words[id].retention < 30;
    if (filter === 'pupils') {
      const preview = getLessonPreview(state, id);
      return !!preview.teacher && !!preview.pupil;
    }
    return true;
  });
  return (
    <section className="teaching-panel" aria-label="Trasmettere le parole">
      <div className="first-lesson-help">
        <BookOpen size={17} />
        <div>
          <details className="lesson-explanation">
            <summary>
              <strong>
                {state.stats.taught === 0
                  ? 'La prima parola da affidare'
                  : 'Ogni lezione aggiunge un custode'}
              </strong>
            </summary>
            <p>
              {state.stats.taught === 0
                ? 'Scegli una parola custodita da una sola persona. Controlla chi la racconta e chi la imparerà, poi premi Tramanda. La nuova voce continuerà a custodirla anche dopo il maestro.'
                : 'Proteggi prima gli ultimi custodi. La memoria piena non sostituisce un secondo custode: puoi insegnare anche una parola già salda.'}
            </p>
            {balanced && (
              <p>
                Nel primo anno, tramandare una parola fondamentale dal suo ultimo custode rafforza
                la memoria e aggiunge una nuova voce. Scegli quali capacità conservare per il futuro
                della tribù.
              </p>
            )}
            {balanced && hasWord(state, 'O_05') && (
              <p>
                Quando un custode beneficia davvero del calore, la memoria del Fuoco si rafforza. Le
                parole vissute ogni giorno sono più facili da conservare.
              </p>
            )}
          </details>
          <small>
            {numbered
              ? 'Ogni lezione costa 10 punti Attenzione. I bambini hanno la precedenza.'
              : 'Ogni lezione consuma Attenzione. I bambini hanno la precedenza.'}
          </small>
          {balanced && (
            <p className="lesson-budget" role="status" aria-live="polite">
              {fundedLessons === 0
                ? 'Serve altra Attenzione per una lezione.'
                : fundedLessons === 1
                  ? 'Attenzione per una lezione.'
                  : numbered
                    ? `Attenzione per ${fundedLessons} lezioni.`
                    : 'Attenzione per più lezioni.'}
            </p>
          )}
        </div>
      </div>
      {outcome && (
        <p className="teaching-outcome" role="status">
          {outcome.rehearsal
            ? `«${WORDS[outcome.wordId].label}»: il ripasso ha rafforzato la memoria dei custodi.`
            : `«${WORDS[outcome.wordId].label}» è ora custodita anche da ${completedPupil ? person(completedPupil) : 'una nuova voce'}.`}
        </p>
      )}
      {!known.length && (
        <p className="teaching-empty">
          Le parole innate sono già condivise. Quando scopri una nuova parola potrai affidarla ad
          altre voci.
        </p>
      )}
      {known.length > 0 && (
        <div className="lesson-tools">
          <div role="group" aria-label="Filtra le lezioni">
            {(
              [
                ['all', 'Tutte'],
                ['risk', 'A rischio'],
                ['pupils', 'Da insegnare'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className="text-button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="lesson-search">
            <Search size={16} />
            <input
              type="search"
              aria-label="Cerca una parola da tramandare"
              placeholder="Quale parola vuoi proteggere?"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
      )}
      <div className="teaching-list">
        {shown.map((id) => {
          const memory = state.words[id],
            preview = getLessonPreview(state, id),
            custodian = custodians.get(id),
            rehearse = canRehearseWord(state, id);
          const reasonId = `lesson-reason-${id}`;
          const reason = preview.allowed
            ? preview.retentionGain > 0
              ? numbered
                ? `Forma un nuovo custode e recupera fino a ${Math.round(preview.retentionGain * 10) / 10} punti di memoria.`
                : 'Forma un nuovo custode e rafforza la memoria.'
              : 'La memoria è già salda, ma la lezione la affida a un nuovo custode.'
            : rehearse
              ? 'Non ci sono nuovi allievi disponibili. Puoi spendere Attenzione per ripassare la parola e rafforzarne la memoria.'
              : preview.issue === 'no-pupil' && memory.retention >= 100
                ? 'Non ci sono nuovi allievi disponibili e la memoria è già piena: non serve un’altra lezione.'
                : preview.issue === 'no-attention' && state.playMode !== 'guided'
                  ? 'Manca Attenzione per una lezione. Si rinnova al consiglio grazie al legno bruciato e agli anziani presenti. La fame la riduce.'
                  : lessonIssueText(preview.issue);
          return (
            <div
              className={`teaching-row ${custodian ? 'last-custodian-word' : ''}`}
              key={id}
              aria-label={`Parola da tramandare: ${WORDS[id].label}`}
            >
              <Glyph id={id} size={23} />
              <div className="teaching-word-details">
                <strong>{WORDS[id].label}</strong>
                {balanced && PRACTICAL_KNOWLEDGE[id] && (
                  <span className="lesson-purpose">{PRACTICAL_KNOWLEDGE[id]}</span>
                )}
                {custodian && (
                  <span className={`teaching-custodian ${custodian.risk}`}>
                    <MessageCircle size={10} />
                    {lastCustodianLabel(
                      state.units.find((unit) => unit.id === custodian.unitId),
                    )}: {custodian.displayName}
                  </span>
                )}
                <span>
                  {numbered
                    ? preview.livingCustodians
                    : preview.livingCustodians > 3
                      ? 'Molti'
                      : 'Pochi'}{' '}
                  {numbered && preview.livingCustodians === 1 ? 'custode' : 'custodi'} · Memoria{' '}
                  {numbered
                    ? `${Math.round(memory.retention)}%`
                    : memory.retention > 70
                      ? 'Salda'
                      : memory.retention >= 30
                        ? 'Fragile'
                        : 'In pericolo'}
                </span>
                <span className="meter">
                  <span style={{ width: `${memory.retention}%` }} />
                </span>
                <div className="lesson-people">
                  <span>
                    <b>Racconta:</b> {person(preview.teacher)}
                    {preview.teacher && onFocus && (
                      <button
                        className="text-button lesson-person-focus"
                        onClick={() => onFocus(personTarget(preview.teacher!))}
                        aria-label={`Mostra custode di ${WORDS[id].label}`}
                      >
                        <MapPin size={11} />
                      </button>
                    )}
                  </span>
                  <span>
                    <b>Imparerà:</b> {person(preview.pupil)}
                  </span>
                </div>
                <small
                  className={preview.allowed || rehearse ? 'teaching-note' : 'teaching-blocker'}
                  id={reasonId}
                >
                  {reason}
                </small>
              </div>
              <button
                className="teach-button"
                disabled={!preview.allowed && !rehearse}
                aria-describedby={reasonId}
                onClick={() => {
                  const next = preview.allowed ? teachWord(state, id) : rehearseWord(state, id);
                  if (next.stats.taught > state.stats.taught)
                    setOutcome({ wordId: id, pupilId: preview.pupil?.id });
                  else if (next.attention < state.attention)
                    setOutcome({ wordId: id, rehearsal: true });
                  onChange(next);
                }}
              >
                {preview.allowed || !rehearse ? 'Tramanda' : 'Ripassa'}
                <small>{numbered ? '10 Attenzione' : 'Consuma Attenzione'}</small>
              </button>
            </div>
          );
        })}
      </div>
      {known.length > 0 && !shown.length && (
        <p className="teaching-empty" role="status">
          Nessuna parola corrisponde a questa scelta.{' '}
          <button
            className="text-button"
            onClick={() => {
              setSearch('');
              setFilter('all');
            }}
          >
            Mostra tutte le lezioni
          </button>
        </p>
      )}
    </section>
  );
}
