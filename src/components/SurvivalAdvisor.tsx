import { Flame, MapPin, TriangleAlert } from 'lucide-react';
import type { SurvivalAdvice } from '../game/survivalAdvice';
import type { GameState, Target } from '../game/types';
import './SurvivalAdvisor.css';

export function SurvivalAdvisor({
  state,
  advice,
  onRecall,
  onTeach,
  onFocus,
  onCompose,
}: {
  state: GameState;
  advice: SurvivalAdvice;
  onRecall: () => void;
  onTeach: () => void;
  onFocus: (target: Target) => void;
  onCompose: (words: string[], target?: Target) => void;
}) {
  const blocked = advice.action === 'recall' && (state.voice < 1 || state.campfirePending);
  const act = () => {
    if (advice.action === 'recall') onRecall();
    else if (advice.action === 'teach') onTeach();
    else if (advice.phrase) onCompose(advice.phrase, advice.destination);
    else if (advice.focus) onFocus(advice.focus);
  };
  return (
    <aside
      className={`survival-advisor priority-${advice.priority}`}
      aria-label="Priorità della tribù"
      role={advice.priority === 'danger' ? 'alert' : 'status'}
    >
      {advice.priority === 'danger' ? <TriangleAlert size={18} /> : <Flame size={18} />}
      <div>
        <strong>{advice.title}</strong>
        <p>{advice.text}</p>
        <div className="advisor-actions">
          <button className="text-button" onClick={act} disabled={blocked}>
            {advice.actionLabel}
          </button>
          {advice.focus && (
            <button className="text-button" onClick={() => onFocus(advice.focus!)}>
              <MapPin size={12} /> Mostra
            </button>
          )}
        </div>
        {blocked && (
          <small>
            {state.campfirePending
              ? 'Concludi prima il consiglio al falò.'
              : 'Attendi che la Voce si ricarichi. I compagni infreddoliti continuano a cercare riparo.'}
          </small>
        )}
      </div>
    </aside>
  );
}
