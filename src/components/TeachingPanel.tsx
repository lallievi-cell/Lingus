import { useState } from 'react';
import { ArrowRight, BookOpen, MapPin, Search, ShieldAlert } from 'lucide-react';
import { INNATE_WORDS, WORD_ORDER, WORDS } from '../game/content';
import { canRehearseWord } from '../game/guidedProgression';
import { hasLearningBalance } from '../game/learningBalance';
import { getCustodianStatuses } from '../game/custodianStatus';
import { rehearseWord, teachWord } from '../game/engine';
import { getLessonPreview, lessonIssueText } from '../game/teaching';
import { hasWord } from '../game/runtime';
import type { GameState, Target, Unit } from '../game/types';
import { Glyph } from './Glyph';
import { LessonPlanner } from './LessonPlanner';
import { lifeStageLabel, visibleUnitName } from './unitReadability';
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
  initialWordId,
}: {
  state: GameState;
  onChange: (next: GameState) => void;
  onFocus?: (target: Target) => void;
  initialWordId?: string;
}) {
  const [filter, setFilter] = useState<'all' | 'risk' | 'pupils'>('all');
  const [search, setSearch] = useState(initialWordId ? (WORDS[initialWordId]?.label ?? '') : '');
  const [outcome, setOutcome] = useState<{
    wordId: string;
    pupilIds?: string[];
    rehearsal?: boolean;
  } | null>(null);
  const numbered = hasWord(state, 'O_08');
  const balanced = hasLearningBalance(state);
  const sharedRound = state.playMode === 'guided';
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
  const participants = (people: Unit[]) =>
    people.length === 1
      ? person(people[0])
      : people
          .map((unit) => (hasWord(state, 'S_02') ? visibleUnitName(state, unit) : person(unit)))
          .join(', ');
  const completedPupils = (outcome?.pupilIds ?? []).flatMap((id) => {
    const unit = state.units.find((person) => person.id === id);
    return unit ? [unit] : [];
  });
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
      <div className="lesson-section-heading">
        <div>
          <h3>{known.length ? 'Quale parola proteggiamo?' : 'Le prime storie'}</h3>
        </div>
        <p className="lesson-budget" role="status" aria-live="polite">
          {fundedLessons === 0
            ? 'Serve Attenzione'
            : fundedLessons === 1
              ? 'Un racconto disponibile'
              : numbered
                ? `${fundedLessons} racconti disponibili`
                : 'Spazio per più racconti'}
        </p>
      </div>
      {outcome && (
        <p className="teaching-outcome" role="status">
          {outcome.rehearsal
            ? `«${WORDS[outcome.wordId].label}»: il ripasso ha rafforzato la memoria dei custodi.`
            : `«${WORDS[outcome.wordId].label}» è ora custodita anche da ${completedPupils.length ? participants(completedPupils) : 'una nuova voce'}.`}
        </p>
      )}
      {!known.length && (
        <p className="teaching-empty">
          Le parole innate sono già condivise. Quando scopri una nuova parola potrai affidarla ad
          altre voci.
        </p>
      )}
      {(known.length > 5 || search.length > 0) && (
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
              placeholder="Trova una parola"
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
          const newCustodians =
            preview.pupils.length > 1
              ? numbered
                ? `${preview.pupils.length} nuovi custodi`
                : 'nuovi custodi'
              : 'un nuovo custode';
          const reason = preview.allowed
            ? preview.retentionGain > 0
              ? numbered
                ? `Forma ${newCustodians} e recupera fino a ${Math.round(preview.retentionGain * 10) / 10} punti di memoria.`
                : `Forma ${newCustodians} e rafforza la memoria.`
              : `La memoria è già salda, ma la lezione la affida a ${newCustodians}.`
            : rehearse
              ? 'Non ci sono nuovi allievi disponibili. Puoi spendere Attenzione per ripassare la parola e rafforzarne la memoria.'
              : preview.issue === 'no-pupil' && memory.retention >= 100
                ? 'Non ci sono nuovi allievi disponibili e la memoria è già piena: non serve un’altra lezione.'
                : preview.issue === 'no-attention' && state.playMode !== 'guided'
                  ? 'Manca Attenzione per una lezione. Si rinnova al consiglio grazie al legno bruciato e agli anziani presenti. La fame la riduce.'
                  : lessonIssueText(preview.issue);
          return (
            <article
              className={`teaching-row lesson-card ${custodian ? 'last-custodian-word' : ''} ${custodian?.risk === 'critical' ? 'lesson-critical' : ''}`}
              key={id}
              aria-label={`Parola da tramandare: ${WORDS[id].label}`}
            >
              <div className="lesson-card-heading">
                <span className="lesson-glyph">
                  <Glyph id={id} size={24} />
                </span>
                <div>
                  <h4>{WORDS[id].label}</h4>
                  <span className="lesson-memory-label">
                    {numbered
                      ? `${preview.livingCustodians} ${preview.livingCustodians === 1 ? 'custode' : 'custodi'} · ${Math.round(memory.retention)}% di memoria`
                      : `${custodian ? 'Unica voce' : preview.livingCustodians > 3 ? 'Molti custodi' : 'Pochi custodi'} · ${memory.retention > 70 ? 'memoria salda' : memory.retention >= 30 ? 'memoria fragile' : 'memoria in pericolo'}`}
                  </span>
                </div>
                {custodian && (
                  <ShieldAlert
                    size={17}
                    className={`lesson-risk-icon ${custodian.risk}`}
                    aria-label="Ultimo custode"
                  />
                )}
              </div>

              <div className="lesson-people">
                <span>
                  <b>{preview.teachers.length > 1 ? 'Raccontano:' : 'Racconta:'}</b>{' '}
                  {preview.teachers.length
                    ? participants(preview.teachers)
                    : person(preview.teacher)}
                  {preview.teacher && onFocus && (
                    <button
                      className="text-button lesson-person-focus"
                      onClick={() => onFocus(personTarget(preview.teacher!))}
                      aria-label={`Mostra custode di ${WORDS[id].label}`}
                    >
                      <MapPin size={15} />
                    </button>
                  )}
                </span>
                <ArrowRight size={15} aria-hidden="true" className="lesson-transfer-arrow" />
                <span>
                  <b>{preview.pupils.length > 1 ? 'Impareranno:' : 'Imparerà:'}</b>{' '}
                  {preview.pupils.length ? participants(preview.pupils) : person(preview.pupil)}
                </span>
              </div>
              <div className="lesson-card-action">
                <small
                  className={preview.allowed || rehearse ? 'teaching-note' : 'teaching-blocker'}
                  id={reasonId}
                >
                  {reason}
                </small>
                <button
                  className="teach-button"
                  disabled={!preview.allowed && !rehearse}
                  aria-describedby={reasonId}
                  onClick={() => {
                    const next = preview.allowed ? teachWord(state, id) : rehearseWord(state, id);
                    if (next.stats.taught > state.stats.taught)
                      setOutcome({ wordId: id, pupilIds: preview.pupils.map((pupil) => pupil.id) });
                    else if (next.attention < state.attention)
                      setOutcome({ wordId: id, rehearsal: true });
                    onChange(next);
                  }}
                >
                  <span>{preview.allowed || !rehearse ? 'Tramanda' : 'Ripassa'}</span>
                  <small>
                    {numbered ? `${preview.attentionCost} Attenzione` : 'Consuma Attenzione'}
                  </small>
                </button>
              </div>
              {balanced && PRACTICAL_KNOWLEDGE[id] && (
                <p className="lesson-purpose">{PRACTICAL_KNOWLEDGE[id]}</p>
              )}
            </article>
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
      <LessonPlanner state={state} onChange={onChange} />
      <details className="lesson-explanation lesson-rules">
        <summary>
          <BookOpen size={16} /> Come tramandare una parola
        </summary>
        <p>
          Scegli una parola e controlla chi la racconta e chi la imparerà. Tramanda crea una nuova
          voce capace di custodirla anche dopo il maestro.
        </p>
        <p>
          {sharedRound
            ? 'Più custodi già presenti possono insegnare insieme, fino a tre nuovi allievi per racconto. Le coppie aggiuntive devono essere vicine allo stesso Falò acceso. I nuovi custodi insegneranno dal racconto successivo.'
            : 'Ogni lezione affida la parola a un nuovo custode.'}{' '}
          I bambini hanno la precedenza.
        </p>
        {balanced && (
          <p>
            Nel primo anno, tramandare una parola fondamentale dal suo ultimo custode ne rafforza
            anche la memoria. Una parola salda può ancora aver bisogno di un secondo custode.
          </p>
        )}
        {balanced && hasWord(state, 'O_05') && (
          <p>
            Il calore di un Falò vissuto dai suoi custodi aiuta a conservare la memoria del Fuoco.
          </p>
        )}
      </details>
    </section>
  );
}
