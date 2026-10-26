import { Flame } from 'lucide-react';
import { getDogmaEffects } from '../game/dogmas';
import { hasBuilding, hasWord } from '../game/runtime';
import type { GameState } from '../game/types';
import { GUIDED_PROGRESSION } from '../game/guidedProgression';

export function GuidedCouncil({ state, onPrepare }: { state: GameState; onPrepare: () => void }) {
  if (state.playMode !== 'guided' || !state.campfirePending) return null;
  const numbered = hasWord(state, 'O_08');
  return (
    <div className="guide-note guided-council">
      <Flame size={18} />
      <div>
        <strong>Prepara il racconto</strong>
        <p>
          In Guidata puoi alimentare il Falò con legna consegnata per ottenere più Attenzione. Ogni
          lezione costa Attenzione e richiede un nuovo allievo. Quando tutti conoscono una parola,
          il ripasso pagato ne rafforza la memoria.
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
          onClick={onPrepare}
          disabled={
            !hasBuilding(state, 'campfire') ||
            state.resources.wood < GUIDED_PROGRESSION.councilWoodCost ||
            state.attention >= getDogmaEffects(state).attentionCap
          }
        >
          {numbered ? 'Brucia 2 legna · fino a +10 Attenzione' : 'Alimenta il Falò · consuma legna'}
        </button>
      </div>
    </div>
  );
}
