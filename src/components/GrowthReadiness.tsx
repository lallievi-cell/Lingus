import { Baby, ChevronDown, Users } from 'lucide-react';
import {
  getGrowthReadiness,
  GROWTH_BLOCKER_TEXT,
  individualGrowthHint,
} from '../game/growthReadiness';
import { hasBuilding, hasWord } from '../game/runtime';
import { guidedGrowthMilestones, guidedBirthMultiplier } from '../game/guidedProgression';
import type { GameState, Unit } from '../game/types';
import './GrowthReadiness.css';

export function GrowthReadiness({ state }: { state: GameState }) {
  if (state.urbanized) return null;
  const growth = getGrowthReadiness(state);
  const possible = growth.readyPairs > 0 && growth.freePlaces > 0;
  const numbered = hasWord(state, 'O_08');
  const guidedMilestones = guidedGrowthMilestones(state);
  const partnerText =
    growth.missingSex === 'M'
      ? 'Al prossimo cambio di stagione mancherà un uomo in età fertile.'
      : growth.missingSex === 'F'
        ? 'Al prossimo cambio di stagione mancherà una donna in età fertile.'
        : 'Al prossimo cambio di stagione non ci sarà una coppia in età fertile.';
  const explanation = growth.blockers.length
    ? growth.blockers
        .map((blocker) => (blocker === 'partner' ? partnerText : GROWTH_BLOCKER_TEXT[blocker]))
        .join(' ')
    : 'Le condizioni attuali sono favorevoli a una nascita al prossimo cambio di stagione.';
  return (
    <section
      className={`growth-readiness ${possible ? 'growth-possible' : ''}`}
      aria-label="Crescita della tribù"
    >
      <div className="growth-heading">
        <Baby size={16} />
        <strong>La prossima generazione</strong>
        <span>{possible ? 'Possibile' : 'Da preparare'}</span>
      </div>
      <p>{explanation}</p>
      <details>
        <summary>
          Cosa serve alla crescita <ChevronDown size={12} />
        </summary>
        {numbered && (
          <div className="growth-counts">
            <Users size={13} />
            <span>
              Pronti per il prossimo cambio di stagione: {growth.readyMales}{' '}
              {growth.readyMales === 1 ? 'uomo' : 'uomini'} e {growth.readyFemales}{' '}
              {growth.readyFemales === 1 ? 'donna' : 'donne'} · {growth.readyPairs}{' '}
              {growth.readyPairs === 1 ? 'coppia' : 'coppie'} · {growth.freePlaces}{' '}
              {growth.freePlaces === 1 ? 'posto libero' : 'posti liberi'}
            </span>
          </div>
        )}
        <ul>
          <li>Un uomo e una donna ancora in età fertile al prossimo cambio.</li>
          <li>Cibo, riposo nella stagione in corso e ritorno al giaciglio.</li>
          <li>Un posto libero negli alloggi; solo i ripari completati aggiungono spazio.</li>
        </ul>
        {state.playMode === 'guided' && (
          <p>
            In Guidata, cibo cotto, campi o allevamenti e case in pietra favoriscono le nascite.
            Dopo aver scoperto Conservare, Portare · Preda permette di ripetere i viaggi per
            raccogliere cibo durante il giorno.
            {Object.values(guidedMilestones).some(Boolean) &&
              (numbered
                ? ` Bonus attuale alle probabilità: ×${guidedBirthMultiplier(state).toLocaleString('it-IT')}.`
                : ' I progressi della comunità rendono più favorevoli le nascite.')}
          </p>
        )}
        {growth.population >= 10 &&
          !hasBuilding(state, 'storage') &&
          ['V_05', 'O_04', 'M_02'].every((id) => hasWord(state, id)) && (
            <p>
              La comunità cresce e ha bisogno di più spazio per il cibo. Conservare · Preda · Domani
              prepara un Pozzo scorte: occorrono legno o pietra già consegnati al campo. Senza
              spazio, il raccolto in eccesso non entra nelle scorte.
            </p>
          )}
        <small>
          Le condizioni vengono valutate alla fine della stagione e possono ancora cambiare. Anche
          con tutto pronto, una nascita non è garantita.
        </small>
      </details>
    </section>
  );
}

export function IndividualGrowthReadiness({ state, unit }: { state: GameState; unit: Unit }) {
  const hint = individualGrowthHint(state, unit);
  if (!hint) return null;
  return (
    <p className="growth-person-hint" aria-label="Condizioni per la crescita">
      {hint}
    </p>
  );
}
