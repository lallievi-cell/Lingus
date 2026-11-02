import { useState } from 'react';
import { BookOpen, Check, ListChecks } from 'lucide-react';
import { INNATE_WORDS, WORD_ORDER, WORDS } from '../game/content';
import { hasWord } from '../game/runtime';
import { executeLessonPlan, previewLessonPlan } from '../game/lessonPlan';
import { lessonIssueText } from '../game/teaching';
import type { GameState } from '../game/types';
import { visibleUnitName } from './unitReadability';
import './LessonPlanner.css';

export function LessonPlanner({
  state,
  onChange,
}: {
  state: GameState;
  onChange: (state: GameState) => void;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [outcome, setOutcome] = useState('');
  const words = WORD_ORDER.filter((id) => hasWord(state, id) && !INNATE_WORDS.includes(id));
  if (words.length < 2) return null;
  const plan = previewLessonPlan(state, chosen);
  const numbered = hasWord(state, 'O_08');
  return (
    <details className="lesson-planner">
      <summary>
        <ListChecks size={18} /> Prepara più lezioni
      </summary>
      <p>
        Scegli le parole nell’ordine in cui vuoi tramandarle. Il piano mostra gli allievi reali e
        viene eseguito solo se tutte le lezioni sono possibili.
      </p>
      <div
        className="lesson-planner-words"
        role="group"
        aria-label="Parole del piano di insegnamento"
      >
        {words.map((id) => (
          <label key={id}>
            <input
              type="checkbox"
              checked={chosen.includes(id)}
              onChange={(event) =>
                setChosen((current) =>
                  event.target.checked ? [...current, id] : current.filter((word) => word !== id),
                )
              }
            />
            <BookOpen size={15} aria-hidden="true" />
            <span>{WORDS[id].label}</span>
            {chosen.includes(id) && <Check size={15} aria-hidden="true" />}
          </label>
        ))}
      </div>
      {plan.lessons.length > 0 && (
        <>
          <ul className="lesson-plan-preview" aria-label="Anteprima del piano">
            {plan.lessons.map((lesson) => (
              <li key={lesson.wordId}>
                <strong>{WORDS[lesson.wordId]?.label ?? 'Parola non disponibile'}</strong>
                <span>
                  {lesson.allowed && lesson.pupil
                    ? `Imparerà: ${visibleUnitName(state, lesson.pupil)}`
                    : lessonIssueText(lesson.issue)}
                </span>
              </li>
            ))}
          </ul>
          <p>
            {numbered
              ? `${plan.cost} punti Attenzione complessivi.`
              : plan.allowed
                ? 'L’Attenzione disponibile basta per tutte le lezioni scelte.'
                : 'Controlla le lezioni: il piano non può essere completato nelle condizioni attuali.'}
          </p>
          <button
            type="button"
            className="primary-button"
            disabled={!plan.allowed}
            onClick={() => {
              const next = executeLessonPlan(state, chosen);
              if (next === state) return;
              setOutcome(
                `Il sapere è stato condiviso: ${chosen.map((id) => WORDS[id].label).join(', ')}.`,
              );
              setChosen([]);
              onChange(next);
            }}
          >
            Tramanda il piano
          </button>
          <button type="button" className="text-button" onClick={() => setChosen([])}>
            Svuota il piano
          </button>
        </>
      )}
      {outcome && (
        <p className="lesson-plan-outcome" role="status">
          {outcome}
        </p>
      )}
    </details>
  );
}
