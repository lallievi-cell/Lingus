import { Flame } from 'lucide-react';
import { hasWord } from '../game/runtime';
import type { GameState } from '../game/types';
import { briefLessonIssue, councilPreparationIssue } from '../game/teaching';

export function GuidedCouncil({
  state,
  onPrepare,
  onPrepareBrief,
}: {
  state: GameState;
  onPrepare: () => void;
  onPrepareBrief?: () => void;
}) {
  if (state.playMode !== 'guided' || (!state.campfirePending && !onPrepareBrief)) return null;
  const numbered = hasWord(state, 'O_08');
  const issue = state.campfirePending ? councilPreparationIssue(state) : briefLessonIssue(state);
  return (
    <div className="guide-note guided-council">
      <Flame size={18} />
      <div>
        <strong>
          {state.campfirePending ? 'Prepara il racconto' : 'Puoi tramandare già adesso'}
        </strong>
        <details className="fuel-preparation" open={state.attention < 10 || undefined}>
          <summary>
            {state.attention >= 10
              ? 'Prepara Attenzione per altre lezioni'
              : 'Prepara l’Attenzione per insegnare'}
          </summary>
          <details className="story-explanation">
            <summary>Come funziona l’Attenzione</summary>
            <p>
              {state.campfirePending
                ? 'In Guidata puoi bruciare il legno delle scorte per ottenere più Attenzione al consiglio.'
                : state.attention >= 10
                  ? 'Hai già Attenzione per una lezione: puoi scegliere una parola e premere Tramanda. Preparare altra legna è facoltativo.'
                  : 'Non serve aspettare la fine della stagione. Usa il legno delle scorte per preparare un racconto, poi scegli una parola da tramandare.'}{' '}
              Ogni lezione spende Attenzione e forma un nuovo custode. Durante il consiglio puoi
              anche ripassare una parola già nota a tutti gli allievi: spendi Attenzione per
              rafforzarne la memoria.
            </p>
            {hasWord(state, 'S_06') && hasWord(state, 'S_02') && !hasWord(state, 'M_05') && (
              <p>
                Condividere il Falò con un prigioniero o un compagno liberato può far nascere il
                pensiero della libertà. Devono trovarsi insieme al campo, dopo che il prigioniero o
                il compagno liberato ha mangiato.
              </p>
            )}
            {['V_08', 'O_02', 'O_06'].every((id) => hasWord(state, id)) &&
              state.entities.some(
                (entity) =>
                  entity.kind === 'corpse' &&
                  entity.amount > 0 &&
                  Math.hypot(entity.x - state.home.x, entity.y - state.home.y) <= 30,
              ) && (
                <p>
                  I resti presso il campo indeboliscono la coesione. Costruire · Pietra · Morte
                  prepara un Tumulo: consegna la pietra e assegna un addetto per celebrare il
                  funerale.
                </p>
              )}
          </details>
          <button
            className="text-button"
            onClick={state.campfirePending ? onPrepare : onPrepareBrief}
            disabled={!!issue}
            aria-describedby="prepare-story-reason"
          >
            {numbered
              ? 'Brucia 2 unità di legno · fino a +10 Attenzione'
              : 'Alimenta il Falò · consuma legno'}
          </button>
          <small id="prepare-story-reason" className={issue ? 'teaching-blocker' : 'teaching-note'}>
            {issue ??
              (state.campfirePending
                ? 'Il legno viene consumato subito. L’Attenzione sarà disponibile in questo consiglio.'
                : 'Il legno viene consumato subito. Puoi usare l’Attenzione per insegnare senza aspettare il consiglio.')}
          </small>
        </details>
      </div>
    </div>
  );
}
