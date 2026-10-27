import { useState } from 'react';
import { BookOpen, MapPin, MessageCircle } from 'lucide-react';
import { INNATE_WORDS, WORD_ORDER, WORDS } from '../game/content';
import { canRehearseWord } from '../game/guidedProgression';
import { getCustodianStatuses } from '../game/custodianStatus';
import { rehearseWord, teachWord } from '../game/engine';
import { getLessonPreview, lessonIssueText } from '../game/teaching';
import { hasWord } from '../game/runtime';
import type { GameState, Target, Unit } from '../game/types';
import { Glyph } from './Glyph';
import { lifeStageLabel, visibleUnitName } from './unitReadability';
import './TeachingPanel.css';

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
  const [outcome, setOutcome] = useState<{
    wordId: string;
    pupilId?: string;
    rehearsal?: boolean;
  } | null>(null);
  const numbered = hasWord(state, 'O_08');
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
  return (
    <section className="teaching-panel" aria-label="Trasmettere le parole">
      <div className="first-lesson-help">
        <BookOpen size={17} />
        <div>
          <strong>
            {state.stats.taught === 0
              ? 'La prima parola da affidare'
              : 'Ogni lezione aggiunge un custode'}
          </strong>
          <p>
            {state.stats.taught === 0
              ? 'Scegli una parola custodita da una sola persona. Controlla chi la racconta e chi la imparerà, poi premi Tramanda. La nuova voce continuerà a custodirla anche dopo il maestro.'
              : 'Proteggi prima gli ultimi custodi. La memoria piena non sostituisce un secondo custode: puoi insegnare anche una parola già salda.'}
          </p>
          <small>
            {numbered
              ? 'Ogni lezione costa 10 Attenzione. I bambini apprendono per primi.'
              : 'Ogni lezione consuma Attenzione. I bambini apprendono per primi.'}
          </small>
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
      <div className="teaching-list">
        {known.map((id) => {
          const memory = state.words[id],
            preview = getLessonPreview(state, id),
            custodian = custodians.get(id),
            rehearse = canRehearseWord(state, id);
          const reasonId = `lesson-reason-${id}`;
          const reason = preview.allowed
            ? preview.retentionGain > 0
              ? numbered
                ? `Nuovo custode e fino a +${Math.round(preview.retentionGain * 10) / 10} memoria.`
                : 'Forma un nuovo custode e rafforza la memoria.'
              : 'La memoria è già piena: la lezione forma comunque un nuovo custode.'
            : rehearse
              ? 'Tutti gli allievi conoscono la parola: puoi pagare un ripasso per rafforzare i custodi.'
              : preview.issue === 'no-pupil' && memory.retention >= 100
                ? 'Tutti gli allievi idonei conoscono la parola e la memoria è già piena.'
                : preview.issue === 'no-attention' && state.playMode !== 'guided'
                  ? 'Manca Attenzione per una lezione. Si rinnova al consiglio stagionale con legna bruciata e anziani; la fame la riduce.'
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
                {custodian && (
                  <span className={`teaching-custodian ${custodian.risk}`}>
                    <MessageCircle size={10} /> Ultimo custode: {custodian.displayName}
                  </span>
                )}
                <span>
                  {numbered
                    ? preview.livingCustodians
                    : preview.livingCustodians > 3
                      ? 'Molti'
                      : 'Pochi'}{' '}
                  custodi · Memoria{' '}
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
    </section>
  );
}
