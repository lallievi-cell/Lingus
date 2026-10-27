import { Check, MapPin, RotateCcw, X } from 'lucide-react';
import { hasWord } from '../game/runtime';
import { phraseRecallIssue } from '../game/syntaxAssistant';
import { taskPhraseLabel, type TaskOutcome } from '../game/taskOutcomes';
import { visiblePerson } from './TribeEvents';
import { isVisibleAt } from './mapDrawing';
import type { GameState, Target } from '../game/types';
import './TaskOutcomes.css';

export function TaskOutcomes({
  state,
  outcomes,
  onCompose,
  onFocus,
  onDismiss,
}: {
  state: GameState;
  outcomes: TaskOutcome[];
  onCompose: (words: string[], target?: Target) => void;
  onFocus: (target: Target) => void;
  onDismiss: (id: string) => void;
}) {
  if (!outcomes.length) return null;
  return (
    <section className="task-outcomes" aria-label="Esito degli incarichi">
      <details>
        <summary>
          <Check size={13} />
          <strong>Gli incarichi della tribù</strong>
          <span>
            {hasWord(state, 'O_08') ? `${outcomes.length} aggiornamenti` : 'Novità sul lavoro'}
          </span>
        </summary>
        <div className="task-outcome-list">
          {outcomes.map((outcome) => {
            const issue = phraseRecallIssue(state, outcome.tokens);
            const people = outcome.unitIds
              .map((id) => state.units.find((u) => u.id === id))
              .filter((u) => u !== undefined);
            const focusPerson = people.find(
              (unit) => unit.hp > 0 && isVisibleAt(state, unit.x, unit.y),
            );
            const visibleTarget =
              outcome.target && isVisibleAt(state, outcome.target.x, outcome.target.y)
                ? outcome.target
                : undefined;
            return (
              <article className={`task-outcome outcome-${outcome.reason}`} key={outcome.id}>
                <div>
                  <strong>{outcome.title}</strong>
                  <p>
                    {people
                      .slice(0, 3)
                      .map((person) => visiblePerson(state, person))
                      .join(', ')}
                    {people.length > 3 ? ' e altri compagni' : ''} · {taskPhraseLabel(outcome)}
                  </p>
                  <p>{outcome.detail}</p>
                  <div className="task-outcome-actions">
                    <button
                      className="text-button"
                      disabled={!!issue}
                      title={
                        issue ??
                        'Ricompone la frase. Il prossimo ordine richiederà Pronuncia e il normale costo di Voce.'
                      }
                      onClick={() =>
                        onCompose(
                          [...outcome.tokens],
                          outcome.reason === 'exhausted' ? undefined : visibleTarget,
                        )
                      }
                    >
                      <RotateCcw size={12} />
                      Prepara di nuovo
                    </button>
                    <button
                      className="text-button"
                      onClick={() => {
                        const person = focusPerson;
                        if (person)
                          onFocus({ type: 'unit', id: person.id, x: person.x, y: person.y });
                      }}
                      disabled={!focusPerson}
                    >
                      <MapPin size={12} />
                      Mostra compagno
                    </button>
                  </div>
                </div>
                <button
                  className="icon-button small"
                  onClick={() => onDismiss(outcome.id)}
                  aria-label={`Nascondi esito: ${outcome.title}`}
                >
                  <X size={12} />
                </button>
              </article>
            );
          })}
        </div>
      </details>
    </section>
  );
}
