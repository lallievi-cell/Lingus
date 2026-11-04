import { Flame, Plus } from 'lucide-react';
import { hasWord } from '../game/runtime';
import type { GameState } from '../game/types';
import { briefLessonIssue, councilPreparationIssue } from '../game/teaching';
import { hasLearningBalance, LEARNING_BALANCE } from '../game/learningBalance';
import { getCalendar } from '../game/calendar';
import { getDogmaEffects } from '../game/dogmas';
import { describeAttention } from './semanticReadability';

/** Funding is a visible action. Rules are available without preceding the words. */
export function GuidedCouncil({
  state,
  onPrepare,
  onPrepareBrief,
}: {
  state: GameState;
  onPrepare: () => void;
  onPrepareBrief?: () => void;
}) {
  const numbered = hasWord(state, 'O_08');
  const guided = state.playMode === 'guided';
  const canFund = guided && (state.campfirePending || !!onPrepareBrief);
  const issue = state.campfirePending ? councilPreparationIssue(state) : briefLessonIssue(state);
  const funded = Math.floor(state.attention / 10);
  const action = (
    <div className="council-fuel-action">
      <button
        className="text-button council-fuel-button"
        onClick={state.campfirePending ? onPrepare : onPrepareBrief}
        disabled={!!issue}
        aria-describedby="prepare-story-reason"
      >
        <Plus size={16} aria-hidden="true" />
        {numbered
          ? 'Brucia 2 unità di legno · fino a +10 Attenzione'
          : 'Alimenta il Falò · consuma legno'}
      </button>
      <small id="prepare-story-reason" className={issue ? 'teaching-blocker' : 'teaching-note'}>
        {issue ?? 'Il legno viene consumato subito. Poi scegli la parola da tramandare.'}
      </small>
    </div>
  );
  return (
    <section
      className="guided-council council-resource-card"
      aria-label="Attenzione per i racconti"
    >
      <div className="council-resource-heading">
        <Flame size={25} aria-hidden="true" />
        <div>
          <span className="council-resource-label">Attenzione</span>
          <strong>
            {describeAttention(state.attention, numbered, getDogmaEffects(state).attentionCap)}
          </strong>
        </div>
        <span className={`council-capacity ${funded ? 'is-ready' : 'is-empty'}`}>
          {funded === 0
            ? 'Da preparare'
            : funded === 1
              ? 'Per un racconto'
              : numbered
                ? `Per ${funded} racconti`
                : 'Per più racconti'}
        </span>
      </div>
      {canFund &&
        (funded === 0 ? (
          action
        ) : (
          <details className="fuel-preparation">
            <summary>Prepara Attenzione per altre lezioni</summary>
            {action}
          </details>
        ))}
      {!guided && state.attention < 10 && (
        <p className="teaching-blocker council-classic-note">
          L’Attenzione si rinnova al consiglio: il legno bruciato e gli anziani la alimentano, la
          fame la riduce.
        </p>
      )}
    </section>
  );
}

export function CouncilRules({ state }: { state: GameState }) {
  const numbered = hasWord(state, 'O_08');
  const guided = state.playMode === 'guided';
  const balanced = hasLearningBalance(state);
  const season = Math.max(0, getCalendar(state).seasonIndex - (state.campfirePending ? 1 : 0));
  const base =
    season < 4 ? LEARNING_BALANCE.firstYearCouncilBase : LEARNING_BALANCE.laterCouncilBase;
  return (
    <details className="secondary-section story-explanation council-rule-help">
      <summary>Attenzione e racconti</summary>
      <p>
        {numbered ? 'Ogni racconto costa 10 Attenzione.' : 'Ogni racconto consuma Attenzione.'}{' '}
        {guided
          ? 'Più custodi già presenti possono insegnare insieme. I nuovi allievi potranno raccontare dal giro successivo.'
          : 'Ogni lezione forma un nuovo custode.'}
      </p>
      {balanced && (
        <p>
          {numbered
            ? `Il consiglio stagionale parte da ${base} punti Attenzione. Il legno bruciato e gli anziani presenti la aumentano; la fame media oltre ${LEARNING_BALANCE.hungerPenaltyStarts} la riduce.`
            : 'Il consiglio offre una base di Attenzione. Il legno bruciato e gli anziani presenti la aumentano; solo la fame grave la riduce.'}
        </p>
      )}
      {guided && (
        <p>
          Puoi alimentare un Falò anche tra due consigli per preparare un racconto. Durante il
          consiglio puoi ripassare una parola già nota a tutti gli allievi.
        </p>
      )}
      {hasWord(state, 'S_06') && hasWord(state, 'S_02') && !hasWord(state, 'M_05') && (
        <p>
          Condividere il Falò con un prigioniero o un compagno liberato può far nascere il pensiero
          della libertà. Devono trovarsi insieme al campo dopo aver mangiato.
        </p>
      )}
    </details>
  );
}
