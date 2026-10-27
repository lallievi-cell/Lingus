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
        <p>
          {state.campfirePending
            ? 'In Guidata puoi alimentare il Falò con legna consegnata per ottenere più Attenzione.'
            : state.attention >= 10
              ? 'Hai già Attenzione per una lezione: puoi scegliere una parola e premere Tramanda. Preparare altra legna è facoltativo.'
              : 'Non serve attendere la fine della stagione: prepara un breve racconto con legna già consegnata, poi scegli una parola da tramandare.'}{' '}
          Ogni lezione costa Attenzione e forma un nuovo custode. Durante il consiglio, quando tutti
          gli allievi idonei conoscono una parola, il ripasso pagato ne rafforza la memoria.
        </p>
        {hasWord(state, 'S_06') && hasWord(state, 'S_02') && !hasWord(state, 'M_05') && (
          <p>
            Condividere il Falò con un prigioniero o un compagno liberato che ha appena mangiato può
            far riflettere sulla libertà. Devono essere presenti insieme al campo.
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
              I resti presso il campo indeboliscono la coesione. Costruire · Pietra · Morte prepara
              un Tumulo: consegna la pietra e assegna un addetto per celebrare il funerale.
            </p>
          )}
        <button
          className="text-button"
          onClick={state.campfirePending ? onPrepare : onPrepareBrief}
          disabled={!!issue}
          aria-describedby="prepare-story-reason"
        >
          {numbered ? 'Brucia 2 legna · fino a +10 Attenzione' : 'Alimenta il Falò · consuma legna'}
        </button>
        <small id="prepare-story-reason" className={issue ? 'teaching-blocker' : 'teaching-note'}>
          {issue ??
            (state.campfirePending
              ? 'Il costo prepara Attenzione per questo consiglio.'
              : 'Questo prepara una lezione ordinaria: il tempo e la stagione non avanzano.')}
        </small>
      </div>
    </div>
  );
}
